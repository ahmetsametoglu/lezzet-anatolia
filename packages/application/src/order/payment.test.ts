import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, MoneyMovementService, OrderService, ProductService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse, mustDelete } from '@lezzet/database/testing';
import { recordOrderPayment } from './payment';

/**
 * **K4 — kapı tahsilatının tekillik anahtarı** (21.10; doc 04 "kapı imzasına baştan
 * `idempotencyKey`").
 *
 * Sınanan şey tek cümle: **aynı anahtarla gelen ikinci istek İKİNCİ hareketi yazmaz** — ama
 * anahtarsız iki tahsilat meşrudur ve yazılır (müşteri 20 € nakit verip 20 € daha verebilir).
 * İkisini birbirinden ayıran şey anahtarın kendisi, tutarın eşitliği değil.
 *
 * Sayımlar KENDİ kurduğu siparişin hareketleri üzerinden yapılıyor (§4b): küresel `money_movement`
 * sayısına bakan bir test, başka bir ajanın verisi yüzünden rastgele kırmızıya döner.
 */
const db = serviceDb();
const orders = new OrderService(db);
const movements = new MoneyMovementService(db);

const stamp = Date.now();
let warehouseId: string;
let customerId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let accountId: string;
const createdProfiles: string[] = [];
let orderId: string;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Tahsilat testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Baklava ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  const profile = await new UserProfileService(db).insert({ name: `Tahsilat müşterisi ${stamp}` });
  customerId = profile.id;
  createdProfiles.push(profile.id);
  accountId = (await new AccountService(db).insert({ name: `Tahsilat kasası ${stamp}`, type: 'cash' })).id;
});

beforeEach(async () => {
  await db.from('money_movement').delete().eq('account_id', accountId);
  await db.from('order').delete().eq('customer_id', customerId);
  const { order } = await orders.create(
    { warehouseId, customerId, channel: 'b2c', deliveryType: 'route', paymentMethod: 'cash', totalCents: 4000 },
    [{ variantId, qty: 4, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  orderId = order.id;
});

afterAll(async () => {
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    accountIds: [accountId],
    warehouseIds: [warehouseId],
  });
});

/** Yalnız BU siparişin tahsilat hareketleri — küresel sayaç kullanılmaz (§4b). */
async function paymentsOfOrder(): Promise<number> {
  return (await movements.listByOrder(orderId)).filter((movement) => movement.type === 'order_payment').length;
}

describe('kapı tahsilatı tekillik anahtarı (K4)', () => {
  it('aynı anahtarla ikinci istek İKİNCİ hareketi yazmaz ve ilk cevabı döndürür', async () => {
    const key = `door-${stamp}-tekrar`;

    const first = await recordOrderPayment(db, { orderId, accountId, amountCents: 2000, idempotencyKey: key });
    const second = await recordOrderPayment(db, { orderId, accountId, amountCents: 2000, idempotencyKey: key });

    expect(first).toMatchObject({ status: 'ok', amountCollectedCents: 2000 });
    expect(first).not.toHaveProperty('deduped');
    // Tekrar eden istek İLK isteğin cevabını görür — idempotent olmanın tanımı bu.
    expect(second).toMatchObject({ status: 'ok', amountCollectedCents: 2000, deduped: true });
    expect(await paymentsOfOrder()).toBe(1);
  });

  it('FARKLI anahtar farklı tahsilattır — ikisi de yazılır', async () => {
    await recordOrderPayment(db, { orderId, accountId, amountCents: 2000, idempotencyKey: `door-${stamp}-a` });
    await recordOrderPayment(db, { orderId, accountId, amountCents: 2000, idempotencyKey: `door-${stamp}-b` });

    expect(await paymentsOfOrder()).toBe(2);
    expect((await orders.getById(orderId))?.amountCollectedCents).toBe(4000);
  });

  it('anahtarsız iki tahsilat meşrudur ve engellenmez — davranış birebir korunur', async () => {
    // Eşit tutarlı iki elle giriş gerçek bir senaryodur (`money_movement_import_key` künyesi aynı
    // gerekçeyi anlatıyor); tekilliği tutar değil ANAHTAR kurar.
    await recordOrderPayment(db, { orderId, accountId, amountCents: 1000 });
    await recordOrderPayment(db, { orderId, accountId, amountCents: 1000 });

    expect(await paymentsOfOrder()).toBe(2);
  });

  it('anahtar harekete KALICI yazılır — tekrar bir saat sonra gelse de yakalanır', async () => {
    const key = `door-${stamp}-kalici`;
    await recordOrderPayment(db, { orderId, accountId, amountCents: 1500, idempotencyKey: key });

    const written = (await movements.listByOrder(orderId)).filter((m) => m.type === 'order_payment');
    expect(written[0]?.meta?.['idempotencyKey']).toBe(key);
  });
});
