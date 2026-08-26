import type { AppNotificationKind } from '@lezzet/types';

import type { NotificationRow } from '@/lib/api/notifications';
import type { OperationsSection } from '@/lib/operations/sections';

/*
  UÇTAN GELEN SATIR → OPERASYON BİLDİRİMİ (14.13 — fixture'ın yerini alan çeviri katmanı).
  Fixture künyesi sözünü tutuyor: "gerçek akış geldiği gün bu dosya silinir, süzme kuralı yerinde
  kalır" — kural (`visibleNotifications`) gerçekten yerinde, değişen yalnız veri kaynağı.

  ── BAŞLIK BURADA KURULUR, TÜRKÇE ───────────────────────────────────────────
  Operasyon yüzeyi yalnız Türkçe (CLAUDE §2); satır metin taşımaz (14.12), cümle ekranın işi.
  Müşteri tarafındaki `notification-copy` üç dilli ve MÜŞTERİ cümleleri kurar — bu ikisi aynı
  sözlüğün kopyası değil, iki ayrı seslenişin sözlükleri: müşteriye "siparişiniz", operatöre
  "e-postasız müşterinin onayı".

  ── KÜME AÇIK: bilinmeyen tür SESSİZCE DÜŞMEZ ───────────────────────────────
  `kind` sunucuda büyür; eski sürüm yeni personel türünü genel satırla gösterir (yönetim/quiet).
  Müşteri türü bir personel akışına DÜŞMEZ zaten — sunucu satırı kime yazdıysa o görür; yine de
  eşleme müşteri türlerini tanır: personel bir gün müşteri olayına abone edilirse satır adsız
  kalmasın.
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

interface KindMap {
  section: OperationsSection;
  dot: NotificationDot;
  title: (payload: Record<string, unknown>) => string;
}

const refOf = (payload: Record<string, unknown>): string =>
  typeof payload.referenceNo === 'string' && payload.referenceNo !== '—' ? ` — ${payload.referenceNo}` : '';

/** Personel türleri. Bugün tek tür var; yenisi eklendiğinde eşlemesi de BURAYA gelir. */
const KIND_MAP: Partial<Record<AppNotificationKind, KindMap>> = {
  document_undeliverable: {
    section: 'management',
    // `alert`: kırmızı — yasal belge insana düştü ve bekleyen bir insan işi var (fixture'ın
    // "yeni şikâyet" tonuyla aynı aciliyet sınıfı).
    dot: 'alert',
    title: (p) => `Ulaştırılamayan sipariş onayı${refOf(p)} — müşterinin e-postası yok`,
  },
};

const FALLBACK: KindMap = {
  section: 'management',
  dot: 'quiet',
  title: () => 'Yeni bir bildirim — ayrıntı için uygulamayı güncelleyin',
};

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
  const map = KIND_MAP[row.kind as AppNotificationKind] ?? FALLBACK;
  return {
    id: row.id,
    title: map.title(row.payload),
    section: map.section,
    dot: map.dot,
    ago: agoOf(row.createdAt, now),
  };
}
