import type { Country, PreferredLanguage } from '@lezzet/types';

/**
 * Yer bilinmezken fiyatı okunan ülke; yalnız Almanca arayüz Almanya fiyatını gösterir, öteki diller genel fiyatı
 * (docs/feature/ulke-pazari.md 5. karar).
 */
const LOCALE_PRICE_COUNTRY: Readonly<Partial<Record<PreferredLanguage, Country>>> = { de: 'DE' };

/**
 * Fiyatın okunduğu ülke tek kuraldan gelir: yerin ülkesi, yer yoksa arayüz dilinin ülkesi, o da yoksa `null` (genel fiyat). Gel-alda
 * yer deponun kendisidir, çağıran deponun ülkesini verir.
 */
export function priceCountryOf(placeCountry: Country | null, locale: PreferredLanguage): Country | null {
  return placeCountry ?? LOCALE_PRICE_COUNTRY[locale] ?? null;
}
