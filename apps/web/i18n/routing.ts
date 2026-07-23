import { defineRouting } from 'next-intl/routing';
import { DEFAULT_LOCALE, LOCALES } from '@lezzet/i18n';

/**
 * Müşteri yüzeyi URL locale yönlendirmesi. `as-needed`: varsayılan (fr) öneksiz
 * (`/connexion`), diğerleri önekli (`/de/connexion`, `/tr/connexion`). Operasyon
 * yüzeyi (Türkçe) bu yönlendirmenin DIŞINDA — middleware matcher'ında hariç.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'as-needed',
});
