import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, ProductService, StockIntakeService, SupplierService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import { recordMovement, recordSupplierPayment } from './movement';

/**
 * Tedarikçi borcu (12.3) — DOMAIN §16. Borç **saklanmaz**: Σ girişler − Σ ödemeler.
 * Doğrulanan şey, ödemenin borcu gerçekten kapatması ve kalanın hem mal kabullerle hem para
 * hareketleriyle tutması.
 */
const db = serviceDb();
const suppliers = new SupplierService(db);
const intakes = new StockIntakeService(db);
const accounts = new AccountService(db);

const stamp = Date.now();
let supplierId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let bankAccount: string;

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Borç testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Un ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  supplierId = (await suppliers.insert({ name: `Borç tedarikçisi ${stamp}` })).id;
  bankAccount = (await accounts.insert({ name: `Borç bankası ${stamp}`, type: 'bank' })).id;
});

beforeEach(async () => {
  await db.from('money_movement').delete().eq('supplier_id', supplierId);
  await db.from('stock').delete().eq('variant_id', variantId);
  await db.from('stock_intake').delete().eq('supplier_id', supplierId);
});

afterAll(async () => {
  // Hareketin tedarikçi bağı `set null`: tedarikçiyi silmek hareketi bırakır, hareket de hesabı
  // `restrict` ile tutar. Bu yüzden anahtar HESAP — sıra `cleanup.ts`'te.
  await db.from('stock').delete().eq('variant_id', variantId);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    accountIds: [bankAccount],
    supplierIds: [supplierId], // kabulleri onunla gider
    warehouseIds: [warehouseId],
  });
});

/** 10 × 4 € = 40 €'luk mal kabul. Maliyet **cent** verilir (02.9 · `STACK §8`). */
async function malKabul(qty = 10, unitCostCents = 400) {
  return intakes.receive({ warehouseId, supplierId, lines: [{ variantId, qty, expiryDate: dayOffset(250), unitCostCents }] });
}

describe('tedarikçi borcu TÜRETİLİR', () => {
  it('ödeme yokken borç girişlerin toplamıdır', async () => {
    await malKabul();
    expect(await suppliers.debt(supplierId)).toMatchObject({ intakeTotalCents: 4000, paidCents: 0, balanceCents: 4000 });
  });

  it('ödeme borcu kapatır; kalan doğru türetilir', async () => {
    await malKabul();

    const result = await recordSupplierPayment({ supplierId, accountId: bankAccount, amountCents: 2500, description: 'Kısmi ödeme' });
    expect(result.status).toBe('ok');

    expect(await suppliers.debt(supplierId)).toMatchObject({ intakeTotalCents: 4000, paidCents: 2500, balanceCents: 1500 });
  });

  it('tamamı ödenince borç sıfırlanır', async () => {
    await malKabul();
    await recordSupplierPayment({ supplierId, accountId: bankAccount, amountCents: 4000 });
    expect((await suppliers.debt(supplierId)).balanceCents).toBe(0);
  });

  it('birden çok giriş ve ödeme toplanır', async () => {
    await malKabul(10, 400); // 40 €
    await malKabul(5, 600); // 30 €
    await recordSupplierPayment({ supplierId, accountId: bankAccount, amountCents: 2000 });
    await recordSupplierPayment({ supplierId, accountId: bankAccount, amountCents: 1550 });

    // 15,50 €'luk ödeme bilinçli: kuruşlu bir tutar euro toplamında artık bırakırdı (34.499…),
    // cent tamsayısında bırakmaz — çıkarma kesin.
    expect(await suppliers.debt(supplierId)).toMatchObject({ intakeTotalCents: 7000, paidCents: 3550, balanceCents: 3450 });
  });

  it('ödeme mal kabule bağlanabilir — hangi girişin kapandığı görünür', async () => {
    const intake = await malKabul();
    const result = await recordSupplierPayment({ supplierId, accountId: bankAccount, amountCents: 4000, stockIntakeId: intake.intakeId });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.movement.stockIntakeId).toBe(intake.intakeId);
  });

  it('ödeme hesabın bakiyesinden de düşer — tek defter', async () => {
    const before = (await accounts.balance(bankAccount)).balanceCents;
    await malKabul();
    await recordSupplierPayment({ supplierId, accountId: bankAccount, amountCents: 4000 });

    expect((await accounts.balance(bankAccount)).balanceCents).toBe(before - 4000);
  });

  it('bağsız alım reddedilir — borç bu bağın üstünde duruyor', async () => {
    expect(await recordMovement({ accountId: bankAccount, direction: 'out', amountCents: 1000, type: 'purchase' })).toMatchObject({
      status: 'invalid',
      reason: 'supply_link_missing',
    });
  });
});
