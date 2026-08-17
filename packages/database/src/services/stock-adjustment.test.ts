import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { createTestWarehouse } from '../testing/warehouse';
import { purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { StockAdjustmentService } from './stock-adjustment.service';
import { StockService } from './stock.service';
import { StorageAreaService, VehicleService } from './storage-point.service';
import { TemperatureLogService } from './temperature-log.service';

/**
 * Stok düzeltmesi (06.6) ve sıcaklık kaydı (06.7) — DB üstünde. Düzeltmede doğrulanan şey
 * bölünemezlik: kayıt ile fiili düşüm birlikte olur ya da hiç olmaz.
 */
const db = serviceDb();
const stocks = new StockService(db);
const adjustments = new StockAdjustmentService(db);
const temps = new TemperatureLogService(db);
const areas = new StorageAreaService(db);
const vehicles = new VehicleService(db);

let variantId: string;
let productId: string;
let categoryId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
// Ölçüm noktaları (19.28): sıcaklık kaydı artık serbest metin konum değil TANIMLI nokta taşıyor.
let storageAreaId: string;
let vehicleId: string;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'DUZ' })).id;
  const stamp = Date.now();
  storageAreaId = (await areas.insert({ warehouseId, name: `Dolap ${stamp}`, kind: 'frozen' })).id;
  vehicleId = (await vehicles.insert({ plate: `T-${stamp}`, warehouseId })).id;
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
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    storageAreaIds: [storageAreaId],
    vehicleIds: [vehicleId],
    warehouseIds: [warehouseId],
  });
});

beforeEach(async () => {
  await db.from('stock_adjustment').delete().in('stock_id',
    ((await db.from('stock').select('id').eq('variant_id', variantId)).data ?? []).map((r) => (r as { id: string }).id));
  await db.from('stock').delete().eq('variant_id', variantId);
});

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe('stok düzeltmesi (06.6)', () => {
  it('imha kaydı fiiliyi düşürür ve maliyeti o anda kopyalar', async () => {
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 10, expiryDate: dayOffset(20), purchasePriceCents: 320 });

    const outcome = await adjustments.adjust({ stockId: batch.id, qty: 4, reason: 'expired' });
    expect(outcome).toMatchObject({ ok: true, remainingQty: 6 });

    expect((await stocks.getById(batch.id))?.physicalQty).toBe(6);
    const records = await adjustments.listByStock(batch.id);
    expect(records[0]).toMatchObject({ qty: 4, reason: 'expired', unitCostCents: 320 });
  });

  it('maliyet SNAPSHOT: parti fiyatı sonradan değişse fire maliyeti kaymaz', async () => {
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 5, expiryDate: dayOffset(20), purchasePriceCents: 200 });
    await adjustments.adjust({ stockId: batch.id, qty: 1, reason: 'damaged' });
    await stocks.update({ id: batch.id, purchasePriceCents: 900 });

    expect((await adjustments.listByStock(batch.id))[0]?.unitCostCents).toBe(200);
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
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 10, expiryDate: dayOffset(20), purchasePriceCents: 500 });
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

/**
 * İmha/fire listesinin ARAMASI (09.18 · operasyon talebi §2) — `stock_adjustment_detail` görünümü.
 *
 * Sınanan şey aramanın iki ayrı kaynağa birden bakabilmesi: lot numarası düzeltme satırında,
 * ürün adı üç tablo ötede. Gömülü `select` ile bu "VEYA" kurulamıyordu; görünüm onu düz bir
 * kolona indiriyor. **Kendi kurduğumuz satırları arıyoruz**, küresel sayıya bakmıyoruz
 * (`CLAUDE.md §4b`) — paylaşılan veritabanında başka ajanın fire kaydı da var.
 */
describe('imha/fire araması (09.18)', () => {
  it('LOT numarasıyla bulunur', async () => {
    const lot = `LOTQ${Date.now()}`;
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 5, expiryDate: dayOffset(10), lotNumber: lot });
    await adjustments.adjust({ stockId: batch.id, qty: 2, reason: 'damaged' });

    const page = await adjustments.listRecent({ query: lot });
    expect(page.rows.map((row) => row.stock.lotNumber)).toEqual([lot]);
  });

  it('ÜRÜN ADIYLA da bulunur — arama iki kaynağa birden bakar', async () => {
    // Asıl istek buydu: elinde lot yoksa operatör ürünün adını yazar. Ad `product` tablosunda,
    // yani düzeltme satırından üç tablo ötede — eski okumada aranamıyordu.
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 5, expiryDate: dayOffset(10) });
    await adjustments.adjust({ stockId: batch.id, qty: 1, reason: 'lost' });

    const page = await adjustments.listRecent({ query: 'Su böreği' });
    expect(page.rows.some((row) => row.stock.variant.product.id === productId)).toBe(true);
  });

  it('eşleşmeyen terim BOŞ döner — "bulamadım" ile "hepsi" karışmaz', async () => {
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 5, expiryDate: dayOffset(10) });
    await adjustments.adjust({ stockId: batch.id, qty: 1, reason: 'lost' });

    expect((await adjustments.listRecent({ query: `YOK${Date.now()}` })).rows).toEqual([]);
  });

  it('terimsiz çağrı bugünkü davranışı korur ve şekil DEĞİŞMEZ', async () => {
    // Ekran iç içe `stock.variant.product` bekliyor; okuma görünüme taşındı ama şekil aynı kaldı.
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 5, expiryDate: dayOffset(10), purchasePriceCents: 250 });
    await adjustments.adjust({ stockId: batch.id, qty: 3, reason: 'expired' });

    const row = (await adjustments.listRecent({ limit: 50 })).rows.find((r) => r.stockId === batch.id);
    expect(row).toMatchObject({ qty: 3, reason: 'expired', stock: { id: batch.id } });
    expect(row?.stock.variant.product.id).toBe(productId);
  });
});

describe('sıcaklık kaydı (06.7 · noktalar 19.28)', () => {
  it('kayıt girilir, NOKTA + tarih aralığıyla listelenir (en yeni önce)', async () => {
    await temps.insert({ warehouseId, storageAreaId, temperatureC: -18.5 });
    await temps.insert({ warehouseId, storageAreaId, temperatureC: -19.2 });
    // Araç kaydı aynı depoya yazılır (kaydın alındığı tesis) ama AYRI noktadır — süzgeç ikisini
    // karıştırmamalı, yoksa "bu dolabın geçmişi" sorusu aracın ölçümünü de sayardı.
    await temps.insert({ warehouseId, vehicleId, temperatureC: -15 });

    const page = await temps.list({ storageAreaId, limit: 10 });
    expect(page.rows).toHaveLength(2);
    expect(page.rows[0]!.temperatureC).toBe(-19.2); // en yeni önce

    const future = await temps.list({ storageAreaId, from: new Date(Date.now() + 60_000) });
    expect(future.rows).toHaveLength(0);
  });

  it('NOKTASIZ kayıt reddedilir — ölçümün nerede alındığı bilinmeden kayıt bir kanıt değildir', async () => {
    await expect(temps.insert({ warehouseId, temperatureC: -18 })).rejects.toThrow();
  });

  it('İKİ noktalı kayıt reddedilir — tek ölçüm tek yerde alınır', async () => {
    await expect(temps.insert({ warehouseId, storageAreaId, vehicleId, temperatureC: -18 })).rejects.toThrow();
  });
});
