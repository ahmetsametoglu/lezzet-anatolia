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

Özet **iki katlıdır: üstte künye, altta engel** (kullanıcı kararı 16.08). Ayrım şu — künye günün *ne olduğunu* söyler, engel şeridi sevkiyatçının araç çıkmadan *kapatması gerekenleri*.

- **Künye:** kaç durak · toplam kaç adet yük · hangi depo(lar)dan yükleniyor · kaç kargo paketi · liste kesinleşti mi
  - **Yük ADET olarak künyede** — sevkiyatçının ilk sorusu *"araca ne kadar yer lazım"*; satırlarda vardı, üstte yoktu
  - **Hangi depodan** — tasarım §4 çok depolu günü *"iki ayrı araç, iki ayrı yükleme"* diye tanımlıyor; bu karar künyeden okunmalı, satırlar taranarak değil
  - **Kesim saati (cut-off) etkisi** — kesim saatinden sonra gelen sipariş bir sonraki teslim gününe yazılır; liste bu yüzden araç yüklenirken büyümez. Künyede **kısa** durur (*"liste kesinleşti"* / *"liste 16:00'a kadar açık"*), gerekçesi üzerine gelince açılır. Kesim saati ayarlardan gelir, burada değiştirilmez
- **Engel şeridi** — yalnız kapatılması gerekenler, sertlik sırasıyla: rotaya hiç düşmemiş sipariş → hazır olmayanlar (**adıyla**) → kuryesiz → takip numarası yazılmamış paket. Hiçbiri yoksa şerit sayı basmaz, tek cümle söyler: *"Araç çıkabilir."*
  - **Kapıda tahsilat bir ENGEL DEĞİL** — künye bilgisidir; gün planını durdurmaz, kuryeye not düşer. Şeridin sağ ucunda ve nötr tonda
  - **Kargonun EKSİĞİ özete girer, sayısı künyeye** — takip numarası yazılmamış paket §4'ün *"gün kapanmadan görünür bir eksiklik"*idir ve ekranın alt yarısında saklı kalmamalı. Ama paket bir DURAK değildir: durak sayacına karışmaz
- ⚠ **AYNI SAYI İKİ KEZ YAZILMAZ.** Önceki hâl dört sayaçtı ve `ÇIKIŞ 4` · `HAZIR 2/4` · `4 durak` 250 piksel içinde üç kez aynı sayıyı basıyordu; `HAZIR 2/4` üstelik engelin TERSİYDİ, engelin kendisini (kaçı hazır değil) hiçbir yerde vermiyordu
- ⚠ **BOŞ GÜN SEBEBİNİ SÖYLER.** Eski hâl boş güne üç sıfır basıyordu (`0` · `0/0` · `0`) ve "çıkış yok" metni hiç görünmüyordu: koşulu *rota **ve** kargo birlikte boş* idi, kargo kuyruğu ise hiç boşalmaz
- **Hazırlık durumu** — siparişin hazır olup olmadığı; hazırlanmamış siparişi araca yüklememek için. Hazırlık işi depo ekranındadır, burada yalnız durumu okunur

### Askıda kalanlar — geçmişten devreden

> **Kullanıcı kararı 16.08: "görünür devir — sevkiyatçı karar verir."**

Teslim günü geçtiği hâlde sonuçlanmamış rota siparişleri, bugünün planının **en üstünde** ayrı bir şeritte durur. Bakılan günden bağımsızdır (ölçüt *"teslim günü bugünden önce ve sonuçlanmamış"*) ve yalnız bugüne/ileriye bakarken çizilir.

