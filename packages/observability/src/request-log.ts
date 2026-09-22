import { randomUUID } from 'node:crypto';
import { errorMessageOf } from './error-message';
import { logger } from './logger';

/** Ara katmanın bağlamdan istediği üç şey; Hono'nun `Context`i buna uyar, paket bir HTTP çatısına bağlanmaz. */
export interface RequestLogContext {
  set(key: 'reqId', value: string): void;
  req: { method: string; path: string };
  res: { status: number };
}

/**
 * İstek izi: her isteğe `reqId` atar ve method · path · durum · süreyi tek satırda yazar, çünkü kimlik olmadan aynı saniyedeki
 * isteklerin satırları iç içe geçer. Seviye durumdan türer (5xx `error`, 4xx `warn`, gerisi `info`); hata kaydı `app.onError`ın
 * işidir, yoksa aynı hata iki kez kaydedilirdi.
 */
export async function requestLog(c: RequestLogContext, next: () => Promise<void>): Promise<void> {
  const reqId = randomUUID();
  c.set('reqId', reqId);
  const startedAt = Date.now();

  try {
    await next();
  } catch (err) {
    if (err instanceof Error) throw err;
    // Hono `onError`a yalnız `Error` verir; PostgREST hatası düz nesnedir ve çevrilmezse boş gövdeli 500 döner, kayıt düşmez.
    logger.error({ reqId, method: c.req.method, path: c.req.path, status: 500, ms: Date.now() - startedAt }, 'request');
    throw new Error(errorMessageOf(err), { cause: err });
  }

  const status = c.res.status;
  const line = { reqId, method: c.req.method, path: c.req.path, status, ms: Date.now() - startedAt };
  if (status >= 500) logger.error(line, 'request');
  else if (status >= 400) logger.warn(line, 'request');
  else logger.info(line, 'request');
}
