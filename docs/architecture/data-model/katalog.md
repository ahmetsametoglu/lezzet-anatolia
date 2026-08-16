# Veri Modeli — Katalog

Kategori, koleksiyon, ürün, varyant, görsel, fiyat, indirim, paket.

> Bu dosya `../DATA_MODEL.md`'nin parçasıdır. Ortak ilkeler (çok dilli alanlar, türetme ilkesi, enum listesi, kalıcı kararlar) ana dosyadadır; **karar oraya, alan buraya** yazılır.

---

## Category (kategori)

Düz (tek seviye), iç içe ağaç yok. Her ürün tek kategoride (bkz. `DOMAIN.md §13`).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| name | LocalizedText (jsonb) | çok dilli |
| tagline | LocalizedText (jsonb) \| null | **kısa tanıtım — vitrin bandının ALTYAZISI** (05.17). Başlık değil: başlık kategori adıdır; ikinci bir başlık alanı açılsaydı aynı şeyin iki kaynağı olurdu. Boş bırakılabilir ve öyle kalmalı — altyazısız kategori altyazısız çizilir, **yedek metin uydurulmaz** (ada düşmek "Börekler / Börekler" tekrarı üretirdi). Doğuş sebebi ölçüldü: mobil vitrin bandının altyazısı tasarımın içinde SABİT bir sözlüktü (`CSUB`), yani yeni kategori altyazısız doğuyor ve cümle operatörün elinde değildi |
| slug | string | dil-bağımsız URL parçası; benzersiz |
| image_key | string \| null | kategori KAPAĞI; depo anahtarı, tam URL değil (STACK §5). Anasayfa kategori şeridinde görünür: **web 3:2 kart, mobil daire** (aynı kare kırpma + yuvarlak maske). **Artık tek yüz değil** (05.23): kart görseli `category_image` havuzundan güne göre seçilir ve kapak o havuzun bir üyesidir — havuz boşsa kart eskisi gibi yalnız bunu gösterir |
| image_focal_x | smallint | odak %, 0-100 (object-position X); tek kaynak 3:2'den tüm çerçeveler bununla türer (Komponent Envanteri §0B) |
| image_focal_y | smallint | odak %, 0-100 (object-position Y) |
| image_zoom | smallint | zoom %, 100-400; dikey/kare kaynağı yatay çerçeveye kırpar (yeniden çektirmeden) |
| image_alt | LocalizedText (jsonb) \| null | alternatif metin; **boşsa müşteride kategori adına düşer** (kopya tutulmaz) |
| image_updated_at | timestamptz \| null | görsel DOSYASININ son değişme anı; public okuma URL'inin sürüm damgası (`?v=`). Anahtar deterministik + cache `immutable` olduğu için damgasız yeni dosya bir yıl görünmez. Kırpma (odak/zoom) dosyayı değiştirmez → damgayı yalnız yükleme yazar |
| sort_order | int | |
| is_active | boolean | |
| is_featured | boolean | **ana sayfada göster** (05.18). `is_active` ile KARIŞTIRILMAZ — aktiflik "yayında mı", bu "vitrinde mi"; ikisi ayrı sorudur. **İşaret SEÇİMDİR, sıra `sort_order`'dan gelir**: ikinci bir vitrin sırası tutulmaz, iki sıra bir gün çelişir ve hangisinin kazandığı ekrandan anlaşılmaz. Hiç işaret yoksa okuma sıradan ilk N'e düşer — vitrin boş kalmaz |
| created_at | timestamptz | |

## CategoryImage (kategori fotoğraf havuzu)

Kategori kartı bir kare çizer, ama o kare **sabit değil**: operatör havuza birkaç fotoğraf koyar, kart her gün başka birini gösterir (05.23). Gerekçe kategorinin ne olduğunda: "Börekler" bir ürün değil bir **raf** — su böreği de, kol böreği de, ıspanaklısı da aynı raftadır ve hiçbiri tek başına o rafın doğru resmi değildir.

Kapak `Category.image_key`'de kalır — kartı çizen okuma kategoriyi zaten satır olarak alıyor, kapak için ikinci sorgu doğmasın; **bu tablo yalnız ek fotoğrafları tutar.** Şema `ProductImage` ile birebir aynı gövdeden türer (`GalleryImageSchema`): aynı işi yapan iki tablonun alanları ayrışırsa editörü de, okuması da, kırpması da ikiye bölünür.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| category_id | uuid | kategoriye CASCADE bağlı |
| image_key | string | depo anahtarı, tam URL değil (kapakla aynı desen). Kapaktan farklı olarak **zorunlu**: anahtarsız havuz satırı yoktur |
| image_focal_x | smallint | odak %, 0-100 — her fotoğrafın KENDİ odağı vardır |
| image_focal_y | smallint | odak %, 0-100 |
| image_zoom | smallint | zoom %, 100-400 |
| image_alt | LocalizedText (jsonb) \| null | erişilebilirlik/SEO; boşsa kategori adı kullanılır |
| image_updated_at | timestamptz \| null | görsel dosyasının sürüm damgası (gerekçe: Category satırı) |
| sort_order | int | **rotasyonun döngü sırası** — vitrin sırası değil (aşağıya bakınız) |
| created_at | timestamptz | |

