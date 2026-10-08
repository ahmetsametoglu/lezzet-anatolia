import type { MoneyMovement, Order, OrderItem, PaymentMethod, RegisterLine, RegisterPayment, RegisterTicketSnapshot } from '@lezzet/types';
import { chargedShippingParts } from '../delivery/shipping-fee';
import { hasLeftWarehouse, isFulfillmentSettled } from '../order/status-machine';
import {
  chargedQtyOf,
  derivePaymentStatusForOrder,
  fulfilledLineAmountCents,
  fulfilledLineOf,
  type FulfilledItem,
} from '../payment/payment-status';

/**
 * Sertifikalı kasaya yazılacak farkın planı (docs/feature/kasa-muhasebe.md §7): siparişin bugünkü hâli kasa aynasıyla
 * karşılaştırılır, yalnız fark yazılır. Hareketler silinip ekstreyle yutulabildiği için olay başına yazım mükerrer üretirdi.
 */

export type RegisterOrder = Pick<
  Order,
  'status' | 'channel' | 'isGiftOrder' | 'shippingFeeCents' | 'orderedTotalCents' | 'pricesIncludeVat'
>;
export type RegisterItem = FulfilledItem & Pick<OrderItem, 'id' | 'vatRate'>;

/** Siparişin tahsilat ya da iade hareketi, kasanın gördüğü yüzüyle. */
export type RegisterMovement = Pick<MoneyMovement, 'id' | 'createdAt'> & {
  /** **Cent**; tahsilat artı, iade eksi. */
  signedAmountCents: number;
  /** `null` = yöntemi bilinmeyen hareket; kasaya hangi ödeme koduyla gideceği tahmin edilmez. */
  method: PaymentMethod | null;
};

export type RegisterOp =
  | { op: 'open_ticket'; seq: number; lines: RegisterLine[]; payments: RegisterPayment[] }
  | { op: 'add_payments'; seq: number; payments: RegisterPayment[] }
  /** Kasadaki ödeme satırları silinen hareketten eşdeğer yeni harekete geçer; kasaya yazım yoktur. */
  | { op: 'relink_payment'; fromMovementId: string; toMovementId: string };

export type RegisterSkip = 'b2b' | 'gift_order';
export type RegisterBlockReason = 'gift_order_money' | 'unknown_method' | 'refund_before_sale' | 'no_lines';

export type RegisterPlan =
  | { status: 'skip'; reason: RegisterSkip }
  | {
      status: 'plan';
      ops: RegisterOp[];
      /** Plan bu harekette durdu, sonrakiler sırasını bekler: kasaya tahminle yazılmaz. */
      blocked: { reason: RegisterBlockReason; movementId: string | null } | null;
      /** Hedef kalemler türetilen borcu tutmuyor; yazım sürer, fark fişin bakiyesinde görünür. */
      dueMismatch: boolean;
    };

export interface RegisterPlanInput {
  order: RegisterOrder;
  items: readonly RegisterItem[];
  movements: readonly RegisterMovement[];
  tickets: readonly RegisterTicketSnapshot[];
}

