import { Hono } from 'hono';
import { z } from 'zod';
import { CategoryImageService, CategoryService, serviceDb } from '@lezzet/database';
import {
  getCatalogData,
  getProductDetail,
  pricingViewerOf,
  toCategory,
  resolvePlaceWarehouses,
  UNRESOLVED_PLACE,
  type PlaceWarehouses,
  type PricingViewer,
  availabilityOf,
} from '@lezzet/application';
import { localizedUrl } from '@lezzet/i18n';
import {
  CatalogCategoryListSchema,
  CatalogPageSchema,
  CatalogProductDetailSchema,
  CatalogSortEnum,
  DEFAULT_PAGE_SIZE,
  PreferredLanguageEnum,
} from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';
import { toWireCampaign } from '../../lib/campaign-wire';
import { recordNativeEvent } from '../../lib/analytics';
// İmleç kodlaması `lib/request.ts`te: sipariş listesi ikinci çağıran olunca oraya taşındı (21.18).
import { decodeCursor, encodeCursor } from '../../lib/request';
import { optionalCustomerId } from './auth';

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
 * **YER BAĞLAMI İSTEKTEN ÇÖZÜLÜR (09.08 — eski `BEKLEYEN(21.6)` kapandı).**
 *
 * Eskiden burada `UNKNOWN_PLACE` sabiti vardı ve mobil, yeri hiç bilmeyen bir ziyaretçiydi. Bedeli
 * ölçülmüştü: yer bilinmezken teklif TUTARI hiç okunmaz (`product-context.ts` —
 * `warehouseId ? listOfferBatches(…) : []`), yani yakın-SKT indirimi mobilde GÖRÜNMÜYORDU. Kullanıcı
 * bunu 09.08'de bildirdi: aynı posta kodu (67000) webde üç fırsat gösterirken mobilde hiç
 * göstermiyordu.
 *
 * Çözüm terfi edince (`@lezzet/application.resolvePlaceWarehouses`) sabit kalktı: istemci POSTA
 * KODUNU gönderir, sunucu her istekte yeniden çözer.
 *
 * ── NEDEN KOD, DEPO KİMLİĞİ DEĞİL ────────────────────────────────────────────
 * İstemcinin yazabildiği bir değer hangi deponun stoğunu göstereceğimizi belirleyemez
 * (`place-types.ts` güvenlik sınırı). Gönderilen posta kodu bir SORUDUR, cevabı sunucu verir.
 *
 * ── KOD YOKSA YA DA ÇÖZÜLEMEZSE ──────────────────────────────────────────────
 * `UNRESOLVED_PLACE` (iki `null`) döner ve bu bir hâldir, eksik veri değil: okuma depo-üstüne
 * düşer, "yok" ancak hiçbir depoda yoksa denir (C3). Web'in çerezsiz ziyaretçisiyle birebir aynı
 * davranış (`apps/web/lib/delivery/read-place.ts:50`).
 */
export async function readPlace(db: SupabaseClient, postalCode: string | undefined): Promise<PlaceWarehouses> {
  if (postalCode === undefined || postalCode.trim() === '') return UNRESOLVED_PLACE;
  return resolvePlaceWarehouses(db, postalCode);
}

/**
 * **"Adresime gönderilebilir" süzgeci GERÇEKTEN uygulanacak mı** (21.20).
 *
 * İstemcinin `?shippable=1` demesi yetmez ve bu bir güvenlik değil DOĞRULUK kararı — web'in
 * `shippableFilterApplies`ıyla aynı soru, aynı gerekçe (`apps/web/lib/delivery/place-filter.ts`,
 * kullanıcı bulgusu 08.08). Üç hâl, üç farklı doğru:
 *
 *   rota DIŞI      → yalnız kargolanabilirler o adrese ulaşıyor; süzgeç GERÇEKTEN bir şey yapar.
 *   rota İÇİ       → rota aracı gidiyor, soğuk zincir dâhil her aktif ürün ulaşıyor. Süzgeç burada
 *                    adrese ULAŞABİLEN ürünleri gizlerdi. **Ölçüldü (09.08, canlı uç):** 67000 ile
 *                    `shippable=1` toplamı 114'ten 72'ye düşürüyordu — 42 ürün, hepsi o adrese
 *                    gidebilen soğuk zincir kalemi.
 *   yer BİLİNMİYOR → ortada "adresim" yok; adres olmadan verilen her cevap uydurmadır (CLAUDE §1).
 *
 * Uygulamanın kendi ekranı bu hâllerde çipi zaten çizmiyor (`lib/places/place-view.ts` →
 * `shippableChipVisible`), ama iki kapı web'de de AYRI ve gerekçesi orada yazılı: biri ekranın
 * ("denetim çizilecek mi"), öteki sunucunun ("süzgeç uygulanacak mı") sorusu. Eski bir sürüm ya da
 * uygulama dışı bir istemci sessizce daha DAR bir katalog alamamalı — geri almanın görünür bir
 * yolu olmadan daralan liste, hatanın en kötü türü.
 *
 * Kip iki depo kimliğinden TÜRER, üçüncü bir alan taşınmaz (`PlaceWarehouses` künyesi): `warehouseId`
 * YALNIZ rota deposudur, `shippingWarehouseId` ülkenin kargo çıkışı. İkisi de boşsa yer bilinmiyor.
 */
