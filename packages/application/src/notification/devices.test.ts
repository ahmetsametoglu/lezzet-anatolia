import { afterAll, describe, expect, it } from 'vitest';
import { PushDeviceService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { registerWebPushSubscription, unregisterPushDevice } from './devices';

const db = serviceDb();
const devices = new PushDeviceService(db);
const stamp = Date.now();
const profileIds: string[] = [];

afterAll(async () => {
  await purgeTestData(db, { profileIds });
});

describe('tarayıcı aboneliğinin kaydı', () => {
  it('aynı abonelik müşteri sitesi ve operasyon paneli için ayrı satırdır: biri kaydolunca öbürü silinmez, çıkış ikisini de siler', async () => {
    const kisi = await new UserProfileService(db).insert({ name: `Hem müşteri hem personel ${stamp}`, roles: ['admin'], warehouseIds: [] });
    profileIds.push(kisi.id);
    const abonelik = { endpoint: `https://fcm.googleapis.com/fcm/send/iki-yuzey-${stamp}`, keys: { p256dh: 'p', auth: 'a' } };

    await registerWebPushSubscription(db, { profileId: kisi.id, subscription: abonelik, app: 'customer' });
    await registerWebPushSubscription(db, { profileId: kisi.id, subscription: abonelik, app: 'operations' });

    expect((await devices.listSendable(kisi.id, 'customer')).map((d) => d.token)).toEqual([abonelik.endpoint]);
    expect((await devices.listSendable(kisi.id, 'operations')).map((d) => d.token)).toEqual([abonelik.endpoint]);

    await unregisterPushDevice(db, { profileId: kisi.id, token: abonelik.endpoint });
    expect(await devices.listSendable(kisi.id, 'customer')).toEqual([]);
    expect(await devices.listSendable(kisi.id, 'operations')).toEqual([]);
  });
});
