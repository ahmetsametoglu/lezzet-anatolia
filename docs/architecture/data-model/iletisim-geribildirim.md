# Veri Modeli — İletişim, Geri Bildirim ve Analitik

Konuşma/mesaj, webhook, analitik olayı, yorum, puan, talep, işletme ayarı.

> Bu dosya `../DATA_MODEL.md`'nin parçasıdır. Ortak ilkeler (çok dilli alanlar, türetme ilkesi, enum listesi, kalıcı kararlar) ana dosyadadır; **karar oraya, alan buraya** yazılır.

---

## Conversation (konuşma) — WhatsApp/mesajlaşma

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

**Bir kişi, bir konuşma** — tekillik `(source, external_ref)` üzerinde (0039). WhatsApp'ta thread kavramı yoktur: aynı numaradan gelen her mesaj aynı sohbetin devamıdır. İndeks olmasaydı ikinci mesaj yeni bir satır açar, admin aynı müşteriyi gelen kutusunda iki kez görür, AI ajanı geçmişin yarısını okurdu. Açılış bu yüzden tek deyimlik upsert (`open_conversation`): oku-sonra-yaz yarışır ve canlı kanalda arka arkaya gelen iki mesajın ikincisi kaybolurdu.

**`customer_id` nullable ve öyle kalmalı:** canlı adımda webhook mesajı önce yazar, kimliği sonra çözer — kimlik çözülemediği için mesajın kaybolduğu bir yol olamaz. Mevcut bağ da EZİLMEZ (`coalesce`): bağlanmış bir konuşmayı başka müşteriye kaydırmak bir **birleştirme** kararıdır ve insana aittir (`DOMAIN §10`).

**24 saatlik pencerenin hesabı burada DEĞİL, motorda** (`serviceWindowExpiry` — domain-core). Tablo yalnız saklar; süreyi RPC'ye de yazmak aynı kuralın iki dilde iki kopyası olurdu. **Pencereyi yalnız GELEN mesaj açar:** giden mesajın uzatması ücretsiz mesajlaşma süresini kendi kendimize uzatmak olurdu — Meta tarafında pencere kapanmıştır ve gönderim şablon ücretiyle geçer.

**Pencere GERİ GİTMEZ** (`greatest`, `coalesce` değil): sağlayıcı webhook'ları ne sıralı gelir ne tek kez denenir. Geç düşen ya da yeniden denenen eski bir mesaj, kendi anına göre hesaplanmış daha erken bir bitişi yazsaydı pencereyi kısaltır ve hâlâ ücretsiz olan bir aralıkta şablon ücreti ödetirdi — üstelik hiçbir yerde hata vermeden. Aynı sebeple `recordInboundMessage`'ın `receivedAt` alanı ZORUNLUDUR: "şimdi"ye düşen bir varsayılan, elle işlenen mesajda pencereyi Meta'nınkinden geç bitirir ve ters yönde aynı faturayı yazar.

**GDPR:** konuşma ve mesajlar `anonymize_customer`'ın **silinir** kovasındadır (0037) — müşterinin kendi cümleleri ve `external_ref`'te duran telefon numarası. `customer_id` FK'si `cascade`, yani hesabın hard-delete edildiği yolda da giderler.

## Message (mesaj)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| conversation_id | uuid | |
| direction | enum(`inbound`,`outbound`) | müşteri→biz / biz→müşteri |
| kind | enum(`text`,`interactive`,`template`,`media`) | |
| body | jsonb | metin veya kart/interaktif yapı |
| template_name | string \| null | outbound template ise (Meta-onaylı) |
| template_category | enum(`marketing`,`utility`,`authentication`) \| null | şablonun **ücret sınıfı** — adla birlikte gelir, ondan ayrı düşemez |
| provider_message_id | string \| null | 360dialog/Cloud API mesaj id'si |
| created_at | timestamptz | |

**Defterdir — yazılır, güncellenmez.** `TicketMessage` ile aynı gerekçe: gönderilmiş mesaj değişmez. Servisin güncelleme tipi bu yüzden `never`; bir gün biri "mesajı düzelt" demek istese derlemede durur.

**`direction` ile `TicketMessage.sender` karıştırılmaz** ve ayrım kalıcı: orada "kim yazdı" (müşteri/personel/AI), burada "hangi tarafa aktı" sorulur. WhatsApp'ta bizim adımıza AI da personel de yazabilir; ikisi de aynı numaradan çıkar ve müşteri farkı görmez.

**`kind = template` bir SÜS değil ÜCRET sınıfıdır:** servis penceresi dışında yalnız Meta-onaylı şablon gidebilir — ADR-005'in "önce müşteri yazsın" ilkesi bu satırdan doğuyor.

**Fiyatı `kind` değil `template_category` belirler** ve ayrım üç yerde birden önemli:
- **Muhasebe:** düz `kind='template'` sayımı üç farklı fiyatı tek toplama atar; "bu ay WhatsApp bize ne yazdı" sessizce yanlış çıkar.
- **İsraf ölçütü:** *"pencere açıkken şablon = israf"* kestirmesi YANLIŞ. `marketing` israftır (aynı içerik serbest metinle ücretsiz giderdi); `utility` (sipariş onayı, kargo) pencere içinde zaten ücretsiz ve **ADR-005 onu orada öneriyor** — israf saymak doğru davranışı uyarıyla cezalandırmak olurdu. `authentication` bilerek israf sayılmıyor: şablonla gitmesi maliyet hatası değil teslim edilebilirlik kararıdır. Kural motorda tek yerde (`isAvoidableTemplate`).
- **İzin:** `opt_in` şartı yalnız `marketing` içindir. `utility`nin dayanağı izin değil **siparişin kendisidir** (sözleşmenin ifası) — üçünü tek kovaya atmak, sipariş onayını izin arkasına saklamak olurdu.

