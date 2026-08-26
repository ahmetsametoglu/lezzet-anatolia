import { staffNotificationBrief, type StaffNotificationTone } from '@lezzet/i18n';
import type { MeNotification } from '@lezzet/types';

/*
  UÇTAN GELEN SATIR → OPERASYON ZİL SATIRI (14.15) — mobil kabuğun `notification-map`inin web eşi.
  Başlık ve ton PAYLAŞILAN sözlükten (`staffNotificationBrief`, `@lezzet/i18n`): aynı personel
  satırı native akışta ve web panelinde AYNI cümleyi kurar. Yüzeye özgü olan GİDİLECEK YERDİR:
  mobil bölüme götürür, web rotaya.

  ── KÜME AÇIK: bilinmeyen tür SESSİZCE DÜŞMEZ ───────────────────────────────
  `kind` sunucuda büyür; sözlüğün tanımadığı tür genel başlık + sakin tonla ÇİZİLİR. Web her
  dağıtımda sunucuyla eşzamanlı olduğundan bu satır normalde görünmez — görünüyorsa sözlüğe
  eşlemesi yazılmamış demektir ve gizlemek o açığı görünmez kılardı.
*/

export interface OpsNotificationRow {
  id: string;
  title: string;
  tone: StaffNotificationTone;
  /** Operasyon rotası — hedefsiz satırda null: satır tıklanmaz, yalnız haber verir. */
  href: string | null;
  createdAt: string;
}

/**
 * Hedef ADRESTEN, içerikten değil: `document_undeliverable` hedefi siparişin kendisi (dispatch
 * `input.target`ı aynen taşır) — operatör "hangi belge" sorusunu sipariş detayında cevaplar.
 * Talep hedefi kuyruğun `?t=` sözleşmesine gider (seçili yazışma adreste yaşar — tickets künyesi).
 */
export function opsNotificationHref(row: Pick<MeNotification, 'targetType' | 'targetId'>): string | null {
  if (row.targetType === 'order' && row.targetId) return `/operations/orders/${row.targetId}`;
  if (row.targetType === 'ticket' && row.targetId) return `/operations/tickets?t=${row.targetId}`;
  return null;
}

export function toOpsNotificationRow(row: MeNotification): OpsNotificationRow {
  const brief = staffNotificationBrief(row);
  return {
    id: row.id,
    // Genel başlık webde KISA: "uygulamayı güncelleyin" tavsiyesi mobile özgü (orada sürüm eskir).
    title: brief?.title ?? 'Yeni bir bildirim',
    tone: brief?.tone ?? 'quiet',
    href: opsNotificationHref(row),
    createdAt: row.createdAt,
  };
}
