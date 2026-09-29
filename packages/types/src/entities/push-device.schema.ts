import { z } from 'zod';

/**
 * Jeton tablo genelinde tekildir ve kayıt RPC'si çakışmada sahibi değiştirir: cihaz son girenin elindedir, devir olmasaydı önceki
 * hesabın bildirimi sonrakinin ekranına düşerdi. Jeton bir yetkidir, istemciye hiçbir uçtan geri okutulmaz.
 */

/** Yalnız native platformlar; tarayıcı bildirimi yapılmıyor. */
export const PushPlatformEnum = z.enum(['ios', 'android']);
export type PushPlatform = z.infer<typeof PushPlatformEnum>;

/** Müşteri ve operasyon ayrı uygulamalardır, aynı kişinin iki kurulumu iki ayrı jetondur; müşteri gönderimi yalnız `customer` jetonlarını okur. */
export const PushAppEnum = z.enum(['customer', 'operations']);
export type PushApp = z.infer<typeof PushAppEnum>;

export const PushDeviceSchema = z.object({
  id: z.string().uuid(),
  /** Sahip — müşteri de personel de (operasyon kabuğu da push alacak; ad bu yüzden `profileId`). */
  profileId: z.string().uuid(),
  token: z.string(),
  platform: PushPlatformEnum,
  /** Varsayılanı yok: kayıt hangi uygulamadan geldiğini söylemek zorunda. */
  app: PushAppEnum,
  /** OS bildirim izni kapalı (uygulamanın açılış raporu) — dolu ise sürücü cihazı yeteneksiz sayar. */
  disabledAt: z.string().datetime({ offset: true }).nullable(),
  /** Bakım damgası ("bu kayıt bayat mı") — karşılaştırılan bir ölçüt değil. */
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
