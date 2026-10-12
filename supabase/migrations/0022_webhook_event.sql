-- Dış sağlayıcı olayları. Sağlayıcı aynı olayı birden çok kez gönderir ("at least once"); (sağlayıcı, olay anahtarı) benzersiz
-- olduğu için ikinci geliş yazıma takılır ve tahsilat iki kez yazılmaz. `processed_at` "geldi ama işlenemedi" ayrımının izidir.
-- Gövde kişisel veri barındırabildiği için erişim yalnız sunucudan (RLS deny-by-default).

create table public.webhook_event (
  id uuid primary key default gen_random_uuid(),
  provider text not null,                            -- 'revolut', 'meta', 'sendcloud'
  event_id text not null,                            -- sağlayıcının olay kimliği ya da olay anahtarı
  type text not null,                                -- olayın türü ('payment_completed' …)
  payload jsonb,
  -- İşlendi damgası; null = geldi, henüz işlenmedi (ya da işlenirken düştü).
  processed_at timestamptz,
  -- Son hata mesajı — tekrar denemede neyin takıldığı görünür.
  error text,
  -- İşleyicinin kirası: olay bu ana kadar sahiplenenindir. İşlerken kapanan süreç satırı ne damgalar ne hata yazar; kirası dolan
  -- "işleniyor" satırını tekrar gelen olay yeniden alır.
  claimed_until timestamptz,
  created_at timestamptz not null default now()
);

-- İdempotensin tek dayanağı; kısmi indeks değil, çünkü `on conflict` onu hedefleyebilmeli.
create unique index webhook_event_provider_key on public.webhook_event (provider, event_id);
-- "Bugün ne geldi / neler işlenmedi" okuması.
create index webhook_event_created_idx on public.webhook_event (created_at desc);

alter table public.webhook_event enable row level security;

-- Sahiplenme tek ifadede karar verir: yeni olay yazılır; düşmüş (hatalı) ya da kirası dolmuş olay yeniden alınır ve kirası yenilenir.
-- İşlenmiş ya da kirası süren olay alınmaz; aynı anda gelen iki çağrıdan yalnız biri alır, çünkü ikincisi satırı güncellenmiş bulur.
create or replace function public.claim_webhook_event(
  p_provider text,
  p_event_id text,
  p_type text,
  p_payload jsonb,
  p_lease_seconds int
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.webhook_event;
  v_until timestamptz := now() + make_interval(secs => p_lease_seconds);
begin
  insert into public.webhook_event (provider, event_id, type, payload, claimed_until)
  values (p_provider, p_event_id, p_type, p_payload, v_until)
  on conflict (provider, event_id) do nothing
  returning * into v_row;
  if found then
    return jsonb_build_object('fresh', true, 'event', to_jsonb(v_row));
  end if;

  update public.webhook_event
     set error = null,
         claimed_until = v_until
   where provider = p_provider
     and event_id = p_event_id
     and processed_at is null
     and (error is not null or claimed_until is null or claimed_until <= now())
  returning * into v_row;
  if found then
    return jsonb_build_object('fresh', true, 'event', to_jsonb(v_row));
  end if;

  select * into v_row from public.webhook_event where provider = p_provider and event_id = p_event_id;
  return jsonb_build_object('fresh', false, 'event', to_jsonb(v_row));
end;
$$;
revoke execute on function public.claim_webhook_event(text, text, text, jsonb, int) from public, anon, authenticated;
