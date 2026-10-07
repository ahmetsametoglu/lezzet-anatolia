import { AccountService, MoneyMovementService, OrderService } from '@lezzet/database';
import { canTransition, planRefund, refundSourcesOf, type RefundLeg, type RefundPlan } from '@lezzet/domain-core';
import type { AccountType, FulfillmentAdjustment, OrderCancelReason, OrderStatus, PaymentStatus } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { kickOrderRegister } from '../register/sync';
import { cancelOrderShipment, type ShipmentCancelOutcome } from '../shipping/cancel';
import { notifyExceptionEffect, notifyStatusEffect, providerRefunder, type OrderEffects } from './effects';
import { recordOrderRefund, syncOrderPaymentStatus, type PaymentOutcome } from './payment';

/**
 * Kısmi karşılama, iade ve iptalin kapısı (DOMAIN §8, ORDER_LIFECYCLE): malı veritabanı yazar, iade borcunu motor türetir,
 * hareketi para kapısı yazar. Kapıda ödemede borç sıfır çıktığı için ödeme yöntemine bakan dal yoktur; iade paranın girdiği
 * yollara, en son ödemeden geriye bölünerek döner.
 */

interface RefundOutcome {
  /** Fiilen yazılan iade tutarı (**cent**). 0 = iade borcu yoktu **ya da** yazılamadı (`refundBlocked`). */
  refundedAmountCents: number;
  paymentStatus: PaymentStatus;
  /** Kapıda/vadeli tahsil edilmeyi bekleyen kalan (**cent**) — kısmi karşılamada düşmüş hâli. */
  amountToCollectCents: number;
  /**
   * Borç vardı ama iade yazılamadı — sebebiyle; yokluğu "iade tamam" demektir. Sessiz sıfır, operatöre iadeyi yapılmış
   * gösterirdi.
   */
  refundBlocked?: RefundBlockReason;
}

/**
 * İadenin yazılamama sebepleri: hesap türetilemedi ya da para planın karşılayabileceğinden fazla (`no_account`), sağlayıcı tahsilatının
 * künyesi yok (`provider_ref_missing`), port ya da anahtar yok (`provider_unavailable`), sağlayıcı reddetti (`provider_failed`).
 */
export type RefundBlockReason = 'no_account' | 'provider_ref_missing' | 'provider_unavailable' | 'provider_failed';

export type AdjustOutcome =
  | ({ status: 'ok'; restockedQty: number; discardedQty: number; releasedQty: number } & RefundOutcome)
  /**
   * Sipariş çağıranın depo kapsamı dışında (D6). **Yetki kararı DEĞİL, kapsam kararı:** kimliğin
   * doğrulanması ve rolün okunması uç katmanın işidir (guard); burada yalnız "bu siparişin deposu
   * verilen kümede mi" sorusu var — ve bu bir İŞ kuralıdır, taşımanın değil.
   */
  | { status: 'forbidden'; reason: 'out_of_scope' }
  /** Sipariş düzeltilebilir bir durumda değil (iptal edilmiş). */
  | { status: 'stale'; currentStatus: OrderStatus }
  /**
   * Kalemin akıbeti zaten yazılmış ve istek başka akıbet söylüyor: ekran bayattır, hiçbir satır yazılmaz. `stale`den
   * ayrı, çünkü orada sipariş değişmiştir, burada kalem karara bağlanmıştır.
   */
  | { status: 'already_marked'; orderItemId: string | null }
  | { status: 'not_found' };

export type CancelOutcome =
  /**
   * `shipment`: iptalin kargo yarısı; `provider_failed`/`provider_unavailable` etiketin taşıyıcıda ayakta kalmış
   * olabileceğini söyler. İptali durdurmaz, çünkü sipariş iptali kesin bir olgudur.
   */
  | ({ status: 'ok'; releasedQty: number; shipment: ShipmentCancelOutcome } & RefundOutcome)
  | { status: 'forbidden'; reason: 'same_status' | 'terminal' | 'not_allowed' | 'out_of_scope' }
  | { status: 'stale'; currentStatus: OrderStatus }
  | { status: 'not_found' };