**Havuz = kapak + bu satırlar.** Kapak dışarıda bırakılsaydı, havuza ilk fotoğraf eklendiği gün kapak sessizce emekliye ayrılırdı. Anahtarı olmayan satır havuza girmez (kapağı henüz yüklenmemiş kategori boş kare göstermesin).

**Seçim `rotateDaily` ile — yeni bir kural yazılmadı.** Koleksiyon bandı aynı soruyu 08.08'den beri soruyor ve cevabı orada verilmişti: `Math.random()` sayfa önbelleğini kırar, aynı müşteriye her yenilemede başka vitrin gösterir ve "dün gördüğüm neydi" sorusunu cevapsız bırakır. Kategori kartında üçü de aynen geçerli, üstelik bir dördüncüsü var: paylaşım kartı (OG) ile sayfanın kendisi ayrışır — linki paylaşan, tıklayanın gördüğünden başka bir fotoğraf görürdü. Kural o gün webdeydi, 05.23'da `@lezzet/application`a terfi etti (ikinci yüzey: mobil API aynı indirgemeden geçiyor).

**`sort_order` neden vitrin sırası değil:** ürün galerisi müşteriye TOPLU gösterilir (detay sayfasında hepsi yan yana), yani orada sıra "hangisi önce görünür" demektir. Kategori havuzu hiç toplu gösterilmez — kart tek kare çizer. Buradaki sıra kartın **hangi fotoğraftan hangisine geçeceğini** belirler.

**Tavan `CATEGORY_GALLERY_MAX = 7`** ve ürününkinden (5) ayrı bir sabit: ürün galerisinde sayı arttıkça ekran uzar, burada arttıkça aynı fotoğrafın tekrarı gecikir. Yedi = bir hafta; tekrar ancak sekizinci günde.

**Kapak takası** ürünündekiyle aynı orkestrasyon (`CategoryService.makeCover`) ve kategoride hâlâ anlamlı: rotasyon kartın tek yüzünü ortadan kaldırdı ama kapağın iki işi kaldı — rotasyonun başladığı kare ve havuzu boş bırakılmış kategorinin tek görseli.

## Collection (koleksiyon)

Esnek pazarlama grubu (Bayram, Yeni, İndirimde). Bir ürün birden çok koleksiyona girer; `product_collections` çoklu bağ.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| name | LocalizedText (jsonb) | çok dilli |
| description | LocalizedText (jsonb) \| null | koleksiyon tanıtım metni — paylaşım/OG açıklaması |
| slug | string | sosyal paylaşım/direkt bağlantı |
| image_key | string \| null | kapak = paylaşım (OG) kartı görseli (16:9); depo anahtarı, tam URL değil (STACK §5). **Müşteri sayfasında render edilmez** — yalnız link önizleme kartını besler |
| image_focal_x | smallint | OG kartı odak %, 0-100 (object-position X); dikey/kare kaynak odak+zoom ile 16:9'a kırpılır (§0B) |
| image_focal_y | smallint | OG kartı odak %, 0-100 (object-position Y) |
| image_zoom | smallint | OG kartı zoom %, 100-400 |
| image_alt | LocalizedText (jsonb) \| null | OG kartı alt metni; boşsa ada düşer |
| image_updated_at | timestamptz \| null | görsel dosyasının sürüm damgası (gerekçe: Category satırı) |
| is_active | boolean | |
| is_featured | boolean | ana sayfada göster (05.18) — kural Category satırındakiyle birebir. Pasif bir koleksiyon (hazırlanan kampanya) işaretli kalabilir; okuma ikisini birden sorar |
| sort_order | int | |
| created_at | timestamptz | |

`product_collections`: (`product_id`, `collection_id`) çoklu bağ + `position` (int) — koleksiyon **içindeki** vitrin sırası; admin sürükle-bırakla kürasyon yapar. Üyeler koleksiyon başına `position` ile sıralı okunur.

## ProductFamily (ürün ailesi — çeşit ekseni)

Bazı ürünler bir ailenin üyesidir: aynı kekin limonlu/mangolu/çilekli hâlleri. **Üye = ürünün kendisi** — kendi sayfası, beyanı, görseli, fiyatı olan tam bir ürün. Aile onların üstünde ince bir gruplamadır, yeni bir varlık türü DEĞİL.

