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
| ~~**Tüm Yorumlar paneli**~~ — **KAPANDI (04.08)** | `Musteri - Urun Detay.dc.html` → `Tum Yorumlar Web/Mobil` | indi: `build/08` 08.11 |
| **Bölge haberi tetikleyicisi** — bölge genişleyince bekleyenlere TEK e-posta | `zone_notice` kaydı alınıyor, ekran "not aldık" diyor (söz vermiyor) | bölge kaydedilince kontrol eden iş + gönderim (`14-bildirim`) |
| **Hesap sayfasında "sonraya kaydedilenler" + bölge haberi kartı** | çizili (`Musteri - Hesap.dc.html`) | hesap sayfası (`04-auth`); veri hazır (`cart.saved_items`, `zone_notice`) |
| **Operasyon → Analitik "bölge dışı talep" listesi** | tasarımda anıldı | `postal_code_demand` doluyor; ekran operasyon yüzeyinin işi |
| **Ayarlar → "Vitrin görselleri" sekmesi** (ürüne ait OLMAYAN sayfa görselleri: ana sayfa hero, fırsat bandı, Professionnels hero, Hakkımızda; ayrıca "statik" işaretli iki kalem) | `Operasyon - Ayarlar.dc.html` → 7. sekme, tam çizili | **İKİ ŞERİT birden:** (1) *arka uç* — `site_image` tablosu + depolama kovası yok; ürün görselinin yolu (`product-image.service`) burada kullanılamaz, çünkü bunlar bir varlığa değil bir SAYFA YERİNE bağlı. (2) *müşteri şeridi* — hangi slot'un gerçekten var olduğu ve hangisinin koda gömülü kaldığı (marka sahnesi, hata çizimi) o yüzeyin bilgisi; liste onlardan mutabakatla gelir. Operasyon şeridi sekmeyi ancak ikisi netleşince çizer — bugün çizmek, arkasında hiçbir şey olmayan bir yükleme alanı göstermek olurdu (`09.16` AÇIK 2) |
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

## 2. Karar bekleyen (tasarım tarafında netleşmeli)

- **"BUNLARI DA SEVEBİLİRSİNİZ" — SIRALAMA ÖLÇÜTÜ ERTELENDİ (kullanıcı kararı 04.08).**
  Bölümün *hangi ürünleri* alacağı çözüldü (kendi ailesi dışarıda, öteki ailelerden birer üye —
  `lib/storefront/similar.ts`). Çözülmeyen, **hangi sırayla** alacağı: bugün katalog sırası, o da
  alfabetik. Yani ölçüt yok, alfabe var.
  **Kullanıcının istediği ilgiye göre seçim, mümkün değilse rastgele.** Veri ikisi için de hazır:
  `product_rating` (puan + yorum sayısı) ve `analytics_daily_product` (görüntüleme, sepete atma);
  arka uç kapıyı açmayı teklif etti.
  **Yine de ERTELENDİ ve gerekçesi ölçütün kendisinde:** *"en çok bakılan"* ya da *"en çok
  beğenilen"* tek başına alınırsa **hep aynı ürünler çıkar** — bölüm bir keşif daveti olmaktan
  çıkıp sabit bir vitrine döner, ve popüler olan daha da popüler olur (kendi kendini besleyen
  döngü). Tek eksenli bir ölçüt, ölçütsüzlükten daha iyi değil.
  **İleride düşünülen kurgu — dört kart, dört FARKLI eksen:** biri en çok beğenilenlerden, biri en
  sık satın alınanlardan, biri yenilerden, biri (ör.) rastgele/keşif. Böylece bölüm her kartıyla
  başka bir soruya cevap verir ve doğal olarak çeşitlenir. Bu bir tasarım işi: kartların ekseni
  müşteriye söylenecek mi (*"Yeni"*, *"Çok beğenilen"* rozeti gibi) yoksa sessiz mi kalacak?
  **Bugünkü davranış bozuk DEĞİL, yalnız ölçütsüz** — o yüzden `BEKLEYEN` işareti konmadı: söz
  verilmiş bir iş değil, ileride yapılabilecek bir iyileştirme.

- **FORM KİTİNE `size` EKSENİ — üç ham girdi bunu bekliyor (02.08, denetim M5).**
  `controlClass` bugün **tek ölçü** biliyor: sabit `h-12` (48px) + `text-body` (15px) + `FieldShell`
  etiket/hata iskeleti. Envanterin K34'ü de böyle çiziyor ve doğru — **gerçek form alanı** için.
  Ama üç yerde form alanı değil, **satır içi kontrol** var ve üçü de kiti kullanamadığı için
  kenarını, odak halkasını ve a11y kablosunu elle yazıyor:
  · `cart/components/cart-coupon.tsx` — `size="sm"` düğmeyle yan yana duran kod alanı (dar, kalın,
    büyük harf; 48px satırın hizasını bozar)
  · `product/[slug]/components/review-form.tsx` — kart içinde `rows={3}`, `resize-none`, etiketsiz
  · `support/components/reply-box.tsx` — hap biçimli satır içi besteci (dosyanın künyesinde
    gerekçesi zaten yazılı)
  **İstenen karar tasarımdan:** kitin ikinci bir ölçüsü olacak mı (`md` 48px · `sm` satır içi) ve o
  ölçünün yüksekliği/punto/yarıçapı ne? Kod bunu kendi başına seçemez — kontrol yüksekliği
  envanterin kararı. `field-shell` künyesi aynı boşluğu mobil 52px için de itiraf ediyor; ikisi
  aynı eksenin iki değeri, tek turda çözülür.
  **O güne kadar üçü gerekçeli istisna** (`CLAUDE.md §2` "ham `<input>` son çare") — kiti çağırıp
  sınıflarının çoğunu ezmek, kiti kullanmak değil adını kullanmak olurdu.

