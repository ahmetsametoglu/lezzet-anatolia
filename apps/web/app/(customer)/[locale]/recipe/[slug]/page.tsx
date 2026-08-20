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
  /** Yalnız kampanya etiketleri için (08.9). */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Tarif detay sayfası (08.24) — "Sofradan Fikirler"in okunan yüzü.
 *
 * **Birincil senaryo arama motoru ve paylaşılan bağlantı:** ziyaretçi buraya siteyi hiç görmeden
 * düşebilir ("mıhlama nasıl yapılır"). Bu yüzden mobilde detay çerçevesi kullanılıyor — ekranın
 * üstü ziyaretçiyi tariflere döndürmeye ayrılıyor (paket detayı emsali).
 *
 * **Paylaş düğmesi YOK ve bu bilinçli:** tasarımın mobil başlığında çizili değil, ayrıca `share`
 * konusu ölçüm defterinin tanıdığı iki türle sınırlı (`product` · `bundle`). Tarif için üçüncü bir
 * tür açmak ölçüm tarafında bir karar ve bu görevin kapsamı değil; konusu bilinmeyen bir paylaşımı
 * çizmek ise defterde karşılığı olmayan tıklama üretirdi (`SiteFrame.share` künyesi).
 *
 * Yayında olmayan tarif 404: taslak bir tarifin doğrudan linkle okunabilmesi, yayın kısıtının
 * (üç dil dolmadan yayın yok — 05.16) taşıdığı kararı boşa çıkarırdı. Kararı okuma veriyor.
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
     * **Paylaşım kartı** (08.1 · `lib/seo/open-graph.ts`) — tarif WhatsApp'ta paylaşılacak şeyin
     * ta kendisi; görselsiz bir tarif bağlantısı, paylaşıldığı grupta hiç tıklanmaz.
     *
     * `type: 'article'` — tarif okunan bir içerik, satılan bir şey değil.
     *
     * `description` burada HEP dolu ve bu bir şans değil, yayın kısıtının sonucu: üç dilde
     * açıklaması olmayan tarif yayına giremiyor (0038). Ürün tarafında aynı güvence yok.
     */
    openGraph: openGraphOf({
      route: '/recipe/[slug]',
      locale,
      params: { slug },
      title: recipe.name,
      description: recipe.description,
      image: recipe.image.url,
      type: 'article',
    }),
  };
}

export default async function RecipePage({ params, searchParams }: RecipePageProps) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/recipe/[slug]', await searchParams);

  const t: Messages = messages[locale];
  const [recipe, device] = await Promise.all([
    getRecipeDetail(slug, locale, await readPlaceWarehouses(), await readPricingViewer()),
    detectDevice(),
  ]);
  if (!recipe) notFound();

  return (
    <SiteFrame
      device={device}
      locale={locale}
      activeNav="recipes"
      mobileChrome="detail"
      footer="slim"
      /* Tarifin mobil düzeninde başka h1 yok (ad yalnız görsel alt metnindeydi) — hero'yu
         FunnelHeader kurar: terracotta eyebrow + tarif adı, fotoğrafın üstünde. */
      detail={{ title: recipe.name, eyebrow: t.eyebrow, fallback: '/recipes' }}
    >
      <RecipeJsonLd recipe={recipe} url={localizedUrl('/recipe/[slug]', locale, { slug })} />
      <RecipeClient t={t} locale={locale} recipe={recipe} device={device} />
    </SiteFrame>
  );
}
