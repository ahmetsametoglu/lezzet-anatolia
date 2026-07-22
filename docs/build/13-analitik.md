# 13 — Analitik

## Kapsam

Çerezsiz-öncelikli, sunucu-tarafı, toplu ölçüm — banner gerektirmeden. Olay toplama, UTM reklam ROI, edinim kaynağı kohortu, huni, segmentler, AI içgörü. Reklam gün birden olacağı için **baştan tam** kurulur; yalnız pixel/CAPI ve ileri analitik Faz 2.

## Okunacaklar

- `FEATURES.md` (Analitik — cookie'siz hibrit kural), `DATA_MODEL.md` (AnalyticsEvent)
- `DOMAIN.md §14` (swipe sinyal kalitesi/ağırlık), `SCOPE.md` (tek faz, izin sınırı)

## Bağımlılık

`07-siparis` + `08-musteri-app` (olay atan yüzeyler), `12-para` (kampanya gider verisi), `packages/ai` (içgörü).

## Başlarken verilecek izah (örnek)

> "Analitiği kuruyoruz — ama çerez koymadan. Ölçümü sunucu tarafında, kişiyi tanımadan, toplu yapıyoruz; bu yüzden çerez banner'ı gerekmiyor (CNIL uyumlu). Reklam linklerindeki etiketleri (UTM) siparişle eşleştirip 'hangi kampanya kaç satış getirdi'yi görüyoruz. Müşterinin bizi hangi reklamdan bulduğunu bir kez kaydediyoruz ki 'bu kampanyadan gelen tekrar alıyor mu' sorusuna cevap verebilelim. Yapay zekâ toplu veriden anlatı çıkarıyor: 'şu kaynak düştü', 'şu ürün çok bakılıp az alınıyor'."

## Görevler

- [ ] **Olay toplama:** sunucu-tarafı `AnalyticsEvent` (page_view/product_view/add_to_cart/checkout_start/order_placed/search/product_swipe/share); çerezsiz oturum anahtarı; kişisel kimlik yok, giriş varsa opsiyonel `customer_id`
  - *Bitti:* olaylar cihaza yazmadan kaydediliyor; parmak izi yok
- [ ] **UTM → sipariş eşleşmesi:** link UTM → sunucu oturumu → sipariş; `acquisition_source` ilk siparişte (07 ile); kampanya ROI raporu (ciro + gider yan yana, 12'den)
  - *Bitti:* "kampanya X → N sipariş / € ciro / € gider" tablosu çıkıyor
- [ ] **Huni + sepette bırakma:** ziyaret → ürün → sepet → checkout → sipariş dönüşüm oranları; terk noktası
  - *Bitti:* huni her aşamada sayı/oran veriyor
- [ ] **Talep sinyalleri:** ürün-ilgi (çok bakılıp az alınan), site içi arama + **sıfır-sonuç** (talep/çeşit sinyali), aday ürün swipe panosu
  - *Bitti:* sıfır-sonuç aramalar listeleniyor; ürün-ilgi sıralaması çıkıyor
- [ ] **Segmentler:** edinim kaynağı kohortu (tekrar sipariş), RFM + uyuyan müşteri (siparişten türetilir), export'lu
  - *Bitti:* "90 gündür sipariş vermeyenler" listesi türetiliyor; export çalışıyor
- [ ] **Swipe sinyal kalitesi:** `dwell_ms` + desen ile düşük kaliteli swipe zayıflatma (domain-core ağırlık); ödül müşteriye tam, analiz korunur
  - *Bitti:* hep-aynı/çok-hızlı swipe analizde zayıf ağırlıkta
- [ ] **AI içgörü:** `packages/ai` toplu veriden anlatı/anormallik ("X kaynağı düştü", "Y çok bakılıp az alınıyor")
  - *Bitti:* haftalık özet anlatısı üretiliyor

## Netleşecekler

- **Dar izin katmanı (Faz 2):** Meta/Google pixel açılınca gereken küçük izin katmanı — o reklamlar başlarken kurulur; çekirdek analitik bundan bağımsız tam çalışır.
