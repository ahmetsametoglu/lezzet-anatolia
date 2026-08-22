# Barkod/QR ile operasyon takibi — etüt + kararlar

> **Statü: OPERASYONDA (21.08).** Dosya 02.08'de yerleşim etüdü olarak açıldı; 17.08'de kullanıcıyla
> sahne sahne konuşuldu ve §1'deki kararlar çıktı — kararlar bağlayıcıdır. 21.08'de operasyona
> geçildi: görev satırları `docs/build/23-barkod-kutu.md`'de (durumun tek sahibi ORASI), tasarım
> brief'leri yazıldı, barkod şeması + tarama kapısı teslim edildi (23.2). Kutu şeması tasarım
> dönünce (23.6). Netleşecek 1 cevaplandı: toplayan kişi ROL VARSAYMAZ (21.08).

## 0. Mevcut zemin (kod gerçeği — 17.08'de yeniden ölçüldü)

| Var | Yok |
| --- | --- |
| `product_variant.sku` (nullable, serbest metin) | **EAN/GTIN/barkod alanı hiçbir tabloda yok** (migration taramasında 0 eşleşme) |
| `supplier_product.supplier_code` + `pack_qty` (koli içi adet) | Kod ile arama kapısı yok — mevcut iki arama YALNIZ ürün adında (`prices/actions.ts:109`, `procurement/actions.ts:123`), SKU bile aranmıyor |
| `stock.id` + `lot_number` + `expiry_date` + **`storage_area_id`** → `storage_area` (tipli, sıralı alan; `19.28`+`19.29`, 17.08) | Toplama listesi henüz `sort_order`'a göre dizilmiyor (veri hazır, ekran değil) |
| `order.reference_no` (rastgele, unique) · `purchase_order.reference_no` · `documentPrefixFor` | **Sipariş kutusu/kolisi kavramı yok** — şemada yalnız tedarik tarafında `pack_qty` |
| `order_status_log` (from/to/kim/zaman) — aşama izi tam | Kurye yükleme adımı TOPLU: `startCourierDay` günün tüm `ready` siparişlerini tek hamlede `out_for_delivery` yapıyor (`courier/day.ts:218-243`); koli başına doğrulama yok |
| `order_item_batch` — satılan malın parti izi (index yorumu: *"Geri çağırma (rappel): partiden siparişe"*) | Parti/koli etiketi üretimi yok |
| Dört aşamanın RPC'si: `receive_intake` · `record_preparation` · `dispatch/receive_transfer` · `deliver_order` (+`delivery_proof` jsonb) · `quick_sale` | Tarama komponenti yok; mobilde kamera bağımlılığı yok (`apps/mobile/package.json`) |
| mobile-api uçları: `/warehouse/{intake,preparation,adjustments,transfers,returns}` · `/courier/{day,day/start,stops/:id/deliver,proof-upload,day-close}` | Basım yolu yok (yazıcı entegrasyonu hiç) |
| Mobil operasyon kabuğu HAZIR: `apps/mobile/src/app/(operations)/` dört bölüm + 17 ekran (`intake` · `picking` · `stock-count` · `inbound` · `near-expiry` · `delivery/[orderId]` · `courier-return` · `day-close` …) | Mobilde harita yok (rota çizimi/takibi — `BACKLOG §8`) |

Yani sistem barkoda **hazırlıksız değil ama boş**: kimlik alanları ve dört aşamanın arka ucu duruyor;
taranabilir kod alanı, tek bir tarama girişi ve kutu kavramı eksik.

## 1. Kararlar (kullanıcı, 17.08)

1. **Tarama DAİMA telefon kamerasıdır.** Operasyon telefonda yapılır (mobil kabuk zaten böyle
   kurulu). Sonucu: HID/"klavye taklidi" okuyucu kademesi ve **web için kamera kütüphanesi kararı
   tamamen DÜŞTÜ** — `BarcodeDetector`/Safari uyumsuzluğu, zxing sınıfı seçim gündemde değil.
   Operasyon web yüzeyi masaüstü-yalnız kalır (`CLAUDE §2`), orada tarama olmayacak.
