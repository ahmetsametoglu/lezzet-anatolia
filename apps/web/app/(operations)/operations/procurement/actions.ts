'use server';

import { revalidatePath } from 'next/cache';
import {
  PurchaseOrderItemService,
  PurchaseOrderService,
  ReorderService,
  SupplierProductService,
  SupplierService,
  serviceDb,
} from '@lezzet/database';
import { fromCents } from '@lezzet/helper';
import type { KeysetCursor, PurchaseOrderStatus } from '@lezzet/types';
import { requireAdmin, requireFinance } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { readWarehouseContext } from '@/lib/warehouse/context';
import { readOrderDetail, readOrderPage, readSupplierProducts, searchVariantOptions } from './procurement-read';
import type {
  OrderDetailView,
  PurchaseOrderRowView,
  SupplierFormInput,
  SupplierProductRowView,
  VariantPickOption,
} from './procurement-types';

const PATH = '/operations/procurement';

// Tedarik ekranı server action'ları — 'use server' + requireAdmin ilk + servise devret +
// `{ data, error }` DÖNER (throw yok).
//
// Guard ekranın kapısını TEKRARLAR: sayfanın `requireAdmin`'i düğmeyi gizlemeye yarar, action
// kendi kapısını kendi tutar (çağrı doğrudan da yapılabilir).

/**
 * Sipariş listesinin bir sonraki sayfası (sonsuz kaydırma).
 *
 * İmleç ve SÜZGEÇ birlikte gelir: ikinci sayfa birincinin ölçütünü taşımazsa liste sessizce
 * karışır — "gönderildi" süzgecinin altına iptal edilmiş siparişler eklenir ve kimse fark etmez.
 * Süzgeç istemciden geliyor ama tehlikesiz: daraltmadır, yetki genişletmez ve sunucu yine kendi
 * kapısını tutar.
 */
