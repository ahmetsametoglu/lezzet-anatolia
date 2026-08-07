import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { requestOtpCode, verifyOtpCode } from './otp';

/**
 * OTP orkestrasyonunun DB'ye vuran testleri (entegrasyon kökü). Kod `OTP_TEST_CODE` kapısıyla
 * sabitlenir — mail HİÇ gitmez, sınanan şey akışın tamamıdır (hash, cooldown, sayaç, tek-kullanım,
 * generateLink → trigger → profil, dil tohumu).
 *
 * Paylaşılan-DB disiplini (CLAUDE §4b): e-posta DAMGALI (yalnız bu koşunun satırları), env
 * "önce oku sonra geri koy", teardown `purgeTestData` (elle silme yok — sıra tek yerde).
 */
// Kod KOŞU-BAŞINA türetilir, sabit değil: `token_hash` GLOBAL TEKİL ve hash yalnız koddan
// çıkıyor — sabit kod, tabloda aynı hash'li herhangi bir satır (başka şeridin testi, e2e'nin
// sabit 123456'sı, düşmüş bir koşunun artığı) dururken kısıt ihlaline çarpar (BEKLEYEN(08.22)
// e2e fikstüründe aynı gerekçeyle yazılı). Damgadan türeyen kod her koşuda ayrı hash üretir.
const TEST_CODE = String(100000 + (Date.now() % 900000));
const WRONG_CODE = TEST_CODE === '999999' ? '111111' : '999999';
const email = `otp-app-${Date.now()}@example.com`;
const db = serviceDb();

let prevTestCode: string | undefined;
let authUserId: string | undefined;

beforeAll(() => {
  prevTestCode = process.env.OTP_TEST_CODE;
  process.env.OTP_TEST_CODE = TEST_CODE;
});

afterAll(async () => {
  // Env eski hâline: "boşa çek" de bir varsayımdır ve bir gün yanlış olur (CLAUDE §4b).
  if (prevTestCode === undefined) delete process.env.OTP_TEST_CODE;
  else process.env.OTP_TEST_CODE = prevTestCode;
  await purgeTestData(db, { verificationEmails: [email], authUserIds: authUserId ? [authUserId] : [] });
});

describe('requestOtpCode + verifyOtpCode (OTP_TEST_CODE kapısıyla)', () => {
  it('bozuk e-posta RPC\'ye hiç gitmeden çevrilir', async () => {
    expect(await requestOtpCode(db, { email: 'bu-eposta-degil', locale: 'fr' })).toEqual({ status: 'invalid_email' });
  });

  it('kod isteği ok döner; hemen ikinci istek cooldown\'a düşer (kilit DB\'de)', async () => {
    expect(await requestOtpCode(db, { email, locale: 'tr' })).toEqual({ status: 'ok' });

    const second = await requestOtpCode(db, { email, locale: 'tr' });
    expect(second.status).toBe('cooldown');
    if (second.status === 'cooldown') expect(second.retryAfterSec).toBeGreaterThan(0);
  });

  it('yanlış kod invalid_code döner (sayaç işler, kilitlenmez)', async () => {
    expect(await verifyOtpCode(db, { email, code: WRONG_CODE, locale: 'tr' })).toEqual({ status: 'invalid_code' });
  });

  it('doğru kod: oturum köprüsü + yeni profil + dil tohumu', async () => {
    const result = await verifyOtpCode(db, { email, code: TEST_CODE, locale: 'tr' });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(result.hashedToken).toBeTruthy();
    expect(result.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.knownBefore).toBe(false);
    authUserId = result.userId;

    // Trigger profili açtı, tohum dili YAZDI: kolonun DB varsayılanı 'fr' — 'tr' okunuyorsa
    // değer tohumdan gelmiştir, varsayılandan değil.
    const profile = await new UserProfileService(db).findByEmail(email);
    expect(profile?.authUserId).toBe(result.userId);
    expect(profile?.preferredLanguage).toBe('tr');
  });

  it('kod TEK kullanımlıktır: aynı kod ikinci kez no_active_code', async () => {
    expect(await verifyOtpCode(db, { email, code: TEST_CODE, locale: 'tr' })).toEqual({ status: 'no_active_code' });
  });
});
