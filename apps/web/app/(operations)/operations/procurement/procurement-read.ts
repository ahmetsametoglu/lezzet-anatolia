import 'server-only';
import {
  ProductService,
  ProductVariantService,
  PurchaseOrderService,
  ReorderService,
  SupplierService,
} from '@lezzet/database';
import type { serviceDb } from '@lezzet/database';
import { summarizePurchaseOrder } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import { resolveLocalizedText, type KeysetCursor, type PurchaseOrderRow } from '@lezzet/types';
import { titleOf } from '@/lib/catalog/title';
import { readWarehouseContext } from '@/lib/warehouse/context';
import type {
  PurchaseOrderRowView,
  SuggestionGroupView,
  SuggestionLineView,
  SupplierCardView,
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
      code: codeOf.get(warehouseId) ?? '—',
      groups: await reorder.suggestions(warehouseId),
    })),
  );

  // Depo turlarını tedarikçi anahtarında birleştir — kart tedarikçinindir, satır deposunu söyler.
  const merged = new Map<string | null, Array<SuggestionLineView & { title: '' }>>();
  for (const { code, groups } of perWarehouse) {
    for (const group of groups) {
      const bucket = merged.get(group.supplierId) ?? [];
      for (const line of group.lines) {
        bucket.push({
          variantId: line.variantId,
          title: '', // ad çözümü aşağıda tek turda
          supplierCode: line.supplierCode,
          warehouseCode: code,
          availableQty: line.availableQty,
          minStockQty: line.minStockQty,
          suggestedQty: line.suggestedQty,
        });
      }
      merged.set(group.supplierId, bucket);
    }
  }
  if (merged.size === 0) return [];

  // Adlar TEK turda: satır başına sorgu yok. Boy adı üründen gelir (fiyat ekranının deseni).
  const variantIds = [...new Set([...merged.values()].flat().map((l) => l.variantId))];
  const variants = await new ProductVariantService(db).listByIds(variantIds);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const productNames = new Map(products.map((p) => [p.id, resolveLocalizedText(p.name)]));
  const variantTitles = new Map(
    variants.map((v) => [v.id, titleOf(productNames.get(v.productId) ?? '—', resolveLocalizedText(v.label))]),
  );

  const suppliers = await new SupplierService(db).list();
  const supplierOf = new Map(suppliers.map((s) => [s.id, s]));

  const groups: SuggestionGroupView[] = [...merged.entries()].map(([supplierId, lines]) => {
    const supplier = supplierId ? supplierOf.get(supplierId) : undefined;
    return {
      supplierId,
      // Eşlenmemiş grup GÖRÜNÜR kalır: görünmez olması "eksik ürün fark edilmedi" demektir (motor notu).
      supplierName: supplier?.name ?? 'Tedarikçisi eşlenmemiş',
      paymentTermDays: supplier?.paymentTermDays ?? null,
      warehouseCount: new Set(lines.map((l) => l.warehouseCode)).size,
      lines: lines.map((l) => ({ ...l, title: variantTitles.get(l.variantId) ?? '—' })),
    };
  });

  // Adlı tedarikçiler ada göre; eşlenmemiş grup EN SONDA (önce sipariş verilebilecekler).
  return groups.sort((a, b) =>
    a.supplierId === null ? 1 : b.supplierId === null ? -1 : a.supplierName.localeCompare(b.supplierName, 'tr'),
  );
}

/**
 * Siparişler sekmesi — tek turda sayfa (`listRows`, keyset) + özet motoru.
 *
 * "8/12 kalem", tutar ve depo kırılımı EKRANDA hesaplanmaz: `summarizePurchaseOrder` üç sayıyı da
 * türetir (`STACK §4`) — aynı özet sipariş detayında ve tedarikçi kartında da görünecek, türetmeyi
 * ekrana bırakmak üç kopya demekti.
 */
export async function readOrderPage(
  db: Db,
  cursor?: KeysetCursor,
): Promise<{ rows: PurchaseOrderRowView[]; nextCursor: KeysetCursor | null }> {
  const page = await new PurchaseOrderService(db).listRows({ cursor });
  return { rows: page.rows.map(toOrderRowView), nextCursor: page.nextCursor };
}

/** Gönderilmiş ve henüz kapanmamış sipariş sayısı — "yolda ne var" (başlık altı). */
export async function readPendingOrderCount(db: Db): Promise<number> {
  return new PurchaseOrderService(db).countPending();
}

function toOrderRowView(row: PurchaseOrderRow): PurchaseOrderRowView {
  const summary = summarizePurchaseOrder(row);
  return {
    id: row.id,
    // Tedarikçi silinmiş/okunamıyorsa satır yine görünür: sipariş kaydı tedarikçiden bağımsız gerçektir.
    supplierName: row.supplier?.name ?? '—',
    status: row.status,
    createdAt: row.createdAt,
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
  const suppliers = await svc.list();

  return Promise.all(
    suppliers.map(async (s) => {
      const { intakeTotal, balance } = await svc.debt(s.id);
      const phone = s.contact && typeof s.contact.phone === 'string' ? s.contact.phone : null;
      return {
        id: s.id,
        name: s.name,
        phone,
        paymentTermDays: s.paymentTermDays,
        debtCents: toCents(balance),
        intakeTotalCents: toCents(intakeTotal),
        isActive: s.isActive,
      };
    }),
  );
}