- **HAP GİRDİNİN KENAR TONU: `sand-300` mü `sand-400` mü? (02.08, denetim K2).**
  Üç hap girdi (`place-prompt` · `place-dialog` · `notice-dialog`) artık tek kaynaktan geliyor
  (`components/customer/form/pill-input.ts`) ve **`sand-300`** kullanıyor. Ama yüzeydeki öteki hap
  KONTROLLER `sand-400`: `Button.secondary`, `load-more`, `sort-select`, hesaptaki dil hapı.
  İki okuma var ve hangisinin doğru olduğunu kod söyleyemez: *(a)* girdi ile kontrol bilinçli olarak
  ayrı tonda — `field-shell` künyesi `sand-300`ü "salt-okunur alanın kenarı" diye tarif ediyor, ki bu
  ayrımı DESTEKLEMİYOR; *(b)* üçü birlikte sapmış ve `sand-400` olmalı.
  **İstenen karar:** envanterde hap girdinin kenar tonu. Cevap gelene kadar bugünkü ton korunuyor —
  tasarım söylemeden değiştirmek improvise olurdu.

  Not: hap girdi kitin `size` ekseninin küçük hâli DEĞİL, kardeşi (etiket kabuğu yok, köşe `pill`).
  Yukarıdaki karar gelince ikisi birleşmez; ikisi de ayrı ayrı kalır.


- **ÇÖZÜLDÜ (02.08, kullanıcı kararı): Transfer AYRI SAYFA DEĞİL — 01.08 kararı geçerli.** Gelen
  çizim ayrı sayfa varsayıyordu; kullanıcı *"bence (a)'yı yapsak daha iyi… mevcut tasarımdaki ilgili
  yerleri kopyalayıp birleştirebiliriz"* dedi ve karar korundu. Gerekçe estetik değil yapısal ve
  zaten yazılıydı (§5): parada hesaplar arası transfer bir HAREKET TİPİDİR, sayfası yoktur; depolar
  arası transfer onun stok karşılığıdır. Ayrı sayfa, "bu depoya ne girdi" sorusunu yeniden dört
  ekrana bölerdi — 01.08'de tam olarak o dağınıklık toplanmıştı.
  **İkinci gerekçe kullanıcının kendi şikâyetinden çıktı:** ray zaten kalabalık (09.19 bu yüzden
  var); on yedinci nav satırını, içeriği başka bir sekmede zaten yaşayan bir ekran için eklemek
  ters yöne gitmek olurdu.
  **Kontrol edildi: `admin-stok.md` çizimin neredeyse tamamını zaten karşılıyor** — yoldakiler
  (Mal kabul/bekleyenler), sevk oluşturma + FEFO önerisi + kullanılabilir üzerinden hesap, sevk
  kaydını geri alma (ve "iptal" kelimesinin neden yetmediği), belge numarası (`TRF-STR-26-0007`),
  tek depolu kurulumda bölümün görünmemesi, FEFO'nun zorlanmaması. Yani birleştirme bir yeniden
  yazım değil, **kare eşlemesi**.
  **Kare eşlemesi (`Operasyon - Transfer.dc` artık bir SAYFA değil, KARE KAYNAĞI):**
  · "Yoldakiler" listesi + "Fark olanlar" süzgeci → **Stok › Mal kabul › bekleyenler**
  · "Sevk oluştur" diyaloğu (kaynak/hedef, kalemler, `STR kullanılabilir`, öneri) → **Stok › Çıkışlar**
  · "Geri alma iki ayrı gerçektir" bloğu → **Stok › Çıkışlar**, `admin-stok.md`'deki geri alma maddesi
  · Mobil depocu kabul akışı ("Bana ne geliyor", "Kabul · TRF-…", "Kabul et · 2 satır eksik") →
    **`depo-stok-giris.md`** (depo yüzeyi) — orada transferden kabul HİÇ yazılı değildi, eklendi
  · "Tek depolu kurulum — sayfa kapalı" → `admin-stok.md` §4'teki tek-depo hâli (sayfa kapanmaz,
    **bölüm** görünmez; sayfanın kalanı tek depoda da çalışır)
  **Kodlanmayacak:** `AdminSidebar.dc`'nin Transfer nav satırı.
  **KÖK SEBEP: BİLİNMİYOR — iki teşhis yazdım, ikisi de yanlış çıktı ve üçüncüsünü uydurmuyorum.**
  Kullanıcı önce *"ben o belgeyi vermedim"*, sonra *"bu yeni bir chat olarak açıldı ve sadece senin
  verdiğin dokümanlar yüklendi"* dedi. Elimdeki doğrulanabilir olgular yalnız şunlar:
  · `design/pages/admin-transfer.md` **hiçbir commit'te yok** (`git log --all` boş) — yazılmış,
    commit'lenmeden kaldırılmış.
  · `design/project/uploads/admin-transfer.md` bugün **duruyor** ve içinde `operasyon-depo-ekseni.md`'ye
    atıf var; o dosya 01.08'de doğdu — yani transfer dokümanı 01.08'de ya da sonrasında yazılmış,
    "ilk turdan kalma" değil.
  · Aynı turda `uploads/belgeler.md` de yeni ve o da yüklenenler listesinde anılmadı; buna karşılık
    üç `Belge - *.dc` çizildi. Yani aynanın neyi ne zaman aldığını buradan okuyamıyorum.
  Mekanizmayı bilmeden sebep yazmak, bu maddede iki kez yaptığım hata. **Sebep açık kalıyor.**
  **Yine de yapılacak iş sebepten bağımsız:** `uploads/admin-transfer.md` tasarım projesinden
  kaldırılmalı — orada durduğu sürece bir sonraki turda yeniden sayfa olarak çizilebilir. Ve genel
  kural olarak: bir sayfa dokümanı `design/pages/` altından kaldırıldığında **tasarım projesinden de
  geri çekilmeli**; yalnız yerelden silmek yetmiyor.

- **~~ÇELİŞKİ: Transfer'in AYRI SAYFA'sı çizildi, oysa 01.08'de sayfa olmaktan çıkarılmıştı (02.08).~~** *(yukarıda çözüldü; kayıt izi için duruyor)*
  Gelen tasarım paketinde `Operasyon - Transfer.dc.html` var (web "yolda ne var" listesi · mobil
  depocu kabul akışı · sevk oluşturma diyaloğu · tek-depolu kapalı hâl) ve `AdminSidebar.dc`
  navigasyona **Transfer** satırı ekliyor. Ama §5'te yazılı kullanıcı kararı bunun tersi:
  *"Transfer ayrı sayfa DEĞİL — `admin-transfer.md` **silindi**, içeriği `admin-stok.md`'ye taşındı:
  Mal kabul ve Çıkışlar sekmeleri"*, ve *"yoldaki transfer ayrı sekme değil, Mal kabul'ün
  'bekleyenler' kısmı"*.
  **Sebebi bulundu:** `design/project/uploads/admin-transfer.md` duruyor — yani **silinmiş sayfa
  dokümanının eski bir kopyası** Claude Design'a iletilmiş. `design/pages/` altında o dosya yok;
  yürürlükteki sözleşme `admin-stok.md` (dört sekme: Seviyeler · Yaklaşan tarihli · Mal kabul ·
  Çıkışlar) ve o da aynı pakette güncellenmedi.
  **Karar kullanıcının** ve iki yol da tutarlı olabilir: (a) 01.08 kararı geçerli → Transfer çizimi
  Stok'un iki sekmesine dağıtılır, nav satırı kodlanmaz; (b) karar değişti → `admin-stok.md`'den
  transfer bölümü çıkarılır, `admin-transfer.md` geri yazılır, nav'a Transfer eklenir.
  **Kodlanmadı** — ikisi arasında seçim yapmak sayfa mimarisi kararıdır, çizimden okunmaz.
  Ara çözüm de yapılmadı: iki yerde birden kurmak, aynı kaydı iki ekranın sahiplenmesi olurdu.

