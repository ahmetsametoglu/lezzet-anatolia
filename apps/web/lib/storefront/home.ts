import 'server-only';
import { CategoryImageService, CategoryService, CollectionService, ProductService, serviceDb } from '@lezzet/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Locale } from '@lezzet/i18n';
import { resolveLocalizedText, type Business } from '@lezzet/types';
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
import type { PlaceWarehouses, StorefrontProduct } from '@lezzet/application';
import type { StorefrontCollection, StorefrontHome, StorefrontOffer } from './storefront-types';

/**
 * Anasayfa okuması, vitrinin veri kapısı: sayfa servisi doğrudan çağırmaz, kaynak değişirse yalnız bu dosya değişir. Katalog
 * boşken (seed atılmamış yerel ortam) fixture'a düşülür, gerçek katalog dolunca yedek kendiliğinden devre dışı kalır.
 */

/** Fırsat bandında kaç kart: tasarımda üçlü ızgara, fazlası bandı taşırırdı; bant liste değil tıklatma davetidir. */
const OFFER_LIMIT = 3;

/**
 * Rastgele seçimin çekildiği havuz, emniyet sınırıdır: havuzsuz "ilk üç" hep aynı üç olurdu ve sınırsız havuz bir gün yüz satır
 * çeken ana sayfa demekti.
 */
const OFFER_POOL_LIMIT = 24;

/** Kategori ızgarası — tasarım altılı tek sıra (`repeat(6,1fr)`). Seçim `is_featured`, sıra `sort_order`. */
const HOME_CATEGORY_LIMIT = 6;

/** Koleksiyon bölümü — tasarım ikili ızgara, 16:9 kapak. Havuz büyükse güne göre döner. */
const HOME_COLLECTION_LIMIT = 2;

/**
 * Vitrin seçkisinde kaç kart (tasarımda dörtlü ızgara); seçki tıklatma davetidir, sayfalanmaz ama sabit sınırı vardır. Okuma
 * pakettedir (`readShowcase`), burada web'in sınırı kalır ve boş sepet aynı bandı çizdiği için dışa açıktır.
 */
export const SHOWCASE_LIMIT = 4;

/**
 * Ana sayfanın vitrini iki satırdır (dört sütun × iki satır); boş sepetin bandı tek satırda kalır (`SHOWCASE_LIMIT`), çünkü orada
 * vitrin bir tekliftir. Telefon görünümü seçkiyi kendi içinde dörde indirir.
 */
export const HOME_SHOWCASE_LIMIT = 8;


/** Kartın fırsat hâline geçtiğinin tek ölçütü: motor teklifi kazandırdı → üstü çizili referans var. */
function isOffer(p: StorefrontProduct): p is StorefrontOffer {
  return p.wasCents !== undefined;
}

/**
 * Fırsat bandı, yakın-SKT teklifine açılmış partilerden doğar; teklif sayısı küçük olduğu için zincir sabit maliyetlidir. İndirimin
 * uygulanıp uygulanmadığına motor karar verir, bant boşsa sayfa bölümü kaldırır.
 */
async function readOffers(
  db: SupabaseClient,
  locale: Locale,
  place: PlaceWarehouses,
  viewer: PricingViewer,
): Promise<StorefrontOffer[]> {
  const productIds = await listOfferProductIds(db, place.warehouseId);
  if (!productIds.length) return [];

  const page = await new ProductService(db).listWithRelations({ filters: { ids: productIds, status: 'active' }, limit: OFFER_POOL_LIMIT });
  const context = await loadProductContext(db, page.rows, place, viewer);
  // Havuz ÖNCE süzülür, sonra seçilir: `isOffer` motorun kararıdır (teklif normal fiyatı yenmezse
  // ürün fırsat değildir) ve elenen bir ürünü seçime sokmak, bandın bazı yenilemelerde iki kartla
  // çizilmesi demekti — "üçü rastgele" sözü ancak üçü de gerçek fırsatken tutulur.
  const pool = page.rows.map((p) => toProduct(p, locale, context.get(p.id) ?? EMPTY_PRODUCT_CONTEXT)).filter(isOffer);
  return pickRandom(pool, OFFER_LIMIT);
}

