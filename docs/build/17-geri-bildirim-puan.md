# 17 — Geri Bildirim, Yorum ve Puan

## Kapsam

Değerli veri toplarken müşteriyi ödüllendiren döngü: yorum + beğeni + ürün skoru (**tek varlık: `ProductFeedback`**), alım-sonrası ve keşif kaydırması, puan/oyunlaştırma, kişisel kupon. Tümü Faz 1 (tasarım baştan kapsar). Kritik ilke: **ödül ≠ güven** — müşteri puanını alır ama kalitesiz sinyal analizi bozmaz.

## Okunacaklar

- `DOMAIN.md §14` (geri bildirim/yorum/puan/ürün skoru — tamamı)
- `data-model/iletisim-geribildirim.md` (**ProductFeedback** — yorum+beğeni tek varlıkta / FeedbackRequest / PointsEntry)

## Bağımlılık

`07-siparis` (satın alma doğrulaması), `14-bildirim` (davet link'i), `05-katalog` (ürün sayfası yorum/skor gösterimi).

**13-analitik bağımlılığı KALKTI (29.07):** beğen/geç `ProductFeedback`'e taşındığı için bu modülün analitik tablosuna ihtiyacı yok. Sinyal ağırlıklandırması (13.6) analitik ekranının işidir ama veriyi buradan okur.

## Başlarken verilecek izah (örnek)

> "Müşteri geri bildirim ve puan sistemini kuruyoruz. Satın alan müşteri yorum yazabiliyor (moderasyondan sonra ürün sayfasında görünüyor), teslimden ~10 gün sonra 'aldıklarını beğendin mi' anketi gidiyor, keşif bölümünde olmayan ürünleri sağa-sola kaydırıyor. Her değerli aksiyon puan kazandırıyor, biriken puan kişisel indirim kuponuna dönüyor. Önemli incelik: müşteri katılımı için puanını alıyor, ama hep aynı yöne savurma gibi kalitesiz sinyaller iş kararımızı bozmasın diye analizde zayıflatılıyor."

## Görevler

- [~] (17.1) **Yorum + ürün skoru (`ProductFeedback`):** yalnız satın alan yazar; moderasyon (onay/ret) → ürün sayfasında gösterim; **ürün skoru türetimi** (yorum ortalaması + beğen/beğenme oranı)
  - *Bitti:* onaysız yorum görünmüyor; ürün skoru türeniyor (05 ürün sayfasına besleniyor)
  - **Durum (29.07):** **arka uç hazır** — `0036_product_feedback.sql` (tablo + `product_rating` + `candidate_demand` görünümleri), motor `domain-core/feedback/feedback-score`, servisler `ProductFeedbackService`/`ProductRatingService`/`CandidateDemandService`, kapılar `apps/web/lib/feedback/product-feedback.ts`. 42 test (13 motor + 29 entegrasyon).
    - **Üç kapı kodda:** *satın almayan yazamaz* (kapı siparişleri okuyup `order_id`'yi kendisi yazar — DB bunu zorlayamaz, motor da bilemez), *onaylanmayan görünmez* (yayın okuması durum parametresi ALMAZ), *moderasyon metnin işidir* (metinsiz kayıt kuyruğa düşmez, `nothing_to_read`).
    - **Beğen/geç `AnalyticsEvent`'ten alındı** (bkz. `DATA_MODEL.md` "İZ ile BEYAN ayrı yaşar"): yorum, yıldız ve beğeni tek varlıkta — `discount`'ın kupon+kampanyayı tek tabloda tutmasıyla aynı gerekçe.
    - **Skor iki ayaklı ve sayı-ağırlıklı:** beğeni oranı 1–5'e eşlenip yıldız ortalamasıyla harmanlanır. Sabit ağırlık ikisinden birini ezerdi — 5 yorumlu 60 beğenili üründe sonucu beğeniler, 40 yorumlu 3 beğenili üründe yıldızlar belirlemeli. Katsayı motorda tek yerde, parametrik.
    - Veri modeline göre değişiklikler: `status` üç hâlli, `language` (yorum **çevrilmez**), `vote`/`context`/`dwell_ms`/`feedback_request_id`; `customer_id` **nullable** (ziyaretçinin keşif kaydırması sayılır ama puan doğurmaz, tekilleştirilemez).
    - Eksik: ürün sayfası yorum paneli (müşteri UI) ve operasyon moderasyon kuyruğu ekranı.
- [~] (17.2) **FeedbackRequest cron:** teslim +10 gün (taramalı-idempotent); WhatsApp/e-posta link'iyle davet; tamamlanma izlenir
  - *Bitti:* teslimden 10 gün sonra davet gidiyor; tekrar tetiklenmiyor
  - **Durum (29.07):** **arka uç hazır** — `0038_feedback_request.sql` (tablo + `feedback_request_progress` görünümü), `createDueFeedbackRequests` (taramalı-idempotent; teslim anı `order_status_log`'dan türetilir), `openFeedbackInvite`/`completeFeedbackInvite` (`lib/feedback/invite.ts`). 13 test.
  - **Zamanlayıcı takıldı (29.07):** iş `apps/backend/src/jobs/feedback-requests.ts`'e taşındı ve **günde bir, 09:00 Paris** koşuyor (06.4'ün `runJob` kabuğu + `job_run` izi). **Neden web'de değil:** bunu tetikleyen istek değil saat; web'de kalsaydı sırf zamanlayıcı erişsin diye korunması gereken bir HTTP ucu gerekirdi. Sıklık günlük çünkü eşik gün cinsinden (saat başı tarama aynı satırları 24 kez okurdu); SAAT müşteri için — davet gecenin ikisinde düşmesin. Web yalnız daveti **açar ve tamamlar**. Gönderim kuyruğu (`listPendingInvites`) da orada; şablonu bekliyor (14).
    - **Davet oluşturulur, sonra gönderilir** — iki ayrı adım: e-posta sağlayıcısı düştüğünde davet kaybolmaz, `sentAt` boş olarak kuyrukta kalır (`listPendingInvites`).
    - **Token oturum yerine geçer** (16 karakter, sipariş referansıyla aynı okunabilir alfabe): davet telefonda tek elle açılır, araya giriş ekranı akışı kırardı.
    - **İlerleme ("2/5") türetilir**, saklanmaz; yarıda bırakılan akış kaldığı yerden devam eder.
    - Eksik: (a) davet e-postası/WhatsApp şablonu (modül 14); (b) müşteri yüzeyi kart akışı.
- [~] (17.3) **Kaydırma akışları:** alım-sonrası memnuniyet (`context='purchase'`) + aday ürün keşif (`context='candidate'`) → `ProductFeedback(vote, dwell_ms)`; sinyal kalite ağırlığı domain-core'da
  - *Bitti:* beğeni kaydediliyor ve ürün skoruna giriyor; düşük kaliteli kaydırma analizde zayıf
  - **Durum (29.07):** **arka uç hazır** — `recordVote` iki bağlamı da yazıyor (`purchase` satın almayı, `candidate` ürünün aday olduğunu doğrular), `dwell_ms` toplanıyor.
    - **Sinyal kalitesi yazıldı** (`domain-core/feedback/signal-quality`): ağırlık = kart süresi × kaydıranın deseni. 400 ms altı kart görülmemiştir (sıfır ağırlık); hep aynı yöne savuran bilgi taşımaz (azınlık payı ölçüsü, 5 kaydırmadan az ise desen aranmaz). `listCandidateDemand` ham beğeniyi ve **ağırlıklı** beğeniyi yan yana verir, sıralama ağırlıklıya göre — 40 savurma beğenisi 8 gerçek beğeniyi geçemez. `trust` göstergesi tasarımın istediği "sade güven göstergesi".
    - **Müşterinin puanı bundan etkilenmez** (ödül ≠ güven): kalitesiz kaydırma da ödülünü alır.
    - Eksik: keşif ve alım-sonrası kart ekranları (müşteri UI).
- [x] (17.4) **Puan (PointsEntry):** aksiyonlara puan (yorum/swipe/sipariş); bakiye **türetilir** (Σ points); tavanlar (aynı ürüne bir kez + günlük), B2C-only, süresiz; puan tamamlamaya bağlı (beğeniye değil)
  - *Bitti:* bakiye ledger'dan türeniyor; istismar tavanları çalışıyor
  - **Durum (29.07):** `0037_points.sql` (defter + `customer_points_balance` görünümü + 8 parametrik ayar), motor `domain-core/feedback/points`, servisler, kapılar `lib/feedback/points.ts`. 22 test.
    - **Defter, sayaç değil:** bakiye Σ ile türer; `MoneyMovement` ↔ hesap bakiyesiyle aynı desen. `update`/`delete` yok — defter satırı düzeltilmez, karşı kayıt yazılır.
    - **Tavan defterin kendisinde:** "aynı kaynaktan iki kez puan yok" `(müşteri, sebep, kaynak)` kısmi unique indeksiyle; uygulama unutsa da yazılamaz. Günlük tavan **kısmi uygulanmaz** — ya tamamı ya hiç, çünkü tekillik yüzünden müşteri yarın telafi edemezdi.
    - **Ödül asıl işlemi durdurmaz:** puan sessiz yazılır; B2B olmak ya da tavana takılmak yorumu geri çevirmez (DOMAIN §14).
    - Puan değerleri parametrik: yorum 20 · alım-sonrası beğeni 5 · keşif kaydırması 2 · sipariş 10 · getiren 50 · günlük tavan 100. Ölçek 1 puan = 1 cent ("500 puan = 5 €" anlatılabilir bir cümledir).
- [x] (17.5) **Redemption:** müşteri isteyince puan → kişisel `Discount` (`customer_id`) RPC (PointsEntry negatif + kupon tek transaction)
  - *Bitti:* çevirme atomik; puan düşüyor, kişisel kupon oluşuyor
  - **Durum (29.07):** `redeem_points` RPC — puan düşümü ve kuponun doğuşu **tek transaction**; ayrı olsalardı ikincisi düştüğünde müşterinin puanı gider, kuponu doğmazdı. Bakiye bir SATIR değil TOPLAM olduğu için kilit **advisory**'dir (`for update` agregatla çalışmaz): müşteri başına serileştirme, farklı müşteriler birbirini beklemez.
    - Kupon **sabit tutarlı** (yüzde değil): aynı puan farklı sepetlerde farklı değer etseydi "500 puan = 5 €" yalan olurdu. Kişisel + tek kullanımlık.
    - Kod motorda üretilir (`PUAN-7K4M2P`, sipariş referansıyla **aynı okunabilir alfabe**), benzersizliği veritabanı söyler — çakışmada yeniden denenir.
- [x] (17.6) **Dış değerlendirme köprüsü:** anket sonunda memnun müşteri halka açık değerlendirme sayfasına tek-tık yönlendirilir
  - *Bitti:* yüksek memnuniyette değerlendirme linki sunuluyor
  - **Durum (29.07):** `feedbackOutcomeOf` — üç çıkış: `review_invite` · `report_issue` · `thanks`. **Memnun olmayan dışarı yönlendirilmez** (tasarım §6): onun yolu talep girişidir. Ölçüt beğeni ORANIDIR (eşik %80, parametrik), tek bir yıldız değil — bir üründen hoşlanmamak siparişten memnun olmamak değildir. `review_platform_url` ayarı boşsa davet hiç gösterilmez; uydurma adrese yönlendirmektense teşekkürle biter. **Ekran tarafı müşteri UI'ında.**
  - **Platform ayarda, kodda değil (29.07, kullanıcı sorusu üzerine):** görev başta "Google" diyordu ve motor `google_review` döndürüyordu. Kullanıcı fiziksel mağaza olmadığı için Trustpilot'u sordu → doğru ayrım şu: **Google bulunmayı, Trustpilot güveni** artırır ve ikisi de aynı kuralın ucuna takılır. Vendor adı motordan çıkarıldı; `review_platform_url` + `review_platform_name` ayarlarıyla geçiş **iki satır güncelleme**. Varsayılan Google — teslimat Strasbourg bölgesine rota/bölge ile yapıldığı için iş yereldir ve Google'ın "hizmet bölgesi" (SAB) kaydı mağazasız işletme için tasarlanmıştır. Gerekçe `DOMAIN §14`'te.
- [~] (17.7) **Referral zemini:** `referred_by` yazımı (kayıtta); `PointsEntry.reason=referral` hazır (bağ ileride)
  - *Bitti:* getiren müşteri kaydediliyor
  - **Durum (29.07):** `awardReferralPoints(newCustomerId)` hazır — `referred_by` doluysa getirene bir kez puan yazar. Kaynak (`ref_id`) YENİ müşterinin kimliğidir: tekillik "aynı kişiyi iki kez getiremezsin" demeli. Eksik: **kayıt akışında `referred_by` yazımı** (04) ve davet bağlantısı üretimi.

## Netleşecekler

- **Puan değerleri:** hangi aksiyona kaç puan, puan→kupon oranı/eşiği — `Setting`'te parametrik; başlangıç değerleri iş kararıyla konur (kurgu hazır, rakam sonra).
