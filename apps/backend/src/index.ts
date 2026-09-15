/**
 * Env elle yüklenir, çünkü backend Next.js değil: `tsx src/index.ts` ile koşar ve Node `.env` dosyasını kendiliğinden okumaz;
 * yüklenmezse cron'lar ilk turda düşer ve kayıtları da aynı eksik env yüzünden yazılamaz. Yükleme `./env` modülünde yan etki
 * olarak durur ve ilk import'tur, çünkü ESM import'ları hoist eder ve aradaki bir `loadEnv()` satırı modül-üstü koddan sonra koşardı.
 */
import './env';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import cron from 'node-cron';
import { setAiUsageRecorder } from '@lezzet/ai';
import { aiUsageRecorder } from '@lezzet/application/ai/usage-recorder';
import { serviceDb } from '@lezzet/database';
import { HEALTH_COLLECT_INTERVAL_MIN } from '@lezzet/domain-core';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import { requestLog, type AppEnv } from './http/request-log';
import { mcpHandler } from './mcp/route';
import { metaWebhook, metaWebhookVerify } from './webhooks/meta';
import { sendcloudWebhook } from './webhooks/sendcloud';
import { COLLECT_HEALTH, collectHealthJob } from './jobs/collect-health';
import { EXPIRE_PROPOSALS, expireProposalsJob } from './jobs/expire-proposals';
import { CREATE_FEEDBACK_REQUESTS, createFeedbackRequestsJob } from './jobs/feedback-requests';
import { NOTIFICATION_RETENTION, notificationRetentionJob } from './jobs/notification-retention';
import { PURGE_OBSERVABILITY, purgeObservabilityJob } from './jobs/purge-observability';
import { ANALYTICS_INSIGHT, analyticsInsightJob } from './jobs/analytics-insight';
import { ANALYTICS_ROLLUP, analyticsRollupJob } from './jobs/analytics-rollup';
import { GEOCODE_ADDRESSES, geocodeAddressesJob } from './jobs/geocode-addresses';
import { ZONE_AVAILABLE, zoneAvailableJob } from './jobs/zone-available';
import { runJob } from './jobs/runner';
import { PUSH_RECEIPTS, pushReceiptsJob } from './jobs/push-receipts';
import { SEND_FEEDBACK_INVITES, sendFeedbackInvitesJob } from './jobs/send-feedback-invites';
import { SUPPORT_AI, supportAiJob } from './jobs/support-ai';
import { TICKET_REPLY_MAIL, ticketReplyMailJob } from './jobs/ticket-reply-mail';
import { SWEEP_RESERVATIONS, sweepReservations } from './jobs/sweep-reservations';
import { SWEEP_UNPAID_DRAFTS, sweepUnpaidDraftsJob } from './jobs/sweep-unpaid-drafts';
import { SHIPMENT_WATCH, shipmentWatchJob } from './jobs/shipment-watch';
import { SHIPMENT_ORPHAN, shipmentOrphanJob } from './jobs/shipment-orphan';
import { TRANSLATE_USER_TEXT, translateUserTextJob } from './jobs/translate-user-text';

/**
 * Süreç düzeyi emniyet ağı: sarmalın dışında doğan bir promise reddi ne `runJob`a ne `onError`a düşer ve süreci kayıtsız
 * öldürür. `unhandledRejection`da süreç ayakta kalır, `uncaughtException`da durum güvenilmez olduğu için temiz çıkılır (pm2 yeniden
 * başlatır); kayıt `await` edilir ki `process.exit` onu yarıda kesmesin.
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

/*
  AI kullanım kaydı: koşucunun kancasına kaydedici takılır ve bu süreçteki her model koşusu `ai_usage`a düşer; takılmasaydı
  bu süreçteki koşular bedava görünürdü.
*/
setAiUsageRecorder(aiUsageRecorder(serviceDb()));

const app = new Hono<AppEnv>();

// İstek izi ÖNCE takılır: sonraki her şey `reqId` taşısın (OBSERVABILITY §3).
app.use('*', requestLog);

/**
 * Yakalanmamış hata → kayıt; kayıt `void` ile ateşlenir ve istemci 500'ünü hemen alır, çünkü hata kaydı yüzünden yavaşlayan
 * bir cevap hatanın üstüne ikinci bir sorun koyar.
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

/**
 * Bilinmeyen yol JSON 404 döner, düz metin değil: MCP istemcisi bağlanırken OAuth keşfi dener (`/.well-known/oauth-*`) ve düz
 * metin 404'ü ayrıştıramayınca "SDK auth failed" diye yanlış yere baktırır. JSON gövdeyle istemci OAuth olmadığı sonucuna
 * varıp header'lı yola döner.
 */
