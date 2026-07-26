# 17 — Geri Bildirim, Yorum ve Puan

## Kapsam

Değerli veri toplarken müşteriyi ödüllendiren döngü: yorum + ürün skoru, alım-sonrası ve keşif swipe, puan/oyunlaştırma, kişisel kupon. Tümü Faz 1 (tasarım baştan kapsar). Kritik ilke: **ödül ≠ güven** — müşteri puanını alır ama kalitesiz sinyal analizi bozmaz.

## Okunacaklar

- `DOMAIN.md §14` (geri bildirim/yorum/puan/ürün skoru — tamamı)
- `data-model/iletisim-geribildirim.md` (Review/FeedbackRequest/PointsEntry/AnalyticsEvent product_swipe)

## Bağımlılık

`07-siparis` (satın alma doğrulaması), `13-analitik` (swipe olayı + sinyal kalitesi), `14-bildirim` (davet link'i). `05-katalog` (ürün sayfası yorum/skor gösterimi).

## Başlarken verilecek izah (örnek)

> "Müşteri geri bildirim ve puan sistemini kuruyoruz. Satın alan müşteri yorum yazabiliyor (moderasyondan sonra ürün sayfasında görünüyor), teslimden ~10 gün sonra 'aldıklarını beğendin mi' anketi gidiyor, keşif bölümünde olmayan ürünleri sağa-sola kaydırıyor. Her değerli aksiyon puan kazandırıyor, biriken puan kişisel indirim kuponuna dönüyor. Önemli incelik: müşteri katılımı için puanını alıyor, ama hep aynı yöne savurma gibi kalitesiz sinyaller iş kararımızı bozmasın diye analizde zayıflatılıyor."

## Görevler

- [ ] (17.1) **Yorum (Review):** yalnız satın alan; moderasyon (onay/ret) → ürün sayfasında gösterim; **ürün skoru türetimi** (yorum ortalaması + beğen/beğenme oranı)
  - *Bitti:* onaysız yorum görünmüyor; ürün skoru türeniyor (05 ürün sayfasına besleniyor)
- [ ] (17.2) **FeedbackRequest cron:** teslim +10 gün (taramalı-idempotent); WhatsApp/e-posta link'iyle davet; tamamlanma izlenir
  - *Bitti:* teslimden 10 gün sonra davet gidiyor; tekrar tetiklenmiyor
- [ ] (17.3) **Swipe akışları:** alım-sonrası memnuniyet + aday ürün keşif (`AnalyticsEvent product_swipe`, `dwell_ms`); sinyal kalite ağırlığı domain-core'da (13)
  - *Bitti:* swipe olayı kaydediliyor; düşük kaliteli swipe analizde zayıf
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