**Varyanttan ayrı eksen:** varyant aynı ürünün boyudur (500 g / 1 kg), aile kimlik seçimidir.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| name | string | **TEK DİLLİ ve bilinçli:** aile adı MÜŞTERİYE GÖRÜNMEZ (kullanıcı kararı 04.08). Müşterinin gördüğü başlık arayüz metnidir ("Çeşitler"); bu ad yalnız operatörün panelde aileyi tanımasına yarar ve operasyon yüzeyi tek dillidir |
| is_active | boolean | pasif aile: üyeler satışta kalır, çeşit bloğu çizilmez |
| created_at | timestamptz | |

Üyelik `product` tarafında üç alanla durur: `family_id` · `family_label` · `family_position` (aşağıda).

**Neden `Collection` DEĞİL:** koleksiyon tasarım gereği çoktan-çoğadır. Bir ürün iki koleksiyondayken *"öteki çeşitler"* sorusunun **iki cevabı** olur ve hiçbir yer hata vermez. `family_id` kolonu "en çok bir aile" değişmezini yapısal kılar — kural veride durur. Emsal bu şemada yaşandı: `delivery_zone_postal_code` dizi kolonundan kendi tablosuna taşındı, çünkü aynı kodu iki bölgeye yazmak serbestti ve çözücü sessizce birini seçiyordu.

**Neden serbest metin bir `family_key` değil:** `limonlu-kek` ile `limonlu_kek` sessizce iki aile yapar; üstelik aileye ad/aktiflik asacak yer kalmazdı.

## Product (ürün)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| name | LocalizedText (jsonb) | çok dilli |
| description | LocalizedText (jsonb) | çok dilli |
| slug | string | dil-bağımsız URL parçası (ör. `su-boregi`); benzersiz — path öneki dili taşır (`/fr/produits/su-boregi`), slug taşımaz (bkz. `SEO_I18N.md`) |
| ingredients | LocalizedText (jsonb) \| null | içindekiler (çok dilli) — INCO: alerjenler metin içinde vurgulanır |
| nutrition | jsonb (`Nutrition`) \| null | besin değerleri, **100 g başına** — sabit kalemli (aşağıda); uzaktan satışta ürün sayfasında beyan (INCO) |
| allergens | string[] | AB 14 alerjeninden ürünün **içerdikleri** (FR/DE yasal beyan) |
| is_incomplete | boolean | **Üretilmiş kolon** — beyan eksik mi (ad dillerinden biri yok · içindekiler/besin/saklama girilmemiş · alerjen listesi boş). Süzgeç ve sayaç AYNI gerçeği okusun diye DB'de hesaplanır; hangi beyanın eksik olduğu uygulamada (`missingDeclarations`) |
| traces | string[] | AB 14'ten **çapraz bulaşma** riski olanlar ("aynı tesiste … işlenir"); cümle bu listeden i18n şablonuyla kurulur, serbest metin tutulmaz |
| storage_instructions | LocalizedText (jsonb) \| null | saklama ve hazırlama metni (çözdürme, yeniden dondurmama, ısıtma) — müşteri ürün sayfasında ayrı bölüm; `shelf_life_days` sayısaldır, bu ise müşteriye gösterilen metindir |
| category_id | uuid | |
| image_key | string \| null | kapak görseli; depo anahtarı, tam URL değil (blueprint STACK §5) |
| image_focal_x | smallint | kapak odak noktası %, 0-100 (object-position X); tek kaynak 3:2'den tüm çerçeveler bununla türer (Komponent Envanteri §0B) |
| image_focal_y | smallint | kapak odak noktası %, 0-100 (object-position Y) |
| image_zoom | smallint | kapak zoom %, 100-400; dikey/kare kaynağı yatay banda kırpar (yeniden çektirmeden) |
| image_alt | LocalizedText (jsonb) \| null | kapak alternatif metni (erişilebilirlik + SEO); **boşsa müşteride ürün adına düşer** (kopya tutulmaz) |
| image_updated_at | timestamptz \| null | görsel dosyasının sürüm damgası (gerekçe: Category satırı) |
| vat_rate | number | ürün bazında KDV (5.5 / 20) |
| date_type | enum(`DLC`,`DDM`) | son tarih tipi — güvenlik/kalite (varsayılan `DDM`) |
| shelf_life_days | int \| null | toplam raf ömrü (gün); kalan % hesabı için |
| shippable | boolean | kargoyla gönderilebilir mi — **varsayılan `false`** (kullanıcı kararı 08.08: unutulan alanın bedeli "satılamadı" olmalı, "bozuk gitti" değil); false = yalnız rota/kapı teslim (soğuk zincir) |
| status | product_status | satış durumu TEK alanda: `active` (satışta) · `passive` (satışa kapalı) · `candidate` (aday ürün — stokta yok, tedarik edilebilir; keşif bölümünde gösterilir, SATILAMAZ, bkz. `DOMAIN.md §13`). Önce `is_candidate` + `is_active` ikilisiydi: iki bayrak üç durum için dört bileşim üretiyordu ve "aday + pasif" gibi anlamsız bir hâl mümkündü — enum bunu kapatır; varsayılan `active` |
| target_margin_percent | number \| null | hedef kâr marjı (maliyet üzerine markup %); marj uyarısı / otomatik fiyat için — ORTAK hedef, B2B'ye özel değer yoksa iki kanalda da geçerli |
| target_margin_b2b_percent | number \| null | B2B'ye ÖZEL hedef marj (kullanıcı kararı 15.08): toptan marjı perakendeden farklı kurulabilir; null = ortak hedef geçerli. Çözüm tek yerde: `targetMarginFor` (domain-core) — diyalog önizlemesi, otomatik fiyat ve marj-altı uyarısı aynı fonksiyonu okur |
| auto_price | boolean | otomatik fiyatlandırma açık mı (varsayılan false) — açıksa fiyat hedef marja göre otomatik güncellenir, kapalıysa sistem uyarır |
| sort_order | int | |
| family_id | uuid \| null | **ÇEŞİT EKSENİ** (`ProductFamily`, yukarıda). `null` = ailesiz → çeşit bloğu HİÇ çizilmez. `on delete set null` |
| family_label | LocalizedText (jsonb) \| null | **Aile içi kart etiketi — ürün adından AYRI ve üç dilli.** Ürün "Limonlu kek", etiket "Limonlu"; kartta okunan ikincisidir (kartlar yan yanayken her birinde "kek"i tekrar etmek seçimi zorlaştırır). **Türetilemez:** ortak eki kırpmak "Çilekli Kek" ile "Kek Dilimi" yan yana gelince bozulur. **Veri kısıtı zorunlu kılıyor** (`family_id` doluyken): ekranda unutulursa kart ürün adına düşer, DOĞRU GÖRÜNÜR ve kısa etiketin amacı sessizce kaybolur |
| family_position | int | **Aile İÇİNDEKİ sıra** — operatörün sürüklediği sıra. `sort_order` KULLANILMAZ: o katalog sırasıdır ve iki kararı tek kolona bağlamak, ailedeki sırayı değiştirene katalog sırasını da farkında olmadan değiştirtirdi. Yazma **tüm aileyi birden** günceller |
| created_at | timestamptz | |

