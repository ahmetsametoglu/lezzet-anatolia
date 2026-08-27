-- Modül 07 — Hızlı satış: kapı önü tek adım (07.10). ORDER_LIFECYCLE "Hızlı satış yolu", DOMAIN §4, §12.
--
-- Tam yol yedi durumdan geçer; kapı önü BİR adımdır: `draft → completed`. Müşteri karşıda,
-- mal elden gidiyor, para o an alınıyor — arada bekleyen bir şey yok. Bu yüzden:
--   • REZERVASYON YOK — ayrılacak bir gelecek yok, stok **fiiliden anında** düşer (DOMAIN §4).
--   • `reference_no` BURADA üretilir — hızlı satışta ilk kalıcı durum `completed`'dır.
--   • Kâr kalemleri BURADA sabitlenir — kapanış anı bu andır (DOMAIN §12).
--
-- NEDEN RPC (STACK §13, iki koşul birden):
--   (a) **Eşzamanlılık:** kapıdaki satış ile web'den gelen rezervasyon aynı son birimi ister.
--       "Önce oku sonra yaz" ikisine de evet der → aşırı satış. Kilit + koşullu düşüm şart.
--   (b) **Bölünemez yazım:** parti kaydı, stok düşümü, referans, tahsilat ve kapanış tek gerçektir.
--       Yarısı yazılırsa "stok düştü ama satış yok" gibi elle düzeltilecek hâl doğar.
--
-- Fonksiyon KURAL BİLMEZ: geçişin izinli olduğuna motor karar verir (domain-core/status-machine),
-- ödeme durumunu motor türetir (03.6), referansı motor üretir. Buradaki tek kural fiziksel gerçektir:
-- olmayan malı satamazsın, taslak olmayan siparişi kapıda kapatamazsın.
--
-- p_picks: [{"order_item_id": uuid, "batches": [{"stock_id": uuid, "qty": int}, ...]}, ...]

