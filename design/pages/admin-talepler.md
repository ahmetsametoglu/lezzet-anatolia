# Admin — Talepler / Şikâyetler

## 1. Amaç ve kullanıcı

Müşteri taleplerinin (bozuk/eksik/soru/diğer) tek kuyruktan izlendiği, yazışıldığı ve gerekirse iadeye bağlandığı ekran. Kullanıcı: yalnız admin rolü.

## 2. İçerik envanteri — ne var, neden

### Kuyruk

- **Talep satırı** — müşteri, tip (bozuk / eksik / soru / diğer), durum (açık / işlemde / çözüldü), varsa bağlı sipariş, son mesaj zamanı; cevap bekleyenin bekletilmemesi kuyruğun tek amacıdır
- **Daraltma** — durum, tip, siparişli/siparişsiz; açık talepler varsayılan odaktır
- **AI'nın yanıtladıkları** — AI ajanının otomatik karşıladığı/yanıtladığı talepler kuyrukta ayırt edilir; "insan görmedi" demek "izlenmiyor" demek değildir — admin bunları tarayıp gerekirse devralır

### Talep detayı

- **Talep başlığı** — tip, durum, açılış zamanı, geliş yolu (sipariş detayından / genel formdan / WhatsApp'tan); WhatsApp'tan geldiyse bağlı konuşmaya köprü
- **Sipariş bağı** — bağlı sipariş ve müşterinin işaretlediği kalemler (hangi ürün, kaç adet); şikâyetin somut zemini budur — iade kararı bu kalemler üzerinden verilir
- **Müşterinin anlatımı** — açıklama + eklediği fotoğraflar (bozuk ürün kanıtı)
- **Yazışma** — müşteri ↔ admin mesaj dizisi, zaman sıralı; AI'nın yazdığı mesajlar insanınkinden ayırt edilir (kim ne söylemiş, sonradan da okunabilmeli)
- **Müşteri bağlamı** — müşteri detayına köprü; geçmiş talepleri (sürekli şikâyet eden mi, ilk kez mi) karar verirken görülmeli

## 3. Aksiyonlar

- Cevap yazma (müşteriye e-posta bildirimi otomatik gider)
- Durum değiştirme: açık → işlemde → çözüldü; çözülen talep müşteri dönerse yeniden açılır
- **İade/para iadesi tetikleme (köprü)** — talep haklıysa ilgili siparişin iade akışı buradan başlatılır; müşteri doğrudan iade başlatamaz, karar ve kontrol admin'dedir. İade siparişte yaşar, talep ona bağlanır — sonuç talepten izlenebilir olmalı
- **AI'dan devralma** — otomatik yürüyen talebi admin üstlenir; devralınca AI o talepte susturulur, sonraki cevaplar insandan gider
- Elle talep açma (WhatsApp/telefon konuşmasından; müşteri + varsa sipariş seçilir)

## 4. Durumlar ve varyasyonlar

- **Siparişli / siparişsiz talep** — siparişsizde (genel soru) kalem/iade bağlamı yoktur
- **Tipe göre ağırlık** — bozuk/eksik iade kararına gider; soru çoğu zaman tek cevapla kapanır
- **AI yürütüyor / insan yürütüyor / devralınmış** — üç hal de kuyrukta ve detayda net olmalı
- **Yeniden açılmış talep** — müşteri çözümden memnun kalmamış; geçmiş yazışma kaybolmaz
- **Fotoğraflı / fotoğrafsız**
- **Boş kuyruk** — açık talep yoksa temiz hali
- Müşteri kendi tarafında durumu ve yazışmayı görür (şeffaflık) — admin yazdığının müşteriye aynen görüneceğini bilmeli

## 5. Akış bağlantıları

Gelinen: dashboard (açık talep sayısı), sipariş detay (bağlı talep), müşteri detay (talepleri), WhatsApp izleme (konuşmadan talep).
Gidilen: sipariş detay (iade tetikleme), müşteri detay, WhatsApp konuşması.

## 6. Yapmaması gerekenler

- Bu ekran **yalnız admin rolüne** açılır
- Karmaşık ticket mekaniği kurulmaz — atama, öncelik matrisi, SLA sayaçları yok; üç durumlu sade yaşam döngüsü ekrana aynen yansır
- İade burada **sonuçlandırılmaz** — para ve stok kararı sipariş/iade akışının işidir; talep tetikler ve izler, mükerrer bir iade arayüzü kurulmaz
- Yazışmada iç bilgiler (marj, maliyet, parti değerlendirmesi, müşteri karnesi) müşteriye giden metne sızmaz — ekran iç notla müşteri mesajını karıştırtmamalı
- AI'nın yanıtları admin'e "kendi yazmış" gibi gösterilmez — kimin konuştuğu her zaman ayırt edilir

## 7. Web / mobil notları (yalnız işlevsel)

- Telefon önceliklidir: talepler gün içinde düşer, cevap çoğu zaman telefonda yazılır — kuyruk taraması ve kısa cevap tek elle akmalı
- Müşterinin yüklediği fotoğraflar telefonda net incelenebilmeli (bozuk ürün kararı çoğu kez fotoğraftan verilir)
