import { describe, expect, it } from 'vitest';
import type { PriceRow } from '@/lib/pricing/price-rows';
import type { StockLevelRow } from '@/lib/stock/level-rows';
import { summarizePrices, summarizeStock } from './products-read';

// Liste satırının stok ve fiyat özetleri — ikisi de SESSİZCE yanlış olabilen kararlar taşıyor:
// hangi boyun fiyatı yazılıyor ve kaç depo sayılıyor. Yanlışlık ekranda hata vermez, sadece başka
// bir sayı gösterir; bu yüzden testleri var. Satır kurucuları yalnız özetin OKUDUĞU alanları
// anlamlı doldurur, kalanı o okumanın umursamadığı doldurma değerlerdir.

function stockRow(over: Partial<StockLevelRow> & Pick<StockLevelRow, 'productId' | 'variantId'>): StockLevelRow {
  return {
    productName: 'Ürün',
    variantLabel: '1 kg',
    title: 'Ürün · 1 kg',
    imageUrl: null,
    categoryName: '—',
    status: 'active',
    variantActive: true,
    physicalQty: 0,
    reservedQty: 0,
    availableQty: 0,
    minStockQty: null,
    belowMin: false,
    depotThreshold: null,
    warehouses: [],
    batches: [],
    nearest: null,
    attentionCount: 0,
    ...over,
  };
}

function split(warehouseId: string, availableQty: number): StockLevelRow['warehouses'][number] {
  return { warehouseId, code: warehouseId, name: warehouseId, physicalQty: availableQty, reservedQty: 0, availableQty, nearestExpiry: null };
}

function priceRow(over: Partial<PriceRow> & Pick<PriceRow, 'productId' | 'variantId'>): PriceRow {
  const cell = { amountCents: null, validFrom: null } as PriceRow['b2c'];
  return {
    productName: 'Ürün',
    variantLabel: '1 kg',
    title: 'Ürün · 1 kg',
    imageUrl: null,
    categoryName: '—',
    status: 'active',
    variantActive: true,
    b2c: cell,
    b2b: cell,
    costCents: null,
    marginPercent: null,
    marginChannel: null,
    targetMarginPercent: null,
    targetMarginB2bPercent: null,
    belowTarget: null,
    autoPrice: false,
    costJump: null,
    vatRate: 5.5,
    missingPrice: false,
    ...over,
  };
}

describe('summarizeStock', () => {
  it('boyları toplar ve yalnız MALI OLAN depoyu sayar', () => {
    const summary = summarizeStock([
      stockRow({ productId: 'p1', variantId: 'v1', availableQty: 15, warehouses: [split('STR', 10), split('COL', 5)] }),
      // Aynı deponun ikinci boyu depo sayısını artırmamalı; stoğu biten depo hiç sayılmamalı.
      stockRow({ productId: 'p1', variantId: 'v2', availableQty: 4, warehouses: [split('STR', 4), split('KEHL', 0)] }),
    ]);

    expect(summary.get('p1')).toEqual({ availableQty: 19, warehouseCount: 2, belowMin: false });
  });

  it('tek boy eşiğin altındaysa ürün uyarılı sayılır', () => {
    const summary = summarizeStock([
      stockRow({ productId: 'p1', variantId: 'v1', availableQty: 40, warehouses: [split('STR', 40)] }),
      stockRow({ productId: 'p1', variantId: 'v2', availableQty: 2, minStockQty: 10, belowMin: true, warehouses: [split('STR', 2)] }),
    ]);

    expect(summary.get('p1')?.belowMin).toBe(true);
  });
});

describe('summarizePrices', () => {
  it('ürünün İLK AKTİF boyunu gösterir, pasif boy satırın fiyatını belirlemez', () => {
    const summary = summarizePrices([
      priceRow({ productId: 'p1', variantId: 'v1', variantActive: false, b2c: { amountCents: 999, validFrom: null } }),
      priceRow({ productId: 'p1', variantId: 'v2', variantActive: true, b2c: { amountCents: 3490, validFrom: null } }),
      priceRow({ productId: 'p1', variantId: 'v3', variantActive: true, b2c: { amountCents: 1890, validFrom: null } }),
    ]);

    expect(summary.get('p1')?.b2cCents).toBe(3490);
  });

  it('hiç aktif boy yoksa ilk satıra düşer — satır fiyatsız kalmaz', () => {
    const summary = summarizePrices([
      priceRow({ productId: 'p2', variantId: 'v1', variantActive: false, b2c: { amountCents: 1200, validFrom: null } }),
      priceRow({ productId: 'p2', variantId: 'v2', variantActive: false, b2c: { amountCents: 800, validFrom: null } }),
    ]);

    expect(summary.get('p2')?.b2cCents).toBe(1200);
  });

  it('marj ve hedef karşılaştırması satırdan olduğu gibi taşınır', () => {
    const summary = summarizePrices([
      priceRow({ productId: 'p3', variantId: 'v1', marginPercent: 28.4, belowTarget: true, autoPrice: true }),
    ]);

    expect(summary.get('p3')).toMatchObject({ marginPercent: 28.4, belowTarget: true, autoPrice: true });
  });
});
