-- Modül 04 — Kimlik: auth.users insert → user_profile bağla/oluştur + ROL ata. İlk hesap admin (atomik).
-- Neden trigger: bağlama + ilk-admin Supabase'in bilmediği domain işi; her giriş yolunda (Google/OTP)
-- tek yerden, atomik çalışır. Referans deseni: handle_new_user. E-posta belirtilmez — İLK giren admin olur.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_first_admin boolean;
  v_role user_role;
begin
  -- İlk admin bootstrap: hiç admin yoksa bu hesap admin, değilse customer. Advisory lock ile
  -- yarış-güvenli (aynı anda iki kayıt olsa da tek admin). Taslak müşteriler (role=customer) engel değil.
  perform pg_advisory_xact_lock(hashtext('lezzet_first_admin_bootstrap'));
  select not exists (select 1 from public.user_profiles where role = 'admin') into v_first_admin;
  v_role := case when v_first_admin then 'admin'::user_role else 'customer'::user_role end;

  -- E-postayla var olan TASLAĞI bul + Auth'a bağla (kapat). İlk hesapsa rolü admin'e yükselt.
  if new.email is not null then
    update public.user_profiles
      set auth_user_id = new.id,
          is_draft = false,
          role = case when v_first_admin then 'admin'::user_role else role end
      where lower(email) = lower(new.email) and auth_user_id is null
      returning id into v_profile_id;
  end if;

  -- Eşleşen taslak yoksa yeni profil aç (rolüyle).
  if v_profile_id is null then
    insert into public.user_profiles (email, auth_user_id, is_draft, role)
    values (case when new.email is not null then lower(new.email) else null end, new.id, false, v_role)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
