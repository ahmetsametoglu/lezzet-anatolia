# Tasarım Backlog'u — Çizilmiş Ama Kodlanamayan (yalnız AÇIK maddeler)

Bu dosya **tasarımda kararı verilmiş ama koda geçemeyen** işleri tutar. İki sorunun cevabı burada:
neyi neden bekliyoruz, hangi karar tasarım tarafında netleşmeli.

> **Rol ayrımı.** Kapsam (ne yapılacak) → `docs/architecture/BACKLOG.md`. İlerleme (nerede kaldık)
> → `docs/build/NN-*.md` görev satırı. Kapanmış karar ve bilinçli sapmaların arşivi →
> **`design/KARARLAR.md`** (07.08'de bu dosyadan ayrıldı: envanter küçülüp büyür, arşiv yalnız
> büyür — ikisi aynı dosyada yaşayınca açık maddeler arşivin içinde kayboluyordu; ölçüldü: 1303
> satırın %48'i kapanmış karardı). Burası yalnız **açık** tasarım↔kod açığının envanteridir.
> **Bir madde kapandığında buradan silinir**: kalıcı gerekçesi `design/KARARLAR.md`'ye, ilerleme
> izi ilgili `docs/build` Durum notuna yazılır.
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
| **Boş sepet: B2B sipariş şablonları** ("Haftalık standart · 14 kalem" + "Yükle") | aynı tasarım, durum kartı | şablon modeli yok (`07`); B2B müşteri bugün "son siparişi tekrarla" + vitrin seçkisi görür. Kod işareti: `BEKLEYEN(BACKLOG §2)` → aşağıdaki karar maddesi |
| **Boş sepet kahraman görseli** (hasır sepet / tezgâh fotoğrafı, web 260×200 · mobil 180×140) | çizili | görsel künyesi yok; çerçeve tam boyutuyla duruyor, yer tutucu sepet işareti |
| **Paketler kahraman görseli** (3:2, "kurulmuş sofra, birkaç paket bir arada") | çizili; çerçeve tam ölçüsüyle duruyor | görsel künyesi yok — paket sayfasının kendi kahramanı için ayrı bir varlık gerekiyor |
| **Paketler listesi: etiket çipleri + `?etiket=` süzgeci** | çizili; sayfanın kendisi indi (kartlar, "Daha fazla", boş durum) | paketin etiket alanı yok — süzgeç uydurma bir sınıflandırma olurdu |
| **Bölge haberi tetikleyicisi** — bölge genişleyince bekleyenlere TEK e-posta | `zone_notice` kaydı alınıyor, ekran "not aldık" diyor (söz vermiyor) | bölge kaydedilince kontrol eden iş + gönderim (`14-bildirim`) |
| **Hesap sayfasında "sonraya kaydedilenler" + bölge haberi kartı** | çizili (`Musteri - Hesap.dc.html`) | hesap sayfası (`04-auth`); veri hazır (`cart.saved_items`, `zone_notice`) |
| **Operasyon → Analitik "bölge dışı talep" listesi** | tasarımda anıldı | `postal_code_demand` doluyor; ekran operasyon yüzeyinin işi |
| **Ayarlar → "Vitrin görselleri" sekmesi** (ürüne ait OLMAYAN sayfa görselleri: ana sayfa hero, fırsat bandı, Professionnels hero, Hakkımızda; ayrıca "statik" işaretli iki kalem) | `Operasyon - Ayarlar.dc.html` → 7. sekme, tam çizili | **İKİ ŞERİT birden:** (1) ~~*arka uç* — `site_image` tablosu + depolama kovası yok~~ **→ YAZILDI (09.08):** `site_image` (0043) + `site_image_slot` enum + `SiteImageService` (`bySlot`/`getSlot`/`put`/`setCrop`/`clear`) + `r2Keys.siteImage` (`site/{slot}.{ext}`) + seed (`home_hero` dolu — müşteri şeridinin geçici dosyası kalıcı yola taşındı; üç slot **bilerek boş**, yer tutucu yolu koşsun). Anahtar enum: slot kümesi kapalı, yeni slot ancak onu çizen ekran doğunca doğar. `image_key` not null → **boş slot = satır YOK**, ekran yer tutucusunu çizmeye devam eder. Ürün görselinin yolu burada kullanılamazdı, çünkü bunlar bir varlığa değil bir SAYFA YERİNE bağlı. (2) ~~*müşteri şeridi* — hangi slot'un gerçekten var olduğu ve hangisinin koda gömülü kaldığı (marka sahnesi, hata çizimi) o yüzeyin bilgisi; liste onlardan mutabakatla gelir~~ **→ LİSTE VERİLDİ (09.08), ölçülerek:** müşteri yüzeyindeki her `src={null}` çerçevesi tarandı, **dördü** gerçek sayfa görselidir — `home_hero` (16:9) · `packages_hero` (3:2) · `professionals_hero` (16:9) · `empty_cart` (`ILLUSTRATION_RATIO`). Üç aday listeden DÜŞTÜ: ürün galerisi yer tutucusu bir VARLIK görselidir (`product-image.service` sahibi), "fırsat bandı görseli"nin kodda karşılığı yok (bandda kart var görsel yok), "Hakkımızda" sayfası hiç yok. Ana sayfa slot'u bugün **geçici statik dosyayla** dolu (`public/hero-sofra.jpg`, 08.31) — kapı gelince silinir. Talepler açıldı: `arka-uc-site-gorseli-tablosu-ve-kovasi.md` · `operasyon-vitrin-gorselleri-sekmesi.md`. Operasyon şeridi sekmeyi ancak arka uç netleşince çizer — bugün çizmek, arkasında hiçbir şey olmayan bir yükleme alanı göstermek olurdu (`09.16` AÇIK 2) |
| **Menü: Fırsatlar · Keşif · Professionnels** | K12'de çizili, bugün düz metin (Paketler bağlandı) | kendi sayfaları (`08.7`) |
| **Menü: Hesabım** | K12'de tanımlı | `04-auth` |


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
  zaten yazılıydı (`design/KARARLAR.md §3`): parada hesaplar arası transfer bir HAREKET TİPİDİR, sayfası yoktur; depolar
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
      **SEO gerekçesi eklendi (denetim 08.08, kullanıcı bilgisinde):** bugün kategori/koleksiyon
      süzgeci sorgu parametresinde yaşadığı için "baklava" sınıfı aramalara indekslenebilir bir
      landing üretilmiyor — bu rota açıldığında her koleksiyon kendi URL'i + meta'sı + (operasyonda
      ZATEN toplanan) 16:9 OG kapağıyla bir arama giriş sayfası olur. Kapsam kararı kullanıcının;
      iş büyüdüğü için kendiliğinden başlatılmaz.
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

**Sipariş detayının MOBİL kargo künyesi — çizilmedi, kodlandı (09.08, 08.5).**
`Musteri - Siparis Detay.dc.html` kargolu siparişi **yalnız masaüstünde** çiziyor: "Durumlar"
bölümünde bir varyant kartı var (*"📦 Kargo ile — Colissimo / Takip no: 8R 452 617 334 FR"* +
*"Kargoyu takip et ↗"*) ve ana düzende Teslimat kartının aldığı hâl bu. Mobil bölümde ise
**Teslimat kartı hiç yok** — gün ve adres durum kahramanının tek satırına toplanmış — ve kargolu
hâl çizilmemiş. Yani mobil web müşterisi takip numarasını hiçbir yerde göremiyordu.

Boşluk doldurulmadan bırakılamazdı: **müşteri kitlesinin çoğunun bulunduğu yüzey mobil web.**
Kurulan yüzey: kalemlerden sonra, tutardan önce duran kendi kartı (*"nerede" sorusunun cevabı "ne
kadar"dan önce gelir*), içeriği masaüstüyle **birebir aynı parçadan** (`ShipmentCard` /
`TrackingButton` — ikisini ayrı yazmak, bir gün taşıyıcı adının bir ekranda değişip ötekinde
kalması olurdu). Rota siparişinde ve taşıyıcısı henüz girilmemiş kargo siparişinde kart hiç
çizilmez; "kargo bilgisi yakında" gibi bir söz verilmedi, çünkü operatörün numarayı ne zaman
gireceğini bilmiyoruz.

Çizim istenirken bilinmesi gereken: *(a)* künye durum kahramanına mı girmeli yoksa kendi kartı mı
olmalı (bugün ikincisi seçildi — kahraman zaten iki satır ve takip düğmesi orada barınamıyor);
*(b)* `other` taşıyıcıda **düğme yok, numara var** ve bu bilinçli — takip adresini bilmediğimiz bir
taşıyıcıya düğme koymak, tıklanınca hiçbir yere götürmeyen bir söz olurdu.

**Tarif şeridi MOBİL web ana sayfasında çizilmedi — tasarımın kararı (09.08, 08.28).**
`Musteri - Anasayfa.dc.html` "Sofradan Fikirler" şeridini **yalnız "Anasayfa Web" ekranında**
taşıyor; "Anasayfa Mobil" bloğunda paketlerden sonra doğrudan keşif bandı geliyor (ölçüldü). Şerit
mobil webde YAZILMADI — koleksiyon bandının aynı kararı: cihaz forku burada bir yerleşim farkı
değil, bir **içerik** kararı ve improvise edilmiyor (`CLAUDE §3`).

Karar bir gün gözden geçirilecekse gerekçesi burada dursun: mobil trafiğin payı yüksek ve tarif
şeridi tam olarak "telefonda göz gezdirilen" içerik. Native uygulamanın ana ekranında şerit ZATEN
var (`Mobil - Musteri v3.dc.html`), yani asimetri web'in kendi içinde: masaüstü web var, mobil web
yok. Bugünkü hâl birebir uygulandı; ekleme kararı tasarım tarafının.

**Tarif detayında breadcrumb ayırıcısı `›`, ürün/paket detayında `·` (09.08, 08.28).**
`Musteri - Tarifler.dc.html` detay ekranında "Tarifler › Mıhlama (Kuymak)" yazıyor; ürün ve paket
detay çizimlerinde `›` hiç geçmiyor (ölçüldü: sırasıyla 0 · 0 · 1) ve kod ikisinde de `·`
kullanıyor. Tarif sayfası tasarıma birebir uygulandı, yani müşteri yüzeyinde şu an **iki ayrı
ayırıcı** var. Küçük ama gerçek bir tutarsızlık; birleştirme kararı tasarım tarafının — hangi
yönde olursa olsun üç sayfa aynı anda değişmeli.

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

## 5. Operasyon evreni — açık kararlar

Kapanmış operasyon kararları `design/KARARLAR.md §3`'te (07.08'de taşındı). Burada yalnız cevap
bekleyenler durur.

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

