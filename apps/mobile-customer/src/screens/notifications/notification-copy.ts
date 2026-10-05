import type { NotificationRow } from '@lezzet/mobile-kit/src/lib/api/notifications';

/**
 * Bildirimin metni ortak sözlükte, burada yalnız yüzeye özgü hedef eşlemesi var, çünkü mobil rota sözleşmesi webinkinden farklı.
 * Gidilecek yeri olmayan satır (davetin jetonu payload'a bilerek yazılmaz) `null` döner ve dokunuş yalnız okundu işaretler.
 */
export function notificationHref(row: Pick<NotificationRow, 'kind' | 'targetType' | 'targetId' | 'payload'>): string | null {
  if (row.targetType === 'order' && typeof row.payload.referenceNo === 'string' && row.payload.referenceNo !== '—') {
    return `/order/${row.payload.referenceNo}`;
  }
  if (row.targetType === 'ticket' && row.targetId) return `/support/${row.targetId}`;
  if (row.kind === 'zone_available') return '/catalog';
  if (row.kind === 'b2b_application_result') return '/account';
  return null;
}
