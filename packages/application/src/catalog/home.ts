import { CategoryService, CollectionService, ProductService } from '@lezzet/database';
import { HomeSchema, resolveLocalizedText } from '@lezzet/types';
import type { Category, Collection, Home, HomeBand, HomeBandKind, ImageMeta, LocalizedText, PreferredLanguage } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { countDiscoverDeck } from '../feedback/discover';
import { EMPTY_SCOPE_CAMPAIGNS, readScopeCampaigns, type ScopeCampaign, type ScopeCampaigns } from './campaign';
import { toWireCampaign } from './campaign-wire';
import { getCatalogData } from './catalog';
import { dailyRng } from './featured';
import { HOME_PACKAGE_LIMIT, HOME_RECIPE_LIMIT, readPackageCards, readRecipeCards } from './ideas';
import { imageOf } from './map';
import type { PricingViewer } from './pricing-viewer';
import { resolvedOrNull } from './resolved-text';
import { readShowcase } from './showcase';
import type { PlaceWarehouses, StorefrontProduct } from './storefront-types';

/**
 * Telefon vitrininin okuma kapısı: native `GET /api/v1/home` ile web telefon görünümü aynı tasarımı çizdiği için veri tarafı
 * pakette tektir. Raylar editoryal seçkidir; sayfalanmaz, sınırları tasarımın ızgarasından gelen sabitlerdir ve istemci büyütemez.
 */

/**
 * Fırsat şeridi yatay kaydırılır; sınırı yerleşim değil açılış maliyeti koyar, çünkü fırsat SKT'si yaklaşan partiden doğar ve
 * sayısı katalogla değil stoğun yaşıyla büyür.
 */
const HOME_OFFER_LIMIT = 10;
/** Seçki rayı yatay kaydırılır; altıdan az kart kaydırılacak bir şey olduğunu belli etmez. */
const HOME_FEATURED_LIMIT = 6;
/** Bant karışımı: 4 kategori + 2 koleksiyon = 6 slot. */
export const HOME_BAND_CATEGORY_COUNT = 4;
export const HOME_BAND_COLLECTION_COUNT = 2;
/** Toplam slot — ayrı bir sabit DEĞİL: iki sayının toplamından türer, üçüncü bir gerçek açılmaz. */
const HOME_BAND_TOTAL = HOME_BAND_CATEGORY_COUNT + HOME_BAND_COLLECTION_COUNT;

/**
 * Rastgelelik dışarıdan gelir ki test tohumlu sayaçla kanıtlayabilsin; üretimde `Math.random` değil gün numarasından türeyen
 * `dailyRng()` geçer. Her yenilemede değişen vitrin sayfa önbelleğini kırar ve aynı müşteriye her açılışta başka bant gösterir.
 */
export type Rng = () => number;

/**
 * Havuzdan `count` farklı öğe seçer; seçilenler havuzdaki sıralarını korur ki koleksiyonların kendi arası `sortOrder`a uysun.
 * Kısmi Fisher–Yates: her aday eşit olasılıkla seçilir, tam karıştırma maliyeti ödenmez.
 */
export function pickRandomDistinct<T>(pool: readonly T[], count: number, rng: Rng): T[] {
  if (count >= pool.length) return [...pool];
  const indices = pool.map((_, i) => i);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (indices.length - i));
    const tmp = indices[i]!;
    indices[i] = indices[j]!;
    indices[j] = tmp;
  }
  return indices
    .slice(0, count)
    .sort((a, b) => a - b)
    .map((i) => pool[i]!);
}

/** `secondary` öğelerini birleşik dizinin rastgele konumlarına yerleştirir; iki dizinin de kendi iç sırası korunur. */
export function interleaveAtRandom<T>(primary: readonly T[], secondary: readonly T[], rng: Rng): T[] {
  const total = primary.length + secondary.length;
  const slots = new Set(
    pickRandomDistinct(
      Array.from({ length: total }, (_, i) => i),
      secondary.length,
      rng,
    ),
  );
  const out: T[] = [];
  let p = 0;
  let s = 0;
  for (let i = 0; i < total; i++) out.push(slots.has(i) ? secondary[s++]! : primary[p++]!);
  return out;
}

/**
 * Bant kaynaklarının seçimi: koleksiyon işaretlilerden rastgele en çok 2, kategori işaretlilerden `sortOrder` sırasıyla toplamı
 * 6'ya tamamlayacak kadar, bulamazsa olduğu kadar. İşaret seçimdir, yedeği yoktur: web masaüstünün `pickFeatured`ı gibi işaretsiz
 * havuza düşmez, işaret yoksa bant da yoktur.
 */
