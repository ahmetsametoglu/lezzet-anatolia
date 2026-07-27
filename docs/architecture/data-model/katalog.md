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
| slug | string | dil-bağımsız URL parçası; benzersiz |
| image_key | string \| null | kategori görseli; depo anahtarı, tam URL değil (STACK §5). Anasayfa kategori şeridinde görünür: **web 3:2 kart, mobil daire** (aynı kare kırpma + yuvarlak maske) |
| image_focal_x | smallint | odak %, 0-100 (object-position X); tek kaynak 3:2'den tüm çerçeveler bununla türer (Komponent Envanteri §0B) |
| image_focal_y | smallint | odak %, 0-100 (object-position Y) |
| image_zoom | smallint | zoom %, 100-400; dikey/kare kaynağı yatay çerçeveye kırpar (yeniden çektirmeden) |
| image_alt | LocalizedText (jsonb) \| null | alternatif metin; **boşsa müşteride kategori adına düşer** (kopya tutulmaz) |
| image_updated_at | timestamptz \| null | görsel DOSYASININ son değişme anı; public okuma URL'inin sürüm damgası (`?v=`). Anahtar deterministik + cache `immutable` olduğu için damgasız yeni dosya bir yıl görünmez. Kırpma (odak/zoom) dosyayı değiştirmez → damgayı yalnız yükleme yazar |
| sort_order | int | |
| is_active | boolean | |
| created_at | timestamptz | |

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
| sort_order | int | |
| created_at | timestamptz | |

`product_collections`: (`product_id`, `collection_id`) çoklu bağ + `position` (int) — koleksiyon **içindeki** vitrin sırası; admin sürükle-bırakla kürasyon yapar. Üyeler koleksiyon başına `position` ile sıralı okunur.

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
| shippable | boolean | kargoyla gönderilebilir mi (varsayılan true); false = yalnız rota/kapı teslim (soğuk zincir) |
| is_candidate | boolean | aday ürün (stokta yok, tedarik edilebilir) — keşif/tinder bölümünde gösterilir, satılamaz (bkz. `DOMAIN.md §13`); varsayılan false |
| target_margin_percent | number \| null | hedef kâr marjı (maliyet üzerine markup %); marj uyarısı / otomatik fiyat için |
| auto_price | boolean | otomatik fiyatlandırma açık mı (varsayılan false) — açıksa fiyat hedef marja göre otomatik güncellenir, kapalıysa sistem uyarır |
| is_active | boolean | |
| sort_order | int | |
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

## ProductVariant (ürün varyantı)

**Satılabilir birim varyanttır.** Bir ürün bir veya birden çok varyant taşır (ör. "Maraş Dondurma" → 70gr, 500gr); müşteri ürün sayfasında varyantı seçer. Varyantsız görünen ürünler de aslında **tek (varsayılan) varyant** taşır — böylece fiyat/stok mantığı her yerde aynı çalışır.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| product_id | uuid | bağlı ürün (paylaşılan ad/açıklama/görsel/DLC/KDV orada) |
| label | LocalizedText (jsonb) | varyant etiketi — **müşteriye görünür** (boy kartı: "700 g tepsi" / "plateau 700 g"), bu yüzden çok dilli; tek varyantlıda varsayılan |
| net_weight_g | int \| null | net ağırlık (gram) — etiket beyanı ve €/kg birim fiyat gösterimi |
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
| amount | number | **KANAL TABANINDA**: b2c satırları KDV dahil (TTC), b2b satırları hariç (HT) — bkz. `DOMAIN.md §5` |
| currency | enum(`EUR`) | |
| valid_from | timestamptz | tarihli geçerlilik; "geçmiş ve en yeni" kazanır, gelecek tarihli satır zammı önceden hazırlar |
| created_at | timestamptz | |

`customer_id` tek kimlik tablosunu (`user_profiles`) işaret eder — "müşteri rolüyle davranan profil".

## Discount (indirim / kupon)

Tek varlık; hem kupon (kod) hem otomatik kampanya. Kupon daima sepet düzeyi (bkz. `DOMAIN.md §5`).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| name | string | iç ad |
| trigger | enum(`coupon`,`automatic`) | kod mu, otomatik mi |
| code | string \| null | trigger=coupon ise müşterinin girdiği kod |
| type | enum(`percent`,`fixed`) | oran / sabit tutar |
| value | number | |
| scope | enum(`cart`,`category`,`collection`) | kupon → daima `cart` |
| category_id | uuid \| null | scope=category |
| collection_id | uuid \| null | scope=collection |
| min_basket | number \| null | asgari sepet koşulu |
| first_order_only | boolean | yalnız ilk sipariş |
| valid_from | timestamptz \| null | |
| valid_to | timestamptz \| null | |
| max_uses | int \| null | toplam kullanım (kupon) |
| per_customer_limit | int \| null | müşteri başına |
| customer_id | uuid \| null | kişisel kupon (ör. geri bildirim ödülü) — yalnız o müşteri kullanır |
| is_active | boolean | |

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

## BundleItem (paket kalemi)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| bundle_id | uuid | |
| variant_id | uuid | pakete dahil satılabilir birim |
| qty | number | |
| allocated_unit_price | number | bu kaleme atanmış birim fiyat, **TTC** (müşteri görmez); Σ(allocated×qty)=`Bundle.total_price`; **hediye = 0** |
