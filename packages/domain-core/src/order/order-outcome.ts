import type { OrderStatus, PaymentMethod } from '@lezzet/types';
import type { PaymentIntentStatus } from './draft-payment';

/** Ödemesi beklenen kart taslağında sağlayıcının söylediği: alındı, banka işliyor ya da tamamlanmadı. */
export type CardPaymentState = 'paid' | 'processing' | 'incomplete';

/** Sipariş onay ekranının sipariş kaydından türeyen hâli; web sayfası ve mobil durum ucu aynı cevabı okur. */
export interface OrderOutcome {
  /** Sipariş kesinleşti (taslak da iptal de değil). */
  placed: boolean;
  cancelled: boolean;
  /** Kart ödemesi bekleniyor: taslak ve online ödeme. */
  awaitingCard: boolean;
}

export function orderOutcomeOf(order: { status: OrderStatus; paymentMethod: PaymentMethod | null }): OrderOutcome {
  const cancelled = order.status === 'cancelled';
  const placed = order.status !== 'draft' && !cancelled;
  return { placed, cancelled, awaitingCard: !placed && !cancelled && order.paymentMethod === 'online' };
}

/**
 * Parası iade edilmiş bir iptal mi: soru sebebe değil iade damgasına sorulur, çünkü iade eden iki yoldan biri sebebi
 * `superseded` bırakır.
 */
export function isRefundedCancellation(view: { cancelled: boolean; refundedAt: string | null }): boolean {
  return view.cancelled && view.refundedAt !== null;
}

/** Sağlayıcının durumundan ekranın hâli; iptal edilmiş ödeme de "tamamlanmadı"dır, `requires_action` 3-D Secure'un bitmediğidir. */
export function paymentStateOf(status: PaymentIntentStatus): CardPaymentState {
  switch (status) {
    case 'succeeded':
      return 'paid';
    case 'processing':
    case 'requires_capture':
      return 'processing';
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_action':
    case 'canceled':
      return 'incomplete';
  }
}

/** Onay ekranının söylediği tek hâl; kesinleşmemiş her hâlin kendi cümlesi var. */
export type ConfirmationPhase = 'placed' | 'refunded' | 'failed' | 'paid' | 'processing' | 'pending' | 'incomplete';

/** Onay ekranının hâli: iptal ve tamamlanmayan ödeme ret, alınmış ödeme onay, sağlayıcı sorulamadıysa (`null`) "onaylanıyor". */
export function confirmationPhaseOf(view: OrderOutcome & { refunded: boolean; paymentState: CardPaymentState | null }): ConfirmationPhase {
  if (view.cancelled) return view.refunded ? 'refunded' : 'failed';
  if (view.placed) return 'placed';
  if (!view.awaitingCard) return 'incomplete';
  switch (view.paymentState) {
    case 'paid':
      return 'paid';
    case 'processing':
      return 'processing';
    case 'incomplete':
      return 'failed';
    case null:
      return 'pending';
  }
}

/** İşaretin tonu: ret, onay ya da bekleme. */
export function confirmationToneOf(phase: ConfirmationPhase): 'failed' | 'ok' | 'waiting' {
  if (phase === 'failed' || phase === 'refunded') return 'failed';
  return phase === 'placed' || phase === 'paid' ? 'ok' : 'waiting';
}
