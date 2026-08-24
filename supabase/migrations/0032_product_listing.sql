-- Modül 08 — Katalogda fiyat sıralaması (08.10) + kanalında satılamayan ürünün listeden düşmesi
-- (08.46) + sıralamanın müşterinin kanalından okunması (08.54). `design/BACKLOG.md §1a`.
--
-- Sıralama seçeneği K18'de çiziliydi ve seçilebiliyordu ama sonucu değiştirmiyordu. Engel bir modül
-- değildi: uygulanabilir fiyat AYRI tablodadır (kanal + geçerlilik tarihi + müşteriye özel satır) ve
-- "bu ürünün fiyatı" tek bir kolon değil bir SEÇİMDİR. Sayfa çekildikten sonra sıralamak seçenek
-- değil — "artan fiyat" yalnız o 30 satır içinde artan olur ve keyset sayfalama bozulur.
--
-- ── BU GÖRÜNÜM MOTORUN BİR DALINI SQL'DE YENİDEN İFADE EDER ─────────────────────
-- `domain-core/pricing.resolvePrice`'ın LİSTE dalı: kanalın liste fiyatı (müşteriye özel satır
-- hariç), near-expiry teklif daha DÜŞÜKSE kazanır (eşitlikte kazanmaz — tavan ve çıpalı rezervasyon
-- boşuna devreye girmesin). Kuralın ikinci bir evi olması bilinçli bir ödünleşmedir ve tek meşru
-- gerekçesi şudur: sıralama + keyset yalnız SQL'de yapılabilir.
--
-- **Motorun HANGİ dalı taklit edilmez ve neden:** müşteriye ÖZEL fiyat (`price.customer_id`)
-- sıralamaya girmez. Görünüm parametre alamaz; sokmak keyset sayfalamayı bir RPC'ye taşımak
-- demekti. Fiyat GRUBU (`price_group.percent_off`) ise girmek zorunda değil — tekdüze bir yüzde
-- sırayı KORUR, yalnız rakamları ölçekler.
--
-- BEKLEYEN(08.54): müşteriye özel fiyatı olan müşteride sıra o ürünlerde kayar — kart pazarlıklı
-- fiyatı gösterir, sıralama liste fiyatını kullanır. Ölçüldü (24.08, onaylı B2B müşteri, 6 özel
-- fiyat satırı): 97 üründe **1** yer değişimi. Düzeltmeden önceki hâl 68'di, yani açık kapanan
-- kusurun 1/68'i kadar. Gerekçe ve maliyeti `design/BACKLOG.md`de.
--
-- Ayrışma riski YORUMLA değil TESTLE tutuluyor: `packages/application/src/catalog/catalog.test.ts`
-- görünümün verdiği sırayı motorun çözdüğü fiyatlarla karşılaştırır — ve testler ARTIK İKİ KANALI
-- DA koşar (aşağıdaki 08.54 künyesi: dört ay boyunca yalnız ziyaretçi dalı ölçülmüştü).
--
-- ── NEDEN DOSYA 0034 DEĞİL 0043 (depo ağı, 01.08) ───────────────────────────
-- Teklif fiyatı bir PARTİYE bağlıdır ve parti bir depoda durur — yani efektif fiyat fiilen depoya
-- göre değişir (liste fiyatı değişmez; DOMAIN §17 "fiyat depo boyutu almaz" LİSTE fiyatı için
-- doğrudur). Görünüm bu yüzden aktif depolara cross join yapmak zorunda ve `warehouse` tablosunu
-- bekliyor; dosya numarası da 0031'in arkasına geçti. Alternatifi görünümü ikiye bölmekti
-- (yerli/yersiz ayrı görünüm) — aynı CTE'leri iki kez yazmak olurdu, tek sözleşme yerine iki yarım.
--
-- ── KANAL EKSENİ (08.54 · 24.08 · ölçülerek) ────────────────────────────────
-- Görünüm 08.46'nın engel #3'ünde yazıldığı gibi `channel = 'b2c'`e ÇAKILIYDI: yalnız ziyaretçi
-- dalını biliyordu. Sonucu ölçüldü ve canlıydı — onaylı B2B müşteri "artan fiyat" seçtiğinde
-- **kendi gördüğü fiyatlarla değil, son müşteri fiyatlarıyla** sıralanmış liste alıyordu:
--
--   Strasbourg deposu · Restaurant Bosphore (onaylı B2B) · sort=priceAsc
--     97 üründen 68'i yanlış yerde · en büyük kayma 22 sıra
--     ilk ekran: 0,18 · 0,18 · 0,28 · 0,28 · **0,83** · 0,44 · 0,44 · 0,43 …
--   Aynı sayfa ziyaretçi gözüyle: 0 ihlal.
--
-- Kusur veri kazası DEĞİL: B2B/B2C oranı sabit olsaydı sıra tesadüfen doğru çıkardı; ölçüldü, oran
-- %48,9 ile %84,2 arasında **58 farklı değer** alıyor.
--
-- Çözüm depo ekseninin ikizi: kanal da GRAIN'e katıldı. Bedeli 504 → ~1008 satır.
--
-- ── VE KANAL EKSENİ 08.46'YI MÜMKÜN KILAN ŞEYDİ ─────────────────────────────
-- Görünüm ilk kez *"bu ürün BU KANALDA satılabilir mi"* sorusunu cevaplayabiliyor. Eski hâlde
-- cevabı YOKTU: "fiyatı yok" ile "b2c fiyatı yok" ayırt edilemiyordu.

