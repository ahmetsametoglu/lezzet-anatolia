import { needsExpiryAttention } from '@lezzet/domain-core';
import { resolveLocalizedText, type AvailableStock, type ProductStockRow, type StockAdjustmentDetail } from '@lezzet/types';
import type { UserProfileService } from '@lezzet/database';
import type { BatchView } from '@/lib/stock/batch-types';
import { titleOf } from '@/lib/catalog/title';
import { type LossRow, type StockLevelRow, type StockWarehouseSplit } from './stock-types';

// DB satırı → view-model indirgemesi. RSC ve server action'lar bunu PAYLAŞIR: ilk sayfa ile sonraki
// sayfalar (ve lot sorgusunun sonucu) aynı şekli üretsin diye tek yerde durur.
//
// KARARLAR BURADA SORULUR, BURADA VERİLMEZ: her satır `domain-core/stock`'a danışır. Uygulama katmanı
// motoru veriyle buluşturur (STACK §4) — eşiği kendi kurmaz, yüzdeyi kendi hesaplamaz.

export async function readActorNames(db: UserProfileService, rows: StockAdjustmentDetail[]): Promise<Map<string, string>> {
  // `created_by` FK taşımıyor (0010), gömülü select ile gelemez → sayfadaki KİMLİKLER tek turda
  // çözülür. Satır başına sorgu (N+1) bir geçmiş listesinde en pahalı hatadır.
  const ids = [...new Set(rows.flatMap((r) => (r.createdBy ? [r.createdBy] : [])))];
  if (ids.length === 0) return new Map();
  const people = await db.listByIds(ids);
  return new Map(people.map((p) => [p.id, p.name]));
}

interface StockLevelInput {
  products: ProductStockRow[];
  batches: BatchView[];
  /**
   * `available_stock` satırları — **(depo, varyant) taneli** (19.5).
   *
   * Satırın toplamı da depo kırılımı da BUNDAN türer, iki ayrı okumadan değil: toplam depo-üstü bir
   * görünümden gelseydi (`available_stock_total`) kırılımın toplamıyla ayrışabilirdi ve hangisinin
   * doğru olduğu belli olmazdı. Tek kaynak, tek gerçek.
   */
  available: readonly AvailableStock[];
  categoryNames: Map<string, string>;
  /** Kimlik → ad/kod; SIRASI operatörün seçici sırasıdır ve kırılım o sırayla çizilir. */
  warehouseLabels: Map<string, { id: string; code: string; name: string }>;
}

/**
 * Ürün sayfasını + partileri + kullanılabilirliği stok seviyesi satırlarına indirger.
 *
 * Satır BOYDUR: bir ürünün üç boyu üç satır olur — çok depoda bile. Varyant×depo düz listesi tarama
 * düzenini bozardı (aynı ürün üç kez), o yüzden depo satıra değil satırın İÇİNE iner: toplam üstte,
 * kırılım açılınca. Partiler varyant kimliğine göre eşlenir; eşleşme bulunamayan boy da listede
 * kalır ("stok yok" da bir cevaptır — gizlenirse operatör ürünün hiç girilmediğini fark edemez).
 */
