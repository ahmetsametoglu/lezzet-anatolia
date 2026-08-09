# Admin — Asistan Onay Kuyruğu

> **Yeni ekran (22.3).** AI yönetici asistanının önerdiği yazma işlemleri burada onaylanır.
> Kurgu: `docs/architecture/AI_ADMIN_ASSISTANT.md §5`. Emsal desen: `admin-b2b-onay.md`
> (kuyruk + karar kartı + tek dokunuş) — oradaki iskelet korunur, farkı §3'te.

## 1. Amaç ve kullanıcı

Asistan işletmenin işini **hazırlar**, patron **uygular**. Bu ekran o devrin tek kapısıdır:
asistanın yazma niyetleri (paket kur, sipariş aç, stok gir, para yaz…) burada birikir; patron
tek tek bakar, uygular ya da reddeder. **Onay başka hiçbir yerden verilemez** — asistanın kendi
yüzeyinde onay aracı yoktur, yani kaçak bir asistanın yapabileceği en kötü şey reddedilecek bir
liste üretmektir.

Kullanıcı: yalnız admin. Tipik karar birkaç saniye ile bir dakika arasıdır; ekran bunun için kurulur.

## 2. Tasarımın çözmesi gereken ASIL problem

Kuyruktaki kalemler **birbirine benzemez**: biri altı kalemlik bir paket, biri 340 €'luk bir
tedarik siparişi, biri son kullanma tarihli üç parti stok girişi, biri tek satırlık bir para
hareketi. Hepsinin verisi farklı tablolara gider ve içeriği farklı şekildedir.

**Çözüm: tek kuyruk, tipe göre değişen önizleme.** Liste ve karar çerçevesi HER TİPTE AYNIDIR
(öğrenilecek tek bir ekran); değişen yalnız ortadaki önizleme bloğudur.

**Ham JSON asla ana yüzey değildir.** Operatöre `{"items":[{"variantId":"a3f…"}]}` göstermek,
onaydan anlam beklemeyi bırakmaktır — üç kez sonra herkes okumadan onaylar. Önizleme, **işlemin
sonucunun kendisini** gösterir: paket önerisinde müşterinin göreceği kart, stok girişinde parti
tablosu, para hareketinde muhasebe satırı. Ham JSON yalnız katlanmış bir "teknik döküm"
bölümünde durur (denetim ve hata ayıklama için).

## 3. İçerik envanteri — ne var, neden

### Kuyruk (sol/üst)

- **Bekleyen öneriler** — en eskisi üstte (unutulmasın; B2B kuyruğunun kuralı). Her satır:
  **tip rozeti** (paket · tedarik · stok · para · vitrin · bölge · ürün · tarif · indirim) +
  **özet cümlesi** (asistanın yazdığı tek cümle: *"6 kalemlik 'Kış Sofrası' paketi, 89 €"*) +
  **yaş** (*"2 saat önce"*) + varsa **tutar**.
- **Tazelik uyarısı** — süresi dolmaya yakın kalemler işaretli; dolmuş olanlar kuyruktan düşer
  (ayrı bir "süresi geçti" görünümünde kalır). Gerekçe: dünkü stoğa göre kurulmuş bir öneri
  bugün doğru olmayabilir.
- **Karar geçmişi** — uygulananlar/reddedilenler (kim, ne zaman, ret notu). *"Bunu neden
  reddetmişiz"* sorusunun cevabı burada durur.

### Karar çerçevesi (her tipte AYNI)

