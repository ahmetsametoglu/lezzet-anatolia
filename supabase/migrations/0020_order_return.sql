-- Modül 07 — Kısmi karşılama (07.8) ve iptal/iade (07.9). DOMAIN §8, ORDER_LIFECYCLE.
--
-- İkisi de aynı soruyu sorar: **mal gitmediyse ya da geri geldiyse fiziksel gerçek nasıl düzeltilir?**
-- Paranın cevabı burada DEĞİL: iade borcu motorda türetilir (`domain-core/payment`: net tahsilat −
-- karşılanan tutar), hareketi uygulama katmanı yazar (12.2 `record_order_movement`). Bu dosya yalnız
-- malın gerçeğini yazar — ve o gerçek üç tabloya birden dokunduğu için bölünemez (STACK §13 (b)).
--
-- ── Malın nerede olduğu tek soruya iner: FİİLİ STOKTAN DÜŞTÜ MÜ? ─────────────────
-- Düşüm teslimde olur (0019 `deliver_order`). Bu yüzden iki hâl vardır ve her kayıp TAM BİR KEZ sayılır:
--
--   • **Mal çıkmadı** (`out_for_delivery`'den red, hazırlıkta eksik): fiili stok hiç düşmemiştir.
--     Kalem–parti kaydı ve rezervasyon azalır; mal depoda kalır. `discard` ise (araçta bozuldu)
--     fiiliden BURADA düşülür + fire kaydı yazılır.
--   • **Mal çıktı** (`delivered`/`completed` sonrası iade): fiili stok teslimde düşmüştür.
--     `restock` → mal depoya geri girer (fiili artar, `return_restock` kaydı) ve kalem–parti kaydından
--     düşer. `discard` → fiiliye DOKUNULMAZ (ikinci kez düşülemezdi) ve kalem–parti kaydı KALIR:
--     malın maliyeti siparişin COGS'unda kalır, kâr raporunda kaybı orada görünür. `goodwill` →
--     mal müşterideyken kaldı; ne miktar ne stok değişir (DOMAIN §8).
--
-- `order_item_batch`'in anlamı bu kuralla keskinleşir: **bizden çıkıp GERİ GELMEYEN mal.** COGS de
-- geri çağırma da bu kaydın üstünde durduğu için, geri dönen adedin orada kalması hem maliyeti hem
-- "bu parti kimde" cevabını yanlış yapardı.

-- ── Kısmi karşılama / kalem iadesi (07.8) ─────────────────────────────────────
-- p_lines: [{"order_item_id": uuid, "fulfilled_qty": int, "return_disposition": text|null, "note": text|null}]
--
-- `fulfilled_qty` yalnız AZALIR: artırmak "mal nereden çıktı" sorusunu cevapsız bırakır — çıkan mal
-- hazırlıkta yazılır (0018 `record_preparation`), burada değil.
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
  v_target int;
  v_delta int;                                       -- geri gelen / hiç gitmeyen adet
  v_disposition return_disposition;
  v_note text;
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

  v_consumed := v_status in ('delivered', 'completed');

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_item_id := (v_line ->> 'order_item_id')::uuid;
    v_target := (v_line ->> 'fulfilled_qty')::int;
    v_disposition := nullif(v_line ->> 'return_disposition', '')::return_disposition;
    v_note := nullif(v_line ->> 'note', '');

    select qty, fulfilled_qty into v_ordered, v_current
      from public.order_item
     where id = v_item_id and order_id = p_order_id
     for update;

    if not found then
      raise exception 'adjust_fulfillment: kalem bu siparişe ait değil (%)', v_item_id;
    end if;

    -- Jest iadesi: mal müşteride KALDI. Miktarı düşürmek malın hiç gitmediğini söylerdi — stok da
    -- COGS de bozulurdu (DOMAIN §8). Yalnız tasarruf işaretlenir; para tarafı elle girilen iadedir.
    if v_disposition = 'goodwill' then
      update public.order_item set return_disposition = 'goodwill' where id = v_item_id;
      v_lines := v_lines + 1;
      continue;
    end if;

    if v_target is null or v_target < 0 or v_target > v_ordered then
      raise exception 'adjust_fulfillment: kalem % için geçersiz miktar (% / sipariş %)', v_item_id, v_target, v_ordered;
    end if;

    if v_target > v_current then
      raise exception 'adjust_fulfillment: karşılanan miktar artırılamaz (kalem %, % → %)', v_item_id, v_current, v_target;
    end if;

    v_delta := v_current - v_target;
    update public.order_item
       set fulfilled_qty = v_target,
           return_disposition = coalesce(v_disposition, return_disposition)
     where id = v_item_id;
    v_lines := v_lines + 1;

    if v_delta = 0 then
      continue;
    end if;

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

        -- Geri dönen mal depoya girer — YALNIZ fiiliden düşmüşse (teslim sonrası iade).
        -- İmza 06.14'te değişti: yön ayrı parametre, miktar DAİMA pozitif (eskiden `-v_take`
        -- geçiliyordu). `p_order_id` de veriliyor — defterdeki iade satırı hangi siparişten
        -- döndüğünü kendi taşısın diye; eskiden bu bağ yalnız serbest metin notta vardı.
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
    'ok', true, 'current_status', v_status, 'lines', v_lines,
    'restocked_qty', v_restocked, 'discarded_qty', v_discarded, 'released_qty', v_released
  );
end;
$$;

-- ── İptal (07.9) ──────────────────────────────────────────────────────────────
-- İzin tablosu motordadır (`domain-core/order/status-machine`); buradaki tek kural fiziksel
-- gerçektir: beklenen kaynaktan ilerletilir, başkası ilerlettiyse `stale` döner.
--
-- İptalde mal MÜŞTERİYE HİÇ GİTMEMİŞTİR (teslim sonrası yol `returned`'dır) — bu yüzden fiili stok
-- değişmez; ayrılmış geri bırakılır ve kalem–parti kaydı silinir: hazırlanan mal depoda kalmıştır,
-- "müşteride kalan mal" kaydında görünmemelidir.
create or replace function public.cancel_order(
  p_order_id uuid,
  p_from order_status,
  p_actor_id uuid default null,
  -- İptalin SEBEBİ (07.14). Varsayılan `null` — sebep vermeyen eski çağıran kırılmaz, ama sebepsiz
  -- iptal ekranda "neden" sütununu boş bırakır ve müşteriye kurulacak cümleyi belirsizleştirir.
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

  -- Karşılanan miktar sıfırlanır: iptal edilen siparişte karşılanan tutar 0'dır (ORDER_LIFECYCLE),
  -- tahsil edilmişse tamamı iade borcudur. Türetim bunu `cancelled` durumundan da bilir; kalem
  -- gerçeğini de sıfırlamak iki kaynağın aynı şeyi söylemesini sağlar.
  update public.order_item set fulfilled_qty = 0 where order_id = p_order_id;

  -- Sebep AYNI güncellemede yazılır: ayrı bir `update` olsaydı ikisinin arasında sebepsiz bir
  -- iptal hâli doğardı ve o aralıkta okuyan ekran yanlış cümleyi kurardı.
  update public.order set status = 'cancelled', cancel_reason = p_reason where id = p_order_id;

  insert into public.order_status_log (order_id, from_status, to_status, actor_id)
  values (p_order_id, v_current, 'cancelled', p_actor_id);

  return jsonb_build_object('ok', true, 'current_status', 'cancelled', 'released_qty', v_released);
end;
$$;

revoke execute on function public.adjust_fulfillment(uuid, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.cancel_order(uuid, order_status, uuid, order_cancel_reason) from public, anon, authenticated;
