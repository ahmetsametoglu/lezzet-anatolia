import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import { v1 } from './api/v1/router';
import { fail } from './lib/respond';
import type { AppEnv } from './context';

/**
 * Uygulama `serve`'den AYRI modülde: testler `app.request()` ile port açmadan vurur
 * (`app.test.ts`), süreç girişi (`index.ts`) ise env yükleyip dinlemeye başlar.
 */
export const app = new Hono<AppEnv>();

// İstek izi önce takılır ki sonraki her şey `reqId` taşısın; seviye durumdan türer (5xx bizim hatamız, 4xx çağıranın) ve hata
// kaydı `app.onError`ın işidir, yoksa aynı hata iki kez kaydedilirdi.
app.use('*', async (c, next) => {
  const reqId = randomUUID();
  c.set('reqId', reqId);
  const startedAt = Date.now();

  await next();

  const status = c.res.status;
  const line = { reqId, method: c.req.method, path: c.req.path, status, ms: Date.now() - startedAt };
  if (status >= 500) logger.error(line, 'request');
  else if (status >= 400) logger.warn(line, 'request');
  else logger.info(line, 'request');
});

/*
  Yanıt sıkıştırma: katalog cevapları tekrar eden CDN adresleriyle büyüdü ve gzip onları büyük ölçüde küçültüyor; istemcinin
  `fetch`i gzip'i kendisi açar. İstek izinin ardında, çünkü iz cevabın durumunu okur, sıkıştırma gövdeyi değiştirir.
*/
app.use('*', compress());

/**
 * Yakalanmamış hata → kayıt + zarf: kayıt cevabı bekletmez ve istemci 500'ünü hemen alır. Gövde de zarf sözleşmesindedir;
 * mobil istemci hata dalında bile `{ data, error }` okur ve iç mesaj sızmaz.
 */
app.onError((err, c) => {
  void captureError(err, {
    source: SOURCES.mobileApiHttp,
    path: c.req.path,
    context: { reqId: c.get('reqId'), method: c.req.method },
  });
  return fail(c, 'internal', 500);
});

app.get('/health', (c) => c.json({ ok: true, service: 'lezzet-mobile-api' }));

app.route('/api/v1', v1);
