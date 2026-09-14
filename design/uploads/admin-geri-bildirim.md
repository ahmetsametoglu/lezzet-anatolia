# Admin — Geri Bildirim: Yorum, Skor, Swipe, Puan

## 1. Amaç ve kullanıcı

Yöneticinin müşteri geri bildirimini yönettiği ve okuduğu yer: yorumların moderasyonu, ürün skorları, beğen/geç (swipe) analizleri, aday ürün talebi ve sadakat puanlarının yönetimi. Kullanıcı: yönetici (admin).

## 2. İçerik envanteri — ne var, neden

- **Yorum moderasyon kuyruğu** — bekleyen yorumlar: ürün, müşteri, puan (1–5), metin, tarih; yorum yalnız satın almış müşteriden gelir (doğrulanmış alışveriş). Yorum ancak onaydan sonra ürün sayfasında görünür — kuyruk bu kapıdır
- **Yayınlanmış yorumlar** — geriye dönük görme ve gerekirse geri çekme
- **Ürün skorları** — her ürünün türetilmiş puanı: yorum ortalaması + beğeni/beğenmeme oranı; sevilen ve sevilmeyen ürünler sıralanır. "Neyi öne çıkarayım, neyi düzelteyim/çıkarayım" karar aracı
- **Swipe analizleri — sinyal kalitesi ağırlıklı** — alım-sonrası beğen/beğenme ve keşif beğenileri özetlenir; analiz **kaliteli sinyali ağırlıklı** sayar: hep aynı yöne / çok hızlı / ayırt etmeyen kaydırmalar zayıflatılır veya hariç tutulur, satın almayla tutarlı olanlar öne alınır. Kullanıcıya bu, sade bir güven göstergesiyle hissettirilir — puan kazanmak için yapılmış kaydırmalar iş kararını bozmaz
- **Aday ürün talep panosu** — stokta olmayan aday ürünler, keşif bölümündeki beğenilere ve kataloğun ilgi sinyaline göre **talebe göre sıralı**; her adayın beğeni miktarı ve sinyal gücü görünür. "Sırada hangi ürünü getirmeliyim" sorusunun panosu
- **Ürüne bağlı şikâyet sinyali** — bozuk/eksik şikâyetlerinin ürün/parti bazında yoğunluğu, skorun yanında görünür (kalite sorunu beğeni verisiyle yan yana okunur)
- **Puan yönetimi** — müşteri puan bakiyeleri (kazanım/harcama geçmişiyle): kim ne kadar biriktirmiş; **puan→kupon çevrimleri** (müşterinin kendi isteğiyle yaptığı çevrimden doğan kişisel indirim kodları) listelenir. Elle puan ekleme/düşme imkânı (jest veya düzeltme) — iz kaydıyla

## 3. Aksiyonlar

- Yorum onaylama / reddetme (kuyruğun ana aksiyonu); yayınlanmışı geri çekme
- Aday ürünü satışa açmaya gitme (yüksek talepli adayı ürün yönetiminde etkinleştirme köprüsü)
- Skor/analiz listelerinden ürün detayına inme
- Müşteri puanına elle düzeltme girme (sebep notuyla)
- Dönem seçme (analizlerde)

## 4. Durumlar ve varyasyonlar

- **Moderasyon kuyruğu boş / dolu** — boş hal "her şey yayında" rahatlığı verir
- **Az veri hali** — skorlar az yorumla temkinli sunulur (3 yorumla "en kötü ürün" damgası vurulmaz; örneklem küçüklüğü hissettirilir)
- **Düşük kaliteli sinyal ağırlıklı ürün** — beğeni sayısı yüksek ama güveni düşük aday; ikisi ayrışır
- **Negatif yoğunluk** — bir üründe şikâyet + kötü skor birleşirse bu birleşim görünür olmalı
- Puan çevrimi olmamış müşteri çoğunluktur; puan ekranı istisnaları değil genel resmi anlatır

## 5. Akış bağlantıları

Gelinen: admin ana menü/dashboard (bekleyen yorum sayısı uyarısından), analitik (ürün-ilgi sinyalinden).
Gidilen: ürün yönetimi (aday etkinleştirme, ürün düzeltme), müşteri detayı (yorumu yazan/puan sahibi), talepler (şikâyet detayı).

## 6. Yapmaması gerekenler

- Müşterinin puan ödülü sinyal kalitesine bağlanmaz — müşteri katılımın ödülünü her halükârda alır; kalite yalnız **analizdeki ağırlığı** etkiler. Bu ayrım arayüzde ceza gibi sunulmaz
- "Swipe", "dwell", "redemption", "PointsEntry", "sinyal ağırlığı katsayısı" gibi iç terimler ham kullanılmaz — "beğeniler", "kupona çevirme", "güvenilirlik" gibi insan dili
- Puan kuralları burada değiştirilmez (aksiyon puan değerleri, çevrim oranı ayarlardadır) — burası bakiye ve hareket yönetimidir
- Yorum metni admin tarafından düzenlenmez — onay/ret vardır, sansürlü yeniden yazım yoktur
- B2B müşteriye puan kurgusu gösterilmez (puan yalnız son tüketici içindir)

## 7. Web / mobil notları (yalnız işlevsel)

- Telefon önceliklidir: yorum moderasyonu tipik "boş anda telefondan iki dakika" işidir — kuyruk hızlı onay/ret akışına uygun olmalı
- Analiz ve pano okumaları da telefonda rahat taranmalı; derin karşılaştırma masa başında yapılabilir
- Yorum metinleri üç dilden gelebilir (TR/FR/DE) — okuma deneyimi karışık dilli içeriğe dayanıklı olmalı
