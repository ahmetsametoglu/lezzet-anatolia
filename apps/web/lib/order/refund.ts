import 'server-only';
import { serviceDb } from '@lezzet/database';
import {
  adjustFulfillment as adjustFulfillmentFor,
  cancelOrder as cancelOrderFor,
  retryRefund as retryRefundFor,
  type OrderEffects,
  type ProviderRefunder,
  type RefundOptions as CoreRefundOptions,
} from '@lezzet/application';
import type { FulfillmentAdjustment, OrderCancelReason } from '@lezzet/types';
import { notifyOrderException } from './notify';
import { revolutRefunder } from './provider-refund';

/**
 * Kısmi karşılama ve iptal/iade köprüsü: kural `@lezzet/application/order/refund`tadır; köprü yalnız `db`yi ve yan etki portlarını
 * doldurur. Kapsam verilmez, çünkü ekranın `requireAdmin` guard'ı kapıdadır; `server-only` web'de istemciye sızmayı engeller.
 */

export type { RefundBlockReason } from '@lezzet/application';

/**
 * Köprü kapsam geçmediği için `out_of_scope` doğmaz ve sonuç tipinden çıkarılır. Daraltma `as` ile değil çalışma anında bakan
 * kapıyla yapılır ki köprü bir gün kapsam geçerse sessizce yanlış "ok" denmesin.
 */
type CoreAdjust = Awaited<ReturnType<typeof adjustFulfillmentFor>>;
type CoreCancel = Awaited<ReturnType<typeof cancelOrderFor>>;
type ScopeVerdict = { status: 'forbidden'; reason: 'out_of_scope' };

type AdjustOutcome = Exclude<CoreAdjust, ScopeVerdict>;
type CancelOutcome =
  | Exclude<CoreCancel, { status: 'forbidden' }>
  | {
      status: 'forbidden';
      reason: Exclude<Extract<CoreCancel, { status: 'forbidden' }>['reason'], 'out_of_scope'>;
    };

function withoutScopeVerdict<T extends { status: string }, N>(outcome: T): N {
  if (outcome.status === 'forbidden' && (outcome as { reason?: string }).reason === 'out_of_scope') {
    // Ulaşılamaz olması GEREKİYOR; ulaşıldıysa köprü kapsam geçmeye başlamış demektir ve bunu
    // öğrenmenin yeri sessiz bir dal değil, düşen bir istektir.
    throw new Error('[refund] Köprü depo kapsamı geçmiyor — `out_of_scope` dönmemeliydi.');
  }
  return outcome as unknown as N;
}

/**
 * Web'in seçenekleri: `effects` yerine yalnız `refunder`, çünkü çağıranlar yalnız sağlayıcıyı sahteler; haberi köprü kendi doldurur
 * ki unutan çağıran müşteriye haber gitmeyen bir iade yazmasın.
 */
interface RefundOptions extends Omit<CoreRefundOptions, 'effects'> {
  /** Sağlayıcıya iade portu; varsayılanı Revolut, test sahte üreteç verir ki "önce sağlayıcı, sonra hareket" sırası ağa çıkmadan sınansın. */
  refunder?: ProviderRefunder;
}

/** Web yüzeyinin etki portu: istisna haberi hep dolu, sağlayıcı çağıranca sahtelenebilir. */
function webRefundEffects(refunder?: ProviderRefunder): OrderEffects {
  return {
    notifyException: (orderId, event, opts) => notifyOrderException(orderId, event, opts),
    refunder: refunder ?? revolutRefunder(),
  };
}

/** Paket imzasına çevirir: `refunder` → `effects`, geri kalanı olduğu gibi. */
function toCoreOptions({ refunder, ...rest }: RefundOptions): CoreRefundOptions {
  return { ...rest, effects: webRefundEffects(refunder) };
}

export async function adjustFulfillment(
  orderId: string,
  lines: readonly FulfillmentAdjustment[],
  opts: RefundOptions & { actorId?: string | null } = {},
): Promise<AdjustOutcome> {
  const { actorId, ...refundOpts } = opts;
  const outcome = await adjustFulfillmentFor(serviceDb(), orderId, lines, { ...toCoreOptions(refundOpts), actorId });
  return withoutScopeVerdict<CoreAdjust, AdjustOutcome>(outcome);
}

export async function cancelOrder(
  orderId: string,
  opts: RefundOptions & { actorId?: string | null; reason?: OrderCancelReason | null } = {},
): Promise<CancelOutcome> {
  const { actorId, reason, ...refundOpts } = opts;
  const outcome = await cancelOrderFor(serviceDb(), orderId, { ...toCoreOptions(refundOpts), actorId, reason });
  return withoutScopeVerdict<CoreCancel, CancelOutcome>(outcome);
}

export async function retryRefund(orderId: string, opts: RefundOptions = {}) {
  return retryRefundFor(serviceDb(), orderId, toCoreOptions(opts));
}
