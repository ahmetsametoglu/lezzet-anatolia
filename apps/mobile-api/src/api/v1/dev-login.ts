import { Hono } from 'hono';
import { z } from 'zod';
import { DEV_LOGIN_UNSEEDED_DATABASE, devLoginRefusal } from '@lezzet/application';
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

  ── KULLANICI YOKSA YARATILIR — AMA KURULMAMIŞ VERİTABANINDA DEĞİL (27.08) ──
  Burada bir süre *"dev kapısı kullanıcı YARATMAZ"* yazıyordu ve YANLIŞTI: `generateLink` kayıtsız
  e-postada auth kullanıcısını AÇAR (aynı çağrının gerçek OTP akışındaki künyesi bunu zaten
  söylüyordu — `packages/application/src/auth/otp.ts`). Ölçüldü: `kurye@lezzetanatolia.fr` çağrı
  öncesi `auth_user_id`'siz, çağrı sonrası bağlı; `0002` trigger'ı profili e-postadan bulup bağlıyor
  ve ROLÜ koruyor (`/me` → `roles: ['courier']`, `/courier/day` 200, `/warehouse/preparation` 403).
  Yanlış cümlenin bedeli ölçülebilirdi: "personel yerelde giriş yapamaz" diye bir teşhis üretmişti.

  **Yaratmanın ZARARLI olduğu tek an var ve 26.08'de sahada görüldü** (mobil şeridin notu): cihaz
  turu sürerken `db:refresh` koştu, düğme aynı adrese bastı, auth kullanıcısı seed'den ÖNCE doğdu
  ve `0002`nin AÇILIŞ KURALI (*"hiç admin yoksa ilk hesap admin olur"*) ona `{admin}` verdi — kurye
  e-postalı, adsız, kapsamsız bir "yönetici". Kapı artık yalnız o pencereyi kapatıyor:
  tabloda hiç yönetici yoksa `dev_session_unseeded_database` (409) döner ve hiçbir şey yazmaz.
  Kurulu bir veritabanında kayıtsız e-posta ESKİSİ GİBİ kabul edilir — `preferences.test.ts`teki
  *"KAYITSIZ e-posta da kabul edilir, ve bu BİLİNÇLİ"* kararı yerinde duruyor. Ölçüt tek yerde
  (`@lezzet/application` → `auth/dev-login.ts`), çünkü webin kapısı da aynı kararı veriyor.

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

  const db = serviceDb();
  if ((await devLoginRefusal(db, body.data.email)) !== null) {
    // Ret ADLI dönüyor ama sebep loga HAM yazılıyor: istemci `uç: <ad>` gösteriyor (mobil
    // `lib/auth/dev-login.ts` künyesi) ve tek başına "neden" sorusunu cevaplamıyor.
    logger.warn(
      { context: 'dev-session', email: maskEmail(body.data.email), reason: DEV_LOGIN_UNSEEDED_DATABASE },
      'dev giriş: veritabanı kurulmamış',
    );
    return fail(c, 'dev_session_unseeded_database', 409);
  }

  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email: body.data.email });
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
