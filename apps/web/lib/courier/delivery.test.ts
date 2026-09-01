import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, OrderItemBatchService, OrderService, ProductService, ReservationService,
  StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, settingsSnapshot, createTestWarehouse, purgeVariantStock, mustDelete } from '@lezzet/database/testing';
import { openBox, sealBox } from '@lezzet/application';
import { confirmDoorDelivery, type DeliveryProofInput, type DoorCollectionInput } from './delivery';
import { readDeliveryProof, requestDeliveryProofUploadUrl } from './proof';
import { transitionOrder } from '../order/transition';

/**
 * Kapıda teslim, eksik kalem ve tahsilat (11.2/11.3).
 *
 * Üç kritik doğrulama: **B2B imzasız kapanmıyor mu**, **eksik işareti tutarı kendiliğinden
 * düşürüyor mu** (kurye hesap yapmaz) ve **nakit sınır uyarısı engel değil mi**.
 */
const db = serviceDb();
const orders = new OrderService(db);
const itemBatches = new OrderItemBatchService(db);
const stocks = new StockService(db);
const reservations = new ReservationService(db);

const stamp = Date.now();
let customerId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let b2bCustomerId: string;
let courierId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let stockId: string;
let accountId: string;
const createdProfiles: string[] = [];

const today = new Date().toISOString().slice(0, 10);
const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Kapı testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Sucuk ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '400 g' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  const profiles = new UserProfileService(db);
  const customer = await profiles.insert({ name: 'Luc Martin', email: `kapi-${stamp}@example.test` });
  const b2b = await profiles.insert({ name: 'Restaurant Anadolu', email: `b2b-${stamp}@example.test`, type: 'company' });
  const courier = await profiles.insert({ name: 'Kurye Ece', email: `ece-${stamp}@example.test` });
  customerId = customer.id;
  b2bCustomerId = b2b.id;
  courierId = courier.id;
  createdProfiles.push(customer.id, b2b.id, courier.id);

  accountId = (await new AccountService(db).insert({ name: `Kurye kasası ${stamp}`, type: 'cash' })).id;
});

beforeEach(async () => {
  // **DEFTER SİPARİŞTEN DE PARTİDEN DE ÖNCE** (06.14) — künye `packages/application/src/courier/
  // delivery.test.ts`te. Özeti: teslimin `sale` satırı ikisini birden `restrict` ile tutuyor ve
  // eski `db.from(...).delete()` çağrıları hatayı yutup teardown'ı sessizce yarım bırakıyordu.
  await purgeVariantStock(db, [variantId]);
  for (const id of [customerId, b2bCustomerId]) await mustDelete(db, 'order', (q) => q.eq('customer_id', id));
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  stockId = (await stocks.insert({ warehouseId, variantId, physicalQty: 30, expiryDate: dayOffset(60), purchasePriceCents: 400 })).id;
});

afterAll(async () => {
  // Sipariş ve rezervasyon AYRICA silinmez: ikisi de `purgeTestData`'nın bildiği bağlar (sipariş
  // `profileIds`ten, rezervasyon `productIds`ten) ve hareketin anahtarı zaten hesaptır
  // (`money_movement.order_id` `set null` — denetim R1). Elle yazılan bu satırlar teardown'ı
  // öldürüyordu (ölçüldü 14.08, `cleanup.ts` künyesi).
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    accountIds: [accountId],
    warehouseIds: [warehouseId],
  });
});

