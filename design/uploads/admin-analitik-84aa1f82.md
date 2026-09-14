# Admin — Analitik

> **Bu bir "operasyon tezgâhı" ekranıdır.** `README.md` → "Operasyon tezgâhı çıtası" (hırs, kıyas omurgası, gerçek+boş veri, tam soru haritası) ve "Sadelik ne demek — ne DEĞİL" bu sayfaya tam olarak uygulanır. Aşağısı içerik listesi değil, **niyettir**.

## 0. Tasarım niyeti (bu ekrana özel)

- **Hırs:** İşletmecinin her sabah kahvesiyle açmak isteyeceği, ciddi bir analitik ürününün en iyileriyle yarışan bir tezgâh. "Rapor kartı" değil, **canlı kokpit.**
- **Kıyas omurgası:** Bu ekranın ruhu "iyiye mi gidiyorum?" sorusudur. Neredeyse her sayı bir **önceki dönemle kıyas** taşır (değişim yönü + büyüklüğü); zaman grafikleri geçmiş dönemi üstüne bindirir. Kıyassız çıplak rakam bu ekranda eksik sayılır.
- **Trafik ↔ ticaret ayrımı:** İki farklı zihin modu var — "kim geliyor, nasıl geziyor" (trafik) ve "ne kadar satıyorum, kim değerli" (ticaret). Ekran bu ikisini **mimari olarak** ayırabilmeli (ayrı görünüm/mod), aynı çorbada değil.
- **Gerçek + boş veri:** İlk gün "1 ziyaret / 0 € / henüz satış yok" hali **birinci sınıf** tasarlanır; uydurma sağlıklı rakam yok.

## 1. Amaç ve kullanıcı

Yöneticinin "işim nasıl gidiyor, reklam para kazandırıyor mu, müşteri ne istiyor, nerede kaybediyorum" sorularına **veriyle ve karşılaştırmayla** cevap aldığı çalışma tezgâhı. Ölçüm çerezsiz/sunucu-taraflı ve anonimdir (banner yok) — tasarıma yansıması: bu bir kişi-takip ekranı değil, **toplu nabız ve karar** ekranıdır. Kullanıcı: yönetici (admin).

## 2. İşletmecinin soruları ve onlara cevap veren içerik

Her blok bir **soruya** hizmet eder; kıyas (önceki döneme göre) her yerde varsayılandır.

**"Genel nabzım ne, düne göre nereye gidiyorum?"**
- Baş göstergeler **kıyaslı**: ciro/gelir (**birinci sınıf — en tepede**), sipariş, ortalama sepet, dönüşüm, ziyaretçi/oturum. Her biri önceki döneme göre değişimiyle. Ciro bu ekranda olmazsa olmaz.
- **B2B/B2C ayrımı** her yerde erişilebilir (filtre/kırılım): karışık bakınca rakamlar yalan söyler (B2B az sipariş–yüksek ciro, B2C tersi). Dönüşüm/sepet gibi metrikler kanal ayrımı olmadan yanıltıcıdır.

**"Kim geliyor, nereden, ne zaman?" (trafik modu)**
- Trafik kaynağı **dağılımı** (Instagram / Google / WhatsApp / doğrudan / QR) ve zaman içindeki eğilimi — reklam gün birden olacağı için kaynak kırılımı kritik.
- Zaman deseni: gün/saat yoğunluğu (rota günü planlaması ve reklam zamanlaması için); coğrafya (hangi şehir/ülke); cihaz kırılımı.
- Popüler sayfalar/ürünler ve giriş sayfaları.

**"Nerede kaybediyorum?"**
- Dönüşüm hunisi: ziyaret → ürün → sepet → checkout → sipariş; **adım adım kayıp ve en büyük sızıntı** açıkça işaretli. Her adımda "ne kadarı burada düşüyor".
- Sepette bırakma oranı ve büyüklüğü (sepet kurtarma otomasyonunun zemini).

**"Reklamım para kazandırıyor mu?" (ticaret modu)**
- Kampanya bazında **ciro ile reklam gideri yan yana** → gerçek getiri (ROAS): gider para tarafında kampanya etiketiyle girer, ciro sipariş eşleşmesinden gelir. Excel'e taşınmadan burada.
- **Edinim kaynağı kohortu:** ilk siparişteki kaynak kalıcı yazılır → "şu kampanyadan gelen tekrar alıyor mu, ömür boyu değeri ne" — kampanyanın uzun vadeli değeri tek satıştan ayrışır. Donuk gıdada asıl para tekrar siparişte.

**"Müşterim kim, sadık mı?" (ticaret modu)**
- Segmentler siparişten türetilir: iyi müşteriler, uyuyanlar (eskiden alıp kesilen), yeniler; ortalama müşteri değeri, tekrar oranı (insan diliyle; RFM ham terimi geçmez). Segmentler **dışa alınabilir** (izinli kampanya listesi için).

