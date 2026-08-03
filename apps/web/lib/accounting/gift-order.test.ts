import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, OrderService, ProductService, StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import { quickSale } from '../order/quick-sale';
import { buildExport } from './export';

/**
 * **Patron ikramı — DOMAIN §9.** Patron bir arkadaşına siparişi hediye eder; müşteri ödemez ama
 * **parayı patron kendisi öder**. Yani gerçek bir satıştır: mal depodan çıkar, maliyeti kâra biner,
 * para kasaya girer.
 *
 * `isGiftOrder` YALNIZCA muhasebe export'unu etkiler. Bu dosya o kuralı **kilitler**: birileri bir
 * gün "hediye siparişi stoktan/cirodan/kârdan düşelim" derse test kırmızıya döner. Kural yorumda
 * yazılı olmakla korunmaz, ancak ölçülürse korunur.
 */
const db = serviceDb();
const orders = new OrderService(db);
const stocks = new StockService(db);
const accounts = new AccountService(db);

const stamp = Date.now();
let customerId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let cashAccount: string;
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const QTY = 3;
const UNIT_PRICE = 12;
const PURCHASE_PRICE = 4; // euro — sipariş tarafı hâlâ euro (02.9 dilim 4)
const PURCHASE_PRICE_CENTS = PURCHASE_PRICE * 100;
const TOTAL = QTY * UNIT_PRICE; // 36 €

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `İkram testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Künefe ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  customerId = (await new UserProfileService(db).insert({ name: `İkram edilen ${stamp}` })).id;
  createdProfiles.push(customerId);
  cashAccount = (await accounts.insert({ name: `İkram kasası ${stamp}`, type: 'cash' })).id;
});

afterAll(async () => {
  await db.from('money_movement').delete().eq('account_id', cashAccount);
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('stock').delete().eq('variant_id', variantId);
  await db.from('account').delete().eq('id', cashAccount);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: createdProfiles });
  await db.from('warehouse').delete().eq('id', warehouseId);
});

describe('patron ikramı iç hesapların TAMAMINDA sayılır', () => {
  it('mal stoktan düşer, maliyet kâra biner, para kasaya girer — yalnız export dışıdır', async () => {
    const batch = await stocks.insert({ warehouseId, variantId, physicalQty: 10, expiryDate: dayOffset(200), purchasePriceCents: PURCHASE_PRICE_CENTS });
    const cashBefore = (await accounts.balance(cashAccount)).balance;
    // Export'un ikram öncesi hâli: karşılaştırma FARK üzerinden yapılır (rapor şirket genelini okur).
    const exportBefore = await buildExport({ from: dayOffset(0), to: dayOffset(0) });

    const { order } = await orders.create(
      { warehouseId, customerId, channel: 'b2c', orderSource: 'door', isGiftOrder: true, total: TOTAL },
      [{ variantId, qty: QTY, unitPrice: UNIT_PRICE, vatRate: 5.5 }],
    );

    const result = await quickSale({ orderId: order.id, paymentMethod: 'cash', paymentAccountId: cashAccount });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    // 1) STOK: mal gerçekten gitti — ikram, malı depoda bırakmaz.
    expect((await stocks.getById(batch.id))?.physicalQty).toBe(10 - QTY);
    expect(result.consumedQty).toBe(QTY);

    // 2) KÂR: maliyet kapanışta sabitlendi — ikramın maliyeti kârda görünür.
    expect(result.cogsAmount).toBe(QTY * PURCHASE_PRICE);
    expect((await orders.getById(order.id))?.cogsAmount).toBe(QTY * PURCHASE_PRICE);

    // 3) KASA: parayı patron ödedi, hesabın bakiyesine girdi.
    expect(result.paymentRecorded).toBe(true);
    expect((await accounts.balance(cashAccount)).balance).toBe(cashBefore + TOTAL);
    expect(await orders.getById(order.id)).toMatchObject({ amountCollected: TOTAL, paymentStatus: 'paid' });

    // 4) EXPORT: TEK fark burada — satır dosyaya girmez, ama tutarı özet'te açıkça durur.
    const exportAfter = await buildExport({ from: dayOffset(0), to: dayOffset(0) });
    expect(exportAfter.rows.map((r) => r.orderId)).not.toContain(order.id);
    expect(exportAfter.rows).toHaveLength(exportBefore.rows.length);
    expect(exportAfter.summary.excludedGiftCount - exportBefore.summary.excludedGiftCount).toBe(1);
    expect(exportAfter.summary.excludedGiftGross - exportBefore.summary.excludedGiftGross).toBe(TOTAL);
  });
});
