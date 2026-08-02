# Admin — Teslimat (günün çıkışları)

> **`admin-rotalar.md`'nin yerini aldı (01.08, kullanıcı kararı).** Sayfanın adı ve konusu değişti;
> gerekçe §1'de. Bölge TANIMI bu sayfadan çıkıp `admin-depolar`'a taşındı.

## 1. Amaç ve kullanıcı

Bugün müşteriye giden her şeyin tek listesi: araçla götürülecekler ve kargoya verilecekler. Kullanıcı: yönetici (admin).

### Neden "Teslimat", "Rota" değil

Bu sistemde **rota bir sayfa değil, bir teslimat TÜRÜDÜR** — `deliveryType: rota | kargo`. `DOMAIN` sözlüğü de öyle tanımlar: *"Rota içi: müşteri adresinin mevcut dağıtım rotasının kapsadığı bölgede olması."* Yani rota bir sıfattır (rota içi / rota dışı, rota siparişi / kargo siparişi), bir nesne değil.

Sayfayı "Rotalar" diye adlandırmak iki hata yapıyordu: bir **türü çoğullayıp varlığa çeviriyordu**, ve sayfanın asıl konusunu (teslim edilen şeyler) türün adıyla anıyordu. Kullanıcının cümlesi ayrımı tam koyuyor: **rota gidilen şeydir, teslimat teslim edilen şeydir** — ve bu sistem gitmeyi modellemiyor (duraklar arası sıra, kapasite, zaman penceresi yok), teslim etmeyi modelliyor.

Adı düzeltmek bir boşluğu da kapatıyor: **kargo siparişinin günlük operasyonunun evi yoktu.** "Bugün hangi paketleri taşıyıcıya vereceğim" sorusu hiçbir ekranda yanıtlanmıyordu. "Teslimat" iki türü de doğal olarak kapsar.

### Üç kavram, üç ayrı yer

- **Teslimat türü** (rota / kargo) — siparişin bir alanı, adresten türer
- **Bölge** — bir *tanımdır*: şu posta kodları, şu depodan, haftanın şu günleri. Kalıcı kural, kurulum işi → **Depolar** sayfasında yaşar
- **Teslimat günü** — bu sayfa: o günün çıkışları. Saklanan bir varlık değil, `teslim tarihi = bugün` olan siparişlerden türer

## 2. İçerik envanteri — ne var, neden

Sayfa **gün** üzerine kuruludur; gün seçilir, iki tür yan yana durur. En sık bakılan iki gün bugün ve yarın.

### Ortak — günün özeti

- **Kaç çıkış, kaçı hazır, kaçı atanmamış** — araç çıkmadan önceki son kontrol budur; tek bakışta okunmalı
- **Kapıda tahsil edilecek toplam** ve kaç siparişte olduğu
- **Kesim saati (cut-off) etkisi** — kesim saatinden sonra gelen sipariş bir sonraki teslim gününe yazılır; liste bu yüzden araç yüklenirken büyümez. Ekranda bu bir güven duygusu olarak yansır: **"bugünün listesi kesinleşti mi, hâlâ büyüyebilir mi"** görünür. Kesim saati ayarlardan gelir, burada değiştirilmez
- **Hazırlık durumu** — siparişin hazır olup olmadığı; hazırlanmamış siparişi araca yüklememek için. Hazırlık işi depo ekranındadır, burada yalnız durumu okunur

### Rota teslimatları — araçla giden

- **Günün listesi, bölge bazında gruplu** — her satırda müşteri, adres, sipariş özeti, ödeme biçimi (kapıda tahsilat var mı), varsa not. Kurye gününü buradan alır
- **Hangi bölgeden, hangi depodan** — satır bölgesini, bölge de deposunu söyler. Çok depolu kurulumda künye bilgisidir: aracın hangi tesisten yükleneceğini belirler. **Tanım burada değiştirilmez**, okunur
- **Kurye atama** — günün siparişlerine kurye atanır; atanmamışlar belli olur. Gün başında atanmamış olmak normaldir, araç çıkarken kalmamalıdır
- **O gün servis edilen bölgeler** — hangi bölgelerin günü olduğu görünür; hiçbirinin günü değilse liste sakin biçimde boştur ve sebebini söyler
- ⚠ **Duraklar arası SIRA gösterilmez** — sistem sırayı bilmiyor (rota optimizasyonu ileriki faz, §6). Olmayan bir yeteneği ima eden bir düzen kurulmaz

### Kargo teslimatları — taşıyıcıya verilen