**Kolon defterle BİRLİKTE doğdu, sonradan eklenmedi:** yazılırken atlanan bir boyut geriye dönük doldurulamaz. Kategorisiz geçen mesajlar için "geçen ay ne ödedik" hiçbir zaman cevaplanamazdı (`ticket.handled_by` ile aynı gerekçe). Şablon adına bakıp türetmek de çözüm değil: kategori Meta tarafında sonradan değişebilir ve o gün geçmiş faturamız bugünün sınıflandırmasıyla yeniden yazılırdı. Defter olanı yazar. Üç kural veride durur (0039): metin mesajı metinsiz olamaz, şablon adı ile tür ayrışamaz (adsız template / adlı serbest metin reddedilir), **gelen mesaj template olamaz** (template işletme-başlatandır; tersi mümkün olsaydı gelen bir mesaj pencere hesabında "biz gönderdik" gibi okunurdu).

**`body` jsonb ve adım 1'de `payload` AÇIK** — kart/interaktif/medya yapısının şekli sağlayıcıya bağlı ve 15.9'da netleşecek. Bugün kapalı bir sözlük yazmak, henüz görmediğimiz bir yapıyı uydurmak olurdu; uydurulan sözlük gerçeği gördüğümüz gün sessizce yanlış olurdu. `text` her türde okunur (kartın başlığı da bir metindir) — gelen kutusu önizlemesi ve AI bağlamı onu okur.

## WebhookEvent (dış olay kaydı)

Stripe/360dialog webhook'ları için tekrar-işleme kilidi (idempotency): aynı olay ikinci kez gelirse no-op (bkz. `STACK.md §13`).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| provider | string | stripe / 360dialog |
| provider_event_id | string | **unique** (provider ile birlikte) |
| processed_at | timestamptz \| null | |
| payload | jsonb \| null | ham gövde (hata ayıklama) |

## AnalyticsEvent (analitik olayı)

Cookie'siz, sunucu-tarafı, toplu ölçüm. **Kuralların tamamı `ANALYTICS.md`'de** (sınır · kimlik · olay şekli · kapı · saklama); burada yalnız ALANLAR durur.

**`customer_id` kolonu YOKTUR — nullable bile değil** (kullanıcı kararı 04.08). Eskiden *"yalnız giriş yaptıysa (opsiyonel)"* diye duruyordu ve üç yerle çelişiyordu: tasarım kişi bazlı gezinme ekranını yasaklıyor, yasal gerekçemiz toplu ölçüme dayanıyor, silme talebinde ne yapılacağı tanımsız kalıyordu. Kimlikli davranış defteri ayrı bir tablonun ve ayrı bir hukuki dayanağın işidir → `ANALYTICS.md §2`.

**Vekil anahtar (`id`) de YOKTUR** (0035): satır asla kimliğiyle okunmuyor — defter yalnız yazılıyor ve
toplanıyor. En çok yazılan tabloya, hiçbir okumanın kullanmadığı bir indeks eklenmez (ayrıca
bölümlenmiş tabloda birincil anahtar bölüm anahtarını içermek zorundadır). Tablo **aya göre
bölümlenmiştir**; saklama satır silerek değil bölüm düşürerek işler.

**`source` ve `utm` bu tabloda DEĞİL, `AnalyticsSession`'da** (aşağıda): kampanya künyesi oturum
başına bir kez düşer. Her olaya kopyalansaydı aynı bilgi ziyaret sayısı kadar tekrarlanır ve
oturumun künyesi olayların arasında ayrışabilirdi.

| Alan | Tip | Not |
| --- | --- | --- |
| created_at | timestamptz | **bölüm anahtarı** |
| type | enum(`page_view`,`product_view`,`search`,`place_resolved`,`add_to_cart`,`cart_blocked`,`checkout_start`,`checkout_blocked`,`order_placed`,`share`) | |
| session_key | string | sunucu-tarafı günlük oturum (kişisel değil; tuz her gün döner) |
| path | string \| null | **ROTA KALIBI** (`/product/[slug]`), somut değer asla |
| subject_type | enum(`product`,`variant`,`bundle`,`category`,`collection`) \| null | ölçülen nesne; FK YOK |
| subject_id | uuid \| null | |
| product_id | uuid \| null | ürün kırılımı için denormalize anlık görüntü |
| channel | enum(`b2c`,`b2b`) \| null | |
| warehouse_id | uuid \| null | **DEPO granülü**, posta kodu değil (k-anonimlik). `null` = yer seçilmemiş, bir KOVA |
| availability | enum(`sellable`,`sold_out`,`closed`,`not_here`) \| null | görüntüleme anındaki hâl (snapshot) |
| blocked_reason | enum(`min_basket`,`split`,`place_change`,`coupon_invalid`,`out_of_stock`,`payment_failed`,`not_shippable`) \| null | yalnız `cart_blocked`/`checkout_blocked` |
| device | enum(`mobile`,`desktop`) \| null | uygulamanın `Device` tipiyle aynı küme |
| country | enum(`FR`,`DE`) \| null | IP'den türetilir; IP saklanmaz |
| language | enum(`tr`,`fr`,`de`) \| null | |
| meta | jsonb \| null | tipe özel, **kapalı sözlük** (Zod ayrık birliği). `search`: `{query, resultCount, zeroResultKind}` |