export interface RefundOptions {
  /** İadenin çıkacağı hesap — verilmezse paranın girdiği yollara bölünür; kart hesabı verilirse o hesabın kart ödemelerine bölünür. */
  refundAccountId?: string | null;
  /** Tutarı elle vermek — türetilen borcun YERİNE geçer (ör. stok yokluğu iptalinde `0`: para sağlayıcıda kalır). */
  refundAmountCents?: number | null;
  valueDate?: string;
  description?: string | null;
  /**
   * Sağlayıcıya iade ve müşteri haberi portları; kayıtlı değillerse haber atlanır ve sağlayıcı `provider_unavailable`
   * döner (`effects.ts`).
   */
  effects?: OrderEffects;
}

/**
 * **Depo kapsamı**: `undefined` = sorulmuyor (web ekranı `requireAdmin` ile korunuyor); liste verilirse siparişin deposu
 * o kümede olmalı. Kapsam imzada, çünkü mobil depo ucu guard'ı ikinci kez yazmadan depocuyu kendi deposuna sınırlar.
 */
export type WarehouseScope = readonly string[] | undefined;

/** Kapsam süzgeci — kapsam verilmemişse soru sorulmaz (bugünkü davranış). */
function outOfScope(orderWarehouseId: string, scope: WarehouseScope): boolean {
  return scope !== undefined && !scope.includes(orderWarehouseId);
}

/**
 * **Kısmi karşılama / kalem iadesi**: adet yazılır, ödeme durumu yeniden türetilir ve borç varsa iade hareketi yazılır.
 * Önce mal, sonra para: tersinde düzeltme düşerse parası iade edilmiş ama karşılanmış görünen sipariş kalırdı.
 */
export async function adjustFulfillment(
  db: SupabaseClient,
  orderId: string,
  lines: readonly FulfillmentAdjustment[],
  opts: RefundOptions & { actorId?: string | null; warehouseScope?: WarehouseScope } = {},
): Promise<AdjustOutcome> {
  const orders = new OrderService(db);
  const order = await orders.getById(orderId);
  if (!order) return { status: 'not_found' };
  if (outOfScope(order.warehouseId, opts.warehouseScope)) return { status: 'forbidden', reason: 'out_of_scope' };

  const result = await orders.adjustFulfillment(orderId, lines, opts.actorId);
  if (!result.ok && result.reason === 'already_marked') {
    return { status: 'already_marked', orderItemId: result.orderItemId ?? null };
  }
  if (!result.ok) return { status: 'stale', currentStatus: result.currentStatus };

  const settled = await settleRefund(db, orderId, opts);
  if (!settled) return { status: 'not_found' };

  // Haberin hangisi olduğunu malın nerede olduğu belirler: mal daha çıkmadıysa bu bir EKSİK
  // KARŞILANMA (müşteri kapıda sürprizle karşılaşmasın), çıktıysa bir İADE (para geri döndü).
  // "İadeniz işlendi" yalnız olay yazıldıysa ve para gerçekten döndüyse söylenir; yazılamayan iadenin haberi, yeniden
  // deneme parayı çıkardığında `retryRefund`tan gider.
  const delivered = result.currentStatus === 'delivered' || result.currentStatus === 'completed';
  if ((result.lines ?? 0) > 0 && (!delivered || settled.refundedAmountCents > 0)) {
    await notifyExceptionEffect(opts.effects, orderId, delivered ? 'order_refunded' : 'order_shortfall', {
      refundedAmountCents: settled.refundedAmountCents,
      returns: result.returns ?? [],
    });
  }

  return {
    status: 'ok',
    restockedQty: result.restockedQty ?? 0,
    discardedQty: result.discardedQty ?? 0,
    releasedQty: result.releasedQty ?? 0,
    ...settled,
  };
}

/**
 * **Kapıda tek yazım: düzeltme + teslim.** Düzeltmenin anlamı malın fiili stoktan düşüp düşmediğine bağlı olduğu için
 * ikisi tek transaction'dadır; para (dış çağrı) ve müşteri haberi geri alınamadığı için yazım kesinleştikten sonra gelir.
 */
