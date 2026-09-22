import { Hono } from 'hono';
import { readLinkedChannels, startWhatsappLink } from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { MeChannelLinkCodeSchema, MeChannelsSchema } from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import type { V1Env } from './auth';

/** Hesabın bağlı kanalları; kural web hesap sayfasıyla ortak okumada (`readLinkedChannels`). */
export const channels = new Hono<V1Env>();

channels.get('/', async (c) => {
  const db = serviceDb();
  const profile = await new UserProfileService(db).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);

  return ok(c, MeChannelsSchema.parse({ channels: await readLinkedChannels(db, profile.id) }));
});

// Her basış yeni kod üretir ve eskisini geçersizler; bağı, müşterinin kendi sohbetinden gönderdiği mesajı işleyen webhook kurar.
channels.post('/code', async (c) => {
  const db = serviceDb();
  const profile = await new UserProfileService(db).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);

  const outcome = await startWhatsappLink(db, profile.id);
  if (outcome.status === 'profile_not_found') return fail(c, 'profile_not_found', 404);
  if (outcome.status !== 'ok') return fail(c, 'unavailable', 503);
  return ok(c, MeChannelLinkCodeSchema.parse({ code: outcome.code, expiresAt: outcome.expiresAt }));
});
