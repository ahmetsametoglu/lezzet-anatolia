/**
 * Etiket sözlüğünün SLUG kuralı (12.12 · 13.09) — saf, DB'siz.
 *
 * Operatör "Akaryakıt" yazar, defter `akaryakit` taşır: slug ASCII ve küçük harftir çünkü süzgeç ve
 * URL'de olduğu gibi geçer; okunur ad ayrıca `label`ta durur. Türkçe harfler İngilizce karşılığına
 * iner (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u), gerisi ayraca döner ve ayraçlar tekleşir.
 *
 * ── ORTAK ETİKETİ ÖN EKLİDİR ────────────────────────────────────────────────
 * Ortaklar arası hesap ayrı bir varlık değil, etikettir (kullanıcı kararı 13.09): `ortak:<ad>`.
 * Ön ek slug'ın parçasıdır ki rapor "hangi etiketler ortak?" sorusunu biçimden okuyabilsin.
 * Veritabanı kısıtı (`movement_tag.slug ~ '^[a-z0-9][a-z0-9:-]*$'`) iki noktaya bu yüzden izin verir.
 */

export const PARTNER_TAG_PREFIX = 'ortak:';

/** Türkçe harf → ASCII. `toLocaleLowerCase('tr')` sonrası küçük harfler; `İ`→`i`, `I`→`ı`→`i`. */
const TR_TO_ASCII: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

/**
 * Okunur addan slug. Boş ya da yalnız ayraç kalan ad `null` döner — çağıran "etiket adı boş
 * olamaz" der, uydurulmuş bir slug yazmaz.
 */
export function tagSlugOf(label: string, opts: { partner?: boolean } = {}): string | null {
  const base = label
    .trim()
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâîû]/g, (ch) => TR_TO_ASCII[ch] ?? ch)
    // Kalan aksanlı harfler (Fransızca é, è…) taban harfe iner: ayrıştırılıp birleşik işaretler atılır.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base === '') return null;
  return opts.partner ? `${PARTNER_TAG_PREFIX}${base}` : base;
}

/** Ortak etiketi mi — rapor ve ekran ortak ayrımını buradan okur, listeyi ezberlemez. */
export function isPartnerTag(slug: string): boolean {
  return slug.startsWith(PARTNER_TAG_PREFIX);
}
