import type { Locale } from '@lezzet/i18n';

/**
 * Vitrin para biçimi — sözleşme HAM cent taşır (`storefront-types`), gösterim burada kurulur.
 * Ayrı durmasının sebebi: aynı fiyat masaüstü ve mobil dosyada iki kez biçimlendirilmesin.
 *
 * Para birimi her dilde EUR — işletme Fransa'dadır; `tr` Fransa'daki Türk diasporasının dilidir,
 * ayrı bir para birimi değil.
 *
 * **Simge SAYININ ARDINDA, üç dilde de.** `Intl`'in `style: 'currency'`si Türkçede simgeyi ÖNE
 * koyuyor (`€75,53`) — Türkiye'nin yerel geleneği bu, ama bizim müşterimiz Fransa'da yaşıyor,
 * fiyatı her yerde "75,53 €" diye görüyor ve tasarımın Türkçe maketlerinde de öyle yazılı
 * (`113,20 €` · `−10,00 €`; maketlerin hiçbirinde simge önde geçmiyor). Sonuç: aynı ürün Türkçe
 * ekranda `€75,53`, Fransızcada `75,53 €` görünüyordu — tek işletme, iki para yazımı (29.07).
 *
 * `tr-FR` denendi, çare değil: ICU'da öyle bir veri kümesi yok, `tr`ye düşüyor. Bu yüzden SAYI
 * dilin ayraçlarıyla biçimlenir (Türkçe/Almanca `1.234,50`, Fransızca `1 234,50`) ve simge sabit
 * biçimde eklenir. Ayraç yine `Intl`in işi; elle kurulan tek şey simgenin yeri.
 */
const INTL_LOCALE: Record<Locale, string> = { tr: 'tr-TR', fr: 'fr-FR', de: 'de-DE' };

/** Sayı ile simge arasında BÖLÜNMEYEN boşluk: satır sonu tutarı ikiye ayırmasın (Fransız dizgisi). */
const EURO_SUFFIX = ' €';

export function formatPrice(cents: number, locale: Locale): string {
  const amount = new Intl.NumberFormat(INTL_LOCALE[locale], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `${amount}${EURO_SUFFIX}`;
}

/**
 * Ondalıklı sayı — ayraç DİLE göre değişir (tr/fr/de: virgül). Elle `String(value)` yazmak Türkçe
 * bir sayfaya "0.3" basıyordu; besin beyanı gibi yasal bir tabloda bu, okuyanın alışık olmadığı
 * bir gösterimdir. Basamak sayısı çağıran yerde kararlaştırılır (INCO'nun yuvarlama kuralı).
 */
export function formatDecimal(value: number, locale: Locale, fractionDigits: number): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/**
 * Ağırlık ("4,2 kg" · "850 g") — kilodan küçükse gram kalır. Paket künyesi bunu kullanır: 4200 g
 * yazmak toplamı okunmaz yapıyor, 0,85 kg ise küçük ağırlığı gereksiz ondalıkla süslüyor.
 */
export function formatWeight(grams: number, locale: Locale): string {
  if (grams < 1000) return `${formatDecimal(grams, locale, 0)} g`;
  return `${formatDecimal(grams / 1000, locale, Number.isInteger(grams / 1000) ? 0 : 1)} kg`;
}

/**
 * Teslimat günü ("Perşembe, 24 Temmuz") — gün ADI yazılır çünkü müşteri teslimatı haftanın gününe
 * göre planlar, ayın kaçı olduğuna göre değil. Yıl yok: teslimat günleri hep birkaç gün içinde.
 */
export function formatDeliveryDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
}

/** Karşılaştırma fiyatı ("12,90 €/kg") — INCO gereği raf fiyatının yanında bulunur. */
export function formatComparison(cents: number, locale: Locale): string {
  return `${formatPrice(cents, locale)}/kg`;
}

/**
 * Kısa tarih ("22 Temmuz" · "22 juillet" · "22. Juli") — geçmiş siparişi TANITMAK için, kayıt
 * tutmak için değil. Yıl yazılmaz: müşteri kendi siparişini gün+ay ile zaten tanır, yıl satırı
 * uzatır. Ayın adı kısaltılmaz — "22 Tem" resmî bir belge tonudur, vitrinin dili değil.
 */
export function formatShortDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: 'numeric', month: 'long' }).format(new Date(iso));
}
