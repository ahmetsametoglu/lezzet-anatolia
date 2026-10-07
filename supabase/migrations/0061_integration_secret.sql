-- Entegrasyon anahtarları (Revolut, Pennylane, Hiboutik, e-posta) Vault'ta şifreli durur; düz metin yalnız sunucu süreçlerinin
-- belleğinde. Anahtar Kurulum'dan değişir, sunucuya girmeden ve dağıtımsız; yedeklerde düz metin anahtar dolaşmaz. Veritabanı adresi,
-- servis anahtarı ve Vault'un ana anahtarı ortamda kalır.

-- Hangi anahtarın tanımlı olduğu ve son değişikliği; değer asla bu tabloda değil, Vault'ta.
create table public.integration_secret (
  name text primary key check (name in (
    'revolut_secret_key', 'revolut_webhook_secret', 'pennylane_api_token',
    'hiboutik_account', 'hiboutik_user', 'hiboutik_api_key', 'resend_api_key'
  )),
  vault_secret_id uuid not null unique,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.user_profiles (id) on delete set null
);

-- Değişiklik defteri: kim, ne zaman, hangi anahtar; eski ve yeni değer yazılmaz.
create table public.integration_secret_log (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  action text not null check (action in ('set', 'clear')),
  actor uuid references public.user_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index integration_secret_log_created_idx on public.integration_secret_log (created_at desc);

alter table public.integration_secret enable row level security;
alter table public.integration_secret_log enable row level security;

-- Yazım: aynı anahtara aynı anda iki yazım sıraya girer, yoksa ikisi de Vault'ta aynı adla kayıt açmaya çalışırdı.
create or replace function public.integration_secret_set(p_name text, p_value text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(p_value, '') = '' then
    raise exception 'integration_secret_set: boş değer yazılmaz; anahtarı kaldırmak integration_secret_clear ile';
  end if;
  perform pg_advisory_xact_lock(hashtext('integration_secret:' || p_name));
  select vault_secret_id into v_id from public.integration_secret where name = p_name;
  if v_id is null then
    v_id := vault.create_secret(p_value, 'integration:' || p_name);
    insert into public.integration_secret (name, vault_secret_id, updated_by) values (p_name, v_id, p_actor);
  else
    perform vault.update_secret(v_id, p_value);
    update public.integration_secret set updated_at = now(), updated_by = p_actor where name = p_name;
  end if;
  insert into public.integration_secret_log (name, action, actor) values (p_name, 'set', p_actor);
end;
$$;

create or replace function public.integration_secret_clear(p_name text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('integration_secret:' || p_name));
  delete from public.integration_secret where name = p_name returning vault_secret_id into v_id;
  if v_id is null then return; end if;
  delete from vault.secrets where id = v_id;
  insert into public.integration_secret_log (name, action, actor) values (p_name, 'clear', p_actor);
end;
$$;

-- Okuma yalnız sunucu süreçlerinin; çözülmüş değer bu fonksiyondan başka hiçbir yoldan çıkmaz.
create or replace function public.integration_secrets_read()
returns table (name text, value text)
language sql
stable
security definer
set search_path = public
as $$
  select s.name, d.decrypted_secret
    from public.integration_secret s
    join vault.decrypted_secrets d on d.id = s.vault_secret_id;
$$;

revoke execute on function public.integration_secret_set(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.integration_secret_clear(text, uuid) from public, anon, authenticated;
revoke execute on function public.integration_secrets_read() from public, anon, authenticated;
