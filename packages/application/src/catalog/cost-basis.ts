import { StockService, SupplierProductService, type Db } from '@lezzet/database';
import { COST_HISTORY_SIZE, replacementCost, type CostBasis } from '@lezzet/domain-core';

/**
 * Fiyat kararının maliyet tabanını okur; karar motorda (`replacementCost`). Fiyat ekranı, otomatik fiyat ve müşteri
 * fiyat kuralı aynı tabanı okur, yoksa sistem kendi hesapladığı fiyatı "marj-altı" bulabilirdi.
 */
export async function readCostBasis(db: Db, variantIds: readonly string[]): Promise<Map<string, CostBasis>> {
  const ids = [...new Set(variantIds)];
  const result = new Map<string, CostBasis>();
  if (ids.length === 0) return result;

  const history = await new StockService(db).purchaseHistoryCentsMap(ids, COST_HISTORY_SIZE + 1);

  // Hiç parti girilmemiş varyantın yedeği tedarikçi eşlemesindeki son alıştır, yoksa stoğu sıfırlanan ürünün maliyeti kaybolurdu.
  const missing = ids.filter((id) => !history.has(id));
  const fallback = missing.length > 0 ? await lastPurchaseOf(db, missing) : new Map<string, number>();

  for (const id of ids) {
    const purchases = history.get(id) ?? [];
    if (purchases.length > 0) {
      result.set(id, replacementCost(purchases));
      continue;
    }
    const last = fallback.get(id);
    result.set(id, last === undefined ? { status: 'unknown' } : replacementCost([last]));
  }
  return result;
}

/**
 * Tedarikçi eşlemelerinden son alış (cent): tercih edilen tedarikçi, yoksa en düşük fiyat, çünkü yeniden alırken en ucuz
 * tedarikçiye gidilir.
 */
async function lastPurchaseOf(db: Db, variantIds: string[]): Promise<Map<string, number>> {
  const mappings = await new SupplierProductService(db).listByVariants(variantIds);
  const best = new Map<string, { price: number; preferred: boolean }>();

  for (const row of mappings) {
    if (row.lastPurchasePriceCents == null || row.lastPurchasePriceCents <= 0) continue;
    const current = best.get(row.variantId);
    const candidate = { price: row.lastPurchasePriceCents, preferred: row.isPreferred };
    if (!current) {
      best.set(row.variantId, candidate);
      continue;
    }
    if (current.preferred && !candidate.preferred) continue;
    if (candidate.preferred && !current.preferred) {
      best.set(row.variantId, candidate);
      continue;
    }
    if (candidate.price < current.price) best.set(row.variantId, candidate);
  }
  return new Map([...best].map(([id, { price }]) => [id, price]));
}