function shippableApplies(requested: boolean, place: PlaceWarehouses): boolean {
  return requested && place.warehouseId === null && place.shippingWarehouseId !== null;
}

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
   * **Koleksiyon SLUG'ı** (21.64) — web'in URL'siyle AYNI kelime (`?collection=<slug>`,
   * `apps/web/app/(customer)/[locale]/catalog/page.tsx`). Kategoriyle aynı sözleşme: dil-bağımsız,
   * tanınmayan slug 400.
   *
   * Kategoriyle BİRLİKTE gelebilir ve gelmelidir: mobilde koleksiyon görünümü kategori çiplerini
   * gizlemiyor (kullanıcı kararı 16.08 — web'den bilinçli sapma), yani müşteri "Bayram Sofrası"
   * içinde "Tatlılar"a daralta bilsin diye iki süzgeç aynı anda açık olabiliyor. Sorgu ikisini
   * AND'liyor (`getCatalogData` künyesi, ölçüm orada).
   */
  collection: z.string().trim().min(1).optional(),
  /**
   * Bozuk sıralama değeri hata DEĞİL: istemci ya da kayıtlı bir bağlantı eskimiş olabilir, ve
   * yanlış sıralama listeyi YANLIŞ yapmaz — yalnız beklenenden farklı sıralar. Web de aynı şeyi
   * yapıyor (`catalog/page.tsx` — `CATALOG_SORTS.includes(...) ? ... : 'featured'`).
   *
   * `.catch` verilmemiş değeri de yakalar (zorunluluk ihlali de bir parse hatasıdır), o yüzden
   * ayrıca `.default` yazılmıyor — iki yerde duran aynı varsayılan bir gün ayrışır.
   */
  sort: CatalogSortEnum.catch('featured'),
  /**
   * **"Adresime gönderilebilir" çipi** (21.20) — web'in URL'siyle AYNI kelime (`?shippable=1`,
   * `apps/web/app/(customer)/[locale]/catalog/page.tsx`). İki yüzey aynı soruyu aynı adla soruyor;
   * ayrı adlar (`onlyShippable=true` gibi) bir gün birinin ötekinden ayrışmasının ilk adımı olurdu.
   *
   * `1` DIŞINDA ne gelirse gelsin süzgeç kapalıdır (`.catch`) — `sort`un kuralıyla aynı: bozuk bir
   * değer listeyi YANLIŞ yapmaz, yalnız süzülmemiş bırakır ve 400 dönmek istemciyi cevapsız
   * bırakmaktan kötüdür.
   *
   * **Tek başına YETMEZ:** süzgeç yalnız rota DIŞINDAKİ müşteriye uygulanır (`shippableApplies`).
   */
  shippable: z.literal('1').optional().catch(undefined),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

/**
 * **İSTEĞE BAĞLI KİMLİK** — fiyatın kişiselleşmesi için; erişim için DEĞİL.
 *
 * Katalog hiçbir hâlde 401 dönmez: başlıksız da, süresi dolmuş token'la da ziyaretçi fiyatı
 * gösterilir; geçerli token müşterinin künyesini açar (B2B kanalı + müşteriye özel fiyat satırları).
 * Kimlik ZİNCİRİ burada değil, `auth.ts`te (`optionalCustomerId`): keşif ucu (21.19) aynı zinciri
 * başka bir KARAR için istiyor (oyu sahibine yazmak) ve zincir iki kez yazılsaydı biri gün gelip
 * profilsiz kullanıcıyı ötekinden farklı ele alırdı. Burada kalan tek şey o kimliğin FİYAT
 * künyesine çevrilmesi.
 *
 * Dışa verilir: vitrin ucu (`home.ts`) fırsat fiyatını aynı kapıdan kişiselleştirir.
 */
export async function readViewer(db: SupabaseClient, authorization: string | undefined): Promise<PricingViewer> {
  // Kimliksizde `pricingViewerOf` zaten `VISITOR` döner — ayrı bir kısa devre ikinci bir karar olurdu.
  return pricingViewerOf(db, await optionalCustomerId(db, authorization));
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
  const db = serviceDb();
  const rows = await new CategoryService(db).list({ activeOnly: true });
  // Fotoğraf havuzu (05.23) — kart görseli günden güne buradan seçiliyor. Web'le AYNI indirgemeden
  // geçtiği için iki yüzey aynı gün aynı kareyi gösterir; havuz da tek turda okunur (kart başına
  // sorgu yok). Havuzu boş olan kategori kapağını gösterir, yani bu satır hiçbir şeyi bozmadan
  // eklendi.
  const pools = await new CategoryImageService(db).listByCategories(rows.map((row) => row.id));
  const categories = rows.map((row) => toCategory(row, locale.data, pools.get(row.id)));
  // Zarf da sözleşmedir: satırlar tek tek değil, zarf bütün hâlinde tek kaynaktan doğrulanır.
  return ok(c, CatalogCategoryListSchema.parse({ categories } satisfies z.input<typeof CatalogCategoryListSchema>));
});

