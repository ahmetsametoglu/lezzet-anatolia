import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@lezzet/i18n';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { detectDevice } from '@/lib/device';
import { localeAlternates } from '@/lib/seo/alternates';
import { currentCustomerId } from '@/lib/guard';
import { openDiscoverDeck } from '@/lib/feedback/discover';
import { pointsValueOf } from '@/lib/feedback/points';
import { formatPrice } from '@/lib/storefront/format';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { DiscoverClient } from './discover-client';
import type { Messages } from './discover-types';
import messages from './messages.json';

/**
 * Keşif — aday ürün kaydırma turu (08.7 · 17.3 · DOMAIN §13).
 *
 * **Ziyaretçiye AÇIK.** Kaydırma kimliksiz de sayılır (toplu talep sinyali) ve tur bitince hesap
 * daveti gelir; hesap açılırsa biriken puan geriye dönük yüklenir. Giriş duvarı koymak sinyali de
 * dönüşümü de kaybettirirdi.
 *
 * **Deste SUNUCUDA hazır gelir**, kart başına çağrı yok: kaydırma saniyeler süren bir jest, her
 * kartta ağ beklemek akışı öldürürdü (tasarım §7: "akışı yavaşlatan ek adım konmamalı"). Girişlide
 * daha önce oylanan kartlar hiç gönderilmez.
 *
 * **Kart başına puan AYARDAN okunur** (`points_feedback_candidate`), ekranda sabit değil — tasarımın
 * "+30 puan" çipi bir makettir. Kodlansaydı ayar değiştiği gün ekran sistemin vermeyeceği sayıyı
 * söylerdi (aynı ders: hesap kartındaki eşik ayrışması, 29.07).
 */
interface DiscoverPageProps {
  params: Promise<{ locale: string }>;
  /** Yalnız kampanya etiketleri için (08.9). */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Sayfa TARANIR ama indekslenecek içerik ince: aday ürünler satılık değil ve liste her ziyarette
 * değişiyor. Yine de `alternates` veriliyor — üç dilin aynı sayfa olduğunu söylemek her hâlükârda
 * doğru; `robots`/`sitemap` kararı ayrı (bkz. `sitemap.ts`).
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
  const [device, cards, points] = await Promise.all([
    detectDevice(),
    openDiscoverDeck(locale as Locale, customerId),
    pointsValueOf('feedback_candidate'),
  ]);

  return (
    // Keşif kapalı bir kabuk (tasarım: tam ekran örtü, "X Kapat" sayfanın kendi satırında) —
    // mobilde site başlığı hiç çizilmez, footer yok (kullanıcı kararı 20.08).
    <SiteFrame device={device} locale={locale as Locale} activeNav="discover" mobileChrome="bare" footer="none">
      <DiscoverClient
        t={t}
        locale={locale as Locale}
        device={device}
        cards={cards}
        signedIn={customerId !== null}
        pointsPerCard={points.points}
        // Para karşılığı SUNUCUDA biçimlenir: iki cihaz dalı da aynı cümleyi alsın ve biçimleyici
        // istemciye taşınmasın. Destenin tamamı kazanılırsa ne edeceğini gösterir — davetin
        // somutluğu bu sayıdan geliyor.
        moneyOf={formatPrice(cards.length * points.points * points.centValue, locale as Locale)}
      />
    </SiteFrame>
  );
}