- **Bugün kargoya verilecekler** — kargo deposundan çıkacak siparişler; müşteri, adres, paket özeti
- **Taşıyıcı ve takip numarası** — paketin hangi taşıyıcıya verildiği ve takip numarası satırda **okunur**; girilmemişse gün kapanmadan görünür bir eksikliktir. ⚠ **Giriş burada DEĞİL:** numarayı hazırlık ekranı alır (`07.12` kararı — etiketi paketi kapatan kişi elinde tutar, ayrı bir sevk adımı açılmaz). Aynı alanı iki ekranın sahiplenmesi, iki farklı anda iki farklı gerçek yazılması demekti. Bu sayfa planlar ve eksiği gösterir, kaydı hazırlık yazar
- **Etiket / irsaliye çıktısı** — paketin üstüne gidecek belge
- **Kargonun günü rotanınkinden farklı çalışır** — kargoda teslim tarihi bizim vaadimiz değil taşıyıcınındır; liste "bugün elden çıkacaklar"dır, "bugün varacaklar" değil. Ekran bu farkı gizlemez
- ⚠ **Kargo yalnız ONLINE PEŞİN ödenir** (K37) — kapıda tahsilat bu listede hiç görünmez

## 3. Aksiyonlar

- Gün seçme; günün listesine bakma (rota + kargo)
- Siparişe kurye atama; atamayı değiştirme
- Siparişi **başka güne taşıma** (istisna: müşteri aradı, "yarın olsun")
- Kargo satırında etiket / irsaliye çıktısı alma (taşıyıcı ve takip numarası **girilmez**, okunur — §2)
- Listeden sipariş detayına inme
- Bölge tanımına geçiş (Depolar)

## 4. Durumlar ve varyasyonlar

- **Günün listesi boş** — o gün hiçbir bölgenin günü değilse ya da sipariş yoksa; sakin boş hâl, sebebi söylenir
- **Kesim öncesi / sonrası** — liste hâlâ büyüyebilir / kesinleşti ayrımı
- **Atanmamış siparişler** — gün başında normal, araç çıkarken kalmamalı
- **Hazır olmayan sipariş listede** — görünür uyarı hâli (yükleme hatası önlenir)
- **Yalnız rota / yalnız kargo günü** — bir tür hiç yoksa o bölüm sessizce yer kaplamaz
- **Çok depolu gün** — aynı gün iki deponun bölgeleri servis ediliyorsa liste depoya göre ayrışır: iki ayrı araç, iki ayrı yükleme
- **Takip numarası girilmemiş kargo** — paket çıkmış ama müşteri bilmiyor; gün kapanmadan görünür bir eksiklik

## 5. Akış bağlantıları

Gelinen: dashboard ("bugün X teslimat" özetinden), Siparişler (bir siparişin teslim gününe bakmak için).
Gidilen: sipariş detayı, müşteri detayı (adres sorunu), **Depolar** (bölge tanımı: kodlar, günler), ayarlar (kesim saati). Kuryenin kendi ekranı ayrıdır — atama buradan yapılır, kurye kendi listesini kendi yüzeyinde görür.

## 6. Yapmaması gerekenler

- **Bölge TANIMLANMAZ** — posta kodları, teslim günleri ve bölge↔depo bağı Depolar'ın nesnesidir. Burada tanım okunur, değiştirilmez: aynı bağ iki yerden yönetilmez
- **Rota optimizasyonu, kapasite planı, zaman penceresi yoktur** (ileriki faz) — duraklar arası sıra gösterilmez, çünkü sistem sırayı bilmiyor. Bu ekran basit bir günlük liste aracıdır
- **"DeliveryZone", "delivery_date", "cut-off" gibi iç terimler ham kullanılmaz** — "bölge", "teslim günü", "sipariş kesim saati" denir
- Kurye burada tahsilat/teslim işlemi yapmaz — teslim işaretleme ve tahsilat kurye ekranının işidir; admin planlar ve izler
- Kesim saati burada değiştirilmez (ayarların işi) — yalnız etkisi görünür
- **Takip numarası burada YAZILMAZ** — hazırlık ekranının kaydıdır (`07.12`); burada okunur ve eksikse gösterilir
- Sipariş içeriği düzenlenmez — kalem değişikliği sipariş ekranının işidir
- **Stok hareketi gösterilmez** — hazırlıkta malın stoktan düşmesi bir harekettir ve Stok'un defterinde yaşar; burada yalnız "hazır mı" durumu okunur

## 7. Web / mobil notları (yalnız işlevsel)

- **Telefon önceliklidir** — gün planına en sık sabah, depoda ya da araç başında bakılır; liste ve kurye ataması telefonda hızlı yürümeli
- "Bugün kaç çıkış, kaçı hazır, kaçı atanmamış" tek bakışta okunmalı
- **Takip numarası okunur ve kopyalanabilir olmalı** — müşteri arayınca telefondan okunur. Girişi bu ekranda değil (hazırlık ekranı, `07.12`); barkod okuma ihtiyacı da oraya ait, paket kapatılırken
- Bölge kurulumu bu ekranda olmadığı için sayfa hafifledi: telefonda uzun posta kodu listeleriyle uğraşılmaz
