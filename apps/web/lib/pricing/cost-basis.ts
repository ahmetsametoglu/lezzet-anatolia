import 'server-only';
import { StockService, SupplierProductService, type Db } from '@lezzet/database';
import { COST_HISTORY_SIZE, replacementCost, type CostBasis } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';

/**
 * FİYATIN MALİYET TABANI — okuma tarafı (DOMAIN §"Maliyet ve hedef marj").
 *
 * Karar motorda (`replacementCost`); burada yalnız iki kaynak okunur ve motora verilir:
 *  1. **Alış geçmişi** (`stock`) — tükenmiş partiler dahil, en yeniden eskiye.
 *  2. **Tedarikçi eşlemesindeki son alış** — hiç parti girilmemiş varyantlar için yedek. Bu yedek
 *     olmasaydı, stoğu sıfırlanmış ürünün maliyeti "bilinmiyor"a düşer ve fiyat ekranı marj
 *     gösteremezdi; oysa "geçen sefer kaça aldık" bilgisi duruyor.
 *
 * FİYAT EKRANI VE OTOMATİK FİYAT AYNI TABANI KULLANIR. Ayrılsalardı otomatik fiyatlanan ürün,
 * ekranın kendi marj hesabına göre "marj-altı" görünebilirdi — sistem kendi kararını yanlış bulurdu.
 */
export async function readCostBasis(db: Db, variantIds: readonly string[]): Promise<Map<string, CostBasis>> {
  const ids = [...new Set(variantIds)];
  const result = new Map<string, CostBasis>();
  if (ids.length === 0) return result;

  // Son alış + karşılaştırma penceresi: motorun ihtiyacı kadar satır, fazlası değil.
  const history = await new StockService(db).purchaseHistoryMap(ids, COST_HISTORY_SIZE + 1);

  const missing = ids.filter((id) => !history.has(id));
  const fallback = missing.length > 0 ? await lastPurchaseOf(db, missing) : new Map<string, number>();

  for (const id of ids) {
    const purchases = history.get(id)?.map(toCents) ?? [];
    if (purchases.length > 0) {
      result.set(id, replacementCost(purchases));
      continue;
    }
    const last = fallback.get(id);
    // Yedek tek sayıdır: karşılaştıracak geçmişi yok, motor da onu "ok" sayar (bkz. tek alım kuralı).
    result.set(id, last === undefined ? { status: 'unknown' } : replacementCost([toCents(last)]));
  }
  return result;
}

/**
 * Tedarikçi eşlemelerinden son alış — birden çok tedarikçi varsa **tercih edilen**, o da yoksa
 * EN DÜŞÜK fiyat. En düşüğü seçmek iyimserlik değil gerçekçilik: yeniden alırken en ucuz
 * tedarikçiye gideriz, fiyat kararının tabanı da o olmalı.
 */
async function lastPurchaseOf(db: Db, variantIds: string[]): Promise<Map<string, number>> {
  const mappings = await new SupplierProductService(db).listByVariants(variantIds);
  const best = new Map<string, { price: number; preferred: boolean }>();

  for (const row of mappings) {
    if (row.lastPurchasePrice == null || row.lastPurchasePrice <= 0) continue;
    const current = best.get(row.variantId);
    const candidate = { price: row.lastPurchasePrice, preferred: row.isPreferred };
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
