import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { devOtpCode, requestOtpCode, verifyOtpCode } from './otp';

/**
 * Kodlu girişin akışı uçtan uca (hash, bekleme süresi, sayaç, tek kullanım, profil, dil tohumu); kod test kapısıyla sabitlenir ve
 * mail gitmez. E-posta damgalıdır, ortam değişkeni okunup geri konur, temizlik `purgeTestData` ile.
 */
// Kod koşu başına türetilir: `token_hash` küresel tekil, sabit kod tabloda kalmış aynı hash'li bir satıra çarpar.
const TEST_CODE = String(100000 + (Date.now() % 900000));
const WRONG_CODE = TEST_CODE === '999999' ? '111111' : '999999';
const email = `otp-app-${Date.now()}@example.com`;
const db = serviceDb();

/**
 * Kapının biçim kilidi: altı rakam olmayan değer yok sayılmazsa tahmin edilebilir bir kod gerçek akışa sızar. Her vaka kendi
 * adresini kullanır, çünkü bekleme süresi ve sayaç adres başınadır.
 */
const GATE_STAMP = Date.now();
const INVALID_GATE_CASES = [
  { label: 'beş hane', raw: '12345', email: `otp-app-gate-short-${GATE_STAMP}@example.com` },
  { label: 'yedi hane', raw: '1234567', email: `otp-app-gate-long-${GATE_STAMP}@example.com` },
  { label: 'harf içeren', raw: 'abc123', email: `otp-app-gate-alpha-${GATE_STAMP}@example.com` },
];

let prevTestCode: string | undefined;
let authUserId: string | undefined;

beforeAll(() => {
  prevTestCode = process.env.OTP_TEST_CODE;
  process.env.OTP_TEST_CODE = TEST_CODE;
});

afterAll(async () => {
  // Eski değer aynen geri konur; boşaltmak da bir varsayımdır.
  if (prevTestCode === undefined) delete process.env.OTP_TEST_CODE;
  else process.env.OTP_TEST_CODE = prevTestCode;
  await purgeTestData(db, {
    verificationEmails: [email, ...INVALID_GATE_CASES.map((c) => c.email)],
    authUserIds: authUserId ? [authUserId] : [],
  });
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

    // Kolonun varsayılanı 'fr'; 'tr' okunuyorsa değer tohumdan gelmiştir.
    const profile = await new UserProfileService(db).findByEmail(email);
    expect(profile?.authUserId).toBe(result.userId);
    expect(profile?.preferredLanguage).toBe('tr');
  });

  it('kod TEK kullanımlıktır: aynı kod ikinci kez no_active_code', async () => {
    expect(await verifyOtpCode(db, { email, code: TEST_CODE, locale: 'tr' })).toEqual({ status: 'no_active_code' });
  });
});

describe('OTP_TEST_CODE bozuksa kapı devreye GİRMEZ', () => {
  let prevResendKey: string | undefined;

  beforeAll(() => {
    // Kapı kapalıyken gerçek mail yolu işler; anahtar bu blok boyunca kaldırılır ki her tam koşu gerçek gönderim denemesi üretmesin.
    prevResendKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
  });

  afterAll(() => {
    // İki değişken de geri konur: anahtar dışarıdan geldiği hâliyle, test kodu dosyanın dayandığı değere.
    if (prevResendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevResendKey;
    process.env.OTP_TEST_CODE = TEST_CODE;
  });

  it.each(INVALID_GATE_CASES)('$label ($raw) → kod bu değere sabitlenmez, gerçek üretim yolu işler', async ({ raw, email: gateEmail }) => {
    process.env.OTP_TEST_CODE = raw;

    expect(await requestOtpCode(db, { email: gateEmail, locale: 'fr' })).toEqual({ status: 'ok' });

    // Tek sonuç üç ihtimali ayırır: kapı yanlışlıkla açılsaydı 'ok', istek RPC'ye gitmeseydi 'no_active_code', doğrusu 'invalid_code'.
    expect(await verifyOtpCode(db, { email: gateEmail, code: raw, locale: 'fr' })).toEqual({ status: 'invalid_code' });
  });
});

// Test kodu yerel olmayan (test ya da canlı) veritabanına bağlı süreçte açılırsa kırmızıya döner.
describe('veritabanı yerel değilse kapı devreye GİRMEZ', () => {
  it('geçerli test kodu olsa da kod sabitlenmez', () => {
    expect(devOtpCode()).toBe(TEST_CODE);
    const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ornek.supabase.co';
    try {
      expect(devOtpCode()).toBeNull();
    } finally {
      if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    }
  });
});
