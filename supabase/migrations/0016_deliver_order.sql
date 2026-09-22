-- Teslim ve siparişin mal maliyeti. Teslim RPC'dir, çünkü koşullu geçiş ve çok tablolu yazım yarıda kalırsa
-- elle düzeltilecek hâl doğar.

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
  v_delivery_type delivery_type;
  v_batch record;
  v_consumed int := 0;
  v_reference text;
begin
  select status, reference_no, delivery_type into v_current, v_reference, v_delivery_type
    from public.order where id = p_order_id for update;
  if not found then
    raise exception 'deliver_order: sipariş bulunamadı (%)', p_order_id;
  end if;

  -- Teslim yalnız yoldaki siparişten olur; gel-al (`pickup`) siparişinin "yolda"sı yoktur, müşteri hazır (`ready`)
  -- malı depodan alır. İzin tablosunun tamamı motordadır (status-machine); burada yalnız beklenen kaynak
  -- doğrulanır — araya biri girmişse sessizce ezilmez.
  if not (v_current = 'out_for_delivery' or (v_current = 'ready' and v_delivery_type = 'pickup')) then
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

-- ── Mal maliyeti ──────────────────────────────────────────────────────────────
-- Kâr satış anından görünür: parti seçilmeden önce kalem, deposundaki son partinin alış fiyatıyla tahmin edilir;
-- parti yazılınca o partilerin fiyatıyla kesinleşir. İade edilip stoğa dönen mal kalem–parti kaydından düştüğü için
-- maliyetten de düşer, imha edilenin maliyeti kalır. Fiyatı bilinmeyen parti maliyeti 0 değil `null` yapar.
create or replace function public.refresh_order_cogs(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status order_status;
  v_warehouse_id uuid;
  v_cogs numeric(10, 2);
  v_estimate boolean;
begin
  select status, warehouse_id into v_status, v_warehouse_id from public.order where id = p_order_id;
  if not found then
    return;
  end if;

  with line as (
    select exists (select 1 from public.order_item_batch b where b.order_item_id = i.id) as picked,
           i.id,
           i.qty,
           i.variant_id
      from public.order_item i
     where i.order_id = p_order_id
  ),
  priced as (
    select not l.picked and v_status in ('draft', 'confirmed', 'preparing') as estimated,
           case
             when l.picked then (
               select case when bool_or(s.purchase_price is null) then null else sum(b.qty * s.purchase_price) end
                 from public.order_item_batch b
                 join public.stock s on s.id = b.stock_id
                where b.order_item_id = l.id
             )
             -- Hazırlık bitmiş ve kalem hiç toplanmamışsa mal gitmemiştir.
             when v_status not in ('draft', 'confirmed', 'preparing') then 0
             else l.qty * (
               select s.purchase_price
                 from public.stock s
                where s.variant_id = l.variant_id
                  and s.warehouse_id = v_warehouse_id
                  and s.purchase_price is not null
                order by s.created_at desc
                limit 1
             )
           end as cost
      from line l
  )
  select case when bool_or(cost is null) then null else sum(cost) end, coalesce(bool_or(estimated), false)
    into v_cogs, v_estimate
    from priced;

  update public.order
     set cogs_amount = v_cogs,
         cogs_is_estimate = v_estimate
   where id = p_order_id
     and (cogs_amount is distinct from v_cogs or cogs_is_estimate is distinct from v_estimate);
end;
$$;

create or replace function public.order_cogs_on_item() returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.refresh_order_cogs(coalesce(new.order_id, old.order_id));
  return null;
end;
$$;

create or replace function public.order_cogs_on_batch() returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.refresh_order_cogs(
    (select order_id from public.order_item where id = coalesce(new.order_item_id, old.order_item_id))
  );
  return null;
end;
$$;

-- Hazırlık bitince toplanmamış kalemin tahmini düşer; bu yüzden durum da maliyeti tazeler.
create or replace function public.order_cogs_on_status() returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.refresh_order_cogs(new.id);
  return null;
end;
$$;

create trigger order_item_cogs
  after insert or delete or update of qty, variant_id on public.order_item
  for each row execute function public.order_cogs_on_item();

create trigger order_item_batch_cogs
  after insert or delete or update of qty, stock_id on public.order_item_batch
  for each row execute function public.order_cogs_on_batch();

create trigger order_status_cogs
  after update of status on public.order
  for each row when (old.status is distinct from new.status)
  execute function public.order_cogs_on_status();

revoke execute on function public.deliver_order(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.refresh_order_cogs(uuid) from public, anon, authenticated;
