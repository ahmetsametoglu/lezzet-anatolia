import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, MoneyMovementService, OrderService, ProductService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import { recordOrderPayment } from './payment';

/**
 * Kapı tahsilatının tekillik anahtarı: aynı anahtarla gelen ikinci istek ikinci hareketi yazmaz, anahtarsız iki tahsilat ise meşrudur
 * (müşteri 20 € verip 20 € daha verebilir). Sayım kendi siparişin hareketlerinden yapılır, çünkü küresel sayı paylaşılan DB'de rastgele
 * kırmızıya döner.
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
    { warehouseId, customerId, channel: 'b2c', deliveryType: 'route', paymentMethod: 'cash', orderedTotalCents: 4000 },
    [{ variantId, qty: 4, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  orderId = order.id;
});

afterAll(async () => {
  // Sipariş ayrıca silinmez: `purgeTestData` onu `profileIds`ten bulur, elle silme teardown'ı düşürür.
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

    const first = await recordOrderPayment(db, { orderId, accountId, amountCents: 2000, method: 'cash', idempotencyKey: key });
    const second = await recordOrderPayment(db, { orderId, accountId, amountCents: 2000, method: 'cash', idempotencyKey: key });

    expect(first).toMatchObject({ status: 'ok', amountCollectedCents: 2000 });
    expect(first).not.toHaveProperty('deduped');
    // Tekrar eden istek İLK isteğin cevabını görür — idempotent olmanın tanımı bu.
    expect(second).toMatchObject({ status: 'ok', amountCollectedCents: 2000, deduped: true });
    expect(await paymentsOfOrder()).toBe(1);
  });

  it('FARKLI anahtar farklı tahsilattır — ikisi de yazılır', async () => {
    await recordOrderPayment(db, { orderId, accountId, amountCents: 2000, method: 'cash', idempotencyKey: `door-${stamp}-a` });
    await recordOrderPayment(db, { orderId, accountId, amountCents: 2000, method: 'cash', idempotencyKey: `door-${stamp}-b` });

    expect(await paymentsOfOrder()).toBe(2);
    expect((await orders.getById(orderId))?.amountCollectedCents).toBe(4000);
  });

  it('anahtarsız iki tahsilat meşrudur ve engellenmez — davranış birebir korunur', async () => {
    // Eşit tutarlı iki elle giriş gerçek bir senaryodur (`money_movement_import_key` künyesi aynı
    // gerekçeyi anlatıyor); tekilliği tutar değil ANAHTAR kurar.
    await recordOrderPayment(db, { orderId, accountId, amountCents: 1000, method: 'cash' });
    await recordOrderPayment(db, { orderId, accountId, amountCents: 1000, method: 'cash' });

    expect(await paymentsOfOrder()).toBe(2);
  });

  it('anahtar harekete KALICI yazılır — tekrar bir saat sonra gelse de yakalanır', async () => {
    /* Anahtar kendi kolonunda (`money_movement.idempotency_key`) durur ve kararı tekil indeks verir; kalıcı olmalı, yoksa saatler
       sonra gelen tekrar yakalanamaz. */
    const key = `door-${stamp}-kalici`;
    await recordOrderPayment(db, { orderId, accountId, amountCents: 1500, method: 'cash', idempotencyKey: key });

    const written = (await movements.listByOrder(orderId)).filter((m) => m.type === 'order_payment');
    expect(written[0]?.idempotencyKey).toBe(key);
    // `meta` anahtarı taşımaz, çünkü iki yerde duran bir gerçek bir gün ayrışır.
    expect(written[0]?.meta?.['idempotencyKey']).toBeUndefined();
  });

  it('TEKRAR EDEN İSTEK "yazdım" demez — cevap `deduped`, defter tek satır', async () => {
    /* İkinci çağrı hata değildir ama "tahsil edildi" de değildir; ekran bunu `deduped` ile ayırır, yoksa kurye aynı parayı iki kez
       aldığını sanır. */
    const key = `door-${stamp}-tekrar`;
    const ilk = await recordOrderPayment(db, { orderId, accountId, amountCents: 1200, method: 'cash', idempotencyKey: key });
    const ikinci = await recordOrderPayment(db, { orderId, accountId, amountCents: 1200, method: 'cash', idempotencyKey: key });

    expect(ikinci).toMatchObject({ status: 'ok', deduped: true });
    // İlk çağrıda alan HİÇ YOK — sözleşmenin kendi kuralı: "alan yoksa yazım gerçekten yapıldı".
    // `deduped: undefined` diye yazmak yetmiyor; `toMatchObject` yokluk ile `undefined`ı ayırıyor.
    expect(ilk.status).toBe('ok');
    expect(ilk).not.toHaveProperty('deduped');
    expect(await paymentsOfOrder()).toBe(1);
    // Tutar da tekrar dalında GÜNCEL: RPC orada da defteri yeniden topluyor.
    expect((await orders.getById(orderId))?.amountCollectedCents).toBe(1200);
  });
});
