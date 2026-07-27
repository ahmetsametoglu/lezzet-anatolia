/**
 * Para — tamsayı cent (STACK §8 motor sözleşmesi).
 *
 * Kayan nokta para için yanlıştır: `0.1 + 0.2 !== 0.3`. Sapma tek kalemde görünmez ama indirim
 * dağıtımında ve KDV'de kuruş kaçırır, sonra kasa tutmaz. Motorun tamamı cent ile çalışır; DB
 * `numeric` tutar, dönüşüm sınırda (servis katmanı) yapılır.
 *
 * Adlandırma: `…Cents` ile biten her değer tamsayıdır. Euro cinsinden `number` yalnız sınırda görünür.
 */

/** Euro (DB `numeric`) → cent. Yarım cent yukarı yuvarlanır; girdi zaten 2 basamaklı olmalıdır. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Cent → euro (DB yazımı / gösterim sınırı). */
export function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Kilogram başına karşılaştırma fiyatı (cent). Farklı gramajlı paketleri kıyaslanabilir kılar ve
 * uzaktan satışta raf fiyatının yanında bulunması beklenir (INCO birim fiyat iyi uygulaması).
 *
 * Net ağırlık yoksa ya da sıfırsa `null` — uydurma bir kıyas, hiç kıyas olmamasından kötüdür.
 * Sonuç gösterim içindir; hiçbir tahsilat bu sayıdan hesaplanmaz, bu yüzden en yakına yuvarlanır.
 */
export function pricePerKg(cents: number, netWeightG: number | null): number | null {
  if (!netWeightG || netWeightG <= 0) return null;
  return Math.round((cents * 1000) / netWeightG);
}

/**
 * Oransal indirim — aşağı yuvarlar (müşteri lehine değil, İŞLETME lehine değil: tutarlılık lehine).
 * Artan kuruşun nereye gideceğini `distributeDiscount` çözer; tek kalemde kalan kuruş kaybolmaz.
 */
export function percentOf(cents: number, percent: number): number {
  return Math.floor((cents * percent) / 100);
}

/**
 * Sepet düzeyi indirimi kalemlere **oransal** dağıtır (DOMAIN §5).
 *
 * Her kalem kendi payı kadar alır (aşağı yuvarlanmış), yuvarlamadan artan kuruşlar **en büyük
 * kaleme** eklenir. Böylece `Σ sonuç === totalDiscountCents` HER ZAMAN tutar — kısmi iade ve kalem
 * KDV'si bu paylardan hesaplandığı için tutmazsa hesap sonradan bozulur.
 *
 * `lineTotalsCents` boşsa ya da toplamı 0 ise boş dağıtım döner (bölme yok).
 */
export function distributeDiscount(lineTotalsCents: number[], totalDiscountCents: number): number[] {
  const base = lineTotalsCents.reduce((a, b) => a + b, 0);
  if (base <= 0 || totalDiscountCents <= 0) return lineTotalsCents.map(() => 0);

  // İndirim sepetten büyük olamaz (kupon tutarı sepeti aşarsa sepetle sınırlanır).
  const total = Math.min(totalDiscountCents, base);
  const shares = lineTotalsCents.map((line) => Math.floor((line * total) / base));
  const remainder = total - shares.reduce((a, b) => a + b, 0);
  if (remainder === 0) return shares;

  // Artan kuruş en büyük kaleme — en çok ödeyen, en çok yuvarlama kaybını taşır.
  let biggest = 0;
  for (let i = 1; i < lineTotalsCents.length; i += 1) {
    if ((lineTotalsCents[i] ?? 0) > (lineTotalsCents[biggest] ?? 0)) biggest = i;
  }
  shares[biggest] = (shares[biggest] ?? 0) + remainder;
  return shares;
}

/** KDV hariç tutara KDV ekler (HT → TTC). `vatRate` yüzdedir: 5.5 · 20. */
export function addVat(netCents: number, vatRate: number): number {
  return Math.round(netCents * (1 + vatRate / 100));
}

/** KDV dahil tutardan KDV'yi ayırır (TTC → HT). */
export function removeVat(grossCents: number, vatRate: number): number {
  return Math.round(grossCents / (1 + vatRate / 100));
}

/** Tutarın içindeki KDV payı — dahil fiyatta `gross − net`. */
export function vatPortion(grossCents: number, vatRate: number): number {
  return grossCents - removeVat(grossCents, vatRate);
}
