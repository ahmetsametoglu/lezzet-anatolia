import {
  notifyOrderException as notifyOrderExceptionFor,
  notifyOrderStatus as notifyOrderStatusFor,
} from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import type { NotifyResult } from '@lezzet/notify';
import type { OrderStatus } from '@lezzet/types';

/**
 * Paketin `order/notify` kapılarına köprü: kural ve gönderim hatasının yutulması orada, iki yüzeyde iki bildirim kuralı olmasın.
 * Köprünün taşıdığı tek şey `serviceDb()`.
 */
export function notifyOrderStatus(orderId: string, status: OrderStatus): Promise<NotifyResult[]> {
  return notifyOrderStatusFor(serviceDb(), orderId, status);
}

/** İSTİSNA bildirimleri (14.5) — iptal, eksik karşılanma, iade. Kural ve künye pakette. */
export function notifyOrderException(
  orderId: string,
  event: 'order_cancelled' | 'order_shortfall' | 'order_refunded',
  opts: { refundedAmountCents?: number | null } = {},
): Promise<NotifyResult[]> {
  return notifyOrderExceptionFor(serviceDb(), orderId, event, opts);
}
