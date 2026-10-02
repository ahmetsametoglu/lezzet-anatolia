import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountService, serviceDb } from '@lezzet/database';
import { purgeTestData, settingsSnapshot } from '@lezzet/database/testing';
import { readDoorAccountId, readDoorCollection } from './door-account';

/** Kapı hesapları küresel tekil ayardır: her test kendi penceresini açıp bulduğu hâli geri koyar (CLAUDE §4b). */
const db = serviceDb();
const stamp = Date.now();
let cashAccountId: string;
let cardAccountId: string;

beforeAll(async () => {
  cashAccountId = (await new AccountService(db).insert({ name: `Kapı kasası ${stamp}`, type: 'cash' })).id;
  cardAccountId = (await new AccountService(db).insert({ name: `Kart cihazı ${stamp}`, type: 'provider' })).id;
});

afterAll(async () => {
  await purgeTestData(db, { accountIds: [cashAccountId, cardAccountId] });
});

describe('kapı hesabı', () => {
  it('her yöntem kendi ayarını okur; online ve havale kapı hesabına düşmez', async () => {
    const settings = settingsSnapshot(db);
    await settings.override('door_cash_account_id', cashAccountId);
    await settings.override('door_card_account_id', cardAccountId);

    try {
      expect(await readDoorAccountId(db, 'cash')).toBe(cashAccountId);
      expect(await readDoorAccountId(db, 'card')).toBe(cardAccountId);
      expect(await readDoorAccountId(db, 'online')).toBeNull();
      expect(await readDoorAccountId(db, 'bank_transfer')).toBeNull();
    } finally {
      await settings.restore();
    }
  });

  it('ayarı olmayan yöntem kapalıdır, öteki açık kalır', async () => {
    const settings = settingsSnapshot(db);
    await settings.override('door_cash_account_id', cashAccountId);
    await settings.remove('door_card_account_id');

    try {
      expect(await readDoorCollection(db)).toEqual({ cash: true, card: false });
    } finally {
      await settings.restore();
    }
  });

  it('ayar hesap kimliği değilse null — para olmayan bir hesaba yazılmaz', async () => {
    // Ayar elle yazılabilir bir jsonb; operatör oraya hesabın adını yazabilir.
    const settings = settingsSnapshot(db);
    await settings.override('door_card_account_id', 'Kart cihazı');

    try {
      expect(await readDoorAccountId(db, 'card')).toBeNull();
    } finally {
      await settings.restore();
    }
  });
});
