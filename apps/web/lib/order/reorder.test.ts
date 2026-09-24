import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CategoryService, OrderService, PriceService, ProductService, StockService, UserProfileService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData, purgeVariantStock } from '@lezzet/database/testing';

/* Tekrar sipariş de bir ekleme kanalıdır: yer biliniyorken bu adrese gelemeyen kalemi sepete koyarsa kural bu kanaldan delinir. */

// Yer çerezden okunur; test bölge dışındaki bir DE adresinin kapsamını verir, kargo deposu testin kendi deposudur.
const scope = vi.hoisted(() => ({
  country: 'DE' as string | null,
  zoneId: null as string | null,
  warehouseId: null as string | null,
  shippingWarehouseId: null as string | null,
  pickup: false,
}));
vi.mock('@/lib/delivery/read-place', () => ({ readPlaceScope: async () => scope }));

import { planReorder } from './reorder';

const db = serviceDb();
const stamp = Date.now();
let routeId = '';
let shippingId = '';
let categoryId = '';
let kargoProductId = '';
let kargoVariantId = '';
let sogukProductId = '';
let sogukVariantId = '';
let customerId = '';
let orderId = '';

beforeAll(async () => {
  routeId = (await createTestWarehouse(db, { label: 'TSR', countryCode: 'DE' })).id;
  shippingId = (await createTestWarehouse(db, { label: 'TSK', countryCode: 'DE', shipsOnline: true })).id;
  scope.shippingWarehouseId = shippingId;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Tekrar sipariş ${stamp}` } })).id;
  const products = new ProductService(db);
  const kargo = await products.create({
    name: { tr: `Tekrar kargo ${stamp}` },
    categoryId,
    shippable: true,
    variants: [{ label: { tr: '1 kg' } }],
  });
  const soguk = await products.create({
    name: { tr: `Tekrar soğuk ${stamp}` },
    categoryId,
    shippable: false,
    variants: [{ label: { tr: '1 kg' } }],
  });
  kargoProductId = kargo.product.id;
  kargoVariantId = kargo.variants[0]!.id;
  sogukProductId = soguk.product.id;
  sogukVariantId = soguk.variants[0]!.id;
  const prices = new PriceService(db);
  await prices.setPrice({ variantId: kargoVariantId, channel: 'b2c', amountCents: 2500 });
  await prices.setPrice({ variantId: sogukVariantId, channel: 'b2c', amountCents: 2500 });
  const stock = new StockService(db);
  await stock.insert({
    warehouseId: shippingId,
    variantId: kargoVariantId,
    physicalQty: 10,
    expiryDate: '2027-06-01',
    purchasePriceCents: 800,
  });
  await stock.insert({
    warehouseId: routeId,
    variantId: sogukVariantId,
    physicalQty: 10,
    expiryDate: '2027-06-01',
    purchasePriceCents: 800,
  });
  customerId = (await new UserProfileService(db).insert({ name: `Tekrar sipariş ${stamp}` })).id;
  const lines = [
    { variantId: kargoVariantId, qty: 1, unitPriceCents: 2500, vatRate: 5.5 },
    { variantId: sogukVariantId, qty: 1, unitPriceCents: 2500, vatRate: 5.5 },
  ];
  const order = await new OrderService(db).create(
    {
      warehouseId: shippingId,
      customerId,
      channel: 'b2c',
      orderSource: 'web',
      deliveryType: 'shipping',
      status: 'confirmed',
      orderedTotalCents: 5000,
    },
    lines,
  );
  orderId = order.order.id;
});

afterAll(async () => {
  await mustDelete(db, 'order', (q) => q.eq('id', orderId));
  await purgeVariantStock(db, [kargoVariantId, sogukVariantId]);
  await purgeTestData(db, {
    productIds: [kargoProductId, sogukProductId],
    categoryIds: [categoryId],
    profileIds: [customerId],
    warehouseIds: [routeId, shippingId],
  });
});

describe('tekrar sipariş', () => {
  it('bu adrese gelemeyen kalemi sepete koymaz, eklenemeyenlere yazar', async () => {
    const plan = await planReorder('tr', customerId, orderId);
    expect(plan?.entries).toEqual([{ kind: 'variant', variantId: kargoVariantId, qty: 1, stockId: null }]);
    expect(plan?.skipped).toHaveLength(1);
    expect(plan?.skipped[0]).toContain(`Tekrar soğuk ${stamp}`);
  });
});
