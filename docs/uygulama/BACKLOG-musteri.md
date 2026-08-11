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

- [x] **MB-01 · Klavye açıkken düğmeye ilk dokunuş yutuluyor** → **KAPANDI, görev `(21.33)`**
  (11.08). Klavye açıkken bir düğmeye basıldığında yalnız klavye kapanıyor, düğmenin işi
  çalışmıyordu. **Ölçüldü, iki ekranda birebir:** Profesyonel → "Bul" ve Geri bildirim →
  "Değerlendirmeyi tamamla"; ikincisi **veri kaybettiriyordu** (müşteri yorumunu yazıp bastığını
  sanarak çıkarsa değerlendirme hiç kaydedilmiyordu).
  **Sebep:** `ScrollView`in `keyboardShouldPersistTaps` varsayılanı `'never'`; tuzak
  `screens/support/new-ticket-sheet.tsx` künyesinde zaten çözülmüştü ama kural yayılmamıştı.
  **Kapsam ölçülerek daraltıldı — 40 kaydırıcıdan 10'u.** Buradaki ilk "13 dosya" sayımı YANLIŞTI:
  alanı çocuk bileşende olan ekranı kaçırıyor, alanı çekmecede olanı boşuna sayıyordu. Gerekçe ve
  dokunulmayanların listesi `(21.33)` görev satırında.
  **Doğrulama cihazda:** aynı iki senaryo tek dokunuşla çalıştı; geri bildirim yorumu veritabanında
  doğrulandı, test verisi geri alındı.

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

---

## 11. Mobil şeridin okuması — dört madde tek karara bağlı (11.08)

> Bu bölüm listeyi yargılamıyor, **grupluyor**: aşağıdaki maddeler ayrı ayrı yapılırsa aynı iş üç
> kez kurulur. Her başlıkta ölçüm var; ölçmediğim yerde "ölçülmedi" yazıyor.

### A. MB-01'in yayılımı 13 değil 39 — ve dosya dosya prop eklemek yanlış çare

**Ölçüldü (11.08):** `keyboardShouldPersistTaps` ayarı `ScrollView` kullanan **39** ekranın yalnız
**birinde** var (`support/new-ticket-sheet.tsx`). Listedeki 13, "kaydırma kabı ile metin alanı AYNI
dosyada" olanlar; kalan 26'da alan bir alt bileşende yaşıyor ve arama onları görmüyor.

**Kanıt, listenin kendi içinde:** MB-01 arızayı **Profesyonel → "Bul"** düğmesinde ölçmüş, ama
`professionals-screen` 13'lük listede YOK. Sebebi tam olarak bu: o dosya `ScrollView`u tutuyor,
`TextField`ları `application-form.tsx` çiziyor. Yani liste doğru ölçülmüş bir arızayı, yanlış
ölçülmüş bir yayılımla eşleştiriyor — 13 dosya düzeltilse Profesyonel formu **düzelmezdi**.

**Çare de değişiyor.** 39 dosyaya aynı prop'u yazmak CLAUDE §1'in yasakladığı duplikasyondur ve
40'ıncı ekranı yazan kişi onu unutur — bugün 39/40 unutulmuş olması bunun kanıtı. Doğrusu kaydırma
kabını **kitten tek bir bileşene** almak (`components/ui/`), ayarı orada bir kez vermek ve ekranların
ham `ScrollView`u kullanmasını lint ile kapatmak. O zaman MB-02 (klavyenin alanı kapatması) da aynı
bileşenin içinde çözülür — `KeyboardAvoidingView` bugün yalnız `bottom-sheet.tsx`te kurulu ve
tam-ekran formlarda karşılığı yok.

**Ama MB-01 ile MB-02 "tek tur" DEĞİL.** MB-01 tek satırlık bir ayar; MB-02 platform davranışı
(`adjustResize` + odaklanan alana kaydırma) ve iOS/Android'de ayrı ölçüm ister. Aynı bileşende
buluşurlar, aynı sürede bitmezler.

### B. MB-15..MB-18'in ekseni "sayı yanlış" değil, **"ekran kimin sayısını okuyor"**

Üç maddenin kökü aynı değil, ama tek bir kuralla ayrılıyorlar:

| madde | ekran ne yapıyor | kök |
| --- | --- | --- |
| MB-15 (vitrin "+10 puan") | sabit metin | ayara hiç bakmıyor |
| MB-16 (keşif +6 ≠ 8) | sunucunun `pointsAwarded`ını topluyor — **desen DOĞRU** (`use-discover.hook:120`) | toplama bir cevabı kaçırıyor; **sebep ölçülmedi** |
| MB-17 (geri bildirim +5 ≠ 30) | yalnız tamamlama primini gösteriyor | eksik okuma, hesap hatası değil |