/** Kapıya varmış sipariş: hazırlanmış, partisi yazılmış, yola çıkmış. */
async function atTheDoor(opts: { channel?: 'b2b' | 'b2c'; qty?: number; unitPriceCents?: number } = {}) {
  const qty = opts.qty ?? 4;
  const unitPriceCents = opts.unitPriceCents ?? 1000;
  const channel = opts.channel ?? 'b2c';
  const { order, items } = await orders.create(
    {
      warehouseId,
      customerId: channel === 'b2b' ? b2bCustomerId : customerId,
      channel,
      deliveryType: 'route',
      deliveryDate: today,
      courierId,
      paymentMethod: 'cash',
      orderedTotalCents: qty * unitPriceCents,
    },
    [{ variantId, qty, unitPriceCents, vatRate: 5.5 }],
  );
  await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty });
  for (const status of ['confirmed', 'preparing'] as const) await transitionOrder({ orderId: order.id, to: status });
  /* HAZIRLIK KUTUYLA (30.08): kutusuz sipariş `ready` olamaz, kapıdan da geçemez. */
  const box = await openBox(db, { orderId: order.id, warehouseId });
  if (box.status !== 'ok') throw new Error(`fikstür: kutu açılamadı (${box.status})`);
  const sealed = await sealBox(db, {
    boxId: box.box.boxId,
    warehouseId,
    picks: [{ orderItemId: items[0]!.id, batches: [{ stockId, qty }] }],
  });
  if (sealed.status !== 'ok') throw new Error(`fikstür: kutu mühürlenemedi (${sealed.status})`);
  await transitionOrder({ orderId: order.id, to: 'out_for_delivery' });
  return { orderId: order.id, itemId: items[0]!.id, boxCode: box.box.code };
}

describe('teslim onayı (11.2)', () => {
  it('kanıt kapsamı AÇIKKEN B2B teslimatı imzasız KAPANMAZ ve hiçbir yazım yapılmaz', async () => {
    /* Fabrika değeri 30.08'de İKİ KANAL İÇİN DE kapatıldı (imza adımı söküldü); kapıyı ölçen test
       artık kapsamı kendisi açar ve `finally`'de geri koyar — `settings` küresel tekil satırdır. */
    const settings = settingsSnapshot(db);
    await settings.override('delivery_proof_required', { b2b: true, b2c: false });
    try {
      const { orderId } = await atTheDoor({ channel: 'b2b' });

      const outcome = await confirmDoorDelivery({ orderId, courierId });

      expect(outcome).toEqual({ status: 'proof_required', channel: 'b2b' });
      // Kanıt kapısı yazımdan ÖNCE: sipariş hâlâ yolda, stok el değmemiş.
      expect((await orders.getById(orderId))?.status).toBe('out_for_delivery');
      expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(30);
    } finally {
      await settings.restore();
    }
  });

  it('kanıt kapsamı AÇIKKEN kanıtla B2B teslimatı kapanır ve kanıt siparişe yazılır', async () => {
    const settings = settingsSnapshot(db);
    await settings.override('delivery_proof_required', { b2b: true, b2c: false });
    try {
      const { orderId } = await atTheDoor({ channel: 'b2b' });
      // Ekranın göndereceği şekiller — kanıt görsel anahtarı taşır, tahsilat üç yöntemle sınırlıdır.
      const proof: DeliveryProofInput = { kind: 'signature', imageKey: 'proofs/abc.png', receivedBy: 'Şef Murat' };
      const collection: DoorCollectionInput = { method: 'cash', amountCents: 4000, accountId };

      const outcome = await confirmDoorDelivery({ orderId, courierId, proof, collection });

      expect(outcome.status).toBe('ok');
      const order = await orders.getById(orderId);
      expect(order?.status).toBe('delivered');
      expect(order?.deliveryProof).toMatchObject({ kind: 'signature', receivedBy: 'Şef Murat', courierId });
    } finally {
      await settings.restore();
    }
  });

  it('B2C kanıtsız teslim edilebilir — kapsam parametrik, varsayılan kapalı', async () => {
    const { orderId } = await atTheDoor();

    expect((await confirmDoorDelivery({ orderId, courierId })).status).toBe('ok');
    expect((await orders.getById(orderId))?.status).toBe('delivered');
  });

  it('başka kuryenin siparişi bu ekrandan teslim edilemez', async () => {
    const { orderId } = await atTheDoor();
    await orders.update({ id: orderId, courierId: null });

    expect(await confirmDoorDelivery({ orderId, courierId })).toEqual({ status: 'forbidden', reason: 'not_assigned' });
  });
});