export function selectHomeBandSources<C extends { id: string; isFeatured: boolean }, K extends { id: string; isFeatured: boolean }>(
  categories: readonly C[],
  collections: readonly K[],
  rng: Rng,
  campaigns: ScopeCampaigns = EMPTY_SCOPE_CAMPAIGNS,
): { categories: C[]; collections: K[] } {
  /*
    Kampanyalı koleksiyon seçimin içinde öne alınır: koleksiyonlar rastgele seçildiği ve slot sınırlı olduğu için kampanyalı olan
    o gün hiç görünmeyebilirdi. Kampanyasız günde aynı `rng` aynı sonucu verir.
  */
  const featuredCollections = collections.filter((c) => c.isFeatured);
  const withCampaign = featuredCollections.filter((c) => campaigns.byCollection.has(c.id));
  const withoutCampaign = featuredCollections.filter((c) => !campaigns.byCollection.has(c.id));
  const chosenCollections = [
    ...pickRandomDistinct(withCampaign, HOME_BAND_COLLECTION_COUNT, rng),
    ...pickRandomDistinct(withoutCampaign, HOME_BAND_COLLECTION_COUNT, rng),
  ].slice(0, HOME_BAND_COLLECTION_COUNT);

  // Kategoride sıra OPERATÖRÜN (`sortOrder`) ve öyle kalıyor; kampanyalı olan yalnız öne çekiliyor,
  // kendi içindeki sıra bozulmuyor — iki grup da kaynak sırasını koruyor.
  const featuredCategories = categories.filter((c) => c.isFeatured);
  const chosenCategories = [
    ...featuredCategories.filter((c) => campaigns.byCategory.has(c.id)),
    ...featuredCategories.filter((c) => !campaigns.byCategory.has(c.id)),
  ].slice(0, HOME_BAND_TOTAL - chosenCollections.length);
  return { categories: chosenCategories, collections: chosenCollections };
}

/** Bant kompozisyonunun girdisi — uç küresel listeyi verir; test kendi kurduğu satırları verir. */
interface HomeBandPools {
  /** AKTİF kategoriler, `sortOrder` sırasında (`CategoryService.list`). */
  categories: Category[];
  /** AKTİF koleksiyonlar + üye ürün kimlikleri (`listWithProductIds` — üyelik gömülü, N+1 yok). */
  collections: Array<Collection & { productIds: string[] }>;
}

function toBand(
  kind: HomeBandKind,
  row: { slug: string; name: LocalizedText } & ImageMeta,
  subtitle: LocalizedText | null,
  productCount: number,
  locale: PreferredLanguage,
  campaign: ScopeCampaign | undefined,
): HomeBand {
  return {
    kind,
    slug: row.slug,
    name: resolveLocalizedText(row.name, locale),
    // `null` = yazılmamış; yedek metin UYDURULMAZ (sözleşme künyesi — ada düşmek tekrar üretirdi).
    subtitle: resolvedOrNull(subtitle, locale),
    productCount,
    image: imageOf(row),
    // Çeviri TEK yerde (`campaign-wire`): aynı iş katalog kesitinde ve kartın rozetinde de
    // yapılıyor, üçe yazılsaydı aynı kampanya iki ekranda farklı görünebilirdi.
    campaign: toWireCampaign(campaign, locale),
  };
}

/**
 * Bant karışımını kurar: seç → seçilenler için say → ürünü kalmamış bandı düşür → karıştır; sayım yalnız seçilen ≤6 kayıt için
 * atılır ki maliyet katalogla büyümesin. Sayaç kataloğun ölçütüyle aynıdır (aktif ürün, koleksiyonda aktif üye) ve düşen bandın
 * yerine yenisi sayılmaz.
 */
export async function composeHomeBands(
  db: SupabaseClient,
  locale: PreferredLanguage,
  pools: HomeBandPools,
  professional: boolean,
  rng: Rng = dailyRng(),
): Promise<HomeBand[]> {
  /* Kampanya okuması SEÇİMDEN ÖNCE: seçimin kendisi kampanyalıyı öne alıyor (`selectHomeBandSources`
     künyesi), yani sonradan sorulamaz. Tek okuma — havuzun tamamı için, kimlik başına sorgu yok. */
  const campaigns = await readScopeCampaigns(db, {
    categoryIds: pools.categories.map((c) => c.id),
    collectionIds: pools.collections.map((c) => c.id),
    professional,
  });
  const chosen = selectHomeBandSources(pools.categories, pools.collections, rng, campaigns);

  const products = new ProductService(db);
  const [categoryCounts, collectionCounts] = await Promise.all([
    Promise.all(chosen.categories.map((c) => products.countMatching({ categoryId: c.id, status: 'active' }))),
    Promise.all(
      chosen.collections.map((c) =>
        // Üyesiz koleksiyona sorgu atılmaz: boş `ids` süzgeci "süzgeçsiz" okunurdu (web'in aynı korunması).
        c.productIds.length === 0 ? Promise.resolve(0) : products.countMatching({ ids: c.productIds, status: 'active' }),
      ),
    ),
  ]);

  const categoryBands = chosen.categories
    .map((c, i) => toBand('category', c, c.tagline, categoryCounts[i] ?? 0, locale, campaigns.byCategory.get(c.id)))
    .filter((band) => band.productCount > 0);
  const collectionBands = chosen.collections
    .map((c, i) => toBand('collection', c, c.description, collectionCounts[i] ?? 0, locale, campaigns.byCollection.get(c.id)))
    .filter((band) => band.productCount > 0);

  return interleaveAtRandom(categoryBands, collectionBands, rng);
}

