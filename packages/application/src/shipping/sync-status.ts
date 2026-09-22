import { OrderBoxService, OrderService, ShipmentEventService, ShipmentService } from '@lezzet/database';
import { aggregateShipmentStatus, classifyCarrierStatus, isTerminalShipmentStatus } from '@lezzet/domain-core';
import { captureError, SOURCES } from '@lezzet/observability';
import type { OrderBox, OrderStatus, Shipment, ShipmentStatus } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverOrder } from '../order/fulfillment';
import { transitionOrder } from '../order/transition';
import type { OrderEffects } from '../order/effects';
import type { ShippingRateProvider } from './port';

/**
 * Taşıyıcı durumunu bize yazan tek kapı: webhook ve nöbet cron'u buradan geçer, çünkü kargo siparişinin kuryesi yok ve
 * durum başka yoldan ilerlemez. Durum webhook gövdesinden değil sağlayıcıya sorularak okunur; sipariş yalnız
 * `out_for_delivery` ve `delivered`e taşınır, iade malın depoya fiziksel dönüşüne bağlı olduğu için operatöre kalır.
 */

export type SyncOutcome =
  | {
      status: 'ok';
      /** Uzlaştırma sonrası gönderi durumu; `null` = ölçülemedi, mevcut korundu. */
      shipmentStatus: ShipmentStatus | null;
      /** Gönderi durumu gerçekten değişti mi. */
      changed: boolean;
      /** Deftere yazılan yeni olay sayısı (değişmeyen koli satır üretmez). */
      events: number;
      /** Tanınmayan kod sayısı — eşleme tablosunun büyüme sinyali. */
      unrecognized: number;
      /** Siparişin taşındığı durum; `null` = sipariş kıpırdamadı. */
      orderMoved: OrderStatus | null;
    }
  | { status: 'not_found' }
  /** Duyurulmamış gönderi — sağlayıcıda karşılığı yok, sorulacak bir şey de yok. */
  | { status: 'no_provider_id' }
  /** Zaten terminal (teslim/iade/iptal): sağlayıcıya sorulmaz, boş tur atılmaz. */
  | { status: 'terminal'; shipmentStatus: ShipmentStatus }
  | { status: 'provider_error'; code: string; message: string };

export interface SyncInput {
  shipmentId: string;
  /** Yüzeyin sağladığı yan etkiler — müşteri haberi. Geçilmezse etki atlanır ama sessizce değil. */
  effects?: OrderEffects;
  /** Terminal gönderiyi de yeniden sor (elle teşhis). Nöbet turu KULLANMAZ. */
  force?: boolean;
}

export async function syncShipmentStatus(db: SupabaseClient, provider: ShippingRateProvider, input: SyncInput): Promise<SyncOutcome> {
  const shipments = new ShipmentService(db);
  const shipment = await shipments.getById(input.shipmentId);
  if (!shipment) return { status: 'not_found' };
  if (!shipment.providerShipmentId) return { status: 'no_provider_id' };
  if (!input.force && isTerminalShipmentStatus(shipment.status)) {
    return { status: 'terminal', shipmentStatus: shipment.status };
  }

  let parcels;
  try {
    parcels = await provider.status(shipment.providerShipmentId);
  } catch (err) {
    const code = (err as { code?: string })?.code ?? 'provider';
    return { status: 'provider_error', code, message: err instanceof Error ? err.message : String(err) };
  }

  const boxes = (await new OrderBoxService(db).listByOrder(shipment.orderId)).filter((b) => b.shipmentId === shipment.id);
  const events = new ShipmentEventService(db);
  // Koli başına son olay: defter yoklamayı değil değişimi kaydeder, saatlik nöbet özdeş satır bırakmasın.
  const sonKod = new Map<string, string>();
  for (const e of await events.listByShipment(shipment.id)) {
    if (e.orderBoxId && !sonKod.has(e.orderBoxId)) sonKod.set(e.orderBoxId, e.providerCode);
  }

  const durum = new Map<string, ShipmentStatus | null>();
  let yazilan = 0;
  let taninmayan = 0;

  for (const parcel of parcels) {
    const box = eslesenKutu(boxes, parcel.parcelId, parcel.trackingNumber);
    const verdict = classifyCarrierStatus(parcel.code);
    if (box) durum.set(box.id, verdict.kind === 'status' ? verdict.status : null);
    if (verdict.kind === 'unknown') taninmayan += 1;
    if (!parcel.code) continue;

    // Eşleşmeyen koli de deftere girer: sağlayıcıda olup bizde karşılığı olmayan koli öksüz kolinin ilk izidir.
    const boxId = box?.id ?? null;
    if (boxId && sonKod.get(boxId) === parcel.code.trim().toUpperCase()) continue;

    /* Tanınmayan kod hata kaydına `warning` olarak yazılır: kaydın parmak izi hangi kod olduğunu gruplar ve çözülene kadar
       tutar, sayaç ise pencere geçince sıfırlanırdı. Yalnız değişimde yazılır, nöbet aynı uyarıyı tekrarlamaz. */
    if (verdict.kind === 'unknown') {
      await captureError(new Error(`Tanınmayan taşıyıcı durum kodu: ${parcel.code.trim().toUpperCase()}`), {
        source: SOURCES.applicationShipping,
        level: 'warning',
        // Kimlik yazılır, içerik yazılmaz: hangi gönderi olduğu yeter, o kimlikle deftere bakılır.
        context: { shipmentId: shipment.id, orderBoxId: boxId, carrierCode: shipment.carrierCode },
      });
    }

    await events.insert({
      shipmentId: shipment.id,
      orderBoxId: boxId,
      providerCode: parcel.code.trim().toUpperCase(),
      mappedStatus: verdict.kind === 'status' ? verdict.status : null,
      recognized: verdict.kind !== 'unknown',
      message: parcel.message,
      occurredAt: new Date().toISOString(),
      /* `raw` yalnız tanınmayan kodda ve yalnız okuduğumuz iki alan: kişisel veri satıra hiç girmez. */
      raw: verdict.kind === 'unknown' ? { code: parcel.code, message: parcel.message, source: 'rest' } : null,
    });
    yazilan += 1;
  }

  // Uzlaştırma bizim kutularımız üzerinden: sağlayıcının bildirmediği kutu "ölçülemedi"dir ve siparişi erken teslim etmez.
  const toplu = aggregateShipmentStatus(boxes.map((b) => durum.get(b.id) ?? null));
  const changed = toplu !== null && toplu !== shipment.status;
  if (changed) await shipments.setStatus(shipment.id, toplu);

  const orderMoved = await siparisiTasi(db, shipment, toplu, input.effects);
  return { status: 'ok', shipmentStatus: toplu ?? shipment.status, changed, events: yazilan, unrecognized: taninmayan, orderMoved };
}

