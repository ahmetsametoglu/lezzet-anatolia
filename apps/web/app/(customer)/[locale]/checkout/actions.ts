'use server';

import { serviceDb } from '@lezzet/database';
import { hasLocale } from 'next-intl';
import {
  checkoutBlockedAnalyticsReason,
  checkoutServicePoints,
  openPaymentBefore,
  placeOrder,
  readCheckoutSnapshot,
  type CheckoutSnapshot,
  type PlaceOrderRejection,
} from '@lezzet/application';
import type { PaymentMethod } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { currentCustomerId } from '@/lib/guard';
import { readSelectedPickupWarehouseId } from '@/lib/delivery/read-place';
import { checkAddressForCustomer, type AddressCheckOutcome } from '@lezzet/application';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import type { ServicePointsResult } from './checkout-types';
import { formatPrice } from '@/lib/storefront/format';
import type { CartEntry } from '@/lib/cart/cart-types';
import { getPackagesByIds } from '@/lib/storefront/packages';
import { resolveOrderLines } from '@/lib/order/customer-lines';
import { webOrderEffects, webPaymentEffects } from '@/lib/order/transition';
import { stripeSessionCreator } from '@/lib/order/checkout-session';
import { stripePaymentGateway } from '@/lib/stripe';
import { rememberAcquisition } from '@/lib/analytics/attribution';
import { recordEvent } from '@/lib/analytics/record';
import { routing } from '@/i18n/routing';

/**
 * Checkout server action'ları: müşteri kimliği yalnız burada, oturumdan çözülür; istemci tutar göndermez, fiyat ve ücret her
 * turda sunucuda yeniden çözülür. Dönen hata metin değil anahtardır (`customerErrorKey`), sipariş retleri kendi sözlüğünde yaşar.
 */

/**
 * Adım verisini çözer; adres seçilmeden de çağrılır ki liste gelsin, o zaman teslimat ve ödeme `null` döner. Birleştirme kuralı
 * `@lezzet/application`da, uç dili doğrular, kimliği oturumdan çözer ve müşteri hata zarfını kurar.
 */
