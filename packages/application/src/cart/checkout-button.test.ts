import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AddressService,
  CategoryService,
  DeliveryZoneService,
  DiscountService,
  PriceService,
  ProductService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData, purgeVariantStock, testPostalCode } from '@lezzet/database/testing';
import { readCheckoutSnapshot } from '../order/checkout-snapshot';
import { cartCheckoutCents, type CartEntry } from './cart-types';
import { getCartView } from './read';

/* Bölünmüş sepette düğme kapı siparişini açar ve o sipariş indirimini checkout'ta yalnız kendi kalemleriyle alır; sepet başka bir
   indirimle hesaplarsa müşteri sepette bir tutar, ödeme sayfasında başka bir tutar görür. */

const db = serviceDb();
const stamp = Date.now();
const postalCode = testPostalCode();
const expiryDate = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);
let categoryId = '';
let localProductId = '';
let localVariantId = '';
let shippingProductId = '';
let shippingVariantId = '';
let routeId = '';
let shippingId = '';
let zoneId = '';
let customerId = '';
let addressId = '';
let discountId = '';

beforeAll(async () => {
  categoryId = (await new CategoryService(db).create({ name: { tr: `Sepet düğmesi ${stamp}` } })).id;
  const products = new ProductService(db);
  const local = await products.create({
    name: { tr: `Kapı ${stamp}` },
    categoryId,
    shippable: true,
    variants: [{ label: { tr: '1 kg' } }],
  });
  const shipping = await products.create({
    name: { tr: `Kargo ${stamp}` },
    categoryId,
    shippable: true,
    variants: [{ label: { tr: '1 kg' } }],
  });
  localProductId = local.product.id;
  localVariantId = local.variants[0]!.id;
  shippingProductId = shipping.product.id;
  shippingVariantId = shipping.variants[0]!.id;
  await new PriceService(db).insert({ variantId: localVariantId, channel: 'b2c', amountCents: 20_000 });
  await new PriceService(db).insert({ variantId: shippingVariantId, channel: 'b2c', amountCents: 4_000 });

  // Kapı kalemi rota deposunda, kargo kalemi yalnız kargo deposunda: sepet iki gruba bölünür.
  routeId = (await createTestWarehouse(db, { label: 'DUGME-ROTA', countryCode: 'DE' })).id;
  shippingId = (await createTestWarehouse(db, { label: 'DUGME-KARGO', countryCode: 'DE', shipsOnline: true })).id;
  const stock = new StockService(db);
  await stock.insert({ warehouseId: routeId, variantId: localVariantId, physicalQty: 10, expiryDate });
  await stock.insert({ warehouseId: shippingId, variantId: shippingVariantId, physicalQty: 10, expiryDate });

  const zones = new DeliveryZoneService(db);
  zoneId = (await zones.insert({ name: `Sepet düğmesi bölgesi ${stamp}`, warehouseId: routeId, weekdays: [1, 2, 3, 4, 5] })).id;
  await zones.replacePostalCodes(zoneId, [{ country: 'DE', postalCode }]);
  customerId = (await new UserProfileService(db).insert({ name: `Sepet düğmesi ${stamp}` })).id;
  addressId = (
    await new AddressService(db).addForCustomer({
      customerId,
      recipient: 'Stefan Weber',
      phone: '+4978514455',
      line1: 'Marktplatz 3',
      postalCode,
      city: 'Kehl',
      country: 'DE',
    })
  ).id;

  // Kampanya testin kategorisiyle sınırlı ki başka sepetlere inmesin; oran yüksek, yerel veritabanındaki kampanyaları yensin diye.
  discountId = (
    await new DiscountService(db).insert({
      name: `Sepet düğmesi ${stamp}`,
      publicLabel: { tr: `Sepet düğmesi ${stamp}` },
      trigger: 'automatic',
      type: 'percent',
      percent: 50,
      scope: 'category',
      categoryId,
    })
  ).id;
});

afterAll(async () => {
  await mustDelete(db, 'discount', (q) => q.eq('id', discountId));
  await purgeVariantStock(db, [localVariantId, shippingVariantId]);
  await purgeTestData(db, {
    productIds: [localProductId, shippingProductId],
    categoryIds: [categoryId],
    profileIds: [customerId],
    warehouseIds: [routeId, shippingId],
  });
});

describe('sepet düğmesi', () => {
  it('bölünmüş sepette ödeme sayfasındaki kapı siparişinin tutarını yazar', async () => {
    const entries: CartEntry[] = [
      { kind: 'variant', variantId: localVariantId, qty: 1, stockId: null },
      { kind: 'variant', variantId: shippingVariantId, qty: 1, stockId: null },
    ];
    const view = await getCartView(db, 'tr', entries, {
      customerId,
      warehouseId: routeId,
      shippingWarehouseId: shippingId,
      country: 'DE',
      zoneId,
    });
    const snapshot = await readCheckoutSnapshot(db, 'tr', { customerId, entries, addressId });

    expect(view.lines.map((line) => line.group).sort()).toEqual(['local', 'shipping']);
    expect(snapshot.payment).not.toBeNull();
    expect(cartCheckoutCents(view)).toBe(snapshot.payment?.orderTotalCents);
  });
});
