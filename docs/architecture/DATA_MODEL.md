# Veri Modeli

Bu dosya varlıkları ve alanlarını tanımlar. Kaynak: Zod şemaları (`packages/types`) ve migration'lar (`supabase/migrations`). Kural (blueprint STACK §5): tip elle yazılmaz, şemadan türer; alan adları camelCase, veritabanı snake_case.

Aşağıdaki alan listeleri **başlangıç** niteliğindedir; kod yazıldıkça netleşir. Kod ile bu dosya çelişirse kod haklıdır.

---

## Çok dilli alanlar

Kullanıcı/admin tarafından girilen, çevrilmesi gereken metin alanları **jsonb** olarak `{ fr, de, tr }` biçiminde tutulur.

```ts
const LocalizedText = z.object({
  fr: z.string().optional(),
  de: z.string().optional(),
  tr: z.string().optional(),
}).refine(v => v.fr || v.de || v.tr, { message: 'En az bir dil zorunlu' });
```

- En az bir dil dolu olmalı; üçü birden zorunlu değil.
- Gösterimde yedek zinciri: seçili dil → **TR → FR → DE** (bkz. `SEO_I18N.md`).
- Çeviri AI ile önerilir, zorunlu değil (bkz. `SEO_I18N.md`).

Statik arayüz metinleri bu modele girmez — onlar kod içi i18n dosyalarındadır.

---

## Varlıklar

### Category (kategori)

Düz (tek seviye), iç içe ağaç yok. Her ürün tek kategoride (bkz. `DOMAIN.md §13`).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| name | LocalizedText (jsonb) | çok dilli |
| slug | string | dil-bağımsız URL parçası; benzersiz |
| sort_order | int | |
| is_active | boolean | |

### Collection (koleksiyon)

Esnek pazarlama grubu (Bayram, Yeni, İndirimde). Bir ürün birden çok koleksiyona girer; `product_collections` çoklu bağ.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| name | LocalizedText (jsonb) | çok dilli |
| slug | string | sosyal paylaşım/direkt bağlantı |
| is_active | boolean | |
| sort_order | int | |

`product_collections`: (`product_id`, `collection_id`) — çoklu bağ.

### Product (ürün)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| name | LocalizedText (jsonb) | çok dilli |
| description | LocalizedText (jsonb) | çok dilli |
| slug | string | dil-bağımsız URL parçası (ör. `su-boregi`); benzersiz — path öneki dili taşır (`/fr/produits/su-boregi`), slug taşımaz (bkz. `SEO_I18N.md`) |
| ingredients | LocalizedText (jsonb) \| null | içindekiler (çok dilli) |
| nutrition | jsonb \| null | besin değerleri (100g başına enerji/yağ/karbonhidrat/protein/tuz…) — uzaktan satışta ürün sayfasında beyan (INCO); opsiyonel başlangıçta |
| allergens | string[] | AB 14 alerjeninden uygun olanlar (FR/DE yasal beyan) |
| category_id | uuid | |
| image_key | string \| null | depo anahtarı, tam URL değil (blueprint STACK §5) |
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

### ProductVariant (ürün varyantı)

**Satılabilir birim varyanttır.** Bir ürün bir veya birden çok varyant taşır (ör. "Maraş Dondurma" → 70gr, 500gr); müşteri ürün sayfasında varyantı seçer. Varyantsız görünen ürünler de aslında **tek (varsayılan) varyant** taşır — böylece fiyat/stok mantığı her yerde aynı çalışır.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| product_id | uuid | bağlı ürün (paylaşılan ad/açıklama/görsel/DLC/KDV orada) |
| label | string | varyant etiketi (ör. "70gr", "500gr"); tek varyantlıda varsayılan |
| net_weight_g | int \| null | net ağırlık (gram) — etiket beyanı ve €/kg birim fiyat gösterimi |
| min_stock_qty | int \| null | asgari stok eşiği — kullanılabilir stok altına düşünce "sipariş zamanı" önerisine düşer (bkz. `DOMAIN.md §16`); null = öneri yok |
| sku | string \| null | stok kodu |
| is_active | boolean | |
| sort_order | int | |

Paylaşılan alanlar (ad, açıklama, kategori, görsel, `date_type`, `shelf_life_days`, `shippable`, `vat_rate`, hedef marj) **Product**'ta; boyuta göre değişen **fiyat, stok, indirimli teklif** ise **varyant** seviyesinde. Satış birimi **sabit paket** — her varyant sabit gramajlı bir pakettir, adet olarak satılır (tartıyla değişken ağırlık Faz 1'de yok).

