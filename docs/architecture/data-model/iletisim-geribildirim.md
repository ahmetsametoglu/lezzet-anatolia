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

## Message (mesaj)

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

Cookie'siz, sunucu-tarafı, toplu ölçüm (bkz. `FEATURES.md` Analitik). Kişisel kimlik yok; giriş yapılmışsa `customer_id` opsiyonel.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| type | enum(`page_view`,`product_view`,`add_to_cart`,`checkout_start`,`order_placed`,`share`,`search`) | |
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
| meta | jsonb \| null | tipe özel (ör. `search`: `{query, result_count}` — sıfır-sonuç aramalar talep/çeşit sinyali) |
| created_at | timestamptz | |

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
| language | enum(`tr`,`fr`,`de`) \| null | metnin dili — **çevrilmez**; metinsiz kayıtta boş |
| dwell_ms | int \| null | kartta geçirilen süre — **sinyal kalitesi** için (yalnız kaydırmada) |
| feedback_request_id | uuid \| null | alım-sonrası davetten geldiyse (`FeedbackRequest`) |
| status | enum(`pending`,`approved`,`rejected`) | **moderasyon yalnız METİN içindir**; metinsiz kayıt doğrudan `approved` doğar |
| moderated_at / moderated_by | timestamptz \| null / uuid \| null | kim ne zaman karar verdi (iz) |
| notified_at | timestamptz \| null | **"bu ürün geldi" haberi bu kişiye verildi mi** (17.8 zemini). Aday kaydırması bir TALEP BEYANIDIR; ürün kataloğa girince beyanı yapana haber vermek, keşif turunun karşılığını ödediği andır. **Ayrı "ilgi" tablosu AÇILMADI:** kim hangi ürünü istiyor bilgisi zaten bu satırda (`customer_id` + `product_id` + `vote='like'` + `context='candidate'`) ve `product_feedback_customer_key` onu kişi başına teke indiriyor — ikinci tablo aynı gerçeği iki yerde tutar ve ayrışır. Eksik olan ilgi değil **teslimat muhasebesiydi**. Damga gönderimden SONRA atılır: tersi, gönderim düşerse müşteriyi kalıcı sessizliğe mahkûm ederdi |
| created_at | timestamptz | |

**Neden tek tablo:** ayrımları biçimden ibarettir — müşteri, ürün, tarih, puan kazanımı, "aynı ürüne bir kez" tekilliği, ürün skoruna katkı ve GDPR silme yolu üçünde de aynıdır. `Discount`'ın kuponu ve otomatik kampanyayı tek varlıkta tutmasıyla aynı gerekçe: iki tablo, aynı yedi alanı iki kez tanımlamak ve skoru iki yerden toplamak olurdu.

**En az bir beyan şart:** `rating`, `vote` ve `comment`'tan biri dolu olmalı. Üçü de boşsa ortada bir değerlendirme yoktur.

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

## PointsEntry (puan hareketi)

Oyunlaştırma/sadakat: müşteri aksiyonları puan kazandırır, biriken puan kişisel kupona çevrilir. Ledger; bakiye **türetilir** (Σ points).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| customer_id | uuid | |
| points | int | +kazanım / −harcama (delta) |
| reason | enum(`review`,`feedback_purchase`,`feedback_candidate`,`order`,`referral`,`redemption`,`manual`) | bağlam adları `ProductFeedback.context` ile **hizalı** — aynı olayı iki sözlükle adlandırmamak için |
| ref_id | uuid \| null | ilgili kayıt (review/order/discount…) |
| note | text \| null | serbest sebep — **yalnız `manual`'da**: "gecikme telafisi — jest" |
| created_by | uuid \| null | elle girişte personel; sistemin verdiği puanda boş |
| created_at | timestamptz | |

Puan bakiyesi = Σ `points` (saklanmaz, türetilir). Kupona çevirme: `redemption` (negatif) + kişisel `Discount` (`customer_id`).

**Elle düzeltme iz bırakır:** operasyon ekranı "± puan + sebep" ister; sebep yazılmadan kayıt olmaz. `reason` neden verildiğinin **sınıfıdır**, `note` o tek olayın hikâyesidir — ikisi ayrı sorular, biri diğerinin yerini tutmaz.

**İstismar tavanı defterin kendisinde:** "aynı ürüne bir kez" kuralı `(customer_id, reason, ref_id)` üzerinde kısmi unique indeksle durur — uygulama katmanı unutsa bile ikinci puan yazılamaz. Günlük tavan sayımla bakılır (aynı gün, aynı sebep).

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
| attachments | text[] | storage yolu (fotoğraf vb.) |
| created_at | timestamptz | |

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

**Kapsamlı (scoped) çözüm:** aynı anahtar kanala/bölgeye/ülkeye göre farklılaşabilir; çözücü **en özgül** kapsamı seçer (bölge > kanal > ülke > global), yoksa global'e düşer. Hiç satır yoksa **çağıranın verdiği varsayılana** düşülür — varsayılan koda gömülü kalmaz, çağrı yerinde görünür. Aynı anahtar + aynı kapsam iki kez tanımlanamaz (kısmi unique indeks). Önbellekli çözücü; yazmada önbellek düşer.

**Yüklü varsayılanlar** (migration'ın kendisinde — test verisi değil, sistemin zemini; `db:reset` sonrası seed çalışmasa da yerinde olmalı). Para değerleri **cent**, yüzdeler tam sayı:

| Anahtar | Varsayılan | Ne işe yarar |
| --- | --- | --- |
| `reservation_ttl_minutes` | 30 | Checkout rezervasyon + ödeme + fiyat penceresi (Stripe oturum asgarisi; altına inilemez) |
| `order_cutoff_time` | `"16:00"` | Sonrasında gelen sipariş bir SONRAKİ rota gününe yazılır |
| `min_basket_cents` | 0 | Minimum sepet; 0 = alt sınır yok |
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
