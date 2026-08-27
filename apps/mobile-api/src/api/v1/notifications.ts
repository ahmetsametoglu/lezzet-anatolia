import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { z } from 'zod';
import {
  dismissNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  registerPushDevice,
  unreadNotificationCount,
  unregisterPushDevice,
} from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE, MeNotificationBadgeSchema, MeNotificationsPageSchema, PushPlatformEnum } from '@lezzet/types';
import { decodeCursor, encodeCursor } from '../../lib/request';
import { fail, ok } from '../../lib/respond';
import type { V1Env } from './auth';

/*
  `/me/notifications` (14.13) — uygulamadaki zilin veri kaynağı. KURAL BURADA DEĞİL: sahiplik
  süzgeci, "akış ≠ gelen kutusu" davranışı ve rozet tanımı `@lezzet/application`ın okuma
  kapısında (`notification/read.ts` künyesi — web hesap zili 14.15'te AYNI kapıdan okuyacak).
  Bu dosya taşıma katmanıdır: kimliği çözer, imleci açar/kapar, sonucu zarfa koyar.

  ── UÇ GÜVENLİĞİ İLKESİ (okuma kapısının künyesinden) ──────────────────────
  `profileId` HER ZAMAN buradaki middleware'den (oturumdan) gelir, istemciden ASLA. İstemcinin
  verdiği tek kimlik satır kimliğidir ve kapı onu daima sahiplik süzgeciyle kullanır — yabancı
  satır `not_found` alır, "yasak" değil (yasak, satırın varlığını söylerdi).
*/

const ListQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(DEFAULT_PAGE_SIZE),
  /**
   * KİTLE — çağıran yüzey beyan eder (kapı künyesi: karma profilde personel satırı müşteri
   * akışına düşüp sözlükte genel cümleye iniyordu; ölçüldü 26.08 — 120 tek tip satır).
   * Varsayılan müşteri: uygulamanın bildirim ekranı/rozeti; operasyon kabuğu `staff` ister.
   */
  audience: z.enum(['customer', 'staff']).default('customer'),
});

const IdParamSchema = z.string().uuid();

/** `authUser` (auth uuid) ≠ müşteri kimliği (`user_profiles.id`) — kapıların istediği hep ikincisi. */
interface CustomerEnv {
  Variables: V1Env['Variables'] & { customerId: string };
}

/** Profil çözümü tek middleware'de — beş uç aynı satırları tekrar etmesin (points/adres deseni). */
async function resolveCustomer(c: Context<CustomerEnv>, next: Next): Promise<Response | void> {
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);
  c.set('customerId', profile.id);
  await next();
}

export const notifications = new Hono<CustomerEnv>();
notifications.use('*', resolveCustomer);

/**
 * Akış — satırlar + imleç + rozet TEK turda (ekran açılışının tamamı; ayrı istemek her açılışı
 * iki tura mal ederdi). Gövde `z.input` ile tiplenir: kapının şekli sözleşmeden saparsa burası
 * DERLENMEZ (points/history emsali). `parse` ayrıca süzgeçtir — `profileId`/`dedupeKey`/
 * `warehouseId` zarfa sızamaz (sözleşme künyesindeki daraltma).
 */
notifications.get('/', async (c) => {
  const parsed = ListQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return fail(c, 'invalid_query', 400);

  const feed = await listNotifications(serviceDb(), {
    profileId: c.get('customerId'),
    audience: parsed.data.audience,
    cursor: decodeCursor(parsed.data.cursor),
    limit: parsed.data.limit,
  });

  const body: z.input<typeof MeNotificationsPageSchema> = {
    notifications: feed.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      targetType: row.targetType,
      targetId: row.targetId,
      payload: row.payload,
      createdAt: row.createdAt,
      readAt: row.readAt,
    })),
    nextCursor: feed.nextCursor ? encodeCursor(feed.nextCursor) : null,
    unread: feed.unread,
  };
  return ok(c, MeNotificationsPageSchema.parse(body));
});

