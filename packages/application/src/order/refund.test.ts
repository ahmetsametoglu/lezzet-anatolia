import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, OrderItemBatchService, OrderService, ProductService, ReservationService, StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import { recordOrderPayment } from './payment';
import { closeOrder, deliverOrder } from './fulfillment';
import { adjustFulfillment, cancelOrder } from './refund';
import { advanceOrder, prepareOrderToReady } from './advance.testkit';
import { transitionOrder } from './transition';

/**
 * Kısmi karşılama (07.8) ve iptal/iade (07.9) — terfi 21.10 ile taşındı (kaynağı
 * `apps/web/lib/order/refund.test.ts`); D6 depo kapsamı burada sınanıyor.
 *
 * Doğrulanan iki şey: **iade tutarı türetimden çıkıyor mu** (kupon payı ve kargo dâhil) ve **mal ile
 * para aynı gerçeği mi söylüyor** — geri dönen adet stoğa girerken maliyetin de siparişten çıkması,
 * imha edilende ise kalması gerekir.
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
let batchId: string;
let cashAccount: string;
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `İade testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Mantı ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  const profile = await new UserProfileService(db).insert({ name: `İade müşterisi ${stamp}` });
  customerId = profile.id;
  createdProfiles.push(profile.id);
  cashAccount = (await new AccountService(db).insert({ name: `İade kasası ${stamp}`, type: 'cash' })).id;
});

beforeEach(async () => {
  await db.from('money_movement').delete().eq('account_id', cashAccount);
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('reservation').delete().eq('variant_id', variantId);
  const previous = await db.from('stock').select('id').eq('variant_id', variantId);
  const ids = (previous.data ?? []).map((row) => row.id as string);
  if (ids.length > 0) await db.from('stock_adjustment').delete().in('stock_id', ids);
  await db.from('stock').delete().eq('variant_id', variantId);
  batchId = (await stocks.insert({ warehouseId, variantId, physicalQty: 10, expiryDate: dayOffset(30), purchasePriceCents: 400 })).id;
});

afterAll(async () => {
  // Sipariş ve rezervasyon AYRICA silinmez: `purgeTestData` ikisini de biliyor — siparişi
  // `profileIds`ten, rezervasyonu hem sipariş üzerinden (FK'sız bağ, 0007) hem `productIds`ten.
  // Elle yazılan bu satırlar teardown'ı öldürüyordu (ölçüldü 14.08, `cleanup.ts` künyesi).
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    accountIds: [cashAccount],
    warehouseIds: [warehouseId],
  });
});

/**
 * Sipariş aç → ayır → hazırla. Kalem tek: `qty` adet, birim 10 €. Durum `ready`'de bırakılır.
 *
 * **Adımlar 25.08'de testkit'e taşındı** (`prepareOrderToReady`): ödül geri alma testi (17.11) aynı
 * beş adıma ihtiyaç duydu ve ikinci nüsha yazmak yerine ortak eve alındı (CLAUDE §1). Burada kalan
 * tek şey BU dosyanın sabitleri — depo, müşteri, varyant, parti ve 10 €'luk birim.
 */
async function prepare(qty: number, extra: { shippingFeeCents?: number; lineDiscountAmountCents?: number } = {}) {
  return prepareOrderToReady(db, {
    warehouseId,
    customerId,
    variantId,
    stockId: batchId,
    qty,
    unitPriceCents: 1000,
    ...extra,
  });
}

/** Hazırlananı yola çıkarır — teslime hazır hâl. */
async function sendOut(qty: number, extra: { shippingFeeCents?: number; lineDiscountAmountCents?: number } = {}) {
  const prepared = await prepare(qty, extra);
  await advanceOrder(db, prepared.orderId, ['out_for_delivery']);
  return prepared;
}

