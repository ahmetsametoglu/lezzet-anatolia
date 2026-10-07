import { confirmOnlinePayment, kickOrderRegister, linkAwaitingTransfers, type PaymentGateway } from '@lezzet/application';
import {
  AccountService,
  MoneyMovementService,
  OrderService,
  ReservationService,
  SettingsService,
  WebhookEventService,
  serviceDb,
} from '@lezzet/database';
import { validateMovement } from '@lezzet/domain-core';
import { captureError, SOURCES } from '@lezzet/observability';
import { CARD_FEE_NATURE, type MoneyMovementInsert } from '@lezzet/types';
import { recordOrderPayment, recordOrderRefund } from '../money/order-payment';
import { revolutPaymentGateway } from '../revolut';
import { webPaymentEffects } from './transition';

/**
 * Ödeme sağlayıcısının olaylarını işleyen kapı: imza HTTP kabuğunda doğrulanır ve olay sağlayıcıdan bağımsız biçime çevrilir
 * (`revolut-event.ts`); burada olay anahtarıyla bir kez işlenir. Onayın kendisi ortak katmanda (`confirmOnlinePayment`), çünkü ödeme
 * sayfası ve zamanlayıcı da aynı yolu çağırır.
 */

type WebhookOutcome =
  | {
      status: 'ok';
      action: 'confirmed' | 'reserved_again' | 'refunded' | 'refund_reversed' | 'released' | 'payout_recorded' | 'ignored';
    }
  /** Aynı olay daha önce işlendi — sağlayıcıya yine 200 dönülür, yoksa sonsuza dek yeniden gönderir. */
  | { status: 'duplicate' }
  | { status: 'not_found' }
  | { status: 'error'; error: string };

/** Sağlayıcının olayından işleyiciye yeten yüz; sağlayıcının kendi sözlüğü buraya girmez. */
export type PaymentEvent =
  | {
      /** Olay anahtarı: sağlayıcı olay kimliği göndermez, aynı olayın yeniden gönderimi aynı anahtarı taşır. */
      key: string;
      kind: 'payment_completed';
      orderId: string | null;
      paymentRef: string;
      /** Tahsil edilen tutar (cent) — sipariş toplamına değil, gerçekten ödenene bakılır. */
      amountCents: number;
      /** Sağlayıcının komisyonu; `null` = henüz yazılmamış. */
      fee: { feeCents: number; paymentId: string } | null;
    }
  /** Ödeme gelmeyecek (iptal ya da süre doldu): ayrılmış mal bırakılır, taslak müşteri için durur. */
  | { key: string; kind: 'payment_released'; orderId: string | null; paymentRef: string }
  /** İade tamamlandı; ödemenin sağlayıcıda bugüne kadar iade edilmiş TOPLAMI taşınır ki olay tekrar gelirse fark iki kez yazılmasın. */
  | { key: string; kind: 'refund_completed'; paymentRef: string; refundedTotalCents: number }
  /** İade siparişi sağlayıcıda düştü: para müşteriye dönmedi; `paymentRef` iade ettiği ödemedir. */
  | { key: string; kind: 'refund_failed'; refundRef: string; paymentRef: string }
  /** Merchant hesabından ana hesaba aktarım tamamlandı. */
  | { key: string; kind: 'payout_completed'; payout: { id: string; amountCents: number; currency: string; valueDate: string } }
  | { key: string; kind: 'ignored' };

/** `gateway` geç ödeme dalının iade kapısıdır; testler ağa çıkmasın diye verilebilir. */
export async function handlePaymentEvent(
  event: PaymentEvent,
  accountId: string | null,
  raw?: Record<string, unknown>,
  gateway: PaymentGateway | null = revolutPaymentGateway(),
): Promise<WebhookOutcome> {
  const db = serviceDb();
  const events = new WebhookEventService(db);

  const claim = await events.claim({ provider: 'revolut', eventId: event.key, type: event.kind, payload: raw ?? null });
  if (!claim.fresh) return { status: 'duplicate' };

  try {
    const outcome = await route(event, accountId, gateway);
    await events.markProcessed(claim.event.id);
    return outcome;
  } catch (error) {
    // Damga atılmaz, hata yazılır: sağlayıcının tekrarı olayı yeniden alır. İş kaydı sağlık ekranına düşmediği için teknik iz ayrıca bırakılır.
    const message = error instanceof Error ? error.message : String(error);
    await events.markFailed(claim.event.id, message);
    await captureError(error, { source: SOURCES.webhook, context: { provider: 'revolut', eventKey: event.key, kind: event.kind } });
    return { status: 'error', error: message };
  }
}

