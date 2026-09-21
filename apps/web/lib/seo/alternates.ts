import type { Metadata } from 'next';
import { DEFAULT_LOCALE, LOCALES, localizedHref, type AppRoute, type Locale } from '@lezzet/i18n';

/** Bir sayfanın üç dildeki karşılığı — site haritası da aynı bağları buradan alır. */
export function languageAlternates(route: AppRoute, params: Record<string, string> = {}): Record<Locale | 'x-default', string> {
  const languages = Object.fromEntries(LOCALES.map((l) => [l, localizedHref(route, l, params)])) as Record<Locale, string>;
  // `x-default` varsayılan dil: dili eşleşmeyen ziyaretçi Fransızcaya düşer.
  return { ...languages, 'x-default': localizedHref(route, DEFAULT_LOCALE, params) };
}

/**
 * `hreflang` bağları ve canonical. Canonical her dilde kendi adresi: tek dile işaret etseydi öteki
 * dillerin sayfaları kopya ilan edilip indekslenmezdi.
 */
export function localeAlternates(route: AppRoute, locale: Locale, params: Record<string, string> = {}): Metadata['alternates'] {
  return { canonical: localizedHref(route, locale, params), languages: languageAlternates(route, params) };
}
