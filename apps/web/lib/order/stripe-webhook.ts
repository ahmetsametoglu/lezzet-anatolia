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
 *
 * **Onay yolu 07.18'den beri ortak katmanda** (`confirmOnlinePayment`): webhook gelmediğinde ödeme
 * sayfası ve zamanlayıcı sağlayıcıya sorup AYNI yoldan onaylıyor. Burada kalan, olayın kendisine ait
 * olanlar: imza sonrası yönlendirme, ödeme ücreti, iade mutabakatı ve payout.
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
   * Sağlayıcı tarafında o ödemeden **bugüne kadar** iade edilmiş TOPLAM (cent) — `charge.refunded`
   * olayında dolu. Fark değil toplam: olay tekrar gelirse fark iki kez yazılırdı, toplam yazılmaz.
   */
  amountRefundedCents?: number | null;
  /** `payout.paid` olayının yükü (12.14): havuzdan bankaya giden NET tutar (cent) ve varış günü. */
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
    // **TEKNİK İZ ayrıca düşülür** (OBSERVABILITY §1, §2). `markFailed` bir İŞ KAYDIDIR
    // (`webhook_event`): "bu olay işlenemedi" der, "neden" demez ve operasyon sağlık ekranına
    // düşmez. Hata buradan çağırana bir 500 CEVABI olarak dönüyor — fırlatılmadığı için Next'in
    // `onRequestError` kancası da görmüyor, yani `error_log`'da tek satır kalmıyordu. Alarm
    // bilinçli olarak yokken (§4.1) ekranın göremediği hata görülmemiş hatadır.
    // Bağlam KİMLİK taşır (§5): olay/sipariş kimliği yeter, gövde yazılmaz.
    await captureError(error, {
      source: SOURCES.webhook,
      context: { provider: 'stripe', eventId: event.id, type: event.type, orderId: event.orderId },
    });
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
/** İade mutabakatı (07.11) — bizim başlattığımız ya da panelden elle yapılan iade buradan döner. */
const REFUND_EVENTS = ['charge.refunded'];
/** Payout (12.14): havuzdaki para bankaya geçti — Stripe → banka transferi, künyesinde içerik. */
const PAYOUT_EVENTS = ['payout.paid'];

async function route(event: VerifiedEvent, accountId: string | null, effects: StripeEffects): Promise<WebhookOutcome> {
  if (RELEASE_EVENTS.includes(event.type)) return releaseExpired(event);
  if (REFUND_EVENTS.includes(event.type)) return reconcileRefund(event, accountId);
  if (PAYOUT_EVENTS.includes(event.type)) return recordPayout(event, accountId, effects);
  if (!PAID_EVENTS.includes(event.type)) return { status: 'ok', action: 'ignored' };

  return confirmPayment(event, accountId, effects);
}

/**
 * **İade mutabakatı** (07.11): sağlayıcıda iade edilmiş toplam ile bizim defterimizdeki toplamı
 * eşitler.
 *
 * İki yol aynı olayı doğurur ve ikisi de doğru işlenmeli:
 * - **Biz başlattık** (`refund.ts` → `refunds.create`): hareket çağrıdan HEMEN SONRA yazıldı, olay
 *   geldiğinde iki toplam zaten eşittir → yazılacak bir şey yok. Fark yazsaydık iade iki kez düşerdi.
 * - **Panelden elle yapıldı**: bizim haberimiz yok. Fark burada deftere düşer — yoksa müşterinin
 *   parası dönmüş ama sipariş "ödendi" görünmeye devam ederdi.
 *
 * Sipariş kimliği olayda GÜVENİLİR DEĞİL: `charge` künyesi niyetinkini her zaman taşımaz. Bu yüzden
 * sipariş, tahsilatta sakladığımız kendi künyemizden (`providerRef`) bulunur — kendi verimiz,
 * sağlayıcının şekil değiştirebilen alanından güvenilirdir.
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
    description: 'Sağlayıcı panelinden iade — mutabakat',
    meta: { providerRef: event.paymentIntentId },
    source: 'system',
  });

  return { status: 'ok', action: 'refunded' };
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
 * Ödeme onayı — **gövde ortak katmanda** (`confirmOnlinePayment`, 07.18): geç ödeme kararı, tahsilat,
 * `confirmed` geçişi, sepet temizliği ve ekran zili orada. Ödeme sayfası ve zamanlayıcı da aynı yolu
 * çağırıyor; tahsilat ödeme kimliğinden türeyen anahtarla yazıldığı için aynı ödeme iki kez işlenmez.
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

  // ÜCRET ÖDEME BAŞINA (12.14 · kullanıcı kararı 13.09): brüt tahsilat havuza girdi, komisyon oradan
  // çıkar ve siparişin kârlılığı onu görür. Öğrenilemezse tahsilat yine onaylanır — ücret payout
  // geldiğinde içeriğinden tamamlanır (`recordPayout`); iz düşülür ki eksik görünsün. İade dalında
  // tahsilat yazılmadığı için ücret de yazılmaz.
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
 * **Stripe ücreti** (12.14): havuzdan çıkan `stripe-ucreti` türlü gider + siparişin `paymentFee`
 * alanı. Yazım kimliği ödeme niyetidir — aynı ödemeyi anlatan ikinci olay ya da payout'un tamamlaması
 * ikinci satır doğurmaz (`insertOnce`). Sipariş alanı yalnız BOŞKEN dolar: onay anında yazılanı
 * payout'un tamamlaması ezmez. Sipariş bağı harekete YAZILMAZ (`order_id`): siparişin tahsilat
 * toplamı o bağdan türetiliyor (`resync_order_amounts`), gider satırı o toplamı kaydırırdı — bağ
 * künyede durur.
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
 * **Payout** (12.14 · kullanıcı kararı 13.09: otomatik): havuzdaki para bankaya geçti — Stripe hesabından
 * bankaya TRANSFER, tutarı payout'un NET tutarı. Künyesi payout'un içeriğini taşır (hangi tahsilatlar,
 * iadeler, ücretler): muhasebeci "bu 1.240 € hangi satışların parası" diye sorduğunda cevap satırın
 * üstündedir. Banka ekstresi aynı tutarı getirince o satır bu ucun karşı satırı olur (12.13) — para
 * iki kez sayılmaz.
 *
 * Banka hesabı AYARDIR (`stripe_payout_account_id`). Yoksa yazım YAPILMAZ ve olay işlenmemiş kalır
 * (hata → sağlayıcı yeniden dener, ayar girilince işlenir): sessizce geçmek payout'u kaybetmek olurdu.
 *
 * İçerik ödeme başına ücretin eksiklerini de tamamlar (onay anında öğrenilememiş ücret burada yazılır)
 * ve ödeme dışı Stripe ücretlerini (`stripe_fee`: aylık/Radar) havuzdan düşer — yoksa defterdeki havuz
 * gerçek bakiyenin üstünde kalırdı.
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
