import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { app } from '../../app';
import { bearer, createSignedInUser, envelopeData } from '../../lib/testing';

/**
 * BİLDİRİM TERCİHLERİ (`PATCH /me/preferences`) ve GELİŞTİRME GİRİŞ KAPISI — iki ince uç.
 *
 * ── NEDEN TEK DOSYA, VE NEDEN AYRI DOSYA DEĞİL ──────────────────────────────
 * İkisi de tek rotalı geçiş katmanı; ayrı dosya açmak ikişer iddia için iki kurulum demekti.
 * Ortak konuları da var: **kapının kendisi.** Biri kimlik istiyor, öteki üretimde HİÇ OLMAMALI.
 *
 * ── ÇİVİLENEN ASIL KARAR: DEV KAPISI ÜRETİMDE MOUNT EDİLMEZ ─────────────────
 * `router.ts` onu `process.env.NODE_ENV !== 'production'` koşuluyla bağlıyor. Koşul kalkarsa
 * **mail turunu atlayan gerçek bir oturum kapısı üretime açılır** — ve bu, kod incelemesinde tek
 * satırlık, gözle kolayca atlanan bir değişikliktir.
 *
 * **Yokluğu burada sınanamıyor ve bu açıkça yazılıyor:** koşul MODÜL YÜKLENİRKEN değerleniyor,
 * yani `NODE_ENV`i test içinde değiştirmek router'ı yeniden yüklemeyi gerektirir — ve o da
 * hook'ların React nüshası sorununun kardeşi bir kurulum işi. Ölçülebilen şey, kapının bu ortamda
 * VAR olduğu ve **sahte kimlik BASMADIĞI**: dönen şey bir oturum değil, Supabase'in kendi
 * doğrulamasından geçmesi gereken tek kullanımlık bir hash — üretime sızsa bile doğrulama
 * zincirini atlamıyor.
 *
 * **İlk taslak burada "kayıtsız e-posta reddedilir" diye bir iddia yazmıştı ve YANLIŞTI:** kapının
 * künyesi tersini söylüyor ve `generateLink` kayıtsız e-postada kullanıcıyı AÇIYOR. Sözleşmeyi
 * okumadan varsayan bir test, doğru davranışı arıza gibi gösterir.
 */
const db = serviceDb();

const authUserIds: string[] = [];
const profileIds: string[] = [];
let musteriToken: string;

beforeAll(async () => {
  const musteri = await createSignedInUser({ prefix: 'prefs-api', label: 'musteri' });
  musteriToken = musteri.token;
  authUserIds.push(musteri.authUserId);
  profileIds.push(musteri.profileId);
});

afterAll(async () => {
  await purgeTestData(db, { profileIds, authUserIds });
});

describe('PATCH /api/v1/me/preferences', () => {
  it('Bearer olmadan 401 — tercih kimliğe yazılır', async () => {
    const res = await app.request('/api/v1/me/preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ marketingEmail: false }),
    });

    expect(res.status).toBe(401);
  });

  it('BOZUK gövde 400 — tercih alanı boolean olmayan bir değerle yazılamaz', async () => {
    const res = await app.request('/api/v1/me/preferences', {
      method: 'PATCH',
      headers: { ...bearer(musteriToken), 'content-type': 'application/json' },
      body: JSON.stringify({ marketingEmail: 'evet' }),
    });

    expect(res.status).toBe(400);
  });

  it('gövdesiz istek 400 — boş PATCH bir tercih değildir', async () => {
    const res = await app.request('/api/v1/me/preferences', {
      method: 'PATCH',
      headers: bearer(musteriToken),
    });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/dev-session — geliştirme giriş kapısı', () => {
  it('yerelde MOUNT EDİLİ — üretim koşulu bu ortamda yanlış', async () => {
    // Mount edilmemiş olsaydı 404 dönerdi. Bu iddia, kapının bu ortamda VAR olduğunu çiviliyor;
    // ÜRETİMDE YOKLUĞU burada ölçülemiyor (künye).
    const res = await app.request('/api/v1/auth/dev-session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `yok-${Date.now()}@example.test` }),
    });

    expect(res.status).not.toBe(404);
  });

  it('KAYITSIZ e-posta da kabul edilir — ve bu BİLİNÇLİ', async () => {
    /* İlk taslak burada RET bekliyordu ve YANILMIŞTI: kapının künyesi tersini söylüyor —
       *"yerel geliştirmede uç, verilen HER e-postaya oturum verir; e-posta süzgeci bilerek yok"*
       ve `generateLink` kayıtsız e-postada auth kullanıcısını AÇIYOR (ölçüm düzeltmesi 11.08).
       Varsayımla yazılmış bir iddia, doğru davranışı arıza gibi gösterecekti.
       Test artık kararı ÇİVİLİYOR: biri "kayıtsız e-posta reddedilmeli" diye daraltırsa, yerelde
       yeni bir test kullanıcısıyla çalışmak uca dokunmayı gerektirir hâle gelir. */
    const res = await app.request('/api/v1/auth/dev-session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `yeni-${Date.now()}@example.test` }),
    });

    expect(res.status).toBe(200);
  });

  it('SAHTE KİMLİK BASMAZ — dönen şey oturum değil, tek kullanımlık HASH', async () => {
    /* Kapının asıl güvenlik özelliği bu. Uç bir `access_token` üretmiyor; Supabase'in kendi
       doğrulamasından geçmesi gereken bir `tokenHash` döndürüyor ve oturumu istemci
       `verifyOtp` ile kuruyor. Doğrudan jeton dönseydi kapı, doğrulama zincirini atlayan bir
       kimlik basma makinesi olurdu — üretime sızdığı gün de öyle çalışırdı. */
    const res = await app.request('/api/v1/auth/dev-session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `hash-${Date.now()}@example.test` }),
    });

    const data = await envelopeData<Record<string, unknown>>(res);
    expect(typeof data.tokenHash).toBe('string');
    expect(data).not.toHaveProperty('accessToken');
    expect(data).not.toHaveProperty('session');
    expect(data).not.toHaveProperty('refreshToken');
  });

  it('BOZUK gövde reddedilir', async () => {
    const res = await app.request('/api/v1/auth/dev-session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
