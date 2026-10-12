import { MoneyMovementService, type Db } from '@lezzet/database';
import {
  DOOR_CARD_MATCH_WINDOW_MS,
  doorCardCandidates,
  matchDoorCardPayments,
  type DoorCardCollection,
  type InPersonPayment,
} from '@lezzet/domain-core';
import { SOURCES, captureError } from '@lezzet/observability';
import type { MoneyMovement } from '@lezzet/types';
import { notifyDoorCardMissing, notifyDoorCardUnmatched } from '../notification/staff-events';
import { recordPaymentFee } from './payment-fee';
import { listInPersonPayments, readRevolutOrder, revolutFeeOf, type RevolutClient } from './revolut';

/**
 * Kapıda kart Revolut Business uygulamasındaki Tap to Pay ile çekilir ve bizde "kart" diye yazılır (`docs/feature/kasa-muhasebe.md`
 * §9). Bu iş Revolut'un yüz yüze ödemelerini o tahsilatlarla eşler: tahsilat ödemenin kimliğini taşır, komisyon siparişe yazılır ve
 * eşleşmeyen iki yön yönetime bildirilir.
 */

export interface DoorCardReconcileOptions {
  /** Kapıda kart hesabı (`door_card_account_id`); tahsilatlar yalnız bu hesapta aranır. */
  accountId: string;
  now?: Date;
  /** Geriye bakış: eşleşmeyen ödeme bu süre boyunca yeniden denenir, öncesi aktarım raporunun "açıklanamayan" ziline kalır. */
  lookbackMs?: number;
  /** Bildirimden önceki bekleme: personel kartı çekip tahsilatı biraz sonra yazabilir. */
  graceMs?: number;
  windowMs?: number;
}

const DOOR_CARD_LOOKBACK_MS = 3 * 86_400_000;
const DOOR_CARD_GRACE_MS = 2 * 3_600_000;
/** Elle eşlemenin geriye bakışı: bildirim birkaç gün sonra ele alınabilir, iş ise yalnız son üç günü dener. */
const DOOR_CARD_REVIEW_MS = 14 * 86_400_000;

/** İki yanın açıkta kalanları: hiçbir tahsilata bağlanmamış yüz yüze ödemeler ve Revolut ödemesine bağlanmamış kart tahsilatları. */
interface DoorCardOpenItems {
  payments: InPersonPayment[];
  collections: MoneyMovement[];
}

async function listDoorCardOpenItems(
  db: Db,
  client: RevolutClient,
  range: { accountId: string; from: string; to: string },
): Promise<DoorCardOpenItems> {
  const movements = new MoneyMovementService(db);
  const payments = await listInPersonPayments(client, { from: range.from, to: range.to });
  const linked = new Set(
    (await movements.listOrderMovementsByProviderRefs(payments.map((payment) => payment.ref))).map((row) => row.providerRef),
  );
  return {
    payments: payments.filter((payment) => !linked.has(payment.ref)),
    collections: await movements.listUnlinkedCardCollections(range.accountId, range.from),
  };
}

const asCollection = (movement: MoneyMovement): DoorCardCollection => ({
  movementId: movement.id,
  amountCents: movement.amountCents,
  at: movement.createdAt,
});

export async function reconcileDoorCardPayments(
  db: Db,
  client: RevolutClient,
  opts: DoorCardReconcileOptions,
): Promise<Record<string, number>> {
  const now = opts.now ?? new Date();
  const from = new Date(now.getTime() - (opts.lookbackMs ?? DOOR_CARD_LOOKBACK_MS)).toISOString();
  const { payments, collections } = await listDoorCardOpenItems(db, client, { accountId: opts.accountId, from, to: now.toISOString() });

  const matches = matchDoorCardPayments(payments, collections.map(asCollection), opts.windowMs ?? DOOR_CARD_MATCH_WINDOW_MS);
  const byId = new Map(collections.map((movement) => [movement.id, movement]));
  for (const match of matches) await linkDoorCardPayment(db, client, byId.get(match.movementId)!, match.ref);

  // Bekleme süresini geçmemiş taraf eşini henüz bulmamış olabilir; bildirim yalnız süresi dolanlara gider.
  const due = now.getTime() - (opts.graceMs ?? DOOR_CARD_GRACE_MS);
  const matchedRefs = new Set(matches.map((match) => match.ref));
  const matchedMovements = new Set(matches.map((match) => match.movementId));
  const unmatched = payments.filter((payment) => !matchedRefs.has(payment.ref) && Date.parse(payment.at) <= due);
  const missing = collections.filter((movement) => !matchedMovements.has(movement.id) && Date.parse(movement.createdAt) <= due);
  for (const payment of unmatched) {
    await notifyDoorCardUnmatched(db, { paymentRef: payment.ref, amountCents: payment.amountCents, at: payment.at });
  }
  for (const movement of missing) {
    await notifyDoorCardMissing(db, { movementId: movement.id, orderId: movement.orderId!, amountCents: movement.amountCents });
  }

  return {
    payments: payments.length,
    collections: collections.length,
    matched: matches.length,
    unmatched: unmatched.length,
    missing: missing.length,
  };
}

