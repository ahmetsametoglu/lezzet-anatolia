/**
 * Karşılaştırma için ad normalizasyonu: yalnız yazım farklarını (diyakritik, ligatür, tire, büyük-küçük harf) siler; "St" ↔
 * "Saint" gibi genişletme yapmaz, çünkü ayrı belediyeleri birbirine karıştırırdı. SQL'deki `place_search_text()` aynı kuralı
 * uygular ve ikisi ayrışırsa arama kendi kaydını bulamaz.
 */
export function normalizePlaceName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