/** Havuzları küresel listeden kurar (2 okuma), kuralı kompozisyona bırakır. */
async function readHomeBands(
  db: SupabaseClient,
  locale: PreferredLanguage,
  professional: boolean,
  rng: Rng = dailyRng(),
): Promise<HomeBand[]> {
  const [categories, collections] = await Promise.all([
    new CategoryService(db).list({ activeOnly: true }),
    new CollectionService(db).listWithProductIds({ activeOnly: true }),
  ]);
  return composeHomeBands(db, locale, { categories, collections }, professional, rng);
}

/** Kartın fırsat hâline geçtiğinin tek ölçütü: motor teklifi kazandırdı → üstü çizili referans var. */
function hasWonOffer(p: StorefrontProduct): p is StorefrontProduct & { wasCents: number } {
  return p.wasCents !== undefined;
}

/**
 * Fırsat kartları paketin katalog kapısından (`getCatalogData` + `onlyOffers`) gelir; teklif normal fiyatı yenmediyse `wasCents`
 * doğmaz ve kart şeride giremez. Yer bilinmezken (`warehouseId: null`) teklif tutarı okunmaz ve dizi boş döner.
 */
async function readHomeOffers(
  db: SupabaseClient,
  locale: PreferredLanguage,
  place: PlaceWarehouses,
  viewer: PricingViewer,
): Promise<Array<StorefrontProduct & { wasCents: number }>> {
  const page = await getCatalogData(db, { locale, query: { onlyOffers: true }, place, viewer, limit: HOME_OFFER_LIMIT });
  return page.products.filter(hasWonOffer);
}

/**
 * Vitrin seçkisi paketin sinyalli okumasından (`readShowcase`) gelir; telefonun kendi kararları sınır ve fırsat elemesidir.
 * Fırsat şeridiyle alt alta duran seçki aynı ürünleri gösterirse ikinci ray seçki değil yankı olur.
 */
async function readHomeFeatured(
  db: SupabaseClient,
  locale: PreferredLanguage,
  place: PlaceWarehouses,
  viewer: PricingViewer,
): Promise<StorefrontProduct[]> {
  return readShowcase(db, locale, place, viewer, { limit: HOME_FEATURED_LIMIT, excludeOffers: true });
}

/**
 * Telefon vitrininin müşteriden bağımsız bölümleri tek turda ve birbirini beklemeden okunur; kimlikli bölümler (selamlama, puan,
 * süren sipariş) kendi okumalarından gelir. Gövde `HomeSchema` ile süzülür ki fazla alan tele sızmasın, şekil uymadığı gün burada
 * patlasın.
 */
export async function readHome(
  db: SupabaseClient,
  locale: PreferredLanguage,
  place: PlaceWarehouses,
  viewer: PricingViewer,
): Promise<Home> {
  const [bands, offers, featured, recipes, packages, discoverCards] = await Promise.all([
    readHomeBands(db, locale, viewer.professional),
    readHomeOffers(db, locale, place, viewer),
    readHomeFeatured(db, locale, place, viewer),
    readRecipeCards(db, locale, HOME_RECIPE_LIMIT),
    // Vitrin yalnız işaretli paketleri taşır. Yer buraya da geçer: vitrindeki paket kartı Fikirler listesindekiyle aynı karttır.
    readPackageCards(db, locale, { featuredOnly: true, limit: HOME_PACKAGE_LIMIT, place }),
    /* Keşif davetinin şartı kalan kart sayısıdır ve desteyi kuran kuraldan sayılır (`countDiscoverDeck`); iki ayrı sayım bir gün
       ayrışır ve vitrin boş çıkan bir tura davet eder. */
    countDiscoverDeck(db, viewer.customerId, viewer.professional),
  ]);

  return HomeSchema.parse({
    bands,
    offers: offers.map((p) => ({ ...p, campaign: toWireCampaign(p.campaign, locale) ?? undefined })),
    featured: featured.map((p) => ({ ...p, campaign: toWireCampaign(p.campaign, locale) ?? undefined })),
    recipes,
    packages,
    discoverCards,
  });
}
