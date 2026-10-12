import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccountService,
  CategoryService,
  MoneyMovementService,
  OrderService,
  ProductService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData } from '@lezzet/database/testing';
import type { MoneyMovement } from '@lezzet/types';
import { linkDoorCardPaymentByHand, reconcileDoorCardPayments, reviewDoorCardItems } from './door-card';
import { recordOrderPayment } from './payment';
import type { RevolutClient } from './revolut';

/**
 * Kapıda kartın Revolut eşleştirmesi: tek adaylı yüz yüze ödeme tahsilata bağlanır ve komisyonu siparişe yazılır; bizim çevrim içi
 * siparişimiz yüz yüze sayılmaz; eşleşmeyen iki yön bekleme süresinden sonra birer kez bildirilir, tur tekrarlanınca hiçbir şey ikilenmez.
 * Pencere dışında kalan ödeme elle bağlanır, ama yalnız tutarı tutan tahsilata.
 */
const db = serviceDb();
const orders = new OrderService(db);
const movements = new MoneyMovementService(db);
const stamp = Date.now();
const refs = { matched: `rv_kapi_${stamp}`, stray: `rv_yabanci_${stamp}`, online: `rv_online_${stamp}`, late: `rv_gec_${stamp}` };

let warehouseId: string;
let productId: string;
let variantId: string;
let categoryId: string;
let customerId: string;
let adminId: string;
let cardAccount: string;
let matchedOrderId: string;
let missingOrderId: string;
let missingMovement: MoneyMovement;

/** Sipariş listesini ve ödemenin ayrıntısını dönen sahte Revolut; yalnız eşleşen ödemenin ayrıntısı komisyon taşır. */
function revolutWith(listed: Array<{ id: string; amount: number; created_at: string; metadata?: Record<string, string> }>): RevolutClient {
  const asOrder = (order: (typeof listed)[number]) => ({ ...order, type: 'payment', state: 'completed', currency: 'EUR' });
  return {
    mode: 'sandbox',
    async request(method, path) {
      if (method === 'GET' && path.startsWith('/api/orders?')) return { orders: listed.map(asOrder) };
      const detail = listed.find((order) => method === 'GET' && path === `/api/orders/${order.id}`);
      if (!detail) throw new Error(`beklenmeyen istek: ${method} ${path}`);
      const fees = detail.id === refs.matched ? [{ type: 'acquiring', amount: 58, currency: 'EUR' }] : [];
      return {
        ...asOrder(detail),
        payments: [{ id: `pay_${detail.id}`, state: 'captured', amount: detail.amount, currency: 'EUR', fees }],
      };
    },
  };
}

async function cardCollection(amountCents: number): Promise<{ orderId: string; movement: MoneyMovement }> {
  const { order } = await orders.create({ warehouseId, customerId, channel: 'b2c', orderSource: 'web', orderedTotalCents: amountCents }, [
    { variantId, qty: 1, unitPriceCents: amountCents, vatRate: 5.5 },
  ]);
  await recordOrderPayment(db, { orderId: order.id, accountId: cardAccount, amountCents, method: 'card', description: 'Kapıda tahsilat' });
  const [movement] = await movements.listByOrder(order.id);
  return { orderId: order.id, movement: movement! };
}

const minutesAfter = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Kapı kartı ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Sucuk ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  customerId = (await new UserProfileService(db).insert({ name: `Kapı kartı müşterisi ${stamp}` })).id;
  adminId = (await new UserProfileService(db).insert({ name: `Kapı kartı zili ${stamp}`, roles: ['admin'] })).id;
  cardAccount = (await new AccountService(db).insert({ name: `Kapı kartı havuzu ${stamp}`, type: 'provider' })).id;

  const matched = await cardCollection(6000);
  matchedOrderId = matched.orderId;
  const missing = await cardCollection(2500);
  missingOrderId = missing.orderId;
  missingMovement = missing.movement;
});

