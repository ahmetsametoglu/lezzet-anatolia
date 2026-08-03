-- Modül 07 — Teslim ve kapanış (07.7). ORDER_LIFECYCLE, DOMAIN §4 (stok), §6 (teslim onayı), §12 (kâr).
--
-- İKİ AYRI AN, iki ayrı fonksiyon — `DOMAIN §12` görev satırından ayrılıyor:
--   • **Teslim** (`delivered`): malın fiziksel gerçeği değişir — ayrılmış düşer, fiili düşer.
--   • **Kapanış** (`completed`): kâr kalemleri SABİTLENİR (snapshot). §12 birebir: "kapanış =
--     `completed`'a geçiş anıdır". Teslim ile kapanış arasında iade/kısmi düzeltme olabilir;
--     maliyeti teslimde dondurmak o düzeltmeleri kârın dışında bırakırdı.
--
-- NEDEN RPC (her ikisi de): eşzamanlılık (koşullu geçiş) + bölünemez çok-tablolu yazım.
-- Yarıda kesilirse "stok düştü ama sipariş teslim görünmüyor" gibi elle düzeltilecek hâl doğar.

-- ── Teslim ────────────────────────────────────────────────────────────────────
-- Stok, hazırlıkta yazılan KALEM–PARTİ kaydından düşer (0015): hangi partiden kaç adet çıktığı
-- zaten belli. Rezervasyon da burada biter — mal artık müşterinin.
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
begin
  select status into v_current from public.order where id = p_order_id for update;
  if not found then
    raise exception 'deliver_order: sipariş bulunamadı (%)', p_order_id;
  end if;

  -- Teslim yalnız yoldaki siparişten olur. İzin tablosunun tamamı motordadır (status-machine);
  -- burada yalnız beklenen kaynak doğrulanır — araya biri girmişse sessizce ezilmez.
  if v_current <> 'out_for_delivery' then
    return jsonb_build_object('ok', false, 'reason', 'stale', 'current_status', v_current);
  end if;

  -- Fiili stok düşümü: partiler kilitli okunur, sonra düşülür.
  for v_batch in
    select b.stock_id, sum(b.qty) as qty
      from public.order_item_batch b
      join public.order_item i on i.id = b.order_item_id
     where i.order_id = p_order_id
     group by b.stock_id
  loop
    perform 1 from public.stock where id = v_batch.stock_id for update;

    update public.stock
       set physical_qty = physical_qty - v_batch.qty
     where id = v_batch.stock_id;
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
-- Kâr kalemleri burada SABİTLENİR (DOMAIN §12): sonradan değişen oran/maliyet geçmiş kârı bozmasın.
-- COGS gerçek maliyettir — tüketilen partilerin kendi alış fiyatından, ortalamadan değil.
--
-- `payment_fee` BURADA HESAPLANMAZ: komisyon oranları para modülüyle (12) gelir; o zamana kadar
-- null kalır. Uydurma bir oranla doldurmak, kârı sessizce yanlış gösterirdi.
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

  -- İki kaynaktan kapanır: normal teslim (`delivered`) ve iade sürecinin bitişi (`returned` —
  -- ORDER_LIFECYCLE: sipariş kalıcı `returned`'da kalmaz, depo aksiyonu + para iadesi bitince kapanır).
  if v_current not in ('delivered', 'returned') then
    return jsonb_build_object('ok', false, 'reason', 'stale', 'current_status', v_current);
  end if;

  -- Gerçek COGS: tüketilen partilerin kendi alış fiyatı (DOMAIN §12). İade edilip stoğa dönen mal
  -- kalem–parti kaydından düşüldüğü için (0020) buraya kendiliğinden girmez; imha/jest edilenin
  -- maliyeti ise kaydı korunduğu için burada KALIR — kayıp o siparişin kârında görünür.
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