/** Rozet — zil çalınca (kanal yükü boş) liste çekmeden tazeleme. Kitle listedeki kuralın aynısı. */
notifications.get('/badge', async (c) => {
  const audience = c.req.query('audience') === 'staff' ? 'staff' : 'customer';
  const unread = await unreadNotificationCount(serviceDb(), c.get('customerId'), audience);
  return ok(c, MeNotificationBadgeSchema.parse({ unread }));
});

/**
 * Okundu işareti. `not_found` 404 ile döner ve iki hâli BİLEREK ayırt etmez (satır yok / satır
 * başkasının) — ayrım, kimlik tahmin eden birine satırın varlığını söylerdi (okuma kapısı künyesi).
 */
notifications.post('/:id/read', async (c) => {
  const id = IdParamSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'invalid_id', 400);

  const sonuc = await markNotificationRead(serviceDb(), { profileId: c.get('customerId'), notificationId: id.data });
  if (sonuc !== 'ok') return fail(c, 'not_found', 404);
  return ok(c, { done: true });
});

/** "Hepsini gördüm" — rozeti tek dokunuşta kapatır; imza gereği yalnız kendi satırları ve KENDİ kitlesi. */
notifications.post('/read-all', async (c) => {
  const audience = c.req.query('audience') === 'staff' ? 'staff' : 'customer';
  await markAllNotificationsRead(serviceDb(), c.get('customerId'), audience);
  return ok(c, { done: true });
});

/** Gizle — listeden ve rozetten kalkar; satır silinmez (akış kapısının kararı). */
notifications.post('/:id/dismiss', async (c) => {
  const id = IdParamSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'invalid_id', 400);

  const sonuc = await dismissNotification(serviceDb(), { profileId: c.get('customerId'), notificationId: id.data });
  if (sonuc !== 'ok') return fail(c, 'not_found', 404);
  return ok(c, { done: true });
});

/*
  ── CİHAZ JETONU UÇLARI (14.14) — aynı taşıma dosyasında, aynı middleware ─────────────────────────
  Ayrı dosya açılmadı: `resolveCustomer` üçüncü kez kopyalanacaktı (CLAUDE §1) ve iki uç ailesi
  aynı konunun iki yarısı — bildirimi OKUYAN cihaz, bildirimi ALACAK cihazdır.

  Jeton hiçbir cevapta GERİ OKUTULMAZ ve URL'e de yazılmaz (erişim logları): iki uç da POST, jeton
  gövdede. Jeton bir yetkidir — o cihaza bildirim gösterme yetkisi.
*/

const RegisterDeviceSchema = z.object({
  token: z.string().min(10).max(200),
  platform: PushPlatformEnum,
  /** OS bildirim izni — uygulama her açılışta raporlar; kapalıysa cihaz gönderilebilir sayılmaz. */
  enabled: z.boolean(),
});

const RemoveDeviceSchema = z.object({ token: z.string().min(10).max(200) });

export const pushDevices = new Hono<CustomerEnv>();
pushDevices.use('*', resolveCustomer);

/** Kaydol/tazele — çakışmada SAHİP DEVRİ (kapının künyesi: cihaz son girenin kulağıdır). */
pushDevices.post('/', async (c) => {
  const parsed = RegisterDeviceSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  await registerPushDevice(serviceDb(), { profileId: c.get('customerId'), ...parsed.data });
  return ok(c, { done: true });
});

/**
 * Çıkış — logout akışının ZORUNLU adımı: jeton kalırsa önceki hesabın bildirimi sonraki oturum
 * sahibine düşer. `removed:false` hata DEĞİL (çıkış idempotent; cihaz devrolmuş olabilir) —
 * istemci yine de görsün: sessizce hiçbir şey silmemiş bir çıkış, ölçülemeyen bir çıkıştır.
 */
pushDevices.post('/remove', async (c) => {
  const parsed = RemoveDeviceSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const removed = await unregisterPushDevice(serviceDb(), { profileId: c.get('customerId'), token: parsed.data.token });
  return ok(c, { removed });
});
