import { OrderService, type serviceDb } from '@lezzet/database';
import { derivePaymentStatusForOrder } from '@lezzet/domain-core';
import type { DeliveryType, OrderStatus, PaymentStatus } from '@lezzet/types';
import { readVariantTitles } from './line-titles';

/**
 * Siparişin ÖZETİ — "detay sayfasına gitmeden şuna bir bakayım" sorusunun cevabı.
 *
 * Neden detay okumasının kendisi kullanılmıyor: `readOrderDetail` sayfanın tam veri turudur — para
 * hareketleri, talepler, partiler, hesaplar, zaman çizelgesi ve kâr kırılımı için on iki servise
 * vurur. Bir göz atma diyaloğu için o kadarı gereksiz; ama **kuralların hiçbiri burada yeniden
 * yazılmaz.** Ödeme durumu ve kalan tutar motordan gelir (`derivePaymentStatusForOrder`), satır
 * adları ortak `titleOf`'tan. Dar olan şey veri toplama, karar değil.
 *
 * **Ödeme durumu KOLONDAN okunmaz, TÜRETİLİR.** `order.payment_status` sipariş anında yazılan
 * değerdir ve gerçeği geriden takip eder: tamamı ödenmiş bir sipariş kolonda `partial` görünebilir
 * (29.07'de yaşandı — kalem indirim payı yazılmadığı için motor müşteriyi borçlu sanıyordu). Diyalog
 * o hatayı tekrar göstermesin diye motora sorar.
 */
export interface OrderSummaryLine {
  id: string;
  title: string;
  qty: number;
  /** Karşılanan miktar — sipariş edilenden az olabilir (kısmi karşılama). */
  fulfilledQty: number;
  unitPriceCents: number;
  /** Kaleme inen indirim payı (kuruş) — başlıktaki indirimin bu satıra düşen kısmı. */
  lineDiscountCents: number;
  lineTotalCents: number;
}

export interface OrderSummaryView {
  id: string;
  referenceNo: string | null;
  createdAt: string;
  status: OrderStatus;
  /** TÜRETİLMİŞ ödeme durumu (kolon değil — bkz. dosya başı). */
  paymentStatus: PaymentStatus;
  /** Hâlâ tahsil edilecek tutar (kuruş); türetilmiş. */
  openCents: number;
  deliveryType: DeliveryType;
  deliveryDate: string | null;
  isGiftOrder: boolean;
  onAccount: boolean;
  lines: OrderSummaryLine[];
  /** Kalem toplamı (indirim öncesi) — kuruş. */
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  /** Detay sayfasının yolu — diyalog bir GÖZ ATMADIR, eylemler orada. */
  href: string;
}

type Db = ReturnType<typeof serviceDb>;

export async function readOrderSummary(db: Db, orderId: string): Promise<OrderSummaryView | null> {
  const orders = new OrderService(db);
  const found = await orders.getWithItems(orderId);
  if (!found) return null;
  const { order, items } = found;

  // Kalem adları ORTAK yardımcıdan: aynı zincir sipariş detayında da var, iki kopya olmasın.
  const titleByVariant = await readVariantTitles(db, items.map((i) => i.variantId));

  const lines: OrderSummaryLine[] = items.map((item) => {
    // Servis cent döndürüyor (02.9) — burada iki `toCents` çağrısı vardı, ikisi de kalktı.
    const { unitPriceCents, lineDiscountAmountCents: lineDiscountCents } = item;
    return {
      id: item.id,
      title: titleByVariant.get(item.variantId) ?? 'Silinmiş boy',
      qty: item.qty,
      fulfilledQty: item.fulfilledQty,
      unitPriceCents,
      lineDiscountCents,
      lineTotalCents: unitPriceCents * item.qty - lineDiscountCents,
    };
  });

  // Karar MOTORUN: "ne kadar borçlu, durumu ne" sorusu burada hesaplanmaz, sorulur.
  const derived = derivePaymentStatusForOrder(order, items, {
    collectedCents: order.amountCollectedCents,
    refundedCents: order.amountRefundedCents,
  });

  return {
    id: order.id,
    referenceNo: order.referenceNo,
    createdAt: order.createdAt,
    status: order.status,
    paymentStatus: derived.status,
    openCents: derived.amountToCollectCents,
    deliveryType: order.deliveryType,
    deliveryDate: order.deliveryDate,
    isGiftOrder: order.isGiftOrder,
    onAccount: order.onAccount,
    lines,
    // İndirim ÖNCESİ toplam: başlıktaki indirimin neyin üstüne indiği ancak böyle görünür.
    subtotalCents: lines.reduce((sum, l) => sum + l.unitPriceCents * l.qty, 0),
    discountCents: order.discountAmountCents,
    shippingCents: order.shippingFeeCents,
    totalCents: order.orderedTotalCents,
    href: `/operations/orders/${order.id}`,
  };
}
