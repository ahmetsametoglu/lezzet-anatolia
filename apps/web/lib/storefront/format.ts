import { formatPrice, formatShortDate, formatTime } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';

/**
 * Vitrin biçimleri — sözleşme HAM cent taşır (`storefront-types`), gösterim burada kurulur; ayrı
 * durması aynı değerin masaüstü ve mobil web dosyasında iki kez biçimlendirilmesini önler.
 *
 * `formatPrice`, `formatShortDate` ve `formatTime` gövdeleri `@lezzet/helper`da — üçünün de web
 * dışında tüketeni var (native uygulama, `@lezzet/application`) ve o paketler `apps/web`ten import
 * edemez; buradan yeniden dışa veriliyorlar ki web çağıranları tek yolu kullansın.
 */
export { formatPrice, formatShortDate, formatTime };

/** Dil → ICU eşlemesi — bu modüldeki tarih/sayı biçimleri bundan türer. */
const INTL_LOCALE: Record<Locale, string> = { tr: 'tr-TR', fr: 'fr-FR', de: 'de-DE' };

/**
 * Tutarı BİLİNMEYEN satırın değeri — sıfır değil, cevapsızlık.
 *
 * Burada duruyor çünkü "bilinmiyor" da bir yazım biçimidir: `formatPrice`ın yanında olmazsa her
 * çağıran kendi işaretini uydurur (biri "—", biri "?", biri sessizce `formatPrice(0)`).
 */
export const UNKNOWN_AMOUNT = '—';

/**
 * Ondalıklı sayı — ayraç DİLE göre değişir (tr/fr/de: virgül), çünkü elle `String(value)` yazmak
 * besin beyanı gibi yasal bir tabloya okuyanın alışık olmadığı bir gösterim basar ("0.3").
 * Basamak sayısı çağıran yerde kararlaştırılır (INCO'nun yuvarlama kuralı).
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

/**
 * Geçen süre ("3 dk önce" · "2 hafta önce" · "geçen yıl") — bir olayın TAZELİĞİNİ söyler, gününü
 * değil; yorum ve bildirim satırında okuyan "ne zamandı" değil "yeni mi" diye bakar.
 *
 * Eşik çağıranındır: bu işlev her uzaklığı göreli yazar, takvim gününe geçme kararını (bildirim
 * satırı bir haftadan sonra geçiyor) veren taraf kendi bağlamını bilir.
 */
export function formatRelativeTime(iso: string, locale: Locale, now: number): string {
  const at = new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: 'auto', style: 'short' });
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 60) return rtf.format(-Math.max(1, minutes), 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 7) return rtf.format(-days, 'day');
  if (days < 30) return rtf.format(-Math.round(days / 7), 'week');
  if (days < 365) return rtf.format(-Math.round(days / 30), 'month');
  return rtf.format(-Math.round(days / 365), 'year');
}

/** Karşılaştırma fiyatı ("12,90 €/kg") — INCO gereği raf fiyatının yanında bulunur. */
export function formatComparison(cents: number, locale: Locale): string {
  return `${formatPrice(cents, locale)}/kg`;
}

/**
 * Sipariş GEÇMİŞİNİN tarihi — `formatShortDate`'ten farkı **yıl taşımasıdır**: burası bir arşiv ve
 * liste yıllara yayılır, yılsız "22 Temmuz" iki farklı siparişi ayırt edemez.
 *
 * `compact` mobil satır içindir (kart tek satıra "22 Tem 2026 · 3 kalem · 103,20 €" sığdırıyor);
 * tasarımın mobil karesi yılsız olsa da yıl yazılır, çünkü o kare yalnız bu ayın siparişleriyle
 * çizilmiş ve eski siparişte yılsız tarih yanlış bilgidir.
 */
export function formatOrderDate(iso: string, locale: Locale, compact = false): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: compact ? 'short' : 'long',
    year: 'numeric',
  }).format(new Date(iso));
}
