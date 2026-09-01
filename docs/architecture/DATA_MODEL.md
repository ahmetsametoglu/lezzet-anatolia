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

Varlık tabloları konu dosyalarına ayrıldı — 700 satırlık tek dosya, paralel çalışmada aynı anda iki kişiye/ajana açılamıyordu. Ortak ilkeler ve kalıcı kararlar bu dosyada kalır.

- [`data-model/katalog.md`](data-model/katalog.md) — **Katalog:** `Category`, `Collection`, `Product`, `ProductImage`, `ProductVariant`, `Price`, `Discount`, `Bundle`, `BundleItem`
- [`data-model/stok-tedarik.md`](data-model/stok-tedarik.md) — **Stok ve Tedarik:** `Stock`, `Reservation`, `StockAdjustment`, `TemperatureLog`, `Supplier`, `SupplierProduct`, `PurchaseOrder`, `PurchaseOrderItem`, `StockIntake`
- [`data-model/musteri-siparis.md`](data-model/musteri-siparis.md) — **Müşteri ve Sipariş:** `Customer`, `Address`, `DeliveryZone`, `Order`, `OrderItem`, `OrderItemBatch`, `OrderStatusLog`, `OrderBox(+Item)`, `Cart`, `DeliveryRun`, `DeliveryRunClose`
- [`data-model/para.md`](data-model/para.md) — **Para ve Ön Muhasebe:** `Account`, `MoneyMovement`, `BankImportProfile`
- [`data-model/iletisim-geribildirim.md`](data-model/iletisim-geribildirim.md) — **İletişim, Geri Bildirim ve Analitik:** `Conversation`, `Message`, `WebhookEvent`, `AnalyticsEvent`, `ProductFeedback`, `FeedbackRequest`, `PointsEntry`, `Ticket`, `TicketMessage`, `Setting`
- [`data-model/operasyon.md`](data-model/operasyon.md) — **Operasyon ve Gözlemleme:** `JobRun`, `ErrorLog`, `SystemHealthSnapshot` — sistemin kendi hakkındaki verisi; iş kaydı DEĞİL, saklama süresi var (bkz. [`OBSERVABILITY.md`](OBSERVABILITY.md))
- [`data-model/asistan.md`](data-model/asistan.md) — **MCP Asistanı:** `AssistantProposal`, `McpConnectionKey`, `McpCallLog` — onay kuyruğu (asistanın TEK yazma kapısı) + kapının kimliği ve izi (bkz. [`AI_ADMIN_ASSISTANT.md`](AI_ADMIN_ASSISTANT.md))

Junction/ara tablolar ilgili dosyada anlatılır (ör. `product_collections` → katalog).

> **BÖLÜMÜ OLMAYAN TABLOLAR — ölçüldü ve gerekçelendirildi (02.4 · 26.08).** 84 tablonun **78'i**
> kendi bölümüne ve türetilmiş alan listesine sahip. Kalan altı tablonun bölümü YOK ve bu bilinçli:
> - **Ara tablo** (`product_collections` · `discount_use` · `email_verifications`) — kendi başına
>   bir varlık değil, iki varlığı bağlayan satır; kararı bağladığı varlığın metninde yaşıyor.
> - **Analitik ÖZETİ** (`analytics_daily` + `_product`/`_search`/`_source`) — ham olay değil,
>   ondan türetilmiş gün toplamı. Kararları `ANALYTICS.md`'de; alan listesi burada tekrarlanırsa
>   aynı şey iki yerden anlatılmış olur.
> - ~~**Başka şeridin alanı** (`assistant_proposal` · `mcp_call_log` · `mcp_connection_key`)~~
>   **YAZILDI 26.08** → [`data-model/asistan.md`](data-model/asistan.md). MCP şeridine bırakılan
>   not (`docs/talep/not-mcp-veri-modeli-bolumu-bekliyor.md`) işlendi ve silindi; notun bildirdiği
>   iki denetim açığı (`mcp_scope` enum satırı · `migrations/index.md`) `0051`in kendi commit'inde
>   zaten kapanmıştı.
>
> Ölçüt şu: **bir tablo, bağladığı varlıktan bağımsız bir KARAR taşıyorsa bölümü olur.** Taşımıyorsa
> bölüm açmak, okuyana yeni bir şey söylemeden doküman büyütmektir.

## Enum'lar

> **Bu liste MİGRATION'LARDAN ölçülür ve `pnpm docs:check` onu doğrular** (26.08). Elle tutulan
> hâli bir ay içinde çürümüştü: altı ad veritabanında hiç yoktu (yeniden adlandırılmışlardı) ve
> otuz bir enum listede hiç görünmüyordu; birkaçında değerler de ayrışmıştı. Bir listeyi doğru
> tutmanın tek yolu onu denetlemektir — "özet" demek, eksikliğe izin vermek değil.
> **Değerler de denetleniyor, yalnız adlar değil** — ilk yazımda ad karşılaştırması yeterli
> sanılmıştı (*"değer eklemek sık ve zararsız"*); aynı gün altı enum'un DEĞERİ eksik yazıldığı
> hâlde denetim sessiz kaldı ve hatayı bir insan sorusu buldu. Ölçen betiğin kendisi yanılmıştı:
> enum gövdesini ilk `)`e kadar okuyordu, oysa `points_reason`ın yorumlarında parantez vardı ve
> liste orada kesiliyordu — dokuz değerden ikisi yazıldı, biri (`purchase`) zaten bir YORUMUN
> içinden gelmişti. **Kesilmiş bir liste, eksik listeden tehlikelidir:** okuyan onu tam sanar.
> **Yalnız veritabanı enum'ları burada.** Kodda yaşayan ama tabloya inmeyen kümeler (`CatalogSort`,
> `StockStatus`, `CartLineRoute`, `CouponRejection`) `packages/types/src/primitives/enums.schema.ts`ta
> durur ve buraya girmez: bu bölüm VERİ modelini anlatıyor.

