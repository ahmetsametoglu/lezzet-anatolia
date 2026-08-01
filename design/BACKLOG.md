# Tasarım Backlog'u — Çizilmiş Ama Kodlanamayan

Bu dosya **tasarımda kararı verilmiş ama koda geçemeyen** işleri tutar. Üç sorunun cevabı burada:
neyi bilerek yapmadık, neyi neden bekliyoruz, neyi tasarımdan saparak yaptık.

> **Rol ayrımı.** Kapsam (ne yapılacak) → `docs/architecture/BACKLOG.md`. İlerleme (nerede kaldık)
> → `docs/build/NN-*.md` görev satırı. Burası ikisi de değil: **tasarım ile kod arasındaki açığın**
> envanteri. Bir madde kapandığında buradan silinir, izi ilgili `docs/build` Durum notunda kalır.
>
> **Neden ayrı dosya:** bu açıklar kod içi `STUB(...)` yorumlarında dağınık duruyordu. Yorum, o
> dosyayı açanı uyarır; ama "müşteri yüzeyinde neler eksik" sorusunun tek bir cevabı olmalı — yoksa
> soru her sorulduğunda `grep` ile yeniden derleniyor ve her seferinde bir madde atlanıyor.

---

## 1. Tasarımı hazır, başka modül bekliyor

Bu maddelerde **kodlanacak bir şey yok** — arayüz tamam, arkasındaki model yok. Bekleyen iş gelince
değişecek yer parantezde.

