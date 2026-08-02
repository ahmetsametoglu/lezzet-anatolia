import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, OrderItemBatchService, OrderService, ProductService, ReservationService, StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, settingsSnapshot, createTestWarehouse } from '@lezzet/database/testing';
import { quickSale } from './quick-sale';
import { transitionOrder } from './transition';

/**
 * Hızlı satış (07.10) — kapı önü tek adım. Doğrulanan şey: **tek çağrıda kapanıyor mu** (stok
 * fiiliden düşüyor, referans doğuyor, para yazılıyor, iz kalıyor) ve **olmayan malı satmıyor mu**.
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
let variantId: string;
let productId: string;
let categoryId: string;
let batchA: string;
let batchB: string;
let cashAccount: string;
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Kapı satışı testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Mantı ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  const profile = await new UserProfileService(db).insert({ name: `Kapı müşterisi ${stamp}` });
  customerId = profile.id;
  createdProfiles.push(profile.id);
  // Kapı önü nakdinin gireceği çekmece — tahsilat artık bir HAREKETTİR (12.2).
  cashAccount = (await new AccountService(db).insert({ name: `Kapı kasası ${stamp}`, type: 'cash' })).id;
});

beforeEach(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('reservation').delete().eq('variant_id', variantId);
  await db.from('stock').delete().eq('variant_id', variantId);
  // A önce doluyor (yakın tarih) — FEFO onu önce çıkarmalı.
  batchA = (await stocks.insert({ warehouseId, variantId, physicalQty: 3, expiryDate: dayOffset(10), purchasePrice: 2 })).id;
  batchB = (await stocks.insert({ warehouseId, variantId, physicalQty: 10, expiryDate: dayOffset(300), purchasePrice: 3 })).id;
});

afterAll(async () => {
  await db.from('money_movement').delete().eq('account_id', cashAccount);
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('account').delete().eq('id', cashAccount);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: createdProfiles });
  await db.from('warehouse').delete().eq('id', warehouseId);
});

/** Kapıda açılan taslak: kaynak `door`, teslimat yok. */
async function doorDraft(qty: number, unitPrice = 10) {
  return orders.create(
    { warehouseId, customerId, channel: 'b2c', orderSource: 'door', total: qty * unitPrice },
    [{ variantId, qty, unitPrice, vatRate: 5.5 }],
  );
}

