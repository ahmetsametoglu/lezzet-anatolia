import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { readPlaceWarehouses } from '@/lib/delivery/read-place';
import { readPricingViewer } from '@/lib/storefront/read-viewer';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { localizedUrl, type Locale } from '@lezzet/i18n';
import { localeAlternates } from '@/lib/seo/alternates';
import { openGraphOf } from '@/lib/seo/open-graph';
import { titleWithBrand } from '@/lib/seo/title';
import { LocalBusinessJsonLd } from '@/lib/seo/json-ld';
import { getSessionUser } from '@/lib/guard';
import { detectDevice } from '@/lib/device';
import { getHomeData } from '@/lib/storefront/home';
import { readSiteImage } from '@/lib/storefront/site-image';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { HomeClient } from './home-client';
import type { Messages } from './home-types';
import messages from './messages.json';

interface HomeProps {
  params: Promise<{ locale: string }>;
  /** Yalnız kampanya etiketleri için (08.9) — sayfanın kendi süzgeci yok. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Vitrin ana sayfası (08.10). Veri `lib/storefront` KAPISINDAN okunur — servis burada doğrudan
 * çağrılmaz. Kapının arkasındaki kaynaklar değişse de bu sayfa değişmez; kaynakların bugünkü hâli
 * kapının kendi künyesinde yaşar (`storefront-types.ts`), burada tekrarlanmaz — iki yerde tutulan
 * bir durum listesinin biri mutlaka eskir (denetim M-Y2: burada tam olarak o olmuştu).
 */
/**
 * Ana sayfanın başlığı, açıklaması, `hreflang`ı ve paylaşım kartı (08.1).
 *
 * **Kendi başlığı ARTIK VAR.** Önce yalnız `alternates` dönüyordu ve künyesi *"başlık layout'tan
 * gelir"* diyordu — doğruydu ama layout'un verdiği şey çıplak marka adıydı: arama sonucunda
 * "Lezzet Anatolia" yazan, ne sattığını söylemeyen bir satır. Ana sayfa sitenin en çok aranan
 * sayfası ve başlığı NE SATTIĞIMIZI söylemeli.
 *
 * Metin `hero`dan TÜRETİLMEDİ, ayrı duruyor: kahraman başlığı bir tasarım cümlesi ("Anadolu'nun
 * lezzeti, kapınızda") ve yarın değişebilir; arama başlığı ise arama sözcükleri taşımalı.
 * İkisini bağlamak, tasarım değişince SEO'yu sessizce bozmak olurdu.
 *
 * **Görselsiz og bilinçli:** ana sayfanın paylaşım için ayrılmış bir marka görseli yok; kahraman
 * fotoğrafı `image-slot` (`design/BACKLOG §1`). Boş `og:image` kartı kırardı, alan hiç yazılmıyor.
 */
export async function generateMetadata({ params }: HomeProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const { meta } = messages[locale];
  return {
    // Marka eki ELLE: Next `title.template`i kendi segmentine uygulamıyor (`lib/seo/title.ts`).
    title: titleWithBrand(meta.title),
    description: meta.description,
    alternates: localeAlternates('/', locale),
    openGraph: openGraphOf({ route: '/', locale, title: meta.title, description: meta.description }),
  };
}

export default async function Home({ params, searchParams }: HomeProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  // Kampanya bağlarının en olası indiği yer: UTM burada yakalanır (`lib/analytics/page-view`).
  void recordPageView('/', await searchParams);

  // İki-yüzey kuralı: personel ana sayfada karşılanmaz → Operasyon'a. (Vitrini görmek isterse
  // kataloğa doğrudan gidebilir; yalnız kök `/` yönlendirir.)
  const user = await getSessionUser();
  if (user && (await new UserProfileService(serviceDb()).isStaff(user.id))) {
    redirect('/operations');
  }

  const t: Messages = messages[locale];
  const [data, hero, device] = await Promise.all([
    getHomeData(locale, await readPlaceWarehouses(), await readPricingViewer()),
    // Kahraman görseli katalogla AYNI turda okunuyor (`Promise.all`) — ayrı beklenseydi sayfa bir
    // tur daha uzardı ve ikisi arasında hiçbir bağımlılık yok.
    readSiteImage('home_hero', locale as Locale),
    detectDevice(),
  ]);

  return (
    <SiteFrame device={device} locale={locale} activeNav="home">
      {/* İşletme künyesi YALNIZ ana sayfada (08.1): `LocalBusiness` sitenin tamamını tanıtır, her
          sayfada tekrarlamak aynı beyanı çoğaltmak olurdu. */}
      <LocalBusinessJsonLd url={localizedUrl('/', locale as Locale)} />
      <HomeClient t={t} locale={locale as Locale} data={data} hero={hero} device={device} />
    </SiteFrame>
  );
}