## AnalyticsSession (oturumun kampanya künyesi)

UTM oturum başına **bir kez** düşer; ikinci yazım sessizce yutulur (ilk kaynak kazanır — `acquisition_source` kuralıyla aynı). Satır yalnız künyeli gelişte doğar: doğrudan gelen ziyaretçi için satır açmak, tabloyu defterin ikinci kopyasına çevirirdi.

| Alan | Tip | Not |
| --- | --- | --- |
| session_key | string | **birincil anahtar** |
| utm | jsonb \| null | **kapalı sözlük**: `{source, medium, campaign, content, term}` — kapı indirger (`normalizeUtm`) |
| source | string \| null | yönlendiren ALAN ADI (ham URL değil) |
| first_seen_at | timestamptz | |

**Sözlüğün kapalı olması bir gizlilik kararıdır:** açık bırakılsaydı reklam aracının linke eklediği her parametre — `gclid`/`fbclid` gibi **tıklama kimlikleri** dâhil — anonim deftere girerdi. O kimlikler reklam ağının tarafında tek kullanıcıya çözülür.

**Saklama:** ham defterle aynı 25 ay (`purge_analytics_before`). Bölüm düşürmek burada işe yaramaz — tablo bölümlenmemiş; künyesi kalan bir oturum "defteri sildik" cümlesini yarım bırakırdı.

## AnalyticsDaily (+ üç sinyal özeti) — **ekranların okuduğu yer**

Ekranlar ham deftere BAĞLANMAZ (`ANALYTICS §5`); ham yalnız detay içindir.

| Tablo | Anahtar | Ne cevaplar |
| --- | --- | --- |
| `analytics_daily` | gün × tip × rota × depo × kanal × satılabilirlik × **terk sebebi** | huni · seri · ısı haritası |
| `analytics_daily_product` | gün × ürün | çok bakılıp az alınan (13.4) + vitrin seçkisi (08.9) |
| `analytics_daily_search` | gün × terim × sıfır-sonuç kovası | aranıp bulunamayan (13.4) |
| `analytics_daily_source` | gün × kaynak × kampanya × ortam | trafik kaynağı + kaynak dönüşümü (13.2) |

- `analytics_daily` satırı **24 öğeli saat kırılımı dizisi** taşır — ayrı saatlik tablo YOK; hafta/ay/yıl da türetilir.
- **`session_count` YAKLAŞIKTIR** (aynı oturum birden çok boyut satırına düşer). Toplanabilir tek sayı `event_count`.
- Tekil anahtarlar **`nulls not distinct`**: boyutların çoğu nullable ve SQL'de `null <> null` — standart `unique` aynı kovayı defalarca yazdırır, özet sessizce çoğalırdı.
- **Ürün/kaynak özeti SÜRESİZ** (sayı, kişisel veri değil); **arama özeti 25 ay** — sistemdeki tek kalıcı serbest metin, ham metnin ömrünü özet kılığında uzatmamalı.
- Ürün ve arama kırılımı `analytics_daily`'ye BOYUT olarak eklenmedi: satır sayısını katalog büyüklüğüyle çarpar, huni/ısı okumaları da o şişmiş tabloyu taramak zorunda kalırdı.

**Burada YALNIZ İZ vardır, beyan yoktur.** Analitik, müşteriyi tanımadan topladığımız gezinme izidir; "toplu ölçüm" ve "çerez banner'ı gerekmez" iddiası (bkz. `FEATURES.md` Analitik) buna dayanır. Müşterinin bize **vermeyi seçtiği** her şey — yorum, beğeni, talep, bölge haberi — kendi kalıcı tablosunda yaşar.

Bu yüzden `product_swipe` bu listede DEĞİLDİR (29.07 düzeltmesi): beğen/geç bir iz değil bir beyandır, puan kazandırır, kişiye ve ürüne bağlıdır ve "aynı ürüne bir kez" tekilliği ister — hiçbiri akıp giden bir olay defterinde duramaz → `ProductFeedback`.

## ProductFeedback (ürün geri bildirimi — yorum + beğeni)

