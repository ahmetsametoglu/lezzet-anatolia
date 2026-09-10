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

// İstek izi ÖNCE takılır: sonraki her şey `reqId` taşısın (OBSERVABILITY §3).
//
// apps/backend'in request-log'u ile bilinçli paralel; olgunlaşınca observability'ye terfi
// (02-mimari §3.1). Seviye durumdan türer: 5xx bizim hatamız, 4xx çağıranın, gerisi bilgi.
// Hata KAYDETMEZ — o `app.onError`'ın işi; ikisi karışırsa aynı hata iki kez kaydedilir.
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
  YANIT SIKIŞTIRMA (21.303). Katalog cevapları görsel türevleriyle (`frames`) büyüdü — ölçüldü 10.09:
  vitrin 5,9 → 90,5 KB, 20 ürünlük sayfa 10,5 → 113,5 KB. Büyüyen şey tekrar eden CDN adresleri ve gzip
  onları ~%95 küçültüyor (vitrin 4,4 KB — sözleşme büyümeden önceki ham boyundan az). İstemcinin `fetch`i
  (Android OkHttp · iOS NSURLSession) `Accept-Encoding: gzip` gönderip açıyor; uygulamada değişiklik yok.

  İstek izinin ARDINDA: iz cevabın durumunu okur, sıkıştırma gövdeyi değiştirir. Akış ucu yok (SSE —
  ölçüldü); ikili gövdeler (PDF, medya) Hono'nun sıkıştırılabilir tür süzgecine takılmaz, olduğu gibi gider.
*/
app.use('*', compress());

/**
 * Yakalanmamış hata → kayıt + zarf. Kayıt cevabı BEKLETMEZ (`void` — apps/backend deseni);
 * istemci 500'ünü hemen alır. Gövde de zarf sözleşmesindedir: mobil istemci hata dalında bile
 * `{ data, error }` şekli okur, iç mesaj sızmaz (`internal` bir anahtardır, metin ekranda yaşar).
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
