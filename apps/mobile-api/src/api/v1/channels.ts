import { Hono } from 'hono';
import { readLinkedChannels } from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { MeChannelsSchema } from '@lezzet/types';
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
