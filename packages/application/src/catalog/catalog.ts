import { CategoryService, ProductListingService, ProductService } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE } from '@lezzet/types';
import type { CatalogSort, KeysetCursor, PreferredLanguage } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listOfferProductIds, loadProductContext } from './product-context';
import type { PricingViewer } from './pricing-viewer';
import { EMPTY_PRODUCT_CONTEXT, toCategory, toProduct, type CatalogCategoryRow } from './map';
import type { PlaceWarehouses, StorefrontCatalog } from './storefront-types';

/**
 * Katalog okuması (08.10; terfi 21.6 — kaynağı `apps/web/lib/storefront/catalog.ts`).
 *
 * Süzme ve sayfalama SUNUCUDA: `ProductService.list` ad araması (üç dilde birden) ve kategori
 * süzgecini SQL'de çözer, sayfalama keyset'tir (`CLAUDE.md`: sınırsız büyüyen listeler sonsuz
 * kaydırma → servis okumaları cursor'lu). Liste büyüdükçe çağırana taşınan yük artmaz.
 *
 * **Fiyat sıralaması neden bir migration istedi:** uygulanabilir fiyat AYRI tablodadır (kanal +
 * geçerlilik tarihi + müşteriye özel satır) ve "bu ürünün b2c fiyatı" tek bir kolon değil bir
 * SEÇİMDİR. Sayfa çekildikten sonra sıralamak seçenek değil — "artan fiyat" yalnız o 30 satır içinde
 * artan olur ve keyset sayfalama bozulur. Çözüm `available_stock` deseninde bir okuma görünümü
 * (`0043`): seçim SQL'de çözülür, sıralama ve imleç onun üstünde çalışır.
 */

export interface CatalogQuery {
  /** Kategori slug'ı — dil-bağımsız, içerikten türer. */
  categorySlug?: string;
  search?: string;
  sort?: CatalogSort;
  /** "Yalnız indirimliler" — açık teklifi olan ürünlere daraltır (DOMAIN §5). */
  onlyOffers?: boolean;
  /**
   * Yalnız kargolanabilenler — "adresime gönderilebilir" çipi. Çip VARSAYILAN KAPALIDIR (tasarım):
   * bölge dışı bir posta kodunda soğuk zincir ürünleri gizlenmez, kartta etiketiyle durur. Katalogu
   * kendiliğinden küçültmek, müşteriye sormadan seçim yapmak olurdu.
   */
  onlyShippable?: boolean;
  cursor?: KeysetCursor;
}

export interface CatalogInput {
  locale: PreferredLanguage;
  query?: CatalogQuery;
  /**
   * Müşterinin yerinden çözülen depolar. **Zorunlu ve varsayılansız**: `warehouseId: null` meşru
   * bir değerdir ("yer bilinmiyor", posta kodu zorunlu değil — K1) ama VERİLMESİ zorunludur.
   * Varsayılan bıraksaydık argümanı unutan çağrı derlenir ve sessizce depo-üstü okurdu —
   * `getAvailableMap`'i kurtaran şey (T8) tam olarak parametrenin zorunluluğuydu.
   *
   * `null` → depo-ÜSTÜ okuma: "tükendi" demenin tek dayanağı hiçbir depoda bulunmamasıdır (C3).
   */
  place: PlaceWarehouses;
  /**
   * **Kim soruyor** (kanal/onay/kimlik); zorunlu ve `place` ile aynı sebeple ÇAĞIRANDAN gelir:
   * çözümü oturumu/çerezi okur, kapının içine konsaydı bu modül istek bağlamı olmadan
   * çağrılamazdı — testler ve sunucu görevleri dâhil.
   */
  viewer: PricingViewer;
  /**
   * **Katalog tamamen boşken gösterilecek yedek kategoriler** — çağıranın kararı, paketin değil.
   *
   * Web'in `fixtures.ts`i seed atılmamış yerel ortamda vitrinin kabuğu çizilsin diye bu yedeğe
   * düşüyor; mobil API bilinçle düşmüyor ("boş liste doğru cevaptır; uydurma kimliklerle ürün
   * isteyen bir istemci üretmek, boş bir şerit çizmekten pahalıya patlar"). İki karar da meşru ve
   * ikisi de YÜZEYİN kararı — bu yüzden orkestrasyon yedeği kendi içinde tutmaz, PARAMETRE alır.
   * Verilmezse yedek yoktur; web bugünkü davranışını fixture'ı geçirerek birebir korur.
   */
  fallbackCategories?: readonly CatalogCategoryRow[];
  /**
   * **Sayfa boyutu — çağıranın kararı** (varsayılan `DEFAULT_PAGE_SIZE`).
   *
   * Web'in katalog sayfası sayfa boyutunu hiç sormuyor (sonsuz kaydırma tek ölçüde akar), o yüzden
   * sayı buraya sabit yazılmıştı. Mobil uç `?limit=` sunuyor ve sunmak ZORUNDA: HTTP istemcisi ilk
   * boyayı küçük bir sayfayla açıp gerisini kaydırmayla isteyebilir, tek ölçü dayatmak cihazın
   * bant genişliği kararını sunucuya taşımak olur.
   *
   * Alan **opsiyonel ve varsayılanı eskisiyle aynı**: geçirmeyen çağıran (web köprüsü dâhil) bit
   * bazında aynı sorguyu atar — davranış değişikliği yok, yalnız kararın yeri açıldı. Tavan
   * BURADA yok, çağıranda: "en çok kaç" bir taşıma politikasıdır (mobil uçta 50), orkestrasyonun
   * iş kuralı değil.
   */
  limit?: number;
}

