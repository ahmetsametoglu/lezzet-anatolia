import { randomUUID } from 'node:crypto';
import type { HttpBindings } from '@hono/node-server';
import type { Context, Next } from 'hono';
import { logger } from '@lezzet/observability';

/**
 * Hono bağlamının tipi. `reqId` burada TANIMLI olmak zorunda: Hono `c.set/get`'i tipe bağlıyor ve
 * tipsiz bir anahtar derleme hatası veriyor — yani kimliği taşımayı unutan bir ara katman derlenmez.
 * Sözleşmenin yeri kimliği üreten dosyadır.
 *
 * `Bindings` node sunucusunun ham `req`/`res` çiftidir (`c.env.incoming/outgoing`) — MCP taşıması
 * (22.1) cevabı Hono'nun dışında, doğrudan `ServerResponse`e yazar; tip burada tanımlı olmazsa o
 * erişim her kullanım yerinde ayrı bir cast olurdu.
 */
export interface AppEnv {
  Bindings: HttpBindings;
  Variables: { reqId: string };
}

/**
 * İstek log'u + **istek kimliği** (`OBSERVABILITY §3`).
 *
 * Her isteğe bir `reqId` atanır ve bağlama yazılır; method · path · durum · süre tek satırda
 * loglanır. Değeri şurada görünür: müşteri "sipariş veremedim" dediğinde elde tek bir ipin ucu olur.
 * Kimlik olmadan aynı saniyedeki on isteğin satırları iç içe geçer ve hangisinin hangi isteğe ait
 * olduğu ancak tahminle bulunur.
 *
 * Seviye DURUMDAN türer: 5xx bizim hatamız (`error`), 4xx çağıranın (`warn`), gerisi bilgi. Hepsini
 * `info` yazmak, log'u seviyeye göre süzmeyi imkânsız kılardı.
 *
 * Bu ara katman hata KAYDETMEZ — o `app.onError`'ın işi (`src/index.ts`). Burada yalnız istek izi
 * var; ikisi karışırsa aynı hata iki kez kaydedilir.
 */
export async function requestLog(c: Context<AppEnv>, next: Next): Promise<void> {
  const reqId = randomUUID();
  c.set('reqId', reqId);
  const startedAt = Date.now();

  await next();

  const status = c.res.status;
  const line = { reqId, method: c.req.method, path: c.req.path, status, ms: Date.now() - startedAt };
  if (status >= 500) logger.error(line, 'request');
  else if (status >= 400) logger.warn(line, 'request');
  else logger.info(line, 'request');
}
