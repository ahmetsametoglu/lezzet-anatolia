import { CustomerTrustScoreService, TrustEntryService, type serviceDb } from '@lezzet/database';
import { TRUST_REASON_LABELS, type KeysetCursor, type TrustReason } from '@lezzet/types';
import { ORDERS_PATH } from '@/app/(operations)/operations/orders/orders-url';

type Db = ReturnType<typeof serviceDb>;

/** Kaynağı sipariş olan sebepler; öteki sebeplerin kaynağı durum kaydı ya da puan satırıdır ve kendi ekranı yoktur. */
const ORDER_SOURCED: ReadonlySet<TrustReason> = new Set<TrustReason>([
  'order_delivered',
  'order_cancelled',
  'payment_uncollected',
  'payment_overdue',
]);

export interface TrustRowView {
  id: string;
  label: string;
  points: number;
  occurredAt: string;
  /** Olayın siparişine giden yol; kaynağı sipariş olmayan satırda `null`. */
  href: string | null;
}

export interface TrustView {
  /** `null` = defterde hiç hareket yok; sıfır puanla karışmasın diye ayrı. */
  score: number | null;
  rows: TrustRowView[];
  nextCursor: KeysetCursor | null;
}

/** Güven geçmişinin bir sayfası — olay anına göre yeniden eskiye. */
export async function readTrustPage(
  db: Db,
  customerId: string,
  cursor?: KeysetCursor,
  limit = 10,
): Promise<{ rows: TrustRowView[]; nextCursor: KeysetCursor | null }> {
  const page = await new TrustEntryService(db).listByCustomer(customerId, cursor, limit);
  return {
    rows: page.rows.map((entry) => ({
      id: entry.id,
      label: TRUST_REASON_LABELS[entry.reason],
      points: entry.points,
      occurredAt: entry.occurredAt,
      href: ORDER_SOURCED.has(entry.reason) ? `${ORDERS_PATH}/${entry.refId}` : null,
    })),
    nextCursor: page.nextCursor,
  };
}

/** Müşterinin güven puanı ve geçmişin ilk sayfası; sipariş detayı ve müşteri önizlemesi aynı okumayı kullanır. */
export async function readCustomerTrust(db: Db, customerId: string, limit = 10): Promise<TrustView> {
  const [score, page] = await Promise.all([new CustomerTrustScoreService(db).scoreOf(customerId), readTrustPage(db, customerId, undefined, limit)]);
  return { score: score?.score ?? null, ...page };
}