/** Ürün bulunmayan katalog cevabı — süzgeç hiçbir şeyi getirmediğinde sorgu boşa atılmasın. */
const noProducts = (
  categories: StorefrontCatalog['categories'],
  activeCategory: StorefrontCatalog['activeCategory'],
): StorefrontCatalog => ({
  categories,
  activeCategory,
  products: [],
  total: 0,
  nextCursor: null,
});

/**
 * Katalog sayfası: kategoriler + süzülmüş/sıralanmış ürünler + toplam + imleç.
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`), `auth/otp` deseni.
 */
export async function getCatalogData(db: SupabaseClient, input: CatalogInput): Promise<StorefrontCatalog> {
  const { locale, place, viewer } = input;
  const q = input.query ?? {};
  const limit = input.limit ?? DEFAULT_PAGE_SIZE;

  const categoryRows = await new CategoryService(db).list({ activeOnly: true });
  const source = categoryRows.length ? categoryRows : (input.fallbackCategories ?? []);
  const categories = source.map((c) => toCategory(c, locale));
  const activeCategory = q.categorySlug ? (categories.find((c) => c.slug === q.categorySlug) ?? null) : null;

  // "Yalnız indirimliler": teklifli ürünler önden çözülür ve SORGUYA girer — sayfa çekildikten
  // sonra elemek keyset sayfalamayı ve toplam sayıyı bozardı.
  const offerIds = q.onlyOffers ? await listOfferProductIds(db, place.warehouseId) : undefined;
  if (offerIds && !offerIds.length) return noProducts(categories, activeCategory);

  // Aday ürün katalogda GÖRÜNMEZ (`musteri-katalog.md §6`) — `status: 'active'` bunu sağlar.
  const filters = {
    query: q.search,
    categoryId: activeCategory?.id,
    status: 'active' as const,
    ids: offerIds,
    onlyShippable: q.onlyShippable,
  };
  const productSvc = new ProductService(db);
  // Fiyat sıralaması AYRI kaynaktan okunur (`product_listing` görünümü, 0043): sıralama anahtarı
  // ürün tablosunda yoktur. Süzgeçler ve satır şeması ortaktır — ayrışan tek şey sıra.
  const direction = q.sort === 'priceAsc' ? 'asc' : q.sort === 'priceDesc' ? 'desc' : null;
  const [page, counts] = await Promise.all([
    direction
      ? new ProductListingService(db).listByPrice({
          filters,
          cursor: q.cursor,
          limit,
          direction,
          warehouseId: place.warehouseId,
        })
      : productSvc.listWithRelations({ filters, cursor: q.cursor, limit }),
    productSvc.counts(filters),
  ]);
  const context = await loadProductContext(db, page.rows, place, viewer);

  return {
    categories,
    activeCategory,
    products: page.rows.map((p) => toProduct(p, locale, context.get(p.id) ?? EMPTY_PRODUCT_CONTEXT)),
    total: counts.total,
    nextCursor: page.nextCursor,
  };
}
