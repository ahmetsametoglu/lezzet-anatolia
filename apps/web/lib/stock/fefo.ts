import { ReservationService, StockService, serviceDb } from '@lezzet/database';
import { expiryFlagOf, isSellableBatch, remainingShelfLifePercent, suggestFefoPicks } from '@lezzet/domain-core';
import type { ExpiryFlag } from '@lezzet/domain-core';

/**
 * FEFO hazırlık önerisi (06.5) — **uygulama katmanı orkestrasyonu**.
 *
 * Burada yaşamasının sebebi sınır kuralıdır (STACK §4/§13): `domain-core` DB'yi bilmez, `database`
 * motoru bilmez. Satırları servis getirir, kararı motor verir, ikisini birleştiren yer burasıdır.
 * Uygulama kuralı KENDİ hesaplamaz — sıralamayı, satılabilirliği ve pinned düşümünü motora sorar.
 *
 * Öneridir, emir değil: depo ekranı bunu gösterir, depocu saparsa yalnız o satırı değiştirir
 * (DOMAIN §4). Kesinleşen partiler `OrderItemBatch`'e yazılır — o yazım sipariş tablolarını
 * bekliyor (modül 07).
 */

interface FefoPick {
  stockId: string;
  qty: number;
  expiryDate: string;
  lotNumber: string | null;
  /** Partinin alanının ADI — rafta aranan tabela (19.29). */
  areaName: string | null;
  /** Uyarı durumu — ekran "son 2 gün" partisini işaretlesin diye. */
  flag: ExpiryFlag;
  remainingPercent: number | null;
}

interface FefoSuggestion {
  picks: FefoPick[];
  /** Karşılanamayan miktar (0 ise sipariş bu partilerden tamamen çıkar). */
  shortfall: number;
}

/**
 * Bir kalem için hangi partiden kaç adet çıkacağını önerir: **önce süresi dolan**. Satılamaz parti
 * (DLC'si geçmiş) hiç önerilmez; teklife söz verilmiş (partiye çıpalı) miktar o partinin
 * kullanılabilirinden düşülür — normal hazırlık teklifin stoğunu yiyemez.
 */
/**
 * `warehouseId` zorunlu: hazırlık daima siparişin deposundan toplanır. Süzgeçsiz bir FEFO önerisi
 * başka şehirdeki partiyi önerir; depocu onu seçer ve `record_preparation` reddeder (DOMAIN §17).
 */
export async function suggestPicksForVariant(
  warehouseId: string,
  variantId: string,
  qty: number,
  now: Date = new Date(),
): Promise<FefoSuggestion> {
  const db = serviceDb();
  const [batches, reservations] = await Promise.all([
    new StockService(db).listByVariantWithDates(warehouseId, variantId),
    new ReservationService(db).listActiveByVariant(variantId),
  ]);

  const decision = suggestFefoPicks(
    qty,
    batches.map((b) => ({
      stockId: b.id,
      physicalQty: b.physicalQty,
      expiryDate: b.expiryDate,
      sellable: isSellableBatch(b.variant.product.dateType, b.expiryDate, now),
    })),
    reservations.map((r) => ({ qty: r.qty, stockId: r.stockId, expiresAt: r.expiresAt })),
    now,
  );

  const byId = new Map(batches.map((b) => [b.id, b]));
  return {
    shortfall: decision.shortfall,
    picks: decision.picks.map((pick) => {
      const batch = byId.get(pick.stockId)!;
      const { dateType, shelfLifeDays } = batch.variant.product;
      return {
        stockId: pick.stockId,
        qty: pick.qty,
        expiryDate: batch.expiryDate,
        lotNumber: batch.lotNumber,
        areaName: batch.storageArea?.name ?? null,
        flag: expiryFlagOf(dateType, batch.expiryDate, shelfLifeDays, now),
        remainingPercent: remainingShelfLifePercent(batch.expiryDate, shelfLifeDays, now),
      };
    }),
  };
}