Müşterinin bir ürün hakkında **bize vermeyi seçtiği** değerlendirme. Üç biçim tek varlıkta: yıldız, yazılı yorum, beğen/geç (bkz. `DOMAIN.md §14`).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| product_id | uuid | değerlendirme ürün düzeyinde (varyant değil) |
| customer_id | uuid \| null | **null = giriş yapmamış ziyaretçinin keşif kaydırması**; puan yalnız kimliklide |
| order_id | uuid \| null | doğrulanmış alışveriş (`purchase` bağlamında dolu) |
| context | enum(`purchase`,`candidate`) | aldığı ürün / keşifteki aday ürün — **kapıları farklı** |
| rating | int \| null | 1–5 yıldız |
| vote | enum(`like`,`dislike`) \| null | beğen / geç |
| comment | text \| null | yazılı yorum |
| language | text \| null | metnin GERÇEK dili (ISO 639; enum DEĞİL — Boşnakça yorum da gelir). `null` = tespit koşmadı; metinsiz kayıtta boş |
| translations | jsonb \| null | makine çevirileri `{tr?,fr?,de?}` — **kaynak dil torbada YOKTUR** |
| translated_at | timestamptz \| null | çeviri işi baktı mı; **başarısızlıkta da dolar** |
| dwell_ms | int \| null | kartta geçirilen süre — **sinyal kalitesi** için (yalnız kaydırmada) |
| feedback_request_id | uuid \| null | alım-sonrası davetten geldiyse (`FeedbackRequest`) |
| status | enum(`pending`,`approved`,`rejected`) | **moderasyon yalnız METİN içindir**; metinsiz kayıt doğrudan `approved` doğar |
| moderated_at / moderated_by | timestamptz \| null / uuid \| null | kim ne zaman karar verdi (iz) |
| notified_at | timestamptz \| null | **"bu ürün geldi" haberi bu kişiye verildi mi** (17.8 zemini). Aday kaydırması bir TALEP BEYANIDIR; ürün kataloğa girince beyanı yapana haber vermek, keşif turunun karşılığını ödediği andır. **Ayrı "ilgi" tablosu AÇILMADI:** kim hangi ürünü istiyor bilgisi zaten bu satırda (`customer_id` + `product_id` + `vote='like'` + `context='candidate'`) ve `product_feedback_customer_key` onu kişi başına teke indiriyor — ikinci tablo aynı gerçeği iki yerde tutar ve ayrışır. Eksik olan ilgi değil **teslimat muhasebesiydi**. Damga gönderimden SONRA atılır: tersi, gönderim düşerse müşteriyi kalıcı sessizliğe mahkûm ederdi |
| created_at | timestamptz | |

**Neden tek tablo:** ayrımları biçimden ibarettir — müşteri, ürün, tarih, puan kazanımı, "aynı ürüne bir kez" tekilliği, ürün skoruna katkı ve GDPR silme yolu üçünde de aynıdır. `Discount`'ın kuponu ve otomatik kampanyayı tek varlıkta tutmasıyla aynı gerekçe: iki tablo, aynı yedi alanı iki kez tanımlamak ve skoru iki yerden toplamak olurdu.

**En az bir beyan şart:** `rating`, `vote` ve `comment`'tan biri dolu olmalı. Üçü de boşsa ortada bir değerlendirme yoktur.

**Yorum ÇEVRİLİR ama DEĞİŞMEZ (20.2 · kullanıcı kararı 03.08 — eski "çevrilmez" kararı geri alındı).** Eski gerekçe *"yorum müşterinin kendi cümlesidir, makine çevirisi onu söylemediği bir hâle sokar"* idi; endişe doğruydu, sonucu yanlıştı — çevirmemek, Fransız okuyucuya Türkçe yorumu okuyamayacağı hâlde göstermektir, yani hiç göstermemektir. Doğru çözüm **orijinali korumak ve çeviriyi yanına koymak**: `comment` hiç değişmez, `translations` yanında durur, `resolveUserText` site dilinde okutur ve ekran "otomatik çevrildi" der. **Kaynak dil torbaya girmez** — böylece torbadan okunan her metin gerçekten çeviridir ve karışamaz. **Metin değişirse çeviri VERİ TARAFINDAN düşürülür** (`reset_translation_on_text_change` tetikleyicisi, `0011`): kapıya bırakılsaydı bir yazma yolu unutulur ve okuyucu, müşterinin artık yazmadığı bir cümlenin Fransızcasını görürdü.

**Moderasyon metnin işidir.** Yıldızı ya da beğeniyi "reddetmek" anlamsızdır — okunacak bir şey yoktur. Metinsiz kayıt kuyruğa hiç düşmez, doğrudan yayına girer; kuyruk yalnız insanın okuyacağı bir cümle olduğunda anlamlıdır.

**İki bağlam, iki kapı:** `purchase` satın alma doğrulaması ister (doğrulanmamış yorum sosyal kanıt değil reklamdır); `candidate` istemez ve isteyemez — aday ürün henüz satılmıyor, kimse alamamıştır.

**`status` neden boolean değil:** kuyruğun üç hâli var — bekliyor, onaylandı, reddedildi. `is_approved=false` bu üçünden ikisini aynı kovaya atardı: reddedilmiş yorum her açılışta yeniden karar bekliyormuş gibi kuyruğa düşer, moderatör aynı metni ikinci kez okurdu.

**Dil saklanır, çevrilmez:** yorum müşterinin kendi cümlesidir; makine çevirisi onu müşterinin söylemediği bir hâle sokar. Alan, moderatörün "bu hangi dilde" sorusunu ve ürün sayfasının dil süzgecini karşılar.

**Tekillik:** `(customer_id, product_id, context)` — aynı ürüne bir müşteriden tek kayıt; ikinci kez alan müşteri görüşünü GÜNCELLER. Ziyaretçi kaydırmasında (`customer_id` null) tekillik yoktur ve olamaz: tekilleştirmek kimlik tutmayı gerektirirdi. Aday talep panosundaki sayı bu yüzden mutlak bir "kişi" değil, ilgi yoğunluğudur (`postal_code_demand` ile aynı kabul).

## FeedbackRequest (geri bildirim daveti)

Teslim sonrası (~10 gün) swipe/yorum daveti; tamamlayınca ödül kuponu (bkz. `DOMAIN.md §14`).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| order_id | uuid | |
| customer_id | uuid | |
| token | text | **unique** — davet bağlantısının anahtarı; tahmin edilemez (rastgele), oturum yerine geçer |
| channel | enum(`email`,`whatsapp`) | davetin gittiği kanal |
| sent_at | timestamptz \| null | |
| completed_at | timestamptz \| null | |
| points_awarded | int \| null | tamamlayınca verilen puan (`PointsEntry`); puanlar sonra kişisel kupona çevrilir |

