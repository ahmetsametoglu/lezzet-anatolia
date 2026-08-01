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
- [`data-model/musteri-siparis.md`](data-model/musteri-siparis.md) — **Müşteri ve Sipariş:** `Customer`, `Address`, `DeliveryZone`, `Order`, `OrderItem`, `OrderItemBatch`, `OrderStatusLog`, `Cart`, `CourierDayClose`
- [`data-model/para.md`](data-model/para.md) — **Para ve Ön Muhasebe:** `Account`, `MoneyMovement`, `BankImportProfile`
- [`data-model/iletisim-geribildirim.md`](data-model/iletisim-geribildirim.md) — **İletişim, Geri Bildirim ve Analitik:** `Conversation`, `Message`, `WebhookEvent`, `AnalyticsEvent`, `ProductFeedback`, `FeedbackRequest`, `PointsEntry`, `Ticket`, `TicketMessage`, `Setting`
- [`data-model/operasyon.md`](data-model/operasyon.md) — **Operasyon ve Gözlemleme:** `JobRun`, `ErrorLog`, `SystemHealthSnapshot` — sistemin kendi hakkındaki verisi; iş kaydı DEĞİL, saklama süresi var (bkz. [`OBSERVABILITY.md`](OBSERVABILITY.md))

Junction/ara tablolar ilgili dosyada anlatılır (ör. `product_collections` → katalog).

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
- `analytics_event_type`: page_view, product_view, add_to_cart, checkout_start, order_placed, share, search
- `feedback_channel`: email, whatsapp
- `feedback_context`: purchase, candidate
- `feedback_vote`: like, dislike
- `points_reason`: review, feedback_purchase, feedback_candidate, order, referral, redemption, manual
- `review_status`: pending, approved, rejected
- `ticket_type`: damaged, missing, question, other
- `ticket_status`: open, in_progress, resolved
- `ticket_source`: order, form, whatsapp, admin
- `ticket_handler`: human, ai
- `ticket_sender`: customer, admin, ai
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
- **Müşteriye görünen her metin çok dillidir** — varyant etiketi dahil (`ProductVariant.label` LocalizedText). Yalnız iç alanlar (`sku`, `lot_number`, `Discount.name`) düz metindir. Ölçüt: müşteri yüzeyinde görünüyorsa `LocalizedText`.
- **Yasal beyan ürün seviyesindedir** (`ingredients`, `nutrition`, `allergens`, `traces`, `storage_instructions`) — varyantlar aynı reçeteyi paylaşır; besin değerleri 100 g başına verildiğinden her boy için geçerlidir. Farklı reçete = farklı ürün.
- **Çapraz bulaşma serbest metin değil, alerjen listesidir** (`traces`) — cümle üç dilde i18n şablonundan kurulur; işletme çevirmen aramaz, liste seçer.
- **Kapak görseli üründe, galeri ayrı tabloda** — `Product.image_key` kapak (liste/kart/OG tek sorguda), `ProductImage` yalnız ek görseller; kapak galeride tekrarlanmaz (tek kaynak korunur).
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
