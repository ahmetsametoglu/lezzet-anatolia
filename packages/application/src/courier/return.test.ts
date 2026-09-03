import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CategoryService,
  OrderBoxService,
  OrderService,
  ProductService,
  ReservationService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeOrdersBy, purgeTestData, purgeVariantStock } from '@lezzet/database/testing';
import type { WarehouseScope } from '@lezzet/domain-core';
import { advanceOrder } from '../order/advance.testkit';
import { openBox, sealBox } from '../warehouse/boxes';
import { loadBox } from './load';
import { acceptCourierReturn, readCourierReturn } from './return';
import { readVanStock } from './van-stock';

/**
 * **KURYE DÖNÜŞÜ — SAY VE DEVRET · KUTU İNİŞİ** (v3:14 · kurye denetimi bulgu 5, 03.09).
 *
 * Üç iddia: (1) taslak araçtaki serbest ürünü BEKLENEN olarak, reddedilen siparişin kutusunu İNEN,
 * ulaşılamayanınkini KALAN olarak listeler; (2) kabul sayılan döneni araçtan depoya TRANSFER eder,
 * eksiği `shortfalls`ta söyler ve reddedilen kutunun damgasını siler — ulaşılamayanınkine dokunmaz;
 * (3) beklenenden fazla dönen `not_enough` ile geri çevrilir (araçta o kadar mal kayıtlı değil).
 */
const db = serviceDb();
const orders = new OrderService(db);
const boxes = new OrderBoxService(db);
const stocks = new StockService(db);
const reservations = new ReservationService(db);

const stamp = Date.now();
const today = new Date().toISOString().slice(0, 10);
const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

let facilityId: string;
let vanId: string;
let courierId: string;
let customerId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let facilityStockId: string;

