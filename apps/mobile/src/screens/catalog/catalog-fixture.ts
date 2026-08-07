import { CROP_CENTER } from '@lezzet/types';
import type { CatalogCategory, CatalogProduct } from '@lezzet/types';

/*
  KATALOG TEST VERİSİ — hook testi (tel cevabı olarak) ve ekran testi (hook çıktısı olarak) AYNI
  satırları kullanır. Tek yerde durmasının sebebi sözleşmenin kendisi: `CatalogProduct` bir alan
  kazandığında iki test birden derlemede kırılsın ve ikisi de güncellensin — ayrı ayrı yazılmış iki
  yer tutucudan biri mutlaka eskir.

  Kimlikler UUID biçiminde çünkü şema öyle istiyor (`ProductSchema.id`); okunabilir olsunlar diye
  sonları sayaçlı.
*/

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Satılabilir, tek boylu, fiyatlı ürün — testlerin "normal" satırı. */
export function catalogProduct(index: number, overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: uuid(index),
    slug: `urun-${index}`,
    name: `Ürün ${index}`,
    image: { url: `https://cdn.test/${index}.jpg`, crop: CROP_CENTER },
    unitLabel: '1 kg',
    variantId: uuid(1000 + index),
    variantCount: 1,
    purchaseMode: 'quick',
    priceCents: 1290,
    comparisonCents: 1290,
    limitLabel: null,
    stockId: uuid(2000 + index),
    stockStatus: 'available',
    soldOut: false,
    ...overrides,
  };
}

export function catalogCategory(index: number, slug: string, name: string): CatalogCategory {
  return { id: uuid(500 + index), slug, name, image: { url: null, crop: CROP_CENTER } };
}
