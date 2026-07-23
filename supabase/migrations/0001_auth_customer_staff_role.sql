-- Modül 04 — Kimlik dilimi: müşteri (kimlik altkümesi) + personel rolleri.
-- Kapsam bilinçli olarak dar: yalnız auth'un (bul-veya-oluştur, bağlama, guard, ilk admin)
-- ihtiyacı olan alanlar. Kredi/pazarlama/şirket alanları ilgili modüllerin migration'larında eklenir.
-- Erişim modeli: tüm okuma/yazma sunucudan service_role ile; RLS deny-by-default (savunma katmanı).

-- ============================================================================
-- Enum'lar
-- ============================================================================

create type customer_type as enum ('individual', 'company');
create type preferred_language as enum ('tr', 'fr', 'de');
create type country_code as enum ('FR', 'DE');
create type staff_role_kind as enum ('admin', 'warehouse', 'courier');

-- ============================================================================
-- customer — müşteri (kimlik altkümesi)
-- Not: Bir müşteri Auth kullanıcısına bağlanır (auth_user_id). Müşteri rolü örtüktür;
-- personel rolleri ayrı tabloda (staff_role).
-- ============================================================================

create table public.customer (
  id uuid primary key default gen_random_uuid(),
  type customer_type not null default 'individual',
  name text not null default '',
  email text,
  phone text,                                  -- kimlik anahtarı (E.164 normalize) — bkz. CHANNELS §3
  preferred_language preferred_language not null default 'fr',
  country country_code not null default 'FR',
  auth_user_id uuid unique references auth.users (id) on delete set null,
  b2b_approved boolean,                         -- B2B self-servis onayı; B2C'de null
  is_draft boolean not null default false,      -- WhatsApp/manuel taslak; doğrulanınca false
  created_at timestamptz not null default now()
);

-- Kimlik anahtarları benzersiz olmalı (dolu olduklarında). Bul-veya-oluştur bunlara dayanır.
create unique index customer_email_key on public.customer (lower(email)) where email is not null;
create unique index customer_phone_key on public.customer (phone) where phone is not null;

-- ============================================================================
-- staff_role — personel yetkileri (admin/depo/kurye)
-- Bir kullanıcının birden çok rolü olabilir (DOMAIN §2) → kullanıcı+rol tekil satırlar.
-- ============================================================================

create table public.staff_role (
  user_id uuid not null references auth.users (id) on delete cascade,
  role staff_role_kind not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- Guard/RLS için tek noktadan rol sorgusu. security definer: RLS'e takılmadan okur.
create or replace function public.has_role(check_role staff_role_kind)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_role
    where user_id = auth.uid() and role = check_role
  );
$$;

-- ============================================================================
-- RLS — deny-by-default. Politika tanımlanmadıkça hiçbir anon/authenticated
-- rol satır göremez; erişim sunucudan service_role ile (RLS'i baypas eder).
-- ============================================================================

alter table public.customer enable row level security;
alter table public.staff_role enable row level security;