- ⚠ **VAR OLMA SEBEBİ: SİPARİŞ KAYBOLABİLİYORDU** (ölçüldü 16.08 — seed değil, akışın kendisi). `out_for_delivery`den çıkışın üç kapısı da bir kurye eylemi ister; `delivery_date`'i yazan yalnız iki yer var (sipariş verilirken, ve sevkiyatçının elle taşıması — ki o da `out_for_delivery`'yi reddediyordu). Arada hiçbir otomatik yol yok: on iki zamanlanmış işin hiçbiri siparişe dokunmuyor, `order` tablosundaki iki trigger da durum/gün yazmıyor, kuryenin ekranı yalnız BUGÜNÜ okuyor. **Kurye bir durağı işaretlemeden günü bitirirse sipariş hiçbir rolün ulaşamadığı bir kilitte kalıyordu** — mal rezerve, para tahsil edilmemiş, müşteri bekliyor
- ⚠ **Daha yaygın ikinci hâl:** kurye *doğru davranıp* "ulaşılamadı" işaretlese bile durum `ready`'ye döner ama teslim günü DÜNDE kalır. Kodun kendi yorumu *"sipariş yarın yeniden denenir"* diyordu; yarını yazan yoktu
- **Devir SESSİZ DEĞİL.** Tarih kendiliğinden ilerlemez: müşteriye verilen gün sözü haber verilmeden değişmemeli. Ekran satırı görünür kılar, günü sevkiyatçı yazar
- **Hedef günler SERBEST DEĞİL** — taşımadakiyle aynı kural: bölgenin yaklaşan teslim günleri. "Bugüne al" diye kestirme bir düğme YOK; bakılan gün o bölgenin günü olmayabilir ve düğme, oraya araç gitmeyen bir güne sipariş yazardı
- **Bayat `out_for_delivery` burada çözülür**, ve yalnız burada: gün geçmişse "yola çıkmışın günü değişmez" kuralı süresi dolmuş bir gerçeği koruyordu — araç döndü. Yazılan geçiş motorun *"ulaşılamadı"* kenarıdır (`→ ready`, mal ayrılmış kalır, stok değişmez) ve notu bunun bir **sevkiyat kaydı** olduğunu söyler. Kapıdaki gerçekler — teslim edildi, reddedildi, para alındı — buradan yazılamaz (§6)
- **Bölgesi çözülemeyen satır sessiz bırakılmaz:** hedef gün üretilemez ve sebebi yazılır — yapılacak iş adresin kendisindedir
- **Tavan var ve söylenir:** sağlıklı bir operasyonda bu liste boş olmalı; uzunsa asıl haber odur

### Rota teslimatları — araçla giden

- **Günün listesi TABLO** — kolonlar: no · müşteri · kanal (B2B/B2C) · bölge+depo · yük (adet) · hazırlık durumu · kurye · tahsilat. Şerit ölçüleri Siparişler tablosuyla aynı: iki ekran aynı nesneyi listeliyor, operatörün gözü aynı yerde aynı şeyi bulmalı
  - ⚠ **AÇIK ADRES YOK (kullanıcı kararı 16.08).** Önceki hâl her satırda tam adres yazıyordu ve gerekçesi *"kurye gününü buradan alır"* idi — **o cümle `11.1` ile eskidi**: kuryenin kendi ekranı var ve adres orada işleviyle birlikte duruyor (`kurye-teslimat.md §2` — navigasyon, arama, WhatsApp). Sevkiyatçının adresle yapabileceği tek iş durak sırası kurmaktı ve §6 onu zaten yasaklıyor. Tam adres sipariş detayında
  - ⚠ **BÖLGE GRUPLAMA DEĞİL KOLON.** Gruplu düzende bölgesi çözülemeyen sipariş *"Bölgesi çözülemedi"* diye SON gruba düşüyordu — en acil satır en altta. Kolon olunca her satır kendi bölgesini söylüyor, bölgesiz olan amber görünüyor ve liste bölgeye göre sıralı geliyor (bölgesizler ÖNDE)
  - ⚠ **"Kalem sayısı" değil ADET.** Alan `order_item` satırlarını sayıyordu: dört siparişin dördü de *"1 kalem"* yazarken gerçek adetler 1 · 2 · 3 · 4'tü — dört farklı yük eşit görünüyordu. Sevkiyatçının sorusu *"araca ne kadar yer lazım"*
