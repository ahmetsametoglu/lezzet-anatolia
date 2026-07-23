-- ============================================================================
-- 0003 — Passwordless e-posta OTP (özel Resend akışı)
-- ----------------------------------------------------------------------------
-- Supabase'in gömülü mail akışı KULLANILMAZ. Giriş, kendi 6-haneli kodumuzla yapılır:
-- kod plain olarak Resend ile gider, DB'de yalnız SHA-256 hash saklanır (sızıntıda aktif
-- kodlar ele geçmesin). 15dk TTL, attempts ile brute-force koruması (max 5 deneme).
--
-- Hash JS'te hesaplanır (EmailVerificationService); RPC'ler hash + email alıp atomik
-- transaction'da rate-limit + cooldown + invalidate + insert / verify yapar (race-safe,
-- tek round-trip). Tablo tek amaçlıdır (passwordless giriş); e-posta değişimi vb. ileride
-- ihtiyaç doğunca eklenir.
--
-- İki yüzey kuralı: /connexion hem müşteri hem personeldir → admin/staff reddi YOK
-- (giriş sonrası yönlendirme staff_role'e göre yapılır, bkz. resolvePostLoginRedirect).
-- ============================================================================

create table public.email_verifications (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  token_hash   text not null unique,                 -- sha256(plain_kod)
  expires_at   timestamptz not null,
  used_at      timestamptz,
  attempts     integer not null default 0,           -- yanlış giriş sayacı; >=5 → 'locked'
  created_at   timestamptz not null default now()
);

alter table public.email_verifications enable row level security;
-- RLS açık + hiç policy yok = anon/authenticated hiçbir satır göremez.
-- service_role RLS'i bypass eder (backend); token'lar gizli kalır.

create index email_verifications_email_created_idx
  on public.email_verifications (email, created_at desc);

comment on table public.email_verifications is
  'Passwordless giriş için 6-haneli OTP; DB''de yalnız SHA-256 hash. service_role erişir.';

-- ─── request: kod iste (atomik) ─────────────────────────────────────────────
create or replace function public.request_passwordless_code(
  p_email      text,
  p_token_hash text,
  p_expires_at timestamptz
) returns table(status text, retry_after_sec int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email_lower   text := lower(p_email);
  v_recent_count  int;
  v_latest_at     timestamptz;
  v_seconds_since int;
begin
  -- Rate limit: son 1 saatte 5+ istek reddedilir
  select count(*) into v_recent_count
  from public.email_verifications
  where email = v_email_lower
    and created_at > now() - interval '1 hour';
  if v_recent_count >= 5 then
    return query select 'rate_limit'::text, 3600;
    return;
  end if;

  -- Cooldown: son kod 60sn'den yeniyse reddet
  select created_at into v_latest_at
  from public.email_verifications
  where email = v_email_lower
  order by created_at desc limit 1;
  if v_latest_at is not null then
    v_seconds_since := extract(epoch from now() - v_latest_at)::int;
    if v_seconds_since < 60 then
      return query select 'cooldown'::text, (60 - v_seconds_since);
      return;
    end if;
  end if;

  -- Aktif kodları geçersizle (yeni istek = eskisi geçersiz)
  update public.email_verifications
    set used_at = now()
    where email = v_email_lower and used_at is null;

  insert into public.email_verifications (email, token_hash, expires_at)
  values (v_email_lower, p_token_hash, p_expires_at);

  return query select 'ok'::text, 0;
end;
$$;

revoke all on function public.request_passwordless_code(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.request_passwordless_code(text, text, timestamptz) to service_role;

comment on function public.request_passwordless_code(text, text, timestamptz) is
  'Atomik OTP isteği: rate limit (5/saat) + cooldown (60sn) + invalidate + insert. Hash istemcide hesaplanır.';

-- ─── verify: kodu doğrula ve tüket (atomik) ─────────────────────────────────
create or replace function public.verify_passwordless_code(
  p_email      text,
  p_token_hash text
) returns table(status text, remaining_attempts int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record record;
begin
  select * into v_record
  from public.email_verifications
  where email = lower(p_email) and used_at is null
  order by created_at desc limit 1;

  if not found then
    return query select 'not_found'::text, 0; return;
  end if;
  if v_record.expires_at < now() then
    return query select 'expired'::text, 0; return;
  end if;
  if v_record.attempts >= 5 then
    return query select 'locked'::text, 0; return;
  end if;

  if v_record.token_hash <> p_token_hash then
    update public.email_verifications
      set attempts = v_record.attempts + 1
      where id = v_record.id;
    if v_record.attempts + 1 >= 5 then
      return query select 'locked'::text, 0;
    else
      return query select 'wrong'::text, (5 - (v_record.attempts + 1));
    end if;
    return;
  end if;

  update public.email_verifications set used_at = now() where id = v_record.id;
  return query select 'ok'::text, 0;
end;
$$;

revoke all on function public.verify_passwordless_code(text, text) from public, anon, authenticated;
grant execute on function public.verify_passwordless_code(text, text) to service_role;

comment on function public.verify_passwordless_code(text, text) is
  'Atomik OTP doğrulama: lookup + expire/lock + hash karşılaştır + consume. ok/wrong/locked/expired/not_found.';
