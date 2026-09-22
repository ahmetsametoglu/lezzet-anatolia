import {
  OrderBoxService,
  OrderItemService,
  OrderService,
  OrderStatusLogService,
  UserProfileService,
  type Db,
} from '@lezzet/database';
import { addressLine } from '@lezzet/address';
import { canTransition, derivePaymentStatusForOrder } from '@lezzet/domain-core';
import type { Channel, Order, PaymentStatus, Warehouse } from '@lezzet/types';
import { boxScanRecord, cashLegalLimitCents, type DoorCollectionInput } from '../courier/delivery';
import { readDoorCashAccountId } from '../courier/day';
import type { OrderEffects } from '../order/effects';
import { deliverOrder } from '../order/fulfillment';
import { recordOrderPayment, syncOrderPaymentStatus } from '../order/payment';

/**
 * **Gel-al teslim — D9** (DOMAIN §6): izinli müşterinin checkout'ta seçtiği depodan, hazır (`ready`) siparişini alması.
 *
 * Gel-al siparişinin "yolda"sı yoktur: teslim `ready`den yazılır ve kapı yine `deliver_order` (fiili stok düşer, rezervasyon
 * kapanır, haber gider). Sıra kuryenin kapıdaki sırasıyla aynı ve aynı sebeple: önce kutu kapısı (hiçbir yazım yapılmadan),
 * sonra MAL + TESLİM, en sonda PARA — teslim `stale` dönerse karşılığı olmayan para yazılmış olmaz.
 *
 * Tahsilat tezgâhta kapıdakiyle aynı şekildir (`DoorCollectionInput`): yöntem siparişe yazılır, hareket deponun kapı
 * kasasına girer, nakit yasal sınırı uyarır ama engellemez.
 */

export interface PickupQueueOrder {
  orderId: string;
  referenceNo: string | null;
  /** Hesap sahibi — tezgâhta "kim için" sorusunun cevabı; gel-al'da kapıya giden alıcı yoktur. */
  customerName: string | null;
  channel: Channel;
  lineCount: number;
  boxCount: number;
  /** Siparişin kutuları — tezgâhta okutulacak kodlar; ekran doğru kutuyu buradan tanır, simülasyon çipini buradan kurar. */
  boxes: { boxNo: number; code: string }[];
  /** `ready`ye ilk geçiş anı; defterde yoksa `null` — süre o zaman hesaplanmaz, uydurulmaz. */
  readyAt: string | null;
  waitingDays: number | null;
  /** Tezgâhta alınacak para (cent); online ödenmiş ya da vadeli siparişte 0. */
  amountDueCents: number;
  onAccount: boolean;
  paymentStatus: PaymentStatus;
}

export interface PickupQueue {
  orders: PickupQueueOrder[];
  /** Tezgâh tahsilatının gireceği kasa — deponun kapı kasası ayarı; boşsa tahsilat kapısı kapalıdır. */
  cashAccountId: string | null;
}

/** Deponun tek satır adresi — müşteriye söylenen yer; jsonb'nin alanları adres paketinin sözleşmesiyle okunur. */
export function warehouseAddressLine(warehouse: Pick<Warehouse, 'address'>): string {
  const parts = (warehouse.address ?? {}) as { line1?: string; line2?: string; postalCode?: string; city?: string };
  return addressLine(parts);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Hazır olalı kaç TAM gün geçti; damga yoksa `null` (sıfır değil — ölçülemeyen süre "yeni" demek değildir). */
export function waitingDaysSince(readyAt: string | null, now: Date): number | null {
  if (!readyAt) return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(readyAt).getTime()) / DAY_MS));
}

/** Bu depoda müşterisini bekleyen gel-al siparişleri, en eski hazır olan önce. */
export async function listPickupQueue(db: Db, input: { warehouseId: string; now?: Date }): Promise<PickupQueue> {
  const orders = (await new OrderService(db).listByStatus('ready', { warehouseId: input.warehouseId, limit: 200 })).filter(
    (order) => order.deliveryType === 'pickup',
  );
  const cashAccountId = await readDoorCashAccountId(db, { warehouseId: input.warehouseId });
  if (orders.length === 0) return { orders: [], cashAccountId };

  const ids = orders.map((order) => order.id);
  const [items, boxes, logs, customers] = await Promise.all([
    new OrderItemService(db).listByOrders(ids),
    new OrderBoxService(db).listByOrders(ids),
    new OrderStatusLogService(db).listByOrders(ids),
    new UserProfileService(db).listByIds([...new Set(orders.map((order) => order.customerId))]),
  ]);
  const nameOf = new Map(customers.map((customer) => [customer.id, customer.name]));
  const now = input.now ?? new Date();

  const rows = orders.map((order) => {
    const own = items.filter((item) => item.orderId === order.id);
    const readyAt = logs.find((log) => log.orderId === order.id && log.toStatus === 'ready')?.createdAt ?? null;
    const derivation = derivePaymentStatusForOrder(order, own, {
      collectedCents: order.amountCollectedCents,
      refundedCents: order.amountRefundedCents,
    });
    return {
      orderId: order.id,
      referenceNo: order.referenceNo,
      customerName: nameOf.get(order.customerId) ?? null,
      channel: order.channel,
      lineCount: own.length,
      boxCount: boxes.filter((box) => box.orderId === order.id).length,
      boxes: boxes
        .filter((box) => box.orderId === order.id)
        .sort((a, b) => a.boxNo - b.boxNo)
        .map((box) => ({ boxNo: box.boxNo, code: box.code })),
      readyAt,
      waitingDays: waitingDaysSince(readyAt, now),
      amountDueCents: derivation.amountToCollectCents,
      onAccount: order.onAccount,
      paymentStatus: order.paymentStatus,
    };
  });
  rows.sort((a, b) => (a.readyAt ?? '').localeCompare(b.readyAt ?? ''));
  return { orders: rows, cashAccountId };
}

