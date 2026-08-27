import 'server-only';
import { CategoryImageService, CategoryService, CollectionService, ProductService, serviceDb } from '@lezzet/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Locale } from '@lezzet/i18n';
import type { PlaceWarehouses } from '@/lib/delivery/place-types';
import { resolveLocalizedText } from '@lezzet/types';
import { FIXTURE_CATEGORIES } from './fixtures';
import {
  imageOf,
  listOfferProductIds,
  loadProductContext,
  readScopeCampaigns,
  readShowcase,
  EMPTY_PRODUCT_CONTEXT,
  toCategory,
  toProduct,
} from '@lezzet/application';
import type { PricingViewer } from './read-viewer';
import { HOME_PACKAGE_LIMIT, listStorefrontPackages } from './packages';
import { HOME_RECIPE_LIMIT, listStorefrontRecipes } from './recipe';
import { pickFeatured, pickRandom, rotateDaily } from './featured';
import type { StorefrontProduct } from '@lezzet/application';
import type { StorefrontCollection, StorefrontHome, StorefrontOffer } from './storefront-types';

/**
 * Anasayfa okuması — vitrinin veri KAPISI (08.10). Sayfa servisi doğrudan çağırmaz, buradan okur.
 *
 * Bugünkü kaynak durumu:
 *   kategoriler · vitrin ürünleri → GERÇEK (`CategoryService`, `ProductService`, R2 görselleri)
 *   fiyat · stok · fırsatlar      → GERÇEK (`PriceService`, `StockService`, `domain-core`)
 *   paketler                      → GERÇEK (05.5 indi; `listStorefrontPackages`, fixture kalktı)
 *
 * Kaynak geldiğinde değişen tek yer bu dosyadır; sayfa ve komponentler bugünkü hâliyle kalır.
 *
 * Katalog boşken (seed atılmamış yerel ortam) fixture'a düşülür — geliştirme sırasında vitrinin
 * görünür kalması için. Gerçek katalog dolunca bu yedek kendiliğinden devre dışı kalır.
 */

/**
 * Fırsat bandında kaç kart — tasarımda üçlü ızgara (`repeat(3,1fr)`), fazlası bandı taşırır.
 *
 * **6'ydı ve künyesi zaten "üçlü ızgara" diyordu** (kullanıcı bulgusu 09.08): sayı ile cümle
 * çelişiyordu ve dördüncü fırsat sessizce ikinci satıra kayıyordu. Bant bir liste değil, tıklatma
 * davetidir (`CLAUDE §1`) — fazlası "Daha fazla gör" bağının arkasında.
 */
const OFFER_LIMIT = 3;

/**
 * Rastgele seçimin çekildiği HAVUZ — emniyet sınırı, sunum kararı değil.
 *
 * Üçü rastgele seçebilmek için önce adayları görmek gerekiyor; havuzsuz "ilk üç" hep aynı üç
 * olurdu. Teklif kümesi yakın-SKT partileriyle sınırlı olduğu için küçük kalır (`home.ts` künyesi:
 * *"teklif sayısı küçük olduğu için zincir sabit maliyetlidir"*), ama sınırsız bırakmak bir gün
 * yüz satır çeken bir ana sayfa demekti.
 */
const OFFER_POOL_LIMIT = 24;

/** Kategori ızgarası — tasarım altılı tek sıra (`repeat(6,1fr)`). Seçim `is_featured`, sıra `sort_order`. */
const HOME_CATEGORY_LIMIT = 6;

/** Koleksiyon bandı — tasarım ikili ızgara, 16:7 kapak. Havuz büyükse güne göre döner. */
const HOME_COLLECTION_LIMIT = 2;

/**
 * Vitrin seçkisinde kaç kart — tasarımda dörtlü ızgara (anasayfa ve boş sepet, ikisinde de 4).
 * Seçki bir LİSTE DEĞİL, tıklatma davetidir: sayfalanmaz ama sabit sınırı vardır (CLAUDE.md §1).
 *
 * **OKUMANIN KENDİSİ ARTIK PAKETTE** (terfi 27.08, kullanıcı kararı): `readShowcase` ölçütüyle
 * (görüntüleme + sepete ekleme sinyali · ayardan gelen pencere · veri yokken katalog yedeği)
 * birlikte `@lezzet/application`a taşındı ve native uygulama da onu okuyor. Mobil kopyalamamıştı —
 * kataloğun ham sırasını alıyordu, yani "seçki" ne haftalık ne seçilmişti (`BEKLEYEN(21.14)`).
 * Buraya kalan tek şey web'in SINIRI: kaç kart çizileceği yüzeyin tasarım kararıdır. Export,
 * çünkü boş sepet de aynı bandı çiziyor (`lib/cart/empty-cart.ts`) ve iki yerde iki sayı yazmak
 * bir gün iki farklı ızgara üretirdi.
 */
