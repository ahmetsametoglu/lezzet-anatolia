'use server';

import { CategoryService, CollectionService, ProductService, serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE, KeysetCursorSchema, resolveLocalizedText, type KeysetCursor } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { readWarehouseContext, readWarehouseLabels } from '@/lib/warehouse/context';
import { readRowSummaries, toProductViews } from '../products-read';
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
    // Sayfanın kapısı ne ise bu okumanınki de odur: liste admin'e kapalıyken devamını döndüren
    // eylem açık kalırsa kapı yandan açık kalır.
    await requireAdmin();
    // İmleç client'tan geliyor → şemadan geçirilir (uydurma değer sorguyu bozmasın).
    const safeCursor = KeysetCursorSchema.parse(cursor);
    const filters = toProductFilters(parseProductsUrl(Object.fromEntries(new URLSearchParams(search))));

    const db = serviceDb();
    const productSvc = new ProductService(db);
    const page = await productSvc.listWithRelations({ filters, cursor: safeCursor, limit: DEFAULT_PAGE_SIZE });

    // Ad çözümleri için kategori/koleksiyon adları — tavanı onlarla sınırlı iki küçük okuma.
    // Depo bağlamı ve adları da burada: stok özeti ikisine bağlı ve ürün sayfasıyla aynı evreni ister.
    const [categories, collections, warehouseCtx, warehouseLabels] = await Promise.all([
      new CategoryService(db).list(),
      new CollectionService(db).list(),
      readWarehouseContext(),
      readWarehouseLabels(),
    ]);
    const names = {
      category: new Map(categories.map((c) => [c.id, resolveLocalizedText(c.name)])),
      collection: new Map(collections.map((c) => [c.id, resolveLocalizedText(c.name)])),
    };

    // İndirgeme VE özet kurulumu page.tsx ile PAYLAŞILIR → ilk sayfa ile sonraki sayfalar aynı şekli
    // ve aynı sayıları üretir; aşağı kaydırınca stok/fiyat kolonu boşalmaz.
    const summaries = await readRowSummaries(db, page.rows, {
      categoryNames: names.category,
      warehouseIds: warehouseCtx.visibleWarehouseIds,
      warehouseLabels,
    });
    const products = toProductViews(page.rows, names, summaries);
    return { data: { products, nextCursor: page.nextCursor }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
