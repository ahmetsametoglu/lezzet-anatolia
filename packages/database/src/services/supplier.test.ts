import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { matchSupplierItem, supplierItemKeyOf } from '@lezzet/domain-core';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { SupplierProductService, SupplierService } from './supplier.service';

/**
 * Tedarikçi kalem anahtarı (06.16 · kullanıcı kararı 14.09): tedarikçi + kod TEKİL
 * (`supplier_product_code_key`, `lower`) ve kodsuz eşleme adın slug'ıyla bulunur. Tekillik testi yeni
 * indeksi ister — `db:refresh` sonrası yeşil; ondan önce kırmızı olması indeksin yokluğunu ölçer.
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
      { label: { tr: '500 g' }, netWeightG: 500, minStockQty: 0 },
      { label: { tr: '1 kg' }, netWeightG: 1000, minStockQty: 0 },
    ],
  });
  productId = product.id;
  variantA = variants[0]!.id;
  variantB = variants[1]!.id;
  supplierId = (await new SupplierService(db).insert({ name: `Eşleme tedarikçisi ${stamp}` })).id;
});

// Temizlik ORTAK yardımcıyla (`CLAUDE §4b`): tedarikçi silinince eşlemeleri FK ile düşer, ürün silinince varyantlar.
afterAll(async () => {
  await purgeTestData(db, {
    supplierIds: [supplierId].filter(Boolean),
    productIds: [productId].filter(Boolean),
    categoryIds: [categoryId].filter(Boolean),
  });
});

describe('tedarikçi kalem anahtarı — tekillik ve adla eşleşme (06.16)', () => {
  it('aynı tedarikçide aynı anahtar iki varyanta bağlanamaz — harf farkı da kurtarmaz', async () => {
    const service = new SupplierProductService(db);
    await service.setMapping({ supplierId, variantId: variantA, supplierCode: 'BEH-1', nameAtSupplier: 'Tahini 500gr' });
    await expect(
      service.setMapping({ supplierId, variantId: variantB, supplierCode: 'beh-1', nameAtSupplier: 'Tahini 1kg' }),
    ).rejects.toThrow();
  });

  it("kodsuz eşleme adın slug'ıyla yazılır ve tedarikçinin listesinden tam adla bulunur", async () => {
    const service = new SupplierProductService(db);
    const key = supplierItemKeyOf(null, 'Druivenmelasse 650gr');
    expect(key).toBe('druivenmelasse-650gr');
    await service.setMapping({ supplierId, variantId: variantB, supplierCode: key!, nameAtSupplier: 'Druivenmelasse 650gr' });

    const mappings = await service.listBySupplier(supplierId);
    expect(matchSupplierItem(mappings, { name: 'DRUIVENMELASSE 650GR' })).toMatchObject({ status: 'found', record: { variantId: variantB } });
    expect(matchSupplierItem(mappings, { name: 'Druivenmelasse' })).toEqual({ status: 'none' });
    expect(matchSupplierItem(mappings, { code: 'beh-1' })).toMatchObject({ status: 'found', record: { variantId: variantA } });
  });
});
