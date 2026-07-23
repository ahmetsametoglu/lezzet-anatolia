-- Modül 04 — Kimlik: auth.users insert → Customer bağla + ilk hesabı admin yap (DB'de, atomik).
-- Neden trigger: bağlama Supabase'in bilmediği domain işi; her giriş yolunda (Google/OTP) tek yerden,
-- atomik çalışır — uygulama katmanında tekrar tekrar çağrılmaz (referans deseni: handle_new_user).

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_no_admin boolean;
begin
  -- 1) Customer: e-postayla bul-veya-oluştur + Auth'a bağla (taslağı kapat).
  if new.email is not null then
    update public.customer
      set auth_user_id = new.id, is_draft = false
      where lower(email) = lower(new.email) and auth_user_id is null
      returning id into v_customer_id;

    if v_customer_id is null then
      insert into public.customer (email, auth_user_id, is_draft)
      values (lower(new.email), new.id, false)
      on conflict do nothing;
    end if;
  end if;

  -- 2) İlk hesap → admin. Advisory lock ile yarış-güvenli (aynı anda iki kayıt olsa da tek admin).
  perform pg_advisory_xact_lock(hashtext('lezzet_first_admin_bootstrap'));
  select not exists (select 1 from public.staff_role where role = 'admin') into v_no_admin;
  if v_no_admin then
    insert into public.staff_role (user_id, role)
    values (new.id, 'admin')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
