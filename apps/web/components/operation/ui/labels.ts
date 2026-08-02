import { CountryEnum, type Country } from '@lezzet/types';

/**
 * Operasyon yüzeyinin ORTAK sözlüğü — enum'un Türkçe karşılığı, tek kaynak.
 *
 * `ORDER_STATUS_LABELS` gibi sözlükler enum'un yanında (`packages/types`) duruyor ve doğrusu da o:
 * `Record` eksik anahtarda derlemeyi durdurur, yani yeni bir değer eklendiğinde karşılığını yazmak
 * unutulamaz. Ülke sözlüğü oraya HENÜZ girmedi ve iki ekranda birden gerekti (müşteri künyesi ·
 * depo künyesi); ikinci kopyayı yazmak yerine burada birleşti. Arka uç şeridine `CountryEnum`'un
 * yanına taşınması istendi (`docs/build/operasyon-ekranlari-arka-uc-talebi.md §4`) — taşınınca bu
 * dosya düşer.
 */
export const COUNTRY_LABELS: Record<Country, string> = { FR: 'Fransa', DE: 'Almanya' };

/** Ülke seçicisinin seçenekleri — sıra enum'un sırasıdır (tek kaynak). */
export const COUNTRY_OPTIONS = CountryEnum.options.map((c) => ({ value: c, label: COUNTRY_LABELS[c] }));