export type DeliverAdjustOutcome =
  | ({
      status: 'ok';
      restockedQty: number;
      discardedQty: number;
      releasedQty: number;
      /** Fiiliden düşülen toplam adet — teslimin kendi sayısı. */
      consumedQty: number;
      /** Kaç kalem düzeltildi; `0` = düzeltmesiz teslim. */
      adjustedLines: number;
    } & RefundOutcome)
  | { status: 'stale'; currentStatus: OrderStatus }
  | { status: 'already_marked'; orderItemId: string | null }
  | { status: 'not_found' };

export async function deliverOrderWithAdjustments(
  db: SupabaseClient,
  orderId: string,
  lines: readonly FulfillmentAdjustment[],
  opts: RefundOptions & {
    actorId?: string | null;
    deliveryProof?: Record<string, unknown> | null;
  } = {},
): Promise<DeliverAdjustOutcome> {
  const orders = new OrderService(db);
  if (!(await orders.getById(orderId))) return { status: 'not_found' };

  const written = await orders.deliverWithAdjustments(orderId, lines, {
    actorId: opts.actorId,
    deliveryProof: opts.deliveryProof,
  });
  if (!written.ok) {
    if (written.reason === 'already_marked') {
      return { status: 'already_marked', orderItemId: written.orderItemId ?? null };
    }
    return { status: 'stale', currentStatus: written.currentStatus };
  }

  /* Para YAZIMDAN SONRA: burada düşse bile mal ve teslim doğru yazılmış olur ve borç açıkta
     görünür — tersi (para yazılıp teslim yazılmaması) elle düzeltilecek bir hâl olurdu. */
  const settled = await settleRefund(db, orderId, opts);
  if (!settled) return { status: 'not_found' };

  /* Önce "yolda olan geldi", sonra ancak düzeltme varsa "eksik geldi" haberi gider; olmayan eksiklik duyurulmaz.
     Haber `order_shortfall`dur, `order_refunded` değil: mal kapıdan hiç girmedi. */
  await notifyStatusEffect(opts.effects, orderId, 'delivered');
  if ((written.lines ?? 0) > 0) {
    await notifyExceptionEffect(opts.effects, orderId, 'order_shortfall', {
      refundedAmountCents: settled.refundedAmountCents,
    });
  }

  return {
    status: 'ok',
    restockedQty: written.restockedQty ?? 0,
    discardedQty: written.discardedQty ?? 0,
    releasedQty: written.releasedQty ?? 0,
    consumedQty: written.consumedQty ?? 0,
    adjustedLines: written.lines ?? 0,
    ...settled,
  };
}

/**
 * **İptal**. Ayrılmış mal geri bırakılır ve tahsil edilmiş para varsa TAMAMI iade edilir —
 * iptal edilen siparişte karşılanan tutar 0'dır (ORDER_LIFECYCLE), gerisi türetimden gelir.
 */
export async function cancelOrder(
  db: SupabaseClient,
  orderId: string,
  opts: RefundOptions & {
    actorId?: string | null;
    reason?: OrderCancelReason | null;
    warehouseScope?: WarehouseScope;
  } = {},
): Promise<CancelOutcome> {
  const orders = new OrderService(db);

  const order = await orders.getById(orderId);
  if (!order) return { status: 'not_found' };
  if (outOfScope(order.warehouseId, opts.warehouseScope)) return { status: 'forbidden', reason: 'out_of_scope' };

  // Kural motorun: teslim edilmiş sipariş iptal edilmez, iade yoluna girer (`returned`).
  const verdict = canTransition(order.status, 'cancelled');
  if (!verdict.allowed) return { status: 'forbidden', reason: verdict.reason };

  const result = await orders.cancel(orderId, order.status, opts.actorId, opts.reason);
  if (!result.ok) return { status: 'stale', currentStatus: result.currentStatus };

  const settled = await settleRefund(db, orderId, { description: 'Sipariş iptali — iade', ...opts });
  if (!settled) return { status: 'not_found' };

  /* Gönderi de kapanır, yoksa kargo bedeli iade edilirken etiket taşıyıcıda ayakta kalırdı.
     Sonuç döner ama iptali durdurmaz; sağlayıcı düştüyse `shipment` alanı bunu operatöre söyler. */
  const shipment = await cancelOrderShipment(db, { orderId, actorId: opts.actorId });

  await notifyExceptionEffect(opts.effects, orderId, 'order_cancelled', { refundedAmountCents: settled.refundedAmountCents });

  return { status: 'ok', releasedQty: result.releasedQty ?? 0, shipment, ...settled };
}

