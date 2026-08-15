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

/**
 * Kanal başına gerçekleşen marjlar içinde **EN DARI** — çok kanallı marj-altı uyarısının ölçütü.
 *
 * Bir varyantın iki fiyatı (b2c/b2b) iki ayrı marj demektir ve ekran tek sayı gösterir. Hangisi?
 * En dar olanı: uyarının işi riski göstermektir, ortalama almak zararına satan kanalı kârlı olanın
 * arkasına gizlerdi. Fiyatı olmayan kanal hesaba GİRMEZ (fiyatsızlık ayrı bir durumdur — "o kanalda
 * satışa kapalı" — sıfır marj değildir).
 *
 * Girdi KDV HARİÇ (HT) gelir: dönüşüm çağıranın işi, çünkü taban kanala göre değişir (`vatBaseOf`).
 */
export function tightestMargin(
  entries: ReadonlyArray<{ channel: string; revenueHtCents: number }>,
  costCents: number | null,
): { channel: string; percent: number } | null {
  if (costCents == null || costCents <= 0) return null;
  let tightest: { channel: string; percent: number } | null = null;
  for (const entry of entries) {
    const percent = markupPercent(entry.revenueHtCents, costCents);
    if (percent === null) continue;
    if (tightest === null || percent < tightest.percent) tightest = { channel: entry.channel, percent };
  }
  return tightest;
}

/**
 * Kanalın GEÇERLİ hedef marjı (15.08, kullanıcı kararı): toptan marjı perakendeden farklı
 * kurulabilir — `targetMarginB2bPercent` yalnız B2B'yi ezer, boşsa ortak hedef iki kanalda da
 * geçerli. Çözüm TEK yerde durur: diyalog önizlemesi, otomatik fiyat kablosu ve marj-altı uyarısı
 * aynı fonksiyonu çağırır — üçü ayrı çözseydi "hangi hedefe göre" sorusu ekrandan ekrana değişirdi.
 */
export function targetMarginFor(
  channel: string,
  targetMarginPercent: number | null,
  targetMarginB2bPercent: number | null,
): number | null {
  return channel === 'b2b' && targetMarginB2bPercent != null ? targetMarginB2bPercent : targetMarginPercent;
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
