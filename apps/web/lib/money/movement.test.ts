import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountService, MoneyMovementService, serviceDb } from '@lezzet/database';
import { recordMovement, transfer } from './movement';

/**
 * Para hareketi kapısı (12.1). Motorun kararı ile servisin yazımının doğru bağlandığı doğrulanır:
 * anlamsız hareket **yazılmadan** reddediliyor mu, geçerli olan defterde doğru işaretle mi duruyor.
 */
const db = serviceDb();
const accounts = new AccountService(db);
const movements = new MoneyMovementService(db);

const stamp = Date.now();
const acilanlar: string[] = [];
let cashAccount: string;
let bankAccount: string;

beforeAll(async () => {
  cashAccount = (await accounts.insert({ name: `Kapı kasası ${stamp}`, type: 'cash' })).id;
  bankAccount = (await accounts.insert({ name: `Kapı bankası ${stamp}`, type: 'bank' })).id;
  acilanlar.push(cashAccount, bankAccount);
});

afterAll(async () => {
  for (const id of acilanlar) {
    await db.from('money_movement').delete().eq('account_id', id);
    await db.from('money_movement').delete().eq('counter_account_id', id);
  }
  for (const id of acilanlar) await db.from('account').delete().eq('id', id);
});

describe('elle hareket girişi', () => {
  it('geçerli gider yazılır', async () => {
    const result = await recordMovement({ accountId: cashAccount, direction: 'out', amount: 120, type: 'expense', category: 'akaryakıt' });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.movement.category).toBe('akaryakıt');
  });

  it('tipin yönüne uymayan hareket YAZILMADAN reddedilir', async () => {
    const before = (await accounts.balance(cashAccount)).movementCount;
    // "Gider" deyip parayı içeri almak: veritabanı için geçerli, rapor için yalan.
    const result = await recordMovement({ accountId: cashAccount, direction: 'in', amount: 50, type: 'expense' });

    expect(result).toMatchObject({ status: 'invalid', reason: 'direction_mismatch' });
    expect((await accounts.balance(cashAccount)).movementCount).toBe(before); // tek satır bile yazılmadı
  });

  it('siparişsiz sipariş tahsilatı reddedilir — cache o bağdan türetilecek (12.2)', async () => {
    expect(await recordMovement({ accountId: cashAccount, direction: 'in', amount: 30, type: 'order_payment' })).toMatchObject({
      status: 'invalid',
      reason: 'order_link_missing',
    });
  });

  it('bağsız stok alımı reddedilir — tedarikçi borcu bu bağdan türetilecek (12.3)', async () => {
    expect(await recordMovement({ accountId: cashAccount, direction: 'out', amount: 300, type: 'purchase' })).toMatchObject({
      status: 'invalid',
      reason: 'supply_link_missing',
    });
  });
});

describe('transfer', () => {
  it('tek satır yazar, iki hesabı simetrik etkiler', async () => {
    const cashBefore = (await accounts.balance(cashAccount)).balance;
    const bankBefore = (await accounts.balance(bankAccount)).balance;

    const result = await transfer({ fromAccountId: cashAccount, toAccountId: bankAccount, amount: 200, description: 'Günlük yatırma' });
    expect(result.status).toBe('ok');

    expect((await accounts.balance(cashAccount)).balance).toBe(cashBefore - 200);
    expect((await accounts.balance(bankAccount)).balance).toBe(bankBefore + 200);
    if (result.status !== 'ok') return;
    expect(await movements.getById(result.movement.id)).toMatchObject({ type: 'transfer', direction: 'out', counterAccountId: bankAccount });
  });

  it('kendine transfer reddedilir', async () => {
    expect(await transfer({ fromAccountId: cashAccount, toAccountId: cashAccount, amount: 10 })).toMatchObject({
      status: 'invalid',
      reason: 'transfer_same_account',
    });
  });
});
