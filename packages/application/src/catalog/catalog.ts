import { CategoryImageService, CategoryService, CollectionService, ProductListingService, ProductService } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE, resolveLocalizedText } from '@lezzet/types';
import type { CatalogSort, KeysetCursor, PreferredLanguage } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { campaignsByProduct, readScopeCampaigns, type ScopeCampaign, type ScopeCampaigns } from './campaign';
import { listOfferProductIds, listStockedProductIds, loadProductContext } from './product-context';
import type { PricingViewer } from './pricing-viewer';
import { EMPTY_PRODUCT_CONTEXT, imageOf, toCategory, toProduct, type CatalogCategoryRow } from './map';
import type { PlaceWarehouses, StorefrontCatalog, StorefrontCollectionHead } from './storefront-types';

/**
 * Katalog okuması: süzme ve keyset sayfalama sunucuda, SQL'de çözülür. Fiyat sıralaması okuma görünümünden gelir, çünkü
 * uygulanabilir fiyat ayrı tabloda bir seçimdir ve sayfa çekildikten sonra sıralamak keyset sayfalamayı bozardı.
 */

export interface CatalogQuery {
  /** Kategori slug'ı — dil-bağımsız, içerikten türer. */
  categorySlug?: string;
  /**
   * Koleksiyon slug'ı, katalogun editoryal kesiti. Kategoriyle birlikte verilirse ikisi kesişir, çünkü "koleksiyonun tatlıları"
   * anlamlı bir sorudur.
   */
  collectionSlug?: string;
  search?: string;
  sort?: CatalogSort;
  /** "Yalnız indirimliler" — açık teklifi olan ürünlere daraltır (DOMAIN §5). */
  onlyOffers?: boolean;
  /**
   * Yalnız `place.warehouseId` deposunda fiilen duran mal; varsayılan kapalı, çünkü vitrinin kuralı süzmek değil işaretlemektir.
   * Açan tek yüzey kuryenin yerinde satışıdır: araç bir vitrin değil, yüktür.
   */
  onlyStockedHere?: boolean;
  /**
   * Kimlik listesine daraltır ve öteki daraltmalarla kesişir; barkod okutma ürünün tam kartını buradan alır ki aynı ürün iki ekranda
   * iki fiyatla görünmesin. Boş dizi "hiçbiri"dir ve erken çıkışa gider, `undefined` süzgeç yok demektir.
   */
  productIds?: readonly string[];
  /**
   * Yalnız kargolanabilenler ("adresime gönderilebilir" çipi). Çip varsayılan kapalıdır, çünkü katalogu kendiliğinden küçültmek
   * müşteriye sormadan onun yerine seçim yapmak olurdu.
   */
  onlyShippable?: boolean;
  cursor?: KeysetCursor;
}

export interface CatalogInput {
  locale: PreferredLanguage;
  query?: CatalogQuery;
  /**
   * Müşterinin yerinden çözülen depolar; zorunlu ve varsayılansız, çünkü argümanı unutan çağrı derlenip sessizce depo-üstü okurdu.
   * `warehouseId: null` meşrudur: yer bilinmiyor, okuma depo-üstüne düşer ve "tükendi" ancak hiçbir depoda olmamaktır.
   */
  place: PlaceWarehouses;
  /**
   * **Kim soruyor** (kanal/onay/kimlik); zorunlu ve `place` ile aynı sebeple ÇAĞIRANDAN gelir:
   * çözümü oturumu/çerezi okur, kapının içine konsaydı bu modül istek bağlamı olmadan
   * çağrılamazdı — testler ve sunucu görevleri dâhil.
   */
  viewer: PricingViewer;
  /**
   * Katalog tamamen boşken gösterilecek yedek kategoriler; karar yüzeyindir, paketin değil. Web seed'siz yerel ortamda kabuğu
   * çizmek için fikstür geçirir, mobil API boş listeyi doğru cevap sayıp geçirmez.
   */
  fallbackCategories?: readonly CatalogCategoryRow[];
  /**
   * Sayfa boyutu (varsayılan `DEFAULT_PAGE_SIZE`). Çağıranın kararıdır, çünkü ilk boyayı küçük sayfayla açmak istemcinin bant
   * genişliği kararıdır ve tavan da taşıma politikası olarak çağıranda durur.
   */
  limit?: number;
  /**
   * Kanalında satılamayan ürünler de gelsin mi; varsayılan hayır, çünkü bayrağı unutan yeni keşif yüzeyi sessizce süzgeçsiz kalırdı.
   * Referans okumalar (destek aracının adla araması) açar ki ürüne "yok" yerine "var ama kanalınızda satışa kapalı" denebilsin;
   * fiyat sıralaması bu kipte yok sayılır, çünkü sıralama anahtarı yalnız görünümde var.
   */
  includeUnsellable?: boolean;
}

