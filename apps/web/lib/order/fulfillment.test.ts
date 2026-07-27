import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CategoryService, OrderService, ProductService, ReservationService, StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { closeOrder, deliverOrder } from './fulfillment';
import { transitionOrder } from './transition';

/**
 * Teslim ve kapanış (07.7) — zincirin son halkası. Uçtan uca: sipariş → ayır → hazırla → teslim →
 * kapan. Doğrulanan şey **fiziksel gerçek** (stok tam bir kez düşer) ve **kâr snapshot'ı**.
 */
const db = serviceDb();
const orders = new OrderService(db);
const stocks = new StockService(db);
const reservations = new ReservationService(db);

const damga = Date.now();
let customerId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let partiA: string;
let partiB: string;
const acilanProfiller: string[] = [];

const gun = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  const category = await new CategoryService(db).create({ name: { tr: `Teslim testi ${damga}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Yaprak sarma ${damga}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  const profile = await new UserProfileService(db).insert({ name: `Teslim müşterisi ${damga}` });
  customerId = profile.id;
  acilanProfiller.push(profile.id);
});

beforeEach(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('reservation').delete().eq('variant_id', variantId);
  await db.from('stock').delete().eq('variant_id', variantId);
  partiA = (await stocks.insert({ variantId, physicalQty: 4, expiryDate: gun(20), purchasePrice: 2 })).id;
  partiB = (await stocks.insert({ variantId, physicalQty: 10, expiryDate: gun(200), purchasePrice: 3 })).id;
});

afterAll(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: acilanProfiller });
});

/** Sipariş aç → ayır → hazırla → yola çıkar. Teslime hazır hâle getirir. */
async function yolaCikar(picks: { stockId: string; qty: number }[]) {
  const toplam = picks.reduce((s, p) => s + p.qty, 0);
  const { order, items } = await orders.create(
    { customerId, channel: 'b2c', deliveryType: 'route' },
    [{ variantId, qty: toplam, unitPrice: 10, vatRate: 5.5 }],
  );
  await reservations.reserve({ orderId: order.id, variantId, qty: toplam });
  for (const durum of ['confirmed', 'preparing'] as const) await transitionOrder({ orderId: order.id, to: durum });
  await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: picks }]);
  for (const durum of ['ready', 'out_for_delivery'] as const) await transitionOrder({ orderId: order.id, to: durum });
  return order;
}

describe('teslim (07.7)', () => {
  it('fiili stok kayıtlı partilerden düşer, rezervasyon biter', async () => {
    const order = await yolaCikar([{ stockId: partiA, qty: 4 }, { stockId: partiB, qty: 2 }]);

    const sonuc = await deliverOrder(order.id, { deliveryProof: { by: 'Kurye', at: '2026-07-27' } });
    expect(sonuc).toMatchObject({ ok: true, currentStatus: 'delivered', consumedQty: 6 });

    expect((await stocks.getById(partiA))?.physicalQty).toBe(0); // 4 − 4
    expect((await stocks.getById(partiB))?.physicalQty).toBe(8); // 10 − 2
    expect(await reservations.listActiveByOrder(order.id)).toHaveLength(0);
    expect((await orders.getById(order.id))?.deliveryProof).toMatchObject({ by: 'Kurye' });
  });

  it('yolda olmayan sipariş teslim edilemez — stok DEĞİŞMEZ', async () => {
    const { order } = await orders.create({ customerId, channel: 'b2c' }, [{ variantId, qty: 1, unitPrice: 10, vatRate: 5.5 }]);

    const sonuc = await deliverOrder(order.id);
    expect(sonuc).toMatchObject({ ok: false, reason: 'stale', currentStatus: 'draft' });
    expect((await stocks.getById(partiA))?.physicalQty).toBe(4);
  });

  it('iki kez teslim stoğu İKİ KEZ düşürmez', async () => {
    const order = await yolaCikar([{ stockId: partiB, qty: 3 }]);
    await deliverOrder(order.id);

    const ikinci = await deliverOrder(order.id);
    expect(ikinci.ok).toBe(false); // artık 'delivered', yolda değil
    expect((await stocks.getById(partiB))?.physicalQty).toBe(7); // tek düşüm
  });

  it('hiç hazırlanmamış sipariş teslim edilirse stok düşmez ama teslim kaydı yazılır', async () => {
    const { order, items } = await orders.create(
      { customerId, channel: 'b2c' },
      [{ variantId, qty: 2, unitPrice: 10, vatRate: 5.5 }],
    );
    for (const d of ['confirmed', 'preparing'] as const) await transitionOrder({ orderId: order.id, to: d });
    await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [] }]); // hiç çıkmadı
    for (const d of ['ready', 'out_for_delivery'] as const) await transitionOrder({ orderId: order.id, to: d });

    expect(await deliverOrder(order.id)).toMatchObject({ ok: true, consumedQty: 0 });
    expect((await stocks.getById(partiA))?.physicalQty).toBe(4);
  });
});

describe('kapanış — kâr kalemleri sabitlenir (DOMAIN §12)', () => {
  it('COGS GERÇEK maliyettir: her parti kendi alış fiyatından', async () => {
    const order = await yolaCikar([{ stockId: partiA, qty: 4 }, { stockId: partiB, qty: 2 }]);
    await deliverOrder(order.id);

    const sonuc = await closeOrder(order.id);
    expect(sonuc.ok).toBe(true);
    expect(sonuc.cogsAmount).toBe(14); // 4×2 + 2×3 — ortalama olsaydı 15 çıkardı
  });

  it('rota-içinde teslimat birim maliyeti, paketleme maliyeti ayardan gelir', async () => {
    const order = await yolaCikar([{ stockId: partiB, qty: 1 }]);
    await deliverOrder(order.id);

    const sonuc = await closeOrder(order.id);
    expect(sonuc.deliveryCost).toBe(2.5); // route_delivery_unit_cost_cents = 250
    expect(sonuc.packagingCost).toBe(1.2); // packaging_unit_cost_cents = 120

    const kapanan = await orders.getById(order.id);
    expect(kapanan).toMatchObject({ status: 'completed', cogsAmount: 3, deliveryCost: 2.5 });
    expect(kapanan?.paymentFee).toBeNull(); // komisyon oranları modül 12'de
  });

  it('teslim edilmemiş sipariş kapanamaz', async () => {
    const order = await yolaCikar([{ stockId: partiB, qty: 1 }]);
    expect(await closeOrder(order.id)).toMatchObject({ ok: false, reason: 'stale', currentStatus: 'out_for_delivery' });
  });
});
