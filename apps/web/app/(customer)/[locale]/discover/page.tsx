import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@lezzet/i18n';
import { readDiscoverReward } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { detectDevice } from '@/lib/device';
import { localeAlternates } from '@/lib/seo/alternates';
import { currentCustomerId } from '@/lib/guard';
import { openDiscoverDeck } from '@/lib/feedback/discover';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { DiscoverClient } from './discover-client';
import type { Messages } from './discover-types';
import messages from './messages.json';

/**
 * Keşif ziyaretçiye açık: kaydırma kimliksiz de sayılır ve hesap açılırsa puan geriye dönük yüklenir.
 * Deste sunucuda hazır gelir, çünkü kart başına ağ beklemek kaydırma akışını öldürürdü.
 */
interface DiscoverPageProps {
  params: Promise<{ locale: string }>;
  /** Yalnız kampanya etiketleri için. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * İndekslenecek içerik ince ama `alternates` yine verilir: üç dilin aynı sayfa olduğu her hâlükârda doğru.
 */
export async function generateMetadata({ params }: DiscoverPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t: Messages = messages[locale];
  return { title: t.meta.title, description: t.meta.description, alternates: localeAlternates('/discover', locale) };
}

export default async function DiscoverPage({ params, searchParams }: DiscoverPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/discover', await searchParams);

  const t: Messages = messages[locale];
  const customerId = await currentCustomerId();
  const [device, cards, reward] = await Promise.all([
    detectDevice(),
    openDiscoverDeck(locale as Locale, customerId),
    readDiscoverReward(serviceDb()),
  ]);

  return (
    // Keşif kapalı bir kabuk: mobilde site başlığı çizilmez, masaüstünde ince başlık; "× Kapat" sayfanın kendi satırında.
    <SiteFrame
      device={device}
      locale={locale as Locale}
      activeNav="discover"
      mobileChrome="bare"
      thinChrome={{ title: t.title, fallback: '/catalog' }}
    >
      <DiscoverClient t={t} locale={locale as Locale} device={device} cards={cards} signedIn={customerId !== null} reward={reward} />
    </SiteFrame>
  );
}