**İlerlemenin bağı:** davetten doğan her değerlendirme `ProductFeedback.feedback_request_id` ile buraya bağlanır; "2/5" o bağdan türetilir (`feedback_request_progress`).

**Token neden var:** davet e-posta/WhatsApp'tan gelir ve telefonda tek elle açılır — araya giriş ekranı koymak akışı kırar. Bağlantının kendisi kimlik taşır. Bu yüzden `reference_no` ile aynı kural geçerlidir: **rastgele**, sıralı değil — sıralı olsaydı bir davet linkinden komşusunun siparişine geçilebilirdi.

**Yarıda bırakma ayrı alan istemez:** "2/5" ilerlemesi tamamlanmış değerlendirmelerden türetilir (siparişin kalemleri ↔ o kalemler için düşmüş beğeni/yorum). `completed_at` yalnız akışın sonuna basılır ve puanın **tek kez** verilmesini o sağlar.

## NeighborInvite (komşu daveti)

Rota-içi siparişi olan müşterinin komşusunu **aynı sefere** çağırdığı bağlantı (17.10, migration 0044). Getiren davetinden (`user_profiles.referred_by`) AYRI bir kavram: o **hesapsız birini müşteri yapmayı** ödüllendirir ve kimlik eksenlidir; bu **var olan bir sefere ikinci sipariş eklemeyi** ödüllendirir ve sefer eksenlidir. Davet edilen kişi zaten müşterimiz olabilir (kullanıcı kararı 11.08).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| token | text | **unique** — bağlantının anahtarı; sipariş referansıyla aynı okunabilir alfabe, CSPRNG |
| inviter_id | uuid | daveti açan müşteri (`restrict` — kazanılmış ödülün kaynağı) |
| order_id | uuid | **unique** — davetin doğduğu sipariş; "hangi sefer" sorusunun kaynağı |
| delivery_zone_id | uuid | seferin bölgesi |
| delivery_date | date | sefer günü |
| max_uses | int | kaç komşu kullanabilir (varsayılan 3, 1–20) |
| created_at | timestamptz | |

**Sefer ayrı bir varlık DEĞİL:** rota günü zaten `(delivery_zone_id, delivery_date)` ikilisiyle tanımlı (`order` + `delivery_zone`) ve kurye ekranı da siparişleri bu ikiliyle topluyor. Ayrı bir `trip` tablosu, bugün türetilen bir gerçeği saklamak ve iki kaynağın bir gün ayrışmasını göze almak olurdu.

**İkili KOPYALANIYOR ve bu bilinçli bir snapshot istisnası:** siparişin bölgesi ya da günü operasyonda değişebilir, oysa komşuya SÖZ VERİLEN gün davetin doğduğu gündür. Canlı bağ olsaydı, komşunun tıkladığı bağlantı ertesi gün başka bir günü gösterirdi — ve kimse fark etmezdi.

**Kullanım sayılmaz, türetilir:** azalan bir sayaç yok; kullanım o daveti künyesinde taşıyan siparişlerdir (`order.neighbor_invite_id`, iptaller elenir). Sayaç tutulsaydı iptal edilen siparişte elle geri alınması gerekirdi ve biri mutlaka unuturdu — defterin ve para hareketlerinin aynı kuralı.

**Güncelleme yolu yok:** davet doğduğu andaki seferin fotoğrafıdır. Günü ya da sınırı sonradan değiştirilebilseydi, paylaşılmış bir bağlantının sözü sahibinin haberi olmadan değişirdi. Yanlış açılmış davet düzeltilmez — süresi geçer ya da yenisi açılır.

**Geçerlilik saklanmaz, hesaplanır:** davet, seferin gününe ve **kesim saatine** bakılarak açık/kapalı sayılır (`deliveryRunWindow`, `order_cutoff_time` ayarı). `expires_at` kolonu bilerek yok — kesim saati ayarlanabilir bir değer ve saklanan bir son kullanma anı, ayar değiştiği gün yalan söylerdi.

## NeighborInviteClaim (kabul edilmiş komşu daveti)

Davetin **kişiye yapıştığı** yer (kullanıcı sorusu 12.08: *"web'de hesap açsın, gezsin, sonra uygulamayı yüklesin — sepete geldiğinde daveti görebilmeli"*). Çerez yalnız kimliği olmayan ziyaretçinin köprüsüdür; kimlik doğduğu an kabul buraya geçer.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| invite_id | uuid | hangi davet (`NeighborInvite`) |
| customer_id | uuid | kabul eden müşteri |
| created_at | timestamptz | |

**Tekillik `(invite_id, customer_id)`:** aynı kişi aynı daveti bir kez kabul eder; ikinci tıklama yeni satır açmaz.

**Neden profilde bir kolon değil:** getiren daveti (`referred_by`) ömürde bir kezdir; komşu daveti bir SEFERE bağlıdır, tekrarlanır ve **aynı kişiyi iki komşusu iki ayrı sefere çağırabilir**. Tek kolon o hâlde veri kaybettirir.

