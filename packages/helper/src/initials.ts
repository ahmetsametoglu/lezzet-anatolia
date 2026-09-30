import type { Locale } from '@lezzet/i18n';

/**
 * Hesabın baş harfleri: "Claire Weber" → "CW", adsız hesapta e-postanın ilk harfi. Web ve native aynı yuvarlağı çizer; iki kopya bir
 * gün iki ayrı baş harf üretirdi.
 */
export function initialsOf(name: string, email: string | null | undefined, locale: Locale): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 0 ? parts.slice(0, 2).map((part) => part.charAt(0)) : [email?.charAt(0) || '?'];
  return letters.join('').toLocaleUpperCase(locale);
}