/**
 * Koli eşleştirme: birincil anahtar sağlayıcının koli kimliği, takip numarası yedek; takip numarası bazı taşıyıcılarda
 * geç atandığı için ona bağlı eşleşme erken olayları kaçırırdı.
 */
function eslesenKutu(boxes: readonly OrderBox[], parcelId: string | null, trackingNumber: string | null): OrderBox | undefined {
  if (parcelId) {
    const hit = boxes.find((b) => b.providerParcelRef === parcelId);
    if (hit) return hit;
  }
  if (trackingNumber) return boxes.find((b) => b.trackingNumber === trackingNumber);
  return undefined;
}

/**
 * Gönderi durumundan sipariş durumuna; taşıyıcının webhook'u ve depodaki devir okutması aynı kuralı buradan çağırır.
 * Atlanan `out_for_delivery` önce yazılır, çünkü teslim RPC'si yalnız o durumdan teslim eder.
 */
export async function siparisiTasi(
  db: SupabaseClient,
  shipment: Shipment,
  toplu: ShipmentStatus | null,
  effects: OrderEffects | undefined,
): Promise<OrderStatus | null> {
  if (toplu === null) return null;
  const hedef: OrderStatus | null =
    toplu === 'handed_over' || toplu === 'in_transit' || toplu === 'out_for_delivery'
      ? 'out_for_delivery'
      : toplu === 'delivered'
        ? 'delivered'
        : null; // created · returned · cancelled · error → sipariş kıpırdamaz (künye)
  if (!hedef) return null;

  const order = await new OrderService(db).getById(shipment.orderId);
  if (!order) return null;

  // Yola çıkış yalnız hazırlık kulvarındaki siparişte anlamlı; ilerideki sipariş geri çekilmez.
  const yolaCikisGerek = order.status === 'confirmed' || order.status === 'preparing' || order.status === 'ready';
  if (yolaCikisGerek) {
    const sonuc = await transitionOrder(db, { orderId: order.id, to: 'out_for_delivery', actorId: null, effects });
    if (sonuc.status !== 'ok') return null;
    if (hedef === 'out_for_delivery') return 'out_for_delivery';
  } else if (hedef === 'out_for_delivery') {
    return null; // zaten yolda ya da ötesinde — yazacak bir şey yok
  }

  if (order.status !== 'out_for_delivery' && !yolaCikisGerek) return null;
  // Teslim kendi kapısından: ayrılmış düşer, fiili stok kayıtlı partilerden düşer, haber gider.
  const teslim = await deliverOrder(db, order.id, { actorId: null, effects });
  return teslim.ok ? 'delivered' : yolaCikisGerek ? 'out_for_delivery' : null;
}
