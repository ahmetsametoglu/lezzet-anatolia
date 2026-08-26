import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, PriceService, ProductService, StockService, WarehouseService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { ANONYMOUS_BUYER_ID } from '@lezzet/application';
// Beklenen şekil ELLE YAZILMAZ, sözleşmeden gelir: uç bir alanı düşürürse iddia değil DERLEME kırılır.
import type { OnSiteSaleResponse } from '@lezzet/types';
import { app } from '../../app';
import { bearer, createSignedInUser, envelopeData, type SignedInUser } from '../../lib/testing';

/**
 * YERİNDE SATIŞ UCU (21.119) — çivilenen üç KAPI kararı (satışın kendisi `on-site-sale.test`te).
 *
 *  1. **Rol kümesi depo ucundan FARKLI.** Kurye buradan satar ama depo yönlendiricisine giremez —
 *     `DOMAIN §17` satışı malın yanındaki personele veriyor, hazırlık kuyruğunu vermiyor.
 *  2. **Depo GÖVDEDEN gelmiyor**, personelin künyesinden çözülüyor. Kapsam dışı depo istenirse 403;
 *     yani kurye başka bir deponun malını satmayı deneyemiyor.
 *  3. **Kapının kararı ne olursa olsun 200.** Yetersiz stok bir HTTP hatası değil, bir cevaptır:
 *     kalan sayı gövdede gelir ki personel müşteriye "üçü var" diyebilsin.
 */
const db = serviceDb();
const stamp = Date.now();

let kurye: SignedInUser;
let depocu: SignedInUser;
let facilityId: string;
let vehicleId: string;
let baskaDepoId: string;
let variantId: string;
let productId: string;
let categoryId: string;

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  facilityId = (await createTestWarehouse(db)).id;
  baskaDepoId = (await createTestWarehouse(db)).id;
  vehicleId = (await new WarehouseService(db).insert({
    code: `VEHU${stamp % 10000}`, name: `Uç testi aracı ${stamp}`, kind: 'vehicle',
  })).id;

  const category = await new CategoryService(db).create({ name: { tr: `Uç yerinde satış ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Simit ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  await new PriceService(db).insert({ variantId, channel: 'b2c', amountCents: 500 });

  kurye = await createSignedInUser({ prefix: 'sale', label: 'kurye', roles: ['courier'], warehouseIds: [vehicleId] });
  depocu = await createSignedInUser({ prefix: 'sale', label: 'depocu', roles: ['warehouse'], warehouseIds: [facilityId] });
});

beforeEach(async () => {
  await db.from('order').delete().eq('customer_id', ANONYMOUS_BUYER_ID);
  await db.from('stock').delete().eq('variant_id', variantId);
  await new StockService(db).insert({ warehouseId: vehicleId, variantId, physicalQty: 4, expiryDate: dayOffset(20), purchasePriceCents: 200 });
  await new StockService(db).insert({ warehouseId: facilityId, variantId, physicalQty: 9, expiryDate: dayOffset(20), purchasePriceCents: 200 });
});

afterAll(async () => {
  await db.from('order').delete().eq('customer_id', ANONYMOUS_BUYER_ID);
  await purgeTestData(db, {
    productIds: [productId], categoryIds: [categoryId],
    profileIds: [kurye.profileId, depocu.profileId],
    warehouseIds: [facilityId, vehicleId, baskaDepoId],
  });
});

const post = (user: SignedInUser, body: unknown, query = '') =>
  app.request(`/api/v1/sale/on-site${query}`, {
    method: 'POST',
    headers: { ...bearer(user.token), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /sale/on-site', () => {
  it('KURYE satabiliyor — ve sipariş ARACIN deposuna, anonim alıcıya yazılıyor', async () => {
    const res = await post(kurye, { lines: [{ variantId, qty: 2 }], paymentMethod: 'cash' });
    const data = await envelopeData<OnSiteSaleResponse>(res);

    expect(res.status).toBe(200);
    expect(data.status).toBe('ok');
    if (data.status !== 'ok') return;
    expect(data.totalCents).toBe(1000);

    const { data: row } = await db.from('order').select('warehouse_id, customer_id, delivery_type, order_source')
      .eq('id', data.orderId).single();
    expect(row).toMatchObject({
      warehouse_id: vehicleId, customer_id: ANONYMOUS_BUYER_ID, delivery_type: 'pickup', order_source: 'door',
    });
  });

  it('DEPOCU da satabiliyor — aynı kapı, farklı depo', async () => {
    const data = await envelopeData<OnSiteSaleResponse>(await post(depocu, { lines: [{ variantId, qty: 1 }], paymentMethod: 'card' }));
    expect(data.status).toBe('ok');
  });

  it('KAPSAM DIŞI depo istenirse 403 — kurye başka deponun malını satmayı DENEYEMEZ', async () => {
    const res = await post(kurye, { lines: [{ variantId, qty: 1 }], paymentMethod: 'cash' }, `?warehouseId=${baskaDepoId}`);

    expect(res.status).toBe(403);
    // Ve hiçbir şey yazılmadı: reddedilen istek sipariş bırakmaz.
    const { data: rows } = await db.from('order').select('id').eq('customer_id', ANONYMOUS_BUYER_ID);
    expect(rows?.length ?? 0).toBe(0);
  });

  it('YETERSİZ STOK bir HTTP hatası değil, bir CEVAPtır — 200 + kalan sayı', async () => {
    const res = await post(kurye, { lines: [{ variantId, qty: 9 }], paymentMethod: 'cash' });
    const data = await envelopeData<OnSiteSaleResponse>(res);

    expect(res.status).toBe(200);
    expect(data).toMatchObject({ status: 'insufficient_here', lines: [{ available: 4 }] });
  });

  it('kalemsiz gövde ŞEMADA elenir — kapıya hiç ulaşmaz', async () => {
    expect((await post(kurye, { lines: [], paymentMethod: 'cash' })).status).toBe(400);
  });
});
