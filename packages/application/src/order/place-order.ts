import { OrderService, ReservationService, type Db } from '@lezzet/database';
import { captureError, SOURCES } from '@lezzet/observability';
import type { DeliveryType, Order, OrderCancelReason, PaymentMethod, PreferredLanguage } from '@lezzet/types';
import { clearOrderedLines } from '../cart/settle';
import type { CartBundlePort } from '../cart/read';
import type { CartEntry } from '../cart/cart-types';
import { createCheckoutDraft, type CheckoutDraftInput, type CheckoutDraftOutcome } from './checkout-draft';
import { createCheckoutSession, type CheckoutSessionCreator, type CheckoutSessionOutcome } from './checkout-session';
import type { PaymentGateway } from './payment-gateway';
import { resumeOrderPayment, type ResumePaymentOutcome } from './pending-payment';
import { reserveOrderStock } from './reserve';
import { transitionOrder } from './transition';
import { deferredNotices, type BackgroundRunner, type OrderEffects } from './effects';

/**
 * "Siparişi onayla": taslağı açar, stoğu ayırır, ödemeyi başlatır; tek turda, ki ödemeye gelmeyen müşteri ardında yetim taslak
 * bırakmasın. Kartta sipariş ödeme onayına kadar taslak kalır ve kalemleri sepetten alır; kapıda ve vadeli ödemede burada kesinleşir.
 */

/** Sipariş açılamadı; her ret müşteriden başka bir düzeltme ister, taslağın ret hâlleri olduğu gibi taşınır. */
export type PlaceOrderRejection =
  | Exclude<CheckoutDraftOutcome, { status: 'ok' }>
  /** Sepet okumasıyla ayırma arasında stok düştü; kalem kimliği ve kalan adet taşınır, adı çağıran çözer. */
  | { status: 'insufficient_stock'; variantId: string; available: number }
  /** Ödeme oturumu açılamadı; kartın reddi burada değil, o karar sağlayıcının kendi arayüzünde verilir. */
  | { status: 'payment_unavailable'; reason: 'stale' | 'not_found' | 'provider_unavailable' | 'no_payment_token' }
  /** Taslak açıldı ama kesinleşemedi (sipariş okunamadı ya da geçişi motor reddetti) — iç arıza. */
  | { status: 'order_not_placed' };

export type PlaceOrderOutcome =
  /** Kart yolu: sipariş `draft`, ödeme istemcide tamamlanacak. */
  | { status: 'payment_required'; orderId: string; totalCents: number; deliveryType: DeliveryType; paymentToken: string }
  /**
   * Kapıda ya da vadeli: sipariş açıldı ve kesinleşti. Numara ilk kalıcı durumda doğar, bu yüzden bu dala özgüdür; üretilmediyse
   * `null` kalır, uydurulmaz.
   */
  | { status: 'placed'; orderId: string; totalCents: number; deliveryType: DeliveryType; referenceNo: string | null }
  /** Aynı basışın ödemesi bankada işleniyor: yeni sipariş açılmaz, müşteri o siparişe gider. */
  | {
      status: 'open_payment';
      state: 'processing';
      orderId: string;
      totalCents: number;
      deliveryType: DeliveryType;
      referenceNo: string | null;
    }
  | PlaceOrderRejection;

