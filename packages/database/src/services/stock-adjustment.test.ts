import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { createTestWarehouse } from '../testing/warehouse';
import { purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { StockAdjustmentService } from './stock-adjustment.service';
import { StockService } from './stock.service';
import { TemperatureLogService } from './temperature-log.service';

/**
 * Stok düzeltmesi (06.6) ve sıcaklık kaydı (06.7) — DB üstünde. Düzeltmede doğrulanan şey
 * bölünemezlik: kayıt ile fiili düşüm birlikte olur ya da hiç olmaz.
 */
const db = serviceDb();
const stocks = new StockService(db);
const adjustments = new StockAdjustmentService(db);
const temps = new TemperatureLogService(db);

let variantId: string;
let productId: string;
let categoryId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
const shelves: string[] = [];

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'DUZ' })).id;
  const category = await new CategoryService(db).create({ name: { tr: `Fire testi ${Date.now()}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Su böreği ${Date.now()}` },
    categoryId: category.id,
    shelfLifeDays: 180,
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
});

// Test kendi zeminini toplar — yerel veritabanında çöp satır bırakmaz (silme sırası: cleanup.ts).
afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], temperatureLocations: shelves });
  await db.from('warehouse').delete().eq('id', warehouseId);
});

beforeEach(async () => {
  await db.from('stock_adjustment').delete().in('stock_id',
    ((await db.from('stock').select('id').eq('variant_id', variantId)).data ?? []).map((r) => (r as { id: string }).id));
  await db.from('stock').delete().eq('variant_id', variantId);
});

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe('stok düzeltmesi (06.6)', () => {
  it('imha kaydı fiiliyi düşürür ve maliyeti o anda kopyalar', async () => {
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 10, expiryDate: dayOffset(20), purchasePrice: 3.2 });

    const outcome = await adjustments.adjust({ stockId: batch.id, qty: 4, reason: 'expired' });
    expect(outcome).toMatchObject({ ok: true, remainingQty: 6 });

    expect((await stocks.getById(batch.id))?.physicalQty).toBe(6);
    const records = await adjustments.listByStock(batch.id);
    expect(records[0]).toMatchObject({ qty: 4, reason: 'expired', unitCost: 3.2 });
  });

  it('maliyet SNAPSHOT: parti fiyatı sonradan değişse fire maliyeti kaymaz', async () => {
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 5, expiryDate: dayOffset(20), purchasePrice: 2 });
    await adjustments.adjust({ stockId: batch.id, qty: 1, reason: 'damaged' });
    await stocks.update({ id: batch.id, purchasePrice: 9 });

    expect((await adjustments.listByStock(batch.id))[0]?.unitCost).toBe(2);
  });

  it('partide olmayan miktar düşülemez — kayıt da yazılmaz (bölünmez)', async () => {
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 2, expiryDate: dayOffset(20) });

    await expect(adjustments.adjust({ stockId: batch.id, qty: 3, reason: 'lost' })).rejects.toThrow();
    expect((await stocks.getById(batch.id))?.physicalQty).toBe(2);
    expect(await adjustments.listByStock(batch.id)).toHaveLength(0);
  });

  it('stoğa geri ekleme sebep notu ister (iade restoku istisnadır)', async () => {
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 3, expiryDate: dayOffset(20) });

    await expect(adjustments.adjust({ stockId: batch.id, qty: -2, reason: 'return_restock' })).rejects.toThrow();

    const outcome = await adjustments.adjust({
      stockId: batch.id,
      qty: -2,
      reason: 'return_restock',
      note: 'Kapıda reddedildi, frigo araçtan hiç çıkmadı',
    });
    expect(outcome.remainingQty).toBe(5);
    expect((await stocks.getById(batch.id))?.physicalQty).toBe(5);
  });

  it('fire raporu NET kaybı verir — geri eklemeler toplamdan düşer', async () => {
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 10, expiryDate: dayOffset(20), purchasePrice: 5 });
    await adjustments.adjust({ stockId: batch.id, qty: 4, reason: 'expired' });
    await adjustments.adjust({ stockId: batch.id, qty: -1, reason: 'count_diff', note: 'sayımda fazla çıktı' });

    const summary = await adjustments.lossSummary(new Date(Date.now() - 60_000), new Date(Date.now() + 60_000));
    expect(summary.find((r) => r.variantId === variantId)).toMatchObject({ qty: 3, costCents: 1500 }); // 3 × 5 €
  });

  it('sıfır miktar reddedilir', async () => {
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 1, expiryDate: dayOffset(20) });
    await expect(adjustments.adjust({ stockId: batch.id, qty: 0, reason: 'count_diff' })).rejects.toThrow();
  });
});

describe('sıcaklık kaydı (06.7)', () => {
  const shelf = `Dolap-${Date.now()}`;
  shelves.push(shelf, `${shelf}-arac`);

  it('kayıt girilir, konum + tarih aralığıyla listelenir (en yeni önce)', async () => {
    await temps.insert({ warehouseId, location: shelf, temperatureC: -18.5 });
    await temps.insert({ warehouseId, location: shelf, temperatureC: -19.2 });
    await temps.insert({ warehouseId, location: `${shelf}-arac`, temperatureC: -15 });

    const page = await temps.list({ location: shelf, limit: 10 });
    expect(page.rows).toHaveLength(2);
    expect(page.rows[0]!.temperatureC).toBe(-19.2); // en yeni önce

    const future = await temps.list({ location: shelf, from: new Date(Date.now() + 60_000) });
    expect(future.rows).toHaveLength(0);
  });

  it('girilmiş konumlar seçim listesi olarak döner', async () => {
    expect(await temps.listLocations()).toContain(shelf);
  });
});
