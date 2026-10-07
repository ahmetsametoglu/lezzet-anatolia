import { Hono } from 'hono';
import type { Context } from 'hono';
import { entryOfItem, restoreSavedItems } from '@lezzet/application';
import { CartService, serviceDb, UserProfileService, ZoneNoticeService, type Db } from '@lezzet/database';
import { MeSavedRestoreBodySchema, MeSavedViewSchema, type MeSavedView } from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import type { V1Env } from './auth';
import { localeOf, readCartView } from './cart-view';
import { placeQueryOf } from './catalog';

/*
  `/me/saved` — hesaptaki "Sonraya kaydedilenler" kartı: web'de sonraya ayrılan kalemler ve bekleyen bölge haberleri. Kalemler
  sepetin kendi okumasıyla çözülür ki ad, fiyat ve "bölge içi mi" iki yüzeyde aynı çıksın; her uç kartın güncel hâlini döner.
*/

export const saved = new Hono<V1Env>();

/** Kartın tamamı; `?locale=` zorunlu, `?postalCode=` kalemin bu adrese gelip gelmediğini çözer. */
async function viewOf(c: Context<V1Env>, db: Db, customerId: string): Promise<Response> {
  const locale = localeOf(c);
  if (!locale.success) return fail(c, 'invalid_locale', 400);
  const [cart, notices] = await Promise.all([new CartService(db).get(customerId), new ZoneNoticeService(db).listForCustomer(customerId)]);
  const read = await readCartView(db, locale.data, cart.savedItems.map(entryOfItem), {
    customerId,
    couponCode: null,
    ...placeQueryOf(c),
  });
  const body: MeSavedView = { saved: read.body.lines, zoneNotices: notices.map((notice) => ({ postalCode: notice.postalCode })) };
  return ok(c, MeSavedViewSchema.parse(body));
}

async function customerIdOf(c: Context<V1Env>, db: Db): Promise<string | null> {
  const profile = await new UserProfileService(db).findByAuthUserId(c.get('authUser').id);
  return profile?.id ?? null;
}

saved.get('/', async (c) => {
  const db = serviceDb();
  const customerId = await customerIdOf(c, db);
  if (!customerId) return fail(c, 'profile_not_found', 404);
  return viewOf(c, db, customerId);
});

/** Sepete geri alma; sepetin kendisi istemcide ayrıca tazelenir. */
saved.post('/restore', async (c) => {
  const body = MeSavedRestoreBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);
  const db = serviceDb();
  const customerId = await customerIdOf(c, db);
  if (!customerId) return fail(c, 'profile_not_found', 404);
  await restoreSavedItems(db, customerId, body.data.lines);
  return viewOf(c, db, customerId);
});

/** Bölge haberinden vazgeçme; yalnız müşterinin kendi kaydı silinir. */
saved.delete('/zone-notices/:postalCode', async (c) => {
  const db = serviceDb();
  const customerId = await customerIdOf(c, db);
  if (!customerId) return fail(c, 'profile_not_found', 404);
  await new ZoneNoticeService(db).removeForCustomer(customerId, c.req.param('postalCode'));
  return viewOf(c, db, customerId);
});