Yani MB-18'in denetimi "ekran ne diyor" diye değil, **"ekran sunucunun yazdığını mı okuyor, yoksa
kendisi mi hesaplıyor"** diye yapılmalı. Bu tek soru dokuz senaryonun dokuzunu da kapsıyor ve
gelecekte eklenen onuncuyu da — çünkü kural ekranın değil, sözleşmenin kuralı olur.

**Kayda değer:** motor zaten ayardan okuyor ve `use-discover.hook`un künyesi bu kuralı **zaten
yazmış** (*"kart sayısı × ayar DEĞİL"*). Yani doğru desen biliniyor, tek yerde uygulanmış.

### C. MB-20 + MB-28 + arka-uç notu = **tek sözleşme kararı**

Üçü ayrı madde gibi duruyor ama tek bir eksik alanın üç yüzü:
· MB-20 detay en pahalı boyu seçili açıyor · MB-28 varyant sırası düzensiz · `docs/talep/
not-mobil-detay-en-pahali-boyu-secili-aciyor.md` (arka-uç → mobil) aynı şeyi söylüyor ve **web'de
çözüldüğünü** bildiriyor.

Karar tek: **"birincil boy" hangi alandan okunur.** O alan sözleşmeye girince kartın "…'dan" eki,
detayın açılış boyu ve listenin sırası kendiliğinden aynı kaynağa oturur. Ayrı ayrı yapılırsa üç
farklı sıralama kuralı doğar. `docs/talep/musteri-liste-fiyati-baslangic.md` de aynı turda kapanır —
web ile native ayrışmasın.

### D. MB-03 ile MB-13 gerçekten aynı ölçüm hattında

MB-13 (oturum misafire düşüyor) bir teori istemiyor ama bir **eleme** öneriyor: `useMe` bellekte
duran bir modül deposudur; JS bundle yeniden yüklenirse depo sıfırlanır ve oturum geri okunana dek
ekran "misafir" der. MB-03 tam olarak bir yeniden yükleme arızası. İkisi aynı turda ölçülürse
**tek ölçüm iki maddeyi kapatabilir** — ya da MB-13'ün bağımsız olduğu kanıtlanır. Bugün ikisi de
`BEKLEYEN(21.30)`'a asılı, bu doğru.

---

## 12. Mobil şeridin eklediği kalemler (11.08)

> Yeni ölçülenler + şeridin elinde duran, listeye girmemiş açıklar. Kimlikler MB dizisini sürdürüyor.

- [ ] **MB-34 · Kaydırma kabı kitte yok — 39 ekran ham `ScrollView` kullanıyor.** §11.A'nın işi:
  `components/ui/` altına klavye davranışı doğru kurulmuş tek bir kap, ekranların ona geçmesi ve ham
  `ScrollView` kullanımının lint'le kapatılması. MB-01 + MB-02 bunun içinde çözülür; ayrıca 40'ıncı
  ekranın aynı tuzağa düşmesini yapısal olarak engeller.

- [ ] **MB-35 · Hesap sekmesi `/me` okunurken TAMAMEN BOŞ.** `app/(tabs)/account.tsx:44` yükleme
  anında `return null` veriyor. Künyesi bilinçli (*"misafir daveti yanıp sönmesin"*), ama okuma
  uzarsa müşteri boş bir sekmeye bakıyor — ve MB-13'ün belirtisiyle karışıyor: "hesabım açılmıyor"
  şikâyeti hangisinden geldiği ayırt edilemez. Ekranın `account-skeleton.tsx`i ZATEN VAR, yalnız bu
  dalda kullanılmıyor. `BEKLEYEN(21.14)` olarak kayıtlı.

- [ ] **MB-36 · B2B müşterisi teklif tutarını mobilde GÖRMÜYOR.** Katalog uçları teklif fiyatını
  okumuyor (`BEKLEYEN(21.6)` `catalog.ts`te); bilinçli bir bekletme — yer çözümü terfi etmeden
  indirimi gösterip ödemede yükseltmek verilmiş sözü bozardı. Ama sonuç şu: onaylı B2B müşterisi
  web'de indirimli fiyat görüyor, native'de görmüyor. **Aynı müşteri iki yüzeyde iki fiyat görüyor.**

