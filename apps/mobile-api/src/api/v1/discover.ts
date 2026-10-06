import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { z } from 'zod';
import { claimDiscoverSwipes, openDiscoverDeck, readDiscoverReward, recordDiscoverSwipe } from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { isProfessionalCustomer } from '@lezzet/domain-core';
import {
  DiscoverClaimBodySchema,
  DiscoverClaimResultSchema,
  DiscoverDeckSchema,
  DiscoverSwipeSchema,
  DiscoverVoteBodySchema,
  PreferredLanguageEnum,
} from '@lezzet/types';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';
import { readJsonBody } from '../../lib/request';
import { optionalCustomerId, optionalCustomerProfile, type V1Env } from './auth';

/**
 * Keşif uçları: deste ve oy ziyaretçiye açık, çünkü girişi turun önüne koymak turu hiç başlatmamaktır; Bearer varsa oylanmış
 * kartlar elenir ve oy sahibine yazılır. Talep kapısı kimliğin kendisidir, `/me` altında ve kimliği bağlamdan alır.
 */
export const discover = new Hono<AppEnv>();

/**
 * Turun destesi; `locale` zorunlu, çünkü sessizce Türkçeye düşmek gizli bir arızadır. Boş deste 200'dür, aday yokluğu arıza
 * değildir.
 */
discover.get('/discover', async (c) => {
  const locale = PreferredLanguageEnum.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const db = serviceDb();
  const profile = await optionalCustomerProfile(db, c.req.header('authorization'));
  const [cards, reward] = await Promise.all([
    openDiscoverDeck(db, locale.data, profile?.id ?? null, isProfessionalCustomer(profile)),
    readDiscoverReward(db),
  ]);

  // ── SÖZLEŞMENİN KİLİDİ (`catalog.ts` emsali) ──────────────────────────────
  // Gövde `z.input<…>` ile TİPLENİR: kapının döndürdüğü şekil sözleşmeye alan alan uymak zorunda ve
  // uymadığı gün burası DERLENMEZ. `parse` ayrıca SÜZGEÇTİR — fazla alan zarfa sızamaz.
  const body: z.input<typeof DiscoverDeckSchema> = { cards, reward };
  return ok(c, DiscoverDeckSchema.parse(body));
});

/** Bir kartın kaydırılması; motorun iç retleri müşteriye anlatılmaz, düzeltebileceği bir şey değil. */
discover.post('/discover/vote', async (c) => {
  const body = DiscoverVoteBodySchema.safeParse(await readJsonBody(c));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const db = serviceDb();
  const customerId = await optionalCustomerId(db, c.req.header('authorization'));
  const outcome = await recordDiscoverSwipe(db, { customerId, ...body.data });
  if (outcome.status !== 'ok') return fail(c, 'swipe_failed', 400);

  const swipe: z.input<typeof DiscoverSwipeSchema> = outcome.swipe;
  return ok(c, DiscoverSwipeSchema.parse(swipe));
});

/** `authUser` (auth uuid) ≠ müşteri kimliği (`user_profiles.id`) — kapının istediği ikincisi. */
interface CustomerEnv {
  Variables: V1Env['Variables'] & { customerId: string };
}

/**
 * Profil çözümü — `addresses.ts`teki desenin aynısı: profili olmayan auth kullanıcısı
 * `profile_not_found` (404) alır. Sessizce "0 bağlandı" dönmek, ziyaretçinin turunu kaybettiği bir
 * arızayı görünmez kılardı.
 */
async function resolveCustomer(c: Context<CustomerEnv>, next: Next): Promise<Response | void> {
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);
  c.set('customerId', profile.id);
  await next();
}

/**
 * Girişsiz turun hesaba bağlanması. Hiçbiri bağlanamasa bile 200 döner: eskimiş liste hata değil gecikmiş bir istektir ve girişi
 * başarılı müşteriye kırmızı ekran gösterilmemeli.
 */
export const discoverClaim = new Hono<CustomerEnv>();
discoverClaim.use('*', resolveCustomer);

discoverClaim.post('/claim', async (c) => {
  const body = DiscoverClaimBodySchema.safeParse(await readJsonBody(c));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const result = await claimDiscoverSwipes(serviceDb(), c.get('customerId'), body.data.swipeIds);
  const claim: z.input<typeof DiscoverClaimResultSchema> = result;
  return ok(c, DiscoverClaimResultSchema.parse(claim));
});
