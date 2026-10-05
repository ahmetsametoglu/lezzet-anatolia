'use server';

import { KeysetCursorSchema, type KeysetCursor } from '@lezzet/types';
import { hasLocale } from 'next-intl';
import { getCatalogData, type StorefrontProduct } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { readPlaceMode, readPlaceWarehouses } from '@/lib/delivery/read-place';
import { shippableFilterApplies } from '@/lib/delivery/place-filter';
import { readPricingViewer } from '@/lib/storefront/read-viewer';
import { CATALOG_SORTS, type CatalogSort } from '@lezzet/types';
import { customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import { routing } from '@/i18n/routing';
import type { CatalogFilters } from './catalog-types';

/**
 * Katalogun sonraki sayfası, sonsuz kaydırmanın sunucu ucu: guard yoktur, katalog herkese açıktır ama girdiler doğrulanır. Süzgeç
 * URL'dedir ve paylaşılabilir, imleç değil; yenilemede liste baştan başlar.
 */
interface CatalogPageResult {
  products: StorefrontProduct[];
  nextCursor: KeysetCursor | null;
}

/**
 * Sonraki sayfanın süzgeci `CatalogFilters`ten türer, yeni süzgeç eklenince bu kapı da onu istemek zorunda kalsın diye. `sort`
 * gevşetilir, çünkü değer istemciden gelir ve aşağıda doğrulanır.
 */
type CatalogPageQuery = Omit<CatalogFilters, 'sort'> & { sort?: string; search?: string };

export async function loadMoreCatalogAction(locale: string, q: CatalogPageQuery, cursor: KeysetCursor): Promise<CustomerResult<CatalogPageResult>> {
  try {
    if (!hasLocale(routing.locales, locale)) throw new Error('Geçersiz dil');
    /**
     * İmleç ve sıralama istemciden gelir, `safeParse` ile doğrulanır: fırlatan `parse` iç yapıyı müşterinin ekranına basardı. Bozuk
     * imleç geçersiz bir istektir, cevap listeyi baştan vermektir.
     */
    const parsed = KeysetCursorSchema.safeParse(cursor);
    const safeCursor = parsed.success ? parsed.data : undefined;
    const sort: CatalogSort = CATALOG_SORTS.includes(q.sort as CatalogSort) ? (q.sort as CatalogSort) : 'featured';

    const data = await getCatalogData(serviceDb(), {
      locale,
      query: {
        categorySlug: q.category,
        // Koleksiyon da bir SÜZGEÇTİR ve sonraki sayfa onu taşımak zorunda: taşımasaydı müşteri
        // koleksiyon içinde kaydırırken liste sessizce tüm kataloğa açılırdı. `CatalogPageQuery`
        // `CatalogFilters`ten türediği için bu alanı geçirmemek derleme hatası DEĞİL — künyedeki
        // `onlyShippable` vakasının aynısı, o yüzden elle bağlanıyor.
        collectionSlug: q.collection,
        search: q.search,
        sort,
        onlyOffers: q.onlyOffers,
        // Kargo süzgeci yere göre uygulanır ve kip sunucuda yeniden çözülür; ilk sayfa `page.tsx`te aynı kuraldan geçer, atlansaydı
        // kaydırmayla gelen sayfa başka süzgeçle dolardı.
        onlyShippable: shippableFilterApplies(q.onlyShippable, await readPlaceMode()),
        cursor: safeCursor,
      },
      place: await readPlaceWarehouses(),
      viewer: await readPricingViewer(),
      // Sayfalama çağrısında fikstür GEREKMEZ: ilk boyama kategorileri zaten bastı, burası yalnız
      // ürün sayfası çeker.
    });
    return { data: { products: data.products, nextCursor: data.nextCursor }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}