**Durum kolonu YOK — "bekliyor" türetilir:** o daveti künyesinde taşıyan (iptal olmayan) sipariş yoksa ve seferin penceresi hâlâ açıksa. İkisi de zaten başka yerde ölçülüyor; üçüncü bir damga, iptal edilen siparişte elle geri alınacak bir durum daha demekti.

**Satır silinmez:** kabul olmuş bir olaydır ve "kaç davet kabul edildi, kaçı siparişe döndü" sorusunun tek kaynağıdır. Hesap silinirse `cascade` ile düşer (kişisel veri, 0037).

## PointsEntry (puan hareketi)

Oyunlaştırma/sadakat: müşteri aksiyonları puan kazandırır, biriken puan kişisel kupona çevrilir. Ledger; bakiye **türetilir** (Σ points).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| customer_id | uuid | |
| points | int | +kazanım / −harcama (delta) |
| reason | enum(`review`,`feedback_purchase`,`feedback_candidate`,`order`,`referral`,`neighbor`,`visit`,`redemption`,`manual`) | bağlam adları `ProductFeedback.context` ile **hizalı** — aynı olayı iki sözlükle adlandırmamak için |
| ref_id | uuid \| null | ilgili kayıt (review/order/discount…) |
| note | text \| null | serbest sebep — **yalnız `manual`'da**: "gecikme telafisi — jest" |
| created_by | uuid \| null | elle girişte personel; sistemin verdiği puanda boş |
| created_at | timestamptz | |

Puan bakiyesi = Σ `points` (saklanmaz, türetilir). Kupona çevirme: `redemption` (negatif) + kişisel `Discount` (`customer_id`).

**Elle düzeltme iz bırakır:** operasyon ekranı "± puan + sebep" ister; sebep yazılmadan kayıt olmaz. `reason` neden verildiğinin **sınıfıdır**, `note` o tek olayın hikâyesidir — ikisi ayrı sorular, biri diğerinin yerini tutmaz.

**İstismar tavanı defterin kendisinde:** "aynı ürüne bir kez" kuralı `(customer_id, reason, ref_id)` üzerinde kısmi unique indeksle durur — uygulama katmanı unutsa bile ikinci puan yazılamaz. Günlük tavan sayımla bakılır (aynı gün, aynı sebep).

**İki davet, iki sebep ve ikisi AYNI turda doğabilir** (17.10): hesapsız bir komşu, komşu bağlantısından gelip kaydolur ve sipariş verirse davet eden hem `referral` (bir müşteri kazandırdı) hem `neighbor` (bir sefere sipariş ekletti) kazanır. Çift ödeme değildir — iki farklı şey oldu. Kaynakları da ayrı: `referral`ın `ref_id`si yeni MÜŞTERİ, `neighbor`ınki komşunun SİPARİŞİ.

## Ticket (müşteri talebi / şikâyet)

Basit yaşam döngüsü; siparişe ve ürünlere isteğe bağlı bağlanır (bkz. `DOMAIN.md §15`).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| customer_id | uuid | |
| order_id | uuid \| null | siparişle ilgiliyse |
| order_item_ids | uuid[] | ilgili sipariş kalemleri (boş olabilir) |
| conversation_id | uuid \| null | WhatsApp'tan açıldıysa |
| source | enum(`order`,`form`,`whatsapp`,`admin`) | **geliş yolu**: sipariş detayından / genel formdan / WhatsApp'tan / personelin elle açtığı |
| type | enum(`damaged`,`missing`,`question`,`other`) | bozuk / eksik / soru / diğer |
| status | enum(`open`,`in_progress`,`resolved`) | yeniden açılabilir → `open` |
| handled_by | enum(`human`,`ai`) | talebi kim yürütüyor; devralmada `human`'a döner ve AI o talepte susar |
| subject | text \| null | kısa başlık |
| return_triggered_at | timestamptz \| null | admin bu talepten iade akışını başlattı |
| created_at / resolved_at | timestamptz | |

**Geliş yolu `conversation_id`'den türetilemez:** konuşma bağı yalnız WhatsApp'ı ayırır; "sipariş detayından geldi" ile "genel formdan gelip sipariş seçti" ikisi de `order_id` dolu bırakır, ama admin için farklı şeylerdir — birincisinde müşteri neyden şikâyet ettiğini biliyordu, ikincisinde aradı buldu.

**`handled_by` Faz 1'de de var, AI olmadan.** Alan bugün hep `human`'dır; ama kuyruk ekranı "AI yürütüyor / devralındı" ayrımını **baştan** çizer (`16.5` sonra gelir). Alanı sonra eklemek, o güne kadar yazılmış her talebin geçmişini belirsiz bırakırdı.

**İade sonucu SAKLANMAZ, türetilir:** tutar ve durum siparişin iade hareketlerinden okunur (`MoneyMovement.order_refund`, `OrderItem.fulfilled_qty`). Talepte duran tek şey **tetiğin çekildiği an**dır — o da türetilemez, çünkü bir siparişe birden çok talep açılabilir ve iadeyi hangisinin doğurduğu ancak yazılırsa bilinir. İade **siparişte yaşar**, talep ona bağlanır (DOMAIN §8, §15).

**Kuyruk sırası (`son mesaj: bugün`) saklanmaz:** `max(ticket_message.created_at)` tam ve tek-anlamlıdır → okuma görünümünde türetilir (`ticket_queue`), tabloya kopyalanmaz. Aynı desen: `available_stock`, `order_sale`, `product_listing`.

