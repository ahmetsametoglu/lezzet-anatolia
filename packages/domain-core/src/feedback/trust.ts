import type { TrustFact, TrustReason } from '@lezzet/types';

/**
 * Güven puanı tavsiyedir, otomasyon değil: sistem hiçbir müşteriyi bununla engellemez, operatör okur ve karar verir. Ağırlıklar
 * işletme tercihidir, ayardan gelir; sıfır ağırlıklı olay deftere hiç girmez.
 */

interface TrustWeightDef {
  key: string;
  fallback: number;
  /** Ceza mı: ayar ekranı işareti buna göre sınırlar, ters girilen ağırlık puanı tersine çevirmesin. */
  penalty: boolean;
}

/** Sebep başına ayar anahtarı ve fabrika ağırlığı: ödül artı, ceza eksi. */
export const TRUST_WEIGHTS: Readonly<Record<TrustReason, TrustWeightDef>> = {
  order_delivered: { key: 'trust_weight_order_delivered', fallback: 10, penalty: false },
  referral: { key: 'trust_weight_referral', fallback: 15, penalty: false },
  neighbor: { key: 'trust_weight_neighbor', fallback: 10, penalty: false },
  review: { key: 'trust_weight_review', fallback: 3, penalty: false },
  feedback: { key: 'trust_weight_feedback', fallback: 1, penalty: false },
  visit: { key: 'trust_weight_visit', fallback: 1, penalty: false },
  order_cancelled: { key: 'trust_weight_order_cancelled', fallback: -5, penalty: true },
  delivery_refused: { key: 'trust_weight_delivery_refused', fallback: -5, penalty: true },
  // Teslim sonrası iade çoğu zaman ürün şikâyetinden doğar ve kusur bizde olabilir; sayılması işletmenin kararı.
  order_returned: { key: 'trust_weight_order_returned', fallback: 0, penalty: true },
  delivery_unreachable: { key: 'trust_weight_delivery_unreachable', fallback: -10, penalty: true },
  payment_uncollected: { key: 'trust_weight_payment_uncollected', fallback: -15, penalty: true },
  payment_overdue: { key: 'trust_weight_payment_overdue', fallback: -10, penalty: true },
};

/** Teslim edilmiş peşin siparişin parası bu kadar gün içinde kapanmazsa "tahsil edilemedi" sayılır. */
export const TRUST_UNCOLLECTED_GRACE_DAYS_KEY = 'trust_uncollected_grace_days';
export const TRUST_UNCOLLECTED_GRACE_DAYS_DEFAULT = 2;

export interface TrustEntryDraft {
  customerId: string;
  reason: TrustReason;
  refId: string;
  points: number;
  occurredAt: string;
}

/**
 * Olaydan defter satırı; ağırlık sıfırsa satır doğmaz. Tahsil adayında bekleme süresi dolmadıysa henüz olay yoktur ve olay anı
 * sürenin dolduğu andır, teslim anı değil.
 */
export function trustEntryOf(
  fact: Pick<TrustFact, 'reason' | 'customerId' | 'refId' | 'occurredAt'>,
  weights: Readonly<Record<TrustReason, number>>,
  opts: { graceDays: number; now: Date },
): TrustEntryDraft | null {
  const points = weights[fact.reason];
  if (!points) return null;

  let occurredAt = fact.occurredAt;
  if (fact.reason === 'payment_uncollected') {
    const due = new Date(new Date(fact.occurredAt).getTime() + opts.graceDays * 86_400_000);
    if (due.getTime() > opts.now.getTime()) return null;
    occurredAt = due.toISOString();
  }
  return { customerId: fact.customerId, reason: fact.reason, refId: fact.refId, points, occurredAt };
}
