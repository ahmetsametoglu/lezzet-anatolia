import type { OrderStatus } from '@lezzet/types';
import { allowedTransitions, isTerminal } from './status-machine';

/**
 * Siparişte operatörün verebileceği karar; durum geçişinden ayrı bir sorudur, çünkü kısmi karşılama durumu hiç değiştirmez.
 * Ayıran çizgi teslimdir: mal çıkmadıysa kısmi karşılama, çıktıysa iade (DOMAIN §8) — kayıt bunu bildiği için operatöre sorulmaz.
 */
export type OrderDecision = 'partial_fulfillment' | 'refund' | 'cancel';

/** Malın müşteriye ULAŞMIŞ sayıldığı durumlar — iade eksenini açan çizgi. */
const DELIVERED_STATUSES: readonly OrderStatus[] = ['delivered', 'completed', 'returned'];

export function allowedDecisions(status: OrderStatus): readonly OrderDecision[] {
  // Taslak bir sipariş değil, yarım bir sepettir: üzerinde karar verilmez.
  if (status === 'draft') return [];

  const decisions: OrderDecision[] = [];

  if (DELIVERED_STATUSES.includes(status)) {
    // Kapanmış kayıtta bile iade açık kalır: şikâyet teslimden günler sonra gelir ve kaydın
    // kapanmış olması paranın geri gitmesini engellemez (DOMAIN §8).
    decisions.push('refund');
  } else if (!isTerminal(status)) {
    decisions.push('partial_fulfillment');
  }

  // İptal bir GEÇİŞTİR; izni burada yeniden yazmayız, makineye sorarız.
  if (allowedTransitions(status).includes('cancelled')) decisions.push('cancel');

  return decisions;
}