/** Ürün kolunun cevabı: kategoriler dışındaki her alan. */
type CatalogProducts = Omit<StorefrontCatalog, 'categories' | 'activeCategory'>;

/** Ürün bulunmayan katalog cevabı — süzgeç hiçbir şeyi getirmediğinde sorgu boşa atılmasın. */
const noProducts = (
  // Koleksiyon boş cevapta da TAŞINIR: başlık bandı ürün listesinden bağımsız — "Bayram · 0 ürün"
  // demek, müşteriyi kimliksiz bir boş sayfada bırakmaktan iyidir.
  activeCollection: StorefrontCatalog['activeCollection'],
  // Kampanya boş cevapta da taşınır: "bu koleksiyonda %15 var ama şu an ürün yok" cümlesi,
  // kampanyayı sessizce yok saymaktan dürüsttür (koleksiyon bandının aynı gerekçesi).
  campaign: StorefrontCatalog['campaign'] = null,
): CatalogProducts => ({
  activeCollection,
  products: [],
  total: 0,
  nextCursor: null,
  campaign,
});

/**
 * Katalog sayfası: kategoriler + süzülmüş/sıralanmış ürünler + toplam + imleç.
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`), `auth/otp` deseni.
 */
export async function getCatalogData(db: SupabaseClient, input: CatalogInput): Promise<StorefrontCatalog> {
  const { locale } = input;
  const categorySlug = input.query?.categorySlug;
  const categoryRows: Promise<readonly CatalogCategoryRow[]> = new CategoryService(db)
    .list({ activeOnly: true })
    .then((rows) => (rows.length ? rows : (input.fallbackCategories ?? [])));
  // Kategori görselleri ile ürün kolu aynı satırlardan beslenir ama birbirini beklemez: sıralı her okuma sayfaya bir ağ turu ekler.
  const [categories, products] = await Promise.all([
    categoryRows.then(async (source) => {
      // Fotoğraf havuzu tek turda okunur, kart başına sorgu yok. Yedek satırlarda (fikstür) kimlikler gerçek değil; havuz boş
      // döner ve kart kapağa düşer.
      const pools = await new CategoryImageService(db).listByCategories(source.map((c) => c.id));
      return source.map((c) => toCategory(c, locale, pools.get(c.id)));
    }),
    readCatalogProducts(db, input, categoryRows),
  ]);
  return { categories, activeCategory: categorySlug ? (categories.find((c) => c.slug === categorySlug) ?? null) : null, ...products };
}

