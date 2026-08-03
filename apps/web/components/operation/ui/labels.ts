import { COUNTRY_LABELS, CountryEnum } from '@lezzet/types';

/**
 * Operasyon yüzeyinin ülke sözlüğü — **artık kopya değil, türev** (talep §4, 03.08).
 *
 * `COUNTRY_LABELS` `CountryEnum`'un yanına indi (`packages/types/schemas/enums.schema`): sözlük
 * enum'la aynı dosyada durur, çünkü `Record<Country, …>` eksik anahtarda derlemeyi durdurur —
 * üçüncü bir ülke eklendiği gün karşılığını yazmak unutulamaz. Sözlük burada kalsaydı derleyici
 * susardı.
 *
 * Dosya YAŞAMAYA DEVAM EDİYOR, iki sebeple: *(1)* `COUNTRY_OPTIONS` bir UI biçimidir
 * (`{value,label}`), veri modeli değil — tip paketine koymak oraya form kütüphanesinin şeklini
 * sokardı. *(2)* Sözlük buradan yeniden dışa veriliyor ki on üç tüketicinin import satırı bu turda
 * değişmesin; o düzeltme operasyon şeridinin kendi turunda, tek seferde yapılır (talebin yazıldığı
 * gün tüketici iki taneydi, bugün on üç).
 */
export { COUNTRY_LABELS };

/** Ülke seçicisinin seçenekleri — sıra enum'un sırasıdır (tek kaynak). */
export const COUNTRY_OPTIONS = CountryEnum.options.map((c) => ({ value: c, label: COUNTRY_LABELS[c] }));
