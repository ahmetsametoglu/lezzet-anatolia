import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { z } from 'zod';
import {
  acceptNeighborInvite,
  countNeighborInviteUses,
  declineNeighborInvite,
  neighborInviteUrl,
  readInviteWelcome,
  readNeighborWelcome,
  tryAttachReferral,
  tryOpenNeighborInvite,
} from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { NEIGHBOR_INVITE_MAX_USES } from '@lezzet/domain-core';
import { InviteWelcomeSchema, NeighborWelcomeSchema, OrderNeighborInviteSchema } from '@lezzet/types';
import { logger } from '@lezzet/observability';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';
import { optionalCustomerId, type V1Env } from './auth';
import { localeOf } from './cart-view';

/**
 * `GET /api/v1/invite/:code` — web'in davet sayfasıyla aynı kapıyı (`readInviteWelcome`) çağıran açık uç: davetlinin henüz hesabı
 * yok, ama jeton varsa okunur ki kendi bağlantısını ya da tanıdığınınkini açan müşteri "hesap aç" ekranına düşmesin. Tanınmayan kod
 * da 200 döner, çünkü bağlantı sohbette kırpılmış olabilir ve 404 kapıdaki davetliyi geri çevirmek olur.
 */
export const invite = new Hono<AppEnv>();

invite.get('/invite/:code', async (c) => {
  const db = serviceDb();
  const viewerId = await optionalCustomerId(db, c.req.header('authorization'));
  const welcome = await readInviteWelcome(db, c.req.param('code'), viewerId);

  // `z.input<…>` kilidi: motorun hâl kümesi sözleşmeden saparsa sessiz uyumsuzluk yerine derleme hatası çıkar.
  const body: z.input<typeof InviteWelcomeSchema> = welcome;
  return ok(c, InviteWelcomeSchema.parse(body));
});

/**
 * `GET /api/v1/neighbor/:token` — getiren davetiyle aynı kimlik rejimi, ama davet bir sefere çağırdığı için seferin geçmesi ve
 * kontenjanın dolması da hâl. Reddedilen hâller de tarih taşır ki komşuya neyi kaçırdığı söylenebilsin.
 */
invite.get('/neighbor/:token', async (c) => {
  const db = serviceDb();
  const viewerId = await optionalCustomerId(db, c.req.header('authorization'));
  const welcome = await readNeighborWelcome(db, c.req.param('token'), viewerId);

  /* `z.input` kilidi bilerek yok: motorun hâli operasyonun iç künyesi olan `deliveryZoneId`yi de taşıyor ve `parse` onu
     süzüyor, komşuya söylenecek şey gündür. */
  return ok(c, NeighborWelcomeSchema.parse(welcome));
});

/**
 * İki davet birden gelebilir (önce bir arkadaşın bağlantısı, sonra bir komşunun sefer daveti); tek istekte gelir ki biri düşerse
 * öteki yarım kalmasın.
 */
const ClaimBodySchema = z
  .object({ referralCode: z.string().min(1).optional(), neighborToken: z.string().min(1).optional() })
  .refine((body) => body.referralCode !== undefined || body.neighborToken !== undefined, {
    message: 'en az bir davet gerekli',
  });

/** `authUser` (auth uuid) ≠ müşteri kimliği (`user_profiles.id`) — komşu kapılarının istediği ikincisi. */
interface CustomerEnv {
  Variables: V1Env['Variables'] & { customerId: string };
}

/** Profil çözümü tek middleware'de (puan uçlarının deseni); profili olmayan auth kullanıcısı 404. */
async function resolveCustomer(c: Context<CustomerEnv>, next: Next): Promise<Response | void> {
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);
  c.set('customerId', profile.id);
  await next();
}

/**
 * `POST /api/v1/me/invite/claim` — her giriş yolunun (e-posta kodu, Google) ardından cihazın tek kapısı; kod yalnız OTP gövdesinde
 * taşınsaydı Google ile giren davetli sessizce bağsız kalırdı. Cevap hep 200 ve `true`: kaydolmayı yeni bitirmiş kişiye "davetin
 * geçersiz" demek doğru değil, reddin gerekçesi log'a düşer.
 */
