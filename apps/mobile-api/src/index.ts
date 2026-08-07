/**
 * Süreç girişi. **Env ELLE ve İLK import'ta yüklenir** (apps/backend deseni — orada beş cron'un
 * beşini birden düşüren arızanın düzeltmesiydi, 03.08): mobile-api Next.js değil, `tsx
 * src/index.ts` ile koşar ve Node `.env` dosyası okumaz. Yükleme `./env`'de YAN ETKİ — ESM'de
 * importlar hoist edildiği için aradaki bir `loadEnv()` çağrısı alttaki importlardan sonra koşardı.
 */
import './env';
import { serve } from '@hono/node-server';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import { app } from './app';

/**
 * SÜREÇ DÜZEYİ EMNİYET AĞI (apps/backend denetim G2'nin aynısı). Hono `onError` her isteği sarar
 * ama sarmalın DIŞINDA doğan başıboş bir promise reddi ona düşmez; modern Node'da bu süreci
 * öldürür ve ölüm hiçbir yere yazılmaz. İki kancanın işi ayrı:
 * - `unhandledRejection`: süreç ayakta kalır, kayıt düşer.
 * - `uncaughtException`: durum artık güvenilmez, TEMİZ ÇIKILIR — süpervizör yeniden başlatır.
 *   Kayıt `await` edilir: `process.exit` kaydı yarıda kesmesin.
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
