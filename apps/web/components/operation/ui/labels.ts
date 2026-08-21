import type { Locale } from '@lezzet/i18n';
import { COUNTRY_LABELS, CarrierEnum, CountryEnum, type Carrier } from '@lezzet/types';

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

/**
 * Taşıyıcı adları — ham enum değeri ekrana yazılmaz. Sevkiyat'tan buraya taşındı (10.9): ikinci
 * tüketici hazırlık ekranı oldu (kargo künyesini o yazar, Sevkiyat okur). `Record<Carrier, …>`
 * eksik anahtarda derlemeyi durdurur — yeni taşıyıcı eklendiği gün karşılığı unutulamaz.
 */
export const CARRIER_LABEL: Record<Carrier, string> = {
  colissimo: 'Colissimo',
  chronopost: 'Chronopost',
  dhl: 'DHL',
  ups: 'UPS',
  other: 'diğer',
};

/** Taşıyıcı seçicisinin seçenekleri — sıra enum'un sırasıdır (tek kaynak). */
export const CARRIER_OPTIONS = CarrierEnum.options.map((c) => ({ value: c, label: CARRIER_LABEL[c] }));

/**
 * **Bir posta kodunun yerleşim adları, okunur hâlde** (`OB-04`, kullanıcının arayüz testi 14.08).
 *
 * ── NEDEN BURADA, `domain-core`'da DEĞİL ────────────────────────────────────
 * `placeLabel` (motor) *"bu kodun tartışmasız bir adı var mı"* sorusunu cevaplar ve çok yerleşimli
 * kodda `null` döner. Künyesi bu fonksiyonu adıyla tarif ediyor:
 *
 * > *"`null` gördüğünde ne yazılacağı — liste mi, ilk üç ad + '+X' mi, çıplak kod mu — **ekranın
 * > kararıdır ve `places` onun elinde.**"*
 *
 * Yani ayrım baştan tasarlanmıştı; eksik olan, okumaların `places`'i ekrana hiç GEÇİRMEMESİydi —
 * `placeLabel`e çevirip diziyi atıyorlardı, dolayısıyla ekranın elinde bir şey kalmıyordu ve çok
 * yerleşimli kod (kodların ~%39'u) haritada adsız görünüyordu.
 *
 * ── NEDEN "İLKİNİ YAZ" DEĞİL ────────────────────────────────────────────────
 * `places[0]` bir kez denendi ve yanlıştı: keyfi seçim otorite gibi okunur — `67800` "Strasbourg"
 * değil, Bischheim/Hœnheim. Hepsini yazmak dürüsttür; kırpma gerektiğinde **kaç tanesinin
 * gizlendiği sayılır** (`+2`), susturulmaz.
 *
 * `max` çağıranın kararı, çünkü iki yer iki farklı yüke dayanır: kalıcı harita etiketi dar
 * (noktaların üstünü örtmemeli), üzerine gelince açılan ipucu geniş (soru zaten "burası neresi").
 *
 * `null` = ad bilinmiyor (`places` boş). Boş dizgi DEĞİL: çağıran "kodu tek başına yaz" diyebilsin.
 */
export function placesLabel(places: readonly string[], max = Number.POSITIVE_INFINITY): string | null {
  if (places.length === 0) return null;
  if (places.length <= max) return places.join(', ');
  return `${places.slice(0, max).join(', ')} +${places.length - max}`;
}
