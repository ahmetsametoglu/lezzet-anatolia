import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { brand, whatsappHref } from '@lezzet/brand';
import type { Locale } from '@lezzet/i18n';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { detectDevice } from '@/lib/device';
import { localeAlternates } from '@/lib/seo/alternates';
import { readB2bApplicant } from '@/lib/b2b/application';
import { readSiteImage } from '@/lib/storefront/site-image';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import professionalsCopy from '@lezzet/i18n/customer/professionals';
import { ProfessionalsClient } from './professionals-client';
import type { Messages } from './professionals-types';
import messages from './messages.json';

/**
 * B2B tanıtımı ve self-servis başvuru (DOMAIN §10): sayfa ziyaretçiye açıktır, kimlik başvurunun sonunda tek kullanımlık kodla kurulur.
 * Toptan fiyat burada hiç geçmez, çünkü onaysız açılan fiyat listesi rakibe açılmış bir listedir.
 */
interface ProfessionalsPageProps {
  params: Promise<{ locale: string }>;
  /** Yalnız kampanya etiketleri için: B2B kampanyası doğrudan buraya iner. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: ProfessionalsPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t: Messages = messages[locale];
  return { title: t.meta.title, description: t.meta.description, alternates: localeAlternates('/professionals', locale) };
}

export default async function ProfessionalsPage({ params, searchParams }: ProfessionalsPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/professionals', await searchParams);

  const t: Messages = messages[locale];
  const [device, applicant, hero] = await Promise.all([
    detectDevice(),
    readB2bApplicant(locale as Locale),
    readSiteImage('professionals_hero', locale as Locale),
  ]);

  return (
    <SiteFrame device={device} locale={locale as Locale} activeNav="pro">
      <ProfessionalsClient
        t={t}
        copy={professionalsCopy[locale]}
        locale={locale as Locale}
        device={device}
        // Girişsiz ziyaretçide durum daima "hiç başvurulmadı": kimliği olmayanın başvurusu da yok.
        status={applicant?.status ?? 'none'}
        // Gerekçe yalnız gerçekten varsa taşınır ki ekran boş bir kutu çizmesin.
        rejection={applicant?.rejectReason ? { reason: applicant.rejectReason, translated: applicant.rejectReasonTranslated } : null}
        signedIn={applicant !== null}
        defaults={{
          contactName: applicant?.contactName ?? '',
          email: applicant?.email ?? '',
          phone: applicant?.phone ?? '',
        }}
        whatsappHref={whatsappHref()}
        whatsappNumber={brand.contact.phoneDisplay}
        hero={hero}
      />
    </SiteFrame>
  );
}
