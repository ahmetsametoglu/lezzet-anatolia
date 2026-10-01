import { confirmOnlinePayment } from '@lezzet/application';
import { MoneyMovementService, OrderService, ReservationService, SettingsService, WebhookEventService, serviceDb } from '@lezzet/database';
import { validateMovement } from '@lezzet/domain-core';
import { captureError, SOURCES } from '@lezzet/observability';
import { STRIPE_FEE_NATURE, type MoneyMovementInsert } from '@lezzet/types';
import { recordOrderRefund } from '../money/order-payment';
import { stripePaymentGateway } from '../stripe';
import { stripeEffects, type PaymentFee, type PayoutItem, type StripeEffects } from './stripe-effects';
import { webPaymentEffects } from './transition';

/**
 * Stripe webhook işleyicisi: imza HTTP kabuğunda doğrulanır, olay `(provider, event_id)` ile bir kez işlenir ve geç ödemenin kararı
 * motordadır (`decideLatePayment`). Yeri backend olurdu (STACK §7), ama onay mantığı uygulama kapılarında yazılı olduğu için gövde
 * ince tutuldu ve onayın kendisi ortak katmanda (`confirmOnlinePayment`).
 */

type WebhookOutcome =
  | { status: 'ok'; action: 'confirmed' | 'reserved_again' | 'refunded' | 'expired_released' | 'payout_recorded' | 'ignored' }
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
  /**
   * Sağlayıcı tarafında o ödemeden bugüne kadar iade edilmiş toplam (cent), `charge.refunded` olayında dolu. Fark değil toplam,
   * çünkü olay tekrar gelirse fark iki kez yazılırdı.
   */
  amountRefundedCents?: number | null;
  /** `payout.paid` olayının yükü: havuzdan bankaya giden NET tutar (cent) ve varış günü. */
  payout?: { id: string; amountCents: number; arrivalDate: string; currency: string } | null;
  raw?: Record<string, unknown> | null;
}

/**
 * `effects` sağlayıcıya sorulan iki şeyin portu (ücret, payout içeriği); testin sahtesi ağa çıkmaz.
 * Varsayılanı gerçek Stripe — anahtarsız ortamda "bilinmiyor" döner, uydurma sıfır değil.
 */
export async function handleStripeEvent(event: VerifiedEvent, accountId: string | null, effects: StripeEffects = stripeEffects()): Promise<WebhookOutcome> {
  const db = serviceDb();
  const events = new WebhookEventService(db);

  const claim = await events.claim({ provider: 'stripe', eventId: event.id, type: event.type, payload: event.raw });
  if (!claim.fresh) return { status: 'duplicate' };

  try {
    const outcome = await route(event, accountId, effects);
    await events.markProcessed(claim.event.id);
    return outcome;
  } catch (error) {
    // Damga ATILMAZ: işlenmemiş olay elle tekrar denenebilir kalmalı.
    const message = error instanceof Error ? error.message : String(error);
    await events.markFailed(claim.event.id, message);
    // Teknik iz ayrıca düşülür (OBSERVABILITY §1): `markFailed` iş kaydıdır ve sağlık ekranına düşmez, hata da fırlatılmadığı için
    // başka bir kanca görmez. Bağlam kimlik taşır, gövde yazılmaz.
    await captureError(error, {
      source: SOURCES.webhook,
      context: { provider: 'stripe', eventId: event.id, type: event.type, orderId: event.orderId },
    });
    return { status: 'error', error: message };
  }
}

/**
 * Olay adları `PaymentIntent` ailesinden; eski oturum olayları (`checkout.session.*`) da kabul edilir, çünkü sağlayıcıda geçişten önce
 * açılmış ödenmemiş bir oturum kalmış olabilir.
 */
const PAID_EVENTS = ['payment_intent.succeeded', 'checkout.session.completed', 'checkout.session.async_payment_succeeded'];
const RELEASE_EVENTS = ['payment_intent.canceled', 'checkout.session.expired'];
/** İade mutabakatı — bizim başlattığımız ya da panelden elle yapılan iade buradan döner. */
const REFUND_EVENTS = ['charge.refunded'];
/** Payout: havuzdaki para bankaya geçti — Stripe → banka transferi, künyesinde içerik. */
const PAYOUT_EVENTS = ['payout.paid'];

async function route(event: VerifiedEvent, accountId: string | null, effects: StripeEffects): Promise<WebhookOutcome> {
  if (RELEASE_EVENTS.includes(event.type)) return releaseExpired(event);
  if (REFUND_EVENTS.includes(event.type)) return reconcileRefund(event, accountId);
  if (PAYOUT_EVENTS.includes(event.type)) return recordPayout(event, accountId, effects);
  if (!PAID_EVENTS.includes(event.type)) return { status: 'ok', action: 'ignored' };

  return confirmPayment(event, accountId, effects);
}

