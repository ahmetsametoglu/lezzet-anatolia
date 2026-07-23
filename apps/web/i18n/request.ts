import { getRequestConfig } from 'next-intl/server';
import type { Locale } from '@lezzet/i18n';
import { routing } from './routing';

/**
 * next-intl istek yapılandırması. Arayüz metinleri global DEĞİL — her sayfa kendi
 * colocated JSON'unu yükler; bu yüzden `messages` boştur. Burada yalnız aktif locale
 * çözülür (getLocale/setRequestLocale için).
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = requested && routing.locales.includes(requested as Locale) ? (requested as Locale) : routing.defaultLocale;
  return { locale, messages: {} };
});
