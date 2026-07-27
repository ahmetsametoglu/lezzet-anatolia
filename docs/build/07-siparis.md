# 07 — Sipariş, Checkout ve Ödeme

## Kapsam

Siparişin doğuşundan kapanışına kadar tüm akış: sepet, checkout (teslimat + ödeme seçimi), rezervasyon–ödeme sırası, Stripe, durum geçişleri, kısmi karşılama, iade, hızlı satış. `domain-core` kararları (03) burada DB'ye ve dış dünyaya bağlanır. Sistemin en kritik ve en çok tabloya dokunan akışı — çok-tablolu yazımlar **RPC** ile atomik.

## Okunacaklar

- `DOMAIN.md §4` (rezervasyon/TTL/geç ödeme), `§5` (fiyat/indirim dağıtımı), `§6` (teslimat/kargo ücreti/teslim onayı), `§7` (ödeme/vade/kapıda), `§8` (kısmi karşılama)
- `ORDER_LIFECYCLE.md` — tamamı
- `STACK.md §13` (webhook güvenliği + çok-tablolu RPC — taslak)

## Bağımlılık

`03-domain-core` (kararlar), `04-auth-kimlik` (müşteri bağı), `06-stok` (rezervasyon/teslim RPC'leri). Stripe kurulumu → Netleşecekler.

## Başlarken verilecek izah (örnek)

> "Sipariş akışını kuruyoruz: müşteri sepeti onaylayınca stok ayrılır, ödeme başlar, mal hazırlanıp teslim edilir ve sipariş kapanır. En hassas yer ödeme–stok sırası: önce stoğu ayırıp sonra parayı çekiyoruz ki karşılığı olmayan tahsilat olmasın. Ödeme sayfasının süresini stok ayırma süresine eşitliyoruz, gecikmiş ödeme için de emniyet kuralı koyuyoruz. Birden çok tabloya birden yazan her adımı (onay, teslim) tek işlemde yapıyoruz ki yarıda kesilince tutarsız kayıt kalmasın."

## Görevler

- [x] (07.1) **Sepet (Cart):** sunucu-kalıcı sepet servisi (giriş yapmış müşteri); sepetteki fiyat **gösterimdir** (`unit_price` kopyası — değişiklik tespiti için), bağlayıcı fiyat checkout başlangıcında sabitlenir; anonim → giriş sonrası devralma
  - *Bitti:* cihaz değişince sepet duruyor; sepette bekleyen kalem checkout'ta güncel fiyatla karşılaştırılıyor
  - **Durum (27.07):** `0014_cart.sql` · `CartService` · `cart.schema.ts`. Müşteri başına TEK satır (birincil anahtar `customer_id` — "tek sepet" kuralı şemada zorlanıyor); kalemler jsonb (sepet kalemi bir varlık değil, geçici seçim — sorgulanmaz, okunur). Aynı satır tekrar eklenince adet birleşir; adedi 0'a indirmek satırı siler; boşaltma satırı tamamen kaldırır. **Teklif satırı (partiye çıpalı) normal satırdan ayrı yaşar** — aynı ürün hem indirimli partiden hem normal fiyattan sepette olabilir. **Devralmada sunucudaki sepet korunur**, gelen kalemler üstüne eklenir: giriş yapmak daha önce eklenmiş bir ürünü sessizce kaybettirmemeli. 12 test.
  - **Kural düzeltmesi (27.07, kullanıcı kararı):** görev başta "fiyat sepete eklenince sabitlenir" diyordu; sepet aylarca beklediği için bu süresiz fiyat garantisi anlamına geliyordu (maliyeti oynayan donuk gıdada zarar; fiyat düşünce müşteriye haksızlık). **Sabitleme anı checkout başlangıcına alındı** — stok ayırma ve ödeme oturumuyla AYNI 30 dk'lık pencere, ayrı süre/cron yok. Arttıysa bildir+onay, düştüyse sessiz uygula, tükenen teklif partisi aynı akıştan geçer. `DOMAIN §5`'e yazıldı.
- [x] (07.2) **Checkout — teslimat:** adres → posta kodundan zone türetimi → rota-içi gün(ler)/kargo; cut-off saatine göre gün hesabı; kargo yasak ürün (`shippable=false`) kuralı
  - *Bitti:* tek gün otomatik, çok gün seçtiriliyor; cut-off sonrası sipariş ertesi güne düşüyor (test)
  - **Durum (27.07):** `0017_delivery_zone.sql` · `DeliveryZoneService` · motor `domain-core/delivery/delivery-days.ts` · kapı `apps/web/lib/order/delivery.ts`. 13 birim + 7 entegrasyon testi.
  - **Rota içi/dışı SAKLANMIYOR:** adresin posta kodu aktif bir bölgeye düşüyorsa rota içi. Saklansaydı bölge sınırı admin tarafından değiştirilince ertesi gün yalan olurdu (`address.in_route` kolonu bilerek yok).
  - **Kesim saati sınırı dâhil:** tam 16:00'da gelen sipariş de kaçırmış sayılır (araç yükleniyor). Kesim saati `Setting`'ten okunur; bozuk değer akışı kilitlemez, kesim uygulanmaz.
  - **Tek tarih varsa seçim sunulmaz** (`requiresDateChoice`) — arayüz kararı veriden türüyor, ekranda `if` yazılmıyor.
  - **Soğuk zincir kuralı yönlü:** kargolanamayan ürün yalnız ROTA DIŞI adreste engel; rota içinde kapı teslimi zaten mümkün olduğu için sorun değil.
- [x] (07.3) **Checkout — ödeme seçenekleri:** bağlama göre (online/kapıda/vadeli); kapıda tavan + nakit uyarısı + `cod_allowed`; vade freni (03 kararı) uygulanır; `shipping_fee` hesabı + KDV
  - *Bitti:* tavan aşan sipariş kapıda seçeneğini gizliyor; vadesi dolu müşteride "hesaba" kapalı
  - **Durum (27.07):** motor `domain-core/delivery/shipping-fee.ts` (yeni) + `payment/checkout-options.ts` (03.7/03.8'den) · kapı `apps/web/lib/order/checkout-options.ts`. 10 birim + 14 entegrasyon testi. Tavanlar, eşikler ve ücret artık `settings`'ten okunuyor — kodda sabit yok.
  - **Açık bakiye ve gecikme TÜRETİLİYOR** (DOMAIN §7): ödenmemiş vadeli siparişlerden hesaplanıyor, hiçbir yerde saklanmıyor. İptal edilen sipariş bakiyeye sayılmıyor (testli). Saklanan bakiye kayarsa fark edilmez; türetilen kayamaz.
  - **Kargo ücretinin KDV'si tek orana bağlanmadı:** taşıma bedeli **taşıdığı malın oranını izler** (FR uygulaması). Sepette hem %5,5 hem %20 ürün varsa ücret kalem tutarlarına oransal bölünüyor ve her parça kendi oranından vergileniyor; kuruş kaybı yok (Σ parça = ücret). Tek oranlı sepette sonuç tek parça. **Bu bir vergi işlemi kararıdır — muhasebenizle teyit etmekte fayda var**, kod tek satırda tek orana çevrilebilir.
  - **Ücretsiz kargoya kalan tutar** dönüyor (`remainingForFreeShippingCents`) — "20 € daha ekleyin" mesajını arayüz hesaplamıyor, veriden alıyor.
- [ ] (07.4) **Rezervasyon → ödeme sırası:** atomik ayır (06 RPC) → Stripe checkout session (TTL = rezervasyon süresi, session expiry eşit); ayrılamazsa ödeme hiç başlamaz; `acquisition_source` ilk siparişte yazılır; izin kutusu (`marketing_consent`)
  - *Bitti:* stok yetmezse ödeme açılmıyor; session süresi Setting TTL'iyle eşit
- [ ] (07.5) **Stripe webhook (apps/backend):** imza doğrulama + `WebhookEvent` idempotency (aynı olay no-op) + ödeme onayı → `confirmed` + `reference_no` üretimi; geç ödeme dallanması (yeniden ayır / olmazsa otomatik iade)
  - *Bitti:* aynı event iki kez gelince tek kayıt; rezervasyon düşmüş siparişte geç ödeme iki dalıyla doğru
- [x] (07.6) **Durum geçişleri + log:** `domain-core` durum makinesini bağlayan servis; her geçiş `OrderStatusLog`'a (from/to/kim/zaman); izinsiz geçiş `{data,error}` ile reddedilir
  - *Bitti:* teslim/kapanış/iptal geçişleri loglanıyor; yasak geçiş hata dönüyor
  - **Durum (27.07):** `0015_order.sql` — sipariş omurgası (`order`, `order_item`, `order_item_batch`, `order_status_log`) + `transition_order_status` RPC · `OrderService`/`OrderItemService`/`OrderStatusLogService` · kapı `apps/web/lib/order/transition.ts`. 12 test.
  - **İki ayrı "hayır" karıştırılmaz:** `forbidden` = geçiş kurallara aykırı (motorun cevabı, ör. `draft → delivered`); `stale` = geçiş uygun ama sipariş artık o durumda değil, araya biri girdi (veritabanının cevabı — depocu "hazır" derken kurye "yolda" demiş). İkisi farklı arayüz davranışı ister: biri hata mesajı, diğeri "ekranı tazele".
  - **Neden RPC:** iki koşul birden (STACK §13). (a) eşzamanlılık — koşullu update olmadan biri diğerini sessizce ezer (10 eşzamanlı testte tek yazan doğrulandı); (b) bölünemez yazım — durum + log birlikte yazılmalı, log düşerse teslim anı ve geri bildirim zamanlaması izsiz kalır.
  - **Zaman damgaları türetilir:** siparişte `delivered_at`/`completed_at` kolonu YOK; teslim anı, kapanış anı ve geri bildirim zamanlaması (~10 gün) `order_status_log`'dan okunur (`firstEntryAt`). Aynı gerçeği iki yere yazmamak için.
  - **Referans numarası bir kez üretilir:** ilk kalıcı durumda (motor karar verir), RPC de `coalesce` ile mevcut numarayı ezmez — çift emniyet.
  - **Kalemsiz sipariş kalmaz:** kalem yazımı düşerse taslak sipariş geri alınır. Rezervasyon ve tahsilatın da girdiği tam checkout akışı 07.4'te tek RPC'ye alınacak.
- [x] (07.7) **Teslim RPC'si:** tek transaction — Reservation düş + Stock fiiliden düş + `OrderItemBatch` (06'daki FEFO onayından) + kâr snapshot'ları (COGS/teslimat/komisyon/paketleme) + `delivery_proof`
  - *Bitti:* teslim sonrası tüm kayıtlar tutarlı; yarıda kesme testi rollback yapıyor
  - **Durum (27.07):** `0019_deliver_order.sql` (`deliver_order` + `close_order`) · `OrderService.deliver/close` · kapı `apps/web/lib/order/fulfillment.ts`. 7 test.
  - **Görev satırından SAPMA — kâr snapshot'ı teslimde değil, KAPANIŞTA.** `DOMAIN §12` birebir şöyle diyor: *"doğrudan gider kalemleri sipariş kapanışında sabitlenir; kapanış = `completed`'a geçiş anıdır"*. Teslim ile kapanış arasında iade/kısmi düzeltme olabilir; maliyeti teslimde dondurmak o düzeltmeleri kârın dışında bırakırdı. Bu yüzden iki fonksiyon: teslim malın **fiziksel gerçeğini** değiştirir, kapanış **parayı sabitler**. (Mimari kazanır — build/README kuralı.)
  - **COGS gerçek maliyettir:** tüketilen partilerin KENDİ alış fiyatından, ortalamadan değil. Testte 4×2 € + 2×3 € = 14 € çıkıyor; ortalama alınsaydı 15 € olurdu.
  - **Stok tam bir kez düşer:** teslim yalnız `out_for_delivery`'den olur (koşullu), ikinci çağrı `stale` döner ve stoğa dokunmaz (testli). Hiç hazırlanmamış sipariş teslim edilirse stok düşmez, teslim kaydı yine yazılır (kısmi karşılama).
  - **`payment_fee` yazılmıyor:** komisyon oranları para modülüyle (12) gelir. Uydurma oranla doldurmak kârı sessizce yanlış gösterirdi — null kalıyor.
- [ ] (07.8) **Kısmi karşılama:** `fulfilled_qty` düşümü + para dallanması (peşin → `order_refund` hareketi; kapıda → tahsilat düşer); `payment_status` türetimi (03) uygulanır
  - *Bitti:* eksik + kuponlu sipariş doğru iade tutarını üretiyor
- [ ] (07.9) **İptal ve iade:** ödenmiş iptal → tam otomatik iade; `returned → completed` kapanışı; iade hareketleri `order_refund` tipiyle; `amount_*` cache güncellemesi (kaynak MoneyMovement)
  - *Bitti:* iptal sonrası `payment_status=refunded`; cache ile hareket toplamı tutuyor
- [x] (07.10) **Hızlı satış yolu (door):** `draft → completed` tek adım; rezervasyon atlanır, fiiliden düşülür; ödeme anında; `reference_no` `completed`'de üretilir
  - *Bitti:* kapı önü satış tek işlemde kapanıyor, stok anında düşüyor
  - **Durum (27.07):** `0020_quick_sale.sql` (`quick_sale`) · `OrderService.quickSale` · kapı `apps/web/lib/order/quick-sale.ts`. 8 test.
  - **Adım atlanır, İZ atlanmaz.** Tam yolun yedi adımı burada bir adım; ama kalem–parti kaydı, `reference_no`, geçiş logu ve kâr kalemleri tam yoldakiyle **aynı yerlere** yazılır. Geri çağırma ("bu parti kime gitti") ve gerçek COGS hızlı satışta da çalışır.
  - **Önce kontrol, sonra yazım.** Yetersiz stok bir hata değil, bir **cevaptır** (kasiyer ekranında kalan miktar yazar) — bu yüzden `return` ile bildirilir, `return` transaction'ı geri almadığı için kullanılabilirlik kontrolü tek satır yazılmadan önce biter. Kontrol iki katmanlı: **varyant toplamında** (başkasına ayrılmış mal kapıda satılamaz) ve **parti bazında** (seçilen parti tükenmiş olabilir).
  - **Kapıda hazırlık ekranı yok → partiler FEFO ile türetilir** (06.5 önerisi yeniden kullanılır); operatör isterse elle geçer. FEFO önerisi parti bazında baktığı için varyant-toplamı rezervasyonunu görmez; **son söz RPC'nindir** — emniyet, öneriyi üretenin değil, yazımın olduğu katmanda durur.
  - **`delivery_cost = 0`:** kapı önünde teslimat yapılmadı; rota birim maliyeti bu satışa yazılamaz. **Nakitte `payment_fee = 0`** — bu uydurma değil, olgudur (DOMAIN §12); kart/online oranları modül 12'de, o zamana kadar null.
  - **Ödeme durumu yine TÜRETİLİR** (03.6): kapıda bir kalem eksik verilirse tahsilat tam olsa bile durum kendiliğinden doğru çıkar. Yeni ayar: `door_packaging_unit_cost_cents` (varsayılan **0** — mal elden gidiyor, soğuk zincir paketi yok).
  - **Güncelleme (28.07, 12.2 ile):** tahsilat artık RPC'de yazılmıyor. `p_amount_collected`/`p_payment_status` kaldırıldı; kapı, satıştan sonra `recordOrderPayment` çağırıyor — kapı önü nakdi gerçekten kasanın bakiyesine düşüyor, sipariş cache'i ondan türüyor. Hesap yoksa satış yine kapanır (`paymentRecorded:false`): mal gitmişken satışı bloke etmek de, olmayan parayı "ödendi" yazmak da yanlış olurdu.

## Netleşecekler

- **Stripe hesap/ürün kurulumu:** hesap, webhook imza anahtarı, ödeme yöntemleri (kart + Apple/Google Pay), SEPA/ödeme tipleri kullanıcıyla kurulur (dış hesap işlemi). Anahtarlar hazır — **env yer tutucuları 07.4/07.5 ile eklenir** (karar 27.07): `.env.example`'ın kendi kuralı uygulama-özel anahtarın özelliğiyle birlikte eklenmesidir; erken eklenen değişken, karşılığı olmayan ölü kayıt olur. Yeri: `apps/web` (checkout oturumu + publishable), `apps/backend` (webhook imza sırrı).
- **Çok-tablolu RPC listesinin son hali:** teslim (07.7) ve hızlı satış (07.10) sınırları kesinleşti — ölçüt 06.1'in "dar liste"si: eşzamanlılık yarışı **veya** bölünemez çok-tablolu yazım. Geriye checkout onayı (07.4) kaldı.
