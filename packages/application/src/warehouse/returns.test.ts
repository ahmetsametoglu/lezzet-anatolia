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
import { createTestWarehousePair, mustDelete, purgeTestData, purgeVariantStock } from '@lezzet/database/testing';
import { advanceOrder } from '../order/advance.testkit';
import { deliverOrder } from '../order/fulfillment';
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
  // **DEFTER SİPARİŞTEN ÖNCE** (06.14): iade akışı imha/restok satırları yazıyor ve teslim edilmiş
  // siparişin `sale` satırı siparişi `restrict` ile tutuyor. Partileri de süpürüyor — her testin
  // kendi partisi aşağıda yeniden kuruluyor.
  await purgeVariantStock(db, [variantId]);
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  batchId = (
    await stocks.insert({ warehouseId, variantId, physicalQty: 20, expiryDate: dayOffset(60), purchasePriceCents: 400 })
  ).id;
});

afterAll(async () => {
  // Sipariş ve rezervasyon AYRICA silinmez: ikisi de `purgeTestData`'nın bildiği bağlar (sipariş
  // `profileIds`ten, rezervasyon `productIds`ten). Elle yazılan bu satırlar teardown'ı öldürüyordu
  // (ölçüldü 14.08, `cleanup.ts` künyesi). `beforeEach`teki silme başka iş görür: testler arası
  // izolasyon, ve orada kimlikler zaten kurulmuş durumda.
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
    await advanceOrder(db, order.id, ['ready', 'out_for_delivery']);
    // Teslim GERÇEK kapıdan (denetim 26.08): düz yazım fiili stoğu düşmez ve fikstür üretimde
    // oluşamayacak bir sipariş kurardı — "teslim edilmiş sipariş rampaya düşmez" iddiası ancak
    // gerçekten teslim edilmiş bir sipariş üstünde bir şey kanıtlar.
    expect(await deliverOrder(db, order.id)).toMatchObject({ ok: true });

    expect(await dropOf(order.id)).toBeUndefined();
    // Kalem gerçekten duruyor: iddia "sipariş yok" değil, "bu listede yok".
    expect(await items.listByOrder(order.id)).toHaveLength(1);
  });

  /**
   * **Masaüstünün süzgeci bir KÜMEdir** (10.5) — telefondaki depocunun tek deposu vardır, ama
   * yöneticinin kapsamı `ctx.warehouseIds`tir. Sözleşmenin üç şekli de burada sınanıyor, çünkü
   * ikisini karıştırmak sessizce yanlış cevap verirdi: boş dizi ile `undefined` arasındaki fark,
   * "kapsamı olmayan kişi" ile "kapsamı sınırsız kişi" arasındaki farktır.
   */
  describe('süzgeç şekilleri — tek · küme · boş · depo-üstü (CLAUDE §1)', () => {
    it('KÜME süzgeci iki deponun dönüşünü birlikte getirir — yöneticinin kapsamı tek depo değil', async () => {
      const here = await refusedOrder(1);
      const there = await refusedOrder(1, { inWarehouse: otherWarehouseId });

      const drops = await listWarehouseReturns(db, { warehouseId: [warehouseId, otherWarehouseId] });
      const mine = drops.filter((drop) => drop.orderId === here.orderId || drop.orderId === there.orderId);

      expect(mine).toHaveLength(2);
      // Kimin rampasında durduğu satırla birlikte gelir; yoksa "iki koli döndü" nerede olduklarını söylemez.
      expect(new Set(mine.map((drop) => drop.warehouseId))).toEqual(new Set([warehouseId, otherWarehouseId]));

      // ⚠ Kümenin GERÇEKTEN süzdüğü ayrıca sınanır: yukarıdaki iddia tek başına, süzgeç hiç
      // uygulanmasa da geçerdi (süzgeçsiz okuma iki depoyu da getirir). TEK elemanlı küme ötekini
      // dışarıda bırakmalı — dizi şekli tekil kimlikle aynı kapıdan geçiyor demektir.
      const onlyHere = await listWarehouseReturns(db, { warehouseId: [warehouseId] });
      expect(onlyHere.find((drop) => drop.orderId === here.orderId)).toBeDefined();
      expect(onlyHere.find((drop) => drop.orderId === there.orderId)).toBeUndefined();
    });

    it('BOŞ dizi HİÇBİRİ demektir — kapsamsız personele depo-üstü liste açılmaz', async () => {
      const { orderId } = await refusedOrder(1);

      const drops = await listWarehouseReturns(db, { warehouseId: [] });

      expect(drops.find((drop) => drop.orderId === orderId)).toBeUndefined();
    });

    it('`undefined` DEPO-ÜSTÜdür — kapsamı sınırsız yönetici her rampayı görür', async () => {
      const { orderId } = await refusedOrder(1, { inWarehouse: otherWarehouseId });

      const drops = await listWarehouseReturns(db, { warehouseId: undefined });

      expect(drops.find((drop) => drop.orderId === orderId)).toBeDefined();
    });
  });

  /**
   * **Tavan EN YENİDEN dolar** (kusur, düzeltildi 25.08). Liste "en yeni başta" sıralandığı için
   * tavanın öteki uçtan dolması, tavana dayanan rampada bugün dönen koliyi gizlerdi — ve liste dolu
   * göründüğü için yokluğu fark edilmezdi. Sessiz kayıpların en pahalısı budur.
   */
  it('tavana dayanınca EN YENİ dönüş içeride, en eski dışarıda kalır', async () => {
    const older = await refusedOrder(1);
    const newer = await refusedOrder(1);

    // Tavan bire indirildi: iki dönüşten yalnız biri sığar ve o BUGÜNKÜ olmalı.
    const drops = await listWarehouseReturns(db, { warehouseId, limit: 1 });

    expect(drops.map((drop) => drop.orderId)).toContain(newer.orderId);
    expect(drops.map((drop) => drop.orderId)).not.toContain(older.orderId);
  });
});
