import 'server-only';
import {
  ProductService,
  ProductVariantService,
  PurchaseOrderItemService,
  PurchaseOrderService,
  ReorderService,
  StockService,
  SupplierProductService,
  SupplierService,
  type PurchaseListLine,
} from '@lezzet/database';
import type { serviceDb } from '@lezzet/database';
import { summarizePurchaseOrder } from '@lezzet/domain-core';
import { resolveLocalizedText, type KeysetCursor, type PurchaseOrderRow, type PurchaseOrderStatus } from '@lezzet/types';
import { titleOf } from '@/lib/catalog/title';
import { readWarehouseContext } from '@/lib/warehouse/context';
import type {
  OrderDetailView,
  PurchaseOrderRowView,
  SuggestionGroupView,
  SuggestionLineView,
  SupplierCardView,
  SupplierOption,
  SupplierProductRowView,
  VariantPickOption,
} from './procurement-types';

// Tedarik ekranının sunucu okumaları. Okuma SEKMEYE bağlıdır (09.4'te ölçülen desen) — page.tsx
// yalnız açık sekmenin fonksiyonunu çağırır.

type Db = ReturnType<typeof serviceDb>;

/**
 * "Sipariş zamanı" — bağlam evrenindeki HER depo için öneri, tedarikçiye gruplu.
 *
 * Öneri depo başınadır (C6: eşik depo bazlı bir gerçek) ve motor tek depo alır; evren üzerinden
 * dönülür. Depo sayısı fiziksel bir sınırdır (birkaç tesis), döngü satır sayısıyla ÇARPMAZ.
 * Sekme sayaçları bağlamı izler (depo ekseni kural 5) — bağlam STR'ye alınmışsa yalnız STR'nin
 * eşikleri görünür; bu bir süzgeç değil, evrenin kendisidir.
 */
export async function readSuggestionGroups(db: Db): Promise<SuggestionGroupView[]> {
  const ctx = await readWarehouseContext();
  const codeOf = new Map(ctx.warehouses.map((w) => [w.id, w.code]));

  const reorder = new ReorderService(db);
  const perWarehouse = await Promise.all(
    ctx.visibleWarehouseIds.map(async (warehouseId) => ({
      warehouseId,
      code: codeOf.get(warehouseId) ?? '—',
      groups: await reorder.suggestions(warehouseId),
    })),
  );

  // Depo turlarını tedarikçi anahtarında birleştir — kart tedarikçinindir, satır deposunu söyler.
  // Ara satır kendi depo KİMLİĞİNİ de taşır: "başka depoda var mı" sorusu kodla değil kimlikle
  // cevaplanır (kod bir etikettir, karşılaştırma anahtarı değil).
  type PendingLine = Omit<SuggestionLineView, 'title' | 'elsewhere'> & { warehouseId: string };
  const merged = new Map<string | null, PendingLine[]>();
  for (const { warehouseId, code, groups } of perWarehouse) {
    for (const group of groups) {
      const bucket = merged.get(group.supplierId) ?? [];
      for (const line of group.lines) {
        bucket.push({
          variantId: line.variantId,
          supplierCode: line.supplierCode,
          warehouseId,
          warehouseCode: code,
          availableQty: line.availableQty,
          minStockQty: line.minStockQty,
          suggestedQty: line.suggestedQty,
          // Motorun üç ayrı sayısı, üçü de AYRI taşınır (`ReorderLine` künyesi): yolda olan eşiğe
          // girer, taslak girmez, hedefsiz hiçbir depoya sayılmaz. Toplamak, üçünü tek "bekleyen"
          // sayısına indirmek olurdu ve ekran neyin neden durduğunu söyleyemezdi.
          incomingQty: line.incomingQty,
          draftQty: line.draftQty,
          unassignedQty: line.unassignedQty,
        });
      }
      merged.set(group.supplierId, bucket);
    }
  }
  if (merged.size === 0) return [];

  // Adlar TEK turda: satır başına sorgu yok. Boy adı üründen gelir (fiyat ekranının deseni).
  const allLines = [...merged.values()].flat();
  const variantIds = [...new Set(allLines.map((l) => l.variantId))];
  const [titles, elsewhereOf, suppliers] = await Promise.all([
    variantTitles(db, variantIds),
    readElsewhere(db, ctx.visibleWarehouseIds, variantIds, codeOf),
    new SupplierService(db).list(),
  ]);
  const supplierOf = new Map(suppliers.map((s) => [s.id, s]));

  const groups: SuggestionGroupView[] = [...merged.entries()].map(([supplierId, lines]) => {
    const supplier = supplierId ? supplierOf.get(supplierId) : undefined;
    return {
      supplierId,
      // Eşlenmemiş grup GÖRÜNÜR kalır: görünmez olması "eksik ürün fark edilmedi" demektir (motor notu).
      supplierName: supplier?.name ?? 'Tedarikçisi eşlenmemiş',
      paymentTermDays: supplier?.paymentTermDays ?? null,
      warehouseCount: new Set(lines.map((l) => l.warehouseCode)).size,
      lines: lines.map(({ warehouseId, ...line }) => ({
        ...line,
        title: titles.get(line.variantId) ?? '—',
        // Satırın KENDİ deposu elenir: "burada eksik, burada var" bir cümle değil.
        elsewhere: (elsewhereOf.get(line.variantId) ?? [])
          .filter((w) => w.warehouseId !== warehouseId)
          .map(({ code, qty }) => ({ code, qty })),
      })),
    };
  });

  // Adlı tedarikçiler ada göre; eşlenmemiş grup EN SONDA (önce sipariş verilebilecekler).
  return groups.sort((a, b) =>
    a.supplierId === null ? 1 : b.supplierId === null ? -1 : a.supplierName.localeCompare(b.supplierName, 'tr'),
  );
}

