import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readRevolutOrder, readRevolutPayout, revolutFeeOf, type RevolutClient } from '@lezzet/application';
import type { RevolutWebhookEvent } from '@lezzet/types';
import type { PaymentEvent } from './payment-webhook';

/** İmzanın zaman toleransı; sağlayıcının önerisi, eski bir isteğin yeniden oynatılmasına karşı. */
const TOLERANCE_MS = 5 * 60_000;

/**
 * Revolut imzası `v1=` + HMAC-SHA256(`v1.{zaman damgası}.{ham gövde}`); gövde ham hâliyle imzalanır, yeniden yazılan gövde imzayı
 * bozar. Anahtar dönerken başlık virgülle birden çok imza taşır ve biri tutarsa yeter.
 */
export function verifyRevolutSignature(input: {
  rawBody: string;
  timestamp: string | null;
  signatureHeader: string | null;
  secret: string;
  now?: number;
}): boolean {
  if (!input.timestamp || !input.signatureHeader) return false;
  const sentAt = Number(input.timestamp);
  if (!Number.isFinite(sentAt) || Math.abs((input.now ?? Date.now()) - sentAt) > TOLERANCE_MS) return false;
  const expected = Buffer.from(`v1=${createHmac('sha256', input.secret).update(`v1.${input.timestamp}.${input.rawBody}`).digest('hex')}`);
  return input.signatureHeader.split(',').some((candidate) => {
    const given = Buffer.from(candidate.trim());
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/**
 * Bildirim yalnız olay ve kimlik taşır; tutar, komisyon ve bizim sipariş, sağlayıcı siparişi okunarak alınır. İade ayrı bir sipariş
 * olarak bildirilir ve iade ettiği siparişin iade toplamı ondan okunur.
 */
export async function toPaymentEvent(client: RevolutClient, webhook: RevolutWebhookEvent): Promise<PaymentEvent> {
  const key = `${webhook.event}:${webhook.order_id ?? webhook.payout_id ?? webhook.dispute_id ?? 'yok'}`;

  if (webhook.event === 'ORDER_COMPLETED' && webhook.order_id) {
    const order = await readRevolutOrder(client, webhook.order_id);
    if (order.type === 'refund') {
      if (!order.related_order_id) return { key, kind: 'ignored' };
      const paid = await readRevolutOrder(client, order.related_order_id);
      return { key, kind: 'refund_completed', paymentRef: paid.id, refundedTotalCents: paid.refunded_amount ?? order.amount };
    }
    return {
      key,
      kind: 'payment_completed',
      orderId: order.metadata?.order_id ?? null,
      paymentRef: order.id,
      amountCents: order.amount - (order.outstanding_amount ?? 0),
      fee: revolutFeeOf(order),
    };
  }

  if ((webhook.event === 'ORDER_CANCELLED' || webhook.event === 'ORDER_FAILED') && webhook.order_id) {
    const order = await readRevolutOrder(client, webhook.order_id);
    if (order.type !== 'payment') return { key, kind: 'ignored' };
    return { key, kind: 'payment_released', orderId: order.metadata?.order_id ?? null, paymentRef: order.id };
  }

  if (webhook.event === 'PAYOUT_COMPLETED' && webhook.payout_id) {
    const payout = await readRevolutPayout(client, webhook.payout_id);
    // Tutarsız tamamlanmış aktarım beklenmez; hata fırlar ve sağlayıcı olayı yeniden gönderir.
    if (payout.amount == null || !payout.currency) throw new Error(`aktarım tutarsız döndü: ${payout.id}`);
    return {
      key,
      kind: 'payout_completed',
      payout: { id: payout.id, amountCents: payout.amount, currency: payout.currency, valueDate: payout.created_at.slice(0, 10) },
    };
  }

  return { key, kind: 'ignored' };
}
