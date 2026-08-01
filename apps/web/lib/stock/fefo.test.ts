import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, ProductService, ReservationService, StockService, serviceDb } from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import { suggestPicksForVariant } from './fefo';

/**
 * FEFO hazırlık önerisi (06.5) — uygulama katmanı orkestrasyonunun testi: servisin getirdiği
 * satırlar motorun kararıyla birleşince doğru parti sırası çıkıyor mu.
 */
const db = serviceDb();
const stocks = new StockService(db);
const reservations = new ReservationService(db);

let variantId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let productId: string;
let categoryId: string;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `FEFO testi ${Date.now()}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Lahmacun ${Date.now()}` },
    categoryId: category.id,
    dateType: 'DLC',
    shelfLifeDays: 200,
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId] });
  await db.from('warehouse').delete().eq('id', warehouseId);
});

beforeEach(async () => {
  await db.from('reservation').delete().eq('variant_id', variantId);
  await db.from('stock').delete().eq('variant_id', variantId);
});

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe('FEFO önerisi (06.5)', () => {
  it('önce süresi dolan parti çıkar; bir kalem birden çok partiden karşılanabilir', async () => {
    const older = await stocks.insert({ warehouseId, variantId, physicalQty: 3, expiryDate: dayOffset(20), lotNumber: 'L-1' });
    const newer = await stocks.insert({ warehouseId, variantId, physicalQty: 10, expiryDate: dayOffset(150) });

    const suggestion = await suggestPicksForVariant(warehouseId, variantId, 5);
    expect(suggestion.shortfall).toBe(0);
    expect(suggestion.picks).toEqual([
      expect.objectContaining({ stockId: older.id, qty: 3, lotNumber: 'L-1' }),
      expect.objectContaining({ stockId: newer.id, qty: 2 }),
    ]);
  });

  it('teklife söz verilmiş (çıpalı) miktar o partiden düşülür — normal hazırlık onu yiyemez', async () => {
    const offerBatch = await stocks.insert({ warehouseId, variantId, physicalQty: 4, expiryDate: dayOffset(10), offerPrice: 3 });
    const plain = await stocks.insert({ warehouseId, variantId, physicalQty: 10, expiryDate: dayOffset(150) });
    await reservations.reserve({ orderId: crypto.randomUUID(), warehouseId, variantId, qty: 3, stockId: offerBatch.id });

    const suggestion = await suggestPicksForVariant(warehouseId, variantId, 4);
    // Teklif partisinden yalnız 1 kaldı; kalan 3 sonraki partiden.
    expect(suggestion.picks).toEqual([
      expect.objectContaining({ stockId: offerBatch.id, qty: 1 }),
      expect.objectContaining({ stockId: plain.id, qty: 3 }),
    ]);
  });

  it('DLC geçmiş parti hiç önerilmez (satılamaz)', async () => {
    await stocks.insert({ warehouseId, variantId, physicalQty: 8, expiryDate: dayOffset(-1) });
    const intact = await stocks.insert({ warehouseId, variantId, physicalQty: 2, expiryDate: dayOffset(100) });

    const suggestion = await suggestPicksForVariant(warehouseId, variantId, 5);
    expect(suggestion.picks).toEqual([expect.objectContaining({ stockId: intact.id, qty: 2 })]);
    expect(suggestion.shortfall).toBe(3); // eksik açıkça bildirilir, sessizce bayat mal verilmez
  });

  it('yaklaşan son tarih işaretlenir — ekran uyarıyı buradan çizer', async () => {
    await stocks.insert({ warehouseId, variantId, physicalQty: 5, expiryDate: dayOffset(20) }); // 200 günlük üründe %10

    const [pick] = (await suggestPicksForVariant(warehouseId, variantId, 1)).picks;
    expect(pick?.flag).toBe('near_expiry');
    expect(pick?.remainingPercent).toBeCloseTo(10, 0);
  });
});
