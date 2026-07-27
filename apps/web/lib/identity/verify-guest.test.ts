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

const damga = Date.now();
const posta = (n: number) => `misafir${damga}-${n}@ornek.fr`;
const acilanlar: string[] = [];

afterAll(async () => {
  // OTP satırları da toplanır: `EmailVerificationService`'te silme kapalıdır (denetim izi), test
  // kendi satırını doğrudan siler.
  await purgeTestData(db, {
    profileIds: acilanlar,
    verificationEmails: [1, 2, 3, 4, 5].map(posta),
  });
});

/** OTP ister ve düz kodu döner (test ortamı; üretimde kod yalnız e-postayla gider). */
async function kodIste(email: string): Promise<string> {
  const result = await verifications.requestCode(email);
  if (result.status !== 'ok') throw new Error(`kod istenemedi: ${result.status}`);
  return result.code;
}

describe('misafir doğrulama (04.6)', () => {
  it('doğrulanan yeni misafir için müşteri açılır', async () => {
    const email = posta(1);
    const sonuc = await verifyGuestAndAttach({ email, code: await kodIste(email), name: 'Misafir Ali' });

    expect(sonuc.status).toBe('verified');
    if (sonuc.status !== 'verified') return;
    acilanlar.push(sonuc.profile.id);
    expect(sonuc.isNew).toBe(true);
    expect(sonuc.profile.isDraft).toBe(false); // doğrulanmış kimlik taslak değildir
    expect(sonuc.profile.email).toBe(email);
  });

  it('doğrulanan misafir mevcut müşteriyse ona bağlanır — ikinci kayıt açılmaz', async () => {
    const email = posta(2);
    const mevcut = await profiles.insert({ name: 'Eski müşteri', email });
    acilanlar.push(mevcut.id);

    const sonuc = await verifyGuestAndAttach({ email, code: await kodIste(email) });
    expect(sonuc.status).toBe('verified');
    if (sonuc.status !== 'verified') return;
    expect(sonuc.isNew).toBe(false);
    expect(sonuc.profile.id).toBe(mevcut.id);
  });

  it('checkout formundaki telefon aynı turda karta yazılır (ikinci anahtar)', async () => {
    const email = posta(3);
    const telefon = `+3363333${String(damga).slice(-4)}`;
    const sonuc = await verifyGuestAndAttach({ email, code: await kodIste(email), phone: telefon, name: 'Telefonlu misafir' });

    expect(sonuc.status).toBe('verified');
    if (sonuc.status !== 'verified') return;
    acilanlar.push(sonuc.profile.id);
    expect(sonuc.profile.phone).toBe(telefon);
  });

  it('yanlış kodda müşteri AÇILMAZ — doğrulanmamış kimlik kayıt yaratmaz', async () => {
    const email = posta(4);
    await kodIste(email);

    const sonuc = await verifyGuestAndAttach({ email, code: '000000' });
    expect(sonuc.status).toBe('wrong');
    expect(await profiles.findByEmail(email)).toBeNull();
  });

  it('hiç kod istenmemiş e-posta doğrulanamaz', async () => {
    expect(await verifyGuestAndAttach({ email: posta(5), code: '123456' })).toMatchObject({ status: 'not_found' });
  });
});