- **Hangi bölgeden, hangi depodan** — satır bölgesini, bölge de deposunu söyler. Çok depolu kurulumda künye bilgisidir: aracın hangi tesisten yükleneceğini belirler. **Tanım burada değiştirilmez**, okunur
- **Kurye atama** — günün siparişlerine kurye atanır; atanmamışlar belli olur. Gün başında atanmamış olmak normaldir, araç çıkarken kalmamalıdır
- **Hazırlık durumu BEŞ hâl** *(16.08)*: Hazır değil · Hazırlanıyor · Hazır · **Yolda** · Teslim. "Yolda" sonradan eklendi: yola çıkmış sipariş *"Hazır"* diye okunuyordu, yani *"depoda, yüklenmeye hazır"* — oysa mal araçtaydı
- **Tahsilat ÜÇ hâl, iki değil** *(16.08)*: `X € kapıda` · **`X € borç kaldı`** (amber) · `Ödendi`. Ortadaki eksikti ve ekran onun yerine "Ödendi" yazıyordu — teslim edilmiş ama hiç tahsil edilmemiş sipariş "ödenmiş" görünüyordu. Kapıda toplanmayacak olması ödendiği anlamına gelmez; kalan borcun tahsilatı müşteri kartının işidir
- ⚠ **Geçmiş gün listesi TAM olmalı.** Bir süre `completed` siparişler hiç okunmuyordu ve kapanan her durak listeden sessizce düşüyordu — dünün ekranı 5 duraktan 2'sini gösteriyordu. "Dün ne gönderdik" sorusunun cevabı eksik olamaz
- **O gün servis edilen bölgeler** — hangi bölgelerin günü olduğu görünür; hiçbirinin günü değilse liste sakin biçimde boştur ve sebebini söyler
- ~~⚠ **Duraklar arası SIRA gösterilmez** — sistem sırayı bilmiyor~~ **DEĞİŞTİ (01.09 · `11.9`):** sistem sırayı artık BİLİYOR (kapalı tur hesabı, `delivery_run.stop_order`). Kural tersine döndü: sıra gösterilir — ama **yalnız hesaplanmışsa**. Hesaplanmamış seferde numara uydurulmaz ve liste bugünkü gibi sırasız kalır. Sevkiyat masasının bu ekranda sırayı görmesi bir süs değil DENETİM: motorun dizdiği rota, araç çıkmadan önce bir insan gözüyle doğrulanabilmeli

### Kargo teslimatları — taşıyıcıya verilen

- **Bugün kargoya verilecekler** — kargo deposundan çıkacak siparişler; müşteri, adres, paket özeti
- **Taşıyıcı ve takip numarası** — paketin hangi taşıyıcıya verildiği ve takip numarası satırda **okunur**; girilmemişse gün kapanmadan görünür bir eksikliktir. ⚠ **Giriş burada DEĞİL:** numarayı hazırlık ekranı alır (`07.12` kararı — etiketi paketi kapatan kişi elinde tutar, ayrı bir sevk adımı açılmaz). Aynı alanı iki ekranın sahiplenmesi, iki farklı anda iki farklı gerçek yazılması demekti. Bu sayfa planlar ve eksiği gösterir, kaydı hazırlık yazar
- **Etiket / irsaliye çıktısı** — paketin üstüne gidecek belge
- **Kargonun günü rotanınkinden farklı çalışır** — kargoda teslim tarihi bizim vaadimiz değil taşıyıcınındır; liste "bugün elden çıkacaklar"dır, "bugün varacaklar" değil. Ekran bu farkı gizlemez
- ⚠ **Kargo yalnız ONLINE PEŞİN ödenir** (K37) — kapıda tahsilat bu listede hiç görünmez

## 3. Aksiyonlar

