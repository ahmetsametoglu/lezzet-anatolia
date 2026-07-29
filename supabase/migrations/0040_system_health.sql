-- Modül 18 — Sistem sağlığı anlık görüntüsü (18.5). `OBSERVABILITY §2`, `data-model/operasyon.md`.
--
-- Backend cron'u iki dakikada bir sunucu + süreç + servis + uygulama metriklerini toplar, eşiklerden
-- bir durum türetir ve TEK satır yazar. Operasyon sistem sayfası son satırı kart, geçmişi grafik okur.
--
-- **Neden anlık görüntü, neden zaman serisi veritabanı değil:** Prometheus/InfluxDB bir bileşen daha,
-- bir port daha, bir yedek daha demek. İki dakikalık çözünürlükte 14 gün ≈ 10.000 satır — Postgres
-- için önemsiz — ve sorduğumuz sorular ("disk ne zamandan beri doluyor") bu çözünürlükte yanıtlanıyor.

create type health_status as enum ('ok', 'warn', 'crit');

create table public.system_health_snapshot (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Eşiklerden TÜRETİLİR, elle yazılmaz (`domain-core/observability/health-status`). Panelin renk kodu.
  status health_status not null,

  -- Tam görüntü: { system, processes, services, app }.
  --
  -- **Neden tek jsonb, kolon kalabalığı değil:** metrik kümesi zamanla değişir (yeni servis, yeni
  -- eşik) ve her metrik için kolon açmak her eklemede migration demek olurdu. Karşılığında alan
  -- doğrulaması Zod'a düşüyor (`SystemHealthMetricsSchema`) — kabul edilir bedel, çünkü bu veri
  -- RAPOR GİRDİSİ DEĞİL; panele bakan bir gözün gördüğü şey. Muhasebe verisi olsaydı kolon açardık.
  metrics jsonb not null
);

-- Son-N okuması, trend penceresi ve süpürme (created_at < cutoff) aynı indeksi kullanır.
create index system_health_snapshot_created_idx on public.system_health_snapshot (created_at desc);

-- Yazma/silme backend service_role; okuma operasyon sayfasında `requireAdmin` kapısından.
-- Politika yok — 0039'daki gerekçenin aynısı (RLS kapsamı 18.1'de karara bağlanacak).
alter table public.system_health_snapshot enable row level security;
