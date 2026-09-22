import { Hono } from 'hono';
import { startWhatsappLink } from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { MeWhatsappLinkSchema } from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import type { V1Env } from './auth';

/*
  Uç yalnız kodu verir; bağı, müşterinin kendi WhatsApp'ından gönderdiği mesajı işleyen webhook kurar. Hazır mesaj ve işletmenin
  hattı istemcide kurulur, çünkü metin sözlükte, hat marka paketinde yaşar.
*/

export const whatsapp = new Hono<V1Env>();

// Her basış yeni kod üretir ve eskisini geçersizler: açılıp gönderilmeyen bağlantının kodu ekranda görünmeden yaşamasın.
whatsapp.post('/', async (c) => {
  const db = serviceDb();
  const profile = await new UserProfileService(db).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);

  const outcome = await startWhatsappLink(db, profile.id);
  if (outcome.status === 'profile_not_found') return fail(c, 'profile_not_found', 404);
  if (outcome.status !== 'ok') return fail(c, 'unavailable', 503);
  return ok(c, MeWhatsappLinkSchema.parse({ code: outcome.code, expiresAt: outcome.expiresAt }));
});
