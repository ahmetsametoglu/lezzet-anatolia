import {
  notifyOrderException as notifyOrderExceptionFor,
  notifyOrderStatus as notifyOrderStatusFor,
  type OrderExceptionEvent,
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

/** İstisna bildirimleri: iptal, eksik karşılanma, iade, gelmeyen kart ödemesi. Kural ve künye pakette. */
export function notifyOrderException(
  orderId: string,
  event: OrderExceptionEvent,
  opts: { refundedAmountCents?: number | null } = {},
): Promise<NotifyResult[]> {
  return notifyOrderExceptionFor(serviceDb(), orderId, event, opts);
}
