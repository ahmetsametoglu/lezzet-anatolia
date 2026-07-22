# Admin — Rotalar: Bölgeler ve Gün Planı

## 1. Amaç ve kullanıcı

Yöneticinin teslimat bölgelerini tanımladığı ve günün teslimat listesini yönetip kuryeye atadığı yer. "Rota içi/dışı" tüm sistemde buradaki bölge tanımından türer. Kullanıcı: yönetici (admin).

## 2. İçerik envanteri — ne var, neden

- **Rota bölgeleri listesi** — her bölge: ad (iç etiket, ör. "Strasbourg Kuzey"), kapsadığı **posta kodları**, **haftalık teslimat günleri**, aktif/pasif durumu. Sınır ötesi (Almanya/Baden) posta kodları da bir bölgeye eklenebilir. Bölge tanımı canlıdır: müşteri adresinin "rota içinde" sayılması ve checkout'ta gösterilen teslim günleri buradan hesaplanır — bu ekran sistemin teslimat haritasının tek kaynağıdır
- **Bölge düzenleme** — posta kodu ekleme/çıkarma, gün ekleme/çıkarma; değişikliğin etkisi anlaşılır olmalı ("bu kodu çıkarırsan o adresler kargoya düşer" bilinci)
- **Günün rota listesi** — seçilen günün teslimatları: teslim tarihi o gün olan siparişler, bölge bazında; her satırda müşteri, adres, sipariş özeti, ödeme biçimi (kapıda tahsilat var mı), varsa not. Kurye gününü buradan alır
- **Kurye atama** — günün siparişlerine kurye atanır (tek kurye ile başlanır ama atama kavramı baştan vardır); atanmamışlar belli olur
- **Kesim saati (cut-off) etkisi** — kesim saatinden sonra gelen sipariş bir sonraki rota gününe yazılır; günün listesi bu yüzden araç yüklenirken büyümez. Bu, listede güven duygusu olarak yansır: "bugünün listesi kesinleşti mi, hâlâ büyüyebilir mi" durumu görünür (kesim saatinin kendisi ayarlardan gelir)
- **Hazırlık durumu bağlamı** — listedeki siparişin hazır olup olmadığı görünür (hazırlanmamış siparişi araca yüklememek için); hazırlık işi depo ekranındadır, burada yalnız durumu okunur

## 3. Aksiyonlar

- Bölge ekleme/düzenleme/pasifleştirme (posta kodları + günler)
- Gün seçme ve günün listesine bakma (bugün/yarın en sık)
- Siparişe kurye atama; atamayı değiştirme
- Siparişi başka güne taşıma (istisna: müşteri aradı, "yarın olsun")
- Listeden sipariş detayına inme

## 4. Durumlar ve varyasyonlar

- **Bugünün listesi boş** — o gün hiçbir bölgenin günü değilse veya sipariş yoksa; sakin boş hal
- **Kesim öncesi / kesim sonrası** — liste hâlâ büyüyebilir / kesinleşti ayrımı
- **Atanmamış siparişler** — gün başında normaldir, araç çıkarken kalmamalı
- **Hazır olmayan sipariş listede** — görünür uyarı hali (yükleme hatası önlenir)
- **Bölge çakışması** — aynı posta kodu iki bölgeye girmeye çalışırsa netleştirilmeli (bir kod tek bölgeye)
- Tek bölge / çok bölge — başlangıçta bir-iki bölge olacak; ekran az bölgeyle de doğal durmalı

## 5. Akış bağlantıları

Gelinen: admin ana menü/dashboard ("bugün X teslimat" özetinden).
Gidilen: sipariş detayı, müşteri detayı (adres sorunu), ayarlar (kesim saati oradadır). Kuryenin kendi ekranı ayrıdır — atama buradan yapılır, kurye kendi listesini kendi yüzeyinde görür.

## 6. Yapmaması gerekenler

- Rota optimizasyonu, kapasite planı, zaman penceresi yoktur (ileriki faz) — bu ekran basit bir tanım + günlük liste aracıdır; yokmuş gibi karmaşık planlama arayüzü kurulmaz
- "DeliveryZone", "delivery_date", "cut-off" gibi iç terimler ham kullanılmaz — "bölge", "teslim günü", "sipariş kesim saati" denir
- Kurye burada tahsilat/teslim işlemi yapmaz — teslim işaretleme ve tahsilat kurye ekranının işidir; admin yalnız planlar ve izler
- Kesim saati burada değiştirilmez (ayarların işi) — yalnız etkisi görünür
- Sipariş içeriği düzenlenmez — kalem değişikliği sipariş ekranının işidir

## 7. Web / mobil notları (yalnız işlevsel)

- Telefon önceliklidir: gün planına en sık sabah, depoda/araç başında bakılır — günün listesi ve atama telefonda hızlı yürümeli
- Bölge tanımı (posta kodu listeleri) daha seyrek, oturarak yapılan bir kurulum işidir; yine de telefonda düzenlenebilir olmalı
- Posta kodu listeleri uzayabilir (FR + DE kodları) — çok kodlu bölge girişinde tarama/toplu giriş işlevsel ihtiyaçtır
