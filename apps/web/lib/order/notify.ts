import { OrderStatusLogService, serviceDb } from '@lezzet/database';
import type { NotifyEventName, NotifyResult } from '@lezzet/notify';
import type { OrderStatus } from '@lezzet/types';
import { captureError, SOURCES } from '@lezzet/observability';
import { notifier } from '../notify';
import { buildOrderNotification } from './notification-data';

/**
 * Sipariş bildirimlerinin tetiklendiği yer (14.5) — **uygulama katmanı orkestrasyonu**.
 *
 * Durum geçişi olur, burası "müşteriye haber ver" der; hangi kanaldan gideceğine `@lezzet/notify`
 * karar verir. Bu dosya kanal bilmez, şablon bilmez — yalnız hangi geçişin hangi olay olduğunu bilir.
 */


/** Hangi geçiş hangi haberi doğurur. Bildirimi olmayan geçiş burada yoktur — sessizlik de karardır. */
const EVENT_OF_STATUS: Partial<Record<OrderStatus, NotifyEventName>> = {
  confirmed: 'order_confirmed',
  out_for_delivery: 'order_out_for_delivery',
  delivered: 'order_delivered',
};

function notificationEventOf(status: OrderStatus): NotifyEventName | null {
  return EVENT_OF_STATUS[status] ?? null;
}

/**
 * Geçiş sonrası bildirim. **Geçiş başına en fazla bir mail**: sipariş bu duruma ikinci kez
 * girerse (kapıdan dönüp yeniden yola çıkmak gibi) haber tekrarlanmaz.
 *
 * Tekrarı önleyen şey ayrı bir "gönderildi" bayrağı DEĞİL, durum kaydının kendisidir — o kayıt
 * zaten tutuluyor (07.6). Bayrak tutsaydık iki kaynak olurdu ve biri kayardı.
 */
export async function notifyOrderStatus(orderId: string, status: OrderStatus): Promise<NotifyResult[]> {
  const event = notificationEventOf(status);
  if (!event) return [];

  const log = await new OrderStatusLogService(serviceDb()).listByOrder(orderId);
  const entries = log.filter((row) => row.toStatus === status).length;
  if (entries > 1) return [{ status: 'skipped', channel: 'email', reason: 'already_notified' }];

  return notifyOrderEvent(orderId, event);
}

/**
 * İSTİSNA bildirimleri (14.5) — iptal, eksik karşılanma, iade. Durum geçişine değil, PARA
 * ÇÖZÜMÜNE bağlıdırlar: iptal `cancel_order`'dan, diğer ikisi kalem düzeltmesinden doğar.
 *
 * `refundedAmount` kapının fiilen yazdığı iade tutarıdır — türetilen borç o anda sıfırlanmış olur.
 *
 * Bunlarda "tek haber" kuralı UYGULANMAZ: her düzeltme ayrı bir olaydır. İki kez eksik çıkarsa
 * müşteri iki kez haber almalıdır; birleştirme kararı gönderim anının değil, tasarımın işidir
 * ("yolda" bildirimi zaten gittiyse tek mailde birleşir — o kural henüz kodlanmadı).
 */
export function notifyOrderException(
  orderId: string,
  event: 'order_cancelled' | 'order_shortfall' | 'order_refunded',
  opts: { refundedAmount?: number | null } = {},
): Promise<NotifyResult[]> {
  return notifyOrderEvent(orderId, event, opts);
}

/**
 * Olayı doğrudan gönderir (yeniden gönderme, elle tetikleme). Bildirim kurulamıyorsa sessiz atlar:
 * mail yokluğu siparişi bozmaz — sipariş kaydedilmişken haber yüzünden geri almak yanlış olurdu.
 */
async function notifyOrderEvent(orderId: string, event: NotifyEventName, opts: { refundedAmount?: number | null } = {}): Promise<NotifyResult[]> {
  const bundle = await buildOrderNotification(orderId, event, opts);
  if (!bundle) return [{ status: 'skipped', channel: 'email', reason: 'order_not_found' }];

  try {
    return await notifier.send(event, bundle.recipient, bundle.data);
  } catch (error) {
    // Sonuç nesnesi çağırana dönüyor ama ÇOĞU ÇAĞIRAN ONU OKUMUYOR (geçiş kapısı yalnız fırlatılan
    // hatayı yakalıyordu) — yani gitmeyen mail hiçbir yerde görünmüyordu. Kayıt burada düşülür.
    // `warning`: sipariş sağlam, eksik olan haber; ama izlenmeli.
    void captureError(error, { source: SOURCES.webAction, level: 'warning', context: { orderId, event } });
    return [{ status: 'error', channel: 'email', error: error instanceof Error ? error.message : String(error) }];
  }
}
