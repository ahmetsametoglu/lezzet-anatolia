import { defineRouting } from 'next-intl/routing';
import { DEFAULT_LOCALE, LOCALES } from '@lezzet/i18n';

/**
 * Müşteri yüzeyi URL locale yönlendirmesi.
 *
 * - `localePrefix: 'always'` → her dil açık önekli (`/fr/…`, `/de/…`, `/tr/…`); simetrik,
 *   SEO_I18N ("her dil ayrı URL") ile hizalı, temiz hreflang. `/` → `/fr`.
 * - `pathnames` → segment kelimeleri YERELLEŞTİRİLİR: **iç yol** İngilizce (kod; klasör adı),
 *   **dış URL** dile göre çevrilir. Slug içerikten türer (dil-bağımsız), burada değil.
 *   Her yeni rota buraya iç→dil eşlemesiyle eklenir.
 *
 * Operasyon yüzeyi (Türkçe, öneksiz) bu yönlendirmenin DIŞINDA — middleware matcher'ında hariç.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
  pathnames: {
    '/': '/',
    '/login': { fr: '/connexion', de: '/anmelden', tr: '/giris' },
    '/catalog': { fr: '/catalogue', de: '/katalog', tr: '/katalog' },
    // Slug dil-bağımsızdır (içerikten türer) — yalnız segment kelimesi çevrilir. Böylece paylaşılan
    // link hangi dilde açılırsa açılsın aynı ürüne düşer; sosyal/WhatsApp trafiği bu sayfaya gelir.
    '/product/[slug]': { fr: '/produit/[slug]', de: '/produkt/[slug]', tr: '/urun/[slug]' },
    '/cart': { fr: '/panier', de: '/warenkorb', tr: '/sepet' },
    // Paket = "coffret" (FR) · "Paket" (DE) — kart ve menü metinleriyle aynı sözcük.
    '/packages': { fr: '/coffrets', de: '/pakete', tr: '/paketler' },
    '/package/[slug]': { fr: '/coffret/[slug]', de: '/paket/[slug]', tr: '/paket/[slug]' },
    // Sipariş bildirimi maillerinin hedefleri (14.5). Sayfaların kendisi modül 08'de doğar; adres
    // eşlemesi BURADA durur çünkü URL'in tek kaynağı bu tablodur — mail kendi yolunu kurmaz.
    '/orders/[reference]': { fr: '/commandes/[reference]', de: '/bestellungen/[reference]', tr: '/siparislerim/[reference]' },
    '/account/notifications': { fr: '/compte/notifications', de: '/konto/benachrichtigungen', tr: '/hesap/bildirim-tercihleri' },
    '/support': { fr: '/assistance', de: '/anfrage', tr: '/talep' },
  },
});