export async function loadCheckoutAction(
  locale: string,
  entries: CartEntry[],
  addressId: string | null,
  /**
   * Sepette girilen kupon; taşınmazsa kalemler kuponlu, toplam ve siparişe yazılan tutar kuponsuz olurdu.
   */
  couponCode: string | null = null,
  /**
   * Sepetin kargo grubundan açılan ikinci sipariş mi (`/checkout?group=shipping`); taslakla aynı açık bayrak. Geçmezse ekran
   * adresin cevabını gösterir, taslak kargo siparişi açar ve müşteri ekranda seçtiği yöntemle kasada reddedilir.
   */
  shippingOrder = false,
  /**
   * Müşterinin seçtiği kargo servisi, yalnız kod: fiyat sunucudaki teklif listesinden okunur, istemciden tutar alınmaz.
   */
  shippingOptionCode: string | null = null,
): Promise<CustomerResult<CheckoutSnapshot>> {
  try {
    if (!hasLocale(routing.locales, locale)) throw new Error('Geçersiz dil');
    const customerId = await currentCustomerId();
    if (!customerId) {
      return { data: { addresses: [], delivery: null, shipping: null, payment: null, summary: null, pickup: null }, errorKey: null };
    }

    // Sıra, iki tur teslimat çözümü ve kargo siparişinin bölgesizliği — hepsi kapının kendi
    // künyesinde (`@lezzet/application`, `order/checkout-snapshot`). Uç yalnız kimliği çözer,
    // paket çözümünün kapısını geçer ve sonucu müşteri zarfına koyar.
    const data = await readCheckoutSnapshot(serviceDb(), locale, {
      customerId,
      entries,
      addressId,
      couponCode,
      shippingOrder,
      shippingOptionCode,
      // Gel-al seçimi ekrandan değil yerden gelir: adres seçicideki depo kartı → çerez → teklif kapısı.
      pickupWarehouseId: await readSelectedPickupWarehouseId(),
      // Paket türetmesi web'te (`lib/storefront/packages.ts`); kapı buradan geçer.
      bundles: getPackagesByIds,
    });
    return { data, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Harita için teslim noktaları: adres müşterinin kendi adresleri arasında aranır, taşıyıcılar anlık görüntünün noktaya
 * teslim servislerinden gelir. Fiyat burada dönmez; ekran onu anlık görüntüden okur, sipariş yeniden doğrular.
 */
export async function loadServicePointsAction(addressId: string, carrierCodes: string[]): Promise<CustomerResult<ServicePointsResult>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    return { data: await checkoutServicePoints(serviceDb(), { customerId, addressId, carrierCodes }), errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Seçilen adresin kapısı gerçekten var mı: sipariş anında sorulur, çünkü her kayıtta doğrulamak kullanılmayacak adresler için
 * servise gitmek olurdu. Dönüş ret değil bilgidir ve kapı fırlatmaz; servis düşerse `unknown` döner, dış servisin kesintisi
 * satışı durdurmaz.
 */
export async function checkCheckoutAddressAction(addressId: string): Promise<CustomerResult<AddressCheckOutcome>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');

    /* Sahiplik + doğrulama TEK kapıda (`checkAddressForCustomer`): mobil uç da aynı yerden geçiyor.
       Kuralı iki yerde yazmak, birinin bir gün unutması ve orada başkasının adresi hakkında bilgi
       sızması demekti. */
    return { data: await checkAddressForCustomer(serviceDb(), { customerId, addressId }), errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * "Siparişi onayla": taslağı açar, stoğu ayırır, ödeme niyetini doğurur; tek turda, çünkü ayrı çağrılar yetim taslak bırakırdı.
 * Zincir `@lezzet/application`ın `order/place-order`ında; uç dil, kimlik, hata zarfı, reddin ekran diline çevrilmesi ve yüzey
 * portlarını taşır.
 */
type ConfirmOutcome =
  | { status: 'payment_required'; orderId: string; clientSecret: string; totalCents: number }
  /** Kapıda/vadeli: ödeme sağlayıcısı yok, sipariş açıldı. */
  | { status: 'placed'; orderId: string; totalCents: number }
  /**
   * Önceki kart ödemesi geçti ya da bankada işleniyor: yeni sipariş açılmadı, müşteri o siparişin sayfasına gider. Aynı sepet için
   * ikinci bir ödeme iki kez çekim olurdu.
   */
  | { status: 'open_payment'; orderId: string; state: 'paid' | 'processing' }
  | { status: 'rejected'; reason: string; detail?: string[] | string };

export async function confirmCheckoutAction(input: {
  locale: string;
  entries: CartEntry[];
  addressId: string;
  deliveryDate: string | null;
  paymentMethod: PaymentMethod;
  onAccount?: boolean;
  marketingConsent?: boolean;
  /** Sepetteki kupon kodu; siparişin indirimi bunsuz hesaplanamaz. */
  couponCode?: string | null;
  /**
   * Çift sipariş kalkanı, istemcinin bu deneme için ürettiği anahtar; yalnız kart dışı yollarda işler, çünkü orada sipariş bu
   * çağrıda kesinleşir. Kart yolunda koruma açık taslakların süpürülmesi ve düğmenin gezinme bitene kadar kapalı kalmasıdır.
   */
  idempotencyKey?: string | null;
  /** Sepetin kargo grubundan açılan ikinci sipariş mi — `loadCheckoutAction` ile aynı bayrak. */
  shippingOrder?: boolean;
  /** Kargo servisi ve teslim noktası seçimi; sunucu doğrular, fiyatı kendisi hesaplar. */
  shippingOptionCode?: string | null;
  servicePointId?: string | null;
  /**
   * Ekranın gösterdiği sepetin imzası (`summary.fingerprint`), olduğu gibi geri gelir. Sepet arada değiştiyse kapı `cart_changed`
   * ile reddeder ve müşteri yeni özeti görüp bilerek onaylar; boşsa kontrol atlanır.
   */
  expectedCartFingerprint?: string | null;
}): Promise<CustomerResult<ConfirmOutcome>> {
  try {
    if (!hasLocale(routing.locales, input.locale)) throw new Error('Geçersiz dil');
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');

    /*
      Önceki ödeme geçtiyse ya da bankada işleniyorsa aynı sepet için yeni ödeme iki kez çekim demek: yeni sipariş açılmaz, müşteri o
      siparişe gider. Ödenmemişse yeni deneme sürer ve eski ödeme sağlayıcıda iptal edilir (`paymentGateway`).
    */
    const gateway = stripePaymentGateway();
    const open = await openPaymentBefore(serviceDb(), customerId, { gateway, effects: webPaymentEffects });
    if (open) return { data: { status: 'open_payment', orderId: open.orderId, state: open.state }, errorKey: null };

    // Zincirin TAMAMI kapının içinde (`@lezzet/application`, `order/place-order`): tekrar kalkanı,
    // açık taslakların süpürülmesi, taslak, çevrimdışı yolun rezervasyon → `confirmed` sırası ve
    // çevrimiçi yolun ödeme niyeti. Uç yalnız yüzeye ait dört şeyi geçirir — sağlayıcı üreteci,
    // paket çözümü, edinim çerezi ve ölçüm — sonra sonucu ekranın diline çevirir.
    const outcome = await placeOrder(serviceDb(), {
      locale: input.locale as Locale,
      customerId,
      entries: input.entries,
      addressId: input.addressId,
      deliveryDate: input.deliveryDate,
      paymentMethod: input.paymentMethod,
      onAccount: input.onAccount,
      marketingConsent: input.marketingConsent,
      couponCode: input.couponCode,
      idempotencyKey: input.idempotencyKey,
      shippingOrder: input.shippingOrder,
      shippingOptionCode: input.shippingOptionCode,
      servicePointId: input.servicePointId,
      pickupWarehouseId: await readSelectedPickupWarehouseId(),
      expectedCartFingerprint: input.expectedCartFingerprint,
      // Paket türetmesi web'te (`lib/storefront/packages.ts`).
      bundles: getPackagesByIds,
      // Edinim kaynağı oturumun kampanya ÇEREZİNİ okur — taşıma ayrıntısı, pakette yaşayamaz.
      onCustomerAcquired: (id) => void rememberAcquisition(id),
      // Sağlayıcı istemcisi pakete GİRMEZ (`stripe` npm bağımlılığı): üreteç buradan geçer.
      createPaymentSession: stripeSessionCreator(),
      // Eski taslağın ödemesini sağlayıcıda kapatmak için; yukarıdaki soruyla aynı port.
      paymentGateway: gateway,
      // Durum geçişinin iki yan etkisi (müşteri haberi + sipariş puanı) de web modüllerinde.
      effects: webOrderEffects,
      onRejected: measureRejection,
      // Huninin son adımı. Tutar ve müşteri taşınmaz: olay yalnız "bu oturum siparişle bitti" der (`ANALYTICS §1`).
      onPlaced: () => void recordEvent({ type: 'order_placed' }),
    });

    if (outcome.status === 'placed') {
      return { data: { status: 'placed', orderId: outcome.orderId, totalCents: outcome.totalCents }, errorKey: null };
    }
    if (outcome.status === 'payment_required') {
      return {
        data: {
          status: 'payment_required',
          orderId: outcome.orderId,
          clientSecret: outcome.clientSecret,
          totalCents: outcome.totalCents,
        },
        errorKey: null,
      };
    }
    return { data: await rejectionOutcome(outcome, input.locale), errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Yapısal reddi ekranın diline çevirir; bu bir görünüm kararı, çünkü para biçimi dile bağlı ve mobil aynı reddi kendi bileşenleriyle
 * gösterir. `detail` tek biçimdir (dize listesi), ekran dört ayrı ret için tek bir liste bileşeni gösterir.
 */
async function rejectionOutcome(rejection: PlaceOrderRejection, locale: Locale): Promise<ConfirmOutcome> {
  switch (rejection.status) {
    // Depo çözülemedi: sebep bir DİZE (ötekiler liste) — ekran onu tek satır gösteriyor. İz
    // (`captureError`) kapının içinde bırakıldı: bu bizim yapılandırma hatamız, hangi yüzeyden
    // gelirse gelsin aynı kovada görünmeli (`SOURCES.applicationOrder`).
    case 'warehouse_unresolved':
      return { status: 'rejected', reason: rejection.status, detail: rejection.reason };
    case 'blocked_lines':
      return { status: 'rejected', reason: rejection.status, detail: rejection.lines };
    // Ürünün adı YETMEZ, sayısı da gerekir: "Kayseri Mantısı" cümlesi müşteriye ne yapacağını
    // söylemiyor, "Kayseri Mantısı (2)" söylüyor. Parantezin ne anlama geldiğini metin yazıyor —
    // sunucu tarafında dil sözlüğü açmadan (`rejected.insufficient_here`).
    case 'insufficient_here':
      return { status: 'rejected', reason: rejection.status, detail: rejection.lines.map((l) => `${l.name} (${l.available})`) };
    case 'date_unavailable':
      return { status: 'rejected', reason: rejection.status, detail: rejection.availableDates };
    // Zamda eski ve yeni tutar birlikte taşınır: yalnız yeniyi göstermek müşteriyi "ne kadar arttı" diye sepete geri döndürürdü.
    // Biçimlendirici ekranınkiyle aynı (`formatPrice`, dile duyarlı).
    case 'price_changed':
      return {
        status: 'rejected',
        reason: rejection.status,
        detail: rejection.lines.map((l) => `${l.name}: ${formatPrice(l.fromCents, locale)} → ${formatPrice(l.toCents, locale)}`),
      };
    // Yarış hâli iki daldan da doğabilir (kapıda ödemenin ayırması / kartın ödeme oturumu) ve
    // künyesi aynı: kalem kimliği kapıdan gelir, ADI ekranın işidir.
    case 'insufficient_stock':
      return { status: 'rejected', reason: rejection.status, detail: await raceDetail(rejection, locale) };
    /**
     * Ödeme oturumu açılamadı: ekranın sözlüğü sağlayıcı hâllerini adıyla tanır (`rejected.provider_unavailable`, `rejected.stale`),
     * tanımadıkları genel hata cümlesine düşer. `no_client_secret` de oraya düşer, çünkü "sağlayıcı jeton vermedi" müşteriye
     * anlatılacak bir şey değildir.
     */
    case 'payment_unavailable':
      return { status: 'rejected', reason: rejection.reason };
    default:
      return { status: 'rejected', reason: rejection.status };
  }
}

/**
 * Yarış hâlinin künyesi: hangi kalem ve kaç tane kaldı, çünkü sepetinde on kalem olan müşteri "biri tükendi" cümlesinden
 * hangisi olduğunu bulamaz. Ad seçili dile göre varyanttan çözülür; bulunamazsa boş liste döner ve ekran genel cümleye düşer.
 */
async function raceDetail(outcome: { variantId: string; available: number }, locale: string): Promise<string[] | undefined> {
  if (!hasLocale(routing.locales, locale)) return undefined;
  const lines = await resolveOrderLines(serviceDb(), [{ variantId: outcome.variantId }], locale);
  const name = lines.get(outcome.variantId)?.name;
  return name ? [`${name} (${outcome.available})`] : undefined;
}

/**
 * Checkout reddinin ölçüm karşılığı; defter müşterinin sürtünmesini anlatır, bizim arızalarımızı değil, bu yüzden
 * `warehouse_unresolved`, `order_not_placed` ve enum'da karşılığı olmayan `date_unavailable` sayılmaz.
 */
function measureRejection(reason: string): void {
  // Eşleme ortak pakette, çünkü native de aynı retleri sayar ve iki kopya bir gün ayrışırdı.
  const mapped = checkoutBlockedAnalyticsReason(reason);
  if (mapped) void recordEvent({ type: 'checkout_blocked', reason: mapped });
}
