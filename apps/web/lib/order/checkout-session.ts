import { serviceDb } from '@lezzet/database';
import {
  createCheckoutSession as createCheckoutSessionFor,
  type CheckoutSessionCreator,
  type CheckoutSessionInput,
  type CheckoutSessionOutcome,
} from '@lezzet/application';
import { stripeClient } from '../stripe';

/**
 * **Rezervasyon → ödeme sırası** (07.4) — uygulama katmanı orkestrasyonu. DOMAIN §4/§5.
 *
 * **Geçiş köprüsü** (sipariş zinciri terfisi, aşama 3/3): gövde `@lezzet/application`'ın
 * `order/checkout-session`ına taşındı — "önce stok ayrılır, sonra ödeme açılır" kuralı artık ORADA
 * yaşıyor. Sıra tersine çevrilemez ve iki kopyada yaşayamaz: mobilin ödeme ucu da aynı sırayı
 * uygulamak zorunda, biri unutsaydı müşteri parayı ödedikten sonra "mal kalmamış" cevabını alırdı.
 *
 * Köprünün taşıdığı şey WEB'E ÖZGÜ olan: **Stripe istemcisi**. Sağlayıcı çağrısı zaten bir PORTTU
 * (`CheckoutSessionCreator`, test sahtesini veriyor) ama varsayılanı burada duruyordu; pakette
 * duramaz çünkü `stripe` npm paketi `@lezzet/application`ın bağımlılığı OLAMAZ — o paket React
 * Native tarafından da okunabilen bir bağımlılık ağacında yaşıyor. Mobil arka uç kendi istemcisini
 * geçecek; paket "niyet oluştur" der, hangi sağlayıcı olduğunu bilmez.
 */
// Port tipi buradan da görünür kalır: testin sahte üreteci onu bu yoldan alıyor (`fakeCreator`).
export type { CheckoutSessionCreator };

export async function createCheckoutSession(
  input: CheckoutSessionInput,
  createSession: CheckoutSessionCreator | null = stripeSessionCreator(),
): Promise<CheckoutSessionOutcome> {
  return createCheckoutSessionFor(serviceDb(), input, createSession);
}

/**
 * Portun WEB uygulaması. Anahtar yoksa `null` — kapı `provider_unavailable` döner ve stok hiç
 * ayrılmaz. Sipariş açma zinciri de (`placeOrder`) bu üreteci portundan alıyor.
 */
export function stripeSessionCreator(): CheckoutSessionCreator | null {
  const stripe = stripeClient();
  if (!stripe) return null;

  return async (params) => {
    const intent = await stripe.paymentIntents.create({
      amount: params.amountCents,
      currency: 'eur',
      description: params.description,
      // Kart yeterli: cüzdanlar (Apple/Google Pay) da kart yöntemidir, ayrı tip gerektirmez.
      // Otomatik yöntemler açık bırakılsaydı sepete uymayan (Klarna, taksit) seçenekler belirirdi.
      payment_method_types: ['card'],
      // Siparişe geri dönüşün TEK yolu: webhook bu alanı okur. Ayrı eşleme tablosu tutmuyoruz —
      // sağlayıcının taşıdığı kimlik, bizim kopyamızdan güvenilirdir.
      metadata: { order_id: params.orderId, reservation_expires_at: params.reservationExpiresAt },
    });
    return { id: intent.id, clientSecret: intent.client_secret };
  };
}