/**
 * Aynı varyantın ÖTEKİ depolardaki kullanılabiliri — "sipariş yerine transfer" seçeneğinin ham verisi.
 *
 * Kapsam `visibleWarehouseIds`: operatörün göremediği bir deponun stoğunu ipucu diye yazmak, kapsam
 * kapısını ekran üzerinden delmek olurdu.
 *
 * **Yargı yok, sayı var.** "Şuradan transfer et" demiyoruz: öteki deponun kendi eşiğini bilmiyoruz
 * (motor yalnız eşik ALTINDAKİLERİ döndürüyor) ve oradan mal çekmek onu eksiğe düşürebilir. Karar
 * operatörün, ekran yalnız görüş açısını genişletiyor. Sıfır ve altı hiç taşınmaz — "0 adet var"
 * bir bilgi değil, gürültüdür.
 */
async function readElsewhere(
  db: Db,
  warehouseIds: readonly string[],
  variantIds: readonly string[],
  codeOf: Map<string, string>,
): Promise<Map<string, Array<{ warehouseId: string; code: string; qty: number }>>> {
  const rows = await new StockService(db).listAvailableAcross(warehouseIds, variantIds);
  const byVariant = new Map<string, Array<{ warehouseId: string; code: string; qty: number }>>();
  for (const row of rows) {
    if (row.availableQty <= 0) continue;
    const bucket = byVariant.get(row.variantId) ?? [];
    bucket.push({ warehouseId: row.warehouseId, code: codeOf.get(row.warehouseId) ?? '—', qty: row.availableQty });
    byVariant.set(row.variantId, bucket);
  }
  // Çoktan aza: operatör önce en bol depoyu görsün; eşitlikte kod (sıra kararlı olmalı).
  for (const bucket of byVariant.values()) bucket.sort((a, b) => b.qty - a.qty || a.code.localeCompare(b.code));
  return byVariant;
}

/**
 * Siparişler sekmesi — tek turda sayfa (`listRows`, keyset) + özet motoru.
 *
 * "8/12 kalem", tutar ve depo kırılımı EKRANDA hesaplanmaz: `summarizePurchaseOrder` üç sayıyı da
 * türetir (`STACK §4`) — aynı özet sipariş detayında ve tedarikçi kartında da görünecek, türetmeyi
 * ekrana bırakmak üç kopya demekti.
 *
 * Süzgeç ve imleç BİRLİKTE gezer: ikinci sayfa birincinin ölçütünü taşımazsa liste sessizce karışır
 * (aynı sözleşme `loadMorePurchaseOrdersAction`'da da geçerli).
 */
export async function readOrderPage(
  db: Db,
  opts: { cursor?: KeysetCursor; status?: PurchaseOrderStatus; supplierId?: string } = {},
): Promise<{ rows: PurchaseOrderRowView[]; nextCursor: KeysetCursor | null }> {
  const page = await new PurchaseOrderService(db).listRows(opts);
  return { rows: page.rows.map(toOrderRowView), nextCursor: page.nextCursor };
}

/** Süzgeç şeridinin ve elle sipariş penceresinin tedarikçi listesi — yalnız ad (borç türetilmez). */
export async function readSupplierOptions(db: Db): Promise<SupplierOption[]> {
  const suppliers = await new SupplierService(db).list();
  return suppliers.map((s) => ({ id: s.id, name: s.name }));
}

/**
 * Sipariş penceresinin tam okuması — kalem kalem, tek açılışta.
 *
 * Dört okuma paralel: sipariş · kalemler · ilerleme (`purchase_order_progress`) · tedarikçiye
 * gidecek liste. Pencere açılınca okunur, listeyle birlikte DEĞİL: elli satırlık sayfada her
 * siparişin kalemlerini peşinen çekmek, biri açılsın diye ellisinin bedelini ödemek olurdu.
 *
 * `receivedQty`/`missingQty` motorun görünümünden gelir, burada hesaplanmaz (`STACK §4`): "ne kadar
 * geldi" ölçüsü `initial_qty`'dir ve `physical_qty` satışla eridiği için ekranda toplanamaz.
 */
