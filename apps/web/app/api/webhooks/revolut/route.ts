import { logger } from '@lezzet/observability';
import { RevolutWebhookEventSchema, SYSTEM_ACCOUNT_IDS } from '@lezzet/types';
import { handlePaymentEvent } from '@/lib/order/payment-webhook';
import { toPaymentEvent, verifyRevolutSignature } from '@/lib/order/revolut-event';
import { revolutWebhookSecret, webRevolutClient } from '@/lib/revolut';

/**
 * Revolut webhook ucu imzayı ham gövde üzerinden doğrular, olayı çevirir ve işleyiciye verir. Okunamayan olay 500 alır ki sağlayıcı
 * yeniden göndersin; tekrar gelen olay 200 alır, yoksa sağlayıcı denemeyi sürdürür.
 */
export async function POST(request: Request): Promise<Response> {
  const client = webRevolutClient();
  const secret = revolutWebhookSecret();
  // Anahtarsız ortamda uç açık kalmaz: doğrulanamayan gövde işlenmemeli.
  if (!client || !secret) return new Response('revolut not configured', { status: 503 });

  const rawBody = await request.text();
  const verified = verifyRevolutSignature({
    rawBody,
    timestamp: request.headers.get('revolut-request-timestamp'),
    signatureHeader: request.headers.get('revolut-signature'),
    secret,
  });
  if (!verified) {
    // Uygulama arızası değil, kapının beklenen reddi; sayaç şişmesin diye uyarı düzeyinde ve gövdesiz iz bırakılır.
    logger.warn({ reason: 'invalid_signature' }, 'revolut webhook imza doğrulaması başarısız');
    return new Response('invalid signature', { status: 400 });
  }

  const parsed = RevolutWebhookEventSchema.safeParse(JSON.parse(rawBody));
  if (!parsed.success) return new Response('unexpected payload', { status: 400 });

  let event;
  try {
    event = await toPaymentEvent(client, parsed.data);
  } catch (error) {
    logger.warn(
      { event: parsed.data.event, orderId: parsed.data.order_id, payoutId: parsed.data.payout_id },
      'revolut olayı okunamadı, yeniden denenecek',
    );
    return new Response(error instanceof Error ? error.message : 'event read failed', { status: 500 });
  }

  const outcome = await handlePaymentEvent(event, SYSTEM_ACCOUNT_IDS.merchant, parsed.data);
  if (outcome.status === 'error') return new Response(outcome.error, { status: 500 });
  return Response.json(outcome);
}
