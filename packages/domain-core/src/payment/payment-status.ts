import type { Order, OrderItem, PaymentStatus } from '@lezzet/types';
import { isFulfillmentSettled } from '../order/status-machine';

/**
 * Ödeme durumu elle yazılmaz, net tahsilat (tahsil − iade) ile karşılanan tutardan türer (DOMAIN §7); kurallar orada. İndirim
 * payı (`line_discount_amount`) girdidir, yeniden dağıtılmaz, çünkü kalem KDV'si ve kısmi iade aynı paydan hesaplanır.
 */

export interface FulfilledLine {
  /** Fiziksel olarak müşteriye giden miktar. */
  fulfilledQty: number;
  /** Gidenden müşteride kalıp parası iade edilen adet (jest); ücretlenmez, verilmezse 0. */
  goodwillQty?: number;
  /** Sabitlenmiş birim fiyat (kanal tabanında, cent). */
  unitPriceCents: number;
  /** Sepet indiriminin bu kaleme düşen payı (cent, kalemin TAMAMI için). */
  lineDiscountCents?: number;
  /** Sipariş edilen miktar — indirim payını karşılanan orana bölmek için. */
  orderedQty: number;
}

export interface PaymentDerivationInput {
  lines: readonly FulfilledLine[];
  collectedCents: number;
  refundedCents: number;
  shippingFeeCents?: number;
  /** Sipariş iptal edildiyse karşılanan tutar 0 sayılır (ORDER_LIFECYCLE). */
  cancelled?: boolean;
  /**
   * Hazırlık kesinleşti mi (`isFulfillmentSettled`); `false` iken beklenen tutar sipariş edilen adetten hesaplanır, çünkü
   * `fulfilled_qty` henüz yazılmamıştır. Verilmezse `true` sayılır.
   */
  fulfillmentSettled?: boolean;
  /**
   * Siparişin anlaşılan toplamı (cent, indirim düşülmüş, kargo eklenmiş); hazırlık kesinleşmeden beklenen tutar budur ve
   * kalemlerden yeniden hesaplanmaz, yoksa kaleme yazılmamış bir indirim payı tutarı şişirirdi. Verilmezse kalemlerden hesaplanır.
   */
  orderTotalCents?: number;
}

export interface PaymentDerivation {
  status: PaymentStatus;
  /** Müşterinin ödemesi gereken tutar — kısmi karşılamada düşürülmüş hâli. */
  fulfilledAmountCents: number;
  /** Peşin ödenmişse iade edilecek fark (0 ise borç yok). */
  refundDueCents: number;
  /** Kapıda ödenecekse tahsil edilecek kalan (0 ise tahsilat yok). */
  amountToCollectCents: number;
}

/**
 * Siparişin kendisinden türetim: girdi eşlemesi (kargo, indirim payı, iptal) tek yerde durur, iki ekran farklı sayı göstermez.
 * Tutarlar dışarıdan gelir, çünkü siparişteki `amount_*` bir önbellektir ve doğrusu para hareketlerindedir.
 */
export function derivePaymentStatusForOrder(
  order: Pick<Order, 'shippingFeeCents' | 'status' | 'orderedTotalCents'>,
  items: readonly Pick<OrderItem, 'fulfilledQty' | 'goodwillQty' | 'qty' | 'unitPriceCents' | 'lineDiscountAmountCents'>[],
  amounts: { collectedCents: number; refundedCents: number },
): PaymentDerivation {
  return derivePaymentStatus({
    lines: items.map((item) => ({
      fulfilledQty: item.fulfilledQty,
      goodwillQty: item.goodwillQty,
      orderedQty: item.qty,
      unitPriceCents: item.unitPriceCents,
      lineDiscountCents: item.lineDiscountAmountCents,
    })),
    collectedCents: amounts.collectedCents,
    refundedCents: amounts.refundedCents,
    shippingFeeCents: order.shippingFeeCents,
    // İptal edilen siparişte karşılanan tutar 0 sayılır (ORDER_LIFECYCLE): tahsil edilmişse tamamı
    // iade borcudur.
    cancelled: order.status === 'cancelled',
    // Hazırlanmamış siparişin `fulfilled_qty`'si bir karar değil, henüz yazılmamış bir sayıdır.
    fulfillmentSettled: isFulfillmentSettled(order.status, items),
    // O aşamada beklenen tutar SİPARİŞ EDİLENDİR (bkz. `orderTotalCents`) — `revenueTotalCents`
    // orada 0'dır ve doğru cevap değildir: mal henüz hazırlanmadı, "hiçbiri gitmedi" demek değil.
    orderTotalCents: order.orderedTotalCents,
  });
}

