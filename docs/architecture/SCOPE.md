# Kapsam ve Fazlandırma

Bu dosya **neyin ne zaman** yapılacağını sınırlar. Somut iş kalemleri (görev listesi) `BACKLOG.md`'ye aittir; burada faz sınırları ve her fazın kapsamı vardır.

Genel ilke (WORKFLOW §6): ihtiyaç doğmadan soyutlama kurma. Aşağıda "sonraki faz" denen şey, Faz 1'de **arayüzü hazırlanıp arkası boş bırakılabilecek** ölçüde soyutlanır; daha fazlası değil.

## Faz 1 — Çekirdek satış ve operasyon

Amaç: sistemin işi taşımaya başlaması. WhatsApp/elle giriş kaosunu bitiren minimum bütün.

- Müşteri web uygulaması: katalog, sepet, sipariş, ödeme
- B2B / B2C otomatik kanal ayrımı
- Ödeme: online + kapıda (nakit/kart)
- Teslimat seçimi: rota içi (bekle, ücretsiz, kapıda öde) / rota dışı (kargo) — **basit ayrım**, kapasite/zaman penceresi yok
- Stok ve son kullanma tarihi (DLC) takibi, stok rezervasyonu
- Sipariş yaşam döngüsü (esnek geçişler + hızlı satış yolu) — bkz. `ORDER_LIFECYCLE.md`
- Rota ve dağıtım günü (temel liste; optimizasyon yok)
- Kurye gün kapanışı ve kasa mutabakatı
- Kanal bazlı kârlılık ölçümü
- Temel ön muhasebe: gelir/gider, muhasebe dosyası export, banka Excel import
- Çok dillilik (TR/FR/DE) — arayüz i18n + içerik jsonb, AI çeviri önerisi
- Cookie'siz kendi analitiği (temel)
- Roller ve izinler
- Bildirim: e-posta + `wa.me` deep-link (API yok)

## Faz 2 — Genişleme

- Kargo şirketi entegrasyonu (etiket, takip)
- Banka import + otomatik eşleştirme derinleşmesi
- Muhasebe export'un hedef yazılıma göre biçimlenmesi
- Teslimat penceresi ve rota kapasitesi yönetimi
- Reklam getirisi ölçümü (UTM, kampanya), akıllı bölge önerisi
- Müşteri talep/şikâyet sisteminin AI destekli işletilmesi

## Faz 3 — Olgunlaşma

- Ayrı mobil uygulama + push bildirim
- Kampanya otomasyonu
- WhatsApp Business API (gerekirse, BSP üzerinden — bkz. `INTEGRATIONS.md`)
- İleri analitik

## Faz sınırı kuralları

- Faz 1 bitmeden Faz 2 işine başlanmaz; ama Faz 2'yi imkânsız kılacak mimari karar Faz 1'de alınmaz (örn. bildirim katmanı soyut kalır, kanal alanı veri modelinde baştan bulunur).
- "Sonraki faz" özellikleri için Faz 1'de yalnızca **genişlemeye engel olmayan** kararlar verilir; kod yazılmaz.
- Takvim notu: donuk gıdada Kasım–Aralık en yoğun dönemdir. Sistemi sezon tepesinde açmaktan kaçınılır; toptan tarafı eski usulle bir süre paralel çalıştırılır (iş kararı, teknik değil).
