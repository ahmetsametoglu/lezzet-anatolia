import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, MoneyMovementService, OrderService, ProductService,
  UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import { analyzeFile, importBankRows, profileFor, saveProfile } from './import';
import { applyOrderMatch, classifyAsExpense, dismissRow, matchQueue } from './reconcile';

/**
 * Banka import'u ve eşleştirme (12.4) — DB üstünde. Doğrulanan iki zor şey:
 * 1. **Mükerrer koruması**: aynı dosya iki kez yüklenirse para iki kez yazılmaz — ama aynı gün
 *    çekilen iki ayrı 20 € de yutulmaz.
 * 2. **Eşleştirme onaya düşer**: öneri çıkar, uygulamayı insan yapar; uygulandığında para
 *    12.2'nin kapısından geçer ve iki kez sayılmaz.
 */
const db = serviceDb();
const accounts = new AccountService(db);
const movements = new MoneyMovementService(db);
const orders = new OrderService(db);

const stamp = Date.now();
let bankAccount: string;
let customerId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let variantId: string;
let productId: string;
let categoryId: string;
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** Dosyadaki tarih biçimi gün/ay/yıl — okuyucu profilden öğrenir. */
const frDate = (n: number) => dayOffset(n).split('-').reverse().join('/');

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  bankAccount = (await accounts.insert({ name: `Import bankası ${stamp}`, type: 'bank' })).id;
  const category = await new CategoryService(db).create({ name: { tr: `Import testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Lokum ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  customerId = (await new UserProfileService(db).insert({ name: `Import müşterisi ${stamp}` })).id;
  createdProfiles.push(customerId);
});

beforeEach(async () => {
  await db.from('money_movement').delete().eq('account_id', bankAccount);
  await db.from('bank_import').delete().eq('account_id', bankAccount);
  await db.from('order').delete().eq('customer_id', customerId);
});

afterAll(async () => {
  await db.from('money_movement').delete().eq('account_id', bankAccount);
  await db.from('bank_import').delete().eq('account_id', bankAccount);
  await db.from('bank_import_profile').delete().eq('account_id', bankAccount);
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('account').delete().eq('id', bankAccount);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: createdProfiles });
  await db.from('warehouse').delete().eq('id', warehouseId);
});

/** Fransız bankası ekstresi görünümlü ham satırlar. */
const STATEMENT = [
  { Date: frDate(-3), 'Libellé': 'VIR SEPA DUPONT', Montant: '45,90', Solde: '1 234,56' },
  { Date: frDate(-2), 'Libellé': 'PRLV EDF FACTURE', Montant: '-120,00', Solde: '1 114,56' },
  { Date: frDate(-1), 'Libellé': 'RETRAIT DAB', Montant: '-20,00', Solde: '1 094,56' },
  { Date: frDate(-1), 'Libellé': 'RETRAIT DAB', Montant: '-20,00', Solde: '1 074,56' },
];

async function importStatement(rows = STATEMENT, fileName = 'releve.csv') {
  const suggestion = analyzeFile(rows);
  const profile =
    (await profileFor(bankAccount)) ??
    (await saveProfile({ accountId: bankAccount, name: `Crédit Mutuel ${stamp}`, suggestion }));
  return importBankRows({ accountId: bankAccount, profile, fileName, rows });
}

describe('dosya çözümlenir ve şablon kaydedilir', () => {
  it('sütun eşlemesi çıkarılır; ikinci dosyada şablon otomatik uygulanır', async () => {
    const suggestion = analyzeFile(STATEMENT);
    expect(suggestion.mapping).toMatchObject({ date: 'Date', label: 'Libellé', amount: 'Montant' });
    expect(suggestion.missing).toEqual([]);

    const profile = await saveProfile({ accountId: bankAccount, name: `Crédit Mutuel ${stamp}`, suggestion });
    expect(await profileFor(bankAccount)).toMatchObject({ id: profile.id, decimalSeparator: ',', dateFormat: 'dmy' });
  });
});

describe('mükerrer koruması', () => {
  it('satırlar hareket olur; hesabın bakiyesi ANINDA doğrudur', async () => {
    const result = await importStatement();

    expect(result.inserted).toBe(4);
    expect(result.duplicates).toBe(0);
    expect(result.failures).toEqual([]);
    // 45.90 − 120 − 20 − 20 = −114.10
    expect((await accounts.balance(bankAccount)).balance).toBe(-114.1);
  });

  it('AYNI DOSYA ikinci kez yüklenirse tek satır bile yazılmaz — para iki kez sayılmaz', async () => {
    await importStatement();
    const balanceAfterFirst = (await accounts.balance(bankAccount)).balance;

    const second = await importStatement(STATEMENT, 'releve-tekrar.csv');
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toBe(4);
    expect((await accounts.balance(bankAccount)).balance).toBe(balanceAfterFirst);
  });

  it('ÇAKIŞAN DÖNEM: eski satırlar atlanır, yalnız yeniler girer', async () => {
    await importStatement();

    const overlapping = [...STATEMENT, { Date: frDate(0), 'Libellé': 'VIR SEPA MARTIN', Montant: '80,00', Solde: '1 154,56' }];
    const second = await importStatement(overlapping, 'releve-2.csv');

    expect(second.inserted).toBe(1);
    expect(second.duplicates).toBe(4);
  });

  it('aynı gün aynı tutarlı İKİ GERÇEK çekim ikisi de yazılır — biri yutulmaz', async () => {
    await importStatement();
    const ledger = await movements.ledger(bankAccount, { limit: 50 });
    expect(ledger.rows.filter((r) => r.description === 'RETRAIT DAB')).toHaveLength(2);
  });

  it('yükleme kaydı denetlenebilir: kaç satır, kaçı yazıldı, kaçı atlandı', async () => {
    await importStatement();
    const second = await importStatement(STATEMENT, 'releve-tekrar.csv');

    expect(second.batch).toMatchObject({ fileName: 'releve-tekrar.csv', rowCount: 4, insertedCount: 0, duplicateCount: 4 });
  });

  it('okunamayan satır dosyayı düşürmez, sebebiyle raporlanır', async () => {
    const result = await importStatement(
      [...STATEMENT, { Date: 'gecersiz', 'Libellé': 'BOZUK', Montant: '10,00', Solde: '' }],
      'releve-bozuk.csv',
    );

    expect(result.inserted).toBe(4);
    expect(result.failures).toEqual([{ rowIndex: 4, reason: 'bad_date' }]);
  });
});

describe('eşleştirme kuyruğu', () => {
  /** Referansı ekstredeki açıklamayla eşleşen, tahsil edilmemiş bir satış kurar. */
  async function unpaidSale(referenceNo: string, totalCents: number, daysAgo: number) {
    const { order } = await orders.create({ warehouseId, customerId, channel: 'b2c', totalCents }, [
      { variantId, qty: 1, fulfilledQty: 1, unitPriceCents: totalCents, vatRate: 5.5 },
    ]);
    await orders.update({ id: order.id, status: 'completed', referenceNo });
    await db.from('order_status_log').insert({
      order_id: order.id, from_status: 'draft', to_status: 'completed', created_at: `${dayOffset(-daysAgo)}T10:00:00.000Z`,
    });
    return order;
  }

  it('import edilen satır kuyruğa düşer; sınıflandırılmamış olarak durur', async () => {
    await importStatement();
    const queue = await matchQueue(bankAccount);

    expect(queue).toHaveLength(4);
    expect(queue.every((q) => q.movement.type === 'misc' && !q.movement.reconciled)).toBe(true);
  });

  it('referans açıklamada geçiyorsa güçlü ve TEK öneri çıkar', async () => {
    const reference = `LA-26-${stamp % 100000}`;
    const order = await unpaidSale(reference, 4590, 3);
    await importStatement([{ Date: frDate(-3), 'Libellé': `VIR SEPA ${reference}`, Montant: '45,90', Solde: '100,00' }], 'tek.csv');

    const row = (await matchQueue(bankAccount))[0]!;
    expect(row.suggestions[0]).toMatchObject({ orderId: order.id });
    expect(row.unambiguous).toBe(true);
  });

  it('PARA ÇIKIŞI için sipariş önerisi çıkmaz', async () => {
    await unpaidSale(`LA-26-X${stamp % 10000}`, 12_000, 2);
    await importStatement([{ Date: frDate(-2), 'Libellé': 'PRLV EDF', Montant: '-120,00', Solde: '0,00' }], 'gider.csv');

    expect((await matchQueue(bankAccount))[0]!.suggestions).toEqual([]);
  });

  it('onay uygulanınca para 12.2 kapısından geçer — İKİ KEZ sayılmaz', async () => {
    const reference = `LA-26-${(stamp + 1) % 100000}`;
    const order = await unpaidSale(reference, 4590, 3);
    await importStatement([{ Date: frDate(-3), 'Libellé': `VIR SEPA ${reference}`, Montant: '45,90', Solde: '100,00' }], 'onay.csv');
    const balanceBefore = (await accounts.balance(bankAccount)).balance;

    const row = (await matchQueue(bankAccount))[0]!;
    expect(await applyOrderMatch(row.movement.id, order.id)).toEqual({ status: 'ok', movementId: row.movement.id });

    // Sipariş tahsilatı yazıldı ve durumu türedi…
    expect(await orders.getById(order.id)).toMatchObject({ amountCollectedCents: 4590, paymentStatus: 'paid' });
    // …ama hesabın bakiyesi DEĞİŞMEDİ: import satırı yerini tahsilata bıraktı, para iki kez sayılmadı.
    expect((await accounts.balance(bankAccount)).balance).toBe(balanceBefore);
    expect(await matchQueue(bankAccount)).toEqual([]);
  });

  it('eşleşen satır YERİNDE güncellenir — ekstre yeniden yüklenirse para İKİ KEZ girmez', async () => {
    const reference = `LA-26-${(stamp + 3) % 100000}`;
    const order = await unpaidSale(reference, 4590, 3);
    const rows = [{ Date: frDate(-3), 'Libellé': `VIR SEPA ${reference}`, Montant: '45,90', Solde: '100,00' }];
    await importStatement(rows, 'yeniden.csv');

    const row = (await matchQueue(bankAccount))[0]!;
    await applyOrderMatch(row.movement.id, order.id);
    const balanceAfterMatch = (await accounts.balance(bankAccount)).balance;

    // Aynı dosya bir daha yüklenir: satırın parmak izi hâlâ yerinde olduğu için hiçbir şey girmez.
    const again = await importStatement(rows, 'yeniden-2.csv');
    expect(again.inserted).toBe(0);
    expect(again.duplicates).toBe(1);
    expect((await accounts.balance(bankAccount)).balance).toBe(balanceAfterMatch);
    expect(await orders.getById(order.id)).toMatchObject({ amountCollectedCents: 4590 });
  });

  it('aynı satır iki kez uygulanamaz', async () => {
    const reference = `LA-26-${(stamp + 2) % 100000}`;
    const order = await unpaidSale(reference, 4590, 3);
    await importStatement([{ Date: frDate(-3), 'Libellé': `VIR SEPA ${reference}`, Montant: '45,90', Solde: '100,00' }], 'iki-kez.csv');

    const row = (await matchQueue(bankAccount))[0]!;
    await applyOrderMatch(row.movement.id, order.id);
    expect(await applyOrderMatch(row.movement.id, order.id)).toEqual({ status: 'invalid', reason: 'already_reconciled' });
  });

  it('gider olarak sınıflanan satır kuyruktan düşer, hareket KALIR', async () => {
    await importStatement([{ Date: frDate(-2), 'Libellé': 'PRLV EDF', Montant: '-120,00', Solde: '0,00' }], 'kira.csv');
    const row = (await matchQueue(bankAccount))[0]!;

    expect(await classifyAsExpense(row.movement.id, 'elektrik')).toMatchObject({ status: 'ok' });
    expect(await movements.getById(row.movement.id)).toMatchObject({ type: 'expense', category: 'elektrik', reconciled: true });
    expect(await matchQueue(bankAccount)).toEqual([]);
  });

  it('"bağlanmıyor" denen satır da kuyruktan düşer ama parası kasada kalır', async () => {
    await importStatement([{ Date: frDate(-1), 'Libellé': 'FRAIS BANCAIRES', Montant: '-3,50', Solde: '0,00' }], 'masraf.csv');
    const row = (await matchQueue(bankAccount))[0]!;
    const balance = (await accounts.balance(bankAccount)).balance;

    expect(await dismissRow(row.movement.id)).toMatchObject({ status: 'ok' });
    expect(await matchQueue(bankAccount)).toEqual([]);
    expect((await accounts.balance(bankAccount)).balance).toBe(balance);
  });
});
