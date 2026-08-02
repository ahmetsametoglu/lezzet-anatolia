/**
 * TAKVİM günü farkı — `to` ile `from` arasında kaç gün var (denetim A6).
 *
 * ── NEDEN GÜN BAŞINA İNDİRİLİR ───────────────────────────────────────────────
 * İki damga arasındaki ham milisaniyeyi 86.400.000'e bölmek "kaç 24 saat geçti"yi verir, "kaç gün
 * sonra" sorusunu DEĞİL. Son kullanma tarihi 3 gün sonraysa cevap saat kaç olduğuna göre 2 ya da 3
 * çıkar; aynı parti sabah "uyarı eşiğinde", akşam "değil" görünür. Bu yüzden iki uç da UTC gün
 * başına indirilir ve fark tam sayıdır.
 *
 * ── NEDEN TEK EV ─────────────────────────────────────────────────────────────
 * `domain-core` içinde iki tanım vardı: `stock/shelf-life` (`Date` alır, gün başına indirir,
 * `round`) ve `stock/transfer` (`string` alır, ham milisaniyeyi `floor`'lar). Tarih-yalnız
 * girdilerde ikisi aynı sonucu veriyordu, ama iki farklı yuvarlama taşıyorlardı — saatli bir damga
 * geçen ilk çağrıda ayrışacaklardı ve ayrıştıkları yer raf ömrü kararıydı: bir parti "sevkte
 * bozulur" sayılıp elenir ya da elenmezdi.
 *
 * Girdi `Date` de `string` de olabilir; iki çağıranın biçimi farklıydı ve birini ötekine
 * uydurmak, taşımanın kendisini gereksiz yere büyütürdü.
 */
export function daysBetween(from: Date | string, to: Date | string): number {
  return dayIndex(to) - dayIndex(from);
}

/** Bir tarihin UTC gün numarası — saat/dakika/dilim gürültüsü karara girmesin diye. */
function dayIndex(value: Date | string): number {
  const d = typeof value === 'string' ? new Date(value) : value;
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
}