describe('hızlı satış (07.10)', () => {
  it('tek çağrıda kapanır: stok fiiliden düşer, referans doğar, para yazılır', async () => {
    const { order } = await doorDraft(4);

    const outcome = await quickSale({ orderId: order.id, paymentMethod: 'cash', paymentAccountId: cashAccount });
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;

    expect(outcome.referenceNo).toMatch(/^LA-\d{2}-/); // ilk kalıcı durum `completed`
    expect(outcome.consumedQty).toBe(4);
    expect(outcome.paymentRecorded).toBe(true);

    const kapanan = await orders.getById(order.id);
    expect(kapanan).toMatchObject({
      status: 'completed',
      paymentStatus: 'paid', // tahsilat hareketinden TÜRETİLDİ
      paymentMethod: 'cash',
      amountCollected: 40,
      deliveryCost: 0, // kapıda teslimat yapılmadı — rota birim maliyeti yazılamaz
      paymentFee: 0, // nakitte komisyon sıfırdır (uydurma değil, olgu)
    });

    // Para uydurulmadı: nakit gerçekten kasanın bakiyesine girdi.
    expect((await new AccountService(db).balance(cashAccount)).balance).toBe(40);

    // FEFO: önce süresi dolan çıktı — 3 × A (2 €) + 1 × B (3 €) = 9 €.
    expect((await stocks.getById(batchA))?.physicalQty).toBe(0);
    expect((await stocks.getById(batchB))?.physicalQty).toBe(9);
    expect(outcome.cogsAmount).toBe(9);
  });

  it('adım atlandı diye İZ atlanmaz: parti kaydı ve geçiş logu yazılır', async () => {
    const { order } = await doorDraft(2);
    await quickSale({ orderId: order.id, paymentMethod: 'card' });

    // Geri çağırma ("bu parti kime gitti") hızlı satışta da çalışır.
    const partiler = await itemBatches.listByOrder(order.id);
    expect(partiler).toHaveLength(1);
    expect(partiler[0]).toMatchObject({ stockId: batchA, qty: 2 });

    const gecisler = await db.from('order_status_log').select('from_status,to_status').eq('order_id', order.id);
    expect(gecisler.data).toEqual([{ from_status: 'draft', to_status: 'completed' }]);
  });

  it('rezervasyon adımı YOK: satış sonrası siparişin ayrılmışı kalmaz', async () => {
    const { order } = await doorDraft(2);
    // Online sepetini açmış, kapıya gelip almış: kendi ayırdığı mal kendisini engellemez.
    await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty: 2 });

    expect((await quickSale({ orderId: order.id, paymentMethod: 'cash' })).status).toBe('ok');
    expect(await reservations.listActiveByOrder(order.id)).toHaveLength(0);
    expect((await stocks.getById(batchA))?.physicalQty).toBe(1);
  });

  it('BAŞKASINA ayrılmış mal kapıda satılamaz — tek satır yazılmadan reddedilir', async () => {
    const { order: baskasi } = await doorDraft(1);
    await reservations.reserve({ orderId: baskasi.id, warehouseId, variantId, qty: 12 }); // 13'ün 12'si sözlü

    // FEFO önerisi parti bazında bakar (varyant-toplamı rezervasyonu görmez); son söz RPC'nindir —
    // emniyet, öneriyi üreten katmanda değil, yazımın olduğu yerde durur.
    const { order } = await doorDraft(3);
    const outcome = await quickSale({ orderId: order.id, paymentMethod: 'cash' });
    expect(outcome).toMatchObject({ status: 'insufficient_stock', variantId, available: 1 });

    // Reddedilen satış hiçbir iz bırakmaz.
    expect((await stocks.getById(batchA))?.physicalQty).toBe(3);
    expect((await orders.getById(order.id))?.status).toBe('draft');
    expect(await itemBatches.listByOrder(order.id)).toHaveLength(0);
  });

  it('taslak olmayan sipariş kapıda satılamaz', async () => {
    const { order } = await doorDraft(1);
    await transitionOrder({ orderId: order.id, to: 'confirmed' });

    // `confirmed → completed` motorun geçiş tablosunda YOK: kural reddi, stok yarışı değil.
    expect(await quickSale({ orderId: order.id, paymentMethod: 'cash' })).toMatchObject({
      status: 'forbidden',
      reason: 'not_allowed',
    });
    expect((await stocks.getById(batchA))?.physicalQty).toBe(3);
  });

  it('teslim edilmiş sipariş hızlı satış yolundan kapatılamaz — o kapanıştır (07.7)', async () => {
    const { order } = await doorDraft(1);
    await db.from('order').update({ status: 'delivered' }).eq('id', order.id);

    // `delivered → completed` İZİNLİ ama hızlı satış değil: stoğu ikinci kez düşürmemeli.
    expect(await quickSale({ orderId: order.id, paymentMethod: 'cash' })).toMatchObject({
      status: 'forbidden',
      reason: 'not_fast_sale_path',
    });
    expect((await stocks.getById(batchA))?.physicalQty).toBe(3);
  });

  it('kapıda eksik verilirse ödeme durumu kendiliğinden düzelir', async () => {
    const { order, items } = await doorDraft(4);

    // 4 istendi, 2 verildi; para yine 4'ünki alınmış olsa durum `paid` kalır ama fazlalık görünür —
    // burada gerçekten verilen kadarı tahsil ediliyor.
    const outcome = await quickSale({
      orderId: order.id,
      paymentMethod: 'cash',
      paymentAccountId: cashAccount,
      collectedAmount: 20,
      picks: [{ orderItemId: items[0]!.id, batches: [{ stockId: batchA, qty: 2 }] }],
    });
    expect(outcome.status).toBe('ok');

    const kapanan = await orders.getById(order.id);
    expect(kapanan?.paymentStatus).toBe('paid'); // 20 € tahsil, 20 € karşılandı
    expect((await stocks.getById(batchA))?.physicalQty).toBe(1);
    const line = (await orders.getWithItems(order.id))!.items[0]!;
    expect(line.fulfilledQty).toBe(2);
  });

  it('hesap belirsizse satış YİNE kapanır — mal gitti, para kayıtsız görünür', async () => {
    // Uydurulmuş bir "ödendi"den, kaydedilmemiş ama görünür bir tahsilat iyidir.
    // Ayar seed'de dolu olabilir; bu senaryo tam da onun BOŞ olduğu hâli sınıyor → geçici olarak kaldır.
    const settings = settingsSnapshot(db);
    await settings.remove('door_cash_account_id');

    try {
      const { order } = await doorDraft(1);
      const outcome = await quickSale({ orderId: order.id, paymentMethod: 'cash' }); // hesap yok, ayar da yok
      expect(outcome.status).toBe('ok');
      if (outcome.status !== 'ok') return;
      expect(outcome.paymentRecorded).toBe(false);

      const kapanan = await orders.getById(order.id);
      expect(kapanan?.status).toBe('completed'); // mal gitti, satış kapandı
      expect(kapanan?.amountCollected).toBe(0); // para kaydı yok — uydurulmadı
      expect(kapanan?.paymentStatus).toBe('pending');
    } finally {
      // Ne bulduysak onu bırakırız — ayar YOKTUYSA yok kalır (eskiden `if (previous)` ile atlanıyordu,
      // yani test değeri geride kalabiliyordu).
      await settings.restore();
    }
  });

  it('iki kez satılamaz — stok bir kez düşer', async () => {
    const { order } = await doorDraft(2);
    await quickSale({ orderId: order.id, paymentMethod: 'cash' });

    const ikinci = await quickSale({ orderId: order.id, paymentMethod: 'cash' });
    expect(ikinci.status).toBe('forbidden'); // `completed` terminal
    expect((await stocks.getById(batchA))?.physicalQty).toBe(1);
  });
});
