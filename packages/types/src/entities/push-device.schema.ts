import { z } from 'zod';

/**
 * **Push cihaz jetonu** (14.14, migration 0050) — "bu kişiye hangi cihazlardan ulaşılır" kaydı.
 *
 * ── CİHAZ BAŞINA TEK SAHİP, SAHİP DEVRİYLE ──────────────────────────────────
 * `token` tablo geneli tekildir ve kayıt RPC'si çakışmada SAHİBİ DEĞİŞTİRİR (son giren kazanır —
 * cihaz fiziksel olarak onun elindedir). Devir olmasaydı aile telefonunda önceki hesabın
 * bildirimi sonrakinin ekranına düşerdi: gecikme değil, kişisel veri ifşası.
 *
 * Jeton bir ADRES değil YETKİDİR — istemciye hiçbir uçtan geri okutulmaz; şemanın `token` alanı
 * yalnız sunucu içi akışta yaşar.
 */

/** 'web' BİLEREK yok — müşteri yüzeyinde web push yapılmıyor (KARARLAR 26.08). */
export const PushPlatformEnum = z.enum(['ios', 'android']);
export type PushPlatform = z.infer<typeof PushPlatformEnum>;

export const PushDeviceSchema = z.object({
  id: z.string().uuid(),
  /** Sahip — müşteri de personel de (operasyon kabuğu da push alacak; ad bu yüzden `profileId`). */
  profileId: z.string().uuid(),
  token: z.string(),
  platform: PushPlatformEnum,
  /** OS bildirim izni kapalı (uygulamanın açılış raporu) — dolu ise sürücü cihazı yeteneksiz sayar. */
  disabledAt: z.string().datetime({ offset: true }).nullable(),
  /** Bakım damgası ("bu kayıt bayat mı") — karşılaştırılan bir ölçüt değil. */
  lastSeenAt: z.string().datetime({ offset: true }),
  createdAt: z.string().datetime({ offset: true }),
});
export type PushDevice = z.infer<typeof PushDeviceSchema>;

/** Yazım tek kapıdan (RPC `register_push_device`) — elle insert yolu bilerek dar. */
export const PushDeviceInsertSchema = PushDeviceSchema.pick({ profileId: true, token: true, platform: true });
export type PushDeviceInsert = z.infer<typeof PushDeviceInsertSchema>;

/** Güncellenebilen tek şey izin/bakım hâli — kimlik ve jeton değişmez (devir RPC'nin işi). */
export const PushDeviceUpdateSchema = PushDeviceSchema.pick({ id: true }).extend(
  PushDeviceSchema.pick({ disabledAt: true, lastSeenAt: true }).partial().shape,
);
export type PushDeviceUpdate = z.infer<typeof PushDeviceUpdateSchema>;
