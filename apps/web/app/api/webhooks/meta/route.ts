import { logger } from '@lezzet/observability';
import { handleMetaWebhook, metaAppSecret, metaVerifyToken, verifyMetaSignature } from '@/lib/messaging/meta-webhook';

/**
 * Meta webhook uç noktası (15.7) — WhatsApp + Messenger + Instagram, TEK adres. **İnce kabuk**:
 * el sıkışma (GET) + imza (POST) burada, ayrıştırma ve defter yazımı `lib/messaging/meta-webhook.ts`'te
 * (test edilebilir, HTTP'siz) — Stripe kabuğuyla aynı iş bölümü.
 *
 * İki kural burada da geçerli (Stripe kabuğunun kuralları):
 * - **Gövde doğrulanmadan okunmaz.** İmza HAM gövde üzerinden hesaplanır; `req.json()` gövdeyi
 *   normalleştirir ve imzayı bozar — bu yüzden `req.text()`.
 * - **Hata 500 döner** ki Meta tekrar göndersin (7 gün, azalan sıklık); TEKRAR gelen olay
 *   mesaj-düzeyi claim sayesinde 200 alır — yoksa sağlayıcı sonsuza dek dener.
 */

/**
 * Kurulum el sıkışması: Meta paneline adres yazılınca tek sefer GET gelir; verify token bizimkiyle
 * eşleşirse `hub.challenge` AYNEN geri döner. Token uydurduğumuz bir dizedir — eşleşme, adresi
 * bizim yazdığımızın kanıtı; sonrası imzanın işi.
 */
export function GET(request: Request): Response {
  const token = metaVerifyToken();
  if (!token) return new Response('meta not configured', { status: 503 });

  const params = new URL(request.url).searchParams;
  if (params.get('hub.mode') === 'subscribe' && params.get('hub.verify_token') === token) {
    return new Response(params.get('hub.challenge') ?? '', { status: 200 });
  }

  logger.warn({ mode: params.get('hub.mode') }, 'meta webhook el sıkışması reddedildi — verify token eşleşmedi');
  return new Response('forbidden', { status: 403 });
}

export async function POST(request: Request): Promise<Response> {
  const secret = metaAppSecret();
  // Anahtarsız ortamda uç nokta AÇIK KALMAZ: doğrulanamayan gövde işlenmemelidir (Stripe kuralı).
  if (!secret) return new Response('meta not configured', { status: 503 });

  const body = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!verifyMetaSignature(body, signature, secret)) {
    // İmza tutmuyor: istek Meta'dan gelmemiş olabilir. İZ BIRAKILIR ama `captureError` DEĞİL —
    // kapının beklenen reddi, uygulama arızası değil. Gövde LOGLANMAZ: doğrulanmamış içeriktir.
    // İmza kimlik kurgusunun temeli (15.7): imzasız uca "şu numaradan geliyorum" diyebilen biri,
    // 04.10'un güvenlik kodunu da anlamsız kılardı.
    logger.warn({ reason: signature ? 'invalid' : 'missing' }, 'meta webhook imza doğrulaması başarısız');
    return new Response('invalid signature', { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // İmzası doğru ama gövdesi bozuk bir istek pratikte olmaz; olursa tekrarı da bozuk gelir —
    // 400, tekrar döngüsüne sokmadan.
    logger.warn({ reason: 'unparsable' }, 'meta webhook gövdesi çözümlenemedi');
    return new Response('invalid body', { status: 400 });
  }

  const outcome = await handleMetaWebhook(parsed);

  // Hata: 500 → Meta tekrar gönderir; işlenebilenler claim'li olduğu için ikinci turda yalnız
  // düşenler yeniden işlenir.
  if (outcome.status === 'error') return new Response(outcome.error, { status: 500 });
  return Response.json(outcome);
}
