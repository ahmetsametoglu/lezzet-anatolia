import { AccountService, MoneyMovementService, OrderService } from '@lezzet/database';
import { canTransition } from '@lezzet/domain-core';
import type { FulfillmentAdjustment, OrderCancelReason, OrderStatus, PaymentStatus, ReturnDisposition } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cancelOrderShipment, type ShipmentCancelOutcome } from '../shipping/cancel';
import { notifyExceptionEffect, notifyStatusEffect, providerRefunder, type OrderEffects } from './effects';
import { recordOrderRefund, syncOrderPaymentStatus } from './payment';

/**
 * Kısmi karşılama (07.8) ve iptal/iade (07.9) kapısı (terfi 21.10 — kaynağı
 * `apps/web/lib/order/refund.ts`). DOMAIN §8, ORDER_LIFECYCLE. Web kopyası geçiş köprüsüdür.
 *
 * ── NEDEN `courier/`İN İÇİNDE DEĞİL ──────────────────────────────────────────
 * Kapıda eksik kalem işaretlemek kurye işidir ama **sipariş düzeltmesi kurye işi değildir**: aynı
 * kapıyı operasyon sipariş detayı (iptal, teslim sonrası iade) ve şikâyet çözümü de çağırıyor
 * (ölçüldü: `operations/orders/actions.ts`, `lib/ticket/write.ts`, `lib/order/stripe-webhook.ts`).
 * `courier/refund.ts` deseydik, kurye şeridi olmayan üç çağıran kurye klasöründen ithal ederdi.
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
  /** Fiilen yazılan iade tutarı (**cent**). 0 = iade borcu yoktu **ya da** yazılamadı (`refundBlocked`). */
  refundedAmountCents: number;
  paymentStatus: PaymentStatus;
  /** Kapıda/vadeli tahsil edilmeyi bekleyen kalan (**cent**) — kısmi karşılamada düşmüş hâli. */
  amountToCollectCents: number;
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
 * `provider_unavailable` — sağlayıcı portu kayıtlı değil ya da anahtarı yok (yerel ortam).
 * `provider_failed` — sağlayıcı reddetti ya da ulaşılamadı.
 */
/**
 * `split_payment` — para BİRDEN ÇOK hesaba girmiş (ör. kartla kapora + kapıda nakit). İade tek
 * hesaptan yazılamaz: parayı hiç almamış hesabın bakiyesi sessizce yanlış olurdu. Operatör
 * `refundAccountId` ile hesap başına yazabilir; otomatik bölme yapılmıyor (BEKLEYEN(21.266)).
 */
export type RefundBlockReason =
  | 'no_account'
  | 'provider_ref_missing'
  | 'provider_unavailable'
  | 'provider_failed'
  | 'split_payment';

export type AdjustOutcome =
  | ({ status: 'ok'; restockedQty: number; discardedQty: number; releasedQty: number } & RefundOutcome)
  /**
   * Sipariş çağıranın depo kapsamı dışında (D6). **Yetki kararı DEĞİL, kapsam kararı:** kimliğin
   * doğrulanması ve rolün okunması uç katmanın işidir (guard); burada yalnız "bu siparişin deposu
   * verilen kümede mi" sorusu var — ve bu bir İŞ kuralıdır, taşımanın değil.
   */
  | { status: 'forbidden'; reason: 'out_of_scope' }
  /** Sipariş artık düzeltilebilir bir durumda değil (iptal edilmiş). */
  | { status: 'stale'; currentStatus: OrderStatus }
  /**
   * Kalemin akıbeti ZATEN yazılmış ve gelen istek BAŞKA bir akıbet söylüyor — çağıran bayat bir
   * ekrandan yazıyor (kusur, ölçüldü 04.09). `stale`den ayrı tutuluyor: orada sipariş değişmiştir,
   * burada KALEM karara bağlanmıştır ve ekranın yapması gereken şey farklıdır (tazele, yazılı hâli
   * göster). Hiçbir satır yazılmaz — yarısı yazılmış bir düzeltme en kötü sonuçtur.
   */
  | { status: 'already_marked'; orderItemId: string | null; currentDisposition: ReturnDisposition | null }
  | { status: 'not_found' };

