import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { PriceService } from './price.service';
import { ProductService } from './product.service';
import { ProductVatRateService } from './product-vat-rate.service';

/** Ürünün ülke oranı (`product_vat_rate`): veri kısıtları, servis yazımı ve ürün okumalarının oranı taşıması. */
const db = serviceDb();
const products = new ProductService(db);
const rates = new ProductVatRateService(db);
let productId: string;
let slug: string;
let categoryId: string;
const extraProductIds: string[] = [];

beforeAll(async () => {
  categoryId = (await new CategoryService(db).create({ name: { tr: `Ülke oranı ${Date.now()}` } })).id;
  const { product } = await products.create({ name: { tr: `Lokum ${Date.now()}` }, categoryId });
  productId = product.id;
  slug = product.slug;
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId, ...extraProductIds], categoryIds: [categoryId] });
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

/** Operasyonun "Almanya oranı eksik" süzgeci; süzgeç gömülü ilişkinin yokluğundan okunur ve ilişkiyi her projeksiyon seçmelidir. */
describe('ürün süzgeci — ülke oranı eksik', () => {
  // Oranı olan ürün süzgeçte kalırsa, sayaç listeden ayrılırsa ya da dar okumalardan biri süzgeçle düşerse kırmızıya döner.
  it('yalnız o ülkenin oranı olmayan ürünler gelir; liste, sayaç ve dar okumalar aynı kümeyi verir', async () => {
    const { product: oransiz } = await products.create({ name: { tr: `Oransız lokum ${Date.now()}` }, categoryId });
    extraProductIds.push(oransiz.id);
    await rates.set({ productId, country: 'DE', vatRate: 7 });

    const filters = { categoryId, missingCountryRate: 'DE' as const };
    const ids = (page: { rows: Array<{ id: string }> }) => page.rows.map((row) => row.id);
    expect(ids(await products.listWithRelations({ filters }))).toEqual([oransiz.id]);
    expect(ids(await products.list({ filters }))).toEqual([oransiz.id]);
    expect(ids(await products.listPriceRows({ filters }))).toEqual([oransiz.id]);
    expect(ids(await products.listStockRows({ filters }))).toEqual([oransiz.id]);
    expect(await products.countMatching(filters)).toBe(1);
    expect(await products.countMatching({ categoryId })).toBe(2);
  });
});

/** Fiyat ekranının "Almanya fiyatı olan" süzgeci; ülke satırı boyun fiyatındadır, süzgeç iç birleşimli iki gömmeden okunur. */
describe('ürün süzgeci — ülke fiyatı olan', () => {
  // Ülke satırı olmayan ürün süzgeçte kalırsa, sayaç listeden ayrılırsa ya da dar okumalardan biri süzgeçle düşerse kırmızıya döner.
  it('yalnız o ülkeye özel fiyat satırı olan boyu bulunan ürünler gelir; liste, sayaç ve dar okumalar aynı kümeyi verir', async () => {
    const prices = new PriceService(db);
    const almanyaFiyatli = await products.create({ name: { tr: `Almanya fiyatlı ${Date.now()}` }, categoryId });
    const genelFiyatli = await products.create({ name: { tr: `Genel fiyatlı ${Date.now()}` }, categoryId });
    extraProductIds.push(almanyaFiyatli.product.id, genelFiyatli.product.id);
    await prices.setPrice({ variantId: almanyaFiyatli.variants[0]!.id, channel: 'b2c', amountCents: 1200 });
    await prices.setPrice({ variantId: almanyaFiyatli.variants[0]!.id, channel: 'b2c', amountCents: 1290, country: 'DE' });
    await prices.setPrice({ variantId: genelFiyatli.variants[0]!.id, channel: 'b2c', amountCents: 1200 });

    const filters = { categoryId, hasCountryPrice: 'DE' as const };
    const ids = (page: { rows: Array<{ id: string }> }) => page.rows.map((row) => row.id);
    const beklenen = [almanyaFiyatli.product.id];
    expect(ids(await products.listPriceRows({ filters }))).toEqual(beklenen);
    expect(ids(await products.listWithRelations({ filters }))).toEqual(beklenen);
    expect(ids(await products.list({ filters }))).toEqual(beklenen);
    expect(ids(await products.listStockRows({ filters }))).toEqual(beklenen);
    expect(await products.countMatching(filters)).toBe(1);
  });
});
