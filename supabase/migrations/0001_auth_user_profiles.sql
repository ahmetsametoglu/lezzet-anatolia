-- Kimlik: müşteri ve personel tek profil tablosunda, rolle ayrılır; erişim yalnız sunucudan service_role ile, RLS deny-by-default.

-- Publishable anahtarın veride işi yok (yalnız auth + broadcast); Supabase varsayılanı ise her yeni
-- tablo, görünüm ve fonksiyonu anon/authenticated'a açar ve görünüm ile SECURITY DEFINER fonksiyon RLS'i atlar.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges revoke execute on functions from public;

-- `system` bir yetki değil, "bu satır bir kişi değil" beyanıdır: hiçbir guard'a uymaz ve `roles @> {customer}` süzgeci
-- sayesinde müşteri listelerinden kendiliğinden düşer; ayrı bayrak her müşteri sorgusuna hatırlanacak bir koşul eklerdi.
create type user_role as enum ('customer', 'admin', 'warehouse', 'courier', 'accounting', 'system');
create type customer_type as enum ('individual', 'company');
create type preferred_language as enum ('tr', 'fr', 'de');
create type country_code as enum ('FR', 'DE');

-- Müşteri ile personel keskin ayrılır, personel içinde çoklu rol olağandır; bu yüzden `roles` dizidir ve `customer` yalnız başına durur.
-- Bağ tablosu yerine dizi, çünkü rol okuması guard'ın her istekteki sıcak yoludur ve join istemez.

create table public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  roles user_role[] not null default '{customer}',
  type customer_type not null default 'individual',
  name text not null default '',
  email text,
  -- İletişim numarasıdır, kimlik anahtarı değil: doğrulanmadan yazılır, kimlik çözümünde okunmaz (anahtar `customer_phone`).
  -- Benzersiz değil, çünkü aile ya da işyeri telefonu meşrudur.
  phone text,
  preferred_language preferred_language not null default 'fr',
  country country_code not null default 'FR',
  -- Rolün "nerede" ekseni (DOMAIN §17); dizi kolonda FK kurulamadığı için kısıt 0031'de tetikleyiciyle.
  -- Boş dizi hiçbir depo demektir, "hepsi" değil: kapsamsız kalan depocu ya da kurye için kapı kapanır.
  warehouse_ids uuid[] not null default '{}',
  auth_user_id uuid unique references auth.users (id) on delete set null,
  b2b_approved boolean,                         -- B2B self-servis onayı; B2C/personel'de null
  is_draft boolean not null default false,      -- WhatsApp/manuel taslak; doğrulanınca false
  created_at timestamptz not null default now()
);

-- E-posta benzersiz (dolu olduğunda). Bul-veya-oluştur buna dayanır.
create unique index user_profiles_email_key on public.user_profiles (lower(email)) where email is not null;
-- `cardinality`, çünkü boş dizide `array_length` NULL döner ve NULL'a düşen CHECK ihlal sayılmaz.
alter table public.user_profiles add constraint user_profiles_roles_not_empty check (cardinality(roles) >= 1);
alter table public.user_profiles add constraint user_profiles_roles_exclusive
  check (not ('customer' = any (roles)) or cardinality(roles) = 1);

-- "Bu role sahip herkes" sorgusu (personel listesi, kurye ataması) — dizi araması GIN ister.
create index user_profiles_roles_idx on public.user_profiles using gin (roles);

-- Yerinde satışın anonim alıcısı: sipariş sahipsiz olamaz ama yerinde kimlik sorulmaz, elle yazılan e-posta ise
-- kayıt tetikleyicisiyle gerçek sahibine yabancı bir geçmiş devrederdi. Tek sabit satır, çünkü satış başına kayıt listeyi sahte müşteriyle doldururdu.
insert into public.user_profiles (id, name, roles, is_draft)
values ('00000000-0000-4000-8000-00000000d001', 'Yerinde satış (anonim)', array['system']::user_role[], false)
on conflict (id) do nothing;

alter table public.user_profiles enable row level security;

-- Kimlik anahtarı doğrulanmış telefondur (DOMAIN §10); satırın varlığı zilyetlik kanıtıdır, bu yüzden `verified_at` boş olamaz
-- ve elle yazılan numara buraya girmez. Emekliye ayrılan satır geçmişi silmeden kalır, aktif tekillik yeni sahibine yol açar.

