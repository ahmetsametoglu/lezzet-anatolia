# Kargo kanalı — tasarım kaydı (ambalaj ölçüsü · kargo kutusu · gönderi)

> **Bu bir TASARIM KAYDIDIR, talep değil.** Kod yazılmadı, görev satırı üstlenilmedi. Amacı,
> 28.08'de yapılan ölçüm ve karar turunun kaybolmaması: iş başladığı gün mekanik bir ekleme
> olsun (`CLAUDE §4`). Karşılığı olan görevler: `07-siparis.md (07.12)` · `05-katalog.md (05.38+)`.
>
> **BAŞLAMA KOŞULU (kullanıcı kararı 28.08): üç ajanın da işi bitip DURMADAN başlanmaz.**
> Alan bütün alınacak (`CLAUDE §4`), yarım teslim edilmeyecek.

---

## 1. Terim sözlüğü — çıplak "kutu"/"koli" YAZILMAZ

Sistemde bugün üç ayrı şey "kutu/paket" diyor (`order_box`, `bundle`, npm paketleri). Dördüncüyü
adsız eklemek okunamaz hâle getirirdi; kullanıcı 28.08'de sıfat istedi ve ilk önerim (ürünün kendi
ambalajına "kargo kutusu" demek) **yanlıştı** — kargo kutusu, kargoya vermek için kullanılan kutudur.

| Kavram | Terim | Yer |
| --- | --- | --- |
| Ürün + kendi ambalajı (brüt ağırlık, dış ölçü) | **ambalajlı ürün ölçüsü** | `product_variant.packed_*` |
| Depo kutu tipi kataloğu | **kargo kutusu** | `shipping_box` |
| Siparişin fiziksel kutusu = taşıyıcıya verilen kutu | **sipariş kutusu** | `order_box` (mevcut) |
| Taşıyıcıdaki gönderi partisi | **gönderi** | `shipment` |

**"Koli" kelimesi kullanılmaz** (kullanıcı kararı 28.08). Operasyon formundaki bölüm başlığı
**"Ambalajlı ürün"**; yanında pasif bir satırda net ağırlık gösterilir ki operatör ikisini
karıştırmasın.

---

## 2. Bugün ne var (ölçüldü 28.08 — tahmin değil)

**Veri**
- `product_variant` yalnız `net_weight_g` taşıyor (`0005_catalog_product.sql:220`) + `pieces_count`,
  `portion_kind`, `min_stock_qty`, `sku`, `label`. **Kargo ölçüsü hiç yok** — `weight_g`,
  `length_mm`, `width_mm`, `height_mm` repoda geçmiyor (arandı, sıfır sonuç).
- `order.carrier` + `tracking_number` + `shipping_fee` (`0012_order.sql:149`), kısıt
  `order_carrier_only_shipping`. **`shipment` tablosu yok** → şema sipariş başına TEK koli varsayıyor.
- `order_box` / `order_box_item` (`0048`) var: `box_no`, `code` (QR), `warehouse_id`,
  `sealed_at/by`, `printed_at`, `loaded_at/by`. **Fiziksel ölçüsü ve taşıyıcı bağı yok.**
- `settings`: `free_shipping_threshold_cents` 100 €, `shipping_fee_cents` 11,90 €, ülke satırı
  DE 9,90 € (`0013`). Sabit tarife; ağırlığa bakan hiçbir şey yok.