Fiyat **ayrı** tutulur (aşağıda), çünkü kanal ve müşteriye göre değişir.

**`Nutrition` (sabit kalemli, 100 g başına):** `energy_kj`, `energy_kcal`, `fat_g`, `saturated_fat_g`, `carbohydrate_g`, `sugars_g`, `protein_g`, `salt_g` — INCO'nun zorunlu beyan seti ve sırası. Serbest anahtarlı jsonb **değil**: müşteri tablosu, operasyon formu ve çeviri aynı sabit listeden üretilir (satır adları arayüz i18n'inde, veride değil). Kalem `null` bırakılabilir (bilinmiyor → satır gösterilmez).

## ProductImage (ürün görseli)

Ürün detay sayfası galeri gösterir (web: büyük görsel + küçükler; mobil: kaydırmalı). Kapak `Product.image_key`'de kalır — liste/kart/OG paylaşımı tek sorguda okunsun diye; **bu tablo yalnız ek görselleri tutar, kapak burada tekrarlanmaz.**

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| product_id | uuid | ürüne CASCADE bağlı |
| image_key | string | depo anahtarı, tam URL değil (kapakla aynı desen). Kapaktan farklı olarak **zorunlu**: anahtarsız galeri satırı yoktur |
| image_focal_x | smallint | odak %, 0-100 — her fotoğrafın KENDİ odağı vardır |
| image_focal_y | smallint | odak %, 0-100 |
| image_zoom | smallint | zoom %, 100-400 |
| image_alt | LocalizedText (jsonb) \| null | erişilebilirlik/SEO; boşsa ürün adı kullanılır |
| image_updated_at | timestamptz \| null | görsel dosyasının sürüm damgası (gerekçe: Category satırı) |
| sort_order | int | galeri sırası (sürükle-bırak) |
| created_at | timestamptz | |

