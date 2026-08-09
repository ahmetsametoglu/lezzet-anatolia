import 'server-only';
import { AnalyticsProductDailyService, CategoryService, CollectionService, ProductService, SettingsService, serviceDb } from '@lezzet/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Locale } from '@lezzet/i18n';
// `ProductWithRelations` şema tipidir, servis tipi değil — kaynağı `@lezzet/types` (`CLAUDE §1`:
// şema tek kaynak). `@lezzet/database`'ten yeniden dışa açmak aynı tipe ikinci bir yol açardı.
import type { AnalyticsProductSignal, ProductWithRelations } from '@lezzet/types';
import type { PlaceWarehouses } from '@/lib/delivery/place-types';
import { resolveLocalizedText } from '@lezzet/types';
import { FIXTURE_CATEGORIES } from './fixtures';
import {
  imageOf,
  listOfferProductIds,
  loadProductContext,
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
 */
const SHOWCASE_LIMIT = 4;

/**
 * Seçkinin penceresi (gün). Ayardan gelir — `DOMAIN §6`: eşik/süre kod sabiti değil işletme ayarı.
 *
 * Anahtar BURADA, `settings-keys.ts`'te değil: o dosya yalnız **iki yüzeyde birden** okunan,
 * müşteriye söz veren ayarları toplar (kendi künyesinin kuralı). Bu ayarı okuyan tek yer burası.
 *
 * Varsayılan 7 ve keyfi değil: bandın başlığı *"Bu hafta çok sevilenler"* diyor. Pencere ondan
 * uzun olsaydı ekran haftalık bir vaat verip aylık bir sıralama gösterirdi.
 */
const SHOWCASE_WINDOW_KEY = 'showcase_window_days';
const SHOWCASE_WINDOW_DEFAULT = 7;

/**
 * Sinyal kapısından kaç satır istenir. Dörtten fazlası şart: sıralamanın başındaki ürün pasife
 * çekilmiş ya da bu yerde satılamıyor olabilir; tam dört isteseydik band eksik kalırdı.
 */
const SIGNAL_OVERFETCH = SHOWCASE_LIMIT * 5;

/**
 * **Vitrin seçkisi** — anasayfanın "Bu hafta çok sevilenler" bandı ile boş sepetin öneri alanı AYNI
 * dörtlüyü okur. İki yerde ayrı yazılsaydı müşteri iki ekranda iki farklı "seçki" görürdü.
 *
 * ── ÖLÇÜT ARTIK GERÇEK (08.9 · 04.08) ────────────────────────────────────────
 * Sıralama son N günün **görüntüleme + sepete ekleme** toplamından geliyor
 * (`analytics_daily_product`). Uzun süre "aktif katalogdan ilk dörtlü"ydü ve o bir yedekti, ölçüt
 * değil; artık yedek yalnız **veri birikmemişken** devrede.
 *
 * **Ham deftere DEĞİL günlük özete bağlı** (`ANALYTICS §5`): ham defterden okusaydık her ana sayfa
 * açılışı ayın tüm bölümünü tarardı ve sayfa her hafta biraz daha yavaşlardı — kimse tek bir günü
 * işaret edemezdi.
 *
 * **Seçki bir liste değil, tıklatma davetidir:** sayfalanmaz ama sabit sınırı vardır (`CLAUDE §1`).
 */
export async function readShowcase(
  db: SupabaseClient,
  locale: Locale,
  place: PlaceWarehouses,
  viewer: PricingViewer,
): Promise<StorefrontProduct[]> {
  const rows = await showcaseRows(db);
  const context = await loadProductContext(db, rows, place, viewer);
  return rows.map((p) => toProduct(p, locale, context.get(p.id) ?? EMPTY_PRODUCT_CONTEXT));
}

/** Seçkinin ürün satırları: önce ölçüt, eksik kalırsa katalogla tamamlanır. */
async function showcaseRows(db: SupabaseClient): Promise<ProductWithRelations[]> {
  const products = new ProductService(db);
  const ranked = await rankedProductIds(db);
  if (!ranked.length) {
    // **İlk gün hâli birinci sınıf:** sinyal birikmeden band boş kalmaz, katalogla dolar. Bu bir
    // uydurma sıralama değil — "en çok sevilen" iddiası yalnız ölçüt varken kuruluyor.
    return (await products.listWithRelations({ filters: { status: 'active' }, limit: SHOWCASE_LIMIT })).rows;
  }

  const page = await products.listWithRelations({ filters: { ids: ranked, status: 'active' }, limit: SIGNAL_OVERFETCH });
  const picked = orderByRank(page.rows, ranked);
  if (picked.length >= SHOWCASE_LIMIT) return picked.slice(0, SHOWCASE_LIMIT);

  // Ölçütü olan ürünlerin bir kısmı pasifleşmişse band yine dört kart ister: kalanı katalogdan.
  // Eksik bir band, tasarımın dörtlü ızgarasını bozar ve müşteriye "bir şeyler eksik" dedirtir.
  const filler = await products.listWithRelations({ filters: { status: 'active' }, limit: SHOWCASE_LIMIT + picked.length });
  return topUp(picked, filler.rows, SHOWCASE_LIMIT);
}

/**
 * Satırları ÖLÇÜT sırasına dizer — servisin döndürdüğü sıra veritabanınındır, seçkinin değil.
 *
 * Sıralamada olmayan satır sona düşer (`Infinity`): kapı yalnız `ranked` içindeki kimlikleri
 * istedi, yine de savunmacı — bir gün süzgeç genişlerse seçki sessizce rastgele sıralanmasın.
 */
export function orderByRank<T extends { id: string }>(rows: readonly T[], ranked: readonly string[]): T[] {
  const order = new Map(ranked.map((id, index) => [id, index]));
  return [...rows].sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
}

/** Eksik kalan bandı tamamlar — zaten seçilmiş ürün ikinci kez girmez. */
export function topUp<T extends { id: string }>(picked: readonly T[], filler: readonly T[], limit: number): T[] {
  const seen = new Set(picked.map((p) => p.id));
  return [...picked, ...filler.filter((p) => !seen.has(p.id))].slice(0, limit);
}

/**
 * Sinyalleri seçkinin ölçütüne göre sıralar: **görüntüleme + sepete ekleme.**
 *
 * Sepete ekleme görüntülemeden daha güçlü bir "sevme" beyanıdır ama ayrı ağırlık VERİLMEDİ: ağırlık
 * seçmek, ölçüsü olmayan bir katsayıyı ekrana yansıtmak olurdu. Toplam yeterince dürüst — ve
 * değiştirmek gerekirse tek satır.
 */
export function rankSignals(signals: readonly AnalyticsProductSignal[]): string[] {
  return signals
    .slice()
    .sort((a, b) => b.viewCount + b.cartCount - (a.viewCount + a.cartCount))
    .map((s) => s.productId);
}

/**
 * Ölçüte göre sıralı ürün kimlikleri; sinyal yoksa boş dizi.
 *
 * **Kesme ile sıralama aynı ölçüt değil ve bu bilinçli:** kapı ilk N'i SQL'de görüntülemeye göre
 * kesiyor (`STACK §13` — türetilmiş oran uygulamada toplanamaz), biz elimizdeki satırı
 * `görüntüleme + sepete ekleme` ile yeniden sıralıyoruz. Yani "az bakılıp çok sepete atılan" bir
 * ürün, ilk yirmiye giremiyorsa seçkiye de giremez. Yaklaşıklık kabul edilebilir: seçkinin sorusu
 * "kim çok isteniyor", en ince ölçüm değil.
 *
 * **Ölçüm düşerse seçki de düşmez:** hata yutulur ve yedek devreye girer (`CLAUDE §1` — sessiz
 * catch yok, gerekçe burada). Analitik bir yan üründür; anasayfanın açılmasını engelleyemez.
 */
async function rankedProductIds(db: SupabaseClient): Promise<string[]> {
  try {
    const days = await new SettingsService(db).getNumber(SHOWCASE_WINDOW_KEY, SHOWCASE_WINDOW_DEFAULT);
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return rankSignals(await new AnalyticsProductDailyService(db).signals(day(from), day(to), SIGNAL_OVERFETCH));
  } catch {
    // Sinyal okunamadı (tablo yok, RPC düştü): seçki yedeğe düşer, müşteri farkı görmez.
    return [];
  }
}

const day = (value: Date): string => value.toISOString().slice(0, 10);

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
  const cards = await Promise.all(
    chosen.map(async (c) => {
      return {
        id: c.id,
        slug: c.slug,
        name: resolveLocalizedText(c.name, locale),
        image: imageOf(c),
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
    // Vitrin seçkisi boş sepetle PAYLAŞILIR — tek kaynak (`readShowcase`).
    readShowcase(db, locale, place, viewer),
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
  const categories = (categoryRows.length ? pickFeatured(categoryRows, HOME_CATEGORY_LIMIT) : FIXTURE_CATEGORIES).map((c) =>
    toCategory(c, locale),
  );

  return { categories, featured, offers: offers.shown, offersTotal: offers.total, packages, collections, recipes };
}
