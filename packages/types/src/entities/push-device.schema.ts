import { z } from 'zod';

/**
 * Jeton tablo genelinde tekildir ve kayıt RPC'si çakışmada sahibi değiştirir: cihaz son girenin elindedir, devir olmasaydı önceki
 * hesabın bildirimi sonrakinin ekranına düşerdi. Jeton bir yetkidir, istemciye hiçbir uçtan geri okutulmaz.
 */

export const DevicePlatformEnum = z.enum(['ios', 'android', 'web']);
export type DevicePlatform = z.infer<typeof DevicePlatformEnum>;

/** Native platformlar; native kayıt ucu tarayıcı aboneliği kabul etmez, çünkü o iki şifreleme anahtarı olmadan yazılamaz. */
export const PushPlatformEnum = DevicePlatformEnum.exclude(['web']);
export type PushPlatform = z.infer<typeof PushPlatformEnum>;

/** Müşteri ve operasyon ayrı uygulamalardır, aynı kişinin iki kurulumu iki ayrı jetondur; müşteri gönderimi yalnız `customer` jetonlarını okur. */
export const PushAppEnum = z.enum(['customer', 'operations']);
export type PushApp = z.infer<typeof PushAppEnum>;

/**
 * Android bildirim kanalı: uygulama kaydolurken kurar, sunucu cihaz bildirimini ona gönderir. Operasyonunki ayrıdır ve yüksek önemle
 * kurulur ki personel haberi başka bir uygulama açıkken de ekranın üstüne düşsün; Android var olan kanalın önemini sonradan yükseltmez.
 */
export const PUSH_CHANNEL: Record<PushApp, string> = { customer: 'default', operations: 'personel' };

/** Tarayıcıların bildirim servisleri (Chrome, Safari, Firefox, Edge). */
const PUSH_SERVICE_HOSTS = ['fcm.googleapis.com', 'push.apple.com', 'push.services.mozilla.com', 'notify.windows.com'];

/**
 * Sunucu bildirimi bu adrese POST eder; liste dışı adres kabul edilseydi müşteri sunucumuzu istediği iç adrese istek atar hâle
 * getirebilirdi.
 */
function isPushServiceUrl(endpoint: string): boolean {
  const hostname = /^https:\/\/([a-z0-9.-]+)(?::\d+)?\//i.exec(endpoint)?.[1]?.toLowerCase();
  if (hostname === undefined) return false;
  return PUSH_SERVICE_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

/** Tarayıcının `PushSubscription.toJSON()` çıktısı: gönderim adresi ve gövdeyi şifreleyen iki anahtar. */
export const WebPushSubscriptionSchema = z.object({
  endpoint: z.string().max(1000).refine(isPushServiceUrl),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
export type WebPushSubscription = z.infer<typeof WebPushSubscriptionSchema>;

export const PushDeviceSchema = z.object({
  id: z.string().uuid(),
  /** Sahip — müşteri de personel de (operasyon kabuğu da push alacak; ad bu yüzden `profileId`). */
  profileId: z.string().uuid(),
  /** Expo jetonu ya da tarayıcı aboneliğinin adresi. */
  token: z.string(),
  platform: DevicePlatformEnum,
  /** Varsayılanı yok: kayıt hangi uygulamadan geldiğini söylemek zorunda. */
  app: PushAppEnum,
  /** OS bildirim izni kapalı (uygulamanın açılış raporu) — dolu ise sürücü cihazı yeteneksiz sayar. */
  disabledAt: z.string().datetime({ offset: true }).nullable(),
  /** Tarayıcı aboneliğinin şifreleme anahtarları; yalnız web satırında dolu. */
  p256dh: z.string().nullable(),
  auth: z.string().nullable(),
  /** Uzun süre görülmeyen native cihaz etkin sayılmaz ve haber tarayıcıya gider. */
  lastSeenAt: z.string().datetime({ offset: true }),
  createdAt: z.string().datetime({ offset: true }),
});
export type PushDevice = z.infer<typeof PushDeviceSchema>;

/** Yazım tek kapıdan (RPC `register_push_device`) — elle insert yolu bilerek dar. */
export const PushDeviceInsertSchema = PushDeviceSchema.pick({ profileId: true, token: true, platform: true, app: true });
export type PushDeviceInsert = z.infer<typeof PushDeviceInsertSchema>;

/** Güncellenebilen tek şey izin/bakım hâli — kimlik ve jeton değişmez (devir RPC'nin işi). */
export const PushDeviceUpdateSchema = PushDeviceSchema.pick({ id: true }).extend(
  PushDeviceSchema.pick({ disabledAt: true, lastSeenAt: true }).partial().shape,
);
export type PushDeviceUpdate = z.infer<typeof PushDeviceUpdateSchema>;
