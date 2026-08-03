import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import cron from 'node-cron';
import { HEALTH_COLLECT_INTERVAL_MIN } from '@lezzet/domain-core';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import { requestLog, type AppEnv } from './http/request-log';
import { COLLECT_HEALTH, collectHealthJob } from './jobs/collect-health';
import { CREATE_FEEDBACK_REQUESTS, createFeedbackRequestsJob } from './jobs/feedback-requests';
import { PURGE_OBSERVABILITY, purgeObservabilityJob } from './jobs/purge-observability';
import { runJob } from './jobs/runner';
import { SEND_FEEDBACK_INVITES, sendFeedbackInvitesJob } from './jobs/send-feedback-invites';
import { SWEEP_RESERVATIONS, sweepReservations } from './jobs/sweep-reservations';
import { TRANSLATE_USER_TEXT, translateUserTextJob } from './jobs/translate-user-text';

/**
 * SÜREÇ DÜZEYİ EMNİYET AĞI (denetim G2). `runJob` her cron'u sarıyor, Hono `onError` her isteği —
 * ama sarmalın DIŞINDA doğan bir başıboş promise reddi hiçbirine düşmez. Modern Node'da bu süreci
 * ÖLDÜRÜR ve ölüm hiçbir yere yazılmaz: tüm cron'lar durur, `job_run` bayatlar, sağlık toplayıcısı
 * da aynı süreçte olduğu için ekran son görüntüde donup kalır. "Ölçülemeyen değer sıfır değildir"
 * kuralının süreç hâli — sistem iyi görünürken aslında yoktur.
 *
 * İki kancanın işi AYRI:
 * - `unhandledRejection`: süreç ayakta kalır (Node bunu ölümcül saymaya geçse bile kayıt önce düşer).
 * - `uncaughtException`: durum artık güvenilmez, TEMİZ ÇIKILIR — süpervizör (pm2) yeniden başlatır.
 *   Bozuk bellekle koşmaya devam eden bir süreç, düşen bir süreçten tehlikelidir.
 *
 * Kayıt `await` edilir: `process.exit` kaydı yarıda kesmesin — asıl amaç o satırın yazılması.
 */
process.on('unhandledRejection', (reason) => {
  void captureError(reason, { source: SOURCES.backendProcess, context: { fatal: false, hook: 'unhandledRejection' } });
});

process.on('uncaughtException', (error) => {
  void captureError(error, { source: SOURCES.backendProcess, context: { fatal: true, hook: 'uncaughtException' } }).finally(() => {
    logger.error({ err: error.message }, 'yakalanmamış istisna — süreç kapanıyor, süpervizör yeniden başlatacak');
    process.exit(1);
  });
});

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

// Davet kuyruğunun boşaltılması (17.2) — on beş dakikada bir.
//
// Oluşturmadan AYRI ve daha SIK: oluşturma günde bir yeter (eşik gün cinsinden), ama gönderim bir
// dış sağlayıcıya bağlı ve o sağlayıcı düşebilir. Günde bir denemek, sabahki bir kesintide daveti
// ertesi güne bırakırdı. On beş dakika, kesintiyi müşteri fark etmeden telafi edecek kadar sık;
// kuyruk boşken iş tek sorguyla no-op olduğu için bedeli de yok.
cron.schedule('*/15 * * * *', () => {
  void runJob(SEND_FEEDBACK_INVITES, sendFeedbackInvitesJob);
});

// Sistem sağlığı (18.5) — iki dakikada bir sunucu/süreç/servis görüntüsü. `/operations/system` okur.
//
// Sıklık ekranın çözünürlüğünü belirliyor: daha sık toplamak 14 günlük saklamayı katlar, daha seyrek
// toplamak "disk ne zaman doldu" sorusunu bulanıklaştırır. İki dakika, dolan bir diski panik anından
// önce görmeye yetiyor.
cron.schedule(`*/${HEALTH_COLLECT_INTERVAL_MIN} * * * *`, () => {
  void runJob(COLLECT_HEALTH, collectHealthJob);
});

// Gözlemleme saklama süpürmesi (18.5) — günde bir, gecenin sessiz saatinde.
//
// Çözülmüş hata 90 gün, sağlık görüntüsü 14 gün. Çözülmemiş hata SÜPÜRÜLMEZ: açık bir sorun
// silinince kaybolmaz, yalnız görünmez olur.
cron.schedule('20 3 * * *', () => {
  void runJob(PURGE_OBSERVABILITY, purgeObservabilityJob);
}, { timezone: 'Europe/Paris' });

// Kullanıcı metinlerinin çevirisi (20.2) — beş dakikada bir, partili (20 metin/tur).
//
// **Sıklık bir GÖRÜNÜRLÜK kararıdır:** yazılan yorum ne kadar sürede öteki dillerdeki okuyucuya
// açılır. Beş dakika, ürün sayfasını yenileyen birinin fark etmeyeceği kadar kısa; her dakika
// koşmak ise boş turlarla sağlayıcıya gereksiz istek atardı — kuyruk çoğu zaman boştur.
//
// AI yapılandırılmamışsa tur kendini atlar (`not_configured`) ve HİÇBİR satırı damgalamaz:
// anahtar sonradan geldiğinde geçmişin tamamı çevrilebilir kalır.
cron.schedule('*/5 * * * *', () => {
  void runJob(TRANSLATE_USER_TEXT, translateUserTextJob);
});

const port = Number(process.env.BACKEND_PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ port: info.port }, 'backend ayakta');
});