2. **Koli barkodu ürün barkodundan FARKLIDIR ve ikisi de tanınır.** Gerçek dünyada koli GTIN-14,
   paket EAN-13 taşır. Şema: bir varyantın birden çok kodu olur ve **her kod kaç adet olduğunu
   kendisi taşır** (`kind: unit|case` + adet çarpanı). Çarpan KODUN üstünde durur, tedarikçide
   değil: `supplier_product.pack_qty` "bu tedarikçi koliyle satıyor" bilgisidir, aynı varyantın iki
   tedarikçisinde koli adedi farklı olabilir; okutulan şey kolinin kendi barkodudur, adedi de o
   söyler.
3. **Kod tablosu kabul sırasında KENDİNİ DOLDURUR (öğrenen eşleme).** "Barkodsuz koli" yok, *bizim
   henüz tanımadığımız* koli var: okutulan kod sistemde yoksa ekran "bu kod hangi ürün?" diye sorar,
   depocu satırı seçer, kod o varyanta kaydedilir; ikinci gelişte tanır. Katalogun EAN'ını oturup
   elle girmek diye bir iş doğmaz. Eşleme kimin yaptığını taşır ve geri alınabilir olmalı (bir kod
   iki varyanta bağlanamaz, ama yanlış varyanta bağlanabilir). Etüdün 1.7 maddesi bunun içinde erir.
4. **Sipariş KUTUSU yeni bir kavramdır ve döngü şudur:** sipariş seç → **kutu aç** → doldur →
   *"kutu kapandı"* → siparişteki her şey konduysa sipariş kapanır, değilse yeni kutu açılır. Tek
   kutu bu döngünün özel hâlidir; ayrı bir "tek kutulu v1 akışı" yazılmaz. Eksik kalem bu döngüye
   oturur (`10.3` eksik işaretleme + `fulfilled_qty` zaten var).
5. **Kâğıt: 4×6 inç termal, kutunun ÜSTÜNE yapıştırılır.** İçinde: ürün + adet, müşteri/sipariş
   kimliği, rota/gün, **tahsilat yöntemi**, QR. **Fiyat/tutar YAZILMAZ** — depo yüzeyinin "tutar
   görmez" kuralı korunur; kurye QR'ı okutunca tahsil edilecek tutarı ekranda görür.
6. **v1: TEK etiket, TEK yazıcı** (elde iki Brother var: QL-820NWB 62 mm ve QL-1110NWB 102 mm/4″;
   4×6 için 1110NWB gerekir, 820NWB 4 inç basamaz). Kâğıt **kutu kapanışında** basılır — o an kutuya
   ne konduğu kesinleşmiştir. Açılışta ikinci (küçük) etiket **bugün basılmaz**: paralel toplama
   yoktur, ve olduğunda karışma **masa kuralıyla** önlenir (aşağı). **Ama basım kapısı
   çok-yazıcılı yazılır** — hedef yazıcı depo başına ayardır (adres + model + etiket boyu); ikinci
   yazıcıyı devreye almak konfigürasyon işi olur, kod işi olmaz.
7. **Paralel toplama fiziksel kuralla çözülür:** bir masa = bir sipariş = bir kişi; her masaya bir
   kişi görevlendirilir. Yazılım tarafında ek bir ayrım gerekmez. *(Netleşecek: kullanıcı "her masa
   için bir kurye görevlendirilir" dedi — toplayan kişi kuryenin kendisi mi? Öyleyse yükleme
   okutmasının "bu kutu bu rotanın malı mı" sorusu zayıflar, kutu SAYIMI değerli kalır.)*
8. **Basım sistem yazdırma diyaloğundan GEÇMEZ.** iOS AirPrint / Android Print Framework her
   basımda önizleme + yazıcı seçimi açar (`expo-print` dahil); depoda 40 kutu basacak kişi için
   kabul edilemez (kullanıcı bunu cihazda denedi). Yol: **Expo modülü + Brother Print SDK** (SDK
   ağ/WiFi/BT/USB-OTG üzerinden PDF·PNG·raster basar, diyalog yok). **Sıra: önce hazır paket
   (`expo-brother-printer-sdk`, v0.7.0 MIT) denenir; tutmazsa kendi local modülümüz yazılır**
   (`apps/mobile/modules/brother-print/`; `expo-dev-client` zaten kurulu). Ortalıktaki bridge
   dönemi paketleri (`react-native-brother-printers` vb.) bu projede ÇALIŞMAZ: RN 0.86.2, ve RN
   0.85 Bridge'i koddan çıkardı. **Ölçülmemiş tek şey SDK'nın New Architecture altında bağlanması**
   — bir günlük "iğne deneyi" (boş modül + tek `printLabel` + gerçek 1110NWB) ile ölçülür ve kutu
   akışının önünde durmaz.
