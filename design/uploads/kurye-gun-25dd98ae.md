# Kurye — Günün Teslimat Listesi

## 1. Amaç ve kullanıcı

Kuryenin o gün yapacağı teslimatları rota sırasıyla gördüğü ve gününü yönettiği ekran. Kullanıcı: kurye — **yalnız kendine atanan** teslimatları görür.

## 2. İçerik envanteri — ne var, neden

- **Teslimat listesi (rota sırasıyla)** — günün duraklarının sıralı listesi; kurye sıradaki işini düşünmeden görür. Her durakta:
  - **Adres** — teslimatın yapılacağı yer; navigasyona geçiş bu adres üzerinden olur
  - **Müşteri adı** + B2B/B2C ayrımı — kapıda kimi arayacağını bilir; B2B'de teslim onayı zorunlu olduğu için beklenti baştan kurulur
  - **Ödeme beklentisi** — bu duraklarda en kritik bilgi: **kapıda ödenecek** (tutar + beklenen yöntem) mi, **ödendi** mi. Kurye tahsilat yapacağı kapıyı önceden bilmeli; "ödendi" kapısında para konuşulmaz
  - **Sipariş içeriği özeti** — kalem/koli sayısı ve kısa içerik; araçtan doğru koliyi almak ve eksik yüklemeyi rampada fark etmek için
  - **Durum** — bekliyor / teslim edildi / ulaşılamadı / reddedildi; günün resmi tek bakışta
- **Gün ilerlemesi** — kaç durak bitti, kaç durak kaldı; kapıda ödemeli duraklardan biriken tahsilat bilgisi güne eşlik eder (kapanışta sürpriz olmaz)
- **Ulaşılamayan duraklar** — tekrar denenecekler listede kaybolmaz; kurye gün içinde geri dönebilir

## 3. Aksiyonlar

- Duraka dokun → **teslimat ekranına** geç (ana akış)
- Adresten **navigasyon** başlat (harita uygulamasına geçiş)
- Müşteriyi **ara** veya WhatsApp'tan yaz (kapı bulunamadı, zil çalışmıyor senaryoları)
- Listeyi yenile — gün içinde admin'in eklediği/çıkardığı teslimat yansır

## 4. Durumlar ve varyasyonlar

- **Boş durum** — bugün atanmış teslimat yok
- **Gün başı (hepsi bekliyor) / gün içi (karışık) / gün sonu (hepsi sonuçlanmış)**
- **Kapıda ödemeli / ödenmiş** durak — liste bu farkı net taşımalı
- **Ulaşılamadı olan durak** — listede tekrar denenecek olarak kalır
- **B2B hacimli durak** (çok koli) / B2C küçük paket
- **Tek duraklı kısa gün / 20+ duraklı yoğun gün** — liste her hacimde okunur kalmalı

## 5. Akış bağlantıları

Gelinen: kuryenin güne başladığı ana ekrandır; teslimatlar admin'in rota planı/atamasıyla düşer.
Gidilen: durak → **kurye-teslimat** (tek teslimat ekranı); teslimat sonuçlanınca listeye dönülür. Gün bitince → **kurye-kapanis** (gün kapanışı); tüm duraklar sonuçlanmadan kapanışa geçiş uyarılıdır ama mümkündür (ulaşılamayan kalabilir).

## 6. Yapmaması gerekenler

- **Başka kuryenin teslimatı asla görünmez** — liste yalnız kendi atamalarıdır
- **Maliyet, kâr, marj, ürünün alış/satış fiyat detayı görünmez** — kurye yalnız tahsil edeceği tutarı bilir
- Kurye **fiyat/tutar değiştiremez** — tutarlar sipariş oluşurken sabitlenmiştir; pazarlık kapıda kurye eliyle yapılmaz
- Sipariş geçmişi, müşteri hesap detayı, vade/limit bilgisi görünmez — durak için gerekeni aşan müşteri verisi taşınmaz
- "Rezervasyon", "rota optimizasyonu", "fulfillment" gibi iç terimler arayüz dilinde kullanılmaz

## 7. Web / mobil notları (yalnız işlevsel)

- **Telefon esastır; ekran araçta kullanılır** — güneş ışığında okunabilirlik, tek elle ve kısa bakışlarla kullanım (sürüş molalarında) işlevsel gerekliliktir
- Navigasyon ve arama/WhatsApp geçişleri tek dokunuşla olmalı — kurye uygulamalar arasında gider gelir, dönüşte kaldığı yeri bulmalı
- Bağlantı kesintisi sahada olağandır; liste son bilinen haliyle çalışmaya devam edebilmeli, işaretlemeler bağlantı gelince yansımalı