export interface PlaceOrderInput {
  locale: PreferredLanguage;
  /** Sunucuda çözülmüş müşteri kimliği, istemciden alınmaz: web oturumdan, mobil uç Bearer'dan çözer. */
  customerId: string;
  entries: readonly CartEntry[];
  addressId: string;
  deliveryDate: string | null;
  paymentMethod: PaymentMethod;
  onAccount?: boolean;
  /** Doluysa siparişi personel yazıyor; kural farkları `CheckoutDraftInput.staff`ta, müşterinin sepetine dokunulmaz. */
  staff?: CheckoutDraftInput['staff'];
  /** Bülten izni checkout kutusundan gelir ve baştan işaretsizdir. */
  marketingConsent?: boolean;
  /** Sepetteki kupon kodu; siparişin indirimi bunsuz hesaplanamaz. */
  couponCode?: string | null;
  /** Müşteriye gösterilen sepetin imzası; taslakta karşılaştırılır (`cart_changed`). */
  expectedCartFingerprint?: string | null;
  /** Çift sipariş kalkanı: istemcinin bu basış için ürettiği anahtar; kart yolunda aynı taslağın ödemesine döndürür. */
  idempotencyKey?: string | null;
  /** Sepetin kargo grubundan açılan ikinci sipariş mi. */
  shippingOrder?: boolean;
  /** Kargo servisi ve teslim noktası seçimi; taslak doğrular (`CheckoutDraftInput`). */
  shippingOptionCode?: string | null;
  servicePointId?: string | null;
  /** Gel-al deposu; taslak izni ve depoyu doğrular (`CheckoutDraftInput.pickupWarehouseId`). */
  pickupWarehouseId?: string | null;
  // Komşu davetinin belirteci girdi değil: davet kişiye yazılı, taslak onu müşterinin kaydından okur.
  /** Paket çözümünün kapısı, taslağa olduğu gibi geçer. */
  bundles?: CartBundlePort;
  /** Edinim kaynağı kapısı, taslağa olduğu gibi geçer; web'de çerez okur. */
  onCustomerAcquired?: (customerId: string) => void;
  /** Ödeme oturumunu açan sağlayıcı; `null` "anahtar yok" demektir ve kart siparişi açılmaz. */
  createPaymentSession: CheckoutSessionCreator | null;
  /** Sağlayıcıya soran port; aynı basışın taslağının ödemesini okur, açılamayan ödemeyi iptal eder. */
  paymentGateway?: PaymentGateway | null;
  /** Durum geçişinin ve ödeme netleşmesinin yan etkileri; taslağa dönüşte ödeme kapanırsa müşteri haberi de buradan gider. */
  effects?: OrderEffects;
  /** Yanıttan sonra koşan işlerin kapısı (web'de `after`); verilirse müşteri haberleri ve stok eşiği uyarısı yanıtı bekletmez. */
  runLater?: BackgroundRunner;
  /** Huni ölçümü: sipariş reddedildi; çağıran hangi retlerin sayılacağına kendisi karar verir. */
  onRejected?: (reason: string) => void;
  /** Huni ölçümü: müşteri siparişi verdi (kart yolunda "ödemeye bastı" niyeti de buraya sayılır). */
  onPlaced?: () => void;
}