create or replace function public.quick_sale(
  p_order_id uuid,
  p_picks jsonb,
  p_actor_id uuid default null,
  p_reference_no text default null,                  -- motor üretir; mevcut numarayı EZMEZ
  p_payment_method payment_method default null,
  p_packaging_unit_cost numeric default 0
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current order_status;
  v_pick jsonb;
  v_batch jsonb;
  v_item_id uuid;
  v_variant_id uuid;
  v_ordered int;
  v_total int;
  v_row record;
  v_physical int;
  v_reserved int;
  v_available int;
  v_consumed int := 0;
  v_cogs numeric(10, 2);
  v_fee numeric(10, 2);
  v_reference text;
  -- Kapı önü satışta depo, işlemi yapan personelin sabit deposudur (C4) ve siparişin taslağına
  -- zaten yazılmıştır — burada AYRICA sorulmaz, siparişten okunur. İkinci bir kaynak, iki kaynağın
  -- ayrışabileceği anlamına gelirdi.
  v_order_warehouse uuid;
begin
  -- `reference_no` de BURADA okunuyor: defter satırı (adım 3) numarayı istiyor ve sipariş
  -- güncellemesi (adım 5) ondan sonra geliyor. Mevcut numara varsa o kullanılır — `coalesce`
  -- sırası aşağıdaki `update` ile aynı, yani defterdeki numara siparişin numarasıyla hep birebir.
  select status, warehouse_id, reference_no into v_current, v_order_warehouse, v_reference
    from public.order where id = p_order_id for update;
  if not found then
    raise exception 'quick_sale: sipariş bulunamadı (%)', p_order_id;
  end if;

  -- Hızlı satış yalnız taslaktan olur. Araya biri girip siparişi ilerletmişse sessizce ezilmez.
  if v_current <> 'draft' then
    return jsonb_build_object('ok', false, 'reason', 'stale', 'current_status', v_current);
  end if;

  if p_picks is null or jsonb_array_length(p_picks) = 0 then
    raise exception 'quick_sale: kalem seçimi boş olamaz';
  end if;

  -- ── 1) ÖNCE KONTROL, SONRA YAZIM ────────────────────────────────────────────
  -- Yetersiz stok bir hata değil, bir CEVAPTIR (kasiyer ekranında "3 adet kaldı" yazar) — bu yüzden
  -- `return` ile bildirilir. `return` transaction'ı geri almadığı için kontrol, tek satır yazılmadan
  -- ÖNCE biter.
  for v_row in
    select oi.variant_id, sum((b ->> 'qty')::int) as qty
      from jsonb_array_elements(p_picks) pk
      join public.order_item oi
        on oi.id = (pk ->> 'order_item_id')::uuid and oi.order_id = p_order_id
      cross join lateral jsonb_array_elements(coalesce(pk -> 'batches', '[]'::jsonb)) b
     group by oi.variant_id
  loop
    -- Varyantın TÜM partileri kilitlenir: kullanılabilir hesabı varyant toplamındadır, tek parti
    -- kilitlemek yarışı kapatmaz. Sabit sırayla (id) kilitlenir — karşılıklı bekleme olmasın.
    -- **DEPO İÇİNDE** (DOMAIN §17): kapıdaki satış o kapının deposundan çıkar; başka şehirdeki mal
    -- burada satılamaz. Süzgeç düşerse fonksiyon sessizce olmayan malı satar ve kasa açık verir.
    perform 1 from public.stock
      where variant_id = v_row.variant_id and warehouse_id = v_order_warehouse
      order by id for update;

    select coalesce(sum(physical_qty), 0) into v_physical
      from public.stock where variant_id = v_row.variant_id and warehouse_id = v_order_warehouse;

    -- KULLANILABİLİR = FİİLİ − BAŞKASINA AYRILMIŞ. Siparişin KENDİ rezervasyonu düşülmez: online
    -- sepetini kapıda kapatan müşteri kendi ayırdığı mala takılmasın (o satırlar aşağıda silinir).
    select coalesce(sum(qty), 0) into v_reserved
      from public.reservation
     where variant_id = v_row.variant_id
       and warehouse_id = v_order_warehouse
       and order_id <> p_order_id
       and (expires_at is null or expires_at > now());

    v_available := greatest(v_physical - v_reserved, 0);
    if v_row.qty > v_available then
      return jsonb_build_object(
        'ok', false, 'reason', 'insufficient_stock', 'current_status', v_current,
        'variant_id', v_row.variant_id, 'available', v_available
      );
    end if;
  end loop;

  -- Parti bazında da yetmeli: varyant toplamı yetse bile SEÇİLEN parti tükenmiş olabilir.
  for v_row in
    select (b ->> 'stock_id')::uuid as stock_id, sum((b ->> 'qty')::int) as qty
      from jsonb_array_elements(p_picks) pk
      join public.order_item oi
        on oi.id = (pk ->> 'order_item_id')::uuid and oi.order_id = p_order_id
      cross join lateral jsonb_array_elements(coalesce(pk -> 'batches', '[]'::jsonb)) b
     group by 1
  loop
    select physical_qty, variant_id into v_physical, v_variant_id
      from public.stock where id = v_row.stock_id and warehouse_id = v_order_warehouse;
    if not found then
      -- Parti hiç yok ya da BAŞKA DEPODA: ikisi de kasiyerin seçemeyeceği bir satırdır. Ayrım
      -- yapmıyoruz çünkü kapıdaki ekranda başka deponun partisi zaten listelenmez — buraya gelen
      -- böyle bir kimlik bir çağrı hatasıdır, kullanıcı hatası değil.
      raise exception 'quick_sale: parti bu depoda bulunamadı (%)', v_row.stock_id;
    end if;
    if v_row.qty > v_physical then
      return jsonb_build_object(
        'ok', false, 'reason', 'insufficient_stock', 'current_status', v_current,
        'variant_id', v_variant_id, 'available', v_physical
      );
    end if;
  end loop;

  -- ── 2) Kalem–parti kaydı + karşılanan miktar ────────────────────────────────
  -- Kapıda hazırlık ekranı yoktur; çıkan parti burada yazılır. Geri çağırma ("bu parti kime gitti")
  -- ve gerçek COGS bu kaydın üstünde durur — hızlı satış bu izi atlamaz.
  for v_pick in select * from jsonb_array_elements(p_picks)
  loop
    v_item_id := (v_pick ->> 'order_item_id')::uuid;

    select qty into v_ordered
      from public.order_item
     where id = v_item_id and order_id = p_order_id
     for update;
    if not found then
      raise exception 'quick_sale: kalem bu siparişe ait değil (%)', v_item_id;
    end if;

    delete from public.order_item_batch where order_item_id = v_item_id;

    v_total := 0;
    for v_batch in select * from jsonb_array_elements(coalesce(v_pick -> 'batches', '[]'::jsonb))
    loop
      insert into public.order_item_batch (order_item_id, stock_id, qty)
      values (v_item_id, (v_batch ->> 'stock_id')::uuid, (v_batch ->> 'qty')::int);
      v_total := v_total + (v_batch ->> 'qty')::int;
    end loop;

    if v_total > v_ordered then
      raise exception 'quick_sale: kalem % için % adet verildi ama % sipariş edilmiş', v_item_id, v_total, v_ordered;
    end if;

    update public.order_item set fulfilled_qty = v_total where id = v_item_id;
  end loop;

  -- ── 3) Stok FİİLİDEN düşer (rezervasyon adımı yok) ──────────────────────────
  -- Deftere `counter_sale` olarak yazılır (06.14) — `sale`den AYRI bir tip, çünkü kapı satışı
  -- hazırlık ve teslim adımlarını hiç görmez: mal tezgâhta el değiştirir. İkisini tek tipe
  -- toplasaydık "bu çeyrekte tezgâhtan ne sattık" sorusu bir daha sorulamazdı.
  for v_row in
    select b.stock_id, sum(b.qty) as qty, max(s.purchase_price) as unit_cost
      from public.order_item_batch b
      join public.order_item i on i.id = b.order_item_id
      join public.stock s on s.id = b.stock_id
     where i.order_id = p_order_id
     group by b.stock_id
  loop
    update public.stock set physical_qty = physical_qty - v_row.qty where id = v_row.stock_id;

    insert into public.stock_movement
      (stock_id, direction, qty, kind, unit_cost, actor_id, reference_no, order_id)
    values
      (v_row.stock_id, 'out', v_row.qty, 'counter_sale', v_row.unit_cost, p_actor_id,
       coalesce(v_reference, p_reference_no), p_order_id);

    v_consumed := v_consumed + v_row.qty;
  end loop;

  -- Sepetini online açıp kapıda kapatan müşterinin ayırdığı stok serbest kalır: mal artık gitti.
  delete from public.reservation where order_id = p_order_id;

  -- ── 4) Kâr kalemleri sabitlenir — kapanış anı budur (DOMAIN §12) ────────────
  select coalesce(sum(b.qty * coalesce(s.purchase_price, 0)), 0) into v_cogs
    from public.order_item_batch b
    join public.order_item i on i.id = b.order_item_id
    join public.stock s on s.id = b.stock_id
   where i.order_id = p_order_id;

  -- Nakitte komisyon SIFIRDIR — bu uydurma değil, olgudur (DOMAIN §12). Kart/online oranları para
  -- modülüyle (12) gelir; o zamana kadar null: yanlış oran, yanlış kârdan iyidir.
  v_fee := case when p_payment_method = 'cash' then 0 else null end;

  update public.order
     set status          = 'completed',
         reference_no    = coalesce(reference_no, p_reference_no),
         payment_method  = coalesce(p_payment_method, payment_method),
         -- `payment_status` ve `amount_collected` BURADA YAZILMAZ (12.2): ikisinin de kaynağı para
         -- hareketleridir. Buradan yazsaydık kapı önü satışının nakdi hiçbir hesabın bakiyesine
         -- düşmez, sipariş "ödendi" görünürken kasa boş kalırdı. Tahsilatı kapı, satıştan hemen
         -- sonra `record_order_movement` ile yazar.
         cogs_amount     = v_cogs,
         -- Kapı önünde teslimat YAPILMADI: rota birim maliyeti bu satışa yazılamaz.
         delivery_cost   = 0,
         packaging_cost  = p_packaging_unit_cost,
         payment_fee     = v_fee
   where id = p_order_id
   returning reference_no into v_reference;

  -- Adım atlandı diye iz atlanmaz (ORDER_LIFECYCLE): geçiş yine loglanır, kapanış anı buradan okunur.
  insert into public.order_status_log (order_id, from_status, to_status, actor_id)
  values (p_order_id, v_current, 'completed', p_actor_id);

  return jsonb_build_object(
    'ok', true, 'current_status', 'completed',
    'reference_no', v_reference, 'consumed_qty', v_consumed, 'cogs_amount', v_cogs
  );
end;
$$;

revoke execute on function public.quick_sale(uuid, jsonb, uuid, text, payment_method, numeric)
  from public, anon, authenticated;
