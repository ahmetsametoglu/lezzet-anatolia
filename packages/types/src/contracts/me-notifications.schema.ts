import { z } from 'zod';
import { AppNotificationSchema } from '../entities/app-notification.schema';

/**
 * **`/me/notifications` zarfları** (14.13) — bildirim akışının uç sözleşmesi. Ucu mobil şerit
 * yazar (defter 26.08 girdisi: "uçları mobil şerit yazabilir, kural application'da"); web hesap
 * zili (14.15) aynı kapıdan doğrudan okur. Sözleşme burada ki iki tüketici tek şekle bağlansın.
 *
 * ── SATIR, ENTITY'DEN TÜRER — DARALTILARAK (CLAUDE §1: view-model şemadan) ──
 * Dışarı ÇIKMAYANLAR ve sebepleri:
 *   `profileId`    → zarfın sahibi zaten istek sahibi; satırda taşımak kimliği istemciye söylemek.
 *   `dedupeKey`    → iç tesisat (tekilleştirme formülü) — ekranın işi değil.
 *   `warehouseId`  → personel dağıtım süzgeci; müşteri yüzeyinde anlamı yok.
 *   `dismissedAt`  → liste gizleneni zaten taşımaz; alan hep null olurdu ve yalan söylerdi.
 */
export const MeNotificationSchema = AppNotificationSchema.pick({
  id: true,
  kind: true,
  targetType: true,
  targetId: true,
  payload: true,
  createdAt: true,
  readAt: true,
});
export type MeNotification = z.infer<typeof MeNotificationSchema>;

/**
 * Liste zarfı. `unread` LİSTEYLE BİRLİKTE gelir — ekran açılışında rozet ve satırlar tek turda;
 * ayrı istemek her açılışı iki tura mal ederdi. Rozetin TEK BAŞINA tazelenmesi (zil çaldığında)
 * için ayrı hafif zarf aşağıda.
 */
export const MeNotificationsPageSchema = z.object({
  notifications: z.array(MeNotificationSchema),
  /** Opak imleç — süzgeç değil (CLAUDE §1: imleç URL'e yazılmaz). `null` = kuyruk bitti. */
  nextCursor: z.string().nullable(),
  /** Okunmamış VE gizlenmemiş sayısı — tanım tek yerde (`AppNotificationService.UNREAD`). */
  unread: z.number().int(),
});
export type MeNotificationsPage = z.infer<typeof MeNotificationsPageSchema>;

/** Rozet zarfı — zil çalınca liste çekmeden tazelenir (kanal yükü boş, sayıyı uç söyler). */
export const MeNotificationBadgeSchema = z.object({ unread: z.number().int() });
export type MeNotificationBadge = z.infer<typeof MeNotificationBadgeSchema>;