export const inviteClaim = new Hono<CustomerEnv>();
inviteClaim.use('*', resolveCustomer);

inviteClaim.post('/claim', async (c) => {
  const body = ClaimBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  if (body.data.referralCode) await tryAttachReferral(serviceDb(), c.get('authUser').id, body.data.referralCode);
  if (body.data.neighborToken) await claimNeighbor(c.get('customerId'), body.data.neighborToken);
  return ok(c, true);
});

/**
 * Web'deki `handOffNeighbor`ın ikizi: girişi asla düşürmez ve reddi müşteriye söylemez, çünkü karşılama ekranı zaten söyledi.
 * Gerekçe log'a düşer; "davet neden yazılmadı" sorusunun tek cevap kaynağı orası.
 */
async function claimNeighbor(customerId: string, token: string): Promise<void> {
  try {
    const outcome = await acceptNeighborInvite(serviceDb(), { token, customerId });
    if (outcome.status !== 'ok') {
      logger.info({ context: 'api/invite', customerId, reason: outcome.reason }, 'komşu daveti kabul edilmedi');
    }
  } catch (err) {
    logger.warn(
      { context: 'api/invite', customerId, err: err instanceof Error ? err.message : String(err) },
      'komşu daveti kişiye yazılamadı — giriş etkilenmedi',
    );
  }
}

const OpenBodySchema = z.object({ orderId: z.string().uuid() });

/**
 * `POST /api/v1/me/invite/neighbor` — okuma gibi görünse de ilk çağrı daveti üretir, GET olsaydı önyükleyen her şey satır açardı.
 * `inviteUrl: null` meşru hâldir (kargo siparişi, kesimi geçmiş sefer, başkasının siparişi): ayrı cevap vermek olmayan bir
 * siparişin varlığını doğrulardı.
 */
inviteClaim.post('/neighbor', async (c) => {
  const body = OpenBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  /* Dil zorunlu ve varsayılansız: bağlantının dili paylaşanın dilidir, sessizce Türkçeye düşmek Alsaslı müşteriye Türkçe adres
     paylaştırırdı. */
  const locale = localeOf(c);
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const db = serviceDb();
  const invite = await tryOpenNeighborInvite(db, { orderId: body.data.orderId, customerId: c.get('customerId') });
  /* Kalan hak sunucuda sayılır: tüketim ve tavan kuralını istemciye taşımak ikinci kopya olurdu. Davet yoksa sayı 0, çünkü
     sözleşme "bilinmiyor" hâli taşımıyor. */
  const remainingUses = invite === null ? 0 : Math.max(0, invite.maxUses - (await countNeighborInviteUses(db, invite.id)));
  return ok(
    c,
    OrderNeighborInviteSchema.parse({
      inviteUrl: invite === null ? null : neighborInviteUrl(invite.token, locale.data),
      remainingUses,
      maxUses: invite?.maxUses ?? NEIGHBOR_INVITE_MAX_USES,
    }),
  );
});

/**
 * `POST /api/v1/me/invite/neighbor/decline` — kabul satırı silinmez, ret damgalanır ve aynı bağlantıya yeniden dokunulunca geri
 * alınır. Bu router'da, çünkü "kim reddediyor" Bearer'dan çözülmeli; açık uçta başkasının davetini reddettirmek mümkün olurdu.
 */
const DeclineNeighborBodySchema = z.object({ inviteId: z.string().uuid() });

inviteClaim.post('/neighbor/decline', async (c) => {
  const body = DeclineNeighborBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const outcome = await declineNeighborInvite(serviceDb(), {
    inviteId: body.data.inviteId,
    customerId: c.get('customerId'),
  });
  if (outcome.status === 'rejected') return fail(c, 'invite_not_found', 404);
  return ok(c, true);
});
