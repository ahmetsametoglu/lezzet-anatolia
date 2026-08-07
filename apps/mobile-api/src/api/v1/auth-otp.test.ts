import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { app } from '../../app';

/**
 * `/api/v1/auth/otp/*` uçtan uca — `app.request()` ile PORT AÇMADAN. ALTIN yol: request →
 * verify → dönen access token'la `/api/v1/me`. Yani tek dosyada üç sözleşme birden sınanır:
 * OTP akışı, oturum zarfı ve Bearer guard'ın gerçek bir token'ı kabul etmesi.
 *
 * Paylaşılan-DB disiplini (CLAUDE §4b): damgalı e-posta, env önce-oku-sonra-geri-koy,
 * teardown `purgeTestData`.
 */
// Koşu-başına kod — `token_hash` GLOBAL TEKİL, sabit kodun hash'i tabloda dururken ikinci
// istek kısıta çarpar (gerekçenin tamamı `packages/application/src/auth/otp.test.ts` başında).
// +777 kayması aynı milisaniyede başlasalar bile iki dosyanın kodunu ayırır.
const TEST_CODE = String(100000 + ((Date.now() + 777) % 900000));
const email = `otp-mapi-${Date.now()}@example.com`;
const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

let prevTestCode: string | undefined;
let accessToken = '';

beforeAll(() => {
  prevTestCode = process.env.OTP_TEST_CODE;
  process.env.OTP_TEST_CODE = TEST_CODE;
});

afterAll(async () => {
  if (prevTestCode === undefined) delete process.env.OTP_TEST_CODE;
  else process.env.OTP_TEST_CODE = prevTestCode;

  // Auth kimliği yanıttan değil profilden okunur: uç bilerek user gövdesi taşımıyor (/me'nin işi).
  const db = serviceDb();
  const profile = await new UserProfileService(db).findByEmail(email);
  await purgeTestData(db, { verificationEmails: [email], authUserIds: profile?.authUserId ? [profile.authUserId] : [] });
});

describe('POST /api/v1/auth/otp — altın yol', () => {
  it('request 200 {data:true} döner', async () => {
    const res = await app.request('/api/v1/auth/otp/request', json({ email, locale: 'fr' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: true, error: null });
  });

  it('verify 200 ve oturum zarfı döner; token /me kapısından geçer', async () => {
    const res = await app.request('/api/v1/auth/otp/verify', json({ email, code: TEST_CODE, locale: 'fr' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { session: { accessToken: string; refreshToken: string; expiresIn: number; tokenType: string } }; error: null };
    expect(body.error).toBeNull();
    expect(body.data.session.accessToken).toBeTruthy();
    expect(body.data.session.refreshToken).toBeTruthy();
    expect(body.data.session.expiresIn).toBeGreaterThan(0);
    accessToken = body.data.session.accessToken;

    const me = await app.request('/api/v1/me', { headers: { authorization: `Bearer ${accessToken}` } });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { data: { email: string | null }; error: null };
    expect(meBody.data.email).toBe(email);
  });

  it('aynı e-postaya hemen yeni istek 429 + Retry-After döner (cooldown DB\'de)', async () => {
    const res = await app.request('/api/v1/auth/otp/request', json({ email, locale: 'fr' }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ data: null, error: 'cooldown' });
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

describe('POST /api/v1/auth/otp — sınır hâlleri', () => {
  it('bozuk e-posta 400 invalid_email', async () => {
    const res = await app.request('/api/v1/auth/otp/request', json({ email: 'bu-eposta-degil', locale: 'fr' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_email' });
  });

  it('biçimsiz kod (5 hane) RPC\'ye gitmeden 401 invalid_code', async () => {
    const res = await app.request('/api/v1/auth/otp/verify', json({ email, code: '12345', locale: 'fr' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_code' });
  });

  it('gövde JSON değilse 400 zarfı döner', async () => {
    const res = await app.request('/api/v1/auth/otp/request', { method: 'POST', body: 'gövde-yok' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_email' });
  });
});