export async function placeOrder(db: Db, input: PlaceOrderInput): Promise<PlaceOrderOutcome> {
  const effects = input.runLater && input.effects ? deferredNotices(input.effects, input.runLater) : input.effects;
  const deps = { gateway: input.paymentGateway ?? null, effects };
  /** Aynı istek ikinci kez geldiyse ikinci sipariş açılmaz; huni ölçümü de ilk çağrıda sayıldığı için atılmaz. */
  if (input.idempotencyKey) {
    const already = await new OrderService(db).findByIdempotencyKey(input.idempotencyKey, input.customerId);
    // Aynı basışın kart taslağı açıksa aynı ödemeye dönülür: ikinci taslak ikinci ödeme demek olurdu.
    if (already?.status === 'draft' && already.paymentMethod === 'online' && input.paymentMethod === 'online') {
      return resumedOutcome(db, await resumeOrderPayment(db, already, deps), already);
    }
    if (already && already.status !== 'draft' && already.status !== 'cancelled') return placedOf(already);
  }

  const draft = await createCheckoutDraft(db, {
    locale: input.locale,
    customerId: input.customerId,
    entries: input.entries,
    addressId: input.addressId,
    deliveryDate: input.deliveryDate,
    paymentMethod: input.paymentMethod,
    onAccount: input.onAccount,
    // Alanlar tek tek geçer; eklenip de geçirilmeyen alan kapıyı sessizce etkisiz bırakır.
    staff: input.staff,
    couponCode: input.couponCode,
    expectedCartFingerprint: input.expectedCartFingerprint,
    idempotencyKey: input.idempotencyKey,
    shippingOrder: input.shippingOrder,
    shippingOptionCode: input.shippingOptionCode,
    servicePointId: input.servicePointId,
    pickupWarehouseId: input.pickupWarehouseId,
    bundles: input.bundles,
    onCustomerAcquired: input.onCustomerAcquired,
    // Personel siparişi müşterinin sepetine bakmaz.
    requireEntriesInCart: !input.staff,
  });

  if (draft.status !== 'ok') {
    // Depo çözülemedi: veri ya da yapılandırma hatasıdır ve operatörü bekler; müşteri bunu ödeme hatası görmemeli, iz bırakılır.
    if (draft.status === 'warehouse_unresolved') {
      // Kargo göndermeyen işin bölgesi dışı bir arıza değil, cevaptır; iz bırakmaz.
      if (draft.reason === 'outside_zones') return draft;
      // Log'a kimlik yazılır: sebep ve müşteri kimliği teşhise yeter, adres kişisel veridir.
      await captureError(new Error(`checkout: yer çözülemedi (${draft.reason})`), {
        source: SOURCES.applicationOrder,
        context: { reason: draft.reason, customerId: input.customerId },
      });
      // Huniye yazılmaz: bu bizim yapılandırma hatamız, müşterinin sürtünmesi değil.
      return draft;
    }
    input.onRejected?.(draft.status);
    return draft;
  }

  /**
   * Kapıda ya da vadeli: para şimdi geçmez ama sipariş kesinleşir. Ayırma `confirmed` geçişinde ve süresizdir, çünkü düşmesini
   * bekleyeceğimiz bir ödeme penceresi yok.
   */
  if (input.paymentMethod !== 'online') {
    // Kalemler siparişin yazılan satırlarıdır (taslak onları geri okudu): paket açılımı, parti ve fiyat orada, ayırma o hâli ayırmalı.
    const reserved = await reserveOrderStock(db, {
      orderId: draft.orderId,
      order: draft.order,
      items: draft.items,
      expiring: false,
      runLater: input.runLater,
    });
    if (!reserved.ok) {
      // Ayrılamadıysa taslak kapanır, sebep `out_of_stock`; bu yolda para hiç çekilmedi.
      await cancelDraft(db, draft.orderId, 'out_of_stock');
      input.onRejected?.('insufficient_stock');
      return { status: 'insufficient_stock', variantId: reserved.variantId, available: reserved.available };
    }

    const moved = await transitionOrder(db, { orderId: draft.orderId, to: 'confirmed', effects });
    if (moved.status !== 'ok') {
      await releaseOrderStock(db, draft.orderId);
      // Sebep yazılmaz: geçişi motor reddetti ve kümedeki sebeplerin hiçbiri bunu anlatmaz, ekran nötr cümleye düşer.
      await cancelDraft(db, draft.orderId, null);
      return { status: 'order_not_placed' };
    }

    // Sepetten yalnız bu siparişin kalemleri düşer; personel siparişi müşterinin sepetine dokunmaz.
    if (!input.staff) await clearOrderedLines(db, input.customerId, draft.orderId);
    // Huninin son adımı; tutar ve müşteri taşınmaz, olay yalnız "bu oturum siparişle bitti" der.
    input.onPlaced?.();
    // Numara geçişin cevabından: `transitionOrder` onu bu çağrıda üretti.
    return {
      status: 'placed',
      orderId: draft.orderId,
      totalCents: draft.totalCents,
      deliveryType: draft.deliveryType,
      referenceNo: moved.referenceNo,
    };
  }

  /*
    Kart: ödeme açılınca kalemler sepetten siparişe geçer ve ödeme gelmezse geri döner. Ödeme açılamazsa taslak kapanır, sepete
    dokunulmaz; yarım kalan her adımda da taslak kapanır, çünkü yeni deneme eski taslağa dokunmaz.
  */
  let session: CheckoutSessionOutcome;
  try {
    session = await createCheckoutSession(
      db,
      {
        orderId: draft.orderId,
        marketingConsent: input.marketingConsent,
        placed: { order: draft.order, items: draft.items },
        runLater: input.runLater,
        locale: input.locale,
      },
      input.createPaymentSession,
    );
    if (session.status === 'ok' && session.paymentToken && !input.staff) await clearOrderedLines(db, input.customerId, draft.orderId);
  } catch (error) {
    await abandonDraft(db, draft.orderId, deps.gateway, null);
    throw error;
  }
  if (session.status !== 'ok' || !session.paymentToken) {
    await abandonDraft(db, draft.orderId, deps.gateway, session.status === 'insufficient_stock' ? 'out_of_stock' : null);
    // Ödeme oturumu açılamadı: müşteri her şeyi doğru yaptı, kasa açılmadı.
    input.onRejected?.('payment_failed');
    // Yarış hâli bu dalda da doğar, çünkü `createCheckoutSession` ayırmayı kendi içinde yapar; kalemin adı çağıranın işi.
    if (session.status === 'insufficient_stock') {
      return { status: 'insufficient_stock', variantId: session.variantId, available: session.available };
    }
    return {
      status: 'payment_unavailable',
      // Jetonsuz `ok` ayrı adlandırılır: "oturum açılamadı" ile "açıldı ama ödeme başlatılamaz" ayrı arızalardır.
      reason: session.status === 'ok' ? 'no_payment_token' : session.status,
    };
  }
  // Kart yolunun huni adımı: müşteri ödeme düğmesine bastı; huni niyeti ölçer, muhasebeyi değil.
  input.onPlaced?.();
  return {
    status: 'payment_required',
    orderId: draft.orderId,
    totalCents: draft.totalCents,
    deliveryType: draft.deliveryType,
    paymentToken: session.paymentToken,
  };
}

