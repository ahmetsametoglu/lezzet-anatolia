import Stripe from 'stripe';

/**
 * Stripe istemcisi (07.4/07.5) — **tek kurulum yeri**.
 *
 * Anahtar yoksa `null` döner ve çağıran akışı graceful kapatır (e-posta istemcisiyle aynı desen):
 * yerelde ödeme anahtarı olmadan çalışmak meşrudur, ama "ödeme alındı" demek değildir. Bu yüzden
 * anahtarsızlık sessiz başarı değil, açık bir `provider_unavailable` cevabıdır.
 */
let cached: Stripe | null | undefined;

export function stripeClient(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  cached = key ? new Stripe(key) : null;
  return cached;
}

/** Webhook imza sırrı — yoksa doğrulama YAPILAMAZ, istek reddedilir (STACK §13). */
export function stripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET ?? null;
}
