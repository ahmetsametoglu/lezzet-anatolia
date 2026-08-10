import 'server-only';
import { serviceDb } from '@lezzet/database';
import {
  adjustFulfillment as adjustFulfillmentFor,
  cancelOrder as cancelOrderFor,
  retryRefund as retryRefundFor,
  type OrderEffects,
  type RefundOptions as CoreRefundOptions,
} from '@lezzet/application';
import type { FulfillmentAdjustment, OrderCancelReason } from '@lezzet/types';
import { notifyOrderException } from './notify';
import { stripeRefunder, type ProviderRefunder } from './provider-refund';

/**
 * Kısmi karşılama (07.8) ve iptal/iade (07.9) — **geçiş köprüsü** (terfi aşama 2/3, denetim K5-1).
 *
 * ── NEDEN KÖPRÜYE İNDİ ──────────────────────────────────────────────────────
 * Gövde `@lezzet/application/order/refund`ta ve künyenin tamamı orada: sıranın neden "önce mal,
 * sonra para" olduğu, iade borcunun neden türetildiği, sağlayıcı reddedince hareketin neden hiç
 * yazılmadığı.
 *
 * Burada 260 satırlık bir İKİZ duruyordu ve ikisi de canlıydı: operasyon sipariş ekranı buradan,
 * mobil arka uç paketten okuyordu. **Üstelik ayrışmışlardı bile** — paket sürümü depo kapsamı
 * (`out_of_scope`, D6) kazanmıştı, bu kopya kazanmamıştı. Aynı soruya iki cevap veren bir para
 * kuralı, bir gün yanlış tutar demektir ve **hiçbir test bunu yakalamaz**: iki dosyanın da kendi
 * testi vardı, ikisi de yeşildi.
 *
 * ── KÖPRÜNÜN TAŞIDIĞI ŞEY: İMZA + İKİ YAN ETKİ ──────────────────────────────
 * Düz bir `export … from` yetmiyor, çünkü paket sürümü `db`yi PARAMETRE alıyor (taşıma bilmez) ve
 * yan etkileri PORT'tan istiyor. Köprü tam olarak bu ikisini dolduruyor — `transition.ts`in aynı
 * deseni. Kural yine tek yerde; buradaki hiçbir satır karar vermiyor.
 *
 * `server-only` BURADA kalıyor, pakette değil: paket Next'e ait hiçbir şey bilmez, ama web tarafında
 * bu kapının istemciye sızmaması hâlâ zorlanmalı.
 *
 * ── KAPSAM VERİLMİYOR VE BU BİLİNÇLİ ────────────────────────────────────────
 * `warehouseScope` geçilmiyor, yani kapsam sorulmuyor — ekranın `requireAdmin` guard'ı zaten
 * kapıda. Bugünkü davranışın birebir aynısı (paket künyesi: *"undefined = kapsam sorulmuyor"*).
 * Mobil depo ucu (21.11) açıldığında kapsamı O çağıran verir; web köprüsüne eklemek, olmayan bir
 * güvenceyi vaat etmek olurdu.
 */

export type { RefundBlockReason } from '@lezzet/application';

/**
 * ── SONUÇ TİPLERİ DARALTILIYOR: `out_of_scope` BU KAPIDAN DÖNMEZ ────────────
 *
 * Köprü `warehouseScope` geçmiyor, yani paket "bu siparişin deposu kümede mi" sorusunu hiç sormuyor
 * ve o hâl **yapı gereği** doğmuyor. Tipi olduğu gibi bırakmak, ekranı hiç gerçekleşmeyecek bir dal
 * yazmaya zorlardı — ölü kod, üstelik test edilemeyen türden.
 *
 * Daraltma bir `as` ile DEĞİL, çalışma anında bakan bir kapıyla yapılıyor (`withoutScopeVerdict`):
 * gün gelir köprü kapsam geçmeye başlarsa `as` sessizce yalan söylerdi ve ekran tanımadığı bir
 * durumu "ok" sanıp devam ederdi. Kapı bunun yerine bağırıyor.
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
 * Web'in seçenekleri — paketinkiyle aynı, tek farkı `effects` yerine **`refunder`**.
 *
 * Ayrım bilinçli: bu kapının çağıranları (operasyon ekranı, Stripe webhook'u, testler) haber
 * portuyla hiç ilgilenmiyor, yalnız sağlayıcıyı sahtelemek istiyor. Portun tamamını imzaya koymak,
 * her çağıranın `notifyException`ı da hatırlamasını gerektirirdi — ve unutan bir çağıran müşteriye
 * haber gitmeyen bir iade yazardı. Köprü bu yüzden haberi KENDİ dolduruyor.
 */
interface RefundOptions extends Omit<CoreRefundOptions, 'effects'> {
  /**
   * Sağlayıcıya iade portu (07.11). Varsayılanı gerçek Stripe çağrısıdır; test sahte üreteç verir —
   * "önce sağlayıcı, sonra hareket" sırası ağa çıkmadan sınanabilsin diye.
   */
  refunder?: ProviderRefunder;
}

/** Web yüzeyinin etki portu: istisna haberi hep dolu, sağlayıcı çağıranca sahtelenebilir. */
function webRefundEffects(refunder?: ProviderRefunder): OrderEffects {
  return {
    notifyException: (orderId, event, opts) => notifyOrderException(orderId, event, opts),
    refunder: refunder ?? stripeRefunder(),
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
