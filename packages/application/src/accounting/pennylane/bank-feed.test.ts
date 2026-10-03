import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService,
  BankImportService,
  MoneyMovementService,
  PennylaneBankAccountService,
  PennylaneCursorService,
  serviceDb,
} from '@lezzet/database';
import { mustDelete, purgeTestData, settingsSnapshot } from '@lezzet/database/testing';
import type { AccountType, PennylaneCursor } from '@lezzet/types';
import { setMovementNature } from '../natures';
import { parisDateOf } from '@lezzet/helper';
import {
  PENNYLANE_LIVE_FROM_KEY,
  checkBankFeedQuiet,
  mapPennylaneBankAccount,
  pennylaneLiveFrom,
  setPennylaneLiveFrom,
  syncBankFeed,
} from './bank-feed';
import { memoryPennylane } from './memory-pennylane.testkit';

/*
  Pennylane'den banka hareketi okuması gerçek tablolar ve bellek içi Pennylane ile sınanır: aynı hareket iki kez yazılmaz, izahlı satıra
  dokunulmaz ve akışın kaçırdığı silinme liste yeniden okununca bulunur. Ayar ve akış imleci küreseldir, test sonunda geri konur.
*/

const db = serviceDb();
const stamp = Date.now();
const settings = settingsSnapshot(db);
const cursors = new PennylaneCursorService(db);
const movements = new MoneyMovementService(db);
const bankAccounts = new PennylaneBankAccountService(db);
let originalCursor: PennylaneCursor | null = null;

beforeAll(async () => {
  originalCursor = await cursors.find('transactions');
});

afterAll(async () => {
  await settings.restore();
  if (originalCursor) await cursors.save('transactions', originalCursor.processedAt);
  else await mustDelete(db, 'pennylane_cursor', (q) => q.eq('stream', 'transactions'));
});

let accountId: string;
let twin: ReturnType<typeof memoryPennylane>;
let bank: number;
let created: string[];
let twinAccounts: number[];

const accountOf = async (type: AccountType) => {
  const { id } = await new AccountService(db).insert({ name: `Pennylane testi ${stamp}-${Math.random()}`, type });
  created.push(id);
  return id;
};
const addBank = (name: string) => {
  const id = twin.addBankAccount(name);
  twinAccounts.push(id);
  return id;
};

beforeEach(async () => {
  // Her testin kendi Pennylane'i var; önceki testin akış anı yeni ikizin olaylarını süzmesin diye akış baştan kurulur.
  await cursors.save('transactions', '2000-01-01T00:00:00Z');
  await settings.override(PENNYLANE_LIVE_FROM_KEY, '2026-10-01');
  created = [];
  twinAccounts = [];
  twin = memoryPennylane();
  bank = addBank('Banque');
  accountId = await accountOf('bank');
  await bankAccounts.saveSeen(await twin.port.listBankAccounts(), twin.now());
  expect(await mapPennylaneBankAccount(db, { accountId, pennylaneId: bank })).toEqual({ status: 'ok' });
});

afterEach(async () => {
  // İkizin kimlikleri her testte aynıdır; eşlenmemiş satırı kalsa sonraki testin listesine karışırdı.
  await mustDelete(db, 'pennylane_bank_account', (q) => q.in('pennylane_id', twinAccounts));
  await purgeTestData(db, { accountIds: created });
});

const sync = () => syncBankFeed(db, twin.port, { now: new Date(twin.now()) });
const rowsOf = async () =>
  (await movements.listTouchingAccountSince(accountId, '2000-01-01')).sort((a, b) => a.amountCents - b.amountCents);
const out = (amountCents: number, label: string, date = '2026-10-02') => ({
  bankAccountId: bank,
  date,
  label,
  direction: 'out' as const,
  amountCents,
});
const alertsOf = async (movementId: string) => {
  const { data, error } = await db.from('notification').select('id, payload').eq('kind', 'bank_feed_changed');
  if (error) throw error;
  return ((data ?? []) as Array<{ payload: { movementId?: string; change?: string } }>).filter(
    (row) => row.payload.movementId === movementId,
  );
};

