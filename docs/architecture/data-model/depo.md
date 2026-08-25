# Veri Modeli — Depo Ağı

Depo, araç, depo bazlı eşik, depolar arası transfer ve posta kodu ↔ bölge bağı.

> Bu dosya `../DATA_MODEL.md`'nin parçasıdır. Ortak ilkeler ve **kalıcı kararlar** ana dosyadadır (01.08 bloğu); kurallar `../DOMAIN.md §17`'de. **Karar oraya, alan buraya** yazılır.

Sistem tek depo varsayımıyla kuruldu: stok bir yerdeydi, "kullanılabilir" tek bir sayıydı, posta kodu yalnız rota gününü belirlerdi. Bu dosyadaki varlıklar o varsayımın kalktığı yerdir (migration `0031_warehouse.sql`).

---

## Warehouse (depo)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| code | string | benzersiz kısa kod (`STR`, `KEHL`) — belge numarasına girer (`IMH-STR-26-0012`), denetmen ve tedarikçi elle yazar |
| name | string | ekranda okunan ad |
| kind | warehouse_kind | `facility` \| `vehicle` (26.08) — **araç da bir depodur**; yükleme/dönüş birer transfer, içindeki mal gerçek parti. Tür bir etiket değil ÜÇ SORGUNUN süzgeci (aşağıda) |
| country_code | country_code | **fiziksel tesis nerede.** Bölgenin ülkesiyle karıştırılmamalı: bir bölge sınır ötesi olabilir (ADR-002), depo olamaz. ⚠ KDV'nin bağlı olduğu alan (`DOMAIN §5/§17`) |
| address | jsonb \| null | |
| ships_online | boolean | kargo çıkış deposu — bölge dışı müşteriler + rota müşterilerinin kargo dolgusu |
| is_active | boolean | depo **kapatılır, silinmez**: geçmiş sipariş ve parti hangi tesisten çıktığını bilmek zorunda (FK'ler `restrict`) |
| sort_order | number | operatörün seçici sırası |
| created_at | timestamptz | |

**Ülke başına EN FAZLA bir aktif kargo deposu** — kural kayıt kapısında değil veritabanında: `unique (country_code) where ships_online and is_active`. Anahtarın ülke olması K9'un "ileride ülke başına bir" hedefini bugünden karşılar; DE deposu açıldığında kendi kargo deposunu alır, kod değişmez.

**Varsayılan depo kavramı YOKTUR** (C2) — bu yüzden şemada bir `is_default` bayrağı da yoktur. Depo daima açık bir kaynaktan gelir: adresin posta kodu (uzaktan sipariş) ya da personelin o anki deposu (yerinde satış: depo kapısı ya da kuryenin aracı).

**Araç deposu — türün üç sonucu, üçü de VERİDE** (26.08, `DOMAIN §17`): *(a)* **araca bölge bağlanamaz** — `delivery_zone_warehouse_is_facility` tetikleyicisi; "posta kodu → bölge → depo" zincirinin sonu bir adres olmak zorunda, yoksa müşteri siparişi hareket hâlindeki bir yere yazılır ve hiçbir ekran fark etmez. *(b)* **araç kargo deposu olamaz** — `warehouse_vehicle_never_ships` kısıtı (taşıyıcı bir adrese gelir); aynı tabloda durabildiği için tetikleyiciye gerek yok. *(c)* **araç `available_stock_total`a girmez** — katalog için "bizde var" bir SÖZDÜR ve araçtaki mal siteden alınamaz; tedarik önerisi içinse o mal zaten tesisten çıkmış, akşam dönecektir (sayılsaydı ikinci kez sayılırdı). Depo bazlı `available_stock` aracı **aynen gösterir**: kurye arabasında ne olduğunu görmek zorunda — ayrım bu yüzden toplamda, kaynakta değil.

`vehicle` TABLOSU AYRI YAŞAR (0045) ve bu duplication değil: orası aracın **soğuk zincirini ölçer** (ölçüm noktası kimliği), burası **içindeki malı sayar**. 0031'in künyesi *"araç bir depoya mı, bir güne mi, bir kuryeye mi bağlanır"* sorusunu açık bırakmıştı; cevap **hiçbirine — araç bir YERDİR.**

---

## StorageArea (depo içi stoklama alanı) — `0045`, 19.28

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| warehouse_id | uuid | **zorunlu**, `restrict` — bir dolap fiziksel olarak tek tesistedir |
| name | string | tesis içinde benzersiz (`lower(name)`) |
| kind | `storage_area_kind` | `frozen` · `chilled` · `ambient` · `staging` |
| target_min_c / target_max_c | numeric \| null | beklenen aralık; **ikisi birlikte** ya da ikisi de null |
| expected_daily_checks | smallint | günde beklenen ölçüm; varsayılan **1**, tavan 12 — takvimin "eksik gün" ölçütü (`19.30`) |
| is_active | boolean | susturma — silme yok |
| sort_order | int | operatörün turu |

**Beklenen aralık sapmanın BİRİNCİL ölçütüdür.** İkincil ölçüt noktanın kendi alışkanlığı (geçmiş ölçümlerin ortancası ± tolerans) ve sıra önemli: alışkanlık bir tahmindir — bozuk bir dolap her gün −8 okuyorsa alışkanlığı −8'dir ve o ölçüt onu "normal" ilan eder. Aralık bu tuzağa düşmez. Aralığı olmayan noktalarda (raf, geçiş alanı) tek ölçüt alışkanlıktır ve örneklem azken **susar**.

**Tek uçlu aralık YOK** (`storage_area_target_pair`): "altı mı üstü mü serbest" sorusunu okuyana bırakırdı.

**`expected_daily_checks = 0` geçerli ve anlamlı bir değerdir**, bir kaçış değil. Oda sıcaklığı rafından günlük ölçüm beklenmez; o noktanın boş günlerini "eksik" saymak, denetimi gerçek eksiklere kör eden bir gürültü üretirdi. Alan olmadan yalnız "sıfır kayıt" görülebiliyordu — *"sabah alındı, akşam alınmadı"* görülemiyordu, yani yarım kalmış bir tur hiç yapılmamış bir tur kadar sessizdi. Araçta varsayılan **0**: soğutuculu araç da var sıradan araç da ve ayrım veride tutulmuyor.

---

## Vehicle (araç) — düşürüldü (03.08), **geri geldi** (17.08, `0045`)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| plate | string | benzersiz (büyük harfe çekilerek yazılır) |
| label | string \| null | "Küçük kamyonet" — ekranda okunan ad |
| warehouse_id | uuid \| null | **künye, kısıt değil** — `set null` |
| expected_daily_checks | smallint | günde beklenen ölçüm; varsayılan **0** (soğutuculu/sıradan ayrımı veride yok) |
| is_active | boolean | |
| sort_order | int | |
| created_at | timestamptz | |

**Tablo bir kez düşürülmüştü ve o karar doğruydu:** tüketeni yoktu, `from('vehicle')` hiçbir yerde geçmiyordu, sıfır satır taşıyordu — bir ihtiyacın karşılığı değil ileri tarihli bir tahmindi. Künyesi şunu yazmıştı: *"gerçekten gerekince geri gelir ve o gün doğru soruyu sorarız: araç bir depoya mı, bir güne mi, bir kuryeye mi bağlanır."*

**Cevap (17.08): araç bir ÖLÇÜM NOKTASIDIR.** Soğuk zincirin iki yeri var — depodaki dolap ve yoldaki araç — ve ikisi de aynı denetim sorusuna cevap veriyor. Tüketici `temperature_log`.

**`warehouse_id` K8'den bilinçli sapma.** K8 *"depo FK'sı yok"* diyordu ve gerekçesi bağın bir KISIT olmasıydı ("araç bir depoya aittir"). Buradaki alan nullable ve hiçbir yerde zorlanmıyor — aidiyet değil adres: "genelde buradan yükler". Kurye günü ve gün kapanışı kurye/gün ekseninde aynen duruyor (`DOMAIN §7`); araç ne bir güne ne bir kuryeye bağlanıyor. Depo kapanınca araç yok olmaz, yalnız adresi bilinmez olur (`set null`).

> ⚠ **KARAR (03.08): tablo DÜŞECEK — tüketeni yok** (`02.11` penceresinde, besleme şeridinin notu üzerine).
> Bugün servisi yok, `from('vehicle')` çağrısı hiç geçmiyor, yerelde 0 satır ve **hiçbir tasarım
> sayfası aracı bir varlık olarak kullanmıyor** — `design/pages/kurye-*` ve `admin-teslimat`'ta "araç"
> yalnız fiziksel bağlam ("ekran araçta kullanılır", "araç çıkarken atanmamış kalmamalı"); ne kuryeye
> ne siparişe araç ATANIYOR. Yani bu tablo bir ihtiyacın karşılığı değil, ileri tarihli bir tahmin.
>
> Gerekçe projenin kendi kuralı: `transfer_status`'ta `draft` değerini *"kullanılmayan bir enum değeri
> yalan söyler"* diye eklemedik; tüketilmeyen bir TABLO da aynı sınıftır — okuyan kişi var olmayan bir
> kabiliyeti varsayar ve `knip` bunu yakalayamaz (SQL + Zod ikisi de kapsamı dışında).
>
> Şimdi düşürülmedi çünkü tek başına bir `db:refresh` gerektirir; `02.11` zaten o pencereyi açıyor —
> iki reset yerine bir reset. Araç bir ekranda gerçekten gerekirse (11.x) o gün yeniden eklenir;
> greenfield'da bunun bedeli bir tablo tanımıdır, tahminin bedeli ise kalıcı bir soru işaretidir.
>
> ✅ **O gün geldi (17.08):** tüketici doğdu (ölçüm noktası) ve tablo yukarıdaki hâliyle geri döndü.
> Kaydın kendisi silinmedi — bir tabloyu ne zaman kurmamak gerektiğinin en iyi örneği bu.

---

## WarehouseVariantThreshold (depo bazlı asgari stok)

| Alan | Tip | Not |
| --- | --- | --- |
| warehouse_id | uuid | PK'nın parçası |
| variant_id | uuid | PK'nın parçası |
| min_stock_qty | number | |

**Yalnız İSTİSNA yazar** (C6): varyanttaki `min_stock_qty` varsayılan kalır, bu satır onu ezer. Fiyatın müşteriye-özel satır deseniyle aynı — satır yoksa genel kural işler, ikisi de yoksa varyantın eşiği yoktur ve öneri listesine hiç girmez. Küresel tek eşik çok depoda yapısal olarak yanlış cevap verir: 20 adet Strasbourg'da bol, Kehl'de kritik olabilir.

---

## WarehouseTransfer (depolar arası sevkiyat)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| from_warehouse_id | uuid | `restrict` |
| to_warehouse_id | uuid | `restrict`; `check from <> to` |
| status | transfer_status | `in_transit` \| `received` \| `cancelled` |
| reference_no | string | benzersiz — `TRF-STR-26-0007` (**kaynak** deponun kodu: kâğıt klasör orada durur) |
| dispatched_by / dispatched_at | uuid \| null / timestamptz | sevk anı |
| received_by / received_at | uuid \| null / timestamptz \| null | kabul anı |
| cancelled_by / cancelled_at | uuid \| null / timestamptz \| null | geri alma anı (19.6); `received_*`'a bindirilmedi — "kabul edildi" ile "hiç çıkmamış" birbirinin yerine geçemez |
| cancel_reason | string \| null | geri almanın gerekçesi; `note` sevk anının notudur, bu onu iptal eden kararın |
| note | string \| null | |
| created_at | timestamptz | |

Kısıt: `warehouse_transfer_cancel_stamp` — `status = 'cancelled'` ile `cancelled_at is not null` **birbirini gerektirir**. Kural veride durur: RPC'yi atlayan bir `update` damgasız iptal yazamaz.

`draft` enum değeri **yoktur**: hazırlık ekranı henüz yok ve kullanılmayan bir enum değeri yalan söyler — sevk anı ilk kalıcı andır (`quick_sale`'in referansı sevkte üretmesiyle aynı mantık).

Bu yüzden **`cancelled`'ın anlamı dardır** (19.6): iptal edilen şey her zaman *zaten sevk edilmiş* bir kayıttır ve yalnız tek hâli kapsar — **"sevk kaydı hatalıydı, mal hiç çıkmadı"**. Miktar kaynak partiye geri yazılır (yeni parti doğmaz; `initial_qty` ve geri çağırma izi bölünmesin — T4'ün ters yönü). Mal çıkıp geri döndüyse cevap bu değer DEĞİL, ters yönlü yeni bir transferdir: mal fiilen iki kez yol gitti, tek kayda indirmek soğuk zincir geçmişini silerdi. Ekranın düğmesi de bu yüzden "İptal" değil **"Sevk kaydını geri al"**.

## WarehouseTransferLine (sevk kalemi)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| transfer_id | uuid | cascade |
| source_stock_id | uuid | `restrict` — transfer kaydı partinin geçmişidir |
| qty | number | sevk edilen |
| target_stock_id | uuid \| null | kabulde hedefte doğan **yeni** parti |
| received_qty | number \| null | **null = henüz kabul edilmedi; 0 = geldi ama kayıp.** İkisi ayrı şeydir: eksik satır kabulü bloklar, sıfır bir beyandır |

**Parti kimliği korunur, birleşmez** (T4): hedefte tarih/lot/alış kopyalanmış yeni satır doğar. Birleştirseydik `initial_qty` iki partinin toplamı olur, "bu partiden ne kadar tüketildi" ve geri çağırma izi bozulurdu. Transfer partisi `intake_id` ve `purchase_order_item_id` **taşımaz** (T5): transfer bir tedarik girişi değildir; köken izi `source_stock_id → target_stock_id` bağındadır.

**Sanal "transit depo" AÇILMAZ:** mal sevkte kaynaktan düşer, kabulde hedefte doğar. Yoldaki mal hiçbir depoda satılamaz çünkü hiçbir deponun stoğunda değildir — "yolda ne var" sorusunun kaynağı bu kaydın kendisidir.

---

## DeliveryZonePostalCode (posta kodu ↔ bölge)

| Alan | Tip | Not |
| --- | --- | --- |
| country | country_code | PK'nın parçası |
| postal_code | string | PK'nın parçası; normalize saklanır (boşluksuz, büyük harf — CHECK ile zorlanır) |
| zone_id | uuid | cascade |

Kod kümesi eskiden `delivery_zone.postal_codes` dizisiydi ve iki bölgeye aynı kodu yazmak serbestti; çözücü "ilki kazanır" diyerek sessizce birini seçiyordu. Tek depoda bunun bedeli yanlış bir rota günüydü — **çok depoda siparişin yanlış depoya düşmesi** demek. Küme kendi tablosuna taşındı, çakışma kayıt anında reddediliyor.

**PK `(country, postal_code)`:** posta kodu ülkeler arası benzersiz değildir — `67000` hem Fransa'da hem Almanya'da geçerli. Yer çözümü daima bu ikilidir.

**Ülke bölgede değil burada durur:** bir bölge sınır ötesi olabilir (ADR-002 — Strasbourg rotası Kehl'i kapsayabilir); bölgeye tek ülke yazmak onu bir devlete hapsederdi.

Tekillik **tüm** bölgeleri kapsar, aktif/pasif ayırmaz: pasif bölge de kodu tutar. Aynı kodu başka bölgeye vermek için önce eskisinden silinir — "pasifken çakışmasın" esnekliği, bölge yeniden açıldığında iki sahipli bir kod bırakırdı ve o an kimse bakmıyor olurdu.

---

## PostalCodePlace (posta kodu referansı)

| Alan | Tip | Not |
| --- | --- | --- |
| country | country_code | PK'nın parçası |
| postal_code | text | PK'nın parçası |
| places | text[] | kodun kapsadığı **tüm** yerleşimler; boş olabilir |
| lat | numeric(9,6) \| null | kapsanan yerleşimlerin ortalaması — kodun harita üstündeki merkezi |
| lng | numeric(9,6) \| null | aynı; `lat` ile birlikte var ya da birlikte yok (CHECK) |

Üretilmiş, salt okunur referans (GeoNames FR+DE, CC-BY; 16.878 kod / 60.496 yerleşim). Veri migration'ın **içindedir**: tablo boşken sistem her kodu "tanınmadı" sayar, yani veri opsiyonel bir yükleme değil tanımın parçasıdır. Üreteç `scripts/build-postal-codes.mjs`, yılda bir koşar.

**Neden var:** ülke bir ALAN değil, posta kodundan türeyen bir SONUÇtur. Müşteriye ülke sormak yalnız sürtünme değil, **vergi** meselesidir — serbestçe seçilen ülke KDV oranını ve Alman B2B muafiyetini etkiler (`DOMAIN §5`).

**Şehir adı SAKLANMAZ, türetilir** (`placeLabel`: tek yerleşimse adı, çoksa `null` — çünkü orada tartışmasız bir ad yoktur). Çok yerleşimli kodda ekranın ne yazacağı (liste, ilk N + "+X", çıplak kod) bir GÖSTERİM kararıdır ve veri tarafı biçim dayatmaz; `places` listesi olduğu gibi taşınır. İlk sürüm burada tek bir ad tutuyor ve çok yerleşimli kodda bir üst idari birime çıkıyordu — *"daha geniş ama asla yanlış değil"* gerekçesiyle. **İddia yanlıştı:** Fransız arrondissement'ı merkez kasabasının adını taşır, yani üretilen etiket geçerli bir belediye adı gibi okunur ve ayırt edilemez; `67800` tabloda "Strasbourg" yazıyordu, orası Bischheim / Hœnheim. Kodların ~%39'u çok yerleşimli, yani istisna değil kural. Kararı veriye gömmek yerine tek bir saf fonksiyonda tutmak aynı listenin adres doğrulamasına da hizmet etmesini sağladı.

**Merkez nokta (19.18)** bölge kurulumunun haritadan yapılması kararından doğdu (`design/pages/admin-depolar.md`): harita kod başına tek işaret basar. Nokta kapsanan yerleşimlerin ortalamasıdır — birini seçmek keyfi olurdu, aynı "tek ad" hatasının coğrafi karşılığı. Bir ADRESİ göstermez. `null` ise harita o kodu **basmaz**; (0, 0)'a düşürmek Gine Körfezi'nde bir işaret üretir ve eksik ölçümü sağlıklı gibi okuturdu.

**Boş liste "uyuşmuyor" değil "bilinmiyor" demektir.** Kod referansta olmayıp kendi bölge tablomuzda olabilir; orada otorite bizim tablomuzdur. Boş listeyi uyuşmazlık saymak, referansı eksik olan her adresi reddetmek olurdu — ölçülemeyen değer sıfır değildir.

---

## Mevcut tablolara eklenen alanlar

| Tablo | Alan | Not |
| --- | --- | --- |
| `stock` | `warehouse_id` not null | parti bir depoda durur; `location` ondan ayrıdır (**depo İÇİ** raf — iki ayrı çözünürlük, duplication değil) |
| `stock` | `purchase_order_item_id` \| null | hangi tedarik kalemini karşıladı (T5) — parçalı kabulde fark raporunun bağı |
| `reservation` | `warehouse_id` not null | **açıkça taşınır, türetilmez** (T1): normal rezervasyonun partisi yoktur ve `order`'a FK yoktur; türetmek `available_stock` sıcak yoluna join eklerdi |
| `order` | `warehouse_id` not null | bir sipariş tek depodan çıkar (K5) — değişmez ertelenmiş kısıtla veride durur |
| `stock_intake` | `warehouse_id` not null | mal kabul depoya yapılır (K6) — depo bağı PO'ya değil kabule takılır |
| `purchase_order_item` | `target_warehouse_id` \| null | isteğe bağlı hedef (C7): niyet beyanı, kısıt değil |
| `user_profiles` | `warehouse_ids uuid[]` | rolün ikinci ekseni (T2) — `roles` ile aynı karar, aynı gerekçe |
| `temperature_log` | `warehouse_id` not null + `storage_area_id`/`vehicle_id` (tam biri) | hijyen denetimi tesis bazındadır; nokta artık TANIMLI kayıt, serbest metin değil (`0045`) |
| `delivery_zone` | `warehouse_id` not null | bölge tek depoya bağlanır; `postal_codes` dizisi kalktı |
| `account` | — | kolon yok (C10): depo kasası yeni bir hesap satırıdır ("Kasa — STR") |
| `cart` | — | kolon yok: depo her okumada yeniden çözülür (aylarca bekleyen sepete depo yazmak ertesi gün yalan olur) |
| `price` | — | kolon yok (C12): liste fiyatı depodan bağımsızdır |

---

## Görünümler

**`available_stock`** — grain `(warehouse_id, variant_id)`. Denklem değişmedi (`fiili − aktif rezervasyon`), değişen hesabın **depo içinde** yapılması. Aktif depolara `cross join`: "0 da bir cevaptır" sözleşmesi korunuyor — yeni açılan depoda hiç parti olmasa da her varyant için satır döner.

**`available_stock_total`** — depo-üstü toplam. **Satış kararı bunu okumaz:** birleştirilmiş stok kimsenin stoğu değildir (3 STR'de + 2 KEHL'de duran maldan 5 kişilik sipariş çıkmaz). Meşru tüketicileri: tedarik önerisi ve "hiçbir depoda yok mu" (C3 — ziyaretçiye "tükendi" demenin tek dayanağı). **Geri çağırma bunu okumaz**, `stock` tablosunu okur: bu görünüm yalnız aktif depoları sayar, kapatılmış depodaki parti burada görünmez.

**`purchase_order_progress`** — PO kalemi ↔ Σ `initial_qty`. Sipariş durumu saklanan sayaçtan değil buradan türer; ölçü `initial_qty`, çünkü `physical_qty` satışla erir ve "ne kadar geldi" sorusuna yanlış cevap verir.

**`variant_effective_price` / `product_listing`** (`0043`) — her ikisi de `(warehouse_id, ürün)` grain + **yeri bilinmeyen okuma için `warehouse_id is null` satırı**. Yersiz satırda near-expiry teklif **tutarı gösterilmez**, yalnız `has_near_expiry_offer` bayrağı taşınır (karar 01.08): teklif bir partiye bağlıdır ve ziyaretçinin posta kodu o depoya düşmeyebilir — indirimli fiyatı gösterip checkout'ta yükseltmek verilmiş bir sözü bozmak olur. Bayrak bunun yerine posta kodu davetine dönüşür.

---

## Değişmezler (veritabanında)

| Kural | Nasıl zorlanır |
| --- | --- |
| Ülke başına tek aktif kargo deposu | kısmi unique indeks |
| Bir posta kodu tek bölgede | bağ tablosunun birincil anahtarı |
| Siparişin partileri siparişin deposundan | ertelenmiş kısıt tetikleyicisi — **üç yönlü**: parti eklenince, siparişin deposu değişince, partinin deposu değişince |
| Rezervasyonun deposu = siparişin deposu | ertelenmiş kısıt, iki yönlü (rezervasyon ve sipariş tarafı) |
| Depocu/kurye kapsamsız olamaz | CHECK kısıtı (`roles && {warehouse,courier}` → `cardinality(warehouse_ids) >= 1`) |
| Kapsamdaki uuid gerçek bir depo | tetikleyici (dizi kolonda FK kurulamaz) |
| Kapsamda geçen depo silinemez | `before delete` tetikleyicisi |
| Tek tutanakta tek depo | `adjust_stock_batch` içinde kontrol + önek deponun kodunu SQL'de alır |