**Kapak ↔ galeri takası:** "bunu kapak yap" silme değil yer değiştirmedir — seçilen fotoğraf kapağa geçerken eski kapak onun galerideki sırasına oturur, künye (dosya + odak + zoom + alt + damga) bütün hâlinde taşınır. Odak fotoğrafın özelliğidir, çerçevenin değil. Ürünün kapağı yoksa satır galeriden çıkar (aynı dosya iki yerde görünmez).

**Çerçeve farkı:** kapak dört çerçeveye türer (kart 3:2, sepet 1:1, kategori dairesi, paylaşım kartı); galeri fotoğrafı **tek** çerçevede görünür (detay galerisi, 3:2). Fark veride değil, kırpma editörünün gösterdiği önizlemededir (`gallery` rolü).

## SiteImage (sayfa görseli)

**Bu tablo katalogun parçası DEĞİL, ama görsel ailesinin parçası** — bu yüzden burada, kardeşlerinin yanında duruyor. Ayıran şey sahiplik: ürünün/kategorinin/koleksiyonun/paketin/tarifin görseli **kendi satırının künyesinde** yaşar, çünkü görsel o varlığa aittir ve varlık silinince anlamsızlaşır. Buradakiler bir varlığa değil bir **sayfa yerine** aittir: ana sayfanın kahramanı, boş sepetin çizimi. "Boş sepet" diye bir varlık yoktur ve olmayacaktır.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| slot | enum | `home_hero` (16:9) · `packages_hero` (3:2) · `professionals_hero` (16:9) · `empty_cart` (illüstrasyon). **Kapalı küme** — yeni slot ancak onu çizen ekran doğunca eklenir |
| image_key | string | depo anahtarı (`site/{slot}.{ext}`), tam URL değil. **null olamaz:** satırın kendisi görseldir |
| image_focal_x / image_focal_y / image_zoom | int | odak + zoom — aynı fotoğraf 16:9 ve 3:2 çerçevelere farklı oturur |
| image_alt | LocalizedText (jsonb) \| null | erişilebilirlik + SEO |
| image_updated_at | timestamptz \| null | dosyanın sürüm damgası (`?v=`) — anahtar deterministik olduğu için public cache'i kıran tek şey bu |

**Anahtar neden enum:** serbest metin, ekranda karşılığı olmayan bir görselin yüklenmesine izin verirdi — yüklendiği anda kaybolan, operatörün "yükledim ama görünmüyor" diye aradığı bir dosya. Enum, yeni slot açmayı migration'a (gözden geçirilen bir yere) taşır.

**Boş slot = satır YOK.** Okuma haritası eksik anahtarı hiç taşımaz; ekran yer tutucusunu çizmeye devam eder ve kova boş diye sayfa kırılmaz. Çok dillilik gerekmiyor: görselin içinde metin yok, aynı fotoğraf üç dile de hizmet eder — dil başına ayrı dosya, üç kat yükleme karşılığında sıfır kazanç olurdu.

## ProductVariant (ürün varyantı)

**Satılabilir birim varyanttır.** Bir ürün bir veya birden çok varyant taşır (ör. "Maraş Dondurma" → 70gr, 500gr); müşteri ürün sayfasında varyantı seçer. Varyantsız görünen ürünler de aslında **tek (varsayılan) varyant** taşır — böylece fiyat/stok mantığı her yerde aynı çalışır.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| product_id | uuid | bağlı ürün (paylaşılan ad/açıklama/görsel/DLC/KDV orada) |
| label | LocalizedText (jsonb) | varyant etiketi — **müşteriye görünür** (boy kartı: "700 g tepsi" / "plateau 700 g"), bu yüzden çok dilli; tek varyantlıda varsayılan |
| net_weight_g | int \| null | net ağırlık (gram) — etiket beyanı ve €/kg birim fiyat gösterimi |
| pieces_count | int \| null | paket içi adet ("12'li baklava"). Gramajın YERİNE değil yanına: 72'lik kutu hem 72 adet hem 2500 g'dır, ikisi ayrı soruya cevap verir ("kaç kişilik" ↔ "ne kadar yer kaplar"). `null` = bildirilmemiş (dökme ürün), **sıfır değil**. Alan yokken adet adın içinde kalıyor ve slug ayrıştığı için tek ürün ayrı ürünlere bölünüyordu (05.14) |
| min_stock_qty | int \| null | asgari stok eşiği — kullanılabilir stok altına düşünce "sipariş zamanı" önerisine düşer (bkz. `DOMAIN.md §16`); null = öneri yok |
| sku | string \| null | stok kodu |
| is_active | boolean | |
| sort_order | int | |
| created_at | timestamptz | |