/**
 * Ürün listesi — keyset sayfalama + arama + kategori + sıralama, ticari bağlamıyla birlikte.
 *
 * Fiyat, stok hâli, "tükendi" ve satın alma yolu artık cevapta: hepsi `getCatalogData`'dan gelir,
 * yani web katalogunun okuduğu kararların aynısıdır. Bu uçta hesaplanan tek şey yok.
 *
 * **`total` yine listeyle tutarlı** — ve 21.20'de `shippable` açılınca da öyle kaldı. Sayaç
 * `productSvc.countMatching(filters)` ile TAM AYNI süzgeç nesnesinden geçiyor (`onlyShippable`
 * dahil); eski `counts()` RPC'si süzgeçlerin yalnız dördünü tanıdığı için sessizce yalan söylüyordu
 * ve o arıza 08.26'da kapatıldı (`packages/application/src/catalog/catalog.ts` künyesi). Sayaçtan
 * habersiz bir süzgeç eklenirse alan yeniden yalan söylemeye başlar — kontrol orkestrasyonda.
 */
catalog.get('/products', async (c) => {
  const parsed = ProductQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return fail(c, parsed.error.issues[0]?.path[0] === 'locale' ? 'invalid_locale' : 'invalid_query', 400);
  }
  const { locale, q, category, collection, sort, limit } = parsed.data;

  const db = serviceDb();
  const [viewer, place] = await Promise.all([
    readViewer(db, c.req.header('authorization')),
    readPlace(db, c.req.query('postalCode')),
  ]);
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
      cursor: decodeCursor(parsed.data.cursor),
    },
    place,
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
  // Koleksiyon slug'ı da AYNI kuralda (21.64): sessizce yok saymak, müşterinin açtığı kesit yerine
  // TÜM katalogu göstermek olurdu — bandın "Bayram Sofrası" yazıp 131 ürün listelemesi. Ayrım
  // yalnız kaynakta: kategori kendi listesinden, koleksiyon `readCollectionHead`ten çözülüyor;
  // ikisi de yalnız AKTİF satırlar arasından, yani pasif koleksiyon da tanınmaz.
  if (collection && !data.activeCollection) return fail(c, 'unknown_collection', 400);

  /* ARAMA / SÜZGEÇ (24.08 · MB-63) — talep sinyalinin kendisi: müşteri ne aradı, buldu mu.
     ÜÇ KOŞUL, üçü de web kapısının aynısı:
     · Süzgeçsiz liste SAYILMAZ — o bir arama değil, katalogun sıradan hâli.
     · YALNIZ İLK SAYFA — sonraki sayfalar imleçle geliyor ve saysaydık tek arama, kaydırma sayısı
       kadar sayılırdı.
     · `zeroResultKind` sonucu olmayan aramayı SÜZGEÇSİZDEN ayırır: "aradı bulamadı" ile "süzgeci
       fazla daralttı" aynı şey değil, aksiyonları da farklı (tedarik ↔ arayüz).
     Sorgu HAM geçiliyor; temizlik (`scrubMessage` + normalleştirme + 100 karakter) kapının işi. */
  const suzgecli = Boolean(category || collection || parsed.data.shippable === '1');
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
      /* Kartın kampanya ROZETİ (23.08) — çeviri kesit başlığıyla AYNI kapıdan (`toWireCampaign`).
         `null` → alanı HİÇ göndermiyoruz (`undefined`), sözleşmenin `wasCents` deyimiyle aynı:
         "alan yoksa kampanya da yoktur". Boş bir nesne göndermek, okuyana "kampanya var ama boş"
         dedirtirdi. Okuma zaten iki sessizliği birleştirdi (kampanya yok · başlık zaten söylüyor);
         uç o kararı tekrar sorgulamaz. */
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
  const [viewer, place] = await Promise.all([
    readViewer(db, c.req.header('authorization')),
    readPlace(db, c.req.query('postalCode')),
  ]);
  const detail = await getProductDetail(db, {
    locale: locale.data,
    slug: c.req.param('slug'),
    place,
    viewer,
  });
  if (!detail) return fail(c, 'product_not_found', 404);

  /* ÜRÜN GÖRÜNTÜLEMESİ (24.08 · MB-63) — `ANALYTICS §1`in tek "render'dan atılan" olayı, ve
     native'de o bile SUNUCUDAN atılıyor: detay ucu zaten bu istekte çağrılıyor, istemciye atıcı
     koymak aynı olayı ikinci bir yerden saymak olurdu.

     `availability` GÖRÜNTÜLEME ANININ hâlidir ve sonradan kurulamaz (stok hareket eder) — bu
     yüzden satılabilirlik burada, cevabın kendisinden okunuyor.

     ÜLKE `null` GEÇİLİYOR ve bu bir unutma değil: `readPlace` yalnız DEPO döndürüyor
     (`PlaceWarehouses` künyesi), ülkeyi çözümün içinde bırakıyor. Bilen uç (`/places`) onu
     dolduruyor; bilmeyen uç uydurmuyor. → BEKLEYEN(21.103) */
  void recordNativeEvent(
    { db, channel: viewer.channel, customerId: viewer.customerId, place, locale: locale.data, country: null },
    {
      type: 'product_view',
      subjectType: 'product',
      subjectId: detail.id,
      productId: detail.id,
      availability: availabilityOf(detail.variants),
    },
  );

  // ── SÖZLEŞMENİN KİLİDİ ────────────────────────────────────────────────────
  // Gövde `z.input<…>` ile TİPLENİR, `parse`a `unknown` gibi girmez: orkestrasyonun döndürdüğü
  // `StorefrontProductDetail` sözleşmeye alan alan uymak zorunda ve uymadığı gün burası DERLENMEZ.
  // Bu, `packages/types`ın `@lezzet/helper`a bağlanamaması yüzünden oraya konamayan
  // `satisfies z.ZodType<TextSegment>` kilidinin yerini de tutar — üstelik daha geniş: yalnız
  // metin parçasını değil, ürünün/boyun/ailenin tüm alanlarını çiviler.
  /* PAYLAŞIM ADRESİ BURADA KURULUR (08.45), okuma kapısında değil: `getProductDetail` katalog
     verisini çözüyor, adres ise WEB ROTASININ kuralı — köken + dil öneki + dile göre çevrilmiş yol.
     `localizedUrl` o kuralın tek sahibi (`@lezzet/i18n`, künyesi zaten "paylaşılan bağlantı" diyor);
     burada yalnız çağrılıyor, kopyalanmıyor. Uygulama önce sadece ürün ADINI paylaşıyordu — alan
     tarafa "Su Böreği" yazan, tıklanacak hiçbir şeyi olmayan bir mesaj gidiyordu. */
  const body: z.input<typeof CatalogProductDetailSchema> = {
    ...detail,
    /* Öneri şeridinin kampanya ROZETİ (23.08) — katalog listesiyle AYNI çeviri kapısı. Şerit
       karışık bir listedir (kartlar farklı kategorilerden) ve üstünde kampanyayı söyleyecek bir
       başlık yok; kararın tarif ettiği yer tam burası. */
    similar: detail.similar.map((p) => ({ ...p, campaign: toWireCampaign(p.campaign, locale.data) ?? undefined })),
    shareUrl: localizedUrl('/product/[slug]', locale.data, { slug: detail.slug }),
  };
  return ok(c, CatalogProductDetailSchema.parse(body));
});
