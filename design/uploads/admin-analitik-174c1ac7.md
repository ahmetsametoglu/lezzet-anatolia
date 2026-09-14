# Admin — Analitik

## 1. Amaç ve kullanıcı

Yöneticinin "site nasıl gidiyor, reklam çalışıyor mu, müşteri ne istiyor" sorularına veriyle cevap aldığı yer. Ölçüm çerezsiz/sunucu taraflıdır (banner derdi yok) — tasarımı ilgilendiren tarafı: veri toplu ve anonimdir, kişi takibi ekranı değildir. Kullanıcı: yönetici (admin).

## 2. İçerik envanteri — ne var, neden

- **Ziyaret ve kaynak** — dönem içinde ziyaretçi, sayfa görüntüleme, trafik kaynağı (nereden geldiler), popüler sayfa/ürün; günün/haftanın yoğunluk deseni. "Kim geliyor, nereden" temel nabız
- **Dönüşüm hunisi** — ziyaret → ürün görüntüleme → sepete ekleme → checkout başlangıcı → sipariş; adım adım kayıp görünür. "Nerede kaybediyorum" sorusunun cevabı
- **Sepette bırakma** — sepete ekleyip sipariş vermeyenlerin oranı ve büyüklüğü; ileride sepet kurtarma otomasyonunun zemini
- **Kampanya ROI** — kampanya (UTM) bazında ciro ile o kampanyanın **reklam gideri yan yana**: gider para tarafında kampanya etiketiyle girilir, ciro sipariş eşleşmesinden gelir — "gerçek ROI" Excel'e taşınmadan burada durur
- **Edinim kaynağı kohortu** — müşterinin ilk siparişindeki kaynak kalıcı yazılır; "şu kampanyadan gelen müşteriler tekrar alıyor mu" (kaynağa göre tekrar sipariş / müşteri değeri) buradan okunur — kampanyanın uzun vadeli değeri, tek seferlik satıştan ayrışır
- **Site içi arama** — ne aranıyor, kaç sonuç dönüyor; **sıfır-sonuç aramalar** ayrıca öne çıkar: müşterinin istediği ama bizde olmayan şeyin en dürüst listesi (talep/çeşit sinyali)
- **Ürün-ilgi sinyali** — çok bakılıp az alınan ürünler: fiyat mı sorun, görsel mi, açıklama mı — bakma/alma oranı karar tetikler
- **Segment görünümü** — siparişten türetilen müşteri segmentleri: iyi müşteriler, uyuyanlar (eskiden alıp uzun süredir almayan), yeniler (RFM mantığı — insan diliyle sunulur); segmentler **dışa alınabilir** (izinli kampanya listesi hazırlamak için)
- **AI içgörü anlatısı** — toplu veriden çıkarılmış kısa, dille yazılmış gözlemler ve anormallikler: "X kaynağından gelen trafik bu hafta düştü", "Y ürünü çok bakılıp az alınıyor". Rakam okumayı sevmeyen an için özet akıl; içgörü karar önerebilir ama karar insanındır

## 3. Aksiyonlar

- Dönem seçme; kaynak/kampanya/kanal/dil gibi eksenlerde filtreleme
- Sıfır-sonuç arama listesinden aksiyona gitme (ör. aday ürün açma fikri)
- Segment dışa alma (export)
- AI içgörülerini okuma; içgörüden ilgili detaya inme
- Ürün-ilgi listesinden ürün yönetimine/fiyata gitme

## 4. Durumlar ve varyasyonlar

- **Veri birikmemiş başlangıç hali** — ilk haftalar seyrek veri; boş/az veri durumu güven verir, panik yaratmaz
- **Kampanya gideri girilmemiş** — ciro var, gider yok: ROI eksik görünür; kullanıcı gideri girmeye yönlendirilir (para tarafına)
- **Sıfır-sonuç listesi boş** — iyi haber hali de tasarlanır
- **Uç değerler/anormallik** — tek büyük B2B siparişi ortalamayı bozar; AI anlatısı bu tür yanıltıcı sıçramaları bağlamıyla söyler
- Dil/ülke kırılımı (TR/FR/DE, FR/DE ülkeleri) — üç dilli pazarda hangi dil kitlesi ne yapıyor

## 5. Akış bağlantıları

Gelinen: admin ana menü/dashboard (dashboard'daki özet göstergelerin "devamı" burasıdır).
Gidilen: ürün yönetimi (ilgi sinyalinden), para hareketleri (kampanya gideri girmek), geri bildirim sayfası (ürün beğeni/talep analizi orada), raporlar (kâr tarafı).

## 6. Yapmaması gerekenler

- Kişi bazlı gezinme takibi gösterilmez — veri toplu/anonimdir; "şu müşteri şu sayfalara baktı" ekranı yoktur (segmentler sipariş verisinden türetilir, gezinmeden değil)
- "UTM", "RFM", "kohort", "funnel", "AnalyticsEvent" gibi terimler arayüzde ham kullanılmaz — "kampanya bağlantısı", "müşteri grupları", "adım adım dönüşüm" gibi insan dili
- Kârlılık rakamları burada tekrarlanmaz — kâr raporlar sayfasının işidir; buradaki ciro pazarlama gözüdür, ikisi karıştırılmaz
- Segment export'u doğrudan toplu mesaj göndermeye bağlanmaz — gönderim izin (opt-in) kurallarına tabidir, bu sayfa liste verir, kampanya aracı değildir
- AI içgörüsü otomatik aksiyon almaz (fiyat değiştirmez, kampanya açmaz) — yalnız söyler

## 7. Web / mobil notları (yalnız işlevsel)

- Telefon önceliklidir: günlük nabız kontrolü (ziyaret, sipariş, içgörü) telefonda sık ve kısa bakışlarla yapılır
- Derin inceleme (huni kırılımı, kohort karşılaştırma, export) masa başına yatkındır ama telefonda erişilebilir kalmalı
- Grafik/tablo içerikleri telefon ekranında okunabilir olmalı; üç dilli metin kırılımlarında uzun etiketlere dayanıklılık gerekir