-- ── Varyantın kanal fiyatı ───────────────────────────────────────────────────
-- Grain: `(warehouse_id, channel, variant_id)` + her (kanal, varyant) için bir de
-- `warehouse_id is null` satırı. Üç okuma tek görünümde durur çünkü üçü de AYNI fiyat kuralının
-- sonucudur; ayıran tek şey yerin bilinip bilinmemesi ve soranın kanalıdır.
--
-- **`drop` ŞART, `create or replace` YETMEZ** (08.54): `channel` kolonu listenin ORTASINA giriyor
-- ve `create or replace view` kolon eklemeyi yalnız SONA izin verir, ad/sıra değişimini reddeder
-- (`cannot change name of view column`). Sıralamayı kolon sonuna kaçırmak da çare değildi — okuyan
-- taraf kolon sırasına bakmıyor, ama görünümün okunabilirliği kararın yanında durmalı.
drop view if exists public.product_listing;
drop view if exists public.variant_effective_price;

create view public.variant_effective_price as
with list_price as (
  -- "Geçmiş ve en yeni kazanır" (0005): aynı varyant+kanal için birden çok satır olabilir.
  -- Müşteriye özel satırlar HARİÇ — yukarıdaki künye. Liste fiyatı depodan BAĞIMSIZDIR.
  -- **Kanal artık süzülmez, GRUPLANIR** (08.54): her kanal kendi en yeni satırını getirir.
  select distinct on (p.variant_id, p.channel) p.variant_id, p.channel, p.amount
    from public.price p
   where p.customer_id is null and p.valid_from <= now()
   order by p.variant_id, p.channel, p.valid_from desc
),
best_offer as (
  -- Vitrin, teklifli partilerden TARİHİ EN YAKIN olanı gösterir (`StockService.listOfferBatches`
  -- sırası) — en ucuzunu değil. Görünüm de aynı partiyi seçmeli, yoksa kartta yazan fiyatla
  -- sıralamanın kullandığı fiyat ayrışır. Depo BAŞINA: teklif partiye bağlı, parti bir depoda.
  -- KAPALI depo sayılmaz: aşağıdaki "bir yerde indirim var" bayrağı posta kodu davetine dönüşüyor
  -- ve yer çözümü daima AKTİF bir depoya düşüyor. Pasif depodaki teklifi saysaydık ziyaretçiye
  -- hiçbir posta koduyla ulaşamayacağı bir indirimin sözünü vermiş olurduk — bayrağın varlık
  -- sebebi tam olarak sözü bir adım sonra bozmamaktı.
  --
  -- **Teklifin KANALI YOKTUR** (`stock.offer_price` tek kolon) ve bu görünümün kararı değil,
  -- motorun kararıdır: `resolvePrice` teklifi hangi kanaldaysa onun fiyatıyla kıyaslar. Görünüm
  -- onu TAKLİT eder, DÜZELTMEZ — iki taraf ayrışmasın. (Tek kolonun B2C'de KDV dahil, B2B'de hariç
  -- tabana karşı kıyaslanması ayrı bir sorudur ve ölçülmemiştir; burada kapatılırsa motorla
  -- görünüm ayrışır ve bu dosyanın varlık sebebi olan çift çivilenir.)
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
       -- Teklif çakışması: DÜŞÜK olan kazanır, eşitlikte teklif kazanmaz (motorla birebir).
       -- Kıyas artık O KANALIN fiyatına karşı — motorun yaptığının aynısı.
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
--
-- Bayrak da artık KANALA göre doğru: teklif b2c fiyatını yenip b2b fiyatını yenemiyorsa toptan
-- müşteriye "bir yerde indirim var" denmez. (Ölçüldü 24.08: teklifli 4 satırın 1'i tam bu hâlde.)
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
-- tek boyutlu bir kolona sığmaz, ama bu görünüm zaten depo VE kanal boyutlu — kararın doğru evi burası.
--
-- **Birincil boy DEPO ve KANAL başına seçilir.** Grain zaten (depo × kanal × ürün) olduğu için
-- bedeli yok ve doğrusu da bu: teklif bir partiye, parti bir depoya bağlı; fiyat ise kanala.
--
-- Eşitlikte eski ölçüt tie-breaker olarak DURUYOR (`sort_order`, `created_at`) — kararlılık için
-- şart: iki boy aynı fiyattaysa sıra rastgele olurdu ve keyset imleci aynı ürünü iki kez görürdü.
--
-- ── KANALINDA SATILAMAYAN ÜRÜN LİSTEDEN DÜŞER (08.46 · kullanıcı kararı 19.08) ──
-- Eski hâlde katalog SÜZÜLMÜYOR, işaretleniyordu (K2): fiyatı olmayan ürün `sort_price = 'Infinity'`
-- ile sonda duruyordu. Kullanıcı 19.08'de bunun tersine karar verdi — *"giriş yapmamış kullanıcı son
-- müşteri kabul edilmeli; bir firma giriş yaptıysa sadece onunkiler gelmeli"*.
--
-- **Ama eski hâl B2B'de o sözü de tutmuyordu** ve ölçüldü (24.08): kanal ekseni yokken "fiyatsız"
-- ürün B2C fiyatıyla sıralanıyordu, yani toptan müşteride listenin ORTASINDA duruyordu.
--   Tatlı Simit'in b2b fiyatı kaldırıldı  → B2B müşteride 7/97 (ilk ekranda), fiyatsız ve alınamaz.
--   Peynirli Mini Pide'nin b2c'si kaldırıldı → B2B müşteride 97/97 (en sonda), oysa 0,18 € ile
--                                              o müşterinin EN UCUZ ürünü.
-- İkisi tam ters yerleşiyordu. Kanal ekseni bunu tek başına düzeltir; süzme kararı onun üstüne gelir.
--
-- İki `join` bu kararı taşıyor ve ikisi de bilerek INNER:
--   1. `primary_variant` → `variant_effective_price` INNER: o kanalda fiyatı OLMAYAN boy birincil
--      seçilemez. (Eskiden `left join` + `nulls last` idi; ölçüt aynıydı, ama fiyatsız boy son çare
--      olarak yine seçilebiliyordu ve ürünün kartı boş görünüyordu.)
--   2. `product_listing` → `primary_variant` INNER: o kanalda satılabilir hiçbir boyu olmayan ürün
--      LİSTEDE HİÇ GÖRÜNMEZ.
--
-- **Süzgeç BOY düzeyinde, sonucu ürün düzeyinde** (08.46 engel #4): bir ürünün bazı boyları
-- perakendeye, bazıları yalnız toptana açık olabilir (5 kg ikram boyu). Ürün, o kanalda satılabilir
-- EN AZ BİR boyu varsa listede durur; kartın fiyatı da zaten o boydan okunur.
--
-- **`sort_price` artık ASLA null olamaz** ve `coalesce(..., 'Infinity')` numarası kalktı: süzülen
-- bir listede sonsuz bir sıra anahtarına ihtiyaç yok. Eski künyesi *"null bırakılsaydı keyset imleci
-- orada kopardı"* diyordu — sebep ortadan kalktı, çare de kalkmalı.
--
-- **Gizleme SESSİZ olmasın diye** operasyon fiyat ekranında "kanalında fiyatı olmayan N ürün"
-- sayacı var (08.46'nın kendi şartı): kazara fiyatı silinen ürün vitrinden düşer ve kimse fark
-- etmezdi.
--
-- **Operasyon bu görünümü OKUMAZ** — ürün listesi `ProductService` üzerinden `product` tablosundan
-- gelir ve gelmeye devam etmeli: operatör tam olarak eksik fiyatlı ürünü görmek zorunda, onu
-- düzeltecek olan o.
--
-- Grain fiyat görünümüyle aynı: her aktif depo × kanal için bir satır + yeri bilinmeyen okuma için
-- kanal başına bir satır. Okuyan taraf `channel = $1` VE (`warehouse_id = $2` ya da
-- `warehouse_id is null`) süzer; keyset her birinin kendi kümesi içinde çalışır.
create view public.product_listing as
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
    -- INNER (08.46): o kanalda fiyatı olmayan boy birincil olamaz — yukarıdaki künye.
    -- `is not distinct from`: null-güvenli eşitlik — yeri bilinmeyen kapsam yalnız yeri bilinmeyen
    -- fiyatla eşleşir, `=` ile bu join sessizce boş dönerdi.
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
  -- INNER (08.46): o kanalda satılabilir boyu olmayan ürün listede hiç görünmez.
  join primary_variant pv
         on pv.product_id = p.id
        and pv.channel = sc.channel
        and pv.warehouse_id is not distinct from sc.warehouse_id;
