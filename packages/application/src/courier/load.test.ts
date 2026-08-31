import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import { purgeTestData, createTestWarehouse, purgeVariantStock, mustDelete } from '@lezzet/database/testing';
import { advanceOrder } from '../order/advance.testkit';
import { openBox, sealBox } from '../warehouse/boxes';
import { confirmDoorDelivery } from './delivery';
import { loadBox } from './load';

/**
 * **Yükleme + teslim okutması** (23.8 · karar §1.11, etüt 2.4-2.5).
 *
 * Üç kritik iddia: rotaya ait olmayan kutu YÜKLENMEZ (`wrong_route`), kutulu siparişin "yolda"sını
 * yalnız SON kutunun okutması yazar, ve kutulu teslim TÜM kutular okutulmadan KAPANMAZ
 * (`boxes_missing`) — kapanınca kodlar `delivery_proof`a düşer (B2C'nin bedava kanıtı).
 */
const db = serviceDb();
const orders = new OrderService(db);
const boxService = new OrderBoxService(db);
const stocks = new StockService(db);
const reservations = new ReservationService(db);

const stamp = Date.now();
let customerId: string;
let courierId: string;
let warehouseId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let stockId: string;
const createdProfiles: string[] = [];

const today = new Date().toISOString().slice(0, 10);
const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Yükleme testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Pide ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '300 g' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  const profiles = new UserProfileService(db);
  const customer = await profiles.insert({ name: 'Yükleme Müşterisi', email: `yukleme-${stamp}@example.test` });
  const courier = await profiles.insert({ name: 'Kurye Baran', email: `baran-${stamp}@example.test` });
  customerId = customer.id;
  courierId = courier.id;
  createdProfiles.push(customer.id, courier.id);
});

beforeEach(async () => {
  // SIRA: defter → parti → sipariş (06.14) — künye kardeş dosyada (`courier/day.test.ts`).
  await purgeVariantStock(db, [variantId]);
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  stockId = (
    await stocks.insert({ warehouseId, variantId, physicalQty: 40, expiryDate: dayOffset(60), purchasePriceCents: 300 })
  ).id;
});

afterAll(async () => {
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    warehouseIds: [warehouseId],
  });
});

/**
 * KUTULANMIŞ sipariş: kuryeye damgalı, kalemleri kutulara mühürlenmiş, `ready`. Kutu sayısı
 * parametrik — çok kutulu yol da aynı yardımcıdan kurulur. Dönen kodlar kutu sırasıyla.
 */
