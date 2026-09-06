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
  /** Kalemde ZATEN yazılı akıbet — "bir kez yazılır" kapısının ölçütü (04.09). */
  v_existing return_disposition;
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

  /*
    ── "MAL FİİLİ STOKTAN DÜŞTÜ MÜ" GEÇMİŞTEN SORULUR, ANLIK DURUMDAN DEĞİL (kusur, ölçüldü 04.09) ──

    Ölçüt `v_status in ('delivered','completed')` idi ve teslim SONRASI iade yolunda sessizce
    yanlış cevap veriyordu: sipariş önce `delivered` olur (stok `deliver_order` ile fiilen düşer),
    sonra `returned`a çevrilir — bu geçiş motorda izinli ve bugün kurye ucundan erişilebilir. O
    noktada durum artık `returned` olduğu için ölçüt FALSE dönüyordu ve iki dal birden ters
    çalışıyordu: `restock`ta mal deftere geri girmiyor (kalıcı hayalet kayıp), `discard`ta stok
    İKİNCİ kez düşüyordu.

    Doğru soru "şu an hangi durumda" değil, "bu sipariş HİÇ teslim edildi mi": stoğu düşüren olay
    teslimin kendisi (`0016_deliver_order.sql`) ve o olay geri alınmıyor. Cevabı durum GÜNLÜĞÜ
    taşıyor — anlık durum bir sonraki geçişte değişir, günlük değişmez.
  */
  v_consumed := v_status in ('delivered', 'completed')
    or exists (
      select 1 from public.order_status_log l
       where l.order_id = p_order_id and l.to_status in ('delivered', 'completed')
    );

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_item_id := (v_line ->> 'order_item_id')::uuid;
    v_target := (v_line ->> 'fulfilled_qty')::int;
    v_disposition := nullif(v_line ->> 'return_disposition', '')::return_disposition;
    v_note := nullif(v_line ->> 'note', '');

    select qty, fulfilled_qty, return_disposition into v_ordered, v_current, v_existing
      from public.order_item
     where id = v_item_id and order_id = p_order_id
     for update;

    if not found then
      raise exception 'adjust_fulfillment: kalem bu siparişe ait değil (%)', v_item_id;
    end if;

    /*
      ── AKIBET BİR KEZ YAZILIR (kusur, ölçüldü 04.09) ─────────────────────────────────────────

      Kapının "bu kalem zaten karara bağlanmış" sorusu YOKTU: gelen akıbet `coalesce` ile üzerine
      yazılıyor, goodwill dalı ise miktar doğrulamalarının ikisini birden atlayıp doğrudan
      yazıyordu. Tek savunma ekranın salt-okunur çizimiydi ve o çizim BAYAT olabiliyor — iki
      dönüşlü bir kuryede ikinci sipariş ağ hatasıyla düşerse ekran yerinde kalır, ilk siparişin
      yazılmış satırları hâlâ işaretsiz görünür ve çipleri yeniden basılabilir.

      Sonuç kendi kendini yalanlayan bir kayıttı: `goodwill` ("mal müşteride kaldı") yazan, ama
      karşılanan adedi ilk turda 0'a düşürülmüş, parti bağı silinmiş bir kalem. COGS de geri
      çağırma izi de o kalemde artık yanlış.

      AYNI akıbetin ikinci kez gelmesi hata DEĞİL (ağ tekrarı, ikinci dokunuş) — sessizce geçilir.
      FARKLI bir akıbet ise çağıranın bayat bir ekrandan yazdığını söyler: istek TAMAMEN reddedilir
      ve sebebi adıyla döner, çünkü yarısı yazılmış bir düzeltme en kötü sonuçtur.
    */
    if v_existing is not null and v_disposition is not null and v_disposition <> v_existing then
      return jsonb_build_object(
        'ok', false, 'reason', 'already_marked', 'current_status', v_status,
        'order_item_id', v_item_id, 'current_disposition', v_existing
      );
    end if;
    if v_existing is not null and v_disposition = v_existing then
      v_lines := v_lines + 1;
      continue;
    end if;

    -- Jest iadesi: mal müşteride KALDI. Miktarı düşürmek malın hiç gitmediğini söylerdi — stok da
    -- COGS de bozulurdu (DOMAIN §8). Yalnız tasarruf işaretlenir; para tarafı elle girilen iadedir.
    if v_disposition = 'goodwill' then
      update public.order_item
         set return_disposition = 'goodwill',
             return_note = coalesce(v_note, return_note)
       where id = v_item_id;
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
           return_disposition = coalesce(v_disposition, return_disposition),
           -- BEYAN KALEME YAZILIR (04.09): "stoğa dön"ün zorunlu tuttuğu soğuk zincir cümlesi
           -- eskiden yalnız stok hareketinin serbest metnine geçiyordu ve D6 yolunda o dal hiç
           -- ateşlenmiyordu — yani ekranda zorunlu olan not hiçbir yere yazılmıyordu.
           return_note = coalesce(v_note, return_note)
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

-- ── Kapıda TEK YAZIM: düzeltme + teslim (21.271 · denetim bulgusu 8) ─────────
--
-- ÖLÇÜLEN AÇIK: kurye ekranı ikisini ARDIŞIK iki çağrı olarak yapıyordu — önce `adjust_fulfillment`
-- (kapıda reddedilen kalem), sonra `deliver_order`. İkincisi `stale` dönerse (araya gün kapanışı ya
-- da başka bir cihaz girmişse) BİRİNCİSİ GERİ ALINMIYORDU: karşılanan adet düşmüş, rezervasyon
-- serbest kalmış, müşteriye "siparişiniz eksik karşılandı" haberi gitmiş, ama teslim yazılmamış
-- oluyordu. Ekran kuryeye "olmadı" diyor, oysa yarısı olmuştu.
--
-- SIRA DEĞİŞTİRİLEREK ÇÖZÜLEMEZDİ ve sebebi bu dosyanın kendi künyesinde: düzeltmenin anlamı malın
-- fiili stoktan düşüp düşmediğine bağlı. Teslimden ÖNCE düzeltmek "rezervasyonu küçült"tür,
-- SONRA düzeltmek "düşmüş stoğu geri koy". İki farklı iş, yani sıra bir dikkatsizlik değil kısıt.
-- Geriye tek doğru çare kalıyor: ikisini BÖLÜNMEZ yapmak.
--
-- MANTIK KOPYALANMADI, iki fonksiyon ÇAĞRILDI (CLAUDE §1): plpgsql içinden çağrılan fonksiyon aynı
-- transaction'da koşar, yani bölünmezlik bedava gelir. Kopyalasaydık bir gün biri düzeltilir öteki
-- unutulurdu — bu dosyanın 04.09'da yaşadığı hatanın ta kendisi.
--
-- DURUM ÖNCE SORULUR: teslim edilemeyecek bir siparişte malı düzeltmek, tam da kapatmaya
-- çalıştığımız yarım yazımın kendisi olurdu. `deliver_order` aynı kapıyı bir kez daha soruyor ve
-- bu bir tekrar değil güvenlik: o fonksiyon tek başına da çağrılabiliyor.
--
-- PARA BURADA YAZILMAZ (dosyanın kendi kuralı): iade borcu motorda türetilir, hareketi uygulama
-- katmanı yazar — üstelik kartlı iade DIŞ BİR ÇAĞRIDIR ve transaction'ın içine alınamaz.
-- Aynısı MÜŞTERİ HABERİ için de geçerli: yazım kesinleştikten SONRA gönderilir.
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
