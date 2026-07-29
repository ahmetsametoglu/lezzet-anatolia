import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import cron from 'node-cron';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import { requestLog, type AppEnv } from './http/request-log';
import { COLLECT_HEALTH, collectHealthJob } from './jobs/collect-health';
import { CREATE_FEEDBACK_REQUESTS, createFeedbackRequestsJob } from './jobs/feedback-requests';
import { PURGE_OBSERVABILITY, purgeObservabilityJob } from './jobs/purge-observability';
import { runJob } from './jobs/runner';
import { SWEEP_RESERVATIONS, sweepReservations } from './jobs/sweep-reservations';

const app = new Hono<AppEnv>();

// İstek izi ÖNCE takılır: sonraki her şey `reqId` taşısın (OBSERVABILITY §3).
app.use('*', requestLog);

/**
 * Yakalanmamış hata → kayıt. Hono `onError` gövdesi cevabı BEKLETMEZ: kayıt `void` ile ateşlenir,
 * istemci 500'ünü hemen alır. Hata kaydı yüzünden yavaşlayan bir cevap, hatanın üstüne ikinci bir
 * sorun koymaktır.
 */
app.onError((err, c) => {
  void captureError(err, {
    source: SOURCES.backendHttp,
    path: c.req.path,
    context: { reqId: c.get('reqId'), method: c.req.method },
  });
  return c.json({ error: 'internal' }, 500);
});

app.get('/health', (c) => c.json({ ok: true, service: 'lezzet-backend' }));

// Zamanlı işler buraya takılır. Kural (STACK §13): her iş taramalı + idempotent; backend tek
// instance (fork mode). Kabuk (`runJob`) üst üste binmeyi engeller, hatayı yutmaz, `last_run` bırakır.
//
// Rezervasyon TTL süpürme — dakikada bir. Sıklık TTL'den (varsayılan 30 dk) çok daha küçük olmalı:
// süresi dolan stok en geç bir dakika içinde başkasına açılır.
cron.schedule('* * * * *', () => {
  void runJob(SWEEP_RESERVATIONS, sweepReservations);
});

// Geri bildirim daveti taraması (17.2) — günde bir, sabah 09:00 Paris.
//
// Sıklık günlüktür çünkü eşik gün cinsindendir (teslim +10 gün): saat başı taramak aynı satırları
// 24 kez okuyup hiçbir şey yapmazdı. SAAT ise müşteri içindir — davet e-postası gecenin ikisinde
// değil, okunabilecek bir vakitte düşer. Tarama idempotent olduğu için kaçan bir gün ertesi turda
// telafi olur; "o gün davet edilecekler" diye kaybolan bir küme yok.
cron.schedule('0 9 * * *', () => {
  void runJob(CREATE_FEEDBACK_REQUESTS, createFeedbackRequestsJob);
}, { timezone: 'Europe/Paris' });

// Sistem sağlığı (18.5) — iki dakikada bir sunucu/süreç/servis görüntüsü. `/operations/system` okur.
//
// Sıklık ekranın çözünürlüğünü belirliyor: daha sık toplamak 14 günlük saklamayı katlar, daha seyrek
// toplamak "disk ne zaman doldu" sorusunu bulanıklaştırır. İki dakika, dolan bir diski panik anından
// önce görmeye yetiyor.
cron.schedule('*/2 * * * *', () => {
  void runJob(COLLECT_HEALTH, collectHealthJob);
});

// Gözlemleme saklama süpürmesi (18.5) — günde bir, gecenin sessiz saatinde.
//
// Çözülmüş hata 90 gün, sağlık görüntüsü 14 gün. Çözülmemiş hata SÜPÜRÜLMEZ: açık bir sorun
// silinince kaybolmaz, yalnız görünmez olur.
cron.schedule('20 3 * * *', () => {
  void runJob(PURGE_OBSERVABILITY, purgeObservabilityJob);
}, { timezone: 'Europe/Paris' });

const port = Number(process.env.BACKEND_PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ port: info.port }, 'backend ayakta');
});
