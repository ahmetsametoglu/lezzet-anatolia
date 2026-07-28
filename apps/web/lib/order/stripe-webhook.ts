import { CartService, OrderService, ReservationService, StockService, WebhookEventService, serviceDb } from '@lezzet/database';
import { decideLatePayment } from '@lezzet/domain-core';
import type { OrderItem } from '@lezzet/types';
import { recordOrderPayment } from '../money/order-payment';
import { stripeClient } from '../stripe';
import { cancelOrder } from './refund';
import { transitionOrder } from './transition';

/**
 * Stripe webhook işleyicisi (07.5) — **uygulama katmanı orkestrasyonu**. STACK §13, DOMAIN §4.
 *
 * Üç emniyet üst üste durur ve karıştırılmaz:
 * 1. **İmza** — gövde doğrulanmadan OKUNMAZ. Doğrulama HTTP kabuğunda yapılır (ham gövde ister),
 *    buraya doğrulanmış olay gelir.
 * 2. **İdempotens** — `(provider, event_id)` benzersizdir; ikinci geliş no-op'tur. Sağlayıcı aynı
 *    olayı tekrar göndermeyi bir arıza saymaz, sözleşmesi budur.
 * 3. **Geç ödeme** — rezervasyon düşmüşken ödeme onayı gelebilir. Ne yapılacağına MOTOR karar verir
 *    (`decideLatePayment`): devam et / yeniden ayır / parayı iade et.
 *
 * **SAPMA — webhook `apps/backend`'de değil, burada.** `STACK §7` webhook'ları backend'e koyuyor.
 * Ama ödeme onayının yaptığı iş (tahsilat hareketi + durum geçişi + bildirim) uygulama kapılarında
 * yazılı; backend'e taşımak ya o mantığı ikinci kez yazmayı ya da kapıları pakete çıkarmayı
 * gerektirirdi. İkincisi doğru hamle ama bu işin kapsamı değil. Buradaki gövde ince: taşınmak
 * istendiğinde tek dosya taşınır.
 */

type WebhookOutcome =
  | { status: 'ok'; action: 'confirmed' | 'reserved_again' | 'refunded' | 'expired_released' | 'ignored' }
  /** Aynı olay daha önce işlendi — sağlayıcıya yine 200 döneriz, yoksa sonsuza dek tekrar gönderir. */
  | { status: 'duplicate' }
  | { status: 'not_found' }
  | { status: 'error'; error: string };

/** Doğrulanmış olayın işleyiciye yeten yüzü — SDK tipine bağlanmadan test edilebilsin diye. */
export interface VerifiedEvent {
  id: string;
  type: string;
  orderId: string | null;
  /** İade gerekirse üzerinden dönülecek ödeme niyeti. */
  paymentIntentId: string | null;
  /** Tahsil edilen tutar (cent) — sipariş toplamına değil, GERÇEKTEN ödenene bakarız. */
  amountTotalCents: number | null;
  raw?: Record<string, unknown> | null;
}

export async function handleStripeEvent(event: VerifiedEvent, accountId: string | null): Promise<WebhookOutcome> {
  const db = serviceDb();
  const events = new WebhookEventService(db);

  const claim = await events.claim({ provider: 'stripe', eventId: event.id, type: event.type, payload: event.raw });
  if (!claim.fresh) return { status: 'duplicate' };

  try {
    const outcome = await route(event, accountId);
    await events.markProcessed(claim.event.id);
    return outcome;
  } catch (error) {
    // Damga ATILMAZ: işlenmemiş olay elle tekrar denenebilir kalmalı.
    const message = error instanceof Error ? error.message : String(error);
    await events.markFailed(claim.event.id, message);
    return { status: 'error', error: message };
  }
}

/**
 * Olay adları `PaymentIntent` ailesinden (28.07 · ödeme sayfa içine alındı). Eski oturum olayları
 * (`checkout.session.*`) DA kabul edilir: geçişten önce açılmış ve hâlâ ödenmemiş bir oturum
 * kalmışsa onun onayı da doğru işlensin — sağlayıcıdaki eski olay bizim kod değişikliğimizi bilmez.
 */
const PAID_EVENTS = ['payment_intent.succeeded', 'checkout.session.completed', 'checkout.session.async_payment_succeeded'];
const RELEASE_EVENTS = ['payment_intent.canceled', 'checkout.session.expired'];

async function route(event: VerifiedEvent, accountId: string | null): Promise<WebhookOutcome> {
  if (RELEASE_EVENTS.includes(event.type)) return releaseExpired(event);
  if (!PAID_EVENTS.includes(event.type)) return { status: 'ok', action: 'ignored' };

  return confirmPayment(event, accountId);
}

/**
 * Ödeme penceresi kapandı (niyet iptal edildi ya da oturum süresi doldu): ayrılmış mal geri
 * bırakılır. Sipariş TASLAK kalır — müşteri aynı sepetle tekrar deneyebilmeli; iptal etmek onun
 * kararını bizim yerimize vermek olurdu.
 *
 * **Başarısız ödeme buraya DÜŞMEZ** (`payment_intent.payment_failed`): kart reddedildiğinde müşteri
 * hâlâ sayfada, başka bir kart deneyecek. Malı o anda geri bırakmak, ikinci denemesinde "stok
 * kalmadı" demek olurdu.
 */
