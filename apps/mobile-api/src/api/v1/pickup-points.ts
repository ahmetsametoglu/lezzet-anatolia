import { Hono } from 'hono';
import { readPickupOffer } from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { CheckoutPickupSchema } from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import type { V1Env } from './auth';

/*
  Gel-al teklifi: adres seçicinin "depodan teslim al" kartı buradan okunur (sepet ve checkout aynı teklifi
  `readPickupOffer`dan alır). İki kapı sunucuda — müşteri izni ve gel-al noktası olan depo; izinsiz müşteriye `null`
  döner ve istemci kartı hiç çizmez.
*/
export const pickupPoints = new Hono<V1Env>();

pickupPoints.get('/', async (c) => {
  const db = serviceDb();
  const profile = await new UserProfileService(db).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);
  const { offer } = await readPickupOffer(db, profile.id, null);
  return ok(c, CheckoutPickupSchema.nullable().parse(offer));
});