describe('kısmi karşılama (07.8)', () => {
  it('peşin ödenmiş siparişte eksik kalemin farkı OTOMATİK iade edilir', async () => {
    const { orderId, itemId } = await sendOut(3);
    await recordOrderPayment(db, { orderId, accountId: cashAccount, amountCents: 3000 });

    const outcome = await adjustFulfillment(db, orderId, [{ orderItemId: itemId, fulfilledQty: 2 }]);

    expect(outcome).toMatchObject({ status: 'ok', refundedAmountCents: 1000, paymentStatus: 'paid' });
    const order = await orders.getById(orderId);
    expect(order).toMatchObject({ amountCollectedCents: 3000, amountRefundedCents: 1000, paymentStatus: 'paid' });
  });

  it('kuponlu + kargolu siparişte iade tutarı KALEMİN payından hesaplanır', async () => {
    // 3 × 10 € = 30, kupon payı 6 €, kargo 5 € → tahsilat 29 €.
    const { orderId, itemId } = await sendOut(3, { shippingFeeCents: 500, lineDiscountAmountCents: 600 });
    await recordOrderPayment(db, { orderId, accountId: cashAccount, amountCents: 2900 });

    const outcome = await adjustFulfillment(db, orderId, [{ orderItemId: itemId, fulfilledQty: 2 }]);

    // Karşılanan: 2 × 10 − (6 × 2/3) + 5 kargo = 21 → iade 8. Kupon payı bölünmeseydi 10 çıkardı.
    expect(outcome).toMatchObject({ status: 'ok', refundedAmountCents: 800, paymentStatus: 'paid' });
  });

  it('kapıda ödenecek siparişte iade YAZILMAZ, tahsil edilecek tutar düşer', async () => {
    const { orderId, itemId } = await sendOut(3, { shippingFeeCents: 500 });

    const outcome = await adjustFulfillment(db, orderId, [{ orderItemId: itemId, fulfilledQty: 1 }]);

    expect(outcome).toMatchObject({ status: 'ok', refundedAmountCents: 0, paymentStatus: 'pending', amountToCollectCents: 1500 });
    expect((await orders.getById(orderId))?.amountRefundedCents).toBe(0);
  });

  it('teslim edilmemiş eksik mal ayrılmıştan geri bırakılır, fiili stok DEĞİŞMEZ', async () => {
    const { orderId, itemId } = await sendOut(4);

    const outcome = await adjustFulfillment(db, orderId, [{ orderItemId: itemId, fulfilledQty: 1 }]);

    expect(outcome).toMatchObject({ status: 'ok', releasedQty: 3, restockedQty: 0 });
    expect((await stocks.getById(batchId))?.physicalQty).toBe(10); // teslim olmadı, düşüm de yok
    const active = await reservations.listActiveByOrder(orderId);
    expect(active.reduce((sum, row) => sum + row.qty, 0)).toBe(1);
  });

  it('gitmeyen mal COGS’a girmez — kalem–parti kaydı da düşer', async () => {
    const { orderId, itemId } = await sendOut(4);
    await adjustFulfillment(db, orderId, [{ orderItemId: itemId, fulfilledQty: 1 }]);
    await deliverOrder(db, orderId);

    expect(await closeOrder(db, orderId)).toMatchObject({ ok: true, cogsAmountCents: 400 }); // 1 × 4 €, 4 × 4 değil
    expect((await stocks.getById(batchId))?.physicalQty).toBe(9);
  });
});

/**
 * **D6 — akıbet kapısının depo kapsamı** (21.10 hazırlığı).
 *
 * Bugün web köprüsü bu kapıyı `requireAdmin` guard'ıyla açıyor ve DOMAIN §8 "akıbet kararı
 * depocunundur" diyor. Kapsam parametresi, mobil depo ucunun (21.11) guard'ı UÇTA ikinci kez
 * yazmadan açabilmesi için imzada duruyor. Kimlik/rol kararı hâlâ ucun işi — burada yalnız
 * "siparişin deposu verilen kümede mi" sorusu var.
 */
