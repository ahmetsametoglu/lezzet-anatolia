import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, OrderService, ProductService, TrustEntryService, UserProfileService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData, settingsSnapshot } from '@lezzet/database/testing';
import { TRUST_WEIGHTS } from '@lezzet/domain-core';
import { scanTrust } from './trust';

// Tarama ağırlığı ayardan okumazsa, müşteri dışı iptali ceza sayarsa, ulaşılamadı ya da tahsil olayını atlarsa ya da aynı olayı iki
// kez yazarsa kırmızıya döner. Tarama bu testin müşterisiyle sınırlıdır, ki geçici ağırlık başkasının defterine yazılmasın.
const db = serviceDb();
const orders = new OrderService(db);
const settings = settingsSnapshot(db);
const stamp = Date.now();
const orderIds: string[] = [];
let customerId = '';
let warehouseId = '';
let categoryId = '';
let productId = '';
let variantId = '';

const gunOnce = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

async function newOrder(): Promise<string> {
  const { order } = await orders.create(
    { customerId, warehouseId, channel: 'b2c', orderSource: 'web', deliveryType: 'route', status: 'confirmed', orderedTotalCents: 1200 },
    [{ variantId, qty: 1, unitPriceCents: 1200, vatRate: 5.5 }],
  );
  orderIds.push(order.id);
  return order.id;
}

async function log(orderId: string, from: string, to: string, daysAgo: number): Promise<void> {
  const { error } = await db.from('order_status_log').insert({ order_id: orderId, from_status: from, to_status: to, created_at: gunOnce(daysAgo) });
  if (error) throw error;
}

async function setOrder(orderId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await db.from('order').update(patch).eq('id', orderId);
  if (error) throw error;
}

const kayitlar = async () => (await new TrustEntryService(db).listByCustomer(customerId, undefined, 50)).rows;

let teslim = '';
let tahsilsiz = '';
let musteriIptal = '';
let odemeIptal = '';

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'GVN' })).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Güven testi ${stamp}` } })).id;
  const created = await new ProductService(db).create({ name: { tr: `Güven ürünü ${stamp}` }, categoryId, variants: [{ label: { tr: '1 kg' } }] });
  productId = created.product.id;
  variantId = created.variants[0]!.id;
  customerId = (await new UserProfileService(db).insert({ name: 'Güven Müşterisi', email: `guven-${stamp}@example.test` })).id;

  await settings.override(TRUST_WEIGHTS.order_delivered.key, 7);
  await settings.override('trust_uncollected_grace_days', 2);

  // Teslim edilmiş ve parası kapanmış: yalnız "teslim" olayı.
  teslim = await newOrder();
  await log(teslim, 'out_for_delivery', 'delivered', 5);
  await setOrder(teslim, { status: 'completed' });

  // Teslim edilmiş ama parası kapanmamış, bekleme süresi geçmiş: "teslim" ve "tahsil edilemedi".
  tahsilsiz = await newOrder();
  await log(tahsilsiz, 'out_for_delivery', 'ready', 6);
  await log(tahsilsiz, 'out_for_delivery', 'delivered', 5);
  await setOrder(tahsilsiz, { status: 'delivered' });

  musteriIptal = await newOrder();
  await log(musteriIptal, 'confirmed', 'cancelled', 3);
  await setOrder(musteriIptal, { status: 'cancelled', cancel_reason: 'customer' });

  // Ödeme hatasıyla iptal müşterinin kusuru sayılmaz.
  odemeIptal = await newOrder();
  await log(odemeIptal, 'confirmed', 'cancelled', 3);
  await setOrder(odemeIptal, { status: 'cancelled', cancel_reason: 'payment_failed' });
}, 60_000);

afterAll(async () => {
  await settings.restore();
  await purgeTestData(db, { orderIds, productIds: [productId], categoryIds: [categoryId], profileIds: [customerId], warehouseIds: [warehouseId] });
});

describe('scanTrust', () => {
  it('olayları ayardaki ağırlıkla deftere yazar', async () => {
    await scanTrust(db, { customerIds: [customerId] });
    const rows = await kayitlar();
    const of = (reason: string, ref: string) => rows.find((r) => r.reason === reason && r.refId === ref)?.points;

    expect(of('order_delivered', teslim)).toBe(7);
    expect(of('order_delivered', tahsilsiz)).toBe(7);
    expect(of('payment_uncollected', tahsilsiz)).toBe(TRUST_WEIGHTS.payment_uncollected.fallback);
    expect(of('payment_uncollected', teslim)).toBeUndefined();
    expect(of('order_cancelled', musteriIptal)).toBe(TRUST_WEIGHTS.order_cancelled.fallback);
    expect(rows.some((r) => r.refId === odemeIptal)).toBe(false);
    expect(rows.filter((r) => r.reason === 'delivery_unreachable')).toHaveLength(1);
  });

  it('ikinci tarama aynı olayı yeniden yazmaz', async () => {
    const once = (await kayitlar()).length;
    await scanTrust(db, { customerIds: [customerId] });
    expect((await kayitlar()).length).toBe(once);
  });
});
