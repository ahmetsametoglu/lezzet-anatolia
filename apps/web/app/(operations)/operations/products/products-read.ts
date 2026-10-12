import { publicImageUrl } from '@lezzet/storage';
import { frameSourcesOf, readCostBasis, thumbnailImageUrl } from '@lezzet/application';
import { PriceService, StockService, type Db } from '@lezzet/database';
import { titleOf } from '@/lib/catalog/title';
import { resolveLocalizedText, type BundleListRow, type ProductWithRelations } from '@lezzet/types';
import { toChannelMaps, toPriceRows } from '@/lib/pricing/price-rows';
import { toLevelRows } from '@/lib/stock/level-rows';
import { summarizePrices, summarizeStock } from './products-summary';
import type { BundleView, ProductPriceSummary, ProductStockSummary, ProductView } from './products-types';

// Sunucu-tarafı okuma yardımcıları. Ürün sayfası İKİ yerden okunur — ilk sayfa RSC'de (page.tsx),
// devamı action'da (actions/list.ts) — ve ikisi de aynı indirgemeyi yapar: public görsel URL'i +
// çözülmüş kategori/koleksiyon adları. O indirgeme burada TEK yerde durur (no-duplication).

/** Ad çözüm sözlükleri — çağıran zaten elinde olanı geçer, ikinci kez okunmaz. */
interface NameMaps {
  category: Map<string, string>;
  collection: Map<string, string>;
}

/**
 * DB satırlarını client'ın gördüğü view-model'e indirger. `collections` (üyelik id'leri) DIŞARIDA
 * bırakılır: client adları görür, id'leri değil — gereksiz yük tele gitmesin.
 *
 * Görsel URL'i public bucket'tan saf string birleştirmeyle kurulur (05.11) — async değil, ağ turu
 * yok, sonuç sabit ve cache'lenebilir. Sürüm damgası `imageUpdatedAt`'ten gelir.
 */
/** Paket ÖZET satırlarını view-model'e indirger (kalem taşımaz; bkz. `bundle_list_rows()`). */
export function toBundleViews(rows: BundleListRow[]): BundleView[] {
  return rows.map((bundle) => ({
    ...bundle,
    imageUrl: publicImageUrl(bundle.imageKey, bundle.imageUpdatedAt),
    frames: frameSourcesOf(bundle),
    // Ad çözümü BURADA: okuma fonksiyonu ham jsonb döndürüyor, dil yedek zinciri (TR→FR→DE) tek
    // yerde kalsın diye SQL'e kopyalanmadı. Sıra kalemin `sortOrder`'ı (fonksiyon öyle topluyor).
    itemLabels: bundle.itemNames.map(({ p, v }) => titleOf(resolveLocalizedText(p), v ? resolveLocalizedText(v) : '')),
  }));
}

// `toVariantOptions` BURADAN TAŞINDI (22.18) → `@/lib/catalog/variant-options`. Tek çağıranı paket
// eylemleriydi ve o eylemler ortak alana çıktı (kuyruk da aynı formu açıyor); türev onlarla gitti.

/**
 * Satıra iliştirilen ÖZETLER — ürün kimliğiyle anahtarlı. Haritada karşılığı olmayan ürün `null`
 * alır: "okunmadı" ile "sıfır" aynı şey değildir (CLAUDE §1) ve fiyat yalnız yöneticide okunur.
 */
export interface ProductSummaries {
  stock?: ReadonlyMap<string, ProductStockSummary>;
  price?: ReadonlyMap<string, ProductPriceSummary>;
}

/** Özet okumasının bağlamı — çağıran zaten elinde olanı geçer, ikinci kez okunmaz. */
interface SummaryDeps {
  categoryNames: Map<string, string>;
  /** Stok kırılımının evreni (odak depo varsa yalnız o) — `readWarehouseContext().visibleWarehouseIds`. */
  warehouseIds: readonly string[];
  warehouseLabels: Map<string, { id: string; code: string; name: string }>;
}

/**
 * Satır özetlerinin TEK kurulumu: ilk sayfa (RSC) ile sonraki sayfalar (action) aynı sayıları
 * üretsin diye burada durur. Okuma VERİLEN BOYLARLA sınırlıdır — dört sorgu, satır sayısıyla
 * artmaz; parti çekilmez, çünkü son tarih satır açılınca kendi turunda gelir.
 */
export async function readRowSummaries(db: Db, rows: ProductWithRelations[], deps: SummaryDeps): Promise<ProductSummaries> {
  const variantIds = rows.flatMap((row) => row.variants.map((variant) => variant.id));
  const priceSvc = new PriceService(db);
  const [available, b2c, b2b, costs] = await Promise.all([
    variantIds.length > 0 ? new StockService(db).listAvailableAcross(deps.warehouseIds, variantIds) : [],
    priceSvc.findApplicableMap(variantIds, 'b2c'),
    priceSvc.findApplicableMap(variantIds, 'b2b'),
    readCostBasis(db, variantIds),
  ]);

  return {
    // `batches: []` BİLİNÇLİ: parti okunmadı ve bu özet yalnız miktar ile eşik alanlarını kullanır.
    // Eşik ağ toplamına bakar (odak depo geçilmiyor) — burası bir tarama listesidir, depo bazlı
    // sipariş kararı Tedarik ekranının işi (`toLevelRows` künyesi).
    stock: summarizeStock(
      toLevelRows({ products: rows, batches: [], available, categoryNames: deps.categoryNames, warehouseLabels: deps.warehouseLabels }),
    ),
    price: summarizePrices(toPriceRows({ products: rows, prices: toChannelMaps(b2c, b2b), costs, categoryNames: deps.categoryNames })),
  };
}

export function toProductViews(rows: ProductWithRelations[], names: NameMaps, summaries: ProductSummaries = {}): ProductView[] {
  return rows.map((row) => {
    const { collections, ...product } = row;
    return {
      ...product,
      imageUrl: publicImageUrl(product.imageKey, product.imageUpdatedAt),
      thumbUrl: thumbnailImageUrl(product),
      categoryName: product.categoryId ? (names.category.get(product.categoryId) ?? '—') : '—',
      collectionNames: collections.map((c) => names.collection.get(c.collectionId) ?? '').filter(Boolean),
      stock: summaries.stock?.get(product.id) ?? null,
      price: summaries.price?.get(product.id) ?? null,
    };
  });
}