/**
 * İade mutabakatı: sağlayıcıda iade edilmiş toplam ile defterdeki toplam eşitlenir; bizim başlattığımız iadede ikisi zaten eşittir,
 * panelden yapılan iadede fark burada deftere düşer. Sipariş olaydan değil tahsilatta sakladığımız künyeden (`providerRef`) bulunur,
 * çünkü `charge` künyesi niyetinkini her zaman taşımaz.
 */
async function reconcileRefund(event: VerifiedEvent, accountId: string | null): Promise<WebhookOutcome> {
  if (event.amountRefundedCents == null || !event.paymentIntentId) return { status: 'ok', action: 'ignored' };

  const db = serviceDb();
  const payment = await new MoneyMovementService(db).findByProviderRef(event.paymentIntentId);
  const orderId = payment?.orderId ?? event.orderId;
  if (!orderId) return { status: 'not_found' };

  const order = await new OrderService(db).getById(orderId);
  if (!order) return { status: 'not_found' };

  const missingCents = event.amountRefundedCents - order.amountRefundedCents;
  // Sağlayıcı bizden AZ iade göstermiş olamaz (biz kendi başımıza para döndürmüyoruz); negatif fark
  // bir mutabakat sorunudur ve burada sessizce "düzeltilmez" — defter kaynaktır, olay değil.
  if (missingCents <= 0) return { status: 'ok', action: 'ignored' };

  // Hesap: para hangi hesaba girdiyse oradan çıkar; sağlayıcı hesabı yalnız yedek. İkisi de yoksa
  // hareket yazılmaz — yanlış hesaba yazmak bakiyeyi sessizce kaydırırdı.
  const refundAccountId = payment?.accountId ?? accountId;
  if (!refundAccountId) return { status: 'not_found' };

  await recordOrderRefund({
    orderId,
    accountId: refundAccountId,
    amountCents: missingCents,
    method: 'online',
    description: 'Sağlayıcı panelinden iade — mutabakat',
    meta: { providerRef: event.paymentIntentId },
    source: 'system',
  });

  return { status: 'ok', action: 'refunded' };
}

/**
 * Ödeme penceresi kapandı: ayrılmış mal geri bırakılır, sipariş taslak kalır ki müşteri aynı sepetle tekrar deneyebilsin. Başarısız
 * ödeme buraya düşmez (`payment_intent.payment_failed`), çünkü müşteri hâlâ sayfadadır ve başka kart deneyecektir.
 */
async function releaseExpired(event: VerifiedEvent): Promise<WebhookOutcome> {
  if (!event.orderId) return { status: 'not_found' };
  await new ReservationService(serviceDb()).releaseByOrder(event.orderId);
  return { status: 'ok', action: 'expired_released' };
}

/**
 * Ödeme onayının gövdesi ortak katmanda (`confirmOnlinePayment`); ödeme sayfası ve zamanlayıcı da aynı yolu çağırır ve tahsilat ödeme
 * kimliğinden türeyen anahtarla yazıldığı için aynı ödeme iki kez işlenmez.
 */
async function confirmPayment(event: VerifiedEvent, accountId: string | null, effects: StripeEffects): Promise<WebhookOutcome> {
  if (!event.orderId) return { status: 'not_found' };

  const db = serviceDb();
  const outcome = await confirmOnlinePayment(
    db,
    { orderId: event.orderId, paymentIntentId: event.paymentIntentId, amountCents: event.amountTotalCents, accountId },
    { gateway: stripePaymentGateway(), effects: webPaymentEffects },
  );
  if (outcome.status === 'not_found') return { status: 'not_found' };

  // Ücret ödeme başına havuzdan düşer ve siparişin kârlılığı onu görür; öğrenilemezse tahsilat yine onaylanır, ücret payout içeriğinden
  // tamamlanır (`recordPayout`). İade dalında tahsilat yazılmadığı için ücret de yazılmaz.
  if (outcome.action !== 'refunded' && accountId && event.paymentIntentId) {
    try {
      const fee = await effects.feeOf(event.paymentIntentId);
      if (fee) await recordPaymentFee(db, { orderId: event.orderId, accountId, paymentIntentId: event.paymentIntentId, fee });
    } catch (error) {
      await captureError(error, {
        source: SOURCES.webhook,
        context: { provider: 'stripe', eventId: event.id, type: event.type, orderId: event.orderId, step: 'payment_fee' },
      });
    }
  }

  return { status: 'ok', action: outcome.action };
}

/**
 * Sağlayıcı ücreti: havuzdan çıkan gider ve siparişin `paymentFee` alanı; yazım kimliği ödeme niyetidir ki ikinci olay ikinci satır
 * doğurmasın. Gider satırına sipariş bağı yazılmaz, çünkü siparişin tahsilat toplamı o bağdan türer; bağ künyede durur.
 */
