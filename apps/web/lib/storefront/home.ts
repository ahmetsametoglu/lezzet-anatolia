import 'server-only';
import { AnalyticsProductDailyService, CategoryService, ProductService, SettingsService, serviceDb } from '@lezzet/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Locale } from '@lezzet/i18n';
// `ProductWithRelations` şema tipidir, servis tipi değil — kaynağı `@lezzet/types` (`CLAUDE §1`:
// şema tek kaynak). `@lezzet/database`'ten yeniden dışa açmak aynı tipe ikinci bir yol açardı.
import type { AnalyticsProductSignal, ProductWithRelations } from '@lezzet/types';
import type { PlaceWarehouses } from '@/lib/delivery/place-types';
import { FIXTURE_CATEGORIES } from './fixtures';
import { listOfferProductIds, loadProductContext } from './read-context';
import type { PricingViewer } from './read-viewer';
import { EMPTY_PRODUCT_CONTEXT, toCategory, toProduct } from './map';
import { HOME_PACKAGE_LIMIT, listStorefrontPackages } from './packages';
import type { StorefrontHome, StorefrontOffer, StorefrontProduct } from './storefront-types';

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

/** Fırsat bandında en çok kaç kart — tasarımda üçlü ızgara (K8), fazlası bandı taşırır. */
const OFFER_LIMIT = 6;

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
 */
async function readOffers(db: SupabaseClient, locale: Locale, place: PlaceWarehouses, viewer: PricingViewer): Promise<StorefrontOffer[]> {
  const productIds = await listOfferProductIds(db, place.warehouseId);
  if (!productIds.length) return [];

  const page = await new ProductService(db).listWithRelations({ filters: { ids: productIds, status: 'active' }, limit: OFFER_LIMIT });
  const context = await loadProductContext(db, page.rows, place, viewer);
  return page.rows.map((p) => toProduct(p, locale, context.get(p.id) ?? EMPTY_PRODUCT_CONTEXT)).filter(isOffer);
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
  const [categoryRows, featured, offers, packages] = await Promise.all([
    new CategoryService(db).list({ activeOnly: true }),
    // Vitrin seçkisi boş sepetle PAYLAŞILIR — tek kaynak (`readShowcase`).
    readShowcase(db, locale, place, viewer),
    readOffers(db, locale, place, viewer),
    listStorefrontPackages(locale),
  ]);

  const categories = (categoryRows.length ? categoryRows : FIXTURE_CATEGORIES).map((c) => toCategory(c, locale));

  // Bant bir SEÇKİ, liste değil: sabit sınırla kesilir (CLAUDE.md §1). Tükenmişler sona alınmış
  // geldiği için sınır önce satılabilirleri alır.
  return { categories, featured, offers, packages: packages.slice(0, HOME_PACKAGE_LIMIT) };
}
