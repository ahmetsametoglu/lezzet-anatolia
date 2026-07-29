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
- [ ] (17.2) **FeedbackRequest cron:** teslim +10 gün (taramalı-idempotent); WhatsApp/e-posta link'iyle davet; tamamlanma izlenir
  - *Bitti:* teslimden 10 gün sonra davet gidiyor; tekrar tetiklenmiyor
- [~] (17.3) **Kaydırma akışları:** alım-sonrası memnuniyet (`context='purchase'`) + aday ürün keşif (`context='candidate'`) → `ProductFeedback(vote, dwell_ms)`; sinyal kalite ağırlığı domain-core'da
  - *Bitti:* beğeni kaydediliyor ve ürün skoruna giriyor; düşük kaliteli kaydırma analizde zayıf
  - **Durum (29.07):** **veri ve kapı hazır** — `recordVote` iki bağlamı da yazıyor (`purchase` satın almayı, `candidate` ürünün aday olduğunu doğrular), `dwell_ms` toplanıyor, aday talep panosu `candidate_demand` görünümünden okunuyor (kimlikli beğeniler ayrı sayılır — "kaç kaydırma" ile "kaç kişi" farklı sorulardır). Eksik: (a) keşif ve alım-sonrası kart ekranları (müşteri UI), (b) **sinyal kalite ağırlıklandırması** — `dwell_ms` ve desen toplanıyor ama zayıflatma motoru henüz yazılmadı.
- [ ] (17.4) **Puan (PointsEntry):** aksiyonlara puan (yorum/swipe/sipariş); bakiye **türetilir** (Σ points); tavanlar (aynı ürüne bir kez + günlük), B2C-only, süresiz; puan tamamlamaya bağlı (beğeniye değil)
  - *Bitti:* bakiye ledger'dan türeniyor; istismar tavanları çalışıyor
- [ ] (17.5) **Redemption:** müşteri isteyince puan → kişisel `Discount` (`customer_id`) RPC (PointsEntry negatif + kupon tek transaction)
  - *Bitti:* çevirme atomik; puan düşüyor, kişisel kupon oluşuyor
- [ ] (17.6) **Google yorum köprüsü:** anket sonunda memnun müşteri Google işletme yorumuna tek-tık yönlendirilir
  - *Bitti:* yüksek memnuniyette Google linki sunuluyor
- [ ] (17.7) **Referral zemini:** `referred_by` yazımı (kayıtta); `PointsEntry.reason=referral` hazır (bağ ileride)
  - *Bitti:* getiren müşteri kaydediliyor

## Netleşecekler

- **Puan değerleri:** hangi aksiyona kaç puan, puan→kupon oranı/eşiği — `Setting`'te parametrik; başlangıç değerleri iş kararıyla konur (kurgu hazır, rakam sonra).