- **`AdminSidebar.dc` iki noktada koddan geride (02.08).** (1) Nav etiketi hâlâ **"Satın Alma"**;
  kullanıcı 02.08'de **"Tedarik"** dedi ve kod öyle. (2) Çizim **Depolar**'ı "Sistem" grubuna
  koyuyor, kod "Depo" grubuna (Stok · Tedarik · Depolar) — gruplama 09.2'de kullanıcıyla birlikte
  yeniden yapılmıştı ve gerekçesi görev notunda. Çizim güncellenirken bu ikisi de düzeltilmeli;
  aksi hâlde bir sonraki tur aynı sapmayı "kod yanlış" diye geri getirir.

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

### Talepler kuyruğu — çip şeridi sistemin kendi birincil sorusunu sormuyor (03.08, 16.3)

`Operasyon - Talepler.dc.html`'in çip şeridi beş çip taşıyor: **Açık · İşlemde · Çözüldü ·
Siparişli · AI yanıtladı.** Üçü aynı ekseni (durum) bölüyor, biri sipariş bağı, biri de bugün
karşılığı olmayan bir hâl (AI — `16.5` yazılmadı, her talep `human`, çip daima boş dönerdi).

Buna karşılık **iki gerçek süzgeç ekranda yok**, ikisi de arka uçta hazır:

- **"Cevap bekliyor"** (`awaitingReply`). Migration'ın kendi künyesi *"kuyruğun tek amacı cevap
  bekleyeni bekletmemek"* diyor ve görünüm `awaiting_reply`'ı yalnız bunun için türetiyor. Yani
  sistemin kendi tanımladığı birincil soru ekrandan sorulamıyor. Kuyruk zaten son mesaja göre
  sıralı ama sıra ile süzgeç aynı şey değil: on beş satırlık kuyrukta "top kimde" ancak satır satır
  bakılarak anlaşılıyor.
- **Tip** (`bozuk · eksik · soru · diğer`). `admin-talepler.md §2` daraltma listesinde adıyla
  yazıyor (*"durum, tip, siparişli/siparişsiz"*), `filter.type` hazır, çizimde çip yok. Tip
  ayrımı ağırlık ayrımı: bozuk/eksik iade kararına gider, soru tek cevapla kapanır.

**İstenen karar:** çip şeridi nasıl kurulsun? Bugünkü hâli tek eksende (durum) üç çip harcıyor.
Bir öneri — karar sizin: durum çipleri tek bir seçiciye inip ("Açık/İşlemde/Çözüldü/Hepsi"),
açılan yere "Cevap bekliyor" ve tip çipleri gelebilir. AI çipi `16.5` ile birlikte döner.

Karar gelene kadar ekran **çizili çipleri** uyguluyor, eksik olanları uydurmuyor (`CLAUDE.md §3`);
"AI yanıtladı" çizilmiyor çünkü arkasında hiçbir kayıt olamaz.

**EK (03.08, kullanıcı) — AI süzgeci TEK DEĞİL İKİ, ve çizim bunu zaten söylüyormuş.** Kullanıcı
ayrımı koydu: *"AI'ın yanıtladığı ve AI'ın kontrolünde olan farklı anlamlara geliyor; duruma göre
her ikisini de süzmem gerekebilir."* Çizime dönüp bakınca ayrım orada duruyor ve iki ayrı kelimeyle
yazılmış — süzgeç çipi **"AI yanıtladı"**, satır rozeti **"AI yürütüyor"**. Ben ikisini tek şey
sanıp arka uçtan yalnız `handledBy` istemiştim; istek eksikti.

Fark kalıcı ve önemli: operatör devralınca `handled_by` `human`'a döner ama AI'ın yazdığı mesaj
yerinde kalır. Yani **devralınmış bir talep "AI yürütüyor" değildir ama "AI yanıtladı"dır** — ve
kalite denetimi tam da o kümeye bakar (devralma zaten bir şeyin ters gittiğinin işareti).
`handled_by` ile süzmek o soruyu sessizce yanlış cevaplardı: liste dolu görünür, en ilginç satırlar
eksik olurdu.

İki süzgeç de arka uçtan istendi (`docs/talep/arka-uc-talep-ai-suzgecleri.md`; `answeredByAi` için
görünüme `exists(… sender='ai')` alanı gerekiyor). İkisi `16.5` ile birlikte gelecek — bugün her
talep `human` ve hiç `ai` mesajı yok, yani ikisi de boş liste dönerdi. **Yukarıdaki "çip şeridi
nasıl kurulsun" kararı bu yüzden altı çipli bir şerit üzerinden düşünülmeli**, beş değil.

### Geri Bildirim — üç bilinçli sapma (03.08, 17.1)

**1. Yığın seçicisi (Bekleyen · Yayında · Reddedilen) çizimde YOK, eklendi.** Çizim yalnız bekleyen
kuyruğu gösteriyor; onunla yetinseydim `moderateReview`'ın üç hâlinden ikisine — yayınlanmışı geri
çekme, reddedilmişi yeniden yayınlama — ekrandan hiç ulaşılamazdı, arka uç hazırken. Sayfa dokümanı
ikisini de istiyor (§2, §3). Uydurma değil, kapının kendi imzasının karşılığı:
`listReviewsForModeration(status)` üç durumu da okuyor.

