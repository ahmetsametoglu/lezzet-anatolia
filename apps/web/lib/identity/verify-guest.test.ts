import { afterAll, describe, expect, it } from 'vitest';
import { EmailVerificationService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { verifyGuestAndAttach } from './verify-guest';

/**
 * Misafir hızlı doğrulama (04.6) — "hesapsız sipariş yok" kuralının altyapısı.
 * İki dal doğrulanır: doğrulanan misafir mevcut müşteriyse ona bağlanır, değilse yeni açılır.
 * Yanlış kodda müşteri AÇILMAMALIDIR — doğrulanmamış kimlik kayıt yaratmaz.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const verifications = new EmailVerificationService(db);

const stamp = Date.now();
const emailFor = (n: number) => `misafir${stamp}-${n}@ornek.fr`;
const createdIds: string[] = [];

afterAll(async () => {
  // OTP satırları da toplanır: `EmailVerificationService`'te silme kapalıdır (denetim izi), test
  // kendi satırını doğrudan siler.
  await purgeTestData(db, {
    profileIds: createdIds,
    verificationEmails: [1, 2, 3, 4, 5].map(emailFor),
  });
});

/** OTP ister ve düz kodu döner (test ortamı; üretimde kod yalnız e-postayla gider). */
async function requestCode(email: string): Promise<string> {
  const result = await verifications.requestCode(email);
  if (result.status !== 'ok') throw new Error(`kod istenemedi: ${result.status}`);
  return result.code;
}

describe('misafir doğrulama (04.6)', () => {
  it('doğrulanan yeni misafir için müşteri açılır', async () => {
    const email = emailFor(1);
    const outcome = await verifyGuestAndAttach({ email, code: await requestCode(email), name: 'Misafir Ali' });

    expect(outcome.status).toBe('verified');
    if (outcome.status !== 'verified') return;
    createdIds.push(outcome.profile.id);
    expect(outcome.isNew).toBe(true);
    expect(outcome.profile.isDraft).toBe(false); // doğrulanmış kimlik taslak değildir
    expect(outcome.profile.email).toBe(email);
  });

  it('doğrulanan misafir mevcut müşteriyse ona bağlanır — ikinci kayıt açılmaz', async () => {
    const email = emailFor(2);
    const existing = await profiles.insert({ name: 'Eski müşteri', email });
    createdIds.push(existing.id);

    const outcome = await verifyGuestAndAttach({ email, code: await requestCode(email) });
    expect(outcome.status).toBe('verified');
    if (outcome.status !== 'verified') return;
    expect(outcome.isNew).toBe(false);
    expect(outcome.profile.id).toBe(existing.id);
  });

  it('checkout formundaki telefon aynı turda karta yazılır (ikinci anahtar)', async () => {
    const email = emailFor(3);
    const phone = `+3363333${String(stamp).slice(-4)}`;
    const outcome = await verifyGuestAndAttach({ email, code: await requestCode(email), phone: phone, name: 'Telefonlu misafir' });

    expect(outcome.status).toBe('verified');
    if (outcome.status !== 'verified') return;
    createdIds.push(outcome.profile.id);
    expect(outcome.profile.phone).toBe(phone);
  });

  it('yanlış kodda müşteri AÇILMAZ — doğrulanmamış kimlik kayıt yaratmaz', async () => {
    const email = emailFor(4);
    await requestCode(email);

    const outcome = await verifyGuestAndAttach({ email, code: '000000' });
    expect(outcome.status).toBe('wrong');
    expect(await profiles.findByEmail(email)).toBeNull();
  });

  it('hiç kod istenmemiş e-posta doğrulanamaz', async () => {
    expect(await verifyGuestAndAttach({ email: emailFor(5), code: '123456' })).toMatchObject({ status: 'not_found' });
  });
});
