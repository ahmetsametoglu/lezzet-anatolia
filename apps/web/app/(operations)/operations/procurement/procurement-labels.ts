import type { PurchaseOrderStatus } from '@lezzet/types';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { PurchaseOrderRowView } from './procurement-types';

// Tedarik ekranının etiket ve ton sözlüğü — sipariş ekranının deseni (`orders-labels.ts`).

const STATUS: Record<PurchaseOrderStatus, { label: string; tone: OpsTone }> = {
  // "Taslak" henüz gönderilmedi: nötr. Gönderilmiş sipariş bir BEKLEYİŞTİR (mavi), parçalı kabul
  // dikkat ister (amber — kalanı yolda mı, kayıp mı), kapanan sipariş yolunda (olive).
  draft: { label: 'Taslak', tone: 'neutral' },
  sent: { label: 'Gönderildi', tone: 'blue' },
  partially_received: { label: 'Kısmi kabul', tone: 'amber' },
  received: { label: 'Mal kabul', tone: 'olive' },
  cancelled: { label: 'İptal', tone: 'red' },
};

export function statusLabel(status: PurchaseOrderStatus): string {
  return STATUS[status].label;
}

export function statusTone(status: PurchaseOrderStatus): OpsTone {
  return STATUS[status].tone;
}

/**
 * Kabul sütununun iki satırı: "8 / 12 kalem" + depo kırılımı ("STR 6 · COL 2").
 *
 * Kırılım FİİLEN giren partiden gelir (motor kararı) — hedef depo bir niyet beyanıdır. Hiç mal
 * girmemişse kırılım satırı "kabul bekliyor" der: boş bırakmak "girdi ama depo bilinmiyor" gibi
 * okunurdu.
 */
export function receivedText(row: PurchaseOrderRowView): { main: string; meta: string } {
  const main = `${row.receivedItemCount} / ${row.itemCount} kalem`;
  if (row.byWarehouse.length === 0) {
    return { main: row.status === 'draft' ? '—' : main, meta: row.status === 'draft' ? 'henüz gönderilmedi' : 'kabul bekliyor' };
  }
  return { main, meta: row.byWarehouse.map((w) => `${w.code} ${w.qty}`).join(' · ') };
}

/** Kabul sütununun tonu — tamamlanan olive, kısmi amber, hiç girmemiş sönük. */
export function receivedToneClass(row: PurchaseOrderRowView): string {
  if (row.itemCount > 0 && row.receivedItemCount >= row.itemCount) return 'text-ops-olive-dark';
  if (row.receivedItemCount > 0) return 'text-ops-amber';
  return 'text-ops-faint';
}