export type CancelOutcome =
  /**
   * `shipment` (21.265) — iptalin KARGO yarısı. `no_shipment` çoğu iptalde normaldir (rota
   * siparişi ya da hiç duyurulmamış kargo); `provider_failed`/`provider_unavailable` ise
   * operatörün görmesi gereken bir hâl: yerel gönderi kapandı ama **etiket taşıyıcıda ayakta
   * olabilir**. İptali durdurmuyor, çünkü sipariş iptali kesin bir olgu.
   */
  | ({ status: 'ok'; releasedQty: number; shipment: ShipmentCancelOutcome } & RefundOutcome)
  | { status: 'forbidden'; reason: 'same_status' | 'terminal' | 'not_allowed' | 'out_of_scope' }
  | { status: 'stale'; currentStatus: OrderStatus }
  | { status: 'not_found' };

export interface RefundOptions {
  /** İadenin çıkacağı hesap — verilmezse paranın girdiği hesaptan türetilir. */
  refundAccountId?: string | null;
  /**
   * Tutarı elle vermek. Tek gerçek kullanımı **jest iadesidir** (`goodwill`): mal müşteride kaldığı
   * için karşılanan tutar düşmez, borç türetilemez — tutarı operatör söyler (DOMAIN §8).
   */
  refundAmountCents?: number | null;
  valueDate?: string;
  description?: string | null;
  /**
   * Sağlayıcıya iade portu (07.11) + müşteri haberi portu (14.5). Kayıtlı değillerse davranış
   * `effects.ts`te yazılı: haber atlanır ve uyarılır, sağlayıcı `provider_unavailable` döner.
   */
  effects?: OrderEffects;
}

/**
 * **Depo kapsamı** (D6 hazırlığı — 21.10 · 21.11).
 *
 * `undefined` = kapsam sorulmuyor; bugünkü web köprüsünün davranışı budur (ekranın `requireAdmin`
 * guard'ı zaten kapıda duruyor) ve **değişmedi**. Bir kimlik listesi verilirse siparişin deposu o
 * kümede olmak zorundadır.
 *
 * Neden şimdiden imzada: DOMAIN §8 "akıbet kararı depocunundur" diyor ama kapı bugün yalnız
 * yöneticiye açık. Mobil depo ucu (21.11) açıldığında kapsam parametresi olmasaydı ya guard uçta
 * ikinci kez yazılırdı ya da depocu BÜTÜN siparişlere erişirdi — ikincisi depo değişmezinin
 * (CLAUDE §1) sessiz ihlali olurdu.
 */
export type WarehouseScope = readonly string[] | undefined;

/** Kapsam süzgeci — kapsam verilmemişse soru sorulmaz (bugünkü davranış). */
function outOfScope(orderWarehouseId: string, scope: WarehouseScope): boolean {
  return scope !== undefined && !scope.includes(orderWarehouseId);
}