---

### Diyalog kabuğu modal olduğunu SÖYLEMİYOR (08.08, 09.21 sırasında ölçüldü)

`components/operation/ui/dialog.tsx` kökü düz bir `div` (`fixed inset-0 … bg-ops-scrim`): `role="dialog"`
yok, `aria-modal` yok. Ölçüm tarif diyaloğunda yapıldı — `[role="dialog"] input` seçicisi **0** girdi
buldu, oysa formda onlarca girdi var.

Gözle görünen bir arıza değil, o yüzden bugüne kadar fark edilmedi; **fare kullanmayan operatör için**
arıza: ekran okuyucu diyaloğu sıradan bir bölüm gibi okur, arkadaki sayfa perde altında hâlâ
gezilebilir kalır, ve Escape ile kapanma / odağın diyalogda tutulması gibi modal davranışları
tarayıcıdan bedava gelmez.

**Tek ekranın işi değil:** kabuk operasyonun bütün diyaloglarını taşıyor, dolayısıyla düzeltme
(role + aria-modal + odak tuzağı + Escape) hepsini birden etkiler ve kendi doğrulamasını ister.
09.21 kapsamında bilerek dokunulmadı (`CLAUDE.md §4` — talep çalışmayı bölmez, sırası gelince alınır).

---


### Asistan onay kuyruğu — çizimin dört öğesi VERİ olmadığı için çizilmedi (09.08, 22.3)

