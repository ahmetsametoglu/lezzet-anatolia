import { Hono } from 'hono';
import { z } from 'zod';
import { requestOtpCode, verifyOtpCode } from '@lezzet/application';
import { createAnonClient, serviceDb } from '@lezzet/database';
import { captureError, maskEmail, SOURCES } from '@lezzet/observability';
import { AuthSessionSchema, OtpCodeSchema, PreferredLanguageEnum } from '@lezzet/types';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';

/**
 * `/api/v1/auth/otp/*` — BİLİNÇLİ AÇIK uçlar (giriş doğası gereği oturumsuz; `router.ts`te
 * `bearerAuth`tan ÖNCE bağlanır). Akışın kendisi `@lezzet/application/auth`ta; burada yalnız
 * taşıma: gövde doğrulama, durum → HTTP kodu/anahtar eşlemesi, oturumun zarflanması.
 *
 * `locale` gövdede geliyor çünkü mobilde `getLocale()` yok — mailin ve dil tohumunun dili
 * cihazın seçtiği dildir.
 */
const RequestBodySchema = z.object({ email: z.string().min(1), locale: PreferredLanguageEnum });
const VerifyBodySchema = z.object({
  email: z.string().min(1),
  code: OtpCodeSchema,
  locale: PreferredLanguageEnum,
  /**
   * Davet bağlantısından taşınan kod (21.43) — web'in çerezinin mobil karşılığı. Cihaz onu
   * karşılama ekranında saklamıştır (`lib/invite/invite-store.ts`) ve doğrulama anında yollar.
   *
   * **Bozuk değer GİRİŞİ DÜŞÜRMEZ** (`.catch`): davet bir kolaylıktır, kimlik değil — eski bir
   * sürümün yazdığı ya da bozulmuş bir kayıt yüzünden müşteriyi kapıda çevirmek, çözdüğünden
   * büyük bir arıza olurdu. Geçersiz/kendine ait/geç kalmış kodun süzgeci zaten kapıda
   * (`linkReferrer` üç hâli de sessizce reddeder ve gerekçesini log'a düşer).
   */
  referralCode: z.string().min(1).optional().catch(undefined),
});

/**
 * Gövde `safeParse`ten düşünce anahtar seçimi: `code` biçimsizse `invalid_code` (kullanıcının
 * yazdığı alan — beş hane giren müşteri "kod yanlış" okumalı; RPC'ye ve deneme sayacına hiç
 * gidilmez), gerisi `invalid_email` (400). `locale`i uygulama üretir, kullanıcı yazmaz; bozuk
 * gelmesi istemci hatasıdır ve ayrı bir anahtarı hak etmez — anahtar kümesi müşteri hâllerinin
 * kümesidir, istemci hatalarının değil.
 */
function bodyFailKey(error: z.ZodError): { key: 'invalid_code' | 'invalid_email'; status: 400 | 401 } {
  const field = error.issues[0]?.path[0];
  return field === 'code' ? { key: 'invalid_code', status: 401 } : { key: 'invalid_email', status: 400 };
}

export const authOtp = new Hono<AppEnv>();

// 200 {data:true} · 400 invalid_email · 429 rate_limit/cooldown (+Retry-After) · 502 send_failed
authOtp.post('/request', async (c) => {
  const body = RequestBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    const { key, status } = bodyFailKey(body.error);
    return fail(c, key, status);
  }

  const result = await requestOtpCode(serviceDb(), body.data);
  switch (result.status) {
    case 'ok':
      return ok(c, true);
    case 'invalid_email':
      return fail(c, 'invalid_email', 400);
    case 'rate_limit':
    case 'cooldown':
      // Bekleme süresi ZARFI bozmadan başlıkta taşınır — `{data,error}` şekli her uçta aynı kalır.
      c.header('Retry-After', String(result.retryAfterSec));
      return fail(c, result.status, 429);
    case 'send_failed':
      return fail(c, 'send_failed', 502);
  }
});

// 200 {data:{session}} · 401 invalid_code/code_expired/code_locked/no_active_code · 400/502
authOtp.post('/verify', async (c) => {
  const body = VerifyBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    const { key, status } = bodyFailKey(body.error);
    return fail(c, key, status);
  }

  const result = await verifyOtpCode(serviceDb(), body.data);
  if (result.status !== 'ok') {
    if (result.status === 'invalid_email') return fail(c, 'invalid_email', 400);
    if (result.status === 'send_failed') return fail(c, 'send_failed', 502);
    return fail(c, result.status, 401);
  }

  // Oturum HER SEFERİNDE YENİ istemciyle alınır (gerekçe fabrikanın künyesinde —
  // `packages/database/src/client.ts` `createAnonClient`): token_hash tüketimi istemciye oturum
  // yazar, paylaşılan tekil (`anonDb`) kirlenemez — iki müşterinin oturumu karışırdı.
  const { data, error } = await createAnonClient().auth.verifyOtp({ token_hash: result.hashedToken, type: 'email' });
  if (error || !data.session) {
    // Kod doğruydu ama oturum kurulamadı — müşteri anahtarı web'le aynı (`send_failed`), ayrıntı kayda.
    await captureError(new Error(`oturum açılamadı: ${error?.message ?? 'session boş'}`), {
      source: SOURCES.mobileApiHttp,
      path: c.req.path,
      context: { reqId: c.get('reqId'), flow: 'auth/otp/verify', email: maskEmail(body.data.email) },
    });
    return fail(c, 'send_failed', 502);
  }

  const s = data.session;
  // `parse` sözleşmenin son kapısı: supabase-js yarın alan eklese de zarfa yalnız seçili beşli girer.
  return ok(c, {
    session: AuthSessionSchema.parse({
      accessToken: s.access_token,
      refreshToken: s.refresh_token,
      expiresIn: s.expires_in,
      expiresAt: s.expires_at ?? null,
      tokenType: s.token_type,
    }),
  });
});
