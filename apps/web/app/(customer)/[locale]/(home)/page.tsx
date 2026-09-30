import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { isStaff } from '@lezzet/domain-core';
import { localizedUrl, type Locale } from '@lezzet/i18n';
import { localeAlternates } from '@/lib/seo/alternates';
import { openGraphOf } from '@/lib/seo/open-graph';
import { LocalBusinessJsonLd } from '@/lib/seo/json-ld';
import { readSessionProfile } from '@/lib/guard';
import { detectDevice } from '@/lib/device';
import { loadHomeView } from '@/lib/storefront/home-view';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { HomeClient } from './home-client';
import type { Messages } from './home-types';
import messages from './messages.json';

interface HomeProps {
  params: Promise<{ locale: string }>;
  /** Yalnız kampanya etiketleri için; sayfanın kendi süzgeci yok. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Arama başlığı kahraman cümlesinden ayrı durur, çünkü tasarım cümlesi değişebilir ama arama başlığı arama sözcükleri taşımalı.
 * Paylaşım görseli yazılmaz: ana sayfanın ayrılmış bir marka görseli yok ve boş `og:image` kartı kırardı.
 */
export async function generateMetadata({ params }: HomeProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const { meta } = messages[locale];
  return {
    title: meta.title,
    description: meta.description,
    alternates: localeAlternates('/', locale),
    openGraph: openGraphOf({ route: '/', locale, title: meta.title, description: meta.description }),
  };
}

/** Vitrin; veri `lib/storefront` kapısından ve cihaz ipucunun seçtiği yüz için okunur. */
export default async function Home({ params, searchParams }: HomeProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  // Kampanya bağlarının en olası indiği yer: UTM burada yakalanır (`lib/analytics/page-view`).
  void recordPageView('/', await searchParams);

  // Personel ana sayfada karşılanmaz, Operasyon'a yönlenir; yalnız kök yönlendirir, vitrini görmek isteyen kataloğa gidebilir.
  const profile = await readSessionProfile();
  if (profile && isStaff(profile.roles)) {
    redirect('/operations');
  }

  const t: Messages = messages[locale];
  // Cihaz ipucu önce: hangi yüzün okunacağını o söyler (istek başlığından, G/Ç yok).
  const device = await detectDevice();
  const view = await loadHomeView(locale as Locale, device);

  return (
    <SiteFrame device={device} locale={locale} activeNav="home">
      {/* İşletme künyesi yalnız ana sayfada: `LocalBusiness` sitenin tamamını tanıtır, her sayfada tekrarlamak aynı beyanı çoğaltırdı. */}
      <LocalBusinessJsonLd url={localizedUrl('/', locale as Locale)} />
      <HomeClient t={t} locale={locale as Locale} view={view} />
    </SiteFrame>
  );
}