**2. "Kupona çevrim" kolonu kupon SAYISI değil, çevrilen PUAN.** Çizim `2 kupon` yazıyor ama defter
kupon adedini taşımıyor (`PointsBalance`: `balance`/`earned`/`spent`). Sayıyı uydurmaktansa elde
olanı doğru adıyla göstermek yeğ; kolon başlığı da "Çevrilen" oldu. Sayı arka uçtan istendi.

**3. "Son 30 gün" dönem seçicisi çizilmedi.** Hiçbir okuma kapısı dönem parametresi almıyor.
Çalışmayan bir süzgeç, olmayan bir süzgeçten kötüdür — operatör süzdüğünü sanır. İstek açıldı.

**Ürün skorları sekmesi İNDİ** — bir tur "kapı yok" diye çıkarıldıktan sonra. Kapı vardı
(`ProductRatingService.listRanked`, künyesinde bu ekranı adıyla anıyor); envantere bakmadan "yok"
denmişti. Tablo çizimin dört kolonunu taşıyor (Ürün · Skor · Beğeni · Sinyal), "en sevilen ↔ en
sevilmeyen" yönü `MultiToggle` ile seçiliyor ve `confident` düşükse not satırı amber yazılıyor —
tasarımın *"3 yorumla en kötü ürün damgası vurulmaz"* kuralı böyle görünür oluyor.

**4. "Elle puan düzelt" düğmesi üst barda DEĞİL, satırda.** Çizim barın sağına tek koyu düğme
koyuyor ve pencere müşteriyi kendi soruyor (bir seçici var). Bugün düzeltme puan satırından açılıyor,
tablo da çizimde olmayan bir düğme kolonu taşıyor. Üst bara taşımak müşteri seçicisini gerektiriyor
(`searchCustomerOptions` üzerinden, ayrı bir tur işi) ve müşterisiz bir düğme, basıldığında kime puan
yazacağını bilmeyen bir pencere açardı. Kod `BEKLEYEN` işaretiyle bu maddeye bağlı.

**5. Mobil, çizimin iki-kart düzeni yerine masaüstünün sekmeli kabuğunu daraltıyor.** Çizim telefonda
sekme şeridi göstermiyor; alt alta iki kart var ("Onay bekleyen" rozetli · "Aday ürün talebi") ve
puan/skor mobilde hiç yok. Bugünkü kod dört yerine üç sekmeyi mobilde de çiziyor ve puan tablosunu
salt okunur gösteriyor. Çizimin telefon için verdiği somut kararlardan **yalnız biri uygulandı**:
moderasyon düğmeleri tam genişlik ve "Onayla" daha geniş (`flex:1` / `flex:1.4`), yani başparmak
hedefi. Kalan düzen farkı açık madde.

> **Bu sapmaların çoğu ilk turda kayıtsızdı** ve kullanıcı bildirimiyle çıktı (03.08): *"tasarım
> tutarsız, orijinalden çok uzak"*. Her biri tek tek gerekçelendirilmişti ve gerekçeler tek tek
> makul görünüyordu; toplamı çizimden başka bir ekran çıkardı. Ders: sapmanın SAYISI da bir ölçüdür —
> üçüncüsünden sonra soru "bu gerekçe geçerli mi" değil, "ben hâlâ bu çizimi mi uyguluyorum" olmalı.

### Talepler — "Elle talep aç" penceresinin içi çizilmemiş (03.08, 16.3)

Çizimdeki modal genel bir kabuk: başlık + gövde metni + not + iki düğme. Gerçek pencerenin
istediği alanların hiçbiri yok. Brief tek cümle veriyor (`§3`): *"WhatsApp/telefon
konuşmasından; müşteri + varsa sipariş seçilir"*, `§4` de tipin belirlendiğini ima ediyor.

Arka ucun beklediği alanlar belli (`openTicket`): **müşteri** (zorunlu) · **tip** (zorunlu) ·
**anlatım** (zorunlu, boş olamaz) · sipariş (isteğe bağlı) · işaretli kalemler (sipariş seçiliyse)
· başlık. Yani pencere en az dört alan taşıyacak ve ikisi arama gerektiriyor (müşteri, sipariş).

**İstenen karar:** düzen. Bu ekranın kendi seçici deseni var (`Combobox` uzak arama), o yüzden
kodlanabilir — ama dört alanlı bir formun çiziminin olmaması, ekranın geri kalanıyla aynı dilde
durup durmayacağını belirsiz bırakıyor. Karar gelene kadar pencere brief'ten türetilerek, ekranın
mevcut form kitiyle kurulacak; çizim gelince birebir uygulanır.

**Yazıldı (03.08, `manual-ticket-dialog.tsx`):** müşteri (uzak arama) · tip (`MultiToggle`, dört
değer) · bağlı sipariş (müşteriye bağlı seçici, isteğe bağlı) · başlık (isteğe bağlı) · anlatım.
İşaretli kalemler KONMADI: brief "müşteri + varsa sipariş" diyor ve operatör telefonda konuşurken
kalem kimliğiyle uğraşmaz — gerekirse sipariş ekranından görülür. Çizim gelirse birebir uygulanır.

### Talepler — çizimin karşılığı olmayan üç sunum kararı (03.08, 16.3)

Ekran yazılırken çizimin ya susduğu ya da palette karşılığı olmayan üç nokta çıktı. Üçü de
uydurulmadı, en yakın karşılıkla kuruldu ve buraya yazıldı — çizim gelince birebir uygulanır.

- **Kuyruk satırına iki işaret EKLENDİ.** Çizim satırda müşteri · tip · önizleme · durum · AI · yaş
  gösteriyor. Eklenenler: **"Cevap bekliyor"** rozeti ve **kamera** işareti. İkisi de brief'ten
  geliyor (`§2`: *"cevap bekleyenin bekletilmemesi kuyruğun tek amacıdır"*, `§7`: *"bozuk ürün
  kararı çoğu kez fotoğraftan verilir"*) ve ikisinin de verisi görünümde hazırdı (`awaiting_reply`,
  `has_attachment`) — çizim onları hiç kullanmıyordu. Sipariş numarası da satıra kondu (aynı
  gerekçe: veri hazır, çizim kullanmıyor).
