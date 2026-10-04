import type { SupabaseClient } from '@supabase/supabase-js';
import { OrderService, SettingsService, TrustEntryService, TrustFactService, UserProfileService } from '@lezzet/database';
import {
  PAYMENT_TERM_DAYS_DEFAULT,
  PAYMENT_TERM_DAYS_KEY,
  TRUST_UNCOLLECTED_GRACE_DAYS_DEFAULT,
  TRUST_UNCOLLECTED_GRACE_DAYS_KEY,
  TRUST_WEIGHTS,
  dueDayOf,
  isOverdue,
  trustEntryOf,
  type TrustEntryDraft,
} from '@lezzet/domain-core';
import { addDays, parisDayRange } from '@lezzet/helper';
import { TrustReasonEnum, type TrustReason } from '@lezzet/types';

/** Bir partide okunan en çok olay ve bir turdaki en çok parti: ilk kurulumda geçmiş tek turda erisin ama tur sonsuza uzamasın. */
const SCAN_BATCH = 500;
const SCAN_MAX_BATCHES = 20;

type Weights = Record<TrustReason, number>;

async function readWeights(settings: SettingsService): Promise<Weights> {
  const reasons = TrustReasonEnum.options;
  const values = await Promise.all(reasons.map((reason) => settings.getNumber(TRUST_WEIGHTS[reason].key, TRUST_WEIGHTS[reason].fallback)));
  return Object.fromEntries(reasons.map((reason, i) => [reason, values[i] ?? 0])) as Weights;
}

/**
 * Güven taraması: deftere yazılmamış olayları okur, puanı motordan alır ve yazar; sipariş, talep ve puan akışlarına dokunmaz.
 * İdempotenttir; `customerIds` verilirse yalnız o müşteriler taranır, ki bir sınama başkasının defterine yazmasın.
 */
export async function scanTrust(
  db: SupabaseClient,
  opts: { now?: Date; customerIds?: readonly string[] } = {},
): Promise<{ recorded: number }> {
  const now = opts.now ?? new Date();
  const settings = new SettingsService(db);
  const [weights, graceDays, defaultTermDays] = await Promise.all([
    readWeights(settings),
    settings.getNumber(TRUST_UNCOLLECTED_GRACE_DAYS_KEY, TRUST_UNCOLLECTED_GRACE_DAYS_DEFAULT),
    settings.getNumber(PAYMENT_TERM_DAYS_KEY, PAYMENT_TERM_DAYS_DEFAULT),
  ]);
  const entries = new TrustEntryService(db);
  const facts = new TrustFactService(db);
  const active = TrustReasonEnum.options.filter((reason) => weights[reason] !== 0 && reason !== 'payment_overdue');

  let recorded = 0;
  for (let batch = 0; batch < SCAN_MAX_BATCHES; batch += 1) {
    const pending = await facts.listPending(active, SCAN_BATCH, opts.customerIds);
    const drafts = pending
      .map((fact) => trustEntryOf(fact, weights, { graceDays, now }))
      .filter((draft): draft is TrustEntryDraft => draft !== null);
    recorded += (await entries.record(drafts)).length;
    // Süresi dolmamış tahsil adayı yazılmaz; hiçbir şey yazamayan parti bir sonrakinde aynısını getirirdi.
    if (pending.length < SCAN_BATCH || drafts.length === 0) break;
  }

  recorded += await recordOverdue(db, weights, defaultTermDays, now, opts.customerIds);
  return { recorded };
}

/** Vade gecikmesi açık vade okumasından ve `isOverdue` kuralından türer; olay anı vadenin dolduğu gündür. */
async function recordOverdue(
  db: SupabaseClient,
  weights: Weights,
  defaultTermDays: number,
  now: Date,
  scope?: readonly string[],
): Promise<number> {
  if (weights.payment_overdue === 0) return 0;
  const open = (await new OrderService(db).listOpenCredit()).filter((order) => !scope || (order.customerId !== null && scope.includes(order.customerId)));
  const customerIds = [...new Set(open.flatMap((order) => (order.customerId ? [order.customerId] : [])))];
  const profiles = await new UserProfileService(db).listByIds(customerIds);
  const termOf = new Map(profiles.map((profile) => [profile.id, profile.paymentTermDays ?? defaultTermDays]));

  const drafts: TrustEntryDraft[] = [];
  for (const order of open) {
    if (!order.customerId) continue;
    const termDays = termOf.get(order.customerId) ?? defaultTermDays;
    if (!isOverdue(order, termDays, now)) continue;
    // Gecikme, vade gününü izleyen Paris gece yarısında başlar.
    const overdueSince = parisDayRange(addDays(dueDayOf(order.createdAt, termDays), 1)).from;
    const fact = { reason: 'payment_overdue' as const, customerId: order.customerId, refId: order.id, occurredAt: overdueSince };
    const draft = trustEntryOf(fact, weights, { graceDays: 0, now });
    if (draft) drafts.push(draft);
  }
  return (await new TrustEntryService(db).record(drafts)).length;
}
