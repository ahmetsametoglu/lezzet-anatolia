import { Hono } from 'hono';
import { z } from 'zod';
import { CategoryImageService, CategoryService, serviceDb } from '@lezzet/database';
import {
  getCatalogData,
  getProductDetail,
  pricingViewerFor,
  toCategory,
  toWireCampaign,
  customerBusiness,
  resolvePlaceWarehouses,
  unresolvedPlace,
  type PlaceWarehouses,
  type PricingViewer,
  availabilityOf,
  readPickupOffer,
} from '@lezzet/application';
import { customerBusinessOf } from '@lezzet/domain-core';
import { localizedUrl } from '@lezzet/i18n';
import {
  CatalogCategoryListSchema,
  CatalogPageSchema,
  CatalogProductDetailSchema,
  CatalogSortEnum,
  DEFAULT_PAGE_SIZE,
  CountryEnum,
  PreferredLanguageEnum,
  type Business,
  type Country,
  type UserProfile,
  type Warehouse,
} from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';
import { recordNativeEvent } from '../../lib/analytics';
import { decodeCursor, encodeCursor } from '../../lib/request';
import { optionalCustomerProfile } from './auth';

/**
 * Katalog uçları oturumsuz gezilir: kimliğin değiştirdiği tek şey fiyattır, erişim değil, bu yüzden geçersiz Bearer ziyaretçi
 * fiyatına düşer ve uç 401 dönmez. Kural hesaplanmaz; fiyat, stok, aile ve seçki web'le aynı orkestrasyondan gelir.
 */

/** Sayfa boyutu tavanı — istemci daha büyüğünü isteyemez (tek istekle katalogu boşaltmak sayfalamayı anlamsız kılar). */
const MAX_PAGE_SIZE = 50;

/**
 * İstemci depo kimliği değil posta kodu gönderir ve yer her istekte sunucuda çözülür, çünkü istemcinin yazabildiği bir değer
 * hangi deponun stoğunun gösterileceğini belirleyemez. Kod yoksa ya da çözülemezse yer bilinmiyor bir hâldir, okuma işin depo-üstü
 * toplamına düşer.
 */
export async function readPlace(
  db: SupabaseClient,
  postalCode: string | undefined,
  business: Business,
  country?: Country,
): Promise<PlaceWarehouses> {
  if (postalCode === undefined || postalCode.trim() === '') return unresolvedPlace(business);
  return resolvePlaceWarehouses(db, postalCode, business, country);
}

/**
 * İstemcinin yeri: posta kodu ve seçilen ülke, çünkü aynı kod iki ülkede varsa yer ancak ülkeyle çözülür. Tanınmayan ülke yok sayılır;
 * uydurma bir ülke kodu başka ülkenin deposuna bağlardı.
 */
export function placeQueryOf(c: { req: { query: (name: string) => string | undefined } }): {
  postalCode: string | undefined;
  country: Country | undefined;
} {
  const country = CountryEnum.safeParse(c.req.query('country'));
  return { postalCode: c.req.query('postalCode'), country: country.success ? country.data : undefined };
}

/**
 * Yer + gel-al: seçili depo teklif kapısından (`readPickupOffer` — müşteri izni × gel-al deposu) geçerse yer SEÇİLEN
 * DEPODUR ve kargo dolgusu yoktur; geçmezse seçim yok sayılır, yer posta kodundan çözülür. Katalog, ürün, vitrin, paket ve
 * sepet aynı kapıyı okur ki liste ile detay farklı depodan fiyat ve stok göstermesin.
 */
export async function readPlaceOrPickup(
  db: SupabaseClient,
  opts: { postalCode: string | undefined; country?: Country; pickupWarehouseId: string | undefined; customerId: string | null },
): Promise<{ place: PlaceWarehouses; pickup: Warehouse | null }> {
  const pickup =
    opts.customerId && opts.pickupWarehouseId ? (await readPickupOffer(db, opts.customerId, opts.pickupWarehouseId)).warehouse : null;
  // Yer müşterinin işinin bölgelerinden çözülür, ziyaretçi Lezzet'tir; gel-al deposu teklif kapısından müşterinin işinde gelir.
  const place: PlaceWarehouses = pickup
    ? { warehouseId: pickup.id, shippingWarehouseId: null, business: pickup.business }
    : await readPlace(db, opts.postalCode, await customerBusiness(db, opts.customerId), opts.country);
  return { place, pickup };
}