async function boxedReady(opts: { boxQtys?: number[]; courier?: string | null } = {}) {
  const boxQtys = opts.boxQtys ?? [3];
  const total = boxQtys.reduce((sum, qty) => sum + qty, 0);
  const { order, items } = await orders.create(
    {
      warehouseId,
      customerId,
      channel: 'b2c',
      deliveryType: 'route',
      deliveryDate: today,
      courierId: opts.courier === undefined ? courierId : opts.courier,
      paymentMethod: 'cash',
      totalCents: total * 1000,
    },
    [{ variantId, qty: total, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty: total });
  await advanceOrder(db, order.id, ['confirmed']);

  const codes: string[] = [];
  for (const qty of boxQtys) {
    const opened = await openBox(db, { orderId: order.id, warehouseId });
    if (opened.status !== 'ok') throw new Error(`test kutusu açılamadı (${opened.status})`);
    codes.push(opened.box.code);
    const sealed = await sealBox(db, {
      boxId: opened.box.boxId,
      warehouseId,
      picks: [{ orderItemId: items[0]!.id, batches: [{ stockId, qty }] }],
      actorId: courierId,
    });
    if (sealed.status !== 'ok') throw new Error(`test kutusu kapanamadı (${sealed.status})`);
  }
  // `sealBox` tamamlanınca sipariş kendiliğinden `ready` oldu — yükleme öncesi hâl tam bu.
  return { orderId: order.id, itemId: items[0]!.id, codes };
}

describe('araca yükleme (loadBox · karar §1.11)', () => {
  it('tanınmayan kod GÖRÜNÜR reddedilir — bizim kutu QR\'ımız değil', async () => {
    expect(await loadBox(db, { code: `KT-26-YOK${stamp}`, courierId })).toEqual({ status: 'unknown_code' });
  });

  it('rotaya ait olmayan kutu YÜKLENMEZ — hangi siparişin malı olduğu söylenir', async () => {
    // Sipariş kuryeye hiç damgalanmamış: sefer onu claim etmedi, kutusu bu araca binemez.
    const { codes } = await boxedReady({ courier: null });

    const outcome = await loadBox(db, { code: codes[0]!, courierId });

    expect(outcome).toMatchObject({ status: 'wrong_route' });
    // Damga YAZILMADI: kutu hâlâ yüklenmemiş.
    expect((await boxService.getByCode(codes[0]!))?.loadedAt).toBeNull();
  });

  it('açık (mühürlenmemiş) kutu araca binemez', async () => {
    const { order } = await orders.create(
      { warehouseId, customerId, channel: 'b2c', deliveryType: 'route', courierId, totalCents: 1000 },
      [{ variantId, qty: 1, unitPriceCents: 1000, vatRate: 5.5 }],
    );
    await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty: 1 });
    await advanceOrder(db, order.id, ['confirmed']);
    const opened = await openBox(db, { orderId: order.id, warehouseId });
    const code = opened.status === 'ok' ? opened.box.code : '';

    expect(await loadBox(db, { code, courierId })).toMatchObject({ status: 'not_sealed', boxNo: 1 });
  });

  it('tek kutu: okutma damgayı yazar ama sipariş YOLA ÇIKMAZ — yükleme emanet değişimidir (31.08)', async () => {
    const { orderId, codes } = await boxedReady();

    const outcome = await loadBox(db, { code: codes[0]!, courierId });

    expect(outcome).toMatchObject({ status: 'ok', boxNo: 1, loadedBoxes: 1, boxCount: 1, allBoxesLoaded: true });
    /* İDDİANIN KALBİ: mal araçta ama sipariş HÂLÂ HAZIR. Araç bir ara depodur ve içinde yarının
       seferinin kutusu da durabilir; yükleme müşteriye haber göndermez. */
    expect((await orders.getById(orderId))?.status).toBe('ready');
    const box = await boxService.getByCode(codes[0]!);
    expect(box?.loadedAt).not.toBeNull();
    expect(box?.loadedBy).toBe(courierId);
  });

  it('çok kutulu: `allBoxesLoaded` ancak SON kutuda doğrudur (etüt 2.4)', async () => {
    const { orderId, codes } = await boxedReady({ boxQtys: [2, 3] });

    const first = await loadBox(db, { code: codes[0]!, courierId });
    expect(first).toMatchObject({ status: 'ok', loadedBoxes: 1, boxCount: 2, allBoxesLoaded: false });
    expect((await orders.getById(orderId))?.status).toBe('ready');

    const second = await loadBox(db, { code: codes[1]!, courierId });
    expect(second).toMatchObject({ status: 'ok', loadedBoxes: 2, boxCount: 2, allBoxesLoaded: true });
    // Tamamı araçta — ama yola çıkaran yine sefer başlatma (31.08).
    expect((await orders.getById(orderId))?.status).toBe('ready');
  });

  it('ikinci okutma "zaten araçta" der — sayaç değişmez, damga ezilmez', async () => {
    const { codes } = await boxedReady();
    await loadBox(db, { code: codes[0]!, courierId });
    const stamped = (await boxService.getByCode(codes[0]!))?.loadedAt;

    const outcome = await loadBox(db, { code: codes[0]!, courierId });

    expect(outcome).toMatchObject({ status: 'already_loaded', boxNo: 1, loadedBoxes: 1, boxCount: 1 });
    expect((await boxService.getByCode(codes[0]!))?.loadedAt).toBe(stamped);
  });
});

describe('kapıda kutu okutması (teslim ön koşulu · etüt 2.5)', () => {
  it('kutulu teslim kodsuz KAPANMAZ — kalan kutular numarasıyla döner, hiçbir yazım yok', async () => {
    const { orderId, codes } = await boxedReady({ boxQtys: [2, 2] });
    for (const code of codes) await loadBox(db, { code, courierId });
    // Yükleme yola ÇIKARMIYOR (31.08); kapıdaki testin ön koşulu geçişi ayrıca ister.
    await advanceOrder(db, orderId, ['out_for_delivery']);

    const outcome = await confirmDoorDelivery(db, { orderId, courierId, scannedBoxCodes: [codes[0]!] });

    expect(outcome).toEqual({ status: 'boxes_missing', remainingBoxNos: [2] });
    expect((await orders.getById(orderId))?.status).toBe('out_for_delivery');
  });

  it('tüm kutular okutulunca teslim kapanır ve kodlar KANITA yazılır (bedava B2C kanıtı)', async () => {
    const { orderId, codes } = await boxedReady({ boxQtys: [1, 2] });
    for (const code of codes) await loadBox(db, { code, courierId });
    await advanceOrder(db, orderId, ['out_for_delivery']);

    const outcome = await confirmDoorDelivery(db, { orderId, courierId, scannedBoxCodes: codes });

    expect(outcome).toMatchObject({ status: 'ok' });
    const order = await orders.getById(orderId);
    expect(order?.status).toBe('delivered');
    // Görselsiz kanıt: türü `box_scan`, içeriği okutulan kodların kendisi.
    expect(order?.deliveryProof).toMatchObject({ kind: 'box_scan', courierId, boxCodes: codes });
  });
});