create table public.customer_phone (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.user_profiles (id) on delete cascade,
  -- E.164 normalize; `conversation.external_ref` ile AYNI dizeyi taşır (0039) — biri normalize
  -- edilip öteki edilmezse aynı kişi iki anahtarla iki kez görünür.
  phone        text not null,
  -- Zilyetliğin KANITLANDIĞI an. Satır varsa dolu (bkz. künye).
  verified_at  timestamptz not null default now(),
  -- Bu numaradan en son ne zaman mesaj geldi — sessizlik tetiğinin (DOMAIN §10, ~3 ay) ölçütü.
  -- Doğrulama anıyla aynı başlar; her gelen mesajda tazelenir.
  last_seen_at timestamptz not null default now(),
  -- Taşıyıcının son "ulaşılamadı" beyanı: sessizliği beklemeden kimlik sorusunu erken tetikler (DOMAIN §10).
  -- Soru sorulunca temizlenir ki aynı sinyal iki kez sayılmasın.
  delivery_failed_at timestamptz,
  -- Emeklilik: bağ koptu (hat devredildi / taşıyıcı `failed` dedi). Satır SİLİNMEZ.
  retired_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- Bir numara en çok bir AKTİF hesaba çıkar. Emekli satırlar süzgecin dışında: geçmiş durur.
create unique index customer_phone_active_key
  on public.customer_phone (phone) where retired_at is null;

-- "Bu müşterinin numaraları" — kimlik çözümünün ters yönü (müşteri kartı, sohbet paneli, hesap ekranı).
create index customer_phone_customer_idx
  on public.customer_phone (customer_id) where retired_at is null;

-- RLS deny-by-default: politika yok → anon/authenticated hiçbir satır göremez. Numara listesi
-- müşteri yüzeyine HİÇ açılmaz — "şu numara kimde" bir kimlik sorusudur.
alter table public.customer_phone enable row level security;

comment on table public.customer_phone is
  'Kimlik anahtarı: DOĞRULANMIŞ telefon numarası (DOMAIN §10). Satırın varlığı zilyetlik kanıtıdır; '
  'user_profiles.phone yalnız iletişim numarasıdır ve kimlik çözümünde okunmaz.';
comment on column public.customer_phone.verified_at is
  'Zilyetliğin kanıtlandığı an (imzalı webhook''tan gelen mesaj). Satır varsa doludur.';
comment on column public.customer_phone.last_seen_at is
  'Bu numaradan gelen SON mesajın anı — sessizlik tetiğinin ölçütü.';
comment on column public.customer_phone.delivery_failed_at is
  'Taşıyıcı bu numaraya ulaşamadı (`failed`) — kimlik şüphesinin ERKEN tetiği. Soru sorulunca temizlenir.';
comment on column public.customer_phone.retired_at is
  'Bağ koptu (hat devri / taşıyıcı beyanı). Satır silinmez; numara yeni sahibine açılır.';

-- Damgayı veritabanı saati yazar, çünkü satır DB saatiyle doğuyor ve uygulama saati karışırsa `last_seen_at` geriye gidebilir.
-- Emekli satır tazelenmez; bağı kopmuş numaranın "hâlâ canlı" damgası emekliliği görünmez kılardı.
create or replace function public.touch_customer_phone(p_id uuid)
returns setof public.customer_phone
language sql
security definer
set search_path = public
as $$
  update public.customer_phone
     set last_seen_at = now()
   where id = p_id and retired_at is null
  returning *;
$$;

revoke all on function public.touch_customer_phone(uuid) from public, anon, authenticated;
grant execute on function public.touch_customer_phone(uuid) to service_role;

comment on function public.touch_customer_phone(uuid) is
  'Kanıt satırının son görülme damgasını DB saatiyle tazeler (04.10). Emekli satıra dokunmaz.';

-- Numarayla çağrılır, çünkü taşıyıcı olayında bizim satır kimliğimiz yok. Başarılı teslim `failed` damgasını siler,
-- yoksa çürütülmüş bir başarısızlık her dönüşte gereksiz kimlik sorusu doğururdu; emekli satır güncellenmez.
create or replace function public.mark_customer_phone_delivery(p_phone text, p_failed boolean)
returns setof public.customer_phone
language sql
security definer
set search_path = public
as $$
  update public.customer_phone
     set delivery_failed_at = case when p_failed then now() else null end
   where phone = p_phone and retired_at is null
  returning *;
$$;

revoke all on function public.mark_customer_phone_delivery(text, boolean) from public, anon, authenticated;
grant execute on function public.mark_customer_phone_delivery(text, boolean) to service_role;

comment on function public.mark_customer_phone_delivery(text, boolean) is
  'Taşıyıcının teslim beyanını numaranın kimlik künyesine yazar (04.10): failed damgalar, başarılı teslim siler.';