/**
 * **İadeyi tek başına yeniden dener**: sağlayıcı düştüğünde düzeltme/iptal zaten yazılmıştır ve ikinci kez uygulanamaz.
 * Borç yeniden türetilir; borç kalmadıysa iade yazılmaz ve bu bir hata değildir.
 */
export async function retryRefund(
  db: SupabaseClient,
  orderId: string,
  opts: RefundOptions = {},
): Promise<({ status: 'ok' } & RefundOutcome) | { status: 'not_found' }> {
  const order = await new OrderService(db).getById(orderId);
  if (!order) return { status: 'not_found' };

  const settled = await settleRefund(db, orderId, opts);
  if (!settled) return { status: 'not_found' };
  // Teslim sonrası iadenin haberi ilk denemede para çıkmadığı için gitmemişti; para şimdi döndüyse söylenir.
  if (settled.refundedAmountCents > 0 && (order.status === 'delivered' || order.status === 'completed')) {
    await notifyExceptionEffect(opts.effects, orderId, 'order_refunded', { refundedAmountCents: settled.refundedAmountCents });
  }
  return { status: 'ok', ...settled };
}

/**
 * Ödeme durumunu tazeler, borç varsa iadeyi yazar ve hareketten sonraki hâli döner; tutar türetimden gelir, elle verilen tutar
 * yerine geçer. Para birden çok yoldan geldiyse iade motorun planıyla parçalara bölünür; her parçada önce sağlayıcı çağrısı, sonra
 * hareket, çünkü para dönmeden hareket yazılsa defter kapanmış görünürdü.
 */
async function settleRefund(db: SupabaseClient, orderId: string, opts: RefundOptions): Promise<RefundOutcome | null> {
  const before = await syncOrderPaymentStatus(db, orderId);
  if (before.status !== 'ok') return null;

  let state = { paymentStatus: before.paymentStatus, amountToCollectCents: before.derivation.amountToCollectCents };
  let refundedAmountCents = 0;
  const outcome = (refundBlocked?: RefundBlockReason): RefundOutcome => ({
    refundedAmountCents,
    ...state,
    ...(refundBlocked ? { refundBlocked } : {}),
  });

  const dueCents = opts.refundAmountCents ?? before.derivation.refundDueCents;
  if (dueCents <= 0) return outcome();

  const plan = await refundPlanOf(db, orderId, dueCents, opts.refundAccountId ?? null);
  // Hesap türetilemiyorsa iade yazılamaz ama düzeltme geçerlidir: borç `amountToCollect`'in negatifi olarak zaten görünür.
  if (plan.legs.length === 0) return outcome(plan.routeType === 'provider' ? 'provider_ref_missing' : 'no_account');

  try {
    for (const leg of plan.legs) {
      const written = await writeRefundLeg(db, orderId, leg, opts);
      // Yazılan parçalar geçerlidir; kalan borç açıkta görünür ve yeniden deneme onu yeni planla kapatır.
      if (written.status === 'blocked') return outcome(written.reason);
      refundedAmountCents += written.refundedCents;
      state = { paymentStatus: written.after.paymentStatus, amountToCollectCents: written.after.derivation.amountToCollectCents };
    }
  } finally {
    if (refundedAmountCents > 0) kickOrderRegister(db, orderId);
  }
  return outcome(plan.uncoveredCents > 0 ? 'no_account' : undefined);
}