/** Katalogun ürün kolu: süzgeçler, sayfa, sayaç, fiyat/stok bağlamı ve kampanya. Kategori satırlarını yalnız kategori süzgeci varsa bekler. */
async function readCatalogProducts(
  db: SupabaseClient,
  input: CatalogInput,
  categoryRows: Promise<readonly CatalogCategoryRow[]>,
): Promise<CatalogProducts> {
  const { locale, place, viewer } = input;
  const q = input.query ?? {};
  const limit = input.limit ?? DEFAULT_PAGE_SIZE;

  // "Yalnız indirimliler" kimliklere çözülüp sorguya girer, çünkü sayfa çekildikten sonra elemek keyset'i ve toplamı bozardı. Boş
  // küme erken döner: `ids: []` PostgREST'e "hiçbiri" diye gitmez, süzgeç düşer ve tüm katalog gelirdi.
  /* İki daraltma da kimliğe çözülür ve kesişimi burada alınır. `onlyStockedHere` yer bilinmezken boş kümedir: "burada duran mal"
     sorusunun deposuz cevabı yok ve tüm katalogu döndürmek yanlış cevap olurdu. */
  const [activeCategory, activeCollection, ...idSets] = await Promise.all([
    q.categorySlug ? categoryRows.then((rows) => rows.find((c) => c.slug === q.categorySlug) ?? null) : Promise.resolve(null),
    // Koleksiyon slug'dan çözülür (kategoriyle aynı sözleşme: dil-bağımsız, paylaşılabilir URL); slug yoksa sorgu hiç atılmaz.
    q.collectionSlug ? readCollectionHead(db, q.collectionSlug, locale) : Promise.resolve(null),
    Promise.resolve(q.productIds === undefined ? null : [...q.productIds]),
    q.onlyOffers ? listOfferProductIds(db, place.warehouseId) : Promise.resolve(null),
    q.onlyStockedHere
      ? place.warehouseId === null
        ? Promise.resolve<string[]>([])
        : listStockedProductIds(db, place.warehouseId)
      : Promise.resolve(null),
  ]);
  const applied = idSets.filter((set): set is string[] => set !== null);
  const ids =
    applied.length === 0
      ? undefined
      : applied.reduce((left, right) => left.filter((id) => right.includes(id)));
  /* Ürünsüz erken çıkış da kesitin kampanyasını söyler, çünkü "hiç ürün yok" da bir cevaptır. Ana yol kampanyayı sayfa kimlikleriyle
     birlikte okur; her istekte iki yoldan yalnız biri koşar. */
  if (ids && !ids.length) {
    const only = await readScopeCampaigns(db, {
      categoryIds: activeCategory ? [activeCategory.id] : [],
      collectionIds: activeCollection ? [activeCollection.id] : [],
      business: place.business,
    });
    return noProducts(activeCollection, sectionCampaignOf(only, activeCategory, activeCollection));
  }

  // Aday ürün katalogda GÖRÜNMEZ (`musteri-katalog.md §6`) — `status: 'active'` bunu sağlar.
  const filters = {
    query: q.search,
    categoryId: activeCategory?.id,
    status: 'active' as const,
    ids,
    // Koleksiyon üyeliği sorgunun kendi süzgecidir (koşullu `!inner`); kategoriyle birlikte açıkken kesişimi sorgu AND'ler. Elle
    // kesişim hem ek tur atar hem de bir süzgecin ötekini ezmesi riskini taşır.
    collectionId: activeCollection?.id,
    onlyShippable: q.onlyShippable,
  };
  const listing = new ProductListingService(db);
  /* Liste, fiyat sıralaması ve sayaç aynı görünümden ve aynı kapsam nesnesinden okunur; ayrı kaynaklar aynı katalogda süzülmüş ve
     süzülmemiş iki küme gösterirdi. Kapsam çağırandan gelen `place` ve `viewer`dan türer. */
  const scope = { warehouseId: place.warehouseId, channel: viewer.channel };
  const direction = q.sort === 'priceAsc' ? 'asc' : q.sort === 'priceDesc' ? 'desc' : null;
  /* Referans kipi (`includeUnsellable`) ham `product` tablosundan okur, çünkü görünüm satılamayanı hiç üretmiyor. Süzgeç ve
     projeksiyon ortaktır (`buildProductQuery` · `productSelect`); ayrışan tek şey satırların kaynağı. */
  const referans = input.includeUnsellable === true;
  const products = referans ? new ProductService(db) : null;
  const [page, total] = await Promise.all([
    products
      ? products.listWithRelations({ filters, cursor: q.cursor, limit })
      : direction
        ? listing.listByPrice({ filters, cursor: q.cursor, limit, direction, ...scope })
        : listing.list({ filters, cursor: q.cursor, limit, ...scope }),
    // Sayaç `countMatching`tir, `counts` değil: `counts` operasyon RPC'sidir ve süzgeçlerin yalnız dördünü iletir; `ids`,
    // `onlyShippable` ve `collectionId` sessizce düşerdi. Sayaç da görünümden okunur, ham tabloyu saymak süzülen listenin yanına
    // süzülmemiş bir sayı yazardı.
    products ? products.countMatching(filters) : listing.countMatching(filters, scope),
  ]);
  /* Kampanya tek okumayla hem etkin kesite hem karışık listedeki kartlara cevap verir; ek sorgu doğmaz, çünkü satırlar `categoryId`
     ve `collections[]` taşıyor. `loadProductContext` ile paralel koşar, ikisi birbirini beklemez. */
  const [context, scopeCampaigns] = await Promise.all([
    loadProductContext(db, page.rows, place, viewer),
    readScopeCampaigns(db, {
      categoryIds: [
        ...(activeCategory ? [activeCategory.id] : []),
        ...page.rows.flatMap((p) => (p.categoryId === null ? [] : [p.categoryId])),
      ],
      collectionIds: [
        ...(activeCollection ? [activeCollection.id] : []),
        ...page.rows.flatMap((p) => p.collections.map((c) => c.collectionId)),
      ],
      business: place.business,
    }),
  ]);
  /* Kesit başlığı kampanyayı zaten söylüyorsa kartta tekrarlanmaz: kategori ekranında 40 özdeş rozet rozeti anlamsızlaştırır. */
  const sectionSpeaks = activeCategory !== null || activeCollection !== null;
  const byProduct = sectionSpeaks
    ? new Map<string, ScopeCampaign>()
    : campaignsByProduct(
        scopeCampaigns,
        page.rows,
        new Map(page.rows.map((p) => [p.id, p.collections.map((c) => c.collectionId)])),
      );

  return {
    activeCollection,
    products: page.rows.map((p) =>
      /* Süzgeç karta da iner: liste araçta duran ürünlere daraltılmışken kartın boy sayısı araçta olmayan boyu vaat etmesin. */
      toProduct(p, locale, context.get(p.id) ?? EMPTY_PRODUCT_CONTEXT, byProduct.get(p.id) ?? null, q.onlyStockedHere === true),
    ),
    total,
    nextCursor: page.nextCursor,
    campaign: sectionCampaignOf(scopeCampaigns, activeCategory, activeCollection),
  };
}

