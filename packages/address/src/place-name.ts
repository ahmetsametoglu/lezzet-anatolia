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

/**
 * Kodun tek ve kesin adı, yoksa `null`: çok yerleşimli kodda birini seçmek keyfi, üst idari birime çıkmak ise yanlış belediye
 * adı yazmak olurdu (67800 Strasbourg değil, Bischheim / Hœnheim'dır). `null` gördüğünde ne yazılacağı ekranın kararıdır ve
 * `places` onun elinde.
 */
export function placeLabel(places: readonly string[]): string | null {
  return places.length === 1 ? places[0]! : null;
}

/**
 * Yazılan şehir bu posta kodunun yerleşimlerinden biri mi. Boş liste ve boş şehir geçer, çünkü ölçülemeyen değer uyuşmazlık
 * değildir; eşleşme de cömerttir (arrondissement ve CEDEX eki atılıp bir kez daha denenir), çünkü bu kural siparişi reddeder.
 */
export function cityMatchesPlaces(city: string, places: readonly string[]): boolean {
  if (places.length === 0) return true;

  const wanted = normalizePlaceName(city);
  if (!wanted) return true;

  const known = places.map(normalizePlaceName);
  if (known.includes(wanted)) return true;

  // "paris 11" · "paris 11e" · "strasbourg cedex 2" → gövde adı
  const bare = wanted.replace(/\s+(?:cedex\s*)?\d{1,2}\s*(?:e|er|eme|ieme)?$/, '').replace(/\s+cedex$/, '').trim();
  return bare !== wanted && bare.length > 0 && known.includes(bare);
}