export async function readOrderDetail(db: Db, orderId: string): Promise<OrderDetailView> {
  const orders = new PurchaseOrderService(db);
  const order = await orders.getById(orderId);
  if (!order) throw new Error('Sipariş bulunamadı.');

  const [items, progress, printable, supplier, ctx] = await Promise.all([
    new PurchaseOrderItemService(db).listByOrder(orderId),
    orders.progressOf(orderId),
    orders.printableList(orderId),
    new SupplierService(db).getById(order.supplierId),
    readWarehouseContext(),
  ]);

  const titles = await variantTitles(db, items.map((i) => i.variantId));
  // Kod SİPARİŞ ANINDA donmuş eşlemeden okunur (`supplier_product_id`), bugünün eşlemesinden değil:
  // eşleme sonradan değişse bile tedarikçiye giden liste o gün ne yazdıysa odur.
  const mappings = await new SupplierProductService(db).listBySupplier(order.supplierId);
  const codeOfMapping = new Map(mappings.map((m) => [m.id, m.supplierCode]));
  const warehouseCodeOf = new Map(ctx.warehouses.map((w) => [w.id, w.code]));
  const progressOf = new Map(progress.map((p) => [p.purchaseOrderItemId, p]));

  return {
    id: order.id,
    supplierId: order.supplierId,
    supplierName: supplier?.name ?? '—',
    supplierPhone: contactOf(supplier?.contact ?? null).phone,
    status: order.status,
    createdAt: order.createdAt,
    sentAt: order.sentAt,
    note: order.note,
    lines: items.map((item) => {
      const p = progressOf.get(item.id);
      return {
        itemId: item.id,
        variantId: item.variantId,
        title: titles.get(item.variantId) ?? '—',
        supplierCode: item.supplierProductId ? (codeOfMapping.get(item.supplierProductId) ?? null) : null,
        qty: item.qty,
        unitPriceCents: item.unitPriceCents, // servis cent döndürüyor (02.9) — çeviri kalmadı
        targetWarehouseCode: item.targetWarehouseId ? (warehouseCodeOf.get(item.targetWarehouseId) ?? null) : null,
        // İlerleme satırı yoksa mal hiç girmemiştir — "bilinmiyor" değil, sıfır: görünüm açık
        // siparişin her kalemini taşır, eksik satır kabul edilmemiş kalemdir.
        receivedQty: p?.receivedQty ?? 0,
        missingQty: p?.missingQty ?? item.qty,
      };
    }),
    message: formatPurchaseList(printable),
  };
}

/**
 * Tedarikçiye kopyalanacak metin. Biçim BURADA, tek yerde: kopyala · WhatsApp · yazdır aynı metni
 * taşımalı — üç yerde biçimlenseydi tedarikçiye üç farklı liste giderdi (`DOMAIN §16`).
 */
function formatPurchaseList(lines: readonly PurchaseListLine[]): string {
  return lines
    .map((line) => {
      // Eşlemesi olmayan kalem BİZİM adımızla yazılır — iş durmaz (servisin kendi kuralı).
      const name = line.nameAtSupplier ?? '(kod eşlemesi yok)';
      const code = line.supplierCode ? `${line.supplierCode} · ` : '';
      // Koli içi adet biliniyorsa karşılığı yazılır: telefonda "kaç koli eder" tarifi biter.
      const pack = line.packQty && line.packQty > 1 ? ` (${Math.ceil(line.qty / line.packQty)} koli)` : '';
      return `• ${code}${name} — ${line.qty} adet${pack}`;
    })
    .join('\n');
}

/** Gönderilmiş ve henüz kapanmamış sipariş sayısı — "yolda ne var" (başlık altı). */
export async function readPendingOrderCount(db: Db): Promise<number> {
  return new PurchaseOrderService(db).countPending();
}

function toOrderRowView(row: PurchaseOrderRow): PurchaseOrderRowView {
  const summary = summarizePurchaseOrder(row);
  return {
    id: row.id,
    supplierId: row.supplierId,
    // Tedarikçi silinmiş/okunamıyorsa satır yine görünür: sipariş kaydı tedarikçiden bağımsız gerçektir.
    supplierName: row.supplier?.name ?? '—',
    status: row.status,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
    itemCount: summary.itemCount,
    receivedItemCount: summary.receivedItemCount,
    totalCents: summary.totalCents,
    missingPriceCount: summary.missingPriceCount,
    byWarehouse: summary.byWarehouse.map((w) => ({ code: w.code, qty: w.qty })),
  };
}