- [ ] **MB-37 · Ürün detayında YERE BAĞLI stok işareti yok.** Bugün yalnız ürün düzeyli "kargoya
  verilmez" künyesi var; `stockMarkOf` (yere bağlı işaret) ve "haber ver"in rota dışında BÖLGE
  notuna dönmesi yazılmadı (`BEKLEYEN(21.20)`). Müşteri detayda "var" görüp sepette bölge kısıtıyla
  karşılaşabiliyor — MB-23'ün (vitrin bölgesi ≠ sepet adresi) akrabası.

- [ ] **MB-38 · Test defteri boşaltılmadı** (`docs/talep/not-mobil-test-defteri.md`, kullanıcı
  talimatı 09.08: *"testleri sonra topluca yaz"*). İçinde ölçülmemiş bir düşüş var:
  `account-routes.test` TAM koşuda düşüyor, tekil koşuda geçiyor — hata metni hâlâ yakalanmadı.
  Ayrıca "Jest did not exit" uyarısı ve 21.20'nin birim test borcu (`StockMark`, `stockMarkOf`,
  `placeModeOf`). *Müşteri turunu bitirirken bu defter de kapanmalı, yoksa yeşil koşu bir şey
  kanıtlamıyor.*

- [ ] **MB-39 · `knip` mobil pakette dokuz kullanılmayan ihraç tip görüyor** (ölçüldü 11.08):
  `B2bApplicationResult` · `DiscoverSwipe` · `DiscoverClaimResult` · `MeCoupon` ·
  `PaymentSheetInput` · `StripeConfig` · `DiscountSummary` · `SheetState` · `UseHomeOrdersResult`.
  CLAUDE §2 "ölü kod yok" diyor; her biri ya tüketilmeli ya ihracı kapatılmalı. Ucuz, mekanik.

- [ ] **MB-40 · Talep maili kart genişliği açık** (`docs/talep/not-mobil-talep-maili-duzeltildi-
  genislik-acik.md`): arka-uç notun iki bulgusunu kapattı, üçüncüsünün ölçümünü mobile bıraktı ve
  hâlâ ölçülmedi.

- [ ] **MB-41 · Ham hex yalnız `app.config.ts` splash'ta kaldı** (`BEKLEYEN(21.3)`). Tek satır;
  token'a bağlanamıyorsa gerekçesi künyeye yazılıp işaret kapatılmalı.

### Şeridin sıra önerisine eki

§10'un sırası doğru; iki düzeltme öneriyorum:

1. **Adım 1, MB-01 + MB-02 yerine MB-34 olsun.** Aynı işi yapıyor ama 39 ekranı kapsıyor ve
   Profesyonel formunu da gerçekten düzeltiyor (§11.A). MB-02 aynı bileşende ama ayrı ölçümle.
2. **Adım 6'ya (MB-20 + MB-28) arka-uç notu eklensin** ve iş "birincil boy alanı" olarak
   adlandırılsın — üç maddenin ortak kökü o (§11.C).

Bir de kapsam sorusu: §10 dokuz adım sayıyor ve içinde **karar bekleyen** maddeler var (MB-04'ün
e-posta kararı, MB-12'nin adres kararı, MB-23'ün hangi yerin bağlayıcı olduğu, MB-31'in katalog
dili). Bunlar kod işi değil; "son bir koşuda müşteri tarafını bitirmek" için önce o dört karar
verilmeli, yoksa koşu ortasında durur.

---

## 13. SAHİPLİK TABLOSU — çakışmayı önleyen tek yer

> **Kullanıcı kararı 11.08:** *"her kalemde şunu sen şunu sen yapacaksın diye ben söylemeyeceğim"* —
> ajanlar kendi aralarında **not düşerek** anlaşır. Bu bölüm o anlaşmanın kaydı.
>
> **Kural:** bir kalemi alan ajan, işe BAŞLAMADAN önce buraya satırını yazar (ajan · tarih·saat ·
> dokunacağı yollar). **Yolu ilan edilmemiş dosyaya dokunulmaz.** İş bitince satır silinmez,
> `bitti` işaretlenir — ki sıradaki ajan neyin taze değiştiğini görsün. Gerekçe CLAUDE §0: üç şerit
> tek çalışma ağacını ve tek indeksi paylaşıyor; ilan edilmemiş bir dokunuş, başkasının commit'ine
> giren ve `git log`'dan bulunamayan bir kayıptır (yaşandı 08.08).
>
> **Çakışma çıkarsa:** ilan eden önceliklidir; sonra gelen ya bekler ya kapsamını daraltır.
> Bir kalemi bırakan, satırını `BIRAKILDI` yazıp sebebini ekler — sessizce terk etmez.