export function toLevelRows({ products, batches, available, categoryNames, warehouseLabels }: StockLevelInput): StockLevelRow[] {
  const byVariant = new Map<string, BatchView[]>();
  for (const b of batches) {
    const list = byVariant.get(b.variantId);
    if (list) list.push(b);
    else byVariant.set(b.variantId, [b]);
  }

  const availableByVariant = new Map<string, AvailableStock[]>();
  for (const a of available) {
    const list = availableByVariant.get(a.variantId);
    if (list) list.push(a);
    else availableByVariant.set(a.variantId, [a]);
  }

  const order = new Map([...warehouseLabels.keys()].map((id, i) => [id, i]));

  const rows: StockLevelRow[] = [];
  for (const p of products) {
    const productName = resolveLocalizedText(p.name);
    for (const v of p.variants) {
      // Partiler son tarihe göre sıralı geldi (FEFO sırası) → ilki en yakın olandır.
      const own = byVariant.get(v.id) ?? [];
      const stockRows = availableByVariant.get(v.id) ?? [];
      const variantLabel = resolveLocalizedText(v.label);

      const physicalQty = stockRows.reduce((s, r) => s + r.physicalQty, 0);
      const reservedQty = stockRows.reduce((s, r) => s + r.reservedQty, 0);
      const availableQty = stockRows.reduce((s, r) => s + r.availableQty, 0);

      rows.push({
        variantId: v.id,
        productId: p.id,
        productName,
        variantLabel,
        title: titleOf(productName, variantLabel),
        categoryName: (p.categoryId && categoryNames.get(p.categoryId)) || '—',
        status: p.status,
        variantActive: v.isActive,
        physicalQty,
        reservedQty,
        availableQty,
        minStockQty: v.minStockQty,
        // Eşik yoksa "altında" da yoktur; 0 eşik "her zaman yeter" demektir, uyarı üretmez.
        //
        // ⚠ Eşik burada AĞ TOPLAMINA bakıyor ve bu bilinçli bir SINIRDIR: asgari stok eşiği aslında
        // depo bazlı bir gerçektir (`DOMAIN §17`, `warehouse_variant_threshold`) ve o kuyruk Satın
        // Alma'nın "sipariş zamanı" listesidir — burası bir tarama listesi, karar kuyruğu değil.
        belowMin: v.minStockQty !== null && v.minStockQty > 0 && availableQty < v.minStockQty,
        warehouses: splitsOf(stockRows, own, warehouseLabels, order),
        batches: own,
        nearest: own[0] ?? null,
        attentionCount: own.filter((b) => needsExpiryAttention(b.decision)).length,
      });
    }
  }
  return rows;
}

/**
 * Depo kırılımı — yalnız MALI OLAN depolar.
 *
 * `available_stock` her aktif depo için satır döndürür (yeni depoda parti olmasa da "0 da bir
 * cevaptır"), ama kırılımda her varyantın altına "KEHL: 0" yazmak listeyi okunmaz kılardı. Sıfır
 * satırın söyleyeceği şey zaten satırın kendisinde: toplam.
 */
function splitsOf(
  stockRows: readonly AvailableStock[],
  batches: readonly BatchView[],
  labels: Map<string, { code: string; name: string }>,
  order: Map<string, number>,
): StockWarehouseSplit[] {
  return stockRows
    .filter((r) => r.physicalQty > 0 || r.reservedQty > 0)
    .sort((a, b) => (order.get(a.warehouseId) ?? 0) - (order.get(b.warehouseId) ?? 0))
    .map((r) => {
      const label = labels.get(r.warehouseId);
      // Partiler FEFO sıralı geldiği için o deponun İLK partisi en yakın tarihlisidir.
      const nearest = batches.find((b) => b.warehouseId === r.warehouseId) ?? null;
      return {
        warehouseId: r.warehouseId,
        code: label?.code ?? '—',
        name: label?.name ?? 'Bilinmeyen depo',
        physicalQty: r.physicalQty,
        reservedQty: r.reservedQty,
        availableQty: r.availableQty,
        nearestExpiry: nearest?.expiryDate ?? null,
      };
    });
}

/** İmha/fire kayıtlarını ekran satırına indirger — maliyet cent'e, adlar çözülmüş. */
export function toLossRows(rows: StockAdjustmentDetail[], actorNames: Map<string, string> = new Map()): LossRow[] {
  return rows.map((row) => {
    const productName = resolveLocalizedText(row.stock.variant.product.name);
    const variantLabel = resolveLocalizedText(row.stock.variant.label);
    return {
      ...row,
      title: titleOf(productName, variantLabel),
      // İşaret KORUNUR: geri ekleme (negatif) maliyeti de negatif çıkar, net kayıp doğru toplanır.
      costCents: row.unitCostCents === null ? null : row.unitCostCents * row.qty,
      actorName: (row.createdBy && actorNames.get(row.createdBy)) || null,
    };
  });
}
