import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, ProductService, StockIntakeService, SupplierService, serviceDb,
} from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
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
let variantId: string;
let productId: string;
let categoryId: string;
let bankAccount: string;

const gun = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
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
  await db.from('money_movement').delete().eq('supplier_id', supplierId);
  await db.from('stock').delete().eq('variant_id', variantId);
  await db.from('stock_intake').delete().eq('supplier_id', supplierId);
  await db.from('account').delete().eq('id', bankAccount);
  await db.from('supplier').delete().eq('id', supplierId);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId] });
});

/** 10 × 4 € = 40 €'luk mal kabul. */
async function malKabul(qty = 10, unitCost = 4) {
  return intakes.receive({ supplierId, lines: [{ variantId, qty, expiryDate: gun(250), unitCost }] });
}

describe('tedarikçi borcu TÜRETİLİR', () => {
  it('ödeme yokken borç girişlerin toplamıdır', async () => {
    await malKabul();
    expect(await suppliers.debt(supplierId)).toMatchObject({ intakeTotal: 40, paid: 0, balance: 40 });
  });

  it('ödeme borcu kapatır; kalan doğru türetilir', async () => {
    await malKabul();

    const result = await recordSupplierPayment({ supplierId, accountId: bankAccount, amount: 25, description: 'Kısmi ödeme' });
    expect(result.status).toBe('ok');

    expect(await suppliers.debt(supplierId)).toMatchObject({ intakeTotal: 40, paid: 25, balance: 15 });
  });

  it('tamamı ödenince borç sıfırlanır', async () => {
    await malKabul();
    await recordSupplierPayment({ supplierId, accountId: bankAccount, amount: 40 });
    expect((await suppliers.debt(supplierId)).balance).toBe(0);
  });

  it('birden çok giriş ve ödeme toplanır', async () => {
    await malKabul(10, 4); // 40
    await malKabul(5, 6); // 30
    await recordSupplierPayment({ supplierId, accountId: bankAccount, amount: 20 });
    await recordSupplierPayment({ supplierId, accountId: bankAccount, amount: 15.5 });

    expect(await suppliers.debt(supplierId)).toMatchObject({ intakeTotal: 70, paid: 35.5, balance: 34.5 });
  });

  it('ödeme mal kabule bağlanabilir — hangi girişin kapandığı görünür', async () => {
    const intake = await malKabul();
    const result = await recordSupplierPayment({ supplierId, accountId: bankAccount, amount: 40, stockIntakeId: intake.intakeId });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.movement.stockIntakeId).toBe(intake.intakeId);
  });

  it('ödeme hesabın bakiyesinden de düşer — tek defter', async () => {
    const before = (await accounts.balance(bankAccount)).balance;
    await malKabul();
    await recordSupplierPayment({ supplierId, accountId: bankAccount, amount: 40 });

    expect((await accounts.balance(bankAccount)).balance).toBe(before - 40);
  });

  it('bağsız alım reddedilir — borç bu bağın üstünde duruyor', async () => {
    expect(await recordMovement({ accountId: bankAccount, direction: 'out', amount: 10, type: 'purchase' })).toMatchObject({
      status: 'invalid',
      reason: 'supply_link_missing',
    });
  });
});
