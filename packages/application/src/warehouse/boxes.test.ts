import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CategoryService,
  OrderBoxItemService,
  OrderBoxService,
  OrderItemBatchService,
  OrderService,
  ProductService,
  ReservationService,
  SettingsService,
  ShippingBoxService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehousePair, mustDelete, purgeVariantStock } from '@lezzet/database/testing';
import { advanceOrder } from '../order/advance.testkit';
import { boxLabelPayload, labelPrinterFor, markBoxPrinted, openBox, sealBox, LABEL_PRINTER_KEYS } from './boxes';
import { listPreparationQueue } from './preparation';

/**
 * **Kutu döngüsü** (23.6 · karar §1.4) — `openBox`/`sealBox` kapıları + `seal_order_box` RPC'si.
 *
 * En kritik iddia çok kutulu BİRLEŞİM: `record_preparation` picks yazımı absolüt (0015) ve ikinci
 * kutunun kapanışı önceki kutunun parti izini SİLMEMELİ — birleşimi kapı kurar, RPC Σ kutu =
 * karşılanan eşitliğiyle denetler. Fikstür düzeni `preparation.test.ts`in aynısı (testin kendi
 * depo çifti + damgalı kayıtlar; küresel sayıya bakılmaz — CLAUDE.md §4b).
 */
const db = serviceDb();
const orders = new OrderService(db);
const boxService = new OrderBoxService(db);
const boxItems = new OrderBoxItemService(db);
const itemBatches = new OrderItemBatchService(db);
const stocks = new StockService(db);
const reservations = new ReservationService(db);

