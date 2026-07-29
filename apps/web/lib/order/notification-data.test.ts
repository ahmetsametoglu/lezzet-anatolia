import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, OrderService, ProductService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { buildOrderNotification } from './notification-data';

/**
 * Bildirim verisinin kalem satırları (14.5).
 *
 * Sınanan tek kural: **"daha hazırlanmadı" ile "eksik gönderildi" aynı şey değildir.**
 *
 * `fulfilled_qty` yeni onaylanmış bir siparişte 0'dır — çünkü kimse malı almaya gitmemiştir. Mail
 * bunu ayırt etmiyordu ve her kalemi "0 gönderildi, tamamı iade edilecek" diye anlatıyordu; müşteri
 * siparişini verir vermez hepsinin iptal edildiğini sanıyordu (gerçek sipariş LA-26-99C7YN).
 */
const db = serviceDb();
const orders = new OrderService(db);

const stamp = Date.now();
const createdOrders: string[] = [];
let customerId: string;
let productId: string;
let variantId: string;
let categoryId: string;

beforeAll(async () => {
  categoryId = (await new CategoryService(db).create({ name: { tr: `Bildirim ${stamp}` } })).id;
  const created = await new ProductService(db).create({
    name: { tr: `Bildirim ürünü ${stamp}`, fr: `Produit ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '1 kg' } }],
  });
  productId = created.product.id;
  variantId = created.variants[0]!.id;
  customerId = (await new UserProfileService(db).insert({ name: 'Ayşe Kaya', email: `bildirim-${stamp}@example.test` })).id;
});

afterAll(async () => {
  for (const id of createdOrders) await db.from('order').delete().eq('id', id);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: [customerId] });
});

async function orderWith(status: 'confirmed' | 'delivered', fulfilledQty: number) {
  const { order } = await orders.create(
    { customerId, channel: 'b2c', orderSource: 'web', deliveryType: 'shipping', status, total: 20 },
    [{ variantId, qty: 2, unitPrice: 10, vatRate: 5.5 }],
  );
  createdOrders.push(order.id);
  await db.from('order_item').update({ fulfilled_qty: fulfilledQty }).eq('order_id', order.id);
  return order.id;
}

describe('kalem satırları', () => {
  it('ONAYLANMIŞ siparişte sipariş edilen adet yazar, eksiklik notu ÇIKMAZ', async () => {
    const orderId = await orderWith('confirmed', 0);

    const bundle = await buildOrderNotification(orderId, 'order_confirmed');
    expect(bundle?.data.lines).toHaveLength(1);
    expect(bundle?.data.lines[0]).toMatchObject({ qty: 2, shortfall: null });
    // Boşluk kontrolü YOK: `Intl` fransızcada dar bloke boşluk (U+202F) kullanır, kaynak dosyadaki
    // düz boşlukla eşleşmez. Sınanan şey biçim değil, TUTAR.
    expect(bundle?.data.lines[0]?.amount).toMatch(/20,00/);
  });

  it('hazırlık KESİNLEŞTİĞİNDE eksiklik görünür — asıl kural burada işler', async () => {
    const orderId = await orderWith('delivered', 1);

    const bundle = await buildOrderNotification(orderId, 'order_delivered');
    expect(bundle?.data.lines[0]?.qty).toBe(1);
    // Tasarım kuralı: sebep yazılmaz, yalnız miktar + para çözümü.
    expect(bundle?.data.lines[0]?.shortfall).toMatch(/10,00/);
  });

  it('tam karşılanan teslimde eksiklik notu yok', async () => {
    const orderId = await orderWith('delivered', 2);

    expect((await buildOrderNotification(orderId, 'order_delivered'))?.data.lines[0]).toMatchObject({
      qty: 2,
      shortfall: null,
    });
  });
});
