import { percentOf } from '@lezzet/helper';
import { expiryFlagOf, remainingShelfLifePercent, type ExpiryFlag } from './shelf-life';
import type { ProductDateType } from '@lezzet/types';

/**
 * Near-expiry TEKLİF kararı (09.13 · DOMAIN §5, §4).
 *
 * Sistem **işaretler ve önerir, karar insanındır.** Bu dosya o ayrımın kod karşılığı: hangi partinin
 * karar beklediğini ve teklif açılacaksa fiyatın ne olabileceğini söyler — hiçbir şeyi kendiliğinden
 * teklife açmaz. Teklifi açan tek yol operatörün `offerPrice` yazmasıdır.
 *
 * Önerilen indirim **%30** (parametrik varsayılan): tarihe yaklaşan malı elden çıkarmaya yetecek
 * kadar büyük, marjı toptan silmeyecek kadar ölçülü. Eşik gibi bu da `Setting`'e taşınabilir.
 */

export const OFFER_DISCOUNT_PERCENT = 30;

/**
 * Önerilen teklif fiyatı (cent). Liste fiyatı bilinmiyorsa öneri de YOKTUR (`null`) — uydurma bir
 * taban üzerinden indirim önermek, operatöre olmayan bir hesabı doğruymuş gibi gösterirdi.
 *
 * Aşağı yuvarlanır: 12,857 € önerisi 12,85 € olur. Yukarı yuvarlamak "önerdiğin indirimden azını
 * verdim" demektir; indirimde eksik yönde yuvarlamak müşteri lehinedir ve sürprizi olmaz.
 */
export function suggestedOfferPriceCents(
  listPriceCents: number | null | undefined,
  discountPercent: number = OFFER_DISCOUNT_PERCENT,
): number | null {
  if (listPriceCents == null || listPriceCents <= 0) return null;
  const off = percentOf(listPriceCents, discountPercent);
  return Math.max(0, Math.floor(listPriceCents - off));
}

/**
 * Açık bir teklifin liste fiyatına göre indirim yüzdesi — "%30 verdim" cümlesinin geriye okunuşu.
 * Liste fiyatı yoksa oran hesaplanamaz (`null`). Teklif listeden pahalıysa NEGATİF döner; onu
 * saklamak yerine göstermek doğrudur, çünkü o bir hatadır ve görülmelidir.
 */
export function offerDiscountPercent(
  listPriceCents: number | null | undefined,
  offerPriceCents: number | null | undefined,
): number | null {
  if (listPriceCents == null || listPriceCents <= 0 || offerPriceCents == null) return null;
  return ((listPriceCents - offerPriceCents) / listPriceCents) * 100;
}

/** Partinin karar durumu — ekran bunu okur, kendi eşiğini kurmaz. */
export type OfferDecision =
  /** Karar beklemiyor: ömrü yeterli ya da ölçüt yok. */
  | 'none'
  /** Teklife açılabilir (yaklaşan tarihli ya da DDM geçmiş ama satılabilir). */
  | 'can_offer'
  /** Teklif zaten açık — karar verilmiş, izlenir. */
  | 'offer_open'
  /** DLC geçti: satılamaz, tek yol imha. Teklif açık olsa bile artık geçersizdir. */
  | 'must_discard';

/**
 * Partinin bugün hangi kararı beklediği. `ExpiryFlag` "durum nedir" sorusunu yanıtlar; bu fonksiyon
 * "ne yapılabilir" sorusunu — ikisi ayrıdır çünkü açık teklif durumu değiştirmez, YOLU değiştirir.
 *
 * **Sıra bilinçli:** DLC geçmişi her şeyi ezer. Tarihi geçmiş bir partide teklif açık kalmışsa ekran
 * yine imhaya yönlendirir; "indirimli satılıyor" görünmesi güvenlik kuralını sessizce delerdi.
 */
export function offerDecisionOf(params: {
  dateType: ProductDateType;
  expiryDate: string | Date;
  shelfLifeDays: number | null | undefined;
  offerPriceCents: number | null | undefined;
  now?: Date;
  nearExpiryPercent?: number;
}): { decision: OfferDecision; flag: ExpiryFlag; remainingPercent: number | null } {
  const { dateType, expiryDate, shelfLifeDays, offerPriceCents, now = new Date(), nearExpiryPercent } = params;
  const flag = expiryFlagOf(dateType, expiryDate, shelfLifeDays, now, nearExpiryPercent);
  const remainingPercent = remainingShelfLifePercent(expiryDate, shelfLifeDays, now);

  if (flag === 'expired_blocked') return { decision: 'must_discard', flag, remainingPercent };
  if (offerPriceCents != null) return { decision: 'offer_open', flag, remainingPercent };
  if (flag === 'near_expiry' || flag === 'expired_sellable') return { decision: 'can_offer', flag, remainingPercent };
  return { decision: 'none', flag, remainingPercent };
}

/** Karar bekleyen parti mi — uyarı listesinin tek ölçütü (sayaç ve liste aynı soruyu sorsun diye). */
export function needsExpiryAttention(decision: OfferDecision): boolean {
  return decision !== 'none';
}
