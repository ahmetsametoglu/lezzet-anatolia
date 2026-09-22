import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { fillBrandFacts } from '@lezzet/brand';
import type { AppRoute, Locale } from '@lezzet/i18n';
import { localeAlternates } from '@/lib/seo/alternates';
import { detectDevice } from '@/lib/device';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { routing } from '@/i18n/routing';
import { legalCopy } from './legal-copy';
import { LegalPageClient } from './legal-page-client';
import type { LegalDocument } from './legal-types';
import type { LegalMessages } from './legal-view-types';
import messages from './legal-messages.json';

/** Beş statik sayfanın ortak meta kurucusu; dil geçersizse sayfa zaten `notFound`a düşeceği için boş döner. */
export function legalMetadata(route: AppRoute, locale: string, title: string): Metadata {
  if (!hasLocale(routing.locales, locale)) return {};
  return { title, alternates: localeAlternates(route, locale) };
}

interface LegalPageProps {
  locale: string;
  document: LegalDocument;
}

/** Beş statik sayfanın ortak sunucu kabuğu: dil, cihaz ve çerçeve tek yerde kurulur, sayfaya yalnız belgesini seçmek kalır. */
export async function LegalPage({ locale, document: source }: LegalPageProps) {
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  // Şirket künyesi metinde `{siret}` gibi yer tutucudur; beş sayfa bu kabuktan geçtiği için tek yerde dolar.
  const doc = fillBrandFacts(source);
  const { back, searchPlaceholder, noMatch, notFoundTitle, notFoundCta } = legalCopy(locale);
  const t: LegalMessages = { back, searchPlaceholder, noMatch, notFoundTitle, notFoundCta, ...messages[locale as Locale] };
  const device = await detectDevice();

  return (
    <SiteFrame device={device} locale={locale}>
      <LegalPageClient device={device} document={doc} t={t} />
    </SiteFrame>
  );
}
