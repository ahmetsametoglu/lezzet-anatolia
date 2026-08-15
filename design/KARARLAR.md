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

Çözüm `available_stock` desenindedir: `product_listing` okuma görünümü (`0043`) seçimi SQL'de çözer,
sıralama ve keyset imleci onun üstünde çalışır. Görünüm motorun (`resolvePrice`) **ziyaretçi dalını**
SQL'de yeniden ifade eder; bu bilinçli bir ödünleşmedir ve ayrışma riski yorumla değil **testle**
tutulur (`catalog-sort.test.ts`: teklif kazanır / kaybeder / eşittir / partisi boştur hâllerinde
sıralamanın kullandığı fiyat ile kartta yazan fiyat karşılaştırılır).

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
