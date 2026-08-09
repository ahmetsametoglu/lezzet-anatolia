-- Modül 08 — Katalogda fiyat sıralaması (08.10). `design/BACKLOG.md §1a`.
--
-- Sıralama seçeneği K18'de çiziliydi ve seçilebiliyordu ama sonucu değiştirmiyordu. Engel bir modül
-- değildi: uygulanabilir fiyat AYRI tablodadır (kanal + geçerlilik tarihi + müşteriye özel satır) ve
-- "bu ürünün b2c fiyatı" tek bir kolon değil bir SEÇİMDİR. Sayfa çekildikten sonra sıralamak seçenek
-- değil — "artan fiyat" yalnız o 30 satır içinde artan olur ve keyset sayfalama bozulur.
--
-- ── BU GÖRÜNÜM MOTORUN BİR DALINI SQL'DE YENİDEN İFADE EDER ─────────────────────
-- `domain-core/pricing.resolvePrice`'ın ZİYARETÇİ dalı: kanal `b2c`, müşteriye özel fiyat yok,
-- near-expiry teklif daha DÜŞÜKSE kazanır (eşitlikte kazanmaz — tavan ve çıpalı rezervasyon boşuna
-- devreye girmesin). Kuralın ikinci bir evi olması bilinçli bir ödünleşmedir ve tek meşru gerekçesi
-- şudur: sıralama + keyset yalnız SQL'de yapılabilir.
--
-- Ayrışma riski YORUMLA değil TESTLE tutuluyor: `catalog-sort.test.ts` görünümün verdiği sırayı
-- motorun çözdüğü fiyatlarla karşılaştırır. Kural değişirse iki taraf birlikte değişmek zorunda.
--
-- ── NEDEN DOSYA 0034 DEĞİL 0043 (depo ağı, 01.08) ───────────────────────────
-- Teklif fiyatı bir PARTİYE bağlıdır ve parti bir depoda durur — yani efektif fiyat fiilen depoya
-- göre değişir (liste fiyatı değişmez; DOMAIN §17 "fiyat depo boyutu almaz" LİSTE fiyatı için
-- doğrudur). Görünüm bu yüzden aktif depolara cross join yapmak zorunda ve `warehouse` tablosunu
-- bekliyor; dosya numarası da 0031'in arkasına geçti. Alternatifi görünümü ikiye bölmekti
-- (yerli/yersiz ayrı görünüm) — aynı CTE'leri iki kez yazmak olurdu, tek sözleşme yerine iki yarım.

-- ── Varyantın ziyaretçi fiyatı ───────────────────────────────────────────────
-- Grain: `(warehouse_id, variant_id)` + her varyant için bir de `warehouse_id is null` satırı.
-- İki okuma tek görünümde durur çünkü ikisi de AYNI fiyat kuralının sonucudur; ayıran tek şey
-- yerin bilinip bilinmemesidir.
create or replace view public.variant_effective_price as
with list_price as (
  -- "Geçmiş ve en yeni kazanır" (0005): aynı varyant+kanal için birden çok satır olabilir.
  -- Müşteriye özel satırlar HARİÇ — ziyaretçi onları görmez. Liste fiyatı depodan BAĞIMSIZDIR.
  select distinct on (p.variant_id) p.variant_id, p.amount
    from public.price p
   where p.channel = 'b2c' and p.customer_id is null and p.valid_from <= now()
   order by p.variant_id, p.valid_from desc
),
best_offer as (
  -- Vitrin, teklifli partilerden TARİHİ EN YAKIN olanı gösterir (`StockService.listOfferBatches`
  -- sırası) — en ucuzunu değil. Görünüm de aynı partiyi seçmeli, yoksa kartta yazan fiyatla
  -- sıralamanın kullandığı fiyat ayrışır. Artık DEPO BAŞINA: teklif partiye bağlı, parti bir depoda.
  -- KAPALI depo sayılmaz: aşağıdaki "bir yerde indirim var" bayrağı posta kodu davetine dönüşüyor
  -- ve yer çözümü daima AKTİF bir depoya düşüyor. Pasif depodaki teklifi saysaydık ziyaretçiye
  -- hiçbir posta koduyla ulaşamayacağı bir indirimin sözünü vermiş olurduk — bayrağın varlık
  -- sebebi tam olarak sözü bir adım sonra bozmamaktı.
  select distinct on (s.warehouse_id, s.variant_id) s.warehouse_id, s.variant_id, s.offer_price
    from public.stock s
    join public.warehouse w on w.id = s.warehouse_id and w.is_active
   where s.offer_price is not null and s.physical_qty > 0
   order by s.warehouse_id, s.variant_id, s.expiry_date
)
-- YERİ BİLİNEN okuma: o deponun teklifi hesaba katılır, fiyat gerçek fiyattır.
select w.id                                                             as warehouse_id,
       lp.variant_id,
       lp.amount                                                        as list_price,
       bo.offer_price,
       -- Teklif çakışması: DÜŞÜK olan kazanır, eşitlikte teklif kazanmaz (motorla birebir).
       case when bo.offer_price is not null and bo.offer_price < lp.amount
            then bo.offer_price else lp.amount end                      as effective_price,
       (bo.offer_price is not null and bo.offer_price < lp.amount)      as has_near_expiry_offer
  from list_price lp
 cross join public.warehouse w
  left join best_offer bo on bo.variant_id = lp.variant_id and bo.warehouse_id = w.id
 where w.is_active

