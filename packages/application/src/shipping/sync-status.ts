import { OrderBoxService, OrderService, ShipmentEventService, ShipmentService } from '@lezzet/database';
import { aggregateShipmentStatus, classifyCarrierStatus, isTerminalShipmentStatus } from '@lezzet/domain-core';
import type { OrderBox, OrderStatus, Shipment, ShipmentStatus } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverOrder } from '../order/fulfillment';
import { transitionOrder } from '../order/transition';
import type { OrderEffects } from '../order/effects';
import type { ShippingRateProvider } from './port';

/**
 * **TAŞIYICI DURUMUNU BİZE YAZAN TEK KAPI** (07.12) — webhook da nöbet cron'u da buradan geçer.
 *
 * ── ÖLÇÜLMÜŞ BOŞLUĞU KAPATIR ────────────────────────────────────────────────
 * 28.08'de ölçüldü ve tasarım kaydına §8.1 olarak yazıldı: `out_for_delivery` yalnız KURYE
 * akışından yazılıyor (`courier/load.ts`, `courier/day.ts` — ikisi de `order.courierId` şartına
 * bağlı), `delivered` ise yalnız `deliver_order` RPC'sinden ve tek çağıranı kurye kapısı.
 * **Kargo siparişinin kuryesi yok, dolayısıyla `ready`de takılı kalıyordu.** Bu dosya o zincirin
 * kargo kulvarındaki karşılığıdır.
 *
 * ── OPTION B: GELEN OLAYA DEĞİL, SAĞLAYICIYA SORULUR ────────────────────────
 * Webhook yalnız *"bir şey değişti"* der. Durum `provider.status()` ile REST'ten okunur. Gerekçe
 * ölçüme dayanıyor: v3 dokümanı webhook gövdesinin şemasını vermiyor, biçim oynadığı gün gövdeden
 * okunan bir durum siparişi sessizce yanlış yere taşırdı. Yan faydası: kaçan webhook nöbet
 * turunda kendiliğinden telafi olur — kapı iki çağıran için de aynı.
 *
 * ── OTOMATİK ZİNCİR YALNIZ İKİ DURUMU YAZAR ─────────────────────────────────
 * `out_for_delivery` ve `delivered`. **`returned`/`error` sipariş durumuna DOKUNMAZ** ve bu
 * bilinçli: iade stok ve paraya dokunur, stok etkisi de malın FİZİKSEL depoya dönüşüne çıpalıdır
 * (`DOMAIN §4`, `status-machine` künyesi). Taşıyıcının "gönderene dönüyor" demesi malın depoda
 * olduğu anlamına gelmez — o an `returned` yazmak, olmamış bir fiziksel olayı kaydetmek olurdu.
 * Gönderi durumu ve ham kod deftere yazılır, kararı operatör verir.
 *
 * **Kapanış (`completed`) da burada YAPILMAZ** — ölçüldü 28.08: `closeOrder`ın bugün hiçbir
 * üretim çağıranı yok, rota kulvarında da yok. Kargoya özel bir kapanış yazmak, iki kulvarı ayrı
 * kurallara bölmek olurdu; eksik olan zincirin tamamı ve yeri burası değil (`BEKLEYEN(07.13)`).
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
  // Koli başına SON olay — defter DEĞİŞİMİ kaydeder, yoklamayı değil. Nöbet saat başı koşuyor;
  // her turda satır yazsaydı bir haftalık gönderi 168 özdeş satır bırakırdı ve zaman çizgisi
  // okunmaz hâle gelirdi.
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

    // Eşleşmeyen koli de deftere girer (`orderBoxId: null`): sağlayıcıda bizde karşılığı olmayan
    // bir koli varsa bu ÖKSÜZ KOLİ'nin ilk izidir ve kaybolmamalı.
    const boxId = box?.id ?? null;
    if (boxId && sonKod.get(boxId) === parcel.code.trim().toUpperCase()) continue;

    await events.insert({
      shipmentId: shipment.id,
      orderBoxId: boxId,
      providerCode: parcel.code.trim().toUpperCase(),
      mappedStatus: verdict.kind === 'status' ? verdict.status : null,
      recognized: verdict.kind !== 'unknown',
      message: parcel.message,
      occurredAt: new Date().toISOString(),
      /*
        `raw` YALNIZ tanınmayan kodda ve **sağlayıcı yükünün tamamı DEĞİL**: okuduğumuz iki alan.
        Kişisel veri kuralı (CLAUDE §1) böyle yapıca sağlanıyor — ayıklamaya güvenmek, bir gün
        ayıklamayı unutmaya güvenmektir. Alıcı adı/adresi/telefonu bu satıra hiç girmiyor.
      */
      raw: verdict.kind === 'unknown' ? { code: parcel.code, message: parcel.message, source: 'rest' } : null,
    });
    yazilan += 1;
  }

  // Uzlaştırma BİZİM kutularımız üzerinden: sağlayıcının hiç bildirmediği kutu "ölçülemedi"dir
  // (`null`) ve gönderiyi terminale taşımaz. Sağlayıcının dizisi üzerinden saysaydık, eksik
  // bildirilen koli hiç yokmuş gibi davranır ve sipariş erken teslim olurdu.
  const toplu = aggregateShipmentStatus(boxes.map((b) => durum.get(b.id) ?? null));
  const changed = toplu !== null && toplu !== shipment.status;
  if (changed) await shipments.setStatus(shipment.id, toplu);

  const orderMoved = await siparisiTasi(db, shipment, toplu, input.effects);
  return { status: 'ok', shipmentStatus: toplu ?? shipment.status, changed, events: yazilan, unrecognized: taninmayan, orderMoved };
}

/**
 * Koli eşleştirme — **birincil anahtar sağlayıcının koli kimliği**, takip numarası yedek.
 * Sıra önemli: takip numarası bazı taşıyıcılarda geç atanıyor, ona bağlanan eşleşme erken
 * olayları kaçırır (referans projenin 13 migration sonra öğrendiği ders, tasarım kaydı §6.2).
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
 * Gönderi durumundan SİPARİŞ durumuna — zincirin kargo kulvarındaki halkası.
 *
 * Atlanan adım yazılır: sipariş `ready`deyken gönderi doğrudan `delivered` görünürse önce
 * `out_for_delivery` yazılır, sonra teslim edilir. `deliver_order` RPC'si yalnız
 * `out_for_delivery`den teslim ediyor (0016) — ara adımı atlamak teslim çağrısını `stale`e
 * düşürürdü ve sipariş yine takılı kalırdı, ama bu kez sebebi görünmez olurdu.
 */
async function siparisiTasi(
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

  // Yola çıkış: yalnız hazırlık kulvarındaki siparişte anlamlı. Sipariş zaten ilerideyse
  // (teslim/iptal) geri çekilmez — durum makinesi de buna izin vermez, ama boş çağrı da atılmaz.
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