/**
 * Bekleme süresi dolan gel-al siparişleri — ofisin listesi (pano + sipariş listesi). Randevu sistem dışı olduğu için
 * "gelmedi"nin tek ölçüsü süredir; karar (iptal, arama) ofisin, burası yalnız sayar.
 */
export async function countOverduePickups(
  db: Db,
  input: { warehouseIds?: readonly string[]; waitDays: number; now?: Date },
): Promise<number> {
  if (input.warehouseIds?.length === 0) return 0;
  const { rows: orders } = await new OrderService(db).listPage(
    { status: ['ready'], deliveryType: 'pickup', warehouseIds: input.warehouseIds ? [...input.warehouseIds] : undefined },
    { limit: 500 },
  );
  if (orders.length === 0) return 0;
  const logs = await new OrderStatusLogService(db).listByOrders(orders.map((order) => order.id));
  const now = input.now ?? new Date();
  return orders.filter((order) => {
    const readyAt = logs.find((log) => log.orderId === order.id && log.toStatus === 'ready')?.createdAt ?? null;
    const days = waitingDaysSince(readyAt, now);
    return days !== null && days > input.waitDays;
  }).length;
}

export type PickupDeliveryOutcome =
  | {
      status: 'ok';
      collectedCents: number;
      amountDueCents: number;
      paymentStatus: PaymentStatus;
      cashLimitExceeded: boolean;
      collectionDeduped?: true;
    }
  | { status: 'boxes_missing'; remainingBoxNos: number[] }
  | { status: 'not_ready'; currentStatus: Order['status'] }
  | { status: 'not_pickup' }
  | { status: 'forbidden'; reason: 'out_of_scope' }
  | { status: 'not_found' };

export async function deliverPickupOrder(
  db: Db,
  input: {
    orderId: string;
    /** Depocunun deposu — siparişinki değilse yazım HİÇ yapılmaz (CLAUDE §1). */
    warehouseId: string;
    actorId: string;
    scannedBoxCodes: readonly string[];
    collection?: DoorCollectionInput | null;
    effects?: OrderEffects;
  },
): Promise<PickupDeliveryOutcome> {
  const orders = new OrderService(db);
  const order = await orders.getById(input.orderId);
  if (!order) return { status: 'not_found' };
  if (order.warehouseId !== input.warehouseId) return { status: 'forbidden', reason: 'out_of_scope' };
  if (order.deliveryType !== 'pickup') return { status: 'not_pickup' };
  if (!canTransition(order.status, 'delivered', { deliveryType: order.deliveryType }).allowed) {
    return { status: 'not_ready', currentStatus: order.status };
  }

  // Kutu kapısı yazımdan önce: mal kutusuyla hazırlanır, kutusuyla müşteriye verilir (kurye kapısının aynı kuralı, 23.8).
  const boxes = await new OrderBoxService(db).listByOrder(input.orderId);
  const scanned = new Set(input.scannedBoxCodes.map((code) => code.trim()));
  const remaining = boxes.filter((box) => !scanned.has(box.code));
  if (boxes.length === 0 || remaining.length > 0) {
    return { status: 'boxes_missing', remainingBoxNos: remaining.map((box) => box.boxNo) };
  }

  const written = await deliverOrder(db, input.orderId, {
    actorId: input.actorId,
    deliveryProof: boxScanRecord(
      boxes.map((box) => box.code),
      input.actorId,
    ),
    effects: input.effects,
  });
  if (!written.ok) return { status: 'not_ready', currentStatus: written.currentStatus };

  if (!input.collection) {
    const synced = await syncOrderPaymentStatus(db, input.orderId);
    if (synced.status !== 'ok') return { status: 'not_found' };
    return {
      status: 'ok',
      collectedCents: 0,
      amountDueCents: synced.derivation.amountToCollectCents,
      paymentStatus: synced.paymentStatus,
      cashLimitExceeded: false,
    };
  }

  const cashLimitExceeded = input.collection.method === 'cash' && input.collection.amountCents > (await cashLegalLimitCents(db));
  // Yöntem siparişe yazılır: kasa mutabakatı beklenen toplamları yöntem bazında bundan türetir.
  await orders.update({ id: input.orderId, paymentMethod: input.collection.method });
  const paid = await recordOrderPayment(db, {
    orderId: input.orderId,
    accountId: input.collection.accountId,
    amountCents: input.collection.amountCents,
    description: 'Gel-al tahsilatı',
    idempotencyKey: input.collection.idempotencyKey,
    source: 'system',
  });
  if (paid.status !== 'ok') return { status: 'not_found' };

  return {
    status: 'ok',
    collectedCents: paid.deduped ? 0 : input.collection.amountCents,
    amountDueCents: paid.derivation.amountToCollectCents,
    paymentStatus: paid.paymentStatus,
    cashLimitExceeded,
    ...(paid.deduped ? { collectionDeduped: true as const } : {}),
  };
}