app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));

// MCP yönetici asistanı: yerel istemci doğrudan bağlanır, bütün metodlar tek handler'da (streamable HTTP; POST/GET/DELETE
// ayrımını SDK taşıması yapar).
app.all('/mcp', mcpHandler);

/*
  Taşıyıcı webhook'u burada, çünkü aynı uzlaştırmayı (`syncShipmentStatus`) iki cron da çağırıyor ve onlar bu süreçte; web'e
  koymak tek işi iki sürece bölerdi. Gövde imza doğrulanmadan işlenmez ve doğrulama ham gövde ister.
*/
app.post('/webhooks/sendcloud', sendcloudWebhook);

/*
  Meta webhook'u (WhatsApp, Messenger, Instagram): tek adres, kurulum el sıkışması `GET`, olaylar `POST`. Backend'de, çünkü
  Next.js dev sunucusu rotayı ilk çağrıda derlerken sağlayıcı beklemez ve iki webhook tek tünelden geçer.
*/
app.get('/webhooks/meta', metaWebhookVerify);
app.post('/webhooks/meta', metaWebhook);

// Zamanlı işler: her iş taramalı ve idempotent, backend tek örnek; `runJob` üst üste binmeyi engeller ve hatayı yutmaz.
// Rezervasyon süpürmesi dakikada bir, çünkü süresi dolan stok en geç bir dakikada başkasına açılmalı.
cron.schedule('* * * * *', () => {
  void runJob(SWEEP_RESERVATIONS, sweepReservations);
});

// Ödeme zamanlayıcısı dakikada bir, penceresi kapanmış kart taslaklarını Stripe'a sorar; rezervasyon süpürmesinden ayrı iş,
// çünkü sağlayıcı düşerse stok temizliği durmamalı.
cron.schedule('* * * * *', () => {
  void runJob(SWEEP_UNPAID_DRAFTS, sweepUnpaidDraftsJob);
});

// Geri bildirim daveti taraması günde bir sabah 09:00'da: eşik gün cinsinden (teslim +10 gün), saat ise müşterinin okuyabileceği
// vakit için; tarama idempotent olduğu için kaçan gün ertesi turda telafi olur.
cron.schedule('0 9 * * *', () => {
  void runJob(CREATE_FEEDBACK_REQUESTS, createFeedbackRequestsJob);
}, { timezone: 'Europe/Paris' });

// Davet kuyruğu on beş dakikada bir boşaltılır: gönderim düşebilen bir dış sağlayıcıya bağlı ve günde bir denemek sabahki bir
// kesintide daveti ertesi güne bırakırdı; kuyruk boşken tur tek sorgudur.
cron.schedule('*/15 * * * *', () => {
  void runJob(SEND_FEEDBACK_INVITES, sendFeedbackInvitesJob);
});

// Push makbuz süpürmesi on beş dakikada bir: makbuzu sorulmayan çürük jetonlar sonsuza dek denenir ve gönderici spam muamelesi
// görür; tur çürük jetonu budar, müşteri mail sınıfına döner.
cron.schedule('4,19,34,49 * * * *', () => {
  void runJob(PUSH_RECEIPTS, pushReceiptsJob);
});

// Sistem sağlığı iki dakikada bir toplanır (`/operations/system` okur): daha sık toplamak saklamayı katlar, daha seyrek toplamak
// dolan bir diski panik anından önce göstermez.
cron.schedule(`*/${HEALTH_COLLECT_INTERVAL_MIN} * * * *`, () => {
  void runJob(COLLECT_HEALTH, collectHealthJob);
});

// Gözlemleme saklama süpürmesi günde bir: çözülmüş hata 90 gün, sağlık görüntüsü 14 gün; çözülmemiş hata süpürülmez, çünkü açık
// bir sorun silinince kaybolmaz, yalnız görünmez olur.
cron.schedule('20 3 * * *', () => {
  void runJob(PURGE_OBSERVABILITY, purgeObservabilityJob);
}, { timezone: 'Europe/Paris' });

// Personel bildirim saklaması günde bir, ayrı işte (ayrı `job_run` izi): görülmüş personel satırı 90 günde düşer, görülmemiş
// süpürülmez, müşteri satırına dokunulmaz.
cron.schedule('35 3 * * *', () => {
  void runJob(NOTIFICATION_RETENTION, notificationRetentionJob);
}, { timezone: 'Europe/Paris' });

// Analitik özet ve bakım günde bir, gün kapandıktan sonra: sıra bölüm bakımı → özet → saklama süpürmesi, çünkü silme özetten önce
// koşarsa o günün verisi sessizce kaybolur.
cron.schedule('40 3 * * *', () => {
  void runJob(ANALYTICS_ROLLUP, analyticsRollupJob);
}, { timezone: 'Europe/Paris' });

