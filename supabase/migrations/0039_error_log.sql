-- Modül 18 — Hata kaydı (18.5). Kararlar: `architecture/OBSERVABILITY.md §2`, alanlar:
-- `data-model/operasyon.md`.
--
-- Dış izleme servisi (Sentry) YERİNE kendi tablomuz: veri sahipliği, KVKK ve sıfır dış bağımlılık.
-- Bu ölçekte bir SaaS'ın aylık bedeli ve dışarıya veri aktarımı, kazandırdığından fazla.
--
-- **BU TABLO İŞ KAYDI DEĞİLDİR** (`OBSERVABILITY §1`). `order_status_log` ve `account_movement`
-- denetim malıdır, silinmez; buradaki satırın saklama süresi vardır ve şeması bilerek gevşektir
-- (`context jsonb`). "Sipariş ne zaman teslim oldu" orada, "checkout neden 500 döndü" burada.
--
-- GRUPLAMA tablonun bütün değeri: aynı parmak izli AKTİF hata tek satırda toplanır (`count++`),
-- 1000 aynı hata = 1 satır. Gruplanmasa liste kendi kendini gömer ve içindeki tek yeni hata
-- görünmez olurdu. Parmak izini SERVİS hesaplar (DB değil): normalize etme kuralı (UUID/sayı/hex
-- sabitleme, ilk kendi-kod stack karesi) TypeScript'te testlenebilir, SQL'de olmaz.

create type error_log_level as enum ('warning', 'error', 'fatal');

create table public.error_log (
  id uuid primary key default gen_random_uuid(),

  -- Gruplama anahtarı: `source` + normalize edilmiş mesaj + `node_modules` dışındaki ilk stack karesi.
  -- Mesajdaki UUID/uzun sayı/hex sabitlendiği için "Order abc-123 not found" ile "Order def-456 not
  -- found" AYNI satıra düşer.
  fingerprint text not null,

  -- warning = beklenen ama izlenmeli · error = beklenmeyen istisna · fatal = akış tamamen koptu.
  level error_log_level not null default 'error',

  -- Hatanın geldiği yer: 'web-server' | 'web-action' | 'backend-http' | 'backend-cron' | 'backend-webhook'.
  -- Serbest metin, enum DEĞİL: yeni bir kaynak (WhatsApp köprüsü, MCP) migration istemesin.
  source text not null,

  message text not null,
  stack text,

  -- Ek bağlam: sipariş kimliği, iş adı, sağlayıcı, sayaçlar.
  -- **KİMLİK yazılır, İÇERİK yazılmaz** (`OBSERVABILITY §5`): e-posta/telefon/ad/adres/ham istek
  -- gövdesi buraya GİRMEZ. Gerekçe hukuki olduğu kadar pratik — teşhis için kimlik yeter, o kimlikle
  -- veritabanına bakılır; ham kopya taşımak süresi olan bir tabloya kişisel veri taşımaktır.
  context jsonb not null default '{}'::jsonb,

  path text,

  -- Aynı AKTİF parmak izi kaç kez görüldü.
  count int not null default 1 check (count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  -- Operatör "çözüldü" işaretlediyse dolu. Personel silinse geçmiş karar bozulmasın → set null.
  resolved_at timestamptz,
  resolved_by uuid references public.user_profiles (id) on delete set null,

  created_at timestamptz not null default now()
);

-- Aktif bir parmak izi için TEK satır. `capture_error` bunu `update … count + 1` ile yakalar.
-- Çözüldükten sonra aynı hata tekrar gelirse YENİ satır doğar — ve bu bilinçli: çözülmüş bir hatanın
-- geri gelmesi, hiç çözülmemiş olmasından FARKLI bir haberdir; sayacı sessizce artırmak o haberi yutar.
create unique index error_log_active_fingerprint_idx on public.error_log (fingerprint) where resolved_at is null;

-- Listeleme sırası ve "son bir saatte kaç hata" sayımı bu indeksin üstünde.
create index error_log_last_seen_idx on public.error_log (last_seen_at desc);
-- Ekranın varsayılan odağı (çözülmemişler) ve süpürmenin tersi (çözülmüşler) ayrı yollardan gider.
create index error_log_unresolved_idx on public.error_log (last_seen_at desc) where resolved_at is null;
create index error_log_resolved_idx on public.error_log (resolved_at) where resolved_at is not null;

-- Erişim SUNUCUDAN, service_role ile (RLS deny-by-default — `job_run`/`webhook_event` ile aynı
-- desen). Politika bilinçli YOK: bu projede RLS kapsamı henüz karara bağlanmadı (18.1) ve okuma
-- `requireAdmin` kapısından geçen operasyon sayfasında yapılıyor. Referans projede admin SELECT
-- politikası var ama oradaki `is_admin()` yardımcısının burada karşılığı yok — desen kopyalanırken
-- bağlamı düşen madde olmasın.
alter table public.error_log enable row level security;

-- ─── capture_error ─────────────────────────────────────────────────────────────────────────────
-- Atomik "ekle ya da say": aktif aynı parmak izi varsa günceller, yoksa satır açar.
--
-- **Neden RPC** (STACK §13 yazmada-RPC eşiği, madde (a) — eşzamanlılık): "önce oku, yoksa yaz" arasına
-- ikinci bir hata girerse ya biri kaybolur ya unique kısıtı fırlatır. İkincisi özellikle kötü — hata
-- KAYDETME yolunda fırlayan bir istisna, kaydedilmeye çalışılan asıl hatayı maskeler.
--
-- Fonksiyon iş kuralı taşımaz: parmak izini çağıran hesaplar, burası yalnız koşullu yazar.
create or replace function public.capture_error(
  p_fingerprint text,
  p_level error_log_level,
  p_source text,
  p_message text,
  p_stack text,
  p_context jsonb,
  p_path text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.error_log
     set count = count + 1,
         last_seen_at = now(),
         -- EN GÜNCEL bağlam tutulur: aynı gruptaki son görülen hata en çok bilgi taşıyandır
         -- (ilk görülenin bağlamı aylar önceki bir isteğe ait olabilir).
         message = p_message,
         stack = p_stack,
         context = coalesce(p_context, '{}'::jsonb),
         path = p_path,
         level = p_level
   where fingerprint = p_fingerprint and resolved_at is null
  returning id into v_id;

  if v_id is null then
    insert into public.error_log (fingerprint, level, source, message, stack, context, path)
    values (p_fingerprint, p_level, p_source, p_message, p_stack, coalesce(p_context, '{}'::jsonb), p_path)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.capture_error(text, error_log_level, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.capture_error(text, error_log_level, text, text, text, jsonb, text) to service_role;
