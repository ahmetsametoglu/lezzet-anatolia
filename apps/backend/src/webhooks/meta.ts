import { handleMetaWebhook, metaAppSecret, metaVerifyToken, verifyMetaSignature } from '@lezzet/application';
import { logger } from '@lezzet/observability';
import type { Context } from 'hono';
import type { AppEnv } from '../http/request-log';

/**
 * Meta webhook uç noktası (WhatsApp, Messenger, Instagram tek adres), ince kabuk: el sıkışma ve imza burada, ayrıştırma ve defter
 * yazımı `@lezzet/application`daki işleyicide. Cevap kodları sözleşmedir: 200 işlendi, 401 imza yok ya da tutmuyor, 400 gövde
 * çözümlenemiyor, 500 bizde düştü (Meta yeniden gönderir), 503 anahtar yok ve doğrulanamayan gövde işlenmez.
 */

/**
 * Kurulum el sıkışması: panele adres yazılınca tek sefer GET gelir; verify token bizimkiyle
 * eşleşirse `hub.challenge` AYNEN geri döner. Token uydurduğumuz bir dizedir — eşleşme, adresi
 * bizim yazdığımızın kanıtı; sonrası imzanın işi.
 */
export function metaWebhookVerify(c: Context<AppEnv>): Response {
  const token = metaVerifyToken();
  if (!token) return c.text('meta not configured', 503);

  const params = new URL(c.req.url).searchParams;
  if (params.get('hub.mode') === 'subscribe' && params.get('hub.verify_token') === token) {
    return c.text(params.get('hub.challenge') ?? '', 200);
  }

  logger.warn({ context: 'webhook/meta', mode: params.get('hub.mode') }, 'meta webhook el sıkışması reddedildi — verify token eşleşmedi');
  return c.text('forbidden', 403);
}

export async function metaWebhook(c: Context<AppEnv>): Promise<Response> {
  const secret = metaAppSecret();
  if (!secret) return c.text('meta not configured', 503);

  // Gövde HAM okunur: imza ham bayt dizisi üzerinden hesaplanıyor ve `json()` normalleştirme
  // yaparak imzayı geçersiz kılar (Sendcloud kapısında ölçülmüş aynı tuzak).
  const body = await c.req.text();
  const signature = c.req.header('x-hub-signature-256');

  if (!verifyMetaSignature(body, signature ?? null, secret)) {
    /* İmza tutmuyor: iz bırakılır ama `captureError` değil, çünkü bu kapının beklenen reddidir, uygulama arızası değil. Gövde
       loglanmaz, doğrulanmamış içeriktir. */
    logger.warn({ context: 'webhook/meta', reason: signature ? 'invalid' : 'missing' }, 'meta webhook imza doğrulaması başarısız');
    return c.text('invalid signature', 401);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // İmzası doğru ama gövdesi bozuk bir istek pratikte olmaz; olursa tekrarı da bozuk gelir —
    // 400, tekrar döngüsüne sokmadan.
    logger.warn({ context: 'webhook/meta', reason: 'unparsable' }, 'meta webhook gövdesi çözümlenemedi');
    return c.text('invalid body', 400);
  }

  const outcome = await handleMetaWebhook(parsed);

  // Hata: 500 → Meta tekrar gönderir; işlenebilenler claim'li olduğu için ikinci turda yalnız
  // düşenler yeniden işlenir.
  if (outcome.status === 'error') return c.text(outcome.error, 500);
  return c.json(outcome, 200);
}
