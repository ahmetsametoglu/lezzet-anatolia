import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allocateToDocument, createMoneyDocument } from '@lezzet/application';
import { AccountService, CategoryService, ProductService, StockIntakeService, SupplierService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData, purgeVariantStock } from '@lezzet/database/testing';
import { recordSupplierPayment } from './movement';

/**
 * BORÇ BELGEDEN TÜRER (12.26 · kullanıcı kararı 14.09) — faturası girilen kabulün borcu FATURANIN
 * toplamıdır (KDV ve nakliye dâhil), kabulün satır toplamı değil. Bir tur borç yalnız kabullerin
 * satırlarından toplanıyordu: KDV hariç, nakliyesiz — ödenen fatura ise KDV dâhildi ve banka satırı hiç
 * tam eşleşmiyordu. Kendi kurduğumuz satırları sayıyoruz, küresel sayıya bakmıyoruz (`CLAUDE §4b`).
 */
const db = serviceDb();
const suppliers = new SupplierService(db);
const intakes = new StockIntakeService(db);

const stamp = Date.now();
const documentIds: string[] = [];
let supplierId = '';
let otherSupplierId = '';
let warehouseId = '';
let variantId = '';
let productId = '';
let categoryId = '';
let bankAccount = '';

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Belge borcu testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Pekmez ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  supplierId = (await suppliers.insert({ name: `Belge tedarikçisi ${stamp}`, country: 'BE' })).id;
  otherSupplierId = (await suppliers.insert({ name: `Öteki tedarikçi ${stamp}` })).id;
  bankAccount = (await new AccountService(db).insert({ name: `Belge bankası ${stamp}`, type: 'bank' })).id;
});

// Temizlik ORTAK yardımcıyla (`CLAUDE §4b`): belgeler kimlikleriyle, sonra parti/kabul zinciri ve kayıtlar.
// Belge tedarikçi silinince kalırdı (`supplier_id` `set null`) — o yüzden kimlik listesi tutuluyor.
afterAll(async () => {
  await purgeTestData(db, { documentIds });
  await purgeVariantStock(db, [variantId]);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    accountIds: [bankAccount],
    supplierIds: [supplierId, otherSupplierId],
    warehouseIds: [warehouseId],
  });
});

/** 10 × 4 € = 40 €'luk mal kabul (KDV hariç birim maliyet). */
async function malKabul() {
  return intakes.receive({ warehouseId, supplierId, lines: [{ variantId, qty: 10, expiryDate: dayOffset(250), unitCostCents: 400 }] });
}

/** Kabulün faturası — 48 € (40 € mal + 8 € KDV). */
async function fatura(stockIntakeId: string, over: Partial<Parameters<typeof createMoneyDocument>[1]> = {}) {
  const outcome = await createMoneyDocument(db, {
    kind: 'invoice',
    number: `FA-${stamp}-${documentIds.length}`,
    issuedOn: dayOffset(0),
    supplierId,
    stockIntakeId,
    direction: 'out',
    amountCents: 4800,
    vatAmountCents: 800,
    ...over,
  });
  if (outcome.status === 'ok') documentIds.push(outcome.document.id);
  return outcome;
}

describe('borç belgeden türer (12.26)', () => {
  it('faturası girilen kabul borca FATURANIN tutarıyla girer — satır toplamı ikinci kez sayılmaz', async () => {
    const before = await suppliers.debt(supplierId);
    const intake = await malKabul();
    expect((await suppliers.debt(supplierId)).purchasedCents - before.purchasedCents).toBe(4000);

    expect((await fatura(intake.intakeId)).status).toBe('ok');
    expect((await suppliers.debt(supplierId)).purchasedCents - before.purchasedCents).toBe(4800);
  });

  it('aynı kabule ikinci fatura bağlanamaz; başka tedarikçinin kabulü de bağlanamaz', async () => {
    const intake = await malKabul();
    expect((await fatura(intake.intakeId)).status).toBe('ok');
    expect(await fatura(intake.intakeId)).toMatchObject({ status: 'invalid', reason: 'link_has_document' });
    expect(await fatura(intake.intakeId, { supplierId: otherSupplierId })).toMatchObject({ status: 'invalid', reason: 'link_supplier_mismatch' });
  });

  it('faturanın ödemesi tedarikçiye bağlı alım olarak belgeyi kapatır ve borcu düşer', async () => {
    const before = await suppliers.debt(supplierId);
    const intake = await malKabul();
    const document = await fatura(intake.intakeId);
    if (document.status !== 'ok') throw new Error(`belge yazılamadı: ${document.reason}`);

    const payment = await recordSupplierPayment({ supplierId, accountId: bankAccount, amountCents: 4800, stockIntakeId: intake.intakeId });
    if (payment.status !== 'ok') throw new Error(`ödeme yazılamadı: ${payment.reason}`);
    expect(payment.movement.type).toBe('purchase');
    expect((await allocateToDocument(db, { movementId: payment.movement.id, documentId: document.document.id })).status).toBe('ok');

    expect((await suppliers.debt(supplierId)).balanceCents).toBe(before.balanceCents);
  });

  it('ters yüklemeli faturada KDV olamaz; vade belgenin gününden önce olamaz', async () => {
    const intake = await malKabul();
    expect(await fatura(intake.intakeId, { vatRegime: 'reverse_charge' })).toMatchObject({ status: 'invalid', reason: 'vat_with_regime' });
    expect(await fatura(intake.intakeId, { dueOn: dayOffset(-1) })).toMatchObject({ status: 'invalid', reason: 'due_before_issue' });
    expect((await fatura(intake.intakeId, { vatRegime: 'reverse_charge', vatAmountCents: 0, amountCents: 4000, dueOn: dayOffset(10) })).status).toBe('ok');
  });
});
