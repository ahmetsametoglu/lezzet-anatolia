import { staffNotificationBrief } from '@lezzet/i18n';
import type { AppNotificationKind } from '@lezzet/types';

import type { NotificationRow } from '@/lib/api/notifications';
import type { OperationsSection } from '@/lib/operations/sections';

/*
  UÇTAN GELEN SATIR → OPERASYON BİLDİRİMİ (14.13 — fixture'ın yerini alan çeviri katmanı).
  Fixture künyesi sözünü tutuyor: "gerçek akış geldiği gün bu dosya silinir, süzme kuralı yerinde
  kalır" — kural (`visibleNotifications`) gerçekten yerinde, değişen yalnız veri kaynağı.

  ── BAŞLIK + TON `@lezzet/i18n`DEN (14.15 terfisi) ──────────────────────────
  Web operasyon zili aynı personel satırını aynı başlıkla göstermek zorunda — sözlük paylaşılan
  pakete taşındı (`staffNotificationBrief`, Türkçe: operasyon yüzeyi tek dil, CLAUDE §2). Burada
  YÜZEYE ÖZGÜ olan kalır: satırın hangi BÖLÜME düştüğü (webde karşılığı rota) ve bilinmeyen türün
  genel metni — "uygulamayı güncelleyin" ancak mobilde anlamlı, web her zaman sunucuyla eşzamanlı.

  ── KÜME AÇIK: bilinmeyen tür SESSİZCE DÜŞMEZ ───────────────────────────────
  `kind` sunucuda büyür; eski sürüm yeni personel türünü genel satırla gösterir (yönetim/quiet).
*/

/** Satır başındaki noktanın tonu — fixture'dan taşındı (token ADI, renk değil; CLAUDE §3). */
export type NotificationDot = 'courier' | 'warehouse' | 'attention' | 'alert' | 'quiet';

/** Ekranın çizdiği şekil — fixture'ın sözleşmesi, artık uçtan kurulur. */
export interface OperationsNotification {
  id: string;
  title: string;
  section: OperationsSection;
  dot: NotificationDot;
  ago: string;
}

/** Türün düştüğü bölüm — yüzeye özgü (webde karşılığı rota). Yeni personel türü eşlemesini BURAYA getirir. */
const SECTION: Partial<Record<AppNotificationKind, OperationsSection>> = {
  document_undeliverable: 'management',
};

/** Bilinmeyen türün genel satırı — metin mobile özgü (yukarıdaki künye). */
const FALLBACK = { section: 'management' as OperationsSection, dot: 'quiet' as NotificationDot, title: 'Yeni bir bildirim — ayrıntı için uygulamayı güncelleyin' };

/**
 * Göreli zaman, Türkçe — fixture'ın "2 dk" biçimi (v2). Dakika altı "şimdi": saniye saymak,
 * operatöre yanlış bir aciliyet ritmi dayatmak olurdu.
 */
export function agoOf(createdAt: string, now: Date): string {
  const ms = now.getTime() - new Date(createdAt).getTime();
  const dk = Math.floor(ms / 60_000);
  if (dk < 1) return 'şimdi';
  if (dk < 60) return `${dk} dk`;
  const sa = Math.floor(dk / 60);
  if (sa < 24) return `${sa} sa`;
  return `${Math.floor(sa / 24)} g`;
}

export function toOperationsNotification(row: NotificationRow, now: Date): OperationsNotification {
  const brief = staffNotificationBrief(row);
  return {
    id: row.id,
    title: brief?.title ?? FALLBACK.title,
    section: SECTION[row.kind as AppNotificationKind] ?? FALLBACK.section,
    // Paylaşılan ton (`alert`/`quiet`) mobil nokta paletinin alt kümesi — doğrudan geçer.
    dot: brief?.tone ?? FALLBACK.dot,
    ago: agoOf(row.createdAt, now),
  };
}