export const SHOWCASE_LIMIT = 4;


/** Kartın fırsat hâline geçtiğinin tek ölçütü: motor teklifi kazandırdı → üstü çizili referans var. */
function isOffer(p: StorefrontProduct): p is StorefrontOffer {
  return p.wasCents !== undefined;
}

/**
 * Fırsat bandı — near-expiry teklifine açılmış partilerden doğar (DOMAIN §5). Teklif sayısı küçük
 * olduğu için zincir sabit maliyetlidir; kart başına sorgu yoktur.
 *
 * İndirimin gerçekten uygulanıp uygulanmadığına burada karar VERİLMEZ: `toProduct` fiyatı motora
 * çözdürür, teklif normal fiyatı yenemezse ürün fırsat sayılmaz ve banda girmez. Bant boş kalırsa
 * sayfa bölümü tamamen kaldırır — boş hâl gösterilmez (komponent envanteri K8).
 *
 * **`total` GÖSTERİLENİ DEĞİL, ELDEKİNİ sayar** (09.08): "Daha fazla gör" bağı ancak banda
 * sığmayan fırsat varken çizilir. Gösterilen sayıyı saymak bağı HER ZAMAN çizerdi ve tıklayan
 * müşteri aynı üç ürünü bulurdu — kapı olmayan bir kapı.
 */
async function readOffers(
  db: SupabaseClient,
  locale: Locale,
  place: PlaceWarehouses,
  viewer: PricingViewer,
): Promise<{ shown: StorefrontOffer[]; total: number }> {
  const productIds = await listOfferProductIds(db, place.warehouseId);
  if (!productIds.length) return { shown: [], total: 0 };

  const page = await new ProductService(db).listWithRelations({ filters: { ids: productIds, status: 'active' }, limit: OFFER_POOL_LIMIT });
  const context = await loadProductContext(db, page.rows, place, viewer);
  // Havuz ÖNCE süzülür, sonra seçilir: `isOffer` motorun kararıdır (teklif normal fiyatı yenmezse
  // ürün fırsat değildir) ve elenen bir ürünü seçime sokmak, bandın bazı yenilemelerde iki kartla
  // çizilmesi demekti — "üçü rastgele" sözü ancak üçü de gerçek fırsatken tutulur.
  const pool = page.rows.map((p) => toProduct(p, locale, context.get(p.id) ?? EMPTY_PRODUCT_CONTEXT)).filter(isOffer);
  return { shown: pickRandom(pool, OFFER_LIMIT), total: pool.length };
}

/**
 * **Koleksiyon bandı** (08.26) — kataloğun bir kesitine açılan iki kapı.
 *
 * Sıra bilinçli ve maliyeti belirliyor: önce HAVUZ süzülür (`pickFeatured`), sonra güne göre İKİSİ
 * seçilir, ürün sayısı **yalnız o ikisi için** sorulur. Ters sırada koleksiyon başına bir sayım
 * sorgusu atılırdı ve bandın maliyeti kataloğun koleksiyon sayısıyla büyürdü — iki kart çizen bir
 * bölüm için.
 *
 * **Sayaç kataloğun ölçütüyle AYNI** (`status: 'active'` + aynı `collectionId` süzgeci): kart "9
 * ürün" deyip katalog 4 gösterirse müşteri haklı olarak kandırıldığını düşünür. Üyelik sayısını
 * basmak daha ucuz olurdu ve tam bu yalanı söylerdi.
 *
 * Ürünü kalmamış koleksiyon banda GİRMEZ: tıklanınca boş katalog açan bir kapı, kapı değildir.
 */
async function readCollections(db: SupabaseClient, locale: Locale): Promise<StorefrontCollection[]> {
  const pool = pickFeatured(await new CollectionService(db).list({ activeOnly: true }));
  const chosen = rotateDaily(pool, HOME_COLLECTION_LIMIT);
  if (chosen.length === 0) return [];

  const products = new ProductService(db);
  /* Kampanya okuması SEÇİLENLER için (08.44) — havuzun tamamı için değil: seçim `rotateDaily`nin
     kararı ve bugün kampanyaya göre değişmiyor. **Mobil vitrinde kampanyalı bant ÖNE ALINIYOR,
     web'de alınmıyor** ve bu bilinçli bir fark değil, ölçülmüş bir sıra: web'in seçimi zaten
     GÜNE göre dönüyor (`rotateDaily`), yani mobildeki "rastgele seçim kampanyayı yutabilir"
     arızası burada yok — her koleksiyon sırası gelince görünüyor. Öncelik gerekirse ayrı ölçülür.
     BEKLEYEN(08.44). */
  const campaigns = await readScopeCampaigns(db, { collectionIds: chosen.map((c) => c.id) });
  const cards = await Promise.all(
    chosen.map(async (c) => {
      return {
        id: c.id,
        slug: c.slug,
        name: resolveLocalizedText(c.name, locale),
        image: imageOf(c),
        // Kampanya kartın YANINDA duyurulur, fiyatta değil (künye `lib/storefront/campaign-note`).
        campaign: campaigns.byCollection.get(c.id) ?? null,
        // Sayaç kataloğun ölçütüyle AYNI: üye VE aktif — kartın sayısı, karta tıklayınca açılan
        // listenin sayısıdır. Üyelik sayısını basmak kartı yalancı yapardı (pasif ürün de üyedir).
        // Süzgeç doğrudan `collectionId`: üyeliği önce kimliklere çözen köprü 08.08'de söküldü.
        productCount: await products.countMatching({ collectionId: c.id, status: 'active' }),
      };
    }),
  );
  return cards.filter((c) => c.productCount > 0);
}