const stamp = Date.now();
let customerId: string;
let warehouseId: string;
let otherWarehouseId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let nearBatch: string;
let farBatch: string;
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  const { primary, secondary } = await createTestWarehousePair(db);
  warehouseId = primary.id;
  otherWarehouseId = secondary.id;

  const category = await new CategoryService(db).create({ name: { tr: `Kutu kapısı ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Cevizli Sucuk ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '250 g' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  const profile = await new UserProfileService(db).insert({
    name: 'Kutu Müşterisi',
    email: `kutu-kapisi-${stamp}@example.test`,
  });
  customerId = profile.id;
  createdProfiles.push(profile.id);
});

beforeEach(async () => {
  // Kutu satırları siparişle `cascade` gider — sipariş silinince kutu ayrıca silinmez.
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  // Parti SIRASIYLA gider: önce hareket defteri, sonra parti (06.14).
  await purgeVariantStock(db, [variantId]);
  nearBatch = (
    await stocks.insert({ warehouseId, variantId, physicalQty: 6, expiryDate: dayOffset(10), purchasePriceCents: 400 })
  ).id;
  farBatch = (
    await stocks.insert({ warehouseId, variantId, physicalQty: 12, expiryDate: dayOffset(90), purchasePriceCents: 500 })
  ).id;
});

const createdSettingIds: string[] = [];

afterAll(async () => {
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    warehouseIds: [warehouseId, otherWarehouseId],
    settingIds: createdSettingIds,
  });
});

/** Onaylanmış sipariş — kutunun açılabileceği en kısa yol. Kalem adetleri parametrik. */
async function confirmedOrder(qtys: number[], opts: { pinTo?: string } = {}) {
  const { order, items } = await orders.create(
    { warehouseId, customerId, channel: 'b2c', deliveryType: 'route', totalCents: qtys.length * 1000 },
    qtys.map((qty) => ({ variantId, qty, unitPriceCents: 1000, vatRate: 5.5, stockId: opts.pinTo })),
  );
  const total = qtys.reduce((sum, qty) => sum + qty, 0);
  await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty: total, stockId: opts.pinTo });
  await advanceOrder(db, order.id, ['confirmed']);
  return { orderId: order.id, itemIds: items.map((item) => item.id) };
}

describe('kutu açılışı (openBox)', () => {
  it('kutu sıradaki numarayla ve KT- koduyla AÇIK doğar; kuyruk onu taşır', async () => {
    const { orderId } = await confirmedOrder([2]);

    const first = await openBox(db, { orderId, warehouseId });
    const second = await openBox(db, { orderId, warehouseId });

    expect(first).toMatchObject({ status: 'ok', box: { boxNo: 1, sealedAt: null, items: [] } });
    expect(second).toMatchObject({ status: 'ok', box: { boxNo: 2 } });
    // Kod bizim ürettiğimiz kimliktir: `KT-YY-` + 10 karakter — sipariş referansı değil.
    const code = first.status === 'ok' ? first.box.code : '';
    expect(code).toMatch(/^KT-\d{2}-[34679ACDEFGHJKLMNPQRTUVWXY]{10}$/);

    const row = (await listPreparationQueue(db, { warehouseId })).find((o) => o.orderId === orderId)!;
    expect(row.boxes.map((box) => box.boxNo)).toEqual([1, 2]);
  });

  it('toplanabilir olmayan siparişe kutu açılmaz — `stale` durumuyla söyler', async () => {
    const { orderId, itemIds } = await confirmedOrder([1]);
    await orders.recordPreparation(orderId, [{ orderItemId: itemIds[0]!, batches: [{ stockId: nearBatch, qty: 1 }] }]);
    await advanceOrder(db, orderId, ['ready']);

    expect(await openBox(db, { orderId, warehouseId })).toEqual({ status: 'stale', currentStatus: 'ready' });
  });

  it('BAŞKA DEPONUN siparişine kutu açılmaz (CLAUDE.md §1)', async () => {
    const { orderId } = await confirmedOrder([1]);

    expect(await openBox(db, { orderId, warehouseId: otherWarehouseId })).toEqual({
      status: 'forbidden',
      reason: 'out_of_scope',
    });
  });
});

/*
  KARGO KUTUSU TİPİ (07.12) — kutunun FİZİKSEL kimliği açılışta yazılır.

  Kural veride de duruyor (bileşik FK `(warehouse_id, shipping_box_id)`, 0052) ama iki hâli VERİ
  YAKALAYAMAZ: kapatılmış tip (FK `is_active`e bakmaz) ve okunur cevap (kısıt ihlali depocuya
  `23503` diye görünürdü). İkisi de burada ölçülüyor.
*/
describe('kutu tipi (openBox · 07.12)', () => {
  const boxTypes = new ShippingBoxService(db);

  it('seçilen tip kutuya yazılır ve kuyruk onu taşır', async () => {
    const type = await boxTypes.insert({ warehouseId, name: `Orta karton ${stamp}`, lengthMm: 400, widthMm: 300, heightMm: 250, tareG: 220 });
    const { orderId } = await confirmedOrder([1]);

    const opened = await openBox(db, { orderId, warehouseId, shippingBoxId: type.id });
    expect(opened).toMatchObject({ status: 'ok', box: { shippingBoxId: type.id } });

    const row = (await listPreparationQueue(db, { warehouseId })).find((o) => o.orderId === orderId)!;
    expect(row.boxes[0]?.shippingBoxId).toBe(type.id);
  });

  it('tip VERİLMEZSE kutu tipsiz açılır — rota kulvarının bugünkü akışı kırılmaz', async () => {
    const { orderId } = await confirmedOrder([1]);
    expect(await openBox(db, { orderId, warehouseId })).toMatchObject({ status: 'ok', box: { shippingBoxId: null } });
  });

  it('BAŞKA DEPONUN kutu tipi reddedilir — `unknown_box`, ve kutu HİÇ açılmaz', async () => {
    const foreign = await boxTypes.insert({ warehouseId: otherWarehouseId, name: `Yabancı karton ${stamp}`, lengthMm: 300, widthMm: 200, heightMm: 150, tareG: 100 });
    const { orderId } = await confirmedOrder([1]);

    expect(await openBox(db, { orderId, warehouseId, shippingBoxId: foreign.id })).toEqual({ status: 'unknown_box' });
    // Ret HİÇBİR yazım bırakmamalı: yarım açılmış bir kutu, sipariş içi numarada boşluk açardı.
    expect(await boxService.listByOrder(orderId)).toHaveLength(0);
  });

  it('KAPATILMIŞ tip reddedilir — bunu yalnız kapı yakalayabiliyor (FK `is_active`e bakmaz)', async () => {
    const retired = await boxTypes.insert({ warehouseId, name: `Kalkan karton ${stamp}`, lengthMm: 500, widthMm: 400, heightMm: 300, tareG: 300 });
    await boxTypes.setActive(retired.id, false);
    const { orderId } = await confirmedOrder([1]);

    expect(await openBox(db, { orderId, warehouseId, shippingBoxId: retired.id })).toEqual({ status: 'unknown_box' });
  });
});

describe('kutu kapanışı (sealBox)', () => {
  it('tek kutu tamamı: içerik + parti izi yazılır, kutu mühürlenir, sipariş HAZIR olur', async () => {
    const { orderId, itemIds } = await confirmedOrder([3]);
    const opened = await openBox(db, { orderId, warehouseId });
    const boxId = opened.status === 'ok' ? opened.box.boxId : '';

    const outcome = await sealBox(db, {
      boxId,
      warehouseId,
      picks: [{ orderItemId: itemIds[0]!, batches: [{ stockId: nearBatch, qty: 3 }] }],
    });

    expect(outcome).toMatchObject({ status: 'ok', boxNo: 1, ready: true, missing: [], shortfalls: [] });
    expect((await orders.getById(orderId))?.status).toBe('ready');
    expect((await boxService.getById(boxId))?.sealedAt).not.toBeNull();
    expect(await boxItems.listByBoxes([boxId])).toMatchObject([{ orderItemId: itemIds[0], qty: 3 }]);
    expect(await itemBatches.listByOrder(orderId)).toMatchObject([{ stockId: nearBatch, qty: 3 }]);
  });

  it('⚠ çok kutulu BİRLEŞİM: ikinci kutu ilk kutunun parti izini silmez (0015 absolüt yazım)', async () => {
    const { orderId, itemIds } = await confirmedOrder([5, 2]);
    const [itemA, itemB] = itemIds as [string, string];

    // Kutu 1: A'nın 3'ü yakın partiden + B tamamı — sipariş bitmedi, döngü "yeni kutu" der.
    const box1 = await openBox(db, { orderId, warehouseId });
    const first = await sealBox(db, {
      boxId: box1.status === 'ok' ? box1.box.boxId : '',
      warehouseId,
      picks: [
        { orderItemId: itemA, batches: [{ stockId: nearBatch, qty: 3 }] },
        { orderItemId: itemB, batches: [{ stockId: nearBatch, qty: 2 }] },
      ],
    });
    expect(first).toMatchObject({ status: 'ok', ready: false, missing: [{ itemId: itemA, missingQty: 2 }] });
    expect((await orders.getById(orderId))?.status).not.toBe('ready');

    // Kutu 2: A'nın kalan 2'si BAŞKA partiden. Ekran yalnız BU kutuyu gönderiyor — birleşimi kapı kurar.
    const box2 = await openBox(db, { orderId, warehouseId });
    const second = await sealBox(db, {
      boxId: box2.status === 'ok' ? box2.box.boxId : '',
      warehouseId,
      picks: [{ orderItemId: itemA, batches: [{ stockId: farBatch, qty: 2 }] }],
    });
    expect(second).toMatchObject({ status: 'ok', boxNo: 2, ready: true, missing: [] });
    expect((await orders.getById(orderId))?.status).toBe('ready');

    // İlk kutunun izi YAŞIYOR: A iki partiden (3+2), B tek partiden — silinip yalnız 2 kalmadı.
    const batches = await itemBatches.listByOrder(orderId);
    const ofA = batches.filter((row) => row.orderItemId === itemA);
    expect(ofA).toHaveLength(2);
    expect(ofA.find((row) => row.stockId === nearBatch)?.qty).toBe(3);
    expect(ofA.find((row) => row.stockId === farBatch)?.qty).toBe(2);
    expect(batches.filter((row) => row.orderItemId === itemB)).toMatchObject([{ stockId: nearBatch, qty: 2 }]);
  });

  it('eksik beyanı yalnız `declareShort` ile tavsiye üretir — ara kutunun eksiği yönetime soru olmaz', async () => {
    const { orderId, itemIds } = await confirmedOrder([4]);

    const box1 = await openBox(db, { orderId, warehouseId });
    const silent = await sealBox(db, {
      boxId: box1.status === 'ok' ? box1.box.boxId : '',
      warehouseId,
      picks: [{ orderItemId: itemIds[0]!, batches: [{ stockId: nearBatch, qty: 1 }] }],
    });
    expect(silent).toMatchObject({ status: 'ok', ready: false, shortfalls: [] });

    const box2 = await openBox(db, { orderId, warehouseId });
    const declared = await sealBox(db, {
      boxId: box2.status === 'ok' ? box2.box.boxId : '',
      warehouseId,
      picks: [{ orderItemId: itemIds[0]!, batches: [{ stockId: nearBatch, qty: 1 }] }],
      declareShort: true,
    });
    expect(declared).toMatchObject({ status: 'ok', ready: false });
    const shortfall = declared.status === 'ok' ? declared.shortfalls[0] : null;
    expect(shortfall?.suggestion).toMatchObject({ action: 'ask_customer', missingQty: 2 });
  });

  it('kapalı kutu ikinci kez kapanmaz (`already_sealed`) ve içerik değişmez', async () => {
    const { orderId, itemIds } = await confirmedOrder([2]);
    const opened = await openBox(db, { orderId, warehouseId });
    const boxId = opened.status === 'ok' ? opened.box.boxId : '';
    const picks = [{ orderItemId: itemIds[0]!, batches: [{ stockId: nearBatch, qty: 2 }] }];
    await sealBox(db, { boxId, warehouseId, picks });

    expect(await sealBox(db, { boxId, warehouseId, picks })).toEqual({ status: 'already_sealed' });
    expect(await boxItems.listByBoxes([boxId])).toHaveLength(1);
  });

  it('boş kutu kapatılamaz — partisiz satırlar içerik sayılmaz', async () => {
    const { orderId, itemIds } = await confirmedOrder([2]);
    const opened = await openBox(db, { orderId, warehouseId });
    const boxId = opened.status === 'ok' ? opened.box.boxId : '';

    expect(await sealBox(db, { boxId, warehouseId, picks: [] })).toEqual({ status: 'empty' });
    expect(await sealBox(db, { boxId, warehouseId, picks: [{ orderItemId: itemIds[0]!, batches: [] }] })).toEqual({
      status: 'empty',
    });
    expect((await boxService.getById(boxId))?.sealedAt).toBeNull();
  });

  it('kilitli kalem başka partiden kutuya konamaz — kutu açık kalır, HİÇBİR yazım yok', async () => {
    const { orderId, itemIds } = await confirmedOrder([2], { pinTo: farBatch });
    const opened = await openBox(db, { orderId, warehouseId });
    const boxId = opened.status === 'ok' ? opened.box.boxId : '';

    const outcome = await sealBox(db, {
      boxId,
      warehouseId,
      picks: [{ orderItemId: itemIds[0]!, batches: [{ stockId: nearBatch, qty: 2 }] }],
    });

    expect(outcome).toMatchObject({ status: 'pinned_violation', itemId: itemIds[0], requiredStockId: farBatch });
    expect((await boxService.getById(boxId))?.sealedAt).toBeNull();
    expect(await boxItems.listByBoxes([boxId])).toHaveLength(0);
    expect(await itemBatches.listByOrder(orderId)).toHaveLength(0);
  });

  it('BAŞKA DEPONUN kutusu kapatılamaz — görünür ret, yazım yok', async () => {
    const { orderId, itemIds } = await confirmedOrder([1]);
    const opened = await openBox(db, { orderId, warehouseId });
    const boxId = opened.status === 'ok' ? opened.box.boxId : '';

    const outcome = await sealBox(db, {
      boxId,
      warehouseId: otherWarehouseId,
      picks: [{ orderItemId: itemIds[0]!, batches: [{ stockId: nearBatch, qty: 1 }] }],
    });

    expect(outcome).toEqual({ status: 'forbidden', reason: 'out_of_scope' });
    expect(await itemBatches.listByOrder(orderId)).toHaveLength(0);
  });
});

describe('etiket içeriği (boxLabelPayload · 23.7)', () => {
  it('açık kutunun etiketi YOKTUR; kapanınca içerik döner ve TUTAR hiçbir alanda sızmaz', async () => {
    const { orderId, itemIds } = await confirmedOrder([2]);
    const opened = await openBox(db, { orderId, warehouseId });
    const boxId = opened.status === 'ok' ? opened.box.boxId : '';

    expect(await boxLabelPayload(db, { boxId, warehouseId })).toEqual({ status: 'not_sealed' });

    await sealBox(db, {
      boxId,
      warehouseId,
      picks: [{ orderItemId: itemIds[0]!, batches: [{ stockId: nearBatch, qty: 2 }] }],
    });

    const outcome = await boxLabelPayload(db, { boxId, warehouseId });
    expect(outcome).toMatchObject({
      status: 'ok',
      label: { boxNo: 1, boxCount: 1, parcelName: 'Kutu Müşterisi', deliveryType: 'route', items: [{ qty: 2 }] },
    });
    const label = outcome.status === 'ok' ? outcome.label : null;
    expect(label?.code).toMatch(/^KT-/);
    expect(label?.items[0]?.name).toContain('Cevizli Sucuk');
    // Karar §1.5: etikette fiyat/tutar ASLA — alan adları üstünden de sızmadığı ölçülür.
    const serialized = JSON.stringify(outcome);
    for (const moneyKey of ['Cents', 'price', 'amount', 'total']) {
      expect(serialized).not.toContain(moneyKey);
    }
  });

  it('BAŞKA DEPONUN kutusunun etiketi verilmez', async () => {
    const { orderId, itemIds } = await confirmedOrder([1]);
    const opened = await openBox(db, { orderId, warehouseId });
    const boxId = opened.status === 'ok' ? opened.box.boxId : '';
    await sealBox(db, {
      boxId,
      warehouseId,
      picks: [{ orderItemId: itemIds[0]!, batches: [{ stockId: nearBatch, qty: 1 }] }],
    });

    expect(await boxLabelPayload(db, { boxId, warehouseId: otherWarehouseId })).toEqual({
      status: 'forbidden',
      reason: 'out_of_scope',
    });
  });
});

describe('basım (markBoxPrinted + labelPrinterFor · 23.7)', () => {
  it('yazıcı ayarı ÜÇÜ BİRDEN doluysa döner; eksik ya da hiç yoksa null (yarım ayarla basılmaz)', async () => {
    const settings = new SettingsService(db);
    const scope = { scopeType: 'warehouse' as const, scopeId: warehouseId };

    // Hiç ayar yok → tanımsız.
    expect(await labelPrinterFor(db, warehouseId)).toBeNull();

    // Yarım ayar (yalnız adres) → yine tanımsız: hata depocunun telefonuna taşınmaz.
    createdSettingIds.push((await settings.set(LABEL_PRINTER_KEYS.address, '192.168.1.90', scope)).id);
    expect(await labelPrinterFor(db, warehouseId)).toBeNull();

    createdSettingIds.push((await settings.set(LABEL_PRINTER_KEYS.model, 'QL-1110NWB', scope)).id);
    createdSettingIds.push((await settings.set(LABEL_PRINTER_KEYS.labelSize, 'DieCutW103H164', scope)).id);
    expect(await labelPrinterFor(db, warehouseId)).toEqual({
      address: '192.168.1.90',
      model: 'QL-1110NWB',
      labelSize: 'DieCutW103H164',
    });
    // BAŞKA deponun ayarı yok — kapsam sızmaz.
    expect(await labelPrinterFor(db, otherWarehouseId)).toBeNull();
  });

  it('damga yalnız KAPALI kutuya vurulur ve yeniden basımda güncellenir', async () => {
    const { orderId, itemIds } = await confirmedOrder([1]);
    const opened = await openBox(db, { orderId, warehouseId });
    const boxId = opened.status === 'ok' ? opened.box.boxId : '';

    // Açık kutunun etiketi yok — damgası da olamaz.
    expect(await markBoxPrinted(db, { boxId, warehouseId })).toEqual({ status: 'not_sealed' });

    await sealBox(db, {
      boxId,
      warehouseId,
      picks: [{ orderItemId: itemIds[0]!, batches: [{ stockId: nearBatch, qty: 1 }] }],
    });

    const first = await markBoxPrinted(db, { boxId, warehouseId });
    expect(first.status).toBe('ok');
    const firstAt = first.status === 'ok' ? first.printedAt : '';
    // Aynı AN, iki gösterim: kapı `Z` üretir, Postgres `+00:00` döndürür — metin değil zaman kıyaslanır.
    expect(Date.parse((await boxService.getById(boxId))?.printedAt ?? '')).toBe(Date.parse(firstAt));

    // Yeniden basım damgayı İLERİ taşır — `printed_at` "en son ne zaman"dır.
    const second = await markBoxPrinted(db, { boxId, warehouseId });
    const secondAt = second.status === 'ok' ? second.printedAt : '';
    expect(Date.parse(secondAt)).toBeGreaterThanOrEqual(Date.parse(firstAt));

    // Kapsam kapısı etiketle aynı çizgide.
    expect(await markBoxPrinted(db, { boxId, warehouseId: otherWarehouseId })).toEqual({
      status: 'forbidden',
      reason: 'out_of_scope',
    });
  });
});
