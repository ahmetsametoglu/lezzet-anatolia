import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, ProductService, ReservationService, StockService, serviceDb } from '@lezzet/database';
import { suggestPicksForVariant } from './fefo';

/**
 * FEFO hazırlık önerisi (06.5) — uygulama katmanı orkestrasyonunun testi: servisin getirdiği
 * satırlar motorun kararıyla birleşince doğru parti sırası çıkıyor mu.
 */
const db = serviceDb();
const stocks = new StockService(db);
const reservations = new ReservationService(db);

let variantId: string;

beforeAll(async () => {
  const category = await new CategoryService(db).create({ name: { tr: `FEFO testi ${Date.now()}` } });
  const { variants } = await new ProductService(db).create({
    name: { tr: `Lahmacun ${Date.now()}` },
    categoryId: category.id,
    dateType: 'DLC',
    shelfLifeDays: 200,
  });
  variantId = variants[0]!.id;
});

beforeEach(async () => {
  await db.from('reservation').delete().eq('variant_id', variantId);
  await db.from('stock').delete().eq('variant_id', variantId);
});

const gun = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe('FEFO önerisi (06.5)', () => {
  it('önce süresi dolan parti çıkar; bir kalem birden çok partiden karşılanabilir', async () => {
    const eski = await stocks.insert({ variantId, physicalQty: 3, expiryDate: gun(20), lotNumber: 'L-1' });
    const yeni = await stocks.insert({ variantId, physicalQty: 10, expiryDate: gun(150) });

    const oneri = await suggestPicksForVariant(variantId, 5);
    expect(oneri.shortfall).toBe(0);
    expect(oneri.picks).toEqual([
      expect.objectContaining({ stockId: eski.id, qty: 3, lotNumber: 'L-1' }),
      expect.objectContaining({ stockId: yeni.id, qty: 2 }),
    ]);
  });

  it('teklife söz verilmiş (çıpalı) miktar o partiden düşülür — normal hazırlık onu yiyemez', async () => {
    const teklif = await stocks.insert({ variantId, physicalQty: 4, expiryDate: gun(10), offerPrice: 3 });
    const normal = await stocks.insert({ variantId, physicalQty: 10, expiryDate: gun(150) });
    await reservations.reserve({ orderId: crypto.randomUUID(), variantId, qty: 3, stockId: teklif.id });

    const oneri = await suggestPicksForVariant(variantId, 4);
    // Teklif partisinden yalnız 1 kaldı; kalan 3 sonraki partiden.
    expect(oneri.picks).toEqual([
      expect.objectContaining({ stockId: teklif.id, qty: 1 }),
      expect.objectContaining({ stockId: normal.id, qty: 3 }),
    ]);
  });

  it('DLC geçmiş parti hiç önerilmez (satılamaz)', async () => {
    await stocks.insert({ variantId, physicalQty: 8, expiryDate: gun(-1) });
    const saglam = await stocks.insert({ variantId, physicalQty: 2, expiryDate: gun(100) });

    const oneri = await suggestPicksForVariant(variantId, 5);
    expect(oneri.picks).toEqual([expect.objectContaining({ stockId: saglam.id, qty: 2 })]);
    expect(oneri.shortfall).toBe(3); // eksik açıkça bildirilir, sessizce bayat mal verilmez
  });

  it('yaklaşan son tarih işaretlenir — ekran uyarıyı buradan çizer', async () => {
    await stocks.insert({ variantId, physicalQty: 5, expiryDate: gun(20) }); // 200 günlük üründe %10

    const [pick] = (await suggestPicksForVariant(variantId, 1)).picks;
    expect(pick?.flag).toBe('near_expiry');
    expect(pick?.remainingPercent).toBeCloseTo(10, 0);
  });
});