/** Anasayfanın tüm bölümleri tek turda — bölüm başına ayrı çağrı yapılmaz. */
/**
 * `warehouseId` — müşterinin yerinden çözülen depo. **Zorunlu ve varsayılansız**: `null` meşru bir
 * değerdir ("yer bilinmiyor", posta kodu zorunlu değil — K1) ama VERİLMESİ zorunludur. Varsayılan
 * bıraksaydık argümanı unutan çağrı derlenir ve sessizce depo-üstü okurdu — `getAvailableMap`'i
 * kurtaran şey (T8) tam olarak parametrenin zorunluluğuydu, aynı disiplin burada da geçerli.
 *
 * `null` → depo-ÜSTÜ okuma: "tükendi" demenin tek dayanağı hiçbir depoda bulunmamasıdır (C3).
 *
 * `viewer` — **kim soruyor** (kanal/onay/kimlik). Aynı gerekçeyle zorunlu ve aynı gerekçeyle
 * ÇAĞIRANDAN gelir: çözümü çerezi okur (`readPricingViewer`), yani okuma kapısının içine konsaydı
 * bu dosya istek bağlamı olmadan çağrılamaz olurdu — testler ve ileride sunucu görevleri dahil.
 * `place` de tam olarak bu yüzden parametre.
 */
export async function getHomeData(locale: Locale, place: PlaceWarehouses, viewer: PricingViewer): Promise<StorefrontHome> {
  const db = serviceDb();
  const [categoryRows, featured, offers, packages, collections, recipes] = await Promise.all([
    new CategoryService(db).list({ activeOnly: true }),
    // Vitrin seçkisi boş sepetle PAYLAŞILIR — tek kaynak (`readShowcase`, artık pakette).
    readShowcase(db, locale, place, viewer, { limit: SHOWCASE_LIMIT }),
    readOffers(db, locale, place, viewer),
    // Yer paket bandına da geçer (19.22): kart yol işaretini ancak yeri bilirse basabilir.
    listStorefrontPackages(locale, HOME_PACKAGE_LIMIT, place),
    readCollections(db, locale),
    // Tarif şeridi LİSTE SAYFASININ kapısından okunur, ikinci bir okuma yazılmadı: aynı kart aynı
    // kuralları taşıyor (tükenen kalem toplamdan düşer, fiyat personaya ve DEPOYA bağlı — 05.16).
    // `place`/`viewer` geçmeseydi ana sayfa yer bilmeden fiyat basardı; kart "6,40 €" derken tarif
    // sayfası başka bir sayı gösterirdi.
    listStorefrontRecipes(locale, place, viewer, HOME_RECIPE_LIMIT),
  ]);

  // **Üç bölümün üçü de VİTRİNE İŞARETLİ olanı gösterir** (08.26). Sınır tasarımın ızgarası:
  // kategori 6 · paket 2 · koleksiyon 2. Kural tek yerde (`pickFeatured`) — ayrı ayrı yazılsaydı
  // biri gün gelip ötekilerden ayrışır ve ayrışma sessiz olurdu.
  const shown = categoryRows.length ? pickFeatured(categoryRows, HOME_CATEGORY_LIMIT) : FIXTURE_CATEGORIES;
  // Fotoğraf havuzu (05.23) TEK turda ve YALNIZ vitrine çıkanlar için: seçki `pickFeatured`ten sonra
  // okunuyor, yoksa on kategorinin havuzu çekilip altısı kullanılırdı. Kart başına sorgu yok.
  const pools = await new CategoryImageService(db).listByCategories(shown.map((c) => c.id));
  const categories = shown.map((c) => toCategory(c, locale, pools.get(c.id)));

  return { categories, featured, offers: offers.shown, offersTotal: offers.total, packages, collections, recipes };
}
