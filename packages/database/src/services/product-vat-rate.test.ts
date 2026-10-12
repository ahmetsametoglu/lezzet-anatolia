import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';

/** Ürünün ülke oranı (`product_vat_rate`) kısıtları; satıcının oranı ürünün kendi alanı olduğu için Fransa satırı yazılamaz. */
const db = serviceDb();
let productId: string;
let categoryId: string;

beforeAll(async () => {
  categoryId = (await new CategoryService(db).create({ name: { tr: `Ülke oranı ${Date.now()}` } })).id;
  productId = (await new ProductService(db).create({ name: { tr: `Lokum ${Date.now()}` }, categoryId })).product.id;
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId] });
});

const yaz = (country: string, vatRate: number) =>
  db.from('product_vat_rate').insert({ product_id: productId, country, vat_rate: vatRate });

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