- ~~**AI'ın moru palette YOK.**~~ **BU İDDİA YANLIŞTI — geri alındı (03.08).** Token **vardı**:
  `--color-ops-violet` / `-violet-bg` / `-violet-line`, çizimin üç hex'iyle (`#5a4a8a` · `#ece8f5` ·
  `#d8d0ec`) **birebir**, üstelik `f102c9a` ile **27 Temmuz**'da eklenmiş — yani Talepler ekranı
  yazılmadan bir hafta önce. Envantere bakmadan "yok" dedim ve olmayan bir kısıtı gerekçe yaparak
  `slate` kullandım; üstüne bunu **karar sorusu** diye buraya yazıp zaten verilmiş bir kararı
  yeniden sordum. Sorulacak bir şey yok: AI moru kullanılacak.
  **Yapılacak:** `OpsTone`'a `violet` girer (`tone.ts` + `badge.tsx`), sonra AI'ın beş yeri buna
  döner — rozet, mesaj balonu, devralma şeridi, `TICKET_SENDER_TONE.ai` ve onay penceresindeki
  "Devral" düğmesi (çizimde **dolu mor**, kodda ikincil/çerçeveli: renk kadar AĞIRLIK da yanlış).
- **Personel mesajının başlığı "Operasyon", çizimdeki "Selim A. (siz)" değil.** Mesaj görünümü
  yazarın kimliğini taşımıyor (`TicketMessageView` — `authorId` müşteri yüzeyine sızmasın diye
  düşürülüyor) ve taşısa bile bir meslektaşın yazdığı cevaba "siz" demek yanlış olurdu. Ayrım
  gerçekten gereken yerde duruyor: müşteri ↔ operasyon ↔ AI. **İstenen karar:** yazarın adı
  operasyon detayında görünsün mü? Görünecekse veri kapısı `authorId`'yi personel görünümünde
  taşımalı (arka uç şeridi).

- **UZUN METİN İÇİN OKUMA KADEMESİ YOK — statik sayfalar bunu bekliyor (03.08, 08.8).**
  `Musteri - Statik.dc.html` gövde metnini `15.5px/1.75` ve `#4a4f44` ile çiziyor. Envanterde
  ikisinin de karşılığı yok: en yakın punto `text-body` (15px), en yakın renk `--color-body`
  (`#6d7261`) ve satır aralığı token'ı `leading-relaxed` (1.625). Sayfalar bugün bu üçüyle kuruldu —
  ham değer yazmak `CLAUDE.md §3`'ün ihlaliydi.

  **Fark küçük ama rastgele değil:** tasarım bu sayfalarda bilerek bir tık daha KOYU ve bir tık daha
  SEYREK yazmış. Sebebi de belli — yüzeyin geri kalanı kart başlığı, fiyat, rozet gibi kısa metinler
  taşırken burada ekran dolusu hukuki metin var ve bunlar farklı okuma işleridir. `--color-body`
  bir kart alt satırı için doğru tondur, üç ekran süren bir CGV için açık kalır.

  **İstenen karar:** envantere bir **okuma kademesi** eklenip eklenmeyeceği (uzun metin puntosu +
  gövde tonunun koyu varyantı + 1.75 satır aralığı). Eklenirse `legal-sections.tsx` tek dosyada o
  token'lara geçer. Eklenmezse bugünkü hâli kalır ve tasarımın statik sayfa çizimi bu üç değerde
  envantere uydurulur — ikisinden biri, ama ikisi birden değil.

- **ZİYARETÇİDE FİYAT DEĞİŞİMİ BİLDİRİMİ HİÇ ÇALIŞMIYOR — karar bekliyor (03.08, denetim T3'ü
  cevaplarken çıktı).**
  DOMAIN §5: *fiyat arttıysa müşteriye bildirilir ve onay istenir; düştüyse sessiz uygulanır.*
  Kural yazılmış ve girişli müşteride çalışıyor (`priceChangeOf`, testi `lib/cart/price-change.test.ts`).
  **Ziyaretçide çalışmıyor:** `previousPrices` yalnız girişli dalda geçiyor (`cart/actions.ts:101`
  `customerId` bloğunun içinde, `:138` ziyaretçi erken dönüşünden sonra). Ziyaretçide harita hiç
  verilmediği için `priceChangeOf` her zaman boş dönüyor.

  **Pratik sonucu:** çıpalı teklif partisi tükenen bir ziyaretçi normal fiyata **sessizce** geçiyor.
  Ziyaretçi checkout'a girebiliyor (SSS: *"hesap açmanız gerekmiyor"*), yani DOMAIN §5'in Fransız
  tüketici hukuku gerekçesiyle yasakladığı "sessiz zam" bu yolda fiilen mümkün.

  **Bu bir unutma değil, yapısal bir sonuç.** Ziyaretçinin sepeti tarayıcıda ve `CartEntry` bilerek
  fiyat taşımıyor ("yalnız niyet" — fiyatı her okumada sunucu çözüyor, ki bu doğru bir karar ve
  "eski fiyatı taşıma" hatasını imkânsız kılıyor). Karşılaştırılacak eski fiyat bu yüzden hiçbir
  yerde durmuyor.

  **İstenen karar — iki yol var ve ikisi de meşru:**
  · *Son görülen fiyat tarayıcıya da yazılır* (niyetin yanında, ayrı bir alan olarak). Koruma
    ziyaretçiye de gelir; bedeli, `CartEntry`'nin yanında fiyat tutmayan tasarımın kenarına bir
    istisna açmak — o alan **kıyas için** tutulur, satış için değil, ve künyede böyle yazılmalı.
  · *Ziyaretçi bu korumanın dışında kalır* ve bu **yazılı bir sapma** olur. Savunulabilir: fiyat
    zaten checkout'ta sabitleniyor ve müşteri ödemeden önce toplamı görüyor. Ama o zaman sapma
    gerekçesiyle DOMAIN §5'e de düşülmeli, yoksa kural "her müşteri için" diye okunur.

  Karar verilene kadar kod bugünkü hâlinde; test künyesi kapsam dışı olduğunu söylüyor.