`Operasyon - Asistan Kuyrugu.dc.html` birebir uygulandı; aşağıdaki dört öğe bilerek dışarıda kaldı.
Dördünün de sebebi aynı: **çizim o veriyi varsayıyor, `payload` taşımıyor.** Uydurulsalardı ekran,
onaydan önce operatöre yanlış bir gerçek gösterirdi — onay kuyruğunun yapabileceği en pahalı hata.

1. **"Ayrı ayrı alınsa 104,20 € · %14,6 avantaj"** (paket önizlemesi). `BundleDraftPayload` kalemin
   yalnız **atanan payını** taşıyor, perakende fiyatını değil. Karşılaştırma için kalemlerin güncel
   satış fiyatı gerekiyor — bu ayrı bir okuma ve kararı denetimin (payload'a mı girer, ekran mı
   çeker). Mutabakat rozeti (payların toplamı fiyatı tutuyor mu) uygulandı, o payload'dan çıkıyor.
2. **Ürün fark tablosundaki "Alerjen / Saklama — boş" satırları.** Asistan bu iki alanı ŞEMA gereği
   yazamıyor (`ProductDraftPayloadSchema` künyesi), yani payload'da hiç yoklar; ürünün kendisinde
   dolu da olabilirler. "Boş" yazmak ürün hakkında bir iddia olurdu. Yokluk, tablonun altındaki
   kırmızı kutuda iddiasız biçimde duruyor — çizimin söylemek istediği de zaten o.
