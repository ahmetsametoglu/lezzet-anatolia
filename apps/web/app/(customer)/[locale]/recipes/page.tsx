import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { localeAlternates } from '@/lib/seo/alternates';
import { openGraphOf } from '@/lib/seo/open-graph';
import { detectDevice } from '@/lib/device';
import { readPlaceWarehouses } from '@/lib/delivery/read-place';
import { listStorefrontRecipes } from '@/lib/storefront/recipe';
import { readPricingViewer } from '@/lib/storefront/read-viewer';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { RecipesClient } from './recipes-client';
import type { Messages } from './recipes-types';
import messages from './messages.json';

interface RecipesPageProps {
  params: Promise<{ locale: string }>;
  /** Yalnız kampanya etiketleri için: tarif bağlantısı kampanyadan da gelebilir. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Liste bir seçkidir: süzgeç, arama, sıralama yok. Yer ve persona okunur, çünkü karttaki toplam
 * gerçek fiyattır ve detaydaki, sepetteki sayıyla aynı olmalı.
 */
export async function generateMetadata({ params }: RecipesPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = messages[locale];
  return {
    title: t.title,
    description: t.heroBody,
    alternates: localeAlternates('/recipes', locale),
    // Görselsiz og bilinçli: liste sayfasının kendi görseli yok, kartlardan birini seçmek editoryal
    // bir karar olurdu.
    openGraph: openGraphOf({ route: '/recipes', locale, title: t.title, description: t.heroBody }),
  };
}

export default async function RecipesPage({ params, searchParams }: RecipesPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/recipes', await searchParams);

  const t: Messages = messages[locale];
  const [recipes, device] = await Promise.all([
    listStorefrontRecipes(locale, await readPlaceWarehouses(), await readPricingViewer()),
    detectDevice(),
  ]);

  return (
    <SiteFrame device={device} locale={locale} activeNav="recipes" footer="slim">
      <RecipesClient t={t} locale={locale} recipes={recipes} device={device} />
    </SiteFrame>
  );
}
