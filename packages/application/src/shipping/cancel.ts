import { ShipmentEventService, ShipmentService } from '@lezzet/database';
import { captureError } from '@lezzet/observability';
import type { Shipment } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShippingRateProvider } from './port';
import { sendcloudProvider, shippingProviderConfigured } from './provider';

/**
 * Sipariş iptal edilince gönderi de kapanır: önce taşıyıcıdaki etiket iptal edilir, çünkü geri alınamayan adım odur; yerel kapanış
 * sağlayıcı düşse de yazılır ve cevap düşüşü ayrı hâlle söyler. Sağlayıcı ENV'den kurulur, port yok ki bir yüzeyde unutulmasın.
 */

export type ShipmentCancelOutcome =
  /** Gönderi kapandı; sağlayıcıdaki etiket de iptal edildi. */
  | { status: 'ok'; shipmentId: string }
  /** Siparişin açık gönderisi yok — kargo siparişi değil ya da hiç duyurulmamış. */
  | { status: 'no_shipment' }
  /** Yerel kapanış YAZILDI ama sağlayıcı anahtarı yok: etiket orada ayakta olabilir. */
  | { status: 'provider_unavailable'; shipmentId: string }
  /** Yerel kapanış YAZILDI, sağlayıcı reddetti/ulaşılamadı — etiket orada ayakta olabilir. */
  | { status: 'provider_failed'; shipmentId: string; error: string };

/**
 * Açık gönderi: `status` sağlayıcının söylediğiyle güncellenir, `cancelled_at` bizim kararımızdır; yalnız birine bakan okuma öbür
 * yoldan kapanmış gönderiyi açık sanar. Duyuru ve takip de bu ölçütü buradan okur.
 */
export function isOpenShipment(shipment: Shipment): boolean {
  return shipment.cancelledAt === null && shipment.status !== 'cancelled';
}

export async function cancelOrderShipment(
  db: SupabaseClient,
  input: { orderId: string; actorId?: string | null },
  /** Sağlayıcı — testler kendi sahtesini geçiyor; verilmezse ENV'den kurulur. */
  provider?: ShippingRateProvider,
): Promise<ShipmentCancelOutcome> {
  const shipments = new ShipmentService(db);
  const acik = (await shipments.listByOrder(input.orderId)).find(isOpenShipment);
  if (!acik) return { status: 'no_shipment' };

  const port = provider ?? (shippingProviderConfigured() ? sendcloudProvider() : null);
  let saglayici: { ok: true } | { ok: false; reason: 'unavailable' } | { ok: false; reason: 'failed'; error: string } =
    port === null || acik.providerShipmentId === null ? { ok: false, reason: 'unavailable' } : { ok: true };

  if (port !== null && acik.providerShipmentId !== null) {
    try {
      await port.cancel(acik.providerShipmentId);
    } catch (error) {
      // Sağlayıcı reddi yerel kapanışı durdurmaz; iz bırakılır ki ayakta kalan etiket teşhis edilebilsin.
      await captureError(error, {
        source: 'application/shipping/cancel',
        context: { orderId: input.orderId, shipmentId: acik.id },
      });
      saglayici = { ok: false, reason: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
  }

  await shipments.update({ id: acik.id, status: 'cancelled', cancelledAt: new Date().toISOString() });
  await new ShipmentEventService(db).insert({
    shipmentId: acik.id,
    providerCode: 'ORDER_CANCELLED',
    mappedStatus: 'cancelled',
    message: 'Sipariş iptal edildi — gönderi kapatıldı',
    occurredAt: new Date().toISOString(),
  });

  if (saglayici.ok) return { status: 'ok', shipmentId: acik.id };
  if (saglayici.reason === 'unavailable') return { status: 'provider_unavailable', shipmentId: acik.id };
  return { status: 'provider_failed', shipmentId: acik.id, error: saglayici.error };
}