async function recordPaymentFee(
  db: ReturnType<typeof serviceDb>,
  input: { orderId: string | null; accountId: string; paymentIntentId: string; fee: PaymentFee; valueDate?: string },
): Promise<void> {
  if (input.fee.feeCents <= 0) return;
  await new MoneyMovementService(db).insertOnce({
    accountId: input.accountId,
    direction: 'out',
    amountCents: input.fee.feeCents,
    type: 'expense',
    nature: STRIPE_FEE_NATURE,
    description: 'Stripe ücreti',
    meta: {
      providerRef: input.paymentIntentId,
      balanceTransactionId: input.fee.balanceTransactionId,
      chargeId: input.fee.chargeId,
      orderId: input.orderId,
    },
    valueDate: input.valueDate,
    source: 'system',
    idempotencyKey: `stripe-fee:${input.paymentIntentId}`,
  });
  if (!input.orderId) return;
  const orders = new OrderService(db);
  const order = await orders.getById(input.orderId);
  if (order && order.paymentFeeCents == null) await orders.update({ id: order.id, paymentFeeCents: input.fee.feeCents });
}

/** Künyeye giren kalem sayısı — bir payout yüzlerce tahsilat taşıyabilir; toplamlar her hâlde tam. */
const PAYOUT_ITEMS_IN_META = 200;

/**
 * Payout: havuzdaki para bankaya transfer olur, tutarı net, künyesi içeriği (tahsilatlar, iadeler, ücretler) taşır; ekstre aynı tutarı
 * getirince bu ucun karşı satırı olur. Banka hesabı ayardır (`stripe_payout_account_id`), yoksa olay işlenmemiş kalır ve sağlayıcı
 * yeniden dener; içerik eksik ve ödeme dışı ücretleri de havuzdan düşer.
 */
async function recordPayout(event: VerifiedEvent, accountId: string | null, effects: StripeEffects): Promise<WebhookOutcome> {
  if (!event.payout) return { status: 'ok', action: 'ignored' };
  if (!accountId) return { status: 'not_found' };

  const db = serviceDb();
  const bankAccountId = await new SettingsService(db).get<string | null>('stripe_payout_account_id', null);
  if (!bankAccountId) throw new Error('stripe_payout_account_id ayarı yok — payout bankaya yazılamadı (Ayarlar → Ödeme)');

  const items = await effects.payoutItems(event.payout.id);
  const totals = summarizePayout(items);
  const movement: MoneyMovementInsert & { idempotencyKey: string } = {
    accountId,
    counterAccountId: bankAccountId,
    direction: 'out',
    amountCents: event.payout.amountCents,
    type: 'transfer',
    description: `Stripe payout ${event.payout.id}`,
    valueDate: event.payout.arrivalDate,
    source: 'system',
    meta: {
      payoutId: event.payout.id,
      currency: event.payout.currency,
      totals,
      items: items.slice(0, PAYOUT_ITEMS_IN_META).map((item) => ({
        type: item.type,
        amountCents: item.amountCents,
        feeCents: item.feeCents,
        providerRef: item.paymentIntentId,
      })),
    },
    idempotencyKey: `stripe-payout:${event.payout.id}`,
  };
  const verdict = validateMovement(movement);
  if (!verdict.valid) throw new Error(`payout hareketi geçersiz: ${verdict.reason}`);
  const movements = new MoneyMovementService(db);
  await movements.insertOnce(movement);

  for (const item of items) {
    if ((item.type === 'charge' || item.type === 'payment') && item.feeCents > 0 && item.paymentIntentId) {
      const payment = await movements.findByProviderRef(item.paymentIntentId);
      await recordPaymentFee(db, {
        orderId: payment?.orderId ?? null,
        accountId,
        paymentIntentId: item.paymentIntentId,
        fee: { feeCents: item.feeCents, balanceTransactionId: item.id, chargeId: null },
        valueDate: event.payout.arrivalDate,
      });
    } else if (item.type === 'stripe_fee' && item.amountCents < 0) {
      await movements.insertOnce({
        accountId,
        direction: 'out',
        amountCents: -item.amountCents,
        type: 'expense',
        nature: STRIPE_FEE_NATURE,
        description: 'Stripe ücreti — ödeme dışı',
        meta: { balanceTransactionId: item.id, payoutId: event.payout.id },
        valueDate: event.payout.arrivalDate,
        source: 'system',
        idempotencyKey: `stripe-fee:txn:${item.id}`,
      });
    }
  }

  return { status: 'ok', action: 'payout_recorded' };
}

/** Künyenin toplamları — kalem listesi kesilse de bunlar tam. */
function summarizePayout(items: readonly PayoutItem[]) {
  const totals = { chargesCents: 0, refundsCents: 0, feesCents: 0, otherCents: 0, charges: 0, refunds: 0 };
  for (const item of items) {
    if (item.type === 'charge' || item.type === 'payment') {
      totals.chargesCents += item.amountCents;
      totals.feesCents += item.feeCents;
      totals.charges += 1;
    } else if (item.type === 'refund' || item.type === 'payment_refund') {
      totals.refundsCents += -item.amountCents;
      totals.refunds += 1;
    } else {
      totals.otherCents += item.netCents;
    }
  }
  return totals;
}
