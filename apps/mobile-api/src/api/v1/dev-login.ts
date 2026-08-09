import { Hono } from 'hono';
import { z } from 'zod';
import { serviceDb } from '@lezzet/database';
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
*/

const DevSessionBodySchema = z.object({ email: z.string().email() });

export const devLogin = new Hono();

devLogin.post('/dev-session', async (c) => {
  const body = DevSessionBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const { data, error } = await serviceDb().auth.admin.generateLink({ type: 'magiclink', email: body.data.email });
  const tokenHash = data?.properties?.hashed_token;
  // Kayıtsız e-posta da buraya düşer — dev kapısı kullanıcı YARATMAZ (yaratma ayrı ve bilinçli iş).
  if (error !== null || !tokenHash) return fail(c, 'dev_session_failed', 400);

  return ok(c, { tokenHash });
});
