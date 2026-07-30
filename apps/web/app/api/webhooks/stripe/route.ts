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

/**
 * Stripe olayını işleyicinin anladığı sade şekle indirger — SDK tipi kapının içinde kalır.
 *
 * Ödeme sayfa İÇİNE alındığından (28.07) taşıyıcı nesne artık `Checkout.Session` değil
 * **`PaymentIntent`**: kart onayı istemcide `confirmPayment` ile veriliyor, ortada oturum yok.
 * Sipariş kimliği yine künyeden okunuyor — niyeti yaratırken oraya yazmıştık.
 */
function toVerifiedEvent(event: Stripe.Event): VerifiedEvent {
  // İade olaylarının taşıyıcısı `Charge`'dır, `PaymentIntent` değil — ve alan adları farklıdır.
  // Tek nesne varsayıp `intent.id` okusaydık künyeye `ch_...` yazılır, iade mutabakatı hiçbir
  // ödemeyi bulamazdı (07.11).
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge;
    const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : (charge.payment_intent?.id ?? null);

    return {
      id: event.id,
      type: event.type,
      orderId: charge.metadata?.order_id ?? null,
      paymentIntentId: intentId,
      amountTotalCents: charge.amount || null,
      // TOPLAM iade, bu olayın farkı değil: olay tekrar gelirse fark iki kez yazılırdı.
      amountRefundedCents: charge.amount_refunded ?? null,
      raw: { type: event.type, charge: charge.id, paymentIntent: intentId },
    };
  }

  const intent = event.data.object as Stripe.PaymentIntent;

  return {
    id: event.id,
    type: event.type,
    orderId: intent.metadata?.order_id ?? null,
    paymentIntentId: intent.id,
    // Tahsil edilen GERÇEK tutar: kısmi tahsilat ya da tutar düzeltmesi olduysa `amount_received`
    // doğruyu söyler, `amount` yalnız niyetti. Sipariş toplamına bakılmaz (12.2).
    amountTotalCents: intent.amount_received || intent.amount || null,
    raw: { type: event.type, paymentIntent: intent.id },
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