## TicketMessage (talep yazışması)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| ticket_id | uuid | |
| sender | enum(`customer`,`admin`,`ai`) | **`ai` ayrı bir göndericidir** — insanınkinden ayırt edilmeden gösterilemez |
| author_id | uuid \| null | yazan personel (`admin`); müşteri ve AI mesajında boş |
| body | text | |
| language | text \| null | metnin GERÇEK dili (ISO 639; enum değil — müşteri Boşnakça yazabilir). `null` = tespit koşmadı |
| translations | jsonb \| null | makine çevirileri `{tr?,fr?,de?}` — **kaynak dil torbada YOKTUR** |
| translated_at | timestamptz \| null | çeviri işi baktı mı; **başarısızlıkta da dolar** (sonsuz retry yok) |
| attachments | text[] | storage yolu (fotoğraf vb.) |
| created_at | timestamptz | |

**Yazışma İKİ YÖNLÜ çevrilir (20.2):** müşteri kendi dilinde yazar personel Türkçe okur, personel Türkçe yazar müşteri kendi dilinde okur. Tek yön çevirmek yazışmanın yarısını anlaşılmaz bırakırdı. Orijinal `body`'de kalır, çeviri yanına yazılır — makine çevirisi hiçbir zaman yazanın cümlesi sanılamaz. Gösterim `resolveUserText` (domain-core): site dili → yoksa orijinal.

**Mesajda "metin değişti, çeviriyi düşür" tetikleyicisi YOK ve gerekmiyor:** gönderilmiş mesaj değişmez — güncelleyen bir yol yok, yazışma bir defterdir. `TicketMessageService`'in güncelleme şeması bu yüzden DAR (`TicketMessageTranslationUpdate`: yalnız çeviri alanları); `body` orada olmadığı için "mesajı düzelt" demek isteyen bir kod derlemede durur.

**Neden `ai` üçüncü bir gönderici:** "AI yazdı" bilgisini `admin` içine gömmek, sonradan "bunu kim söyledi" sorusunu cevapsız bırakırdı. Müşteriye giden metin aynıdır; ayrım **iç izlenebilirlik** içindir ve admin ekranında görünür (tasarım: "AI'nın yanıtları admin'e kendi yazmış gibi gösterilmez").

**İç not yok — bilerek.** Yazılan her şey müşteriye aynen görünür; ekran bunu söyler ("aynen müşteriye görünür"). İç notu aynı diziye koymak, bir gün yanlış kutuya yazılmış bir marj cümlesinin müşteriye gitmesi demektir. İç değerlendirme gerekiyorsa ayrı bir mekanizma ister, bu dizi değil.

## Setting (işletme ayarı)

**Tablo adı `settings`** (çoğul — orada bir ayar değil, ayarlar durur; satır tipi tekil: `Setting`).

Parametrik değerler **env'e veya koda gömülmez** (blueprint STACK §10): kesim saati, eşikler ve tavanlar işin sahibinin kararıdır ve dağıtım beklemeden değişebilmelidir.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| key | string | ör. `order_cutoff_time` |
| scope_type | enum(`global`,`channel`,`zone`,`country`,`warehouse`) | Üç kaynak 03.08'de HİZALANDI (migration haklı sayıldı). Çözüm sırası **en özgülden en genele: `warehouse` > `zone` > `channel` > `country` > `global`** — depo bölgeden dardır (bir bölge tek depoya bağlıdır, bir depo çok bölgeye hizmet eder); sıra ters olsaydı bölge satırı depo satırını sessizce ezerdi. Gerekçe ölçüm doğruluğu: rota/paketleme birim maliyeti ve kesim saati depo başına farklılaşır, global kalırsa kâr sessizce yanlışlaşır (`0016` künyesi). Ayarlar ekranı (09.16) ekseni henüz SUNMUYOR — kablolama operasyon şeridinde, gerekçe `settings-catalog.ts` künyesinde |
| scope_id | string \| null | kanal `b2b`, ülke `FR`, bölge uuid; global'de null. Üç farklı tipi taşıdığı için metin |
| value | jsonb | ayar sayı, metin, saat, bayrak ya da nesne olabilir |
| description | string \| null | admin ekranında ne işe yaradığı |
| updated_at | timestamptz | |
| updated_by | uuid \| null → user_profiles | Değişikliğin AKTÖRÜ (09.16). **`null` = "sistem kurdu", "bilinmiyor" DEĞİL** — tohum satırlarını kimse değiştirmedi; ekran boş aktörü "sistem varsayılanı" diye okur, uydurma isim yazmaz. `set(…, { actorId })` opsiyonel, çünkü ayar yazan her şey insan değil (tohum, göç, iş süreçleri) ve onlara sahte aktör atamak, izi *güvenilir sanılan* bir yalana çevirirdi. `on delete set null`: ayrılan personel izi götürür, ayarı değil |

**Kapsamlı (scoped) çözüm:** aynı anahtar depoya/bölgeye/kanala/ülkeye göre farklılaşabilir; çözücü **en özgül** kapsamı seçer (depo > bölge > kanal > ülke > global), yoksa global'e düşer. Hiç satır yoksa **çağıranın verdiği varsayılana** düşülür — varsayılan koda gömülü kalmaz, çağrı yerinde görünür. Aynı anahtar + aynı kapsam iki kez tanımlanamaz (kısmi unique indeks). Önbellekli çözücü; yazmada önbellek düşer.

