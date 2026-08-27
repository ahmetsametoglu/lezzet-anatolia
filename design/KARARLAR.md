# Tasarım Kararları — Kapanmış, Yeniden Tartışılmaz

Bu dosya `design/BACKLOG.md`'den 07.08'de ayrıldı: **kapanmış** tasarım↔kod kararlarının ve
bilinçli sapmaların arşividir. Mekanik bir denetim (ör. ölçü/token turu) bunları "tasarıma
çekilecek sapma" sanıp geri almasın: geri çekilecek bir tasarım yok, gerekçe burada yazılı.
İtiraz gelirse madde yeniden `design/BACKLOG.md §2`'ye (karar bekleyen) taşınır; karar değişirse
buradaki kayıt silinmez, üstü çizilip yeni karar altına yazılır.

> Bölüm gövdeleri BACKLOG'dan birebir taşındı; metin içindeki eski `§N` atıfları taşınma öncesi
> BACKLOG numaralarına işaret ediyor olabilir — bağlamından okunur.

---

## 1. Kapanmış açıklar — müşteri yüzeyi (eski BACKLOG §1 alt bölümleri)

### 1f. Ürün detay yorum bölümü + "Yorum yaz" — KAPANDI (29.07)

Arka uç aynı gün bitmişti (17.1) ve doküman "eksik: ürün sayfası yorum paneli (müşteri UI)" diyordu;
kalan iş yalnız yüzeydi. Tasarımın üç kuralı koda geçti:

- **Puan alanı GİZLENİR** — "0,0" gösterilmez. Sıfır puan kötü ürün demek değil, "henüz kimse
  yazmadı" demektir; ikisi aynı ekranla anlatılamaz, o yüzden beyansız üründe boş durum çıkar.
- **İlk ÜÇ yorum**; fazlası varsa "tümü" satırı görünür, üç ve altındaysa hiç görünmez.
- **"Yorum yaz" yalnız satın almış girişli müşteride** — kararı ekran vermiyor, kapı veriyor
  (`getReviewEligibility` siparişleri okur). Form da "yayınlandı" demiyor: yorum moderasyondan
  geçmeden görünmüyor, "alındı, gözden geçirilecek" deniyor.

Yıldız ve metin **ikisi de tek başına yeterli** (kapı yalnız ikisinin birden boş olmasını reddediyor):
zorunlu metin, yıldız vermek isteyen müşteriyi cümle kurmaya zorlardı.

**Panel de indi (04.08)** — `?reviews=1` modal/tam ekran, yıldız histogramı, dört süzgeç çipi,
10'ar sayfalama. `BEKLEYEN(BACKLOG §1)` işareti kaldırıldı; ayrıntı `build/08` 08.11'de.

Adres anahtarı **İngilizce** (`reviews`), tasarımın `?yorumlar=1` yazması Türkçe ekranın gösterimi:
sorgu anahtarları bu projede dile göre çevrilmiyor (`?offers=1` ile aynı kural, `SEO_I18N`).

### 1e. Sepet kupon kutusu — KAPANDI (29.07)

Kutu çizilmişti, "Uygula" bağlanmamıştı — ve bu satır **29.07'ye kadar hiçbir envanterde yoktu**:
UI kodlandı, kayıt düşülmedi, hiçbir kontrol fark etmedi. `BEKLEYEN(<ref>)` denetimi (CLAUDE.md §5)
tam bu boşluk yüzünden kuruldu.

Kapanması küçük bir işti çünkü **arka uç zaten hazırdı**: `discount`/`discount_use` şeması (0031),
motor (`applyBestDiscount` · `checkCouponEligibility`) ve sunucu kapısı (`lib/cart/discount.ts`,
dört ret hâliyle birlikte) yerindeydi; hatta `getCartView` `couponCode`'u çoktan alıyordu. Eksik olan
tek şey ekranın kodu taşımasıydı.

- **Kod bir NİYETTİR** (`lib/cart/coupon-store.ts`), sepet kalemleriyle aynı katman: tarayıcıda
  yalnız "şu kodu denedim" durur; geçerlilik, tutar ve kazanıp kazanmadığı her okumada sunucuda
  yeniden çözülür. Tutar ya da indirim kimliği tarayıcıya YAZILMAZ. `cart` tablosuna kolon
  açılmadı — kod kalıcı veri değil, sepet boşalınca anlamını yitiriyor.
- **Kod değişince okuma yeniden koşar** (`load` bağımlılığı): istemcinin "bu kupon geçerli mi"
  diye bir görüşü yok, cevabı her zaman sunucu verir.
- **Aynı turda bulunan ikinci kusur:** sepet okuması `customerId` geçirmiyordu — kişisel kupon ve
  müşterinin genel oranı sepette görünmüyor, checkout'ta beliriyordu. Aynı sepet iki ekranda iki
  farklı indirim gösteriyordu.
- **"Geçersiz" ile "kazanamadı" ayrı hâller:** kupon geçerli olup otomatik indirim daha büyük
  olabilir (`outranked`) — o zaman terracotta ret değil, zeytin bilgi cümlesi çıkar ve sepete
  kazanan indirim uygulanır. Sekiz sebep beş cümleye eşlenir: "pasif · başlamamış · bilinmeyen kod ·
  senin değil" dördü de müşteri için "bu kod geçerli değil"dir (kişisel kuponun varlığı sızdırılmaz).

### 1a. Fiyat sıralaması — KAPANDI (28.07)

Engel bir modül değildi (stub bir süre yanlışlıkla `→05.4` etiketliydi): uygulanabilir fiyat ayrı
tablodadır ve "bu ürünün b2c fiyatı" tek bir kolon değil bir **seçimdir**. Sayfa çekildikten sonra
sıralamak seçenek değildi — "artan fiyat" yalnız o 30 satır içinde artan olur.

Çözüm `available_stock` desenindedir: `product_listing` okuma görünümü (`0032`) seçimi SQL'de çözer,
sıralama ve keyset imleci onun üstünde çalışır. Görünüm motorun (`resolvePrice`) **liste dalını**
SQL'de yeniden ifade eder; bu bilinçli bir ödünleşmedir ve ayrışma riski yorumla değil **testle**
tutulur (`packages/application/src/catalog/catalog.test.ts`: teklif kazanır / kaybeder / eşittir /
partisi boştur hâllerinde sıralamanın kullandığı fiyat ile kartta yazan fiyat karşılaştırılır).

**Düzeltme (24.08, 08.54 — ölçülerek):** görünüm uzun süre yalnız **ziyaretçi** dalını ifade ediyordu
(`where p.channel = 'b2c'`) ve testlerin onu da `VISITOR` ile koşuyordu — yani bekçi, koruduğu çiftin
tek yarısını ölçüyordu. Sonucu canlıydı: onaylı B2B müşteri kartlarda kendi toptan fiyatını görüp
listeyi son müşteri fiyatlarına göre sıralanmış alıyordu (97 üründe 68 yanlış yerleşim, en büyük
kayma 22 sıra). Kanal artık görünümün grain'inde ve testler iki kanalı da koşuyor.

**PAZARLIKLI FİYAT SIRALAMAYA GİRMEZ — bilinçli sapma (kullanıcı kararı 24.08).**

**ÖNCE NE ETKİLENMİYOR — çünkü bu cümle bir kez yanlış anlaşıldı (24.08):** pazarlıklı fiyat
GÖSTERİMDE hiçbir şey kaybetmez. Müşteri giriş yaptığı andan itibaren **her yerde** kendi fiyatını
görür — katalog kartında, ürün detayında, sepette, ödemede. Sepete atmasına gerek yoktur. Ölçüldü
(24.08, Restaurant Bosphore · Fıstıklı Artisan Kek): ziyaretçi 1,27 € · Bosphore **0,89 €** hem
kartta hem detayda (liste fiyatı 0,99 €, pazarlıklı 0,89 €).

**Etkilenen tek şey SIRA.** "Artan/azalan fiyat" seçildiğinde liste, müşterinin KANALINDAKİ liste
fiyatına (+ son-tarih teklifine) göre dizilir; pazarlıklı fiyat bu dizilime katılmaz. Yani müşteri
0,89 € gördüğü ürünü, listede 0,99 €'ya karşılık gelen yerinde bulur — fiyatı yanlış görmez, birkaç
sıra aşağıda görür. Ölçüldü: 12 pazarlıklı satırı olan tek onaylı toptan müşteride, 97 üründe
**1** yer değişimi.

Verilen söz açıkça şudur: *"Fiyatınız her yerde sizin fiyatınızdır; yalnız fiyata göre sıralama
bizim liste fiyatımıza göre dizilir."*

**Neden bu kabul edildi:** düzeltmenin maliyeti kazancıyla orantısız. Sıralama keyset (imleç)
yüzünden SQL'de olmak zorunda ve görünüm parametre alamaz — pazarlıklı fiyatı sokmanın iki yolu var,
ikisi de büyük: müşteri eksenini grain'e katmak (`müşteri × depo × kanal × ürün`) ya da sıralamayı
bir RPC'ye taşıyıp sonsuz kaydırmanın imlecini yeniden yazmak. Bugünkü etki 1/68 kadar.

**YENİDEN AÇILMA KOŞULU** (yoksa bu karar yeniden tartışılmaz): pazarlıklı fiyat verilen müşteri
sayısı anlamlı bir yere çıkarsa ya da o müşterilerden "sıralama yanlış" bildirimi gelirse. O gün
ölçülecek ilk şey müşteri eksenini görünüme eklemenin sorgu planına maliyetidir — **ölçülmedi**, tek
müşteri süzülünce ucuz kalacağı bir teoriden ibaret.

### 1b. "Çok sevilenler" — KAPANDI (29.07, kullanıcı kararı puristliği bozdu)

**Karar:** ızgara çizilir; popülerlik ölçüsü yokken kaynağı **katalog yedeğidir**. Kullanıcının
gerekçesi aşağıdaki muhakemeyi tersine çevirdi ve haklıydı: *"Eğer bir datanın istatistiği
oluşmadıysa onun yerine şimdilik boş olmaması için gene katalogdaki bir ürünü gösterebilmeliyiz."*

Aşağıdaki eski gerekçe **sosyal kanıt** riskini doğru görüyordu ama bedelini yanlış hesaplıyordu:
alanı boş bırakmak ekranın bittiğini düşündüren bir boşluk üretiyor — müşteri o noktada siteyi
terk ediyor. Dört ürün göstermek "bunlar en çok satanlar" diye bir iddiada bulunmuyor; başlık bir
seçki başlığı olarak da okunuyor. Kaynak anasayfanın bandıyla AYNI (`readShowcase`) — iki ekran iki
farklı "seçki" göstermiyor.

**Ölçüt İNDİ (04.08 · 08.9):** sıralama artık son N günün görüntüleme + sepete ekleme toplamından
geliyor (`analytics_daily_product`, pencere ayardan). Katalog yedeği KALDIRILMADI — veri
birikmemişken (ilk günler, yeni kurulum) yine devrede ve seçki boş kalmıyor. Yani kullanıcının
kararı kalıcı oldu: yedek bir geçiş çözümü değil, **ilk-gün hâlinin kendisi**. Sözün tutulduğu yer
tekti (`readShowcase`), değişen de tek yer oldu — iki ekran da onu izledi.

<details><summary>Eski gerekçe (arşiv — kararı anlamak için)</summary>

Başlık bir POPÜLERLİK İDDİASIDIR. Elimizde popülerlik ölçüsü yok: satış sayısı `order_item`
satırlarından çıkar ve gruplayarak saymak ya bir okuma görünümü (migration) ya da sınırsız
büyüyen bir kümeyi uygulamada toplamak demek — ikincisi sipariş sayısı arttıkça sessizce yavaşlar.

Anasayfanın `featured` seçkisi (bugün "ilk dört ürün") oraya konabilirdi ama **konmadı**: "çok
sevilenler" diye etiketlenen rastgele dört ürün, uydurma sosyal kanıttır — projenin yorum
tarafında reddettiği şeyin aynısı. Tasarımın kendi kuralı da bu boşluğu zaten çözüyor: *"Bağlam
yoksa alan tamamen kaldırılır, ekran yalnız başlık + iki butonla kalır (boşluk doldurulmaz)."*

</details>

> Aynı hata bir kez daha yaşandı: "Fırsat" rozeti `→05.6` (genel indirim motoru) etiketliyken,
> gerçekte beklediği şey `05.6` değil zaten var olan near-expiry teklifiydi — kablo eksikti, modül
> değil. **Ders:** stub'a bağımlılık yazarken "hangi modül" kadar "gerçekten o modül mü" da sorulur.
>
> **Ve bu maddenin dersi:** "verisi yok" ile "gösterilecek hiçbir şey yok" aynı şey değil. Ölçütü
> olmayan bir alanı boş bırakmak, makul bir yedekle doldurmaktan daha pahalı olabilir — kararı
> ekranın müşteride ne yaptığına bakarak vermek gerekiyor, yalnız verinin saflığına bakarak değil.

### 1c. "Kayıt" sütunu — KAPANDI (28.07)

Park edilmişti: sütun çiziliydi ama arkasında numara yoktu. Kararı verilen şekil kuruldu ve
`10.5`'te indi — numara **satır başına değil olay başına**: aynı imhanın/sayımın bütün satırları
`IMH-26-0012` gibi tek bir referansı paylaşır, çünkü kâğıt tutanakla eşleşen şey satır değil olaydır.

Numara **sıralıdır** (sipariş referansının tersi ve bilerek: o dışarı gider, bu içeride kalır) ve
**doğduğu yerde** üretilir — `adjust_stock_batch` RPC'si içinde, `Order.reference_no` deseniyle aynı.
Stok ekranı `stock_adjustment.reference_no` alanını okuyup sütunu açabilir.

### 1d. Near-expiry sekmesi — KAPANDI (28.07)

Bir tur açık kaldı ve gerekçesi şuydu: sekmenin ihtiyacı olan şey ham parti satırı değil, karara
bağlanmış parti GÖRÜNÜMÜ (`toBatchViews` + eşik okuması) ve o türetme stok ekranının klasöründe
yaşıyordu. Kopyalamak, eşik değişince iki ekranın farklı karar göstermesi demekti.

Türetme, parti sözlüğü, teklif eylemi ve teklif diyaloğu paylaşılan yere taşındı (`lib/stock` +
`components/operation/stock`); sekme açıldı. Kanıt: iki ekran da aynı anda 21 parti sayıyor.


---

### 1g. Adres girişi — ADRES LİSTESİNDEN SEÇİM, ada göre arama YOK (25.08, kullanıcı kararı)

**Karar:** müşteri sokak adresini yazar, **adres listesinden seçer, alanlar dolar, isterse sonradan
kendisi değiştirir.** Posta kodu ya da şehir adı üzerinden ayrı bir arama AÇILMAZ.

**Denetimin önerisi REDDEDİLDİ ve gerekçesi düzeltildi.** Öneri şuydu: "müşteri kodunu bilmeyebilir,
şehir alanı da arama olsun." Kullanıcının itirazı: *"Fransa ve Almanya'da yaşayan insanlar posta
kodlarını bilirler, bu iki ülkede posta kodu çok aktif kullanılır."* Yani önerinin dayandığı ihtiyaç
yok. İkinci itiraz daha ağır: **çok yerleşimli kodda ada göre giriş DAHA tehlikeli** — ad yazan
müşteri kodu seçmiş olmaz, biz onun adına seçmiş oluruz. `67800` ile *"Bischheim mi Hœnheim mi"*
sorusunun cevabı müşterinindir; ad araması o cevabı sessizce üretirdi.

**Bugünkü kod zaten bu akış** (ölçüldü 25.08, gerçek formda): `"12 rue du Marechal Foch"` →
`12 Rue du Maréchal Foch · 67000 · Strasbourg`, üç alan birden doluyor, aksansız yazım aksanlı
kayda oturuyor, seçim sonrası her alan düzenlenebilir kalıyor.

**Bilinen ve KABUL EDİLEN sonuç:** seçimden sonra elle düzeltme serbest olduğu için kod ile şehir
ayrışabilir (67000 + "Bischheim" yazılabilir) ve bunu kimse doğrulamıyor. Kullanıcının kararı bunu
kapsıyor (*"sonra istiyorsa kendisi değiştirebilsin"*); tutarlılık dayatmak, gerçek bir adresi
reddetme riskini getirirdi.

**Bilinen sınır:** BAN yalnız Fransız adreslerini biliyor — ölçüldü, `"Hauptstrasse 12 Kehl"` ve
`"77694 Hauptstrasse 12"` sıfır öneri döndürüyor. Alman adresi elle yazılır; kodu bilindiği için
engel değil, ülke yine koddan doğru türüyor.

**Öneri listesi müşterinin bölgesini ÖNE ALIR** (aynı turda yazıldı, 08.41): sokak adları Fransa'da
yüzlerce kez tekrar ediyor ve servis sıralamayı yalnız metne bakarak yapıyordu — `"12 rue foch"`
Saint-Denis · Montpellier · Tournefeuille döndürüyordu. Yer ipucuyla Schiltigheim · Mundolsheim
dönüyor, **Saint-Denis dördüncü sırada listede kalıyor**. Süzgeç değil sıralama tercihi olması şart:
hediye ya da iş adresi girenin yolu kapanmamalı.

**Yer hapının (başlık) ad araması AYRI ve duruyor** (kullanıcı kararı 25.08): orada seçilen şey
yalnız posta kodudur, şehir değil — çok yerleşimli koddaki tehlike o yüzeyde doğmuyor.

## 2. Bilinçli sapmalar (eski BACKLOG §3)

