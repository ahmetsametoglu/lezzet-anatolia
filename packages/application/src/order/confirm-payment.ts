import { AccountService, OrderService, ReservationService, StockService, type Db } from '@lezzet/database';
import { decideLatePayment } from '@lezzet/domain-core';
import type { OrderItem } from '@lezzet/types';
import { ringBell } from '../realtime/bell';
import { orderChannelName } from '../realtime/order-channel';
import type { OrderEffects } from './effects';
import { recordOrderPayment } from './payment';
import type { PaymentGateway } from './payment-gateway';
import { cancelOrder } from './refund';
import { transitionOrder } from './transition';

/**
 * Kart ödemesinin onay yolu, webhook'un ve sağlayıcıya soran kapının ortak ayağı: önce malın hâlâ bizde olup olmadığı, sonra para
 * yazılır, çünkü ters sırada iade edilecek siparişte tahsilat açık kalırdı. İki kez çağrılabilir, iki kez yazmaz; tahsilat ödeme
 * kimliğinden türeyen anahtarla yazılır ve onaylanmış siparişe ikinci geçişi motor reddeder.
 */

export type ConfirmPaymentOutcome = { status: 'ok'; action: 'confirmed' | 'reserved_again' | 'refunded' } | { status: 'not_found' };

export interface ConfirmPaymentInput {
  orderId: string;
  /** Sağlayıcıdaki ödeme — iade bunun üzerinden döner ve tahsilatın künyesine yazılır. */
  paymentIntentId: string | null;
  /** Sağlayıcının GERÇEKTEN aldığı tutar (cent) — sipariş toplamı değil. */
  amountCents: number | null;
  /** Paranın düştüğü hesap; verilmezse aktif sağlayıcı hesabı okunur (`providerAccountId`). */
  accountId?: string | null;
}

export interface ConfirmPaymentDeps {
  /** Sağlayıcı portu — anahtarsız ortamda `null`: iade sağlayıcıya iletilemez, damga yine düşer. */
  gateway: PaymentGateway | null;
  /** Durum geçişinin ve iptalin müşteri haberi — çağıranın portları. */
  effects?: OrderEffects;
}

export async function confirmOnlinePayment(db: Db, input: ConfirmPaymentInput, deps: ConfirmPaymentDeps): Promise<ConfirmPaymentOutcome> {
  const found = await new OrderService(db).getWithItems(input.orderId);
  if (!found) return { status: 'not_found' };
  const { order, items } = found;
  const accountId = input.accountId ?? (await providerAccountId(db));

  /**
   * İptal edilmiş siparişe gelen para geri verilir: pencere kapandıktan ya da müşteri vazgeçtikten sonra 3-D Secure ödemesi
   * geçebilir. Bu emniyet olmasa para alınmış ama siparişi olmayan bir müşteri kalırdı.
   */
  if (order.status === 'cancelled') {
    await refundProviderPayment(db, deps.gateway, input.paymentIntentId, order.id);
    return { status: 'ok', action: 'refunded' };
  }

  const decision = await decideForOrder(db, order.id, order.warehouseId, items);

  // Stok kalmadı: para iade edilir ve sipariş `out_of_stock` sebebiyle iptal olur. Sağlayıcı iadesi önce, çünkü iadesi düşen
  // ödemede siparişi iptal etmek müşteriyi hem malsız hem parasız bırakırdı.
  if (decision === 'refund') {
    await refundProviderPayment(db, deps.gateway, input.paymentIntentId, order.id);
    await cancelOrder(db, order.id, { refundAccountId: accountId, refundAmountCents: 0, reason: 'out_of_stock', effects: deps.effects });
    // İptal de bir cevaptır: ekran "onaylanıyor"da asılı kalmaz.
    await ringBell(orderChannelName(order.id));
    return { status: 'ok', action: 'refunded' };
  }

  if (decision === 'reserve_again') {
    const reservations = new ReservationService(db);
    for (const item of items) {
      await reservations.reserve({
        orderId: order.id,
        variantId: item.variantId,
        warehouseId: order.warehouseId,
        qty: item.qty,
        ttlMinutes: null,
        stockId: item.stockId,
      });
    }
  }

  // Tahsilat sağlayıcının gerçekten aldığı tutardır, siparişin toplamı değil; anahtar ikinci çağrının ikinci hareket yazmasını
  // veride engeller.
  if (accountId && input.amountCents != null) {
    await recordOrderPayment(db, {
      orderId: order.id,
      accountId,
      amountCents: input.amountCents,
      method: 'online',
      description: 'Stripe tahsilatı',
      source: 'system',
      meta: input.paymentIntentId ? { providerRef: input.paymentIntentId } : null,
      idempotencyKey: input.paymentIntentId ? `stripe-payment:${input.paymentIntentId}` : null,
    });
  }

  // Numara ve `confirmed` burada doğar; sipariş zaten onaylanmışsa geçiş reddedilir ve bu ikinci çağrının cevabıdır.
  await transitionOrder(db, { orderId: order.id, to: 'confirmed', effects: deps.effects });

  // Onay ekranının ZİLİ: müşteri hâlâ "onaylanıyor" yazısına bakıyor olabilir.
  await ringBell(orderChannelName(order.id));

  return { status: 'ok', action: decision === 'reserve_again' ? 'reserved_again' : 'confirmed' };
}