/**
 * Tedarikçi kartları. Borç tedarikçi başına türetilir (`debt()`) — tedarikçi sayısı fiziksel olarak
 * sınırlı (sayfa sözleşmesi: "az sayıda tedarikçi beklenir, dev CRM değil"), döngü veriyle büyümez.
 * Küme büyürse toplu okuma servise eklenir (debt() künyesi bu kapıyı zaten bırakıyor).
 */
export async function readSupplierCards(db: Db): Promise<SupplierCardView[]> {
  const svc = new SupplierService(db);
  const orders = new PurchaseOrderService(db);
  const suppliers = await svc.list();

  return Promise.all(
    suppliers.map(async (s) => {
      const [{ intakeTotalCents, balanceCents }, pendingOrderCount] = await Promise.all([
        svc.debt(s.id),
        // "Bu firmadan yolda ne var" — kart tek başına okunabilsin: borç kadar bunun da cevabı
        // burada olmalı, yoksa operatör sipariş sekmesine gidip elle süzmek zorunda kalır.
        orders.countPending(s.id),
      ]);
      return {
        id: s.id,
        name: s.name,
        ...contactOf(s.contact),
        vatNumber: s.vatNumber,
        note: s.note,
        paymentTermDays: s.paymentTermDays,
        debtCents: balanceCents, // servis cent döndürüyor (02.9) — çeviri kalmadı
        intakeTotalCents,
        pendingOrderCount,
        isActive: s.isActive,
      };
    }),
  );
}

/**
 * Bir tedarikçinin ürün–kod eşlemeleri, BİZİM ürün adımızla. Ad çözümü tek turda (satır başına
 * sorgu yok) — fiyat ekranının boy adı deseni.
 */
export async function readSupplierProducts(db: Db, supplierId: string): Promise<SupplierProductRowView[]> {
  const mappings = await new SupplierProductService(db).listBySupplier(supplierId);
  if (mappings.length === 0) return [];

  const titles = await variantTitles(db, mappings.map((m) => m.variantId));
  return mappings.map((m) => ({
    id: m.id,
    variantId: m.variantId,
    title: titles.get(m.variantId) ?? '—',
    supplierCode: m.supplierCode,
    nameAtSupplier: m.nameAtSupplier,
    packQty: m.packQty,
    lastPurchaseCents: m.lastPurchasePriceCents,
    isPreferred: m.isPreferred,
  }));
}

/**
 * Eşleme formunun varyant seçicisi. Arama ÜRÜN ADINDA yapılır ve eşleşen ürünün tüm boyları döner:
 * "baklava" yazan, baklavanın boylarını arıyordur (fiyat ekranının seçicisiyle aynı kural).
 *
 * Okuma DAR: fiyat/maliyet taşımıyor. Fiyat ekranının seçicisi o bağlamı getiriyor çünkü orada
 * karar parasal; burada soru "hangi ürün" — aynı okumayı paylaşmak, tedarik ekranına hiç
 * kullanmayacağı üç okumanın bedelini ödetirdi.
 */
export async function searchVariantOptions(db: Db, term: string): Promise<VariantPickOption[]> {
  const query = term.trim();
  if (!query) return [];

  const page = await new ProductService(db).listPriceRows({ filters: { query }, limit: VARIANT_SEARCH_LIMIT });
  return page.rows.flatMap((product) =>
    product.variants.map((variant) => ({
      variantId: variant.id,
      title: titleOf(resolveLocalizedText(product.name), resolveLocalizedText(variant.label)),
    })),
  );
}

const VARIANT_SEARCH_LIMIT = 20;

/** Varyant kimliği → "Ürün · Boy". Boy adı üründen gelir; boy listesi yalnız etiketi taşır. */
async function variantTitles(db: Db, variantIds: readonly string[]): Promise<Map<string, string>> {
  const variants = await new ProductVariantService(db).listByIds([...new Set(variantIds)]);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const productNames = new Map(products.map((p) => [p.id, resolveLocalizedText(p.name)]));
  return new Map(
    variants.map((v) => [v.id, titleOf(productNames.get(v.productId) ?? '—', resolveLocalizedText(v.label))]),
  );
}

/**
 * `contact` serbest JSON'dur; okuma tarafı ÜÇ adlı alana indirger. Tip güvencesi yok, o yüzden
 * her alan tek tek doğrulanır — beklenmedik bir şekil ekranı düşürmez, alan boş görünür.
 */
function contactOf(contact: Record<string, unknown> | null): { phone: string | null; email: string | null; address: string | null } {
  const pick = (key: string): string | null => {
    const value = contact?.[key];
    return typeof value === 'string' && value.trim() !== '' ? value : null;
  };
  return { phone: pick('phone'), email: pick('email'), address: pick('address') };
}