async function route(event: PaymentEvent, accountId: string | null, gateway: PaymentGateway | null): Promise<WebhookOutcome> {
  switch (event.kind) {
    case 'payment_completed':
      return confirmPayment(event, accountId, gateway);
    case 'payment_released':
      if (!event.orderId) return { status: 'ok', action: 'ignored' };
      await new ReservationService(serviceDb()).releaseByOrder(event.orderId);
      return { status: 'ok', action: 'released' };
    case 'refund_completed':
      return reconcileRefund(event, accountId);
    case 'refund_failed':
      return reverseFailedRefund(event);
    case 'payout_completed':
      return recordPayout(event, accountId);
    case 'ignored':
      return { status: 'ok', action: 'ignored' };
  }
}

async function confirmPayment(
  event: Extract<PaymentEvent, { kind: 'payment_completed' }>,
  accountId: string | null,
  gateway: PaymentGateway | null,
): Promise<WebhookOutcome> {
  // Siparişe bağlanmamış ödeme bizde bir şey değiştirmez.
  if (!event.orderId) return { status: 'ok', action: 'ignored' };

  const db = serviceDb();
  const outcome = await confirmOnlinePayment(
    db,
    { orderId: event.orderId, paymentRef: event.paymentRef, amountCents: event.amountCents, accountId },
    { gateway, effects: webPaymentEffects },
  );
  if (outcome.status === 'not_found') return { status: 'not_found' };

  // İade dalında tahsilat yazılmadığı için komisyon da yazılmaz.
  if (outcome.action !== 'refunded' && accountId && event.fee) {
    await recordPaymentFee(db, { orderId: event.orderId, accountId, paymentRef: event.paymentRef, fee: event.fee });
  }
  return { status: 'ok', action: outcome.action };
}

/**
 * Sağlayıcı komisyonu: havuzdan çıkan gider ve siparişin `paymentFee` alanı; yazım anahtarı ödemedir ki ikinci olay ikinci satır
 * doğurmasın. Gider satırına sipariş bağı yazılmaz, çünkü siparişin tahsilat toplamı o bağdan türer; bağ künyede durur.
 */
async function recordPaymentFee(
  db: ReturnType<typeof serviceDb>,
  input: { orderId: string; accountId: string; paymentRef: string; fee: { feeCents: number; paymentId: string } },
): Promise<void> {
  if (input.fee.feeCents <= 0) return;
  await new MoneyMovementService(db).insertOnce({
    accountId: input.accountId,
    direction: 'out',
    amountCents: input.fee.feeCents,
    type: 'expense',
    nature: CARD_FEE_NATURE,
    description: 'Kart ödemesi komisyonu',
    meta: { providerRef: input.paymentRef, providerPaymentId: input.fee.paymentId, orderId: input.orderId },
    source: 'system',
    idempotencyKey: `card-fee:${input.paymentRef}`,
  });
  const orders = new OrderService(db);
  const order = await orders.getById(input.orderId);
  if (order && order.paymentFeeCents == null) await orders.update({ id: order.id, paymentFeeCents: input.fee.feeCents });
}

/**
 * İade mutabakatı: bir kart ödemesinin sağlayıcıdaki iade toplamı ile defterde o ödemeye bağlı iadeler eşitlenir; bizim başlattığımız
 * iadede ikisi zaten eşittir, sağlayıcının panelinden yapılan iadede fark deftere düşer. Sipariş ve ödeme künyeden (`providerRef`) bulunur.
 */
async function reconcileRefund(
  event: Extract<PaymentEvent, { kind: 'refund_completed' }>,
  accountId: string | null,
): Promise<WebhookOutcome> {
  const db = serviceDb();
  const payment = await new MoneyMovementService(db).findByProviderRef(event.paymentRef);
  if (!payment?.orderId) return { status: 'not_found' };

  const order = await new OrderService(db).getById(payment.orderId);
  if (!order) return { status: 'not_found' };

  // Karşılaştırma o kart ödemesinin kendi iadeleriyledir: siparişin öteki iadeleri (nakit, başka kart ödemesi) bu ödemeden çıkmadı.
  // Sağlayıcı bizden az iade göstermiş olamaz; negatif fark mutabakat sorunudur ve burada "düzeltilmez", defter kaynaktır.
  const refundedHere = (await new MoneyMovementService(db).listByOrder(order.id))
    .filter((movement) => movement.type === 'order_refund' && movement.meta?.['providerRef'] === event.paymentRef)
    .reduce((sum, movement) => sum + movement.amountCents, 0);
  const missingCents = event.refundedTotalCents - refundedHere;
  if (missingCents <= 0) return { status: 'ok', action: 'ignored' };

  // Para hangi hesaba girdiyse oradan çıkar; ikisi de yoksa yazılmaz, yanlış hesaba yazmak bakiyeyi sessizce kaydırırdı.
  const refundAccountId = payment.accountId ?? accountId;
  if (!refundAccountId) return { status: 'not_found' };

  await recordOrderRefund({
    orderId: order.id,
    accountId: refundAccountId,
    amountCents: missingCents,
    method: 'online',
    description: 'Sağlayıcı panelinden iade — mutabakat',
    meta: { providerRef: event.paymentRef },
    source: 'system',
  });
  kickOrderRegister(serviceDb(), order.id);
  return { status: 'ok', action: 'refunded' };
}