| Ne | Tasarım | Bekleyen |
| --- | --- | --- |
| **Sepet teslimat satırı** ("Teslimat: Ücretsiz" / "6,90 €") | çizili, **kodlanmadı** | ücret teslimat türüne, tür ADRESE bağlı → checkout adres adımı. Ücretsiz kargo ilerleme çubuğu bundan AYRI ve yapıldı (eşik `Setting`'ten, ilerleme ara toplamdan) |
| **"Checkout'a geç" düğmesi** — girişli müşteri doğrudan, ziyaretçi önce hızlı doğrulamaya | çizili, tam görünür ve pasif | **ENGEL KALKTI (28.07):** `07.4`/`07.5` indi. Kapı hazır — `lib/order/checkout-session.ts` `createCheckoutSession` (rezervasyon → Stripe oturumu, TTL'li), webhook `api/webhooks/stripe`. Kalan iş yüzeyin: düğmeyi kapıya bağlamak + ziyaretçi doğrulama adımı |
| **Hediye kartı / hediye çeki** (bakiye taşıyan) | **tasarımda YOK, şemada YOK, kapsamda YOK** | kavramın kendisi kararlaştırılmadı. `order.is_gift_order` var ama o "siparişi hediye olarak gönder"dir — bakiye taşıyan bir enstrüman değil. İstenirse önce `architecture/BACKLOG` kapsamına girer (kupon `§15`'ten AYRI: kupon indirimdir, hediye kartı ön ödemedir ve muhasebede borç olarak durur) |
| **"Fiyat değişti" bildirimi** — `DOMAIN §5`: fiyat arttıysa müşteriye açıkça söylenir ve onay istenir (kabul et / çıkar); düştüyse sessizce uygulanır | tasarımda yok (yalnız stok uyarısı çizili) | `CartItem.unitPrice` okuma tarafına bağlanmalı — alan yazılıyor, karşılaştırılmıyor |
| ~~**Boş sepet: "Bu hafta çok sevilenler"**~~ — **KAPANDI (29.07, kullanıcı kararı)** | `Musteri - Sepet.dc.html` → `Bos Sepet Web/Mobil` | Izgara indi (web 4'lü · mobil 2'li), kaynağı anasayfayla PAYLAŞILAN `readShowcase`. Gerekçe aşağıda §1b — **karar değişti** |
| **Boş sepet: B2B sipariş şablonları** ("Haftalık standart · 14 kalem" + "Yükle") | aynı tasarım, durum kartı | şablon modeli yok (`07`); B2B müşteri bugün "son siparişi tekrarla" + vitrin seçkisi görür. Kod işareti: `BEKLEYEN(BACKLOG §2)` → aşağıdaki karar maddesi |
| **Boş sepet kahraman görseli** (hasır sepet / tezgâh fotoğrafı, web 260×200 · mobil 180×140) | çizili | görsel künyesi yok; çerçeve tam boyutuyla duruyor, yer tutucu sepet işareti |
| **Paketler kahraman görseli** (3:2, "kurulmuş sofra, birkaç paket bir arada") | çizili; çerçeve tam ölçüsüyle duruyor | görsel künyesi yok — paket sayfasının kendi kahramanı için ayrı bir varlık gerekiyor |
| **Paketler listesi: etiket çipleri + `?etiket=` süzgeci** | çizili; sayfanın kendisi indi (kartlar, "Daha fazla", boş durum) | paketin etiket alanı yok — süzgeç uydurma bir sınıflandırma olurdu |
| **Tüm Yorumlar paneli** (web modal · mobil tam ekran, yıldız süzgeci, 10'ar sayfalama, `?yorumlar=1`) | `Musteri - Urun Detay.dc.html` → `Tum Yorumlar Web/Mobil` | `17-geri-bildirim` |
| **Bölge haberi tetikleyicisi** — bölge genişleyince bekleyenlere TEK e-posta | `zone_notice` kaydı alınıyor, ekran "not aldık" diyor (söz vermiyor) | bölge kaydedilince kontrol eden iş + gönderim (`14-bildirim`) |
| **Hesap sayfasında "sonraya kaydedilenler" + bölge haberi kartı** | çizili (`Musteri - Hesap.dc.html`) | hesap sayfası (`04-auth`); veri hazır (`cart.saved_items`, `zone_notice`) |
| **Operasyon → Analitik "bölge dışı talep" listesi** | tasarımda anıldı | `postal_code_demand` doluyor; ekran operasyon yüzeyinin işi |
| **Menü: Fırsatlar · Keşif · Professionnels** | K12'de çizili, bugün düz metin (Paketler bağlandı) | kendi sayfaları (`08.7`) |
| **Menü: Hesabım** | K12'de tanımlı | `04-auth` |

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

Panelin kendisi (`?yorumlar=1` modal/tam ekran) hâlâ açık — yukarıdaki tabloda duruyor ve kodda
`BEKLEYEN(BACKLOG §1)` ile işaretli.

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
farklı "seçki" göstermiyor; ölçüt geldiğinde (`BEKLEYEN(08.9)`) yalnız o fonksiyonun sıralaması
değişiyor, iki ekran da onu izliyor.

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

## 2. Karar bekleyen (tasarım tarafında netleşmeli)

- [ ] **B2B sipariş şablonu diye bir varlık var mı** — tasarım boş sepette B2B'ye vitrin seçkisi
      yerine şablon listesi gösteriyor ("Haftalık standart · 14 kalem" + "Yükle"). Böyle bir veri
      modeli yok ve şablonun ne olduğu kararlaştırılmadı: müşterinin kaydettiği bir sepet mi
      (`cart.saved_items`'ın adlandırılmış çoğulu), operatörün kurduğu bir liste mi, yoksa "son N
      siparişten türetilen" bir şey mi? Üçü farklı şema demek. Karar verilene kadar B2B müşteri
      B2C'nin bloklarını görüyor — müşteri tipi bu yüzden hiç okunmuyor
      (`lib/cart/empty-cart.ts`, `BEKLEYEN(BACKLOG §2)`).
- [ ] **Koleksiyonlar bandı** — `pages/musteri-anasayfa.md` içerik envanterinde var,
      `Musteri - Anasayfa.dc.html` tasarımında **yok**. İmprovize edilmedi. Ya tasarıma bant eklenir
      ya envanterden düşülür.
- [ ] **Katalogun "koleksiyon görünümü" varyantı** — `Musteri - Katalog.dc.html`'de üstbaşlıklı
      başlık bandıyla çizili, ama koleksiyon rotası yok. Rota açılınca yalnız başlık bloğu değişir.
- [ ] **Paketler listesinin içerik envanteri** — tasarımı var (`Musteri - Paketler.dc.html`) ama
      `pages/musteri-paketler.md` **yok**. Diğer 15 müşteri sayfasının hepsinde ikisi de var; bu
      sayfa envantersiz kaldı, "hangi bilgi neden" yazılı değil.
- [x] **Otomatik kampanyanın müşteriye görünen ADI** — *kapandı 29.07 (`build/05-katalog.md` 05.13).*
      Tanıma çok dilli bir vitrin adı eklendi (`discount.public_label`, jsonb) ve sipariş onun sipariş
      anındaki kopyasını tutuyor (`order.discount_label`). Karar: **başlık, cümle değil** — metin para
      satırının etiketi, uzun duyuru cümlesi orayı taşırır. Ad verilmemişse yüzey eski davranışına
      düşüyor (kuponda kod, kampanyada tür). Operasyon kupon formunda dil sekmeli alan var.
      **Tasarımda otomatik kampanya hâli hâlâ çizilmemiş** — kod hazır, çizim gelince yalnız yerleşim değişir.
- [ ] **Hata sayfası başlık ölçüleri** — `message-screen.tsx` üç ham kademe taşımaya devam ediyor
      (emoji 42 · başlık 40/27 px); bunlar envanter §0.4 ölçeğinde yok. Kademe eklemek mi yuvarlamak
      mı — hata sayfası tasarımının ayrı ele alınmasını gerektiriyor. **Dosyanın kalanı token'landı**
      (üstbaşlık → `text-eyebrow`), yalnız bu üç değer kaldı.

---

## 3. Bilinçli sapmalar (kapanmış — yeniden tartışılmasın)

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

## 4. Tasarımı olmayan yüzeyler

Müşteri evreninin 15 sayfasının hepsinde hem içerik envanteri hem görsel karar var (üstteki
Paketler istisnası dışında). Operasyon, depo ve kurye yüzeylerinin **sayfa** tasarımları da mevcut;
onların kod tarafındaki açıkları kendi `docs/build` dosyalarında izlenir, burada tekrarlanmaz.

**Yeni sayfa — Sistem (sağlık + hatalar), 29.07.** `pages/admin-sistem.md` yazıldı, **görsel kararı
(`.dc.html`) yok** — Claude Design'a verilecek. Diğer 38 sayfa gibi tasarımdan doğmadı, ihtiyaçtan
doğdu (bkz. `build/18-operasyon-guvenlik.md` 18.5): e-posta alarmı bilinçli olarak kaldırıldığı için
bu ekran **alarmın yerini tutmak zorunda** — "kötü durum, bakmayan gözü yakalasın" gereksinimi
görsel kararın merkezinde durmalı. Envanterde bu yükümlülük yazılı; kodlamadan önce çizim gelmeli
(`CLAUDE.md §3`: implement ederken improvise edilmez).

**İstisna — operasyonun diyalog formları.** `.dc.html` dosyaları sayfaları çiziyor; form
diyaloglarının (ürün · katalog · paket) görsel kararı çizilmedi ve bilinçli olarak **bize** bırakıldı
(kullanıcı kararı, 28.07: "operasyon tarafında özellikle diyalog formlarında kendi custom
tasarımlarımızı yapıyoruz — bunlar sapma değil, bilinçli tercih"). Bu yüzden aşağıdaki §5 bir
"sapma" listesi değil, **yazılmış kararlar** listesidir: sapılacak bir tasarım yok.

**Çok depo tasarım paketi — 01.08 (`build/19`).** Karar seti `DOMAIN §17`'de; çizim yok, ilgili
görevler (19.5–19.7) kodlanmadan önce Claude Design'a verilecek: (a) **posta kodu daveti deseni** —
zorunlu değil, ısrarlı-nazik; anasayfa + katalog girişi + soğuk zincir ürün detayında "ne itecek ne
gözden kaçacak" bir yerleşim; (b) **koşullu ülke seçici** — yalnız aktif bölge/depoların ülke kümesi
1'i aşınca görünür, site dili ön-seçim ipucu; (c) **"kargoyla gönderilir" işareti** + sepette kargo
grubu + "kargolu ürünleri ayrıca sipariş ver" iki-checkout akışı (yolu stok belirler, müşteri
seçmez); (d) **operasyon: Depolar + Transfer ekranları** ve stok/sipariş ekranlarına depo süzgeci
(operasyon evreni envanteriyle). Davranış sözleşmeleri yazıldı (01.08): (a)-(c) müşteri tarafı →
`pages/musteri-yer-ekseni.md` (yer ekseni: kalemin dört hâli, iki-checkout, koşullu ülke seçici,
davet deseni); (d) operasyon tarafı → `pages/operasyon-depo-ekseni.md` (iki katmanlı bağlam+süzgeç
deseni). İki doküman birlikte paketin sözleşmesidir; Claude Design'a birlikte verilir.

---

## 5. Operasyon evreni — yazılmış kararlar (yeniden tartışılmasın)

Diyalog formlarında ve onların beslediği liste satırlarında verilmiş kararlar. Mekanik bir denetim
(ör. ölçü/token turu) bunları "tasarıma çekilecek sapma" sanıp geri almasın: geri çekilecek bir
tasarım yok, gerekçe burada yazılı. İtiraz gelirse madde §2'ye taşınır.

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

### Palete kurşuni ton eklendi (28.07)

`slate` (#5a6472 / #eceff3, karanlıkta ters çevrilmiş) — **ölçüm/nötr kayıt** anlamı için. İmha
geçmişindeki "Sayım farkı" tasarımda bu renkte; palette karşılığı yoktu ve mavi kullanılıyordu, oysa
mavi bizde "onay/aday" demek ve sayım farkına yanlış anlam yüklüyordu. `OpsTone` kapalı liste olduğu
için derleyici üç tüketiciyi de yakaladı (Badge · MultiToggle · dağılım çipi).

Rozetin dolgusu ve yarıçapı da tasarımın değerlerine çekildi (3×9 · r7); önce 2×8 · r6 idi.

### Açık kademeler (envanter kararı bekliyor)

Operasyon envanteri (§0) yalnız renk, yarıçap ve font ailesi veriyor; **ölçü kademesi yok.** Bunlar
uydurulmadı, envantere yazılması bekleniyor:

- ~~Yazı ölçeği~~ → **KARARA BAĞLANDI (28.07), aşağıda.**
- **Küçük (iç) yarıçap.** Kart 8 · diyalog/çip 14 token'ları var; iç öğeler (tablo satırındaki 3:2
  görsel 7 · küçük görsel 5 · anahtar dilimi 6) hiçbirine oturmuyor. Bir "iç öğe" kademesi (≈6 px)
  gerekiyor; o gelene kadar bu on yer ham kaldı.
- **Kontrol yarıçapı.** Girdi kutuları (`field-shell`) kart token'ına bağlandı; ayrı bir kademe
  isteniyorsa envanterde belirtilmeli.