9. **Etiketin İÇERİĞİNE sunucu karar verir**, telefon hazır dosyayı basar: tek şablon, tek yerde
   test, yazıcı değişse mobil kod değişmez. Dosya biçimi (PDF ↔ PNG) barkod üretimi ve font
   kontrolüyle birlikte tasarım turunda seçilir; SDK ikisini de basıyor.
10. **Lot/parti etiketi ERTELENDİ.** Operasyon başlayınca gerçek bir problem olarak gözlenirse ayrıca
    kurgulanır. Gerekçeler §3'te. **Ama "hissedilirse" yerine "ölçülürse":** aynı varyantın aynı
    depoda 2+ açık partisi olduğu durumların sayısı bedava bir sinyaldir (mevcut `stock` okumasından
    türer, yeni tablo yok) — sıfırda kalıyorsa problem hiç doğmadı, tırmanıyorsa o günün geldiğini
    rakam söyler.
11. **Kurye tarafında rota onayı VE kutu okutması, ikisi birlikte.** Ayrım: onay *niyet*
    doğrulamasıdır (yorgun bir sabahta gözü kapalı basılır), **garanti kutu kontrolüdür** — rotaya
    ait olmayan kutu okutulduğunda ekran reddeder. Yükleme sayacı ("kaç kutu bindi / kaç kaldı")
    kutu kayıtlarından türer, ayrı tablo gerekmez.
12. **Harita / akıllı rota bu işin parçası DEĞİL** — üç ayrı kalem olarak `BACKLOG §8`'e yazıldı
    (durak sırası → harita gösterimi → akıllı rota). Kutu akışı hiçbirini beklemez.
13. **Raf sırasına göre toplama sırası → `storage_area.sort_order`'a oturur; "metni kodlayalım"
    önerisi DÜŞTÜ.** Kullanıcı ilk turda ucuz yolu (`stock.location` metnini `A1 · A2 · B1` diye
    sıralanabilir kodlamak, tablo açmamak) kabul etti; **aynı gün ölçüm bunu geçersiz kıldı** —
    `storage_area` tablosu yazıldı (`0045_storage_area_vehicle.sql`, görev `19.28`, kullanıcı kararı
    17.08) ve ihtiyacımız olan her şeyi taşıyor: `warehouse_id` zorunlu · depo içinde unique `name`
    (`lower()`) · `kind` (`frozen·chilled·ambient·staging`) · hedef sıcaklık · **`sort_order`**.
    Yani toplama sırası, bağ kurulduğu gün bedava gelir.
    - **BAĞ KURULDU (aynı gün, `19.29`):** `stock.location` (serbest metin) kaldırıldı, yerine
      `stock.storage_area_id` geldi; tip şeması `storageAreaId` taşıyor ve okumada alanın kendisi
      gömülü geliyor (`storageArea: {id, name, kind}`). Yani toplama sırası artık gerçekten bedava:
      `sort_order` alanda, alan partide. Aşağıdaki gerekçe **kaydın kendisi olarak** bırakıldı —
      neyin neden değiştiğini gösteriyor.
    - **Serbest metnin zararları bu repoda ÖLÇÜLDÜ** ve `temperature_log` bu yüzden tanımlı
      kayda geçirildi (`0006:128-132`). İkisi `stock.location`'da aynen geçerli: **(a) gruplama
      bölünür** (`Dolap 1` ≠ `Dolap-1` ≠ `dolap 1` → "bu dolapta ne var" eksik cevap verir),
      **(b) olmayan görülemez** — sıcaklıkta "şu dolap bugün ölçülmedi" denemiyordu, stokta karşılığı
      "hangi alan boş / hangi alan aşırı dolu" sorusunun cevapsızlığıdır.
    - **Üçüncüsü `0045`'in kendi gerekçesiydi ve o da kapandı:** `storage_area.kind` bilerek
      `product_storage_type` ile aynı üç kelimeyi kullanıyor, sebebi *"donuk ürün donuk alanda
      durur" cümlesi ancak iki taraf aynı dili konuşursa kurulabilir* diye yazılmıştı. `19.29`
      cümlenin öteki yarısını (`stock` → alan) getirdi; artık o soru sorulabilir.
    - **Kutu işine kalan:** toplama listesini `storage_area.sort_order`'a göre dizmek. Ön koşul
      değil, ekran işi. Soğuk zincirde yerleşimin dolap/sepet olacağı ve kolilerin parçalanacağı
      biliniyor (kullanıcı notu) — alan kavramı bu işe zaten uygun.

