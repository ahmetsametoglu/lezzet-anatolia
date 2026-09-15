import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { localizedUrl } from '@lezzet/i18n';
import { localeAlternates } from '@/lib/seo/alternates';
import { openGraphOf } from '@/lib/seo/open-graph';
import { RecipeJsonLd } from '@/lib/seo/json-ld';
import { detectDevice } from '@/lib/device';
import { readPlaceWarehouses } from '@/lib/delivery/read-place';
import { getRecipeDetail } from '@/lib/storefront/recipe';
import { readPricingViewer } from '@/lib/storefront/read-viewer';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { RecipeClient } from './recipe-client';
import type { Messages } from './recipe-types';
import messages from './messages.json';

interface RecipePageProps {
  params: Promise<{ locale: string; slug: string }>;
  /** Yalnız kampanya etiketleri için. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Paylaş düğmesi yok: ölçüm defteri `share` konusunda yalnız `product` ve `bundle` tanıyor, konusu
 * bilinmeyen paylaşım karşılıksız tıklama üretirdi. Yayında olmayan tarif 404 verir.
 */
export async function generateMetadata({ params }: RecipePageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const recipe = await getRecipeDetail(slug, locale, await readPlaceWarehouses(), await readPricingViewer());
  if (!recipe) return {};
  return {
    title: recipe.name,
    ...(recipe.description ? { description: recipe.description } : {}),
    alternates: localeAlternates('/recipe/[slug]', locale, { slug }),
    /**
     * `type: 'article'`: tarif okunan bir içerik, satılan bir şey değil. `description` hep dolu, çünkü
     * üç dilde açıklaması olmayan tarif yayına giremiyor.
     */
    openGraph: openGraphOf({
      route: '/recipe/[slug]',
      locale,
      params: { slug },
      title: recipe.name,
      description: recipe.description,
      image: recipe.image,
      type: 'article',
    }),
  };
}

export default async function RecipePage({ params, searchParams }: RecipePageProps) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t: Messages = messages[locale];
  const [recipe, device] = await Promise.all([
    getRecipeDetail(slug, locale, await readPlaceWarehouses(), await readPricingViewer()),
    detectDevice(),
  ]);
  if (!recipe) notFound();

  /* Ölçüm tarif çözüldükten sonra atılır: görüntüleme hangi tarife bakıldığını söyler ve bulunamayan
     tarif sayılmaz. `path` rota kalıbıdır, kimliğin yeri `subject_id`. */
  void recordPageView('/recipe/[slug]', await searchParams, { subjectType: 'recipe', subjectId: recipe.id });

  return (
    <SiteFrame device={device} locale={locale} activeNav="recipes">
      <RecipeJsonLd recipe={recipe} url={localizedUrl('/recipe/[slug]', locale, { slug })} />
      <RecipeClient t={t} locale={locale} recipe={recipe} device={device} />
    </SiteFrame>
  );
}
