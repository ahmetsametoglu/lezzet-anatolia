-- Modül 12 — Siparişin para bağları (12.2). DOMAIN §7 (ödeme), §9 (para hareketleri).
--
-- `Order.amount_collected` / `amount_refunded` bir CACHE'tir; kaynağı para hareketleridir. Bugüne
-- kadar kaynağı yoktu — cache doğrudan yazılıyordu. Bu dosya kaynağı bağlar.
--
-- CACHE ARTIRILMAZ, YENİDEN HESAPLANIR. `set amount_collected = amount_collected + x` yazsaydık her
-- kaçırılan/tekrarlanan çağrı kalıcı bir sapma bırakırdı ve hangi çağrının kaydırdığı bulunamazdı.
-- Toplam her seferinde hareketlerden okunur: cache yanlışsa bile bir sonraki yazımda kendini düzeltir.
--
-- NEDEN RPC (STACK §13 (b)): bölünemez çok-tablolu yazım. Hareket yazılıp cache güncellenmezse
-- "para geldi ama sipariş ödenmemiş görünüyor" hâli doğar; tersi daha kötüdür (karşılığı olmayan
-- tahsilat). İkisi tek transaction'da.

-- ── Cache'i kaynaktan yeniden kur ────────────────────────────────────────────
-- Ayrı fonksiyon: hareket silinir/düzeltilirse ya da elle bir kayma şüphesi olursa tek çağrıyla
-- gerçeğe dönülür. Toplama SQL'i tek yerde durur (aşağıdaki yazım da bunu çağırır).
create or replace function public.resync_order_amounts(p_order_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_collected numeric(10, 2);
  v_refunded numeric(10, 2);
begin
  select
    coalesce(sum(amount) filter (where type = 'order_payment'), 0),
    coalesce(sum(amount) filter (where type = 'order_refund'), 0)
    into v_collected, v_refunded
    from public.money_movement
   where order_id = p_order_id;

  update public.order
     set amount_collected = v_collected,
         amount_refunded  = v_refunded
   where id = p_order_id;

  if not found then
    raise exception 'resync_order_amounts: sipariş bulunamadı (%)', p_order_id;
  end if;

  return jsonb_build_object('ok', true, 'amount_collected', v_collected, 'amount_refunded', v_refunded);
end;
$$;

-- ── Sipariş tahsilatı / iadesi ───────────────────────────────────────────────
-- Yön SEBEPTEN türer (motorun kuralı): tahsilat içeri, iade dışarı. Burada yalnız uygulanır —
-- fonksiyon kural bilmez, ama para tablosunun kısıtları da tutarsız satır yazılmasına izin vermez.
create or replace function public.record_order_movement(
  p_order_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_type movement_type,                              -- order_payment | order_refund
  p_value_date date default current_date,
  p_description text default null,
  p_source movement_source default 'manual',
  -- Sağlayıcı künyesi (07.11): kartla ödenmiş bir siparişte iade, paranın GELDİĞİ ödeme niyetinin
  -- üzerinden yapılır — `{"providerRef": "pi_..."}`. Sipariş kolonuna değil harekete yazılır:
  -- referans o ödemenin künyesidir, siparişin değil (bir siparişin birden çok tahsilatı olabilir).
  p_meta jsonb default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_movement_id uuid;
  v_direction movement_direction;
  v_amounts jsonb;
begin
  if p_type not in ('order_payment', 'order_refund') then
    raise exception 'record_order_movement: sipariş parası yalnız order_payment/order_refund olur (%)', p_type;
  end if;
  v_direction := case when p_type = 'order_payment' then 'in' else 'out' end;

  -- Sipariş satırı kilitli okunur: aynı anda iki tahsilat girilirse cache'i ikisi de
  -- yeniden hesaplar; kilit olmadan biri diğerinin toplamını görmeden yazabilirdi.
  perform 1 from public.order where id = p_order_id for update;
  if not found then
    raise exception 'record_order_movement: sipariş bulunamadı (%)', p_order_id;
  end if;

  insert into public.money_movement (account_id, direction, amount, type, order_id, value_date, description, source, meta)
  values (p_account_id, v_direction, p_amount, p_type, p_order_id, p_value_date, p_description, p_source, p_meta)
  returning id into v_movement_id;

  v_amounts := public.resync_order_amounts(p_order_id);

  return jsonb_build_object(
    'ok', true,
    'movement_id', v_movement_id,
    'amount_collected', v_amounts ->> 'amount_collected',
    'amount_refunded', v_amounts ->> 'amount_refunded'
  );
end;
$$;

revoke execute on function public.resync_order_amounts(uuid) from public, anon, authenticated;
revoke execute on function public.record_order_movement(uuid, uuid, numeric, movement_type, date, text, movement_source, jsonb)
  from public, anon, authenticated;

-- Sağlayıcı künyesinden harekete (07.11): `charge.refunded` bize yalnız `pi_...` ile gelir, sipariş
-- kimliğiyle değil. Kısmi indeks — künyeyi yalnız sağlayıcı üzerinden geçen ödemeler taşır.
create index money_movement_provider_ref_idx on public.money_movement ((meta ->> 'providerRef'))
  where meta ? 'providerRef';
