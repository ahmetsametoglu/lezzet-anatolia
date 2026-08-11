# Native uygulama — MÜŞTERİ yüzeyi backlog'u

> **Bu dosya KAPSAM tutar, ilerleme tutmaz.** Durumun tek sahibi `docs/build/21-mobil-uygulama.md`
> görev satırıdır (CLAUDE §5); bir madde işe dönüşünce oraya `(21.x)` kimliğiyle girer ve buradaki
> satır o kimlikle işaretlenir. Kimlikler bu dosyaya özeldir (`MB-nn`) — `docs/build` kimlikleriyle
> çakışmasın diye.
>
> **Kaynak üç yerden birleştirildi (11.08):** (a) `design/BACKLOG.md`'de müşteri native yüzeyini
> ilgilendiren açık maddeler, (b) kullanıcının 11.08 cihaz turundan sonra verdiği yönergeler,
> (c) aynı turda **fiziksel cihazda ölçülen** bulgular (OPPO CPH1907 · Android 11 · 1080×2400).
> Ölçülen maddelerde kanıt satırı var; ölçülmeyenlerde "doğrulanmadı" yazar — teori kurulmaz
> (CLAUDE §0).

---

## 1. Bloke edici — müşterinin işini fiilen bozanlar

- [ ] **MB-01 · Klavye açıkken düğmeye ilk dokunuş yutuluyor.** Klavye açıkken bir düğmeye
  basıldığında yalnız klavye kapanıyor, düğmenin işi ÇALIŞMIYOR; kullanıcı iki kez basmak zorunda.
  **Ölçüldü 11.08, iki ekranda birebir:** Profesyonel → "Bul" (1. dokunuş sonuçsuz, 2. dokunuşta
  resmî kayıt geldi) ve Geri bildirim → "Değerlendirmeyi tamamla" (1. dokunuş sonuçsuz, 2. dokunuşta
  gönderildi). İkincisi **veri kaybettiriyor**: müşteri yorumunu yazıp bastığını sanarak çıkarsa
  değerlendirme kaydedilmiyor.
  **Sebep kanıtlandı:** `ScrollView`de `keyboardShouldPersistTaps` yok. Tuzak zaten bir kez çözülmüş
  ve künyesi yazılmış (`screens/support/new-ticket-sheet.tsx:184`).
  **Yayılım — 13 dosya** (`ScrollView` + form alanı var, ayar yok): `courier/delivery-screen` ·
  `courier/day-close-screen` · `catalog/catalog-screen` · `management/complaint-screen` ·
  `management/offer-approval-screen` · `feedback/feedback-screen` · `support/ticket-detail-screen` ·
  `cart/cart-screen` · `account/account-screen` · `warehouse/courier-return-screen` ·
  `warehouse/adjustment-screen` · `warehouse/intake-screen` · `login/login-screen`.
  *Müşteri yüzeyi öncelikli; kurye/depo/yönetim ekranları aynı düzeltmeyle gider.*

- [ ] **MB-02 · Klavye, yazılan alanın üstünü kapatıyor.** Odaklanan alan klavyenin altında
  kalıyor; müşteri ne yazdığını göremiyor. **Ölçüldü:** Profesyonel formunda "Ad soyad" alanına
  yazarken alan tamamen klavyenin altındaydı. `AndroidManifest`te `adjustResize` var ama içerik
  odaklanan alana kaydırılmıyor. `KeyboardAvoidingView` yalnız `components/ui/bottom-sheet.tsx`'te
  kurulu — tam ekran formlarda karşılığı yok. MB-01 ile aynı turda çözülmeli.

- [ ] **MB-03 · Adres formunda sokak alanına yazınca uygulama yeniden yükleniyor** → görev
  `(21.30)` açık, ölçümü orada. Adres kaydetmeyi fiilen engelliyor. **Bu dosyadan bağ:** MB-13'ün
  (oturum misafire düşüyor) tetikleyicisi de bir yeniden yükleme olabilir; ikisi aynı turda
  bakılırsa ölçüm paylaşılır.

---

## 2. Profesyonel başvurusu (B2B) — 21.31'in açık kalanları

