import { ShipmentEventService, ShipmentService } from '@lezzet/database';
import { captureError } from '@lezzet/observability';
import type { Shipment } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShippingRateProvider } from './port';
import { sendcloudProvider, shippingProviderConfigured } from './provider';

/**
 * **SİPARİŞ İPTAL EDİLİNCE GÖNDERİ DE KAPANIR** (21.265 · iptal ön çalışması 05.09).
 *
 * ── ÖLÇÜLEN AÇIK ────────────────────────────────────────────────────────────
 * `cancel_order` gönderi tarafına HİÇ dokunmuyordu ve `ShippingRateProvider.cancel` repoda tanımlı
 * olmasına rağmen **hiçbir yerden çağrılmıyordu** (grep: yalnız tanım, uygulama ve testkit).
 * Sonuç: iptalde müşteriye kargo bedeli iade ediliyor ama **etiket taşıyıcıda ayakta kalıyor**.
 * Koli bir şekilde alınırsa iptal edilmiş sipariş gerçekten yola çıkıyor; alınmasa bile gönderi
 * terminal olmayan bir durumda kalıyor ve öksüz nöbeti (`watch.ts`) onu sonsuza dek görüyor.
 *
 * ── ÜÇ YAZIM, VE SIRASI ÖNEMLİ ──────────────────────────────────────────────
 * 1. **Sağlayıcı** — etiketi iptal et. ÖNCE, çünkü tek geri alınamayan adım bu: yereli kapatıp
 *    sağlayıcıyı kapatamazsak elimizde "iptal ettim" diyen bir kayıt ve ayakta bir etiket kalır.
 * 2. **Yerel gönderi** — `status='cancelled'` + `cancelled_at`. Sağlayıcı düşse BİLE yazılır ve bu
 *    bilinçli: siparişin iptali kesin bir olgu, gönderinin bizim defterimizdeki hâli onu izlemeli.
 *    Sağlayıcı düştüyse cevap bunu SÖYLER (`provider_failed`) — sessiz geçmez.
 * 3. **Olay satırı** — kaynağı biz olduğumuz için `providerCode: 'ORDER_CANCELLED'`. Uzlaştırma
 *    turu bir gün "bu satırı kim yazdı" diye sorduğunda cevap kaydın içinde olsun (devir
 *    okutmasının `HANDOVER_SCAN` deseni).
 *
 * ── PORT DEĞİL, DOĞRUDAN SAĞLAYICI ──────────────────────────────────────────
 * `refunder` bir port çünkü `stripe` bu paketin ağacında YOK. Kargo öyle değil: `sendcloudProvider`
 * bu paketin içinde ve anahtarları ENV'den KENDİSİ okuyor (`provider.ts` künyesi). Yeni bir port
 * açmak, çağıranların hepsine doldurulacak bir kanca daha eklemek olurdu — ve o kanca bir gün bir
 * yüzeyde unutulur, gönderi orada sessizce açık kalırdı.
 *
 * Sağlayıcı yapılandırılmamışsa (yerel/geliştirme) yerel kapanış yine yazılır ve cevap
 * `provider_unavailable` der — "iptal edildi" ile karıştırılmaz (`ProviderRefundOutcome`in aynı ayrımı).
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
 * **AÇIK GÖNDERİ** — iki alan birden sorulur ve bu bir titizlik değil zorunluluk: `status` akış
 * boyunca sağlayıcının söylediğiyle güncelleniyor, `cancelled_at` ise bizim kararımızın damgası.
 * Yalnız birine bakan bir okuma, öbür yoldan kapatılmış gönderiyi açık sanar.
 *
 * Aynı ölçüt `announce.ts:95` ve `tracking.ts:60`ta da yazılıydı; üçüncü kopya doğmasın diye buraya
 * alındı ve o ikisi de buradan okuyor (CLAUDE §1).
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
      /* Sağlayıcı reddi YEREL KAPANIŞI DURDURMAZ (yukarıdaki künye) ama yutulmaz da: iz `error_log`a
         düşer ki "etiket hâlâ ayakta" hâli teşhis edilebilsin. Kimlik yazılır, içerik yazılmaz. */
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
