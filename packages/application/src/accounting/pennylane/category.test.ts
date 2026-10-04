import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService,
  MoneyDocumentService,
  MoneyMovementService,
  PennylaneBankAccountService,
  PennylaneCursorService,
  PennylaneTransactionService,
  SupplierService,
  serviceDb,
} from '@lezzet/database';
import { mustDelete, purgeTestData, settingsSnapshot } from '@lezzet/database/testing';
import { PENNYLANE_CATEGORY_KEYS } from '@lezzet/domain-core';
import type { PennylaneCursor } from '@lezzet/types';
import { allocateToDocument } from '../document';
import { PENNYLANE_LIVE_FROM_KEY, mapPennylaneBankAccount, syncBankFeed } from './bank-feed';
import { categoryResolver, writeTransactionCategory } from './category';
import { memoryPennylane } from './memory-pennylane.testkit';

/*
  Banka işleminin Pennylane kategorisi gerçek tablolar, bellek içi Pennylane ve banka akışıyla sınanır. Bekleyen küme küresel olduğu
  için testler yalnız kendi işlemlerini yazar; ayar ve akış imleci test sonunda geri konur.
*/

const db = serviceDb();
const stamp = Date.now();
const LIVE_FROM = '2026-10-01';
const settings = settingsSnapshot(db);
const cursors = new PennylaneCursorService(db);
const transactions = new PennylaneTransactionService(db);
const movements = new MoneyMovementService(db);
let originalCursor: PennylaneCursor | null = null;

beforeAll(async () => {
  originalCursor = await cursors.find('transactions');
});

afterAll(async () => {
  await settings.restore();
  if (originalCursor) await cursors.save('transactions', originalCursor.processedAt);
  else await mustDelete(db, 'pennylane_cursor', (q) => q.eq('stream', 'transactions'));
});

let twin: ReturnType<typeof memoryPennylane>;
let bank: number;
let accountId: string;
let created: { documentIds: string[]; supplierIds: string[]; accountIds: string[] };

beforeEach(async () => {
  await cursors.save('transactions', '2000-01-01T00:00:00Z');
  await settings.override(PENNYLANE_LIVE_FROM_KEY, LIVE_FROM);
  await settings.override(PENNYLANE_CATEGORY_KEYS.lezzet, 'Lezzet');
  await settings.override(PENNYLANE_CATEGORY_KEYS.qualite, 'QUALITE');
  created = { documentIds: [], supplierIds: [], accountIds: [] };
  twin = memoryPennylane();
  bank = twin.addBankAccount('Revolut');
  accountId = (await new AccountService(db).insert({ name: `Pennylane kategori ${stamp}-${Math.random()}`, type: 'bank' })).id;
  created.accountIds.push(accountId);
  await new PennylaneBankAccountService(db).saveSeen(await twin.port.listBankAccounts(), twin.now());
  expect(await mapPennylaneBankAccount(db, { accountId, pennylaneId: bank })).toEqual({ status: 'ok' });
});

afterEach(async () => {
  await mustDelete(db, 'pennylane_bank_account', (q) => q.eq('pennylane_id', bank));
  await purgeTestData(db, created);
});

/** Pennylane'de bir kart harcaması; banka akışı onu bizde satır ve ayna olarak açar. */
const imported = async () => {
  const pennylaneId = twin.add({ bankAccountId: bank, date: '2026-10-02', label: 'CB TOTAL', direction: 'out', amountCents: 2_000 });
  await syncBankFeed(db, twin.port, { now: new Date(twin.now()) });
  const mirror = (await transactions.findByPennylaneId(pennylaneId))!;
  return { pennylaneId, mirror, movement: (await movements.getById(mirror.movementId!))! };
};
const write = (pennylaneId: number, business: 'lezzet' | 'qualite') =>
  writeTransactionCategory(db, twin.port, { pennylaneId, business }, categoryResolver(db, twin.port));
const categoryOf = (label: string) => twin.categories().find((row) => row.label === label)!;