> Dilim 11.08'de yazıldı ve cihazda uçtan uca çalıştı (SIRET → resmî kayıt → gönderim → "inceleniyor").
> Aşağıdakiler o turda ölçülen eksikler; **commit'ten önce kapanmaları önerilir.**

- [ ] **MB-04 · Formdaki e-posta hiçbir yere yazılmıyor.** "İletişim" bloğu üç alan soruyor;
  ölçüm (11.08, girişli müşteri): ad ve telefon **yalnız açılan işletme adresine** gidiyor
  (profil bilerek ezilmiyor — gerekçe `packages/application/src/customer/b2b.ts:99`), **e-posta
  ise hiçbir kayda düşmüyor.** Onay ekranı ise *"sonucu e-posta ile bildireceğiz"* diyor: işletme
  adresini yazan başvuran cevabı oraya bekler, cevap hesabın kişisel adresine gider.
  **Karar gerekiyor:** ya alan kaldırılır (kimlik hesabın e-postasıdır denir), ya başvuruya
  "iletişim e-postası" olarak yazılır. Ortası yok — bugünkü hâl kullanıcıyı yanıltıyor.

- [ ] **MB-05 · Girişli müşteride form ön dolgusu yapılmıyor.** Sözleşme `contactName`/`email`/
  `phone` alanlarını taşıyor ve künyesinde *"Form ön dolgusu: profildeki künye"* yazıyor
  (`packages/types/src/contracts/b2b-api.schema.ts:70`); ekran okuyor ama kullanmıyor
  (`emptyApplication()` ile başlıyor). Müşteri sistemin zaten bildiği üç şeyi yeniden yazıyor.

- [ ] **MB-06 · Adres bloğu ORTAK bileşen değil — Fransa adres tamamlama burada yok.**
  Uygulamada BAN (`api-adresse.data.gouv.fr`) bağlı, çalışan bir adres formu var:
  `screens/customer-kit/address-form.tsx` + `use-address-search.hook.ts`, üç ekran ortak kullanıyor
  (hesap · checkout · profil tamamlama) ve künyesi *"form KOPYALANMADI, taşındı"* diyor.
  Profesyonel başvurusu ise sokak/posta kodu/şehir için **kendi düz alanlarını** yazıyor: öneri yok,
  doğrulama yok. **Neden ayrıştığı da yazılmalı:** `address-form` kaydı KENDİSİ yapıyor
  (`createAddress`/`updateAddress`), oysa B2B'de adres bir kayıt değil başvuru gövdesinin parçası —
  yani paylaşılacak şey formun tamamı değil, **"sokak + posta kodu + şehir (BAN önerili)" bloğu.**
  İş: o bloğu kitten çıkarılabilir hâle getirmek ve iki tüketiciye de vermek.
  *Bağımlılık:* MB-03 kapanmadan BAN alanı başvuru formuna taşınmamalı — aynı yeniden yükleme
  buraya da bulaşır.

- [ ] **MB-07 · Ülke seçim rozetlerinin (Fransız/Alman şirketi) tasarımı bozuk.** Kullanıcı
  bulgusu 11.08 + ölçüm: çipin **yatay dolgusu yok**, metin kenarlığa yapışıyor/taşıyor. Doğrusu
  `.dc.html`den alınmalı (Claude Design), improvise edilmemeli (CLAUDE §3).

- [ ] **MB-08 · "1 Kaydolun — bir dakikada" adımı girişli müşteriye de gösteriliyor.** Zaten
  hesabı olan müşteriye kayıt adımı anlatılıyor. Web'de aynı adımın gövdesi var ve daha bilgilendirici
  (*"SIRET'inizle bir dakikada — bilgiler resmî kayıttan kendiliğinden dolar"*).

- [ ] **MB-09 · Doğrulanmamış: misafir yolu cihazda ölçülmedi.** Kod ve birim testleri kuruyor
  (401 → kimlik çekmecesi → doğrulama → aynı gövdenin yeniden gönderimi), ama 11.08 turunda yalnız
  **girişli** yol yürütüldü. Misafirle bir tur atılmalı: e-posta → OTP → başvurunun kendiliğinden
  gitmesi → "inceleniyor" bloğu.