- **FAALİYET ADI YOK, YALNIZ KOD VAR — İKİ EKRANDA (03.08, 08.7 ↔ 09.11).**
  Professionnels başvurusunun doğrulama kartı `Faaliyet: Restoran işletmesi` diye çizilmiş; kod
  `Faaliyet: 47.91B` gösteriyor. Onay kartı (09.11) da aynı kodu gösteriyor.

  Sebep kaynakta: resmî kayıt uç noktası (*Annuaire des Entreprises*) faaliyetin insan diline
  çevrilmiş adını **döndürmüyor** — yalnız NAF kodu ve tek harflik bir bölüm işareti
  (`section_activite_principale`, ör. `G`). Ölçüldü, uydurulmadı.

  **Neden kendi tablomuzu yazmadık:** NAF 730 satırdır ve üç dile çevrilmesi gerekir; kodda
  tutulan böyle bir sözlük ilk yıl bakılır, sonra eskir ve "resmî kayıttan getirildi" cümlesinin
  altında yanlış bir etiket durur. Bölüm harfini (21 satır) kullanmak da mümkündü ama o kadar
  kaba ki doğrulama işini görmez ("G — Commerce" bir restoranı da bakkalı da kapsar).

  **İstenen karar:** ya bir NAF etiket kaynağı (üçüncü parti veri seti / kendi tablomuz + bakım
  sahibi), ya da tasarımın bu satırı koda indirmesi. O güne kadar kod gösteriliyor: okunması güç
  ama DOĞRU, ve adayın asıl doğrulayacağı iki satır (unvan, adres) zaten okunur.

- **ADAY YOKKEN ANASAYFANIN KEŞİF ÇAĞRISI GİZLENMİYOR (03.08, 08.7).**
  `Musteri - Kesif.dc.html`in boş durum kutusu şunu diyor: *"Ana sayfadaki keşif çağrısı da bu
  durumda gizlenir."* Yapılmadı — anasayfa aday sayısını bilmiyor.

  **Bilmesi ucuz değil:** yalnız bu bant için ikinci bir okuma açmak, HER ana sayfa isteğine bir
  sorgu eklemek demek. Anasayfa vitrinin en sıcak yolu ve sorgu, kullanıcıların çoğu keşfe hiç
  girmezken de koşardı.

  **Bugünkü davranış çıkmaz değil:** çağrıya tıklayan ziyaretçi keşif sayfasının kendi boş hâlini
  görüyor (🌱 "Şu an değerlendirecek yenilik yok" + kataloğa dönüş). Yani kayıp, bir tıklamalık
  bir hayal kırıklığı; kazanç, her ana sayfa isteğinde bir sorgu.

  **Ucuzlarsa yapılır:** vitrin okuması zaten tek turda birden çok şey getiriyor
  (`lib/storefront/home.ts`); aday sayısı oraya bir alan olarak eklenebilirse bant koşullu hâle
  gelir. Bugün eklenmedi çünkü o okuma satılabilir ürünlerin okuması ve aday ürün oraya ait değil.

## 3. Bilinçli sapmalar (kapanmış — yeniden tartışılmasın)

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

**Para ekranının MOBİL yüzeyi — çizilmedi, kararla kuruldu (04.08).** `Operasyon - Para.dc.html`
tek bir `data-screen-label="Para Tezgah"` bloğu taşıyor ve o blok masaüstü (1360px, `AdminSidebar`
+ iki sütunlu gövde). Mobil bölümü hiç açılmamış — oysa sayfa dokümanı §7 telefonu **öncelikli**
sayıyor: *"gider girişi çoğu zaman anlık yapılır (akaryakıt alındı, nakit çıktı) — hızlı elle giriş
telefonda tek dakikalık iş olmalı"*. Yani ekran çizilmemiş bir yüzeyde çizilmiş bir yükümlülük
taşıyor; kodlanmaması bir seçenek değildi (`12.8`).

Kurulan yüzey ve gerekçeleri: *(a)* **"+ Hareket" birincil düğme** (masaüstünde ikincil) — §7'nin
tarif ettiği saha işi bu; *(b)* iki sütunlu gövde **sekmeye** iniyor (Hareketler | Eşleştirme) —
kuyruk gizlenmiyor, çünkü §7 onu "oturarak yapılan iş" diyor, "telefonda yapılamaz" demiyor;
*(c)* bakiye şeridi **yatay kaydırılır tek satır**, toplam başta. Bu üçüncüsü ölçümle düzeldi: ilk
yazımda iki sütunlu ızgaraydı ve beş hesap altı hücre ederek ekranın ilk katının tamamını yiyordu
(`ui:shot`), yani Para'yı telefonda açan operatör yalnız bakiyeleri görüyordu.

Çizim istenirken bilinmesi gereken: bu bir **çizim değil, sayfa dokümanının işlevsel notlarına
dayanan bir yerleştirme.** Özellikle karar bekleyen iki şey — kuyruğun telefonda sekme mi yoksa
alt sayfa (bottom sheet) mı olacağı, ve bakiye şeridinin kaydırılabilir mi yoksa katlanabilir mi
olması gerektiği.

**Hesap rengi: sağlayıcı `violet` değil `slate` (04.08, bilinçli).** Tasarım Stripe'a mavi-mor bir
nokta veriyor (`#6a5acd`). Operasyon paletinde `violet` **"makine konuştu"** demek (AI çevirisi, AI
önerisi — `OpsTone` sözlüğü); Stripe bir makine değil bir hesap. Mor verilseydi operatör aynı rengi
iki ayrı anlamda okumak zorunda kalırdı. `slate` seçildi: mavi-griye en yakın nötr ton.

**Para biçimi binlik ayraçlı oldu — `format.ts` ikiye ayrıldı (04.08, ölçümle).** `money`/`amount`
ayraçsız yazıyordu ("12931,53 €") ve Para ekranının bakiye şeridinde okunmadığı `ui:shot` ile
görüldü. Tasarımın bütün çizimleri zaten ayraçlı ("21.340 €", "−1.240,00"). Ayraçsızlığın gerekçesi
geçerliydi ama **yalnız girdi kutusu için**: kutuya yazılan metin geri okunabilir olmalı ve "1.234,50"
ayrıştırılırken nokta ondalık sanılır. `money-input` zaten `decimal()`i doğrudan kullanıyordu, yani
gösterim tarafını ayırmak kutuyu hiç etkilemedi. **Değişiklik operasyon yüzeyinin tamamını
kapsıyor** — her para sayısı artık ayraçlı; tasarımla uyum bu yöndeydi.

**Teslimat yeri panelinin dört hâli + öneri listesi — çizilmedi, kodlandı (03.08).** Envanter K30-K31
hapı ve şeridi çiziyor; panelin `ambiguous` / `unknown` / `unresolved` hâlleri ile posta kodu **öneri
listesi** hiçbir `.dc.html`'de yok. İkisi de sonradan doğdu: dört hâl 19.16b'nin ayrık sonucundan,
öneri listesi kullanıcı kararından (02.08 — *"müşteri yazsın, biz önerelim, tamam desin"*). Panelin
mevcut diliyle kuruldu (hap girdi, `rounded-soft` bilgi bloğu, kum/bal tonları) ve ayrı bir görsel
dil icat edilmedi — ama bu bir **çizim değil, en yakın emsale dayanan bir yerleştirme**.

