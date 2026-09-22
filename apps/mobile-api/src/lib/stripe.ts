import Stripe from 'stripe';
import { stripeGateway, type CheckoutSessionCreator, type PaymentGateway } from '@lezzet/application';
import { CurrencyEnum } from '@lezzet/types';

/**
 * `apps/mobile-api`nin tek Stripe kapısı; istemci uçta kalır, paylaşılan katman onu port olarak ister, çünkü `stripe` paketi
 * React Native'in okuduğu bağımlılık ağacına giremez. Anahtarsızlıkta çağıran `null` görür, sessiz başarı yoktur.
 */
let cachedStripe: Stripe | null | undefined;

export function stripeClient(): Stripe | null {
  if (cachedStripe !== undefined) return cachedStripe;
  const key = process.env.STRIPE_SECRET_KEY;
  cachedStripe = key ? new Stripe(key) : null;
  return cachedStripe;
}

/** Stripe cent ve KÜÇÜK HARFLİ kod bekler; tek kaynak yine şemanın kendisi (`CurrencyEnum`). */
export const PROVIDER_CURRENCY = CurrencyEnum.options[0].toLowerCase();

/**
 * Ödeme niyeti kapısı: yalnız kart yöntemi (taksit gibi seçenekler belirmesin), `metadata.order_id` webhook'un siparişe dönüş
 * yoludur. İdempotency anahtarı tutarı da içerir; tutarı değişen sipariş başka bir ödemedir.
 */
export function paymentSessionCreator(): CheckoutSessionCreator | null {
  const stripe = stripeClient();
  if (!stripe) return null;

  return async ({ amountCents, orderId, description, reservationExpiresAt }) => {
    const intent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: PROVIDER_CURRENCY,
        description,
        payment_method_types: ['card'],
        metadata: { order_id: orderId, surface: 'mobile', reservation_expires_at: reservationExpiresAt },
      },
      { idempotencyKey: `mobile:order:${orderId}:${amountCents}` },
    );
    return { id: intent.id, clientSecret: intent.client_secret };
  };
}

/** Ödemenin durumunu soran, iptal ve iade eden kapı; web'in ve zamanlanmış işin kullandığıyla aynı port. */
export function paymentGateway(): PaymentGateway | null {
  return stripeGateway(stripeClient());
}
