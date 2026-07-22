import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import cron from 'node-cron';

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true, service: 'lezzet-backend' }));

// Zamanlı işler buraya takılır (rezervasyon TTL süpürme, geri bildirim daveti...).
// Kural (STACK §13): her iş taramalı + idempotent; backend tek instance (fork mode).
cron.schedule('* * * * *', () => {
  // iskelet tik — henüz iş yok
});

const port = Number(process.env.BACKEND_PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.warn(`backend listening on :${info.port}`);
});