Çizim istenirken bilinmesi gerekenler: *(a)* öneri satırı bir açılır kutu değil, panelin akışında
duran bir blok (klavye sözleşmesi vaat etmemek için bilinçli); *(b)* satırda **ülke yazılı** ve bu bir
kullanıcı kararı, gürültü değil — aynı kod iki ülkede geçerli olabiliyor; *(c)* rota işareti satırı
öne alır ama seçmez; *(d)* `unresolved`'ın iki sebebi iki ayrı cümle ister ve ikisi de **bizim
eksiğimizi** itiraf eder — müşteriye kusur yüklemez. Panel ileride haritaya dönebilir (kullanıcı
niyeti, 02.08); o gün bu hâllerin haritadaki karşılığı da kararlaştırılmalı.

**Checkout mobilde YAPIŞKAN OLAN ŞERİT, onay düğmesi değil — bilinçli sapma, kayda geçiyor (03.08).**
Tasarım not düşüyor: *"onay butonu alta sabitlenir"* (`Musteri - Checkout.dc.html:339`). Kod bunun
yerine üstteki ilerleme şeridini yapışkan yapıyor (`checkout-progress.tsx:37` — `sticky top-0`) ve
gerekçesi `checkout.mobile.tsx` künyesinde yazılı: dar ekranda kalıcı bir özet/eylem paneli, üzerinde
karar verilen adımın yerini yiyor; şerit aynı iki bilgiyi (tutar + kalan adım) tek satırda taşıyor.

Kayıt burada duruyor çünkü **bir denetim bunu "eksik" diye buldu** ve arayışı `checkout.mobile.tsx`
içinde `sticky` arayarak yaptı — yapışkanlık çocuk bileşende olduğu için görmedi. Sapma gerçek ve
bilinçli; ama yazılı olmadığı sürece her taramada yeniden bulgu olarak açılacak. Tasarım tarafı
şeridi yeterli bulmazsa karar burada tartışılır.

**Diyalog içi buton mobilde BÜYÜMEZ — karar, desenden türetildi (03.08).** Envanter mobil kademeyi
(K1 48→52, K2 44→48) yalnız **sayfa düzeyindeki** eylemler için veriyor; diyalog içi butonun mobil
ölçüsünü hiç söylemiyor. Karar: **söylemiyor çünkü aynı şey değil.** Tasarımın genel deseni,
sınırlanmış yüzeylerin kendi ölçeğini koruması yönünde — kart kendi kademesini kullanıyor
(`card`/`cardSm`), mobil şerit kendi ölçüsünü. Diyalog da sınırlanmış bir yüzey: dar ekranda panel
zaten neredeyse tam genişlikte ve içindeki buton sayfanın değil panelin eylemi.

Dolayısıyla diyaloglar web kademesinde kalıyor — ve bu bir ödün değil: `md` 48, `sm` 44, ikisi de
envanterin 44px tabanında ya da üstünde. Tek koruma: **diyalog içinde dolgulu `xs` (36px) kullanılmaz**,
o taban altında kalır. Ghost (yalnız metin) serbest, onun hedefi satır yüksekliğinden gelir.

**Sepete `errors` sözlüğü EKLENMEDİ — karar, desenden türetildi (03.08).** Sepet ekranı arızayı
zaten blok düzeyinde anlatıyor: `CartUnreachable` var ve künyesi ayrımı yazıyor — *"boş sepet bir
DURUM, ulaşılamayan sepet bir ARIZA"*. Satır içi kırmızı bir hata cümlesi eklemek, aynı ekrana
**ikinci bir hata dili** koymak olurdu.

Eksik olan sözlük değil, davranış: **yazma düşerse ekran susuyor** (akış denetimi #12 —
`cart-context` okumada `failed` bayrağı tutuyor, yazmada tutmuyor; iyimser adet ekranda kalıyor,
sunucuda kalem yok). Doğru çare iyimser güncellemeyi geri almak ve sonucu sepetin **mevcut şerit
desenine** söyletmek (`CartUndo` ile aynı aile), yeni bir metin bloğu açmak değil. Kendi işi;
sözlük o iş yapılırken gerekirse doğar. Kapı bugün de `errorKey` döndürüyor, ekran isteyince tüketir.

**Mobil katalog kartında dokunma hedefi 44px'in ALTINDA — bilinçli, kullanıcı kararı (03.08).**
Envanter iki yerde taban veriyor: *"− ve + dokunma alanı en az 44px kare"* (`:162`) ve *"Mobil
dokunma hedefleri en az 44px"* (`:630`). Ama aynı tasarım katalog kartını 26px'lik bir daireyle
çiziyor ve kodun künyesi sebebini yazıyor: ekleme düğmesi **yerini adet seçicisine bırakıyor**
(`storefront-cards.tsx:232` · `qty-stepper.tsx` `xs`), ikisi aynı kutuyu paylaşmazsa kart eklemede
zıplıyor. Tasarımın iki ifadesi çakışıyor ve ikisi de tasarımın.

Üç yol tartışıldı: *(a)* kartı büyütmek, *(b)* görseli korumak ama hedefi görünmez büyütmek,
*(c)* kartı olduğu gibi bırakıp ihlali kaydetmek. Önce (c) seçildi; **kullanıcı kararı 03.08 ile
(a)'ya dönüldü — kural uygulanacak.**

**Uygulanan (03.08):** görsel 26px'lik daire KORUNDU, dokunma alanı 44px'e çıktı — dış kutu şeffaf
`size-11`, daire içeride (`storefront-cards.tsx`). Adet seçicinin küçük kademeleri de tabana çekildi:
sepet satırı (`sm`) iki eksende `min-h-11 min-w-11`, katalog kartı (`xs`) **yalnız dikeyde** `min-h-11`.
Düğme ile seçici aynı yüksekliği paylaştığı için kart eklemede zıplamıyor.

**Kalan açık — yatay eksen, kartta.** `xs`'te `min-w-11` verilmedi: iki sütunlu mobil ızgarada kart
~180px ve seçici fiyatla aynı satırı paylaşıyor; iki düğmeyi 88px'e çıkarmak fiyatı taşırırdı. Dikey
eksen listede en çok ıskalanan olduğu için önce o kapatıldı. Tam uyum kart yerleşiminin değişmesini
gerektiriyor (fiyat alt satıra) — **tasarım kararı, çizim bekliyor.**

