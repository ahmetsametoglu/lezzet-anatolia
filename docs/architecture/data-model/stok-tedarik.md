# Veri Modeli — Stok ve Tedarik

Parti, rezervasyon, düzeltme, sıcaklık; tedarikçi ve satın alma zinciri.

> Bu dosya `../DATA_MODEL.md`'nin parçasıdır. Ortak ilkeler (çok dilli alanlar, türetme ilkesi, enum listesi, kalıcı kararlar) ana dosyadadır; **karar oraya, alan buraya** yazılır.

---

## Stock (stok partisi)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| variant_id | uuid | stok varyant seviyesinde |
| warehouse_id | uuid | **parti bir depoda durur** (`DOMAIN §17`); `storage_area_id` ondan ayrıdır — biri tesis, öteki o tesisteki alan |
| physical_qty | number | fiili (satış/fire ile erir) |
| initial_qty | number | **girişte** yazılan miktar — tarihtir, değişmez; trigger yazar. "Sipariş ettiğim kadar geldi mi" (§16 fark raporu) ve "bu partiden ne kadar tüketildi" buna dayanır |
| expiry_date | date | partinin son tarihi; **tipi üründedir** (`Product.date_type`: DLC güvenlik / DDM kalite) — bu yüzden kolon adı tipten bağımsız |
| lot_number | string \| null | tedarikçinin lot numarası — geri çağırma (rappel) eşleşmesi; girişte istenir |
| purchase_price | numeric (€) \| null | **birim (paket) başına** alış maliyeti — kâr/marj için; toptan alınıp paketlenirse giriş paket adediyle yapılır (ör. 1kg → 10×100gr), maliyet pakete bölünür. Uygulamadaki adı `purchasePriceCents`, birimi **cent** (`STACK §8`) |
| intake_id | uuid \| null | bağlı stok girişi/satın alma (bkz. `StockIntake`) |
| purchase_order_item_id | uuid \| null | hangi tedarik KALEMİNİ karşıladı — parçalı kabulde fark raporunun bağı; transferle doğan partide null (`data-model/depo.md`) |
| offer_price | numeric (€) \| null | partiye bağlı indirimli teklif fiyatı; doluysa bu parti indirimli satışta (bkz. `DOMAIN.md §5`). Uygulamadaki adı `offerPriceCents`, birimi **cent** |
| storage_area_id | uuid \| null | depo İÇİ alan (`StorageArea`, `restrict`) — hangi depo olduğu `warehouse_id`'de. **Serbest metindi, `19.29`da tanımlı kayda bağlandı**: `Dolap 1` ≠ `Dolap-1` gruplamayı bölüyordu ve "hangi alan boş/dolu" sorusu sorulamıyordu. `null` meşru — rafı bilinmeden de mal kabul edilir |
| created_at | timestamptz | |

Ayrılmış miktar **saklanmaz** — aktif `Reservation` satırlarından türetilir. `available = Σ physical − Σ aktif rezervasyon` (bkz. `DOMAIN.md §4`).
Kalan raf ömrü % = (expiry_date − bugün) ÷ `Product.shelf_life_days` — türetilir; yaklaşan-son-tarih ve MLOR kararları buna göre (`domain-core/stock/shelf-life`).