describe('Pennylane banka hareketi okuması', () => {
  it('ilk tur hareketleri canlıya geçiş gününden itibaren bir kez yazar; önceki gün, sıfır tutar ve eşlenmemiş hesap yazılmaz', async () => {
    twin.add(out(50_000, 'VIR FOURNISSEUR'));
    twin.add({ bankAccountId: bank, date: '2026-10-02', label: 'VIR CLIENT', direction: 'in', amountCents: 25_000 });
    twin.add(out(9_900, 'ESKI', '2026-09-30'));
    twin.add(out(0, 'SIFIR'));
    const other = addBank('Autre');
    twin.add({ ...out(7_700, 'BASKA HESAP'), bankAccountId: other });

    expect(await sync()).toMatchObject({ listed: 1, inserted: 2 });
    expect(
      (await rowsOf()).map(({ direction, amountCents, valueDate, description, source, type, reconciled, explained }) => ({
        direction,
        amountCents,
        valueDate,
        description,
        source,
        type,
        reconciled,
        explained,
      })),
    ).toEqual([
      {
        direction: 'in',
        amountCents: 25_000,
        valueDate: '2026-10-02',
        description: 'VIR CLIENT',
        source: 'bank_import',
        type: 'misc',
        reconciled: false,
        explained: false,
      },
      {
        direction: 'out',
        amountCents: 50_000,
        valueDate: '2026-10-02',
        description: 'VIR FOURNISSEUR',
        source: 'bank_import',
        type: 'misc',
        reconciled: false,
        explained: false,
      },
    ]);

    // Liste yeniden okunsa da aynı hareket ikinci kez yazılmaz.
    await bankAccounts.markListed([accountId], null);
    expect(await sync()).toMatchObject({ listed: 1, inserted: 0 });
    expect(await rowsOf()).toHaveLength(2);

    // Akıştan gelen yeni hareket yazılır, eşlenmemiş hesabınki yazılmaz.
    twin.add(out(12_000, 'CB AKISTAN'));
    twin.add({ ...out(8_800, 'BASKA HESAP 2'), bankAccountId: other });
    expect(await sync()).toMatchObject({ listed: 0, inserted: 1 });
    expect((await rowsOf()).map((row) => row.description)).toEqual(['CB AKISTAN', 'VIR CLIENT', 'VIR FOURNISSEUR']);
  });

  it("izahsız satır Pennylane'in hâline çekilir; izahlı satıra dokunulmaz ve muhasebe bir kez uyarılır", async () => {
    const a = twin.add(out(50_000, 'VIR A'));
    const b = twin.add(out(30_000, 'LOYER'));
    await sync();
    const [rowB, rowA] = await rowsOf();
    expect(await setMovementNature(db, { movementId: rowB!.id, nature: 'kira' })).toMatchObject({ status: 'ok' });

    twin.change(a, { amountCents: 49_000, label: 'VIR A CORRIGE' });
    twin.change(b, { amountCents: 31_000 });
    expect(await sync()).toMatchObject({ updated: 1, alerted: 1 });

    expect(await movements.getById(rowA!.id)).toMatchObject({ amountCents: 49_000, description: 'VIR A CORRIGE' });
    expect(await movements.getById(rowB!.id)).toMatchObject({ amountCents: 30_000, nature: 'kira', explained: true });
    const alerts = await alertsOf(rowB!.id);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.every((row) => row.payload.change === 'changed')).toBe(true);

    // Akış aynı olayı yeniden getirse de uyarı tekrar etmez.
    await cursors.save('transactions', '2026-10-01T08:00:00Z');
    expect(await sync()).toMatchObject({ alerted: 0 });
    expect(await alertsOf(rowB!.id)).toHaveLength(alerts.length);
  });

  it("Pennylane'de silinen izahsız satır silinir; izahlı satır kalır ve uyarılır", async () => {
    const a = twin.add(out(50_000, 'VIR A'));
    const b = twin.add(out(30_000, 'LOYER'));
    await sync();
    const [rowB, rowA] = await rowsOf();
    await setMovementNature(db, { movementId: rowB!.id, nature: 'kira' });

    twin.remove(a);
    twin.remove(b);
    expect(await sync()).toMatchObject({ removed: 1, alerted: 1 });
    expect(await movements.getById(rowA!.id)).toBeNull();
    expect(await movements.getById(rowB!.id)).toMatchObject({ explained: true });
    expect((await alertsOf(rowB!.id)).every((row) => row.payload.change === 'removed')).toBe(true);
  });

  it('akışın kapsamadığı uzun boşluktan sonra liste baştan okunur ve akışın kaçırdığı silinme bulunur', async () => {
    const a = twin.add(out(50_000, 'VIR A'));
    twin.add(out(30_000, 'VIR B'));
    await sync();
    const [, rowA] = await rowsOf();

    twin.remove(a, { silently: true });
    await cursors.save('transactions', new Date(Date.parse(twin.now()) - 30 * 86_400_000).toISOString());
    expect(await sync()).toMatchObject({ listed: 1, removed: 1 });
    expect(await movements.getById(rowA!.id)).toBeNull();
    expect(await rowsOf()).toHaveLength(1);
  });

  it('eşikten uzun süre hareket gelmeyen eşlenmiş hesap için muhasebe uyarılır, eşik içinde uyarı olmaz', async () => {
    const today = parisDateOf(new Date());
    const dayAfter = (n: number) => new Date(Date.parse(`${today}T10:00:00Z`) + n * 86_400_000);
    twin.add(out(50_000, 'VIR A', today));
    await sync();

    expect(await checkBankFeedQuiet(db, { now: dayAfter(4) })).toMatchObject({ quiet: 0, quietDays: 4 });
    expect(await checkBankFeedQuiet(db, { now: dayAfter(5) })).toMatchObject({ quiet: 1 });
    const { data, error } = await db.from('notification').select('payload').eq('kind', 'bank_feed_quiet');
    if (error) throw error;
    const mine = ((data ?? []) as Array<{ payload: { accountId?: string; lastDate?: string } }>).filter(
      (row) => row.payload.accountId === accountId,
    );
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((row) => row.payload.lastDate === today)).toBe(true);
  });

  it("hesap listesi okuma kapalıyken de yazılır; Pennylane'den düşen eşli hesap okunmaz ve satırları silinmiş sayılmaz", async () => {
    twin.add(out(50_000, 'VIR A'));
    expect(await sync()).toMatchObject({ company: 'Test şirketi', mode: 'sandbox', inserted: 1 });

    // Kart, canlıya geçmeden önce eşlemeyi bu listeden kurar.
    await settings.remove(PENNYLANE_LIVE_FROM_KEY);
    const livret = addBank('Livret');
    expect(await sync()).toEqual({ skipped: 'not_live', company: 'Test şirketi', mode: 'sandbox' });
    expect(await bankAccounts.findByPennylaneId(livret)).toMatchObject({ name: 'Livret', accountId: null });

    // Düşen hesabın hareket listesi boş gelir; okunsaydı bütün satırları Pennylane'de silinmiş sayılırdı.
    await settings.override(PENNYLANE_LIVE_FROM_KEY, '2026-10-01');
    twin.removeBankAccount(bank);
    await bankAccounts.markListed([accountId], null);
    expect(await sync()).toMatchObject({ skipped: 'no_accounts' });
    expect(await rowsOf()).toHaveLength(1);
    expect(await bankAccounts.findByAccount(accountId)).toMatchObject({ pennylaneId: bank });
  });
});

