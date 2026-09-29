-- Cihaz jetonu: "bu kişiye hangi cihazlardan ulaşılır" kaydı. Kolon `profile_id`, çünkü personel de push alır ve `customer_id`
-- adı personel jetonuna ikinci bir tablo doğururdu.
-- ============================================================================

create table public.push_device (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.user_profiles (id) on delete cascade,
  -- Expo jetonu. Tekillik kişi başına değil tablo geneli, çünkü aynı fiziksel cihaz ancak bir hesabın kulağı olabilir.
  token text not null unique,
  -- Yalnız native platformlar; kısıt veride, yanlış platform sessizce yazılamaz.
  platform text not null check (platform in ('ios', 'android')),
  -- Müşteri ve operasyon iki ayrı uygulama; kolon olmasaydı müşteri bildirimi personelin operasyon uygulamasına da düşerdi.
  -- Varsayılan yok, çünkü sessiz yanlış sınıflama kolonun hiç olmamasından kötüdür.
  app text not null check (app in ('customer', 'operations')),
  -- İzin kapatılınca jeton canlı kalır ve Expo "gönderdim" der; uygulama her açılışta izni raporlar ve kapalı cihaz yeteneksiz
  -- sayılır. `null` = açık.
  disabled_at timestamptz,
  -- Son görülme anı; uygulama her açılışta tazeler.
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- "Bu kişinin kulakları" — gönderim anının tek okuması.
create index push_device_profile_idx on public.push_device (profile_id);

-- RLS deny-by-default: jeton bir ADRES değil YETKİDİR — elinde tutan, o cihaza bildirim
-- gösterebilir. İstemciye hiçbir uçtan geri okutulmaz; yazma sunucudan service_role ile.
alter table public.push_device enable row level security;

comment on table public.push_device is
  'Push cihaz jetonu: kişi başına çok cihaz, cihaz başına tek sahip; upsert sahibi değiştirir. Kişisel veri, 0037 siler.';
comment on column public.push_device.disabled_at is
  'OS bildirim izni kapalı (uygulamanın açılış raporu). Dolu ise sürücü cihazı yeteneksiz sayar.';
comment on column public.push_device.app is
  'Jetonun geldiği uygulama: customer · operations. Müşteri gönderimi yalnız customer jetonlarını okur.';

-- Çakışmada sahip devreder: jeton fiziksel cihazı temsil eder ve cihaz son girenin elindedir. Önce silip sonra yazmak iki deyimdi
-- ve arada düşen süreç jetonu sahipsiz bırakırdı; upsert kısıtın üstünde atomiktir.
create or replace function public.register_push_device(
  p_profile_id uuid,
  p_token text,
  p_platform text,
  p_app text,
  p_enabled boolean
)
returns setof public.push_device
language sql
security definer
set search_path = public
as $$
  insert into public.push_device (profile_id, token, platform, app, disabled_at)
  values (p_profile_id, p_token, p_platform, p_app, case when p_enabled then null else now() end)
  on conflict (token) do update
    set profile_id  = excluded.profile_id,
        platform    = excluded.platform,
        app         = excluded.app,
        disabled_at = excluded.disabled_at,
        last_seen_at = now()
  returning *;
$$;

revoke all on function public.register_push_device(uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.register_push_device(uuid, text, text, text, boolean) to service_role;

comment on function public.register_push_device(uuid, text, text, text, boolean) is
  'Jeton kaydı ve tazelemesi; çakışmada sahip devreder (son giren kazanır, cihaz onun elindedir).';