## 2. Aşama aşama akış (kararlardan sonra)

**Ayrım korunur:** *ürün barkodu* (EAN — dış dünyanın kimliği) "bu hangi mal" sorusunu cevaplar;
*bizim bastığımız QR* (kutu etiketi) "bu hangi kayıt" sorusunu. İkisi ayrı iştir.

### 2.1 Depoya giriş — mal kabul (10.4)
Koli okutulur → kabul satırı bulunur (koli barkoduysa adet çarpanıyla) → miktar + SKT girilir. Kod
tanınmıyorsa öğrenen eşleme devreye girer. PO kalemiyle uyuşmazsa uyarı — fark raporu böylece
barkodla beslenir. Arka uç kapıları hazır (`openIntakeForm` · `receiveGoods` · `receive_intake`);
barkodun işi yalnız **satırı bulmak**.

### 2.2 Sipariş hazırlanışı — kutu döngüsü (10.1-10.3 + yeni kutu görevi)
Kutu açılır, kalemler okutularak kutuya konur (sipariş kaleminde olmayan ürün anında reddedilir),
kutu kapanır, 4×6 etiket basılıp üstüne yapıştırılır. `record_preparation` kalem↔parti eşlemesini
zaten yazıyor; kutu onun yanına gelir. **Kutu kodu `reference_no` OLMAMALI** — o müşteriye
gösteriliyor; kutu kodu ayrı ve tahmin edilemez olmalı, yoksa referansı bilen biri teslim kaydı
düşürebilir.

### 2.3 Depodan çıkış — üç ayrı yol
(a) hazırlık/toplama (2.2) · (b) transfer sevkı (`19.6` — ekran YOK, `dispatch_transfer` hazır) ·
(c) sayım/imha (`adjust_stock_batch` hazır) · (d) tezgâh satışı (`quick_sale` kapısı hazır, çağıran
ekran yok). Hepsi aynı tarama sözleşmesini kullanır; ekran kaynağın ne olduğunu bilmez.

### 2.4 Araca yükleme (11.x)
Kurye rotayı onaylar, sonra kutuları tek tek okutur. Bugünkü toplu `ready → out_for_delivery`
geçişi **kutu başına** doğrulamaya döner: araca binmeyen kutu "yolda" görünmez. **Çok kutulu
siparişte tüm kutular binmeden sipariş yolda sayılmaz.**

### 2.5 Müşteriye teslim (11.2 + 07.7)
Kurye kapı önünde kutuyu okutur; sistem kutunun o siparişe ait olduğunu ve siparişin gerçekten yolda
olduğunu doğrular, **teslim kaydını kendiliğinden düşer** — ayrıca "teslim ettim" ekranı
doldurulmaz. `deliver_order` yalnız `out_for_delivery`den teslim eder ve aksi hâlde `stale` döner
(`0016:36`), yani yanlış anda okutulan kutu sessizce geçmez. Okutulan kod `delivery_proof`a yazılır:
bu, B2C'de bugün **hiç kanıt istemeyen** teslime bedava bir kanıt kazandırır (`delivery_proof_required`
= `{b2b: true, b2c: false}`). **Tüm kutular okutulmadan teslim tamamlanmaz.**