- [ ] **MB-10 · Başvuru ekranının kahraman görseli yok.** `design/BACKLOG.md` §1'de
  `professionals_hero` slot'u tanımlı ve arka ucu 09.08'de yazıldı (`site_image` tablosu + kova);
  görsel künyesi hâlâ boş.

- [ ] **MB-11 · "Başvurunuz inceleniyor" gövdesi başlığı birebir tekrarlıyor.** Başlık
  *"Başvurunuz inceleniyor"*, gövde *"Başvurunuz inceleniyor — sonuç e-posta ile."*

- [ ] **MB-12 · İşletme adresi sessizce adres defterine ekleniyor.** Başvuru kabul edilince
  müşterinin adres listesine yeni bir kayıt (etiket = şirket unvanı) giriyor; ekran bunu söylemiyor.
  Müşteri bir sonraki checkout'ta tanımadığı bir adres görüyor. *Karar: ya söylenir, ya
  başvuru adresi ayrı tutulur.*

---

## 3. Kimlik ve oturum

- [ ] **MB-13 · Girişli müşteriye misafir ekranı gösteriliyor — tetikleyici üretilemedi.**
  **Ölçüldü 11.08, iki ayrı kez:** Hesap sekmesi *"Hoş geldiniz / Hızlı doğrulama"* verdi; oysa o
  dakikalarda oturum canlıydı (10:53'te Bearer isteği B2B başvurusunu yazdı, 11:00'da Vitrin
  *"Merhaba, Yaman"* dedi). Soğuk açılış her seferinde düzeltti.
  **Elenenler:** elle "Reload" tetiklemedi · Keşif'e girip çıkmak tetiklemedi.
  **BEKLEYEN(21.30): sebep ölçülmedi, teori kurulmuyor.** Sıradaki ölçüm önerisi: `useMe`'nin
  `guest`e düştüğü anı ve `authorizedFetch`in yerel 401 kısa devresini izlenebilir kılmak
  (`lib/auth/authorized-fetch` + `screens/customer-kit/use-me.hook`). MB-03 ile birlikte bakılmalı.

- [ ] **MB-14 · Keşif bitiş ekranı girişli müşteriye "Giriş yaparsanız… / Hızlı doğrulama"
  gösterdi** — üstelik aynı ekranda *"+6 puan kazandınız"* yazarken. MB-13'ün görünen yüzü olabilir;
  ayrıca `signedIn === false` iken puan çipinin çizilebilmesi kendi başına bir tutarsızlık
  (`screens/discover/discover-screen.tsx:488` ve `:494` aynı anda doğru olamaz).

---

## 4. Puan sistemi — komple ele alınacak (kullanıcı kararı 11.08)

> Kullanıcının yönergesi: **puan verdiğimizi söylediğimiz TÜM senaryolar tek tek incelenecek**;
> değerler veritabanından dinamik olmalı, dinamik yapmak pahalıysa önceden iyi belirlenmeli.
> Bugünkü durum ölçüldü: **motor zaten ayardan okuyor** (`settings`: `points_review=20`,
> `points_feedback_purchase=5`, `points_feedback_candidate=2`, `points_order=10`,
> `points_referral=50`, `points_visit=10`, `points_daily_cap=100`, `points_redeem_min=500`,
> `points_cent_value=1`). Sorun değerlerde değil, **ekranların o değerleri okumamasında.**

- [ ] **MB-15 · Ekrana gömülü puan vaadi.** Vitrin Keşif kartı: *"Her tamamlanan tur +10 puan
  kazandırır"* — sabit metin (`screens/home/messages.json`), hiçbir ayara karşılık gelmiyor.
  Gerçek kazanç = kart sayısı × `points_feedback_candidate`. Dört kartlık turda 8 oluyor.
  Cümle ya ayardan kurulmalı ya sayı vermemeli.

- [ ] **MB-16 · Keşif bitişinde gösterilen puan eksik.** **Ölçüldü:** 4 oy verildi, deftere
  4 × 2 = **8 puan** yazıldı, ekran **"+6 puan"** dedi. Bir oyun karşılığı toplama girmiyor
  (`use-discover.hook` `awardedPoints` birikimi).

