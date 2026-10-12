import { joinCountries } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import type messages from '@lezzet/i18n/customer/delivery-zones';
import type { Country } from '@lezzet/types';

/** İki görünümün ortak cümleleri; telefon ve masaüstü aynı sayıyı ve aynı kapanışı söylesin. */
type Copy = (typeof messages)[Locale];

/** Kapanış cümlesi kargo yolunu açıkça söyler; hiç kargo deposu yoksa cümle ülkesiz kurulur, "hiçbir yere" yazılmaz. */
export function closingSentence(t: Copy, shippingCountries: readonly Country[]): string {
  return shippingCountries.length === 0
    ? t.closingNoShipping
    : t.closing.replace('{countries}', joinCountries(shippingCountries, t.countries, t.and));
}

export function placeCount(t: Copy, n: number): string {
  return n === 1 ? t.placeCountOne : t.placeCount.replace('{n}', String(n));
}

/** Son satırın ilk hücresi: ayraç son satırın altına çizilmez ve eksik kalan son satır da son satırdır. */
export function lastRowStart(count: number, columns: number): number {
  const rest = count % columns;
  return count - (rest === 0 ? columns : rest);
}
