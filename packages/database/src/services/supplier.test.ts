import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { SupplierProductService, SupplierService } from './supplier.service';

/**
 * Tedarikçi + kod tekildir ve harf farkı tekilliği aşmaz (`supplier_product_code_key`, `lower`). Anahtarın türetilmesi ve adla
 * eşleşme saf kuraldır, testi `domain-core`daki `supplier-item-key.test.ts`te.
 */
const db = serviceDb();
const stamp = Date.now();
let categoryId = '';
let productId = '';
let supplierId = '';
let variantA = '';
let variantB = '';

beforeAll(async () => {
  const category = await new CategoryService(db).create({ name: { tr: `Eşleme testi ${stamp}` } });
  categoryId = category.id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Eşleme ürünü ${stamp}` },
    categoryId,
    variants: [
      { label: { tr: '500 g' }, netQuantity: 500, netUnit: 'g', minStockQty: 0 },
      { label: { tr: '1 kg' }, netQuantity: 1000, netUnit: 'g', minStockQty: 0 },
    ],
  });
  productId = product.id;
  variantA = variants[0]!.id;
  variantB = variants[1]!.id;
  supplierId = (await new SupplierService(db).insert({ name: `Eşleme tedarikçisi ${stamp}` })).id;
});

// Tedarikçi silinince eşlemeleri, ürün silinince varyantları FK ile düşer.
afterAll(async () => {
  await purgeTestData(db, {
    supplierIds: [supplierId].filter(Boolean),
    productIds: [productId].filter(Boolean),
    categoryIds: [categoryId].filter(Boolean),
  });
});

describe('tedarikçi kalem anahtarı — tekillik', () => {
  it('aynı tedarikçide aynı anahtar iki varyanta bağlanamaz — harf farkı da kurtarmaz', async () => {
    const service = new SupplierProductService(db);
    await service.setMapping({ supplierId, variantId: variantA, supplierCode: 'BEH-1', nameAtSupplier: 'Tahini 500gr' });
    await expect(
      service.setMapping({ supplierId, variantId: variantB, supplierCode: 'beh-1', nameAtSupplier: 'Tahini 1kg' }),
    ).rejects.toThrow();
  });
});