export function derivePaymentStatus(input: PaymentDerivationInput): PaymentDerivation {
  const fulfilledAmountCents = input.cancelled ? 0 : fulfilledAmount(input);
  const net = input.collectedCents - input.refundedCents;

  const refundDueCents = Math.max(0, net - fulfilledAmountCents);
  const amountToCollectCents = Math.max(0, fulfilledAmountCents - net);

  return {
    status: statusOf(net, fulfilledAmountCents, input.refundedCents),
    fulfilledAmountCents,
    refundDueCents,
    amountToCollectCents,
  };
}

function statusOf(net: number, fulfilled: number, refunded: number): PaymentStatus {
  // Para geri gitmiş ve elde bir şey kalmamışsa iade edilmiştir — karşılanan tutara bakılmaz.
  if (net <= 0) return refunded > 0 ? 'refunded' : 'pending';
  if (net >= fulfilled) return 'paid'; // fazlalık refundDueCents'te görünür
  return 'partial';
}

/**
 * Bir kalemin ücretlenen tutarı (cent): giden adetten jest adedi çıkar, indirim payı o orana bölünür; sipariş detayının KDV
 * satırı da bunu kullanır, çünkü vergi tabanı motorun "ödenecek" dediğiyle aynı olmalı. `settled = false` iken ölçü sipariş edilen adettir.
 */
export function fulfilledLineAmountCents(line: FulfilledLine, settled = true): number {
  const qty = settled ? chargedQty(line) : line.orderedQty;
  if (qty <= 0) return 0;
  const gross = line.unitPriceCents * qty;
  const discountShare = line.lineDiscountCents
    ? Math.round((line.lineDiscountCents * qty) / Math.max(1, line.orderedQty))
    : 0;
  return gross - discountShare;
}

/** Müşteride kalan mal jestse parası iade edilmiştir; o adet stokta ve maliyette gitmiş sayılır ama ücretlenmez (DOMAIN §8). */
function chargedQty(line: FulfilledLine): number {
  return line.fulfilledQty - (line.goodwillQty ?? 0);
}

/** Karşılanan tutar: kalemlerin ücretlenen kısmı, ücretlenen kalem varsa kargo da. */
function fulfilledAmount({ lines, shippingFeeCents = 0, fulfillmentSettled = true, orderTotalCents }: PaymentDerivationInput): number {
  // Hazırlık kesinleşmediyse cevap siparişin ANLAŞILAN toplamıdır — indirim ve kargo zaten içinde.
  // Kalemlerden yeniden toplamak, aynı gerçeği ikinci bir yoldan hesaplamak olurdu.
  if (!fulfillmentSettled && orderTotalCents != null) return orderTotalCents;

  let total = 0;
  let anyFulfilled = false;

  for (const line of lines) {
    const qty = fulfillmentSettled ? chargedQty(line) : line.orderedQty;
    if (qty <= 0) continue;
    anyFulfilled = true;
    total += fulfilledLineAmountCents(line, fulfillmentSettled);
  }

  // Ücretlenen kalem yoksa kargo da ücretlenmez: hiçbir şey gitmediyse hizmet verilmemiştir, her şey jestse para tamamen döner.
  return anyFulfilled ? total + shippingFeeCents : total;
}
