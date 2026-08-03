import type { Locale } from '@lezzet/i18n';
import { COUNTRY_LABELS, CountryEnum } from '@lezzet/types';

/**
 * OPERASYON YÜZEYİNİN DİLİ — çok dilli katalog metni personele bu dilde çözülür.
 *
 * Yüzey Türkçedir (CLAUDE.md §2) ve ekranların çoğu bunu `resolveLocalizedText(name)` ile
 * parametresiz alıyor: kanonik yedek zinciri zaten TR → FR → DE. Sabit, bir okuma kapısı dili
 * ZORUNLU parametre olarak istediğinde o parametresiz çağrının açıkça yazılmış hâlidir.
 *
 * **`DEFAULT_LOCALE` DEĞİL.** O sabit `'fr'` ve müşteri yüzeyinin varsayılanıdır. Adı yüzey
 * söylemediği için doğru duruyor ve bir kez öyle kullanıldı: Talepler ekranı bir tur boyunca
 * ürün adlarını Fransızca gösterdi, Fiyatlar ve Stok aynı ürünü Türkçe gösterirken (03.08).
 */
export const OPERATIONS_LOCALE: Locale = 'tr';

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