### Price (fiyat)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| variant_id | uuid | fiyat varyant seviyesinde |
| channel | enum(`b2b`,`b2c`) | kanal fiyatı |
| customer_id | uuid \| null | doluysa müşteriye özel fiyat |
| amount | number | |
| currency | enum(`EUR`) | |
| valid_from | timestamptz | |

### Discount (indirim / kupon)

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

### Stock (stok partisi)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| variant_id | uuid | stok varyant seviyesinde |
| physical_qty | number | fiili |
| dlc | date | partinin son tarihi (tipi `Product.date_type`) |
| lot_number | string \| null | tedarikçinin lot numarası — geri çağırma (rappel) eşleşmesi; girişte istenir |
| purchase_price | number \| null | **birim (paket) başına** alış maliyeti — kâr/marj için; toptan alınıp paketlenirse giriş paket adediyle yapılır (ör. 1kg → 10×100gr), maliyet pakete bölünür |
| intake_id | uuid \| null | bağlı stok girişi/satın alma (bkz. `StockIntake`) |
| offer_price | number \| null | partiye bağlı indirimli teklif fiyatı; doluysa bu parti indirimli satışta (bkz. `DOMAIN.md §5`) |
| location | string \| null | depo konumu |

Ayrılmış miktar **saklanmaz** — aktif `Reservation` satırlarından türetilir. `available = Σ physical − Σ aktif rezervasyon` (bkz. `DOMAIN.md §4`).
Kalan raf ömrü % = (dlc − bugün) ÷ `Product.shelf_life_days` — türetilir; yaklaşan-son-tarih ve MLOR kararları buna göre.

### Reservation (rezervasyon)

Her ayırma bir satırdır; "ayrılan toplam" bu satırlardan **türetilir** (sayaç tutulmaz — kayarsa izi bulunamaz). Kurallar: `DOMAIN.md §4`.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| order_id | uuid | |
| variant_id | uuid | rezervasyon varyant-toplamı seviyesinde |
| stock_id | uuid \| null | **yalnız** partiye bağlı teklif satırında dolu (batch-pinned, bkz. `DOMAIN.md §5`); normalde null |
| qty | number | |
| expires_at | timestamptz \| null | online checkout TTL'i; kapıda/vadeli rezervasyonda null (süresiz, sipariş kapatır) |
| created_at | timestamptz | |

Süresi dolan satır cron'la silinir/pasifleşir; teslim/iptalde sipariş kapanışıyla düşer. Atomik "ayır" işlemi tek koşullu sorguda çalışır (`available >= qty` sağlanıyorsa satır yaz).

### StockAdjustment (imha / fire / sayım düzeltmesi)

Stok azalışının satış dışı her sebebi kayıt altına alınır — "bu üründen yılda ne kadar çöpe attım" buradan görünür (bkz. `DOMAIN.md §12`).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| stock_id | uuid | hangi parti |
| qty | number | düşülen adet |
| reason | enum(`expired`,`damaged`,`count_diff`,`lost`) | DLC imhası / hasar / sayım farkı / kayıp |
| unit_cost | number \| null | partinin alış fiyatı (snapshot) — fire maliyeti |
| note | string \| null | teslim-sonrası iade restoku gibi istisnalarda sebep |
| created_by / created_at | uuid / timestamptz | |

### TemperatureLog (sıcaklık kaydı)

Hijyen denetiminin ilk istediği veri; günde bir-iki **elle** giriş yeter (sensör entegrasyonu yok).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| location | string | dolap adı / araç |
| temperature_c | number | |
| recorded_by / recorded_at | uuid / timestamptz | |