Paylaşılan alanlar (ad, açıklama, kategori, görsel, `date_type`, `shelf_life_days`, `shippable`, `vat_rate`, hedef marj) **Product**'ta; boyuta göre değişen **fiyat, stok, indirimli teklif** ise **varyant** seviyesinde. Satış birimi **sabit paket** — her varyant sabit gramajlı bir pakettir, adet olarak satılır (tartıyla değişken ağırlık Faz 1'de yok).

## Price (fiyat)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| variant_id | uuid | fiyat varyant seviyesinde |
| channel | enum(`b2b`,`b2c`) | kanal fiyatı |
| customer_id | uuid \| null | doluysa müşteriye özel fiyat |
| amount | numeric (€) | **KANAL TABANINDA**: b2c satırları KDV dahil (TTC), b2b satırları hariç (HT) — bkz. `DOMAIN.md §5`. Uygulama tarafındaki adı `amountCents` ve birimi **cent**tir; dönüşümü `PriceService.moneyFields` yapar (`STACK §8`) |
| currency | enum(`EUR`) | |
| valid_from | timestamptz | tarihli geçerlilik; "geçmiş ve en yeni" kazanır, gelecek tarihli satır zammı önceden hazırlar |
| created_at | timestamptz | |

`customer_id` tek kimlik tablosunu (`user_profiles`) işaret eder — "müşteri rolüyle davranan profil".

## Discount (indirim / kupon)

Tek varlık; hem kupon (kod) hem otomatik kampanya. Kupon daima sepet düzeyi (bkz. `DOMAIN.md §5`).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| name | string | iç ad — operatörün listede tanıdığı ad, tek dilde (Türkçe); müşteriye GÖSTERİLMEZ |
| public_label | jsonb \| null | **müşteriye görünen ad**, üç dilde (`{"fr":"Offre de bienvenue",…}`) — sepet/ödeme özetinde ve mailde indirim satırının yanına yazılır. `null`/boş = ad yok → yüzey genel "İndirim / Remise / Rabatt"a düşer. `name`'den ayrı, çünkü iki farklı okuyucusu var: biri operasyonun kendi dili, öbürü vitrinin cümlesi. Sipariş bu değerin ANLIK KOPYASINI tutar (`order.discount_label`) |
| trigger | enum(`coupon`,`automatic`) | kod mu, otomatik mi |
| type | enum(`percent`,`fixed`) | oran / sabit tutar |
| percent | numeric \| null | `type=percent` satırında dolu; oran (15 = %15). Tavan %100 (kolon kısıtı) |
| amount | numeric (€) \| null | `type=fixed` satırında dolu. Uygulamadaki adı `amountCents`, birimi **cent** (`STACK §8`) |
| scope | enum(`cart`,`category`,`collection`) | kupon → daima `cart` |
| category_id | uuid \| null | scope=category |
| collection_id | uuid \| null | scope=collection |
| min_basket | numeric (€) \| null | asgari sepet koşulu. Uygulamadaki adı `minBasketCents`, birimi **cent** |
| first_order_only | boolean | yalnız ilk sipariş |
| valid_from | timestamptz \| null | |
| valid_to | timestamptz \| null | |
| max_uses | int \| null | toplam kullanım (kupon) |
| per_customer_limit | int \| null | müşteri başına |
| customer_id | uuid \| null | kişisel kupon (ör. geri bildirim ödülü) — yalnız o müşteri kullanır |
| is_active | boolean | |
| created_at | timestamptz | |

**Kodlar burada DEĞİL, `DiscountCode`'da:** bir kuponun birden çok kodu olabilir (bkz. aşağı).

**Değer neden iki kolon (02.9):** tek `value` kolonu vardı ve birimi `type`'a bağlıydı — yüzdede oran,
sabitte euro. Böyle bir kolon hiçbir adla dürüst olamaz: `value_cents` yüzde satırında yalan söyler,
`value` sabit satırında birimini söylemez. Birimi söylenmeyen para alanı, 74,17 €'yu 0,74 € gösteren
hatanın zeminidir (`STACK §8`). Hangi kolonun dolu olacağını `discount_value_matches_type` kısıtı tutar:
ikisi de boş bir kural sessizce "sıfır indirim" uygulardı, ikisi de dolu olan ise hangisinin geçerli
olduğunu okuyana bırakırdı.

## DiscountCode (kupon kodu)

Kuponun **kapısı**. Bir kuralın birden çok kodu olur ve **hepsi aynı kuralı, aynı kotayı açar**.