beforeAll(async () => {
  facilityId = (await createTestWarehouse(db, { label: 'DONUS-TESIS' })).id;
  vanId = (await createTestWarehouse(db, { label: 'DONUS-VAN', kind: 'vehicle' })).id;

  const category = await new CategoryService(db).create({ name: { tr: `Dönüş testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Kadayıf ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '500 g' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  const profiles = new UserProfileService(db);
  courierId = (await profiles.insert({ name: 'Kurye Dönüş', email: `donus-${stamp}@example.test`, roles: ['courier'], warehouseIds: [facilityId, vanId] })).id;
  customerId = (await profiles.insert({ name: 'Dönüş Müşterisi', email: `donus-musteri-${stamp}@example.test` })).id;

  // Tesiste parti (siparişlerin kutuları buradan mühürlenir) + araçta serbest ürün (5 adet).
  facilityStockId = (await stocks.insert({ warehouseId: facilityId, variantId, physicalQty: 40, expiryDate: dayOffset(60), purchasePriceCents: 300 })).id;
  await stocks.insert({ warehouseId: vanId, variantId, physicalQty: 5, expiryDate: dayOffset(60), purchasePriceCents: 300 });
});

afterAll(async () => {
  // Sıra: sipariş → parti → depo (purge transferleri depo adımında kendisi topluyor — cleanup 0c).
  await purgeOrdersBy(db, 'customer_id', [customerId]);
  await purgeVariantStock(db, [variantId]);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: [courierId, customerId],
    warehouseIds: [facilityId, vanId],
  });
});

/** Kuryeye damgalı, tek kutulu, kutusu ARAÇTA sipariş — istenen durumda. */
async function loadedOrder(finalPath: readonly ('out_for_delivery' | 'returned' | 'ready')[]): Promise<{ orderId: string; code: string }> {
  const { order, items } = await orders.create(
    { warehouseId: facilityId, customerId, channel: 'b2c', deliveryType: 'route', deliveryDate: today, courierId, paymentMethod: 'cash', orderedTotalCents: 2000 },
    [{ variantId, qty: 2, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  await reservations.reserve({ orderId: order.id, warehouseId: facilityId, variantId, qty: 2 });
  await advanceOrder(db, order.id, ['confirmed']);
  const opened = await openBox(db, { orderId: order.id, warehouseId: facilityId });
  if (opened.status !== 'ok') throw new Error(`kutu açılamadı (${opened.status})`);
  const sealed = await sealBox(db, {
    boxId: opened.box.boxId,
    warehouseId: facilityId,
    picks: [{ orderItemId: items[0]!.id, batches: [{ stockId: facilityStockId, qty: 2 }] }],
    actorId: courierId,
  });
  if (sealed.status !== 'ok') throw new Error(`kutu kapanamadı (${sealed.status})`);
  const loaded = await loadBox(db, { code: opened.box.code, courierId });
  if (loaded.status !== 'ok') throw new Error(`kutu yüklenemedi (${loaded.status})`);
  await advanceOrder(db, order.id, finalPath);
  return { orderId: order.id, code: opened.box.code };
}

describe('kurye dönüşü (v3:14 · D6)', () => {
  /** Depocunun kapsamı — yalnız kendi tesisi (`warehouseScope(['warehouse'], [facilityId])`in şekli). */
  const scope = (): WarehouseScope => ({ kind: 'limited', warehouseIds: [facilityId] });

  it('taslak: serbest ürün BEKLENEN, reddedilen kutu İNEN, ulaşılamayan kutu KALAN', async () => {
    const refused = await loadedOrder(['out_for_delivery', 'returned']);
    // Ulaşılamayan: yola çıktı, kapıdan döndü (`ready`), sefer yok → "başka sefer" değil ama kalır.
    const unreachable = await loadedOrder(['out_for_delivery', 'ready']);

    const draft = await readCourierReturn(db, { courierId, warehouseId: facilityId, scope: scope() });
    if ('status' in draft) throw new Error(`taslak reddedildi (${draft.reason})`);

    expect(draft.courierId).toBe(courierId);
    expect(draft.vehicleWarehouseId).toBe(vanId);
    expect(draft.freeGoods).toEqual([expect.objectContaining({ variantId, onVanQty: 5 })]);
    expect(draft.boxesDown.map((row) => row.orderId)).toEqual([refused.orderId]);
    expect(draft.boxesDown[0]!.boxes).toEqual([{ boxNo: 1, code: refused.code }]);
    expect(draft.boxesStay.map((row) => row.orderId)).toContain(unreachable.orderId);
  });

  it('BAŞKA tesisin depocusu bu kuryeyi teslim alamaz — kapsam dışı', async () => {
    const other = await createTestWarehouse(db, { label: 'DONUS-BASKA' });
    try {
      const draft = await readCourierReturn(db, { courierId, warehouseId: other.id, scope: { kind: 'limited', warehouseIds: [other.id] } });
      expect(draft).toEqual({ status: 'forbidden', reason: 'out_of_scope' });
    } finally {
      await purgeTestData(db, { warehouseIds: [other.id] });
    }
  });

  it('beklenenden FAZLA dönen geri çevrilir — araçta o kadar mal kayıtlı değil', async () => {
    const outcome = await acceptCourierReturn(db, {
      courierId,
      warehouseId: facilityId,
      scope: { kind: 'limited', warehouseIds: [facilityId] },
      actorId: courierId,
      freeGoods: [{ variantId, returnedQty: 9 }],
    });
    expect(outcome).toEqual({ status: 'not_enough', variantId, available: 5 });
  });

  it('kabul: dönen adet araca→depoya geçer, eksik söylenir, reddedilen kutu iner, ulaşılamayan kalır', async () => {
    const before = (await boxes.listByOrders((await orders.listByCourier(courierId)).map((o) => o.id))).filter((b) => b.loadedAt !== null).length;

    const outcome = await acceptCourierReturn(db, {
      courierId,
      warehouseId: facilityId,
      scope: { kind: 'limited', warehouseIds: [facilityId] },
      actorId: courierId,
      freeGoods: [{ variantId, returnedQty: 4 }],
    });

    expect(outcome).toEqual({
      status: 'ok',
      transferred: [{ variantId, qty: 4 }],
      shortfalls: [{ variantId, expectedQty: 5, returnedQty: 4 }],
      unloadedBoxes: 1,
    });
    // Araçta 1 kaldı (fark) — sayım/düşüm kapatır; depoya 4 girdi.
    const van = await readVanStock(db, { vehicleWarehouseId: vanId });
    expect(van.find((line) => line.variantId === variantId)?.qty).toBe(1);
    const after = (await boxes.listByOrders((await orders.listByCourier(courierId)).map((o) => o.id))).filter((b) => b.loadedAt !== null).length;
    expect(before - after).toBe(1); // yalnız reddedilenin kutusu indi; ulaşılamayanınki araçta
  });
});