- [ ] **MB-17 · Geri bildirim bitişinde gösterilen puan eksik.** **Ölçüldü:** ekran "+5 puan"
  dedi, deftere `feedback_purchase 5` + `review 20` + `feedback_purchase 5` = **30 puan** yazıldı.
  *(İki `feedback_purchase` kaydı hata DEĞİL — biri kart başına, öteki tamamlama primi, gerekçesi
  `packages/application/src/feedback/invite.ts:170`.)* Ekran yalnız tamamlama primini gösteriyor.

- [ ] **MB-18 · Tüm puan senaryolarının uçtan uca denetimi.** Kapsam: sipariş · ürün yorumu ·
  keşif turu · davet (referans) · ziyaret · günlük tavan (`points_daily_cap`) · B2B'de puan
  verilmemesi · ikinci kez tamamlamada puan verilmemesi · kupona çevirme eşiği
  (`points_redeem_min` = 500, `points_cent_value`). Her senaryo için: **motor ne yazıyor · ekran
  ne diyor · ikisi tutuyor mu.** Bugünkü turda yalnız keşif ve geri bildirim ölçüldü; ikisi de
  tutmadı — bu, kalanların da ölçülmesi için yeterli sebep.

- [ ] **MB-19 · Puan/teşekkür kartının tasarımı elden geçecek (kullanıcı kararı 11.08).**
  Sipariş ya da ürün yorumu sonrasında kazanılan puan + mevcut bakiyeyi gösteren ekran
  (`screens/feedback/feedback-screen.tsx` sonuç bloğu; cihaz görüntüsü 11.08). İstenen:
  **ortadaki kart büyüsün ve çevresindeki metinleri de içine alsın** — bugün kalp ve başlık kartın
  DIŞINDA, kartın içinde yalnız üç satır var. Görsel karar `.dc.html`den alınacak.

---

## 5. Fiyat ve sayı tutarlılığı

- [ ] **MB-20 · Katalog kartındaki fiyat ile detayın açılış fiyatı farklı.** **Ölçüldü:** kart
  *4,11 €* gösterdi, detay *6,80 €* (450g) seçili açıldı. Kartta **"…'dan" eki yok** — oysa aynı
  ürün sayfasında aile kartı *"Cevizli 4,82 €'dan"* diye doğru yazıyor.
  **Zaten açık bir talep var:** `docs/talep/musteri-liste-fiyati-baslangic.md` (denetim → müşteri,
  09.08) aynı iki maddeyi web için istiyor: (1) kartta "…'dan" eki, yalnız çok boylu üründe;
  (2) detay AYNI boyu seçili açsın. **Native yüzeyde de aynen geçerli** ve burada ölçüldü.

- [ ] **MB-21 · Sepette asgari sepet uyarısı ekrandaki toplamla çelişiyor.** **Ölçüldü:** ekranda
  `Toplam 3,80 €`, hemen altında `Asgari sepet 40,00 € — 33,20 € eksik`. Eksik, indirim ÖNCESİ ara
  toplamdan (6,80) hesaplanıyor; müşteri 36,20 bekliyor. Değer uçtan geliyor
  (`missingForMinBasketCents`), yani karar eşiğin hangi tutara bakacağı: ya cümle tabanını söylesin
  ya eşik toplamdan hesaplansın.

- [ ] **MB-22 · Sepetteki indirimin kaynağı söylenmiyor.** *"İndirim · Bayram Sofrası −3,00 €"*
  satırı, müşteri hiçbir kupon girmeden çıkıyor; ürün sayfası bu ürünün kampanyalı olduğunu
  söylemiyor. Ürün sayfası ile sepet aynı şeyi söylemeli.

- [ ] **MB-23 · Vitrindeki bölge ile sepetteki teslimat adresi farklı yer gösteriyor.**
  Vitrin başlığı *"67000 STRASBOURG"*, sepet *"12, 10115 Berlin"*. Biri cihazdaki onboarding
  koduna, öteki kayıtlı adrese bakıyor. Hangisinin bağlayıcı olduğu müşteriye anlatılmıyor.
  *(Aynı ekranda bir de yer adının kaybolduğu bir kare yakalandı: "67000 STRASBOURG" yerine yalnız
  "67000". Tekrarı ölçülmedi.)*

