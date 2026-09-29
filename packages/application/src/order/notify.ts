import { OrderService, OrderStatusLogService, type Db } from '@lezzet/database';
import { type NotifyEventName, type NotifyResult } from '@lezzet/notify';
import { captureError, SOURCES } from '@lezzet/observability';
import type { DeliveryType, OrderStatus } from '@lezzet/types';
import { dispatchCustomerNotification } from '../notification/dispatch';
import type { OrderExceptionEvent } from './effects';
import { buildOrderNotification } from './notification-data';

/**
 * Sipariş bildirimlerinin tetiklendiği yer: hangi geçişin hangi olay olduğunu bilir, kanalı `@lezzet/notify` seçer.
 * Paketin içinde durur ki web ve mobil API aynı kuralla haber versin.
 */

/** Hangi geçiş hangi haberi doğurur. Bildirimi olmayan geçiş burada yoktur — sessizlik de karardır. */
const EVENT_OF_STATUS: Partial<Record<OrderStatus, NotifyEventName>> = {
  confirmed: 'order_confirmed',
  out_for_delivery: 'order_out_for_delivery',
  delivered: 'order_delivered',
};

/**
 * Gel-al'da "hazır" müşteriye haberdir: mal depoda onu bekliyor ve randevuyu o ayarlayacak. Rota ve kargoda aynı durum
 * sessizdir, haber "yolda"da gelir; ayrım teslimat türünden, olayın adından değil.
 */
export function notificationEventOf(status: OrderStatus, deliveryType: DeliveryType): NotifyEventName | null {
  if (status === 'ready') return deliveryType === 'pickup' ? 'order_ready_for_pickup' : null;
  return EVENT_OF_STATUS[status] ?? null;
}

/** Durum olaylarının kümesi — dedupe anahtarı yalnız bunlarda kurulur (istisnalar tekrarlanabilir). */
const EVENT_OF_STATUS_VALUES: NotifyEventName[] = [...Object.values(EVENT_OF_STATUS), 'order_ready_for_pickup'];

/**
 * Geçiş sonrası bildirim; sipariş bu duruma ikinci kez girerse haber tekrarlanmaz. Tekrarı durum kaydının kendisi önler,
 * ayrı bir "gönderildi" bayrağı ikinci kaynak olurdu.
 */
export async function notifyOrderStatus(db: Db, orderId: string, status: OrderStatus): Promise<NotifyResult[]> {
  const order = await new OrderService(db).getById(orderId);
  if (!order) return [{ status: 'skipped', channel: 'email', reason: 'order_not_found' }];
  const event = notificationEventOf(status, order.deliveryType);
  if (!event) return [];

  const log = await new OrderStatusLogService(db).listByOrder(orderId);
  const entries = log.filter((row) => row.toStatus === status).length;
  if (entries > 1) return [{ status: 'skipped', channel: 'email', reason: 'already_notified' }];

  return notifyOrderEvent(db, orderId, event);
}

/**
 * İstisna bildirimleri (iptal, eksik karşılanma, iade) para çözümüne bağlıdır; `refundedAmountCents` kapının fiilen
 * yazdığı iade tutarıdır. "Tek haber" kuralı uygulanmaz: her düzeltme ayrı bir olaydır.
 */
export function notifyOrderException(
  db: Db,
  orderId: string,
  event: OrderExceptionEvent,
  opts: { refundedAmountCents?: number | null } = {},
): Promise<NotifyResult[]> {
  return notifyOrderEvent(db, orderId, event, opts);
}

/**
 * Olayı doğrudan gönderir (yeniden gönderme, elle tetikleme). Bildirim kurulamıyorsa sessiz atlar:
 * mail yokluğu siparişi bozmaz — sipariş kaydedilmişken haber yüzünden geri almak yanlış olurdu.
 */
async function notifyOrderEvent(
  db: Db,
  orderId: string,
  event: NotifyEventName,
  opts: { refundedAmountCents?: number | null } = {},
): Promise<NotifyResult[]> {
  const bundle = await buildOrderNotification(db, orderId, event, opts);
  if (!bundle) return [{ status: 'skipped', channel: 'email', reason: 'order_not_found' }];

  try {
    // Tek kapı: satır + kanal + teslim defteri + zil bir arada. Durum olaylarında `dedupeKey` "geçiş başına tek mail"
    // kuralının defter ucudur; istisna olaylarında anahtar yok, her düzeltme ayrı haberdir.
    return await dispatchCustomerNotification(db, {
      event,
      customerId: bundle.customerId,
      recipient: bundle.recipient,
      data: bundle.data,
      target: { type: 'order', id: orderId },
      dedupeKey: EVENT_OF_STATUS_VALUES.includes(event) ? `order:${orderId}:${event}` : null,
      payload: { referenceNo: bundle.data.referenceNo },
    });
  } catch (error) {
    // Çağıranların çoğu sonucu okumadığı için gitmeyen mail burada kayda düşülür; sipariş sağlam, eksik olan haber.
    // Kaynak `applicationOrder`: kapıyı iki yüzey çağırıyor ve aynı arıza iki kovaya bölünmemeli.
    void captureError(error, { source: SOURCES.applicationOrder, level: 'warning', context: { orderId, event } });
    return [{ status: 'error', channel: 'email', error: error instanceof Error ? error.message : String(error) }];
  }
}
