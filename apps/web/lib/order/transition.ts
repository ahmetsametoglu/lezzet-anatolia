import { OrderService, serviceDb } from '@lezzet/database';
import { canTransition, generateReferenceNo, producesReferenceNo } from '@lezzet/domain-core';
import type { OrderStatus } from '@lezzet/types';
import { notifyOrderStatus } from './notify';
import { logger } from '@lezzet/observability';

/**
 * Durum ilerletme kapısı (07.6) — **uygulama katmanı orkestrasyonu**.
 *
 * Karar motorun (`domain-core/order/status-machine`: izinli geçiş tablosu + referans üretim kuralı),
 * yazım servisin (koşullu RPC: durum + log tek transaction'da). İkisi birbirini bilmez (STACK §4);
 * birleştiren yer burasıdır.
 *
 * İki ayrı "hayır" vardır ve karıştırılmaz:
 * - **`forbidden`** — geçiş kurallara aykırı (ör. `draft → delivered`). Motorun cevabı.
 * - **`stale`** — geçiş kurallara uygun ama sipariş artık o durumda değil; araya biri girdi
 *   (depocu "hazır" derken kurye "yolda" demiş). Veritabanının cevabı.
 */

type TransitionOutcome =
  | { status: 'ok'; from: OrderStatus; to: OrderStatus; referenceNo: string | null }
  /** Kurallara aykırı geçiş — sebep motorun kodu (`same_status` / `terminal` / `not_allowed`). */
  | { status: 'forbidden'; reason: 'same_status' | 'terminal' | 'not_allowed' }
  /** Sipariş bu arada başkası tarafından ilerletilmiş — çağıran yeni duruma göre yeniden karar verir. */
  | { status: 'stale'; currentStatus: OrderStatus }
  | { status: 'not_found' };

interface TransitionInput {
  orderId: string;
  to: OrderStatus;
  /** Geçişi yapan personel; sistem olayında (webhook, cron) verilmez. */
  actorId?: string | null;
}

export async function transitionOrder(input: TransitionInput): Promise<TransitionOutcome> {
  const orders = new OrderService(serviceDb());

  const order = await orders.getById(input.orderId);
  if (!order) return { status: 'not_found' };

  // 1) Kural: bu geçiş izinli mi? Motor hata FIRLATMAZ, değer döner (03.1).
  const verdict = canTransition(order.status, input.to);
  if (!verdict.allowed) return { status: 'forbidden', reason: verdict.reason };

  // 2) Referans numarası İLK KALICI DURUMDA üretilir (`confirmed`, hızlı satışta `completed`).
  //    Zaten varsa yeniden üretilmez; RPC de mevcut numarayı ezmez (çift emniyet).
  const referenceNo =
    !order.referenceNo && producesReferenceNo(order.status, input.to)
      ? generateReferenceNo({ year: new Date(order.createdAt).getFullYear() })
      : null;

  // 3) Yazım: koşullu (yalnız beklenen kaynaktan) + log satırı aynı transaction'da.
  const result = await orders.transition({
    orderId: order.id,
    from: order.status,
    to: input.to,
    actorId: input.actorId,
    referenceNo,
  });

  if (!result.ok) return { status: 'stale', currentStatus: result.currentStatus };

  // 4) Haber müşteriye — YALNIZ geçiş gerçekten olduysa (14.5). Gönderim hatası geçişi geri almaz:
  //    sipariş ilerledi, mail gitmediyse tekrar gönderilir; tersi (ilerlemeyi iptal etmek) veriyi bozar.
  //    Bu YAKALANMAK zorunda: yorum böyle diyordu ama hata yukarı fırlıyor ve çağıran (checkout)
  //    ilerlemiş bir siparişi başarısız sanıyordu. Sağlayıcı anahtarı yokken tam da bu oluyor.
  try {
    await notifyOrderStatus(order.id, input.to);
  } catch (err) {
    // Bildirim yokluğu siparişi bozmaz (14.5) — ama sessizce kaybolmaz da.
    logger.warn({ context: 'order/transition', orderId: order.id, err: err instanceof Error ? err.message : String(err) }, 'bildirim gönderilemedi');
  }

  return { status: 'ok', from: order.status, to: input.to, referenceNo: referenceNo ?? order.referenceNo };
}
