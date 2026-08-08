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
 * Katalog sayfası (08.10). Süzgeç durumu URL'de yaşar — filtreli liste paylaşılabilir, geri tuşu
 * çalışır, ilk boya sunucudan tam gelir. Veri `lib/storefront/catalog` kapısından okunur; süzme ve
 * sayfalama SQL'de çözülür (keyset), listeye giren ürün sayısı istemci yükünü artırmaz.
 *
 * Çerçeve metinleri (duyuru şeridi, gezinme, arama) anasayfanın `messages.json`'undan gelir:
 * `SiteFrame` her sayfada aynı metni gösterir, kopyalanırsa diller birbirinden kayar.
 */
/**
 * Başlık ve `hreflang` (08.1). Süzgeçli hâlleri AYRI bir kanonik almaz: `canonical` her zaman
 * süzgeçsiz katalogu gösterir (`localeAlternates` sorgu dizesi taşımaz), çünkü "zeytinli börek
 * süzgeçli katalog" ayrı bir sayfa değil, aynı sayfanın bir görünümü — indekste ayrı tutulsaydı
 * yüzlerce neredeyse-aynı sayfa doğardı.
 */
export async function generateMetadata({ params, searchParams }: CatalogPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const { collection } = await searchParams;

  /**
   * **Koleksiyon hâlinin KENDİ paylaşım kartı** (08.26) — ötekilerden ayrılan tek süzgeç bu.
   *
   * Kategori/sıralama/çip hâlleri kart almaz ve almamalı: onlar aynı sayfanın görünümleri, kimse
   * "artan fiyata sıralı katalog" bağlantısını paylaşmaz. Koleksiyon ise **paylaşılmak için var** —
   * "Bayram" bağlantısı WhatsApp'ta dolaşan içeriğin ta kendisi ve kartı adını, açıklamasını ve
   * kapağını göstermeli. Kart yoksa paylaşılan bağlantı "Katalog" başlığıyla düşer, yani
   * koleksiyonun tamamı görünmez olur.
   *
   * Sorgu YALNIZ slug varken atılır; süzgeçsiz katalogun metadata'sı bir sorgu daha ödemez.
   * `canonical` yine süzgeçsiz katalogu gösteriyor (aşağıdaki `localeAlternates`) — koleksiyon
   * ayrı bir sayfa değil, indekste ikinci bir kayıt doğurmamalı.
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
            image: head.image.url,
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
      // Boş katalogda vitrin fikstürü — paket varsayılanı "yedek yok" (mobil ucun kararı); web
      // bugünkü davranışını bu parametreyle korur. Geçirmeyi unutan, boş katalogda boş ekran üretir.
      fallbackCategories: FIXTURE_CATEGORIES,
    }),
    detectDevice(),
  ]);

  /**
   * Arama ve SÜZGEÇ boşluğu (08.9 · `ANALYTICS §4`).
   *
   * **İkisi ayrı raporlanır ve ayrımı burada yapıyoruz:** süzgeç boşluğu SIK bir arayüz sinyalidir
   * (üç çipi üst üste seçen müşteri), arama boşluğu SEYREK bir çeşit sinyali ("müşterinin istediği
   * ama bizde olmayan şey"). Aynı listeye düşerlerse sık olan seyreği boğar ve o liste kullanılamaz
   * hâle gelir.
   *
   * Metin varsa kaynak ARAMADIR — süzgeç de açık olsa: müşterinin yazdığı kelime, tıkladığı çipten
   * daha güçlü bir niyet beyanıdır.
   *
   * **Yalnız ilk sayfa ölçülür.** Sonraki sayfalar `loadMoreCatalogAction`'dan geliyor ve oradan da
   * atsaydık tek arama, kaydırma sayısı kadar sayılırdı.
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
      // Render anında atılan her olay kendi kalıbını geçer (denetim P1): kapının `referer`
      // türetimi bu anda BİR ÖNCEKİ sayfayı gösteriyor.
      { path: '/catalog' },
    );
  }

  return (
    <SiteFrame device={device} locale={locale} activeNav="catalog">
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