describe('eksik/reddedilen kalem (11.2)', () => {
  it('eksik işareti tutarı KENDİLİĞİNDEN düşürür — kurye hesap yapmaz', async () => {
    const { orderId, itemId } = await atTheDoor({ qty: 4 }); // 40 €

    // Müşteri 1 adedi kabul etmedi → 3 adet teslim.
    const outcome = await confirmDoorDelivery({
      orderId, courierId,
      adjustments: [{ orderItemId: itemId, fulfilledQty: 3 }],
      collection: { method: 'cash', amountCents: 3000, accountId },
    });

    expect(outcome).toMatchObject({ status: 'ok', collectedCents: 3000, amountDueCents: 0, paymentStatus: 'paid' });
    // Reddedilen adet HİÇ çıkmadı: fiiliden yalnız 3 düştü, 1 adet depoda kaldı.
    expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(27);
  });

  it('kalem düzeltmesi teslimden ÖNCE yazılır — mal iki kez oynatılmaz', async () => {
    const { orderId, itemId } = await atTheDoor({ qty: 4 });

    await confirmDoorDelivery({
      orderId, courierId,
      adjustments: [{ orderItemId: itemId, fulfilledQty: 2 }],
      collection: { method: 'cash', amountCents: 2000, accountId },
    });

    // Kalem–parti kaydı 2'ye inmiş olmalı: teslimde bundan düşülür (0026 "tam bir kez say").
    const batches = await itemBatches.listByOrder(orderId);
    expect(batches.reduce((sum, batch) => sum + batch.qty, 0)).toBe(2);
    expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(28);
  });
});

describe('tahsilat ve nakit sınırı (11.3)', () => {
  it('nakit yasal sınır aşımında UYARI çıkar ama tahsilat tamamlanır', async () => {
    const { orderId } = await atTheDoor({ qty: 4, unitPriceCents: 50_000 }); // 2.000 € — sınır 1.000 €

    const outcome = await confirmDoorDelivery({
      orderId, courierId,
      collection: { method: 'cash', amountCents: 200_000, accountId },
    });

    expect(outcome).toMatchObject({ status: 'ok', cashLimitExceeded: true, collectedCents: 200_000, paymentStatus: 'paid' });
    expect((await orders.getById(orderId))?.status).toBe('delivered'); // engellenmedi
  });

  it('aynı tutar KARTLA alınırsa uyarı yok — sınır yalnız nakde ait', async () => {
    const { orderId } = await atTheDoor({ qty: 4, unitPriceCents: 50_000 });

    const outcome = await confirmDoorDelivery({
      orderId, courierId,
      collection: { method: 'card', amountCents: 200_000, accountId },
    });

    expect(outcome).toMatchObject({ status: 'ok', cashLimitExceeded: false });
    // Yöntem siparişe yazılır: gün kapanışı beklenen toplamları bundan türetir (11.6).
    expect((await orders.getById(orderId))?.paymentMethod).toBe('card');
  });

  it('sınır ayardan gelir — kodda sabit yok', async () => {
    const settings = settingsSnapshot(db);
    await settings.override('cash_legal_limit_cents', 1_000); // 10 €
    const { orderId } = await atTheDoor({ qty: 4 });

    try {
      const outcome = await confirmDoorDelivery({
        orderId, courierId,
        collection: { method: 'cash', amountCents: 4000, accountId },
      });
      expect(outcome).toMatchObject({ cashLimitExceeded: true });
    } finally {
      await settings.restore();
    }
  });

  it('tahsilatsız teslim: kalan borç görünür kalır', async () => {
    const { orderId } = await atTheDoor({ qty: 4 });

    const outcome = await confirmDoorDelivery({ orderId, courierId });

    expect(outcome).toMatchObject({ status: 'ok', collectedCents: 0, amountDueCents: 4000, paymentStatus: 'pending' });
  });
});

/**
 * Teslim kanıtının YÜKLEME kapısı (11.2).
 *
 * Bu blok kendi fikstürünü kurmuyor, yukarıdakini kullanıyor (`atTheDoor`): ikinci bir sipariş
 * kurulumu yazmak aynı seksen satırı ikinci kez yazmak olurdu ve ikisi bir gün ayrışırdı
 * (`CLAUDE §1`). Sınanan üç kural: **anahtarı kapı seçer**, **başkasının siparişine yüklenemez**,
 * **yalnız görsel kabul edilir**.
 */
