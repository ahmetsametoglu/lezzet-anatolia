import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '@lezzet/helper';
import type { Business } from '@lezzet/types';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { AccountService, CounterpartyService, MoneyDocumentService, MoneyMovementService } from './money.service';

/**
 * Para listeleri işe göre süzülür: hareketin işi bağından, belgenin işi kendisinden gelir; süzgeçsiz liste iki işi birlikte verir
 * (docs/feature/iki-is.md §2).
 */
const db = serviceDb();
const movements = new MoneyMovementService(db);
const documents = new MoneyDocumentService(db);
const stamp = Date.now();
/** Belgeler kimsenin yazmadığı geçmiş bir güne yazılır ki sayfa yalnız bu testin belgelerini görsün. */
const day = addDays('1950-01-01', stamp % 7000);
let accountId: string;
let qualiteCari: string;
const hareket: Record<Business, string> = { lezzet: '', qualite: '' };
const belge: Record<Business, string> = { lezzet: '', qualite: '' };

beforeAll(async () => {
  accountId = (await new AccountService(db).insert({ name: `İş listesi kasası ${stamp}`, type: 'cash' })).id;
  qualiteCari = (await new CounterpartyService(db).insert({ name: `İş listesi carisi ${stamp}`, defaultBusiness: 'qualite' })).id;
  // QUALITE carisine bağlı hareket QUALITE'nin, hiçbir bağı iş söylemeyen hareket Lezzet'indir.
  hareket.qualite = (
    await movements.insert({ accountId, direction: 'out', amountCents: 1500, type: 'expense', counterpartyId: qualiteCari })
  ).id;
  hareket.lezzet = (await movements.insert({ accountId, direction: 'out', amountCents: 900, type: 'expense' })).id;
  for (const business of ['lezzet', 'qualite'] as const) {
    belge[business] = (await documents.insert({ kind: 'invoice', business, issuedOn: day, direction: 'out', amountCents: 1200 })).id;
  }
});

afterAll(async () => {
  await purgeTestData(db, { accountIds: [accountId], documentIds: Object.values(belge), counterpartyIds: [qualiteCari] });
});

describe('Para listelerinin iş süzgeci', () => {
  it('hareket defteri hareketin işine göre süzülür', async () => {
    const satirlar = async (business?: Business) => (await movements.ledger({ accountId, business })).rows.map((row) => row.id).sort();
    expect(await satirlar('qualite')).toEqual([hareket.qualite]);
    expect(await satirlar('lezzet')).toEqual([hareket.lezzet]);
    expect(await satirlar()).toEqual([hareket.lezzet, hareket.qualite].sort());
  });

  it('belge listesi belgenin işine göre süzülür', async () => {
    const satirlar = async (business?: Business) =>
      (await documents.page({ from: day, to: day, business })).rows.map((row) => row.id).sort();
    expect(await satirlar('qualite')).toEqual([belge.qualite]);
    expect(await satirlar('lezzet')).toEqual([belge.lezzet]);
    expect(await satirlar()).toEqual([belge.lezzet, belge.qualite].sort());
  });
});
