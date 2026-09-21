-- Katalog fiyat sıralaması ve kanalında satılamayan ürünün listeden düşmesi: sıralama ve keyset yalnız SQL'de yapılabildiği
-- için görünüm `resolvePrice`ın liste dalını burada yeniden ifade eder; ayrışmayı `catalog.test.ts` iki kanalda sınar.

-- Müşteriye özel fiyat sıraya girmez, çünkü görünüm parametre almaz; müşteri o fiyatı her yerde görür, yalnız sırası
-- liste fiyatından kurulur. Grup yüzdesi sırayı korur; teklif partiye, parti depoya bağlı olduğu için grain depo × kanal × varyanttır.

-- ── Varyantın kanal fiyatı ───────────────────────────────────────────────────
-- Grain `(warehouse_id, channel, variant_id)` ve yeri bilinmeyen okuma için `warehouse_id is null` satırı.
-- `drop` şart, çünkü `create or replace view` kolon sırası değişimini reddeder.
drop view if exists public.product_listing;
drop view if exists public.variant_effective_price;

create view public.variant_effective_price with (security_invoker = true) as
with list_price as (
  -- "Geçmiş ve en yeni kazanır" (0005); müşteriye özel satırlar hariç, her kanal kendi satırını getirir.
  select distinct on (p.variant_id, p.channel) p.variant_id, p.channel, p.amount
    from public.price p
   where p.customer_id is null and p.valid_from <= now()
   order by p.variant_id, p.channel, p.valid_from desc
),
best_offer as (
  -- Vitrin gibi tarihi en yakın teklifli partiyi seçer ki kartla sıralama ayrışmasın; kapalı depo sayılmaz, çünkü
  -- yer çözümü ona hiç düşmez. Teklifin kanalı yok ve görünüm motoru taklit eder, düzeltmez.
  select distinct on (s.warehouse_id, s.variant_id) s.warehouse_id, s.variant_id, s.offer_price
    from public.stock s
    join public.warehouse w on w.id = s.warehouse_id and w.is_active
   where s.offer_price is not null and s.physical_qty > 0
   order by s.warehouse_id, s.variant_id, s.expiry_date
)
-- YERİ BİLİNEN okuma: o deponun teklifi hesaba katılır, fiyat gerçek fiyattır.
select w.id                                                             as warehouse_id,
       lp.channel,
       lp.variant_id,
       lp.amount                                                        as list_price,
       bo.offer_price,
       -- Düşük olan kazanır, eşitlikte teklif kazanmaz; kıyas o kanalın fiyatına karşıdır (motorla birebir).
       case when bo.offer_price is not null and bo.offer_price < lp.amount
            then bo.offer_price else lp.amount end                      as effective_price,
       (bo.offer_price is not null and bo.offer_price < lp.amount)      as has_near_expiry_offer
  from list_price lp
 cross join public.warehouse w
  left join best_offer bo on bo.variant_id = lp.variant_id and bo.warehouse_id = w.id
 where w.is_active

union all

-- Yeri bilinmeyen okumada fiyat listedir ve teklifin yalnız varlığı gösterilir: teklif bir depodadır, ödemede yükselen
-- fiyat verilmiş sözü bozardı. Bayrak posta kodu davetine dönüşür ve kanala göre doğrudur.
select null::uuid                                                       as warehouse_id,
       lp.channel,
       lp.variant_id,
       lp.amount                                                        as list_price,
       null::numeric                                                    as offer_price,
       lp.amount                                                        as effective_price,
       exists (
         select 1 from best_offer bo2
          where bo2.variant_id = lp.variant_id and bo2.offer_price < lp.amount
       )                                                                as has_near_expiry_offer
  from list_price lp;

-- ── Ürünün liste satırı ──────────────────────────────────────────────────────
-- Kartın fiyatı en ucuz aktif boydan okunur (`primaryVariantOf` ile aynı ölçüt), `sort_order` yalnız eşitlikte bozucudur;
-- operatör sırası fiyatı bilmez ve kart ucuz boyu gizlerdi.

-- Kanalında fiyatı olan boyu olmayan ürün listede görünmez (iki INNER join), bu yüzden `sort_price` null olamaz.
-- Operasyon bu görünümü okumaz, eksik fiyatlı ürünü görmesi gerekir; okuyan taraf kanal ve depo (ya da null) süzer.
create view public.product_listing with (security_invoker = true) as
with scope as (
  -- Kanallar enum'dan gelir, elle yazılmaz: `channel`e üçüncü bir değer eklendiği gün bu görünüm
  -- kendiliğinden büyür. Elle yazsaydık yeni kanal sessizce listesiz kalırdı.
  select w.id as warehouse_id, c.channel
    from public.warehouse w
   cross join (select unnest(enum_range(null::public.channel)) as channel) c
   where w.is_active
  union all
  select null::uuid as warehouse_id, c.channel
    from (select unnest(enum_range(null::public.channel)) as channel) c
),
primary_variant as (
  -- `distinct on` NULL'ları eşit sayar (grup semantiği) — yeri bilinmeyen kapsam da kendi grubunu
  -- kurar, ayrıca bir dal yazmaya gerek yok.
  select distinct on (sc.warehouse_id, sc.channel, v.product_id)
         sc.warehouse_id,
         sc.channel,
         v.product_id,
         v.id                    as variant_id,
         vep.effective_price,
         vep.has_near_expiry_offer
    from scope sc
    cross join public.product_variant v
    -- O kanalda fiyatı olmayan boy birincil olamaz. `is not distinct from`, çünkü `=` yeri bilinmeyen satırı eşleştirmezdi.
    join public.variant_effective_price vep
           on vep.variant_id = v.id
          and vep.channel = sc.channel
          and vep.warehouse_id is not distinct from sc.warehouse_id
   where v.is_active
   -- `nulls last` KALKTI: inner join sayesinde `effective_price` burada asla null değil.
   order by sc.warehouse_id, sc.channel, v.product_id, vep.effective_price, v.sort_order, v.created_at
)
select sc.warehouse_id,
       sc.channel,
       p.*,
       pv.effective_price,
       -- "Bu üründe bir yerde son tarih indirimi var" — yeri bilinmeyen ziyaretçide posta kodu
       -- davetini tetikleyen bayrak; yeri bilinende o deponun teklifinin varlığı.
       -- Bayrak BİRİNCİL boyundur: kartta yazan fiyat hangi boydansa rozet de o boyun hâlini
       -- söylemeli, yoksa kart indirim vaat edip gösterdiği fiyatı indirimsiz yazardı.
       pv.has_near_expiry_offer,
       -- SIRALAMA anahtarı — süzülmüş listede asla null.
       pv.effective_price as sort_price
  from public.product p
 cross join scope sc
  -- O kanalda satılabilir boyu olmayan ürün listede hiç görünmez.
  join primary_variant pv
         on pv.product_id = p.id
        and pv.channel = sc.channel
        and pv.warehouse_id is not distinct from sc.warehouse_id;