describe('banka işleminin Pennylane kategorisi', () => {
  it('işleme hareketin işinin kategorisi yazılır; hareketin işi değişince işlem bekleyen kümeye döner ve kategorisi yeniden yazılır', async () => {
    const { pennylaneId, mirror, movement } = await imported();
    expect(mirror.categoryBusiness).toBeNull();
    expect(movement.business).toBe('lezzet');
    expect(await write(pennylaneId, movement.business)).toBe(true);
    const lezzet = categoryOf('Lezzet');
    expect(twin.transactionCategoriesOf(pennylaneId)).toEqual([{ id: lezzet.id, groupId: lezzet.groupId, weight: 1 }]);
    expect(await transactions.findByPennylaneId(pennylaneId)).toMatchObject({ categoryBusiness: 'lezzet' });

    const supplierId = (await new SupplierService(db).insert({ name: `Fournisseur ${stamp}-${Math.random()}` })).id;
    created.supplierIds.push(supplierId);
    const document = await new MoneyDocumentService(db).insert({
      kind: 'invoice',
      business: 'qualite',
      issuedOn: '2026-10-02',
      direction: 'out',
      supplierId,
      amountCents: 2_000,
      vatRegime: 'exempt',
    });
    created.documentIds.push(document.id);
    expect(await allocateToDocument(db, { movementId: movement.id, documentId: document.id })).toMatchObject({ status: 'ok' });
    expect(await transactions.findByPennylaneId(pennylaneId)).toMatchObject({ categoryBusiness: null });

    expect(await write(pennylaneId, 'qualite')).toBe(true);
    const qualite = categoryOf('QUALITE');
    expect(twin.transactionCategoriesOf(pennylaneId)).toEqual([{ id: qualite.id, groupId: qualite.groupId, weight: 1 }]);
  });

  it("Pennylane'de elle değiştirilen işlem kategorisi, hareketin işi değişmedikçe bekleyen kümeye dönmez", async () => {
    const { pennylaneId, movement } = await imported();
    await write(pennylaneId, 'lezzet');
    const manual = await twin.port.createCategory({ label: 'Grossiste', groupId: categoryOf('Lezzet').groupId });
    await twin.port.writeCategories({ kind: 'transaction', id: pennylaneId }, [{ id: manual.id, weight: 1 }]);

    await movements.update({ id: movement.id, description: 'açıklama değişti' });
    expect(await transactions.findByPennylaneId(pennylaneId)).toMatchObject({ categoryBusiness: 'lezzet' });
    expect((await transactions.listCategoryDue(500)).map((row) => row.pennylaneId)).not.toContain(pennylaneId);
    expect(twin.transactionCategoriesOf(pennylaneId)).toEqual([{ id: manual.id, groupId: manual.groupId, weight: 1 }]);
  });

  it('başka harekete bağlanan işlem kategorisi yeniden yazılmak üzere bekler', async () => {
    const { pennylaneId } = await imported();
    await write(pennylaneId, 'lezzet');
    const other = await movements.insert({ accountId, direction: 'out', amountCents: 2_000, type: 'expense', description: 'başka satır' });
    // Kategorinin işi yazımda verilmez; upsert onu korurdu, boşaltan bağ değişimidir.
    const current = (await transactions.findByPennylaneId(pennylaneId))!;
    await transactions.save({
      pennylaneId,
      accountId: current.accountId,
      movementId: other.id,
      valueDate: current.valueDate,
      direction: current.direction,
      amountCents: current.amountCents,
      label: current.label,
      removed: current.removed,
    });
    expect(await transactions.findByPennylaneId(pennylaneId)).toMatchObject({ movementId: other.id, categoryBusiness: null });
  });

  it('ayar boşsa işleme kategori yazılmaz ama satır bekleyen kümeden çıkar', async () => {
    await settings.override(PENNYLANE_CATEGORY_KEYS.lezzet, '');
    const { pennylaneId } = await imported();
    expect(await write(pennylaneId, 'lezzet')).toBe(false);
    expect(twin.transactionCategoriesOf(pennylaneId)).toEqual([]);
    expect(await transactions.findByPennylaneId(pennylaneId)).toMatchObject({ categoryBusiness: 'lezzet' });
  });
});
