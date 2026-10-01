/**
 * Süreç girişi; env ilk içe aktarımda `./env`'in yan etkisiyle yüklenir, çünkü mobile-api `tsx` ile koşar ve Node `.env`
 * okumaz. Yükleme bir çağrı olsaydı ESM içe aktarımları yukarı taşıdığı için alttaki modüllerden sonra koşardı.
 */
import './env';
import { serve } from '@hono/node-server';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import { app } from './app';

/**
 * Hono `onError` isteğin dışında doğan promise reddini görmez ve Node böyle bir ret yüzünden süreci iz bırakmadan öldürür;
 * `unhandledRejection` kaydı düşüp süreci ayakta tutar. `uncaughtException` sonrası durum güvenilmez: kayıt bitince temiz
 * çıkılır, süpervizör yeniden başlatır.
 */
process.on('unhandledRejection', (reason) => {
  void captureError(reason, { source: SOURCES.mobileApiProcess, context: { fatal: false, hook: 'unhandledRejection' } });
});

process.on('uncaughtException', (error) => {
  void captureError(error, { source: SOURCES.mobileApiProcess, context: { fatal: true, hook: 'uncaughtException' } }).finally(() => {
    logger.error({ err: error.message }, 'yakalanmamış istisna — süreç kapanıyor, süpervizör yeniden başlatacak');
    process.exit(1);
  });
});

// Port çakışmaz: web 3000, backend 8787; mobile-api varsayılanı 3002 — env'den ezilebilir.
const port = Number(process.env.MOBILE_API_PORT ?? 3002);
serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ port: info.port }, 'mobile-api ayakta');
});
