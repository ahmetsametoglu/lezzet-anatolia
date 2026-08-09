import { Hono } from 'hono';
import { z } from 'zod';
import { anonDb, CategoryService, serviceDb, UserProfileService } from '@lezzet/database';
import {
  getCatalogData,
  getProductDetail,
  pricingViewerOf,
  toCategory,
  VISITOR,
  type PlaceWarehouses,
  type PricingViewer,
} from '@lezzet/application';
import {
  CatalogCategoryListSchema,
  CatalogPageSchema,
  CatalogProductDetailSchema,
  CatalogSortEnum,
  DEFAULT_PAGE_SIZE,
  KeysetCursorSchema,
  PreferredLanguageEnum,
  type KeysetCursor,
} from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';
import { bearerTokenOf } from './auth';

/**
 * Katalog uçları (21.6) — **oturumsuz gezilir** (02-mimari §4: "oturumsuz kullanım = müşteri
 * gezinmesi"). `router.ts`te `bearerAuth`tan ÖNCE bağlanırlar ve öyle kalırlar: kimliğin
 * değiştirdiği tek şey FİYATTIR, erişim değil. Bearer varsa okunur (B2B/özel fiyat açılır), yoksa
 * ya da geçersizse ziyaretçi fiyatı gösterilir — katalog hiçbir hâlde 401 dönmez.
 *
 * ── BU DOSYA KURAL HESAPLAMAZ ────────────────────────────────────────────────
 * Yaptığı dört şey var: (1) sorgu dizesini orkestrasyonun girdisine çevirmek, (2) isteğe bağlı
 * kimliği çözmek, (3) dönüşü sözleşme şekline indirgemek, (4) zarflamak. Fiyat/stok/teklif/aile/
 * seçki kararlarının HİÇBİRİ burada değil — hepsi `@lezzet/application`ın katalog orkestrasyonunda
 * (`getCatalogData` · `getProductDetail`), yani webin okuduğu kararların TAM AYNISI. Web ile mobil
 * arasında ayrışabilecek tek yer taşımadır ve taşıma da bu dosyanın tamamıdır.
 */

/** Sayfa boyutu tavanı — istemci daha büyüğünü isteyemez (tek istekle katalogu boşaltmak sayfalamayı anlamsız kılar). */
const MAX_PAGE_SIZE = 50;

/**
 * **Yer bağlamı: "BİLİNMİYOR"** — web'in POSTA KODU VERMEMİŞ ziyaretçisiyle birebir aynı hâl.
 *
 * Ölçüldü, varsayılmadı: web depoyu `lezzet.place.v2` çerezinden çözüyor ve çerez yoksa
 * `apps/web/lib/delivery/read-place.ts:66` doğrudan `EMPTY`'ye dönüyor — o da `:50`'de
 * `{ warehouseId: null, shippingWarehouseId: null }` olarak tanımlı. Aynı satır çözülemeyen
 * (`ambiguous`/`unknown`) posta kodunda da geçerli (`:83-85`).
 *
 * Mobilde çerezin karşılığı cihazdaki `onbZip` ama posta kodunu depoya çeviren orkestrasyon
 * (`resolvePlaceByPostalCode` + bölge/depo girdileri + kargo deposu seçimi) HÂLÂ web lib'inde —
 * terfisi 21.6'nın (B) parçası ve yapılmadı (`storefront-types.ts` `PlaceWarehouses` notu).
 * Kopyalanmaz, o yüzden mobil bugün yeri bilmeyen ziyaretçidir.
 *
 * **Bunun ölçülebilir bedeli:** yer bilinmezken teklif TUTARI hiç okunmaz
 * (`product-context.ts` — `warehouseId ? listOfferBatches(…) : []`), yani mobil katalogda
 * yakın-SKT indirimi bugün GÖRÜNMEZ ve `wasCents` hiç dolmaz. Bu bir eksik değil bir SÖZ: teklif
 * bir partiye bağlıdır, parti bir depodadır ve ziyaretçinin adresi oraya düşmeyebilir — indirimli
 * fiyatı gösterip ödemede yükseltmek verilmiş bir sözü bozmak olurdu (web de aynısını yapıyor).
 *
 * BEKLEYEN(21.6): yer çözümü `@lezzet/application`a terfi edince bu sabit, istekten (`postalCode`)
 * çözülen gerçek yere bırakır ve teklifler mobilde de görünür.
 *
 * Dışa verilir: vitrin ucu (`home.ts`) aynı "yer bilinmiyor" hâlinde okur — ikinci tanım açılmaz.
 */
