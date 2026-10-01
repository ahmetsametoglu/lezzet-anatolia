import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, OrderService, ProductService, StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse, purgeVariantStock, mustDelete } from '@lezzet/database/testing';
import { quickSale } from '@lezzet/application';
import { buildExport } from './export';

/**
 * Hediye sipariş (DOMAIN §9) ödemesiz kapanır: kalemler sıfır fiyatlıdır, para kasaya girmez; mal stoktan düşer ve maliyeti kârda
 * gider olarak kalır. Bu dosya kuralı kilitler: hediyeye para yazılır ya da maliyeti düşerse kırmızıya döner.
 */
const db = serviceDb();
const orders = new OrderService(db);
const stocks = new StockService(db);
const accounts = new AccountService(db);

const stamp = Date.now();
let customerId: string;
let personelId: string;
// Parti ve sipariş deposuz yazılamaz (DOMAIN §17); testin kendi deposu.
let warehouseId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let cashAccount: string;
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const QTY = 3;
const LIST_PRICE_CENTS = 1200; // hediyenin değeri, pazarlık izinde durur
const PURCHASE_PRICE_CENTS = 400;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `İkram testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Künefe ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  const profiles = new UserProfileService(db);
  customerId = (await profiles.insert({ name: `İkram edilen ${stamp}` })).id;
  personelId = (await profiles.insert({ name: `İkram eden ${stamp}` })).id;
  createdProfiles.push(customerId, personelId);
  cashAccount = (await accounts.insert({ name: `İkram kasası ${stamp}`, type: 'cash' })).id;
});

afterAll(async () => {
  // Satış deftere `counter_sale` yazar ve o satır partiyi ve siparişi birden tutar; sıra bu yüzden defter → parti → sipariş.
  await purgeVariantStock(db, [variantId]);
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    accountIds: [cashAccount],
    warehouseIds: [warehouseId],
  });
});

describe('hediye sipariş ödemesiz kapanır', () => {
  it('mal stoktan düşer ve maliyeti siparişte kalır; kasaya para girmez, ciro sıfırdır, aktarıma girmez', async () => {
    const batch = await stocks.insert({ warehouseId, variantId, physicalQty: 10, expiryDate: dayOffset(200), purchasePriceCents: PURCHASE_PRICE_CENTS });
    const cashBefore = (await accounts.balance(cashAccount)).balanceCents;
    const exportBefore = await buildExport({ from: dayOffset(0), to: dayOffset(0) });

    // Sipariş açılışının hediyeye verdiği hâl: sıfır fiyat, liste fiyatı ve personel izde.
    const { order } = await orders.create(
      { warehouseId, customerId, channel: 'b2c', orderSource: 'door', isGiftOrder: true, orderedTotalCents: 0 },
      [{ variantId, qty: QTY, unitPriceCents: 0, listUnitPriceCents: LIST_PRICE_CENTS, priceSetBy: personelId, vatRate: 5.5 }],
    );

    // Kasa hesabı verilse de tahsil edilecek tutar sıfırdır, hareket yazılmaz.
    const result = await quickSale(db, { orderId: order.id, paymentMethod: 'cash', paymentAccountId: cashAccount });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect((await stocks.getById(batch.id))?.physicalQty).toBe(10 - QTY);
    expect(result.cogsAmountCents).toBe(QTY * PURCHASE_PRICE_CENTS);

    expect((await accounts.balance(cashAccount)).balanceCents).toBe(cashBefore);
    expect(await orders.getById(order.id)).toMatchObject({ status: 'completed', amountCollectedCents: 0, revenueTotalCents: 0 });

    // Küresel sayıya bakılmaz (CLAUDE §4b): yalnız bu siparişin dışarıda kaldığı ve sayaca bir eklendiği ölçülür.
    const exportAfter = await buildExport({ from: dayOffset(0), to: dayOffset(0) });
    expect(exportAfter.rows.map((r) => r.orderId)).not.toContain(order.id);
    expect(exportAfter.summary.excludedGiftCount - exportBefore.summary.excludedGiftCount).toBe(1);
  });
});