describe('Pennylane eşlemesi ve canlıya geçiş günü', () => {
  /** Dosyadan yüklenmiş banka satırı: yükleme kaydına bağlıdır. */
  const fileRow = async (account: string, valueDate: string) => {
    const batch = await new BankImportService(db).insert({ accountId: account, profileId: null, fileName: 'ekstre.csv' });
    await movements.insertImported([
      {
        accountId: account,
        direction: 'out',
        amountCents: 1_000,
        type: 'misc',
        description: 'DOSYA',
        valueDate,
        source: 'bank_import',
        reconciled: false,
        importFingerprint: `dosya:${valueDate}:${Math.random()}`,
        bankImportId: batch.id,
      },
    ]);
  };

  it('banka dışı hesap ve başka hesaba eşli Pennylane hesabı eşlenmez; taşınan eşleme eskisini boşaltır ve liste baştan okunur', async () => {
    const cash = await accountOf('cash');
    const second = await accountOf('bank');
    const livret = addBank('Livret');
    await bankAccounts.saveSeen(await twin.port.listBankAccounts(), twin.now());

    expect(await mapPennylaneBankAccount(db, { accountId: cash, pennylaneId: livret })).toEqual({
      status: 'invalid',
      reason: 'not_bank_account',
    });
    expect(await mapPennylaneBankAccount(db, { accountId: second, pennylaneId: bank })).toEqual({
      status: 'invalid',
      reason: 'pennylane_account_taken',
    });
    expect(await mapPennylaneBankAccount(db, { accountId: second, pennylaneId: -1 })).toEqual({
      status: 'invalid',
      reason: 'unknown_pennylane_account',
    });
    expect(await bankAccounts.findByPennylaneId(bank)).toMatchObject({ accountId });

    // Aynı eşlemeyi yeniden kaydetmek ret değildir ve okunmuş listeyi baştan açmaz.
    await sync();
    expect(await mapPennylaneBankAccount(db, { accountId, pennylaneId: bank })).toEqual({ status: 'ok' });
    expect((await bankAccounts.findByAccount(accountId))?.listedAt).not.toBeNull();
    expect(await mapPennylaneBankAccount(db, { accountId, pennylaneId: livret })).toEqual({ status: 'ok' });
    expect(await bankAccounts.findByPennylaneId(bank)).toMatchObject({ accountId: null, mappedAt: null, listedAt: null });
    expect(await bankAccounts.findByPennylaneId(livret)).toMatchObject({ accountId, listedAt: null });
  });

  it('dosyadan yüklenen satırı canlıya geçiş gününe düşen hesap eşlenmez; gün de eşli hesabın son dosya satırına ya da öncesine alınamaz', async () => {
    const second = await accountOf('bank');
    const livret = addBank('Livret');
    await bankAccounts.saveSeen(await twin.port.listBankAccounts(), twin.now());
    await fileRow(second, '2026-10-01');
    expect(await mapPennylaneBankAccount(db, { accountId: second, pennylaneId: livret })).toEqual({
      status: 'invalid',
      reason: 'file_rows_after_live',
      accountId: second,
      lastFileDate: '2026-10-01',
    });
    expect(await bankAccounts.findByPennylaneId(livret)).toMatchObject({ accountId: null });

    // Gerçek verinin dosya satırı bu kadar ileri düşmez; ret yalnız testin hesabından gelebilir.
    await fileRow(accountId, '2099-01-10');
    expect(await setPennylaneLiveFrom(db, '2099-01-10')).toEqual({
      status: 'invalid',
      reason: 'file_rows_after_live',
      accountId,
      lastFileDate: '2099-01-10',
    });
    expect(await pennylaneLiveFrom(db)).toBe('2026-10-01');
    expect(await setPennylaneLiveFrom(db, '2099-01-11')).toEqual({ status: 'ok' });
    expect(await pennylaneLiveFrom(db)).toBe('2099-01-11');
  });
});
