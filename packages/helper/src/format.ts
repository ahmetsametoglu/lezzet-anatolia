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
