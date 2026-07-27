import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
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
const dolaplar: string[] = [];

beforeAll(async () => {
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
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], temperatureLocations: dolaplar });
});

beforeEach(async () => {
  await db.from('stock_adjustment').delete().in('stock_id',
    ((await db.from('stock').select('id').eq('variant_id', variantId)).data ?? []).map((r) => (r as { id: string }).id));
  await db.from('stock').delete().eq('variant_id', variantId);
});

const gun = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe('stok düzeltmesi (06.6)', () => {
  it('imha kaydı fiiliyi düşürür ve maliyeti o anda kopyalar', async () => {
    const parti = await stocks.insert({ variantId, physicalQty: 10, expiryDate: gun(20), purchasePrice: 3.2 });

    const sonuc = await adjustments.adjust({ stockId: parti.id, qty: 4, reason: 'expired' });
    expect(sonuc).toMatchObject({ ok: true, remainingQty: 6 });

    expect((await stocks.getById(parti.id))?.physicalQty).toBe(6);
    const kayitlar = await adjustments.listByStock(parti.id);
    expect(kayitlar[0]).toMatchObject({ qty: 4, reason: 'expired', unitCost: 3.2 });
  });

  it('maliyet SNAPSHOT: parti fiyatı sonradan değişse fire maliyeti kaymaz', async () => {
    const parti = await stocks.insert({ variantId, physicalQty: 5, expiryDate: gun(20), purchasePrice: 2 });
    await adjustments.adjust({ stockId: parti.id, qty: 1, reason: 'damaged' });
    await stocks.update({ id: parti.id, purchasePrice: 9 });

    expect((await adjustments.listByStock(parti.id))[0]?.unitCost).toBe(2);
  });

  it('partide olmayan miktar düşülemez — kayıt da yazılmaz (bölünmez)', async () => {
    const parti = await stocks.insert({ variantId, physicalQty: 2, expiryDate: gun(20) });

    await expect(adjustments.adjust({ stockId: parti.id, qty: 3, reason: 'lost' })).rejects.toThrow();
    expect((await stocks.getById(parti.id))?.physicalQty).toBe(2);
    expect(await adjustments.listByStock(parti.id)).toHaveLength(0);
  });

  it('stoğa geri ekleme sebep notu ister (iade restoku istisnadır)', async () => {
    const parti = await stocks.insert({ variantId, physicalQty: 3, expiryDate: gun(20) });

    await expect(adjustments.adjust({ stockId: parti.id, qty: -2, reason: 'return_restock' })).rejects.toThrow();

    const sonuc = await adjustments.adjust({
      stockId: parti.id,
      qty: -2,
      reason: 'return_restock',
      note: 'Kapıda reddedildi, frigo araçtan hiç çıkmadı',
    });
    expect(sonuc.remainingQty).toBe(5);
    expect((await stocks.getById(parti.id))?.physicalQty).toBe(5);
  });

  it('fire raporu NET kaybı verir — geri eklemeler toplamdan düşer', async () => {
    const parti = await stocks.insert({ variantId, physicalQty: 10, expiryDate: gun(20), purchasePrice: 5 });
    await adjustments.adjust({ stockId: parti.id, qty: 4, reason: 'expired' });
    await adjustments.adjust({ stockId: parti.id, qty: -1, reason: 'count_diff', note: 'sayımda fazla çıktı' });

    const ozet = await adjustments.lossSummary(new Date(Date.now() - 60_000), new Date(Date.now() + 60_000));
    expect(ozet.find((r) => r.variantId === variantId)).toMatchObject({ qty: 3, costCents: 1500 }); // 3 × 5 €
  });

  it('sıfır miktar reddedilir', async () => {
    const parti = await stocks.insert({ variantId, physicalQty: 1, expiryDate: gun(20) });
    await expect(adjustments.adjust({ stockId: parti.id, qty: 0, reason: 'count_diff' })).rejects.toThrow();
  });
});

describe('sıcaklık kaydı (06.7)', () => {
  const dolap = `Dolap-${Date.now()}`;
  dolaplar.push(dolap, `${dolap}-arac`);

  it('kayıt girilir, konum + tarih aralığıyla listelenir (en yeni önce)', async () => {
    await temps.insert({ location: dolap, temperatureC: -18.5 });
    await temps.insert({ location: dolap, temperatureC: -19.2 });
    await temps.insert({ location: `${dolap}-arac`, temperatureC: -15 });

    const sayfa = await temps.list({ location: dolap, limit: 10 });
    expect(sayfa.rows).toHaveLength(2);
    expect(sayfa.rows[0]!.temperatureC).toBe(-19.2); // en yeni önce

    const gelecek = await temps.list({ location: dolap, from: new Date(Date.now() + 60_000) });
    expect(gelecek.rows).toHaveLength(0);
  });

  it('girilmiş konumlar seçim listesi olarak döner', async () => {
    expect(await temps.listLocations()).toContain(dolap);
  });
});