export const UNKNOWN_PLACE: PlaceWarehouses = { warehouseId: null, shippingWarehouseId: null };

/**
 * `locale` ZORUNLU ve varsayılansız.
 *
 * `resolveLocalizedText` dil verilmezse kanonik sıraya (TR → FR → DE) düşer, yani sessizce TÜRKÇE
 * döner — Fransız müşteriye Türkçe ürün adı göndermek "makul varsayılan" değil, gizli bir arıza.
 * Web'de bu soru hiç doğmuyor çünkü dil adresin ilk segmentinde (`/fr/catalog`); mobilde adres yok,
 * dilin geldiği yer uygulamanın kendi seçimi (onboarding 1. adım). Eksikse 400 — cevapsız bırakmak
 * yerine soruyu istemciye geri veriyoruz.
 */
const LocaleSchema = PreferredLanguageEnum;

const ProductQuerySchema = z.object({
  locale: LocaleSchema,
  /** Ad araması — üç dilde birden (`ProductService` SQL'de çözer). */
  q: z.string().trim().min(1).optional(),
  /** Kategori SLUG'ı (dil-bağımsız). Tanınmayan slug 400 alır — bkz. `/products` ucu. */
  category: z.string().trim().min(1).optional(),
  /**
   * Bozuk sıralama değeri hata DEĞİL: istemci ya da kayıtlı bir bağlantı eskimiş olabilir, ve
   * yanlış sıralama listeyi YANLIŞ yapmaz — yalnız beklenenden farklı sıralar. Web de aynı şeyi
   * yapıyor (`catalog/page.tsx` — `CATALOG_SORTS.includes(...) ? ... : 'featured'`).
   *
   * `.catch` verilmemiş değeri de yakalar (zorunluluk ihlali de bir parse hatasıdır), o yüzden
   * ayrıca `.default` yazılmıyor — iki yerde duran aynı varsayılan bir gün ayrışır.
   */
  sort: CatalogSortEnum.catch('featured'),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

/**
 * İmleç TELDE opak bir dize (base64url'lenmiş keyset nesnesi) — saf TAŞIMA adaptörü, kural değil.
 *
 * İstemci imlecin içini bilmez ve bilmemeli: keyset'in `{value,id}` şekli bir uygulama ayrıntısı,
 * yarın değişirse istemci kırılmamalı. Orkestrasyon `KeysetCursor` NESNESİ konuşur; dizeye çeviren
 * ve geri çözen taraf yalnız burasıdır.
 */
function encodeCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/**
 * Bozuk imleç **hata değil, geçersiz bir istek**: eskimiş bir bağlantı ya da elle oynanmış bir
 * parametre. Doğru cevap 400 değil, listeyi BAŞTAN vermek — müşterinin göreceği en anlamlı sonuç o
 * (web'in aynı kararı: `catalog/actions.ts` `safeParse` notu, denetim H3).
 */
function decodeCursor(raw: string | undefined): KeysetCursor | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const cursor = KeysetCursorSchema.safeParse(parsed);
    return cursor.success ? cursor.data : undefined;
  } catch {
    // Base64/JSON çözülemedi — imleç yok sayılır ve liste başa döner. Kayıt DÜŞÜLMEZ: bu bir arıza
    // değil, dışarıdan gelen geçersiz bir değer; her yenilenen eski bağlantı hata defterini şişirirdi.
    return undefined;
  }
}

