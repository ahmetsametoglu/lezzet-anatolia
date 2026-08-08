import { formatPrice } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';

/**
 * Vitrin biçimleri — sözleşme HAM cent taşır (`storefront-types`), gösterim burada kurulur.
 * Ayrı durmasının sebebi: aynı değer masaüstü ve mobil web dosyasında iki kez biçimlendirilmesin.
 *
 * `formatPrice` gövdesi BURADA DEĞİL: `@lezzet/helper`a terfi etti (21.7 — native uygulama da aynı
 * kaynaktan tüketiyor; "webde 75,53 €, mobilde €75,53" ayrışmasını tek kaynak kapatır). Simge-sonda
 * kararının gerekçesi de artık o dosyanın künyesinde. Web çağıranları için buradan yeniden dışa
 * verilir — 32 dosya import yolunu değiştirmeden tek kaynağa bağlı (web ikizi silindi, 07.08).
 */
export { formatPrice };

/** Dil → ICU eşlemesi — bu modüldeki tarih/sayı biçimleri bundan türer. */
const INTL_LOCALE: Record<Locale, string> = { tr: 'tr-TR', fr: 'fr-FR', de: 'de-DE' };

/**
 * Tutarı BİLİNMEYEN satırın değeri — sıfır DEĞİL, cevapsızlık (`CLAUDE §1`).
 *
 * Burada duruyor çünkü tutarın nasıl yazıldığını bilen modül bu: "bilinmiyor" da bir yazım
 * biçimidir ve `formatPrice`ın yanında olmazsa çağıranlar kendi işaretini uydurur — biri "—",
 * biri "?", biri sessizce `formatPrice(0)`. Sepetin kalem satırları zaten "—" yazıyordu; sabit
 * onların idiyomunu paylaşılabilir hâle getiriyor.
 */
export const UNKNOWN_AMOUNT = '—';

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

/**
 * Sipariş GEÇMİŞİNİN tarihi — `formatShortDate`'ten farkı **yıl taşımasıdır**.
 *
 * O helper'ın künyesi "yıl yazılmaz" diyor ve kendi bağlamında haklı: sipariş onay sayfasında
 * müşteri az önce verdiği siparişe bakıyordur. Burası ise bir ARŞİV — liste yıllara yayılır ve
 * yılsız "22 Temmuz" iki farklı siparişi ayırt edemez.
 *
 * `compact` mobil satır içindir: kart tek satıra "22 Tem 2026 · 3 kalem · 103,20 €" sığdırıyor,
 * uzun ay adı taşardı. Tasarımın mobil karesinde yıl yok ("22 Tem"); yılı yine de yazıyoruz çünkü
 * o kare yalnız bu ayın siparişleriyle çizilmiş — eski siparişte yılsız tarih yanlış bilgidir.
 * Sapma `design/BACKLOG` §1'de kayıtlı.
 */
export function formatOrderDate(iso: string, locale: Locale, compact = false): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: compact ? 'short' : 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

/**
 * Gün İÇİNDEKİ saat — yazışma damgası ("18:02", 08.6).
 *
 * Burada duruyor çünkü dil tablosu (`INTL_LOCALE`) bu modülün: saati çağıranın yanında
 * biçimlendirmek, o tabloyu ikinci kez yazmak demekti ve iki kopya bir gün ayrışır.
 */
export function formatTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