### Kullanılmaması gereken yer
**Müşteri yüzeyinde yeri yok** ve **satış kararı barkodla verilmez** — barkod kimlik bulur,
stok/depo kararını yine mevcut motorlar verir (depo değişmezi aynen geçerli).

## 3. Lot etiketi neden ertelendi (§1.10'un gerekçesi)

1. **Satılmış malın parti izi ZATEN TAM.** `order_item_batch` kalem↔parti eşlemesini tutuyor ve
   index yorumu birebir "Geri çağırma (rappel): partiden siparişe" diyor (`0012:214`). "Şu lot kime
   gitti" sorusu bugün, etiketsiz, tek sorguyla cevaplanıyor — geri çağırmanın zor yarısı çözülmüş.
2. **Eksik olan yalnız RAFTA duran malın ayrımı, ve onun çözümü etiket değil fiziksel düzen.**
   Yeni parti eski bitmeden ayrı sepete/gözde durur; sepet başına tek etiket, paket başına sıfır.
   Ayrıca `stock.location` parti satırının üstündedir — "bu parti DONDURUCU-2/SEPET-A'da" bilgisi
   sistemde duruyor ve toplayıcı ekranda görüyor; etiket ekranda yazanı kâğıda kopyalamaktan öteye
   geçmiyor.
3. **SKT paketin üstünde çoğu zaman basılı** → parti ayrımı gözle mümkün; sistem partiyi
   `(varyant, SKT)` ile bulur. **Sınırı ölçüldü:** `(warehouse_id, variant_id, expiry_date)` index'i
   var ama **unique değil** (`0006:66`) — aynı varyantın aynı SKT'li iki partisi (farklı
   lot/tedarikçi/maliyet) mümkün. Nadir; ama SKT'nin garanti değil *neredeyse* tekil olduğu bilinerek
   konuşulmalı.
4. **Etiket ekonomisi:** kutu etiketi günde *sipariş sayısı* kadar, paket etiketi *gelen paket
   sayısı* kadar (10–50×). Kazanç/maliyet oranı ikisinde bambaşka. Tek istisna kendi paketlediğimiz
   (dökmeden bölünen) ürün — orada EAN hiç yok, etiket ilk günden gerekli, ama **paketleme anında**
   basılır; sonradan etiketleme turu diye bir iş açılmaz (şema bu akışı zaten tanıyor: `1 kg → 10 ×
   100 gr`, `0006:29`).

## 4. Veri modeli yönü (tasarımdan SONRA yazılır)

- `variant_barcode (variant_id, code unique, kind: unit|case, qty_per_code)` — §1.2/§1.3. Tek kolonlu
  `product_variant.ean` yeterli DEĞİL: koli barkodu ve çarpan ilk günden gerekiyor.
- `order_box (order_id, warehouse_id, box_no, code unique, printed_at, sealed_at, sealed_by)` +
  `order_box_item (box_id, order_item_id, qty)` — §1.4. Kutu **basım anında** doğar.
- Arama zinciri tek kapıda: `barkod → sku → supplier_code` öncelik sırasıyla; `packages/database`'e
  tek metot (`findByCode`), ekranlar başka yol kurmaz.
- İsteğe bağlı: `supplier_product.barcode` — tedarikçinin kolisindeki kod bizim kaydımızdan
  farklıysa eşlemede ikinci anahtar.

## 5. Fazlama

1. **Tasarım:** kutu akışının ekran anları (`design/pages/app-depo.md` + kurye) — kutu aç/kapat,
   yanlış kutu, eksik kalem, yükleme sayacı, kapıda okutma. Sonra Claude Design.
2. **Şema + arama kapısı:** `variant_barcode` + `order_box`/`order_box_item` + `findByCode`.
3. **Kamera taraması:** tek `onScan` sözleşmesi + mal kabul (2.1) ve toplama (2.2) entegrasyonu.
4. **Basım:** iğne deneyi (§1.8) → etiket şablonu (§1.9) → kapanışta basım.
5. **Yükleme + teslim okutması** (2.4, 2.5) — kutu sayısı tamamlanma kuralı dahil.
6. Tezgâh satışı (2.3d) ve transfer (2.3b) ekranları doğarken aynı tarama sözleşmesini kullanır.

**Cevaplar / itirazlar:** —