/**
 * Etkin kesitin kampanyası — koleksiyon kategoriyi yener (daha dar olan kazanır; müşteri o
 * koleksiyonu seçerek zaten daralttı). İki çağrı yeri var (ürünsüz erken çıkış ve ana yol), kural
 * tek yerde: sıra ikiye yazılsaydı bir gün ayrışır ve aynı kesit iki yolda iki kampanya söylerdi.
 */
function sectionCampaignOf(
  campaigns: ScopeCampaigns,
  activeCategory: { id: string } | null,
  activeCollection: { id: string } | null,
): ScopeCampaign | null {
  return (
    (activeCollection ? campaigns.byCollection.get(activeCollection.id) : undefined) ??
    (activeCategory ? campaigns.byCategory.get(activeCategory.id) : undefined) ??
    null
  );
}

/**
 * Slug'dan koleksiyon künyesi; aktif olmayan koleksiyon `null` döner, çünkü paylaşılmış eski bağlantı operatörün "yayından
 * kaldırdım" kararını aşmamalı. Dışa verilir: `generateMetadata` paylaşım kartı için tüm katalog sayfasını değil, yalnız künyeyi okur.
 */
export async function readCollectionHead(
  db: SupabaseClient,
  slug: string,
  locale: PreferredLanguage,
): Promise<StorefrontCollectionHead | null> {
  const row = (await new CollectionService(db).list({ activeOnly: true })).find((c) => c.slug === slug);
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: resolveLocalizedText(row.name, locale),
    // Açıklama NULLABLE (koleksiyona metin girmek zorunlu değil) — boş dizeye indiriliyor ki
    // okuyan taraf "yok" ile "boş"u ayırt etmek zorunda kalmasın; ikisi de aynı ekranı üretir.
    description: row.description ? resolveLocalizedText(row.description, locale) : '',
    image: imageOf(row),
  };
}