- [ ] **MB-24 · Fiyat değişti bildirimi** (`DOMAIN §5`: fiyat arttıysa müşteriye söylenir ve onay
  istenir; düştüyse sessizce uygulanır) — `design/BACKLOG.md` §1'den devralındı. `CartItem.unitPrice`
  yazılıyor ama karşılaştırılmıyor; native sepette de karşılığı yok.

---

## 6. Yerleşim ve tasarım

- [ ] **MB-25 · Koleksiyon bandı uzun başlıkta sayaç satırını kırpıyor.** **Ölçüldü:** dört
  satırlık başlıkta *"23 çeşit ›"* satırının yalnız üst yarısı görünüyor, altını sonraki bant
  boyuyor. Sebep: sabit `132 dp` yükseklik (`screens/home/collection-band.tsx:115`) + alt başlıkta
  satır sınırı yok. **Dikkat:** yükseklik serbest bırakılamaz — üst katman dairesi
  `index * collectionBand` ile konumlanıyor (`:97`); ya başlığa satır sınırı konur ya ikisi birlikte
  ölçülür.

- [ ] **MB-26 · Şirket bilgileri alanları dolduktan sonra etiketsiz kalıyor.** Yalnız yer tutucu
  var; "67380" ve "LINGOLSHEIM"in ne olduğu içerikten tahmin ediliyor. Form kitinin etiketli alan
  deseniyle karşılaştırılmalı.

- [ ] **MB-27 · Vitrin altındaki iki davet kartı iki ayrı görsel dilde.** Keşif kartı canlı
  terracotta kesikli çerçeve, Profesyonel kartı soluk gri — ikincisi **devre dışı gibi** duruyor.
  İkisi de aynı işi yapıyor (bir sayfaya davet).

- [ ] **MB-28 · Ürün varyantlarının sırası düzensiz.** Ölçülen sıra: `450g · 225g · 2500g · 1250g`
  — ne artan ne azalan. MB-20 ile aynı turda (hangi boyun seçili açılacağı kararıyla birlikte).

- [ ] **MB-29 · Görselsiz koleksiyon/paket kartında ekranın yarısı kadar tek harf çiziliyor**
  ("Y", "F"). Yedek gösterim bilinçli ama fotoğraflı kartların yanında arıza gibi duruyor.
  Bağlantılı: `design/BACKLOG.md` §1 — **boş sepet kahraman görseli** (native 180×140) ve
  **paketler kahraman görseli** (3:2) hâlâ görselsiz.

- [ ] **MB-30 · Unistyles uyarısı kütükte tekrarlıyor:** `we detected style object with 2 unistyles
  styles … use array syntax instead of object syntax`. Hangi bileşen olduğu bulunup düzeltilecek.

---

## 7. İçerik ve dil

- [ ] **MB-31 · Katalog Türkçe yüzeyde tamamen İngilizce ve toptancı dilinde.** Ölçülen örnekler:
  *"Artisan Lemon Cake"*, *"Assorted Baklava"*, *"12-slice frozen profiterol cake … Dark chocolate
  horeca dessert, wholesale supply and private label"*, *"Ideal for retail and small horeca use"*.
  Bunlar tedarikçi/B2B metinleri; müşteri yüzeyinde görünüyor. **Kaynağı veri mi çeviri düşüşü mü
  ölçülmedi** — önce o ölçülmeli, sonra karar (katalog çevirisi mi, yedek dil kuralı mı).

- [ ] **MB-32 · Süresi dolmuş davet ile bozuk bağlantı aynı cümleyi alıyor:** *"bağlantı eksik ya
  da eskimiş olabilir"*. Süresi dolmuş davete kendi cümlesi gerekiyor.

- [ ] **MB-33 · Ekran başlığı "Professionnels"** — üç dilde de aynı. Web'in kararıyla tutarlı
  (orada da program adı), ama native başlıkta tek başına duruyor ve Türkçe yüzeyde ne olduğu
  anlaşılmıyor; web meta başlığı açıklama ekliyor. *Karar maddesi, hata değil.*

---

## 8. Genel backlog'dan devralınan, native müşteriyi ilgilendiren maddeler