/**
 * **İSTEĞE BAĞLI KİMLİK** — fiyatın kişiselleşmesi için; erişim için DEĞİL.
 *
 * Üç yol da 200 döner ve üçünün de karşılığı webde var:
 *   · başlık yok            → ziyaretçi (webde çerezsiz gezinme)
 *   · başlık var ama geçersiz/süresi dolmuş → ziyaretçi (webde süresi dolmuş oturum çerezi:
 *     `getSessionUser` null döner, `currentCustomerId` null, fiyat liste fiyatına düşer)
 *   · geçerli token         → müşterinin künyesi (B2B kanalı + müşteriye özel fiyat satırları)
 *
 * Geçersiz token'a 401 vermek katalogu kapatırdı: uygulamanın haftalarca açılmadığı bir cihazda
 * token süresi dolmuş olur ve müşteri vitrini değil bir hata ekranını görürdü. Kayıt da düşülmez —
 * süresi dolmuş token bir arıza değil, oturumun normal sonu.
 *
 * **Auth kimliği ≠ müşteri kimliği** (ölçüldü: `apps/web/lib/guard.ts:70-74` — `currentCustomerId`
 * oturumdaki auth kullanıcısını `UserProfileService.findByAuthUserId` ile profil satırına çevirir,
 * `user_profiles.id` ile `auth.users.id` AYRI kolonlardır). Aynı zincir burada da kurulur; auth
 * kimliğini doğrudan `pricingViewerOf`a vermek profili hiç bulamaz ve her müşteriyi sessizce
 * ziyaretçi fiyatına düşürürdü.
 *
 * Dışa verilir: vitrin ucu (`home.ts`) fırsat fiyatını aynı kimlik zinciriyle kişiselleştirir.
 */
export async function readViewer(db: SupabaseClient, authorization: string | undefined): Promise<PricingViewer> {
  const token = bearerTokenOf(authorization);
  if (!token) return VISITOR;

  const { data, error } = await anonDb().auth.getUser(token);
  if (error || !data.user) return VISITOR;

  const profile = await new UserProfileService(db).findByAuthUserId(data.user.id);
  // Profil yoksa (trigger boşluğu / silinmiş kayıt) `pricingViewerOf` zaten ziyaretçiye düşer.
  return pricingViewerOf(db, profile?.id ?? null);
}

export const catalog = new Hono<AppEnv>();

/**
 * Kategoriler — tek tur, `sort_order` sırasında.
 *
 * Orkestrasyonun kategori kapısı `getCatalogData`nın İÇİNDE (sayfa ikisini birlikte döndürür) ama
 * bu uç oradan geçmez: `getCatalogData` kategorileri getirirken bir ürün SAYFASI + fiyat/stok
 * bağlamı da okur ve bu uç ürün döndürmüyor — uygulama açılışında atılan bu istek için tamamı boşa
 * bir tur olurdu. Kategori listesi zaten kural içermeyen düz bir okumadır; kararın olmadığı yerde
 * orkestrasyon da yoktur. İndirgeme yine de PAYLAŞILIR (`toCategory`, `@lezzet/application`), yani
 * kartın şekli iki uçta ayrışamaz.
 *
 * Web `fixtures.ts` yedeğine düşüyor (katalog tamamen boşken kabuk çizilsin diye); API düşmez: boş
 * liste doğru cevaptır ve uydurma kimliklerle ürün isteyen bir istemci üretmek, boş bir şerit
 * çizmekten pahalıya patlar. `getCatalogData`nın `fallbackCategories` parametresi de bu yüzden
 * çağırana bırakılmıştı — mobil onu bilerek geçirmiyor.
 */
catalog.get('/categories', async (c) => {
  const locale = LocaleSchema.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  // Kategori DOĞAL TAVANLI bir küme (operatör elle kurar) → tek turda, sayfalamasız (`CLAUDE §1`).
  const rows = await new CategoryService(serviceDb()).list({ activeOnly: true });
  const categories = rows.map((row) => toCategory(row, locale.data));
  // Zarf da sözleşmedir: satırlar tek tek değil, zarf bütün hâlinde tek kaynaktan doğrulanır.
  return ok(c, CatalogCategoryListSchema.parse({ categories } satisfies z.input<typeof CatalogCategoryListSchema>));
});