async function releaseExpired(event: VerifiedEvent): Promise<WebhookOutcome> {
  if (!event.orderId) return { status: 'not_found' };
  await new ReservationService(serviceDb()).releaseByOrder(event.orderId);
  return { status: 'ok', action: 'expired_released' };
}

/**
 * Ödeme onayı. Önce **malın hâlâ bizde olup olmadığı** sorulur; para yazımı ondan sonra gelir.
 * Sıra tersse, iade edilecek bir siparişte tahsilat kaydı açık kalır.
 */
async function confirmPayment(event: VerifiedEvent, accountId: string | null): Promise<WebhookOutcome> {
  if (!event.orderId) return { status: 'not_found' };

  const db = serviceDb();
  const found = await new OrderService(db).getWithItems(event.orderId);
  if (!found) return { status: 'not_found' };

  const { order, items } = found;
  const decision = await decideForOrder(db, order.id, items);

  if (decision.action === 'refund') {
    await refundAndCancel(event, order.id, accountId);
    return { status: 'ok', action: 'refunded' };
  }

  if (decision.action === 'reserve_again') {
    const reservations = new ReservationService(db);
    for (const item of items) {
      await reservations.reserve({ orderId: order.id, variantId: item.variantId, qty: item.qty, ttlMinutes: null, stockId: item.stockId });
    }
  }

  // Tahsilat: siparişin toplamı değil, Stripe'ın GERÇEKTEN aldığı tutar yazılır — ikisi ayrıldığında
  // doğru olan paranın kendisidir (ödeme durumu zaten bundan türetilir, 12.2).
  if (accountId && event.amountTotalCents != null) {
    await recordOrderPayment({
      orderId: order.id,
      accountId,
      amount: event.amountTotalCents / 100,
      description: 'Stripe tahsilatı',
    });
  }

  // Referans numarası ve `confirmed` geçişi burada doğar (07.6 kapısı; motor karar verir).
  await transitionOrder({ orderId: order.id, to: 'confirmed' });

  // Ödeme geçtiğine göre sepet boşalır. Kart yolunda sepeti burada temizlemek ŞART: taslak
  // açılırken temizlenseydi ödeme başarısız olan müşteri sepetini de kaybederdi. Temizlik
  // siparişin kesinleştiği ana bağlı, açıldığı ana değil.
  await new CartService(serviceDb()).replace(order.customerId, []);

  return { status: 'ok', action: decision.action === 'reserve_again' ? 'reserved_again' : 'confirmed' };
}

/**
 * Geç ödeme kararı — kalem kalem. Motor tek kalem için karar verir; siparişin kararı **en kötü
 * kalemin kararıdır**: bir kalem bile bulunamıyorsa yarım sipariş göndermek yerine para iade edilir.
 */
async function decideForOrder(
  db: ReturnType<typeof serviceDb>,
  orderId: string,
  items: readonly OrderItem[],
): Promise<{ action: 'proceed' | 'reserve_again' | 'refund' }> {
  const active = await new ReservationService(db).listActiveByOrder(orderId);
  const availability = await new StockService(db).getAvailableMap(items.map((item) => item.variantId));

  let worst: 'proceed' | 'reserve_again' | 'refund' = 'proceed';
  for (const item of items) {
    const stillActive = active.some((row) => row.variantId === item.variantId);
    // `availableQty` = fiili − AKTİF rezervasyonlar. Süresi dolmuş kendi satırımız zaten sayılmaz,
    // başkasının tuttuğu mal ise düşülmüştür — motorun sorduğu "şu an elde ne var" bu sayıdır.
    // Bu yüzden ayrı rezervasyon listesi taşımaya gerek yok (ve varyant başına ek sorgu da yok).
    const decision = decideLatePayment({
      reservationStillActive: stillActive,
      requestedQty: item.qty,
      physicalQty: availability.get(item.variantId)?.availableQty ?? 0,
      reservations: [],
    });

    if (decision.action === 'refund') return { action: 'refund' };
    if (decision.action === 'reserve_again') worst = 'reserve_again';
  }
  return { action: worst };
}

/**
 * Stok kalmadı: para OTOMATİK iade edilir ve sipariş iptal olur (DOMAIN §4 — elle karar gerekmez).
 * Stripe iadesi önce yapılır: iade edilemeyen bir ödemede siparişi iptal etmek müşteriyi hem malsız
 * hem parasız bırakırdı.
 */
async function refundAndCancel(event: VerifiedEvent, orderId: string, accountId: string | null): Promise<void> {
  const stripe = stripeClient();
  if (stripe && event.paymentIntentId) {
    await stripe.refunds.create({ payment_intent: event.paymentIntentId });
  }

  // Tahsilat hiç yazılmadığı için kasada iz bırakmayız; iptal kapısı rezervasyonu bırakır ve
  // bildirimi gönderir. `refundAccountId` yalnız hareket yazılacaksa anlamlıdır.
  await cancelOrder(orderId, { refundAccountId: accountId, refundAmount: 0 });
}
