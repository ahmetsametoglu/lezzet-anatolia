import { serviceDb } from '@lezzet/database';
import {
  createCheckoutSession as createCheckoutSessionFor,
  revolutSessionCreator,
  type CheckoutSessionCreator,
  type CheckoutSessionInput,
  type CheckoutSessionOutcome,
} from '@lezzet/application';
import { webRevolutClient } from '../revolut';

/**
 * "Önce stok ayrılır, sonra ödeme açılır" kuralı ortak katmanda (`order/checkout-session`); burada yalnız web'in sağlayıcı istemcisi
 * porta bağlanır. Port tipi testin sahte üreteci için buradan da görünür.
 */
export type { CheckoutSessionCreator };

export async function createCheckoutSession(
  input: CheckoutSessionInput,
  createSession?: CheckoutSessionCreator | null,
): Promise<CheckoutSessionOutcome> {
  return createCheckoutSessionFor(serviceDb(), input, createSession === undefined ? await webSessionCreator() : createSession);
}

/** Portun web uygulaması; anahtar yoksa `null`, kapı `provider_unavailable` döner ve stok hiç ayrılmaz. */
export async function webSessionCreator(): Promise<CheckoutSessionCreator | null> {
  return revolutSessionCreator(await webRevolutClient(), { hostedPage: true });
}