/** Elle eşlemenin görünümü: her açık ödeme adaylarıyla, hiçbir ödemenin adayı olmayan tahsilatlar ayrı. */
export interface DoorCardReview {
  payments: Array<InPersonPayment & { candidates: MoneyMovement[] }>;
  orphans: MoneyMovement[];
}

export async function reviewDoorCardItems(db: Db, client: RevolutClient, opts: { accountId: string; now?: Date }): Promise<DoorCardReview> {
  const now = opts.now ?? new Date();
  const from = new Date(now.getTime() - DOOR_CARD_REVIEW_MS).toISOString();
  const { payments, collections } = await listDoorCardOpenItems(db, client, { accountId: opts.accountId, from, to: now.toISOString() });

  const { byPayment, orphans } = doorCardCandidates(payments, collections.map(asCollection));
  const byId = new Map(collections.map((movement) => [movement.id, movement]));
  return {
    payments: payments.map((payment, index) => ({ ...payment, candidates: byPayment[index]!.movementIds.map((id) => byId.get(id)!) })),
    orphans: orphans.map((id) => byId.get(id)!),
  };
}

export type DoorCardLinkReason = 'payment_not_open' | 'not_candidate';

/**
 * Elle eşleme: bağ yalnız iki açık kalem arasında ve tutar birebir tutuyorsa yazılır. Ekrandaki liste bayat olabilir; seçim bu yüzden
 * Revolut'tan ve defterden yeniden okunup doğrulanır.
 */
export async function linkDoorCardPaymentByHand(
  db: Db,
  client: RevolutClient,
  input: { accountId: string; movementId: string; paymentRef: string; now?: Date },
): Promise<{ status: 'linked' } | { status: 'invalid'; reason: DoorCardLinkReason }> {
  const review = await reviewDoorCardItems(db, client, input);
  const payment = review.payments.find((entry) => entry.ref === input.paymentRef);
  if (!payment) return { status: 'invalid', reason: 'payment_not_open' };
  const movement = payment.candidates.find((candidate) => candidate.id === input.movementId);
  if (!movement) return { status: 'invalid', reason: 'not_candidate' };
  await linkDoorCardPayment(db, client, movement, payment.ref);
  return { status: 'linked' };
}

/**
 * Tahsilatı Revolut ödemesine bağlar ve ödemenin komisyonunu siparişe yazar. Komisyon ödemede henüz yoksa aktarım raporu aynı kimlikle
 * sonra yazar, çünkü bağlanan tahsilatın künyesi o raporun tanıdığı kimliktir.
 */
async function linkDoorCardPayment(db: Db, client: RevolutClient, movement: MoneyMovement, paymentRef: string): Promise<void> {
  await new MoneyMovementService(db).linkProviderRef(movement, paymentRef);
  if (!movement.orderId) return;
  try {
    const fee = revolutFeeOf(await readRevolutOrder(client, paymentRef));
    if (!fee) return;
    await recordPaymentFee(db, {
      orderId: movement.orderId,
      accountId: movement.accountId,
      paymentRef,
      feeCents: fee.feeCents,
      meta: { providerPaymentId: fee.paymentId },
    });
  } catch (error) {
    // Bağ yazıldı; yüz yüze siparişin ayrıntısı okunamazsa komisyonu aktarım raporu yazar, öteki eşleşmeler durmaz.
    await captureError(error, {
      source: SOURCES.applicationOrder,
      context: { flow: 'door_card_fee', paymentRef, movementId: movement.id },
    });
  }
}
