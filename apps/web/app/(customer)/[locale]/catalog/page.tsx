import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { localeAlternates } from '@/lib/seo/alternates';
import { setRequestLocale } from 'next-intl/server';
import { readPlaceMode, readPlaceWarehouses } from '@/lib/delivery/read-place';
import { shippableFilterApplies } from '@/lib/delivery/place-filter';
import { readPricingViewer } from '@/lib/storefront/read-viewer';
import { detectDevice } from '@/lib/device';
import { getCatalogData, readCollectionHead } from '@lezzet/application';
import { openGraphOf } from '@/lib/seo/open-graph';
import { serviceDb } from '@lezzet/database';
import { CATALOG_SORTS, type CatalogSort } from '@lezzet/types';
import { FIXTURE_CATEGORIES } from '@/lib/storefront/fixtures';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordEvent } from '@/lib/analytics/record';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { CatalogClient } from './catalog-client';
import type { Messages } from './catalog-types';
import messages from './messages.json';

interface CatalogPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ category?: string; collection?: string; sort?: string; offers?: string; shippable?: string; q?: string }>;
}

/**
 * Süzgeç durumu URL'de yaşar; süzgeçli hâller yine de ayrı kanonik almaz, `canonical` hep süzgeçsiz
 * katalogu gösterir. Aynı sayfanın görünümleri indekste ayrı tutulsaydı yüzlerce neredeyse-aynı sayfa doğardı.
 */
export async function generateMetadata({ params, searchParams }: CatalogPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const { collection } = await searchParams;

  /**
   * Yalnız koleksiyon hâli kendi paylaşım kartını alır: koleksiyon bağlantısı paylaşılmak için var,
   * kartsız "Katalog" başlığıyla düşerdi. Sorgu yalnız slug varken atılır.
   */
  const head = collection ? await readCollectionHead(serviceDb(), collection, locale) : null;
  const title = head ? `${head.name} · ${messages[locale].title}` : messages[locale].title;

  return {
    title,
    alternates: localeAlternates('/catalog', locale),
    ...(head
      ? {
          openGraph: openGraphOf({
            route: '/catalog',
            locale,
            title: head.name,
            description: head.description || null,
            image: head.image,
            shareFrame: 'band',
          }),
        }
      : {}),
  };
}

export default async function CatalogPage({ params, searchParams }: CatalogPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/catalog', await searchParams);

  const { category, collection, sort, offers, shippable, q } = await searchParams;
  const activeSort: CatalogSort = CATALOG_SORTS.includes(sort as CatalogSort) ? (sort as CatalogSort) : 'featured';
  const onlyOffers = offers === '1';
  // Kargo çipi URL'de yaşar: süzülmüş liste paylaşılabilir ve geri tuşu çalışır (offers ile aynı desen).
  const placeMode = await readPlaceMode();
  const onlyShippable = shippableFilterApplies(shippable === '1', placeMode);

  const t: Messages = messages[locale];
  const [data, device] = await Promise.all([
    getCatalogData(serviceDb(), {
      locale,
      query: { categorySlug: category, collectionSlug: collection, search: q, sort: activeSort, onlyOffers, onlyShippable },
      place: await readPlaceWarehouses(),
      viewer: await readPricingViewer(),
      // Paketin varsayılanı "yedek yok"; web boş katalogda vitrin fikstürünü göstermek için bunu geçirir.
      fallbackCategories: FIXTURE_CATEGORIES,
    }),
    detectDevice(),
  ]);

  /**
   * Arama ve süzgeç boşluğu ayrı raporlanır ki sık gelen süzgeç sinyali seyrek arama sinyalini
   * boğmasın; metin varsa kaynak aramadır. Yalnız ilk sayfa ölçülür, yoksa tek arama kaydırma
   * sayısı kadar sayılırdı.
   */
  const filtered = Boolean(category || onlyOffers || onlyShippable);
  if (q || filtered) {
    void recordEvent(
      {
        type: 'search',
        query: q ?? '',
        resultCount: data.products.length,
        zeroResultKind: data.products.length > 0 ? null : q ? 'search' : 'filter',
      },
      // Kalıbı olay kendisi geçer: render anında kapının `referer` türetimi bir önceki sayfayı gösterir.
      { path: '/catalog' },
    );
  }

  return (
    <SiteFrame device={device} locale={locale} activeNav="catalog" footer="slim">
      <CatalogClient
        t={t}
        locale={locale}
        data={data}
        // `onlyShippable` EFEKTİF değeri taşır (süzgeç gerçekten uygulandı mı), URL'deki ham değeri
        // değil: çipin "seçili" görünmesi ile listenin süzülmüş olması aynı gerçeğe bakmalı.
        active={{ category, collection, sort: activeSort, onlyOffers, onlyShippable }}
        placeMode={placeMode}
        device={device}
        search={q}
      />
    </SiteFrame>
  );
}