/**
 * Ürün listesi — keyset sayfalama + arama + kategori + sıralama, ticari bağlamıyla birlikte.
 *
 * Fiyat, stok hâli, "tükendi" ve satın alma yolu artık cevapta: hepsi `getCatalogData`'dan gelir,
 * yani web katalogunun okuduğu kararların aynısıdır. Bu uçta hesaplanan tek şey yok.
 *
 * **`total` semantiği değişmedi:** sayaç arama + kategori + durum süzgecini tanır ve bu uç yalnız
 * o üçünü sunar (orkestrasyonun `onlyOffers`/`onlyShippable` süzgeçleri buradan AÇILMADI), yani sayı
 * listeyle tutarlıdır.
 */
catalog.get('/products', async (c) => {
  const parsed = ProductQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return fail(c, parsed.error.issues[0]?.path[0] === 'locale' ? 'invalid_locale' : 'invalid_query', 400);
  }
  const { locale, q, category, sort, limit } = parsed.data;

  const db = serviceDb();
  const viewer = await readViewer(db, c.req.header('authorization'));
  const data = await getCatalogData(db, {
    locale,
    query: { search: q, categorySlug: category, sort, cursor: decodeCursor(parsed.data.cursor) },
    place: UNKNOWN_PLACE,
    viewer,
    limit,
  });

  // **Tanınmayan kategori slug'ı 400 ve bu web'den BİLİNÇLİ bir sapma.** Web slug'ı sessizce yok
  // sayıp süzgeçsiz katalogu gösteriyor, çünkü orada çip görünür durumda: müşteri seçiminin
  // uygulanmadığını ekrandan anlar. HTTP istemcisinde öyle bir geri bildirim yok; sessizce daha
  // GENİŞ bir küme dönmek, süzgecin bir kopyadan düşmesiyle aynı sınıf arıza olurdu.
  //
  // Kontrol SONRADA, çünkü cevabın kendisi kanıttır: `activeCategory` yalnız AKTİF kategoriler
  // arasından çözülür (pasif kategori de tanınmaz). Önden ayrı bir kategori sorgusu atmak, geçerli
  // her istekte bir tur daha demekti — bedelin geçersiz isteğe yüklenmesi doğrusu.
  if (category && !data.activeCategory) return fail(c, 'unknown_category', 400);

  return ok(
    c,
    CatalogPageSchema.parse({
      products: data.products,
      total: data.total,
      nextCursor: data.nextCursor ? encodeCursor(data.nextCursor) : null,
    } satisfies z.input<typeof CatalogPageSchema>),
  );
});

/**
 * Ürün detayı. Aday ve pasif ürün doğrudan bağlantıyla da AÇILMAZ (404): katalogda görünmeyen bir
 * ürünün linkle satılabilir olması `status`'ün taşıdığı kararı boşa çıkarırdı (DOMAIN §13).
 *
 * Sayfanın TÜM bölümleri tek turda gelir — boylar fiyatlarıyla, aile çeşitleri, benzer ürünler,
 * galeri, kategori ve yasal beyan; bölüm başına çağrı yok.
 */
catalog.get('/products/:slug', async (c) => {
  const locale = LocaleSchema.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const db = serviceDb();
  const viewer = await readViewer(db, c.req.header('authorization'));
  const detail = await getProductDetail(db, {
    locale: locale.data,
    slug: c.req.param('slug'),
    place: UNKNOWN_PLACE,
    viewer,
  });
  if (!detail) return fail(c, 'product_not_found', 404);

  // ── SÖZLEŞMENİN KİLİDİ ────────────────────────────────────────────────────
  // Gövde `z.input<…>` ile TİPLENİR, `parse`a `unknown` gibi girmez: orkestrasyonun döndürdüğü
  // `StorefrontProductDetail` sözleşmeye alan alan uymak zorunda ve uymadığı gün burası DERLENMEZ.
  // Bu, `packages/types`ın `@lezzet/helper`a bağlanamaması yüzünden oraya konamayan
  // `satisfies z.ZodType<TextSegment>` kilidinin yerini de tutar — üstelik daha geniş: yalnız
  // metin parçasını değil, ürünün/boyun/ailenin tüm alanlarını çiviler.
  const body: z.input<typeof CatalogProductDetailSchema> = detail;
  return ok(c, CatalogProductDetailSchema.parse(body));
});
