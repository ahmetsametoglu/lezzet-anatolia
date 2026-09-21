-- Teslim ve kapanış iki ayrı an: teslimde malın fiziksel gerçeği değişir, kapanışta kâr kalemleri sabitlenir.
-- İkisi de RPC, çünkü koşullu geçiş ve çok tablolu yazım yarıda kalırsa elle düzeltilecek hâl doğar.

-- ── Teslim ────────────────────────────────────────────────────────────────────
-- Stok hazırlıkta yazılan kalem–parti kaydından düşer; rezervasyon da burada biter.
create or replace function public.deliver_order(
  p_order_id uuid,
  p_actor_id uuid default null,
  p_delivery_proof jsonb default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current order_status;
  v_batch record;
  v_consumed int := 0;
  v_reference text;
begin
  select status, reference_no into v_current, v_reference
    from public.order where id = p_order_id for update;
  if not found then
    raise exception 'deliver_order: sipariş bulunamadı (%)', p_order_id;
  end if;

  -- Teslim yalnız yoldaki siparişten olur. İzin tablosunun tamamı motordadır (status-machine);
  -- burada yalnız beklenen kaynak doğrulanır — araya biri girmişse sessizce ezilmez.
  if v_current <> 'out_for_delivery' then
    return jsonb_build_object('ok', false, 'reason', 'stale', 'current_status', v_current);
  end if;

  -- Malın çıktığı an burasıdır ve deftere burada yazılır: hazırlık yalnız kalem–parti eşlemesini kurar,
  -- mal hâlâ raftadır. Partiler kilitli okunup düşülür.
  for v_batch in
    select b.stock_id, sum(b.qty) as qty, max(s.purchase_price) as unit_cost
      from public.order_item_batch b
      join public.order_item i on i.id = b.order_item_id
      join public.stock s on s.id = b.stock_id
     where i.order_id = p_order_id
     group by b.stock_id
  loop
    perform 1 from public.stock where id = v_batch.stock_id for update;

    update public.stock
       set physical_qty = physical_qty - v_batch.qty
     where id = v_batch.stock_id;

    insert into public.stock_movement
      (stock_id, direction, qty, kind, unit_cost, actor_id, reference_no, order_id)
    values
      (v_batch.stock_id, 'out', v_batch.qty, 'sale', v_batch.unit_cost, p_actor_id, v_reference, p_order_id);

    v_consumed := v_consumed + v_batch.qty;
  end loop;

  -- Rezervasyon biter: mal artık ayrılmış değil, gitmiş.
  delete from public.reservation where order_id = p_order_id;

  update public.order
     set status = 'delivered',
         delivery_proof = coalesce(p_delivery_proof, delivery_proof)
   where id = p_order_id;

  insert into public.order_status_log (order_id, from_status, to_status, actor_id)
  values (p_order_id, v_current, 'delivered', p_actor_id);

  return jsonb_build_object('ok', true, 'current_status', 'delivered', 'consumed_qty', v_consumed);
end;
$$;

-- ── Kapanış ───────────────────────────────────────────────────────────────────
-- Kâr kalemleri sabitlenir; `payment_fee` burada hesaplanmaz, uydurma oran kârı yanlış gösterirdi.
create or replace function public.close_order(
  p_order_id uuid,
  p_actor_id uuid default null,
  p_delivery_cost numeric default null,             -- kargoda GERÇEK ücret; rota-içinde null → birim maliyet
  p_route_unit_cost numeric default 0,              -- Setting: rota teslimat birim maliyeti
  p_packaging_unit_cost numeric default 0           -- Setting: paketleme birim maliyeti
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current order_status;
  v_delivery_type delivery_type;
  v_cogs numeric(10, 2);
  v_delivery numeric(10, 2);
begin
  select status, delivery_type into v_current, v_delivery_type
    from public.order where id = p_order_id for update;
  if not found then
    raise exception 'close_order: sipariş bulunamadı (%)', p_order_id;
  end if;

  -- İki kaynaktan kapanır: normal teslim ve iade sürecinin bitişi.
  if v_current not in ('delivered', 'returned') then
    return jsonb_build_object('ok', false, 'reason', 'stale', 'current_status', v_current);
  end if;

  -- Stoğa dönen mal kalem–parti kaydından düştüğü için buraya girmez; imha edilenin maliyeti kalır.
  select coalesce(sum(b.qty * coalesce(s.purchase_price, 0)), 0) into v_cogs
    from public.order_item_batch b
    join public.order_item i on i.id = b.order_item_id
    join public.stock s on s.id = b.stock_id
   where i.order_id = p_order_id;

  -- Teslimat maliyeti: kargoda gerçek ücret, rota-içinde sipariş başına birim maliyet.
  v_delivery := case when v_delivery_type = 'shipping' then coalesce(p_delivery_cost, 0) else p_route_unit_cost end;

  update public.order
     set status = 'completed',
         cogs_amount = v_cogs,
         delivery_cost = v_delivery,
         packaging_cost = p_packaging_unit_cost
   where id = p_order_id;

  insert into public.order_status_log (order_id, from_status, to_status, actor_id)
  values (p_order_id, v_current, 'completed', p_actor_id);

  return jsonb_build_object(
    'ok', true, 'current_status', 'completed',
    'cogs_amount', v_cogs, 'delivery_cost', v_delivery, 'packaging_cost', p_packaging_unit_cost
  );
end;
$$;

revoke execute on function public.deliver_order(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.close_order(uuid, uuid, numeric, numeric, numeric) from public, anon, authenticated;
