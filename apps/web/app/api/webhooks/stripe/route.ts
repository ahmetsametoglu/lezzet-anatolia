import type Stripe from 'stripe';
import { AccountService, serviceDb } from '@lezzet/database';
import { handleStripeEvent, type VerifiedEvent } from '@/lib/order/stripe-webhook';
import { stripeClient, stripeWebhookSecret } from '@/lib/stripe';

/**
 * Stripe webhook uç noktası (07.5). **İnce kabuk**: yalnız imzayı doğrular ve olayı işleyiciye
 * verir; karar ve yazım `lib/order/stripe-webhook.ts`'te (test edilebilir, HTTP'siz).
 *
 * İki kural burada geçerlidir:
 * - **Gövde doğrulanmadan okunmaz.** İmza HAM gövde üzerinden hesaplanır; `req.json()` çağırmak
 *   gövdeyi normalleştirir ve imzayı geçersiz kılar — bu yüzden `req.text()`.
 * - **İşlenemeyen olaya da 200 dönülür mü?** Hayır: hata 500 döner ki Stripe tekrar göndersin.
 *   Ama TEKRAR gelen olay 200 alır (idempotens) — yoksa sağlayıcı sonsuza dek dener.
 */

/** Ödemenin düştüğü hesap — Stripe havuzu bir hesaptır (DOMAIN §9); payout'u transferle bankaya gider. */
async function stripeAccountId(): Promise<string | null> {
  const accounts = await new AccountService(serviceDb()).list({ activeOnly: true });
  return accounts.find((account) => account.type === 'provider')?.id ?? null;
}

/** Stripe olayını işleyicinin anladığı sade şekle indirger — SDK tipi kapının içinde kalır. */
function toVerifiedEvent(event: Stripe.Event): VerifiedEvent {
  const session = event.data.object as Stripe.Checkout.Session;
  const intent = session.payment_intent;

  return {
    id: event.id,
    type: event.type,
    orderId: session.metadata?.order_id ?? session.client_reference_id ?? null,
    paymentIntentId: typeof intent === 'string' ? intent : (intent?.id ?? null),
    amountTotalCents: session.amount_total ?? null,
    raw: { type: event.type, session: session.id },
  };
}

export async function POST(request: Request): Promise<Response> {
  const stripe = stripeClient();
  const secret = stripeWebhookSecret();
  // Anahtarsız ortamda uç nokta AÇIK KALMAZ: doğrulanamayan gövde işlenmemelidir.
  if (!stripe || !secret) return new Response('stripe not configured', { status: 503 });

  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('missing signature', { status: 400 });

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, secret);
  } catch (error) {
    // İmza tutmuyor: bu istek Stripe'tan gelmemiş olabilir. 400 — tekrar denemesi anlamsız.
    return new Response(`invalid signature: ${error instanceof Error ? error.message : 'unknown'}`, { status: 400 });
  }

  const outcome = await handleStripeEvent(toVerifiedEvent(event), await stripeAccountId());

  // Hata: 500 → Stripe tekrar gönderir, olay `processed_at` almadığı için ikinci deneme çalışır.
  if (outcome.status === 'error') return new Response(outcome.error, { status: 500 });
  return Response.json(outcome);
}
