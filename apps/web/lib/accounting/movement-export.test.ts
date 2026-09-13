import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountService, CounterpartyService, MoneyAllocationService, MoneyDocumentService, MoneyMovementService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { buildMovementExport, toMovementCsv } from './movement-export';

/**
 * Hareket dökümü (12.15 · 13.09) — DB üstünde. Doğrulanan şey satır kurma kuralı değil (o motorda),
 * OKUMA: dönemin hareketleri türü, hesap kodu, carisi, belgesi (bağ tablosundan) ve hesabıyla tek
 * dosyada; transfer tek satır; dönem dışı hareket yok; izahsız satır dosyada var ve işaretli.
 */
const db = serviceDb();
const stamp = Date.now();
const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** Seed'in ve öteki testlerin dokunmadığı geçmiş bir pencere — döküm şirket genelini okur. */
const PERIOD = { from: dayOffset(-260), to: dayOffset(-240) };

let bankAccount: string;
let cashAccount: string;
let landlord: string;
const createdDocuments: string[] = [];

beforeAll(async () => {
  const accounts = new AccountService(db);
  bankAccount = (await accounts.insert({ name: `Döküm bankası ${stamp}`, type: 'bank' })).id;
  cashAccount = (await accounts.insert({ name: `Döküm kasası ${stamp}`, type: 'cash' })).id;
  landlord = (await new CounterpartyService(db).insert({ name: `SCI Test ${stamp}`, kind: 'service' })).id;
});

afterAll(async () => {
  await purgeTestData(db, { accountIds: [bankAccount, cashAccount], documentIds: createdDocuments, counterpartyIds: [landlord] });
});

describe('hareket dökümü', () => {
  it('dönemin hareketleri tür, kod, cari ve belgeyle; transfer tek satır; izahsız işaretli; dönem dışı yok', async () => {
    const belge = await new MoneyDocumentService(db).insert({
      kind: 'invoice', number: `LOYER-${stamp}`, issuedOn: dayOffset(-255), counterpartyId: landlord, direction: 'out', nature: 'kira',
      amountCents: 145_000, vatAmountCents: 0,
    });
    createdDocuments.push(belge.id);
    const movements = new MoneyMovementService(db);
    const kira = await movements.insert({ accountId: bankAccount, direction: 'out', amountCents: 145_000, type: 'expense', nature: 'kira', valueDate: dayOffset(-250), description: 'Kira' });
    await new MoneyAllocationService(db).insert({ movementId: kira.id, documentId: belge.id, amountCents: 145_000 });
    const transfer = await movements.insert({ accountId: cashAccount, counterAccountId: bankAccount, direction: 'out', amountCents: 60_000, type: 'transfer', valueDate: dayOffset(-248), description: 'Yatırma' });
    const izahsiz = await movements.insert({ accountId: bankAccount, direction: 'out', amountCents: 450, type: 'misc', valueDate: dayOffset(-245), description: 'FRAIS' });
    // Dönem DIŞI: dökümde görünmemeli.
    await movements.insert({ accountId: bankAccount, direction: 'in', amountCents: 100, type: 'capital', nature: 'sermaye', valueDate: dayOffset(-230) });

    const data = await buildMovementExport(PERIOD);
    const ids = data.rows.map((row) => row.movementId);
    expect(ids).toEqual([kira.id, transfer.id, izahsiz.id]);

    // Tür okunur adıyla ve hesap planı koduyla; karşı taraf bağlı belgenin carisi.
    expect(data.rows[0]).toMatchObject({
      account: `Döküm bankası ${stamp}`, amount: -1450, nature: 'Kira', accountCode: '613', tags: '', documentKind: 'invoice', documentNo: `LOYER-${stamp}`,
      documentTotal: 1450, documentVat: 0, counterparty: `SCI Test ${stamp}`, explained: true,
    });
    // Transfer gönderenin gözünden TEK satır: karşı hesap ayrı sütunda, defterdeki iki satır dökümde bir.
    expect(data.rows[1]).toMatchObject({ account: `Döküm kasası ${stamp}`, counterAccount: `Döküm bankası ${stamp}`, amount: -600, counterparty: `Döküm bankası ${stamp}` });
    expect(data.rows[2]).toMatchObject({ explained: false, nature: null, accountCode: null });
    expect(data.summary).toMatchObject({ movementCount: 3, out: 2054.5, in: 0, unexplainedCount: 1 });

    const csv = toMovementCsv(data);
    expect(csv.split('\n')[0]).toBe(
      'Tarih;Hesap;Karşı hesap;Tip;Tür;Hesap kodu;Tutar;Karşı taraf;Belge türü;Belge no;Belge tarihi;Belge toplamı;Belge KDV;Etiketler;Açıklama;Kaynak;İzah;Hareket kimliği',
    );
    expect(csv).toContain(`;gider;Kira;613;`);
    expect(csv).toContain(`Fatura;LOYER-${stamp};`);
    expect(csv).toContain('TOPLAM;3 hareket;;;giriş 0;çıkış 2054.5');
    expect(csv).toContain('İZAHSIZ;1 hareket');
  });
});