describe('depo kapsamı (D6 hazırlığı)', () => {
  it('kapsam VERİLMEZSE soru sorulmaz — bugünkü davranış birebir', async () => {
    const { orderId, itemId } = await sendOut(2);

    const outcome = await adjustFulfillment(db, orderId, [{ orderItemId: itemId, fulfilledQty: 1 }]);

    expect(outcome.status).toBe('ok');
  });

  it('kapsam dışı depo REDDEDİLİR ve HİÇBİR yazım yapılmaz', async () => {
    const { orderId, itemId } = await sendOut(2);

    const outcome = await adjustFulfillment(db, orderId, [{ orderItemId: itemId, fulfilledQty: 1 }], {
      warehouseScope: ['00000000-0000-0000-0000-000000000000'],
    });

    expect(outcome).toEqual({ status: 'forbidden', reason: 'out_of_scope' });
    // Kapı yazımdan ÖNCE kapanır: kalem el değmemiş, ayrılmış duruyor.
    const active = await reservations.listActiveByOrder(orderId);
    expect(active.reduce((sum, row) => sum + row.qty, 0)).toBe(2);
  });

  it('kapsam İÇİNDEKİ depo geçer — kural erişimi kapatmaz, daraltır', async () => {
    const { orderId, itemId } = await sendOut(2);

    const outcome = await adjustFulfillment(db, orderId, [{ orderItemId: itemId, fulfilledQty: 1 }], {
      warehouseScope: [warehouseId],
    });

    expect(outcome).toMatchObject({ status: 'ok', releasedQty: 1 });
  });

  it('iptal kapısı da aynı kapsamı sorar', async () => {
    const { orderId } = await prepare(2);

    const outcome = await cancelOrder(db, orderId, { warehouseScope: ['00000000-0000-0000-0000-000000000000'] });

    expect(outcome).toEqual({ status: 'forbidden', reason: 'out_of_scope' });
    expect((await orders.getById(orderId))?.status).toBe('ready');
  });
});

describe('teslim sonrası iade — malın nereye gittiği maliyeti belirler (DOMAIN §8)', () => {
  it('restock: mal depoya geri girer, maliyeti siparişten çıkar', async () => {
    const { orderId, itemId } = await sendOut(3);
    await recordOrderPayment(db, { orderId, accountId: cashAccount, amountCents: 3000 });
    await deliverOrder(db, orderId);
    expect((await stocks.getById(batchId))?.physicalQty).toBe(7);

    const outcome = await adjustFulfillment(db, orderId, [
      { orderItemId: itemId, fulfilledQty: 1, returnDisposition: 'restock', note: 'Müşteri iade etti' },
    ]);

    expect(outcome).toMatchObject({ status: 'ok', restockedQty: 2, refundedAmountCents: 2000 });
    expect((await stocks.getById(batchId))?.physicalQty).toBe(9); // 7 + 2
    expect(await closeOrder(db, orderId)).toMatchObject({ ok: true, cogsAmountCents: 400 }); // yalnız kalan 1 adet
  });

  it('discard: fiili stok DEĞİŞMEZ (ikinci kez düşemez), maliyet siparişte kalır', async () => {
    const { orderId, itemId } = await sendOut(3);
    await recordOrderPayment(db, { orderId, accountId: cashAccount, amountCents: 3000 });
    await deliverOrder(db, orderId);

    const outcome = await adjustFulfillment(db, orderId, [
      { orderItemId: itemId, fulfilledQty: 1, returnDisposition: 'discard', note: 'Soğuk zincir kırıldı' },
    ]);

    expect(outcome).toMatchObject({ status: 'ok', restockedQty: 0, refundedAmountCents: 2000 });
    expect((await stocks.getById(batchId))?.physicalQty).toBe(7); // teslimdeki düşüm, tek sefer
    expect(await closeOrder(db, orderId)).toMatchObject({ ok: true, cogsAmountCents: 1200 }); // 3 × 4 — kayıp kârda görünür
  });

  it('goodwill: mal müşteride kalır — miktar da stok da değişmez, tutarı operatör verir', async () => {
    const { orderId, itemId } = await sendOut(2);
    await recordOrderPayment(db, { orderId, accountId: cashAccount, amountCents: 2000 });
    await deliverOrder(db, orderId);

    const outcome = await adjustFulfillment(
      db,
      orderId,
      [{ orderItemId: itemId, fulfilledQty: 2, returnDisposition: 'goodwill' }],
      { refundAmountCents: 2000 },
    );

    expect(outcome).toMatchObject({ status: 'ok', refundedAmountCents: 2000, paymentStatus: 'refunded' });
    expect((await stocks.getById(batchId))?.physicalQty).toBe(8); // mal geri gelmedi
    const items = await orders.getWithItems(orderId);
    expect(items?.items[0]).toMatchObject({ fulfilledQty: 2, returnDisposition: 'goodwill' });
  });

  it('iade süreci kapanışı: `returned` durumundan da kapanır (ORDER_LIFECYCLE)', async () => {
    const { orderId, itemId } = await sendOut(2);
    await deliverOrder(db, orderId);
    await adjustFulfillment(db, orderId, [{ orderItemId: itemId, fulfilledQty: 0, returnDisposition: 'restock', note: 'Tamamı döndü' }]);
    await advanceOrder(db, orderId, ['returned']);

    expect(await closeOrder(db, orderId)).toMatchObject({ ok: true, currentStatus: 'completed', cogsAmountCents: 0 });
  });
});

