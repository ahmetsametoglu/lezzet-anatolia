import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { ensureNotificationToken } from './notification-preferences';
import { readEmailSubscription, unsubscribeEmail, updateCustomerPreferences } from './preferences';

// Bilgi e-postasındaki düğme başkasının iznine dokunursa, WhatsApp iznini de kapatırsa ya da bilinmeyen jetonu kabul ederse kırmızıya döner.
const db = serviceDb();
const profiles = new UserProfileService(db);
const stamp = Date.now();
const profileIds: string[] = [];
let aboneId = '';
let komsuId = '';
let token = '';

beforeAll(async () => {
  const abone = await profiles.insert({ name: `Abone ${stamp}`, email: `abone-${stamp}@example.test` });
  const komsu = await profiles.insert({ name: `Komşu ${stamp}`, email: `komsu-${stamp}@example.test` });
  aboneId = abone.id;
  komsuId = komsu.id;
  profileIds.push(aboneId, komsuId);
  await updateCustomerPreferences(db, { profileId: aboneId, source: 'account', marketingConsent: { email: true, whatsapp: true } });
  await updateCustomerPreferences(db, { profileId: komsuId, source: 'account', marketingConsent: { email: true } });
  token = (await ensureNotificationToken(db, aboneId)) ?? '';
}, 60_000);

afterAll(async () => {
  await purgeTestData(db, { profileIds });
});

describe('bilgi e-postasından sonlandırma', () => {
  it('jetonun sahibinin yalnız e-posta iznini kapatır; ikinci basış bir şey yazmaz', async () => {
    expect(await readEmailSubscription(db, token)).toBe('subscribed');
    expect(await unsubscribeEmail(db, token)).toBe('unsubscribed');

    const abone = await profiles.getById(aboneId);
    expect(abone?.marketingConsent.email).toMatchObject({ granted: false, source: 'email-link' });
    expect(abone?.marketingConsent.whatsapp).toMatchObject({ granted: true });
    expect((await profiles.getById(komsuId))?.marketingConsent.email).toMatchObject({ granted: true });

    expect(await unsubscribeEmail(db, token)).toBe('unsubscribed');
    expect((await profiles.getById(aboneId))?.marketingConsent.email?.at).toBe(abone?.marketingConsent.email?.at);
    expect(await readEmailSubscription(db, token)).toBe('unsubscribed');
  });

  it('tanınmayan jeton hiçbir izne dokunmaz', async () => {
    expect(await readEmailSubscription(db, `yok-${stamp}`)).toBe('invalid');
    expect(await unsubscribeEmail(db, `yok-${stamp}`)).toBe('invalid');
  });
});