/**
 * Koleksiyon bandı: önce havuz süzülür, güne göre ikisi seçilir ve ürün sayısı yalnız o ikisi için sorulur, maliyet koleksiyon
 * sayısıyla büyümesin diye. Sayaç kataloğun ölçütüyle aynıdır ve ürünü kalmamış koleksiyon banda girmez.
 */
async function readCollections(db: SupabaseClient, locale: Locale, business: Business): Promise<StorefrontCollection[]> {
  const pool = pickFeatured(await new CollectionService(db).list({ activeOnly: true }));
  const chosen = rotateDaily(pool, HOME_COLLECTION_LIMIT);
  if (chosen.length === 0) return [];

  const products = new ProductService(db);
  /* Kampanya okuması yalnız seçilenler içindir; web'in seçimi güne göre döndüğü için kampanyalı bant öne alınmaz, her koleksiyon
     sırası gelince görünür. BEKLEYEN(08.44) */
  const campaigns = await readScopeCampaigns(db, { collectionIds: chosen.map((c) => c.id), business });
  const cards = await Promise.all(
    chosen.map(async (c) => {
      return {
        id: c.id,
        slug: c.slug,
        name: resolveLocalizedText(c.name, locale),
        description: c.description ? resolveLocalizedText(c.description, locale) || null : null,
        image: imageOf(c),
        // Kampanya kartın YANINDA duyurulur, fiyatta değil (künye `lib/storefront/campaign-note`).
        campaign: campaigns.byCollection.get(c.id) ?? null,
        // Sayaç kataloğun ölçütüyle aynıdır, üye ve aktif: kartın sayısı tıklanınca açılan listenin sayısıdır, pasif ürün de üyedir.
        productCount: await products.countMatching({ collectionId: c.id, status: 'active' }),
      };
    }),
  );
  return cards.filter((c) => c.productCount > 0);
}

/** Anasayfanın tüm bölümleri tek turda — bölüm başına ayrı çağrı yapılmaz. */
/**
 * `place` ve `viewer` zorunlu ve varsayılansızdır: unutan çağrı derlenip sessizce depo üstü ya da perakende okurdu; yer bilinmiyorsa
 * okuma işin depo üstü toplamına düşer. İkisi de çağırandan gelir, çünkü çözümleri çerez okur.
 */
export async function getHomeData(locale: Locale, place: PlaceWarehouses, viewer: PricingViewer): Promise<StorefrontHome> {
  const db = serviceDb();
  const [categoryRows, featured, offers, packages, collections, recipes] = await Promise.all([
    new CategoryService(db).list({ activeOnly: true }),
    // Vitrin seçkisi boş sepetle paylaşılır; tek kaynak `readShowcase`.
    readShowcase(db, locale, place, viewer, { limit: HOME_SHOWCASE_LIMIT }),
    readOffers(db, locale, place, viewer),
    // Yer paket bandına da geçer: kart yol işaretini ancak yeri bilirse basabilir.
    listStorefrontPackages(locale, HOME_PACKAGE_LIMIT, place),
    readCollections(db, locale, place.business),
    // Tarif şeridi liste sayfasının kapısından okunur ve `place`/`viewer` taşır ki ana sayfa tarif sayfasıyla aynı fiyatı bassın.
    listStorefrontRecipes(locale, place, viewer, HOME_RECIPE_LIMIT),
  ]);

  // Üç bölüm de vitrine işaretli olanı gösterir ve sınır tasarımın ızgarasıdır (kategori 6, paket 2, koleksiyon 2); kural tek
  // yerdedir (`pickFeatured`).
  const shown = categoryRows.length ? pickFeatured(categoryRows, HOME_CATEGORY_LIMIT) : FIXTURE_CATEGORIES;
  // Fotoğraf havuzu tek turda ve yalnız vitrine çıkanlar için okunur; seçki `pickFeatured`ten sonra gelir, kart başına sorgu yok.
  const products = new ProductService(db);
  const [pools, counts] = await Promise.all([
    new CategoryImageService(db).listByCategories(shown.map((c) => c.id)),
    // Native vitrinin sayacıyla aynı çağrı (`@lezzet/application` catalog/home).
    Promise.all(shown.map((c) => products.countMatching({ categoryId: c.id, status: 'active' }))),
  ]);
  const categories = shown.map((c, i) => ({ ...toCategory(c, locale, pools.get(c.id)), productCount: counts[i] ?? 0 }));

  return { categories, featured, offers, packages, collections, recipes };
}