| kalem | ajan | ne zaman | dokunulan yollar | durum |
| --- | --- | --- | --- | --- |
| MB-15 · MB-16 · MB-17 (ekran yarısı) | mobil | 11.08 · 12:0x | `apps/mobile/src/screens/{discover/**,feedback/**,home/messages.json}` | **bitti** — MB-16 sebebi testle üretildi; MB-17'nin ekran yarısı |
| MB-35 (hesap boş yükleme) · MB-41 (ham hex splash) | mobil | 11.08 · 12:0x | `apps/mobile/src/app/(tabs)/account.tsx` · `apps/mobile/app.config.ts` · `screens/account/account-routes.test.tsx` | **bitti** |
| MB-17 (SÖZLEŞME yarısı — turun toplamı) | mobil/backend | 11.08 · 12:3x | `packages/types/src/contracts/feedback*` · `packages/application/src/feedback/**` · `apps/mobile-api/src/api/v1/feedback.ts` | **alındı** |
| MB-01 (klavye tuzağı) | **başka ajan** | 11.08 — görev `(21.33)` | ~10 ekran dosyası (ölçüyle daraltılmış) | **bitti, commit edilmedi** |
| MB-34 (kaydırma kabını kite alma) | — | — | — | ⛔ **ASKIYA ALINDI** — aşağıdaki nota bak |

### Boşta duran kalemler — alan ilan etsin

**MB-03 · MB-13** ölçüm işi ve **fiziksel cihaz ister**; cihaz mobil şeritte DEĞİL (11.08 itibarıyla
kullanıcı başka ajana verdi). Ölçümü kimin yapacağı ilan edilmeli.

**MB-20 · MB-28** tek karara bağlı (§11.C "birincil boy") ve **web şeridiyle ortak** — açık talep
`docs/talep/musteri-liste-fiyati-baslangic.md`. İki yüzey ayrışmasın diye tek turda kapanmalı;
sahibi web ile mobil arasında `koordinasyon-web-mobil.md`den kararlaştırılacak.

**MB-04 · MB-12 · MB-23 · MB-31** kod işi değil, **karar** işi (§11 sonu). Kararlar verilmeden
kimse almasın.

### ⛔ MB-34 askıya alındı — ve bu tablonun ilk sınavıydı

**Yaşananın kaydı (11.08, iki ajan aynı dakikalarda):** mobil şerit §11.A'da MB-01'in yayılımını
ölçüp "13 değil 39" dedi ve çareyi *"kaydırma kabını kite al"* diye önerdi (MB-34). Aynı saatlerde
BAŞKA bir ajan MB-01'i zaten kapatmıştı: aynı sayım hatasını bağımsız olarak buldu, kapsamı
**40 kaydırıcıdan 10'a** ölçerek daralttı ve görev `(21.33)` olarak yazdı. İki ajan aynı arızayı
iki kez ölçtü; ikinci ölçüm birincisinden daha iyiydi (yayılımı yalnız düzeltmekle kalmadı,
gereksizleri de eledi).

**Sonuç:** MB-34'ün gerekçesi (39 dosyaya prop dağıtmak duplikasyondur) hâlâ geçerli ama ACİL
DEĞİL — arıza kapandı, geriye yapısal bir borç kaldı. Kite alma işi `(21.33)` commit edildikten
SONRA, onun ölçtüğü 10 dosyanın üstüne konuşulur. Şimdi başlanırsa taze ve commit edilmemiş bir
işin üstüne yazılır.

**Tablonun öğrettiği:** bu bölüm bir dakika önce açılsaydı çift ölçüm hiç olmazdı. Kural bu yüzden
sıkı yazıldı — *işe başlamadan* satır yazılır. Bir ajan ölçüme başlarken de yazmalı, yalnız kod
yazarken değil: burada boşa giden şey kod değil, iki kere yapılan ölçümdü.

**Çalışma ağacında ŞU AN duran, commit edilmemiş 10 dosya** (`(21.33)`, başka ajanın):
`catalog-screen` · `courier/day-close-screen` · `courier/delivery-screen` · `feedback-screen` ·
`login-screen` · `management/offer-approval-screen` · `professionals-screen` ·
`warehouse/adjustment-screen` · `warehouse/courier-return-screen` · `warehouse/transfer-screen`.
Bu dosyalara dokunan herkes **Write değil Edit** kullanmalı ve **yol adı vererek commit ederken**
o satırları kendi commit'ine almamaya dikkat etmeli (CLAUDE §0'ın 08.08 künye kayması vakası).