/** Siparişin paraları ve operatörün seçtiği yol motorun planından geçer; bilinmeyen yol iadeyi durdurur, tahminle yazılmaz. */
async function refundPlanOf(
  db: SupabaseClient,
  orderId: string,
  dueCents: number,
  routeAccountId: string | null,
): Promise<RefundPlan & { routeType: AccountType | null }> {
  const [movements, accounts] = await Promise.all([new MoneyMovementService(db).listByOrder(orderId), new AccountService(db).list()]);
  const types = new Map(accounts.map((account) => [account.id, account.type]));
  const routeType = routeAccountId ? (types.get(routeAccountId) ?? null) : null;
  if (routeAccountId && !routeType) return { legs: [], uncoveredCents: dueCents, routeType: null };
  const route = routeAccountId && routeType ? { accountId: routeAccountId, accountType: routeType } : null;
  return { ...planRefund({ dueCents, sources: refundSourcesOf(movements, types), route }), routeType };
}

type LegResult =
  | { status: 'written'; refundedCents: number; after: Extract<PaymentOutcome, { status: 'ok' }> }
  | { status: 'blocked'; reason: RefundBlockReason };

/**
 * Tek parça. Sağlayıcı ve hareket aynı anahtarı taşır: çağrı geçip hareket yazılamazsa yeniden deneme aynı anahtarla gider, sağlayıcı
 * ilk iadeyi döner ve hareket bir kez yazılır.
 */
async function writeRefundLeg(db: SupabaseClient, orderId: string, leg: RefundLeg, opts: RefundOptions): Promise<LegResult> {
  const idempotencyKey = await refundIdempotencyKey(db, orderId, leg.amountCents);
  let meta: Record<string, unknown> | null = null;

  // Sağlayıcı çağrısı hesabın TÜRÜNE bağlıdır, siparişin ödeme yöntemine değil: operatör kartla ödenmiş siparişi kasadan nakit iade
  // edebilir, o zaman dönülecek bir sağlayıcı yoktur.
  if (leg.accountType === 'provider') {
    // Künye yoksa hangi ödemenin üzerinden dönüleceği bilinmiyor; yanlış niyete yapılan iade başka bir müşterinin parasını gönderir.
    if (!leg.providerRef) return { status: 'blocked', reason: 'provider_ref_missing' };
    const result = await providerRefunder(opts.effects)({ paymentRef: leg.providerRef, amountCents: leg.amountCents, idempotencyKey });
    if (result.status === 'unavailable') return { status: 'blocked', reason: 'provider_unavailable' };
    if (result.status === 'failed') return { status: 'blocked', reason: 'provider_failed' };
    meta = { providerRef: leg.providerRef, refundId: result.refundId };
  }

  const after = await recordOrderRefund(db, {
    orderId,
    accountId: leg.accountId,
    amountCents: leg.amountCents,
    method: leg.method,
    valueDate: opts.valueDate,
    description: opts.description ?? 'Sipariş iadesi',
    meta,
    // Sistemin yazdığı satır: iade borcu motordan türedi, hareketi bu zincir yazar.
    source: 'system',
    idempotencyKey,
  });
  if (after.status !== 'ok') {
    // Para SAĞLAYICIDAN ÇIKMIŞ olabilir ama deftere geçmedi — sessiz kalınamaz; çağıranın hata funnel'ı bunu `error_log`'a düşürür.
    throw new Error(`[refund] iade parası çıktı ama hareket yazılamadı — sipariş ${orderId}, iade ${String(meta?.['refundId'] ?? '-')}`);
  }
  return { status: 'written', refundedCents: after.deduped ? 0 : leg.amountCents, after };
}

/**
 * Sağlayıcıda mükerrer iadeyi engelleyen anahtar: iadenin sırası ve tutarı anahtara girer. Aynı iadenin tekrarı aynı
 * anahtarla gider ve para iki kez çıkmaz; yeni kısmi iadede sıra değişir.
 */
async function refundIdempotencyKey(db: SupabaseClient, orderId: string, amount: number): Promise<string> {
  const movements = await new MoneyMovementService(db).listByOrder(orderId);
  const sequence = movements.filter((movement) => movement.type === 'order_refund').length;
  return `refund:${orderId}:${sequence}:${Math.round(amount * 100)}`;
}
