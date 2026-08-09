import type { Locale } from '@lezzet/i18n';

/*
  SİPARİŞ EKRANLARININ TARİH DİLİ (21.18).

  ── NEDEN BURADA, `@lezzet/helper`da DEĞİL ──────────────────────────────────
  Gövdeler web'in `apps/web/lib/storefront/format.ts` dosyasındaki karşılıklarının aynısıdır ve
  ORASI hâlâ tek tüketen değil: `packages/helper` künyesi bu durumu açıkça öngörmüş —
  *"webin format ailesinin KALANI (tarih/…) bilerek taşınmadı: bugün tek tüketenleri web, ikinci
  tüketen doğunca teker teker aynı yolla iner."* İkinci tüketen BUGÜN doğdu (bu ekranlar), ama
  terfi web dosyasının da yeniden-dışa-verene çevrilmesini gerektiriyor (`formatPrice`in yolu) ve
  `apps/web` bu şeridin yazma alanı DEĞİL. Aynı kısıtın aynı çözümü `lib/api/me.ts`te de var
  (`Me` tipi şemadan türetildi, terfi raporlandı).

  Yani bu dosya BİLİNEN ve KAYITLI bir borçtur, gizli bir kopya değil: terfi gününde üç fonksiyon
  `@lezzet/helper`a taşınır, buradan silinir, web de oradan okur. Dil tablosu (`INTL_LOCALE`) o gün
  tek kalır — bugün ikinci kez yazılmasının sebebi paketin `formatPrice` dışında tarih bilmemesi.

  ── SUNUCU BİÇİMLİ METİN GÖNDERMEZ ──────────────────────────────────────────
  Sözleşme ham ISO taşır (`placedAt`, `at`, `deliveryDate`) ve biçim CİHAZDA kurulur — aynı tarih
  üç dilde üç ayrı yazımla görünür ve dil değişince sunucuya sormak gerekirdi (`formatPrice`in
  aynı kararı).
*/

/** Dil → `Intl` etiketi. `@lezzet/helper`ın tablosuyla AYNI olmak zorunda (terfi gününde tekleşir). */
const INTL_LOCALE: Record<Locale, string> = { tr: 'tr-TR', fr: 'fr-FR', de: 'de-DE' };

/**
 * Sipariş GEÇMİŞİNİN tarihi — kısa ay + **yıl** ("22 Tem 2026").
 *
 * Yıl web'in kararıdır ve gerekçesi burada da geçerli: liste bir ARŞİVDİR, yıllara yayılır ve
 * yılsız "22 Temmuz" iki farklı siparişi ayırt edemez. Ay kısaltılıyor çünkü kart künyesi tek
 * satırda "22 Tem 2026 · 3 ürün" taşıyor — uzun ay adı dar ekranda taşardı (web'in `compact` dalı).
 */
export function formatOrderDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

/**
 * Zaman çizgisinin damgası — "22 Temmuz, 09:14" (web `formatStamp`in aynı birleşimi).
 *
 * Gün+uzun ay + saat; yıl YOK — çizgi tek siparişin içinde yaşıyor ve o siparişin yılı zaten
 * başlıkta okunuyor.
 */
export function formatStamp(iso: string, locale: Locale): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: 'numeric', month: 'long' }).format(date);
  const time = new Intl.DateTimeFormat(INTL_LOCALE[locale], { hour: '2-digit', minute: '2-digit' }).format(date);
  return `${day}, ${time}`;
}

/**
 * Teslimat günü ("Perşembe, 24 Temmuz") — gün ADI yazılır çünkü müşteri teslimatı haftanın gününe
 * göre planlar, ayın kaçı olduğuna göre değil. Yıl yok: teslimat günleri hep birkaç gün içinde.
 */
export function formatDeliveryDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso));
}