- **"FIRSATLAR" ÜST MENÜDEN VE FOOTER'DAN KALDIRILDI (kullanıcı kararı 09.08, 08.29).**
  Tasarım (`Musteri - Anasayfa.dc.html` ve öteki müşteri çizimleri) menüde "Fırsatlar"ı terracotta
  vurguyla gösteriyor. Kodda artık yok — üst menüde, mobil menüde ve footer'da.

  Gerekçe kullanıcının kendi tespitiydi ve kodun künyesi zaten aynı şeyi söylüyordu: *"AYRI BİR
  ROTA DEĞİL: katalogun teklif süzgeçli hâli (`?offers=1`)."* Yani menüde katalogun bir kopyası
  duruyordu; `PATHNAMES`'te `offers` diye bir rota hiç olmadı. Beş öğeli menüde altıncı sırayı
  kataloğun ikinci adına vermek, gerçek bir yüzey gibi görünen bir süzgeç yaratıyordu.

  **Süzgeç erişilebilir kaldı, iki ANLAMLI yoldan:** ana sayfanın kahraman düğmesi ("Bu haftanın
  fırsatları") ve fırsat bandının "Tüm fırsatlar →" bağı. İkisi de `/catalog?offers=1`'e gidiyor.
  Kahraman düğmesi bu turdan önce `/`'a, yani kendine gidiyordu (ölçüldü) — o da düzeltildi.

  Yan temizlik: `NavKey`'den `deals` ve üç dilden `nav.deals` metni düştü. Katalog `?offers=1` ile
  açıldığında aktif menü öğesi `catalog` — doğrusu da bu, gidilen yer katalogun kendisi.

- **FIRSAT BANDI ÜÇ KART VE HER İSTEKTE RASTGELE (kullanıcı kararı 09.08, 08.29).**
  Tasarımın ızgarası `repeat(3,1fr)` ama koddaki sınır **6**'ydı ve künyesi *"tasarımda üçlü ızgara,
  fazlası bandı taşırır"* diyordu — sayı ile cümle çelişiyordu, dördüncü fırsat sessizce ikinci
  satıra kayıyordu. Sınır 3'e indi.

  **Seçim `Math.random()` ile ve bu, koleksiyon rotasyonunda REDDEDİLEN yaklaşımın tersi.**
  `rotateDaily` künyesi random'ı üç sebeple reddediyor (önbellek kırılır · her yenilemede başka
  vitrin · "dün gördüğüm neydi" cevapsız kalır) ve o gerekçeler koleksiyon için hâlâ geçerli.
  Fırsat bandında üçü de düşüyor: bant zaten önbelleklenemez (teklif partiye bağlı, parti erir),
  "her yenilemede başka" burada İSTENEN davranıştır (bant seçki iddiası taşımaz, "elimizde şu an ne
  var" der), ve fırsat yarın zaten olmayabilir — kalıcılık sözü verilmiyor.

  Alternatif "ilk üç" olurdu ve öteki fırsatları hiç göstermezdi. Tamamı "Tüm fırsatlar →" bağının
  arkasında; bağ **yalnız banda sığmayandan fazlası varken** çizilir (`offersTotal > offers.length`),
  aksi hâlde tıklayan müşteri aynı üç ürünü bulurdu — kapı olmayan bir kapı.

- **WHATSAPP ALTLIĞI GÖNDERME KUTUSU DEĞİL, DEFTER KUTUSU (08.08, 15.5).**
  Çizim (`Operasyon - WhatsApp.dc.html`) pencere açıkken *"Mesaj yaz…"* + uçak düğmesi koyuyor.
  Kodda kutu var ama düğmesi **"Deftere işle"** diyor ve altında tek satır duruyor: *"buradan mesaj
  GÖNDERİLMEZ, yazışma telefondan yürür."*

  Sebep: adım 1'de gönderim kanalı YOK (360dialog 15.7/15.11). Yazdığını gönderdiğini sanan bir
  operatör, cevapsız kalan müşteriyi asla fark etmez — çizip yazmamak, yazdığını sandırmanın en
  sessiz yolu. Bugün gerçek olan iş yazışmanın admin telefonundan yürümesi ve ekranın DEFTERİ
  tutması (15.1'in beyanı: *"admin, gelen DM'i işler"*).

  **Pencere kapalıyken kutu HİÇ çizilmiyor** — bu çizimle aynı ve ayrıca doğru: pencere kapalıyken
  admin kendi telefonundan da serbest metin gönderemez (Meta engeller), yani kaydedilecek bir cevap
  da yoktur. Çizimin oradaki *"Kalıp mesaj"* düğmesi de yok: onaylı şablon da sürücü de 15.11.
  Gönderim doğduğu gün kutu gerçek bir gönderme kutusuna döner, kayıt burada güncellenir.

- **STOKTAN DÜŞ FORMU ÇOK SATIRLI — çizim tek satır (09.08, 10.5).**
  `Operasyon - Depo Imha Sayim.dc.html` tek parti + tek adet + tek sebep çiziyor. Kod satır
  biriktiriyor ve hepsini TEK belge numarasıyla yazıyor.

  Sapmanın dayanağı çizimi ısmarlayan isteğin kendi maddesi (`depo-masaustu-tasarim-istegi.md §C`):
  *"bir imhada birden çok parti çöpe gidebilir ve üçü **tek tutanak numarasıyla** yazılır
  (`IMH-26-0012`). Kare bu 'olay = bir kâğıt' ilişkisini göstermeli; satır başına ayrı numara
  yanlış olur."* Çizim bu maddeyi karşılamadı; veri modeli ve arka uç ise ilk günden karşılıyordu
  (`stockAdjustment.referenceNo`, `adjust_stock_batch`). Yani kod isteğe uydu, çizime değil.

  **Form diyaloga TAŞINMADI** ve bu ayrı bir karar: operasyonda diyalog deseni ARA SIRA yapılan
  işler içindir (elle talep açma, fark onayı, kabul formu). Stoktan düşme bu ekranın ASIL işidir —
  her kayıtta pencere açtırmak, ekranı bir düğmeye indirgerdi. Aynı sayfadaki Hazırlık ve Mal kabul
  kareleri de bu ayrımı doğru kuruyor: akan iş masada, tek seferlik karar diyalogda.

- **WHATSAPP KUYRUK SÜTUNU 330 PX — çizim 208 (09.08, kullanıcı kararı, 15.5).**
  Genişlik TALEPLER ekranından referans alındı, çizimden değil. İki ekran aynı satır iskeletini
  paylaşıyor (`ui/queue-pane`) ve operatör aralarında gezinirken gözü aynı yerde aynı şeyi arıyor;
  farklı genişlik, ortaklaştırılmış bir satırı yine iki ayrı ekran gibi gösteriyordu.

  Çizimin 208'i kendi tuvalinin ölçeğinde doğru; bu ölçekte başlık + önizleme + üç rozet o
  genişlikte satırı ikiye bölüyordu. `loading.tsx` iskeleti de aynı değeri taşır — dar kalırsa
  yüklenme bitince yerleşim sıçrar, yani o dosyanın var oluş sebebinin tersi olur.

- **WHATSAPP BALONUNDA SAAT VAR, ÇİZİMDE YOK (08.08, 15.5).**
  Çizim balonların üstüne yalnız ad yazıyor ("Siz"), saat yazmıyor. Kodda künye satırında saat de
  var. Sebep: defter ELLE tutuluyor ve 24 saatlik servis penceresinin dayanağı mesajın ANI —
  saati göstermeyen bir defterde *"pencere neden kapalı"* sorusunun cevabı ekranda hiç görünmezdi.
  Ayrı satır AÇILMADI: çizimin zaten var olan künye satırına yazıldı, yani dizinin ritmi bozulmuyor.

- **TALEPLER EKRANINA ÜÇÜNCÜ SÜTUN EKLENDİ — çizim iki sütun (08.08, 16.3, kullanıcı tespiti).**
  `Operasyon - Talepler.dc.html` kuyruk + detay çiziyor. Koda üçüncü bir sütun eklendi: müşteri
  bağlamı (kimlik · son siparişler · kampanya izni), WhatsApp ekranıyla ORTAK komponent
  (`ui/customer-context-pane`).

  Sebep kullanıcıdan geldi: talep detayı müşterinin adını ve kaçıncı talebi olduğunu söylüyordu ama
  **başka siparişlerini göstermiyordu** — oysa iade kararının en sık sorulan sorusu tam da o ("bu
  müşteri düzenli mi, ilk kez mi sorun yaşıyor"). Veri zaten vardı, ekran sormuyordu.

  Talebin KENDİ siparişi sütuna taşınmadı: o, gövdedeki `OrderCard`'dır ve kalemleriyle birlikte
  şikâyetin zeminidir. Sağdaki liste "öteki alışverişleri" — iki ayrı soru, iki ayrı yer.


- **AB (ALMAN) YOLUNDA "FAALİYET" SORULMUYOR (03.08, 08.7).**
  Tasarımın "Alman şirketi yolu" kartı *"Adres/faaliyet elle doldurulur"* diyor. Adres soruluyor,
  **faaliyet sorulmuyor.**

  Sebep saklayacak bir yer olmaması: `company_info.activityCode` bir APE/NAF kodudur ve Alman
  şirketinin öyle bir kodu yok. Serbest metni o alana yazmak, onay kartının gıda-ailesi sinyalini
  (`isFoodActivityCode`) uydurma bir girdiyle beslemek olurdu — bugün "Belirtilmemiş" diyen dürüst
  bir `warn`, yarın anlamsız bir eşleşmeye dönerdi. Ayrı bir serbest alan açmak ise onay kartında
  hiçbir dallanmayı beslemeyen, yalnız okunan bir satır demekti.

  **Bugünkü davranış:** AB yolunda faaliyet boş kalıyor ve onay kartı bunu `warn` ("bu bilgi YOK")
  tonuyla gösteriyor — `bad` değil, çünkü eksik veri kötü veri değildir (`b2b-approval` künyesi).
  Tasarım tarafı bu satırı gerçekten istiyorsa önce ne saklayacağımıza karar verilmeli.

- **HESAP MOBİLDE "KUPONLARIM" ÇİZİLİ DEĞİL, AMA EKLENDİ (03.08, 17.5).**
  `Musteri - Hesap.dc.html`in mobil karesi şu blokları taşıyor: Puanlarım (içinde **"Kupona çevir"**
  düğmesi) · Profil · Adresler · Kampanya iletişimi · Gizlilik politikası. "Kuponlarım" yok — o yalnız
  masaüstü karesinde var.

  **Çizim eylemi mobilde veriyor ama sonucunu göstermiyor.** Puanını mobilde çeviren müşteri onay
  diyaloğunda *"kupon Kuponlarım'da görünür"* cümlesini okuyup gidecek bir yer bulamazdı; kodu ne
  görebilir ne kopyalayabilirdi. Mobil menüde yaşanan çıkmazın aynısı — tasarımın **söylediği**
  yüzeyi, **çizmediği** için var saymamak.

  **Uygulanan çözüm en dar olanı:** kutu mobile eklendi ama `coupons.length > 0` koşuluyla — kupon
  yokken ekran tasarımın çizdiği gibi kalıyor, yalnız gerçekten bir kod varken beliriyor. Boşken de
  çizmek, tasarımın bilerek sade tuttuğu mobil hesaba kullanılmayan bir blok eklemek olurdu.
  Tasarım tarafı mobil kareye "Kuponlarım"ı eklerse bu koşul kalkar.

- **AYARLAR: TESLİMAT BÖLGESİ TABLOSU BU EKRANDA DEĞİL, DEPOLAR'DA (03.08, 09.16 ↔ 19.5).**
  Tasarımın alt yarısındaki "Teslimat bölgeleri — posta kodu tanımı" tablosu (bölge · kodlar · gün ·
  min. sepet · durum) Ayarlar'a çizilmiş. Kodlanan yer **Depolar** ekranının tesis kartı. Sebep
  tasarımdan sonra gelen bir karar: çok depo (19.x). Bölge artık bir DEPOYA aittir — hangi tesisin
  aracı çıkacaksa onun hizmet alanıdır. Ayarlar'da tutmak, bölgeyi depodan koparıp "sistem-geneli
  bir parametre" gibi gösterirdi. Ayarlar'daki "Teslimat bölgeleri" satırı da bu yüzden yok:
  sözlükte bir Setting anahtarı karşılığı olmayan tek satırdı.

- **AYARLAR: LİSTEDE "PASİF" PERSONEL SATIRI YOK (03.08, 09.16).** Tasarım kullanıcı listesinde
  "Eski Personel · Depo · Pasif" satırı gösteriyor. Veri modelinde personel-aktiflik ekseni YOK:
  `user_profiles.roles` boş bırakılamıyor (DB kısıtı) ve `domain-core`'un kuralı "son rol çıkarılırsa
  kişi `customer`a düşer". Yani pasifleştirilen kişi personel listesinden çıkıp müşteri kaydında
  yaşamaya devam ediyor — erişimi kapanıyor, geçmişi duruyor (tasarımın `§4` kuralı korunuyor), ama
  rolüyle birlikte "pasif" olarak listelenemiyor. Ayrı bir aktiflik kolonu ikinci bir eksen açardı;
  o karar verilmeden satır uydurulmadı. Gerekirse `staff_deactivated_at` ile açılır.

- **TEDARİK SİPARİŞİ PDF ÜRETMİYOR, METİN ÜRETİYOR (02.08).** `pages/admin-satin-alma.md` §2
  "temiz bir liste/PDF" diyor; kodlanan **panoya kopyala + WhatsApp**. Üç gerekçe: (1) sayfanın
  kendi mobil notu gerçek yolu söylüyor — *"üretilen listeyi telefondan WhatsApp'a paylaşmak en
  olası gönderim yolu"*; PDF o akışta fazladan bir dosya adımı. (2) PDF aracı seçimi hâlâ açık
  (`build/06` "Netleşecekler") ve bir ekran için araç seçmek, seçimi tüm proje adına yapmak olurdu.
  (3) Metni sunucu kuruyor — PDF eklendiği gün aynı metni sarar, ikinci bir biçim doğmaz. Vaat
  `build/09-admin` görev satırında üstü çizildi. PDF gerekirse ayrı bir tur.

- **TEDARİK SİPARİŞİ DETAYI AYRI SAYFA DEĞİL, PENCERE (02.08).** Sipariş kalemleri, kabul
  ilerlemesi ve gönderim tek bir pencerede (`purchase-order-dialog`). Ayrı bir `/orders/[id]`
  sayfası açılmadı: sipariş bir liste satırının derinleşmesidir — operatör listeye bakarken açar,
  adedi düzeltir, listeyi gönderir, kapatır. Ayrı sayfa her seferinde listeyi kaybettirir ve
  dönüşte süzgeci yeniden kurdurur. Müşteri siparişi farklı ve orada sayfa doğru: onun detayı
  yazışma, ödeme ve teslimatla birlikte okunan uzun bir kayıttır.

- **ROTA-ONLY ÜRÜNDE SATIN ALMA EYLEMİ POSTA KODU İSTER (02.08, kullanıcı kararı, `build/19` 19.7).**
  Tasarımın soğuk zincir kartı yer bilinmezken fiyatı + bir daveti gösteriyor ve altına şunu
  yazıyor: *"Davet zorunlu değildir, **kilit değildir**: atlanabilir."* Kullanıcı kararıyla bu
  yumuşak bir kilide döndü: **`shippable=false` ürün/pakette yer bilinmiyorken "Sepete ekle"
  yerine "Posta kodunu gir" durur.**
  Gerekçe fiyat değil, **örtük söz**: soğuk zincir ürünü yalnız rota deposundan gidiyor: müşterinin
  rota içinde olup olmadığını bilmeden "Sepete ekle" düğmesi *"bunu satın alabilirsiniz"* diyor ve
  bunu doğrulayamıyoruz. Müşteri iddiaya güvenip sepete atıyor, gerçeği checkout'ta öğreniyor.
  Kullanıcının ikinci gerekçesi de kabul edildi: soru **en yüksek niyet anında** sorulmuş oluyor —
  anasayfa şeridi bir bannerdır, atlanır; "bu ürünü istiyorum" diyenden kod istemek cevap alma
  olasılığı en yüksek yerdir. Bu üçüncü davet noktası, öncekilerin ikisinden de iyi.
  **Süzgeç DEĞİL, sıra:** ürün katalogda durur, kart tıklanır, detay okunur, fiyat görünür. Kod
  girilir girilmez kart dört hâlinden birine oturur ve normal akış sürer.
  **Fiyat GİZLENMEDİ** (kullanıcının ilk önerisinden sapma, gerekçesi ölçüldü): liste fiyatı yere
  göre asla değişmiyor (sözleşme §5), değişebilen tek şey near-expiry teklifi ve yer bilinmiyorken
  teklifler hiç okunmuyor (`read-context.ts:87`) — yani gösterilen sayı TAVAN, kod girilince ya
  aynı kalır ya düşer, asla artmaz. Fiyatı saklamak müşteriyi ürünle ilgilenip ilgilenmeyeceğine
  karar veremez hâle getirirdi; sorun sayıda değil, düğmenin verdiği sözdeydi.
  **Panel tasarımdakinden farklı:** tasarım satır içi bir posta kodu alanı çiziyor, biz sitenin
  kanonik panelini (`PlaceDialog`) açıyoruz — üçüncü bir posta kodu girdisi aynı doğrulamayı üç
  yerde bakıma bırakırdı.

- **SEPETİN İKİ GRUBU — üç küçük sapma (02.08, `build/19` 19.7).** Tasarımın "tek sepet, iki grup,
  iki checkout" bölümü birebir uygulandı; üç yerde ayrıldık ve üçünün de sebebi aynı aileden:
  **söylenen şeyin arkasında durabilmek.**
  1. **Kargo başlığında "· 2-3 iş günü" YAZILMADI.** Tasarım bunu iki yerde basıyor ("📦 Kargoyla
     gönderilir · 2-3 iş günü"). Arkasında ne bir ayar ne bir taşıyıcı sözleşmesi var; yazsaydık
     tutamayacağımız bir teslim süresi vaat etmiş olurduk ve gecikmede müşteri haklı olarak onu
     gösterirdi. Süre parametrik bir ayara bağlandığında (kargo firması seçilince) cümle geri gelir.
  2. **Yer değişimi kartında TEK eylem var.** Tasarım iki düğme çiziyor: "Anladım, sepeti göster" +
     "Fiyat değişimini gözden geçir". İkisi de kartın zaten içinde olduğu ekrana götürüyor — kart
     sepette çiziliyor ve fiyat farkı satırın kendisinde yazılı. İkinci düğme müşteriyi bulunduğu
     yere göndermiş olurdu; "Anladım" kaldı.
  3. **Karşılanamayan kalem OTOMATİK olarak sonraya kaydedilmiyor.** Tasarım §5 "karşılanamayanlar
     sonraya kaydedilir" diyor ve mock'ta bir bildirim satırı var. Taşımayı kısıt bloğu (K32)
     yapıyor ve orada iki sonuç da söyleniyor: kalan asgari sepetin altına düşüyor mu, ücretsiz
     kargo eşiği kayboluyor mu. Sessizce taşımak müşteriyi tam da o iki uyarıdan mahrum bırakırdı —
     iki kalemi çıkarıp toplamın ARTTIĞINI gören müşteri, hata yaptığını sanır. Kart durumu
     bildirir, kararı blok verdirir.
  **Tasarımda OLMAYAN bir öğe eklendi (02.08, kullanıcı bildirimi): adet tavanı düzeltme düğmesi.**
  Sepet satırının adet seçicisinin yanında, bal tonlu: *"Bu adrese şu an en fazla 2 adet
  getirebiliyoruz · 2 adede indir"*. Tasarım bu hâli hiç çizmiyor çünkü çok depo öncesinde yoktu:
  yeri değişen müşterinin 5 adedi yeni yerde 2 olabiliyor. Adet **otomatik düşürülmüyor** ve karar
  kullanıcınındı; gerekçe de kendi kuralımız — müşterinin yazdığı sayıyı haber vermeden
  değiştirmek, kalemler için yasakladığımız sessiz daralmanın adetteki hâli. Bal tonu da aynı
  aileden: müşteri hata yapmadı, yer değişti. Sayı bir SÖZ değil ("şu an en fazla"): sepet stok
  ayırmıyor, gerçek kapı checkout'un rezervasyonu.

  Ayrıca **grup toplamı indirim İÇERMEZ** ve bu bir sapma değil bir sınır: kupon/kampanya her
  siparişin kendi kalemlerine göre checkout'ta yeniden çözülüyor (`createCheckoutDraft` alt kümeyi
  yeniden okuyor), yani sepette bir gruba düşecek payı kesin bilemeyiz. İki gruplu sepette özet
  kartı bunu bir cümleyle söylüyor ve kendi checkout düğmesini düşürüyor — o düğme sepetin
  tamamını ödeyecekmiş gibi okunurdu, oysa `/checkout` yalnız kapıya giden kalemleri alır.

- **CHECKOUT — adres kartında "düzenle" YOK, seçili adresin ALTINDA var (01.08, `build/08` 08.13).**
  `Musteri - Checkout.dc.html` adres adımında kartları yalnız SEÇTİRİYOR; düzenleme diye bir yol
  çizilmemiş. Bu bir çıkmazdı (kullanıcı bildirimi): kaydedilen adres bir daha açılamıyor, yazım
  hatası yapan müşterinin tek yolu ikinci bir adres eklemek oluyordu.
  Düzenleme eklendi ama **kartın içine değil**, iki sebeple: (a) kart bir `<button>`, içine ikinci
  bir düğme koymak geçersiz HTML ve klavye erişimini bozar; (b) düzeltilmeye değer olan siparişin
  GİDECEĞİ adrestir — başka bir adresi düzeltmek isteyen önce onu seçer, ki seçim zaten bu siparişe
  özel ve zararsız. Sonuç: kartların altında tek bir "Bu adresi düzenle" satırı; form açılınca kart
  ızgarası gizlenir (aynı adres hem kart hem form olarak dururken hangisinin güncel olduğu belirsiz
  kalıyordu). Yeni ekleme kutusu yerinde ve tasarımdaki gibi kesikli çerçeveli.

- **YER EKSENİ — ürün detayında "Sonraya kaydet" düğmesi YOK (01.08, `build/19` 19.7).**
  `Musteri - Urun Detay.dc.html` "bölgenizde şu an yok" panelinde iki düğme çiziyor: **Gelince haber
  ver** (birincil) + **Sonraya kaydet** (ikincil). Birincisi indi; ikincisi inmedi ve boş bir düğme
  konmadı. Sebep mekanik: sepet bağlamının `saveForLater`ı **sepetteki** bir kalemi kaydedilenlere
  TAŞIR — sepette olmayan bir ürünü oraya yazacak bir yol yok. Sahte bir düğme koymak, basıldığında
  hiçbir şey olmayan bir söz olurdu.
  Yerine "Sepete ekle" açık bırakıldı ve yol uçtan uca çalışıyor: kalem sepete girer, kısıt bloğu
  (K32) onu "bölgenize gönderemiyoruz" diye işaretler ve **oradaki** "Sonraya kaydet" ile taşınır.
  Yani müşterinin ulaştığı sonuç aynı, adım sayısı bir fazla. Doğrudan kaydetme sepetin iki-grup
  çalışmasıyla gelir (19.11) — kaydedilenler bölmesi zaten o turda yeniden ele alınıyor.

- **TALEP FORMU — ÖNCE SORUN, SONRA ÜRÜN (01.08, kullanıcı kararı, `build/08` 08.6).**
  `Musteri - Talep.dc.html` bölümleri şu sırada çiziyor: *Hangi ürünlerle ilgili?* → *Sorun ne?* →
  *Anlatın* → *Fotoğraf*. Sıra ters çevrildi: **tip önce sorulur, kalem listesi ve fotoğraf yalnız
  ürüne dair tiplerde** (`missing` · `damaged`) görünür.
  İki gerekçe. (1) *Bilgi sırası:* müşteri neyi anlatacağını söylemeden hangi ürünleri
  işaretleyeceğini bilemez — "Soru" soracak biri önce üç kaleme bakıp hangisini seçeceğini düşünür,
  sonra o bölümün kendisiyle ilgisi olmadığını anlar. (2) *Form kendini kısaltır:* dört tipin
  ikisinde kalem ve fotoğraf zaten gereksiz; tip önce sorulunca "Soru" seçen müşteri üç bölüm
  yerine bir bölüm görür.
  Tipe geçiş kalem işaretlerini **düşürür**: gizlenen bir bölümün state'i gönderilseydi müşteri
  ekranda görmediği bir seçimi yapmış olurdu ve "Soru" tipinde üç kaleme bağlanmış bir talep
  operatörü yanıltırdı.

- **TALEP EKRANI — iki sapma (01.08, `build/08` 08.6).**
  **(a) Mobil başlığa "+ Bize yazın" eklendi.** `Musteri - Talep.dc.html` bu düğmeyi yalnız web
  başlığında çiziyor; mobil liste karesinde başlığın sağ yuvası boş. Sonuç bir çıkmaz sokak: yeni
  talep girişi mobilde YALNIZ boş listenin davet kartında var, yani bir talebi olan müşterinin
  ikincisini açacak yolu yok. Yuva zaten ayrılmış durumda (başlığın ortada kalması ona bağlı) —
  web'in düğmesini oraya koymak en küçük dürüst tamamlama. Yeni bir öğe icat edilmedi.
  **(b) "LZA-2451'e bağlı" → "LZA-2451 siparişine bağlı".** Tasarımın Türkçe metni referansa
  doğrudan ek getiriyor; Türkçede o ek sayının **telaffuzuna** bağlıdır (2451 "…bir" → `-e`, 2450
  "…elli" → `-ye`) ve referanstan üretilemez. Ek sabit bir kelimeye ("sipariş") taşındı — üç dilde
  de dilbilgisel olarak doğru ve kalıp tek: `{ref} siparişine bağlı` · `liée à la commande {ref}` ·
  `gehört zur Bestellung {ref}`.
  **Sapma OLMAYAN, kasten uygulanmayan bir şey:** tasarımın "Yeniden aç ve yaz" düğmesi kodda bir
  düğme değil bir cümle. Motor müşteri yazınca kapanmış talebi zaten açıyor
  (`statusAfterCustomerReply`); ayrı düğme olsaydı yazıp basmayı unutan müşterinin mesajı kimsenin
  bakmadığı kapalı bir talepte kalırdı. Tasarımın kendi açıklama cümlesi ekranda duruyor.

- **ÜLKE SEÇİCİ (K38) BİR ALAN DEĞİL, BELİRSİZLİK ÇÖZÜCÜSÜ (01.08, kullanıcı kararı).**
  Tasarım posta kodunun **yanına** koşullu bir ülke seçici koyuyor (`K38`, `musteri-yer-ekseni.md
  §6`); üç ekranda çizili (başlık hapı, "Nereye getirelim?" şeridi, katalog/ürün daveti). O alan
  kalkıyor: **müşteri yalnız posta kodunu yazar, ülke veriden türer.** Kullanıcı: *"Ülkeye gireyim
  sonra posta kodunu gireyim çok mantıklı değil. Hatta suistimale bile açık."*
  **İki gerekçe.** (1) *Yanlış soru:* "67000 dünyada hangi ülkede?" sorusunun cevabı yok — FR ve DE
  ikisi de 5 haneli kod kullanır, aralıklar örtüşür. Bizim sorumuz "67000 BİZİM hangi bölgemizde?"
  ve cevabı kendi `delivery_zone_postal_code` tablomuzda, küçük bir kümede duruyor. (2) *Vergi
  beyanı riski:* serbestçe seçilen ülke KDV oranını ve Alman B2B muafiyetini etkiler (`DOMAIN §5`);
  müşterinin yazdığı bir alanın vergi sonucu doğurması kabul edilemez.
  **Tasarımın "koşullu görünür" kuralı korunuyor, koşulu değişiyor:** bir *alan* olmaktan çıkıp bir
  *belirsizlik hâli* oluyor. Yalnız iki durumda ve yalnız ikinci ülke açıldığında sorulur — aynı kod
  iki ülkenin bölgesinde (`ambiguous`), ya da kod hiçbir bölgede yok ve birden çok kargo deposu var
  (`outside`). Bugün (tek ülke) hiçbiri oluşmaz, seçici hiç çizilmez — tasarımın öngördüğü boş hâlle
  aynı yere çıkıyor. Sitenin dili yalnız ön-seçim ipucudur: Fransızca Belçika/İsviçre'de de
  konuşulur, Strasbourg'daki Türk müşteri `tr` seçer.
  **Bağlı istek:** ülkesiz çözüm kapısı henüz yok — `matchZones` ülkeyi zorunlu istiyor, çağıran
  `'FR'` sabitini yazıyor. Talep `docs/build/yer-ekseni-arka-uc-talebi.md §1`'de.

- **UYDURULAN TİP JETONU — sessizce yanlış punto (30.07, kullanıcı ekran görüntüsüyle yakaladı).**
  Sipariş ekranlarında `text-h3` ve `text-h4` yazmışım; **ikisi de `globals.css`'te YOK.** Tailwind
  tanımsız jeton için CSS üretmiyor, o yüzden başlıklar ebeveyninin puntosunu miras alıyordu — hata
  patlamıyor, yalnız yanlış görünüyor. Beş yerde. Ayrıca sayfa başlığında `text-h1` (**52px**)
  kullanılmıştı; tasarım 32–34px ve vitrinin geri kalanı `text-page-title` (38px) kullanıyor.
  **Ders: müşteri ölçeği yedi rolden ibaret** (`h1 · h1-sm · page-title(-sm) · h2(-sm) ·
  card-title(-sm) · lead · body · body-sm · note · micro`). Tasarımın ham px'i buraya EŞLENİR,
  yeni ad uydurulmaz (CLAUDE.md §3: "token yoksa kodlama, envantere ekletme"). Bu turda kurulan
  eşleme: 34/32→`page-title` · 19/18→`card-title-sm`/`lead` · 17/16→`lead`/`body` · 14→`body-sm` ·
  13/12,5→`note` · 12/11,5→`micro`.
  **Neden lint yakalamadı:** tanımsız Tailwind sınıfı geçerli bir sınıf adı; bunu yakalayacak tek
  şey ekrana bakmak. Kalan risk kayıtlı — operasyon evreninde aynı tuzak `text-ops-*` adlarıyla var.

- **Siparişler listesinde tarih YIL taşıyor (30.07).** Tasarımın mobil karesi "22 Tem" diyor, yılsız;
  masaüstü karesi "22 Temmuz 2026". Mobilde de yılı yazıyoruz. Sebep: o kare **yalnız bu ayın
  siparişleriyle** çizilmiş, oysa liste bir arşiv ve yıllara yayılıyor — yılsız "22 Tem" iki farklı
  siparişi ayırt edemez, yani yanlış bilgidir. Ay adı tasarımdaki gibi kısa kalıyor (uzun ay adı dar
  satırda taşardı). Helper: `formatOrderDate(iso, locale, compact)`; mevcut `formatShortDate`'e
  DOKUNULMADI — onun künyesi "yıl yazılmaz" diyor ve sipariş onay ekranı bağlamında haklı (müşteri
  az önce verdiği siparişe bakıyordur).

- **~~Adres formu çizili değil~~ — ÇİZİLİYMİŞ (28.07 düzeltmesi).** Envanter güncellenmiş: **K34 ·
  Form Alanı** ve **K35 · Adres Formu** eklenmiş, ben eski kopyaya bakıyordum. `CLAUDE.md §3`
  "yerel kopya bayat olabilir, claude_design MCP'den çek" diyor; MCP bu oturumda yok, dosya elle
  tazelenmeli. Ders: bileşen yoksa **önce envanterin güncelliği** sorgulanmalı, uydurmadan önce.
  Kod K34/K35'e göre yeniden kuruldu. Kalan: mobil 52px gövde (primitif cihazı bilmiyor,
  `size` desteği ayrı iş) · posta kodu yazılırken **anlık teslimat cevabı** · alan terk edilince
  doğrulama (`onBlur`).

- ~~**Adres formu HİÇBİR tasarımda çizili değil.**~~ Checkout'ta yalnız "+ Yeni adres" düğmesi var,
  basınca ne açılacağı yok; hesap sayfasında da yok. Kodlanan form **improvisedir** (CLAUDE.md §3
  ihlali, bilerek ve geçici): dar sütun (520 px), görünür etiketler, posta kodu + şehir aynı satırda.
  **Claude Design'dan istenecek** — alan sırası, gruplama, ülke seçici, doğrulama metinleri ve
  "varsayılan yap" kutusu tasarım kararıdır, koddan türetilmemeli.

- **Genel form girdisi envanterde YOK — ama K4 yol gösteriyor.** K1-K31 arasında yalnız K4 (Arama
  Alanı) çizili. Ölçü ilk turda yanlışlıkla giriş sayfasının BUTONUNDAN türetilmişti (14px ped,
  2px kenar, 15px punto → ~51px yükseklik); K4'ün kendisi `1px kum-300` kenar · `9px 18px` ped ·
  `400 14px` · odakta `2px zeytin` ve ped 1px azalma diyor → ~37px. Girdi çizilenin bir buçuk katıydı.
  `controlClass` K4'e göre yeniden kuruldu: punto 14, ince kenar, dar ped, odakta `ring-inset`
  (kutu zıplamadan kenar iki katı görünür). Yarıçap K4'ün 24'ü DEĞİL, envanter §0.4'ün "küçük kart
  14-16" aralığı — K4 bir arama hapıdır, form alanı değil; hap biçimi beş alan üst üste dizilince
  tekrarlayan bir ritim yaratıyordu.
  **Yine de K30 olarak çizilmesi isteniyor:** hata/yardım metni yerleşimi, zorunlu alan işareti,
  çok satırlı alan ve seçici (select) hâlleri K4'ten türetilemiyor.


- **Sepet satırında "sonraya kaydet" YOK.** K33 onu her satıra koyuyor ("kısıt olmadan da
  kullanılabilir"); kaldırıldı. Kısıt yokken kontrol hiçbir şeyi açıklamıyordu: gideceği yer
  görünmüyor (liste boşken çizilmiyor), çöp kutusunun yanında ikinci bir eylem duruyor ve müşterinin
  o an yaptığı işle yarışıyordu. **Ertelemek ancak bir SEBEBİ varken anlam taşır** — sebebi kısıt
  bloğu (K32) veriyor, kaydetme oraya taşındı. Liste böylece kendi kendini açıklıyor.

Bunlar eksik değil, **verilmiş karar**. Not düşülüyor ki bir sonraki denetimde "tasarımdan sapma"
diye yeniden açılmasın; itiraz gelirse madde §2'ye taşınır.

- **Ürün adı 40 px yerine `text-page-title` (38).** Katalog başlığıyla aynı kademe; envanterin resmî
  ölçeği (h1 52 · h2 28 · kart 24) ikisini de tanımlamıyor. İki ayrı token yerine tek kademe.
- **Satın alma butonu 17 px yerine `text-lead` (18)**, yeni `lg` buton boyu olarak.
- **Ara kademeler yuvarlandı** (26→24 · 19→18 · 17→15). Kademe çoğaltmak hiyerarşiyi görünmez yapar.
- **Token öneki `--mus-*` değil, öneksiz** (`--color-ink`); operasyon `--color-ops-*`. İşlevsel fark
  yok, iki evren yine ayrık.
- **Stok rozeti sola yaslı.** Tasarımda puan satırının sağına yaslıdır; puan satırı `17` gelene kadar
  hiç çizilmediği için rozet o satırın yerinde tek başına duruyor. Yorumlar bağlanınca sağa geçer.
- **Galeri "+N" kutusu şeridi büyütür**, ışık kutusu açmaz. Tasarım bu kutunun davranışını yazmıyor;
  yeni bir katman yerine var olan şeridi genişletmek seçildi.
- **Mobil beyan akordeonları `<details>` ile.** Yerli öğe: klavyeyle çalışır, JS istemez ve
  **kapalıyken de içerik DOM'da durur** — INCO gereği beyan satın alma öncesi erişilebilir olmalı.
- **Sepette fiyat DONDURULMAZ.** Tasarımın etkileşim sözleşmesi "fiyatlar sepete eklendiği andaki
  fiyattır, liste yenilense de satır fiyatı değişmez" diyor; `DOMAIN §5` (karar 27.07) bunun
  tersini karara bağladı — bağlayıcı fiyat **checkout başlangıcında** sabitlenir, sepetteki fiyat
  yalnız gösterim ve değişiklik tespiti içindir. Sepet aylarca bekleyebiliyor; orada donan fiyat
  maliyeti oynayan üründe zarar, fiyat düştüğünde müşteriye haksızlık olur. Karar tasarım notundan
  SONRA verildi ve onu ezer. **Not:** kararın ikinci yarısı (fiyat arttıysa müşteriye bildir ve
  onay iste) henüz kablolanmadı — `CartItem.unitPrice` yazılıyor ama karşılaştırmada okunmuyor;
  §1'de izleniyor.
- **Geri alma şeridi ekranın ÜSTÜNDE.** Tasarım yerini yazmıyor. Altta iki sabit çubuk var (sepette
  toplam, ürün detayda satın alma); şerit alta konsaydı "Geri al" düğmesi tam onların üstüne düşerdi.
- **Ürün detayda TEK KONTROL** (28.07, kullanıcı kararı). Tasarım adet seçici + "Sepete ekle —
  {toplam}" düğmesini YAN YANA gösteriyor; ekleme sonrası düğme 1,5 sn "Eklendi ✓" olup eski hâline
  dönüyor. İki sorunu var: (1) dönen hâl yine "Sepete ekle" ve seçici aynı sayıda duruyor — ikinci
  kez basan müşteri adedi **ikiye katlıyor** ve göremiyor (sepet adetleri toplar); "3 ekledim, hâlâ
  3 yazıyor, olmadı galiba" refleksi tam buraya basıyor. (2) Sepette olmayan bir şeyin "3 adedi"
  hiçbir yerde karşılığı olmayan bir sayıdır — ekleme öncesi adet sormak, henüz var olmayanı ölçmek.
  Yerine katalog kartının modeli: önce yalnız "Sepete ekle" düğmesi vardır ve HER ZAMAN 1 ekler;
  kalem sepete girince düğme yerini **aynı kutuyu dolduran** adet seçicisine bırakır, 0'a inmek
  düğmeyi geri getirir. İki kontrol piksel piksel aynı kutudur (çerçeve farkı düğmeye şeffaf
  kenarlıkla kapanır) — geçiş, bir düğmenin başka bir düğmeye dönüşmesi gibi görünür. "Sepete git"
  konmaz (yol başlıkta zaten var); "Eklendi ✓" kaldırıldı (kalıcı mod değişimi daha güçlü onay).
  Varyantlı üründe adet SEÇİLİ BOYA aittir: 500 g'dan 3 alıp 1 kg'a geçene hâlâ 3 göstermek yalan.
- **Tasarımdan piksel alırken KUTU MODELİ toplanır.** Tasarım HTML'i `content-box` (reset yok),
  Tailwind `border-box`. Tasarımda aynı öğede hem genişlik hem ped varsa gerçek genişlik
  `genişlik + ped + çerçeve`dir; sayıyı olduğu gibi yazmak öğeyi dar bırakır. İki kez yaşandı:
  boy kartı 44 px (150 → 194), arama alanı 38 px (250 → 288). Sabit genişliğin YANINDA ped yoksa
  (görsel çerçevesi, kategori dairesi, benzer ürün şeridi) sayı doğrudan yazılır — onlar denetlendi.
- **Sepet satırı görseli kare (1:1).** Tasarımın 72×72 kutusuyla ve görsel künyesiyle
  (`image.schema`: "1:1 · sepet · paket satırı") uyumlu; katalog kartının 3:2'si satırı şişirirdi.

---

---

## 3. Operasyon evreni — yazılmış kararlar (eski BACKLOG §5)

Diyalog formlarında ve onların beslediği liste satırlarında verilmiş kararlar.

**Operasyon bilgi mimarisi — depo/stok/rota ayrımı (karar 01.08, kullanıcı).**

Kullanıcı depo giriş/çıkışının dört ekrana dağıldığını bildirdi ("yönetimimi zorlaştırıyor").
İnceleme kök sebebi buldu: **parada birleşik hareket defteri var, stokta yok.** `DOMAIN §7` finansı
"para bir hesapta durur, hareketlerle girer/çıkar" diye tanımlıyor ve kasa/banka ayrımını hesaba
indiriyor; stokta bunun karşılığı yazılmamış, sekiz RPC beş ayrı tabloya yazıyor. Verilen kararlar:

- **Transfer ayrı sayfa DEĞİL** — parada hesaplar arası transfer bir hareket tipidir, sayfası yoktur;
  depolar arası transfer onun stok karşılığıdır. `admin-transfer.md` **silindi**, içeriği
  `admin-stok.md`'ye taşındı — **Mal kabul** ve **Çıkışlar** sekmeleri; sevk/kabul birer form. Sekme adları soyut "Hareketler" değil (kullanıcı itirazı): depoda kimse "hareket yaptım" demez, "mal kabul ettim" ya da "sevk ettim" der. Yoldaki transfer ayrı sekme değil, Mal kabul'ün "bekleyenler" kısmı — hedef depo için gelecek maldır.
- **Bölge tanımı Rotalar'dan Depolar'a taşındı** ve **"Rotalar" sayfası "Teslimat" oldu**
  (`admin-rotalar.md` → `admin-teslimat.md`; yol `/operations/routes` → `/operations/deliveries`).
  Terminoloji karışıklığının iki katmanı vardı ve kullanıcı ikincisini yakaladı: **(a)** bölge bir
  TANIM (kodlar + günler + depo, kurulum işi), teslimat günü bir GÜN (veride varlığı bile yok,
  `delivery_date`'ten türer) — ikisi aynı sayfadayken sözcükler birbirinin yerine geçiyordu;
  **(b)** *"rota gidilen şeydir, teslimat teslim edilen şeydir"* — ve **rota bu sistemde bir sayfa
  değil bir teslimat TÜRÜDÜR** (`DeliveryTypeEnum = ['route','shipping']`, `DOMAIN` sözlüğü "rota
  içi" diye tanımlıyor). Bir türü çoğullayıp varlığa çevirmek hatalıydı; üstelik sistem gitmeyi
  (durak sırası, kapasite, zaman penceresi) hiç modellemiyor.
  **Yan kazanç:** ad düzelince kargo teslimatı da evini buldu — "bugün hangi paketleri taşıyıcıya
  vereceğim" sorusunun hiçbir ekranda cevabı yoktu (`grep` kanıtı: takip no yalnız müşteri yüzünde
  anılıyor). **Arka uç HAZIR** (`07.12`, aynı gün indi): `order.carrier` tanımlı küme +
  `order.tracking_number`, kısıt veride (rota siparişine takip numarası yazılamaz). Sayfanın kargo
  yarısı çizilir çizilmez bağlanabilir. ⚠ **Ama numarayı KİM girer sorusu tek cevaplı olmalı:**
  `07.12` "hazırlık ekranı girer, paketi kapatan kişi etiketi elinde tutar" diyor ve haklı. Teslimat
  sayfası numarayı **okur** ve eksikse gösterir (gün kapanmadan görünür bir açık); ikinci bir giriş
  yeri açmak aynı alanı iki ekranın sahiplenmesi olurdu. Hazırlık ekranı (`10.1`) yazılana kadar
  giriş yolu hiç yok — bu bir tasarım açığı değil, sıra meselesi.
- **Depolar ayrı sayfa kalır ve büyür:** künye + hizmet alanı + **karne** (risk, eşik altı, yolda
  bekleyen). Karne SAYAR, listelemez — her sayı Stok'a o depo bağlamıyla giden bir kapıdır.
- **Veri temeli yeni tablo değil GÖRÜNÜM olabilir:** beş tablo da `stock_id`/`warehouse_id` taşıyor,
  `stock` da varyant/depoyu — `stock_movement` bir `union` görünümü olarak türetilebilir
  (`available_stock` ve `purchase_order_progress` deseni). ⚠ Tek gerçek eksik: `order_item_batch`'te
  zaman damgası yok (`id, order_item_id, stock_id, qty`), zaman sıralı defterde hazırlık hareketleri
  yerini bulamaz → arka uca `created_at` isteği.

**Depo ekseni (19.5, 01.08) — çizimden iki sapma, ikisi de ölçülü.**

- **Stokta süzgeç SATIR elemez, ADET daraltır.** `Operasyon - Stok.dc.html`'in şerit metni "tablo
  yalnız bu deponun satırlarını gösteriyor" diyor. Uygulanamadı ve sebebi yapısal: seviye listesi bir
  stok listesi değil **ürün sayfalamasıdır** (keyset imleç ürün üzerinde ilerliyor). "Bu depoda stoğu
  olan ürünler" diye süzmek imleci bozar ve listenin kuyruğunu sessizce yutar — CLAUDE.md §1'in
  açıkça yasakladığı hâl. Bunun yerine satırlar kalır, adet/rezerve o deponun sayısına iner ve kırılım
  kapanır; şerit metni de tam olarak bunu söyler ("tablodaki adetler bu deponundur, satır listesi
  katalogun tamamıdır"). Siparişlerde böyle bir sorun yok: orada satır zaten bir siparişe ait ve
  eleme SQL'de yapılıyor.
- **Mobil bağlam seçici çizildi ama uygulanmadı — sapma değil, SIRA.** Envanterdeki mobil varyant
  (başlık barının altında tam genişlikte satır + bottom sheet) bir mobil operasyon KABUĞU varsayıyor;
  o kabuk (envanter O11) henüz yok, sidebar `w-[214px]` sabit ve responsive değil. Masaüstü hâli
  birebir indi; mobil varyant O11 ile birlikte gelir.

**Paket formu (`tabs/package/`) — tümüyle yazılmış.** Referansı ürün form diyaloğu; ondan ayrılan
tek yer sekme yokluğu (paketin alanı çok daha az, ürün formunu ikiye bölen yasal beyan yığını yok).

- **Mutabakat şeridinin zemini NÖTR, yeşil değil.** Toplamın tutması olağan hâldir; her kayıtta
  yeşil kutlamak dikkati ucuzlatır. Renk yalnız dikkat gerektiğinde (amber) girer.
- **Şerit üç satır, her biri bir soru:** anlaşma (ayrı ayrı → paket → indirim) · bize ne kalıyor
  (maliyet · kâr · marj) · varsa sorun ve TEK çare. Altı sayı yan yana yazılıyordu, hiçbiri
  öbüründen önemli görünmüyordu.
- **Mutabakat rozeti AMBER, kırmızı değil** (formda da listede de). Tutmayan paket satılabilir,
  yalnız faturası eksik olur; kırmızı gerçekten satışı engelleyen durumlara saklı.
- **Liste satırında rozet yalnız BOZUKKEN çıkar.** Olağan hâl sessizdir; kazanılan sütun paraya
  (marj · kâr · maliyet) gitti.
- **"Payları yeniden dağıt" düğmesi YOK.** Dağıtım otomatik olduğu için düğme kendiliğinden olanı
  elle yapıyordu. Yerine duruma göre tek çare: elle girilen satır varsa "elle girilenleri bırak",
  yoksa kalan kuruş durumudur ve "paket fiyatını X € yap".
- **İndirim yüzdesi saklanan bir alan değil**, paket fiyatının ikinci yazımı — birini gir, öbürü
  dolsun. Operatör kimi zaman "34,90 olsun", kimi zaman "%10 vereyim" diye düşünür.
- **Diyalog genişliği 1160 px** (mobilde 520). Envanterde diyalog ölçüsü yok; kalem tablosu 1040'ta
  sıkışıyor, 1240'ta diyalog ekranı yutuyordu.
- **"vitrinde yok" işareti.** Kalemin ürünü satıştan çıkınca paket vitrine çıkamaz ama `is_active`
  ÇEVRİLMEZ (o alan operatörün niyeti) — satır gerçeği söyler, niyeti bozmaz.

**Ürün ve katalog formları — kabuk kararları.**

- **Kaydet engellendiğinde SEBEBİ yazılır** (`DialogFooter.blockedReason`) ve düğme kilitlenir.
  Önce düğme etkin görünüp submit sessizce yutuluyordu: basılıyor, hiçbir şey olmuyordu.
- **Ürün formunun altlığı ürün ↔ paket bağını söyler** ("N pakette kullanılıyor"; satıştan
  çıkarırken düşecek paketler adıyla).
- **Para ve yüzde girdileri** odakta serbest yazım, odaktan çıkınca iki hane + virgül
  (`MoneyInput`/`PercentField`). Aynı ekranda üç ayrı yazım görünüyordu.
- **Sekme çubuğunda eylem alanı + sekmeye bağlı arama.** "Yeni …" düğmesi ve arama kutusu sayfa
  başlığından buraya taşındı; arama hangi sekme açıksa onda arar (eskiden her sekmede üründe
  arıyordu).
- **Teklif diyaloğu kendi alt barını kurar** (ortak `DialogFooter` yerine): "Teklifi kapat" İptal ve
  Kaydet'in yanında ÜÇÜNCÜ bir yol ve ortak altlık iki düğme varsayıyor. Kapatma hiçbir koşulda
  kilitlenmez — yanlışlıkla açılmış bir teklif her zaman geri alınabilmeli.
- **Mobil stok ekranı "Karar" sekmesiyle açılır**, seviyelerle değil. Tasarımın kendi notu: telefonda
  günlük iş "yaklaşan tarihliye bakıp teklif açmak", acil iş lot sorgusu — ikisi de başta durur.

### Fiyat ekranı — yazılmış kararlar (28.07)

- **Marj tek sayı ama İKİ kanaldan en darı.** Satırın b2c ve b2b diye iki marjı var; ekran tekini
  gösteriyor. Ortalama almak zararına satan kanalı kârlı olanın arkasına gizlerdi — uyarının işi
  riski göstermek. Hangi kanaldan geldiği rozetin ipucunda yazılı.
- **Fiyatı olmayan kanal AMBER tire.** Sıfır değil, eksiklik: sonucu "o kanalda satışa kapalı" ve
  ürünün neden satılmadığı sorusunun cevabı. Marj hesabına da girmez.
- **Maliyeti bilinmeyen satırda marj NÖTR, yeşil değil.** "Bilmiyorum" ile "iyi" farklı şeyler;
  hedefi yazılmamış üründe de uyarı verilmez (uydurulmuş bir hedefe göre alarm çalmaz).
- **Tasarımın örnek sayıları ölçüt alınmadı.** `.dc.html` içindeki mock satırlarda marj ne markup ne
  brüt marj tanımına uyuyor (18,00 fiyat · 9,20 maliyet → "%28"). Proje TEK tanım kullanır: maliyet
  üzerine markup, KDV hariç tabanda (DOMAIN). Tasarım sayısı örnek veridir, spesifikasyon değil.
- **Başlık sayaçları SAYFA kapsamlıdır ve metin bunu söyler** ("40 boy yüklendi · 0 marj-altı").
  Tasarım "128 fiyatlı varyant · 3 marj-altı" diyor, yani katalog geneli; ama marj bir karardır ve
  SQL süzgecine çevrilemez — tam sayım, katalogun tamamının fiyat+maliyetini taşımak ya da bir okuma
  fonksiyonu (STACK §13) demek. Ölçüm yapılmadan ikisinden biri seçilmedi; o güne kadar sayaç
  kapsamını yazıyor, katalogu temsil ediyormuş gibi davranmıyor.
- **auto_price anahtarı bugün NİYETİ kaydeder.** Fiyatı maliyet değişince yeniden hesaplayan
  tetikleyici stok girişine bağlı (modül `10`). Diyalog bunu açıkça yazar; yazmasaydı açık anahtar
  olmayan bir otomatiği varmış gibi gösterirdi.
- **Fiyat alanları auto_price açıkken kilitli** (tasarımın kuralı). Kilit bir engel değil açıklama:
  elle yazılan fiyat bir sonraki otomatik hesapta silinecekti.
- **Yalnız DEĞİŞEN kanal yazılır.** `setPrice` her çağrıda yeni satır ekler (fiyat geçmişi); değişmemiş
  fiyatı yeniden yazmak geçmişi aynı tutarın kopyalarıyla şişirirdi.
- **Ekran yalnız admin'e açık** ve engel sayfada: depo/kurye maliyet/marj görmez (brief §6). Kabuk
  korunur, pane kapanır ve sebebi yazılır — sessiz yönlendirme, gördüğü bağlantının neden
  çalışmadığını söylemezdi.

### Tarih ve tarih-aralığı seçicisi — envanter O8 (28.07)

Envanterde adıyla duruyordu ("tarih & tarih-aralığı seçici") ama kodlanmamıştı; kupon formu bu
yüzden ham `<input type="date">` ile açılmıştı. Kural gereği (CLAUDE.md §2: ham girdi son çare)
kapatıldı ve iki alan form kitine girdi.

- **Ham `<input type="date">` kullanılmaz.** Tarayıcının yerel takvimi her platformda başka görünür,
  dili TARAYICI diline bağlıdır (operasyon yüzeyi Türkçedir) ve "son 30 gün" gibi bir önayar kavramı
  yoktur. Tasarım kendi takvimini çiziyor; bu iki alan onun karşılığı.
- **Dış bağımlılık YOK.** Referans proje `react-day-picker` + `date-fns` kullanıyor; bizde ikisi de
  yok ve tasarımın takvimi (236 px kutu, 7 sütun, önayar sütunu, çift ay) kütüphaneyi token'larımıza
  çevirmek için baştan sona CSS ezmesi isterdi. Izgara matematiği saf ve testli (15 test),
  komponent `AnchoredMenu` üstünde — konumlandırma/dış tıklama/Esc `Select` ile ortak.
- **Değer `YYYY-MM-DD` metni: bir GÜN, an değil.** Ayrıştırma ve biçimleme YEREL yapıcıdan geçer;
  `new Date('2026-07-31')` UTC okunur ve batı dilimlerinde 30 Temmuz'a düşerdi. Parti son tarihleri
  bunun TERSİ bir karar kullanır (`shortDate` UTC okur) — orası DB'de saklanan bir andır, burası
  kullanıcının seçtiği gün.
- **Izgara her ay 42 hücre.** Ay değişince kutu zıplamaz; komşu ayın günleri solgun ama seçilebilir.
- **Aralık iki tıklama, ters kurulamaz.** İkinci tıklama başlangıçtan önceye düşerse o gün YENİ
  başlangıç olur — "31'den 24'e" hiç geçerli olmayan bir kuraldır ve DB de reddeder (0031).
- **"Özel…" bir önayar değil**, hiçbirine uymayan seçimin adıdır: tıklanmaz, durum söyler.
- **Kupon formunda geçerlilik TEK alan.** İki ayrı kutu dururken aralarındaki ilişki (ters aralık)
  ancak kaydederken görülüyordu.
- **Tekil seçici fiyat diyaloğunda kullanıldı** ve orada bir yeteneği açtı: `price.valid_from` 05.4'ten
  beri ileri tarihli fiyatı destekliyordu ama ekranı yoktu. Artık zam bugünden hazırlanabiliyor;
  ekran "o güne kadar yürürlüğe girmez" diye açıkça uyarıyor.

### Kupon & kampanya — yazılmış kararlar (28.07)

- **Kupon ve kampanya TEK varlık, TEK form.** Ayrımları yalnız tetik; koşullar, kapsam, değer,
  tarih ve sınırlar ikisinde de aynı. İki ayrı form aynı sekiz alanı iki kez sorardı.
- **Değer tek kutu, iki taban.** Yüzde mi sabit tutar mı olduğunu tip anahtarı söyler; iki ayrı kutu
  "hangisini doldurayım" sorusunu ve boş kalan bir kutuyu doğururdu.
- **"Aktif" ile "yürürlükte" AYRI gösterilir.** Anahtar operatörün NİYETİ, rozet bugünkü GERÇEK:
  süresi dolmuş ya da kullanım tavanına dayanmış kural aktif kalabilir. Tek göstergeye sıkıştırmak,
  "aktif" yazan ama hiç uygulanmayan kuponu görünmez kılardı.
- **Kural silinmez, kapatılır.** Süresi dolmuş kuponun geçmişi (kim kullandı, ne kadar indirim
  dağıtıldı) raporun malıdır.
- **Boş koşul YOKTUR, sıfır DEĞİLDİR.** Asgari sepet boş bırakılırsa koşul yok demektir; 0 yazmak
  başka bir şeydir. Alanlar bu yüzden boş başlar, yer tutucular "sınırsız" der.
- **Kişisel kupon bu formdan açılmaz.** Sahibi puan kullanımıdır (modül 16); elle açma gerekirse
  müşteri ekranından bağlanacak. Form onu sessizce `null` bırakır, uydurma bir seçici koymaz.
- **Bitiş tarihi GÜNÜN SONU.** "31 Tem'e kadar" yazan operatör akşamı kasteder, sabahı değil.
- **Doğrulamanın sahibi DB.** Kodsuz kupon, kodlu "otomatik" kampanya, hedefsiz kapsam, ters tarih,
  %100 üstü yüzde ve tekrarlanan kod veritabanında reddedilir (0031). Form aynı kuralı gösterir ama
  gerçeğin sahibi tektir; altı test kısıtları sabitliyor.

### Stok ekranı — tasarım güncellemesi uygulandı (28.07)

Tasarım güncellendi ve önceki sapmam **kapandı**: sağ panel artık "En acil partiler" (karar kuyruğunun
ilk üçü + riskteki tutar + "N partinin tümü →"), yani karar kuyruğunun önizlemesi. Tasarımdaki hâliyle
uygulandı; panel seçili satıra değil KUYRUĞA bağlı, çünkü aciliyet listeden bağımsızdır.

Karar sekmesi de yeniden kurgulandı ve birebir uygulandı: **üç grup** (satılamaz · DLC yaklaşıyor ·
DDM yaklaşıyor), grup başına parti sayısı + riskteki tutar + kuralın bir cümlelik açıklaması; kartta
MLOR rozeti, tarih satırı, maliyet satırı, açık teklif kutusu ("N / M çıktı") ve açık teklifte ikinci
düğme ("Teklifi kapat"). İmha sekmesi dönem seçici + neden dağılımı + geniş tabloya döndü.

**Kalan açık — parti listesi (varyant altında).** Brief (`admin-stok.md §2`) bunu istiyor, güncellenmiş
tasarım da çizmiyor: web seviyeler tablosunda satır açılmıyor ve sağ panel artık karar kuyruğu. Parti
künyesi (lot · konum · alış fiyatı · kalan raf) bugün yalnız KARAR BEKLEYEN partiler için görünüyor;
sağlıklı bir partinin lotuna bakmanın yolu yok. Mobilde satır açılıyor, webde açılmıyor — bu da ayrıca
tuhaf. Ya seviyeler satırına açılır bir künye çizilmeli ya brief maddesi düşmeli.

**Eklenen — kâr marjı alanı (tasarımda yok, bilinçli).** Teklif diyaloğunda fiyatın ÜÇÜNCÜ yüzü:
alış fiyatına göre kâr marjı (%). Tasarım yalnız liste fiyatına göre indirimi çiziyor, ama elden
çıkarma kararında asıl soru "listeden ne kadar indirdim" değil, "bu maldan kâr mı ediyorum, ne kadar
zarara razıyım". Liste fiyatı bir referans; karar alış fiyatına göre verilir. Marj EKSİ girilebilir —
zararına satmak da bir karardır ve elde kalıp imha edilecek maldan iyidir. Üç kutu tek sayının farklı
okunuşu: birini yazan öbür ikisini doldurur.

**Kalan açık — "Kayıt" sütunu (IM-118).** İmha tablosunda tasarım okunur bir kayıt numarası gösteriyor
(`IM-118` · `SY-27`) ve kayda köprü kuruyor. `stock_adjustment`'ta böyle bir alan YOK; uuid'in ilk
altı hanesini "IM-118" gibi göstermek uydurma olurdu. Sütun **çizilmedi**. Gerekiyorsa `Order`'ın
`reference_no` deseni buraya da uygulanır (sıra + önek) — veri modeli kararı, ekranın değil.

### Yazı ölçeği — karar (28.07)

Envanter §0 yalnız font AİLELERİNİ veriyordu. Ölçüm şunu gösterdi: **ölçek tasarımda da yoktu** — 20
operasyon `.dc.html` dosyası **18 farklı boy** kullanıyor (en sık: 12 · 13 · 11,5 · 12,5 · 11), çünkü
ekranlar ayrı zamanlarda çizilmiş ve her biri kendi boyunu seçmiş. Yani "envanterden gelecek doğru
cevap" diye beklenen şey aslında verilecek bir karardı; beklemek 175 ham değeri bir tur daha
yaşatırdı. Yedi rol tanımlandı (`globals.css` §0), 18 boy bunlara indi, **her birleştirme ≤ 2 px**:

| token | px | rol | yuttuğu ham boylar |
|---|---|---|---|
| `text-ops-title` | 22 | sayfa başlığı | 22 · 24 |
| `text-ops-section` | 18 | bölüm/dialog başlığı | 17 · 18 · 20 |
| `text-ops-lead` | 15 | öne çıkan sayı, kart adı | 15 · 16 |
| `text-ops-base` | 13 | gövde, tablo hücresi | 13 · 13,5 · 14 |
| `text-ops-sm` | 12,5 | ikincil satır, hücre alt bilgisi | 12 · 12,5 |
| `text-ops-xs` | 11 | etiket, yardım metni | 11 · 11,5 |
| `text-ops-micro` | 10 | tablo başlığı, rozet (uppercase + tracking) | 9 · 9,5 · 10 · 10,5 |

- **Satır yüksekliği ve ağırlık token'a GÖMÜLMEDİ** (müşteri evreninde gömülü). Yoğun tabloda
  `leading` yerel bir karar; token'a gömmek, hiç `leading` yazmayan yerlerin satır aralığını sessizce
  değiştirirdi. Ayrı bir tur konusu.
- **Ad çakışması tuzağı:** renk token'larında `body` ve `card` dolu (`text-ops-body` bir RENK
  yardımcısı). Ölçek adları bu yüzden `base`/`sm` seçildi — `text-ops-body` yazan yer hâlâ renk demek.

### Ölçek bir kademe büyütüldü (28.07, kullanıcı kararı)

Tasarım dosyalarındaki ham boylar (9–22px) ekranda küçük kalıyordu. **Tüm ölçek ~1px yukarı taşındı,
oranlar korundu** — hiyerarşi aynı, yalnız taban yükseldi:

| token | önce | sonra |
|---|---|---|
| `title` | 22 | **24** |
| `section` | 18 | **19** |
| `lead` | 15 | **16** |
| `base` | 13 | **14** |
| `sm` | 12,5 | **13** |
| `xs` | 11 | **12** |
| `micro` | 10 | **11** |

Bu **tek dosyalık** bir değişiklikti (`globals.css`) — 186 kullanım yerinin tek tek dolaşılması
gerekmedi. Token turunun asıl kazancı buydu ve ilk kez burada nakde çevrildi.

Metin ~%8 genişlediği için **sabit px sütunlar** aynı oranda açıldı (18 sütun, beş tabloda); `fr`/
`minmax` ile tanımlı sütunlar zaten esniyordu. Yan etki: `micro` 11px olunca rozetler tasarımın
istediği boya OTURDU — daha önce 1px küçüktü.

Bu bir tasarım sapmasıdır: `.dc.html` dosyaları eski boyları taşımaya devam ediyor. Tasarım tarafı
ölçeği güncellerse bu madde kapanır; güncellemezse fark bilinçli olarak kalır.

### Ölçek İKİNCİ kez büyütüldü + merdivene iki uç eklendi (03.08, kullanıcı kararı)

**Aynı şikâyet ikinci kez geldi** — *"okumakta zorlanıyorum; kimden geldiğini yazan metin bile
küçük"* — ve ikinci kez gelmesi teşhisin kendisi oldu: sorun bir ekranın seçimlerinde değil,
ölçeğin **kalibrasyonunda**. Talepler ekranında çizimin değerleri merdivene DOĞRU eşlenmişti (13 →
`base`, 12,5 → `sm`) ve sonuç yine okunmuyordu; yani hata eşlemede değil, eşlemenin hedefindeydi.
Sebep: tasarım dosyaları 1360px'lik bir çerçevede çiziliyor, gerçek operasyon ekranı çok daha
geniş — aynı piksel orada daha küçük okunuyor.

Yedi basamak yine ~1px yukarı (25 · 20 · 17 · 15 · 14 · 13 · 12), oranlar korundu. **Sapma
büyüdü:** `.dc.html` boyları artık iki kademe geride. Bilinçli — mock'a sadakat amaç değil,
okunabilirlik amaç.

**Merdivene iki YENİ uç eklendi:** `hero` 36 (← 34 · 40) ve `display` 29 (← 26 · 28). Bunlar metin
değil **gösterge** boyları: sistem panelinin büyük değerleri, hüküm şeridinin başlığı, sipariş
tutarı. Yedi basamak metin içindi ve bu değerler hiçbirine sığmadığı için dokuz yerde ham px
yazılmıştı — merdiven yükselince yerlerinde kaldılar. Ham değeri en yakın metin basamağına yamamak
hiyerarşiyi bozardı (29px bir başlık değil, bir sayıdır).

Yan sonuç: hüküm şeridinin üç ses kademesi (28 → 34 → 40) ikiye indi (`display` → `hero`). Kayıp
değil — kritik hâl zaten dolu alarm bandı + nabız atan nokta ile ayrışıyor, boyut üçüncü bir kopya
sinyaldi.

**Kural artık denetleniyor** (`docs:check §3h`): operasyon yüzeyinde ham `text-[Npx]` yasak. Sistem
ekranı 34 yerde ham px taşıyordu ve **iki ölçek yükseltmesini de kaçırmıştı** — üçüncü şikâyet
oradan gelecekti. `leading`/`tracking`/dolgu ham kalabilir (yukarıdaki gerekçe).

### Palete kurşuni ton eklendi (28.07)

`slate` (#5a6472 / #eceff3, karanlıkta ters çevrilmiş) — **ölçüm/nötr kayıt** anlamı için. İmha
geçmişindeki "Sayım farkı" tasarımda bu renkte; palette karşılığı yoktu ve mavi kullanılıyordu, oysa
mavi bizde "onay/aday" demek ve sayım farkına yanlış anlam yüklüyordu. `OpsTone` kapalı liste olduğu
için derleyici üç tüketiciyi de yakaladı (Badge · MultiToggle · dağılım çipi).

Rozetin dolgusu ve yarıçapı da tasarımın değerlerine çekildi (3×9 · r7); önce 2×8 · r6 idi.


### 3z. Tarif adımları ÇOK SATIRLI METİN — tasarımın sürükle-sıralı satırları uygulanmadı (07.08)

**Kullanıcı kararı.** `Operasyon - Tarifler.dc.html` hazırlanış adımlarını ve "Evinizden"
maddelerini **satır bileşeni** olarak çiziyordu: her adım ayrı kutu, `⠿` tutamacıyla sürükle-sırala,
`+ adım` / `+ satır` düğmeleri. Uygulanan bunun yerine **dil başına tek çok satırlı metin alanı**;
satır = madde, numarayı ekran veriyor.

Çelişki tasarım ile görev satırı (09.21) arasındaydı ve **hakem kullanıcı oldu** — iki belge
çeliştiğinde seçimi kod yapmaz (aynı hata 07.08'de bir kez yapılmıştı: iki tasarım belgesinden biri
sorulmadan seçilmiş, rota kurulumu yanlış sayfaya kurulmuştu).

Gerekçe üç katmanlı ve üçü de aynı yöne bakıyor:

- **Diller madde sayısında EŞİTLENEMEZ.** Satır bileşeni üç dilin adım sayısını aynı olmaya zorlar;
  oysa Fransızca iki adımı tek cümlede birleştirmek, Türkçe ayırmak isteyebilir. Zorlama, çeviriyi
  kaynağın cümle bölünmesine mahkûm ederdi.
- **Veri modeli zaten tek metin** (`steps`, `pantry` → `LocalizedTextDraftSchema`, 05.16). Satır
  bileşeni kaydederken metne eritilecekti, yani ekran veriyle ayrışan bir şekil taşıyacaktı.
- **AI çeviri önerisi tek alan çevirir** (`suggestTranslationAction`): madde madde çeviri, madde
  sayısı sabitlenmedikçe zaten kurulamıyor.

Kaybedilen: sürükleyerek sıra değiştirme. Karşılığı, adımı metin içinde taşımak — ve üç dilin
birbirinden bağımsız kalması.


### Koleksiyon kapağı artık ana sayfada da ÇİZİLİYOR — "yalnız OG" kararı değişti (08.08)

**Tasarım güncellemesiyle gelen değişiklik (kullanıcı bilgisinde).** 05.7'nin kararı *"koleksiyon
görseli müşteri sayfasında render edilmez, yalnız paylaşım (OG) kartını besler"* idi — operasyondaki
kapak alanı bu yüzden "paylaşım kartı (OG)" etiketiyle duruyordu. `Musteri - Anasayfa.dc.html`'in
08.08 senkronu ana sayfaya iki slotluk **Koleksiyonlar** bölümü ekledi ve kapak orada 16:7 band
olarak çizim yüzeyine çıktı.

- Kapak kaydı AYNI (`role="collection"`, odak + zoom); yeni bir görsel alanı açılmadı — aynı kapak
  iki yerde iki kırpımla kullanılır (OG 16:9 · ana sayfa bandı 16:7).
- Operasyondaki alan etiketi "paylaşım kartı (OG)" DARALTICI kaldı; kapak artık vitrinde de
  göründüğü için etiket 08.26/05.18 ekran turunda güncellenir.
- Bölüm koşullu: aktif koleksiyon yoksa hiç çizilmez (`hasCollections`) — boş hâl gösterilmez.

İş kaydı: `05.18` (vitrin işareti) + `08.26` (ana sayfa bölümü + koleksiyon katalog hâli).


### Sepet FAB'ı tarif detayına da eklendi — v3'ün dörtlü listesi genişledi (09.08)

**Kullanıcı isteği**, tasarımdan bilinçli sapma. v3'ün kuralı FAB'ı dört sayfayla sınırlıyor
(`cartCount>0 && (home|catalog|product|package)` — v3:1892) ve tarif detayı listede yok.

Gerekçe kullanımdan geldi: tarif sayfasının işi zaten sepeti DOLDURMAK ("Malzemeleri sepete ekle").
Malzemeleri ekleyen müşterinin sepete gitmek için geri çıkması gerekiyordu — sepeti en çok dolduran
sayfa, sepete giden tek kapıyı taşımayan sayfaydı.

Yerleşim uydurulmadı: ürün ve paket detaylarının BİREBİR aynı yuvası (`productFabBottom` + güvenli
alan payı), yani yapışkan barın üstünde. Üç sayfada aynı ölçü — düğmenin yeri sayfadan sayfaya
oynamıyor. Boş sepette komponent yine kendini çizmiyor (v3'ün kuralı korundu).


### Kahraman fotoğraf GALERİ oldu — ürün ve paket detayında kaydırılabilir şerit (09.08)

**Kullanıcı isteği**, tasarımdan bilinçli sapma. v3'ün ürün detayı (`vProduct`) ve paket detayı
(`vPackage`) kahramanı TEK `image-slot` çiziyor; şablonda galeri/karusel yok. Ama veri çoktan
çoktu: sözleşme ürün başına birden çok görsel taşıyor (`CatalogProductDetail.gallery` — künyesinde
"İlk öğe KAPAKTIR; tek görselli üründe şerit çizilmez") ve uç bunu dolduruyordu. Ekran yalnız
kapağı çizdiği için operatörün yüklediği öteki fotoğraflar müşteriye hiç ulaşmıyordu — sapmanın
gerekçesi bir tasarım tercihi değil, çizilmeyen veri.

- **Yerleşim DEĞİŞMEDİ.** Şerit kahramanın yerine geçer, kutusunu miras alır: ürün detayında 400 dp
  yükseklik, paket detayında 16:10 oran; üst degrade, yüzen geri/paylaş düğmeleri, durum rozeti ve
  alt kenardan sarkan fiyat rozeti aynı yerde ve şeridin ÜSTÜNDE çizilmeye devam eder.
- **Tek görselde şerit de gösterge de çizilmez** (sözleşmenin kendi kuralı): tek noktalı bir sayfa
  göstergesi hiçbir bilgi taşımaz. Görsel hiç yoksa bugünkü baş-harf yer tutucusu korunur.
- **Paket detayında sıra karardır:** önce paketin KENDİ kapağı, sonra kalemlerin ana görselleri.
  Satılan şey pakettir, kalemler onun içeriği. Görseli olmayan kalem atlanır (boş kare çizilmez).
- **Gösterge tasarımın kendi dilinden:** onboarding'in adım noktaları (v3 `ob.dots` — etkin 24 ·
  sönük 8 · yükseklik 5 · yarıçap 3). Tek fark sönük noktanın rengi: fotoğrafın üstünde opak kum
  kaybolduğu için tasarımın "foto üstü yüzen yüzey" tokenı (`cream-glass-soft`) kullanıldı; etkin
  nokta terracotta kaldı. Nokta sırası ekran okuyucuya sessizdir — sırayı karonun kendi etiketi
  söyler ("Ürün görseli 2 / 3").
- Yeni kütüphane KURULMADI: yatay kaydırma ve sayfa sınırı RN'in `FlatList`inden
  (`horizontal` + `pagingEnabled` + sabit `getItemLayout`).

Kod: `apps/mobile/src/components/ui/photo-gallery.tsx`; tüketen iki ekran ürün ve paket detayı.


### Adres çekmecesine ÖNERİ LİSTESİ eklendi — tasarımda olmayan bir öğe, kitten kuruldu (10.08)

**Kullanıcı isteği**, tasarımdan bilinçli sapma. v3'ün adres çekmecesi (`shAddr`, v3:1486-1497)
dört düz alan çiziyor (etiket · adres · posta kodu · şehir) ve öneri listesi YOK. Native uygulamada
sokak alanı artık Fransız devletinin adres servisine (BAN, `@lezzet/address-fr`) bağlı: müşteri
yazarken alanın ALTINDA en çok beş öneri açılır, dokunulan öneri sokak + posta kodu + şehri
BİRLİKTE doldurur.

- **Yeni görsel dil ÜRETİLMEDİ.** Liste kutusu girdi çerçevesiyle aynı ailedendir (kart zemini +
  `sand-400` çerçeve + kontrol yarıçapı), satırlar kitin basılabilir yüzeyini `tint` geri
  bildirimiyle kullanır — açılır listede küçültme/kaydırma titrek durur, zemin değişimi hizayı
  bozmaz (aynı gerekçe başlık çubuğunun yuvarlak düğmesinde de verilmişti). Ham renk/ölçü yok;
  hepsi tema token'ından.
- **Şablonun metinleri DEĞİŞMEDİ:** yer tutucu yine "Adres", bölge notu yine yerinde. Yeni metin
  yalnız listenin kendisine ait (kaynak künyesi + kota satırı).
- **Elle yazma yolu kapanmıyor.** Servis düşerse ya da cevap tanınmazsa liste hiç çizilmez ve
  çekmece bugünkü gibi çalışır; kota dolarsa (429) tek satırlık bir not çıkar, alan yine yazmaya
  açıktır. Doğrulama değişmedi (5 haneli posta kodu).
- **Kaynak künyesi ZORUNLU, süs değil:** veri Etalab 2.0 açık lisansı altında ve kaynak gösterimi
  gösteren yüzeyin sorumluluğu (`STACK.md` "Adres arama (FR)"). Künye satırı listenin İÇİNDE durur
  — liste görünüyorsa künye de görünür, biri ötekisiz çizilemez.

Kod: `apps/mobile/src/components/ui/suggestion-list.tsx` (yeni kit öğesi) +
`apps/mobile/src/screens/account/use-address-search.hook.ts` (gecikme · önbellek · yarış sayacı);
tüketen ekran hesabım adres çekmecesi.


### Katalogun YER EKSENİ: rozet yerine yazı, kart yerine bant, çip yerine süzgeç satırı (10.08)

**Kullanıcı kararı**, üç parçalı; ikisi tasarımdan bilinçli sapma, biri tasarımın kendi yuvasına
dönüş. Ortak gerekçe tek: rota dışı müşterinin ekranında yer bilgisi HER KARTTA tekrar ediyordu ve
tekrar eden bilgi, bilgi olmaktan çıkıp gürültü oluyordu.

**1. Kart üzerindeki "Kargoyla gelir" işareti KALDIRILDI.** Rota dışı müşterinin kartlarının
neredeyse tamamı onu taşıyordu. Kullanıcının cümlesi: *"zaten gönderemediklerimizi stille
ayırıyorsak, diğerlerine kargoyla gönderilir demeye gerek yok."* Ayrım artık tek yönlü ve sessiz:
gönderemediğimiz kart SOLUK, geri kalan normal. `stockStatus === 'shipping'` katalog kartında
hiçbir şey çizmez.

**2. "Bu adrese gönderemiyoruz" ROZET DEĞİL, YAZI.** Kullanıcı: *"her şey rozet içerisindeymiş gibi
görünüyor ve hoş olmuyor; yazı zaten filigranın üzerinde olduğu için doğrudan yazılabilir."*
`StockMark` kabuğu (zemin · kenarlık · dolgu) bu kartta kullanılmıyor. Bunun bir konum sonucu var:
rozet yığını sol ÜST köşedeydi, gradyan ise ALTTA — zeminsiz bir yazı üst köşede okunmazdı, o yüzden
not künyenin (ad + çeşit satırı) SON satırı oldu, yani gradyanın en koyu yerinde. Yeni yazı durağı
AÇILMADI: not künye ailesinin ölçü/ağırlığını kullanır, tek farkı renk (`on-image`, altyazının
`on-image-soft`una karşı) — okunması gereken bir cümle, çeşit sayısından sönük olamaz.
Tükendi rozeti DURUYOR: o başka bir eksen ve tasarımda rozet olarak var.

**3. SOLMA fotoğrafa uygulanır, bilgiye değil** (arıza düzeltmesi). Şablon `opacity`yi fotoğraf
katmanına koyuyor ve bizde de öyleydi; arıza yapı kurgumuzun yan etkisiydi — rozet yığınını ve
künyeyi o katmanın İÇİNE koymuştuk, yani solmanın SEBEBİNİ açıklayan cümle tam da gerektiği anda
okunaksızlaşıyordu. Rozet ve künye artık katmanın kardeşi ve tam opak; gradyan solan grupta kaldı
(yoksa soluk fotoğrafın üstünde tam opak bir koyu leke bırakırdı). Tükendi hâli aynı düzeltmeyi
aldı. Emsal kitin içindeydi: daire kart (`ProductCircleCard`) solmayı zaten yalnız fotoğrafa
uyguluyordu.

**4. Listenin başına BİLGİ BANDI** — tasarımda YOK, kitin diliyle kuruldu. Kart başına tekrarlanan
cümle tek yere taşındı: "kendi soğuk zincir aracımız bu bölgeye uğramıyor; gönderebildiklerimiz
kargoyla gelir". Yeni görsel dil üretilmedi, kitin bilgi kutusu (`Note`) kullanıldı — sıcak nötr
ton (`warm`), çünkü bu bir hata da bir fırsat da değil, adresin gerçeği. Bant yapışkan başlığa
DEĞİL listenin başına kondu: arama ve kategori rayı kalıcı denetimlerdir, bu bir cümledir; bir kez
okunur, kaydırılıp geçilir. Bandın içinde bir eylem var ("Buraya da gelin") ve dört sonuç hâlinin
dördü de karşılanır — kayıt alındı · zaten vardı · yer çözülemedi · e-posta gerekli. Bant "haber
göndereceğiz" DEMEZ, "not aldık" der: bölge genişletme kararı verilmemiş, tutulamayacak söz
verilmez. Misafirden e-posta bandın İÇİNDE sorulur; giriş duvarı kurulmaz.

**5. "Adresime gönderilebilir" süzgeci ÇİPTEN SÜZGEÇ SAYFASINA.** Bu bir sapma değil, tasarımın
kendi yuvasına dönüş: v3'ün `shFilter` sayfasında sıralama satırlarının altında bir anahtar satırı
zaten var ("Sadece indirimliler", etiket solda · anahtar sağda). O satır bizde boştu (sözleşmede
`offers` yok — ekranın 5. sapması); şimdi sözleşmede gerçekten var olan tek boolean süzgeç oraya
yerleşti. Anahtar kitte hazırdı (`ToggleSwitch`), ikincisi çizilmedi. Süzgeç ekrandan kalktığı için
"etkin süzgeç var" bilgisini artık yalnız süzgeç düğmesinin dolu hâli taşıyor; `filtersActive` bu
yüzden onu da sayıyor.

**6. Sıralama satırlarına İKON** (kullanıcı isteği). İki fiyat satırı kitin para ikonunu paylaşır
(`money`); eksen ikisinde de fiyattır, yönü etiket söyler. **"Önerilen" satırı bilerek ikonsuz** —
sette o kavramın çizimi (yıldız/kıvılcım) yok ve olmayan bir kavram için eldeki bir ikonu ödünç
almak, satırı başka bir yere gidiyormuş gibi gösterirdi; ikon yuvası yine ayrılır ki etiketler
hizalı kalsın. Süzgeç satırının `📍`si de emoji olarak KALDI: kitin ikon setinde yer imi yok
(eksikler envantere raporlandı — yer imi · yukarı/aşağı ok · yıldız).

Kod: `apps/mobile/src/components/ui/product-photo-card.tsx` ·
`apps/mobile/src/screens/catalog/place-notice-band.tsx` (yeni) ·
`apps/mobile/src/screens/catalog/catalog-screen.tsx`.


### Ürün detayında YER FİLİGRANI ve satın alma barının KALKMASI — v3 `vProduct`'ta yok (10.08)

**Kullanıcı bildirimi (arıza).** Katalogda "Bölgenizde şu an yok" yazan ürüne tıklanınca detay
sayfası hiçbir şey söylemiyordu ve satın alma düğmeleri normal duruyordu: müşteri alamayacağı
ürünü sepete ekleyebiliyordu. Sebep ölçüldü — ekran yalnız `soldOut`a bakıyordu, yani
`stockStatus`ün `elsewhere` hâli hiç okunmuyordu (`soldOut` o sözleşmenin yalnız `out_of_stock`
hâlidir).

**1. Filigran kahramanın üstüne, kart ailesinin diliyle.** v3'te böyle bir öğe YOK; yeni bir görsel
dil de üretilmedi — katalog kartının (`noteVeil`) ve vitrin dairesinin (`markVeil`) ikizi kuruldu:
kahramanı örten yarı saydam katman (`scrim`) + ortalanmış yazı, **rozet kabuğu yok** (kataloğun
10.08 kararı). Örtü galeri şeridinin KARDEŞİ, çocuğu değil: içine konsaydı hem kaydırmayla birlikte
kayar hem de solmaya ortak olurdu — okunması gereken cümle tam o anda okunaksızlaşırdı. Galerinin
kendi kaydırması, göstergesi ve yüzen düğmeleri bozulmadı (`pointerEvents="none"`).

**2. Satın alma barı KALKAR; iki hâl iki ayrı dala düşer.** Cümle sözlüğü de karar da katalogla
ortak (`lib/places/place-view.ts` → `stockMarkOf`); ekranda ikinci bir sözlük açılmadı.
· `pending` (rota İÇİ, "Bölgenizde şu an yok") — geçici, beklenen KALEM. Bar mevcut **"Stok gelince
haber ver"** dalını paylaşır (yeni düğme kurulmadı), yalnız cümle yerin cümlesiyle değişir.
· `blocked` (rota DIŞI, soğuk zincir) — kalıcı, beklenen BÖLGE. Bar tek satır bilgiye iner ve
**eylem konmaz**: "Buraya da gelin" daveti kataloğun bilgi bandının işidir; müşteriyi alamayacağı
bir ürünün sayfasında ikinci kez o işe çağırmak zorlama olurdu.
· `shipping` ve `available` — bugünkü davranış aynen; filigran yok, satın alma açık.
· `out_of_stock` — bugünkü "tükendi" dalı aynen; **üstüne yer işareti basılmaz** (kart künyelerinin
aynı kuralı: cevabı olmayan soruya cevap verilmez). Fiyatsız ürün de aynı sebeple sessiz kalır.

Barın yüksekliği, blur'u ve kahramanın yerleşimi v3'ün kendisi — değişmedi; filigrandaki iki
satırlık cümle barda tek satıra iner ki bar büyümesin.

Kod: `apps/mobile/src/screens/product/product-detail-screen.tsx`.


### Doğrulama sonrası KÜNYE TAMAMLAMA akışı — v3'te yok (10.08)

**Kullanıcı kararı (ölçülmüş arıza).** E-posta/OTP ile açılan hesapta müşterinin adı hiç dolmuyor:
profil satırını açan tetik adı sağlayıcının künyesinden okuyor
(`supabase/migrations/0002_auth_user_profile_trigger.sql` → `raw_user_meta_data->>'full_name'|'name'`)
ve OTP yolunda orası boştur — uydurma ad yazılmaz, ad boş kalır. Uygulama da hiçbir yerde
sormuyordu. Onboarding soramaz: o giriş ÖNCESİ akıştır ve girişsiz de geçilebiliyor, yani
doğrulanmış kullanıcıyı hiç yakalamıyor. Karar: doğrulama bitince künye EKSİKSE üç bilgi adım adım
istenir — ad-soyad → adres → telefon.

**Yeni görsel dil ÜRETİLMEDİ, iki emsal birleştirildi.** Adım kabuğu onboarding'in kendisidir
(üstbaşlık · Lora başlık · gövde · alt bölmede nokta göstergesi ve birincil düğme; geri bağlantısı
aynı soluk rozet kademesi). Adres adımı `shAddr` çekmecesinin FORMUNU olduğu gibi kullanır —
form 10.08'de kite çıkarıldı (`screens/customer-kit/address-form.tsx`) ve aynı dosyayı hesap
ekranı ile "Siparişi tamamla" da çağırıyor; dördüncü bir adres formu yazılmadı. Ham değer yok,
tüm ölçü ve renkler token'dan.

**İki sapma, ikisi de bilinçli.** (1) Akışta "Atla" YOK: ad ve telefon zorunlu, akış onlarsız
kapanmıyor; geçilebilen tek adım adrestir ("Sonra ekleyeceğim") — sipariş vermeyecek müşteriyi en
pahalı adıma zorlamak, checkout zaten adresi kendi çekmecesinde sorarken gereksiz bir kapıdır.
(2) Kapının açılma ölçütü AD + TELEFONdur, "adres yok" ölçüte girmez: geçilebilen bir adımı kapı
ölçütü yapmak, adresi erteleyen müşteriye akışı her açılışta yeniden açardı (nag döngüsü).

Kod: `apps/mobile/src/screens/profile-setup/*` · `apps/mobile/src/app/profile-setup.tsx` ·
`apps/mobile/src/screens/customer-kit/address-form.tsx`.


### TESLİMAT BÖLGELERİ sayfası — v3'te yok (10.08)

**Kullanıcı kararı (ölçülmüş şikâyet).** Bölge dışı müşteri bugüne dek yalnız "bu adrese aracımız
gitmiyor" cümlesini okuyordu; gelen tepki *"on posta kodu denedim, hiçbirine gitmiyorsunuz — siz
nereye gidiyorsunuz?"* oldu. Cevabı hiçbir ekranda yoktu. Üç değişiklik birlikte yapıldı: bilgi
bandının gövdesi tek cümleye indi, ~~cümlenin altına **iki çıkış** kondu (posta kodunu değiştir ·
nerelere gidiyorsunuz)~~ ve sayfanın kendisi açıldı (`/delivery-zones`).

**Eylemlerin yeri aynı gün İKİ KEZ değişti, ikisi de cihazda ölçülerek.** Önce kutunun ALTINA
konmuşlardı: cihazda kutu bitiyor, altında yan yana iki yeşil bağlantı ve onların da altında
açılan bir e-posta formu çıkıyordu — ürün kartları ekranın yarısına iniyordu (kullanıcı: "üç metin
butonu alt alta, gerçekten kötü görünüyor"). Son hâl: bant **tek bloktur**, kutunun içinde cümle ve
**iki eşit sütuna ortalanmış iki metin eylemi** vardır ("Buraya da gelin" · "Posta kodunu
değiştir"); kutunun altına taşan hiçbir parça yoktur. Birincil düğme kullanılmadı — ikisi de aynı
ağırlıkta birer öneri; biri düğme olsaydı bant, bilgi levhası olmaktan çıkıp bir çağrıya dönerdi.
Bunun için kitte iki yuva açıldı: `Note`a **eylem yuvası** (kutunun içine kontrol) ve `TextAction`a
**`align`** (sütuna saran etiketin hizası). İkisi de yuvadır, varyant değil; mevcut çağıranların
hiçbiri değişmedi. **"Nerelere gidiyorsunuz?" ise banttan posta kodu çekmecesine taşındı**
(kullanıcı gerekçesi: kendi kodunu denemekle "siz nereye gidiyorsunuz" aynı sorunun iki yüzü) —
çekmece bu yüzden `tall` açılıyor ve bağlantı bir prop'la kapatılabiliyor: teslimat bölgeleri
sayfasından açılan çekmecede çizilseydi müşteriyi durduğu sayfaya yollayan ölü bir kapı olurdu.

**Yeni görsel dil ÜRETİLMEDİ.** Sayfa baştan sona kitin mevcut komponentleridir: `AppBar` +
`BackButton` (başlık), `SectionHeader` (bölüm üstbaşlığı), satır listesi için kitin onay ikonu +
gövde kademesi, `LoadingState` · `Note tone="error"` · `EmptyState` (üç hâl) ve kapanış cümlesi
için `Note tone="warm"` — bandın kullandığı sıcak nötr panelin aynısı. Ham hex yok, tüm renk ve
ölçü token'dan.

**Liste ŞEHİR ADIYLA okunur, posta koduyla değil** (kullanıcı kararı: "insanın tanıdığı dil"). Uç
zaten kod taşımıyor; kodları basmak sayfayı iki katına çıkarır ve kimsenin okumadığı bir tabloya
çevirirdi. Müşterinin kendi kodunu denemesi ayrı ve **tek** bir eylemdir: vitrin başlığındaki
posta kodu çekmecesi bu iş için kite taşındı (`screens/customer-kit/postal-code-sheet.tsx`) ve üç
çağıran (vitrin · bilgi bandı · bu sayfa) aynı çekmeceyi açıyor — ikinci bir alan yazılmadı.
Taşınırken metin, kaydetme ve "girişli mi" sorusu da çekmecenin içine alındı; çağırana yalnız
"açık mı" kaldı.

**Kapanış cümlesi bilinçli:** liste bir kapı değil bir haritadır. "Burada yoksanız satmıyoruz"
diye okunmasın diye sayfanın sonunda kargo yolu açıkça söylenir (soğuk zincir isteyenler hariç).

Kod: `apps/mobile/src/screens/delivery-zones/*` · `apps/mobile/src/app/delivery-zones.tsx` ·
`apps/mobile/src/screens/customer-kit/postal-code-sheet.tsx` ·
`apps/mobile/src/screens/customer-kit/place-notice-band.tsx`.


### "Buraya da gelin" TALEBİ ARTIK HESAP AÇIYOR — eski "giriş duvarı yok" kararının üstü çizildi (10.08)

~~**Eski karar:** "Giriş duvarı KURULMAZ — vazgeçmeye en yakın anda ikinci engel çıkarılmaz."
Misafir yalnız e-postasını yazardı; uç `email_required` derse bandın içinde küçük bir alan
açılırdı.~~ **Kullanıcı 10.08'de bunu bilerek değiştirdi.** Gerekçe: e-posta tek başına bir
kayıttır ama bir MÜŞTERİ değildir — doğrulanmamış adrese ne haber gönderilebilir ne de o kişi bir
daha tanınır. Yeni kural: talep bırakan kişi aynı akışta **doğrulanmış bir hesaba** dönüşür
(e-posta → altı haneli kod → oturum → talep kaydı). **Bedeli kabul edilmiştir**: bırakılan talep
sayısı düşer, ama gelen her talep bir hesaptır.

**Yeni altyapı yok, yeni görsel dil yok.** OTP yolu hesabı zaten yaratıyor (`generateLink` + profil
tetiği) ve akışın iki ucu giriş ekranıyla ortak; hata cümleleri de ortak sözlüğe çıkarıldı
(`lib/auth/error-text`) — aynı hâl iki yüzeyde iki farklı şey söylemesin. Form da banttan
**çekmeceye** taşındı (kullanıcı: "biz zaten alttan çekmece çıkarıp posta kodu alabiliyoruz, neden
mail adresini de orada yapmayalım"): kalıp posta kodu çekmecesinin kalıbı, kabuk kitin
`BottomSheet`i, kod alanı giriş ekranının `CodeField`i. Sözleşmenin dört hâli (`ok` · `already` ·
`place_unknown` · `email_required`) çekmecede karşılanmaya devam ediyor; `email_required` artık
gelmemeli (oturum var) ama sözleşme hâli olduğu için sessiz geçilmiyor.

Kod: `apps/mobile/src/screens/customer-kit/place-notice-sheet.tsx` ·
`apps/mobile/src/lib/auth/error-text.ts`.


### SEPET ÜÇ GRUPLU — "bu adrese gelemeyenler" kendi grubunu aldı, engel olmaktan çıktı (10.08)

**Ölçülmüş arıza (cihazda görüldü).** Müşterinin sepetinde soğuk zincir ürünler, adresi rota
dışıydı: sepet ekranı üç satır, 38,36 € ve **yeşil** bir "Siparişi tamamla" gösteriyordu; hiçbir
uyarı yoktu. Tek dokunuş sonra checkout kırmızı bir kutu basıyordu ("bu adrese teslim edemiyoruz").
Sebep ekranın elle yazdığı süzgeçti (`route !== 'shipping'`): teslim edilemeyen kalem "kapıya
teslim" grubuna düşüyordu. Müşteri engeli **son adımda** öğreniyordu.

**Karar üç yönlü.** (1) Gruplama artık sözleşmeden okunur (`line.group`: `local` · `shipping` ·
`undeliverable`) — ekran yoldan türetmez; kararın tek yeri sunucudur (`cartGroupOf`). (2) Gelemeyen
kalem **sepetten silinmez ve müşteriye sildirilmez**: yarın bölge içi bir adres eklenirse o kalem
ona lazım. Ekran "ürünü kaldırın" demez; satırdaki mevcut "kaldır" eylemi müşterinin kendi kararı
olarak durur. (3) "Siparişi tamamla" **açık kalır** — müşteri gelebilecek kalemleri sipariş eder;
düğmeyi yalnız satılamaz kalem (`hasBlocked` — tükendi/satışa kapandı) ve asgari sepet kapatır.

**Kırmızı gitti, bilgi geldi.** Checkout'taki engel kutusu (`Note tone="error"`) bilgi satırına
indi (`tone="warm"`): sunucu artık gelemeyen kalemi siparişin kapsamından çıkarıp siparişi açıyor
(`orderableLines`), reddetmiyor — kırmızı ton müşteriye düzeltmesi gereken bir yanlış yaptığını
söylerdi. Cümle ne olduğunu söylüyor: bu siparişe girmiyorlar, sepette bekliyorlar, bölge içi bir
adres seçilirse dahil olurlar. Checkout özeti de yalnız siparişe gireni yazar.

**Yeni görsel dil üretilmedi.** Grup başlıkları kitin `SectionHeader`ı, uyarılar `Note`, satır
künyesi mevcut rozet yuvası (terracotta ailesi — hata ailesi değil: gelemeyen kalem bir arıza değil,
adresin gerçeği). Başlıklar **yalnız birden çok grup doluyken** çizilir (web sepetinin `cart-group`
kuralı): tek yolu olan sepette başlık, olmayan bir seçimi varmış gibi gösterir.

**Terminoloji:** kargo = NORMAL kargo; kapıya teslim = soğuk zincir (bizim aracımız). "Soğuk zincir
kargo" diye bir şey yoktur.

Kod: `apps/mobile/src/screens/cart/cart-screen.tsx` · `cart-line-row.tsx` ·
`apps/mobile/src/screens/checkout/checkout-screen.tsx`.

### ~~OPERASYON NÖTR PALETİ SAFLAŞTI — zeytin alt tonu kalktı, zeytin yalnız vurgu (15.08)~~ GERİ ALINDI (15.08, aynı gün)

**Yeni karar (15.08 akşamı, kullanıcı):** nötrleştirme GERİ ALINDI — zeytin alt tonlu özgün palet
döndü. Bağlam: kullanıcının monitör kontrast ayarı bozukmuş; "sarımtırak, gözü yoruyor" algısının
kaynağı kısmen kalibrasyondu. Aynı gün eklenen üç token (`ops-skeleton`, `ops-skeleton-soft`,
`ops-surface-sunken`) KALDI, değerleri zeytinli skalaya döndü. Aşağıdaki kayıt tarihçe için duruyor.

**Kullanıcı kararı (15.08, production turu):** operasyon evreninin nötr skalası zeytin alt
tonluydu — dokuz gri kademesi ton ~80°, zeminler ~40-60°, %4-14 doygunluk (`bg` #dedbd3 en
belirgini). Geniş yüzeylere yayılınca "sarımtırak bir örtü" gibi gözü yoruyordu. Tüm nötr
token'lar (yüzey + mürekkep + gri skalası + takma adlar + scrim/etkileşim) aynı algısal
açıklıkta SAF GRİYE çevrildi; luma korundu, kademe eşlemeleri ("= gray-X") aynen geçerli.
Zeytin ailesi (§0.3) DEĞİŞMEDİ ve artık tek görevi vurgu: aktif sekme, rozet, olumlu durum.

Kapsam sınırı: YALNIZ `--color-ops-*` (operasyon yüzeyi). Müşteri yüzeyi (`kum-*`/`cream`) ve
native uygulama paleti bilinçli olarak dokunulmadı. `.dc` envanteri (§0.1-0.6) hâlâ eski zeytinli
değerleri taşıyor — tasarım turunda güncellenmeli; bu dosyadaki kayıt o tura gerekçedir.

Kod: `apps/web/app/globals.css` (§0.1, §0.2, §0.5 takma adlar, §0.4 etkileşim, koyu blok §0.6).

### SİPARİŞ HIZLI BAKIŞI PENCEREDEN SAĞ PANELE TAŞINDI (15.08)

**Kullanıcı kararı (15.08, sipariş sayfası turu):** tasarımın "Bu bir bakıştır" penceresi
(Operasyon - Siparisler .dc, satır tıklaması → diyalog) SÖKÜLDÜ; hızlı bakış artık Ürünler
ekranının deseniyle SAĞ PANEL (liste 1.95fr / panel 1fr, `order-preview.tsx`). Gerekçe: pencere
listeyi örtüyor — operatör bir satıra bakarken ötekileri göremiyor, karşılaştırma aç-kapa turu
gerektiriyordu. İçerik ve ilke penceredekiyle AYNI: panel yalnız satırın kısaltmalarını açar,
hiçbir kayıt değiştirmez (durum ilerletme detay sayfasının işi), tek eylem müşteriye ulaşmak;
sipariş numarası listede de panelde de doğrudan detaya gider. `.dc` tasarımı hâlâ pencereyi
çiziyor — tasarım turunda güncellenmeli; bu kayıt o tura gerekçedir.

Kod: `orders/order-preview.tsx` (yeni) · `orders/order-dialog.tsx` (silindi) ·
`orders.desktop.tsx` (grid), commit 15.08.

### MÜŞTERİ MOBİL — ÜÇ HEADER, KURALI YAZILI DEĞİLDİ (16.08)

**Kullanıcı bulgusu (16.08, dört ekran görüntüsü turu):** *"Bu kadar header farklılığı neden var?
Hangi header hangi sayfada doğru seçim?"* Ölçüldü ve cevap şaşırtıcı: **üçü de tasarımın kendi
kararı, uygulama sapması DEĞİL** (`Mobil - Musteri v3.dc.html`: sepet 449, siparişler 686,
talepler 1028). Sapma yoktu; **yazılı kural** yoktu.

Bedeli ölçülebilir: puan geçmişi ekranı (`(21.60)`) yazılırken bakacak bir kural olmadığı için
DÖRDÜNCÜ bir varyant doğdu (başlık + alt başlık). Kural bu yüzden burada.

**Üç durak ve seçim ölçütü — "kaydırırken erişilebilir kalması gereken bir eylem var mı":**

1. **Sayfa başlığı** — `‹` KENDİ satırında → eyebrow (terracotta, `.18em` aralık, büyük harf) →
   26px Lora başlık. *Eylemi olmayan bölüm girişleri:* Siparişlerim, Puan geçmişi.
2. **Sıkışık satır** — `‹ Başlık … sayaç`, 17px Lora, çizgisiz, kaydırmayla akar. *Eylemi ALTTA
   yapışkan barda olan ekranlar:* Sepet. Üstteki sayı bir sayaçtır, düğme değil.
3. **Yapışkan çubuk** — `AppBar`: `‹ Başlık … eylem`, alt çizgili (`border-bottom`), blur zemin.
   *Kaydırırken erişilebilir kalması gereken bir eylemi olanlar:* Talepler (`＋ Yeni`).

**Sınır durumu:** Talepler de Siparişler de hesap menüsünden açılıyor — yani ölçüt "nereden
gelindiği" DEĞİL, eylemin varlığı. Yeni bir ekran yazan önce bu soruyu sorar.

**Aynı turda tasarımın DEĞİŞTİĞİ üç şey** (bunlar sapma düzeltmesi değil, tasarım kararı):
- **Boş hâl dikeyde ortalanır.** Tasarım `padding:60px` ile başlığın altına koyuyordu; 2400 px'lik
  gerçek ekranda içerik üst üçte bire düşüyor. `EmptyState.fill` varsayılan `true` (37 kullanımın
  32'si tam ekran; istisna liste/kap içi olanlar).
- **Boş hâl ikonu 44 → 80.** Sayfanın tek görseli olduğu hâlde başlıkla aynı ağırlıktaydı.
  120 KAHRAMAN ölçüsüdür (puan yıldızı) ve bilerek ayrı tutuldu.
- **Geri okunun negatif payı −8 → −16.** Daire 40 dp, glif ortalı; −8 ile glif başlığın 8 dp
  sağında kalıyordu (kullanıcı cihazda gördü). −16 glifin sol kenarını başlığın soluna oturtur.

**Düğme biçimi — bu ise BİZİM sapmamızdı, düzeltildi:** tasarımın iki biçimi var ve kuralı net —
boş hâl çağrısı **hap** (`radius:22`, gölgesiz), form/seçim eylemi **blok** (`radius:16` + `3px 3px
0` sert gölge). Boş hâllerde 10 düğme blok çiziyordu (siparişler · davet · komşu); hepsi hapa
çevrildi.

**`.dc` dosyası bu turun sonucunu HENÜZ TAŞIMIYOR** — tasarım turunda güncellenmeli; bu kayıt o
tura gerekçedir.

Kod: `components/ui/empty-state.tsx` · `theme/metrics.ts` (`emptyIcon` 80, `decorIcon` 44 ayrıldı) ·
`screens/{orders,points-history}` (hiza) · `screens/{orders,invite,neighbor}` (hap), commit 16.08.

**EK (aynı gün, ikinci tur): "ortala" yetmedi — boş hâl kalan alanın %40'ına oturur.**
`justifyContent: 'center'` bloğu başlığın ALTINDA kalan alanın ortasına koyuyordu; hesap doğru ama
göz sayfaya bakıyor. Ölçüldü: blok merkezi 1170, sayfa merkezi 1000 (900×2000). İki sapma aynı
yöne biniyordu — başlığın yüksekliği bloğu yarısı kadar aşağı itiyor, ve optik merkez zaten
geometrik merkezin biraz üstündedir. Sabit kaydırma çare değil (başlık boyu ekrandan ekrana
değişiyor); blok artık **4:6** oranlı iki esnek payın arasında (üstte %40, altta %60) ve oran
kendini ayarlıyor. Sonuç: sepette 1095 → 987.

### Panel (dashboard) — yedi veri iddiası budandı, beş KPI korundu (17.08, kullanıcı onayı)

`Operasyon - Dashboard.dc.html` geldi ve otuz küsur veri kalemi şemaya karşı ölçüldü. Kullanıcının
ölçütü baştan konuldu: **"sırf arayüzde var diye kapsamlı geliştirme yapılmaz; gerekirse budanır."**
Budama ölçütü panelin kendi sözleşmesinden alındı — brief *"bugün ne var, ne bekliyor, nerede sorun
var"*, `.dc.html` tezgâh sözleşmesi *"karar tetikler, analiz etmez"*. **Bir kalem karar
tetiklemiyorsa, verisi olsa da panelde işi yok.**

Sonuç şaşırtıcı biçimde tek yöne çıktı: **budanacakların çoğu panelin kendi kuralına da aykırı
olanlardı.** Veri yokluğu ve tasarım disiplini aynı yeri işaret etti — bu, budamanın panelin
sözleşmesini ZAYIFLATMADIĞININ değil GÜÇLENDİRDİĞİNİN kaydıdır.

**Budandı ya da içeriği değişti:**

- **"Zamanında teslim %94" → "bugün teslim edilemeyen: N".** Yüzde bir *analiz* göstergesiydi ve
  karar tetiklemiyordu. Ölçülemez de: `order.delivery_date` bir **date**, teslim penceresi/taahhüt
  saati diye bir kavram YOK, kodda `on_time`/geç-teslim ölçütü hiç geçmiyor. Yerine gelen sayaç hem
  karar tetikliyor ("yeniden planla") hem **verisi hazır**: `out_for_delivery → ready` geçiş sayımı
  `courier/day.ts:280`'de zaten yazılı. Teslim penceresi kavramı açmamız gerekmedi.
- **Durak saatleri (14:20 · 14:45 …) → yarı budandı.** Teslim edilmiş durağın saati
  `order_status_log`'dan bedava gelir ve GÖSTERİLİR; gelecek durak için saat YOKTUR ve olmayacak —
  ETA reddi kurye brief'inde zaten yazılı (*"navigasyon ADRES METNİYLE gider, koordinat/ETA yok"*,
  `app-kurye.md`). Sütun yerinde kalır, tasarımın düzeni bozulmaz.
- **Durak numaraları (1…6) → durum grubuna çevrildi** (teslim edilenler → yolda → bekleyenler).
  Numara "rota sırası" iddiası taşıyor, o sıra sistemde YOK (`stop_order`/`sequence` kolonu yok).
  Sıra optimizasyonu ayrı iş (`architecture/BACKLOG §8`, kullanıcı kararı: "o gün konuşulur").
- **"4 koli / 2 paket" → "N kalem."** Elimizdeki tek sayı `itemCount = lines.length`. Koli sayısı
  admin kararı tetiklemiyor (kuryenin bilgisi) ve kutu kavramı modül `23` ile gelecek — panel onu
  beklemez, geldiğinde kendiliğinden kazanır.
- **"Tek kişi vardiyada · hazırlık yavaş" → tamamen budandı.** Vardiya/personel sayısı şemada yok,
  **ve** tasarımın kendi sözleşmesi yasaklıyor: *"depo nabzı sadece hazırlık ilerlemesidir →
  çalışan/verim ölçmez."* Yerine hâlihazırda ölçülen cümle kaldı: *"kesime 20 dk · 4 sipariş
  hazırlanmadı."* Risk etiketi (`destek gerek`) ilerleme + kalan süreden türer, kalır.
- **"Bekleyen transfer · sevk onayı bekliyor" → metin düzeltmesi:** *"yoldaki transfer · kabul
  bekliyor."* `transfer_status` yalnız `in_transit · received · cancelled`; "sevk onayı" olmayan bir
  adım ima ediyordu ve `app-depo.md` D5 gerekçesini yazmış: *"'taslak' BİLEREK yok — sevk anı ilk
  kalıcı andır."*
- **"Marj-altı satış (2 ürün · 4 satırda)" → "marj-altı fiyatlı ürün: N".** Satış düzeyi ölçüm kâr
  snapshot'larından yazılabilir ama orta boy iş; ürün düzeyinde kapı HAZIR
  (`product.schema.ts` "marj-altında mı" okuması) ve **aynı kararı tetikliyor**: fiyatı düzelt.

**Budanmadı — ayar olarak eklenecek: gün akışının eşik saatleri.** Beş eşikten yalnız biri veride
vardı (`order_cutoff_time` = `"16:00"`; panelin 09:00'ı demo değeri). Hazırlık kapanışı · rota
çıkışı · kurye kapanışı ayar olarak YOK. Bu listenin **en ucuz ve en değerli kalemi**: üç `settings`
satırı (`setting_scope + 'warehouse'` hazır; ayar dosyası *"depo bazlı olmaya aday: kesim saati"*
diyor). Üstteki uyarı şeridi de buna dayandığı için budamak panelin omurgasını almak olurdu.
**"Gün sonu mutabakat 20:00" ÇIKARILDI** — o para ekranının işi, panelde karar tetiklemiyor. Dört
eşik kalır.

**Panelin en değerli yarısı hiç budanmadı.** "Bekleyen işler" kuyruğundaki sekiz kalemin tamamı
veri-gerçekli: gecikmiş vade (türetilir — `payment_term_days` + bugün; migration bunu bilinçle
kolon yapmıyor) · yaklaşan tarihli parti (`near_expiry_percent` + `expiry_date`, risk =
`purchase_price × qty`) · uyuşmayan kurye kapanışı (`expected_* ↔ counted_*`) · limit aşan vadeli
sipariş (`credit_limit`) · açık talep (`ticket_status`) · B2B başvurusu (`b2b_approved is null`) ·
yoldaki transfer · asistan önerileri (`assistant_proposal.status='pending'`). Aciliyet kümeleri
(şimdi / bugün / bu hafta) da türetilebilir. Panelin ASIL işi eksiksiz çalışıyor.

**KPI bandı yine BEŞ kart** — sipariş · ciro · bekleyen tahsilat (`0012:394` sorgusu kapıda/vade
ayrımını zaten yapıyor) · *teslim edilemeyen* · *marj-altı fiyatlı ürün*. İkisi içerik değiştirdi,
sayı ve düzen aynı: tasarımın görsel dengesi korunuyor.

**Kabul edilen tek gerçek kayıp: teslimat listesinin ZAMAN EKSENİ.** Admin "bu rota programında mı"
diye soramaz. Telafi kısmi (kurye kapanış eşiği + teslim edilemeyen sayacı + depo nabzı). Tek dürüst
çözüm rotaya bir zaman kavramı sokmaktır ve o, sıralama işinin içindedir. **Bugün panelin bunu sahte
bir kesinlikle göstermesi, hiç göstermemesinden kötüdür** — kayıt bu yüzden burada.

**"Yoğun gün / Sakin gün" düğmesi veri DEĞİL:** `.dc.html`'de `props.gun` ile gelen tasarım önizleme
anahtarı. Kodda UI durumu olarak taşınmaz; iki hâl aynı ekranın veriye göre doğal görünümüdür (sakin
gün birinci sınıf — boş kuyruk "temiz masa" olarak olumlu gösterilir, şerit kutlar, uyarmaz).

Ertelenen üç kalem `design/BACKLOG.md §1`'de; brief (`design/pages/admin-dashboard.md`) bu turda
tasarımın altı yeni bölümünü kapsayacak şekilde güncellendi.

### Panel eşikleri ROTA ekseninde — depo ekseni kaldırıldı, nabız rotaya döndü (17.08, kullanıcı kararı)

Gün akışının dört eşiği (sipariş kesimi · hazırlık kapanışı · rota çıkışı · kurye kapanışı) ayar
olarak eklendikten sonra sıra "hangi eksende ayrışırlar" sorusuna geldi. Ölçüm bir tuzak gösterdi:
`SCOPE_PRIORITY = ['warehouse', 'zone', 'channel', 'country', 'global']` — yani **`warehouse`
`zone`dan DAHA ÖZGÜL**. İki eksen birden açık olsaydı depoya yazılan bir saat, bölgeye yazılanı
hiçbir hata vermeden yutardı. Kullanıcı kararı: *"depo saatini komple kaldıralım, her rota saatini
barındırsın; böylelikle sessiz kapsam tuzağına düşmeyiz."*

- **Dört eşik `exceptionScopes: ZONE_ONLY`.** `order_cutoff_time` da dahil — `0016`'nın 03.08'de
  yazdığı "depo bazlı olmaya aday" gerekçesi bu kararla geçersiz. 03.08 tarihli nöbet testi bunu
  doğru biçimde yakaladı (kırmızıya döndü) ve karara göre güncellendi; yeni nöbet iki yönlü —
  dördü de `zone` içermek, `warehouse` içermemek zorunda.
- **Gün akışı tek şerit kaldı: "en erken kısıt" kuralı.** Rotalar farklı saat taşıyabildiği için her
  kutu **en erken** olanı gösterir ve `routeLabel` ile kimin olduğunu söyler. Alternatifleri (rota
  seçici · rota başına şerit) ekrana yeni bir durum sokuyordu; en sıkı kısıt hem doğru bilgiyi verir
  hem tekilliği korur — ona yetişen ötekilere de yetişir. **Tüm rotalar aynı saatteyse rota adı
  YAZILMAZ** (tek rotalı kurulumda tekrar, bilgi değil gürültü olur).
- **Nabız satırı DEPO değil ROTA oldu** (`RoutePulseView`). Kesim rotaya bağlandığı an ölçünün de
  rota olması gerekiyordu: depo bazlı kalsaydı iki rotalı bir depoda 09:00 rotasına göre "riskli"
  derken 11:00 rotasının malını haksız yere geç ilan ederdi. Maliyeti sıfır — sipariş
  `delivery_zone_id` taşıyor, ek sorgu gerekmedi. Depo kodu çip olarak duruyor, "hangi tesisten
  çıkıyor" bilgisi kaybolmadı. **Rotasız sipariş nabza girmez** (kargonun hazırlık kesimi yoktur);
  gün akışının sayaçları onları yine sayar, yani sipariş kaybolmuyor.
- **Sorgu sayısı rota sayısıyla çarpmıyor:** `SettingsService` bir anahtarın tüm kapsam satırlarını
  tek turda çekip statik önbellekleğe koyuyor (`rowsFor`), yani N rota × 4 anahtar = 4 sorgu.
  Ölçülmeden yazılsaydı buradaki döngü bir N+1 tuzağı olurdu.
- **Canlı doğrulama (17.08):** tek aktif rota ("Strasbourg Merkez", `order_cutoff_time` = 10:00)
  varken panel sipariş kesimini **10:00** gösterdi (global 16:00 yerine) ve şerit rota adıyla
  konuştu (*"Strasbourg Merkez 11:00 hazırlık kesimini kaçırdı"*, önceki hâli depo adıydı).
  `routeLabel` bu veriyle **görünmedi ve görünmemesi doğru** — tek rota var, ayrışma yok; iki rota
  farklı saat taşıdığında görünecek, o hâl canlı veriyle henüz sınanmadı.

**Bu karar çok günlü seferin de ön koşulu:** kesim teslim gününe değil turun ÇIKIŞ gününe bağlanmak
zorunda ve bu ancak rota ekseninde ifade edilebiliyor. Ayrıntı `docs/feature/cok-gunluk-sefer.md §5`.

### Rota saatleri SAYI DOĞRUSU üzerinde rozetler — dört şerit, tek eksen (17.08, kullanıcı isteği)

Eşikler rota eksenine alındıktan sonra (üstteki karar) ortaya bir boşluk çıktı: saatler yalnız
Ayarlar → *istisna ekle* → kapsam seç yolundan girilebiliyordu. Kullanıcı bunu ekranda gördü —
*"operasyon sayfasında rota tanımladığımız yerde bu bilgileri set etmeli değil miyiz?"* — ve yüzeyi
kendisi tanımladı: *"rozetlerin içinde saatler olsun, yatay görünsün, tıklayınca tooltip açılsın,
çubuğu kaydırarak saatleri düzenleyebileyim"*, ardından *"bir sayı doğrusunda yerleşmiş saat
rozetleri gibi düşün."*

**Yerleşim: dört şerit, ortak eksen.** Tek doğru denenmedi çünkü ölçüm reddetti: sağ ray ~300px,
etiket kolonu çıkınca eksene ~240px kalıyor; 06:00–22:00 = 16 saat → **15px/saat**, oysa bir rozet
(`11:00`) ~52px yani **3,5 saat** genişliğinde. Kesim 10:00 ile hazırlık 11:00 tek doğruda üst üste
binerdi ve çubuk kaydırılırken rozetler birbirini itip zıplardı. Dört şerit tek EKSENİ paylaşıyor:
sayı doğrusu duruyor, binme imkânsız.

**Bedava teşhis:** rozetler soldan sağa merdiven iniyor. Sıra bozulursa merdiven geri gidiyor ve
bozukluk hesaplanmadan görünüyor — panelin gün akışında bulunan hatanın (kesim 16:00 iken hazırlık
11:00) ekrandaki karşılığı. Bozukluk **engellenmiyor, uyarılıyor**: kesim mantıken önceki günün saati
olabilir (16:00 kesim → yarının rotası), yani ters sıra her zaman hata değil.

**Hâl ayrımı `Chip`in kendi sözleşmesinden:** dolu rozet = bu rotaya özel, çerçeveli = genel değerden
miras, kırmızı = biçimi bozuk değer (eksende yer TUTMAZ — nereye konsa yalan olurdu). Yeni ton
uydurulmadı. Çubuk penceresi de yeni bir kutu değil: `AnchoredMenu` + `image-crop-dialog`'un çubuk
deseni + `StepButton`. Yeniden yazılan tek dosya `route-hours.tsx`.

**Çubuğu oynatmak istisnayı KENDİLİĞİNDEN açıyor** — ayrı bir "bu rotaya özel" anahtarı yok, fazla
tıklama olurdu. Geri dönüş açık bir eylem: *"↩ genele dön (14:00)"*, yalnız istisna varken çiziliyor.

⚠ **Bu iş bir görünmez arıza açığa çıkardı:** rota rayının `z-[500]`'ü yüzünden rayın içinden açılan
hiçbir `AnchoredMenu` boyanmıyordu (menü body'ye portal edilip `z-[60]` alıyor). Yani rota seçicisinin
açılır listesi de bugüne dek görünmüyordu. Rayın yüksek sayısı `ZoneMap`'e `isolation: isolate`
gelmeden önceki gerekçeye aitti; yalıtımdan sonra gereksizdi. Ray `z-10`'a indi. **Ders:** bir
komponentin z değeri sözleşmesinin parçasıdır — portal eden bir menüyü yüksek katmanlı bir kabın
içine koymak, menüyü sessizce yok eder.

Görsel karar bu turda `.dc.html`'e işlenmedi (yüzey sözlü istekten doğdu, Claude Design'dan gelmedi) —
tasarım dosyasına geri yazılması `19.20`'de işaretli.
### Rozet ölçüsü ORTAK, ve kutu rozetin söylediğini tekrar etmiyor (19.08, kullanıcı isteği)

**Ölçüldü:** yer işareti `px-3.5 py-2 · text-body-sm · bold`, soğuk zincir işareti
`px-2.5 py-0.5 · text-micro · semibold` — dikey dolgu dört kat, yazı bir kademe farklı. Yan yana
duruyorlar ve biri rozet, öteki etiket gibi okunuyordu. Kullanıcının tarifi: *"kargoyla gönderilir
rozeti birazcık büyük olmuş, küçültebiliriz; soğuk zincir çok az büyüyüp her iki rozet de aynı
büyüklükte olabilir."* İkisi `px-2.5 py-1 · text-note · semibold` ile ortada buluştu — **ölçü
ortaktır, biri değişirse öteki de değişir.**

**Ve aynı metin iki yerde basılıyordu:** `t.shipMark` ("📦 Kargoyla gönderilir") hem ürün
detayındaki stok rozetiydi hem teslimat kutusunun kalın başlığı. Kelimesi kelimesine iki kez.
Kural artık şu — **rozet ADI söyler, kutu bu ADRESE dair SONUCU.** Kutunun başlığı kalktı (yalnız
`compact` hâlde duruyor: liste/sepet satırında rozet yoktur, orada tekrar da yoktur), `blockedHere`
ve `shipBody` metinlerinden rozeti tekrar eden açılış cümleleri çıkarıldı (üç dilde).

### "Bunları da sevebilirsiniz" ALINAMAYAN ürünü önermiyor artık (19.08, kullanıcı kararı)

Kullanıcı ekran görüntüsüyle bildirdi (67400): *"Mantıksız olan şey şu — 'Haber ver' yazan butonlu
ürünlerin gelmemesi gerekir oraya."*

**Ölçüldü.** `readSimilar` adayları yalnız iki ölçütle seçiyordu: aynı kategori + `status:'active'`.
Müşterinin yeri (`place`) fonksiyona **geçiyordu** ama seçime hiç girmiyordu — sadece kartı
ETİKETLEMEK için kullanılıyordu, yani "Haber ver" yazısını üreten şeydi. Sistem ürünün o adrese
gidemeyeceğini biliyor, kartın üstüne yazıyor, ve yine de öneriyordu.

**En sert gerekçe sayfanın kendi içindeydi:** aynı turda teslimat kutusunun birincil düğmesi
*"Kargolanabilir benzerleri gör"* oldu. Sayfa "alabileceğin alternatiflere bak" derken iki blok
aşağıdaki şerit alamayacaklarını sıralıyordu.

**Düşen iki hâl:** `elsewhere` (bu adrese gidemez) ve `out_of_stock` (hiçbir yerde yok). `shipping`
DÜŞMEZ — kargoyla da olsa müşteri onu alabiliyor. Süzgeçten sonra hiçbiri kalmazsa bölüm hiç
çizilmez: alakasız bir şerit göstermektense hiç göstermemek doğru.

**Kural yalnız ÖNERİ şeridinindir ve sınırı bilinçli:**
- **Ailenin çeşit kartları süzülmez** — orası bir öneri değil, bakılan ürünün kendi seçicisi. Adrese
  göre süzmek, ürünü kendi çeşitlerinden gizlemek olurdu (Latte'ye bakan müşteri "Kırmızı kadife
  diye bir şey var mı" sorusunun cevabını hiç göremezdi).
- **Katalog listesi süzülmez** — orada "Haber ver" bilinçli bir talep toplama aracı ve tasarımda
  öyle çizili. *(Kanal fiyatı olmayan ürünün katalogdan çıkarılması ayrı bir iş: `08.46`.)*

**Bedeli ölçüldü, yok.** Alınabilirlik seçimden ÖNCE bilinmek zorunda olduğu için bağlam artık 4
aday yerine havuzun tamamı (40) için okunuyor. `loadProductContext` satır sayısından BAĞIMSIZ
olarak 5 paralel sorgu atıyor (kimlikler `in(...)` listesine giriyor) — 40 aday, 4 adayla aynı tur
sayısı. Aile kuralı (her aileden tek temsilci) süzgeçten SONRA uygulanıyor: önce uygulansaydı elenen
bir temsilcinin yerine ailenin alınabilir üyesi geçemezdi.

### Ürün detayı İKİ AYRI IZGARADAN İKİ BAĞIMSIZ SÜTUNA — `.dc.html`'in hizasızlığı bilerek terk edildi (19.08, kullanıcı kararı)

Kullanıcı ekran görüntüsüyle bildirdi: *"solda ortada bir boşluk var… blokların içerisine yerleşme,
sütunların başladığı yerlerde bir sıkıntımız var gibi."*

**Ölçüldü (masaüstü, 1460px viewport).** Sayfa iki bağımsız `<section>` ızgarasıydı — üstte
galeri | satın alma (`1fr 1fr`, gap 48), altta beyan | yorumlar (`1.2fr 1fr`, gap 40). İki kusur:

1. **Solda 172px ölü alan.** Üst ızgaranın satır yüksekliğini UZUN olan sağ sütun belirliyordu:
   sol sütunun içeriği 710px'de bitiyor, hücre 838'e uzatılıyor, bölüm dolgusuyla "İçindekiler"
   ancak 882'de başlıyordu.
2. **Dikiş 60px kayıyordu.** Sütunları ayıran dikey çizgi üstte 706, altta 766 — oranlar ve
   aradaki boşluk farklı olduğu için.

**Kusur TASARIMDA da vardı ve daha büyüktü.** `Musteri - Urun Detay.dc.html` tarayıcıda açılıp
aynı yerler ölçüldü: kayma **132px**, ölü alan **263px**. (Tasarımda üst sütunlar 536/680 çıkıyor
çünkü ham `1fr` içeriğin sütunu şişirmesine izin verir; Tailwind'in `grid-cols-2`'si
`minmax(0,1fr)` ile bunu engellediği için uygulama zaten daha derli topluydu.) Yani bu bir
**implement sapması değil**, tasarımın kendi hizasızlığıydı — ve sebebi görünüyor: **"Çeşitler"
bloğu sonradan eklendi** (`musteri-urun-detay.md §1b`, 04.08 kararı) ve sağ sütunu uzattı; iki
bağımsız ızgara o boy farkını deliğe çevirdi.

**Karar:** iki bölüm birleşti; sol sütun galeri → beyan, sağ sütun satın alma → yorumlar.
Sol sütun **ürünün kendisi**, sağ sütun **satın alma kararı**.

**IZGARA DEĞİL FLEX — ve fark ölçülerek anlaşıldı.** İlk deneme iki bölümü tek `grid`e aldı
(`items-start` + `gap-y`): dikiş kayması bitti ama **delik yerinde kaldı** (yeniden ölçüldü: galeri
710, beyan hâlâ 882). Sebep ızgaranın doğası — **satırlar ortaktır**, ikinci satır uzun hücrenin
bitmesini bekler. Dikey akışın her sütunda kendi başına ilerlemesi gerekiyordu; onu yapan şey flex
sütunudur. Son ölçüm: galeri 710 → beyan **754** (yalnız 44px, tasarımın kendi ritmi), dikiş her
iki sütunda 706/754 — **kayma sıfır**.

**Ders:** "sütunlar hizalansın" ile "sütunlar bağımsız aksın" AYNI ŞEY DEĞİL. Izgara birincisini
verir, ikincisini engeller. Bir sütunun ötekinden kısa olması bir hizalama sorunu değil, bir AKIŞ
sorunudur.

Görsel karar bu turda `.dc.html`'e işlenmedi (kaynak tasarımın kendisi düzeltilmeli, kopya değil).

### Ürün detayında ÜÇ EYLEM ÜÇ AĞIRLIK — "iki yeşil düğme" tasarımın kendi sırasına döndürüldü (19.08, kullanıcı kararı)

Kullanıcı ekran görüntüsüyle bildirdi: *"iki yeşil buton gerçekten kötü görünüyor… rozetlerin
büyüklükleri de aynı değil."*

**Ölçüldü — sapma bizdeydi, tasarım sorunu zaten çözmüştü.** `Musteri - Urun Detay.dc.html` "adres
bölge dışı" kutusunda ÜÇ düğme ve üç ayrı ağırlık çiziyor:

| sıra | düğme | tasarımdaki hâli |
|---|---|---|
| 1 | Kargolanabilir benzerleri gör | dolu olive (`background:#5f7a2c`) |
| 2 | Bölgeye gelince haber ver | çerçeveli olive (`border:2px solid #5f7a2c`) |
| 3 | **Yine de sepete ekle** | nötr gri çerçeve (`border:1.5px solid #d8cfb6`) |

Uygulama bu sıradan iki yönde birden sapmıştı: "Sepete ekle" yukarıda **tam ağırlıkta birincil**
kalmış, "haber ver" de `emphasis='panel'` ile **birinciye terfi** ettirilmişti. Sonuç ekranda iki
dolu yeşil düğme — ve iki birincil, birincil olmaması demek. Tasarımın kendi notu da gerekçeyi
yazmış: *"Buton pasifleştirilmez — müşteri bölge içindeki birine gönderiyor olabilir."* Yani satın
alma yolu kapanmaz ama **birincil de olamaz**; adı bile değişir, çünkü artık farklı bir şey yapıyor:
uyarıya rağmen devam etmek.

**Uygulanan:** `noticeButtonClass('panel')` → `outlineOlive`; `PurchaseBar` yeni `deemphasized`
hâlinde `secondary` (nötr çerçeve) + `addToCartAnyway` metni; `elsewhere` hâlinde satın alma düğmesi
normal yerinden **iner** ve karar kutusunda üçüncül olarak çizilir.

**Aynı turda bulunan ikinci çift-yeşil:** `shipping` hâlinde de "Sepete ekle" + "Kargolanabilir
benzerleri gör" yan yana düşüyordu — üstelik o teklif **karşılıksızdı**: ürün zaten kargoyla
gidiyor, müşteri bakmakta olduğu şeyi alabiliyor. O hâlde çıkış düğmesi hiç çizilmiyor artık.
Düğme yalnız gerçek çıkmazda kalıyor (yer rota dışında VE ürün kargolanamıyor).


### MOBİL WEB KABUĞU — İKİ KATMANLI HEADER + ÜÇ KATMANLI FOOTER (20.08, kullanıcı kararları)

**Kullanıcı incelemesi ekran görüntüleriyle geldi** ("sepette hâlâ menü var, gereksiz… header
zıplıyor… soğuk zincir yazısının sürekli görünmesi buna sebep oluyor") ve tasarım↔kod turunun
bulgularıyla birleşince kural olarak kapandı. `.dc.html`'ler bu kararların bir kısmını zaten
çiziyordu (Sepet Mobil kompakt satırla başlar, global başlık taşımaz — kaynağından ölçüldü);
yazılı kural yoktu ve uygulama huni sayfalarını vitrin çerçevesinde bırakmıştı.

- **İki header katmanı.** Vitrin (`default`): ☰ + logo + sepet — ana sayfa, katalog, paketler,
  tarifler, professionnels. Detay (`detail`): ← geri + logo + (paylaş) + sepet — ürün/paket/tarif
  detayı **ve artık sepet + checkout** (rozet ikisinde gizli: sepette kendine bağ, checkout'ta
  geri bağının kopyası olurdu). Keşif `bare`: site başlığı hiç çizilmez, "X Kapat" sayfanın kendi
  satırı (tasarımın tam ekran örtüsü). İki katmanın logo satırı aynı yükseklikte — zıplamazlık
  sözü buradan geçer.
- **Duyuru şeridi YALNIZ ana sayfada** (mobil). Her sayfada durunca vitrin↔detay geçişinde bir
  görünüp bir kaybolarak üst bölgeyi zıplatıyordu; mesaj vitrine girişte bir kez görülür.
  Masaüstü eski kuralında — şikâyet ve karar mobil web içindi.
- **Üç footer katmanı** (sayfa TÜRÜNE bağlı, cihaza değil): tam → ana sayfa · Professionnels ·
  yasal; ince (marka + TR·FR·DE) → liste + detay sayfaları; yok → sepet, checkout, keşif, hesap
  alanı. Yasal erişim kopmaz: CGV bağı checkout onay metninde, gizlilik hesabın GDPR notunda,
  dil menü panelinde.
- **Checkout şeridi yalnız adım çipleri.** "6 ürün · 126,48 € · çipler" tek satıra sığmıyor,
  üçüncü çip kesiliyordu (kullanıcı görüntüsü). Sayaç ve tutar özette + onay düğmesinde zaten var.
- **Adet seçicileri: görsel küçük, dokunma 44.** 03.08'in 44px tabanı görünür kutudaydı ve sepette
  "çok büyük ve rahatsız edici"ydi (kullanıcı). Katalog kartının deseni genelleşti: kutu ~28px
  çizilir, dokunma `after` katmanıyla dikeyde 44'e tamamlanır. 44 kuralı BOZULMADI.
- **Dar kartta fiyat + eylem AYRI satırlar.** "0,95 €'dan" + üstü çizili + "Seçenekler →" tek
  satırda kart kenarından taşıyordu (kullanıcı görüntüsü; FR/DE daha uzun). Fiyat kendi satırında,
  eylem tam genişlikte; 26px'lik "+" dairesi yerini adlı düğmeye bıraktı ve eklemede aynı kutuyu
  dolduran tam-genişlik seçiciye dönüşüyor. Eski maddenin "yatay eksen kalıntısı" böylece kapandı.
- **Menü:** "Ana sayfa" satırı (logo bağını kimse keşfetmiyordu) + K12 aktif kuralı panelde de
  (yeşil + altı çizili; çizgi her satırda, aktif olmayanda şeffaf — satır oynamaz).
- **Hesap native'le eşitlendi:** tek başlık ("Mon compte" çift basılıyordu) + başlıkta "Çıkış";
  `/account/points` (keyset sayfalı tam döküm + ayardan "nasıl kazanılır" — `readPointsRules`);
  davet kartı (`readCustomerPoints` tek kapı — kod + `inviteUrl` application'dan; web kartının
  beş-parça okuması ve ölü kupon köprüsü söküldü). Keşif ziyaretçi daveti başlığın altına indi
  (üstüne biniyordu); destek eylemi mobilde kısa ("+ Nouvelle").

**`.dc.html`'ler bu turun sonucunu taşımıyor** — tasarım dosyası güncellenirken bu kayıt gerekçedir
(iş kimliği `08.48`).

**EK (aynı gün, ikinci tur — kullanıcı görüntüyle gösterdi): huni sayfaları `detail` DEĞİL, ÇIPLAK
kabukta.** Sepet/checkout'a logolu detay barı verilince altında sayfanın kendi başlık satırıyla üst
bölge iki katlanıyordu ("boşluklar dengesiz, yerleşim dengesiz — logonun olmasına gerek var mı?").
Tasarımın karesi zaten logosuz TEK satır: "← Devam et · Sepetim · 6 ürün". Karar: sepet ve checkout
`bare` kabuğa indi, tek satırı sayfanın kendisi kurar (geri · başlık · sayaç; checkout'ta geri +
eyebrow + başlık). `detail` yalnız ürün/paket/tarif detayının katmanı olarak kaldı; `hideCart`
prop'u doğmadan söküldü.

**EK (aynı gün, üçüncü tur): sepetin geri kontrolü `‹` YUVARLAK İKON — native deseni webe geçti.**
Kullanıcı sorusu üzerine ölçüldü: "← Devam et" metni checkout dilinde İLERİ okunuyor (FR
"Continuer" daha da belirsiz — sepette "siparişe devam" sanılır) ve çıplak metnin dokunma alanı
~20px'ti (envanter tabanı 44). Native zaten metinsiz çözmüştü: 40dp yuvarlak `‹` (`BackButton`,
sepette de aynı bileşen). Web karşılığı yazıldı (`components/customer/ui/back-button.tsx`):
44px kutu, tarayıcı geçmişine döner, geçmişsiz derin bağlantıda kataloğa düşer, ekran okuyucu adı
i18n'den ("Geri/Retour/Zurück"). Sepetin sıkışık satır YAPISI native üç-durak kuralının 2.
durağıyla zaten uyumluydu — değişen yalnız kontrolün biçimi. Aynı turda sayaç tekili düzeldi
("1 produits" → "1 produit", `countOne`); checkout'un adlı geri bağı ("← Retour au panier")
bilerek korundu — o nereye döndüğünü adıyla söylüyor ve tek katmanlı duruyor.

**EK (aynı gün, dördüncü tur): huninin TEK başlığı `FunnelHeader` — ve şerit kapsız.** Kullanıcı
kıyası net koydu: *"birden fazla çeşit header yapısı olmaz… sipariş tamamlama kendi içinde anlamlı
ve iyi, belki geri butonu biraz kötü."* Sepet ile checkout'un iyi yanları birleşti: checkout'un
kimlik bloğu (eyebrow + büyük serif başlık) + sepetin `‹` yuvarlak ikonu → ortak bileşen
(`components/customer/ui/funnel-header.tsx`); sepette eyebrow'un yerini sayaç aldı ("10 ÜRÜN",
tekili `countOne`). Checkout'un ilerleme şeridi mobilde KART DEĞİL: çerçeve/zemin kalktı, kenardan
kenara akıyor (`-mx-4`), kaydırma çubuğu gizli (çiplerin altında gri çizgi olarak beliriyordu —
kullanıcı görüntüsü). Masaüstü şeridi kart hâlinde kaldı (sütun düzeninin parçası).

**EK (aynı gün, beşinci tur): yapışkan olan KİMLİKTİR — iOS büyük-başlık deseni `FunnelHeader`a
girdi.** Kullanıcı ilkesi: *"sticky olan kısım sayfanın ne sayfası olduğunu anlatan kısım olmalı."*
Büyük başlık içerikle akar; ekrandan çıktığı anda üstteki yapışkan barda (`‹` + kompakt ad) sayfa
adı belirir (`IntersectionObserver`, kaydırma dinleyicisi değil). Checkout'un çip şeridi
yapışkanlığı bıraktı — kimlik görevi bara geçti, iki yapışkan katman içerikten yer çalıyordu.
Uygulama dersi kayda değer: `sticky` en yakın kaydırılan atası boyunca yaşar — başlık dar bir
sarmalayıcıya konunca sarmalayıcı bitince bar da akıp gitti (sepette ölçüldü); `FunnelHeader` bu
yüzden fragment döner ve pedsiz, sayfa boyu kök konteyner ister (künyesinde yazılı).

**EK (aynı gün, altıncı tur): checkout'un adım şeridi kimlik barının ALTINA yapışır.** Kullanıcı:
*"sipariş tamamlama adımları da başlığın altında yapışkan olarak yerini alsın."* Beşinci turda
şeridin kendi yapışkanlığı kalkmıştı; şimdi geri geldi ama kendi başına bir katman olarak değil,
barın uzantısı olarak — iOS'ta büyük başlığın altına pinlenen segment/arama çubuğu deseni. Çipler
büyük başlığın hemen altında akar (sarmalayıcının ilk çocuğu), kaydırınca `top: 52px`te (bar boyu)
sabitlenir; zemin barla aynı (krem/95 + blur), z-katmanı barın altında. `top` değeri
`funnel-header.tsx BAR_HEIGHT` ile aynı sayıdır ve `checkout-progress.tsx`te yinelenir (Tailwind
sınıfı çalışma anında kurulamaz) — bar boyu değişirse ikisi birlikte değişmeli. Ölçüldü (3001):
kaydırılmış ekranda şerit viewport'un 52. pikselinde. Masaüstü şeridi kart hâlinde ve yapışkansız.

**EK (aynı gün, yedinci tur): hamburgersiz TÜM sayfalar tek başlık dilinde — `FunnelHeader`
genelleşti.** Kullanıcı sorusu: *"Hamburger menünün görünmediği sayfalardaki header kısmı ortak
olmalı değil mi?"* Envanter üç ayrı dili gösterdi: detay katmanı (metin "←" bağı + logo + ↗ paylaş
+ sepet), huni (‹ ikon + yapışkan kimlik), hesap alanı (metin "←" bağı + ortalı başlık + sağ öğe).
Karar: hepsi `FunnelHeader` (şıklı soru, "Hepsi FunnelHeader'a"). Bileşen iki yetenek kazandı:
**sağ uç yuvası** (detayda sepet rozeti, hesapta "Çıkış"/ekran aksiyonu) ve **içerik başlığını
gözleme** (`watchId`): ürün/paket adı tasarım gereği görselin ALTINDA durur, bar o h1'i gözler —
ad ekranda her an tam bir kez. Tarifin mobil düzeninde h1 hiç yoktu (ad yalnız alt metindeydi);
hero'yu FunnelHeader kurar — açık eksik de kapandı. Detay başlığındaki LOGO söküldü (sepet
turundaki kararla tutarlı). Detay/hesap başlığını `SiteFrame` kurar ("Geri" ve sepet etiketi
çerçevenin sözlüğünde kalır, sayfalara kopyalanmaz); huni sayfaları kendi kurar (eyebrow'ları
istemci verisi). **Kurumsal renk dokunuşu:** eyebrow TERRACOTTA — native uygulamanın "sayfa
başlığı" durağı birebir (yukarıdaki "üç header" kaydı 16.08); harf aralığı `text-eyebrow-sm`
token'ında gömülü. **Paylaş başlıktan İÇERİĞE indi** (kullanıcı: *"ürünün detay sayfası içerisinde
uygun bir yerde"*; şıklı soru: başlık satırının sağına): ürün/paket adının yanında, işaret klasik
paylaş ikonu (yukarı ok + tepsi, inline SVG) — eski "↗" glifi bağlantı okuyla karışıyordu.
`.dc.html` detay/hesap kareleri bu turu HENÜZ taşımıyor — tasarım turunda güncellenmeli.

**EK (aynı gün, sekizinci tur): ürün/paket detayında BAŞLIK YOK — kahraman görsel + yüzen
düğmeler, native ürün ekranı birebir.** Kullanıcı görüntüyle gösterdi: yedinci turun barı bu iki
sayfada metinsiz kalıyordu ("yukarıda kötü bir boşluk") — kimlik içerik h1'inde olunca bar çoğu
zaman boş bir krem şeritti. Karar: *"header'ı kaldırıp resmi yaslayalım; geri butonu resmin üstünde
sol üstte; resim kart gibi değil sayfayla bütünleşik; sabit sepete-ekle çubuğu yerine mobildeki
gibi yüzen sepet düğmesi."* Uygulama (hepsi native ürün ekranının deseni): görsel tepeye yaslı ve
kenardan kenara (`Gallery flush` / `!rounded-none`); `BackButton photo` varyantı — krem dolgulu
daire, fotoğraf üstünde zeminsiz glif okunmazdı (native `sand-50` gerekçesi); sabit koyu satın
alma çubuğu SÖKÜLDÜ — kontrol akışın karar bölgesine indi (boy/fiyat/teslimatın hemen altı, tam
genişlik `flow`); sepete giden yol `CartFab` (zeytin daire + terracotta rozet + krem halka, sağ
alt; sepet boşken ve ilk okuma bitmeden çizilmez — native kural). Ölü kod da gitti: `PurchaseBar
fixed`, `PurchaseBox/PlaceGate onDark`, `QtyStepper onDark` kademesi, `FunnelHeader watchId`.
`FunnelHeader` artık yalnız hero'lu sayfaların (huni, tarif, hesap) başlığı. Tarif detayı yedinci
turdaki hâlinde: orada kimlik metni gerçek ve bar boş kalmıyor.

**EK (aynı gün, dokuzuncu tur): mobil detay kahramanı KARE (1:1) — oran envanterden, kırpma
operatörün künyesinden.** Kullanıcı isteği: resim sisteminin incelenmesi + kahraman ölçüsünün
yeniden seçilmesi; ölçü ürün formunun belgelediği çerçevelerden seçilecekti. İnceleme sonucu:
sistem tek kaynak dosya + operatör odağı/zoom'u (`ImageCrop`, operasyondan ayarlanır) üstüne
kurulu ve müşteri yüzeyi kırpmayı ZATEN uyguluyor (`cropOf` → `FramedImage`) — eksik yalnız
orandı: 3:2 dar ekranda kısa bir bant kalıyor, native'in kahramanı ise tam genişlik × 400 dp ≈
**1:1**. 1:1 envanterde zaten var (sepet karesi) → yeni oran EKLENMEDİ. Mobil kahraman (ürün
galerisi kompakt dalı + paket görseli) `RATIO_SQUARE`; masaüstü 3:2 kartta kaldı. Operatörün
kırpma editörü gerçeği göstersin diye `IMAGE_ROLES` çerçeve listeleri güncellendi: nesne karesinin
görünürlük listesine "detay kahramanı (mobil)" eklendi, galeri fotoğrafı artık İKİ çerçevede
önizlenir (3:2 masaüstü · 1:1 mobil). Galerideki gömülü `3/2` sabiti de söküldü — oran artık
yalnız `packages/types`ten okunur (duplikasyon kuralı).

## Depo hazırlık: koli adı ALICININ adı (tasarım §6'dan dar sapma) — 21.08

`design/pages/depo-hazirlik.md §6` şunu diyor ve o kısmı **yürürlükte kalıyor**:

> *"Müşteri iletişim bilgisi ve adres görünmez — teslimat kuryenin işidir; depocuya yalnız ad
> (koli eşleştirme) yeter"*

Sapma yalnız **hangi ad** sorusunda: ekran hesap sahibinin adını gösteriyordu, artık adresin
alıcısını da gösteriyor (`Koliye: <ad>`) — ve **yalnız ikisi farklıysa**.

**Gerekçe kullanıcının sorusundan doğdu** (*"posta ile gönderilen kargoların üzerinde isim soyisim
yazması gerekmiyor mu?"*): gerekiyor. Dört taşıyıcının (Colissimo · Chronopost · DHL · UPS) hiçbiri
adsız künye üretmiyor ve teslim noktasında kimlik künyedeki adla karşılaştırılıyor; ad tutmazsa
paket teslim edilmez, iade döner. Tasarımın adı istemesinin sebebi zaten *"koli etiketleme"* —
etikete yanlış ad yazmak o amacın kendisini boşa düşürüyordu. Yani bu, ekrana yeni bir bilgi
eklemek değil, var olan alanın kendi amacına doğru adı taşımak.

**Sınır korundu:** adres YOK, telefon YOK. Sapma tek satır ve yalnız ad.

**Kapsam kullanıcı kararı (21.08):** her kulvarda — rota ve kargo ayırt edilmiyor. Dar seçenek
(yalnız kargo kulvarı) sunuldu, kullanıcı geniş olanı seçti: kapıda teslimde de zile basılan ad
adresinkidir, kolinin üstündeki adın kulvara göre değişmesi depocuya iki kural öğretirdi.

Aynı adı sipariş detayının teslimat kartı da gösteriyor (`Alıcı` + `Adres tel.`) — orası tasarımın
kendi kapsamında (`admin-siparisler.md`: *"adres — sipariş anındaki kopyası"*), sapma değil.

**Mobil Depo ekranı (D1) bu satırı HENÜZ çizmiyor:** alan paylaşılan kapıda
(`PreparationOrder.recipientName`), benimsemesi native şeridin işi — not `docs/talep/`te.

## Sosyal mesajlar ve yardım şeridi — üç madde tasarım borcu OLMAKTAN ÇIKTI — 23.08

**Kullanıcı kararı (23.08):** *"Biz bazen tasarımdaki yapıyı başlangıç olarak kabul edip üzerine
bazı değişiklikler yapıyoruz. Nitekim sosyal mesajlar konusu da bu şekilde oldu… Eğer yaptığın
kısımların bir de Claude Design tarafından yapılmasını istiyorsan gerek yok."*

Bu, `design/BACKLOG.md`de kısa süre açık kalan **"Claude Design'dan istenenler"** bölümünü kapattı.
Ders açık: yapılmış ve çalışan bir ekranın çizimini sonradan istemek, tasarım borcu değil **tekrar**
üretmektir. Aşağıdaki üç madde bu yüzden BACKLOG'dan çıkarıldı.

### 1. Sosyal gelen kutusunun üç kanallı çizimi — İSTENMİYOR

Ekran çalışıyor ve mevcut WhatsApp çiziminin kanal-eksenli genişlemesi olarak, kit desenleriyle
kuruldu. Yeniden çizdirmek bugünkü ekranı yeniden üretmek olurdu.

**Değeri olan iş yapıldı ve o ayrı:** tasarım GİRDİSİ (`design/pages/admin-sosyal.md`) 23.08'de
gerçeğe çekildi — Messenger ve Instagram o dosyada hiç geçmiyordu (ölçüldü: sıfır geçiş). Girdi
bayat kalırsa **sonraki** iş yanlış zeminden başlar; asıl risk oydu, çizimin yokluğu değil.

### 2. Sosyal kanal marka renkleri — ENVANTER KARARI DEĞİL, OLGU

`--color-brand-messenger: #0084ff` ve `--color-brand-instagram: #e1306c` kodlandı
(`--color-brand-whatsapp` emsali — marka rengi temayla dönmez). Bunlar **kanalların kanonik
renkleri**, yani tasarımın seçeceği bir şey değil: Messenger'ın mavisi Messenger'ın malı.

`CLAUDE §3`'ün kuralı (*"ham hex yasak, token'dan gelir"*) zaten sağlandı — ham hex yok, token var.
Envantere yazılması bir defter işi; Claude Design'ın vereceği bir karar yok.

### 3. "Elle talep aç" penceresi — ÇİZİMSİZ YAZILDI, KAPANDI

Pencere brief'ten türetilip ekranın mevcut form kitiyle kuruldu (`manual-ticket-dialog.tsx`,
03.08): müşteri (uzak arama) · tip (`MultiToggle`) · bağlı sipariş · başlık · anlatım. Çalışıyor.
Çizim ileride gelirse birebir uygulanır — ama **beklenen bir borç değil**.

### 4. Yardım şeridinin WhatsApp düğmesi — mobilde de var artık (KAPANDI)

`!compact` kararı çizimindi ama düğme **ÖLÜYKEN** verilmişti (`disabled` + "· yakında"). 15.3
düğmeyi canlandırınca gerilim tersine döndü: **WhatsApp'ın doğal cihazı telefondur**, yani düğmenin
en değerli olduğu yer mobil ve tam orada yoktu.

**Çözüm (23.08): dar ekranda ŞERİDİN TAMAMI tıklanabilir.** Düğme ikinci satıra alınmadı — o, dar
ekranda çizimde olmayan bir yerleşim kurmak olurdu (`CLAUDE §3`). Bu seçenek yeni bir düzen icat
etmiyor: kutu, boşluklar ve tipografi aynen kalıyor, değişen tek şey sarmalayıcı öğe.

**Dokunma hedefi görünmez bırakılmadı:** dar ekranda eylemin adı (`help.cta`) bağlantı renginde bir
satır olarak duruyor. Görünmez bir dokunma hedefi, olmayan bir düğmeden kötüdür — müşteri
dokunulabileceğini bilmez, dokunanlar da kazara dokunur.

---

## Kampanya rozeti — HAP köşe evet, RENK yükseltmesi HAYIR (23.08, native müşteri kartı)

Kullanıcı kategori/koleksiyon kampanyalarının kartlarda görünmesini isterken şunu söyledi:
*"Oradaki gösterme tipi biraz daha görsel yapabiliriz belki rozet koyarız falan yuvarlak biraz daha
dikkat çekici bir şey yapabiliriz; bir de ne olduğu anlaşılmıyor, metinlerin arasında kayboluyor."*

**Şikâyetin ölçümü (21.100):** kampanya kartta hiç yoktu — katalogda kesitin başındaki not
şeridinde, vitrinde koleksiyon bandının ADET satırına eklenmiş bir metin parçasıydı. Yani
"kayboluyor" birebir doğruydu ve asıl kazanç, ifadeyi **metinden rozete taşımak** oldu.

**YAPILAN:** `ProductCircleCard`ın durum rozeti hap köşeye alındı (`Tag shape="pill"` →
`radius.pill`, resmî setin "hap düğme, çip, sayaç" kademesi). Kullanıcının söylediği "yuvarlak"
budur ve yeni bir değer icat etmiyor. `Tag`e eklenen `shape` propunun varsayılanı `badge`, yani
öteki ~18 kullanım aynen kaldı — kademeyi komponentin tamamına dayatmak, tasarımın dört kademeli
kararını üçe indirirdi.

**YAPILMAYAN ve GEREKÇESİ — ton `cream` kaldı.** "Daha dikkat çekici" için akla ilk gelen şey
rozeti terracotta'ya çekmekti; ölçüm bunu çürüttü: **daire kartta terracotta zaten FİYAT çipinin
rengidir** (`product-circle-card` alt köşe). İndirimi de terracotta yapmak, satın alma kararının
birincil vurgusunu ikiye böler ve iki çip aynı kartta birbiriyle yarışır.

Tasarım dili bu noktada tutarsız DEĞİL, sadece kart tipine göre değişiyor: **fırsat şeridinde**
indirim çipi terracotta'dır çünkü orada fiyat düz metindir (`home-screen` fırsat kartı); **daire
kartta** terracotta fiyata aittir ve fotoğraf üstündeki ikincil rozetin tonu `cream`dir. İkisi de
kendi bağlamında doğru.

Öteki tonlar da elenmiş durumda: `ink` bu yuvada **"Tükendi"** demektir (aynı yuva, karşılıklı
dışlayan iki hâl) — indirime vermek anlam çakışması olurdu; `sand` zaten yumuşak vurgudur, "dikkat
çekici" isteğini karşılamaz.

**Sonuç:** rozetin RENK kademesinin yükseltilmesi (yeni bir vurgu tonu ya da mevcut hiyerarşinin
yeniden kurulması) bir TASARIM kararıdır, kod tarafında uydurulmadı — `CLAUDE §3`. Karar gerekirse
Claude Design'dan gelir; veri yolu ve üç kuralı (rozet nerede çizilir · Fırsat kampanyayı yener ·
eşikli kampanya rozete girmez) hazır durduğu için o gün **yalnız stil** değişir.

## Hazırlık kâğıdı bir İŞ EMRİ — elle doldurulan sütunlar kalktı, QR geldi (25.08, kullanıcı kararı)

**Tasarım (`Belge - Hazirlik Kagidi.dc.html`) kâğıdı DOLDURULMAK üzere çiziyor:** tabloda *"Kondu /
eksik"* sütunu, altında *"Not / eksik açıklaması"* kutusu ve *"Hazırlayan · saat"* satırı var;
kapanış cümlesi de *"İşaretledikten sonra ekrana geçin"* diyor. Kâğıt ilk hâlinde birebir böyle
yazıldı (10.1, 25.08).

**Kullanıcı aynı gün asıl soruyu sordu:** *"Bu kağıt depoda basılacak. Belki depoda basılmasına
gerek yok… ya o hazırlık kağıdı üzerinde bir QR kod olacak ve alakalı kısmı açacak, ya da depocu
elindeki cihaza göre kutuyu hazırlayacak."*

**ÖLÇÜM — o sütunlar bugün ÖLÜ.** Depocu raf karşısında telefonla çalışıyor: mobil D1 hazırlık
ekranı ve kutu döngüsü (`23.6`) orada — kutu aç → kalem okut → kutu kapat; kapanışta etiket
basılıyor ve o etiket içerik dökümünü zaten taşıyor (`BoxLabel.items`). Yani depocu kâğıda kalem
değdirmiyor ve değdirmesi de istenmiyor.

**Sebep tarihseldi, bir çelişki değil:** tasarım 08.08'de yazıldı, kutu döngüsü yirmi gün sonra
geldi ve toplamayı telefona taşıdı; belge tasarımı güncellenmedi. Kod tasarıma sadık kalınca
çelişki kâğıda basıldı.

**KARAR — kâğıt doldurulmaz, OKUTULUR.** Elle doldurma alanlarının üçü de kaldırıldı; yerine sağ
üstte iri bir QR (içeriği sipariş referansı) ve üç adımlık bir talimat kondu: *al → okut → telefondan
yürüt*. Doldurulmayacak bir boşluk, kâğıdı okuyan kişiye yapılmamış bir iş varmış gibi görünür.

**Kâğıdın gerçek işi FİZİKSEL KUYRUK olmak:** masada duran kâğıt = yapılacak iş, alınan kâğıt =
üstlenilmiş iş. İki depocu aynı siparişi toplamaz ve *"bugün ne var"* sorusu bakışta cevaplanır —
yazılımın kuyruğu bunu ancak ekran açılınca söyler. QR o kâğıdı telefona bağlayan köprüdür.

**QR'ın içeriği REFERANS NUMARASI, kutu kodu gibi gizli bir dize DEĞİL** ve ayrım kasıtlı: kutu
QR'ı (`KT-…`) okutulunca teslim kaydı düşüyor, yani bir YETKİ taşıyor ve tahmin edilemez olmak
zorunda. Bu QR hiçbir şey yazmıyor — yalnız *"şu siparişi aç"* diyor, kapsam kontrolü zaten
sunucuda. Referans olması ayrıca doğru: kâğıdın üstünde iri harflerle yazılı, yani QR okunmazsa
(buruşmuş kâğıt, kirli kamera) depocu aynı işi elle arayarak yapar — okunmayan bir QR çıkmaz sokak
olmamalı.

**ELENEN seçenek — "önce topla, sonra kâğıt otomatik çıksın":** kutu etiketi *"ne hazırlandı"*
sorusunu zaten cevaplıyor; ikinci bir belge aynı gerçeğin ikinci nüshası olurdu (`CLAUDE §1`).

## Müşteri yüzeyinde WEB PUSH YOK — bildirim kanalı üçlüsü kilitli (26.08, kullanıcı onayı)

Bildirim modülünün kanal kararı: **mobil push → e-posta → (son çare, ücretli) WhatsApp şablonu.**
Web tarayıcı push'u bu listede YOK ve eklenmeyecek; web'de "bildirim" = hesap sayfasındaki zil +
liste (14.15).

**Gerekçe teknik ve kapanmış:** aynı fiziksel telefonda tarayıcı aboneliği ile uygulama jetonu
birbirinden AYIRT EDİLEMEZ — kullanıcının kendisinin tarif ettiği çift-bildirim senaryosu tam
buradan doğar (web'den sipariş vermiş, sonra uygulamayı kurmuş müşteri). Tek güvenilir ayırt etme
sinyali cihaz jetonunun kendisidir: jeton varsa push, yoksa e-posta. İkinci gerekçe platform
gerçeği: iOS'ta web push ancak PWA kurulumuyla çalışıyor — güvenilmez bir kanala çift-bildirim
riski alınmaz.

**Karar kapıyı KİLİTLEMİYOR:** bir gün açılırsa `push_device.platform`a `web` değeri ve
`packages/notify`a bir sürücü eklemek yeter — veri modeli buna engel değil. Ama o gün çift-bildirim
sorusunun yeni bir cevabı bulunmak zorunda; bugünkü cevap "o kapıyı açmamak"tır.

**Bir sınıf ayrımı da bu kararla birlikte kilitlendi:** HABER (ping) tek kanaldan gider — aynı
haberi iki kez almak gürültüdür; BELGE (sipariş onayı, iade — dayanıklı ortam yükümlülüğü) e-postaya
HER ZAMAN gider, push eklendiğinde İLAVE olur, yerine geçmez. Sınıf bilgisi tek yerde:
`NOTIFY_EVENT_META` (`packages/notify`).

## Web bildirim yüzeyi: zil hesap ALANININ öğesi, "notifications" kelimesi AKIŞIN (26.08, 14.15)

Bu ekranların `.dc.html`i yok — modül tasarım turundan sonra doğdu; görsel dil mevcut envanterden
kuruldu (improvise yok, kelime dağarcığı var): müşteri zili `CartBadge`in birebir kuralları
(emoji ikon + terracotta sayaç; **ilk okuma bitmeden rozet çizilmez** — 0 göstermek "bildiriminiz
yok" derdi, oysa henüz ölçülmedi), akış sayfası puan geçmişinin liste kalıbı; operasyon zili başlık
barının kabuk bloğunda `CONTROL_SQUARE` kare kontrol + `AnchoredMenu` paneli.

**Yerleşim kararı:** müşteri zili hesap alanının HER ekranında (SiteFrame hesap başlığı — masaüstü
sağ blok, mobil web FunnelHeader sağ yuvası). Vitrin başlığına KONMADI: bildirim girişli bir hesap
nesnesidir, alışveriş akışının değil. Operasyonda zil ⌘K ile avatar arasında — kabuk oturumundur,
sayfanın değil (09.19 kuralı).

**Panelin açılışı "gördüm" beyanıdır** (native kabuğun aynı kararı): rozet söner, satırlar listede
kalır — akış gelen kutusu değildir. Müşteri tarafında ise okundu/gizle İYİMSER ve **geri almalı**:
düşen isteğin ardından ekranda "okundu" duran satır, rozetin öteki cihazda yalan söylemesi olurdu.

**Rota taşıma (greenfield):** `/account/notifications` 22.08'den beri TERCİH sayfasınındı; müşteri
zile basınca bildirimlerini bekler, ayar anahtarlarını değil — kelime akışa verildi
(fr `/compte/notifications` · de `/konto/benachrichtigungen` · tr `/hesap/bildirimler`), tercihler
`/account/preferences`a taşındı (fr `/compte/preferences` · de `/konto/einstellungen` · tr eskisi).
Mail altbilgisinin "tercihlerinizi yönetin" bağı üreticiden okunuyor (`notificationPreferencesUrl`)
ve taşımayla birlikte güncellendi; canlıya çıkmış mail olmadığı için kırılan bağ yok — bu pencere
bir daha açılmayacak, karar o yüzden bugün verildi.

## Bildirim satırı TÜRÜNÜ giyer; müşteri ile personel akışı ayrışır (27.08, kullanıcı kararı)

Cihaz turunun bulgusu iki katmanlıydı ve ikisi de düzeltildi:

**1. Karma profil sızıntısı.** Dev hesabı (hem müşteri hem yönetici) müşteri akışında 120 personel
satırını "Hesabınızla ilgili bir gelişme var." genel cümlesiyle görüyordu — kullanıcıya hiçbir şey
söylemeyen tek tip bir liste. Karar: **kitle (audience) beyanı zorunlu** — müşteri yüzeyi personel
türünü görmez ve saymaz; operasyon yüzeyi yalnız onları görür; "tümünü okundu say" öteki kitlenin
rozetini söndürmez. Küme `STAFF_NOTIFICATION_KINDS` (saklama süpürmesiyle aynı liste, aynı kural).

**2. Satır tek tip metin olmaz.** "Kullanıcı baktığında bir bakışta tipi anlamalı": her türün
İKONU, TONU ve kısa TÜR ETİKETİ var (`notificationVisual` — cümlelerle aynı paylaşılan sözlük).
Müşteri satırı: renkli ikon dairesi (emoji — yüzeyin yerleşik ikon dili) + renkli tür şapkası +
cümle; ton aileleri sipariş durum haplarıyla aynı anlamda (olive=yolunda · honey=bekleyen ·
terracotta=sorun · kum=nötr). Operasyon satırı: tür şapkası hap (kırmızı/amber/nötr) + Türkçe
başlık — emoji YOK (ops SVG dili). Bilinmeyen tür 🔔/nötr "Bildirim" ile çizilir, kaybolmaz.

**Operasyon türleri dörde çıktı (kullanıcı seçimi, dördü de):** yeni şikâyet/talep · stok eşik
altı ("ilk iniş" dedupe'u — süregelen hâli tedarik ekranının listesi taşır) · gün kapanışı
uyuşmazlığı · B2B başvuru. "Bildirim ≠ kuyruk" ilkesi korunarak: kuyruğun kendisi değil, kuyruğa
düşme ÂNI haberdir; üreticiler sessiz-künyeli (zil, taşıdığı işin kaydından önemli değildir).

**Skeleton kuralı bildirimde de geçerli:** ilk yük boş hâlle KARIŞMAZ — web akışı rota
`loading.tsx`, ops paneli iskelet, mobil ops ActivityIndicator (hub deseni), mobil müşteri
iskeleti yeni satır anatomisiyle. "Açılırken bekliyor gibi" hâli tasarım hatasıydı, kapandı.
