import type { Locale } from '@lezzet/i18n';

/*
  Web ve native'in ortak biçimleri burada, çünkü iki yazım aynı tutarı iki türlü gösterir; web yalnız kendine özgü biçimleri
  `lib/storefront/format.ts`te tutar. Simge üç dilde de sayının ardındadır (`75,53 €`), çünkü `Intl` Türkçede simgeyi öne koyar
  ve müşterimiz Fransa'da yaşar.
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

/** Tutarı bilinmeyen satırın değeri: sıfır değil cevapsızlık; `formatPrice`ın yanında durur ki her çağıran kendi işaretini uydurmasın. */
export const UNKNOWN_AMOUNT = '—';

/**
 * Net miktar ("850 g" · "1,25 kg" · "500 ml" · "1,5 L"): 1000 ve üstü üst birime çıkar ve kesir kısaltılmaz, çünkü net miktar
 * ambalajda yazan değerdir; 1250 g'ı "1,3 kg" yazmak 50 g fazla söyler.
 */
export function formatNetQuantity(quantity: number, unit: 'g' | 'ml', locale: Locale): string {
  const [small, large] = unit === 'g' ? ['g', 'kg'] : ['ml', 'L'];
  const number = (value: number) => new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits: 3 }).format(value);
  return quantity < 1000 ? `${number(quantity)} ${small}` : `${number(quantity / 1000)} ${large}`;
}

/**
 * Eşik ve eşleştirme tutarı: tam euroda kuruşsuz (`5 €`), kesirlide kuruşlu (`7,90 €`), çünkü "60 € üzeri kargo ücretsiz"de
 * `60,00 €` olmayan bir hassasiyet iddia eder. Ürün ve sipariş tutarları bununla değil, kuruşuyla `formatPrice` ile yazılır.
 */
export function formatCompactEuro(cents: number, locale: Locale): string {
  const full = formatPrice(cents, locale);
  if (cents % 100 !== 0) return full;
  /* Kuruş kısmını ATIYORUZ, yeniden kurmuyoruz: `formatPrice`in ürettiği dizgede ayraç ve €
     yerleşimi zaten doğru; tek yapılacak "<ayraç>00" parçasını silmek. Ayraç dile göre `,` ya da
     `.` olabildiği için desen ikisini de kabul eder. */
  return full.replace(/[.,]00(?=\D*$)/, '');
}

/**
 * Kısa tarih ("22 Temmuz" · "22 juillet"): kaydı tanıtmak içindir ve yıl yazılmaz, çünkü müşteri kendi siparişini
 * gün ve ayla tanır. Ayın adı kısaltılmaz; "22 Tem" resmî belge tonudur, vitrinin dili değil.
 */
export function formatShortDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: 'numeric', month: 'long' }).format(new Date(iso));
}

/** Gün içindeki saat, yazışma damgası ("18:02"). */
export function formatTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
