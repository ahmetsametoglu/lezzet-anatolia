'use server';

import { KeysetCursorSchema, type KeysetCursor } from '@lezzet/types';
import { hasLocale } from 'next-intl';
import { getCatalogData } from '@/lib/storefront/catalog';
import { CATALOG_SORTS, type CatalogSort, type StorefrontProduct } from '@/lib/storefront/storefront-types';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { routing } from '@/i18n/routing';

/**
 * Katalogun sonraki sayfası — sonsuz kaydırmanın sunucu ucu (08.10).
 *
 * Liste RSC'de ilk sayfayla gelir; müşteri aşağı kaydırdıkça bu action bir sonrakini EKLER. Guard
 * YOK: katalog herkese açıktır (operasyon action'larındaki `requireStaff` buraya taşınmaz), ama
 * girdilerin hepsi yine de doğrulanır — dışarıdan gelen her değer şüphelidir.
 *
 * Süzgeç neden URL'de, imleç neden değil: süzgeçli liste PAYLAŞILABİLİR olmalı (kategori + arama
 * adreste yaşar), ama "3. sayfa" diye bir adres yoktur — yenilemede müşteri baştan başlar. Sonsuz
 * kaydırmanın deseni budur; operasyon tarafı da aynı ayrımı yapar.
 */
interface CatalogPageResult {
  products: StorefrontProduct[];
  nextCursor: KeysetCursor | null;
}

/** Etkin süzgeçler — sayfa `hrefFor` ile ürettiği aynı değerleri geri gönderir. */
interface CatalogPageQuery {
  category?: string;
  search?: string;
  sort?: string;
  onlyOffers?: boolean;
}

export async function loadMoreCatalogAction(locale: string, q: CatalogPageQuery, cursor: KeysetCursor): Promise<ActionResult<CatalogPageResult>> {
  try {
    if (!hasLocale(routing.locales, locale)) throw new Error('Geçersiz dil');
    // İmleç ve sıralama client'tan geliyor → doğrulanır (uydurma değer sorguyu bozmasın).
    const safeCursor = KeysetCursorSchema.parse(cursor);
    const sort: CatalogSort = CATALOG_SORTS.includes(q.sort as CatalogSort) ? (q.sort as CatalogSort) : 'featured';

    const data = await getCatalogData(locale, {
      categorySlug: q.category,
      search: q.search,
      sort,
      onlyOffers: q.onlyOffers,
      cursor: safeCursor,
    }, null /* yer bağlamı sunucuya 19.7'de taşınacak — BEKLEYEN(19.7) */);
    return { data: { products: data.products, nextCursor: data.nextCursor }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
