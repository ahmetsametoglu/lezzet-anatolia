-- Modül 14 — Cihaz jetonu (14.14): push'un tek DB ayağı. Sürücü/izin/yönlendirme mobil şeritte
-- (21.13); teslim hattı ve makbuz cron'u 14.16'da. Bu tablo yalnız "bu kişiye HANGİ cihazlardan
-- ulaşılır" sorusunun kaydı.
--
-- ── KOLON `profile_id`, `customer_id` DEĞİL — ve bu ad bir karar (kurgu incelemesi 26.08) ───────
-- Operasyon mobil kabuğu var ve personel de push alacak; "customer_id" adı personel jetonuna ikinci
-- bir tablo doğururdu. Kimlik zaten tek tabloda (0001), jeton da tek tabloda.
-- ============================================================================

create table public.push_device (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.user_profiles (id) on delete cascade,
  -- Expo push jetonu. TEKİL ve tekillik TABLO GENELİ — kişi başına değil: aynı fiziksel cihaz
  -- ancak bir hesabın kulağı olabilir. Upsert bu kısıtın üstünde SAHİP DEĞİŞTİRİR (aşağıda).
  token text not null unique,
  -- 'ios' | 'android' — 'web' BİLEREK yok (KARARLAR 26.08: müşteri yüzeyinde web push yapılmıyor;
  -- gün gelir açılırsa değer eklemek yeter). Kısıt veride: yanlış platform sessizce yazılamaz.
  platform text not null check (platform in ('ios', 'android')),
  -- Uygulamanın OS bildirim İZNİ raporu (kurgu incelemesi 10. bulgu): izin kapatıldığında jeton
  -- CANLI kalır ve Expo "gönderdim" der ama kullanıcı hiçbir şey görmez — sessiz kara delik.
  -- Uygulama her açılışta izni raporlar; kapalıysa sürücü bu cihazı YETENEKSİZ sayar ve sıra
  -- maile düşer. `null` = açık.
  disabled_at timestamptz,
  -- Cihazın son görülme anı (uygulama açılışı jeton tazeler). Karşılaştırılan bir damga DEĞİL
  -- (customer_phone'un iki-saat dersi oraya aitti) — yalnız "bu kayıt bayat mı" bakımı için.
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- "Bu kişinin kulakları" — gönderim anının tek okuması.
create index push_device_profile_idx on public.push_device (profile_id);

-- RLS deny-by-default: jeton bir ADRES değil YETKİDİR — elinde tutan, o cihaza bildirim
-- gösterebilir. İstemciye hiçbir uçtan geri okutulmaz; yazma sunucudan service_role ile.
alter table public.push_device enable row level security;

comment on table public.push_device is
  'Push cihaz jetonu (14.14): kişi başına ÇOK cihaz, cihaz başına TEK sahip. Upsert sahibi '
  'değiştirir (logout devri — önceki hesabın bildirimi sonrakine düşmesin). Kişisel veri: 0037 siler.';
comment on column public.push_device.disabled_at is
  'OS bildirim izni kapalı (uygulamanın açılış raporu). Dolu ise sürücü cihazı yeteneksiz sayar.';

-- ─── Kayıt/tazeleme — SAHİP DEVRİ tek deyimde ────────────────────────────────
-- Aile telefonunda A çıkar B girer: B'nin kaydı aynı jetonu getirir. "Önce sil sonra yaz" iki
-- deyimdi ve arada düşen süreç jetonu sahipsiz bırakırdı; upsert kısıtın üstünde atomiktir.
-- SON GİREN KAZANIR — bu bir yarış kuralı değil GERÇEĞİN kendisi: jeton fiziksel cihazı temsil
-- eder ve cihaz şu an son girenin elindedir. Devir olmasaydı A'nın "talebinize cevap geldi"
-- bildirimi B'nin ekranına düşerdi — gecikme değil, kişisel veri ifşası.
create or replace function public.register_push_device(
  p_profile_id uuid,
  p_token text,
  p_platform text,
  p_enabled boolean
)
returns setof public.push_device
language sql
security definer
set search_path = public
as $$
  insert into public.push_device (profile_id, token, platform, disabled_at)
  values (p_profile_id, p_token, p_platform, case when p_enabled then null else now() end)
  on conflict (token) do update
    set profile_id  = excluded.profile_id,
        platform    = excluded.platform,
        disabled_at = excluded.disabled_at,
        last_seen_at = now()
  returning *;
$$;

revoke all on function public.register_push_device(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.register_push_device(uuid, text, text, boolean) to service_role;

comment on function public.register_push_device(uuid, text, text, boolean) is
  'Jeton kaydı/tazelemesi (14.14) — çakışmada SAHİBİ DEVREDER (son giren kazanır: cihaz onun elinde).';
