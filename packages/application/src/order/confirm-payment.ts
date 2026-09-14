import { AccountService, OrderService, ReservationService, StockService, type Db } from '@lezzet/database';
import { decideLatePayment } from '@lezzet/domain-core';
import type { OrderItem } from '@lezzet/types';
import { clearOrderedLines } from '../cart/settle';
import { ringBell } from '../realtime/bell';
import { orderChannelName } from '../realtime/order-channel';
import type { OrderEffects } from './effects';
import { recordOrderPayment } from './payment';
import type { PaymentGateway } from './payment-gateway';
import { cancelOrder } from './refund';
import { transitionOrder } from './transition';

/**
 * **Kart ödemesinin onay yolu** (07.5 → 07.18) — webhook'un ve "sağlayıcıya sor" kapısının ORTAK ayağı.
 *
 * Kaynağı `apps/web/lib/order/stripe-webhook.ts`teki `confirmPayment`tı. Buraya taşındı çünkü artık iki
 * çağıranı var: webhook (olay geldi) ve `reconcileDraftPayment` (olay gelmedi, sağlayıcıya soruldu). İki
 * kopya bir gün iki ayrı onay kuralı demekti. Sağlayıcı istemcisi pakete GİRMEZ: iade portu
 * (`PaymentGateway.refund`) çağırandan gelir. Ücret yazımı (Stripe'ın komisyonu) webhook'ta kaldı —
 * sağlayıcıya ek bir soru ister ve öğrenilemezse payout'ta zaten tamamlanıyor.
 *
 * Sıra webhook'taki gibi: önce **malın hâlâ bizde olup olmadığı** (geç ödeme kararı), para yazımı ondan
 * sonra — sıra tersse iade edilecek bir siparişte tahsilat kaydı açık kalırdı.
 *
 * **İki kez çağrılabilir, iki kez yazmaz:** tahsilat ödeme kimliğinden türeyen anahtarla yazılır
 * (`stripe-payment:<pi>` — veritabanının tekil indeksi, `payment.ts` künyesi); onaylanmış siparişe ikinci
 * geçişi motor reddeder. Webhook ile sorma kapısı aynı anda koşsa da ikisi aynı sonuca varır.
 */

export type ConfirmPaymentOutcome = { status: 'ok'; action: 'confirmed' | 'reserved_again' | 'refunded' } | { status: 'not_found' };

export interface ConfirmPaymentInput {
  orderId: string;
  /** Sağlayıcıdaki ödeme — iade bunun üzerinden döner ve tahsilatın künyesine yazılır. */
  paymentIntentId: string | null;
  /** Sağlayıcının GERÇEKTEN aldığı tutar (cent) — sipariş toplamı değil (12.2). */
  amountCents: number | null;
  /** Paranın düştüğü hesap; verilmezse aktif sağlayıcı hesabı okunur (`providerAccountId`). */
  accountId?: string | null;
}

export interface ConfirmPaymentDeps {
  /** Sağlayıcı portu — anahtarsız ortamda `null`: iade sağlayıcıya iletilemez, damga yine düşer. */
  gateway: PaymentGateway | null;
  /** Durum geçişinin ve iptalin müşteri haberi (14.5) — çağıranın portları. */
  effects?: OrderEffects;
}

export async function confirmOnlinePayment(db: Db, input: ConfirmPaymentInput, deps: ConfirmPaymentDeps): Promise<ConfirmPaymentOutcome> {
  const found = await new OrderService(db).getWithItems(input.orderId);
  if (!found) return { status: 'not_found' };
  const { order, items } = found;
  const accountId = input.accountId ?? (await providerAccountId(db));

  /**
   * Sipariş İPTAL EDİLMİŞSE para geri verilir ve iş biter. Dar ama gerçek: müşteri yeniden denerken
   * eski taslak süpürülür ve süpürülen taslağın ödemesi 3-D Secure penceresinden sonradan onaylanabilir.
   * Bu emniyet olmasaydı akış `cancelled → confirmed` geçişine girip reddedilir ve **para alınmış,
   * siparişi olmayan** bir müşteri kalırdı.
   */
  if (order.status === 'cancelled') {
    await refundProviderPayment(db, deps.gateway, input.paymentIntentId, order.id);
    return { status: 'ok', action: 'refunded' };
  }

  const decision = await decideForOrder(db, order.id, order.warehouseId, items);

  // Stok kalmadı: para OTOMATİK iade edilir ve sipariş iptal olur (DOMAIN §4). Sağlayıcı iadesi ÖNCE:
  // iade edilemeyen bir ödemede siparişi iptal etmek müşteriyi hem malsız hem parasız bırakırdı.
  // Sebep `out_of_stock` — para gerçekten çekildi ve geri verildi (07.14).
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

  // Tahsilat: siparişin toplamı değil, sağlayıcının GERÇEKTEN aldığı tutar (ödeme durumu bundan türer).
  // Künye iadenin yolu (07.11); anahtar ikinci çağrının ikinci hareket yazmasını veride engelliyor.
  if (accountId && input.amountCents != null) {
    await recordOrderPayment(db, {
      orderId: order.id,
      accountId,
      amountCents: input.amountCents,
      description: 'Stripe tahsilatı',
      source: 'system',
      meta: input.paymentIntentId ? { providerRef: input.paymentIntentId } : null,
      idempotencyKey: input.paymentIntentId ? `stripe-payment:${input.paymentIntentId}` : null,
    });
  }

  // Referans numarası ve `confirmed` burada doğar (07.6 kapısı; motor karar verir). Sipariş zaten
  // onaylanmışsa geçiş reddedilir ve bu bir hata değildir — ikinci çağrının cevabı.
  await transitionOrder(db, { orderId: order.id, to: 'confirmed', effects: deps.effects });

  // Ödeme geçti: sepetten BU SİPARİŞİN kalemleri düşer (19.7). Temizlik siparişin KESİNLEŞTİĞİ ana
  // bağlı — taslak açılırken temizlenseydi ödemesi düşen müşteri sepetini de kaybederdi.
  await clearOrderedLines(db, order.customerId, order.id);

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
 * **Sağlayıcı ödemesini iade eder ve DAMGALAR** (07.14). Damga iadeden SONRA: önce yazılsaydı iadesi
 * düşen bir ödeme "iade edildi" görünürdü. Port yoksa (anahtarsız ortam) iade iletilemez ama damga
 * yine düşer — webhook'un bugünkü davranışı, taşınırken değiştirilmedi.
 */
async function refundProviderPayment(db: Db, gateway: PaymentGateway | null, paymentIntentId: string | null, orderId: string): Promise<void> {
  if (gateway && paymentIntentId) await gateway.refund(paymentIntentId);
  await new OrderService(db).update({ id: orderId, providerRefundedAt: new Date().toISOString() });
}

/**
 * Geç ödeme kararı — kalem kalem. Motor tek kalem için karar verir; siparişin kararı **en kötü kalemin
 * kararıdır**: bir kalem bile bulunamıyorsa yarım sipariş göndermek yerine para iade edilir. Stok
 * SİPARİŞİN deposunda sorulur — başka depodaki aynı ürün bu siparişi kurtarmaz (DOMAIN §17).
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
