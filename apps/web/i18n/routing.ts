import { defineRouting } from 'next-intl/routing';
import { DEFAULT_LOCALE, LOCALES, PATHNAMES } from '@lezzet/i18n';

/**
 * Müşteri yüzeyi URL locale yönlendirmesi.
 *
 * - `localePrefix: 'always'` → her dil açık önekli (`/fr/…`, `/de/…`, `/tr/…`); simetrik,
 *   SEO_I18N ("her dil ayrı URL") ile hizalı, temiz hreflang. `/` → `/fr`.
 * - `pathnames` → segment kelimeleri YERELLEŞTİRİLİR. **Tablonun kendisi `@lezzet/i18n`'de durur**
 *   çünkü onu bu yüzey dışında `apps/backend` de okuyor (zamanlı işten giden değerlendirme
 *   davetinin bağlantısı). İki kopya olsaydı biri eskir ve giden bağlantı sessizce 404'e düşerdi —
 *   mail gider, tıklanmaz, kimse fark etmez. Yeni rota oraya eklenir, buraya değil.
 *
 * Operasyon yüzeyi (Türkçe, öneksiz) bu yönlendirmenin DIŞINDA — middleware matcher'ında hariç.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
  pathnames: PATHNAMES,
});