export async function loadMorePurchaseOrdersAction(
  cursor: KeysetCursor,
  filters: { status?: PurchaseOrderStatus; supplierId?: string },
): Promise<ActionResult<{ rows: PurchaseOrderRowView[]; nextCursor: KeysetCursor | null }>> {
  try {
    await requireFinance();
    return { data: await readOrderPage(serviceDb(), { cursor, ...filters }), error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Sipariş penceresinin açılış okuması — kalemler + tedarikçiye gidecek metin, tek turda. */
export async function loadOrderDetailAction(orderId: string): Promise<ActionResult<OrderDetailView>> {
  try {
    await requireFinance();
    return { data: await readOrderDetail(serviceDb(), orderId), error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

// ─── Tedarikçi kartı ──────────────────────────────────────────────────────────
// Kart olmadan sipariş de olmaz: sıfırdan kurulumda ilk iş tedarikçiyi tanıtmaktır. Bu yüzden
// CRUD ekranın en temel parçası, süsü değil.

/**
 * Tedarikçi ekler ya da günceller (`id` varsa güncelleme).
 *
 * İletişim JSON olarak durur (`contact`) ve **elle üç alandan kurulur**: telefon, e-posta, adres.
 * Serbest JSON'a bırakılsaydı her kayıt farklı anahtar kullanır ve "WhatsApp'tan sipariş gönder"
 * bağlantısı hiçbir kayıtta güvenle çalışmazdı — telefon o bağlantının anahtarıdır.
 */
export async function saveSupplierAction(input: SupplierFormInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requireFinance();
    const name = input.name.trim();
    if (!name) throw new Error('Tedarikçi adı gerekli.');

    const svc = new SupplierService(serviceDb());
    const contact = {
      ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
      ...(input.email?.trim() ? { email: input.email.trim() } : {}),
      ...(input.address?.trim() ? { address: input.address.trim() } : {}),
    };
    const fields = {
      name,
      // Boş nesne yerine null: "iletişim bilgisi yok" ile "boş kayıt" aynı şey değil, ve okuyan
      // taraf `contact?.phone` diye bakıyor — boş nesne de aynı cevabı verir ama satırı kirletir.
      contact: Object.keys(contact).length > 0 ? contact : null,
      vatNumber: input.vatNumber?.trim() || null,
      // null = peşin çalışıyoruz (şemanın kendi sözleşmesi); 0 gün yazmak "vade var ama sıfır" olurdu.
      paymentTermDays: input.paymentTermDays ?? null,
      note: input.note?.trim() || null,
      isActive: input.isActive,
    };

    const saved = input.id ? await svc.update({ id: input.id, ...fields }) : await svc.insert(fields);
    revalidatePath(PATH);
    return { data: { id: saved.id }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

// ─── Ürün–kod eşlemesi ────────────────────────────────────────────────────────
// `DOMAIN §16`: tedarik siparişi TEDARİKÇİNİN DİLİYLE yazılsın diye — bizim varyantımız ↔ onun
// kodu. Eşleme olmadan liste bizim adımızla gider ve tedarikçi neyi göndereceğini kendi
// kataloğundan aramak zorunda kalır.

/** Bir tedarikçinin kataloğu — eşleme satırları, bizim ürün adımızla birlikte. */
export async function loadSupplierProductsAction(supplierId: string): Promise<ActionResult<SupplierProductRowView[]>> {
  try {
    await requireFinance();
    return { data: await readSupplierProducts(serviceDb(), supplierId), error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Eşleme formunun varyant seçicisi — ürün adında arar, eşleşen ürünün TÜM boyları döner. */
export async function searchVariantsForMappingAction(term: string): Promise<ActionResult<VariantPickOption[]>> {
  try {
    await requireFinance();
    return { data: await searchVariantOptions(serviceDb(), term), error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Eşleme yazar/günceller. Aynı (tedarikçi, varyant) ikilisi iki kez tanımlanmaz — servis `upsert`
 * yapar, kod değişirse satır güncellenir, kopya satır doğmaz.
 *
 * `lastPurchasePrice` BURADAN yazılmaz: onu mal kabul günceller ("geçen sefer kaçtı" ölçülen bir
 * gerçektir, beyan değil).
 */
export async function saveSupplierProductAction(input: {
  supplierId: string;
  variantId: string;
  supplierCode: string;
  nameAtSupplier?: string | null;
  packQty?: number | null;
}): Promise<ActionResult> {
  try {
    await requireFinance();
    const code = input.supplierCode.trim();
    if (!code) throw new Error('Tedarikçideki sipariş kodu gerekli.');

    await new SupplierProductService(serviceDb()).setMapping({
      supplierId: input.supplierId,
      variantId: input.variantId,
      supplierCode: code,
      nameAtSupplier: input.nameAtSupplier?.trim() || null,
      // 1 ve altı "koli yok" demektir; liste o zaman koli karşılığı yazmaz.
      packQty: input.packQty && input.packQty > 1 ? input.packQty : null,
    });
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Tercihli kaynağı değiştirir — aynı varyantın diğer eşlemeleri düşer (servisin kuralı).
 * "İki tercihli" sessiz bir belirsizliktir: sipariş önerisi hangisini seçeceğini bilemez.
 */
export async function setPreferredSupplierProductAction(mappingId: string): Promise<ActionResult> {
  try {
    await requireFinance();
    await new SupplierProductService(serviceDb()).setPreferred(mappingId);
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Eşlemeyi kaldırır. Bu bir SATIN ALMA geçmişi değil, bir sözlük satırıdır — silinmesi geçmişi
 * yalanlamaz: verilmiş siparişler kendi kalemlerinde kodu zaten taşıyor.
 */
export async function deleteSupplierProductAction(mappingId: string): Promise<ActionResult> {
  try {
    await requireFinance();
    await new SupplierProductService(serviceDb()).delete(mappingId);
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

// ─── Tedarik siparişi ─────────────────────────────────────────────────────────

/**
 * Öneri grubundan **tek dokunuşla** taslak açar (DOMAIN §16'nın ana vaadi).
 *
 * Grup sunucuda YENİDEN okunur, istemciden gelen satırlarla değil: ekrandaki liste birkaç dakika
 * önce okunmuş olabilir ve o arada stok değişebilir. İstemcinin gönderdiği adetlere güvenmek,
 * "eşik altı" olmayan bir ürünü de sipariş etmek demekti — kararın dayanağı ekranda değil veride.
 */
export async function createDraftFromSuggestionAction(supplierId: string): Promise<ActionResult<{ orderId: string }>> {
  try {
    await requireFinance();
    const db = serviceDb();
    const ctx = await readWarehouseContext();
    const reorder = new ReorderService(db);

    // **Kalem HEDEF DEPOSUNU taşır** (C7): eşik STR'de delindiyse o satır "STR'ye" diye yazılır.
    // Depoları toplayıp tek satıra indirmek, tedarikçiye giden listeden niyeti silerdi — mal tek
    // adrese gelir ve iki deponun eksiği tek yerde birikirdi. Aynı varyant iki depoda eşik altıysa
    // iki satır olur ve bu doğrudur: farklı yere gidecek iki parti.
    const lines: Array<{ variantId: string; qty: number; unitPrice: number | null; targetWarehouseId: string }> = [];
    for (const warehouseId of ctx.visibleWarehouseIds) {
      const group = (await reorder.suggestions(warehouseId)).find((g) => g.supplierId === supplierId);
      for (const line of group?.lines ?? []) {
        lines.push({
          variantId: line.variantId,
          qty: line.suggestedQty,
          unitPrice: line.lastPurchasePrice,
          targetWarehouseId: warehouseId,
        });
      }
    }
    // Öneri sunucuda YENİDEN okunur, istemciden gelen satırlarla değil: ekrandaki liste birkaç
    // dakika önce okunmuş olabilir ve o arada mal girmiş olabilir. Grup kaybolduysa sessiz başarı
    // YOK — operatör siparişi verdiğini sanmamalı.
    if (lines.length === 0) throw new Error('Bu tedarikçide eşik altı kalem kalmadı — liste yenilendi.');

    const { order } = await new PurchaseOrderService(db).createDraft(supplierId, lines);
    revalidatePath(PATH);
    return { data: { orderId: order.id }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * **Elle sipariş** — öneriden bağımsız (sayfa sözleşmesi §3).
 *
 * Öneri yalnız "eşik altına düşen"i yakalar; gerçek hayatta sipariş bundan ibaret değil: kampanya
 * için fazladan mal, yeni ürün denemesi, tedarikçinin "bu hafta şu var" demesi. Öneriyi bekleyen
 * bir ekran üçünü de imkânsız kılardı.
 *
 * Kalemler PENCEREDE toplanır ve sipariş tek turda doğar (`createDraft`) — kalemsiz taslak açıp
 * sonra doldurmak değil. Sebebi kural: kod eşlemesini ve "geçen sefer kaçtı" fiyatını bulan yer
 * `createDraft`'tır; kalemi ayrı bir kapıdan eklemek o kuralı ikinci kez yazmak olurdu (§1).
 */
export async function createManualDraftAction(input: {
  supplierId: string;
  note?: string | null;
  lines: Array<{ variantId: string; qty: number; targetWarehouseId?: string | null }>;
}): Promise<ActionResult<{ orderId: string }>> {
  try {
    await requireFinance();
    if (!input.supplierId) throw new Error('Tedarikçi seçin.');
    if (input.lines.length === 0) throw new Error('En az bir kalem ekleyin.');
    if (input.lines.some((l) => !Number.isInteger(l.qty) || l.qty <= 0)) throw new Error('Adet en az 1 olmalı.');

    const { order } = await new PurchaseOrderService(serviceDb()).createDraft(
      input.supplierId,
      input.lines.map((l) => ({ variantId: l.variantId, qty: l.qty, targetWarehouseId: l.targetWarehouseId ?? null })),
      input.note?.trim() || undefined,
    );
    revalidatePath(PATH);
    return { data: { orderId: order.id }, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

// ─── Taslak kalemleri ─────────────────────────────────────────────────────────
// Öneri bir başlangıçtır, son söz değil: adet değişir, vazgeçilen kalem çıkarılır. Düzenlenemeyen
// bir taslak, "sipariş taslağı" değil bir dayatmadır.
//
// İKİSİ DE AYNI KAPIDAN GEÇER (`requireDraft`): gönderilmiş siparişin kalemi değiştirilemez. Bu bir
// görgü kuralı değil kayıt bütünlüğüdür — tedarikçiye 10 koli yazıp kaydı 6'ya çekmek gelen malı
// "fazla" gösterir ve fark raporu yalan söyler. Kural bugün UYGULAMA katmanında duruyor; kalıcı yeri
// veridir (talep: `tedarik-arka-uc-talebi.md §5`).

/** Taslak mı — değilse eylem reddedilir. Sipariş okunur, istemcinin beyanına güvenilmez. */
async function requireDraft(orderId: string): Promise<void> {
  const order = await new PurchaseOrderService(serviceDb()).getById(orderId);
  if (!order) throw new Error('Sipariş bulunamadı.');
  if (order.status !== 'draft') throw new Error('Gönderilmiş sipariş değiştirilemez — kayıt tedarikçiye gideni yansıtmalı.');
}

/**
 * Kalemin adedini ya da beklenen alışını değiştirir.
 *
 * Fiyat İSTEĞE BAĞLI ve `null` anlamlı: "bilinmiyor" demektir ve tutarı eksik bırakır (ekran "≈"
 * der). Sıfır yazmak bedava alım demek olurdu (`CLAUDE.md §1`).
 */
export async function updateDraftLineAction(input: {
  orderId: string;
  itemId: string;
  qty?: number;
  unitPriceCents?: number | null;
}): Promise<ActionResult> {
  try {
    await requireFinance();
    await requireDraft(input.orderId);
    if (input.qty !== undefined && (!Number.isInteger(input.qty) || input.qty <= 0)) {
      throw new Error('Adet en az 1 olmalı.');
    }

    await new PurchaseOrderItemService(serviceDb()).update({
      id: input.itemId,
      ...(input.qty === undefined ? {} : { qty: input.qty }),
      // Cent → euro dönüşümü TEK noktada, servis sınırında (`STACK §8`).
      ...(input.unitPriceCents === undefined
        ? {}
        : { unitPrice: input.unitPriceCents === null ? null : fromCents(input.unitPriceCents) }),
    });
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Kalemi taslaktan çıkarır. Son kalem de silinebilir: kalemsiz taslak geçerli bir ara hâldir. */
export async function removeDraftLineAction(input: { orderId: string; itemId: string }): Promise<ActionResult> {
  try {
    await requireFinance();
    await requireDraft(input.orderId);
    await new PurchaseOrderItemService(serviceDb()).delete(input.itemId);
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * "Gönderildi" işareti — sistem GÖNDERMEZ, insan gönderir ve dönüp bunu söyler (DOMAIN §16).
 *
 * Bu yüzden ayrı bir eylem: listeyi kopyalamak/paylaşmak gönderim değildir (kopyalayıp vazgeçmiş
 * olabilir). Damgayı basan şey operatörün beyanıdır.
 */
export async function markOrderSentAction(orderId: string): Promise<ActionResult> {
  try {
    await requireFinance();
    await new PurchaseOrderService(serviceDb()).markSent(orderId);
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Siparişi iptal eder. Mal gelmiş siparişte servis reddeder (zincir kopar) — ekran o hâlde
 * eylemi zaten sunmaz, ama kapı kendi kuralını kendi tutar.
 *
 * İptal YALNIZ yöneticinin: muhasebeci tedarik zincirini okur, akışı durdurmaz.
 */
export async function cancelOrderAction(orderId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    await new PurchaseOrderService(serviceDb()).cancel(orderId);
    revalidatePath(PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}