### Customer (müşteri)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| type | enum(`individual`,`company`) | kanal bunu belirler |
| company_info | jsonb \| null | şirket bilgisi — doluysa B2B |
| vat_number | string \| null | AB vergi no (Alman USt-IdNr); reverse charge için |
| vat_number_valid | boolean \| null | VIES doğrulaması (açık API) |
| name | string | |
| email | string \| null | web kimliği |
| phone | string \| null | **kimlik anahtarı** — WhatsApp bununla tanır; normalize (E.164), bkz. `CHANNELS.md §3` |
| preferred_language | enum(`tr`,`fr`,`de`) | |
| country | enum(`FR`,`DE`) | |
| credit_enabled | boolean | vadeli (hesaba) sipariş yetkisi — **varsayılan false**, admin elle açar (bkz. `DOMAIN.md §7`) |
| credit_limit | number \| null | vade limiti (€) — vade açılırken admin girer; açık bakiye **türetilir** (ödenmemiş `on_account` siparişler), saklanmaz |
| payment_term_days | number \| null | vade süresi (gün) — boşsa `Setting` varsayılanı (30); gecikme bundan türetilir |
| discount_percent | number \| null | müşteriye genel özel indirim oranı; kanal fiyatına uygulanır (bkz. `DOMAIN.md §5`) |
| cod_allowed | boolean | kapıda ödeme izni (varsayılan true); kötüye kullanımda kapatılır (bkz. `DOMAIN.md §7`) |
| auth_user_id | uuid \| null | Supabase Auth kullanıcısı; doğrulanınca bağlanır (bkz. `DOMAIN.md §10`) |
| marketing_consent | jsonb | kanal bazlı pazarlama izni: `{email: {granted, at, source}, whatsapp: {...}}` — GDPR kanıtı (ne zaman, nereden); **Faz 1'de yalnız toplanır, gönderim yok** (bkz. `DOMAIN.md §11`) |
| acquisition_source | jsonb \| null | edinim kaynağı — **ilk siparişte bir kez** yazılır (UTM snapshot + order_source), sonra değişmez; "kaynağa göre tekrar sipariş" raporunun temeli |
| referred_by | uuid \| null | bu müşteriyi getiren müşteri (arkadaşını getir) — kayıtta bir kez |
| b2b_approved | boolean \| null | B2B self-servis kayıt onayı — onaylanana dek toptan fiyat görünmez (bkz. `DOMAIN.md §10`); B2C'de null |
| is_draft | boolean | taslak müşteri (WhatsApp telefonuyla otomatik açılan) — doğrulanınca false; birleştirme adayı işareti |
| addresses | (ayrı tablo) | |
| created_at | timestamptz | |

### Address (adres)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| customer_id | uuid | |
| line1, line2, postal_code, city, country | string | |
| in_route | boolean (türetilir) | posta kodu aktif bir `DeliveryZone`'a düşüyor mu |

### DeliveryZone (rota / teslimat bölgesi)

Admin tarafından düzenlenir; rota-içi belirleme ve teslimat günü bundan türer.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| name | string | iç etiket (ör. "Strasbourg Kuzey") |
| postal_codes | string[] | bölgeye dahil posta kodları (FR + DE/Baden dahil) |
| weekdays | int[] | haftalık teslimat günleri (1=Pzt … 7=Paz) |
| active | boolean | |