describe('teslim kanıtı yükleme kapısı (11.2)', () => {
  it('kuryesi olduğu siparişe imzalı adres üretir ve ANAHTARI kapı seçer', async () => {
    const { orderId } = await atTheDoor();

    const result = await requestDeliveryProofUploadUrl({ orderId, courierId, filename: 'imza.png' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Anahtar sipariş kimliğine göre klasörlü: kanıt siparişle birlikte temizlenebilsin diye.
    expect(result.key).toMatch(new RegExp(`^delivery/proofs/${orderId}/[a-z0-9-]+\\.png$`));
    expect(result.uploadUrl).toContain('https://');
  });

  it('aynı siparişe iki kanıt AYRI anahtar alır — biri ötekini ezmez', async () => {
    // Bir teslimatta hem imza hem fotoğraf olabilir; üzerine yazılan şey, "eksik geldi"
    // ihtilafının tek sigortasıdır.
    const { orderId } = await atTheDoor();

    const ilk = await requestDeliveryProofUploadUrl({ orderId, courierId, filename: 'imza.png' });
    const ikinci = await requestDeliveryProofUploadUrl({ orderId, courierId, filename: 'kapi.jpg' });

    expect(ilk.ok && ikinci.ok).toBe(true);
    if (!ilk.ok || !ikinci.ok) return;
    expect(ilk.key).not.toBe(ikinci.key);
  });

  it('BAŞKA kuryenin siparişine yüklenemez — ve cevap "yok" ile aynı', async () => {
    // Ayrı cevap verseydik kimlik deneyerek hangi siparişlerin var olduğu haritalanabilirdi.
    const { orderId } = await atTheDoor();

    const result = await requestDeliveryProofUploadUrl({
      orderId,
      courierId: '00000000-0000-0000-0000-000000000000',
      filename: 'imza.png',
    });

    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('görsel olmayan dosya reddedilir — yetki sorusuna hiç gelinmeden', async () => {
    const { orderId } = await atTheDoor();

    const result = await requestDeliveryProofUploadUrl({ orderId, courierId, filename: 'kanit.pdf' });

    expect(result).toEqual({ ok: false, reason: 'unsupported_type' });
  });

  it('yazılan kanıt OKUNABİLİYOR — yazılıp hiç açılmayan sigorta, olmayan sigortadır', async () => {
    // Sözleşmenin iki ucu bir kez ayrışmıştı: yazan `imageKey` koyuyordu, ekran `photos[]`
    // arıyordu. Bu test o turu kapatıyor — yazılan kayıt aynı şemadan geri okunuyor.
    const { orderId } = await atTheDoor({ channel: 'b2b' });
    const upload = await requestDeliveryProofUploadUrl({ orderId, courierId, filename: 'imza.png' });
    expect(upload.ok).toBe(true);
    if (!upload.ok) return;

    await confirmDoorDelivery({
      orderId,
      courierId,
      proof: { kind: 'signature', imageKey: upload.key, receivedBy: 'Mehmet Yılmaz' },
    });

    const stored = (await orders.getById(orderId))?.deliveryProof;
    const view = await readDeliveryProof(stored);
    expect(view).toMatchObject({ kind: 'signature', imageKey: upload.key, receivedBy: 'Mehmet Yılmaz', courierId });
    // Açılabilir adres: kanıtın tek amacı ihtilafta AÇILMAK.
    expect(view?.imageUrl).toContain('https://');
  });

  it('tanınmayan biçimdeki blok null döner — yarım kanıt "kanıt var" der', async () => {
    // Eski biçimde yazılmış bir blok varsa yarım göstermektense hiç göstermemek doğru.
    expect(await readDeliveryProof({ photos: ['x'], by: 'biri' })).toBeNull();
    expect(await readDeliveryProof(null)).toBeNull();
  });
});
