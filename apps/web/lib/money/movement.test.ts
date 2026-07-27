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

const damga = Date.now();
const acilanlar: string[] = [];
let kasa: string;
let banka: string;

beforeAll(async () => {
  kasa = (await accounts.insert({ name: `Kapı kasası ${damga}`, type: 'cash' })).id;
  banka = (await accounts.insert({ name: `Kapı bankası ${damga}`, type: 'bank' })).id;
  acilanlar.push(kasa, banka);
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
    const sonuc = await recordMovement({ accountId: kasa, direction: 'out', amount: 120, type: 'expense', category: 'akaryakıt' });
    expect(sonuc.status).toBe('ok');
    if (sonuc.status !== 'ok') return;
    expect(sonuc.movement.category).toBe('akaryakıt');
  });

  it('tipin yönüne uymayan hareket YAZILMADAN reddedilir', async () => {
    const once = (await accounts.balance(kasa)).movementCount;
    // "Gider" deyip parayı içeri almak: veritabanı için geçerli, rapor için yalan.
    const sonuc = await recordMovement({ accountId: kasa, direction: 'in', amount: 50, type: 'expense' });

    expect(sonuc).toMatchObject({ status: 'invalid', reason: 'direction_mismatch' });
    expect((await accounts.balance(kasa)).movementCount).toBe(once); // tek satır bile yazılmadı
  });

  it('siparişsiz sipariş tahsilatı reddedilir — cache o bağdan türetilecek (12.2)', async () => {
    expect(await recordMovement({ accountId: kasa, direction: 'in', amount: 30, type: 'order_payment' })).toMatchObject({
      status: 'invalid',
      reason: 'order_link_missing',
    });
  });

  it('bağsız stok alımı reddedilir — tedarikçi borcu bu bağdan türetilecek (12.3)', async () => {
    expect(await recordMovement({ accountId: kasa, direction: 'out', amount: 300, type: 'purchase' })).toMatchObject({
      status: 'invalid',
      reason: 'supply_link_missing',
    });
  });
});

describe('transfer', () => {
  it('tek satır yazar, iki hesabı simetrik etkiler', async () => {
    const kasaOnce = (await accounts.balance(kasa)).balance;
    const bankaOnce = (await accounts.balance(banka)).balance;

    const sonuc = await transfer({ fromAccountId: kasa, toAccountId: banka, amount: 200, description: 'Günlük yatırma' });
    expect(sonuc.status).toBe('ok');

    expect((await accounts.balance(kasa)).balance).toBe(kasaOnce - 200);
    expect((await accounts.balance(banka)).balance).toBe(bankaOnce + 200);
    if (sonuc.status !== 'ok') return;
    expect(await movements.getById(sonuc.movement.id)).toMatchObject({ type: 'transfer', direction: 'out', counterAccountId: banka });
  });

  it('kendine transfer reddedilir', async () => {
    expect(await transfer({ fromAccountId: kasa, toAccountId: kasa, amount: 10 })).toMatchObject({
      status: 'invalid',
      reason: 'transfer_same_account',
    });
  });
});