### Order (sipariş)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| customer_id | uuid | |
| channel | enum(`b2b`,`b2c`) | *kim* — müşteri tipinden otomatik, değişmez |
| order_source | enum(`web`,`whatsapp`,`door`,`manual`) | *nereden kapandı* — kanaldan bağımsız eksen (bkz. `CHANNELS.md §2`) |
| is_gift_order | boolean | patron ikramı (arkadaşa hediye); **yalnız muhasebe export'una girmez** — gelir/kâr/kasa/ortaklık dahil gerisi tam normal, parayı patron öder (bkz. `DOMAIN.md §9`) |
| status | enum | bkz. `ORDER_LIFECYCLE.md` |
| payment_status | enum(`pending`,`paid`,`partial`,`refunded`) | ayrı eksen; **türetilir** (`amount_collected`−`amount_refunded` vs karşılanan tutar) — bkz. Kalıcı kararlar |
| payment_method | enum(`online`,`cash`,`card`,`cheque`,`bank_transfer`) \| null | `bank_transfer` = havale (peşin veya vadeli tahsilat) |
| on_account | boolean | vadeli sipariş mi — yalnız `credit_enabled` müşteride true; peşin ödemesiz `confirmed` (bkz. `DOMAIN.md §7`) |
| delivery_type | enum(`route`,`shipping`) | rota içi / kargo |
| delivery_zone_id | uuid \| null | rota-içi ise hangi bölge (bkz. `DeliveryZone`) |
| delivery_date | date \| null | seçilen/atanan rota günü; kargoda null |
| address_id | uuid \| null | teslimat adresi; hızlı satışta null |
| address_snapshot | jsonb \| null | sipariş anında adresin kopyası — adres sonradan değişse de sipariş bozulmaz (zone editable olduğu için `delivery_zone_id` de snapshot'tır) |
| courier_id | uuid \| null | atanan kurye (rota teslimatı; atamada dolar) |
| delivery_country | enum(`FR`,`DE`) | teslimat ülkesi — DE B2C 10.000€ OSS eşiği izlemi (bkz. `DOMAIN.md §5`) |
| vat_number_snapshot | string \| null | reverse charge siparişinde o anki geçerli vergi no (denetim kanıtı) |
| shipping_fee | number | müşteriden alınan kargo ücreti (varsayılan 0); KDV'ye tabi (bkz. `DOMAIN.md §6`) |
| reference_no | string | sistemin ürettiği referans — marka+yıl+**rastgele** (ör. `LA-26-7K4M2P`), hacim sızdırmaz; **ilk kalıcı duruma geçişte** üretilir (`confirmed`, hızlı satışta `completed`); resmî fatura no değil |
| delivery_proof | jsonb \| null | teslim onayı: imza görüntüsü/foto (storage yolu), onaylayan, zaman — B2B varsayılan zorunlu, B2C kapalı (parametrik; bkz. `DOMAIN.md §6`) |
| invoice_no | string \| null | dış muhasebeden sonradan eşleşir |
| vat_treatment | enum(`domestic`,`intra_eu_b2b_reverse_charge`) | KDV işleme tipi (export için); ileride `oss_destination` |
| total | number | **sipariş edilen** toplam = Σ kalem − indirim + `shipping_fee` (sabit, sipariş anı) |
| discount_id | uuid \| null | uygulanan indirim/kupon (tek; üst üste binmez) |
| discount_amount | number | uygulanan indirim tutarı; varsayılan 0 |
| amount_collected | number | **cache** — kaynak `MoneyMovement` (siparişe bağlı girişler); toplam tahsil edilen |
| amount_refunded | number | **cache** — kaynak `MoneyMovement` (`order_refund` çıkışları); toplam iade edilen |
| cogs_amount | number \| null | malın maliyeti — tüketilen partilerin alışı; kapanışta sabitlenir |
| delivery_cost | number \| null | teslimat maliyeti (kargo gerçek / rota birim); kapanışta sabitlenir |
| payment_fee | number \| null | ödeme komisyonu (Stripe/SumUp); kapanışta sabitlenir |
| packaging_cost | number \| null | paketleme (soğuk zincir) maliyeti; kapanışta sabitlenir |
| created_at | timestamptz | |

### OrderItem (sipariş kalemi)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| order_id | uuid | |
| variant_id | uuid | sipariş edilen varyant |
| qty | number | sipariş edilen |
| fulfilled_qty | number | gerçekten karşılanan (varsayılan = qty; eksikte düşer, 0 olabilir) |
| stock_id | uuid \| null | partiye bağlı teklif satırıysa hangi parti (batch-pinned); normal satırda null. Fiilen çıkan parti(ler) `OrderItemBatch`'te |
| bundle_id | uuid \| null | bu kalem bir paketten geldiyse hangi paket; normal satırda null |
| unit_price | number | **sabitlenmiş** fiyat (sepete eklenince) |
| line_discount_amount | number | sepet/kupon indiriminin bu kaleme **oransal payı** (varsayılan 0) — kısmi iade ve kalem KDV'si indirimli birimden hesaplanır (bkz. `DOMAIN.md §5`) |
| vat_rate | number | o anki oran |

### OrderItemBatch (kalem–parti eşlemesi)

Hazırlıkta fiilen çıkan parti(ler)in kaydı — depocu FEFO önerisini onaylarken otomatik yazılır (bkz. `DOMAIN.md §4`). Geri çağırma ("bu parti kimlere gitti") ve gerçek COGS (`Order.cogs_amount`) buradan türetilir.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| order_item_id | uuid | |
| stock_id | uuid | çıkan parti |
| qty | number | bu partiden çıkan adet (kalem birden çok partiden karşılanabilir) |

Σ qty = kalemin `fulfilled_qty`'si. `cogs_amount` = Σ (qty × partinin `purchase_price`) — kapanışta sabitlenir.

### OrderStatusLog (durum geçiş kaydı)

"Her geçiş kaydedilir" kuralının varlığı (bkz. `ORDER_LIFECYCLE.md`). Teslim anı, kapanış anı ve geri bildirim zamanlaması (~10 gün) buradan türetilir.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| order_id | uuid | |
| from_status / to_status | enum | |
| actor_id | uuid \| null | kim (sistem olayında null) |
| created_at | timestamptz | |

### Cart (sunucu sepeti)

Giriş yapmış müşterinin sepeti sunucuda kalıcıdır — cihaz değişse de durur; sepet kurtarma e-postasının (Faz 2 otomasyonu) zeminidir.

| Alan | Tip | Not |
| --- | --- | --- |
| customer_id | uuid | tek satır / müşteri |
| items | jsonb | varyant + adet + eklenme fiyatı |
| updated_at | timestamptz | |

### Bundle (paket)

Birden çok ürünü tek fiyata sunan katalog kısayolu; sepete eklenince tek tek `OrderItem`'lara açılır (bkz. `DOMAIN.md §13`). Yeni ürün yaratmaz.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| name | LocalizedText (jsonb) | çok dilli |
| description | LocalizedText (jsonb) | çok dilli |
| image_key | string \| null | |
| slug | string | sosyal paylaşım / direkt seçim bağlantısı |
| total_price | number | müşterinin gördüğü paket fiyatı (= atanmış fiyatların toplamı) |
| is_active | boolean | |
| sort_order | int | |

### BundleItem (paket kalemi)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| bundle_id | uuid | |
| variant_id | uuid | pakete dahil satılabilir birim |
| qty | number | |
| allocated_unit_price | number | bu kaleme atanmış birim fiyat (müşteri görmez); Σ(allocated×qty)=`Bundle.total_price`; **hediye = 0** |

### CourierDayClose (kurye gün kapanışı)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| courier_id | uuid | |
| date | date | |
| delivered_orders | uuid[] / ilişki | |
| collected_cash | number | |
| collected_card | number | |
| collected_cheque | number | |
| returns | ilişki | |
| reconciled | boolean | fark var/yok |

### Conversation (konuşma) — WhatsApp/mesajlaşma

Konuşma durumu kendi DB'mizde yaşar (karar: kendi DB — bkz. `CHANNELS.md §7`). Alanlar Faz 1'de tanımlı, otomasyon Faz 2'de doldurur.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| customer_id | uuid \| null | telefonla çözülür; taslakta boş olabilir |
| source | enum(`whatsapp`) | ileride başka mesajlaşma kaynağı eklenebilir |
| external_ref | string | sağlayıcıdaki kişi/thread anahtarı (WhatsApp: telefon) |
| opt_in | boolean | ticari mesaj izni (double opt-in, `DOMAIN.md §11`) |
| opt_in_at | timestamptz \| null | |
| window_expires_at | timestamptz \| null | 24s servis penceresi bitişi (ücretsiz/template kararı) |
| last_message_at | timestamptz \| null | |
| created_at | timestamptz | |

### Message (mesaj)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| conversation_id | uuid | |
| direction | enum(`inbound`,`outbound`) | müşteri→biz / biz→müşteri |
| kind | enum(`text`,`interactive`,`template`,`media`) | |
| body | jsonb | metin veya kart/interaktif yapı |
| template_name | string \| null | outbound template ise (Meta-onaylı) |
| provider_message_id | string \| null | 360dialog/Cloud API mesaj id'si |
| created_at | timestamptz | |

### Account (hesap)

Paranın durduğu yer. Kasa (nakit), bankalar (Revolut, Crédit Mutuel), Stripe — hepsi birer hesap. "Online havuz" ayrı değil = Stripe hesabı.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| name | string | Kasa / Revolut / Crédit Mutuel / Stripe |
| type | enum(`cash`,`bank`,`provider`) | nakit / banka / ödeme sağlayıcı |
| currency | enum(`EUR`) | |
| is_active | boolean | |

### MoneyMovement (para hareketi)

Tüm para hareketleri **tek tablo**; kasa/banka ayrımı yok — hareketin **hesabı** (yer) ve **tipi** var.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| account_id | uuid | hangi hesap |
| direction | enum(`in`,`out`) | giriş / çıkış |
| amount | number | |
| type | enum(`order_payment`,`order_refund`,`purchase`,`expense`,`transfer`,`capital`,`misc`) | hareketin sebebi |
| category | string \| null | gider/gelir alt kategorisi (kira, akaryakıt, maaş, `advertising`…) |
| meta | jsonb \| null | ek etiket — reklam giderinde `{campaign}`: kampanya gider↔ciro (gerçek ROI) raporu |
| counter_account_id | uuid \| null | transferde karşı hesap (nakit→banka, Stripe→banka) |
| order_id | uuid \| null | sipariş ödemesiyse |
| stock_intake_id | uuid \| null | stok alımıysa |
| supplier_id | uuid \| null | tedarikçiye ödemeyse — tedarikçi borcu türetimi (bkz. `Supplier`) |
| value_date | date | |
| description | string \| null | |
| source | enum(`manual`,`bank_import`) | elle mi, banka import'undan mı |
| reconciled | boolean | |

### Supplier (tedarikçi)

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

### SupplierProduct (ürün–tedarikçi eşlemesi)

Tedarik siparişi **tedarikçinin diliyle** yazılabilsin diye: bizim varyantımız ↔ onların kodu. Bir varyantın birden çok tedarikçisi olabilir (alternatif kaynak).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| supplier_id | uuid | |
| variant_id | uuid | |
| supplier_code | string | tedarikçinin ürün/sipariş kodu |
| name_at_supplier | string \| null | üründeki adı (farklıysa) |
| pack_qty | number \| null | koli içi adet (sipariş koliyle verilirse çeviri) |
| last_purchase_price | number \| null | son alış (girişte otomatik güncellenir) — "geçen sefer kaçtı" |
| is_preferred | boolean | varsayılan tedarikçi işareti |

### PurchaseOrder (tedarik siparişi)

Taslak → gönderildi → mal kabulde kapanır (bkz. `DOMAIN.md §16`). Sistem **göndermez** — temiz liste/PDF üretir, gönderim insana aittir.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| supplier_id | uuid | |
| status | enum(`draft`,`sent`,`received`,`cancelled`) | |
| sent_at | timestamptz \| null | |
| note | string \| null | |
| created_at | timestamptz | |

### PurchaseOrderItem (tedarik siparişi kalemi)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| purchase_order_id | uuid | |
| variant_id | uuid | |
| supplier_product_id | uuid \| null | kod eşlemesi (liste tedarikçi koduyla yazılır) |
| qty | number | paket adedi |
| unit_price | number \| null | beklenen alış (varsa) |

### StockIntake (stok girişi / satın alma)

Mal alımının envanter tarafı; oluşturduğu partiler buna bağlanır (`Stock.intake_id`), ödemesi bir `MoneyMovement`(out, purchase).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| supplier_id | uuid \| null | tedarikçi (bkz. `Supplier`) — lot izlenebilirliğinin "bir adım geri" halkası |
| purchase_order_id | uuid \| null | bağlı tedarik siparişi — mal kabul formu PO kalemleriyle önceden dolu gelir; kabulle PO `received` olur |
| date | date | |
| total_amount | number | |
| note | string \| null | |

### BankImportProfile (banka import şablonu)

AI ajanının banka dosyasından çıkardığı sütun eşlemesi; hesaba özel, sonraki importlar bununla otomatik.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| account_id | uuid | hangi hesap/banka |
| column_mapping | jsonb | AI eşlemesi (tarih/tutar/açıklama/yön) |
| note | string \| null | |

### WebhookEvent (dış olay kaydı)

Stripe/360dialog webhook'ları için tekrar-işleme kilidi (idempotency): aynı olay ikinci kez gelirse no-op (bkz. `STACK.md §13`).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| provider | string | stripe / 360dialog |
| provider_event_id | string | **unique** (provider ile birlikte) |
| processed_at | timestamptz \| null | |
| payload | jsonb \| null | ham gövde (hata ayıklama) |

### AnalyticsEvent (analitik olayı)

Cookie'siz, sunucu-tarafı, toplu ölçüm (bkz. `FEATURES.md` Analitik). Kişisel kimlik yok; giriş yapılmışsa `customer_id` opsiyonel.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| type | enum(`page_view`,`product_view`,`add_to_cart`,`checkout_start`,`order_placed`,`product_swipe`,`share`,`search`) | |
| session_key | string | sunucu-tarafı geçici oturum (kişisel değil) |
| source | string \| null | trafik kaynağı |
| utm | jsonb \| null | kampanya (source/medium/campaign) — reklam ROI |
| path | string \| null | |
| product_id | uuid \| null | |
| variant_id | uuid \| null | |
| customer_id | uuid \| null | yalnız giriş yaptıysa (opsiyonel) |
| device | enum(`web`,`mobile`) | |
| country | enum(`FR`,`DE`) \| null | |
| language | enum(`tr`,`fr`,`de`) \| null | |
| meta | jsonb \| null | tipe özel (ör. `product_swipe`: `{context, direction, order_id?, dwell_ms}`); `dwell_ms`+desen sinyal kalitesi/ağırlık için; `search`: `{query, result_count}` — sıfır-sonuç aramalar talep/çeşit sinyali |
| created_at | timestamptz | |

### Review (ürün yorumu)

Yalnız satın alan müşteri; moderasyondan sonra ürün sayfasında görünür (bkz. `DOMAIN.md §14`).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| product_id | uuid | yorum ürün düzeyinde |
| customer_id | uuid | |
| order_id | uuid \| null | doğrulanmış alışveriş |
| rating | int \| null | 1–5 |
| comment | text \| null | |
| is_approved | boolean | moderasyon (görünmeden önce) |
| created_at | timestamptz | |

### FeedbackRequest (geri bildirim daveti)

Teslim sonrası (~10 gün) swipe/yorum daveti; tamamlayınca ödül kuponu (bkz. `DOMAIN.md §14`).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| order_id | uuid | |
| customer_id | uuid | |
| channel | enum(`email`,`whatsapp`) | davetin gittiği kanal |
| sent_at | timestamptz \| null | |
| completed_at | timestamptz \| null | |
| points_awarded | int \| null | tamamlayınca verilen puan (`PointsEntry`); puanlar sonra kişisel kupona çevrilir |

### PointsEntry (puan hareketi)

Oyunlaştırma/sadakat: müşteri aksiyonları puan kazandırır, biriken puan kişisel kupona çevrilir. Ledger; bakiye **türetilir** (Σ points).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| customer_id | uuid | |
| points | int | +kazanım / −harcama (delta) |
| reason | enum(`review`,`swipe_candidate`,`swipe_post_purchase`,`order`,`redemption`,`manual`) | |
| ref_id | uuid \| null | ilgili kayıt (review/order/discount…) |
| created_at | timestamptz | |

Puan bakiyesi = Σ `points` (saklanmaz, türetilir). Kupona çevirme: `redemption` (negatif) + kişisel `Discount` (`customer_id`).

### Ticket (müşteri talebi / şikâyet)

Basit yaşam döngüsü; siparişe ve ürünlere isteğe bağlı bağlanır (bkz. `DOMAIN.md §15`).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| customer_id | uuid | |
| order_id | uuid \| null | siparişle ilgiliyse |
| order_item_ids | uuid[] | ilgili sipariş kalemleri (boş olabilir) |
| conversation_id | uuid \| null | WhatsApp'tan açıldıysa |
| type | enum(`damaged`,`missing`,`question`,`other`) | bozuk / eksik / soru / diğer |
| status | enum(`open`,`in_progress`,`resolved`) | yeniden açılabilir → `open` |
| subject | text \| null | kısa başlık |
| created_at / resolved_at | timestamptz | |

### TicketMessage (talep yazışması)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| ticket_id | uuid | |
| sender | enum(`customer`,`admin`) | |
| body | text | |
| attachments | text[] | storage yolu (fotoğraf vb.) |
| created_at | timestamptz | |

### Setting (işletme ayarı)

Parametrik değerler (minimum sepet, ücretsiz kargo eşiği, **yaklaşan son tarih eşiği — kalan %, varsayılan %25**, **önerilen near-expiry indirim — varsayılan %30**, **MLOR kabul eşiği — kalan %, varsayılan %75**, KDV varsayılanları, **checkout rezervasyon TTL — varsayılan 30 dk (Stripe oturum asgarisi; ödeme penceresiyle eşit)**, **kapıda ödeme tavanı — yöntem bazında: nakit varsayılanı yasal sınır ~1.000€, uyarı verir engellemez; genel kötüye-kullanım tavanı ayrı**, **sipariş kesim saati (cut-off)**, **teslim onayı kapsamı — B2B zorunlu / B2C kapalı varsayılanı**, **teslimat özeti otomatik e-posta — varsayılan açık**, **vade süresi varsayılanı — 30 gün**, **oyunlaştırma: aksiyon puan değerleri + puan→kupon eşiği/oranı**, **kâr hesabı için: rota teslimat birim maliyeti, paketleme birim maliyeti, ödeme komisyon oranları**). Yapı **kapsamlıdır (scoped)**: `key + scope_type(global/channel/zone/country) + scope_id + value` — minimum sepet gibi değerler kanala/bölgeye/ülkeye göre farklılaşabilir; çözücü en özgül kapsamı seçer, yoksa global'e düşer. Önbellekli çözücü (blueprint STACK §10). Env'e veya koda gömülmez.

---

## Enum'lar (özet)

- `channel`: b2b, b2c
- `order_source`: web, whatsapp, door, manual
- `order_status`: draft, confirmed, preparing, ready, out_for_delivery, delivered, completed, cancelled, returned
- `payment_status`: pending, paid, partial, refunded
- `payment_method`: online, cash, card, cheque, bank_transfer
- `delivery_type`: route, shipping
- `customer_type`: individual, company
- `date_type`: DLC, DDM
- `allergen` (AB 14): gluten, kabuklu, yumurta, balık, yer_fıstığı, soya, süt, sert_kabuklu, kereviz, hardal, susam, sülfit, acı_bakla, yumuşakça
- `vat_treatment`: domestic, intra_eu_b2b_reverse_charge
- `discount_trigger`: coupon, automatic
- `discount_type`: percent, fixed
- `discount_scope`: cart, category, collection
- `language`: tr, fr, de
- `country`: FR, DE
- `message_direction`: inbound, outbound
- `message_kind`: text, interactive, template, media
- `account_type`: cash, bank, provider
- `movement_direction`: in, out
- `movement_type`: order_payment, order_refund, purchase, expense, transfer, capital, misc
- `movement_source`: manual, bank_import
- `analytics_event_type`: page_view, product_view, add_to_cart, checkout_start, order_placed, product_swipe, share, search
- `feedback_channel`: email, whatsapp
- `points_reason`: review, swipe_candidate, swipe_post_purchase, order, redemption, manual
- `ticket_type`: damaged, missing, question, other
- `ticket_status`: open, in_progress, resolved
- `ticket_sender`: customer, admin
- `adjustment_reason`: expired, damaged, count_diff, lost
- `po_status`: draft, sent, received, cancelled

---

## Kalıcı kararlar (veri modeli)

**Türetme ilkesi (genel):** Bir durum, bir veya birkaç değerden **tam ve tek-anlamlı** biçimde belirlenebiliyorsa **saklanmaz, türetilir** — WORKFLOW §9 "tek kaynak" ilkesinin genelleştirilmiş hâli. Örnekler: kullanılabilir stok (fiili − ayrılmış), ödeme durumu (tahsil − iade vs karşılanan tutar).

- **Kanal alanı siparişe yazılır ve değişmez** — sonradan raporlama ve audit için.
- **Sipariş kaynağı (`order_source`) kanaldan bağımsız ayrı eksendir** — Faz 1'de bile var; WhatsApp siparişi elle girilse de kaynak=whatsapp. Yüzey otomasyona dönünce veri modeli değişmez (bkz. `CHANNELS.md §2`).
- **Telefon müşteri kimliğidir** — WhatsApp telefonla tanır; "telefonla bul-veya-oluştur" domain kuralı (bkz. `CHANNELS.md §3`).
- **Konuşma/mesaj kendi DB'mizde yaşar** — opt-in ve 24s pencere bizde; sağlayıcı değişse de tarih bizde kalır.
- **Kullanılabilir stok saklanmaz**, türetilir.
- **Para tek kaynak = `MoneyMovement`** — `Order.amount_collected`/`amount_refunded` bu hareketlerden türer (siparişe bağlı giriş/iade toplamı), Order üzerindeki `amount_*` kopyaları **performans cache'idir**, kaynak daima hareketlerdir (bkz. `DOMAIN.md §9`).
- **Ödeme durumu türetilir** — net (tahsil − iade) ile karşılanan tutar (`fulfilled_qty × (unit_price − birim indirim payı)`) karşılaştırılır; `payment_status` domain-core'da hesaplanır, elle set edilmez.
- **`total` sipariş edilen; karşılanan tutar `fulfilled_qty`'den türetilir** — fark iade (prepaid) veya kapıda düşülen tutardır.
- **Near-expiry indirim partiye bağlıdır** — `Stock.offer_price` + miktar tavanı o partinin stoğu; teklif satırı batch-pinned (`OrderItem.stock_id`). Normal satış ürün-toplamı seviyesinde kalır.
- **Satılabilir birim = varyant** — fiyat/stok/teklif varyanta bağlı; ürün paylaşılan bilgiyi (ad/açıklama/görsel/DLC/KDV) tutar. Varyantsız ürün tek varsayılan varyant taşır. Satış birimi sabit paket (adet).
- **Kategori tek + koleksiyon çoklu** — kategori yapısal (ürün nedir), koleksiyon esnek pazarlama grubu (Bayram/Yeni/İndirimde).
- **Paket sipariş anında `OrderItem`'lara açılır** — yeni ürün değil; atanmış kalem fiyatlarının toplamı = paket fiyatı; hediye = 0 fiyatlı kalem. Stok/kâr/fatura kalem kalem işler (bkz. `DOMAIN.md §13`).
- **Fiyat çözüm sırası:** müşteriye özel ürün fiyatı → müşteri indirim oranı → kanal fiyatı; giren müşteriye göre çözülür (bkz. `DOMAIN.md §5`).
- **Ürün kârı doğrudan giderlerden, sipariş kapanışında sabitlenir** (COGS/teslimat/komisyon/paketleme snapshot); şirket kârı ayrı, genel giderle (bkz. `DOMAIN.md §12`).
- **unit_price sipariş kalemine kopyalanır** — fiyat sabitleme; ana fiyat değişse de sipariş etkilenmez.
- **reference_no ≠ invoice_no** — resmî fatura numarası dış sistemde üretilir. reference_no **rastgele** (hacim sızdırmaz), ilk kalıcı duruma geçişte üretilir (`confirmed`, hızlı satışta `completed`).
