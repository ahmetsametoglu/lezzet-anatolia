import { ReturnDispositionEnum, type OrderStatus, type ReturnDisposition } from '@lezzet/types';
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

/** Malın müşterinin eline geçtiği durumlar; `returned` yok, çünkü kapıda reddedilen sipariş de o durumdadır. */
const HANDED_OVER_STATUSES: readonly OrderStatus[] = ['delivered', 'completed'];

/**
 * İadede sunulan akıbetler: "müşteride kaldı" (`goodwill`) yalnız mal bir kez müşteriye ulaştıysa anlamlıdır. Durum değil geçmiş
 * okunur, çünkü teslimden sonra iadeye dönen sipariş de `returned`dır; veritabanı aynı kuralı `adjust_fulfillment`ta zorlar.
 */
export function allowedReturnDispositions(history: readonly OrderStatus[]): readonly ReturnDisposition[] {
  const handedOver = history.some((status) => HANDED_OVER_STATUSES.includes(status));
  return ReturnDispositionEnum.options.filter((disposition) => handedOver || disposition !== 'goodwill');
}
