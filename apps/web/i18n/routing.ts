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
  },
});
