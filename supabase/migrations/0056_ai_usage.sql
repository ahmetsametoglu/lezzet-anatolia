-- ════════════════════════════════════════════════════════════════════════════
-- 0056 — AI KULLANIM DEFTERİ (15.27 · kullanıcı kararı 10.09)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Modele giden her koşu bir satır: hangi görev, hangi model, kaç jeton ve yazıldığı andaki tarifeyle
-- yaklaşık kaç DOLAR (sağlayıcının faturası dolar; euroya çevirmek ikinci bir tahmin katmanı — kur —
-- eklerdi).
--
-- ── NEDEN (ölçüldü 07.09) ───────────────────────────────────────────────────
-- `estimateCost` yazılmıştı ama çağıranı yoktu ve tarife hiçbir yerde durmuyordu: her AI çağrısı
-- bedava görünüyordu — `CLAUDE §1`in "ölçülemeyen değer sıfır değildir" kuralının tam ihlali.
--
-- ── YAZAN TEK KAPI ──────────────────────────────────────────────────────────
-- Satırı koşucunun kancası yazar (`@lezzet/ai` → `setAiUsageRecorder`; kaydedici
-- `@lezzet/application/ai/usage-recorder`, süreç başında web ve backend takar). Çağıranlar (ajan,
-- taslak, çeviri, ses, banka, B2B özeti, analitik) kayıt YAZMAZ: on kopya, on birinci çağıranın
-- unutacağı bir kural olurdu — ve unutulan koşu bedava görünürdü.
--
-- ── MALİYET YAZIM ANINDA DONAR ──────────────────────────────────────────────
-- `cost_usd` o anki tarifeyle (`settings.ai_model_prices_usd`) hesaplanır ve satırda kalır. Okuma
-- anında hesaplansaydı tarife değiştiği gün geçen ayın harcaması bugünün fiyatıyla yeniden yazılırdı.
-- Tarifesi olmayan model ya da ölçümsüz koşu `null` alır — bilinmiyor, sıfır değil.
--
-- ── İŞ KAYDI, TEŞHİS DEĞİL ──────────────────────────────────────────────────
-- `purge_observability` bu tabloya dokunmaz: harcama bir işletme kaydıdır (`OBSERVABILITY §1`), 90
-- günde silinen teşhis izi değil.

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

-- ── GÜNLÜK ÖZET — okuyanın tek kapısı ────────────────────────────────────────
-- Satırlar veriyle SINIRSIZ büyür (her müşteri mesajı en az bir koşu); ekran ve asistan satır saymaz,
-- bunu okur. Gün PARİS günüdür — işletmenin günü, sunucunun değil (`0028` puan gününün aynı kuralı).
--
-- `unpriced_calls`: maliyeti BİLİNMEYEN koşu sayısı. `cost_usd` toplamı onları içermez ve bu açıkça
-- söylenir; sessizce sıfır saymak harcamayı olduğundan az gösterirdi.
create or replace view public.ai_usage_daily as
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