union all

-- YERİ BİLİNMEYEN okuma (karar 01.08, kullanıcı): fiyat LİSTE fiyatıdır, teklif TUTARI
-- gösterilmez — yalnız VARLIĞI. Gerekçe: teklif bir depodadır ve ziyaretçinin posta kodu o depoya
-- düşmeyebilir; indirimli fiyatı gösterip checkout'ta yükseltmek verilmiş bir sözü bozmaktır.
-- Bayrak bunun yerine posta kodu davetine dönüşür (K1'in bir tetik noktası daha): "posta kodunuzu
-- girin, size ulaşabilecek son tarih indirimlerini görün".
--
-- Davet metni "bölgesel fiyat" DEMEZ: fiyatı bölge belirlemiyor, partinin son kullanma tarihi
-- belirliyor. Bölgesel deseydik müşteri mantıklı olanı yapar, başka posta kodları denerdi —
-- bulacağı şey ise kalıcı bir bölge fiyatı değil, o partide kalan miktarla sınırlı ve parti
-- bitince kalkan bir indirimdir (DOMAIN §5 miktar tavanı).
select null::uuid                                                       as warehouse_id,
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
-- Kartın fiyatı ürünün EN UCUZ aktif boyundan okunur (`application/catalog/map.ts` →
-- `primaryVariantOf`) — çok boylu üründe bu "başlangıç fiyatı"dır. Ölçüt burada da aynı; okuma
-- tarafı da aynı boyu seçer, ikisi ayrışamaz.
--
-- ── ÖLÇÜT NEDEN `sort_order` DEĞİL (düzeltme 09.08 · denetim ölçümü) ─────────
-- Birincil boy önce **operatörün sırasından** seçiliyordu ve o sıra fiyatı bilmiyor. Ölçüldü:
-- 32 çok boylu ürünün **24'ünde** kartta yazan fiyat en ucuz boyunki DEĞİLDİ; bir üründe kart
-- 9,14 € gösteriyordu, 1,57 €'luk boyu vardı. Müşteri pahalı fiyatı görüp geçiyor ve ucuz boyun
-- varlığını hiç öğrenmiyordu — sessiz bir satış kaybı, hiçbir yerde hata vermiyor.
--
-- **Çözüm `product_variant.sort_order`'a DOKUNMAZ** ve sebebi ölçülebilir: o kolonu detayın boy
-- seçicisi, mobil ana ekran ve fikirler şeridi de okuyor; fiyata bağlansaydı operatör *"1 kg'ı öne
-- al"* diyemezdi. Üstelik fiyat tek bir sayı değil — kanal + müşteri + tarih boyutlu, teklif ise
-- DEPO bazlı: aynı boy Strasbourg'da fırsatta, Kehl'de değil olabilir. "En ucuz boy" bu yüzden
-- tek boyutlu bir kolona sığmaz, ama bu görünüm zaten depo boyutlu — kararın doğru evi burası.
--
-- **Birincil boy artık DEPO BAŞINA seçilir.** Grain zaten (depo × ürün) olduğu için bedeli yok ve
-- doğrusu da bu: teklif bir partiye, parti bir depoya bağlı.
--
-- Eşitlikte eski ölçüt tie-breaker olarak DURUYOR (`sort_order`, `created_at`) — kararlılık için
-- şart: iki boy aynı fiyattaysa sıra rastgele olurdu ve keyset imleci aynı ürünü iki kez görürdü.
--
-- Grain fiyat görünümüyle aynı: her aktif depo için bir satır + yeri bilinmeyen okuma için bir
-- satır. Okuyan taraf `warehouse_id = $1` ya da `warehouse_id is null` süzer; keyset ikisinde de
-- kendi kümesi içinde çalışır. Katalog SÜZÜLMEZ, işaretlenir (K2) — bu yüzden ürün, o depoda hiç
-- stoğu olmasa da listede durur.
create or replace view public.product_listing as
with scope as (
  select id as warehouse_id from public.warehouse where is_active
  union all
  select null::uuid
),
primary_variant as (
  -- `distinct on` NULL'ları eşit sayar (grup semantiği) — yeri bilinmeyen kapsam da kendi grubunu
  -- kurar, ayrıca bir dal yazmaya gerek yok.
  select distinct on (sc.warehouse_id, v.product_id)
         sc.warehouse_id,
         v.product_id,
         v.id                    as variant_id,
         vep.effective_price,
         vep.has_near_expiry_offer
    from scope sc
    cross join public.product_variant v
    -- `is not distinct from`: null-güvenli eşitlik — yeri bilinmeyen kapsam yalnız yeri bilinmeyen
    -- fiyatla eşleşir, `=` ile bu join sessizce boş dönerdi.
    left join public.variant_effective_price vep
           on vep.variant_id = v.id
          and vep.warehouse_id is not distinct from sc.warehouse_id
   where v.is_active
   -- **`nulls last`** — fiyatı hiç girilmemiş boy birincil seçilmemeli: seçilseydi ürünün fiyatı
   -- olduğu hâlde kartı boş görünürdü. Aynı ilke `sort_price`'ta da var: fiyatsız DÜŞMEZ, sonda durur.
   order by sc.warehouse_id, v.product_id, vep.effective_price nulls last, v.sort_order, v.created_at
)
select sc.warehouse_id,
       p.*,
       pv.effective_price,
       -- "Bu üründe bir yerde son tarih indirimi var" — yeri bilinmeyen ziyaretçide posta kodu
       -- davetini tetikleyen bayrak; yeri bilinende o deponun teklifinin varlığı.
       -- Bayrak BİRİNCİL boyundur (eskiden de öyleydi, yalnız birincilin tanımı değişti): kartta
       -- yazan fiyat hangi boydansa rozet de o boyun hâlini söylemeli, yoksa kart indirim vaat edip
       -- gösterdiği fiyatı indirimsiz yazardı.
       coalesce(pv.has_near_expiry_offer, false) as has_near_expiry_offer,
       -- SIRALAMA anahtarı. Fiyatı olmayan ürün (kanal fiyatı hiç girilmemiş → satışa kapalı)
       -- listeden DÜŞMEZ, sonda durur. `null` bırakılsaydı keyset imleci orada kopardı: imleç
       -- son satırın değerinden kurulur ve `null > null` diye bir şey yoktur.
       coalesce(pv.effective_price, 'Infinity'::numeric) as sort_price
  from public.product p
 cross join scope sc
  left join primary_variant pv
         on pv.product_id = p.id
        and pv.warehouse_id is not distinct from sc.warehouse_id;