⚠ **Tarayıcıda doğrulanmadı:** bu değişiklik kart ve sepet satırının yüksekliğini artırıyor; ölçüler
sınıf dizgilerinden hesaplandı, gerçek cihazda görülmedi.

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
**Çizim geldi (01.08):** 14 `.dc` güncellemesi — (a)-(c) ve operasyonun mevcut ekranları (stok,
siparişler, satın alma, dashboard, rotalar) karşılandı. **Açık kalan (d)'nin yeni ekranlarıdır:**
Depolar'ın `.dc`'si yok, sıfırdan çizilecek; sayfa dokümanı 01.08'de yazıldı
(`pages/admin-depolar.md`) ve ısmarlanmayı bekliyor — **Transfer ayrı sayfa olmaktan çıktı, Stok'un
içine girdi** (aşağıdaki bilgi mimarisi kararı). Fiyatların
**Teklifler sekmesi** de aynı turda (kısmi eksen — sözleşme §5/§8).

---

## 5. Operasyon evreni — yazılmış kararlar (yeniden tartışılmasın)

Diyalog formlarında ve onların beslediği liste satırlarında verilmiş kararlar. Mekanik bir denetim
(ör. ölçü/token turu) bunları "tasarıma çekilecek sapma" sanıp geri almasın: geri çekilecek bir
tasarım yok, gerekçe burada yazılı. İtiraz gelirse madde §2'ye taşınır.

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

**Teslimat sırası — tasarım kodun veremeyeceğini vaat ediyor (bulundu 01.08).**

`kurye-gun.md` kuryeye *"teslimat listesi (**rota sırasıyla**) — günün duraklarının **sıralı**
listesi"* sözü veriyor. **Sıra diye bir veri yok:** `order` tablosunda sıra/ETA/zaman penceresi alanı
bulunmuyor ve `architecture/BACKLOG:132` kapsamı açıkça sınırlıyor ("Faz 1: liste, optimizasyon
yok"). O ekran bugün yazılsa kurye siparişleri **oluşturulma sırasıyla** görürdü — yani rastgele.

Üç yol var, kullanıcı kararı bekliyor:

1. **Elle sıralama** — operatör Teslimat sayfasında durakları sürükleyerek sıraya sokar, kurye o
   sırayı görür. Tek alan (`delivery_seq`) + sürükle-bırak bileşeni **zaten var** (`SortableList`,
   ürün sıralamasında kullanılıyor). Çelişkiyi kapatan en ucuz yol.
2. **Vaadi geri çekmek** — `kurye-gun.md`'den "sıralı" ifadesi kalkar, liste bilinçli olarak
   sırasız kalır (adres/bölge gruplu).
3. **Otomatik optimizasyon** — dış rota servisi (Google Directions/Routes). Adreslerin
   koordinatlanması + aylık maliyet + `STACK §271` (kendi sunucumuzda barındırma) ile tartılması
   gerekir. Teslimat sayısı iki haneliyken algoritmanın operatörden iyi olduğu ölçülmedi.

Navigasyon linki (`kurye-gun.md:21` — adresi telefonun harita uygulamasında açmak) bu tartışmanın
dışında ve zaten çizili: bir rota hesabı değil, bir kısayol.

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

### Açık kademeler (envanter kararı bekliyor)

Operasyon envanteri (§0) yalnız renk, yarıçap ve font ailesi veriyor; **ölçü kademesi yok.** Bunlar
uydurulmadı, envantere yazılması bekleniyor:

- ~~Yazı ölçeği~~ → **KARARA BAĞLANDI (28.07), aşağıda.**
- **Küçük (iç) yarıçap.** Kart 8 · diyalog/çip 14 token'ları var; iç öğeler (tablo satırındaki 3:2
  görsel 7 · küçük görsel 5 · anahtar dilimi 6) hiçbirine oturmuyor. Bir "iç öğe" kademesi (≈6 px)
  gerekiyor; o gelene kadar bu on yer ham kaldı.
- **Kontrol yarıçapı.** Girdi kutuları (`field-shell`) kart token'ına bağlandı; ayrı bir kademe
  isteniyorsa envanterde belirtilmeli.

### İç-içe kart zemini — token sözlüğünde adı yok (03.08, denetim OP3)

Denetim iki dosyada "yanlış token" buldu (`bg-ops-white` kart yüzeyinde). Saydım (03.08 tazelenmiş
ölçüm): **`bg-ops-white` 70 yerde / 37 dosyada, `bg-ops-card` 53 yerde / 39 dosyada** — ikisi de
yalnız operasyon yüzeyinde. Yani `bg-ops-white` iki ekranın kaçağı değil, sistemin fiilî yerleşik
kullanımı ve hâlâ çoğunluk. Önerilen çare (iki dosyayı çevir) bu ölçekte tutarsızlık üretirdi.

Kullanımın bir gerekçesi de var: karanlık modda `ops-white` (#2a2e26), `ops-card`'ın (#23261f)
**üstünde** bir kademe. Kart zemininin ya da `ops-subtle` panelin İÇİNE oturan bir kart ayrışmak
için bir kademe yükselmek zorunda ve elde o kademeyi veren tek token bu. Sözlük ise yalnız iki şey
söylüyor: `ops-card` = "kart, tablo, sidebar zemini" · `ops-white` = "dialog ve girdi zemini".
İç-içe kart katmanından hiç söz etmiyor.

**İstenen karar:** envanter §0'a **iç-içe / yükseltilmiş kart zemini** kademesi giriyor mu?

- *(a) Giriyorsa* — ya `ops-white`'ın tanımı genişler ("dialog, girdi ve iç-içe kart zemini") ya
  üçüncü bir token açılır (`--color-ops-card-raised`); iç-içe olmayan kullanımlar ona hizalanır.
- *(b) Girmiyorsa* — 70 kullanım `bg-ops-card`'a iner ve iç-içe kartlar yalnız kenarlıkla ayrışır.

Karar gelene kadar hiçbiri değiştirilmedi: 70 satırı bir tahminle çevirmek, tasarımın söylemediği
bir kararı kodda vermek olurdu (`CLAUDE.md §3`). Aynı sınıf: K2 (hap girdinin kenar tonu).