- Gün seçme; günün listesine bakma (rota + kargo). **Hızlı üç gün (dün/bugün/yarın) çip, ötesi TAKVİM** (16.08): sabit bir "+2 gün" çipi vardı ve gerekçesi yoktu — bugünün üç gün ötesine bakmanın yolu bulunmuyordu. Geçmiş de serbest: *"geçen salı ne çıktı"* sevkiyatın gerçek sorusu
- Siparişi başka güne taşırken hedef günler **adıyla** okunur ("18 Ağu Sal"), ham tarihle değil — aynı ekranın gün çipleriyle tek dil
- Siparişe kurye atama; atamayı değiştirme
- Siparişi **başka güne taşıma** (istisna: müşteri aradı, "yarın olsun")
- **Askıda kalmış siparişi bir güne yazma** — geçmişten devreden satırın kapısı; bayat `out_for_delivery` durumunu da çözer (§2)
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
- **Kapasite planı ve zaman penceresi yoktur** (ileriki faz). Rota SIRASI 01.09'da geldi (`11.9`) ve gösterilir — hesaplanmışsa. Kapasite/pencere kısıtları hâlâ yok: ölçümsüz optimizasyon, olmayan bir soruna makine kurmaktır
- **"DeliveryZone", "delivery_date", "cut-off" gibi iç terimler ham kullanılmaz** — "bölge", "teslim günü", "sipariş kesim saati" denir
- Kurye burada tahsilat/teslim işlemi yapmaz — teslim işaretleme ve tahsilat kurye ekranının işidir; admin planlar ve izler
- Kesim saati burada değiştirilmez (ayarların işi) — yalnız etkisi görünür
- **Takip numarası burada YAZILMAZ** — hazırlık ekranının kaydıdır (`07.12`); burada okunur ve eksikse gösterilir
- Sipariş içeriği düzenlenmez — kalem değişikliği sipariş ekranının işidir
- **Stok hareketi gösterilmez** — hazırlıkta malın stoktan düşmesi bir harekettir ve Stok'un defterinde yaşar; burada yalnız "hazır mı" durumu okunur

## 7. Web / mobil notları (yalnız işlevsel)

- ~~**Telefon önceliklidir** — gün planına en sık sabah, depoda ya da araç başında bakılır; liste ve kurye ataması telefonda hızlı yürümeli~~ **DÜŞTÜ (06.08 kararı, not 16.08'de güncellendi):** operasyon web'i **masaüstü-yalnız**; personelin mobil deneyimi native uygulamanın işi (`CLAUDE.md §2`). Bu cümle satır düzenini seçmenin gerekçelerinden biriydi (tablo telefonda yatay kaydırma ister) — dayanak düşünce düzen 16.08'de tabloya çevrildi. Öteki gerekçeler (bölge kolonu, hazırlık ekseni, tek süzgeç) masaüstünde de geçerli
- "Bugün kaç çıkış, kaçı hazır, kaçı atanmamış" tek bakışta okunmalı
- **Takip numarası okunur ve kopyalanabilir olmalı** — müşteri arayınca telefondan okunur. Girişi bu ekranda değil (hazırlık ekranı, `07.12`); barkod okuma ihtiyacı da oraya ait, paket kapatılırken
- Bölge kurulumu bu ekranda olmadığı için sayfa hafifledi: telefonda uzun posta kodu listeleriyle uğraşılmaz


## Sefer güncellemesi (18.08 — kullanıcı kararları, `docs/feature/sefer.md`)

§1'in üç kavramına DÖRDÜNCÜSÜ eklendi: **sefer (gerçekleşen)** — planlanan gün siparişten türetilmeye
devam eder, ama araç fiilen çıktığında artık saklanan bir kayıt vardır (kim sürdü, hangi araç, çıkış/
dönüş, SF kodu). Bu kararla eskiyen cümleler:

- §2 "kurye atama" ve §3 "Siparişe kurye atama" **kalktı**: kurye rotayı KENDİSİ alır, atama bir plan
  eylemi olmaktan çıktı. Gün planına rota başına **sefer şeridi** geldi (açılmadı / yolda / döndü /
  kapandı · kurye · araç); kalan tek elle müdahale **sefer devri** (hasta kurye — sefer üstünde, sipariş
  seçimiyle değil). "Atanmamışlar belli olur" beklentisinin yeni karşılığı: "N rotanın seferi açılmadı".
- "Askıda kalanlar" KÜÇÜLDÜ: `out_for_delivery`de takılma hâlini artık sefer kapanışı kendisi çözüyor
  (durum otomatik `ready`ye döner, YENİ GÜNÜ yine sevkiyatçı yazar — "görünür devir" korunur). Bölümde
  kalan tek hikâye: günü geçmiş ama hiç yola çıkmamış sipariş.
- Üçüncü sekme **Seferler**: gerçekleşen kayıtların listesi (SF kodu · rota · kurye · araç · saatler ·
  mutabakat özeti) — geçmişe kanıt; performans ölçümü DEĞİL (dashboard'un "verim ölçmez" çizgisi).