**Motor / servis**
- `domain-core/delivery/shipping-fee.ts` → `resolveShippingFee` (rota→0 · eşik üstü→0 · altı→sabit)
  + `apportionShippingVat` (kargo KDV'si taşınan malın oranını izler). Motor temiz, genişlemeye hazır.
- `application/order/checkout-options.ts:141` → ayarları kapsamla okuyup motoru çağıran tek nokta.
- `application/cart/cart-types.ts:623` → sepet aynı eşiği okuyor.
- `OrderService.setShipment` → tek arayüz çağıranı hazırlık masasındaki `ShipmentBox`
  (`preparation.desktop.tsx`); taşıyıcı + takip numarası ELLE giriliyor.
- `application/warehouse/boxes.ts` → kutu döngüsü; `seal_order_box` RPC Σ kutu = karşılanan denetimi.

**Arayüz**
- `product-form/variant-editor.tsx:143` — 8 kolon: tutamak · Etiket · SKU · Net (g) · Adet ·
  Min. stok · Aktif · sil. **Ölçü girişi yok; `portion_kind` girişi de yok** (yalnız seed yazıyor).

**Sağlayıcı:** yok. Paket, port, env, webhook — hiçbiri yazılmamış.

### ⚠ Yan bulgu — form ile veri çelişiyor (bu turda düzeltilecek)
`0005:104` `shippable` varsayılanını bilerek `false` yapmış (kullanıcı kararı 08.08: *"unutulan
alanın bedeli 'satılamadı' olmalı, 'bozuk gitti' değil"*). Ama form
(`product-form/schema.ts:86` ve `:152`) `shippable: true` ile doğuruyor — üstelik aynı formda
`storageType: 'frozen'`. **Formdan açılan her yeni ürün "donuk ama kargolanabilir" doğuyor.**
Migration künyesinin `status` için anlattığı arızanın birebir aynısı.

---

## 3. Kapanmış kararlar (yeniden tartışılmaz)

**Önceden verilmiş** (`07-siparis.md:144-150`, 04.08):
- Sağlayıcı **Sendcloud**.
- Ölçü **varyanta**, ürüne değil — aynı ürünün 1 kg ve 500 g'ı farklı ambalajlanır.
- **Milimetre** — ondalık kalınlık (1,5 cm) tam sayı alanında sessizce yuvarlanır.
- Ölçüsüzlük **`null`**, sıfır değil; plan yedek sabite düştüğünü **söylemek zorunda**.
- İstemci **hangi seçeneği** seçtiğini söyler, **kaça** olduğunu söylemez — fiyat sunucuda
  yeniden hesaplanır.
- Fiyat modeli **hibrit**: canlı teklif + eşik üstü ücretsiz kargo. `resolveShippingFee`'nin
  GİRDİSİ değişir, motor değişmez.
- Elle takip numarası girişi **silinmez** — `other` taşıyıcı ve düzeltme için yedek şerittir.

**28.08'de verilenler:**
- **Donuk ürün — ekstra kargo işlemi YOK.** `shippable` zaten ürün bazında değişebiliyor (kışın
  açılır, yazın kapanır). Koli planına jel/izotermik payı eklenmez, taşıyıcı süzülmez.
  *(Not: Sendcloud'un `functionalities` kümesinde `fresh_goods` süzgeci var — bugün kullanılmıyor.)*
- **Ölçü iki kapıdan girilir:** operasyon formu **ve** MCP ürün dilekçesi. İkisi aynı turda; çünkü
  `mcp/server-factory.ts:221` ajana zaten *"kilo fiyatı ve kargo bunlardan hesaplanır"* diye söz
  veriyor ve o söz bugün karşılıksız.
- **175 varyanta test ölçüsü yazılır** — kaynak dosyaya (05.33 kuralı: *"veriyi doğrudan kaynakta
  düzenle"*), üreteç birleştirir, `seed:coverage`'a "ambalaj ölçüsü eksik" kovası eklenir. Birkaç
  varyant **bilerek ölçüsüz** kalır; o hâl gerçek ve ekran onu göstermeli.
- **Sipariş kutusu = taşıyıcıya verilen kutu.** Ayrı bir `shipment_box` satırı AÇILMAZ.
- **Kargo kutusu kataloğu TEK TABLO**, şablon kopyalanarak benimsenir (§4.2).
- **Referans proje bağlayıcı değil** — bilgi kırıntısı, takılınca fikir verir. Kanonik olan
  sağlayıcının kendi dokümantasyonudur (**dokümantasyon-önce**).
- **OpenAPI kullanılacak** (kullanıcı onayı 28.08).
- **Tasarım yokluğunda EN YAKIN EMSALE dayanılır** (kullanıcı kararı 28.08). Çizim beklenmez;
  kurulan her yüzey `design/BACKLOG.md`'ye **"çizilmedi, kodlandı"** kaydıyla girer (emsali var:
  teslimat yeri paneli · mobil kargo künyesi). Emsalsiz görsel karar yine VERİLMEZ.
- **`db:refresh` / `db:reset` bu özellik boyunca serbest** (kullanıcı izni 28.08) — top bırakıldığı
  andan uçtan uca bitişe kadar. Her seferinde ayrıca sorulmaz; kilit yine beklenir (`CLAUDE §4b`).
- **Alt ajan: EN FAZLA BİR, yalnız rapor için, YÖNLENDİRMESİZ** (kullanıcı kararı 28.08). Gerçekten
  gereken teyitte kullanılır; görev metni cevabı ima etmez, yoksa dönen rapor kendi sorumun
  yankısı olur.
- **Her özellik testiyle birlikte commit'lenir** ve değişiklikler **uygun gruplar** hâlinde gider
  (kullanıcı kararı 28.08).

---

## 4. Veri modeli

### 4.1 Ambalajlı ürün ölçüsü — `product_variant`

Dört yeni kolon, hepsi nullable int:

    packed_weight_g     -- brüt: ürün + kendi ambalajı
    packed_length_mm
    packed_width_mm
    packed_height_mm

**`net_weight_g`'den AYRI ve karıştırılmaz:** net ağırlık INCO beyanı ve €/kg gösterimidir
(`helper/money.ts:28` `pricePerKg`), içindeki gıdanın ağırlığıdır. Brüt ağırlık taşınan şeyin
ağırlığıdır. 810 g'lık bir kek kutusu ambalajıyla 1,1 kg olabilir.

**Ad neden `packed_*`:** 07.12 bunları çıplak `weight_g` diye yazmıştı; `net_weight_g` ile yan yana
durunca hangisi olduğu okunmuyor. Sapma bilinçli, gerekçesi bu satır.

**`null` = ölçülmemiş, sıfır DEĞİL.** Ölçüsüz varyant için teklif alınmaz; ekran "ölçüsü eksik"
der ve süzgeci vardır.

### 4.2 Kargo kutusu — `shipping_box` (yeni, TEK tablo)

    shipping_box
      id
      warehouse_id     -- null = SİSTEM ŞABLONU (doğrudan seçilemez; kopyalanır)
      name             -- "Orta kutu 40×30×20"
      length_mm · width_mm · height_mm
      tare_g           -- boş kutunun ağırlığı
      max_content_g    -- taşıma tavanı; null = sınır yok
      is_active · sort_order · created_at
      unique (warehouse_id, id)     -- order_box'ın bileşik FK hedefi
      unique (warehouse_id, name)

**KOPYALANARAK BENİMSEME** (kullanıcı gözlemi 28.08: *"sistemdeki standart kutular bir depoda
kullanılmayabilir, kalmayabilir"*): sistem kutusu doğrudan seçilebilir bir kayıt değil, bir
**şablondur**. Depo benimsediğinde kendi satırı olarak kopyalanır. Sonuçlar:

- Deponun listesi = `warehouse_id = <depo>` satırları. Junction tablosu gerekmiyor.
- Kutu kalmadıysa `is_active` kapanır, bırakılırsa satır silinir — **başka depoyu etkilemez**.
- Şablon düzenlenirse benimsenmiş kutular değişmez ve bu DOĞRU: Strazburg'daki fiziksel kutu,
  birinin şablonu düzenlemesiyle küçülmez.

**Kural veride duruyor:** `order_box`'a bileşik FK —
`(warehouse_id, shipping_box_id) → shipping_box (warehouse_id, id)`. Tek kısıt iki şeyi zorluyor:
kutu **şablon olamaz** (şablonun `warehouse_id`'si null, eşleşmez) ve **başka deponun kutusu
olamaz**. Ekran unutabilir, veritabanı unutmaz (`CLAUDE §1` depo değişmezi + `STACK §13`).

### 4.3 Gönderi — `shipment` (yeni) + `order_box` (dört kolon)

`order_box` **neredeyse hiç değişmiyor** — sipariş kutusu zaten taşıyıcının kolisidir:

    order_box  +=
      shipping_box_id      -- hangi kargo kutusu tipi (ölçü + dara oradan gelir)
      shipment_id          -- hangi gönderiyle çıktı; rota kulvarında null
      tracking_number      -- bu kutunun taşıyıcıdaki numarası
      provider_parcel_ref  -- sağlayıcının koli kimliği (webhook eşleşme anahtarı)
      label_key            -- etiket dosyası

    shipment (yeni, sipariş düzeyi)
      id · order_id
      provider_shipment_id   -- sağlayıcı gönderi kimliği (iptal + durum sorgusu)
      shipping_option_code   -- seçilen servis
      quoted_price · actual_cost
      service_point          -- teslim noktası (varsa)
      status · cancelled_at · created_at

**`shipment` neden yine ayrı duruyor:** bunlar kutu başına tekrarlanamayacak şeyler — tek `announce`
çağrısı N kutuyu birden açıyor, tek fatura satırı geliyor. Ayrıca bir siparişin **birden çok gönderi
partisi** olabilir (iki kutu bugün, geciken kalem yarın); `order_box.shipment_id` bunu
kendiliğinden taşır.

**`shipment_box` diye 1:1 tablo AÇILMADI** (kullanıcı kararı 28.08: *"kargoya vereceğimiz kutu ile
sipariş kutusu aynı şey"*). Vazgeçilen tek şey: iptal edilen etiketin takip numarası kutu satırında
saklanmıyor, üzerine yazılıyor. Kabul edilebilir, çünkü (a) iptal ancak taşıyıcıya verilmeden önce
mümkün — müşteri o numarayı hiç görmemiş olur; (b) iptal **gönderi düzeyinde** bir işlemdir, tek
`announce` ile açılan bütün kutular birlikte iptal olur ve hepsi yeni numara alır → tarihçenin doğal
yeri `shipment` satırıdır, para izi de orada durur.

**Devir damgası için yeni kolon YOK:** `loaded_at`/`loaded_by` zaten *"bu kutu bizden çıktı"*
demek. Rotada araca biner, kargoda taşıyıcıya verilir — aynı olay sınıfı, farklı doğrulama
(rotada kurye kontrolü, kargoda etiket basılmış mı). Kolon künyesi ikisini de anlatacak.

**`order.carrier` / `order.tracking_number` emekli olur.** Tek kutulu siparişte bugünkü davranış
birebir aynı kalır; çok kutuluda artık yalan söylemez. Greenfield olduğu için migration doğrudan
düzenlenir; dokunulan yüzeyler: müşteri sipariş detayı, hazırlık paneli, mobil-api sözleşmesi.

### 4.4 Ağırlık ve ölçü nereden gelir

    gönderi kutusunun ağırlığı = Σ(ambalajlı ürün brüt ağırlığı × adet) + kargo kutusu darası
    gönderi kutusunun ölçüsü   = kargo kutusunun dış ölçüsü

Depocu kutu açarken listeden **kargo kutusu tipini seçer**; ölçü ve dara oradan gelir, elle
yazılmaz. Tahmin yok, sessiz yedek yok. `openBox` sözleşmesi bu yüzden `shippingBoxId` alacak.

---

### 4.5 Senkronizasyon ve eşleşme — üç katman, biri YENİ

> Kullanıcı sorusu 28.08: *"pilot platformla senkronizasyon için ve ondan gelen bilgilerle bizim
> veritabanımızdaki bilgileri eşleştirecek bir tablo olacak mı? Hangi kutu, hangi sipariş, hangi
> sipariş numaraları, durumları ne."* — Kimlik eşleşmesi §4.3'te çözülüydü; **olay defteri
> eksikti.** Bu bölüm üçünü birden yazar.

#### Katman 1 — Kimlik eşleşmesi · yeni tablo YOK

| Soru | Alan | Yön |
| --- | --- | --- |
| Bu gönderi sağlayıcıda hangisi? | `shipment.provider_shipment_id` | onlardan (iptal + durum sorgusu anahtarı) |
| Bu webhook hangi kutunun? | `order_box.provider_parcel_ref` | onlardan (**birincil eşleşme anahtarı**) |
| Müşteri neyi takip ediyor? | `order_box.tracking_number` | onlardan (geç atanabilir → eşleşmede YEDEK) |
| Sağlayıcı bizimkini nasıl bulur? | `external_reference_id` = `shipment.id` | bizden (makine eşleşmesi) |
| Operatör panelde nasıl arar? | `order_number` = `order.reference_no` | bizden (insan araması) |
| Fiziksel kutu hangisi? | `reference` = `order_box.code` | bizden (bizim QR'ımız → fiziksel iz) |

Son üçü announce gövdesinde **ayrı alanlar** (§5) ve **üçü de bilerek doldurulur**. Referans
projede yalnız birincisi dolu; öksüz koli runbook'unun yarısı bu yüzden elle SQL'e dayanıyor —
operatör sağlayıcı panelinde bizim sipariş referansımızı arayamıyor.

**İki kimlik uzayı, tekrar:** `provider_shipment_id` ≠ `provider_parcel_ref`. Biri gönderinin,
öteki kolinin kimliği; webhook koli kimliğini gönderir, iptal ve durum sorgusu gönderi kimliğini
ister. Takip numarası bazı taşıyıcılarda geç atanır → ona bağlanan eşleşme erken webhook'ları
kaçırır (referans bunu 13 migration sonra öğrendi).

#### Katman 2 — Olay defteri · YENİ TABLO `shipment_event`

    shipment_event
      id
      shipment_id                    -- gönderi düzeyi olay (duyuruldu, iptal edildi)
      order_box_id     nullable      -- koli düzeyi olay; null = gönderi düzeyi
      provider_code    text          -- sağlayıcının HAM kodu ("DELIVERED", "ANNOUNCING")
      mapped_status    nullable      -- bizim eşlememiz; null = TANINMADI
      message          text nullable -- sağlayıcının insan cümlesi
      occurred_at      timestamptz   -- olayın KENDİ zamanı
      received_at      timestamptz default now()
      raw              jsonb nullable-- YALNIZ mapped_status null iken
      unique (order_box_id, provider_code, occurred_at)

**Neden gerekiyor — dört sebep:**
1. Option B'de webhook yalnız tetikleyici, gerçek durum REST'ten geliyor. **Gelen ham kod bir yere
   YAZILMAZSA taksonomiyi hiç öğrenemeyiz.** Referans bunu log'a yazıyor — log döner, veri kalmaz.
2. Bilinmeyen kod geldiğinde mevcut durum korunur (doğru), ama kod kaydedilirse eşleme sonradan
   yazıldığında **geçmiş yeniden okunabilir**. Kaydedilmezse o gönderiler sonsuza dek kör kalır.
3. Müşterinin gördüğü zaman çizgisi her açılışta sağlayıcıya gitmemeli — oran sınırı (GET 1000/dk),
   300-500 ms gecikme, ve sağlayıcı eski koliyi bir gün süpürür.
4. "Ne zaman taşıyıcıya verdik, ne zaman teslim oldu" — kâr ve gecikme ölçümünün girdisi
   (`DOMAIN §12` teslimat maliyeti + geri bildirim daveti zamanlaması).

**Kararlar:**
- **Append-only.** Referansın `raw_payload` derdi (*"ilk webhook güncellemesi onu ezer, güvenilmez"*)
  burada doğamaz.
- **`mapped_status` null YAZILIR, satır atılmaz** — "tanımadım" bir cevaptır (`CLAUDE §1`:
  ölçülemeyen değer sıfır değildir). Bu satırlar operasyonda sayılır: *"N tanınmayan taşıyıcı kodu"*
  → eşleme tablosu büyütülür. Sessizce düşürülseydi taksonomi hiç tamamlanmazdı.
- **`raw` yalnız TANINMAYAN kodda saklanır.** Tanınan olayda değeri yok; her satırda tutmak tabloyu
  şişirir ve kişisel veri riskini kalıcılaştırır.
- **PII YAZILMAZ (`CLAUDE §1` kırmızı çizgi).** Taşıyıcı yükü alıcı adı/adresi/telefonu taşıyabilir.
  `raw` yazılırken bu alanlar **ayıklanır**; olay için kod + cümle + zaman + yer adı (sıralama
  merkezi) yeter. Kimlik zaten satırın FK'sinde duruyor — teşhis için kimlik yeter, o kimlikle
  DB'ye bakılır.
- **`occurred_at` ≠ `received_at`.** Webhook 10 kez yeniden deneniyor ve saatler sonra gelebilir;
  zaman çizgisini olayın kendi zamanı kurar, bizim aldığımız an değil.
- **Durum eşlemesi `domain-core`'da** (saf karar, testli): ham kod → bizim durumumuz, bilinmeyen →
  `null`, mevcut korunur. Uygulama katmanı kural hesaplamaz, motora sorar (`STACK §4`).

**Neden mevcut iki defterin yerine geçmiyor:**
- `webhook_event` (`0022`) **idempotens defteridir** — (sağlayıcı, olay no) benzersiz, "bu çağrı
  işlendi mi" sorusunu cevaplar. Zaten `provider` kolonu var ve künyesi *"ileride başka sağlayıcı"*
  diyor → taşıyıcı webhook'ları oraya girer, **yeni tablo gerekmez**. Ama o defter "bu koli nerede"
  sorusunu cevaplamaz.
- `order_status_log` (`0012`) **bizim sipariş durumumuzun** geçiş defteridir — sipariş düzeyi, bizim
  taksonomimiz. `shipment_event` koli düzeyi ve taşıyıcının taksonomisi. İkisini birleştirseydik
  "sipariş yolda" yazarken hangi kolinin nerede olduğu kaybolurdu.

#### Katman 3 — Mutabakat · tablo değil, iki cron + bir açık

- **Takılı gönderi** (saatlik): terminal olmayan + N saatten eski gönderiler REST'ten yeniden
  sorgulanır; hâlâ çözülmeyen `error_log`'a warning düşer → operasyon `/operations/system`'de görür.
- **Öksüz gönderi** (haftalık): sağlayıcıda açılmış ama bizde satırı olmayan — ya da bizde açık
  görünüp sağlayıcıda bulunmayan. **Yalnız TESPİT**; düzeltme manueldir (gerçek para, otomatik
  iptal riskli) + runbook.
- **AÇIK — fatura mutabakatı.** Sağlayıcının aylık faturası ile Σ `shipment.actual_cost`
  karşılaştırması. Banka import deseninin kardeşi (öneri + elle onay, `INTEGRATIONS.md`).
  **Bu turun kapsamı DIŞINDA**; kapsam kararı kullanıcınındır → `BACKLOG`'a not düşülür.

### 4.6 Etiket basımı — 4×6 yazıcı · zincir ZATEN VAR, sunucudan geçemez

> Kullanıcı şartı 28.08: *"kargo satın alındığı zaman sistemin etiketi alıp otomatik olarak
> elimizdeki 4×6 inç etiket yazıcısına göndermesi gerekiyor."*

**Ölçüm (28.08):** basım bugün YALNIZ telefondan geçiyor — `apps/mobile/src/lib/print/brother.ts`
→ `printLabel(fileUri, printer)`, Brother SDK. Web yalnız yazıcı ayarını GÖSTERİYOR
(`operations/warehouses/page.tsx:155`); basan bir kapısı yok.

**Ve sunucudan geçemez — bu tercih değil, ağ gerçeği.** Yazıcı deponun yerel ağında
(23.7'de ölçülen adres `192.168.1.90`); uygulama VPS'te koşuyor ve o adrese hiçbir rotası yok.
Basım, depo ağındaki bir cihazdan başlamak zorunda.

**İyi haber: doğru cihaz zaten orada ve zincir zaten kurulu.** Kutu kapanışı zaten telefonda oluyor
(23.6 karar §1.1: *"web'de kutu açılmaz/kapanmaz"*), etiket de orada basılıyor. Kargo etiketi
**aynı zincirden** gider:

    telefon kutuyu kapatır (seal)
      → SUNUCU ETİKETİ SATIN ALIR (announce)        ← YENİ adım
      → sunucu PDF'i PNG'ye çevirir                  ← YENİ adım
      → telefon indirir (mevcut: GET /boxes/:id/label.png)
      → Brother'a basar (mevcut: printLabel)
      → POST /boxes/:id/printed damgası (mevcut)

**Satın alma ANI = kutu kapanışı.** Daha erken alınamaz: kutunun içeriği kesinleşmeden ağırlık
bilinmez. Daha geç almak da anlamsız — depocu kutuyu kapatıp etiketi eline alacak.

**TEK ETİKET, TEK BARKOD.** Kargo kulvarında bizim QR'lı kutu etiketimiz **basılmaz**: kutunun
üstünde iki barkod taşıyıcının tarayıcısını şaşırtır (kargo firmaları eski etiketlerin üstünün
kapatılmasını ister). Bunun bedeli yok, çünkü:
- Bizim kutu kodumuz taşıyıcı etiketine **metin olarak** zaten yazılıyor (`reference` alanı, §4.5)
  → fiziksel iz korunuyor.
- Kargo kulvarının **devir okutması taşıyıcının takip barkodunu okutur**. `order_box.tracking_number`
  bizde duruyor, okutulan numara kutuya çözülür. İkinci bir etikete gerek yok.

**✅ PDF DÖNÜŞÜMÜ GEREKMİYOR — ölçüldü 28.08, varsayım YANLIŞTI.** Bu satır önce *"yeni bir
bağımlılık gerekebilir"* diyordu. `expo-brother-printer-sdk@0.7.0` incelendi: dışa açtığı dört
basım kapısından **ikisi PDF** (`printPDF`, `printPDFWithURL` → native `printPDFAtPath`), ayarları
görüntü basımıyla AYNI (`labelSize`, `autoCut`, `cutAtEnd`) ve **sayfa seçimi** de var.

23.7'nin *"Brother SDK yalnız görüntü basıyor"* cümlesi BİZİM kutu etiketimiz içindi — onu SVG
üretiyoruz ve PNG'ye çevirmek doğal yoldu. Dışarıdan gelen PDF için geçerli değil; ölçmeden
varsaymak gereksiz bir bağımlılık eklettirecekti. `printLabelPdf` bu yüzden `[1]` ile **yalnız ilk
sayfayı** basıyor: kargo etiketi tek sayfadır, ama sağlayıcı bir gün gümrük belgesi eklerse
ruloya art arda basılırdı.

⚠ **ETİKET ÖLÇÜSÜ ÖLÇÜLDÜ (28.08) — 2 mm taşma GERÇEK.** Ücretsiz `sendcloud:letter` ile gerçek
bir etiket alındı (`pnpm sendcloud:label:smoke`) ve PDF'in `MediaBox`'ı okundu:

    etiket : 148,0 × 105,0 mm  (A6 YATAY)
    kâğıt  : 103   × 164   mm  (DieCutW103H164)

Yani etiket **90° döndürülmek zorunda** (SDK'da `imageRotation` var) ve döndürülünce **105 mm
genişlik** istiyor — kâğıt 103 mm. **2 mm taşıyor**; yükseklikte 16 mm boşluk kalıyor. Sürücü
büyük olasılıkla sığdırmak için ~%3 küçültecek, ki bu barkodu da küçültür — **basılan barkodun
okutularak doğrulanması gerekiyor**, gözle bakmak yetmez.

Alternatif kâğıt SDK'nın listesinde var: `DieCutW102H152` (4×6 inç = 101,6×152,4) — o daha da dar.
Karar fiziksel: hangi rulo takılı ve barkod okunuyor mu. 23.5'in "iğne deneyi" emsali aynen
geçerli — **gerçek kâğıtla basılıp barkodu okutulmadan bu iş bitti sayılmaz.**

**Prova GERÇEK AKIŞTA yapılacak** (kullanıcı kararı 28.08): yapay bir prova düğmesi yerine
sipariş → kutu → etiket zinciri kurulunca, o zincirin kendi basımıyla.

**Basım hatası satın almayı GERİ ÇEKMEZ** (23.7 çizgisi): etiket alınmıştır ve parası ödenmiştir;
cümle karta yazılır, "yeniden bas" eli bekler.

## 5. Sağlayıcı — dokümantasyon bulguları (28.08, sendcloud.dev)

- **Resmî SDK YOK.** npm'deki `sendcloud`, `sendcloud-client`, `node-sendcloud-sdk` paketleri
  **`sendcloud.sohu.com`** için — bambaşka bir Çin e-posta servisi, 9 yıldır güncellenmemiş.
  **Yanlış paket kurma tuzağı.** → REST + kendi istemcimiz.
- **OpenAPI 3.1.0 spec'i yayında**, servis başına:
  `https://sendcloud.dev/.openapi/v3/{shipments,shipping-options,service-points,webhooks,parcel-tracking,returns,...}/openapi.yaml`
  Doğrulandı: sunucu `https://panel.sendcloud.sc/api/v3`, güvenlik `HTTPBasicAuth` +
  `OAuth2ClientCreds` (beta).
- **Sürüm:** v2 Nisan 2026'da bakım moduna girdi, **yeni kullanıcıya kapalı**. v3 tek seçenek.
- **Kimlik:** Basic auth — kullanıcı adı Public Key, parola Secret Key. Entegrasyon başına ayrı
  anahtar. **Sandbox yok**; ücretsiz deneme yolu `sendcloud:letter` ("Unstamped Letter") seçeneği.
- **Birimler — bizim için en iyi haber:** `weight.unit` ∈ {kg, g, lbs, oz} ve
  `dimensions.unit` ∈ {cm, mm, m, yd, ft, in}. **Gram ve milimetre doğrudan tele giriyor**;
  07.12'nin "milimetre sakla" kararı dönüşümsüz karşılanıyor ve referans projenin boğuştuğu kayan
  nokta sorunu (`3 × 0,35 = 1.0499999999999998`, `toFixed(3)` yaması) bizde HİÇ doğmuyor.
- **Hacimsel ağırlığı BİZ HESAPLAMIYORUZ** — ama gerekçe düzeltildi (canlı ölçüm 28.08, §5.1).
  Doküman kırılım türleri arasında `volume`/`weight`/`weight_volume` sayıyor; **bizim hesabımızın
  gerçek cevabında bunlar YOK** — yalnız `price_without_insurance`, `fuel`, `insurance_price`
  döndü. Yani kırılımdan hacimsel ağırlığı okuyacağımıza GÜVENİLMEZ. Doğru gerekçe daha basit:
  **teklifin kendisi bağlayıcıdır** — doğru ölçüyü gönderiyoruz, dönen fiyat neyse odur. 07.12'nin
  `en×boy×yükseklik ÷ 5000` hesabı yine gereksiz, çünkü o hesabı sağlayıcı zaten fiyata katmış
  hâlde veriyor; bizim tekrarlamamız yalnız iki sayının ayrışma riskini doğururdu.
- **Multicollo yerel destekli:** tek gönderi → N koli, **her koliye ayrı takip numarası**, etiket
  üstünde 1/3 · 2/3 · 3/3, **senkron çağrıda en fazla 15 koli**. `shipment` ↔ `order_box` eşlemesi
  birebir oturuyor. *(Referans proje multicollo'yu kullanmamış, koli başına ayrı gönderi açmış.)*
- **`functionalities` zengin** — taşıyıcı süzmesi buradan: `multicollo` · `last_mile` ·
  `form_factor` · `size` · `bulky_goods` · `fragile_goods` · `fresh_goods` · `service_area` ·
  `delivery_deadline` · `insurance` · `signature` · `tracked` · `eco_delivery`.
- **Oran sınırı:** GET 1000/dk · POST/PATCH/PUT/DELETE 100/dk (+15/sn burst). Aşımda 429.
- **Idempotency anahtarı YOK** → **POST'ta retry YAPILMAZ** (yoksa ikinci koli açılır, gerçek para).
  GET'te retry serbest.
- **Webhook:** `Sendcloud-Signature` başlığı, HMAC-SHA256. Başarısız çağrı 10 kez üstel geri
  çekilmeyle yeniden denenir (5 dk → 1 saat). Webhook **entegrasyon kapsamlı**. `external_reference_id`
  alanı var → kendi `shipment.id`'mizi yazıp ikinci eşleşme bağı kurarız.
- **Tip stratejisi:** OpenAPI'den üretilen tipler `@lezzet/sendcloud` paketinin **İÇİNDE** kalır
  (dış dünyanın şekli); paketin dışa açtığı yüzey elle yazılmış dar bir Zod sözleşmesidir
  (`ShippingRateProvider` portu). Sendcloud bir alan değiştirirse derleme kırılır, iç şemamız
  kirlenmez (`CLAUDE §1` şema tek kaynak).

---


### 5.1 CANLI ÖLÇÜM — gerçek hesapla, 28.08

`apps/web/.env.local` içindeki anahtarlarla `POST /api/v3/shipping-options` çağrıldı
(Strasbourg 67000 → Paris 75001 · 1500 g · 300×200×150 mm · `calculate_quotes: true`).
**Teklif çağrısı hiçbir şey yaratmaz ve para harcamaz.** Sonuç `HTTP 200`, 17 seçenek, hepsi fiyatlı.

| € | kod | taşıyıcı | son adım | multicollo |
| --- | --- | --- | --- | --- |
| **0,00** | `sendcloud:letter` | Sendcloud | home_delivery | ✔ |
| 4,99 | `chronopost:shop2shop` | Chronopost | service_point | ✔ |
| 5,24 | `mondial_relay:locker_delivery,dualapi` | Mondial Relay | locker | ✘ |
| 5,34 | `mondial_relay:service_point,…` | Mondial Relay | service_point | ✘ |
| 6,40 | `mondial_relay:home_domestic,…` | Mondial Relay | home_delivery | ✘ |
| 8,93 | `chronopost:service_point` | Chronopost | service_point | ✔ |
| 10,12 | `colissimo:post-office` | Colissimo | service_point | ✘ |
| 11,99 | `colissimo:home/fr` | Colissimo | home_delivery | ✘ |
| 13,05 | `chronopost:18` | Chronopost | home_delivery | ✔ |

**Ölçümden çıkan dört şey:**

1. **Gram ve milimetre CANLI hesapta kabul edildi** — dokümanın sözü doğrulandı. Ölçüyü tam sayı
   gram + tam sayı milimetre olarak saklama kararı dönüşümsüz karşılanıyor.
2. **`sendcloud:letter` gerçekten 0,00 €** → uçtan uca prova (etiket satın alma dâhil) **para
   harcamadan** yapılabilir. Test yolu bu (kullanıcı şartı 28.08: *"test yaparken kullandığın hizmet
   ücretsiz olsun"*).
3. ⚠ **MULTICOLLO 17 SEÇENEĞİN YALNIZ 10'UNDA VAR — ve Mondial Relay'in HİÇBİRİNDE yok.**
   Bu bir iş kısıtıdır, teknik ayrıntı değil: **çok kutulu sipariş, tek kutuya sığanın gördüğü
   seçenekleri göremez.** Koli planı önce kutu sayısını hesaplamalı, sonra teklif listesi
   `multicollo` ile SÜZÜLMELİ — süzülmezse müşteri en ucuz seçeneği seçer, etiket satın alma anında
   sağlayıcı reddeder ve sipariş sevk edilemez hâlde kalır. Sıra bu yüzden zorunlu:
   **kutu planı → süzgeç → teklif → seçim.**
4. **Fiyat kırılımı bu hesapta `price_without_insurance` · `fuel` · `insurance_price`** —
   hacim/ağırlık kalemi yok (yukarıdaki düzeltme).
5. **`mondial_relay` bizim `carrier` enum'umuzda YOK** (`colissimo · chronopost · dhl · ups · other`)
   ve listenin en ucuz üç seçeneğinden ikisi o. Enum zaten emekliye ayrılıyor (§4.3) — taşıyıcı
   sağlayıcıdan gelen **metin** olacak; bu ölçüm o kararı doğruluyor.

## 6. Referans projeden (`~/dev/petitcigogne`) alınanlar / alınmayanlar

> Referans **bağlayıcı değil**, bilgi kırıntısıdır (kullanıcı kararı 28.08).

**Alınan dersler (yara izleri):**
1. **"Option B"** — webhook'un DURUMUNA güvenilmez; webhook yalnız *"değişti"* tetikleyicisi,
   gerçek durum REST'ten çekilir. Bilinmeyen kod → `null` döner ve mevcut durum korunur
   (`CLAUDE §1` "ölçülemeyen değer sıfır değildir" ile aynı ilke).
2. **İki ayrı kimlik uzayı** — sağlayıcı *shipment* id'si ile webhook'un gönderdiği *parcel* id'si
   farklı; takip numarası bazı taşıyıcılarda geç atanıyor, ona bağlanan eşleşme erken webhook'ları
   kaçırıyor. Referans bunu 13 migration sonra öğrendi; **biz baştan iki alanla doğuruz**.
3. **POST'ta retry yok** (dokümanla da doğrulandı — §5).
4. **Teklif tek fonksiyondan**; sipariş yaratma müşterinin gönderdiği fiyatı HİÇ okumaz.
5. **Maliyet ≠ gelir** ve ayrı kolonlarda; çok kutulu maliyet kutulara bölünür, artan kuruş
   son kutuya (Σ pay = toplam korunur).
6. **Öksüz koli nöbeti + runbook** — sağlayıcıda koli açılmış ama bizde satır yok. Cron yalnız
   TESPİT eder; düzeltme manueldir (gerçek para, otomatik iptal riskli).
7. **`server-only` shim deseni** — paket server-only değil (backend de kullanır), web ince bir
   yeniden-ihraç dosyasıyla guard'lar.

**Alınmayanlar ve neden:**
- Sabit adet böleni (`MUGS_PER_PARCEL`) — kupa homojen; bizde 250 g kutu ile 5 kg toptan koli
  aynı sayıda sığmaz.
- `STACK_LIMIT` + `BULK_PARCEL_DIMS` varsayımı — künyesinde bile *"geçici, gerçek atölye kolisiyle
  doğrula"* yazıyor; donuk gıda üst üste konunca ezilir.
- `SINGLE_PARCEL_DIMS` **sessiz yedeği** — ürün ölçüsü 0 ise sessizce devreye giriyor. 07.12 bunu
  adıyla reddediyor.
- `weightG` zorunlu + varsayılan 350 g — bizde ölçüsüzlük `null` olmalı.
- Ölçü ÜRÜN seviyesinde — bizde varyant seviyesinde.
- `shipping_settings` tekili — tek atölye varsayımı; bizde gönderici **depodan** gelir
  (ülke başına tek aktif kargo deposu zaten kısıtlı, `0031`).
- `price_multiplier` katsayısı — referansta franchise KDV rejimi yüzünden (KDV geri alınamıyor).
  Biz mükellefiz ve kargo KDV'si `apportionShippingVat` ile işleniyor → doğrudan teklif + eşik
  yeter. Parametrik bir "kargo maliyet payı" ayarı yine de konabilir (`CLAUDE §4`).
- **Test rejimi** — referansta 7 test dosyası var, hiçbiri kargo tarafında değil. Bizim rejimimiz
  `CLAUDE §4b` + "özellik bitince testi yazılır".
- API route'ta sipariş yaratma — bizde server action + `{ data, error }`.

---

## 7. Yol haritası — altı aşama

Her aşama tek başına teslim edilebilir; sonrakini beklemez.

**A — Ambalajlı ürün ölçüsü + giriş**
- `product_variant` += `packed_*` (4 kolon) → `0005` doğrudan düzenlenir (greenfield).
- `ProductVariantSchema` + `Insert`/`Entry` türetmeleri; `syncVariants` alanları yazar.
- Operasyon formunda satır içi kolon DEĞİL, **satır altı "Ambalajlı ürün" bölmesi** (tablo zaten
  8 kolon; 4 kolon daha okunmaz yapardı). Aynı bölmeye bugün hiç girilemeyen `portion_kind` de
  girer (aynı küme, tek tur — `CLAUDE §4`).
- MCP ürün dilekçesi aynı alanları alır (`assistant-proposal.schema.ts`, `tools-propose.ts`,
  `assistant/apply.ts`, `assistant-preview.tsx`, `payload-labels.ts`).
- Aynı turda: §2'deki `shippable` form varsayılanı arızası düzeltilir.
- Doğrulama: `docs:sync` ile `data-model/katalog.md` alan tablosu tazelenir; birim + entegrasyon testi.

**B — Kargo kutusu kataloğu + ölçü görünürlüğü**
- `shipping_box` tablosu + sistem şablonları (migration seed) + Depolar ekranına kutu listesi
  (benimse / yeni oluştur / kapat).
- `order_box` += `shipping_box_id` + bileşik FK; `openBox` sözleşmesi kutu tipini alır.
- Operasyon ürün listesine **"ambalaj ölçüsü eksik"** süzgeci/rozeti.

**C — Koli planı (`domain-core`)**
- Saf karar: kalemler + ambalajlı ürün ölçüleri + kargo kutusu listesi → kutu dağılımı.
- Ölçüt **hacim + ağırlık tavanı**, adet böleni değil.
- Çıktı yalnız dağılım değil, **ölçüm güveni**: hangi kalem ölçüsüz, hangi kutu tahmine düştü.
- Hacimsel ağırlık HESAPLANMAZ (§5).

**D — Sağlayıcı portu + istemci**
- `ShippingRateProvider` portu (`packages/application`) + `@lezzet/sendcloud` paketi +
  `testing.ts` sahte sağlayıcı (ağa çıkmadan test).
- OpenAPI'den üretilen tipler paketin içinde; dışa dar Zod sözleşmesi.
- Gönderici adresi **depodan**. Env: public/secret key + webhook secret.

**E — Sepet & checkout canlı teklif**
- Teklif **tek kapıdan**; sepet ve checkout aynı fonksiyonu çağırır (referansın adıyla kaydettiği
  sömürü kapısı bizde açılmasın).
- `resolveShippingFee` girdisine `quotedFeeCents`; eşik/rota mantığı aynen durur.
- Ölçü eksikse **teklif yok** → sabit tarifeye düşer ve düştüğü ekranda YAZILIR.
- İstemci seçenek kimliği gönderir; tutar sunucuda yeniden hesaplanır.

**F — Gönderi + etiket + webhook + nöbet**
- `shipment` + `shipment_event` tabloları + `order_box` taşıyıcı kolonları;
  `order.carrier`/`tracking_number` emekliye (§4.3, §4.5).
- Multicollo `announce` (tek çağrı, N kutu; 15 kutu tavanı sınır olarak kayda geçer) → etiket → R2.
- Etikette **adresin alıcısı** (kapanmış karar, `design/KARARLAR.md` 21.08).
- Webhook `apps/backend`'de, `webhook_event` idempotency'siyle; durum REST'ten (Option B).
- Cron: takılı gönderi (saatlik) + öksüz koli (haftalık), `jobs/runner.ts` kabuğuyla + runbook.
- `sendcloud:letter` ile ücretsiz uçtan uca prova.

**G — Besleme + kapsam + doküman** *(her aşamaya dağıtılır, ayrı tur değil)*
- 175 varyanta test ölçüsü kaynak dosyaya; `seed:coverage`'a "ambalaj ölçüsü eksik" kovası
  (bilinçli boşluklarla).
- Testi özelliğin bittiği turda yazılır; kod ve doküman aynı commit'te (`CLAUDE §5`).

---

## 8. Uçtan uca yüzey envanteri (ölçüldü 28.08)

> Kullanıcı kararı 28.08: *"her yere dokunan bir özellik istiyorum"*. §7'deki aşamalar arka uç
> eksenliydi; bu bölüm **hangi yüzeyde ne değişecek** sorusunun cevabıdır. Her satır ölçülmüştür.

### 8.1 ⚠ EN BÜYÜK BOŞLUK — kargo kulvarının durum zinciri KOPUK

`ORDER_LIFECYCLE.md:22` şunu diyor: `out_for_delivery` = *"Yolda (rota) **veya kargoya verildi**"*.
Yani durum makinesi kargoyu tanıyor. **Ama o durumu kargo için yazan hiçbir şey yok:**

- `out_for_delivery`'yi yalnız kurye akışı yazıyor — `courier/load.ts:85` (son kutu araca binince)
  ve `courier/day.ts:430` (gün başlatma). İkisi de `order.courierId` şartına bağlı; kargo
  siparişinin kuryesi yok.
- `delivered` yalnız `deliver_order` RPC'sinden yazılıyor ve RPC **yalnız `out_for_delivery`den**
  teslim ediyor (`0016`), tek çağıran da `confirmDoorDelivery` (kurye kapısı).
- Operasyon sipariş ekranı teslim işaretini **reddediyor** — `gecisReddiCumlesi` operatörü teslimat
  ekranına yolluyor, o ekran da kurye eksenli.

**Sonuç: bugün bir kargo siparişi `ready`'de takılı kalır; teslim edilmiş sayılamaz.** Kâr
snapshot'ı, `completed` kapanışı, teslim maili ve geri bildirim daveti bu yüzden kargo kulvarında
hiç doğmuyor. Taşıyıcı webhook'u bu boşluğu doldurur: *handed over* → `out_for_delivery`,
*delivered* → `deliver_order`. **Çok kutuluda tüm kutular teslim olmadan sipariş kapanmaz.**

### 8.2 Bildirim + e-posta — altyapı HAZIR, kaynağı yok

- `OrderNotificationSchema.tracking` (`contracts/notification.schema.ts:74`) var; şema künyesi
  *"yoldaki kargoda takip vardır pencere yoktur"* diyor.
- E-posta şablonu takibi **zaten çiziyor** (`order-out-for-delivery.tsx:131` — numara + bağlantı).
- Fakat `application/order/notification-data.ts:131` şunu yazıyor:
  `tracking: null, // Kargo takibi 07.4/07.5 ile gelir; alan hazır, kaynak yok.`
  → **Bu iş o kaynağı bağlar.** Şablon ve şema değişmiyor.
- **Zaman çizgisi 4 adım kalır** (`received · prepared · on_the_way · delivered`); kargoda
  `on_the_way` = "kargoya verildi". Beşinci adım eklenmez; değişen yalnız adımın **detay metni**.
- **Yeni müşteri bildirim türü açılmaz** — `order_out_for_delivery` kargoda da doğru cümle.
  **İstisna:** taşıyıcı "teslim edilemedi / iade dönüyor" derse karşılığı YOK. Bunun için tek yeni
  tür: `order_delivery_failed`. Personel tarafında `shipment_stuck` (gönderi takıldı / etiket
  alınamadı) — `document_undeliverable` deseninin kardeşi, `STAFF_NOTIFICATION_KINDS`e girer
  (girmezse satırlar sonsuza dek birikir).
- Kopya: `packages/i18n/src/notification-copy.ts` (üç dil) + `packages/email` şablonu.

### 8.3 Operasyon — web

| Ekran | Değişiklik | Aşama |
| --- | --- | --- |
| Ürün formu (`product-form/`) | "Ambalajlı ürün" bölmesi (4 alan + `portion_kind`) | A |
| Ürün listesi | "ambalaj ölçüsü eksik" süzgeci + rozet | B |
| **Depolar** (`operations/warehouses/`) | **Kargo kutuları bölümü** — şablondan benimse · yeni oluştur · kapat. Emsal birebir var: `printer-dialog.tsx` + `warehouses-sections.tsx` deseni | B |
| Hazırlık masası (`preparation.desktop.tsx`) | Kargo kutusu telefonda kapanır (§4.6) → satın alma ORADA. Web'in `ShipmentBox`'ı **görüntüleme + yedek şerit** olur: elle taşıyıcı/numara (`other`), etiketi yeniden bas, gönderiyi iptal et | F |
| Sipariş detayı | Teslimat kartı: gönderi künyesi + **kutu başına** takip (1/3, 2/3…) + etiketi yeniden bas | F |
| Ayarlar | Kargo maliyet payı (parametrik, `settings-catalog.ts` sözlüğüne satır) | E |
| Sistem (`/operations/system`) | **"N tanınmayan taşıyıcı kodu"** sayacı — `shipment_event.mapped_status is null` (§4.5); eşleme tablosunun büyüme sinyali | F |

### 8.4 Müşteri — web

| Ekran | Değişiklik | Aşama |
| --- | --- | --- |
| Sepet (`cart-summary.tsx`, `cart-group.tsx`) | Ücretsiz kargo çubuğu ve kargo grubu duruyor; ücret **canlı teklifle değişken** olur. "Şu kadar daha ekleyin" cümlesi korunur | E |
| Checkout (`checkout-client.tsx`) | **Taşıyıcı/servis seçimi** yeni bileşen. Ekran adres değişince her şeyi yeniden çözüyor — teklif o zincire girer. İstemci **kod** gönderir, tutar sunucuda yeniden hesaplanır | E |
| Sipariş detayı | `ShipmentCard`/`TrackingButton` var (09.08'de yazıldı) → **çok kutulu** hâl için genişler | F |
| Siparişler listesi | Takip özeti (bugün tek numara varsayıyor) | F |

### 8.5 Müşteri — native (mobil şeridin işi)

- `screens/orders/order-detail-screen.tsx:210-343` — taşıyıcı · takip numarası · takip CTA'sı
  **zaten çiziyor**; çok kutulu hâl için genişler.
- `screens/checkout/checkout-screen.tsx` — `shippingFeeCents` + `shippingFreeReason` alıyor;
  servis seçimi eklenecek.
- `screens/orders/order-timeline.tsx` — kargo dili.
- `screens/notifications/` — yeni tür(ler)in kopyası.

### 8.6 Operasyon — native (mobil şeridin işi)

- `screens/warehouse/preparation-screen.tsx` + `use-preparation.hook.ts` — kutu açarken
  **kargo kutusu tipi seçici** (`POST /warehouse/orders/:id/boxes` sözleşmesi `shippingBoxId` alır).
- **Kargo kulvarında devir okutması** — kutular okutulur, gönderi "taşıyıcıya verildi" olur.
  `courier/load.ts` kurye şartına bağlı olduğu için **ayrı kapı**; `ScanSheet` yeniden kullanılır.
- `warehouse-hub-screen` sayacı: "kargoya verilecek N kutu".

### 8.7 mobile-api sözleşmeleri (BENİM şeridim)

- `catalog.ts` — ambalaj ölçüsü **müşteriye GİTMEZ** (iç bilgi; `CatalogVariantSchema` genişlemez).
- `cart.ts` / `checkout.ts` — teklif seçenekleri + seçilen servis kodu.
- `orders.ts` — gönderi + kutu başına takip listesi.
- `warehouse.ts` — kutu açma sözleşmesi (`shippingBoxId`) + devir ucu.

### 8.8 Arka uç işleri

- Webhook `apps/backend` (Hono) + `webhook_event` idempotency (`STACK §13`: imza doğrulanmadan
  gövde işlenmez).
- Cron, `jobs/runner.ts` kabuğuyla: **takılı gönderi** (saatlik) · **öksüz gönderi** (haftalık).
  İkisi de yalnız TESPİT eder, `error_log`'a warning yazar — düzeltme manuel (gerçek para).

### 8.9 Analitik

- `checkout_blocked` sebep kümesinde `not_shippable` var; **teklif alınamadı** hâli için yeni sebep
  (`quote_failed`) gerekir — yoksa düşen teklif sessizce sabit tarifeye dönüşür ve hiçbir yerde
  görünmez.
- `order_placed` yükünde seçilen servis kodu.

### 8.11 Komponent haritası — YENİ PAYLAŞILAN KOMPONENT YAZILMAZ

> Kullanıcı şartı 28.08: *"tasarım desenlerine uymak ve yeni komponent yazmak yerine mümkün mertebe
> mevcutları kullanmak gerekiyor."* Envanter kuralı da aynı şeyi söylüyor
> (`design/pages/komponent-envanteri.md`): yeni sayfa tasarlanırken **önce mevcut envantere bakılır**;
> yeni komponent gerekiyorsa **açıkça belirtilir**.
>
> ⚠ **İki stil evreni ayrıdır ve karıştırılmaz:** müşteri evreni (vitrin dili) ↔ operasyon evreni
> (hız/netlik dili). *"Bir evrenin komponenti diğerinde aynı sayılmaz."* Örnek: mobil
> `OperationsChoiceChip` operasyon evrenindedir — müşteri checkout'unda KULLANILMAZ.

**Envanter (ölçüldü 28.08):** operasyon web `components/operation/{ui,form}` — 57 + 40 dosya ·
müşteri web `components/customer/{ui,form,cart,delivery,account,auth,legal}` · mobil
`components/{ui,operations,scan,print}`.

| Yeni yüzey | Kullanılacak MEVCUT parçalar | Yeni? |
| --- | --- | --- |
| **Ambalajlı ürün bölmesi** (ürün formu varyant satırı) | `Input` (`inputSize="sm" mono inputMode="numeric"`) · `NumberCell` — `variant-editor.tsx` içinde ZATEN var ve Net/Adet/Min. stok'ta üç kez kullanılıyor · `LocaleTabs` · `SortableList` | satır-altı açılır bölme **yerel** (aşağıda) |
| **Kargo kutuları bölümü** (Depolar) | Emsal **birebir**: `measure-points.tsx` (depo başına düzenlenebilir liste: satır + ekle/düzenle/aç-kapa) ve `printer-dialog.tsx` (depo ayar penceresi). Parçalar: `Dialog` · `Card` · `SectionHead` · `Chip` · `Button` · `FormInput` · `FormSelect` · `EmptyState` | ✘ |
| **"Ambalaj ölçüsü eksik" süzgeci + rozet** | `FilterChip` (ürün listesinde zaten kullanımda) · `Badge` · ürünlerin `status-badge.tsx` deseni | ✘ |
| **Sistem: tanınmayan taşıyıcı kodu sayacı** | `Metric` / `InlineMetric` · `ScoreTile` | ✘ |
| **Hazırlık masası gönderi kutusu** | `ShipmentBox` zaten var (10.9) · `Card` · `Badge` · `CopyText` (takip numarası) | ✘ |
| **Müşteri checkout — servis seçimi** | `ChoiceCard` (`checkout-steps.tsx` içinde yerel; adres · gün · ödeme yönteminde ÜÇ kez kullanılıyor → bu **dördüncü** kullanım) · `StepShell` · `formatPrice` · mevcut zeytin hap deseni | ✘ |
| **Müşteri sipariş detayı — çok kutulu takip** | `ShipmentCard` / `TrackingButton` (09.08, masaüstü+mobil ORTAK parça) → tek numaradan listeye genişler · `Card` · `Badge` | ✘ |
| **Mobil müşteri — servis seçimi** | `PressableSurface` + `Chip` (checkout ekranının bugünkü seçim deseni) · `Note` · `PrimaryButton` | ✘ |
| **Mobil müşteri — takip** | `order-detail-screen.tsx` zaten taşıyıcı + numara + CTA çiziyor · `Tag` · `TextAction` | ✘ |
| **Mobil operasyon — kargo kutusu tipi seçici** | `OperationsChoiceChip` (tam bu iş için var) · `BottomSheet` · `OperationsSectionHeader` | ✘ |
| **Mobil operasyon — devir okutması** | `ScanSheet` **doğrudan yeniden kullanılır** (aynı `onScan` sözleşmesi, `devCodes` simülasyon havuzu dahil — 23.8 emsali) | ✘ |

**Sonuç: paylaşılan envantere giren yeni komponent SIFIR.** Sayfaya-özel iki yerel parça doğuyor,
ikisi de birebir emsalden türüyor ve envantere girmiyor (`CLAUDE §2`: sayfaya-özel →
`<sayfa>/components/`):

1. **Varyant satırı açılır bölmesi** — operasyon evreninde paylaşılan bir katlanır komponent YOK
   (`payload-tree` kendi ağacı için yazılmış, genel değil). Varyant tablosu zaten 8 kolon; dört
   kolon daha eklemek satırı okunmaz yapardı. Parça `variant-editor.tsx` içinde kalır.
2. **Depo kargo kutuları listesi** — `measure-points.tsx` deseninin ikizi, `warehouses/` klasöründe.

**⚠ TASARIM AÇIĞI — improvise edilmeyecek (`CLAUDE §3`).** Bu yüzeylerin hiçbiri bugün bir
`.dc.html`'de çizili değil: kargo kutuları bölümü, checkout servis seçimi, çok kutulu takip kartı.
İki yol var ve karar kullanıcınındır: (a) Claude Design'dan çizim istenir; (b) en yakın emsale
dayanarak kurulur ve `design/BACKLOG.md`'ye **"çizilmedi, kodlandı"** kaydı düşülür — bu deseni
projede emsali var (teslimat yeri panelinin dört hâli · mobil kargo künyesi). Emsalsiz bir görsel
karar **verilmez**.

### 8.10 Şerit sınırı

**8.5 ve 8.6 native yüzeylerdir — benim şeridim değil.** Sözleşmeler (8.7) ve arka uç bende;
ekranlar mobil şeride `docs/talep/` üzerinden geçer. Talep, sözleşme yazıldıktan SONRA açılır
(boş sözleşmeye ekran yazılmaz) ve tek dosyada tüm kümeyi taşır (`CLAUDE §4`: aynı konudaki
talepler kümelenir).

---

### 4.7 AÇIK — hangi iş hangi yazıcıya? (kullanıcı sorusu 28.08)

**Ölçülen durum:** yazıcı ayarı `settings`in **depo kapsamında** ve **TEK** (`label_printer_address`
· `_model` · `_label_size`; bugün yalnız STR dolu). Ama fiziksel gerçek çoğul:

- **İki yazıcı, iki farklı rulo** (23.5 karar §1.6): QL-1110NWB 102 mm · QL-820NWB 62 mm.
- **Ve artık iki etiket TÜRÜ var:** bizim kutu etiketimiz (QR) ve taşıyıcının etiketi (A6 yatay).

Yani eksik olan eksen **"hangi cihaz"** değil **"hangi İŞ"**: bir depoda N yazıcı olabilir ve her
BASIM TÜRÜ birine bakmalı.

**Kullanıcının sezgisi (*"bu telefonda yaşamalı gibi"*) kısmen doğru ama önerim SUNUCU tarafı:**

- *Tutarlılık:* aynı depodaki iki depocu farklı yazıcıya basarsa etiketler iki ayrı rafta çıkar —
  hangi kâğıdın nerede olduğu telefonun kararı olmamalı.
- *Yeni cihaz sıfırdan başlar:* cihaz-yerel ayarda her yeni telefon "hangi yazıcı" sorusunu
  yeniden sorar ve yanlış cevap **sessizce yanlış ruloya** basar.
- *Görünürlük:* bugün Depolar ekranı "bu depo neye basıyor"u gösteriyor; telefona taşınırsa
  operasyon o soruyu hiçbir yerden cevaplayamaz.
- *Yazıcı deponun malıdır*, telefonun değil — depo boyutu zaten doğru eksen.

**Öneri:** `warehouse_printer(warehouse_id, purpose, address, model, label_size, is_active)`,
`unique (warehouse_id, purpose)`. `purpose` = `box` · `shipping`. 23.7 tek yazıcı için *"yeni tablo
YOK, `settings` yeter"* demişti ve o gün haklıydı; N yazıcı × M amaç tam da bir tablonun hak
ettiği yer.

**Cihaz ezmesi SONRA ve opsiyonel:** varsayılan depodan gelir, telefon isterse kendi seçimini
yapar ve o seçim cihazda yaşar. Böylece kullanıcının sezgisi karşılanır ama varsayılan hiçbir
zaman boş kalmaz.

**Ne zaman:** basım akışı yazılırken (07.12 kalanı) — o turda zaten `labelPrinterFor` çağrısı
değişecek; şimdi ayrı bir tur açmak aynı dosyaları iki kez elden geçirmek olurdu.

---

## 9. Açık kalan iki karar

Bunlar plandan değil ölçümden çıktı; iş başlamadan önce cevaplanmalı.

1. **Kargo siparişinde kutusuz onay reddedilsin mi?** Bugün kutusuz akış meşru
   (`boxes.ts` künyesi: *"web masası bugünkü gibi kutusuz onaylayabilir"*). Ama kutusuz bir kargo
   siparişinin ölçüsü de ağırlığı da yoktur → etiket satın alınamaz. **Önerim: kargo kulvarında
   kutusuz onay reddedilir**, rota kulvarında çift akış aynen sürer.
2. **Kargo kulvarına devir adımı.** `loadBox` (`courier/load.ts:57`) siparişin KURYESİNİ
   doğruluyor; kargo siparişinin kuryesi yok → bugün kargo kutusu hiçbir yere "yüklenemiyor".
   Kargoya kendi devir kapısı gerekiyor: kutular okutulur, gönderi "taşıyıcıya verildi" olur.
   Aynı `ScanSheet` zinciri, farklı kapı.

---

## 10. Test planı — dört tip, ve bir SESSİZ TUZAK

> Kullanıcı şartı 28.08: *"eklediğin her özelliğin testlerini de beraber gönder."* Test tipleri
> ölçüldü (`vitest.config.ts` · `playwright.config.ts` · `apps/mobile/jest.config.cjs`).

### 11.1 Dört tip

| Tip | Koşucu | Kapsam | Kural |
| --- | --- | --- | --- |
| **unit** | vitest `--project unit` | `packages/{domain-core,helper,types,notify,email,i18n,ai,observability,…}` · `apps/web/{app,components}` · `scripts/*.test.ts` + üç DB'siz liste | DB'siz, **paralel**, ~1,3 sn. Şeritlere HER AN açık |
| **integration** | vitest `--project integration` | `apps/web/lib` · `packages/database` · `packages/application` · `apps/backend` · `apps/mobile-api` | Yerel Supabase, **seri**, kilit altında. `CLAUDE §4b`: şeritlere KAPALI, yalnız commit öncesi tam paket |
| **e2e** | Playwright, `**/*.smoke.ts` | `e2e/{operations,customer}` · projeler: `ops-setup` · `operations` · `desktop` · `mobile-web` | Teslim noktalarında, sakin pencerede |
| **jest** | `apps/mobile` | native ekranlar | **Mobil şeridin** işi |

### 11.2 ⚠ SESSİZ TUZAK — yeni paketin testi HİÇ KOŞMAZ

`vitest.config.ts`in `unit` projesi **`include` listesiyle** çalışıyor; listede olmayan bir paketin
testi hata vermeden **hiç koşmaz**. Künye bunu iki kez, yaşanmış olarak yazıyor:

> *"Maskeleme saf metin işi, DB'siz (05.08). Liste eksik olsaydı `mask.test.ts` sessizce hiç
> koşmazdı — 'test yazdım' ile 'test koşuyor' arasındaki fark tam olarak budur."*

**Bu iş yeni bir paket doğuruyor (`@lezzet/sendcloud`) → `include`a satır EKLENECEK.** Unutulursa
istemcinin bütün testleri yeşil görünen bir boşluğa düşer. Aşama D'nin ilk adımı bu satırdır.

### 11.3 Yeni testler nereye yazılır

| Ne | Proje | Yer |
| --- | --- | --- |
| Koli planı (saf karar) | unit | `packages/domain-core/src/delivery/parcel-plan.test.ts` |
| Taşıyıcı durum eşlemesi (bilinmeyen → `null`) | unit | `packages/domain-core/src/delivery/carrier-status.test.ts` |
| Şemalar (`packed_*`, `shipping_box`, `shipment`) | unit | `packages/types/src/entities/*.test.ts` |
| Sendcloud istemcisi — **sahte sağlayıcıyla, ağa çıkmadan** | unit | `packages/sendcloud/src/*.test.ts` **+ `include` satırı (§11.2)** |
| `shipping_box` · `shipment` · `order_box` servisleri | integration | `packages/database/src/services/*.test.ts` |
| Kutu döngüsü + etiket satın alma orkestrasyonu | integration | `packages/application/src/warehouse/*.test.ts` |
| Teklif kapısı (tek kaynak · sunucu fiyatı) | integration | `apps/web/lib/order/*.test.ts` |
| Webhook (imza · idempotens · Option B) | integration | `apps/backend/src/**/*.test.ts` |
| Uç sözleşmeleri | integration | `apps/mobile-api/src/api/v1/*.test.ts` |
| Form/komponent saf mantığı | unit | `apps/web/components/**/*.test.tsx` |
| Uçtan uca duman | e2e | `e2e/operations/*.smoke.ts` · `e2e/customer/*.smoke.ts` |

**`docs:check §3i` makineyle zorluyor:** `apps/web/lib`e yazılan DB'siz bir test dosyası
`WEB_LIB_DBSIZ` listesine girmezse **commit'ten geçmez**. Saf dosya yazınca liste güncellenir.

### 11.4 Bu işin kendi test kuralları

- **Sahte sağlayıcı zorunlu.** `packages/ai/src/testing.ts` ve `packages/notify/src/whatsapp/testing.ts`
  deseni: `fetchImpl` enjekte edilir, test ağa ÇIKMAZ. Gerçek çağrı yalnız elle prova içindir.
- **Canlı prova YALNIZ ücretsiz seçenekle** (kullanıcı şartı 28.08): `sendcloud:letter` = 0,00 €
  (§5.1'de ölçüldü). Etiket satın alma denemesi bu seçenekle yapılır.
- **Teklif çağrısı ücretsizdir ve hiçbir şey yaratmaz** → ölçüm için serbest.
- **POST retry YOK** (§5) — testin de bunu çivilemesi gerekiyor: 5xx'te ikinci `announce`
  atılmadığı sınanır. Aksi hâlde bir gün gerçek para iki koli açar.
- **Küresel sayıya bakan test YAZILMAZ** (`CLAUDE §4b`): "toplam N gönderi" değil, kendi kurduğun
  satırları say — başka ajanın verisi o sayıyı oynatır.
- **Teardown `purgeTestData` + `mustDelete`** (`@lezzet/database/testing`); `shipping_box` ve
  `shipment` purge sırasına EKLENİR — `order_box` `restrict` FK'lerle korunuyor ve Supabase
  `delete()` hatayı fırlatmaz, döndürür.
- **`settings` gibi küresel tekil satır kirletilmez** — kargo ayarları için `overrideSetting` +
  snapshot deseni (`lib/feedback/invite.test.ts` emsali).

### 10.5 Cihazda doğrulama — rozet çipleriyle kamerasız tarama

> Kullanıcı bilgisi 28.08: fiziksel Android cihaz bağlı; kamera gerektiren akışlar alttaki
> **rozet çiplerine** basılarak simüle ediliyor.

**Ölçüldü 28.08:** cihaz bağlı (`adb` seri `5cf6c351`), `com.lezzetanatolia.app` ön planda.

- **Mekanizma:** `ScanSheet` `__DEV__` altında bir çip paneli çiziyor. Çipe basmak kameranın kodu
  okumasıyla **aynı yoldan** geçiyor (`onScan` + tekrar-okuma kilidi); tek fark kodun kaynağı.
  Release derlemesinde dal ölü koddur, bundler atar — ayrı env bayrağı bilerek yok.
- **Havuz gerçek kâğıdın aynası:** `DEV_SCAN_POOL` beş çipi `scripts/seed/test-labels.ts`teki
  **fiziksel test etiketi setiyle** birebir aynı kodları taşıyor (24.08 kararı). Çipe basmak ile
  kâğıdı okutmak aynı metni üretir → simülasyonda bulunan arıza cihazda da tekrarlanır.
- **KARGO DEVİR OKUTMASI KENDİ `devCodes`'UNU VERİR** — kutu QR'ı deseninin aynısı
  (`scan-sheet.tsx` künyesi: *"uydurma bir kod değil, ekranın elindeki gerçek kutuların kodları"*).
  Bizim durumumuzda bunlar `sendcloud:letter` ile açılmış **gerçek test gönderilerinin takip
  numaraları** olur → simülasyon gerçek veriyle çalışır ve **para harcanmaz** (§5.1: letter 0,00 €).
  Devir okutmasının taşıyıcı barkodunu okuduğu kararı (§4.6) bu yüzden sınanabilir.
- **Ekran görüntüsü:** `adb -s <seri> exec-out screencap -p > <dosya>`.
  ⚠ **Seri ZORUNLU:** cihaz iki kez listeleniyor (USB + kablosuz, aynı telefon) ve serisiz her
  `adb` komutu `more than one device/emulator` ile düşüyor. Ölçüldü 28.08.

⚠ **BAYAT KÜNYE (mobil şeridin işi, not bırakıldı):** `scripts/ui-shot-mobile.mjs` künyesinde
*"Android: dev-client daha derlenmedi (21.7 kalanı) … bugün iOS-yalnız olması bilinçli kapsam"*
yazıyor. **21.7 kapandı** (`0ac97be0`) ve Android cihaz bağlı — yani cümle artık doğru değil ve
araç hâlâ iOS-yalnız. Native görüntü bugün elle `adb` ile alınıyor.

## 11. Kaynaklar

- Sendcloud Developer Portal — `https://sendcloud.dev/` · doküman indeksi `https://sendcloud.dev/llms.txt`
- Shipping Options & Quotes — `https://sendcloud.dev/docs/shipments/shipping-options-and-quotes.md`
- Multicollo — `https://sendcloud.dev/docs/shipments/multicollo.md`
- Oran sınırı — `https://sendcloud.dev/docs/getting-started/rate-limits.md`
- Webhook (parcel status changed) — `https://sendcloud.dev/api/v3/webhooks/parcel-status-changed.md`
- Kimlik doğrulama — `https://sendcloud.dev/docs/getting-started/authentication.md`
- Referans proje: `~/dev/petitcigogne` — `packages/sendcloud/src/index.ts`,
  `apps/backend/src/webhooks/sendcloud.ts`, `apps/backend/src/lib/sync-shipment-status.ts`,
  `apps/web/src/lib/shipping/{compute-quotes,parcel-plan}.ts`,
  `docs/runbooks/orphan-parcel-recovery.md`, `supabase/migrations/{013,017}*.sql`
