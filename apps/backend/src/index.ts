import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import cron from 'node-cron';
import { CREATE_FEEDBACK_REQUESTS, createFeedbackRequestsJob } from './jobs/feedback-requests';
import { runJob } from './jobs/runner';
import { SWEEP_RESERVATIONS, sweepReservations } from './jobs/sweep-reservations';

const app = new Hono();

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

const port = Number(process.env.BACKEND_PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.warn(`backend listening on :${info.port}`);
});
