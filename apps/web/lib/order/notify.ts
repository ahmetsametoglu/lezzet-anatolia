import {
  notifyOrderException as notifyOrderExceptionFor,
  notifyOrderStatus as notifyOrderStatusFor,
} from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import type { NotifyResult } from '@lezzet/notify';
import type { OrderStatus } from '@lezzet/types';

/**
 * Sipariş bildirimlerinin tetiklendiği yer (14.5) — **köprü**.
 *
 * Gövde `@lezzet/application`'ın `order/notify`sine taşındı (terfi 21.21): hangi geçişin hangi
 * haberi doğurduğu, "geçiş başına tek mail" kuralı ve gönderim hatasının yutulması ORADA — künyeler
 * de orada. Taşınma gerekçesi ölçülmüş bir arıza: `apps/mobile-api` bu dosyayı import edemediği için
 * `placeOrder`a `effects` geçiremiyordu ve mobilden verilen kapıda/vadeli ödemeli siparişte onay
 * maili hiç gitmiyordu. İki yüzeyde iki bildirim kuralı olamaz.
 *
 * Köprünün taşıdığı tek şey `serviceDb()` — pakette `db` çağırandan gelir. Web çağıranlarının
 * (`transition`, `fulfillment`, `refund` + testleri) imzası değişmedi.
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
