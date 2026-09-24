import { UNKNOWN_AMOUNT, formatPrice, formatShortDate, formatTime } from '@lezzet/helper';
import { INTL_LOCALE, type Locale } from '@lezzet/i18n';

/**
 * Vitrin biçimleri — sözleşme HAM cent taşır (`storefront-types`), gösterim burada kurulur; ayrı
 * durması aynı değerin masaüstü ve mobil web dosyasında iki kez biçimlendirilmesini önler.
 *
 * `formatPrice`, `formatShortDate`, `formatTime` ve `UNKNOWN_AMOUNT` gövdeleri `@lezzet/helper`da, çünkü web dışında da
 * tüketilirler (native uygulama, `@lezzet/application`); buradan yeniden dışa verilirler ki web çağıranları tek yolu kullansın.
 */
export { UNKNOWN_AMOUNT, formatPrice, formatShortDate, formatTime };

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
 * Net miktar ("850 g" · "4,2 kg" · "500 ml" · "1,5 L") — BİRİMİYLE birlikte, çünkü sayı tek başına
 * "500 ne?" demektir. Büyük değer üst birime çıkar: 4200 g okunmaz, 0,5 L ise küçük şişeyi süsler.
 */
export function formatNetQuantity(quantity: number, unit: 'g' | 'ml', locale: Locale): string {
  if (unit === 'g') return formatWeight(quantity, locale);
  if (quantity < 1000) return `${formatDecimal(quantity, locale, 0)} ml`;
  return `${formatDecimal(quantity / 1000, locale, Number.isInteger(quantity / 1000) ? 0 : 1)} L`;
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

/**
 * Karşılaştırma fiyatı ("12,90 €/kg" · "18,98 €/L") — raf fiyatının yanında bulunur (98/6/EC).
 * Birim ÇAĞIRANDAN gelir: katı kiloyla, sıvı litreyle kıyaslanır ve ikisini aynı harfle yazmak kıyası bozar.
 */
export function formatComparison(cents: number, unit: 'kg' | 'L', locale: Locale): string {
  return `${formatPrice(cents, locale)}/${unit}`;
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
