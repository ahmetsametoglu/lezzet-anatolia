import { OrderService, ReservationService, type Db } from '@lezzet/database';
import { captureError, SOURCES } from '@lezzet/observability';
import type { DeliveryType, OrderCancelReason, PaymentMethod, PreferredLanguage } from '@lezzet/types';
import { clearOrderedLines } from '../cart/settle';
import type { CartBundlePort } from '../cart/read';
import type { CartEntry } from '../cart/cart-types';
import { createCheckoutDraft, type CheckoutDraftInput, type CheckoutDraftOutcome } from './checkout-draft';
import { createCheckoutSession, type CheckoutSessionCreator } from './checkout-session';
import type { PaymentGateway } from './payment-gateway';
import { reserveOrderStock } from './reserve';
import { transitionOrder } from './transition';
import type { OrderEffects } from './effects';

/**
 * "Siparişi onayla": taslağı açar, stoğu ayırır, ödemeyi başlatır; tek turda, ki ödemeye gelmeyen müşteri ardında yetim taslak
 * bırakmasın. Kartta sipariş ödeme onayına kadar taslak kalır; kapıda ve vadeli ödemede burada kesinleşir.
 */

/** Sipariş açılamadı; her ret müşteriden başka bir düzeltme ister, taslağın ret hâlleri olduğu gibi taşınır. */
export type PlaceOrderRejection =
  | Exclude<CheckoutDraftOutcome, { status: 'ok' }>
  /** Sepet okumasıyla ayırma arasında stok düştü; kalem kimliği ve kalan adet taşınır, adı çağıran çözer. */
  | { status: 'insufficient_stock'; variantId: string; available: number }
  /** Ödeme oturumu açılamadı; kartın reddi burada değil, o karar sağlayıcının kendi arayüzünde verilir. */
  | { status: 'payment_unavailable'; reason: 'stale' | 'not_found' | 'provider_unavailable' | 'no_client_secret' }
  /** Taslak açıldı ama kesinleşemedi (sipariş okunamadı ya da geçişi motor reddetti) — iç arıza. */
  | { status: 'order_not_placed' };

export type PlaceOrderOutcome =
  /** Kart yolu: sipariş `draft`, ödeme istemcide tamamlanacak. */
  | { status: 'payment_required'; orderId: string; totalCents: number; deliveryType: DeliveryType; clientSecret: string }
  /**
   * Kapıda ya da vadeli: sipariş açıldı ve kesinleşti. Numara ilk kalıcı durumda doğar, bu yüzden bu dala özgüdür; üretilmediyse
   * `null` kalır, uydurulmaz.
   */
  | { status: 'placed'; orderId: string; totalCents: number; deliveryType: DeliveryType; referenceNo: string | null }
  | PlaceOrderRejection;

export interface PlaceOrderInput {
  locale: PreferredLanguage;
  /**
   * **Sunucuda çözülmüş** müşteri kimliği — istemciden ASLA alınmaz (`createCheckoutDraft` ile aynı
   * sözleşme). Web oturumdan çözer, mobil uç Bearer'dan.
   */
  customerId: string;
  entries: readonly CartEntry[];
  addressId: string;
  deliveryDate: string | null;
  paymentMethod: PaymentMethod;
  onAccount?: boolean;
  /**
   * **ELLE GİRİŞ** (09.8) — dolu olduğunda siparişi personel yazıyor demektir; kural farkları ve
   * gerekçeleri `CheckoutDraftInput.staff` künyesinde. Olduğu gibi taslağa geçer.
   */
  staff?: CheckoutDraftInput['staff'];
  /** Bülten/pazarlama izni — checkout kutusundan gelir, baştan işaretsizdir (DOMAIN §11). */
  marketingConsent?: boolean;
  /** Sepetteki kupon kodu; siparişin indirimi bunsuz hesaplanamaz. */
  couponCode?: string | null;
  /** Müşteriye gösterilen sepetin imzası; taslakta karşılaştırılır (`cart_changed`). */
  expectedCartFingerprint?: string | null;
  /** Çift sipariş kalkanı: istemcinin bu deneme için ürettiği anahtar. */
  idempotencyKey?: string | null;
  /** Sepetin kargo grubundan açılan ikinci sipariş mi. */
  shippingOrder?: boolean;
  /** Kargo servisi ve teslim noktası seçimi; taslak doğrular (`CheckoutDraftInput`). */
  shippingOptionCode?: string | null;
  servicePointId?: string | null;
  /** Gel-al deposu; taslak izni ve depoyu doğrular (`CheckoutDraftInput.pickupWarehouseId`). */
  pickupWarehouseId?: string | null;
  // Komşu davetinin belirteci girdi değil: davet kişiye yazılı, taslak onu müşterinin kaydından okur.
  /** Paket çözümünün kapısı — taslağa olduğu gibi geçilir (aşama 1'in `CartBundlePort`u). */
  bundles?: CartBundlePort;
  /** Edinim kaynağı kapısı (13.2) — taslağa olduğu gibi geçilir; web'de çerez okur. */
  onCustomerAcquired?: (customerId: string) => void;
  /** Ödeme oturumunu açan sağlayıcı; `null` "anahtar yok" demektir, varsayılan verilseydi paket `stripe`a bağlanırdı. */
  createPaymentSession: CheckoutSessionCreator | null;
  /** Sağlayıcıya soran port; açılan taslağın ödemesini okur ve gerekirse iptal eder. */
  paymentGateway?: PaymentGateway | null;
  /** Durum geçişinin yan etkileri (müşteri haberi + sipariş puanı) — `transitionOrder`a geçer. */
  effects?: OrderEffects;
  /** Huni ölçümü: sipariş reddedildi; çağıran hangi retlerin sayılacağına kendisi karar verir. */
  onRejected?: (reason: string) => void;
  /** Huni ölçümü: müşteri siparişi verdi (kart yolunda "ödemeye bastı" niyeti de buraya sayılır). */
  onPlaced?: () => void;
}