export function planRegister({ order, items, movements, tickets }: RegisterPlanInput): RegisterPlan {
  // B2B kasa yükümlülüğünün dışında ve faturası muhasebeden kesilir; hediye sipariş ödemesiz kapanır, para görmez.
  if (order.channel === 'b2b') return { status: 'skip', reason: 'b2b' };
  if (order.isGiftOrder && movements.length === 0) return { status: 'skip', reason: 'gift_order' };

  const ops: RegisterOp[] = [];
  const result = (blocked: { reason: RegisterBlockReason; movementId: string | null } | null): RegisterPlan => ({
    status: 'plan',
    ops,
    blocked,
    dueMismatch: dueMismatchOf(order, items),
  });
  if (order.isGiftOrder) return result({ reason: 'gift_order_money', movementId: movements[0]?.id ?? null });

  const written = writtenNetOf(tickets);
  const present = new Set(movements.map((movement) => movement.id));
  const pending = movements.filter((movement) => !written.has(movement.id)).sort(byTime);
  const lines = tickets.flatMap((ticket) => ticket.lines);
  let lastSeq = Math.max(0, ...tickets.map((ticket) => ticket.seq));

  // Siparişten çıkan hareket (silindi ya da başka siparişe geçti): eşdeğer yeni hareket (ekstre birleştirmesi) satırları devralır,
  // yoksa yazılmış neti ters satırla geri alınır.
  for (const [movementId, net] of written) {
    if (present.has(movementId)) continue;
    const parts = [...net].filter(([, cents]) => cents !== 0);
    if (parts.length === 0) continue;
    const [only] = parts;
    const twin = parts.length === 1 ? pending.findIndex((m) => m.method === only![0] && m.signedAmountCents === only![1]) : -1;
    if (twin >= 0) {
      const [movement] = pending.splice(twin, 1);
      ops.push({ op: 'relink_payment', fromMovementId: movementId, toMovementId: movement!.id });
    } else {
      ops.push({
        op: 'add_payments',
        seq: lastSeq,
        payments: parts.map(([method, cents]) => ({ method, amountCents: -cents, movementId })),
      });
    }
  }

  // Siparişte duran hareketin yazılmışı tutmuyorsa (tutarı ya da yöntemi değişti, geri alınıp yeniden bağlandı) fark yeni satırdır.
  for (const movement of movements) {
    const net = written.get(movement.id);
    if (!net) continue;
    if (movement.method === null) return result({ reason: 'unknown_method', movementId: movement.id });
    const delta = paymentDeltaOf(net, movement.id, movement.method, movement.signedAmountCents);
    if (delta.length > 0) ops.push({ op: 'add_payments', seq: lastSeq, payments: delta });
  }

  for (const movement of pending) {
    if (movement.method === null) return result({ reason: 'unknown_method', movementId: movement.id });
    const payment: RegisterPayment = { method: movement.method, amountCents: movement.signedAmountCents, movementId: movement.id };

    if (lastSeq === 0) {
      if (movement.signedAmountCents < 0) return result({ reason: 'refund_before_sale', movementId: movement.id });
      const first = firstTicketLines(order, items);
      if (first.length === 0) return result({ reason: 'no_lines', movementId: movement.id });
      lastSeq = 1;
      ops.push({ op: 'open_ticket', seq: lastSeq, lines: first, payments: [payment] });
      lines.push(...first);
      continue;
    }

    const diff = diffRegisterLines(registerLinesOf(order, items, 'charged'), lines);
    if (diff.length === 0) {
      ops.push({ op: 'add_payments', seq: lastSeq, payments: [payment] });
      continue;
    }
    lastSeq += 1;
    ops.push({ op: 'open_ticket', seq: lastSeq, lines: diff, payments: [payment] });
    lines.push(...diff);
  }

  // Para doğurmayan kalem farkı (eksik ödenmiş siparişte iade, borçsuz iptal) ödemesiz fiştir; yoksa kasa gitmeyen malı satılmış gösterirdi.
  if (lastSeq > 0) {
    const diff = diffRegisterLines(registerLinesOf(order, items, 'charged'), lines);
    if (diff.length > 0) ops.push({ op: 'open_ticket', seq: lastSeq + 1, lines: diff, payments: [] });
  }
  return result(null);
}

/** Yazılmış ödeme satırlarının neti, hareket ve yöntem başına. */
function writtenNetOf(tickets: readonly RegisterTicketSnapshot[]): Map<string, Map<PaymentMethod, number>> {
  const net = new Map<string, Map<PaymentMethod, number>>();
  for (const payment of tickets.flatMap((ticket) => ticket.payments)) {
    const byMethod = net.get(payment.movementId) ?? new Map<PaymentMethod, number>();
    byMethod.set(payment.method, (byMethod.get(payment.method) ?? 0) + payment.amountCents);
    net.set(payment.movementId, byMethod);
  }
  return net;
}

/** Hareketin yazılmış neti ile bugünkü hâli arasındaki fark, yöntem başına. */
function paymentDeltaOf(
  net: Map<PaymentMethod, number>,
  movementId: string,
  method: PaymentMethod,
  signedAmountCents: number,
): RegisterPayment[] {
  const target = new Map([[method, signedAmountCents]]);
  return [...new Set([...net.keys(), method])]
    .map((candidate) => ({ method: candidate, amountCents: (target.get(candidate) ?? 0) - (net.get(candidate) ?? 0), movementId }))
    .filter((payment) => payment.amountCents !== 0);
}

/**
 * Siparişin kasadaki hedef kalemleri: `charged` ödeme türetiminin tanımıdır (iptalde boş), `ordered` sipariş edilen hâldir. Kargo,
 * ücretlenen kalem varsa oran başına bölünür. İçerik düzeltmesi sipariş depodan çıkınca yazılır, çünkü kapanmış fiş değişmez ve
 * hazır siparişin kutusu hâlâ yeniden açılabilir.
 */