/**
 * Düşen iade: bizim yazdığımız iade hareketi silinemez (tahsilat koruması), aynı tutarda giriş hareketiyle geri alınır; sipariş yeniden
 * iade bekler ve iz hata kaydına düşer ki iade yeniden yapılsın. Bizde yazılmamış iadenin geri alınacak kaydı yoktur.
 */
async function reverseFailedRefund(event: Extract<PaymentEvent, { kind: 'refund_failed' }>): Promise<WebhookOutcome> {
  const db = serviceDb();
  const movements = new MoneyMovementService(db);
  const payment = await movements.findByProviderRef(event.paymentRef);
  if (!payment?.orderId) return { status: 'not_found' };
  const orderId = payment.orderId;

  const refunds = (await movements.listByOrder(orderId)).filter(
    (movement) => movement.type === 'order_refund' && movement.meta?.['refundId'] === event.refundRef,
  );
  if (refunds.length === 0) return { status: 'ok', action: 'ignored' };

  for (const refund of refunds) {
    await recordOrderPayment({
      orderId,
      accountId: refund.accountId,
      amountCents: refund.amountCents,
      method: refund.paymentMethod ?? 'online',
      description: 'Revolut iadeyi düşürdü — para müşteriye dönmedi, iade yeniden yapılmalı',
      meta: { providerRef: event.paymentRef, refundId: event.refundRef, reversalOf: refund.id },
      source: 'system',
      // Aynı düşüş birden çok olayla bildirilebilir; ters kayıt iade hareketi başına bir kez yazılır.
      idempotencyKey: `refund-failed:${refund.id}`,
    });
  }
  kickOrderRegister(db, orderId);
  await captureError(new Error('Revolut iadesi düştü; iade ters hareketle geri alındı'), {
    source: SOURCES.webhook,
    context: { provider: 'revolut', orderId, refundRef: event.refundRef },
  });
  return { status: 'ok', action: 'refund_reversed' };
}

/**
 * Aktarım: havuzdaki para ana hesaba geçer; ekstre aynı tutarı getirince bu ucun karşı satırı olur. Hedef hesap ayardır
 * (`card_payout_account_id`) ve banka hesabı olmalı; değilse olay işlenmemiş kalır ve sağlayıcı yeniden dener.
 */
async function recordPayout(event: Extract<PaymentEvent, { kind: 'payout_completed' }>, accountId: string | null): Promise<WebhookOutcome> {
  if (!accountId) return { status: 'not_found' };
  const db = serviceDb();
  const bankAccountId = await new SettingsService(db).get<string | null>('card_payout_account_id', null);
  if (!bankAccountId) throw new Error('aktarım hesabı ayarı yok — aktarım yazılamadı (Ayarlar › Para › Kart ödemeleri aktarım hesabı)');
  const bank = await new AccountService(db).getById(bankAccountId);
  if (bank?.type !== 'bank') {
    throw new Error(`aktarım hesabı banka hesabı değil (${bank?.name ?? bankAccountId}) — Ayarlar › Para › Kart ödemeleri aktarım hesabı`);
  }

  const movement: MoneyMovementInsert & { idempotencyKey: string } = {
    accountId,
    counterAccountId: bankAccountId,
    direction: 'out',
    amountCents: event.payout.amountCents,
    type: 'transfer',
    description: `Kart ödemeleri aktarımı ${event.payout.id}`,
    valueDate: event.payout.valueDate,
    source: 'system',
    meta: { payoutId: event.payout.id, currency: event.payout.currency },
    idempotencyKey: `card-payout:${event.payout.id}`,
  };
  const verdict = validateMovement(movement);
  if (!verdict.valid) throw new Error(`aktarım hareketi geçersiz: ${verdict.reason}`);
  await new MoneyMovementService(db).insertOnce(movement);
  // Pennylane'in banka satırı aktarımdan önce düşmüş olabilir; bekliyorsa şimdi bağlanır.
  await linkAwaitingTransfers(db, bankAccountId);
  return { status: 'ok', action: 'payout_recorded' };
}