export async function placeOrder(db: Db, input: PlaceOrderInput): Promise<PlaceOrderOutcome> {
  /** Aynı istek ikinci kez geldiyse ikinci sipariş açılmaz; huni ölçümü de ilk çağrıda sayıldığı için atılmaz. */
  if (input.idempotencyKey) {
    const already = await new OrderService(db).findByIdempotencyKey(input.idempotencyKey, input.customerId);
    if (already && already.status !== 'draft' && already.status !== 'cancelled') {
      // Numara ve tür satırdan: bu dal kesinleşmiş bir siparişi geri veriyor.
      return {
        status: 'placed',
        orderId: already.id,
        totalCents: already.orderedTotalCents,
        deliveryType: already.deliveryType,
        referenceNo: already.referenceNo,
      };
    }
  }

  // Önceki deneme(ler)den kalan açık taslak KAPATILIR — yenisini açmadan önce.
  await supersedeOpenDrafts(db, input.customerId, input.paymentGateway ?? null);

  const draft = await createCheckoutDraft(db, {
    locale: input.locale,
    customerId: input.customerId,
    entries: input.entries,
    addressId: input.addressId,
    deliveryDate: input.deliveryDate,
    paymentMethod: input.paymentMethod,
    onAccount: input.onAccount,
    // Elle giriş künyesi (09.8) — alanların TEK TEK kopyalandığı bir kapı bu (yukarıdaki
    // `expectedCartFingerprint` künyesinin aynı uyarısı): eklenip de geçirilmeyen bir alan kapıyı
    // sessizce etkisiz bırakır.
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
  });

  if (draft.status !== 'ok') {
    // Depo çözülemedi: iki sebep de siparişi engeller ama biri VERİ hatası (aynı kod iki bölgede),
    // öteki YAPILANDIRMA eksiği (kargo deposu yok). İkisi de operatörün müdahalesini bekler ve
    // müşteri bunu "ödeme hatası" olarak görmemeli — sebep çağırana taşınır, iz de bırakılır.
    if (draft.status === 'warehouse_unresolved') {
      // Log'a KİMLİK yazılır, içerik yazılmaz (CLAUDE.md §1): sebep ve müşteri kimliği yeter —
      // adres satırı ya da posta kodu kişisel veridir ve teşhis için gerekmez.
      await captureError(new Error(`checkout: yer çözülemedi (${draft.reason})`), {
        source: SOURCES.applicationOrder,
        context: { reason: draft.reason, customerId: input.customerId },
      });
      // Huniye YAZILMAZ (bilerek): bu bizim yapılandırma hatamız, müşterinin sürtünmesi değil.
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
    // Kalemler TASLAKTAN değil SİPARİŞTEN okunur: paket açılımı, parti seçimi ve fiyat
    // `createCheckoutDraft` içinde yapılıp satırlara yazıldı — ayırma da o yazılmış hâli
    // ayırmalı. Online yolda `createCheckoutSession` zaten aynı kaynaktan okuyor.
    const placed = await new OrderService(db).getWithItems(draft.orderId);
    if (!placed) return { status: 'order_not_placed' };

    const reserved = await reserveOrderStock(db, { orderId: draft.orderId, items: placed.items, expiring: false });
    if (!reserved.ok) {
      // Ayrılamadıysa taslak kapanır, sebep `out_of_stock`; bu yolda para hiç çekilmedi.
      await cancelDraft(db, draft.orderId, 'out_of_stock');
      input.onRejected?.('insufficient_stock');
      return { status: 'insufficient_stock', variantId: reserved.variantId, available: reserved.available };
    }

    const moved = await transitionOrder(db, { orderId: draft.orderId, to: 'confirmed', effects: input.effects });
    if (moved.status !== 'ok') {
      await releaseOrderStock(db, draft.orderId);
      // Sebep `null` ve bilerek: geçiş motorca reddedildi — kümedeki beş sebepten hiçbiri bunu
      // anlatmıyor. Uydurulmuş bir sebep, ekranı yanlış cümleye götürürdü; `null` "sebep
      // yazılmadı" der ve ekran nötr cümleye düşer.
      await cancelDraft(db, draft.orderId, null);
      return { status: 'order_not_placed' };
    }

    // Sipariş kesinleşti → sepetten O SİPARİŞİN kalemleri düşer. Toptan boşaltmak, iki gruplu
    // sepette kapıya siparişini veren müşterinin kargo grubunu da sessizce silerdi (19.7).
    await clearOrderedLines(db, input.customerId, draft.orderId);
    // Huninin son adımı (08.9). Tutar ve müşteri TAŞINMAZ — olay yalnız "bu oturum siparişle
    // bitti" der (`ANALYTICS §1`, İlke 2'nin bilinçli istisnası).
    input.onPlaced?.();
    /* Numara GEÇİŞİN cevabından — `transitionOrder` onu bu çağrıda üretti ve döndürdü. Siparişi
       ikinci kez okumak aynı değeri bir tur daha sormak olurdu. */
    return {
      status: 'placed',
      orderId: draft.orderId,
      totalCents: draft.totalCents,
      deliveryType: draft.deliveryType,
      referenceNo: moved.referenceNo,
    };
  }

  const session = await createCheckoutSession(
    db,
    { orderId: draft.orderId, marketingConsent: input.marketingConsent },
    input.createPaymentSession,
  );
  if (session.status !== 'ok' || !session.clientSecret) {
    // Ödeme oturumu açılamadı: müşteri her şeyi doğru yaptı, kasa açılmadı.
    input.onRejected?.('payment_failed');
    // Yarış hâli bu dalda da doğabilir (`createCheckoutSession` ayırmayı kendi içinde yapıyor) ve
    // künyesi kapıda ödeme yoluyla AYNI: kalem kimliği elimizde, adı çağıranın işi.
    if (session.status === 'insufficient_stock') {
      return { status: 'insufficient_stock', variantId: session.variantId, available: session.available };
    }
    return {
      status: 'payment_unavailable',
      // `ok` ama jetonsuz hâl ayrı adlandırılır: "oturum açılamadı" ile "oturum açıldı ama ödeme
      // başlatılamaz" ayrı arızalardır ve tek ada indirilirse ikincisi hiç görünmez.
      reason: session.status === 'ok' ? 'no_client_secret' : session.status,
    };
  }
  // Kart yolunun huni adımı: müşteri ödeme düğmesine bastı; huni niyeti ölçer, muhasebeyi değil.
  input.onPlaced?.();
  return {
    status: 'payment_required',
    orderId: draft.orderId,
    totalCents: draft.totalCents,
    deliveryType: draft.deliveryType,
    clientSecret: session.clientSecret,
  };
}

/**
 * Müşterinin önceki açık taslaklarını kapatır ve stoklarını bırakır, ki eski deneme malı tutup yenisine "stok yetersiz" dedirtmesin.
 * Süpürülen taslağın ödemesi sağlayıcıda da iptal edilir; geçmiş ya da işlenen ödeme buraya gelmez.
 */
async function supersedeOpenDrafts(db: Db, customerId: string, gateway: PaymentGateway | null): Promise<void> {
  const orders = new OrderService(db);
  // Taslaklar en yenilerdir: sayfanın başı yeter, tüm geçmişi taramaya gerek yok.
  const recent = await orders.listByCustomer(customerId, { limit: 20 });
  for (const order of recent.rows) {
    if (order.status !== 'draft') continue;
    // İptal düşerse iz bırakılır ve süpürme SÜRER: yeni deneme eski bir ödemenin arızası yüzünden
    // durmamalı; ödeme sonradan geçerse yukarıdaki emniyet parayı iade eder.
    if (gateway && order.paymentRef) {
      try {
        await gateway.cancel(order.paymentRef);
      } catch (error) {
        await captureError(error, { source: SOURCES.applicationOrder, context: { orderId: order.id, step: 'cancel_superseded_payment' } });
      }
    }
    // Sıra ÖNEMLİ: önce mal geri bırakılır, sonra sipariş kapanır. Tersi olsaydı iptal edilmiş bir
    // siparişin rezervasyonu ortada kalabilirdi.
    await releaseOrderStock(db, order.id);
    // Müşteri yeni bir denemeye geçti; bu taslak onun yerine geçildiği için kapanıyor.
    await cancelDraft(db, order.id, 'superseded');
  }
}

/** Ayrılamayan siparişin taslağı kapatılır; sebep zorunludur, çünkü onay ekranı cümlesini sebebe göre kurar. */
async function cancelDraft(db: Db, orderId: string, reason: OrderCancelReason | null): Promise<void> {
  await new OrderService(db).cancel(orderId, 'draft', null, reason);
}

async function releaseOrderStock(db: Db, orderId: string): Promise<void> {
  await new ReservationService(db).releaseByOrder(orderId);
}
