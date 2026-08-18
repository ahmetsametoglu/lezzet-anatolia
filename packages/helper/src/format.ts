import type { Locale } from '@lezzet/i18n';

/*
  PARA GÖSTERİMİ — terfi 21.7: gövde webin `apps/web/lib/storefront/format.ts` `formatPrice`ının
  BİREBİR aynısıdır ve artık tek kaynak burasıdır (02-mimari §3.4: "para/tarih/slug `@lezzet/helper`;
  RN tarafında bunların hiçbiri yeniden yazılmaz"). İki yazımın ayrışması "aynı fiyat webde
  75,53 €, mobilde €75,53" demekti ve o hata bu projede BİR KEZ YAŞANDI (web format.ts künyesi,
  29.07). Mobil buradan tüketiyor; web kopyası 07.08'de SİLİNDİ (denetim, kullanıcı talimatı) —
  webin `lib/storefront/format.ts`i artık buradan yeniden dışa veriyor, 32 çağıranı tek kaynağa
  bağlı. Webin format ailesinin KALANI (tarih/ağırlık/
  UNKNOWN_AMOUNT) bilerek taşınmadı: bugün tek tüketenleri web, ikinci tüketen doğunca teker teker
  aynı yolla iner.

  Mobil sözleşme HAM cent taşır (`CatalogProduct.priceCents`), biçim CİHAZDA kurulur — sunucu
  biçimli metin göndermez: aynı ürün üç dilde üç ayrı yazımla görünür ve dil değişince sunucuya
  sormak gerekirdi.

  Simge SAYININ ARDINDA, üç dilde de: `Intl`in `style:'currency'`si Türkçede simgeyi öne koyar
  (`€75,53`) ama müşterimiz Fransa'da yaşıyor ve tasarımın Türkçe maketlerinde de fiyat "113,20 €"
  yazılı. Ayraçlar dilin (`1.234,50` ⟷ `1 234,50`), elle kurulan tek şey simgenin yeri.
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
 * **Eşik ve eşleştirme tutarı**: tam euroda kuruşsuz (`5 €`), kesirlide kuruşlu (`7,90 €`).
 *
 * `formatPrice` her tutarı iki haneli kuruşla yazar ve FİYAT için doğrusu budur: 1,84 € ile 1,80 €
 * farklı şeylerdir. Ama her tutar bir fiyat değildir — *"500 puan = 5 € kupon"* bir EŞLEŞTİRME,
 * *"60 € üzeri kargo ücretsiz"* bir EŞİKTİR; orada `5,00 €` yazmak olmayan bir hassasiyet iddia
 * eder ve cümleyi ağırlaştırır. Sınır aritmetiktir, zevk değil: `cents % 100`.
 *
 * ÜRÜN ve SİPARİŞ tutarları bununla YAZILMAZ — onlar kuruşuyla, `formatPrice` ile yazılır.
 *
 * Terfi 18.08: gövde `apps/mobile/src/screens/customer-kit/points-value.ts`ten geldi. İkinci
 * tüketen doğdu (ilan edilen teslimat tutarları) ve o tüketen web'de de var — kural mobil bir
 * ekranın içinde kalsaydı web kendi kopyasını yazardı, `formatPrice`ın 29.07'de yaşadığı ayrışmanın
 * aynısı.
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
 * Kısa tarih ("22 Temmuz" · "22 juillet" · "22. Juli") — bir kaydı TANITMAK için, kayıt tutmak için
 * değil. Yıl yazılmaz: müşteri kendi siparişini gün+ay ile zaten tanır, yıl satırı uzatır. Ayın adı
 * kısaltılmaz — "22 Tem" resmî bir belge tonudur, vitrinin dili değil.
 *
 * TERFİ: gövde webin `apps/web/lib/storefront/format.ts`inden BİREBİR geldi; bu dosyanın üstündeki
 * künye "format ailesinin kalanı ikinci tüketen doğunca teker teker aynı yolla iner" diyordu ve o
 * gün bugündür — sipariş bildiriminin verisi `@lezzet/application`a terfi etti (21.21) ve o paket
 * `apps/web`ten import EDEMEZ. Web kopyası buradan yeniden dışa veriliyor; `INTL_LOCALE` tablosunun
 * ikinci bir yazımı doğmadı.
 */
export function formatShortDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: 'numeric', month: 'long' }).format(new Date(iso));
}

/**
 * Gün İÇİNDEKİ saat — yazışma damgası ("18:02").
 *
 * TERFİ (16.08): ikinci tüketen doğdu — talep bildiriminin kurucusu `@lezzet/application`a taşındı
 * (AI ajanının cevabı da mail doğuruyor, 16.5) ve o paket webden import edemez. `formatShortDate`
 * ile aynı yol: web kopyası buradan yeniden dışa veriliyor, `INTL_LOCALE`'in ikinci yazımı yok.
 */
export function formatTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
