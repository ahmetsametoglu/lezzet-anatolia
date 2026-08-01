import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, ProductService, StockAdjustmentService, StockService, serviceDb } from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import { findByDocument, recordAdjustment, type AdjustmentLine, type WarehouseReason } from './adjustment';

/**
 * İmha / sayım OLAY belgesi (10.5) — stok ekranının çizili ama açılamayan "Kayıt" sütununun zemini.
 *
 * Sınanan şey: **numara olay başına mı** (satır başına değil), **yarım tutanak kalıyor mu** ve
 * depocuya restok yolunun kapalı olduğu.
 */
const db = serviceDb();
const stocks = new StockService(db);
const adjustments = new StockAdjustmentService(db);

const stamp = Date.now();
let variantId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let productId: string;
let categoryId: string;
let batchA: string;
let batchB: string;

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `İmha testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Peynir ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '500 g' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
});

beforeEach(async () => {
  await db.from('stock').delete().eq('variant_id', variantId);
  batchA = (await stocks.insert({ warehouseId, variantId, physicalQty: 10, expiryDate: dayOffset(5), purchasePrice: 4 })).id;
  batchB = (await stocks.insert({ warehouseId, variantId, physicalQty: 8, expiryDate: dayOffset(9), purchasePrice: 5 })).id;
});

afterAll(async () => {
  await db.from('stock').delete().eq('variant_id', variantId);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId] });
  await db.from('warehouse').delete().eq('id', warehouseId);
});

describe('olay belgesi', () => {
  it('ÜÇ parti tek numarayı paylaşır — kâğıt üçe bölünmez', async () => {
    const lines: AdjustmentLine[] = [{ stockId: batchA, qty: 3 }, { stockId: batchB, qty: 2 }];

    const outcome = await recordAdjustment({ lines, reason: 'expired', note: 'DLC geçti' });

    expect(outcome.status).toBe('ok');
    const reference = outcome.status === 'ok' ? outcome.result.referenceNo : '';
    // Önek artık DEPO KODU taşıyor (DOMAIN §17): `IMH-STR-26-0012`. Kâğıt klasör o depoda durduğu
    // için seriler depo başına ayrışır; testin deposu damgalı bir kod üretir.
    expect(reference).toMatch(/^IMH-[A-Z0-9-]+-\d{2}-\d{4}$/);

    const rows = await findByDocument(reference);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.referenceNo))).toEqual(new Set([reference]));
  });

  it('numara SIRALI ilerler — denetmen okuyup yazabilsin', async () => {
    const first = await recordAdjustment({ lines: [{ stockId: batchA, qty: 1 }], reason: 'damaged' });
    const second = await recordAdjustment({ lines: [{ stockId: batchA, qty: 1 }], reason: 'damaged' });

    const numberOf = (ref: string) => Number(ref.split('-')[2]);
    const a = first.status === 'ok' ? numberOf(first.result.referenceNo) : 0;
    const b = second.status === 'ok' ? numberOf(second.result.referenceNo) : 0;
    expect(b).toBe(a + 1);
  });

  it('sebep belgeyi belirler: sayım farkı imha tutanağına yazılmaz', async () => {
    const sayim = await recordAdjustment({ lines: [{ stockId: batchA, qty: 2 }], reason: 'count_diff', note: 'sayım' });

    expect(sayim.status === 'ok' ? sayim.result.referenceNo : '').toMatch(/^SAY-/);
  });

  it('olayın net maliyeti dönüşte gelir — farklı partiler kendi alış fiyatıyla', async () => {
    const outcome = await recordAdjustment({
      lines: [{ stockId: batchA, qty: 2 }, { stockId: batchB, qty: 1 }],
      reason: 'expired',
    });

    // 2 × 4 € + 1 × 5 € = 13 €; her parti KENDİ maliyetinden sayılır, ortalamadan değil.
    expect(outcome.status === 'ok' ? outcome.result.costTotal : 0).toBe(13);
  });
});

describe('bölünmezlik', () => {
  it('bir satır tutmazsa HİÇBİRİ yazılmaz — yarım tutanak kalmaz', async () => {
    const outcome = await recordAdjustment({
      lines: [{ stockId: batchA, qty: 3 }, { stockId: batchB, qty: 99 }], // ikincisi partiyi aşıyor
      reason: 'expired',
    });

    expect(outcome.status).toBe('failed');
    // İlk satır da yazılmadı: stok el değmemiş.
    expect((await stocks.getById(batchA))?.physicalQty).toBe(10);
    expect(await adjustments.listByStock(batchA)).toHaveLength(0);
  });

  it('satırsız çağrı yazım YAPMAZ', async () => {
    expect(await recordAdjustment({ lines: [], reason: 'expired' })).toEqual({ status: 'empty' });
  });

  it('stoğa geri ekleme sebep notu ister — istisna sebepsiz yazılmaz', async () => {
    const outcome = await recordAdjustment({ lines: [{ stockId: batchA, qty: -2 }], reason: 'count_diff' });

    expect(outcome.status).toBe('failed');
    expect((await stocks.getById(batchA))?.physicalQty).toBe(10);
  });

  it('sayım FAZLASI notla yazılır ve stoğu artırır', async () => {
    const outcome = await recordAdjustment({
      lines: [{ stockId: batchA, qty: -2 }],
      reason: 'count_diff',
      note: 'sayımda 2 adet fazla çıktı',
    });

    expect(outcome.status).toBe('ok');
    expect((await stocks.getById(batchA))?.physicalQty).toBe(12);
    // İşaret korunur: net kayıp eksiye döner, şişmiş bir "imha ettik" rakamı doğmaz.
    expect(outcome.status === 'ok' ? outcome.result.costTotal : 0).toBe(-8);
  });
});

describe('depocuya restok seçeneği sunulmaz', () => {
  it('`return_restock` bu kapıdan GEÇMEZ — kural tipte duruyor', () => {
    // @ts-expect-error — depo kapısı iade restokunu kabul etmez (DOMAIN §4: admin istisnası).
    const forbidden: WarehouseReason = 'return_restock';
    expect(forbidden).toBe('return_restock');
  });
});
