/**
 * Sözlük SLUG kuralı (12.12 · 13.09) — tür ve etiket sözlüğünün ortak anahtarı; saf, DB'siz.
 *
 * Operatör "Akaryakıt" yazar, defter `akaryakit` taşır: slug ASCII ve küçük harftir çünkü süzgeç ve
 * URL'de olduğu gibi geçer; okunur ad ayrıca `label`ta durur. Türkçe harfler İngilizce karşılığına
 * iner (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u), gerisi ayraca döner ve ayraçlar tekleşir.
 *
 * ── ORTAK ÖN EKİ KALKTI (13.09 · ikinci karar) ──────────────────────────────
 * Bir tur ortak etiketleri `ortak:<ad>` ön ekiyle doğuyordu; ortağın kaydı artık cari HESABIDIR
 * (`account.type = partner`), etiket değil. Veritabanı kısıtı iki noktayı da artık kabul etmiyor
 * (`^[a-z0-9][a-z0-9-]*$`) — kural iki yerde değil, burada ve kısıtta aynı cümle.
 */

/** Türkçe harf → ASCII. `toLocaleLowerCase('tr')` sonrası küçük harfler; `İ`→`i`, `I`→`ı`→`i`. */
const TR_TO_ASCII: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

/**
 * Okunur addan slug. Boş ya da yalnız ayraç kalan ad `null` döner — çağıran "ad boş olamaz" der,
 * uydurulmuş bir slug yazmaz.
 */
export function dictionarySlugOf(label: string): string | null {
  const slug = label
    .trim()
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâîû]/g, (ch) => TR_TO_ASCII[ch] ?? ch)
    // Kalan aksanlı harfler (Fransızca é, è…) taban harfe iner: ayrıştırılıp birleşik işaretler atılır.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? null : slug;
}
