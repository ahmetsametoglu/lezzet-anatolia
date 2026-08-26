import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CategoryService,
  OrderService,
  OrderStatusLogService,
  ProductService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import { transitionOrder } from './transition';
import { deliverOrder } from './fulfillment';
import { cancelOrder } from './refund';

/**
 * Durum ilerletme (07.6) — motor kararının DB'ye doğru bağlandığı doğrulanır.
 * "Hangi geçiş izinli" motorun birim testinde (`domain-core/order/status-machine`); burada
 * **yazımın koşullu ve izli** olduğu test edilir.
 */
const db = serviceDb();
const orders = new OrderService(db);
const logs = new OrderStatusLogService(db);
const profiles = new UserProfileService(db);

const stamp = Date.now();
let customerId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let variantId: string;
let productId: string;
let categoryId: string;
const createdProfiles: string[] = [];

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Sipariş testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Kadayıf ${stamp}` },
    categoryId: category.id,
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  const profile = await profiles.insert({ name: `Sipariş müşterisi ${stamp}` });
  customerId = profile.id;
  createdProfiles.push(profile.id);
});

afterAll(async () => {
  await db.from('order').delete().eq('customer_id', customerId); // kalemler + log CASCADE
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    warehouseIds: [warehouseId],
  });
});

/** Taslak sipariş + tek kalem. */
async function createOrder() {
  const { order } = await orders.create(
    { warehouseId, customerId, channel: 'b2c' },
    [{ variantId, qty: 2, unitPriceCents: 1250, vatRate: 5.5 }],
  );
  return order;
}

describe('izinli geçişler ve iz (07.6)', () => {
  it('draft → confirmed ilerletir, referans üretir ve log yazar', async () => {
    const order = await createOrder();
    expect(order.referenceNo).toBeNull(); // taslakta numara yok

    const outcome = await transitionOrder({ orderId: order.id, to: 'confirmed' });
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.referenceNo).toMatch(/^LA-\d{2}-[A-Z0-9]{6}$/);

    const current = await orders.getById(order.id);
    expect(current).toMatchObject({ status: 'confirmed', referenceNo: outcome.referenceNo });

    const iz = await logs.listByOrder(order.id);
    expect(iz).toHaveLength(1);
    expect(iz[0]).toMatchObject({ fromStatus: 'draft', toStatus: 'confirmed' });
  });

  it('referans BİR KEZ üretilir — sonraki geçişler numarayı değiştirmez', async () => {
    const order = await createOrder();
    const ilk = await transitionOrder({ orderId: order.id, to: 'confirmed' });
    if (ilk.status !== 'ok') return;

    await transitionOrder({ orderId: order.id, to: 'preparing' });
    expect((await orders.getById(order.id))?.referenceNo).toBe(ilk.referenceNo);
  });

  it('teslim anı log tablosundan TÜRETİLİR — siparişte ayrı kolon yok', async () => {
    const order = await createOrder();
    for (const status of ['confirmed', 'preparing', 'ready', 'out_for_delivery'] as const) {
      const outcome = await transitionOrder({ orderId: order.id, to: status });
      expect(outcome.status).toBe('ok');
    }
    // Teslim BU KAPIDAN geçmez (denetim 26.08): fiili stok düşümü geçişle aynı transaction'da
    // olmalı, o iş `deliver_order`ın içinde. Test'in iddiası teslim ANININ nereden okunduğu — kapı
    // hangisi olursa olsun log satırı yazılmalı, ve doğru kapının yazdığını doğrulamak buradaki
    // asıl soruyu daha iyi yanıtlıyor.
    expect(await deliverOrder(order.id)).toMatchObject({ ok: true });

    expect(await logs.firstEntryAt(order.id, 'delivered')).not.toBeNull();
    expect(await logs.firstEntryAt(order.id, 'completed')).toBeNull();
  });

  it('geçişi yapan personel ize yazılır; sistem olayında null kalır', async () => {
    const order = await createOrder();
    await transitionOrder({ orderId: order.id, to: 'confirmed', actorId: customerId });

    expect((await logs.listByOrder(order.id))[0]?.actorId).toBe(customerId);
  });
});

describe('reddedilen geçişler', () => {
  it('kurallara aykırı geçiş yazılmaz — sebebiyle reddedilir', async () => {
    const order = await createOrder();

    const outcome = await transitionOrder({ orderId: order.id, to: 'delivered' });
    expect(outcome).toEqual({ status: 'forbidden', reason: 'not_allowed' });
    expect((await orders.getById(order.id))?.status).toBe('draft');
    expect(await logs.listByOrder(order.id)).toHaveLength(0); // iz de yazılmaz
  });

  it('aynı duruma geçiş reddedilir (tekrarlanan tıklama iz üretmez)', async () => {
    const order = await createOrder();
    expect(await transitionOrder({ orderId: order.id, to: 'draft' })).toMatchObject({ reason: 'same_status' });
  });

  it('kapanmış siparişten ilerletilemez', async () => {
    const order = await createOrder();
    // İptal de bu kapıdan geçmez (yukarıdaki aynı gerekçe) — ayrılmış mal ve para `cancel_order`ın
    // içinde işleniyor. Kapanmışlık iddiası kapıdan bağımsızdır: sipariş nasıl kapandıysa kapandı.
    expect(await cancelOrder(order.id)).toMatchObject({ status: 'ok' });

    expect(await transitionOrder({ orderId: order.id, to: 'confirmed' })).toMatchObject({ reason: 'terminal' });
  });

  it('yan etkili geçiş bu kapıdan REDDEDİLİR — doğru kapının adıyla (denetim 26.08)', async () => {
    const order = await createOrder();
    await transitionOrder({ orderId: order.id, to: 'confirmed' });

    // Düz yazım yalnız `status` + log yazar. Geçmesine izin verilseydi sipariş iptal görünür,
    // ayrılmış malı ise serbest kalmazdı — ve `cancelled` terminal olduğu için doğru kapı da
    // kapanırdı. Sebep `gate` ile söylenir: ekran operatöre hangi düğmeyi göstereceğini bilsin.
    expect(await transitionOrder({ orderId: order.id, to: 'cancelled' })).toMatchObject({
      status: 'forbidden',
      reason: 'needs_dedicated_gate',
      gate: 'cancel_order',
    });
    expect((await orders.getById(order.id))?.status).toBe('confirmed');
  });

  it('olmayan sipariş', async () => {
    expect(await transitionOrder({ orderId: crypto.randomUUID(), to: 'confirmed' })).toEqual({ status: 'not_found' });
  });
});

describe('eşzamanlılık', () => {
  it('araya biri girdiyse ÜZERİNE YAZMAZ — güncel durumu bildirir', async () => {
    const order = await createOrder();
    await transitionOrder({ orderId: order.id, to: 'confirmed' });

    // Elimizdeki "draft" bilgisi bayat: başkası çoktan confirmed yapmış.
    const staleOrder = await orders.transition({ orderId: order.id, from: 'draft', to: 'cancelled' });
    expect(staleOrder).toMatchObject({ ok: false, reason: 'stale', currentStatus: 'confirmed' });
    expect((await orders.getById(order.id))?.status).toBe('confirmed');
  });

  it('aynı anda iki ilerletme: yalnız biri yazar', async () => {
    const order = await createOrder();

    const [a, b] = await Promise.all([
      orders.transition({ orderId: order.id, from: 'draft', to: 'confirmed' }),
      orders.transition({ orderId: order.id, from: 'draft', to: 'cancelled' }),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await logs.listByOrder(order.id)).toHaveLength(1); // iz de tek
  });
});

describe('sipariş yazımı', () => {
  it('kalemsiz sipariş açılamaz', async () => {
    await expect(orders.create({ warehouseId, customerId, channel: 'b2c' }, [])).rejects.toThrow();
  });

  it('kalem yazımı düşerse sipariş de geri alınır (kalemsiz sipariş kalmaz)', async () => {
    const oncekiler = await orders.listByCustomer(customerId, { limit: 100 });

    await expect(
      // Olmayan varyant → kalem FK'ye takılır.
      orders.create({ warehouseId, customerId, channel: 'b2c' }, [
        { variantId: crypto.randomUUID(), qty: 1, unitPriceCents: 1000, vatRate: 5.5 },
      ]),
    ).rejects.toThrow();

    const sonrakiler = await orders.listByCustomer(customerId, { limit: 100 });
    expect(sonrakiler.rows).toHaveLength(oncekiler.rows.length); // yeni satır kalmadı
  });
});
