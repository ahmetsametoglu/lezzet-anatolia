import { AccountService, MoneyMovementService, OrderService, serviceDb } from '@lezzet/database';
import { canTransition } from '@lezzet/domain-core';
import type { FulfillmentAdjustment, OrderStatus, PaymentStatus } from '@lezzet/types';
import { recordOrderRefund, syncOrderPaymentStatus } from '../money/order-payment';
import { notifyOrderException } from './notify';
import { stripeRefunder, type ProviderRefunder } from './provider-refund';

/**
 * Kısmi karşılama (07.8) ve iptal/iade (07.9) kapısı — **uygulama katmanı orkestrasyonu**.
 * DOMAIN §8, ORDER_LIFECYCLE.
 *
 * Üç katman birleşir: malın gerçeğini veritabanı yazar (`adjust_fulfillment` / `cancel_order`,
 * bölünemez), iade borcunu motor TÜRETİR (`derivePaymentStatus`), hareketi para kapısı yazar (12.2).
 *
 * **"Peşin mi, kapıda mı" diye dallanılmaz.** İade borcu = net tahsilat − karşılanan tutar; bu sayı
 * peşin ödenmişse kendiliğinden pozitif çıkar (fark iade edilir), kapıda ödenecekse sıfır çıkar
 * (yalnız tahsil edilecek tutar düşer). Tek yol, iki sonuç — ödeme yöntemine bakan bir `if` yok.
 *
 * İadenin gideceği hesap da SORULMAZ, türetilir: para hangi hesaba girdiyse oradan çıkar (son
 * tahsilat hareketi). Çağıran isterse başka hesap verebilir (Stripe'tan tahsil, nakit iade).
 */

interface RefundOutcome {
  /** Fiilen yazılan iade tutarı (€). 0 = iade borcu yoktu **ya da** yazılamadı (`refundBlocked`). */
  refundedAmount: number;
  paymentStatus: PaymentStatus;
  /** Kapıda/vadeli tahsil edilmeyi bekleyen kalan (€) — kısmi karşılamada düşmüş hâli. */
  amountToCollect: number;
  /**
   * Borç vardı ama iade YAZILAMADI — sebebiyle. Yokluğu "iade tamam" demektir.
   *
   * Sessizce sıfır dönmek en tehlikeli seçenekti: operatör iadeyi yapılmış sanır, müşteri parasını
   * bekler. Borç zaten `amountToCollect`'in negatifinde görünür; bu alan onu **sebebiyle** söyler.
   */
  refundBlocked?: RefundBlockReason;
}

/**
 * `no_account` — paranın hangi hesaba girdiği türetilemedi (hiç tahsilat yok).
 * `provider_ref_missing` — sağlayıcı hesabına yazılmış ama ödeme künyesi tutulmamış bir tahsilat;
 *   hangi ödemenin üzerinden dönüleceği bilinmiyor.
 * `provider_unavailable` — sağlayıcı anahtarı yok (yerel ortam).
 * `provider_failed` — sağlayıcı reddetti ya da ulaşılamadı.
 */
export type RefundBlockReason = 'no_account' | 'provider_ref_missing' | 'provider_unavailable' | 'provider_failed';

type AdjustOutcome =
  | ({ status: 'ok'; restockedQty: number; discardedQty: number; releasedQty: number } & RefundOutcome)
  /** Sipariş artık düzeltilebilir bir durumda değil (iptal edilmiş). */
  | { status: 'stale'; currentStatus: OrderStatus }
  | { status: 'not_found' };

type CancelOutcome =
  | ({ status: 'ok'; releasedQty: number } & RefundOutcome)
  | { status: 'forbidden'; reason: 'same_status' | 'terminal' | 'not_allowed' }
  | { status: 'stale'; currentStatus: OrderStatus }
  | { status: 'not_found' };

interface RefundOptions {
  /** İadenin çıkacağı hesap — verilmezse paranın girdiği hesaptan türetilir. */
  refundAccountId?: string | null;
  /**
   * Tutarı elle vermek. Tek gerçek kullanımı **jest iadesidir** (`goodwill`): mal müşteride kaldığı
   * için karşılanan tutar düşmez, borç türetilemez — tutarı operatör söyler (DOMAIN §8).
   */
  refundAmount?: number | null;
  valueDate?: string;
  description?: string | null;
  /**
   * Sağlayıcıya iade portu (07.11). Varsayılanı gerçek Stripe çağrısıdır; test sahte üreteç verir —
   * "önce sağlayıcı, sonra hareket" sırası ağa çıkmadan sınanabilsin diye.
   */
  refunder?: ProviderRefunder;
}