/**
 * **KAPI DENKLİĞİ (02.20 · denetim 26.08).** Aşağıdaki testler bir SONUCU değil bir KURALI sabitler:
 * *"iptal ve teslim, hangi kapıdan geçilirse geçilsin, malı doğru yere koyar."*
 *
 * Neden gerekti: iki kapı vardı ve ikisi zıt davranıyordu. `cancel_order` rezervasyonu siliyor,
 * parayı iade ediyor, sebebi yazıyordu; düz durum yazımı (`transition_order_status`) yalnız
 * `status` + log yazıyordu. Operasyon sipariş detayının "İzinli geçişler" şeridi ise geçişleri
 * SÜZMEDEN düğmeye çeviriyordu — yani ekranda kırmızı bir "İptal" düğmesi vardı ve yanlış kapıya
 * gidiyordu. Kapıda/vadeli siparişte rezervasyonun TTL'i olmadığı için (`place-order`, `expiring:
 * false`) süpürücü de o satıra bakmıyordu: mal kalıcı olarak ayrılmış kalıyordu, üstelik `cancelled`
 * terminal olduğu için doğru kapı da kapanıyordu.
 *
 * **Neden HİÇBİR test görmedi** — ve bu testlerin biçimi tam olarak o dersten çıktı:
 *   · Doğru kapının testi vardı (aşağıdaki "ayrılmış geri bırakılır"), kesin ve yeşildi.
 *   · Yanlış kapının testi de vardı (`transition.test.ts`) ve KODU DOĞRU ANLATIYORDU: durum, log,
 *     referans, eşzamanlılık. Stoğa bakmıyordu — çünkü kod da bakmıyordu.
 *   · Bir e2e testi tam o şeride basıyordu ama `confirmed → preparing`i seçmişti: şeritteki TEK
 *     yan etkisiz geçiş.
 * Yani her test kendi işini eksiksiz yapıyordu. Eksik olan, **kapıların aynı odaya açtığını**
 * soran testti — koddan değil KURALDAN yazılan test. Buradakiler odur.
 */