**`available_stock` görünümü (06.2):** kullanılabilir hesabı SQL görünümünde yaşar — `fiili − aktif rezervasyon` (süresi geçmiş rezervasyon sayılmaz, görünüm cron'u beklemez). Görünüm **karar vermez**: `expired_dlc_qty` bir olgudur ("tarihi geçmiş DLC partilerde ne kadar var"), "satma" kararı motorundur.

**`reserve_stock` fonksiyonu (06.3):** ayırma tek transaction'da, varyantın parti satırları kilitliyken yapılır — iki müşteri son birimi aynı anda isterse yalnız biri kazanır. Kısmi ayırma yok: yetmezse satır yazılmaz. Yazma RPC eşiği `STACK.md §13`.

## Reservation (rezervasyon)

Her ayırma bir satırdır; "ayrılan toplam" bu satırlardan **türetilir** (sayaç tutulmaz — kayarsa izi bulunamaz). Kurallar: `DOMAIN.md §4`.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| order_id | uuid | |
| variant_id | uuid | rezervasyon varyant-toplamı seviyesinde |
| warehouse_id | uuid | **açıkça taşınır, türetilmez** — normal rezervasyonun partisi yoktur ve bu tablonun `order`'a FK'sı yoktur; siparişten türetmek `available_stock` sıcak yoluna join eklerdi. Siparişin deposuyla eşitliği ertelenmiş kısıt tutar (`data-model/depo.md`) |
| stock_id | uuid \| null | **yalnız** partiye bağlı teklif satırında dolu (batch-pinned, bkz. `DOMAIN.md §5`); normalde null |
| qty | number | |
| expires_at | timestamptz \| null | online checkout TTL'i; kapıda/vadeli rezervasyonda null (süresiz, sipariş kapatır) |
| created_at | timestamptz | |

Süresi dolan satır cron'la silinir/pasifleşir; teslim/iptalde sipariş kapanışıyla düşer. Atomik "ayır" işlemi tek koşullu sorguda çalışır (`available >= qty` sağlanıyorsa satır yaz).

## StockAdjustment (imha / fire / sayım düzeltmesi)

Stok azalışının satış dışı her sebebi kayıt altına alınır — "bu üründen yılda ne kadar çöpe attım" buradan görünür (bkz. `DOMAIN.md §12`).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| stock_id | uuid | hangi parti |
| qty | number | **işaretli**: + stoktan düşüm, − stoğa geri ekleme. Tek alanda iki yön → "net kayıp" tek toplamla çıkar; rapor şişmez |
| reason | enum(`expired`,`damaged`,`count_diff`,`lost`,`return_restock`) | DLC imhası / hasar / sayım farkı / kayıp / teslim-sonrası iade restoku |
| unit_cost | numeric (€) \| null | partinin alış fiyatı (snapshot) — fire maliyeti; parti sonradan düzeltilse kaymaz. Uygulamadaki adı `unitCostCents`, birimi **cent** |
| note | string \| null | teslim-sonrası iade restoku gibi istisnalarda sebep — **geri eklemede zorunlu** (DB seviyesinde) |
| created_by | uuid \| null | kaydı giren personel |
| reference_no | string \| null | **OLAY belgesi** (`IMH-26-0012`) — aynı imhanın/sayımın bütün satırları paylaşır; geçmiş kayıtlarda null |
| created_at | timestamptz | |

**`adjust_stock` fonksiyonu (06.6):** düzeltme kaydı + partinin fiili düşümü tek transaction'da — yarısı yazılırsa ya kaydı olmayan kayıp ya da karşılığı olmayan kayıt kalır. Partide olmayan miktar düşülemez; geri ekleme sebep notu ister.

**`adjust_stock_batch` fonksiyonu (10.5):** N parti + PAYLAŞILAN bir belge numarası, hepsi bölünemez. `adjust_stock`'un yerine geçmez — o tek partiyi düzeltir ve kısmi karşılama/kurye akışları onu tek tek çağırır. Bir satır tutmazsa hiçbiri yazılmaz: yarım tutanak kâğıtla eşleşmez ve stok da yarı düşmüş kalır.

**Numara neden SATIR başına değil OLAY başına:** bir imhada üç parti çöpe gidebilir; üçüne üç numara vermek, eşleştirilmek istenen tutanağı üçe bölerdi. İhtiyaç üç yerde gerçek — kâğıt ↔ kayıt eşleşmesi (denetim), tedarikçiye alacak yazışması, sayım oturumu.

**Numara SIRALIDIR** — `Order.reference_no`'nun tersi ve bilerek: sipariş numarası dışarı gider ve sıralı olsaydı sipariş hacmini sızdırırdı; bu numara içeride kalır ve denetmenin okuyup kâğıda yazacağı şeydir. Sıra `document_counter` tablosundan atomik artar (`max(...)+1` iki eşzamanlı imhada aynı numarayı verirdi); önek başına ve yıl başına ayrışır. Sınıflandırma (hangi sebep hangi kâğıda) motordadır (`domain-core/stock/document-no`), numaranın kendisi veritabanının işidir.

## DocumentCounter (belge sayacı)

| Alan | Tip | Not |
| --- | --- | --- |
| prefix | string | `IMH` / `SAY` / `IAD` — birincil anahtarın parçası |
| year | int | birincil anahtarın parçası; yıl başında sıra yeniden 1'den başlar |
| last_value | int | son verilen numara; sonraki `+1` |

**Sayaç geriye alınmaz.** İptal edilen kayıt numarayı yakar ve bu doğrudur: atlanan numara "burada bir şey olmuş" der, yeniden kullanılan numara yalan söyler.

## TemperatureLog (sıcaklık kaydı)

Hijyen denetiminin ilk istediği veri; günde bir-iki **elle** giriş yeter (sensör entegrasyonu yok).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| warehouse_id | uuid | hangi TESİS — hijyen denetimi tesis bazındadır (denetmen bir depoya gelir). Araç kaydı da kaydın alındığı depoya yazılır: araç bir güne/kuryeye bağlanmaz ama soğuk zincir kaydı sahipsiz kalamaz |
| storage_area_id | uuid \| null | depo içi alan (`StorageArea`) |
| vehicle_id | uuid \| null | araç (`Vehicle`) |
| temperature_c | number | −18.5 gibi; donukta negatif normaldir |
| recorded_by | uuid \| null | ölçümü giren personel |
| recorded_at | timestamptz | |

**Nokta İKİ KOLON, tam biri dolu** (`temperature_log_one_point`, `0045`). Önce tek bir `location` **serbest metniydi** ve hem dolap adını hem araç plakasını taşıyordu; üç zararı ölçüldü (17.08): yazım farkı geçmişi bölüyordu (`Dolap 1` ≠ `Dolap-1`), sapma uyarısı o bölünen geçmişe dayanıyordu, ve **ölçülmeyen tespit edilemiyordu** — var olduğu bilinmeyen bir dolabın eksik ölçümü de bilinemez. Denetimin ilk sorusu tam olarak budur.

Tek bir "tip + kimlik" çifti (polimorfik anahtar) REDDEDİLDİ: veritabanına FK yazdırmaz, yani silinen bir noktanın kayıtları sessizce sahipsiz kalırdı. İki kolon + `num_nonnulls` kısıtı hem bağı hem tekilliği veriye yazıyor. Nokta silinemez (`restrict`), susturulur — denetim geçmişi noktanın adına değil kaydına bağlı.

## Supplier (tedarikçi)

Müşteri kartının simetriği (bkz. `DOMAIN.md §16`). **Tedarikçiye borç türetilir**, saklanmaz: Σ stok girişleri − Σ tedarikçiye ödemeler (`MoneyMovement.supplier_id`).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| name | string | |
| contact | jsonb \| null | telefon/e-posta/adres |
| vat_number | string \| null | tedarikçinin vergi no'su (muhasebe eşleşmesi) |
| payment_term_days | number \| null | bize tanıdığı vade (gün); null = peşin |
| note | string \| null | |
| is_active | boolean | |
| created_at | timestamptz | |

## SupplierProduct (ürün–tedarikçi eşlemesi)

Tedarik siparişi **tedarikçinin diliyle** yazılabilsin diye: bizim varyantımız ↔ onların kodu. Bir varyantın birden çok tedarikçisi olabilir (alternatif kaynak).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| supplier_id | uuid | |
| variant_id | uuid | |
| supplier_code | string | tedarikçinin ürün/sipariş kodu |
| name_at_supplier | string \| null | üründeki adı (farklıysa) |
| pack_qty | number \| null | koli içi adet (sipariş koliyle verilirse çeviri) |
| last_purchase_price | numeric (€) \| null | son alış (girişte otomatik güncellenir) — "geçen sefer kaçtı". Uygulamadaki adı `lastPurchasePriceCents`, birimi **cent** (`STACK §8`) |
| is_preferred | boolean | varsayılan tedarikçi işareti; **tekildir** — ikinci kaynak tercihli yapılınca ilki düşer |
| created_at | timestamptz | |

## PurchaseOrder (tedarik siparişi)

Taslak → gönderildi → mal kabulde kapanır (bkz. `DOMAIN.md §16`). Sistem **göndermez** — temiz liste/PDF üretir, gönderim insana aittir.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| supplier_id | uuid | |
| status | enum(`draft`,`sent`,`received`,`cancelled`) | |
| reference_no | string \| null | İnsan-okur numara (`TS-26-4K2M9P`) — **gönderimde** üretilir, taslakta null. Belge dışarı çıkıyor (tedarikçiye liste/PDF) ve fatura eşleştirmesinin bağı bu. Rastgele, sıralı DEĞİL: sıralı numara dışarıya iş hacmini söyler (`Order.reference_no` ile aynı karar). Kısıt: taslak değilse zorunlu. |
| sent_at | timestamptz \| null | |
| note | string \| null | |
| created_at | timestamptz | |

## PurchaseOrderItem (tedarik siparişi kalemi)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| purchase_order_id | uuid | |
| variant_id | uuid | |
| supplier_product_id | uuid \| null | kod eşlemesi (liste tedarikçi koduyla yazılır) |
| qty | number | paket adedi |
| unit_price | numeric (€) \| null | beklenen alış (varsa). Uygulamadaki adı `unitPriceCents`, birimi **cent** — liste satırının gömülü kaleminde de öyle (dönüşüm `listRows`'un sınırında, `moneyFields` gömülü ilişkiye inmez) |
| target_warehouse_id | uuid \| null | **isteğe bağlı** hedef depo ("20 koli STR'ye, 10 koli KEHL'e") — kabul eden depocu kendi payını listeden okur. Niyet beyanıdır, kısıt değil: mal fiilen nereye indiyse oraya girer |

## StockIntake (stok girişi / satın alma)

Mal alımının envanter tarafı; oluşturduğu partiler buna bağlanır (`Stock.intake_id`), ödemesi bir `MoneyMovement`(out, purchase).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| supplier_id | uuid \| null | tedarikçi (bkz. `Supplier`) — lot izlenebilirliğinin "bir adım geri" halkası |
| warehouse_id | uuid | **mal kabul depoya yapılır**: satın alma siparişi depo-üstüdür ama mal bir kapıdan girer. Depo bağı PO'ya değil BURAYA takılır — aynı PO'nun ikinci kabulü başka depoda olabilir |
| purchase_order_id | uuid \| null | bağlı tedarik siparişi — mal kabul formu PO kalemleriyle önceden dolu gelir. **Kabul PO'yu koşulsuz kapatmaz**: durum `purchase_order_progress`'ten türer, hepsi gelene kadar `partially_received` kalır |
| date | date | |
| total_amount | numeric (€) | kalemlerden hesaplanır (Σ birim maliyet × adet). Uygulamadaki adı `totalAmountCents`, birimi **cent** |
| note | string \| null | |
| created_at | timestamptz | |

**`receive_intake` fonksiyonu (06.10):** giriş kaydı + partiler + PO durumu + `last_purchase_price` tazelemesi tek transaction'da — yarısı yazılırsa "partiler girdi ama sipariş açık kaldı" tutarsızlığı doğar. MLOR uyarısı burada hesaplanmaz (motorun işi, kabulü engellemez). **Para RPC sınırında çevrilir:** uygulama `unitCostCents` gönderir, servis `p_lines.unit_cost`'a euro yazar; dönüşteki `total_amount` da `totalAmountCents` olarak okunur (jsonb bir tablo satırı değildir, `moneyFields` oraya inmez — `STACK §8`).

**Parçalı kabul (`DOMAIN §17`):** depo zorunlu parametredir; PO'lu kabulde her satır bir PO kalemine bağlanır (yazılmazsa varyanttan çözülür, belirsizse hata). Bağsız kabul siparişi sonsuza dek açık bırakırdı — ölçüm yokken "0 geldi" demek olurdu (`CLAUDE.md §1`).