- **Özet cümlesi** — büyük ve ilk okunan şey.
- **Neden bu öneri** — asistanın dayandığı sinyal (*"67500 kodu 47 kez soruldu"*, *"un eşiğin
  altında, 8 gün yeter"*). Gerekçesiz öneri onaylanmaz; bu blok boşsa tasarım onu belli etmeli.
- **Etki satırı** — uygulanınca ne olacak, düz Türkçe: *"Katalogda yeni bir paket oluşur; müşteri
  vitrininde görünmez (pasif doğar)"*.
- **Aksiyonlar** — **Uygula** (birincil) · **Reddet** (nedeni yazılabilir) · **Sonra bak**
  (kuyrukta kalır). Reddedilen öneri silinmez; geçmişe düşer.
- **Teknik döküm** (katlanmış) — ham `payload`, hedef tablolar, öneri kimliği.

### Önizleme bloğu — TİPE GÖRE değişen tek bölüm

| Tip | Önizlemede ne görünür |
| --- | --- |
| **Paket taslağı** | Müşterinin göreceği **paket kartı** (ad, görsel, fiyat) + kalem tablosu (ürün · boy · adet · atanmış pay) + **mutabakat rozeti** (payların toplamı paket fiyatını tutuyor mu — tutmuyorsa farkı yazan uyarı) + "ayrı ayrı alınsa" karşılaştırması |
| **Tedarik siparişi (PO)** | Tedarikçi + kalem tablosu (ürün · adet · birim · beklenen tutar) + **toplam** + hedef depo + "yolda olan" bilgisi (aynı üründen bekleyen sipariş varsa uyarı) |
| **Stok girişi / mal kabul** | Parti tablosu (ürün · boy · adet · **son kullanma tarihi** · lot) + hedef depo + belge no. Tarihi geçmiş/çok yakın parti satırı **işaretli** — gıdada en pahalı hata burada |
| **Para hareketi** | Muhasebe satırının kendisi: hesap · tür (gider/tahsilat/transfer) · kategori · tutar · karşı taraf · tarih + varsa bağlı sipariş/tedarikçi |
| **Vitrin işareti** | **Öncesi → sonrası**: hangi kayıt vitrine giriyor/çıkıyor + o bandın doluluk sayısı (*"vitrinde 5 kategori olacak"*) |
| **Bölge genişletme** | Küçük harita/liste: eklenecek posta kodları + hangi bölgeye + o kodların talep sayısı + **haber bekleyen müşteri sayısı** (uygulanınca onlara bildirim gider — bu, geri alınamaz bir dış etkidir ve önizlemede AÇIKÇA yazmalı) |
| **Ürün taslağı** | **Alan bazında fark**: hangi alan boştu, asistan ne yazdı (üç dil yan yana). Alerjen/saklama alanları asistan tarafından DOLDURULMAZ — eksik kalır ve o eksiklik burada kırmızı görünür |
| **Tarif taslağı** | Tarif kartı önizlemesi (başlık, adımlar, malzeme→ürün bağları) + üç dil doluluk göstergesi (dolmadan yayınlanamaz) |
| **İndirim/kampanya** | Kural özeti düz Türkçe (*"Tatlı kategorisinde %15, 30 Eylül'e kadar, alt sınır 25 €"*) + kimlere uygulanır + tahmini etki |

## 4. Aksiyonlar

- **Uygula** → işlem normal servis/motor yolundan koşar. Motor reddederse (stok bitmiş, mutabakat
  tutmuyor) öneri **"uygulanamadı"** hâline geçer ve **sebebi ekranda yazar** — sessizce
  kaybolmaz. Bu hâl "reddedildi"den ayrı görünmeli: biri patronun kararı, öteki sistemin cevabı.
- **Reddet** (opsiyonel not) · **Toplu ret** (seçilenler) — toplu UYGULA yok: her uygulama ayrı
  bir karardır, çoklu seçim onayı hızlandırmaz, dikkatsizleştirir.
- Uygulandıktan sonra **doğan kayda köprü** (*"paketi aç"*, *"siparişi gör"*).
- Kuyruk boşken: sakin bir boş durum (*"Bekleyen öneri yok"*) — asistanın çalışmadığı anlamına
  gelmez, sorulmadığı anlamına gelir.

## 5. Durumlar ve varyasyonlar

- **Bekleyen / süresi yaklaşan / süresi geçmiş** — üç görsel hâl.
- **Uygulandı / reddedildi / uygulanamadı** — geçmişte üç ayrı renk; "uygulanamadı" sebebiyle.
- **Dış etkili öneri** (bölge genişletme → müşteriye bildirim) — onay düğmesi bunu ayrıca
  söylemeli; geri alınamaz eylem, geri alınabilir olanla aynı görünmemeli.
- **Gerekçesiz öneri** — sinyal bloğu boşsa görsel olarak zayıf durmalı (onaylanabilir ama
  patron neye dayandığını göremediğini bilmeli).
- **Mobil YOK** (operasyon yüzeyi yalnız masaüstü — `docs/uygulama/README.md` yüzey formülü).

## 5b. YENİ TUR (22.6) — Belgeden ürün: ambalaj fotoğrafından ürün açma ve tamamlama

> **Bu bölüm yeni bir tasarım turu ister.** Yukarıdaki iskelet (kuyruk + karar çerçevesi) aynen
> kalır; istenen şey **iki yeni önizleme** ve onların gerektirdiği yeni görsel dil. Kullanıcının
> kendi cümlesiyle gerekçe: *"Data girişiyle alakalı bizim en net duvarımız onay ekranımız. Onay
> ekranını çok güzel kullanmamız lazım ki insanın gözüne problemler hızlıca batabilsin."*

### Senaryo (gerçek, kullanıcının anlattığı)

Patron bir ürünün **ambalajının fotoğraflarını** çeker — içindekiler listesi, besin tablosu,
saklama koşulu, alerjen satırı — ve asistana yükler. Asistan görselleri okur, veriyi çıkarır ve
kuyruğa bir öneri bırakır. İki hâl var ve **ikisi de aynı ekranda karar bekler**:

1. **Yeni ürün açma** — katalogda hiç yoksa (`product_create`).
2. **Var olanı tamamlama/düzeltme** — kayıt var, alanları eksik ya da yanlış (`product_draft`).

### Bu önizlemenin çözmesi gereken ASIL problem

**Kaynağı doğrulamak DEĞİL.** Ambalajı çeken, yükleyen ve onaylayan aynı kişi: ürünü elinde
tutuyor, ne gönderdiğini biliyor. Ona ambalajı ekranda tekrar okutmak boş yük — okuduğu ham metni
sayfaya sermek de öyle.

Asıl soru şu:

> **"Sisteme ne yazılıyor, ve neyi eksik bırakıyor?"**

Yani bu bir **inceleme** ekranıdır: patron bir saniyede *"bu kayıt tam mı, bir tuhaflık var mı"*
diyebilmeli. Kullanıcının kendi ölçütü: *"insanın gözüne problemler hızlıca batabilsin veya
onaylanması istenen talebi çok kolay inceleyebilsin."*

Tasarımın işi eksik ve tuhaf olanı **öne çıkarmak**, doğru olanı sessizce geçmektir. Her alanı
eşit ağırlıkta gösteren bir tablo bunun tam tersini yapar: göz kalabalıkta gezinir, üçüncü seferde
okumadan onaylanır.

### İçerik envanteri — ne var, neden

**① Çıkarılan alanlar, üç dil.** Ad · açıklama · içindekiler · saklama koşulu · aile etiketi.
Yeni üründe ayrıca: kategori · tarih tipi (DLC/DDM) · raf ömrü (gün) · KDV oranı · en az bir boy
(varyant) adı. **Fiyat ve stok BU EKRANDA YOK** — ayrı işler, ayrı kararlar.

**② TAMLIK — ekranın en önemli tek bilgisi.** *"Bu kayıt yayınlanabilir hâlde mi, değilse ne
eksik?"* Sistem bunu zaten hesaplıyor (üç dilde ad + içindekiler + besin künyesi + saklama +
alerjen dolu mu) ve eksikse ürün satışa çıkamıyor. Patronun onaydan önce görmesi gereken tek
cümle bu: *"Onaylarsan kayıt tam olur"* ya da *"Onaylasan da besin künyesi ve Almanca ad eksik
kalacak"*. Eksik alanlar **adlarıyla** sayılmalı — sonradan aramak zorunda kalmasın.