/** Ödemenin düştüğü hesap — Stripe havuzu bir hesaptır (DOMAIN §9); payout'u transferle bankaya gider. */
export async function providerAccountId(db: Db): Promise<string | null> {
  const accounts = await new AccountService(db).list({ activeOnly: true });
  return accounts.find((account) => account.type === 'provider')?.id ?? null;
}

/**
 * Sağlayıcı ödemesini iade eder ve damgalar; damga iadeden sonra, yoksa iadesi düşen ödeme "iade edildi" görünürdü. Port yoksa
 * iade iletilemez ama damga yine düşer.
 */
async function refundProviderPayment(db: Db, gateway: PaymentGateway | null, paymentIntentId: string | null, orderId: string): Promise<void> {
  if (gateway && paymentIntentId) await gateway.refund(paymentIntentId);
  await new OrderService(db).update({ id: orderId, providerRefundedAt: new Date().toISOString() });
}

/**
 * Geç ödeme kararı kalem kalem verilir ve siparişin kararı en kötü kalemin kararıdır: bir kalem bile yoksa yarım sipariş yerine
 * para iade edilir. Stok siparişin deposunda sorulur, başka depodaki aynı ürün bu siparişi kurtarmaz.
 */
async function decideForOrder(db: Db, orderId: string, warehouseId: string, items: readonly OrderItem[]): Promise<'proceed' | 'reserve_again' | 'refund'> {
  const active = await new ReservationService(db).listActiveByOrder(orderId);
  const availability = await new StockService(db).getAvailableMap(
    warehouseId,
    items.map((item) => item.variantId),
  );

  let worst: 'proceed' | 'reserve_again' | 'refund' = 'proceed';
  for (const item of items) {
    const stillActive = active.some((row) => row.variantId === item.variantId);
    // `availableQty` = fiili − AKTİF rezervasyonlar: süresi dolmuş kendi satırımız sayılmaz, başkasının
    // tuttuğu mal düşülmüştür — motorun sorduğu "şu an elde ne var" bu sayıdır.
    const decision = decideLatePayment({
      reservationStillActive: stillActive,
      requestedQty: item.qty,
      physicalQty: availability.get(item.variantId)?.availableQty ?? 0,
      reservations: [],
    });
    if (decision.action === 'refund') return 'refund';
    if (decision.action === 'reserve_again') worst = 'reserve_again';
  }
  return worst;
}
