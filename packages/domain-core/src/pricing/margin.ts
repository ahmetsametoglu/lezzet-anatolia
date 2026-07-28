/**
 * Marj hesabı — SAF karar, DB'siz.
 *
 * TANIM (DOMAIN "Maliyet ve hedef marj"): marj, **maliyet üzerine markup**'tır — maliyet 10 €, hedef
 * marj %40 → hedef fiyat ≥ 14 €. Brüt marj (kâr ÷ satış) ile karıştırılmamalı: aynı sayılarla o hesap
 * %28,6 verir. Proje TEK tanım kullanır ve tanım burada yaşar; iki ekran aynı ürüne farklı yüzde
 * yazarsa hangisine güvenileceği bilinmez.
 *
 * Karşılaştırma hep **KDV HARİÇ** (HT) tarafta yapılır: maliyet KDV'siz bir tutardır, satış fiyatı ise
 * b2c'de KDV dahil. İkisini doğrudan bölmek marjı olduğundan düşük gösterir.
 */

/** Maliyet üzerine gerçekleşen markup yüzdesi. Maliyet 0/negatifse `null` — bölünemez, uydurulmaz. */
export function markupPercent(revenueHtCents: number, costCents: number): number | null {
  if (costCents <= 0) return null;
  return ((revenueHtCents - costCents) / costCents) * 100;
}

/** Hedef marjı sağlayan en düşük HT satış fiyatı (kuruş) — "marj-altı" eşiği budur. */
export function priceForMargin(costCents: number, targetMarginPercent: number): number {
  return Math.round(costCents * (1 + targetMarginPercent / 100));
}

/** Gerçekleşen markup hedefin altında mı? Maliyet ya da hedef bilinmiyorsa karar YOKTUR (`null`). */
export function isBelowTargetMargin(
  revenueHtCents: number,
  costCents: number | null,
  targetMarginPercent: number | null,
): boolean | null {
  if (costCents == null || targetMarginPercent == null || costCents <= 0) return null;
  return revenueHtCents < priceForMargin(costCents, targetMarginPercent);
}
