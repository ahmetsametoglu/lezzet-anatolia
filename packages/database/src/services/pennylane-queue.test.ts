import { afterAll, describe, expect, it } from 'vitest';
import type { MoneyDocumentInsert } from '@lezzet/types';
import { serviceDb } from '../client';
import { mustDelete, purgeTestData } from '../testing/cleanup';
import { AccountService, MoneyAllocationService, MoneyDocumentService, MoneyMovementService } from './money.service';
import { PennylaneDocumentService, PennylaneQueueService } from './pennylane.service';

/*
  Pennylane belge kuyruğunun tetikleyicileri: hangi belge yazımı ve hangi bağ değişikliği kuyruğa düşer, yüklenmiş belge silinebilir mi.
*/

const db = serviceDb();
const stamp = Date.now();
const documents = new MoneyDocumentService(db);
const queue = new PennylaneQueueService(db);
const created = { documentIds: [] as string[], accountIds: [] as string[] };

afterAll(async () => {
  await purgeTestData(db, created);
});

const document = async (over: Partial<MoneyDocumentInsert> = {}) => {
  const row = await documents.insert({
    kind: 'invoice',
    business: 'lezzet',
    direction: 'out',
    issuedOn: '2026-10-02',
    amountCents: 1_000,
    ...over,
  });
  created.documentIds.push(row.id);
  return row;
};
const marked = async (documentId: string) => (await queue.findByDocument(documentId)) !== null;
const unmark = (documentId: string) => mustDelete(db, 'pennylane_queue', (q) => q.eq('document_id', documentId));

describe('Pennylane belge kuyruğu', () => {
  it('ödeyeceğimiz fatura ve fiş yazılınca kuyruğa düşer; alacak belgesi ve sözleşme düşmez', async () => {
    expect(await marked((await document()).id)).toBe(true);
    expect(await marked((await document({ kind: 'receipt' })).id)).toBe(true);
    expect(await marked((await document({ direction: 'in' })).id)).toBe(false);
    expect(await marked((await document({ kind: 'contract' })).id)).toBe(false);
  });

  it('alış belgesiyken türü değişen belge de kuyruğa düşer, Pennylane faturası sahipsiz kalmasın', async () => {
    const row = await document();
    await unmark(row.id);
    await documents.update({ id: row.id, kind: 'contract' });
    expect(await marked(row.id)).toBe(true);
  });

  it('bağ yalnız yüklenmiş belgeyi kuyruğa düşürür; yüklenmiş belge silinemez', async () => {
    const account = await new AccountService(db).insert({ name: `Pennylane kuyruğu ${stamp}`, type: 'cash' });
    created.accountIds.push(account.id);
    const movement = await new MoneyMovementService(db).insert({
      accountId: account.id,
      direction: 'out',
      amountCents: 1_000,
      type: 'misc',
    });
    const allocations = new MoneyAllocationService(db);
    const row = await document();
    await unmark(row.id);

    await allocations.insert({ movementId: movement.id, documentId: row.id, amountCents: 400 });
    expect(await marked(row.id)).toBe(false);

    await new PennylaneDocumentService(db).save({
      documentId: row.id,
      pennylaneInvoiceId: 990_000_000_000 + (stamp % 1_000_000),
      written: {
        supplierId: 1,
        date: '2026-10-02',
        deadline: '2026-10-02',
        invoiceNumber: null,
        externalReference: `doc:${row.id}`,
        lines: [{ grossCents: 1_000, vatCents: 0, vatCode: 'exempt' }],
      },
    });
    await allocations.remove(movement.id, row.id);
    expect(await marked(row.id)).toBe(true);
    await expect(documents.delete(row.id)).rejects.toThrow(/pennylane_document/);
  });
});
