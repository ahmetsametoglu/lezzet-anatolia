/**
 * **Env ELLE yüklenir — ve bu bir arıza düzeltmesidir (03.08).**
 *
 * Backend Next.js DEĞİL: `tsx src/index.ts` ile koşar ve Node hiçbir `.env` dosyasını
 * kendiliğinden okumaz. Yükleme hiç yazılmamıştı, yani süreç env'siz ayağa kalkıyordu ve **beş
 * cron'un beşi de** ilk turunda `serviceDb()` üzerinde "Supabase env eksik" ile düşüyordu. Sessiz
 * de değildi ama görünmüyordu: `runJob` hatayı yakalayıp `job_run`/`error_log`'a yazmaya çalışıyor,
 * o yazma da AYNI eksik env yüzünden düşüyor — yani arızanın kaydı, arızanın kendisi yüzünden
 * tutulamıyordu. Ölçüldü: `SUPABASE_SECRET_KEY: false`.
 *
 * **Yükleme bir YAN ETKİ olarak `./env` modülünde ve çağrı burada DEĞİL** — çünkü ESM'de
 * `import`'lar hoist edilir: aradaki bir `loadEnv()` satırı, altındaki importlar DEĞERLENDİRİLDİKTEN
 * sonra koşardı ve modül-üstü kod (`serviceDb()` tekili gibi) env'i boş görürdü. Modül grafiği
 * sırayla ve derinlemesine değerlendirildiği için ilk sıradaki bu import garantiyi verir.
 */
import './env';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import cron from 'node-cron';
import { HEALTH_COLLECT_INTERVAL_MIN } from '@lezzet/domain-core';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import { requestLog, type AppEnv } from './http/request-log';
import { mcpHandler } from './mcp/route';
import { COLLECT_HEALTH, collectHealthJob } from './jobs/collect-health';
import { EXPIRE_PROPOSALS, expireProposalsJob } from './jobs/expire-proposals';
import { CREATE_FEEDBACK_REQUESTS, createFeedbackRequestsJob } from './jobs/feedback-requests';
import { PURGE_OBSERVABILITY, purgeObservabilityJob } from './jobs/purge-observability';
import { ANALYTICS_INSIGHT, analyticsInsightJob } from './jobs/analytics-insight';
import { ANALYTICS_ROLLUP, analyticsRollupJob } from './jobs/analytics-rollup';
import { ZONE_AVAILABLE, zoneAvailableJob } from './jobs/zone-available';
import { runJob } from './jobs/runner';
import { SEND_FEEDBACK_INVITES, sendFeedbackInvitesJob } from './jobs/send-feedback-invites';
import { SUPPORT_AI, supportAiJob } from './jobs/support-ai';
import { TICKET_REPLY_MAIL, ticketReplyMailJob } from './jobs/ticket-reply-mail';
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

/**
 * Bilinmeyen yol → **JSON 404** (Hono'nun varsayılanı düz metin "404 Not Found").
 *
 * Kozmetik değil, ölçülmüş bir arıza düzeltmesi (09.08): MCP istemcisi bağlanırken önce OAuth
 * keşfi deniyor (`/.well-known/oauth-*`). O uçlar bizde YOK ve olmamalı — bu sunucu header'lı
 * Bearer ile çalışıyor. Ama istemci 404 gövdesini JSON diye ayrıştırmaya kalkıyor, düz metinde
 * `SyntaxError` fırlatıyor ve kullanıcıya bunu **"SDK auth failed"** diye gösteriyor: anahtar ve
 * sunucu sapasağlamken "kimlik doğrulanamadı" diyen, yanlış yere baktıran bir hata.
 *
 * JSON gövde ile istemci "burada OAuth yok" sonucuna temiz varır ve header'lı yola döner.
 */
app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));

// MCP yönetici asistanı — deneme dilimi (22.1): salt-okuma üç araç, .env anahtarıyla.
// Yerel istemci (Claude Code) doğrudan bağlanır; claude.ai connector'ı canlıya çıkışı bekler
// (AI_ADMIN_ASSISTANT §11). Tüm metodlar tek handler'da: streamable HTTP, POST/GET/DELETE ayrımını
// SDK transport'u yapar.
app.all('/mcp', mcpHandler);

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

// Analitik özet + bakım (13.1) — günde bir, gözlemleme süpürmesinden SONRA.
//
// Üç iş tek turda ve sıraları kritik: bölüm bakımı → günlük özet → saklama süpürmesi. **Özet ÖNCE,
// silme SONRA** (`ANALYTICS §5`): ters sırada bir gün özet koşmazsa o günün verisi hem özette hem
// ham defterde yok olur ve kayıp sessiz kalır.
//
// Gece 3'ten sonra çünkü gün kapanmış olmalı: iş DÜNÜ özetliyor, bugünü değil — gün kapanmadan
// üretilen özet eksiktir ve eksik bir sayıyı ekranda bir gün boyunca göstermek, hiç göstermemekten
// kötüdür.
cron.schedule('40 3 * * *', () => {
  void runJob(ANALYTICS_ROLLUP, analyticsRollupJob);
}, { timezone: 'Europe/Paris' });