describe('kapı denkliği: yan etkili geçiş düz durum yazımından ÜRETİLEMEZ', () => {
  it('iptal — üretilebilseydi ayrılmış mal ortada kalırdı', async () => {
    const { orderId } = await prepare(3);
    expect(await reservations.listActiveByOrder(orderId)).toHaveLength(1);

    // Operatörün "İzinli geçişler" şeridinden bastığı yol.
    const outcome = await transitionOrder(db, { orderId, to: 'cancelled' });

    expect(outcome).toMatchObject({ status: 'forbidden', reason: 'needs_dedicated_gate' });
    // Sipariş OYNAMADI: yarım bir iptal, hiç iptal olmamasından beterdir — mal da para da asılı kalır.
    expect((await orders.getById(orderId))?.status).toBe('ready');
    expect(await reservations.listActiveByOrder(orderId)).toHaveLength(1);
  });

  it('teslim — üretilebilseydi mal gitmiş ama fiili stok düşmemiş olurdu', async () => {
    const { orderId } = await prepare(3);
    await advanceOrder(db, orderId, ['out_for_delivery']);

    const outcome = await transitionOrder(db, { orderId, to: 'delivered' });

    expect(outcome).toMatchObject({ status: 'forbidden', reason: 'needs_dedicated_gate' });
    expect((await orders.getById(orderId))?.status).toBe('out_for_delivery');
    expect((await stocks.getById(batchId))?.physicalQty).toBe(10); // mal hâlâ depoda sayılı
  });

  it('yan etkisiz geçişler düz kapıdan GEÇER — kural kapıyı daraltır, kapatmaz', async () => {
    const { orderId } = await prepare(3);

    expect(await transitionOrder(db, { orderId, to: 'out_for_delivery' })).toMatchObject({ status: 'ok' });
    // "Ulaşılamadı": mal ayrılmış kalır, stok hiç oynamaz — bu yüzden düz kapı doğru kapıdır.
    expect(await transitionOrder(db, { orderId, to: 'ready' })).toMatchObject({ status: 'ok' });
    expect(await reservations.listActiveByOrder(orderId)).toHaveLength(1);
  });
});

describe('iptal (07.9)', () => {
  it('ödenmiş sipariş iptalinde TAMAMI iade edilir, ayrılmış geri bırakılır', async () => {
    const { orderId } = await prepare(3);
    await recordOrderPayment(db, { orderId, accountId: cashAccount, amountCents: 3000 });

    const outcome = await cancelOrder(db, orderId);

    expect(outcome).toMatchObject({ status: 'ok', refundedAmountCents: 3000, paymentStatus: 'refunded', releasedQty: 3 });
    expect((await orders.getById(orderId))?.status).toBe('cancelled');
    expect(await reservations.listActiveByOrder(orderId)).toHaveLength(0);
    expect((await stocks.getById(batchId))?.physicalQty).toBe(10); // mal hiç çıkmadı
  });

  it('ödenmemiş sipariş iptalinde hareket yazılmaz, durum `pending` kalır', async () => {
    const { orderId } = await prepare(2);

    const outcome = await cancelOrder(db, orderId);

    expect(outcome).toMatchObject({ status: 'ok', refundedAmountCents: 0, paymentStatus: 'pending' });
    expect((await orders.getById(orderId))?.amountRefundedCents).toBe(0);
  });

  it('hazırlanmış mal iptalde "müşteride" sayılmaz — kalem–parti kaydı silinir', async () => {
    const { orderId } = await prepare(3);
    await cancelOrder(db, orderId);

    expect(await itemBatches.listByOrder(orderId)).toHaveLength(0);
    expect((await stocks.getById(batchId))?.physicalQty).toBe(10);
  });

  it('yoldaki sipariş iptal edilemez — kapıdan dönen mal `returned` yolundan gider', async () => {
    const { orderId } = await sendOut(2);

    expect(await cancelOrder(db, orderId)).toMatchObject({ status: 'forbidden', reason: 'not_allowed' });
    expect((await orders.getById(orderId))?.status).toBe('out_for_delivery');
  });

  it('teslim edilmiş sipariş iptal edilemez — iade yoluna girer', async () => {
    const { orderId } = await sendOut(1);
    await deliverOrder(db, orderId);

    expect(await cancelOrder(db, orderId)).toMatchObject({ status: 'forbidden', reason: 'not_allowed' });
    expect((await orders.getById(orderId))?.status).toBe('delivered');
  });
});
