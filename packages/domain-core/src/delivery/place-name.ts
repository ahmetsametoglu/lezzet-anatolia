import { normalizePlaceName } from '@lezzet/helper';

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

/**
 * `unknown_code`: kod ne bölge tablomuzda ne referansta; referans bir anlık görüntü olduğu için engel değil işarettir.
 * `city_mismatch`: kod tanınıyor ama şehir onun yerleşimi değil; çelişen iki beyan olduğu için daha güçlü sinyaldir.
 */
export type AddressAnomaly = 'unknown_code' | 'city_mismatch';

/**
 * Bölge tablomuz referansın üstündedir, bu yüzden ikisinden biri kodu tanıyorsa yeter. Şehir uyuşmazlığı yalnız kod tanınıyorken
 * sorulur, yoksa aynı arıza iki kez sayılırdı.
 */
export function addressAnomalies(input: {
  city: string | null;
  places: readonly string[];
  inRoute: boolean;
}): AddressAnomaly[] {
  const known = input.inRoute || input.places.length > 0;
  if (!known) return ['unknown_code'];
  // Yazılmamış şehir yanlış şehir değildir.
  if (input.city && !cityMatchesPlaces(input.city, input.places)) return ['city_mismatch'];
  return [];
}
