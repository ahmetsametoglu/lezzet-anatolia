-- AI kullanım defteri: modele giden her koşu bir satır; maliyet, sağlayıcının faturası gibi dolar tutulur.

-- Satırı yalnız koşucunun kancası yazar (`@lezzet/ai` → `setAiUsageRecorder`), çünkü çağıranlar yazsaydı unutulan koşu bedava görünürdü.
-- `cost_usd` yazım anındaki tarifeyle donar ki tarife değişince geçmiş harcama yeniden yazılmasın; tarifesiz koşu `null` alır.

-- `purge_observability` bu tabloya dokunmaz: harcama işletme kaydıdır, teşhis izi değil.

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  -- Görev adı (`AiTask.id`: `support.autonomous-reply`, `translate.user-text`…) — "hangi özellik harcıyor".
  task text not null check (length(btrim(task)) > 0),
  -- Çağrının GERÇEKTEN gittiği model (env ile değişir) — tarife bununla eşleşir.
  model_id text not null check (length(btrim(model_id)) > 0),
  ok boolean not null,
  -- Başarısız koşu da jeton yakabilir (şema ihlali: model yazdı, çıktı reddedildi) — satır yine düşer.
  -- `not_configured` burada YOK: o hâlde modele hiç gidilmedi.
  failure_reason text check (failure_reason in ('provider_error', 'invalid_output')),
  -- Jetonlar: `null` = sağlayıcı ölçüm vermedi. Sıfır YAZILMAZ.
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  cached_input_tokens integer check (cached_input_tokens >= 0),
  total_tokens integer check (total_tokens >= 0),
  -- Yaklaşık maliyet (USD). Milyonda bir dolar hassasiyeti: tek çeviri koşusu sentin çok altında kalıyor.
  cost_usd numeric(12,6) check (cost_usd >= 0),
  -- İş bağlamı — hangi sohbetin/talebin koşusu. `set null`: sohbet ya da talep silinse de harcama kaydı
  -- KALIR (faturası kesilmiş bir harcama, sohbetle birlikte yok olmaz).
  conversation_id uuid references public.conversation (id) on delete set null,
  ticket_id uuid references public.ticket (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Başarı ile sebep AYRIŞAMAZ: sebepli başarı ya da sebepsiz başarısızlık okunamaz bir satırdır.
  constraint ai_usage_failure check (ok = (failure_reason is null))
);

alter table public.ai_usage enable row level security;

-- Tek okuma deseni: zaman penceresi (günlük özet, "bu ay").
create index ai_usage_created_idx on public.ai_usage (created_at);

-- Satırlar sınırsız büyüdüğü için ekran ve asistan bu günlük özeti okur; gün, işletmenin günü olan Paris günüdür.
-- `unpriced_calls` maliyeti bilinmeyen koşuları sayar, çünkü `cost_usd` toplamı onları içermez.
create or replace view public.ai_usage_daily with (security_invoker = true) as
select (u.created_at at time zone 'Europe/Paris')::date      as day,
       u.task,
       u.model_id,
       count(*)::integer                                    as calls,
       (count(*) filter (where not u.ok))::integer          as failed_calls,
       sum(u.input_tokens)::bigint                          as input_tokens,
       sum(u.output_tokens)::bigint                         as output_tokens,
       sum(u.cost_usd)                                      as cost_usd,
       (count(*) filter (where u.cost_usd is null))::integer as unpriced_calls
  from public.ai_usage u
 group by 1, 2, 3;
