-- Modül 06/07 — Hazırlık onayı: çıkan partilerin kaydı (06.5'in yazım yarısı). DOMAIN §4.
--
-- Depo hazırlık ekranı FEFO'ya göre partiyi ÖNERİR (öneri motorda: domain-core/delivery + stock);
-- depocu "hazırlandı" derken fiilen çıkan parti(ler) buraya yazılır. Depocu öneriden saparsa yalnız
-- o satır değişir — günlük ek yük yok.
--
-- Bu kayıt iki şeyi mümkün kılar: **geri çağırmada** "bu parti hangi siparişlere gitti" tek sorgudur,
-- **gerçek COGS** partinin alış fiyatından hesaplanır (DOMAIN §12).
--
-- NEDEN RPC: bölünemez yazım (STACK §13 (b)). Partiler yazılıp `fulfilled_qty` yazılmazsa
-- Σ parti ≠ karşılanan miktar olur; o eşitlik raporun ve kısmi iade hesabının dayanağıdır.
-- Fiili stok düşümü BURADA DEĞİL: mal hâlâ depoda/araçta, "ayrılmış" durumda. Düşüm teslimde (07.7).
--
-- p_picks: [{"order_item_id": uuid, "batches": [{"stock_id": uuid, "qty": int}, ...]}, ...]

create or replace function public.record_preparation(
  p_order_id uuid,
  p_picks jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pick jsonb;
  v_batch jsonb;
  v_item_id uuid;
  v_ordered int;
  v_total int;
  v_items int := 0;
  v_order_warehouse uuid;
  v_stock_id uuid;
  v_batch_warehouse uuid;
begin
  if p_picks is null or jsonb_array_length(p_picks) = 0 then
    raise exception 'record_preparation: kalem seçimi boş olamaz';
  end if;

  select warehouse_id into v_order_warehouse from public.order where id = p_order_id;
  if v_order_warehouse is null then
    raise exception 'record_preparation: sipariş bulunamadı (%)', p_order_id;
  end if;

  for v_pick in select * from jsonb_array_elements(p_picks)
  loop
    v_item_id := (v_pick ->> 'order_item_id')::uuid;

    select qty into v_ordered
      from public.order_item
     where id = v_item_id and order_id = p_order_id
     for update;

    if not found then
      raise exception 'record_preparation: kalem bu siparişe ait değil (%)', v_item_id;
    end if;

    -- Yeniden hazırlık: önceki parti kaydı tamamen yenisiyle değişir (yamalanmaz).
    delete from public.order_item_batch where order_item_id = v_item_id;

    v_total := 0;
    for v_batch in select * from jsonb_array_elements(coalesce(v_pick -> 'batches', '[]'::jsonb))
    loop
      v_stock_id := (v_batch ->> 'stock_id')::uuid;

      -- Parti siparişin deposundan olmak zorunda (DOMAIN §17). Değişmez 0031'deki ertelenmiş kısıtta
      -- da duruyor — orası son savunma, burası ERKEN ve okunur hata: depocu hangi partiyi yanlış
      -- okuttuğunu COMMIT anındaki soyut ihlal mesajından değil, buradan öğrenir.
      select warehouse_id into v_batch_warehouse from public.stock where id = v_stock_id;
      if v_batch_warehouse is null then
        raise exception 'record_preparation: parti bulunamadı (%)', v_stock_id;
      end if;
      if v_batch_warehouse <> v_order_warehouse then
        raise exception 'record_preparation: parti % başka deponun malı — sipariş % deposundan hazırlanır',
          v_stock_id, v_order_warehouse;
      end if;

      insert into public.order_item_batch (order_item_id, stock_id, qty)
      values (v_item_id, v_stock_id, (v_batch ->> 'qty')::int);
      v_total := v_total + (v_batch ->> 'qty')::int;
    end loop;

    -- Sipariş edilenden FAZLASI hazırlanamaz; eksik olabilir (kısmi karşılama, DOMAIN §8).
    if v_total > v_ordered then
      raise exception 'record_preparation: kalem % için % adet hazırlandı ama % sipariş edilmiş', v_item_id, v_total, v_ordered;
    end if;

    update public.order_item set fulfilled_qty = v_total where id = v_item_id;
    v_items := v_items + 1;
  end loop;

  return jsonb_build_object('ok', true, 'items', v_items);
end;
$$;

revoke execute on function public.record_preparation(uuid, jsonb) from public, anon, authenticated;