// Bölge açıldı → bekleyenlere haber (14.10 · 19.21) — saatte bir.
//
// **Olay değil UZLAŞTIRMA işi:** bölgenin kaydedilmesine bağlı bir tetik tek bir yazma yolunu
// varsayardı; oysa bir kod bölgeye migration'la, elle SQL'le ya da bugün olmayan ikinci bir ekrandan
// da girebilir ve kaçan gönderim HATA VERMEZ — müşteri yalnız hiç haber almaz. İş her turda
// "kapsanmış hâle gelmiş ve haberi gitmemiş" bekleyişleri arar, yani sistem kendini onarır.
//
// **Saatte bir yeter:** bölge açmak günlerce süren bir karardır, dakikalık bir olay değil. Daha sık
// koşmak boş turlarla veritabanını meşgul ederdi; daha seyrek koşmak müşteriyi bir gün bekletirdi.
cron.schedule('15 * * * *', () => {
  void runJob(ZONE_AVAILABLE, zoneAvailableJob);
}, { timezone: 'Europe/Paris' });

// Haftalık AI içgörü (13.7) — pazartesi sabahı, özet turundan SONRA.
//
// **Sıra şart:** özet dünü işliyor, içgörü de dün dahil son yedi günü okuyor. İçgörü önce koşsaydı
// pazar gününün satırları henüz yazılmamış olurdu ve model haftanın son gününü boş görüp "hafta
// sonu çöktü" derdi — yanlış olmakla kalmaz, inandırıcı olurdu.
//
// **Pazartesi ve haftada bir:** anlatının sorusu "geçen hafta ne oldu". Her gün üretilseydi hem
// fatura yedi katına çıkar hem yönetici her gün biraz farklı bir hikâye okurdu; günlük dalgalanma
// bir haftalık eğilim değildir.
cron.schedule('20 4 * * 1', () => {
  void runJob(ANALYTICS_INSIGHT, analyticsInsightJob);
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

// AI destek turu (16.5 · 20.4) — beş dakikada bir: özerk cevaplar (mod `ai`) + hibrit taslaklar
// (talep ve WhatsApp). Çeviriyle AYNI sıklık ve aynı gerekçe: müşteri cevabının gecikmesi bir
// görünürlük kararı, beş dakika "hemen cevaplandı" hissinin içinde. Tur başına çağrı tavanı işte
// (`BATCH`); önbellek kuralı çekirdekte — taze taslaklı satır modeli hiç çağırtmaz.
cron.schedule('*/5 * * * *', () => {
  void runJob(SUPPORT_AI, supportAiJob);
});

/*
  BEKLEYEN CEVAP MAİLLERİ (17.08) — DAKİKADA BİR, ve sıklık burada bilerek yüksek.

  Cevap maili artık anında gitmiyor: müşteriye okuması için bir süre tanınıyor
  (`REPLY_MAIL_DELAY_MIN`, varsayılan 5 dk) ve o süre dolduğunda HÂLÂ okunmamışsa gönderiliyor.
  Süpürgenin turu, gecikmenin ÇÖZÜNÜRLÜĞÜDÜR: beş dakikada bir koşsaydı 5 dakikalık gecikme
  fiilen 5–10 dakika arası değişirdi. Tur ucuz — kısmi indeks yalnız bekleyenlere bakıyor ve
  kümenin normal hâli boş.
*/
cron.schedule('* * * * *', () => {
  void runJob(TICKET_REPLY_MAIL, ticketReplyMailJob);
});

// `??` DEĞİL `||` — ve bu bir arıza düzeltmesidir (ölçüldü 09.08): `.env.local`'da değişken
// TANIMLI ama BOŞ bırakılmıştı (`BACKEND_PORT=`). Boş dizgi nullish değildir, yani `??` onu
// yakalamaz; `Number('')` = 0 ve port 0 "işletim sistemi rastgele boş port versin" demektir.
// Sonuç sessiz ve tam olarak yanıltıcıydı: süreç sağlıklı ayağa kalkıyor, log'a doğru portu
// yazıyor — ama her başlatmada BAŞKA bir port (ölçülen: 60800) ve 8787'yi bekleyen hiçbir istemci
// bağlanamıyor. Değeri OLMAYAN bir ayar ile BOŞ bırakılmış bir ayar aynı şeydir: ikisinde de
// varsayılan geçerlidir.
// Asistan önerilerinin süre süpürmesi (22.3) — saatte bir. Öneri ömrü saat mertebesinde
// (varsayılan 24 saat), yani dakikalık bir tur boş dönerdi; saatlik tarama kaydı "süresi doldu"
// olarak düzeltmeye yeter. Kuyruk okuması zaten bayat satırı göstermiyor — bu iş GÖRÜNTÜYÜ değil
// KAYDI düzeltir: geçmişte "süresi doldu" ile "reddettim" ayrı görünmeli.
cron.schedule('35 * * * *', () => {
  void runJob(EXPIRE_PROPOSALS, expireProposalsJob);
}, { timezone: 'Europe/Paris' });

const port = Number(process.env.BACKEND_PORT) || 8787;
serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ port: info.port }, 'backend ayakta');
});
