import { OrderStatusLogService, type Db } from '@lezzet/database';
import { type NotifyEventName, type NotifyResult } from '@lezzet/notify';
import { captureError, SOURCES } from '@lezzet/observability';
import type { OrderStatus } from '@lezzet/types';
import { dispatchCustomerNotification } from '../notification/dispatch';
import { buildOrderNotification } from './notification-data';

/**
 * Sipariş bildirimlerinin tetiklendiği yer (14.5) — **uygulama katmanı orkestrasyonu**.
 *
 * Durum geçişi olur, burası "müşteriye haber ver" der; hangi kanaldan gideceğine `@lezzet/notify`
 * karar verir. Bu dosya kanal bilmez, şablon bilmez — yalnız hangi geçişin hangi olay olduğunu bilir.
 *
 * ── TERFİ (21.21) · WEB'DEN FARKLARI ─────────────────────────────────────────
 * Kaynağı `apps/web/lib/order/notify.ts`ti; web kopyası KÖPRÜ olarak duruyor. Gerekçesi ölçülmüş bir
 * arıza: `apps/mobile-api` bu dosyayı import edemediği için `placeOrder`a `effects` geçiremiyordu ve
 * **mobilden verilen kapıda/vadeli ödemeli siparişte onay maili hiç gitmiyordu**. Aynı sınır
 * `/api/v1/courier/*` teslimatını da sessiz bırakıyor (`effects.ts` künyesi, BEKLEYEN(14.11)).
 *
 * Değişen tek şey `db`nin çağırandan gelmesi (paketin ortak deseni). "Geçiş başına tek mail" kuralı,
 * yutma davranışı ve kayıt künyesi AYNEN korundu.
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

/** Durum olaylarının kümesi — dedupe anahtarı yalnız bunlarda kurulur (istisnalar tekrarlanabilir). */
const EVENT_OF_STATUS_VALUES: NotifyEventName[] = Object.values(EVENT_OF_STATUS);

/**
 * Geçiş sonrası bildirim. **Geçiş başına en fazla bir mail**: sipariş bu duruma ikinci kez
 * girerse (kapıdan dönüp yeniden yola çıkmak gibi) haber tekrarlanmaz.
 *
 * Tekrarı önleyen şey ayrı bir "gönderildi" bayrağı DEĞİL, durum kaydının kendisidir — o kayıt
 * zaten tutuluyor (07.6). Bayrak tutsaydık iki kaynak olurdu ve biri kayardı.
 */
export async function notifyOrderStatus(db: Db, orderId: string, status: OrderStatus): Promise<NotifyResult[]> {
  const event = notificationEventOf(status);
  if (!event) return [];

  const log = await new OrderStatusLogService(db).listByOrder(orderId);
  const entries = log.filter((row) => row.toStatus === status).length;
  if (entries > 1) return [{ status: 'skipped', channel: 'email', reason: 'already_notified' }];

  return notifyOrderEvent(db, orderId, event);
}

/**
 * İSTİSNA bildirimleri (14.5) — iptal, eksik karşılanma, iade. Durum geçişine değil, PARA
 * ÇÖZÜMÜNE bağlıdırlar: iptal `cancel_order`'dan, diğer ikisi kalem düzeltmesinden doğar.
 *
 * `refundedAmountCents` kapının fiilen yazdığı iade tutarıdır — türetilen borç o anda sıfırlanmış olur.
 *
 * Bunlarda "tek haber" kuralı UYGULANMAZ: her düzeltme ayrı bir olaydır. İki kez eksik çıkarsa
 * müşteri iki kez haber almalıdır; birleştirme kararı gönderim anının değil, tasarımın işidir
 * ("yolda" bildirimi zaten gittiyse tek mailde birleşir — o kural henüz kodlanmadı).
 */
export function notifyOrderException(
  db: Db,
  orderId: string,
  event: 'order_cancelled' | 'order_shortfall' | 'order_refunded',
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
    // TEK KAPI (14.12): satır + kanal + teslim defteri + zil bir arada. Durum olaylarında
    // `dedupeKey` bugünkü "geçiş başına tek mail" kuralının satır hâli (yukarıdaki status-log
    // sayımı ilk savunma olarak duruyor — iki kaynak değil, aynı kuralın kapı ve defter uçları);
    // İSTİSNA olaylarında anahtar YOK: her düzeltme ayrı haberdir (bu dosyanın kendi kuralı).
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
    // Sonuç nesnesi çağırana dönüyor ama ÇOĞU ÇAĞIRAN ONU OKUMUYOR (geçiş kapısı yalnız fırlatılan
    // hatayı yakalıyordu) — yani gitmeyen mail hiçbir yerde görünmüyordu. Kayıt burada düşülür.
    // `warning`: sipariş sağlam, eksik olan haber; ama izlenmeli.
    // Kaynak artık `webAction` DEĞİL `applicationOrder`: kapıyı iki yüzey birden çağırıyor ve arıza
    // akışın kendisindeyse iki kovaya bölünmemeli (`SOURCES.applicationOrder` künyesi).
    void captureError(error, { source: SOURCES.applicationOrder, level: 'warning', context: { orderId, event } });
    return [{ status: 'error', channel: 'email', error: error instanceof Error ? error.message : String(error) }];
  }
}