**③ ALERJENLER — on dört AB alerjeninin TAMAMI, işaretlenmeyenler dahil.** İşaretlenenler vurgulu,
işaretlenmeyenler sönük **ama görünür**. Sebebi kaynak denetimi değil: *en tehlikeli hata fazladan
alerjen değil, EKSİK alerjendir* ve yalnız seçilenleri gösteren bir liste tam da onu görünmez
kılar. Patron ürünü tanıyor — *"fındık işaretlenmemiş"* diyebilmesi için fındığın orada,
işaretsiz durması yeter. Çapraz bulaşma (iz) listesi aynı kuralla.

**④ Besin künyesi** (100 g başına enerji/yağ/karbonhidrat/protein/tuz) — tablo hâlinde. Ölçü
birimleri ve mantık dışı değerler göze batmalı: sıfır enerji, %100'ü aşan toplam, boş bırakılmış
satır. Burada aranan "ambalajla aynı mı" değil, **"bu tablo kendi içinde tutarlı mı"**.

**⑤ ASİSTANIN EMİN OLMADIĞI ALANLAR.** Model bir satırı net okuyamadıysa (bulanık, kesik, yansıma)
bunu söyleyebilmeli ve o alan gözü kendine çekmeli. **Ekranın gözü buraya yönlendirmesi, bütün
alanları tek tek okutmaktan değerlidir**: patron zaten ürünü biliyor, ona *"şuraya bak"* demek
yeter. Kuyruğun bugünkü "gerekçesiz öneri soluk durur" diline benzer ama daha keskin — orada bilgi
eksikti, burada bilgi **şüpheli**.