/**
 * **Kısmi karşılama / kalem iadesi** (07.8). Eksik çıkan ya da geri gelen adet yazılır; ardından
 * ödeme durumu yeniden türetilir ve iade borcu varsa hareket yazılır.
 *
 * Sıra önemlidir: önce mal, sonra para. Tersi olsaydı iade yazılıp düzeltme başarısız olduğunda
 * "parası iade edilmiş ama hâlâ karşılanmış görünen" sipariş kalırdı.
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
    return {
      status: 'already_marked',
      orderItemId: result.orderItemId ?? null,
      currentDisposition: result.currentDisposition ?? null,
    };
  }
  if (!result.ok) return { status: 'stale', currentStatus: result.currentStatus };

  const settled = await settleRefund(db, orderId, opts);
  if (!settled) return { status: 'not_found' };

  // Haberin hangisi olduğunu malın nerede olduğu belirler: mal daha çıkmadıysa bu bir EKSİK
  // KARŞILANMA (müşteri kapıda sürprizle karşılaşmasın), çıktıysa bir İADE (para geri döndü).
  const delivered = result.currentStatus === 'delivered' || result.currentStatus === 'completed';
  await notifyExceptionEffect(opts.effects, orderId, delivered ? 'order_refunded' : 'order_shortfall', {
    refundedAmountCents: settled.refundedAmountCents,
  });

  return {
    status: 'ok',
    restockedQty: result.restockedQty ?? 0,
    discardedQty: result.discardedQty ?? 0,
    releasedQty: result.releasedQty ?? 0,
    ...settled,
  };
}

/**
 * **KAPIDA TEK YAZIM: düzeltme + teslim** (21.271 · kurye denetimi bulgu 8).
 *
 * ── ÖLÇÜLEN AÇIK ────────────────────────────────────────────────────────────
 * Kurye kapısı ikisini ARDIŞIK iki çağrı olarak yapıyordu: önce `adjustFulfillment`, sonra
 * `deliverOrder`. İkincisi `stale` dönerse (araya gün kapanışı ya da başka bir cihaz girmişse)
 * BİRİNCİSİ GERİ ALINMIYORDU — karşılanan adet düşmüş, rezervasyon serbest kalmış ve müşteriye
 * *"siparişiniz eksik karşılandı"* haberi gitmiş, ama teslim yazılmamış oluyordu. Ekran kuryeye
 * "olmadı" diyordu; oysa yarısı olmuştu ve gönderilen haber geri alınamıyordu.
 *
 * Para bu arızada güvendeydi ve sebebi tesadüf değil: `settleRefund` borcu her seferinde motordan
 * YENİDEN türetiyor, yazılmış iadeyi ikinci kez yazmıyor. Yani üç izden ikisi (mal, haber) kalıcı,
 * biri (para) kendiliğinden bağışıktı.
 *
 * ── SIRA DEĞİŞTİRİLEREK ÇÖZÜLEMEZDİ ─────────────────────────────────────────
 * Düzeltmenin ANLAMI malın fiili stoktan düşüp düşmediğine bağlı (`0020` künyesi): teslimden ÖNCE
 * düzeltmek "rezervasyonu küçült"tür, SONRA düzeltmek "düşmüş stoğu geri koy". İki farklı iş —
 * yani sıra bir dikkatsizlik değil, kısıt. Geriye tek doğru çare kaldı: ikisini BÖLÜNMEZ yapmak.
 *
 * ── NE İÇERİDE, NE DIŞARIDA ────────────────────────────────────────────────
 * Transaction'ın İÇİNDE yalnız DB yazımları var (RPC `deliver_order_with_adjustments`). DIŞINDA
 * kalan iki şeyin de sebebi aynı: geri alınamazlar.
 *   · **Para** — kartlı iade bir DIŞ çağrıdır; transaction'a alınamaz ve alınsaydı sağlayıcıya
 *     gidip dönmeyen bir çağrı bütün satırı kilitli tutardı.
 *   · **Haber** — müşteriye giden mesaj geri alınamaz, o yüzden yazım KESİNLEŞTİKTEN sonra
 *     gönderilir. Arızanın en görünür yarısı buydu.
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
  | { status: 'already_marked'; orderItemId: string | null; currentDisposition: ReturnDisposition | null }
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
      return {
        status: 'already_marked',
        orderItemId: written.orderItemId ?? null,
        currentDisposition: written.currentDisposition ?? null,
      };
    }
    return { status: 'stale', currentStatus: written.currentStatus };
  }

  /* Para YAZIMDAN SONRA: burada düşse bile mal ve teslim doğru yazılmış olur ve borç açıkta
     görünür — tersi (para yazılıp teslim yazılmaması) elle düzeltilecek bir hâl olurdu. */
  const settled = await settleRefund(db, orderId, opts);
  if (!settled) return { status: 'not_found' };

  /* İKİ HABER, İKİ AYRI OLAY ve sırası anlamlı: önce "yolda olan geldi", sonra "ama eksik geldi".
     Düzeltme yoksa ikincisi hiç gönderilmez — olmayan bir eksikliği duyurmak, müşteriyi kendi
     siparişinden şüphelendirirdi. Akıbet haberi `order_refunded` DEĞİL `order_shortfall`: mal
     kapıdan hiç girmedi, iade edilen bir şey yok — geri çevrilen bir şey var. */
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
 * **İptal** (07.9). Ayrılmış mal geri bırakılır ve tahsil edilmiş para varsa TAMAMI iade edilir —
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

  /*
    GÖNDERİ DE KAPANIR (21.265 · iptal ön çalışması 05.09). `cancel_order` kargo tarafına hiç
    dokunmuyordu ve `ShippingRateProvider.cancel` repoda tanımlı olmasına rağmen hiçbir yerden
    çağrılmıyordu: iptalde müşteriye kargo bedeli iade ediliyor ama ETİKET TAŞIYICIDA AYAKTA
    kalıyordu.

    SONUCU DÖNDÜRÜLÜYOR ama iptali DURDURMUYOR: sipariş iptali kesin bir olgu, gönderinin
    kapanamaması onu geri almaz. Sessiz de geçmiyor — sağlayıcı düştüyse ya da anahtar yoksa
    `shipment` alanı bunu söylüyor ve operatör "etiket hâlâ ayakta olabilir" cümlesini okuyabiliyor.
    Künyenin tamamı `shipping/cancel.ts`te.
  */
  const shipment = await cancelOrderShipment(db, { orderId, actorId: opts.actorId });

  await notifyExceptionEffect(opts.effects, orderId, 'order_cancelled', { refundedAmountCents: settled.refundedAmountCents });

  return { status: 'ok', releasedQty: result.releasedQty ?? 0, shipment, ...settled };
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
  db: SupabaseClient,
  orderId: string,
  opts: RefundOptions = {},
): Promise<({ status: 'ok' } & RefundOutcome) | { status: 'not_found' }> {
  if (!(await new OrderService(db).getById(orderId))) return { status: 'not_found' };

  const settled = await settleRefund(db, orderId, opts);
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
async function settleRefund(db: SupabaseClient, orderId: string, opts: RefundOptions): Promise<RefundOutcome | null> {
  const before = await syncOrderPaymentStatus(db, orderId);
  if (before.status !== 'ok') return null;

  // Motor zaten cent veriyordu; `/ 100` ile euro'ya inip sonra tekrar `* 100` ile çıkmak, aynı
  // sayının iki kez çevrilmesiydi — birim karışıklığının tipik izi (02.9).
  const dueCents = opts.refundAmountCents ?? before.derivation.refundDueCents;
  const unsettled = (refundBlocked?: RefundBlockReason): RefundOutcome => ({
    refundedAmountCents: 0,
    paymentStatus: before.paymentStatus,
    amountToCollectCents: before.derivation.amountToCollectCents,
    ...(refundBlocked ? { refundBlocked } : {}),
  });

  if (dueCents <= 0) return unsettled();

  const payment = await lastPayment(db, orderId);
  /*
    HESAP "SON HAREKET" DEĞİL, PARANIN GERÇEKTEN DURDUĞU YER (21.265 · ölçüldü 05.09).

    Eski çözüm `lastPayment`ın hesabıydı ve tek hesaplı siparişte doğru cevap veriyordu. Para İKİ
    hesaba bölünmüşse (kartla kapora + kapıda nakit — üçü de `order_payment` yazıyor) iadenin
    tamamı SON hareketin hesabından çıkıyordu: para hiç girmediği kasadan düşüyor ve o hesabın
    bakiyesi sessizce yanlış oluyordu.

    Bölünmüş hâlde OTOMATİK BÖLME YAPILMIYOR ve bu bilinçli bir sınır: orantılı bölme hesap başına
    ayrı sağlayıcı çağrısı, ayrı tekillik anahtarı ve "ikincisi düşerse birincisi yazılmış kalır"
    hâli demek — geri alınamayan yarım bir iade, bugünkü arızadan beter olurdu. Bunun yerine dosyanın
    kendi ilkesi uygulanıyor (aşağıdaki `no_account` künyesi): **sessizce yanlış hesaba yazmaktansa
    borcu açıkta bırak.** Operatör `refundAccountId` ile hesap başına yazabiliyor.
  */
  const accountId = opts.refundAccountId ?? (await soleFundedAccount(db, orderId));
  if (accountId === 'split') return unsettled('split_payment');
  // Hesap türetilemiyorsa iade yazılamaz ama düzeltme geçerlidir: borç `amountToCollect`'in negatifi
  // olarak zaten görünür. Sessizce yanlış hesaba yazmaktansa borcu açıkta bırakmak doğrudur.
  if (!accountId) return unsettled('no_account');

  // Sağlayıcı çağrısı hesabın TÜRÜNE bağlıdır, siparişin ödeme yöntemine değil. Operatör kartla
  // ödenmiş bir siparişi kasadan nakit iade etmeyi seçebilir (`refundAccountId`) — o zaman dönülecek
  // bir sağlayıcı yoktur ve olmamalıdır.
  const account = await new AccountService(db).getById(accountId);
  let refundMeta: Record<string, unknown> | null = null;

  if (account?.type === 'provider') {
    const providerRef = typeof payment?.meta?.['providerRef'] === 'string' ? payment.meta['providerRef'] : null;
    // Künye yoksa hangi ödemenin üzerinden dönüleceği bilinmiyor. Tahmin edilemez: yanlış niyete
    // yapılan bir iade başka bir müşterinin parasını geri gönderir.
    if (!providerRef) return unsettled('provider_ref_missing');

    const result = await providerRefunder(opts.effects)({
      paymentIntentId: providerRef,
      amountCents: dueCents,
      idempotencyKey: await refundIdempotencyKey(db, orderId, dueCents),
    });
    if (result.status === 'unavailable') return unsettled('provider_unavailable');
    if (result.status === 'failed') return unsettled('provider_failed');

    refundMeta = { providerRef, refundId: result.refundId };
  }

  const after = await recordOrderRefund(db, {
    orderId,
    accountId,
    amountCents: dueCents,
    valueDate: opts.valueDate,
    description: opts.description ?? 'Sipariş iadesi',
    meta: refundMeta,
  });
  if (after.status !== 'ok') {
    // Para SAĞLAYICIDAN ÇIKTI ama deftere geçmedi — sessiz kalınamaz. Hangi iade olduğunu ancak bu
    // satır söyleyebilir; çağıranın hata funnel'ı bunu `error_log`'a düşürür (18.5).
    throw new Error(
      `[refund] sağlayıcı iadesi yapıldı ama hareket yazılamadı — sipariş ${orderId}, iade ${String(refundMeta?.['refundId'] ?? '-')}`,
    );
  }

  return {
    refundedAmountCents: dueCents,
    paymentStatus: after.paymentStatus,
    amountToCollectCents: after.derivation.amountToCollectCents,
  };
}

/**
 * **Paranın NET olarak durduğu tek hesap** (21.265) — yoksa `null`, birden çoksa `'split'`.
 *
 * Net: tahsilat − iade. Kısmen iade edilmiş bir hesap sıfıra inerse artık "parayı tutan hesap"
 * değildir ve listeye girmemeli; yoksa ikinci bir iade oraya yazılırdı.
 */
async function soleFundedAccount(db: SupabaseClient, orderId: string): Promise<string | null | 'split'> {
  const movements = await new MoneyMovementService(db).listByOrder(orderId);
  const net = new Map<string, number>();
  for (const m of movements) {
    if (m.type !== 'order_payment' && m.type !== 'order_refund') continue;
    const isaret = m.type === 'order_payment' ? 1 : -1;
    net.set(m.accountId, (net.get(m.accountId) ?? 0) + isaret * m.amountCents);
  }
  const dolu = [...net.entries()].filter(([, tutar]) => tutar > 0).map(([id]) => id);
  if (dolu.length === 0) return null;
  return dolu.length === 1 ? dolu[0]! : 'split';
}

/** Para hangi hesaba girdiyse oradan çıkar — son tahsilat hareketi (künyesi de ondan okunur). */
async function lastPayment(db: SupabaseClient, orderId: string) {
  const movements = await new MoneyMovementService(db).listByOrder(orderId);
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
async function refundIdempotencyKey(db: SupabaseClient, orderId: string, amount: number): Promise<string> {
  const movements = await new MoneyMovementService(db).listByOrder(orderId);
  const sequence = movements.filter((movement) => movement.type === 'order_refund').length;
  return `refund:${orderId}:${sequence}:${Math.round(amount * 100)}`;
}
