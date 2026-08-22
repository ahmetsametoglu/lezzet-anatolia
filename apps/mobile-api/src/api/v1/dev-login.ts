import { Hono } from 'hono';
import { z } from 'zod';
import { serviceDb } from '@lezzet/database';
import { logger, maskEmail } from '@lezzet/observability';
import { fail, ok } from '../../lib/respond';

/*
  GELİŞTİRME GİRİŞ KAPISI (kullanıcı isteği 09.08) — login ekranındaki test düğmelerinin ucu:
  OTP mail turunu ATLAYARAK gerçek oturum kurdurur. Admin API'den magic-link üretilir (MAİL
  GİTMEZ — `generateLink` yalnız üretir), istemciye tek kullanımlık `tokenHash` döner; istemci
  onu `verifyOtp(type:'magiclink')` ile GERÇEK oturuma çevirir. Yani kapı sahte kimlik basmaz,
  Supabase'in kendi doğrulamasından geçen bir giriş yapar.

  ÜRETİMDE YOKTUR: mount `router.ts`te `NODE_ENV !== 'production'` koşuluna bağlı — bu dosya
  üretim sürecinde zincire hiç girmez. Yerel geliştirmede uç, verilen HER e-postaya oturum verir
  (yerel DB, yerel ağ); e-posta süzgeci bilerek yok — test kullanıcısı değiştikçe uca dokunulmasın.

  ── KULLANICI YOKSA YARATILIR (ölçüm düzeltmesi 11.08) ──────────────────────
  Burada bir süre *"dev kapısı kullanıcı YARATMAZ"* yazıyordu ve YANLIŞTI: `generateLink` kayıtsız
  e-postada auth kullanıcısını AÇAR (aynı çağrının gerçek OTP akışındaki künyesi bunu zaten
  söylüyordu — `packages/application/src/auth/otp.ts`). Ölçüldü: `kurye@lezzetanatolia.fr` çağrı
  öncesi `auth_user_id`'siz, çağrı sonrası bağlı; `0002` trigger'ı profili e-postadan bulup bağlıyor
  ve ROLÜ koruyor (`/me` → `roles: ['courier']`, `/courier/day` 200, `/warehouse/preparation` 403).
  Yanlış cümlenin bedeli ölçülebilirdi: "personel yerelde giriş yapamaz" diye bir teşhis üretmişti.

  YETKİYİ AÇMAZ: kurulan oturum sıradan bir müşteri oturumuyla aynıdır; hangi uca girilebileceğine
  yine `bearerAuth` + `requireStaffRole` karar verir. Burada guard'ı kısa devre yapan hiçbir şey
  YOK ve olmamalı. (Bu cümle bir süre web'in bypass'ını şimdiki zamanla anıyordu; o bypass 19.08'de
  tamamen söküldü — oturumsuz `/operations` artık yerelde de 307 → giriş.)
*/

const DevSessionBodySchema = z.object({ email: z.string().email() });

export const devLogin = new Hono();

devLogin.post('/dev-session', async (c) => {
  const body = DevSessionBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const { data, error } = await serviceDb().auth.admin.generateLink({ type: 'magiclink', email: body.data.email });
  const tokenHash = data?.properties?.hashed_token;
  if (error !== null || !tokenHash) {
    /* SEBEP YUTULMAZ (21.32). Buradaki ret bir süre gerekçesiz dönüyordu ve teşhis edilemiyordu:
       ekranda yalnız "uç: dev_session_failed" görülüyordu, Supabase'in söylediği ("email adresi
       geçersiz", "kullanıcı yaratılamadı") kayboluyordu. Ölçüldü (11.08): `.local` uzantılı adres
       reddediliyor, gerçek alan adlı altı personel adresi geçiyor — o farkı ancak mesaj söyler.
       Dev kapısı olduğu için mesaj HAM gidiyor (dosya künyesindeki aynı gerekçe). */
    logger.warn(
      { context: 'dev-session', email: maskEmail(body.data.email), reason: error?.message ?? 'jeton boş' },
      'dev giriş hesabı açılamadı',
    );
    return fail(c, 'dev_session_failed', 400);
  }

  return ok(c, { tokenHash });
});
