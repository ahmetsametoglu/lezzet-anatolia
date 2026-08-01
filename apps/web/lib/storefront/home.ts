import 'server-only';
import { CategoryService, ProductService, serviceDb } from '@lezzet/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Locale } from '@lezzet/i18n';
import { FIXTURE_CATEGORIES } from './fixtures';
import { listOfferProductIds, loadProductContext } from './read-context';
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
 * **Vitrin seçkisi** — anasayfanın "Bu hafta çok sevilenler" bandı ile boş sepetin öneri alanı AYNI
 * dörtlüyü okur. İki yerde ayrı yazılsaydı müşteri iki ekranda iki farklı "seçki" görürdü.
 *
 * Ölçüt bugün "aktif katalogdan ilk dörtlü": popülerlik sinyalimiz yok (`product_view` sayımı
 * 08.9'da doğacak, sipariş kalemi sayımı 13'te). **Uydurulan bir sıralama yok — yedek var:**
 * gerçek bir "çok sevilen" listesi hesaplanana kadar alan katalogla dolar. Alanı boş bırakmak
 * ölçütü olmayan bir sıralamadan daha kötüydü; müşteri o boşlukta ekranın bittiğini sanıyor.
 *
 * BEKLEYEN(08.9): gerçek popülerlik ölçütü (görüntüleme + sipariş sayımı) — ölçüt geldiğinde
 * yalnız buradaki sıralama değişir, iki ekran da onu izler.
 */
export async function readShowcase(
  db: SupabaseClient,
  locale: Locale,
  warehouseId: string | null,
): Promise<StorefrontProduct[]> {
  const page = await new ProductService(db).listWithRelations({ filters: { status: 'active' }, limit: SHOWCASE_LIMIT });
  const context = await loadProductContext(db, page.rows, warehouseId);
  return page.rows.map((p) => toProduct(p, locale, context.get(p.id) ?? EMPTY_PRODUCT_CONTEXT));
}

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
async function readOffers(db: SupabaseClient, locale: Locale, warehouseId: string | null): Promise<StorefrontOffer[]> {
  const productIds = await listOfferProductIds(db, warehouseId);
  if (!productIds.length) return [];

  const page = await new ProductService(db).listWithRelations({ filters: { ids: productIds, status: 'active' }, limit: OFFER_LIMIT });
  const context = await loadProductContext(db, page.rows, warehouseId);
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
 */
export async function getHomeData(locale: Locale, warehouseId: string | null): Promise<StorefrontHome> {
  const db = serviceDb();
  const [categoryRows, featured, offers, packages] = await Promise.all([
    new CategoryService(db).list({ activeOnly: true }),
    // Vitrin seçkisi boş sepetle PAYLAŞILIR — tek kaynak (`readShowcase`).
    readShowcase(db, locale, warehouseId),
    readOffers(db, locale, warehouseId),
    listStorefrontPackages(locale),
  ]);

  const categories = (categoryRows.length ? categoryRows : FIXTURE_CATEGORIES).map((c) => toCategory(c, locale));

  // Bant bir SEÇKİ, liste değil: sabit sınırla kesilir (CLAUDE.md §1). Tükenmişler sona alınmış
  // geldiği için sınır önce satılabilirleri alır.
  return { categories, featured, offers, packages: packages.slice(0, HOME_PACKAGE_LIMIT) };
}