// Adres koordinatı taraması on dakikada bir: yeni adres kurye rotasına en erken ertesi gün girer, yani gecikme görünmez; kuyruk
// boşken tur tek sorgudur.
cron.schedule('*/10 * * * *', () => {
  void runJob(GEOCODE_ADDRESSES, geocodeAddressesJob);
});

// Bölge açıldı → bekleyenlere haber, saatte bir: olay değil uzlaştırma işi, çünkü kod bölgeye farklı yollardan girebilir ve kaçan
// gönderim hata vermez; saatte bir yeter, bölge açmak dakikalık bir olay değil.
cron.schedule('15 * * * *', () => {
  void runJob(ZONE_AVAILABLE, zoneAvailableJob);
}, { timezone: 'Europe/Paris' });

// Haftalık AI içgörü pazartesi sabahı, özet turundan sonra: içgörü önce koşsaydı pazarın satırları henüz yazılmamış olurdu ve
// model boş günü "hafta sonu çöktü" diye okurdu; haftada bir, çünkü günlük dalgalanma eğilim değildir.
cron.schedule('20 4 * * 1', () => {
  void runJob(ANALYTICS_INSIGHT, analyticsInsightJob);
}, { timezone: 'Europe/Paris' });

// Kullanıcı metinlerinin çevirisi beş dakikada bir, partili: yazılan yorumun öteki dillere açılma süresi bu, daha sık koşmak boş
// turlarla sağlayıcıyı meşgul ederdi. AI yapılandırılmamışsa tur hiçbir satırı damgalamaz ki geçmiş sonradan çevrilebilsin.
cron.schedule('*/5 * * * *', () => {
  void runJob(TRANSLATE_USER_TEXT, translateUserTextJob);
});

/*
  AI destek turu dakikada bir: model çağrısı tur başına değil müşteri mesajı başına olduğu için sıklık maliyet eklemez (cevap
  gidince satır taramadan çıkar, sağlayıcı hatasında fren `shouldBackOff`). Asıl yol webhook'tan olay tetikli cevaptır; bu
  tarama onun emniyet ağı ve ikisi aynı kapıdan geçtiği için çift cevap üretmez.
*/
cron.schedule('* * * * *', () => {
  void runJob(SUPPORT_AI, supportAiJob);
});

/*
  Bekleyen cevap mailleri dakikada bir: mail, okuma süresi (`REPLY_MAIL_DELAY_MIN`) dolunca hâlâ okunmamışsa gider ve turun
  sıklığı bu gecikmenin çözünürlüğüdür; kısmi indeks yalnız bekleyenlere baktığı için tur ucuzdur.
*/
cron.schedule('* * * * *', () => {
  void runJob(TICKET_REPLY_MAIL, ticketReplyMailJob);
});

/*
  Takılı gönderi nöbeti saatte bir: Sendcloud on denemeden sonra pes eder ve kesintide webhook'lar kalıcı yutulur, bu tur o
  gönderileri kapatır. Saat başı değil 25 geçe, çünkü saat başı ve gece koşan işlerle aynı dakikaya düşerse yerel Supabase'de
  birbirini bekletir.
*/
cron.schedule('25 * * * *', () => {
  void runJob(SHIPMENT_WATCH, shipmentWatchJob);
});

/*
  Öksüz ya da hayalet gönderi mutabakatı haftada bir: aranan şey nadir ve pahalı, günlük tarama oran sınırını yerdi. Yalnız
  tespit eder, düzeltme elle (`docs/runbook/kargo-oksuz-gonderi.md`), çünkü yoldaki koliyi otomatik iptal etmek malı yolundan
  çevirir.
*/
cron.schedule('50 5 * * 1', () => {
  void runJob(SHIPMENT_ORPHAN, shipmentOrphanJob);
}, { timezone: 'Europe/Paris' });

// Asistan önerilerinin süre süpürmesi saatte bir: öneri ömrü saat mertebesinde ve tur görüntüyü değil kaydı düzeltir, geçmişte
// "süresi doldu" ile "reddettim" ayrı görünsün.
cron.schedule('35 * * * *', () => {
  void runJob(EXPIRE_PROPOSALS, expireProposalsJob);
}, { timezone: 'Europe/Paris' });

// `??` değil `||`: boş bırakılmış `BACKEND_PORT=` nullish değildir ve `Number('')` 0, yani her başlatmada rastgele port olurdu.
const port = Number(process.env.BACKEND_PORT) || 8787;
serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ port: info.port }, 'backend ayakta');
});