Bunlar `design/BACKLOG.md`'de duruyor; kopyalanmadı, **buradan işaret ediliyor** (tek kaynak orası).

| Ne | Durum | Kaynak |
| --- | --- | --- |
| **"Günün fırsatı" bandı** — native vitrinden kaldırıldı, kampanya modeli kararı bekliyor (a/b/c şıkları) | karar bekliyor | `design/BACKLOG.md` §2 |
| **Boş sepet kahraman görseli** (native 180×140) · **Paketler kahraman görseli** (3:2) | görsel künyesi yok | §1 |
| **`professionals_hero` görseli** — arka ucu yazıldı (`site_image`, 09.08), görsel yok | bekliyor | §1 → MB-10 |
| **Sepet teslimat satırı** ("Teslimat: Ücretsiz" / tutar) | checkout adres adımına bağlı | §1 |
| **Fiyat değişti bildirimi** | kodlanmadı | §1 → MB-24 |
| **Hesapta "sonraya kaydedilenler" + bölge haberi kartı** | veri hazır (`cart.saved_items`, `zone_notice`) | §1 |
| **Bölge haberi tetikleyicisi** (bölge genişleyince tek e-posta) | `14-bildirim` bekliyor | §1 |
| **Paketler listesi etiket çipleri + süzgeç** | paketin etiket alanı yok | §1 |
| **B2B sipariş şablonları** (boş sepette "Haftalık standart · Yükle") | şablon modeli yok (`07`) | §1 |
| **Bildirimler ekranı** | web şeridinin bildirim tablosu/uçları bekleniyor | `docs/talep/bildirim-modulu-web-mobil.md` |

---

## 9. Yanlış alarm diye ELENENLER (11.08 turunda ölçüldü, tekrar açılmasın)

- **Puan sistemi vardır.** Hesap ekranı *"Puanlarım · 500 puan = 5,00 € indirim kuponu"* gösteriyor
  ve `points_entry` defteri işliyor. Turun başında "uydurma puan cümlesi" diye not alınmıştı;
  ölçünce yanlış çıktı. *(Ekranların gösterdiği SAYILAR yanlış — o ayrı, MB-15..18.)*
- **Geri bildirim ucu yavaş değil** — `GET /api/v1/feedback/:token` üç ölçümde 26–165 ms. Uzun
  duran iskelet geliştirme derlemesinin ilk mount'u.
- **`feedback_purchase`ın iki kez yazılması hata değil** — kart başına + tamamlama primi, gerekçesi
  `packages/application/src/feedback/invite.ts:170`.
- **Ekranın sağ alt köşesindeki dişli simgesi uygulamanın değil** — test cihazının kendi yardımcı
  topu; ekran görüntülerinin hepsinde aynı yerde duruyor.

---

## 10. Önerilen sıra

1. **MB-01 + MB-02** — klavye tuzağı ve kapanan alan. Tek turda, 13 dosya. En ucuz, en geniş kazanç.
2. **MB-04 + MB-05 + MB-07 + MB-08 + MB-11** — 21.31'in açık kalanları; dilim **commit edilmeden**
   kapanırsa git geçmişi bütün olur.
3. **MB-03 → MB-13** — adres formunun yeniden yüklemesi ve oturumun misafire düşmesi; ikisi de
   **ölçüm işi**, düzeltme işi değil. Sebep çıkmadan kod yazılmaz (CLAUDE §0).
4. **MB-06** — ortak adres bloğu (BAN önerili) başvuru formuna. MB-03 kapandıktan sonra.
5. **MB-15..MB-19** — puan sisteminin komple denetimi + teşekkür kartının yeniden tasarımı.
6. **MB-20 + MB-28** — liste fiyatı/"…'dan" eki ve varyant sırası; web talebiyle (`musteri-liste-
   fiyati-baslangic.md`) **aynı turda**, iki yüzey ayrışmasın.
7. **MB-21 + MB-22 + MB-23** — sepetteki sayı ve yer çelişkileri.
8. **MB-31** — katalog dili; önce ölçüm (veri mi, yedek dil mi), sonra karar.
9. Kalan yerleşim/içerik maddeleri ve §8'in görsel bekleyenleri.