Sebep dildir: "HOSGELDIN" bir Türk müşteriye bir şey anlatır, Fransız'a hiçbir şey; aynı kampanya
için "BIENVENUE" ve "WILLKOMMEN" de açılabilmeli. Ama bunlar üç ayrı kampanya DEĞİLDİR — koşulları,
değeri, tarihi ve kullanım tavanı tektir. Üç ayrı `Discount` satırı açmak "toplam 100 kullanım"
sınırını sessizce 300'e çıkarırdı.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| discount_id | uuid | bağlı olduğu kural (cascade) |
| code | string | müşterinin yazdığı kod; **harf ayrımsız ve TÜM kurallar arasında tekil** (`upper(code)` indeksi) — bir kod tek bir kuralı göstermeli, yoksa hangisinin uygulandığı yazılma sırasına kalırdı |
| locale | enum(`tr`,`fr`,`de`) \| null | kodun yazıldığı dil; `null` = dilden bağımsız (matbu kart üstündeki tek kod). Zorunlu değil, her kod bir dile ait olmak zorunda değil |
| created_at | timestamptz | |

**Yalnız kuponun kodu olur:** kampanyaya kod yazılması DB trigger'ıyla engellenir
(`discount_code_requires_coupon`) — "otomatik" adının yalanı olan kodlu bir kampanya, kutuya
yazılınca uygulanır ve kimse neden olduğunu anlamaz. **Kodsuz kupon** ise uygulama katmanında
engellenir (kural yazılmadan kod satırı olamayacağı için DB kısıtı olarak duramaz).

**Kota bölünmez.** `max_uses`/`per_customer_limit` kural seviyesinde kalır, sayım `DiscountUse`
satırları üzerinden yapılır. Hangi kapıdan girildiği yalnız **kırılımdır**: `discount_use.
discount_code_id` "TR kodu mu FR kodu mu tuttu" sorusunu yanıtlar ve kampanyanın hangi dilde
karşılık bulduğunu söyler.

**Kullanım kaydını SİPARİŞ yazar, kapı değil** (karar 30.07). `OrderService.create` satırı siparişin
kendi verisinden (`discount_id` + `discount_amount`) türetir; checkout'a yazılsaydı elle sipariş
girişi, WhatsApp ajanı ve kapıda satış aynı şeyi ayrı ayrı hatırlamak zorunda kalır ve hatırlamayan
ilk yol kotayı sessizce delerdi. Açık zaten böyle doğdu: indirim siparişe yazılıyor, kullanım kaydı
hiçbir yerde yazılmıyordu — kotalı kupon aylarca sınırsız kullanılabildi. İdempotency
`discount_use_order_key` tekil indeksindedir, uygulamada bir kontrolde değil.

**İptal kotayı geri verir, iade vermez** (karar 30.07). Sayım `cancelled` siparişleri **dışlar**:
vazgeçilen siparişte müşteri indirimden yararlanmadı, hakkını yakmak kendi hatası olmayan bir
sebeple kuponu elinden almak olurdu (en çok puanla alınmış tek kullanımlık kuponda acıtır). Kayıt
silinmez, sayarken dışlanır — "kim ne zaman denedi" geçmişte kalır. `returned` dışlanmaz: iptal "hiç
olmadı", iade "oldu ve geri döndü" demektir.

## Bundle (paket)

Birden çok ürünü tek fiyata sunan katalog kısayolu; sepete eklenince tek tek `OrderItem`'lara açılır (bkz. `DOMAIN.md §13`). Yeni ürün yaratmaz.

**Paket yalnız B2C'dedir** (karar 27.07): `total_price` ve kalemlerin `allocated_unit_price`'ı **KDV dahil (TTC)** — B2C kanal tabanı. Paketin kanal listesi, müşteriye özel fiyatı ve `Price` satırı YOKTUR; bu yüzden tek sayı yeter. Toptan müşteri paketi görmez, kalem kalem alır (gerekçe: paket bir pazarlama aracıdır, toptan pazarlık kalem üzerinden yürür).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| name | LocalizedText (jsonb) | çok dilli |
| description | LocalizedText (jsonb) | çok dilli |
| image_key | string \| null | |
| slug | string | sosyal paylaşım / direkt seçim bağlantısı |
| total_price | number | müşterinin gördüğü paket fiyatı, **TTC** (= atanmış fiyatların toplamı); yalnız B2C |
| is_active | boolean | |
| sort_order | int | |
| is_featured | boolean | ana sayfada göster (05.18) — kural Category satırındakiyle aynı; `is_active` "satışta mı", bu "vitrinde mi" |

## BundleItem (paket kalemi)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| bundle_id | uuid | |
| variant_id | uuid | pakete dahil satılabilir birim |
| qty | number | |
| allocated_unit_price | number | bu kaleme atanmış birim fiyat, **TTC** (müşteri görmez); Σ(allocated×qty)=`Bundle.total_price`; **hediye = 0** |

## Recipe (tarif — "Sofradan Fikirler")

