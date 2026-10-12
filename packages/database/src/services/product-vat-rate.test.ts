import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { ProductVatRateService } from './product-vat-rate.service';

/** Ürünün ülke oranı (`product_vat_rate`): veri kısıtları, servis yazımı ve ürün okumalarının oranı taşıması. */
const db = serviceDb();
const products = new ProductService(db);
const rates = new ProductVatRateService(db);
let productId: string;
let slug: string;
let categoryId: string;

beforeAll(async () => {
  categoryId = (await new CategoryService(db).create({ name: { tr: `Ülke oranı ${Date.now()}` } })).id;
  const { product } = await products.create({ name: { tr: `Lokum ${Date.now()}` }, categoryId });
  productId = product.id;
  slug = product.slug;
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId] });
});

const yaz = (country: string, vatRate: number) =>
  db.from('product_vat_rate').insert({ product_id: productId, country, vat_rate: vatRate });

/** Satıcının oranı ürünün kendi alanı olduğu için Fransa satırı yazılamaz. */
describe('ürünün ülke KDV oranı — veri kısıtı', () => {
  it('Fransa satırı yazılamaz — satıcının oranı ürünün kendi alanıdır', async () => {
    expect((await yaz('FR', 5.5)).error?.code).toBe('23514');
  });

  it('eksi oran yazılamaz', async () => {
    expect((await yaz('DE', -1)).error?.code).toBe('23514');
  });

  it('Almanya oranı yazılır', async () => {
    expect((await yaz('DE', 7)).error).toBeNull();
  });
});

describe('ProductVatRateService', () => {
  it('aynı ülkeye ikinci yazım oranı değiştirir, satır çoğalmaz', async () => {
    await rates.set({ productId, country: 'DE', vatRate: 19 });
    await rates.set({ productId, country: 'DE', vatRate: 7 });

    expect(await rates.listByProducts([productId])).toEqual([{ productId, country: 'DE', vatRate: 7 }]);
  });

  /** Form ve satılabilirlik kararı oranı ürün okumasından alır; gömme düşerse ürün Almanya'da oransız görünür. */
  it('ürün listesi ve slug okuması oranı sayı olarak taşır', async () => {
    await rates.set({ productId, country: 'DE', vatRate: 7 });

    const [row] = (await products.listWithRelations({ filters: { ids: [productId] }, limit: 1 })).rows;
    expect(row?.countryRates).toEqual([{ country: 'DE', vatRate: 7 }]);
    expect((await products.findBySlug(slug))?.countryRates).toEqual([{ country: 'DE', vatRate: 7 }]);
  });

  it('kaldırılan oran okumadan düşer', async () => {
    await rates.set({ productId, country: 'DE', vatRate: 7 });
    await rates.remove(productId, 'DE');

    expect(await rates.listByProducts([productId])).toEqual([]);
    expect((await products.findBySlug(slug))?.countryRates).toEqual([]);
  });
});
