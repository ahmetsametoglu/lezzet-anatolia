-- Kısmi karşılama, iade ve iptalin mal tarafı; para motorda türetilir, hareketi uygulama katmanı yazar (DOMAIN §8, ORDER_LIFECYCLE).
-- Mal teslimde fiili stoktan düştüyse iade onu geri koyar ya da maliyeti siparişte bırakır, düşmediyse yalnız ayrılmış ve parti bağı azalır; `order_item_batch` bizden çıkıp geri gelmeyen maldır.

-- Bir kalemin adetleri farklı akıbet alabilir: her adet düşüşü kendi satırıdır ve kim, ne zaman, hangi sebeple sorusu
-- satırda cevaplanır. `stage` olay anındaki sipariş durumudur; ekran kapıda geri çevrileni teslim sonrası iadeden bununla ayırır.
create table public.order_item_return (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.order (id) on delete cascade,
  order_item_id uuid not null references public.order_item (id) on delete cascade,
  qty int not null check (qty > 0),
  disposition return_disposition,                    -- null = akıbet sorulmadan düşen adet (hazırlıkta eksik, kapıda red)
  note text,
  stage order_status not null,
  actor_id uuid references public.user_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_item_return_order_idx on public.order_item_return (order_id, created_at);
create index order_item_return_item_idx on public.order_item_return (order_item_id);
alter table public.order_item_return enable row level security;

-- p_lines: [{"order_item_id": uuid, "fulfilled_qty": int, "return_disposition": text|null, "goodwill_qty": int|null,
-- "note": text|null}]; `fulfilled_qty` hedef değerdir ve yalnız azalır, aynı kalem sırayla birden çok kez gelebilir.
-- Artırmak malın nereden çıktığını cevapsız bırakırdı; çıkan mal hazırlıkta yazılır (0018 `record_preparation`).
create or replace function public.adjust_fulfillment(
  p_order_id uuid,
  p_lines jsonb,
  p_actor_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status order_status;
  v_consumed boolean;                                -- mal fiili stoktan düştü mü (teslim edildi mi)
  v_line jsonb;
  v_item_id uuid;
  v_ordered int;
  v_current int;
  v_kept int;                                        -- müşteride kalan (jestle kapanmış) adet
  v_target int;
  v_delta int;                                       -- geri gelen / hiç gitmeyen adet
  v_disposition return_disposition;
  v_goodwill_qty int;
  v_note text;
  v_planned jsonb := '{}'::jsonb;                    -- doğrulama turunda kalemin sıradaki karşılanan adedi
  v_planned_kept jsonb := '{}'::jsonb;               -- doğrulama turunda kalemin sıradaki jest adedi
  v_returns jsonb := '[]'::jsonb;
  v_batch record;
  v_take int;
  v_left int;
  v_reservation record;
  v_lines int := 0;
  v_restocked int := 0;
  v_discarded int := 0;
  v_released int := 0;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'adjust_fulfillment: kalem listesi boş olamaz';
  end if;

  select status into v_status from public.order where id = p_order_id for update;
  if not found then
    raise exception 'adjust_fulfillment: sipariş bulunamadı (%)', p_order_id;
  end if;

  -- İptal edilmiş siparişin kalemi düzeltilmez: karşılanan zaten 0 sayılır (ORDER_LIFECYCLE).
  if v_status = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'stale', 'current_status', v_status);
  end if;

  -- Mal fiili stoktan düştü mü sorusu durum günlüğünden sorulur: teslim edilip sonra `returned`a çevrilen siparişte anlık durum yanıltır.
  -- Stoğu düşüren olay teslimdir ve günlükte kalıcıdır.
  v_consumed := v_status in ('delivered', 'completed')
    or exists (
      select 1 from public.order_status_log l
       where l.order_id = p_order_id and l.to_status in ('delivered', 'completed')
    );

  -- Önce bütün istek doğrulanır, çünkü ret ancak hiçbir satır yazılmadan dönerse bütündür. Akıbetli bir satırın düşüreceği
  -- adet kalmadıysa ya da müşteride kalan adede uzanıyorsa ekran bayattır veya istek tekrarıdır; sebep adıyla döner.
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_item_id := (v_line ->> 'order_item_id')::uuid;
    v_target := (v_line ->> 'fulfilled_qty')::int;
    v_disposition := nullif(v_line ->> 'return_disposition', '')::return_disposition;
    v_goodwill_qty := (v_line ->> 'goodwill_qty')::int;

    select qty, fulfilled_qty, goodwill_qty into v_ordered, v_current, v_kept
      from public.order_item
     where id = v_item_id and order_id = p_order_id
     for update;
    if not found then
      raise exception 'adjust_fulfillment: kalem bu siparişe ait değil (%)', v_item_id;
    end if;
    v_current := coalesce((v_planned ->> v_item_id::text)::int, v_current);
    v_kept := coalesce((v_planned_kept ->> v_item_id::text)::int, v_kept);

    if v_disposition = 'goodwill' then
      if v_goodwill_qty is not null and v_goodwill_qty < 1 then
        raise exception 'adjust_fulfillment: kalem % için geçersiz jest adedi (%)', v_item_id, v_goodwill_qty;
      end if;
      v_goodwill_qty := coalesce(v_goodwill_qty, v_current - v_kept);
      if v_goodwill_qty < 1 or v_goodwill_qty > v_current - v_kept then
        return jsonb_build_object(
          'ok', false, 'reason', 'already_marked', 'current_status', v_status, 'order_item_id', v_item_id
        );
      end if;
      v_planned_kept := v_planned_kept || jsonb_build_object(v_item_id::text, v_kept + v_goodwill_qty);
      continue;
    end if;

    if v_target is null or v_target < 0 or v_target > v_ordered then
      raise exception 'adjust_fulfillment: kalem % için geçersiz miktar (% / sipariş %)', v_item_id, v_target, v_ordered;
    end if;
    if v_target > v_current then
      raise exception 'adjust_fulfillment: karşılanan miktar artırılamaz (kalem %, % → %)', v_item_id, v_current, v_target;
    end if;
    if (v_target = v_current and v_disposition is not null) or v_target < v_kept then
      return jsonb_build_object(
        'ok', false, 'reason', 'already_marked', 'current_status', v_status, 'order_item_id', v_item_id
      );
    end if;
    v_planned := v_planned || jsonb_build_object(v_item_id::text, v_target);
  end loop;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_item_id := (v_line ->> 'order_item_id')::uuid;
    v_target := (v_line ->> 'fulfilled_qty')::int;
    v_disposition := nullif(v_line ->> 'return_disposition', '')::return_disposition;
    v_goodwill_qty := (v_line ->> 'goodwill_qty')::int;
    v_note := nullif(v_line ->> 'note', '');

    select fulfilled_qty, goodwill_qty into v_current, v_kept from public.order_item where id = v_item_id;

    -- Jest iadesi: mal müşteride kaldı, karşılanan düşmez (DOMAIN §8); o adetler ücretlenmez, parasını motor türetir.
    if v_disposition = 'goodwill' then
      v_goodwill_qty := coalesce(v_goodwill_qty, v_current - v_kept);
      update public.order_item set goodwill_qty = goodwill_qty + v_goodwill_qty where id = v_item_id;
      insert into public.order_item_return (order_id, order_item_id, qty, disposition, note, stage, actor_id)
      values (p_order_id, v_item_id, v_goodwill_qty, 'goodwill', v_note, v_status, p_actor_id);
      v_returns := v_returns || jsonb_build_object('order_item_id', v_item_id, 'qty', v_goodwill_qty, 'disposition', 'goodwill');
      v_lines := v_lines + 1;
      continue;
    end if;

    v_delta := v_current - v_target;
    if v_delta = 0 then
      continue;
    end if;

    update public.order_item set fulfilled_qty = v_target where id = v_item_id;
    insert into public.order_item_return (order_id, order_item_id, qty, disposition, note, stage, actor_id)
    values (p_order_id, v_item_id, v_delta, v_disposition, v_note, v_status, p_actor_id);
    v_returns := v_returns || jsonb_build_object('order_item_id', v_item_id, 'qty', v_delta, 'disposition', v_disposition);
    v_lines := v_lines + 1;

    -- Kalem–parti kaydından düşülür: `discard` + mal çıkmış hâli HARİÇ (maliyet siparişte kalır).
    if not (v_consumed and v_disposition = 'discard') then
      v_left := v_delta;
      for v_batch in
        select id, stock_id, qty from public.order_item_batch
         where order_item_id = v_item_id
         order by qty desc
      loop
        exit when v_left <= 0;
        v_take := least(v_left, v_batch.qty);

        -- Geri dönen mal yalnız fiiliden düşmüşse depoya girer; `p_order_id` defterdeki satırın hangi siparişten döndüğünü taşır.
        if v_consumed and v_disposition = 'restock' then
          perform public.adjust_stock(
            v_batch.stock_id, v_take, 'in', 'return_restock', null,
            coalesce(v_note, 'Sipariş iadesi — stoğa dönüş'), p_actor_id, p_order_id
          );
          v_restocked := v_restocked + v_take;
        -- Mal hiç çıkmamışken imha (araçta bozuldu): fiili düşüm ve fire kaydı BURADA doğar.
        elsif not v_consumed and v_disposition = 'discard' then
          perform public.adjust_stock(
            v_batch.stock_id, v_take, 'out', 'write_off', 'damaged',
            coalesce(v_note, 'Teslim edilemeden hasarlandı'), p_actor_id, p_order_id
          );
          v_discarded := v_discarded + v_take;
        end if;

        if v_take = v_batch.qty then
          delete from public.order_item_batch where id = v_batch.id;
        else
          update public.order_item_batch set qty = qty - v_take where id = v_batch.id;
        end if;
        v_left := v_left - v_take;
      end loop;
    end if;

    -- Mal çıkmadıysa ayrılmış da azalır: gitmeyen adet başkasına satılabilir olmalı (DOMAIN §4).
    if not v_consumed then
      v_left := v_delta;
      for v_reservation in
        select id, qty from public.reservation
         where order_id = p_order_id
           and variant_id = (select variant_id from public.order_item where id = v_item_id)
         order by qty desc
      loop
        exit when v_left <= 0;
        v_take := least(v_left, v_reservation.qty);
        if v_take = v_reservation.qty then
          delete from public.reservation where id = v_reservation.id;
        else
          update public.reservation set qty = qty - v_take where id = v_reservation.id;
        end if;
        v_released := v_released + v_take;
        v_left := v_left - v_take;
      end loop;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true, 'current_status', v_status, 'lines', v_lines, 'returns', v_returns,
    'restocked_qty', v_restocked, 'discarded_qty', v_discarded, 'released_qty', v_released
  );
