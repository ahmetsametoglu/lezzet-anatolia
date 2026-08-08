import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { localizedUrl } from '@lezzet/i18n';
import { localeAlternates } from '@/lib/seo/alternates';
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
  const url = localizedUrl('/recipe/[slug]', locale, { slug });
  return {
    title: recipe.name,
    ...(recipe.description ? { description: recipe.description } : {}),
    alternates: localeAlternates('/recipe/[slug]', locale, { slug }),
    /**
     * **Paylaşım kartı BAŞTAN var** (denetim eki 08.08, kullanıcı onayı) — ürün sayfalarında og
     * ayrı bir iş olarak bekliyor (`musteri-og-kartlari` talebi), tarifte beklemiyor ve sebebi
     * içeriğin kendisi: tarif WhatsApp'ta paylaşılacak şeyin ta kendisi. Görselsiz bir tarif
     * bağlantısı, paylaşıldığı grupta hiç tıklanmaz.
     *
     * `description` burada HEP dolu ve bu bir şans değil, yayın kısıtının sonucu: üç dilde
     * açıklaması olmayan tarif yayına giremiyor (0038). Ürün tarafında aynı güvence yok.
     *
     * `type: 'article'` — tarif bir ürün değil, okunan bir içerik. `product` demek paylaşımı
     * alışveriş kartı olarak gösterirdi ve fiyat beklentisi doğururdu; tarifin fiyatı yok.
     */
    openGraph: {
      type: 'article',
      title: recipe.name,
      ...(recipe.description ? { description: recipe.description } : {}),
      url,
      locale,
      ...(recipe.image.url ? { images: [recipe.image.url] } : {}),
    },
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
      back={{ label: t.back, href: '/recipes' }}
    >
      <RecipeJsonLd recipe={recipe} url={localizedUrl('/recipe/[slug]', locale, { slug })} />
      <RecipeClient t={t} locale={locale} recipe={recipe} device={device} />
    </SiteFrame>
  );
}
