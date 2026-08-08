import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CategoryService,
  OrderItemService,
  OrderService,
  ProductService,
  ReservationService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehousePair, mustDelete, purgeTestData } from '@lezzet/database/testing';
import { advanceOrder } from '../order/advance.testkit';
import { listWarehouseReturns, type ReturnDrop } from './returns';

/**
 * **Kurye dönüşü — D6'nın OKUMA yarısı** (21.11d).
 *
 * Sınanan şey tek cümle: *"bu depoya geri gelen, akıbeti henüz işaretlenmemiş mal hangisi?"* — ve
 * yanlış cevabın üç hâli ayrı ayrı sınanıyor, çünkü üçü de sessizce yanlış olurdu:
 *   · başka DEPONUN dönüşünü göstermek (depo değişmezi, CLAUDE.md §1),
 *   · akıbeti ZATEN işaretlenmiş siparişi listede tutmak (bitmiş işi bitmemiş gibi göstermek),
 *   · ULAŞILAMAYAN siparişi dönüş sanmak (mal araçta, rampaya hiç girmedi — v2:505).
 *
 * Paylaşılan DB (CLAUDE.md §4b): zemin bu dosyanın kendi damgalı satırları (iki depo, kendi müşterisi,
 * kendi kuryesi) ve **hiçbir iddia küresel sayıya bakmaz** — kendi sipariş kimliklerimiz aranır.
 * E-posta öneki dosyaya özgü (`depo-donus-`), telefon kullanılmıyor.
 */
const db = serviceDb();
const orders = new OrderService(db);
const items = new OrderItemService(db);
const stocks = new StockService(db);
const reservations = new ReservationService(db);