**"Müşteri isteyip bulamadığı ne?"**
- Site içi arama; **sıfır-sonuç aramalar** öne çıkar (bizde olmayan ama istenenin en dürüst listesi — talep/çeşit sinyali).
- Ürün-ilgi: çok bakılıp az alınan ürünler (fiyat mı, görsel mi, açıklama mı).

**"Bana biri özetlesin."**
- AI içgörü anlatısı: toplu veriden dille yazılmış gözlem/anormallik ("X kaynağı bu hafta düştü", "geçen haftaki ciro sıçraması tek büyük siparişten, kalıcı değil"). Karar önerir, karar insanındır.

## 3. Etkileşim (bir kez bakılan değil, içinde yaşanan)

- **Dönem + kıyas:** dönem seçimi (24s / 7g / 30g / 90g / 12ay / özel) ve **karşılaştırma tabanı** ("önceki döneme göre"); grafiklerde geçmiş dönem üst üste.
- **Görünüm modu:** trafik ↔ ticaret geçişi (baş göstergeler moda göre değişir).
- **Süz ve derine in:** kanal (B2B/B2C) / kaynak / dil / ülke filtreleri; bir rakamdan detayına inme (huni adımından o oturumlara, kampanyadan o siparişlere).
- **İşaretle:** bir zaman aralığını/olayı not etme ("burada bayram kampanyası" — sonra grafikte görünür).
- **Sırala ve genişlet:** tablolarda sütuna göre sıralama; "tümünü gör"; blok başına küçük "bu nedir?" yardımı.
- **Dışa alma:** segment ve tablo export.

## 4. Durumlar ve varyasyonlar (gerçek veriye karşı)

- **İlk gün / seyrek veri:** "1 ziyaret", "0 €", "henüz satış/kohort yok" halleri **güzel ve güven verici** tasarlanır — sistemin bozuk olduğu hissini değil, "daha yeni başladık" hissini verir. Bu, maket rakamla tasarlamanın panzehiridir.
- **Kampanya gideri girilmemiş:** ciro var, gider yok → getiri eksik; kullanıcı gideri girmeye yönlendirilir.
- **Uç değer/anormallik:** tek büyük B2B siparişi ortalamayı bozar; AI anlatısı bunu bağlamıyla söyler, sayı yalanını düzeltir.
- **Kanal dengesizliği:** B2B az ama ağır; ekran bunu ayırıp gösterebilmeli.
- Dil/ülke kırılımı (TR/FR/DE) — üç dilli pazarda hangi kitle ne yapıyor.

## 5. Akış bağlantıları

Gelinen: dashboard (özet göstergelerin "devamı" burasıdır).
Gidilen: ürün yönetimi/fiyat (ilgi sinyalinden), para hareketleri (kampanya gideri), geri bildirim (ürün beğeni/talep), raporlar (kâr tarafı).

## 6. Yapmaması gerekenler

- **Yavan/maket olmasın:** tek özet kart, uydurma sağlıklı rakam, kıyassız çıplak sayı — bu ekranın en büyük hatası budur. "Güvenli/minimal" bir sonuç, başarısız bir sonuçtur.
- **Ciro ve B2B/B2C ayrımı atlanmaz** — ikisi de birinci sınıf; olmadan ekran eksiktir.
- Kişi-bazlı gezinme takibi gösterilmez (veri toplu/anonim); "şu müşteri şu sayfalara baktı" ekranı yoktur.
- İç terimler (UTM, RFM, kohort, funnel, AnalyticsEvent) arayüzde ham geçmez — insan diline çevrilir.
- Kârlılık rakamı burada tekrarlanmaz — kâr raporlar sayfasının işidir; buradaki ciro pazarlama gözüdür.
- Segment export'u doğrudan toplu mesaja bağlanmaz (izin kurallarına tabidir); bu sayfa liste verir, kampanya aracı değildir.
- AI içgörüsü otomatik aksiyon almaz (fiyat değiştirmez, kampanya açmaz) — yalnız söyler.

## 7. Web / mobil notları (yalnız işlevsel)

- Telefonda günlük nabız (ciro, sipariş, içgörü, kıyas) sık ve kısa bakışlarla okunur — **kıyas ve ciro telefonda da ilk görünen** olmalı.
- Derin inceleme (huni kırılımı, kohort, export) masa başına yatkın ama telefonda erişilebilir kalır; yoğunluk telefonda "berrak" kalmalı (sadelik = yoğunlukta berraklık, burada sınanır).
- Grafik/tablo üç dilli uzun etiketlere dayanıklı olmalı.
