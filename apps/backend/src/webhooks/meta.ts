import { handleMetaWebhook, metaAppSecret, metaVerifyToken, verifyMetaSignature } from '@lezzet/application';
import { logger } from '@lezzet/observability';
import type { Context } from 'hono';
import type { AppEnv } from '../http/request-log';

/**
 * META WEBHOOK UÇ NOKTASI (15.7) — WhatsApp + Messenger + Instagram, TEK adres.
 *
 * **İnce kabuk**: el sıkışma (GET) + imza (POST) burada; ayrıştırma, kimlik çözümü ve defter yazımı
 * `@lezzet/application`'daki işleyicide (HTTP'siz, test edilebilir). Sendcloud kabuğuyla aynı iş
 * bölümü — ve artık aynı uygulamada.
 *
 * ── NEDEN BACKEND'E TAŞINDI (29.08 · kullanıcı kararı) ──────────────────────
 * Uç bir tur boyunca `apps/web/app/api/webhooks/meta/route.ts`'teydi ve dayanağı Stripe'ın
 * sapmasıydı (`ADR Sapma 5`). İki gerekçe birden çürüdü:
 *
 * 1. **Sapmanın kendi çıkış şartı tetiklenmişti:** *"ikinci bir sağlayıcı webhook'u geldiğinde
 *    geri dönülür"* yazıyordu; Meta o ikinci sağlayıcıydı ama karar gözden geçirilmeden o da web'e
 *    kondu.
 * 2. **Sapmanın sebebi kalmamıştı:** gerekçe *"kapılar uygulama katmanında, backend onları
 *    göremez"*di. Bu işleyicinin çağırdığı sekiz kapının sekizi de `@lezzet/application`'a terfi
 *    etmişti; web'e bağlayan yalnız kimlik çözümü ile profil adı kalmıştı ve ikisinin de hiçbir
 *    Next.js bağımlılığı yoktu (ölçüldü: sıfır). İkisi de pakete taşındı.
 *
 * ── ÖLÇÜLEN PRATİK SEBEP: DEV SUNUCUSU WEBHOOK'A UYGUN DEĞİL ────────────────
 * Next.js dev sunucusu rotayı İLK çağrıda derliyor; sağlayıcılar ise kısa sürede cevap bekler.
 * 29.08'de tünel log'unda görüldü: `Failed to proxy HTTP: Incoming request ended abruptly ...
 * originService=http://localhost:3000`. Backend sade bir Node servisi — derleme adımı yok.
 *
 * ── YAN KAZANÇ: TEK TÜNEL ──────────────────────────────────────────────────
 * Geliştirmede genel adres `cloudflared` ile açılıyor ve kargo webhook'u zaten bu uygulamaya
 * bakıyordu. Meta de buraya gelince İKİNCİ tünel gereksizleşti — 29.08'de üç kez tünel
 * yönetmek zorunda kalındı ve her seferinde arıza sessizdi (adres DNS'te duruyor, bağlantı ölü).
 *
 * ── CEVAP KODLARI (Sendcloud kabuğuyla aynı sözleşme) ──────────────────────
 * - **200** — işlendi (ya da tekrar gelen olay: idempotens kapısı işleyicide).
 * - **401** — imza yok/tutmuyor. Tekrar denemesi anlamsız.
 * - **400** — imzası doğru ama gövdesi çözümlenemiyor.
 * - **500** — bizde bir şey düştü → Meta 7 gün boyunca azalan sıklıkla tekrar gönderir.
 * - **503** — anahtar yapılandırılmamış. Uç AÇIK KALMAZ: doğrulanamayan gövde işlenmez.
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
    /* İmza tutmuyor: istek Meta'dan gelmemiş olabilir. İZ BIRAKILIR ama `captureError` DEĞİL —
       kapının beklenen reddi, uygulama arızası değil. Gövde LOGLANMAZ: doğrulanmamış içeriktir.
       İmza kimlik kurgusunun temeli (15.7): imzasız uca "şu numaradan geliyorum" diyebilen biri,
       04.10'un güvenlik kodunu da anlamsız kılardı. */
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