end;
$$;

-- İptal: izin motorda (`domain-core/order/status-machine`); burada beklenen kaynaktan ilerletilir, başkası ilerlettiyse `stale` döner.
-- İptalde mal müşteriye gitmemiştir: fiili stok değişmez, ayrılmış bırakılır ve kalem–parti kaydı silinir.
create or replace function public.cancel_order(
  p_order_id uuid,
  p_from order_status,
  p_actor_id uuid default null,
  -- İptalin sebebi; sebepsiz iptal ekranda "neden" sütununu boş bırakır ve müşteriye kurulacak cümleyi belirsizleştirir.
  p_reason order_cancel_reason default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current order_status;
  v_released int;
begin
  select status into v_current from public.order where id = p_order_id for update;
  if not found then
    raise exception 'cancel_order: sipariş bulunamadı (%)', p_order_id;
  end if;

  if v_current <> p_from then
    return jsonb_build_object('ok', false, 'reason', 'stale', 'current_status', v_current);
  end if;

  select coalesce(sum(qty), 0) into v_released from public.reservation where order_id = p_order_id;
  delete from public.reservation where order_id = p_order_id;

  delete from public.order_item_batch
   where order_item_id in (select id from public.order_item where order_id = p_order_id);

  -- İptalde karşılanan tutar 0'dır (ORDER_LIFECYCLE); kalem gerçeği de sıfırlanır ki iki kaynak aynı şeyi söylesin.
  update public.order_item set fulfilled_qty = 0, goodwill_qty = 0 where order_id = p_order_id;

  -- Sebep AYNI güncellemede yazılır: ayrı bir `update` olsaydı ikisinin arasında sebepsiz bir
  -- iptal hâli doğardı ve o aralıkta okuyan ekran yanlış cümleyi kurardı.
  update public.order set status = 'cancelled', cancel_reason = p_reason where id = p_order_id;

  insert into public.order_status_log (order_id, from_status, to_status, actor_id)
  values (p_order_id, v_current, 'cancelled', p_actor_id);

  return jsonb_build_object('ok', true, 'current_status', 'cancelled', 'released_qty', v_released);
end;
$$;

-- Kapıda tek yazım: düzeltme ve teslim bölünmez, yoksa teslim `stale` döndüğünde düzeltme ve müşteri haberi yarım kalırdı.
-- İki fonksiyon aynı transaction'da çağrılır, mantık kopyalanmaz; para ve haber yazım kesinleştikten sonra uygulama katmanında yazılır.
create or replace function public.deliver_order_with_adjustments(
  p_order_id uuid,
  p_lines jsonb default null,
  p_actor_id uuid default null,
  p_delivery_proof jsonb default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current order_status;
  v_adjust jsonb := null;
  v_deliver jsonb;
begin
  select status into v_current from public.order where id = p_order_id for update;
  if not found then
    raise exception 'deliver_order_with_adjustments: sipariş bulunamadı (%)', p_order_id;
  end if;

  -- Teslim yalnız yoldaki siparişten olur (`deliver_order`ın aynı ölçütü). Burada erken sorulmasının
  -- sebebi düzeltmeyi HİÇ yazmamak: cevap `stale` ise mal da para da haber de kıpırdamaz.
  if v_current <> 'out_for_delivery' then
    return jsonb_build_object('ok', false, 'reason', 'stale', 'current_status', v_current);
  end if;

  if p_lines is not null and jsonb_array_length(p_lines) > 0 then
    v_adjust := public.adjust_fulfillment(p_order_id, p_lines, p_actor_id);
    -- Düzeltme reddedilirse teslim de yazılmaz: sebep (`stale` / `already_marked`) olduğu gibi
    -- yukarı çıkar, çağıran ekran kendi cümlesini kurar.
    if not (v_adjust->>'ok')::boolean then
      return v_adjust;
    end if;
  end if;

  v_deliver := public.deliver_order(p_order_id, p_actor_id, p_delivery_proof);
  if not (v_deliver->>'ok')::boolean then
    -- Buraya normalde düşülmez (durum yukarıda kilitli okundu) ama düşülürse transaction geri
    -- sarılmalı: düzeltme yazılı kalırsa kapatmaya çalıştığımız arıza aynen geri gelir.
    raise exception 'deliver_order_with_adjustments: teslim yazılamadı (%) — düzeltme geri alındı',
      coalesce(v_deliver->>'reason', 'bilinmiyor');
  end if;

  -- İki sonucun BİRLEŞİMİ: çağıran hem kaç kalem düzeltildiğini hem kaç adet çıktığını okuyor.
  -- Düzeltme yoksa alanlar sıfır — "yazılmadı" ile "sıfır yazıldı" arasındaki farkı `lines` söyler.
  return jsonb_build_object(
    'ok', true,
    'current_status', 'delivered',
    'consumed_qty', coalesce((v_deliver->>'consumed_qty')::int, 0),
    'lines', coalesce((v_adjust->>'lines')::int, 0),
    'restocked_qty', coalesce((v_adjust->>'restocked_qty')::int, 0),
    'discarded_qty', coalesce((v_adjust->>'discarded_qty')::int, 0),
    'released_qty', coalesce((v_adjust->>'released_qty')::int, 0)
  );
end;
$$;

revoke execute on function public.adjust_fulfillment(uuid, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.cancel_order(uuid, order_status, uuid, order_cancel_reason) from public, anon, authenticated;
revoke execute on function public.deliver_order_with_adjustments(uuid, jsonb, uuid, jsonb) from public, anon, authenticated;