- `account_type`: cash, bank, provider
- `address_geo_precision`: housenumber, street, locality, municipality *(adres koordinatı hangi hassasiyette çözüldü)*
- `address_geo_source`: ban, manual *(koordinat BAN'dan mı geldi, elle mi girildi)*
- `analytics_availability`: sellable, sold_out, closed, not_here *(ölçüm anında ürün alınabilir miydi)*
- `analytics_blocked_reason`: min_basket, split, place_change, coupon_invalid, out_of_stock, payment_failed, not_shippable, date_unavailable *(sepet/checkout neden kapandı)*
- `analytics_device`: mobile, desktop
- `analytics_event_type`: page_view, product_view, search, place_resolved, add_to_cart, cart_blocked, checkout_start, checkout_blocked, order_placed, share
- `analytics_subject_type`: product, variant, bundle, category, collection, recipe
- `analytics_surface`: web, native
- `analytics_zero_result_kind`: search, filter *(sonuçsuz kalan neydi)*
- `assistant_proposal_kind`: bundle_draft, featured_flag, discount_draft, purchase_order, stock_intake, money_movement, zone_extend, product_draft, recipe_draft, batch_offer, product_create *(asistan kuyruğundaki öneri tipi)*
- `assistant_proposal_status`: pending, applied, rejected, expired, failed
- `barcode_kind`: unit, case *(tekil ürün mü koli mi)*
- `carrier`: colissimo, chronopost, dhl, ups, other
- `channel`: b2b, b2c
- `conversation_source`: whatsapp, messenger, instagram
- `country_code`: FR, DE *(faaliyet ülkeleri)*
- `currency`: EUR
- `customer_type`: individual, company
- `delivery_type`: route, shipping, pickup *(`pickup` = yerinde satış; mal gitmez, müşteri alır)*
- `discount_scope`: cart, category, collection
- `discount_trigger`: coupon, automatic
- `discount_type`: percent, fixed
- `error_log_level`: warning, error, fatal
- `feedback_channel`: email, whatsapp
- `feedback_context`: purchase, candidate
- `feedback_vote`: like, dislike
- `health_status`: ok, warn, crit
- `mcp_scope`: read, propose *(MCP anahtarının araç ailesi — `propose` `read`i kapsar)*
- `message_direction`: inbound, outbound
- `message_kind`: text, interactive, template, media
- `movement_direction`: in, out
- `movement_source`: manual, bank_import
- `movement_type`: order_payment, order_refund, purchase, expense, transfer, capital, misc
- `order_cancel_reason`: payment_failed, superseded, out_of_stock, customer, staff
- `order_source`: web, whatsapp, door, manual
- `order_status`: draft, confirmed, preparing, ready, out_for_delivery, delivered, completed, cancelled, returned
- `payment_method`: online, cash, card, cheque, bank_transfer
- `payment_status`: pending, paid, partial, refunded
- `points_reason`: review, feedback_purchase, feedback_candidate, order, referral, neighbor, visit, redemption, manual
- `portion_kind`: item, slice *(satış birimi — bütün mü dilim mi)*
- `preferred_language`: tr, fr, de
- `product_allergen`: gluten, kabuklu, yumurta, balik, yer_fistigi, soya, sut, sert_kabuklu, kereviz, hardal, susam, sulfit, aci_bakla, yumusaka *(AB 14 listesi; değerler ASCII (`balik`, `sut`) — veri anahtarıdır, ekran metni değil)*
- `product_date_type`: DLC, DDM
- `product_status`: active, passive, candidate
- `product_storage_type`: ambient, chilled, frozen
- `purchase_order_status`: draft, sent, partially_received, received, cancelled
- `return_disposition`: restock, discard, goodwill
- `review_status`: pending, approved, rejected
- `setting_scope`: global, channel, zone, country, warehouse *(ayarın hangi eksende istisna aldığı)*
- `shipment_status`: created, handed_over, in_transit, out_for_delivery, delivered, returned, cancelled, error *(taşıyıcıdaki gönderi; bizim sipariş durumumuzdan AYRI — biri kolinin nerede olduğunu, öteki siparişin hangi aşamada olduğunu söyler)*
- `site_image_slot`: home_hero, packages_hero, professionals_hero, empty_cart
- `stock_direction`: in, out
- `stock_movement_kind`: intake, transfer_in, transfer_out, transfer_cancel, sale, counter_sale, return_restock, write_off, count_diff
- `stock_write_off_reason`: expired, damaged, lost
- `storage_area_kind`: frozen, chilled, ambient, staging *(depo içi bölge türü)*
- `template_category`: marketing, utility, authentication
- `ticket_handler`: human, hybrid, ai
- `ticket_sender`: customer, admin, ai
- `ticket_source`: order, form, whatsapp, admin
- `ticket_status`: open, in_progress, resolved
- `ticket_type`: damaged, missing, question, other
- `transfer_status`: in_transit, received, cancelled *(depolar arası sevk)*
- `user_role`: customer, admin, warehouse, courier, accounting, system *(`system` = kişi değil, sistemin kendi kaydı)*
- `vat_treatment`: domestic, intra_eu_b2b_reverse_charge *(`intra_eu_b2b_reverse_charge` = autoliquidation)*
- `warehouse_kind`: facility, vehicle *(araç da bir depodur)*

---

## Kalıcı kararlar (veri modeli)

**Türetme ilkesi (genel):** Bir durum, bir veya birkaç değerden **tam ve tek-anlamlı** biçimde belirlenebiliyorsa **saklanmaz, türetilir** — WORKFLOW §9 "tek kaynak" ilkesinin genelleştirilmiş hâli. Örnekler: kullanılabilir stok (fiili − ayrılmış), ödeme durumu (tahsil − iade vs karşılanan tutar).

**Biriktirme eşiği — türet / önbellekle / sabitle (kullanıcı kararı 19.08).** Türetme varsayılandır;
ondan sapmanın iki meşru yolu ve tek bir sırası vardır. Yeni her tablo/ekran tasarımında üç soru
SIRAYLA sorulur:

1. **Donmuş bir an mı?** (sipariş anındaki fiyat, kapanışta beklenen tutar, seferin kuryesi) →
   **sabitlenir**: kayıt tarihî gerçektir; türetim hep "bugünü" söyler, "o günü" ancak kayıt saklar.
   Emsaller: `OrderItem.unit_price` kopyası, kâr snapshot'ı, `delivery_run`(+`_close`).
2. **Canlı ama çok okunan mı?** → önce **görünüm** (view — driftsiz ve bedava; `0027`nin ürün skoru
   emsali: cache kolonu *"tazelenmeyi unutan tek yol sessiz yalan üretir"* diye reddedildi, view
   seçildi). Ancak **ölçülmüş** yavaşlıkta materialized view'a ya da cache kolonuna terfi eder —
   `Order.amount_*` emsali: kolon performans cache'idir, kaynak daima `MoneyMovement`.
3. **Sayaç/özet kolonu mu isteniyor?** → yalnız yazımı **tek kapıdan** geçiyorsa (RPC ya da tetik —
   `start_delivery_run`ın `courier_id` senkronu emsali; "uygulama iki yeri de günceller" deseni
   yasak) ve buraya gerekçesiyle karar yazılarak.

İki bekçi kuralı: *(a)* "sorgu maliyeti düşer" gerekçesi **ölçüm ister** — yerel veri sahtedir ve
ondan istatistik çıkarılmaz; bugünden geçerli olan gerekçe yapısal kazançtır (JOIN zorlaması → tek
kolon, okunabilirlik, AI-asistan araçlarına ucuz özet). *(b)* **Erken agregasyon granülerliği
öldürür:** ham kayıt dururken özet her zaman yeniden üretilebilir, tersi imkânsız — dönemsel özet
tabloları (günlük KPI vb.) analitik modülüyle birlikte, soruları netleşince açılır.

- **Kanal alanı siparişe yazılır ve değişmez** — sonradan raporlama ve audit için.
- **Sipariş kaynağı (`order_source`) kanaldan bağımsız ayrı eksendir** — Faz 1'de bile var; WhatsApp siparişi elle girilse de kaynak=whatsapp. Yüzey otomasyona dönünce veri modeli değişmez (bkz. `CHANNELS.md §2`).
- **Telefon müşteri kimliğidir** — WhatsApp telefonla tanır; "telefonla bul-veya-oluştur" domain kuralı (bkz. `CHANNELS.md §3`).
- **Konuşma/mesaj kendi DB'mizde yaşar** — opt-in ve 24s pencere bizde; sağlayıcı değişse de tarih bizde kalır.
- **Kullanılabilir stok saklanmaz**, türetilir.
- **Para tek kaynak = `MoneyMovement`** — `Order.amount_collected`/`amount_refunded` bu hareketlerden türer (siparişe bağlı giriş/iade toplamı), Order üzerindeki `amount_*` kopyaları **performans cache'idir**, kaynak daima hareketlerdir (bkz. `DOMAIN.md §9`).
- **Ödeme durumu türetilir** — net (tahsil − iade) ile karşılanan tutar (`fulfilled_qty × (unit_price − birim indirim payı)`) karşılaştırılır; `payment_status` domain-core'da hesaplanır, elle set edilmez.
- **Siparişin İKİ tutarı vardır ve ikisi ayrı soruya cevap verir** (01.09): `ordered_total` sipariş anında anlaşılandır (donuk — ödeme niyeti · vade limiti · onay maili · anlaşmazlık), `revenue_total` gerçekleşen cirodur (kalemlerden tetikleyiciyle — kâr · analitik · fatura). Tek bir `total` vardı ve adı taşıdığı anlamdan genişti: yedi ayrı okuyucu onu "bu siparişin borcu" diye okudu ve eksik giden malın parasını da istedi. **"Ne tahsil edilecek" sorusunun cevabı ikisi de değildir** — o `derivePaymentStatus`tan çıkar (hazırlık kesinleşmeden `ordered_total`a düşer).
- **Near-expiry indirim partiye bağlıdır** — `Stock.offer_price` + miktar tavanı o partinin stoğu; teklif satırı batch-pinned (`OrderItem.stock_id`). Normal satış ürün-toplamı seviyesinde kalır.
- **Satılabilir birim = varyant** — fiyat/stok/teklif varyanta bağlı; ürün paylaşılan bilgiyi (ad/açıklama/görsel/DLC/KDV) tutar. Varyantsız ürün tek varsayılan varyant taşır. Satış birimi sabit paket (adet).
- **Müşteriye görünen her metin çok dillidir** — varyant etiketi dahil (`ProductVariant.label` LocalizedText). Yalnız iç alanlar (`sku`, `lot_number`, `Discount.name`) düz metindir. Ölçüt: müşteri yüzeyinde görünüyorsa `LocalizedText`.
- **Yasal beyan ürün seviyesindedir** (`ingredients`, `nutrition`, `allergens`, `traces`, `storage_instructions`) — varyantlar aynı reçeteyi paylaşır; besin değerleri 100 g başına verildiğinden her boy için geçerlidir. Farklı reçete = farklı ürün.
- **Çapraz bulaşma serbest metin değil, alerjen listesidir** (`traces`) — cümle üç dilde i18n şablonundan kurulur; işletme çevirmen aramaz, liste seçer.
- **Kapak görseli üründe, galeri ayrı tabloda** — `Product.image_key` kapak (liste/kart/OG tek sorguda), `ProductImage` yalnız ek görseller; kapak galeride tekrarlanmaz (tek kaynak korunur).
- **Hesaplanmayan alan tip taşımaz (07.08).** Hesaba girmeyen değer sayı değil yerelleştirilmiş metindir — `Recipe.duration` ("45 dk") ve `serves` ("3–4 kişilik": aralık, sayıya sığmaz) böyle doğdu; sayı yalnız hesaba giren alanda kalır (`recipe_item.qty`: toplam = Σ qty × fiyat). Sayı tutmak, hesabı olmayan bir alan için üç dile birim eki basan biçimlendirici yazdırır.
- **Tarif satış birimi değildir (07.08)** — `recipe_item` VARYANTA bağlanır, `product_id` tutulmaz (ürün varyanttan türer; ikisini tutmak bir gün ayrışan iki gerçek). Malzeme toplamı kolon değildir: fiyat personaya ve depoya bağlıdır, saklanan toplam ilk gün yalan söyler (bkz. `DOMAIN §13`).
- **Yayın kapısı DOLULUK arar, çeviri kaynağı aramaz (07.08)** — `recipe.is_active` ancak yedi yerelleştirilmiş alanın tr/fr/de'si doluysa açılır (`has_all_locales`, kısıt VERİDE; `{"fr": ""}` gibi boş metin de reddedilir). Kısıt "AI çevirdi mi" diye sorsaydı kota bittiği gün yayın dururdu. Varsayılan `is_active=false` — tercih değil zorunluluk: tek dille açılan taslak kısıtta patlamamalı.
- **Analitiğin TÜM kuralları `ANALYTICS.md`'dedir (04.08)** — sınır, kimlik, olay şekli, kapı kuralları, saklama ve özet mimarisi. Buraya kopyalanmaz: iki sözlük tutmak, biri güncellenip öteki unutulduğunda ikisini de güvenilmez kılar. Aşağıdaki iz/beyan kararı orada da geçerlidir ve orada genişletilmiştir (kimlik kolonu kararı dahil).
- **İZ ile BEYAN ayrı yaşar (29.07).** Müşteriyi tanımadan topladığımız gezinme verisi `AnalyticsEvent`'tedir ve anonimdir — "toplu ölçüm, çerez banner'ı gerekmez" iddiası buna dayanır. Müşterinin bize **vermeyi seçtiği** her şey (yorum, beğeni, talep, bölge haberi, izin) kendi kalıcı tablosundadır. Ölçüt: kayıt puan kazandırıyor mu, kişiye bağlanıyor mu, "bir kez" kuralı var mı, silme talebinde gitmeli mi — biri bile evetse o veri analitik değildir. Bu yüzden beğen/geç `AnalyticsEvent(product_swipe)`'tan çıkarılıp `ProductFeedback`'e alındı. Emsal: aynı soruya iki kayıt tutan `postal_code_demand` (anonim sayaç) ↔ `zone_notice` (kimlikli kişi) ikilisi.
- **Bir ürün hakkındaki her beyan tek tabloda** — yıldız, yazılı yorum ve beğen/geç `ProductFeedback`'te birleşir; ayrımları yalnız biçimdir (`rating`/`comment`/`vote`). Müşteri, ürün, tarih, puan, tekillik, skor katkısı ve silme yolu üçünde de aynı. `Discount`'ın kupon+kampanyayı tek varlıkta tutmasıyla aynı gerekçe.
- **Moderasyon metnin işidir** — metinsiz kayıt (yalnız yıldız ya da yalnız beğeni) kuyruğa düşmez, doğrudan yayına girer. Bir sayıyı "reddetmek" anlamsızdır; kuyruk okunacak bir cümle olduğunda vardır.
- **Ürün skoru türetilir, ama okuma tarafında önbelleklenir** — kaynak daima `Review` (ortalama + sayı); katalog kartı, ürün detayı ve "benzer ürünler" aynı anda puan gösterdiği için her listede agregasyon yapılmaz: onaylı yorum değişiminde tazelenen özet (materialized view ya da `product` üzerinde `rating_avg`/`rating_count` cache) kullanılır. Cache bozulursa kaynaktan yeniden üretilir — `MoneyMovement`/`Order.amount_*` ile aynı desen.
- **Kategori tek + koleksiyon çoklu** — kategori yapısal (ürün nedir), koleksiyon esnek pazarlama grubu (Bayram/Yeni/İndirimde).
- **Paket sipariş anında `OrderItem`'lara açılır** — yeni ürün değil; atanmış kalem fiyatlarının toplamı = paket fiyatı; hediye = 0 fiyatlı kalem. Stok/kâr/fatura kalem kalem işler (bkz. `DOMAIN.md §13`).
- **Fiyat çözüm sırası:** müşteriye özel ürün fiyatı → müşteri indirim oranı → kanal fiyatı; giren müşteriye göre çözülür (bkz. `DOMAIN.md §5`).
- **Ürün kârı doğrudan giderlerden, sipariş kapanışında sabitlenir** (COGS/teslimat/komisyon/paketleme snapshot); şirket kârı ayrı, genel giderle (bkz. `DOMAIN.md §12`).
- **unit_price sipariş kalemine kopyalanır** — fiyat sabitleme; ana fiyat değişse de sipariş etkilenmez.
- **Sipariş bir bütün olarak doğar (30.07).** Başlık + kalemler + (indirim inmişse) kullanım kaydı tek transaction'da yazılır (`create_order` RPC); yarısı yazılmış sipariş diye bir hâl yoktur. Öncesi üç ayrı ifadeydi ve yarım kalan yazım "telafi silmesi" ile geri alınıyordu — telafi bir garanti değildir (silme de düşebilir) ve arada bozuk hâl okunabilir durumdadır.
- **`discount_amount = Σ line_discount_amount` — değişmezi VERİTABANI zorlar (30.07).** Ertelenmiş kısıt tetikleyicisi (`order_discount_balance`) COMMIT anında denetler; ertelenmiş olması şart, çünkü başlık kalemlerden önce yazılır ve denge ifade ifade bakıldığında geçici olarak bozuktur. Kural yazım yolunda değil veride durduğu için ikinci bir yol (elle giriş, onarım betiği, doğrudan SQL) da bozuk sipariş yazamaz. Gerekçe yaşanmış bir para hatasıdır: başlığa 3 € indirim yazılıp kalem payları 0 kalınca, borcu kalemlerden toplayan ödeme motoru tamamı ödenmiş siparişi `partial` görüyor ve bildirim maili müşteriden kapıda 3 € daha istiyordu.
- **reference_no ≠ invoice_no** — resmî fatura numarası dış sistemde üretilir. reference_no **rastgele** (hacim sızdırmaz), ilk kalıcı duruma geçişte üretilir (`confirmed`, hızlı satışta `completed`).
- **İade talepte değil siparişte yaşar** — talep iadeyi **tetikler ve izler**, sonuçlandırmaz. `Ticket.return_triggered_at` yalnız tetiğin anını yazar; tutar ve durum siparişin iade hareketlerinden türetilir. İkinci bir iade kaydı, para ve stok gerçeğinin iki yerde birden yazıldığı bir sistem olurdu (bkz. `DOMAIN.md §8`, §15).
- **Kim yazdı sorusu her yazışmada cevaplı** — `TicketMessage.sender` müşteri/personel/AI ayrımını taşır (`ticket_sender`), personel mesajı ayrıca `author_id` ile kişiye bağlanır. AI'ın yazdığı metin müşteriye insanınkiyle aynı görünür; ayrım iç izlenebilirlik içindir ve sonradan eklenemez.
- **Moderasyon üç hâllidir** — `Review.status` (`pending`/`approved`/`rejected`); reddedilen yorum kuyruğa geri düşmez, yayınlanan geri çekilebilir. Yorum metni **düzenlenmez** — onay/ret vardır, yeniden yazım yoktur (bkz. `DOMAIN.md §14`).
- **Token'lı davet bağlantısı oturum yerine geçer** — `FeedbackRequest.token` rastgeledir; kişisel link telefonda tek elle açılır ve araya giriş ekranı konmaz. Sıralı üretilseydi bir davetten komşusunun siparişine geçilebilirdi (`reference_no` ile aynı gerekçe).
- **Puan defteri istismar tavanını kendi taşır** — "aynı ürüne bir kez" kısmi unique indeks (`customer_id, reason, ref_id`); uygulama unutsa da ikinci puan yazılamaz. Bakiye yine Σ ile türetilir, saklanmaz.
- **Depo ağı (01.08) — parti bir depoda durur:** `Stock.warehouse_id` zorunlu; `location` depo İÇİ raf olarak kalır (iki farklı çözünürlük, duplication değil). Kullanılabilir stok `(depo, varyant)` başına türetilir; depo-üstü toplam ayrı okuma görünümüdür — **birleştirilmiş stok kimsenin stoğu değildir**, müşteriye tek başına gösterilmez.
- **Rezervasyon depoyu AÇIKÇA taşır (01.08)** — türetme ilkesinin gerekçeli istisnası: normal rezervasyon parti seçmez (DOMAIN §4) ve `order` FK'sı yoktur; siparişten türetmek `available_stock` sıcak yoluna join eklerdi. Tutarlılık (rezervasyon deposu = sipariş deposu) ertelenmiş kısıtla korunur — `Order.amount_*` cache'iyle aynı emsal.
- **Sipariş tek depodan çıkar — değişmez VERİDE durur (01.08):** `Order.warehouse_id` zorunlu; siparişe yazılan partilerin deposu siparişinkiyle eşleşir (ertelenmiş kısıt — `order_discount_balance` emsali). Karma sepet en fazla iki sipariş üretir (rota + ayrı ödemeli kargo, DOMAIN §17); tek sipariş asla bölünmez.
- **Posta kodu tekilliği veridedir (01.08):** kod → tek bölge → tek depo; bağ tablosunda birincil anahtar **`(ülke, posta kodu)`** — kod uzayları ülkeler arası çakışır (`67000` FR+DE). Kapsam tüm bölgelerdir (pasif dahil); ülke bölgeye değil kod satırına yazılır (bölge sınır ötesi olabilir, ADR-002). "İlki kazanır" sessiz çözümü kalkar; çakışma kayıt anında reddedilir, motor belirsizlikte hata döner.
- **Transfer parti kimliğini korur (01.08):** hedef depoda tarih/lot/alış kopyalanmış YENİ parti doğar (birleştirme yok — `initial_qty` ve geri çağırma bozulurdu). Yoldaki mal sevkte kaynaktan düşer, kabulde hedefte doğar; sanal "transit depo" yoktur, "yolda ne var" transfer kaydından okunur. Transfer partisi `intake_id` taşımaz; tedarik fark raporu PO kalemi ↔ giriş partileri bağından (`Stock.purchase_order_item_id`) hesaplanır ve transferden etkilenmez.
- **PO durumu kabullerden türetilir (01.08):** tek PO'ya birden çok deponun kabulü bağlanır; ilerleme saklanan sayaç değil, kalem ↔ giriş (`initial_qty`) karşılaştırma görünümüdür — `physical_qty` satışla eridiği için "ne kadar geldi" sorusuna yalnız `initial_qty` doğru cevap verir.
- **Personel↔depo kapsamı dizi kolondur (01.08):** `roles` ile aynı gerekçe (guard sıcak yolu — bağ tablosu her istekte join demekti). Depocu/kurye kapsamsız olamaz; boş kapsam = HİÇBİR depo (kapalı kapı). Admin/muhasebe depo-üstüdür, kapsam satırı aranmaz.
- **Fiyat depo boyutu almaz; belge numarası depo koduyla ayrışır (01.08)** — depo bazlı tek fiyat farkı partiye bağlı near-expiry teklifidir (parti zaten bir depodadır). Belge önekine depo kodu girer (`IMH-STR-26-0012`); sayaç şeması değişmez, önek taşır.
- **Araç bir DEPO TÜRÜDÜR (kullanıcı kararı 26.08):** `warehouse.kind` = `facility` | `vehicle`. Gerekçe sahadan geldi — kurye satılan maldan fazlasını yükleyip gittiği yerde isteyene satıyor; pratikte olan bir şeydi ve modelde karşılığı yoktu. Araç depo sayılınca yükleme ve akşam dönüşü birer **transfer** olur, araçtaki mal gerçek partidir: son kullanma, FEFO, geri çağırma izi, soğuk zincir ve belge öneki bedavaya gelir. `0045`in açık bıraktığı soruya (*"araç bir depoya mı, bir güne mi, bir kuryeye mi bağlanır"*) cevap: **hiçbirine — araç bir YERDİR.** Ölçüm noktası kimliği (`vehicle` tablosu, 0045) ayrı yaşamaya devam eder; o aracın sıcaklığını ölçer, bu içindeki malı sayar.
  **Tür bir etiket değil, ÜÇ SORGUNUN süzgecidir ve üçü de veride zorlanır:** *(a)* araca bölge bağlanamaz (tetikleyici — zincir bir adrese çözülmek zorunda, yoksa müşteri siparişi hareket hâlindeki bir yere yazılır ve hiçbir ekran fark etmez), *(b)* araç kargo deposu olamaz (kısıt — taşıyıcı bir adrese gelir), *(c)* araç `available_stock_total`a girmez (katalog için "bizde var" bir SÖZDÜR ve araçtaki mal siteden alınamaz; tedarik önerisi için de o mal zaten tesisten çıkmıştır, akşam döner — sayılsaydı ikinci kez sayılırdı). Depo bazlı `available_stock` aracı **aynen gösterir**: kuryenin ekranı arabasında ne olduğunu görmek zorunda. Tek alan olmasaydı bu üç kuralı üç ayrı yer ayrı ayrı hatırlardı — ve hatırlamayan ilki sessizce yanlış cevap verirdi.
- **Yerinde satış üçüncü bir teslimat tipidir — `pickup` (kullanıcı kararı 26.08).** `delivery_type`in sorusu "mal müşteriye NASIL ulaşır" ve üç gerçek cevabı var: bizim aracımız · taşıyıcı · **müşterinin kendisi**. Yerinde satışta mal hiç gitmez; müşteri tezgâhın ya da kuryenin arabasının önündedir. O güne kadar böyle bir satış varsayılana düşüp `route` yazıyordu — adressiz, bölgesiz, kuryesiz bir "rota siparişi"; sipariş geçerli görünüyor, yalnız teslimat tipine göre kırılan her rapor onu yanlış kovaya koyuyordu.
  **Enum genişlerken 36 dallanma noktası ölçüldü ve yönü karışıktı** (17 tanesi `=== 'shipping'`, 15 tanesi `=== 'route'`): iki varsayılan da yanlıştı, yani "additive" bir değişiklik değildi. Karşılığında **dar küme türetildi**: `AddressDeliveryType = DeliveryTypeEnum.exclude(['pickup'])`. Bir ADRESTEN çözülen her şey (checkout, teslimat çözümü, kargo ücreti, müşteri sözleşmeleri) dar kümeyi konuşur; siparişin kendisi ve onu GÖSTEREN her ekran (operasyon detayı, müşterinin "Siparişlerim"i) geniş kümeyi taşır. Ölçüt tek soru: *bu değer buraya gerçekten gelebilir mi.* Elle yazılmış `'route' | 'shipping'` birleşimleri tam bu yüzden kırıldı ve türetilmiş tiple değiştirildi (CLAUDE §1).
  **`pickup` YALNIZ YERİNDE SATIŞ DEMEK DEĞİL — kapı bilerek açık bırakıldı (26.08, kullanıcı
  sorusu üzerine).** Değerin sorusu *"mal müşteriye NASIL ulaşır"* ve cevabı **"müşterinin
  kendisi"**; yerinde satış bugün bunu yazan TEK yol, tanımın kendisi değil. Kullanıcı ileriyi
  sordu: *"Drive mantığı olacak — müşteri sipariş verip depodan gelip alacak, belki randevuyla.
  Bu konunun önünü kapatmamamız lazım."*

  Bir tur *"`pickup` ⇒ mal her zaman anında düşer"* diye bir değişmez önerildi ve **GERİ ALINDI**:
  tam da o cümle kapıyı kapatırdı. Anında tüketim `pickup`ın değil **yerinde satışın** kuralıdır ve
  ayrımı zaten motor yapıyor — stok etkisini teslimat tipi değil GEÇİŞ belirliyor
  (`stockEffectOf`: `draft → completed` = `consume_direct`; `to === 'confirmed'` = `reserve`).
  Yani aynı `pickup` siparişi iki yoldan da geçebilir ve bugünkü motor ikisini de doğru işler:
  yerinde satış anında tüketir, Drive ayırır → hazırlar → teslimde tüketir. **Drive için yeni bir
  stok kavramı gerekmiyor, dördüncü bir teslimat tipi de.**

  **Kapıyı açık tutmanın dört şartı** (bu satır onların kaydı): *(1)* anında tüketim kuralı yerinde
  satış orkestrasyonunda durur, `delivery_type` semantiğinde DEĞİL; *(2)* sipariş açan kapı
  `pickup` gördüğü için tüketime karar VERMEZ — yolu çağıran seçer; *(3)* misafir müşteri kaydı
  yerinde satışa özeldir, Drive'da müşteri gerçek ve kimliklidir; *(4)* `AddressDeliveryType`
  dışlaması Drive'ı engellemez — o dışlama *"adresten çözülen akış"* kuralıdır ve Drive adresten
  değil SEÇİLEN DEPODAN çözülür.

  **Kodda kapanan bir şey yok; kapanan tek şey bir pazarlama kaydının bugünkü biçimi.** `DOMAIN
  §624` işletmeyi Google'a **hizmet bölgesi (SAB)** olarak kaydediyor — adres gizli — ve gerekçesi
  *"bu bir vitrin değildir: müşteri çekmez, ziyaret saati yoktur"*. Drive tam tersini gerektirir
  (randevu, mesai, gelinebilir adres); o gün bu kayıt biçimi yeniden açılmalıdır. Engel değil,
  bilinmesi gereken bedel.

  **`resolveShippingFee` `pickup` ALMAZ ve bu bilinçli:** yerinde satışta "kargo ücreti kaç" sorusunun cevabı "0" değil, sorunun kendisi geçersizdir. Sıfır döndürseydi motor cevabı olmayan bir soruya cevap vermiş olurdu; sipariş `shipping_fee`ye doğrudan 0 yazar.
- **Pazarlık izi kalemde yaşar — `list_unit_price` + `price_set_by` (kullanıcı kararı 26.08).** Elle sipariş girişinde ve yerinde satışta fiyat alanı LİSTE fiyatıyla dolu gelir, satıcı pazarlık ederse üstüne yazar; bu iki kolon "üstüne yazılmadan önce ne yazıyordu ve kim değiştirdi" sorusunun cevabıdır. Yalnız son fiyat saklansaydı kayıt *"ürün 11,00 €'ya satıldı"* derdi, *"1,50 € taviz verildi"* demezdi — ve kâr motoru katkıyı ciro üzerinden hesapladığı için **kapıda verilen kişisel taviz ile planlanmış kampanya indirimi aynı kovaya düşerdi**; biri bütçelenmiş bir maliyet, öteki tek tek verilmiş bir karar.
  **`line_discount_amount` DEĞİL:** o kolon kupon/kampanya havuzunun ve `discount_amount = Σ line_discount_amount` ertelenmiş kısıtına giriyor, yani kotayı tüketiyor; pazarlığın kotası yoktur ve bir kampanyaya bağlanamaz. **Nullable ve anlamı var:** `null` = pazarlık olmadı, liste fiyatı `unit_price`in kendisidir (`warehouse_variant_threshold`in "satır yoksa genel kural işler" deseni) — her normal checkout kalemine aynı sayıyı ikinci kez yazmak veriyi büyütüp hiçbir soruya yeni cevap vermezdi. Türetme **imzalıdır**: taviz = `coalesce(list_unit_price, unit_price) − unit_price`; eksi çıkabilir ve hata değildir (acele/az miktar listenin üstüne satılabilir). **Yarım iz yoktur** — ikisi birlikte yazılır, kısıt veride (`order_item_negotiation_complete`): tek başına bir liste fiyatı "birileri indirdi" der ama kimin indirdiğini söylemez.
- **`pickup` ve `warehouse.kind='vehicle'` — bir gün süren bilinçli sapma, AYNI GÜN kapandı (26.08).** İki değer, onları YAZAN yol doğmadan eklendi ve bu projenin kendi kuralına aykırıydı (*"değerler, yazan yol doğduğu gün eklenir — kullanılmayan enum değeri yalan söyler"*, `15.15` künyesi). Sapmanın sebebi şemanın ORTAK olmasıydı: yerinde satış ekranı native şeridin işi ve `db:refresh` kullanıcının kararı; değerleri o gün eklemek ikinci bir tazeleme penceresi istemek olurdu.
  **Kapandı — ölçüldü:** `deliveryType: 'pickup'` artık `packages/application/src/order/on-site-sale.ts`ten yazılıyor (yerinde satış, 21.119) ve `warehouse.kind === 'vehicle'` `quick-sale.ts`te okunuyor (araç satışını seferin nakdine bağlayan kural). İkisi de canlı; kayıt burada duruyor ki *neden bir gün boşta durdukları* sorulduğunda cevabı olsun.
  **Kalan ders sapmanın kendisinden büyük:** bir değeri erken eklemek, onu yazacak şeridin gelmesine bağlı bir SÖZDÜR. Söz aynı gün tutuldu ama tutulmasaydı şemayı okuyan "yerinde satış var" sanacaktı. Bir dahakine ölçüt aynı kalsın — yazan yol yoksa değer de yok.
- **"Açık sefer" TEK tanımdır ve ölçütü `delivery_run_close`tir, `returned_at` DEĞİL (26.08).** İki kolon aynı olguyu anlatıyor gibi durur ve gerçek akışta birlikte yazılır — `close_delivery_run` dönüş damgasını ve kapanış satırını aynı çağrıda koyar (`0046`) — ama *"birlikte yazılıyor"* bir kural değil, bir tesadüftür: damgayı kapanışsız yazan tek bir yol (seed) ikisini ayrıştırdı ve aynı seferi bir ekran "açık", bir motor "kapalı" saydı. **Sorunun doğru hâli "araç yolda mı" değil, "bu para hâlâ bir mutabakata girebilir mi"** — cevabı kapanış kaydı verir. Kapanmış sefere sonradan satış bağlamak mutabakat FOTOĞRAFINI geçmişe dönük değiştirmek olurdu: dün mutabık kapanan sefer bugün sebebi hiçbir ekranda yazmayan bir "eksik"e döner. Bağı kuran motor bu yüzden ekranın okuduğu fonksiyonu çağırır (`readCourierRun`), kendi ölçütünü kurmaz; **eskimiş bir seferin bugünün parasını yutması da okumanın GÜNE bağlı olmasıyla engellenir.**
  **`returned_at` yine de bir olgudur, plan değil:** gelecekteki bir sefere dönüş damgası yazmak "kurye döndü" demektir ve modele aykırıdır — seed de artık bunu söylemiyor (geçmiş gün kapanmış, bugün açık, gelecek gün seferi yok; sefer ÇIKIŞTA doğar).