afterAll(async () => {
  // Zil bütün yöneticilere düşer; test yalnız kendi ödemelerinin ve siparişinin satırını siler.
  await mustDelete(db, 'notification', (q) => q.eq('kind', 'door_card_unmatched').eq('payload->>paymentRef', refs.stray));
  await mustDelete(db, 'notification', (q) => q.eq('kind', 'door_card_missing').eq('target_id', missingOrderId));
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: [customerId, adminId],
    accountIds: [cardAccount],
    warehouseIds: [warehouseId],
  });
});

describe('kapıda kartın Revolut eşleştirmesi', () => {
  let client: RevolutClient;
  let now: Date;

  it('tek adaylı ödeme bağlanır ve komisyonu yazılır; eşleşmeyen iki yön birer kez bildirilir, tekrar eden tur bir şey ikilemez', async () => {
    const [matchedMovement] = await movements.listByOrder(matchedOrderId);
    client = revolutWith([
      { id: refs.matched, amount: 6000, created_at: minutesAfter(matchedMovement!.createdAt, -2) },
      { id: refs.stray, amount: 4000, created_at: minutesAfter(matchedMovement!.createdAt, -5) },
      // Bizim açtığımız çevrim içi sipariş künyesinden tanınır; tutarı tutsa da yüz yüze ödeme sayılmaz.
      { id: refs.online, amount: 2500, created_at: missingMovement.createdAt, metadata: { order_id: missingOrderId } },
      // Tutarı eksik tahsilatı tutar ama pencerenin dışındadır; iş bağlamaz, elle bağlanır.
      { id: refs.late, amount: 2500, created_at: minutesAfter(missingMovement.createdAt, 170) },
    ]);
    // Bekleme süresi dolsun diye tur üç saat sonrasında koşar.
    now = new Date(Date.parse(matchedMovement!.createdAt) + 3 * 3_600_000);

    const first = await reconcileDoorCardPayments(db, client, { accountId: cardAccount, now });
    const second = await reconcileDoorCardPayments(db, client, { accountId: cardAccount, now });

    expect(first).toMatchObject({ matched: 1, unmatched: 1, missing: 1 });
    expect(second).toMatchObject({ matched: 0, unmatched: 1, missing: 1 });
    expect((await movements.listByOrder(matchedOrderId))[0]!.meta).toMatchObject({ providerRef: refs.matched });
    expect((await orders.getById(matchedOrderId))?.paymentFeeCents).toBe(58);

    const zil = async (kind: string) => {
      const { data, error } = await db.from('notification').select('payload, target_id').eq('profile_id', adminId).eq('kind', kind);
      expect(error).toBeNull();
      return data ?? [];
    };
    expect((await zil('door_card_unmatched')).filter((row) => row.payload?.paymentRef === refs.stray)).toHaveLength(1);
    expect((await zil('door_card_missing')).filter((row) => row.target_id === missingOrderId)).toHaveLength(1);
  });

  it('elle eşleme yalnız tutarı tutan açık tahsilatı bağlar; bağlanan ödeme ikinci kez bağlanmaz', async () => {
    const review = await reviewDoorCardItems(db, client, { accountId: cardAccount, now });
    const candidatesOf = (ref: string) => review.payments.find((payment) => payment.ref === ref)?.candidates.map((movement) => movement.id);
    expect(candidatesOf(refs.late)).toEqual([missingMovement.id]);
    expect(candidatesOf(refs.stray)).toEqual([]);

    const link = (paymentRef: string) =>
      linkDoorCardPaymentByHand(db, client, { accountId: cardAccount, movementId: missingMovement.id, paymentRef, now });
    expect(await link(refs.stray)).toEqual({ status: 'invalid', reason: 'not_candidate' });
    expect(await link(refs.late)).toEqual({ status: 'linked' });
    expect((await movements.listByOrder(missingOrderId))[0]!.meta).toMatchObject({ providerRef: refs.late });
    expect(await link(refs.late)).toEqual({ status: 'invalid', reason: 'payment_not_open' });
  });
});
