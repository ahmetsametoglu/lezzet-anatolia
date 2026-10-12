import { UNKNOWN_AMOUNT, formatDecimal, formatNetQuantity, formatPrice, formatShortDate, formatTime } from '@lezzet/helper';
import { INTL_LOCALE, type Locale } from '@lezzet/i18n';

/**
 * Vitrin biçimleri — sözleşme HAM cent taşır (`storefront-types`), gösterim burada kurulur; ayrı
 * durması aynı değerin masaüstü ve mobil web dosyasında iki kez biçimlendirilmesini önler.
 *
 * `formatPrice`, `formatDecimal`, `formatNetQuantity`, `formatShortDate`, `formatTime` ve `UNKNOWN_AMOUNT` gövdeleri `@lezzet/helper`da,
 * çünkü web dışında da tüketilirler (native uygulama, `@lezzet/application`); buradan yeniden dışa verilirler ki web çağıranları tek
 * yolu kullansın.
 */
export { UNKNOWN_AMOUNT, formatDecimal, formatNetQuantity, formatPrice, formatShortDate, formatTime };

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
 * Karşılaştırma fiyatı ("12,90 €/kg" · "18,98 €/L") — raf fiyatının yanında bulunur (98/6/EC).
 * Birim ÇAĞIRANDAN gelir: katı kiloyla, sıvı litreyle kıyaslanır ve ikisini aynı harfle yazmak kıyası bozar.
 */
export function formatComparison(cents: number, unit: 'kg' | 'L', locale: Locale): string {
  return `${formatPrice(cents, locale)}/${unit}`;
}

/**
 * Sipariş geçmişinin tarihi; `formatShortDate`ten farkı yıl taşımasıdır, çünkü liste yıllara yayılır ve yılsız tarih iki siparişi
 * ayıramaz. `compact` mobil satırın kısa ay adıdır; tasarım karesi yılsız olsa da yıl yazılır, eski siparişte yılsız tarih yanlıştır.
 */
export function formatOrderDate(iso: string, locale: Locale, compact = false): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: compact ? 'short' : 'long',
    year: 'numeric',
  }).format(new Date(iso));
}
