# Kapsam ve Fazlandırma

Bu dosya **neyin ne zaman** yapılacağını sınırlar. Somut iş kalemleri (görev listesi) `BACKLOG.md`'ye aittir; burada faz sınırları ve her fazın kapsamı vardır.

**İki faz vardır.** Faz 1 = çalışan **tam sistem** — satış, operasyon, kanallar, geri bildirim; hepsi. Faz 2 = yalnız **ekstrem/ileri** özellikler (ayrı uygulama, otomasyon derinliği, ileri optimizasyon). "Bu özellik hangi faza?" sorusunun ölçütü: *sistem onsuz eksiksiz çalışır ve özellik belirgin ek altyapı/entegrasyon derinliği ister mi?* Evet ise Faz 2, değilse Faz 1.

Genel ilke (WORKFLOW §6): ihtiyaç doğmadan soyutlama kurma. Faz 2 için Faz 1'de yalnızca **genişlemeye engel olmayan** kararlar verilir.

## Faz 1 — Tam sistem

Amaç: işin tamamını taşıyan sistem. WhatsApp/elle giriş kaosunu bitiren ve tüm satış-operasyon-pazarlama zeminini kuran bütün.

### Satış ve müşteri
- Müşteri web uygulaması: katalog, sepet, sipariş, ödeme
- B2B / B2C otomatik kanal ayrımı
- Ödeme: online + kapıda (nakit/kart)
- Teslimat seçimi: rota içi (bekle, ücretsiz, kapıda öde) / rota dışı (kargo) — kapasite/zaman penceresi yok (Faz 2)
- **WhatsApp canlı satış kanalı** (yapım sırası: önce zemin — `order_source`, telefon kimliği, `Conversation`/`Message` modeli, elle işleme; sonra canlı — 360dialog webhook, AI ajanı, interaktif kartlar, Stripe payment link, utility template'ler. İkisi de Faz 1; bkz. `CHANNELS.md`, `ADR_WHATSAPP.md`)
- **Kargo entegrasyonu:** etiket, takip numarası, müşteriye otomatik bilgi (agnostik arayüz, bkz. `INTEGRATIONS.md`)
- Müşteri talep/şikâyet: sipariş/ürün bağlı form + basit yaşam döngüsü (`open → in_progress → resolved`) + **AI destekli işletme** (otomatik karşılama, sıradan soruya otomatik yanıt, gerekince insana)
- B2B self-servis kayıt + onay kapısı ("Professionnels" sayfası, SIRET otomatik dolum, kontrol kartı)
- Çok dillilik (TR/FR/DE) — arayüz i18n + içerik jsonb, AI çeviri önerisi

### Stok ve operasyon
- Stok ve son kullanma tarihi (DLC) takibi, rezervasyon (`Reservation`), hazırlıkta parti kaydı (`OrderItemBatch`)
- Sipariş yaşam döngüsü (esnek geçişler + hızlı satış yolu) — bkz. `ORDER_LIFECYCLE.md`
- Rota ve dağıtım günü (temel liste; optimizasyon yok)
- Kurye gün kapanışı ve kasa mutabakatı
- Tedarik: tedarikçi kartı (vade + türetilen borç), ürün–kod eşlemesi, tedarik siparişi (taslak → mal kabulde kapanır), eşik bazlı "sipariş zamanı" önerisi

### Para ve raporlama
- Kanal bazlı kârlılık ölçümü
- Ön muhasebe: gelir/gider, para hareketleri/hesaplar, muhasebe dosyası export (hedef yazılımın biçimi muhasebeciyle netleşince biçimlenir — iş bağımlılığı, teknik değil), banka Excel import + AI şablon + eşleştirme (öneri + elle onay)
- Cookie'siz-öncelikli analitik — baştan tam (kaynak/huni/sepette bırakma + UTM reklam ROI + edinim kaynağı kohortu); izin yalnız Meta/Google pixel'i için, o reklamlar Faz 2'de. AI içgörü.

### Pazarlama ve geri bildirim
- Pazarlama izni toplama (`marketing_consent`, kayıt/checkout kutusu + bülten kutusu) + ilk siparişte edinim kaynağı (`acquisition_source`)
- SEO zemini: ürün/kategori slug, çok dilli sitemap, schema.org; Google Business Profile (operasyon kalemi, `BACKLOG`)
- Kampanya e-postası: izinli listeye elle hazırlanan gönderim (otomasyon yok — o Faz 2)
- Geri bildirim tam seti: swipe (aday ürün keşfi + alım-sonrası memnuniyet), yazılı yorum + moderasyon + ürün skoru, puan/oyunlaştırma + kişisel kupon redemption (bkz. `DOMAIN.md §14`)
- Bildirim: e-posta (temel sipariş seti) + WhatsApp utility template (canlı kanalla birlikte)

### Temel
- Roller ve izinler
- Statik/yasal sayfalar, GDPR silme aksiyonu

## Faz 2 — Ekstrem / ileri özellikler

Sistem bunlar olmadan eksiksiz çalışır; her biri belirgin ek altyapı ister:

- **Ayrı mobil uygulama + push bildirim**
- **Teslimat penceresi ve rota kapasitesi yönetimi** (saat aralığı sözü, araç doluluk planı)
- **Reklam derin optimizasyonu:** Meta/Google pixel + CAPI (izin katmanıyla), retargeting; akıllı bölge önerisi (rota + kapasite + yoğunluk)
- **Kampanya otomasyonu:** tetiklenmiş akışlar (uyuyan müşteri, sepet kurtarma zinciri vb.) — Faz 1'de elle gönderim var, otomasyon yok
- **WhatsApp ölçek:** double opt-in broadcast/newsletter, segmentli proaktif template'ler, tam chatbot/SSS otomasyonu
- **İleri analitik** (derin kohort/tahmin); akıllı tedarik tahmini (satış hızı + sezon → "şu tarihte biter")
- **B2B düzenli sipariş şablonu** (rota gününde otomatik taslak, onayla kesinleşir)
- **Sepet kurtarma / win-back e-posta otomasyonları** (zemin Faz 1'de: kalıcı sepet + izinli liste)

## Faz sınırı kuralları

- Faz 1 bitmeden Faz 2 işine başlanmaz; ama Faz 2'yi imkânsız kılacak mimari karar Faz 1'de alınmaz (örn. bildirim katmanı soyut kalır, analitik olayları baştan zengin toplanır).
- Takvim notu: donuk gıdada Kasım–Aralık en yoğun dönemdir. Sistemi sezon tepesinde açmaktan kaçınılır; toptan tarafı eski usulle bir süre paralel çalıştırılır (iş kararı, teknik değil).
- Design dokümanları faz tanımaz: **tüm ekranlar** (Faz 2 dahil) baştan tasarlanır; yalnız yapım sırası fazlıdır.
