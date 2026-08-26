import { AppNotificationService, serviceDb } from '@lezzet/database';
import { STAFF_NOTIFICATION_KINDS } from '@lezzet/types';

export const NOTIFICATION_RETENTION = 'notification_retention';

/**
 * Personel bildirim satırlarının saklama süpürmesi (14.15 — kurgu incelemesinin 13. bulgusu).
 *
 * **Neden yalnız personel:** müşteri akışı müşterinin GEÇMİŞİDİR ("az önce ne gelmişti" sorusunun
 * cevabı) ve hesabıyla yaşar — 0037 silme kapsamında zaten temizleniyor. Personel satırı ise
 * fan-out ile KİŞİ BAŞINA çoğalır (bir belge düşüşü N yöneticiye N satır) ve görülmüş hâli iş
 * değil gürültüdür: kuyruğu bildirim değil ekranlar taşır (bildirim ≠ kuyruk, modülün ilk kararı).
 *
 * **Görülmemiş satır SÜPÜRÜLMEZ.** Okunmamış personel bildirimi bekleyen bir işin işaretidir;
 * yaşlandı diye silmek, işi görünmez kılmaktır (çözülmemiş hatanın `purge-observability`daki
 * aynı kuralı). Süre yalnız okunan/gizlenen satırlar için işler.
 *
 * Taramalı ve idempotent: "eşikten eski görülmüş her şey" → kaçan gün ertesi turda telafi olur.
 */

/**
 * Saklama (gün) — parametrik (`NOTIFICATION_RETENTION_DAYS`), varsayılan 90: çözülmüş hata
 * kaydıyla aynı sayı ve aynı gerekçe — bu satırlar da teşhis/haber verisidir, iş kaydı değil;
 * ikinci bir eşik uydurmanın gerekçesi yok.
 */
const RETENTION_DAYS = Number(process.env.NOTIFICATION_RETENTION_DAYS ?? 90);

const DAY_MS = 24 * 60 * 60 * 1000;

export async function notificationRetentionJob(): Promise<Record<string, unknown>> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS).toISOString();
  const purged = await new AppNotificationService(serviceDb()).purgeSeenStaffBefore(cutoff, STAFF_NOTIFICATION_KINDS);
  return { purged, retentionDays: RETENTION_DAYS };
}