3. **Yakın-SKT vurgusu** (parti satırının kırmızıya boyanması). Bizde "yaklaşan son tarih" mutlak
   günle değil **kalan raf ömrü yüzdesiyle** kararlaşıyor (`domain-core/stock/shelf-life.ts`: 3 gün
   taze börekte normal, uzun ömürlü üründe alarm) ve payload ürünün toplam raf ömrünü taşımıyor.
   Bugün yalnız **ölçülebilen** risk çiziliyor: tarihi geçmiş ya da bugün dolan parti. Çare
   payload'a `shelfLifeDays` (ya da hazır `expiryFlag`) eklemek — denetime soruldu.
4. **"Paketi aç →" köprüsü** (uygulanmış kayda gitme). Uygulama doğan kaydın kimliğini bırakıyor
   (`result`) ama hiçbir operasyon ekranı TEK bir pakete/siparişe/harekete derin bağlantı kabul
   etmiyor (`productsUrl`/`procurementUrl`/`financeUrl` yalnız liste + süzgeç taşıyor). Düğme
   listeye götürseydi "paketi aç" demezdi. Kimlikler teknik dökümde duruyor; köprü, o ekranlara
   kayıt-düzeyi adres açıldığı gün gelir.

**Sekmeler için bir sapma denenmişti, geri alındı (kullanıcı düzeltmesi 09.08).** Üç görünüm bir tur
`ui/tabs` ile başlığın ALTINA ayrı bir bant olarak yazılmıştı; çizim onları başlık barının İÇİNDE,
gri rayın üstünde kayan bir hap olarak veriyor. Kullanıcı haklıydı iki yönden: ortak başlık zaten
kullanılıyorsa konu oraya girer, ve bu ekranda ayrı bir bandın bedeli var — iki sütun ekranı
dolduruyor, bant o yüksekliği karar çerçevesinden çalıyor. Çizim uygulandı
(`components/operation/ui/segmented-nav.tsx`); açık bir madde değil, kayıt olarak duruyor.
