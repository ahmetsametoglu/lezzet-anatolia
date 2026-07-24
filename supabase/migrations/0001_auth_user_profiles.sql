-- Modül 04 — Kimlik dilimi: TEK kullanıcı profili tablosu + rol (referans proje deseni: user_profiles).
-- Müşteri de bir ROLDÜR — ayrı tablo yok; personel rolleri aynı enum'da. Çok-rol YOK (kullanıcı tek rol).
-- Kapsam bilinçli dar: auth'un (bul-veya-oluştur, bağlama, guard, ilk admin) ihtiyacı olan alanlar.
-- Kredi/pazarlama/şirket alanları ilgili modüllerin migration'larında eklenir.
-- Erişim modeli: tüm okuma/yazma sunucudan service_role ile; RLS deny-by-default (savunma katmanı).

create type user_role as enum ('customer', 'admin', 'warehouse', 'courier');
create type customer_type as enum ('individual', 'company');
create type preferred_language as enum ('tr', 'fr', 'de');
create type country_code as enum ('FR', 'DE');

-- ============================================================================
-- user_profiles — her kimlik (müşteri + personel) tek tabloda; ROL ayırır (customer varsayılan).
-- auth_user_id NULLABLE: taslak müşteri (WhatsApp/manuel, DOMAIN §10) auth'suz açılır, girişte bağlanır.
-- Personel her zaman auth'ludur. İlk giriş yapan hesap trigger'la admin olur (0002).
-- ============================================================================

create table public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  role user_role not null default 'customer',
  type customer_type not null default 'individual',
  name text not null default '',
  email text,
  phone text,                                  -- kimlik anahtarı (E.164 normalize) — bkz. CHANNELS §3
  preferred_language preferred_language not null default 'fr',
  country country_code not null default 'FR',
  auth_user_id uuid unique references auth.users (id) on delete set null,
  b2b_approved boolean,                         -- B2B self-servis onayı; B2C/personel'de null
  is_draft boolean not null default false,      -- WhatsApp/manuel taslak; doğrulanınca false
  created_at timestamptz not null default now()
);

-- Kimlik anahtarları benzersiz (dolu olduklarında). Bul-veya-oluştur bunlara dayanır.
create unique index user_profiles_email_key on public.user_profiles (lower(email)) where email is not null;
create unique index user_profiles_phone_key on public.user_profiles (phone) where phone is not null;
create index user_profiles_role_idx on public.user_profiles (role);

-- RLS deny-by-default: politika tanımlanmadıkça anon/authenticated satır göremez; erişim service_role ile.
alter table public.user_profiles enable row level security;
