import type { PriceRow } from '@/lib/pricing/price-rows';
import type { StockLevelRow } from '@/lib/stock/level-rows';
import type { ProductPriceSummary, ProductStockSummary } from './products-types';

// Liste satırının stok ve fiyat özetleri — SAF türevler, sunucu modülü sürüklemezler.
//
// Ayrı dosya olmalarının sebebi İSTEMCİ: fiyat yazıldıktan sonra satırın özeti yeniden okunmadan
// düzeltiliyor ve o düzeltme aynı kuralı kullanmak zorunda. `products-read` veritabanı servislerini
// import ediyor, yani istemciye giremez; kural orada kalsaydı ikinci bir kopyası doğardı.

/**
 * Boy satırlarını ÜRÜN özetine toplar. Kaynak `toLevelRows`tur: "asgari eşiğin altında" kararı
 * orada yaşar ve liste onu yeniden hesaplamaz. Depo sayısı malı OLAN depolardan sayılır — satırın
 * kırılımı (`warehouses`) zaten boş depoyu taşımaz.
 */
export function summarizeStock(rows: readonly StockLevelRow[]): Map<string, ProductStockSummary> {
  const byProduct = new Map<string, { availableQty: number; warehouses: Set<string>; belowMin: boolean }>();
  for (const row of rows) {
    const acc = byProduct.get(row.productId) ?? { availableQty: 0, warehouses: new Set<string>(), belowMin: false };
    acc.availableQty += row.availableQty;
    acc.belowMin = acc.belowMin || row.belowMin;
    for (const split of row.warehouses) {
      if (split.availableQty > 0) acc.warehouses.add(split.warehouseId);
    }
    byProduct.set(row.productId, acc);
  }
  return new Map(
    [...byProduct].map(([productId, acc]) => [
      productId,
      { availableQty: acc.availableQty, warehouseCount: acc.warehouses.size, belowMin: acc.belowMin },
    ]),
  );
}

/**
 * Ürünün BİRİNCİL boyu: ilk AKTİF boy, hiç aktif yoksa ilk boy. Liste satırının gösterdiği fiyat
 * odur; fiyat yazıldığında satırın değişip değişmeyeceği de buna bakar (başka boyun fiyatı liste
 * satırını değiştirmez). Ölçüt TEK yerde, yoksa iki taraf başka boyu birincil sayardı.
 */
export function primaryOf<T>(items: readonly T[], isActive: (item: T) => boolean): T | undefined {
  return items.find(isActive) ?? items[0];
}

/**
 * Fiyat satırlarını ürünün birincil boyuna indirger. Marj ve hedef karşılaştırması satırdan OLDUĞU
 * GİBİ alınır — fiyat ekranıyla aynı tanım, burada yeniden hesap yok.
 */
export function summarizePrices(rows: readonly PriceRow[]): Map<string, ProductPriceSummary> {
  const byProduct = new Map<string, PriceRow[]>();
  for (const row of rows) {
    const list = byProduct.get(row.productId);
    if (list) list.push(row);
    else byProduct.set(row.productId, [row]);
  }

  return new Map(
    [...byProduct].flatMap(([productId, list]) => {
      const row = primaryOf(list, (candidate) => candidate.variantActive);
      if (!row) return [];
      return [
        [
          productId,
          {
            variantId: row.variantId,
            b2cCents: row.b2c.amountCents,
            b2bCents: row.b2b.amountCents,
            marginPercent: row.marginPercent,
            belowTarget: row.belowTarget,
            autoPrice: row.autoPrice,
          } satisfies ProductPriceSummary,
        ],
      ];
    }),
  );
}
