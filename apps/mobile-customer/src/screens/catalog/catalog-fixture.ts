import { CROP_CENTER } from '@lezzet/types';
import type { CatalogCategory, CatalogProduct } from '@lezzet/types';

/*
  Katalog testlerinin ortak satırları: hook testi tel cevabı, ekran testi hook çıktısı olarak aynı satırları kullanır ki
  `CatalogProduct` bir alan kazanınca ikisi birden derlemede kırılsın. Kimlikler şemanın istediği UUID biçiminde, sonları sayaçlı.
*/

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Satılabilir, tek boylu, fiyatlı ürün — testlerin "normal" satırı. */
export function catalogProduct(index: number, overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: uuid(index),
    slug: `urun-${index}`,
    categoryId: uuid(501),
    name: `Ürün ${index}`,
    image: { url: `https://cdn.test/${index}.jpg`, crop: CROP_CENTER, frames: null },
    unitLabel: '1 kg',
    variantId: uuid(1000 + index),
    variantCount: 1,
    purchaseMode: 'quick',
    priceCents: 1290,
    comparisonCents: 1290,
    comparisonUnit: 'kg',
    limitLabel: null,
    stockId: uuid(2000 + index),
    stockStatus: 'available',
    soldOut: false,
    ...overrides,
  };
}

export function catalogCategory(index: number, slug: string, name: string): CatalogCategory {
  return { id: uuid(500 + index), slug, name, image: { url: null, crop: CROP_CENTER, frames: null } };
}