/**
 * **Kısmi karşılama / kalem iadesi** (07.8). Eksik çıkan ya da geri gelen adet yazılır; ardından
 * ödeme durumu yeniden türetilir ve iade borcu varsa hareket yazılır.
 *
 * Sıra önemlidir: önce mal, sonra para. Tersi olsaydı iade yazılıp düzeltme başarısız olduğunda
 * "parası iade edilmiş ama hâlâ karşılanmış görünen" sipariş kalırdı.
 */
export async function adjustFulfillment(
  orderId: string,
  lines: readonly FulfillmentAdjustment[],
  opts: RefundOptions & { actorId?: string | null } = {},
): Promise<AdjustOutcome> {
  const orders = new OrderService(serviceDb());
  if (!(await orders.getById(orderId))) return { status: 'not_found' };

  const result = await orders.adjustFulfillment(orderId, lines, opts.actorId);
  if (!result.ok) return { status: 'stale', currentStatus: result.currentStatus };

  const settled = await settleRefund(orderId, opts);
  if (!settled) return { status: 'not_found' };

  // Haberin hangisi olduğunu malın nerede olduğu belirler: mal daha çıkmadıysa bu bir EKSİK
  // KARŞILANMA (müşteri kapıda sürprizle karşılaşmasın), çıktıysa bir İADE (para geri döndü).
  const delivered = result.currentStatus === 'delivered' || result.currentStatus === 'completed';
  await notifyOrderException(orderId, delivered ? 'order_refunded' : 'order_shortfall', { refundedAmount: settled.refundedAmount });

  return {
    status: 'ok',
    restockedQty: result.restockedQty ?? 0,
    discardedQty: result.discardedQty ?? 0,
    releasedQty: result.releasedQty ?? 0,
    ...settled,
  };
}

/**
 * **İptal** (07.9). Ayrılmış mal geri bırakılır ve tahsil edilmiş para varsa TAMAMI iade edilir —
 * iptal edilen siparişte karşılanan tutar 0'dır (ORDER_LIFECYCLE), gerisi türetimden gelir.
 */
export async function cancelOrder(
  orderId: string,
  opts: RefundOptions & { actorId?: string | null } = {},
): Promise<CancelOutcome> {
  const orders = new OrderService(serviceDb());

  const order = await orders.getById(orderId);
  if (!order) return { status: 'not_found' };

  // Kural motorun: teslim edilmiş sipariş iptal edilmez, iade yoluna girer (`returned`).
  const verdict = canTransition(order.status, 'cancelled');
  if (!verdict.allowed) return { status: 'forbidden', reason: verdict.reason };

  const result = await orders.cancel(orderId, order.status, opts.actorId);
  if (!result.ok) return { status: 'stale', currentStatus: result.currentStatus };

  const settled = await settleRefund(orderId, { description: 'Sipariş iptali — iade', ...opts });
  if (!settled) return { status: 'not_found' };

  await notifyOrderException(orderId, 'order_cancelled', { refundedAmount: settled.refundedAmount });

  return { status: 'ok', releasedQty: result.releasedQty ?? 0, ...settled };
}

/**
 * **İadeyi tek başına yeniden dener** (07.11).
 *
 * Neden ayrı bir yol: sağlayıcı çağrısı düştüğünde düzeltme/iptal ZATEN yazılmıştır ve geri
 * alınmaz — `cancelOrder` ikinci kez koşamaz (sipariş artık iptal), `adjustFulfillment` koşarsa
 * adetleri ikinci kez uygular. Yani "tekrar deneyin" demenin karşılığı olan bir kapı yoksa uyarı
 * boş bir cümledir; operatörün elinde sağlayıcı panelinden başka bir şey kalmaz.
 *
 * Borç yeniden TÜRETİLİR, saklanmaz: aradan geçen sürede tahsilat ya da başka bir düzeltme olmuş
 * olabilir. Borç kalmadıysa iade de yazılmaz — bu bir hata değil, cevabın kendisidir.
 */
export async function retryRefund(
  orderId: string,
  opts: RefundOptions = {},
): Promise<({ status: 'ok' } & RefundOutcome) | { status: 'not_found' }> {
  if (!(await new OrderService(serviceDb()).getById(orderId))) return { status: 'not_found' };

  const settled = await settleRefund(orderId, opts);
  if (!settled) return { status: 'not_found' };
  return { status: 'ok', ...settled };
}

/**
 * Ödeme durumunu tazeler ve borç varsa iadeyi yazar. Borç türetimden gelir; tek istisnası çağıranın
 * verdiği açık tutardır (jest iadesi).
 *
 * İade hareketi yazıldığında durum bir kez daha türetilir (para kapısı yapar) — bu yüzden dönen
 * değer hareketten SONRAKİ hâldir, öncekinden değil.
 *
 * **SIRA TERSİNE ÇEVRİLEMEZ (07.11): önce sağlayıcı çağrısı, sonra hareket.** Kartla ödenmiş bir
 * siparişte para gerçekten dönmeden hareket yazılırsa defter kapanmış görünür, müşteri parasını
 * beklemeye devam eder — hatanın en sinsi hâli, çünkü hiçbir ekranda iz bırakmaz. Çağrı düşerse
 * hareket HİÇ yazılmaz ve sebep `refundBlocked` ile çağırana söylenir.
 */
