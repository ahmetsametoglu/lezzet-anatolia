import type { Locale } from '@lezzet/i18n';

/**
 * Vitrin para biçimi — sözleşme HAM cent taşır (`storefront-types`), gösterim burada kurulur.
 * Ayrı durmasının sebebi: aynı fiyat masaüstü ve mobil dosyada iki kez biçimlendirilmesin.
 *
 * Para birimi her dilde EUR — işletme Fransa'dadır; `tr` Fransa'daki Türk diasporasının dilidir,
 * ayrı bir para birimi değil. Ayraç ve simge yeri dile göre değişir (`1 290` → "12,90 €" / "12,90 €"
 * / "12,90 €" ama Almanca ayracı farklıdır) — bunu `Intl` çözer, elle biçim kurulmaz.
 */
const INTL_LOCALE: Record<Locale, string> = { tr: 'tr-TR', fr: 'fr-FR', de: 'de-DE' };

export function formatPrice(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: 'currency', currency: 'EUR' }).format(cents / 100);
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
