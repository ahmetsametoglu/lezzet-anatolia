-- Modül 06 — Zamanlanmış iş izi (06.4). STACK §13 cron disiplini: kritik işler `last_run` bırakır,
-- gecikince alarm (alarm 18.6'da). Süreç belleğinde tutulmaz — backend yeniden başlayınca iz silinir.
--
-- Tek satır/iş: iş adı birincil anahtar. Tarih üzerine yazılır, tarihçe tutulmaz — "en son ne zaman
-- koştu ve ne oldu" sorusuna cevap veren en küçük yapı budur (izleme sistemi değil).

create table public.job_run (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                         -- ör. 'sweep_reservations' — upsert anahtarı
  last_run_at timestamptz not null default now(),
  -- Son turun özeti: {"affected": 3} gibi. Şeması işe göre değişir, bu yüzden jsonb.
  last_result jsonb,
  -- Son hata mesajı; başarılı turda null'lanır → "şu an sağlıklı mı" tek bakışta görülür.
  last_error text
);

alter table public.job_run enable row level security;