**⑥ ÜZERİNE YAZILANLAR (yalnız tamamlama hâlinde).** Alan doluysa eski ve yeni değer yan yana,
ve *"üzerine yazılacak"* açıkça yazılı. Sebep teknik ve geri alınamaz: ürün metinlerinde sürüm
tutulmuyor, onaylandığı an eski metin kayboluyor. Alan boşsa bu vurgu **olmamalı** — her yerde
uyarı veren ekran, hiçbir yerde uyarmamış olur.

**⑦ Sonucun ne olacağı — ve buradaki emniyet görünmeli.** Ürün **aday (candidate)** olarak doğar
ya da taslakta kalır; **satışa çıkarmak bu ekranın işi değildir**. Beyan tamlığı ile satış durumu
sistemde iki ayrı eksen ve bu ayrım patronun güvencesi: en kötü hâlde bile yanlış okunmuş bir
alerjen vitrine düşmez. Ekran bunu bir uyarı gibi değil, bir **rahatlama** gibi söylemeli.

### Neyin bugün uygulanabilir olduğu (22.3'ün dersi)

> Önceki turda dokuz tipi listelemiş ama "bugün uygulanabilir olanlar" ayrımını yazmamıştım;
> tasarım gerçek iş listesini çizdi, kod başka yerdeydi. Bu sefer açık yazıyorum.

- **Çizilecek iki önizleme:** yeni ürün (`product_create`) ve tamamlama (`product_draft`).
  İkisinin de payload'ı yazılacak — tasarım geldiğinde kod ona uyar, tersi değil.
- Yukarıdaki alanların hepsi **payload'da olacak**: tamlık bilgisi, emin olunmayan alan işareti,
  eski değerler, alerjen/iz listeleri, besin künyesi, varyant adları.
- **Fiyat, stok ve görsel bu tipe DAHİL DEĞİL.** Ürün görseli ayrı bir yetki sınıfı (medya),
  fiyat ayrı bir karar. Çizimde yer tutucu bile olmasın — olmayan bir şeyi vaat etmeyelim.
- **Ambalajın ham metni ekrana SERİLMEZ.** Fotoğrafı çeken, yükleyen ve onaylayan aynı kişi;
  kaynağı ona tekrar okutmak boş yük. (Hata ayıklama için "teknik döküm" katlamasında durabilir —
  ana yüzeyde değil.)
- Ekran **yalnız masaüstü** (operasyon yüzeyi kuralı).

### Ölçüt

Tasarımın başarı ölçütü tek soruyla sınanır: **patron bu kaydı kaç saniyede "tamam" ya da "burada
bir şey eksik" diye ayırabiliyor?** Ürünü zaten tanıyor; ekranın işi ona ürünü anlatmak değil,
**eksik ve şüpheli olanı önüne koymak**. Doğru ve tam olan sessizce geçmeli.

## 6. Bu ekranın ötesinde

Kuyruk bir **bildirim** kaynağı da olacak (bekleyen öneri sayısı üst çubukta) — ama tasarımı
mevcut bildirim deseninden gelir, burada yeni bir şey icat edilmez.