/**
 * İstemcinin `?shippable=1` demesi yetmez: rota içinde araç her aktif ürünü götürdüğü için süzgeç ulaşabilen ürünleri gizlerdi,
 * yer bilinmiyorsa da "adresime" denecek bir adres yoktur. Süzgeç bu yüzden yalnız rota dışındaki müşteriye (kargo deposu var,
 * rota deposu yok) uygulanır.
 */
function shippableApplies(requested: boolean, place: PlaceWarehouses): boolean {
  return requested && place.warehouseId === null && place.shippingWarehouseId !== null;
}

/**
 * Dil zorunlu ve varsayılansız: `resolveLocalizedText` dil verilmezse kanonik sıraya düşer ve Fransız müşteriye sessizce Türkçe ad
 * dönerdi. Mobilde dil adreste değil uygulamanın seçiminde olduğu için eksikse 400 döner.
 */
const LocaleSchema = PreferredLanguageEnum;

const ProductQuerySchema = z.object({
  locale: LocaleSchema,
  /** Ad araması — üç dilde birden (`ProductService` SQL'de çözer). */
  q: z.string().trim().min(1).optional(),
  /** Kategori slug'ı, dilden bağımsız; tanınmayan slug 400 alır. */
  category: z.string().trim().min(1).optional(),
  /**
   * Koleksiyon slug'ı web'in `?collection=` kelimesiyle aynı; tanınmayan slug 400 alır. Mobilde koleksiyon görünümü kategori
   * çiplerini gizlemediği için ikisi birlikte gelebilir ve sorgu ikisini birlikte uygular.
   */
  collection: z.string().trim().min(1).optional(),
  /**
   * Bozuk sıralama değeri hata değildir: eskimiş bir bağlantı listeyi yanlış yapmaz, yalnız farklı sıralar. `.catch` verilmemiş
   * değeri de yakaladığı için ayrıca `.default` yazılmaz.
   */
  sort: CatalogSortEnum.catch('featured'),
  /**
   * Web'in `?shippable=1` kelimesiyle aynı ad; `1` dışındaki her değer süzgeci kapatır, çünkü bozuk değer listeyi yanlış yapmaz ama
   * 400 istemciyi cevapsız bırakır. Tek başına yetmez: süzgeç yalnız rota dışındaki müşteriye uygulanır (`shippableApplies`).
   */
  shippable: z.literal('1').optional().catch(undefined),
  /** "Sadece indirimliler" web'in `?offers=1` kelimesiyle aynı; teklifli partisi olan ürünleri bırakır. */
  offers: z.literal('1').optional().catch(undefined),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

/**
 * Kimlik fiyatı kişiselleştirir, erişimi açmaz: başlıksız ya da süresi dolmuş token ziyaretçi fiyatı görür. Kimlik zinciri
 * `auth.ts`te tek yerde durur; burada yalnız fiyat künyesine çevrilir ve vitrin ucu da aynı kapıyı kullanır.
 */
export async function readViewer(db: SupabaseClient, authorization: string | undefined): Promise<PricingViewer> {
  // Kimliksizde `pricingViewerFor` zaten `VISITOR` döner — ayrı bir kısa devre ikinci bir karar olurdu.
  return pricingViewerFor(db, await optionalCustomerProfile(db, authorization));
}

/** Yer ve fiyat görüşü aynı profil okumasını bekler; yerin işi profilden, gel-al izni kimlikten okunur. */
async function readPlaceAlongside(
  db: SupabaseClient,
  opts: { postalCode: string | undefined; country?: Country; pickupWarehouseId: string | undefined },
  profile: Promise<UserProfile | null>,
): Promise<PlaceWarehouses> {
  if (!opts.pickupWarehouseId) return readPlace(db, opts.postalCode, customerBusinessOf(await profile), opts.country);
  const { place } = await readPlaceOrPickup(db, { ...opts, customerId: (await profile)?.id ?? null });
  return place;
}

export const catalog = new Hono<AppEnv>();

/**
 * Kategoriler `getCatalogData`dan geçmez, çünkü o ürün sayfası ve fiyat/stok bağlamı da okur ve uygulama açılışında boşa bir tur
 * olurdu; indirgeme yine `toCategory` ile paylaşılır. Boş liste doğru cevaptır, web'in yedek kategori listesine düşülmez.
 */
catalog.get('/categories', async (c) => {
  const locale = LocaleSchema.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  // Kategori DOĞAL TAVANLI bir küme (operatör elle kurar) → tek turda, sayfalamasız (`CLAUDE §1`).
  const db = serviceDb();
  const rows = await new CategoryService(db).list({ activeOnly: true });
  // Kart görseli havuzdan güne göre seçilir; web'le aynı indirgemeden geçtiği için iki yüzey aynı gün aynı kareyi gösterir.
  const pools = await new CategoryImageService(db).listByCategories(rows.map((row) => row.id));
  const categories = rows.map((row) => toCategory(row, locale.data, pools.get(row.id)));
  // Zarf da sözleşmedir: satırlar tek tek değil, zarf bütün hâlinde tek kaynaktan doğrulanır.
  return ok(c, CatalogCategoryListSchema.parse({ categories } satisfies z.input<typeof CatalogCategoryListSchema>));
});

/**
 * Ürün listesi: fiyat, stok hâli ve satın alma yolu `getCatalogData`dan gelir, bu uçta hesaplanmaz. `total` listeyle aynı süzgeç
 * nesnesinden geçer; sayaçtan habersiz eklenen bir süzgeç onu yeniden yanlış yapar.
 */
catalog.get('/products', async (c) => {
  const parsed = ProductQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return fail(c, parsed.error.issues[0]?.path[0] === 'locale' ? 'invalid_locale' : 'invalid_query', 400);
  }
  const { locale, q, category, collection, sort, limit } = parsed.data;

  const db = serviceDb();
  const viewer = await readViewer(db, c.req.header('authorization'));
  const { place } = await readPlaceOrPickup(db, {
    ...placeQueryOf(c),
    pickupWarehouseId: c.req.query('pickupWarehouseId'),
    customerId: viewer.customerId,
  });
  const data = await getCatalogData(db, {
    locale,
    query: {
      search: q,
      categorySlug: category,
      collectionSlug: collection,
      sort,
      // Süzgeç SQL'de çözülür (`ProductService` filtresi), sayfa çekildikten sonra elenmez —
      // eleseydik keyset imleci ve `total` birlikte bozulurdu. İstenmesi yetmez, YERİN de uygun
      // olması gerekir (`shippableApplies` künyesi).
      onlyShippable: shippableApplies(parsed.data.shippable === '1', place),
      onlyOffers: parsed.data.offers === '1',
      cursor: decodeCursor(parsed.data.cursor),
    },
    place,
    viewer,
    limit,
  });

  // Tanınmayan kategori slug'ı 400 alır: web'de çip seçimin uygulanmadığını gösterir, HTTP istemcisinde öyle bir geri bildirim yok.
  // Kontrol cevaptan sonradır, çünkü `activeCategory` yalnız aktif kategorilerden çözülür ve önden sorgu her isteğe bir tur eklerdi.
  if (category && !data.activeCategory) return fail(c, 'unknown_category', 400);
  // Koleksiyon slug'ı da aynı kuralda: sessizce yok saymak müşterinin açtığı kesit yerine tüm kataloğu gösterirdi.
  if (collection && !data.activeCollection) return fail(c, 'unknown_collection', 400);

  /* Arama talep sinyalidir: süzgeçsiz liste ve imleçle gelen sonraki sayfalar sayılmaz, `zeroResultKind` sonucu olmayan aramayı
     süzgeci fazla daraltmaktan ayırır. Sorgu ham geçer; temizlik kapının işidir. */
  const suzgecli = Boolean(category || collection || parsed.data.shippable === '1' || parsed.data.offers === '1');
  if ((q || suzgecli) && parsed.data.cursor === undefined) {
    void recordNativeEvent(
      { db, channel: viewer.channel, customerId: viewer.customerId, place, locale, country: null },
      {
        type: 'search',
        query: q ?? '',
        resultCount: data.products.length,
        zeroResultKind: data.products.length > 0 ? null : q ? 'search' : 'filter',
      },
    );
  }

  return ok(
    c,
    CatalogPageSchema.parse({
      /* Kampanya yoksa alan hiç gönderilmez: boş nesne okuyana "kampanya var ama boş" dedirtirdi. */
      products: data.products.map((p) => ({ ...p, campaign: toWireCampaign(p.campaign, locale) ?? undefined })),
      total: data.total,
      nextCursor: data.nextCursor ? encodeCursor(data.nextCursor) : null,
      /* Ad SUNUCUDA çözülmüş hâlde gidiyor (sözleşme künyesi); `id`/`description` sözleşmede yok,
         o yüzden burada da indirgeniyor — fazlası `parse`ta düşerdi ama düşen alanı göndermek
         okuyanı yanıltır. */
      activeCollection: data.activeCollection ? { slug: data.activeCollection.slug, name: data.activeCollection.name } : null,
      /* Kampanyanın ADI burada çözülür (sözleşme tek dize taşır); `id` gitmez — ekranın kampanyayı
         ayırt etmesi gereken bir yer yok, kimlik yalnız sunucu tarafının işi. */
      campaign: toWireCampaign(data.campaign, locale),
    } satisfies z.input<typeof CatalogPageSchema>),
  );
});

/**
 * Ürün detayı; aday ve pasif ürün doğrudan bağlantıyla da açılmaz (404), yoksa `status` kararı boşa çıkardı (DOMAIN §13). Sayfanın
 * tüm bölümleri tek istekte gelir.
 */
catalog.get('/products/:slug', async (c) => {
  const locale = LocaleSchema.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const db = serviceDb();
  // Kimlik ve ürün birbirini beklemeden okunur; fiyat görüşü ile yer aynı profil okumasından beslenir.
  const profile = optionalCustomerProfile(db, c.req.header('authorization'));
  const viewer = profile.then((row) => pricingViewerFor(db, row));
  const place = readPlaceAlongside(
    db,
    { ...placeQueryOf(c), pickupWarehouseId: c.req.query('pickupWarehouseId') },
    profile,
  );
  const detail = await getProductDetail(db, { locale: locale.data, slug: c.req.param('slug'), place, viewer });
  if (!detail) return fail(c, 'product_not_found', 404);
  const [seenPlace, seenBy] = await Promise.all([place, viewer]);

  /* Ürün görüntülemesi native'de sunucudan atılır, çünkü detay ucu zaten bu istekte çağrılıyor ve istemci atıcısı aynı olayı ikinci
     kez sayardı. Ülke `null` geçer: `readPlace` yalnız depo döndürür, ülkeyi bilen uç onu doldurur. → BEKLEYEN(21.103) */
  void recordNativeEvent(
    { db, channel: seenBy.channel, customerId: seenBy.customerId, place: seenPlace, locale: locale.data, country: null },
    {
      type: 'product_view',
      subjectType: 'product',
      subjectId: detail.id,
      productId: detail.id,
      availability: availabilityOf(detail.variants),
    },
  );

  // Gövde `z.input` ile tiplenir: orkestrasyonun döndürdüğü şekil sözleşmeye alan alan uymazsa burası derlenmez.
  /* Paylaşım adresi burada kurulur, çünkü yol kuralı web rotasınındır ve tek sahibi `localizedUrl`dir. */
  const body: z.input<typeof CatalogProductDetailSchema> = {
    ...detail,
    /* Öneri bandı karışık bir listedir ve üstünde kampanyayı söyleyecek başlık yoktur, rozet bu yüzden kartta gider. */
    similar: detail.similar.map((p) => ({ ...p, campaign: toWireCampaign(p.campaign, locale.data) ?? undefined })),
    shareUrl: localizedUrl('/product/[slug]', locale.data, { slug: detail.slug }),
  };
  return ok(c, CatalogProductDetailSchema.parse(body));
});
