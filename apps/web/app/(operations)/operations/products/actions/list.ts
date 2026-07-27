'use server';

import { CategoryService, CollectionService, ProductService, serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE, KeysetCursorSchema, resolveLocalizedText, type KeysetCursor } from '@lezzet/types';
import { requireStaff } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { toProductViews } from '../products-read';
import { parseProductsUrl, toProductFilters } from '../products-url';
import type { ProductView } from '../products-types';

// Sonraki ürün sayfası — infinite scroll'un sunucu ucu. Liste RSC'de ilk sayfayla gelir; kullanıcı
// aşağı kaydırdıkça bu action bir sonraki sayfayı EKLER. Süzgeçler URL sözleşmesinden çözülür
// (parseProductsUrl) — client kendi süzgeç nesnesini kurup göndermez, tek kaynak URL'dir.
//
// Neden action, neden URL değil: süzgeç URL'de (paylaşılabilir), ama SAYFA imleci URL'e yazılmaz —
// yenilemede kullanıcı en baştan başlar, "3. sayfa" diye bir adres yoktur (infinite scroll deseni).

interface ProductPageResult {
  products: ProductView[];
  nextCursor: KeysetCursor | null;
}

/**
 * Verilen imleçten sonraki sayfayı döner. `search` ekranın o anki adres dizesidir (`?q=&cat=…`) —
 * sunucu onu kendisi ayrıştırır, böylece süzgeç mantığı iki yerde yaşamaz.
 */
export async function loadMoreProductsAction(search: string, cursor: KeysetCursor): Promise<ActionResult<ProductPageResult>> {
  try {
    await requireStaff();
    // İmleç client'tan geliyor → şemadan geçirilir (uydurma değer sorguyu bozmasın).
    const safeCursor = KeysetCursorSchema.parse(cursor);
    const filters = toProductFilters(parseProductsUrl(Object.fromEntries(new URLSearchParams(search))));

    const db = serviceDb();
    const productSvc = new ProductService(db);
    const page = await productSvc.listWithRelations({ filters, cursor: safeCursor, limit: DEFAULT_PAGE_SIZE });

    // Ad çözümleri için kategori/koleksiyon adları — tavanı onlarla sınırlı iki küçük okuma.
    const [categories, collections] = await Promise.all([new CategoryService(db).list(), new CollectionService(db).list()]);
    const names = {
      category: new Map(categories.map((c) => [c.id, resolveLocalizedText(c.name)])),
      collection: new Map(collections.map((c) => [c.id, resolveLocalizedText(c.name)])),
    };

    // İndirgeme page.tsx ile PAYLAŞILIR → ilk sayfa ve sonraki sayfalar aynı şekli üretir.
    const products = await toProductViews(page.rows, names);
    return { data: { products, nextCursor: page.nextCursor }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