Tarif bir ürün DEĞİL, bir **vitrindir**: kendi ürünlerimizi bir yemeğin içinde gösterir ve sepete kalem kalem ekletir. Fiyatı, stoğu, siparişi yoktur — kalemleri vardır (`0038_recipe.sql`, 05.16).

**Hesaplanmayan alan tip taşımaz** (kullanıcı kararı 07.08): `duration` ve `serves` çok dilli METİNdir, sayı değil. İkisinde de hesap yok — kimse süreye göre süzmüyor, sıralamıyor; sayı tutulsaydı üç dile birim eki basan bir biçimlendirici gerekirdi (`dk` · `min` · `Min.`). `serves` ayrıca sayı OLAMAZ: tasarım "3–4 kişilik" diyor, yani aralık. **Sayı kalan tek alan `RecipeItem.qty`**, çünkü gerçekten hesaba giriyor (toplam = Σ qty × fiyat).

**`steps` ve `pantry` tek yerelleştirilmiş metindir, satır = madde.** Ayrı tablo açılmadı, "çok dilli dizi" tipi icat edilmedi — emsal `Product.ingredients` (düz metin + `**vurgu**`). Adım numarasını EKRAN verir. *Ödünç yazılı:* madde başına veri (adım görseli/süresi) gerekirse bu model taşımaz.

**Üç dil dolmadan yayın yok — kural VERİDE** (`recipe_publish_requires_all_locales`): `is_active = true` ancak yedi alanın (`name · description · duration · serves · meal · steps · pantry`) tr/fr/de'si **dolu** olduğunda geçer; boş dize dolu sayılmaz. Yan kazancı: yayındaki tarifte eksik dil olmadığı için **dil yedek zinciri sorusu ortadan kalkar** — Fransız müşteriye Türkçe hazırlanış adımı düşmez. (Üründe yedeğe düşmek doğrudur, müşteri ürünü adından tanır; tarifte yanlıştır, anlaşılmayan bir adım işe yaramaz.) Zorlama ÇEVİRİYE değil DOLULUĞA: kısıt "AI çevirdi mi" diye sorsaydı kota bittiği gün tarif yayınlanamaz olurdu.

**Malzeme toplamı KOLON DEĞİL** ve serviste de hesaplanmaz: fiyat personaya (B2B toptan) ve depoya bağlıdır, saklanan bir toplam ilk gün yalan söyler. **Depo ekseni tasarımda hiç anılmıyor ama en büyük gizli gereksinim odur** (`DOMAIN §17`): "6,40 €" de "tükendi" de müşterinin yerine bağlı; tarif okuması vitrin okumalarıyla aynı depo süzgecinden geçmek zorunda.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| slug | string | dil-bağımsız (tek); dış URL'in dil farkı `routing.ts`'ten (`SEO_I18N`) |
| name | LocalizedText (jsonb) | |
| description | LocalizedText (jsonb) \| null | |
| duration | LocalizedText (jsonb) \| null | "35 dk" — serbest metin, hesap yok |
| serves | LocalizedText (jsonb) \| null | "3–4 kişilik" — **aralık olabildiği için sayı değil** |
| meal | LocalizedText (jsonb) \| null | "Akşam yemeği" |
| steps | LocalizedText (jsonb) \| null | hazırlanış; **satır = adım**, numarayı ekran verir |
| pantry | LocalizedText (jsonb) \| null | evde olması gerekenler; bizim ürünümüz DEĞİL |
| image_* | ImageMeta | ürün/paketle aynı alanlar (3:2 kaynak + odak + alt) |
| is_active | boolean | **varsayılan `false`** — `true` olsaydı tek dille açılan her tarif kısıtta patlardı |
| sort_order | int | editoryal seçki sırası; müşteri sıralamaz |
| created_at | timestamptz | |

## RecipeItem (tarif kalemi)

Bağ **varyanta** kurulur, ürüne değil: sepet yalnız varyantla çalışır ve `product_id` de tutmak bir gün ayrışan iki gerçek demekti (`CLAUDE §1`) — ürün varyanttan zaten türer. `variant_id` FK'si **`restrict`** (`BundleItem` ile aynı karar): tarifte duran varyant silinemez.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| recipe_id | uuid | tarif silinince kalemler `cascade` ile gider |
| variant_id | uuid | `restrict` — tarifte duran varyant silinemez |
| qty | number | **sayı kalan tek alan**; toplam = Σ qty × fiyat |
| sort_order | int | müşterinin malzeme listesinde gördüğü sıra |
| created_at | timestamptz | |

Aynı varyant bir tarifte **iki kez yazılamaz** (`unique(recipe_id, variant_id)`): iki satır toplamı iki kez sayar ve malzeme ekranda alt alta iki kere görünürdü — adet artırmak için `qty` var.