function placedOf(order: Order): PlaceOrderOutcome {
  return {
    status: 'placed',
    orderId: order.id,
    totalCents: order.orderedTotalCents,
    deliveryType: order.deliveryType,
    referenceNo: order.referenceNo,
  };
}

/** Aynı basışın taslağına dönüşün cevabı; ödemesi kapanmış taslağın kalemleri sepete döndü, ekran sepeti yeniden okur. */
async function resumedOutcome(db: Db, resumed: ResumePaymentOutcome, order: Order): Promise<PlaceOrderOutcome> {
  switch (resumed.status) {
    case 'payment_required':
      return resumed;
    // Numara onayla doğdu; satır yeniden okunur.
    case 'paid':
      return placedOf((await new OrderService(db).getById(order.id)) ?? order);
    case 'processing':
      return {
        status: 'open_payment',
        state: 'processing',
        orderId: order.id,
        totalCents: order.orderedTotalCents,
        deliveryType: order.deliveryType,
        referenceNo: order.referenceNo,
      };
    case 'closed':
    case 'not_found':
      return { status: 'cart_changed' };
    case 'provider_unavailable':
      return { status: 'payment_unavailable', reason: 'provider_unavailable' };
  }
}

/**
 * Ödemesi açılamayan taslak kapanır: sağlayıcıda açılmış ödeme varsa iptal edilir, mal bırakılır. İptal düşerse iz bırakılır ve
 * kapanış sürer; ödeme sonradan geçerse onay yolu iptal edilmiş siparişin parasını iade eder.
 */
async function abandonDraft(db: Db, orderId: string, gateway: PaymentGateway | null, reason: OrderCancelReason | null): Promise<void> {
  const paymentRef = (await new OrderService(db).getById(orderId))?.paymentRef ?? null;
  if (gateway && paymentRef) {
    try {
      await gateway.cancel(paymentRef);
    } catch (error) {
      await captureError(error, { source: SOURCES.applicationOrder, context: { orderId, step: 'cancel_abandoned_payment' } });
    }
  }
  await releaseOrderStock(db, orderId);
  await cancelDraft(db, orderId, reason);
}

/** Ayrılamayan siparişin taslağı kapatılır; sebep zorunludur, çünkü onay ekranı cümlesini sebebe göre kurar. */
async function cancelDraft(db: Db, orderId: string, reason: OrderCancelReason | null): Promise<void> {
  await new OrderService(db).cancel(orderId, 'draft', null, reason);
}

async function releaseOrderStock(db: Db, orderId: string): Promise<void> {
  await new ReservationService(db).releaseByOrder(orderId);
}