async function settleRefund(orderId: string, opts: RefundOptions): Promise<RefundOutcome | null> {
  const before = await syncOrderPaymentStatus(orderId);
  if (before.status !== 'ok') return null;

  const dueAmount = opts.refundAmount ?? before.derivation.refundDueCents / 100;
  const unsettled = (refundBlocked?: RefundBlockReason): RefundOutcome => ({
    refundedAmount: 0,
    paymentStatus: before.paymentStatus,
    amountToCollect: before.derivation.amountToCollectCents / 100,
    ...(refundBlocked ? { refundBlocked } : {}),
  });

  if (dueAmount <= 0) return unsettled();

  const payment = await lastPayment(orderId);
  const accountId = opts.refundAccountId ?? payment?.accountId ?? null;
  // Hesap türetilemiyorsa iade yazılamaz ama düzeltme geçerlidir: borç `amountToCollect`'in negatifi
  // olarak zaten görünür. Sessizce yanlış hesaba yazmaktansa borcu açıkta bırakmak doğrudur.
  if (!accountId) return unsettled('no_account');

  // Sağlayıcı çağrısı hesabın TÜRÜNE bağlıdır, siparişin ödeme yöntemine değil. Operatör kartla
  // ödenmiş bir siparişi kasadan nakit iade etmeyi seçebilir (`refundAccountId`) — o zaman dönülecek
  // bir sağlayıcı yoktur ve olmamalıdır.
  const account = await new AccountService(serviceDb()).getById(accountId);
  let refundMeta: Record<string, unknown> | null = null;

  if (account?.type === 'provider') {
    const providerRef = typeof payment?.meta?.providerRef === 'string' ? payment.meta.providerRef : null;
    // Künye yoksa hangi ödemenin üzerinden dönüleceği bilinmiyor. Tahmin edilemez: yanlış niyete
    // yapılan bir iade başka bir müşterinin parasını geri gönderir.
    if (!providerRef) return unsettled('provider_ref_missing');

    const refunder = opts.refunder ?? stripeRefunder();
    const result = await refunder({
      paymentIntentId: providerRef,
      amountCents: Math.round(dueAmount * 100),
      idempotencyKey: await refundIdempotencyKey(orderId, dueAmount),
    });
    if (result.status === 'unavailable') return unsettled('provider_unavailable');
    if (result.status === 'failed') return unsettled('provider_failed');

    refundMeta = { providerRef, refundId: result.refundId };
  }

  const after = await recordOrderRefund({
    orderId,
    accountId,
    amount: dueAmount,
    valueDate: opts.valueDate,
    description: opts.description ?? 'Sipariş iadesi',
    meta: refundMeta,
  });
  if (after.status !== 'ok') {
    // Para SAĞLAYICIDAN ÇIKTI ama deftere geçmedi — sessiz kalınamaz. Hangi iade olduğunu ancak bu
    // satır söyleyebilir; `getErrorMessage` funnel'ı bunu `error_log`'a düşürür (18.5).
    throw new Error(
      `[refund] sağlayıcı iadesi yapıldı ama hareket yazılamadı — sipariş ${orderId}, iade ${String(refundMeta?.refundId ?? '-')}`,
    );
  }

  return {
    refundedAmount: dueAmount,
    paymentStatus: after.paymentStatus,
    amountToCollect: after.derivation.amountToCollectCents / 100,
  };
}

/** Para hangi hesaba girdiyse oradan çıkar — son tahsilat hareketi (künyesi de ondan okunur). */
async function lastPayment(orderId: string) {
  const movements = await new MoneyMovementService(serviceDb()).listByOrder(orderId);
  return movements.filter((movement) => movement.type === 'order_payment').at(-1) ?? null;
}

/**
 * Sağlayıcı tarafında mükerrer iadeyi engelleyen anahtar.
 *
 * Sıradaki iadenin **kaçıncı** olduğu ve **tutarı** anahtara girer. Aynı iadenin tekrar denenmesi
 * (çağrı geçti ama hareket yazılamadı, operatör yeniden bastı) aynı anahtarla gider ve Stripe ilk
 * iadenin sonucunu döner — para iki kez çıkmaz. Gerçekten yeni bir kısmi iade ise sıra numarası
 * değişmiştir, yeni anahtar üretilir.
 */
async function refundIdempotencyKey(orderId: string, amount: number): Promise<string> {
  const movements = await new MoneyMovementService(serviceDb()).listByOrder(orderId);
  const sequence = movements.filter((movement) => movement.type === 'order_refund').length;
  return `refund:${orderId}:${sequence}:${Math.round(amount * 100)}`;
}