function registerLinesOf(order: RegisterOrder, items: readonly RegisterItem[], basis: 'charged' | 'ordered'): RegisterLine[] {
  if (basis === 'charged' && order.status === 'cancelled') return [];
  const settled = basis === 'charged' && hasLeftWarehouse(order.status);

  const lines: RegisterLine[] = [];
  for (const item of items) {
    const line = fulfilledLineOf(item);
    const qty = chargedQtyOf(line, settled);
    if (qty <= 0) continue;
    lines.push({ kind: 'item', orderItemId: item.id, qty, amountCents: fulfilledLineAmountCents(line, settled), vatRate: item.vatRate });
  }
  const shipping = chargedShippingParts(
    order.shippingFeeCents,
    lines.map((line) => ({ totalCents: line.amountCents, vatRate: line.vatRate })),
  );
  return [
    ...lines,
    ...shipping.map((part) => ({
      kind: 'shipping' as const,
      orderItemId: null,
      qty: 1,
      amountCents: part.amountCents,
      vatRate: part.vatRate,
    })),
  ];
}

/** İlk fiş bugün ücretleneni yazar; ücretlenen kalem kalmadıysa (iptal, hepsi döndü) para sipariş edilen için alınmıştır. */
function firstTicketLines(order: RegisterOrder, items: readonly RegisterItem[]): RegisterLine[] {
  const charged = registerLinesOf(order, items, 'charged');
  return charged.length > 0 ? charged : registerLinesOf(order, items, 'ordered');
}

function diffRegisterLines(target: readonly RegisterLine[], registered: readonly RegisterLine[]): RegisterLine[] {
  const sums = new Map<string, { line: RegisterLine; qty: number; amountCents: number }>();
  for (const line of registered) {
    const sum = sums.get(keyOf(line));
    sums.set(keyOf(line), { line, qty: (sum?.qty ?? 0) + line.qty, amountCents: (sum?.amountCents ?? 0) + line.amountCents });
  }

  const diff: RegisterLine[] = [];
  for (const line of target) {
    const sum = sums.get(keyOf(line));
    sums.delete(keyOf(line));
    diff.push(...deltaOf(line, line, sum ?? { qty: 0, amountCents: 0 }));
  }
  // Hedefte artık bulunmayan kaynak: yazılmış olanın tamamı geri alınır.
  for (const sum of sums.values()) diff.push(...deltaOf(sum.line, { qty: 0, amountCents: 0 }, sum));
  return diff;
}

function keyOf(line: RegisterLine): string {
  return line.kind === 'item' ? `item:${line.orderItemId}` : `shipping:${line.vatRate}`;
}

type Amount = Pick<RegisterLine, 'qty' | 'amountCents'>;

/**
 * Tek kaynağın farkı; kargoda adet anlam taşımaz, fark tek kalemdir. Kalemde adet ile tutar aynı yöne gitmiyorsa (fiyat yazıldıktan
 * sonra değişmiş) yazılan geri alınıp hedef yeniden yazılır, çünkü sıfır adetli tutar kalemi kasaya yazılamaz.
 */
function deltaOf(base: RegisterLine, target: Amount, written: Amount): RegisterLine[] {
  const qty = target.qty - written.qty;
  const amountCents = target.amountCents - written.amountCents;
  if (base.kind === 'shipping') return amountCents === 0 ? [] : [{ ...base, qty: Math.sign(amountCents), amountCents }];
  if (qty === 0 && amountCents === 0) return [];
  if ((qty > 0 && amountCents >= 0) || (qty < 0 && amountCents <= 0)) return [{ ...base, qty, amountCents }];
  return [
    ...(written.qty !== 0 ? [{ ...base, qty: -written.qty, amountCents: -written.amountCents }] : []),
    ...(target.qty !== 0 ? [{ ...base, qty: target.qty, amountCents: target.amountCents }] : []),
  ];
}

function dueMismatchOf(order: RegisterOrder, items: readonly RegisterItem[]): boolean {
  // Hazır siparişte borç hazırlıktan türer, kasa kalemleri depodan çıkışta düzelir; aradaki fark uyarı değildir.
  if (isFulfillmentSettled(order.status) !== hasLeftWarehouse(order.status)) return false;
  const due = derivePaymentStatusForOrder(order, items, { collectedCents: 0, refundedCents: 0 }).fulfilledAmountCents;
  return registerLinesOf(order, items, 'charged').reduce((sum, line) => sum + line.amountCents, 0) !== due;
}

function byTime(a: RegisterMovement, b: RegisterMovement): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}
