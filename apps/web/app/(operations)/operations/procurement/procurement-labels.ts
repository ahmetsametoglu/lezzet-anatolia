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

/**
 * Gönderimden bu yana geçen TAM GÜN. Saat değil gün sayılır: "37 saattir yolda" kimsenin sorduğu
 * soru değil, ve gün sınırı iki tarafta da (sunucu/istemci) aynı yerden geçmeli.
 */
function daysSince(iso: string, today: string): number {
  const from = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  // Negatif olamaz: ileri tarihli bir damga bir arızadır, "−2 gündür yolda" diye gösterilmez.
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/**
 * "Neyi bekliyorum, ne zamandır" — gönderilmiş ama kapanmamış siparişin bekleyiş süresi.
 *
 * **Yargı YOK, süre var.** "Gecikti" diyebilmek için tedarikçinin teslim süresini bilmek gerekir
 * (`supplier.lead_time_days` henüz yok) ve eşiği ekranda uydurmak, kimse söz vermemişken geç
 * kalınmış gibi göstermek olurdu. Süreyi görmek zaten kararı verdiriyor: 12 gündür bekleyen sipariş
 * operatörün gözünden kaçmaz. Uyarı eşiği arka uç talebinde (`tedarik-arka-uc-talebi.md §5`).
 *
 * Kapanmış/iptal/taslak siparişte null: bekleyiş bitmiş ya da hiç başlamamıştır.
 */
export function waitingText(row: Pick<PurchaseOrderRowView, 'status' | 'sentAt'>, today: string): string | null {
  if (!row.sentAt || (row.status !== 'sent' && row.status !== 'partially_received')) return null;
  const days = daysSince(row.sentAt, today);
  return days === 0 ? 'bugün gönderildi' : `${days} gündür yolda`;
}

/** Kabul sütununun tonu — tamamlanan olive, kısmi amber, hiç girmemiş sönük. */
export function receivedToneClass(row: PurchaseOrderRowView): string {
  if (row.itemCount > 0 && row.receivedItemCount >= row.itemCount) return 'text-ops-olive-dark';
  if (row.receivedItemCount > 0) return 'text-ops-amber';
  return 'text-ops-faint';
}
