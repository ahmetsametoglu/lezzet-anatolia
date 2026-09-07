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
- **Pazarlama izni sayısı + köprü (kullanıcı kararı 04.08, `ANALYTICS §6`)** — kanal bazlı "kaç kişi izin verdi"; **liste burada DEĞİL**, Müşteriler ekranında. Analitik *kaç* der, Müşteriler *kim* der; kişi bazlı bir ekran açılmaz. Sayı ile listenin aynı ölçütten çıkması şart, yoksa köprünün iki ucu farklı sayı gösterir
- **Bölge dışı talep — yalnız işaret ve köprü (kullanıcı kararı 04.08)** — posta kodu talep tablosunun kendisi **Depolar** ekranındadır, çünkü bölgeyi açma kararı orada veriliyor. Burada iki ekranda iki tablo olsaydı aynı soru iki farklı cevap verirdi
- **Verinin ÜÇ hâli ayrı konuşur** — "sayı var" · "veri birikiyor" (kapı hazır, ölçüm başlamadı) · "bu sayı hesaplanmıyor" (kapı yok ya da özet o boyutu taşımıyor). Son ikisi ekranda aynı görünmemeli: biri beklemeyi, öteki beklememeyi söyler; birleştirilirse yönetici hiç dolmayacak bir bloğun dolmasını bekler
- **Sohbet hunisi — platform verimliliği (kullanıcı sorusu 07.09, `build/15` 15.24)** — yöneticinin sorusu: *"WhatsApp, Messenger ve Instagram'dan hangisi daha verimli, insanlar hangisini tercih ediyor?"* Üç platform **yan yana**, aynı dönem, aynı beş adım: **açılan sohbet → sepet kurulan sohbet → gönderilen bağlantı → açılan bağlantı (giriş yapıldı) → sipariş**; sonuna ciro. Her adım arasındaki oran görünür ("sohbetlerin %X'i sepete, sepetlerin %Y'si siparişe"), böylece "nerede kaybediyorum" sorusu platform başına cevaplanır. Sayılar sohbet, bağlantı ve sipariş kayıtlarının damgalarından türer — yeni ölçüm kurulmaz, kişi takip edilmez; sipariş sayımı "sohbetin dokunduğu sepetin siparişi sohbetindir" kuralıyla yapılır (sitede ödense de). **Zaman ekseni ikinci soru:** dönem toplamının yanında haftalık gidiş — "tercih zamanla değişiyor mu" ancak böyle okunur. **Kim yürüttü ayrımı** (yapay zekâ / personel) platform sütununun içinde ikincil kırılım: aynı platformda ajanın yürüttüğü sohbet daha mı çok siparişe dönüyor — verimliliğin öteki yarısı. Bu blok trafik kaynağıyla (UTM'li site girişi) ve edinim kaynağıyla KARIŞTIRILMAZ: o ikisi siteye kimin geldiğini söyler, bu blok sohbetin siparişe dönüp dönmediğini

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
- **Sohbet hunisinde bağlı olmayan kanal** — Instagram ürünü uygulamaya henüz eklenmemişken sütun "sıfır" değil "bu kanal bağlı değil" demeli; sıfır ile yokluk ayrı (`ANALYTICS` üç hâl kuralı). **Küçük sayı** — dönemde ondan az sohbet varsa oran yüzdeyle değil sayıyla söylenir ("3 sohbetten 1'i"); %33 üç sohbette bir anlam taşımaz

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