**İSTİSNA — KOŞUL ayarlarında en KATISI kazanır** (kullanıcı kararı 09.08, `SettingsService.STRICTEST_WINS`; bugün tek üye `min_basket_cents`). Sebebi bir ölçümle görüldü: bu anahtarın iki satırı **rakip değil, birlikte karşılanması gereken iki koşul**tur — `channel: b2b` 120 € bir **ticari şarttır** (toptan fiyat vermenin karşılığı; mesafeyle ilgisi yok), bölge satırı ise bir **lojistik tabandır** (aracın o tura çıkması anlamlı olsun). "En dar kazanır" bunları rakip sayıp bölgeyi kanalın önüne geçiriyordu ve o bölgedeki işletme müşterisi 120 € yerine 45 € ile toptan fiyat alabiliyordu. Kural bugüne dek görünmüyordu, çünkü `zoneId` hiçbir çağırandan geçmiyordu (07.15); bağlandığı gün ortaya çıktı.

Ödünleşme açıkça yazılı: bu anahtarlarda bir eşiği dar kapsamda **yükseltebilir ama düşüremezsiniz**. **Fiyat ayarları listede DEĞİL** (`shipping_fee_cents`): orada kapsam "hangi tarife" sorusunun cevabıdır — Alman müşteri Almanya tarifesini öder, "en pahalısını" değil.

**İKİNCİ İSTİSNA — kargo siparişinde okuma KANALLA sınırlıdır** (kullanıcı kararı 10.08, `ScopeLimit.only`). Yukarıdaki iki koşuldan biri teslimat yoluna bağlı: **lojistik taban kargoda yoktur** (araç çıkmaz, taşıyıcı gider ve ücretini müşteri öder), **ticari şart ise her yolda geçerlidir**. Kapsam düşürerek çözülemiyordu — `zoneId`yi boş geçmek bölge satırını eler ama **küresel satır her zaman eşleşir**, yani operatör küresel bir eşik yazdığı gün kargo siparişleri sessizce ona takılırdı. Kural artık kodda: kargo yolunda okunan tek satır kanalın kendisidir (`application/cart/min-basket.ts`, dört birim testi). Bu güvence sayesinde taban küresel satıra yazılabildi — bölge bölge tekrarlanması gerekmiyor.

**Yüklü varsayılanlar** (migration'ın kendisinde — test verisi değil, sistemin zemini; `db:reset` sonrası seed çalışmasa da yerinde olmalı). Para değerleri **cent**, yüzdeler tam sayı:

| Anahtar | Varsayılan | Ne işe yarar |
| --- | --- | --- |
| `reservation_ttl_minutes` | 30 | Checkout rezervasyon + ödeme + fiyat penceresi (Stripe oturum asgarisi; altına inilemez) |
| `order_cutoff_time` | `"16:00"` | Sonrasında gelen sipariş bir SONRAKİ rota gününe yazılır |
| `min_basket_cents` | 4000 | Asgari sepet — **yalnız kapıya teslim** için lojistik taban; kargoda uygulanmaz (0 = alt sınır yok) |
| `free_shipping_threshold_cents` | 6000 | Ücretsiz kargo eşiği |
| `shipping_fee_cents` | 790 | Eşik altı kargo ücreti (KDV'ye tabi) |
| `cod_max_cents` | 30000 | Kapıda ödeme genel tavanı (kötüye kullanım freni) |
| `cash_legal_limit_cents` | 100000 | Nakit yasal sınırı — aşımda UYARI, engel değil |
| `payment_term_days` | 30 | Vade süresi varsayılanı |
| `near_expiry_percent` | 25 | Yaklaşan son tarih eşiği (kalan raf ömrü %) |
| `near_expiry_discount_percent` | 30 | Önerilen near-expiry indirimi — karar insanın |
| `mlor_percent` | 75 | Mal kabulde asgari kalan raf ömrü %; altında uyarır, engellemez |
| `delivery_proof_required` | `{"b2b":true,"b2c":false}` | Teslim onayı kapsamı |
| `delivery_summary_email` | true | Teslimde özet e-postası otomatik gitsin mi |
| `route_delivery_unit_cost_cents` | 250 | Rota teslimat birim maliyeti (kâr hesabı) |
| `packaging_unit_cost_cents` | 120 | Paketleme birim maliyeti (kâr hesabı) |
| `door_packaging_unit_cost_cents` | 0 | Kapı önü satışta paketleme birim maliyeti — mal elden gidiyor, soğuk zincir paketi yok |

Oyunlaştırma (puan değerleri, puan→kupon eşiği) ve ödeme komisyon oranları ilgili modülleriyle eklenir.

> **Bu varsayılanları DEĞİŞTİRENE not (03.08).** Sayılar artık üç yerde yaşıyor: migration (`0016` ·
> `0037` · `0038`), yukarıdaki tablo ve Ayarlar ekranının sözlüğü (`settings-catalog.ts` —
> ekran "varsayılan 20,00 €" yazıp "Varsayılana dön" sunduğu için fabrika değerini bilmek zorunda;
> satır düzenlenince o değer veride kalmıyor). Üçüncüsü **nöbete bağlı**: `settings-catalog.test.ts`
> migration dosyalarını okuyup her anahtarı karşılaştırıyor, ayrışırsa test düşer ve hangi anahtar
> olduğunu söyler. Yani migration'daki bir sayıyı değiştirmek serbest — testin söylediği yeri de
> güncelleyin, yoksa ekran yalan bir "varsayılan" gösterir. Bu tablo nöbetin dışında; elle tutulur.