const stamp = Date.now();
let warehouseId: string;
let otherWarehouseId: string;
let customerId: string;
let courierId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let batchId: string;
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  const { primary, secondary } = await createTestWarehousePair(db);
  warehouseId = primary.id;
  otherWarehouseId = secondary.id;

  const category = await new CategoryService(db).create({ name: { tr: `Dönüş kapısı ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Su Böreği ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '1 kg' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  const profiles = new UserProfileService(db);
  const customer = await profiles.insert({ name: 'Restaurant Bosphore', email: `depo-donus-m-${stamp}@example.test` });
  const courier = await profiles.insert({ name: 'Musa K.', email: `depo-donus-k-${stamp}@example.test` });
  customerId = customer.id;
  courierId = courier.id;
  createdProfiles.push(customer.id, courier.id);
});

/**
 * Her test kendi TAZE partisini kurar; eskiler SİLİNMEZ ve bu bilinçli (`adjustment.test.ts`
 * emsali): `discard` akıbeti partiye bir fire kaydı (`stock_adjustment`) çıpalıyor ve `restrict`
 * ile bağlı — testin kendi silme sırasını uydurması, sırası TEK yerde duran kuralı (`cleanup.ts`)
 * ikinci kez yazmak olurdu. Biriken birkaç satır koşu sonunda `purgeTestData`nın sırasından geçiyor;
 * iddialar zaten kendi kimliklerimize bakıyor, küresel sayıya değil.
 */
beforeEach(async () => {
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  batchId = (
    await stocks.insert({ warehouseId, variantId, physicalQty: 20, expiryDate: dayOffset(60), purchasePriceCents: 400 })
  ).id;
});

afterAll(async () => {
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    warehouseIds: [warehouseId, otherWarehouseId],
  });
});

/**
 * Kapıdan REDDEDİLMİŞ sipariş — dönüşün doğduğu tek yol (`out_for_delivery → returned`).
 *
 * Hazırlık kaydı ŞART: `fulfilled_qty` oradan doğuyor ve dökümün tavanı o sayı. Hazırlıksız bir
 * sipariş "0 karşılanmış" döner ve D6'nın sınadığı şey hiç kurulmamış olur.
 */
async function refusedOrder(
  qty: number,
  opts: { inWarehouse?: string; note?: string; withCourier?: boolean } = {},
): Promise<{ orderId: string; itemId: string }> {
  const warehouse = opts.inWarehouse ?? warehouseId;
  const stock =
    warehouse === warehouseId
      ? batchId
      : (await stocks.insert({ warehouseId: warehouse, variantId, physicalQty: qty, expiryDate: dayOffset(60), purchasePriceCents: 400 })).id;

  const { order, items: lines } = await orders.create(
    { warehouseId: warehouse, customerId, channel: 'b2b', deliveryType: 'route', totalCents: qty * 1000, courierId: opts.withCourier === false ? null : courierId },
    [{ variantId, qty, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  await reservations.reserve({ orderId: order.id, warehouseId: warehouse, variantId, qty });
  await advanceOrder(db, order.id, ['confirmed', 'preparing']);
  await orders.recordPreparation(order.id, [{ orderItemId: lines[0]!.id, batches: [{ stockId: stock, qty }] }]);
  await advanceOrder(db, order.id, ['ready', 'out_for_delivery']);

  // Not kuryenin kapıdaki tek serbest bilgisidir ve GEÇİŞ KAYDINA yazılır (`markUndelivered` deseni).
  const result = await orders.transition({
    orderId: order.id,
    from: 'out_for_delivery',
    to: 'returned',
    actorId: courierId,
    note: opts.note ?? null,
  });
  if (!result.ok) throw new Error(`dönüş kurulamadı: ${result.currentStatus}`);
  return { orderId: order.id, itemId: lines[0]!.id };
}

/** Yalnız BU testin kurduğu sipariş — küresel listeye bakılmaz (CLAUDE.md §4b). */
async function dropOf(orderId: string, warehouse = warehouseId): Promise<ReturnDrop | undefined> {
  const drops = await listWarehouseReturns(db, { warehouseId: warehouse });
  return drops.find((drop) => drop.orderId === orderId);
}

describe('depoya geri gelenler (D6 · 21.11d)', () => {
  it('dönen sipariş künyesi, kuryesi, notu ve satırlarıyla döner', async () => {
    const { orderId, itemId } = await refusedOrder(3, { note: 'kapıda reddetti — koku şüphesi' });

    const drop = (await dropOf(orderId))!;

    expect(drop.courierName).toBe('Musa K.');
    expect(drop.note).toBe('kapıda reddetti — koku şüphesi');
    expect(drop.returnedAt).not.toBeNull();
    expect(drop.lines).toEqual([
      // Tavan KARŞILANMIŞ adettir (3), sipariş adedi değil: `adjust_fulfillment` üstüne çıkamaz.
      { orderItemId: itemId, name: expect.stringContaining('Su Böreği'), fulfilledQty: 3, disposition: null },
    ]);
  });

  it('dökümde PARA yok — dönüşü karşılayan depocu tutar görmez', async () => {
    const { orderId } = await refusedOrder(2);

    const serialized = JSON.stringify((await dropOf(orderId))!);

    for (const moneyKey of ['unitPrice', 'total', 'purchasePrice', 'refunded', 'amountCollected', 'vatRate']) {
      expect(serialized).not.toContain(moneyKey);
    }
    // Adres ve iletişim de yok.
    expect(serialized).not.toContain('@example.test');
  });

  it('BAŞKA DEPONUN dönüşü bu listede GÖRÜNMEZ (CLAUDE.md §1 — depo değişmezi)', async () => {
    const { orderId } = await refusedOrder(2, { inWarehouse: otherWarehouseId });

    expect(await dropOf(orderId)).toBeUndefined();
    // Ama kendi deposunda görünür — süzgeç körlük değil, kapsam.
    expect(await dropOf(orderId, otherWarehouseId)).toBeDefined();
  });

  it('AKIBETİ İŞARETLENMİŞ sipariş listeden DÜŞER — bitmiş iş rampada durmaz', async () => {
    const { orderId, itemId } = await refusedOrder(2);
    expect(await dropOf(orderId)).toBeDefined();

    // Depocu kararını verdi: mal imha. (Kapı `adjustFulfillment`; burada sınanan OKUMA, yazımın
    // kendisi `order/refund.test.ts`te.)
    await orders.adjustFulfillment(orderId, [{ orderItemId: itemId, fulfilledQty: 0, returnDisposition: 'discard' }]);

    expect(await dropOf(orderId)).toBeUndefined();
  });

  it('YARIM işaretlenmiş siparişte satırların TAMAMI döner — depocu neyi karara bağladığını görür', async () => {
    const { order, items: lines } = await orders.create(
      { warehouseId, customerId, channel: 'b2b', deliveryType: 'route', totalCents: 4000, courierId },
      [
        { variantId, qty: 1, unitPriceCents: 1000, vatRate: 5.5 },
        { variantId, qty: 3, unitPriceCents: 1000, vatRate: 5.5 },
      ],
    );
    await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty: 4 });
    await advanceOrder(db, order.id, ['confirmed', 'preparing']);
    await orders.recordPreparation(order.id, [
      { orderItemId: lines[0]!.id, batches: [{ stockId: batchId, qty: 1 }] },
      { orderItemId: lines[1]!.id, batches: [{ stockId: batchId, qty: 3 }] },
    ]);
    await advanceOrder(db, order.id, ['ready', 'out_for_delivery']);
    await orders.transition({ orderId: order.id, from: 'out_for_delivery', to: 'returned', actorId: courierId });
    // Yalnız BİR satırın akıbeti belli: mal müşteride kaldı (jest).
    await orders.adjustFulfillment(order.id, [{ orderItemId: lines[0]!.id, fulfilledQty: 1, returnDisposition: 'goodwill' }]);

    const drop = (await dropOf(order.id))!;

    expect(drop.lines).toHaveLength(2);
    expect(drop.lines.find((line) => line.orderItemId === lines[0]!.id)!.disposition).toBe('goodwill');
    expect(drop.lines.find((line) => line.orderItemId === lines[1]!.id)!.disposition).toBeNull();
  });

  it('ULAŞILAMAYAN sipariş dönüş DEĞİLDİR — mal araçta, rampaya hiç girmedi (v2:505)', async () => {
    const { order, items: lines } = await orders.create(
      { warehouseId, customerId, channel: 'b2c', deliveryType: 'route', totalCents: 1000, courierId },
      [{ variantId, qty: 1, unitPriceCents: 1000, vatRate: 5.5 }],
    );
    await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty: 1 });
    await advanceOrder(db, order.id, ['confirmed', 'preparing']);
    await orders.recordPreparation(order.id, [{ orderItemId: lines[0]!.id, batches: [{ stockId: batchId, qty: 1 }] }]);
    await advanceOrder(db, order.id, ['ready', 'out_for_delivery']);
    // "Ulaşılamadı" → `ready`; mal ayrılmış kalır, stok değişmez (ORDER_LIFECYCLE).
    await orders.transition({ orderId: order.id, from: 'out_for_delivery', to: 'ready', actorId: courierId, note: 'zil bozuk' });

    expect(await dropOf(order.id)).toBeUndefined();
  });

  it('KURYESİZ dönüş de listelenir — ad `null`, sipariş kaybolmaz', async () => {
    const { orderId } = await refusedOrder(1, { withCourier: false });

    const drop = (await dropOf(orderId))!;

    expect(drop.courierName).toBeNull();
    expect(drop.lines).toHaveLength(1);
  });

  it('en YENİ dönüş başta — rampadaki koli hâlâ ortadayken işaretlenir', async () => {
    const first = await refusedOrder(1);
    const second = await refusedOrder(1);

    const drops = await listWarehouseReturns(db, { warehouseId });
    const mine = drops.filter((drop) => drop.orderId === first.orderId || drop.orderId === second.orderId);

    expect(mine.map((drop) => drop.orderId)).toEqual([second.orderId, first.orderId]);
  });

  it('kalem yoksa liste de yok — teslim edilmiş sipariş rampaya düşmez', async () => {
    const { order, items: lines } = await orders.create(
      { warehouseId, customerId, channel: 'b2c', deliveryType: 'route', totalCents: 1000, courierId },
      [{ variantId, qty: 1, unitPriceCents: 1000, vatRate: 5.5 }],
    );
    await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty: 1 });
    await advanceOrder(db, order.id, ['confirmed', 'preparing']);
    await orders.recordPreparation(order.id, [{ orderItemId: lines[0]!.id, batches: [{ stockId: batchId, qty: 1 }] }]);
    await advanceOrder(db, order.id, ['ready', 'out_for_delivery', 'delivered']);

    expect(await dropOf(order.id)).toBeUndefined();
    // Kalem gerçekten duruyor: iddia "sipariş yok" değil, "bu listede yok".
    expect(await items.listByOrder(order.id)).toHaveLength(1);
  });
});
