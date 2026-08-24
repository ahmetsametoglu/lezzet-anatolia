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

- [x] **MB-02 · Klavye, yazılan alanın üstünü kapatıyor** → **KAPANDI, görev `(21.36)`**
  (`9f680bbb`, 11.08). **Ölçüldü:** Profesyonel formunda "Ad soyad" alanına yazarken alan tamamen
  klavyenin altındaydı. **Sebep ilk teşhisten farklı çıktı:** `adjustResize` yazılı ama ÖLÜ — tema
  kenardan-kenara olduğu için Android pencereyi küçültmüyor. Çözüm kite kondu
  (`components/ui/form-scroll.tsx`), form ekranları ona geçti. Kalan geniş göç MB-34'ün işi.

- [x] **MB-03 · Adres formunda sokak alanına yazınca uygulama yeniden yükleniyor**
  → **KAPANDI (kullanıcı kararı 15.08) ve TEKRAR GÖZLEMLENMEDİKÇE BİR DAHA AÇILMAZ.** Sebep
  ölçülerek yakalandı: Metro'nun paket tazelemesi (paralel şerit `apps/mobile` altına yazınca).
  Yani geliştirme ortamının yan etkisi — üretim müşterisini ilgilendirmiyor. Görev `(21.30)`
  aynı kararla kapandı; ona asılı `BEKLEYEN` işaretleri kaldırıldı. Ölçüm zinciri orada duruyor.

  **17.08 · GERÇEK SEBEP BULUNDU — kapanış doğru, gerekçesi eksikti.** Belirti cihaz turunda
  (`05-cihaz-turu-musteri` B4) yeniden üretildi ve bu kez tetikleyici doğrudan yakalandı:
  **arıza uygulamada değil, ÖLÇÜM ARACINDA.** Zincir:
  1. Beyaz ekran gerçekti — `getOrCreateReloadTask() → Starting React Native reload → Running
     "main"` (logcat). Uygulama ÇÖKMEDİ: ne `FATAL`, ne `AndroidRuntime`, ne JS hatası.
  2. **Metro tazelemesi DEĞİLDİ:** reload anında repoda değişen tek bir dosya yok (`find -newermt`
     ile ölçüldü, `apps/mobile` + `packages` boş döndü). Kodda `DevSettings.reload` çağrısı da yok.
  3. Reload'dan **3 ms önce** son tuş: `KEYCODE_R`, `handled=true` — oysa öteki tüm tuşlar
     `handled=false`. Ondan 100 ms önce **ikinci bir `KEYCODE_R`**. Bu, RN'in
     `DoubleTapReloadRecognizer`'ıdır: donanım klavyeden 200 ms içinde iki `R` = reload kısayolu.
  4. Tetikleyen `adb shell input text`: metni donanım klavye olayı olarak (`source=0x101`)
     gönderiyor ve *"St**r**asbou**r**g"* içindeki iki `r` 100 ms arayla düşüyor. İlk denemede
     (*"12 rue de la Paix"*, tek `r`) reload olmamıştı — fark buydu.
  5. **Ayırt edici deney:** aynı metin, aynı ekran, harf harf 600 ms aralıkla → **reload sıfır**,
     BAN önerileri geldi, adres kaydedildi. Hızlı yazımda 3/3 reload, yavaş yazımda 0/1.

  Yani gerçek kullanıcıyı ilgilendirmiyor (dokunmatik klavyede iki harf arası 200 ms'den uzun) ve
  **`__DEV__` dışında kısayolun kendisi yok.** Kayda geçme sebebi ölçüm disiplini: bu maddeyi
  kapatan 15.08 gerekçesi (*"Metro tazelemesi"*) bugün ölçümle çürüdü — aynı belirtiyi bir daha
  gören ajan dosya değişikliği aramasın, **kendi yazma aracına** baksın.
  *(Kapanışın dayanağı olan eski durum notu aşağıda bırakıldı.)*
  **11.08 · 14:1x — ÜRETİLEMEDİ:** kullanıcı cihazda sokak
  alanına üç harf yazdı, öneriler geldi, birini seçti, adres kaydedildi; hiçbir sıfırlanma olmadı.
  Görevin kendi listesindeki üçüncü şüpheli — **geliştirme ortamının kod tazelemesi** — birinci
  sıraya geçti ve mekanizması ölçüldü (uygulama geliştirme yapısı, kod sunucusu dinliyor; mobil
  dosyası kaydedilince paket baştan koşuyor). İlk ölçüm sırasında üç ajan aynı anda mobil dosyalarına
  yazıyordu. *(O gün kapatılmamıştı: ilk ölçüm üç tekrarlı ve kontrol turluydu, kesin kararın ağaç
  sakinken ya da üretim derlemesinde verilmesi bekleniyordu. 15.08'de kullanıcı o turu beklemeden
  kapattı — belirti bir daha gözlenmedi.)*
  **Bu dosyadan bağ:** MB-13'ün (oturum misafire düşüyor) tetikleyicisi de bir yeniden yükleme
  olabilir — aynı tazeleme bellekteki oturum deposunu da siliyor. İkisi aynı ölçümle kapanabilir.

---

## 2. Profesyonel başvurusu (B2B) — 21.31'in açık kalanları

> Dilim 11.08'de yazıldı ve cihazda uçtan uca çalıştı (SIRET → resmî kayıt → gönderim → "inceleniyor").
> Aşağıdakiler o turda ölçülen eksikler; **commit'ten önce kapanmaları önerilir.**

- [x] **MB-04 · Formdaki e-posta hiçbir yere yazılmıyor.** "İletişim" bloğu üç alan soruyor;
  ölçüm (11.08, girişli müşteri): ad ve telefon **yalnız açılan işletme adresine** gidiyor
  (profil bilerek ezilmiyor — gerekçe `packages/application/src/customer/b2b.ts:99`), **e-posta
  ise hiçbir kayda düşmüyor.** Onay ekranı ise *"sonucu e-posta ile bildireceğiz"* diyor: işletme
  adresini yazan başvuran cevabı oraya bekler, cevap hesabın kişisel adresine gider.
  **KARAR VERİLDİ (kullanıcı, 11.08): alan KALKACAK — kimlik, OTP ile doğrulanmış HESAP
  e-postasıdır ve şimdilik her şeye o yeter.** Kullanıcının sözleri: *"profesyonel müşteriler bir
  kere oturum açsın, mailini girsin, OTP kodu gelsin ve onaylasın; bu bizim mail adresimiz olsun"*
  ve faturalar için ayrı adres sorulunca *"şimdilik her şeye yetsin, ileride bu küçük bir özellik
  olarak eklenir"*. Yani **fatura/muhasebe adresi ayrımı BUGÜN YOK ve bilinçli yok** — ileride
  eklenecek küçük bir özellik olarak kaydedildi (MB-44).

  **Kararın dayandığı ölçüm (11.08):** iki e-posta bugün gerçekten ayrışabiliyor, üstelik iki
  yoldan. (1) Misafir: formda X yazıyor → gönderim 401 → kimlik çekmecesi **kendi boş alanıyla**
  açılıyor (`use-otp-sign-in.hook:68`, formdaki X'ten beslenmiyor) → Y ile doğruluyor → hesap Y,
  X çöpe. (2) Girişli: hesap A, formda X → X çöpe, karar maili A'ya. Üstelik motor o alanı
  **ZORUNLU** tutuyor (`b2b-application.ts:156`), yani müşteri hiçbir yere yazılmayacak bir alanı
  doldurmak zorunda ve boş bırakırsa form reddediliyor. Asıl çelişki: formdaki adres
  **doğrulanmamış** bir metin, hesabınki OTP'den geçmiş — ikisini yan yana tutmak, doğrulanmamış
  olanı doğrulanmış gibi okutuyordu.

  **Yapılacak (üç dokunuş):** (a) formdan e-posta alanı kalkar, yerine hesabın doğrulanmış adresi
  gösterilir ("Sonuç şu adrese gönderilecek: …"); (b) misafir yolunda kimlik çekmecesi, müşteri
  formda bir adres yazmışsa onunla açılır — iki kez yazdırmayalım; (c) motorun `email` zorunluluğu
  ve sözleşmedeki alan **web'le birlikte** ele alınır (aynı motoru o da kullanıyor) — alan tümden
  kalkacaksa kararı iki yüzey birlikte verir, koordinasyon defterine yazıldı.

- [x] **MB-05 · Girişli müşteride form ön dolgusu yapılmıyor.** Sözleşme `contactName`/`email`/
  `phone` alanlarını taşıyor ve künyesinde *"Form ön dolgusu: profildeki künye"* yazıyor
  (`packages/types/src/contracts/b2b-api.schema.ts:70`); ekran okuyor ama kullanmıyor
  (`emptyApplication()` ile başlıyor). Müşteri sistemin zaten bildiği üç şeyi yeniden yazıyor.

- [x] **MB-06 · Adres bloğu ORTAK bileşen değil — Fransa adres tamamlama burada yok.**
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

  **KAPANDI (19.08 · `(21.84)`).** Kaydın kendi teşhisi doğruydu ve aynen uygulandı: paylaşılan şey
  formun tamamı değil, **alan bloğu** — `screens/customer-kit/address-fields.tsx`. Blok BAN
  aramasını, posta kodu önerisini, çok yerleşimli kodun şehir listesini ve ülke türetimini taşıyor;
  **kaydı YAPMIYOR.** Adres çekmecesi (kaydeden) ve başvuru formu (kaydetmeyen) artık aynı bloğu
  çiziyor. Sözcükler ve alan biçimi çağırandan geçiyor (`copy`/`shape`/`withLabels`) — paylaşılan
  şey CÜMLE değil DAVRANIŞ; iki ekranın kelimeleri tek sözlüğe hapsedilmedi.
  Yan kazanç: posta kodu + şehir ikilisinin genişliği de tekleşti (başvuru formu kendi 1:1,6
  oranını bırakıp çekmecenin 120 px + flex ölçüsüne geçti).
  *Bağımlılık düştü:* MB-03'ün gerçek sebebi 17.08'de bulundu ve uygulamada değil (`adb input
  text`in tetiklediği RN reload kısayolu), yani taşımanın önünde bir engel kalmamıştı.

- [x] **MB-07 · Ülke seçim rozetlerinin (Fransız/Alman şirketi) tasarımı bozuk.** Kullanıcı
  bulgusu 11.08 + ölçüm: çipin **yatay dolgusu yok**, metin kenarlığa yapışıyor/taşıyor. Doğrusu
  `.dc.html`den alınmalı (Claude Design), improvise edilmemeli (CLAUDE §3).

- [x] **MB-08 · "1 Kaydolun — bir dakikada" adımı girişli müşteriye de gösteriliyor.** Zaten
  hesabı olan müşteriye kayıt adımı anlatılıyor. Web'de aynı adımın gövdesi var ve daha bilgilendirici
  (*"SIRET'inizle bir dakikada — bilgiler resmî kayıttan kendiliğinden dolar"*).

- [x] **MB-09 · Doğrulanmamış: misafir yolu cihazda ölçülmedi.** Kod ve birim testleri kuruyor
  (401 → kimlik çekmecesi → doğrulama → aynı gövdenin yeniden gönderimi), ama 11.08 turunda yalnız
  **girişli** yol yürütüldü.
  → **KAPANDI (15.08), görev `(21.51)` — cihazda baştan sona koşuldu, kod değişikliği YOK.**
  Misafirken: resmî kayıt sorgusu çalıştı (SIRET → `QUALITE` · `67380 LINGOLSHEIM`) → gönderimde
  kimlik çekmecesi açıldı → e-posta + kod → **başvuru kendiliğinden gitti**, form yeniden
  doldurulmadı → *"Başvurunuz alındı · İnceliyoruz"*. Veritabanı kanıtı: `b2b_pending = true`,
  `b2b_applied_at` 11:04:06Z, `company_info` resmî kayıttan.
  **Yanlış alarm elendi:** profilde `phone` boş kalıyor ama bu kasıtlı — numara zaten başka bir
  kayıtta (seed müşterisi) ve telefon tekil kimlik anahtarı; `customer/b2b.ts:86-93` künyesi bunu
  anlatıyor. **Açıklanamayan bir kare** (`send_failed` cümlesi bir kez göründü, ikinci denemede
  aynı kod çalıştı) ölçümle DIŞLANDI ama bulunamadı; ayrıntısı ve `send_failed`in üç ayrı hâli
  birden karşılaması `(21.51)`de yazılı. Cihazda yazılan veri uygulamanın kendi silme akışıyla
  geri alındı (`anonymized_at` 11:09:06Z).

- [ ] **MB-10 · Başvuru ekranının kahraman görseli yok.** `design/BACKLOG.md` §1'de
  `professionals_hero` slot'u tanımlı ve arka ucu 09.08'de yazıldı (`site_image` tablosu + kova);
  görsel künyesi hâlâ boş.

- [x] **MB-11 · "Başvurunuz inceleniyor" gövdesi başlığı birebir tekrarlıyor.** Başlık
  *"Başvurunuz inceleniyor"*, gövde *"Başvurunuz inceleniyor — sonuç e-posta ile."*

- [x] **MB-12 · İşletme adresi sessizce adres defterine ekleniyor.** Başvuru kabul edilince
  müşterinin adres listesine yeni bir kayıt (etiket = şirket unvanı) giriyor; ekran bunu söylemiyor.
  Müşteri bir sonraki checkout'ta tanımadığı bir adres görüyor. *Karar: ya söylenir, ya
  başvuru adresi ayrı tutulur.*

  **KAPANDI (19.08 · `(21.84)`) — ve kaydın bir yeri yanlıştı.** Yazım **onayda değil, başvuru
  GÖNDERİLİRKEN** oluyor (`packages/application/src/customer/b2b.ts`, `submitB2bApplication`), yani
  müşteri kabul edilmese bile adres defterine giriyor. Davranışın kendisi DOĞRU ve gerekçesi kodda
  yazılı: adres yoksa operatörün onay kartındaki rota sinyali *"ölçülemedi"* kalıyor ve bölge
  uyumu görünmüyor. Kusur davranışta değil **sessizlikteydi**.
  Karar: *söylenir.* Adres alanlarının altına tek satır kondu — *"Bu adresi teslimat adreslerinize
  de ekliyoruz — sipariş verirken şirket unvanınızla listede görürsünüz."* (üç dilde). Adresi ayrı
  tutmak seçilmedi: o zaman operatörün sinyali yeniden kör kalırdı ve müşteri aynı adresi ikinci
  kez yazardı.

  **Yan bulgu, ayrı kalem değil ama kayda geçsin:** aynı yazımda ülke `isEuVat ? 'DE' : 'FR'` diye
  TAHMİN ediliyor — AB KDV numarası olan her işletme Almanya sayılıyor. Bugün B2B'nin iki yolu
  (SIRET = FR · USt-IdNr = DE) olduğu için pratikte tutuyor, ama üçüncü bir ülke açıldığı gün
  sessizce yanlış ülke yazacak.

---

## 3. Kimlik ve oturum

- [x] **MB-13 · Girişli müşteriye misafir ekranı gösteriliyor — tetikleyici üretilemedi.**
  → **KAPANDI (kullanıcı kararı 15.08), AMA GÖZLEMDE KALIYOR: peşinden koşulmaz, tekrarlarsa
  yeniden açılır.** MB-03 ile aynı ortak aday geçerli — Metro'nun paket tazelemesi bellekteki
  oturum deposunu da sıfırlıyor; belirtinin her karesi (ekranın "misafir" demesi, soğuk açılışın
  düzeltmesi) buna uyuyor. **Fark MB-03'ten şu:** orada tetikleyici doğrudan yakalandı, burada
  yalnız aynı mekanizmanın bu belirtiyi de açıklaması var — yani kapanış "sebep kanıtlandı" değil,
  "kovalamaya değmez" kapanışıdır. Cihazda bir daha görülürse kayıt yeniden açılır ve ilk adım
  hazır: `useMe`nin `guest`e düştüğü anı ve `authorizedFetch`in yerel 401 kısa devresini
  izlenebilir kılmak (`lib/auth/authorized-fetch` + `screens/customer-kit/use-me.hook`).
  **MB-14'ün savunmacı düzeltmesi bu kayıttan bağımsız olarak yerinde duruyor** — iki doğruluk
  kaynağı ayrışsa bile aynı karede hem ödül hem davet görünmez.

  **Ölçüldü 11.08, iki ayrı kez:** Hesap sekmesi *"Hoş geldiniz / Hızlı doğrulama"* verdi; oysa o
  dakikalarda oturum canlıydı (10:53'te Bearer isteği B2B başvurusunu yazdı, 11:00'da Vitrin
  *"Merhaba, Yaman"* dedi). Soğuk açılış her seferinde düzeltti.
  **Elenenler:** elle "Reload" tetiklemedi · Keşif'e girip çıkmak tetiklemedi.
  **11.08 · 14:1x — MB-03 ile ORTAK ADAY ÇIKTI:** cihazdaki uygulama geliştirme yapısı ve kod
  sunucusu dinliyor; mobil kaynak dosyası kaydedilince paket baştan koşuyor ve **bellekteki oturum
  deposu sıfırlanıyor** — ekranın "misafir" demesi ve soğuk açılışın düzeltmesi tam olarak buna uyar.
  Ölçümün yapıldığı dakikalarda üç ajan aynı anda mobil dosyalarına yazıyordu. Kanıtlanmadı;
  kesin karar ağaç sakinken ya da üretim derlemesinde tekrarla verilir.
  *(O günün notu: sebep ölçülmemişti, teori kurulmuyordu. Sıradaki ölçüm önerisi yukarıdaki kapanış
  notuna taşındı — kayıt yeniden açılırsa oradan devam edilir.)*

- [x] **MB-14 · Keşif bitiş ekranı girişli müşteriye "Giriş yaparsanız… / Hızlı doğrulama"
  gösterdi** — üstelik aynı ekranda *"+6 puan kazandınız"* yazarken.
  → **KAPANDI (14.08). SEBEP DEĞİL, YETERLİ BİR AÇIKLAMA bulundu — ilk yazım fazla iddialıydı ve
  kullanıcı denetiminde düzeltildi (15.08).** Kod düzeyinde belirtiyi açıklamaya YETEN bir
  mekanizma var, ama işlediği ÖLÇÜLMEDİ: 11.08'deki kare ne yeniden üretildi ne de ayrışma anı
  yakalandı (MB-13 zaten "tetikleyici üretilemedi" diye açık). Mekanizma:
  **"giriş yaptım mı" sorusunun uygulamada İKİ AYRI KAYNAĞI var.** Ekran `useMe`nin `signedIn`ini okuyor; ağ katmanı ise Supabase'e KENDİSİ soruyor
  (`maybeAuthorizedFetch` → `auth.getSession()`, `lib/auth/authorized-fetch.ts:57`). İkisi
  ayrıştığı an — jeton hâlâ geçerliyken arayüzün misafire düşmesi — sunucu oyu müşterinin üstüne
  yazıp puanı döndürüyor, ekran ise davet gösteriyor. Yani çelişki bir çizim hatası değildi.
  **Çare, davetin kendi ölçütünü kullanması:** davetin söylediği şey *"bu turun sahibi yok"*tur
  ve bunun kanıtı `signedIn` değil, ödülün yazılıp yazılmadığıdır — motor kimliksiz oya puan
  vermiyor, `pointsAwarded: null` dönüyor (`application/feedback/discover.ts:158`). Koşul artık
  `signedIn || awardedPoints !== null`.
  **MB-13'ü KAPATMAZ** (iki kaynak hâlâ ayrışabilir) ama yalanı kapatır: bir daha aynı karede hem
  ödül hem davet görünmez.
  **DOĞRULANMADI:** değiştirilen dal (ekran misafir sanıyor + puan yazılmış) cihazda üretilemez,
  testi de yok. Mevcut test yalnız *misafir + puan yok* hâlini tutuyor ve geçiyor — yani gerileme
  yok, ama düzeltmenin kendisi **savunmacıdır**.

---

## 4. Puan sistemi — komple ele alınacak (kullanıcı kararı 11.08)

### ★ PUAN SİSTEMİNİN KARARLARI — 11.08 oturumunda kapandı, TEK KAYNAK BURASI

> Aşağıdaki kalemler (MB-15…MB-19, MB-49…MB-58) bu karar setinin parçalarıdır; **kural burada,
> iş orada.** Uygulandığı gün `DOMAIN §14` bu bloktan güncellenir. Değerlerin hepsi `settings`
> satırıdır, koda gömülmez.
>
> **SIRA (kullanıcı kararı 11.08): PUAN SİSTEMİ MOBİL MÜŞTERİ İŞLERİNİN EN SONUNDA.** Kullanıcının
> gerekçesi: *"puan sistemi bir anda büyüdü, kontrol etmek de zahmetli hale geldi."* Doğru okuma —
> bir oturumda yedi kazanma yolu, iki davet türü, tavan ilkesi ve bir de beklemeye alınmış kolektif
> sistem doğdu; bunu parça parça uygulamak aynı motoru defalarca açmak, hepsini birden doğrulamak
> ise ayrı bir iş. **Önce backlog'un öteki kalemleri bitirilir**, puan seti en sona bırakılır ve
> komple uygulanır.
>
> **BU SIRADA WEB ŞERİDİ DAVET İŞİNİ YÜRÜTÜR (kullanıcı kararı 11.08):** *"bu sırada web'de hem
> müşteri daveti hem de sefer daveti konusunda çalışma yapar."* Yani web'den beklenen artık yalnız
> görüş değil, **iş**: bağlantı biçimi, karşılayan rota, uygulamanın adresi sahiplenmesini sağlayan
> dosyalar ve daveti kimliğe bağlayan çağrı. Ayrıntılı liste `docs/talep/musteri-puan-sistemi-web-
> gorusu.md`'de. Mobil taraf sırası gelince o altyapının üstüne bağlanır.
>
> **BUGÜN ÇALIŞAN SİSTEM HÂLÂ ESKİ HÂLİYLE:** sipariş puanı veriliyor, onay ekranı yanlış sayı
> söylüyor, ziyaret puanı native'de yok, davet zinciri kopuk. Karar seti YAZILDI, UYGULANMADI.

**1 · SİPARİŞ PUANI KALDIRILDI (10 puan).** Kullanıcı kararı: *"sipariş verince puan vermeyelim,
puana gerek yok; zaten vermiş olduğu siparişle alakalı ürünlere yorum yapınca puan veriyoruz."*
Bu karar **MB-49'u da kapatıyor** — ekranın yanlış hesapladığı vaat ortadan kalkıyor, çünkü vaat
edilecek bir puan kalmıyor. Onay ekranındaki puan satırı tümden silinir.

**2 · PUAN KAZANDIRAN ALTI DURUM ve YAZILDIKLARI AN:**

| Ne yapınca | Puan | Ne zaman yazılır |
| --- | --- | --- |
| Uygulamaya girince | 10 | **Anında** — günde bir kez (veri kuralı zorluyor: `points_entry_visit_day`) |
| Satın aldığı ürüne yorum yazınca (metinli) | 20 | **Anında** |
| Satın aldığı ürüne yorumsuz beğeni | 5 | **Anında** |
| Keşif turunda oy verince (kart başına) | 2 | **Anında** |
| Arkadaşını getirince (YENİ müşteri) | **500** | Arkadaşın ilk siparişinin **parası alındığında** |
| Komşu daveti (komşu aynı güne sipariş verince) | **100** | Komşunun siparişinin **parası alındığında** |

*Bir üründen çıkabilecek azami 25'tir* (önce beğeni 5, sonra yorum 20) — bilinçli, kod künyesinde
yazılı: *"müşteri önce 👍 der, iki gün sonra yorum yazar"*, iki ayrı eylem iki ayrı ödül.
Aynı ürüne ikinci bir yorum satırı açılamaz (`product_feedback_customer_key`), metni tekrar
düzenlemek de puan getirmez (ödül türü başına tek kayıt).

**2b · "TUR" KAVRAMI PUAN SİSTEMİNDEN ÇIKTI (kullanıcı kararı 11.08).** Tamamlama primi (5 puan)
kaldırıldı. Gerekçe: prim, yarıda bırakmayı engellemek için konur — ama burada **her kart zaten
kendi ödülünü taşıyor**, yani bitirmek doğrusal olarak ödüllendirilmiş durumda. Ağırlığı da yok
(bir yorum 20, prim 5): müşteriyi son karta götüren şey prim değil, o kartın kendi puanı. Üstelik
prim ile "yorumsuz beğeni" AYNI puan sebebini kullanıyordu ve denetimde yanıltıcı oldu — kavramların
üst üste binmesi kodda da görünüyordu.
**Kural artık tek cümle:** *değerlendirdiğin her ürün puan kazandırır — yorum yazarsan 20, sadece
beğenirsen 5.* **"Tur" ARAYÜZDE KALIR** (ilerleme göstergesi: *"4 ürün değerlendirilmeyi bekliyor ·
2/4"*), puan sisteminde kalmaz — teşvik bedavaya elde edilir.

**2c · DEĞERLENDİRİLECEK YENİ ÜRÜN YOKSA DAVET GÖNDERİLMEZ.** 2b'nin doğrudan sonucu ve ölçülmüş
bir arızanın da çözümü. **Ölçüm (11.08, kod okuması — cihazda üretilmedi):** yorum puanı ürüne
bağlı ve ÖMÜRDE BİR KEZ (`product_feedback_customer_key`: müşteri+ürün+bağlam UNIQUE), oysa davet
kartları sipariş kalemlerinden kuruluyor ve "zaten değerlendirilmiş mi" kontrolü YALNIZ o davetin
içine bakıyor (`listByRequest`). Yani aynı ürünü tekrar sipariş eden müşteri kartı hiç
değerlendirilmemiş gibi görüyor, dolduruyor ve **hiçbir puan almıyor** — eski kurguda yalnız 5
puanlık primi alıyordu, yani 85 bekleyip 5 alıyordu. Prim kalkınca doğru çözüm netleşti: yeni ürün
yoksa davet hiç doğmasın.

**2d · AÇIK SORU — SADAKAT ARTTIKÇA ÖDÜL AZALIYOR.** 2c'nin altından çıkan yapısal soru: hep aynı
ürünleri alan müşteri bir süre sonra yorum puanı kazanamaz hâle geliyor, çünkü hepsini çoktan
değerlendirmiştir. Veri yapısı aynı ürüne ikinci yorumu kabul etmiyor, yani "tekrar değerlendirsin"
demek de mümkün değil. O müşteriye kalan tek kaynak giriş puanı ve davetler. **Karar verilmedi** —
sadık müşteriyi ödüllendirmeyi kesen bir sistem doğru mu, ayrıca konuşulacak.

**2f · DEĞER MERDİVENİ (kullanıcı kararı 11.08):** yeni müşteri **500**, komşu daveti **100**.
Oran bilinçli beş kat: kalıcı bir müşteri kazandırmak, bir seferi doldurmaktan değerli — birincisi
yıllarca alışveriş yapar, ikincisi tek seferlik bir verim kazancıdır. **500 aynı zamanda hesap
ekranının zaten verdiği sözü GERÇEK yapıyor** (*"size de 5 € kupon yüklenir"*); vaadi düşürmek
yerine motoru yükseltiyoruz. **100 puanın sonucu:** üç komşu = 300 puan, kupon ise 500 — yani
*"üç komşu çağır, kuponu al"* denemez. Metin sayıyı söyler, vaat uydurmaz.

**2e · BEKLEMEYE ALINDI — "bölgesel dayanışma" (kullanıcı kararı 11.08: *"not alalım ama şu an
gerçekleştirmeyelim, elimize bir miktar data biriksin"*).** Adı kullanıcının; ödülün NEDEN var
olduğunu tek kelimede söylüyor ve müşterinin diline ait — "sefer" bizim lojistik kelimemiz, müşteri
yüzeyinde hiç geçmez.

**Son hâli (geliştirildi, uygulanmadı):** ödül kolektif — o posta kodundan sefere gelen sipariş
sayısı bir barı aşarsa, o seferden sipariş veren HERKESE sipariş tutarının bir yüzdesi puan yazılır.
**Bar MUTLAK DEĞİL GÖRELİ:** o posta kodunun kendi normalinin katı (ör. 1,25× → %1, 1,5× → %2 tavan).
Gerekçe kullanıcının itirazı: *"Paris'in merkezindeki ile kırsaldaki bir köy aynı olamaz — adaletsizlik
hissi bölgeler arasında da oluşur."* Göreli bar üç sorunu birden çözüyor: bölgeler arası adalet
(herkes kendi normaliyle yarışır), büyüme (bar bizimle yükselir, elle güncellenmez) ve demografi.
**Demografi özellikle önemli:** nüfus verisi etnik/kültürel yapıyı vermiyor ve biz belli bir kitleye
hitap eden kültürel bir gıda zinciriyiz — *"doğrudan nüfus üzerinden yürüyemiyoruz"*. Kendi
verimiz ise sonucu doğrudan ölçüyor: nüfus "kaç kişi yaşıyor" der, bizim sayımız "kaç kişi bizden
alışveriş yapıyor" der.
**Ekranda oran GÖRÜNMEZ, sayı görünür:** *"bu seferde mahallenizden 5 sipariş var — 7'ye ulaşırsa
dayanışma açılır."* Kural içeride göreli, dışarıda mutlak.
**Soğuk başlangıç:** geçmişi olmayan posta kodunda `zone_notice` ("buraya da gelin" kaydı) ve
`postal_code_demand` sinyalleri kullanılır; yetmezse düşük bir taban, birkaç sefer sonra kendi
normali oluşur.
**Bilinen riski:** kendi normalini geçmek şeklinde kurulunca başarı barı yükseltir ("başardığın için
cezalandırıldın" hissi). Çaresi normalin penceresini uzun tutmak — son iki seferin değil son iki ayın
ortalaması.
**Neden bekliyor:** bar da, kademe de gerçek sipariş verisi ister; bugün canlı veri YOK (elimizdeki
tohum verisidir). Veri birikince yeniden açılır.

**2e-eski · DEĞERLENDİRİLDİ, SEÇİLMEDİ — sabit eşikli ilk hâli (11.08).**
Sefer doldurmanın alternatif kurgusu konuşuldu: sipariş verildikten sonra müşteri o posta kodundan
o sefere kaç sipariş geldiğini görüyor; **eşik aşılırsa** (fikirde 30) o posta kodundan sipariş
veren HERKESE sipariş tutarının **%5'i** kadar puan yazılıyor. Eşik sabit değil, **Fransa nüfus
verisinden posta koduna göre hesaplanacaktı**; sayaç 30'da duruyor, ötesi görünmüyor.

**Güçlü tarafları:** tek cümlede anlatılır, ilerleme görünür, **bugün inşa edilebilir** — yalnız
sayım gerekiyor, bağlantı altyapısı beklemiyor (bireysel sistem bekliyor). Nüfusa göre ölçeklenen
eşik, sabit bir sayının her posta koduna haksızlık etmesini de çözüyordu. Sayacın tavanlı olması
ticari hacmin açığa çıkmasını sınırlıyordu.

**SEÇİLMEME GEREKÇESİ (kullanıcı): adaletsizlik hissi mekanizmanın kalbinde ve tasarımla
giderilemiyor.** Üç komşusunu arayan ile hiçbir şey yapmayan aynı ödülü alıyor; 30 kişilik bir
hedefte bireyin katkısı önemsiz göründüğü için herkes başkasının uğraşmasını bekler — kolektif
teşviklerin klasik çöküşü. İki yan sorun daha ölçüldü: **hep ya hiç** (29 siparişte kimse hiçbir şey
almaz, hayal kırıklığı toplu olur) ve **maliyet verimsizliği** — zaten sipariş verecek olanlara da
ödendiği için ek sipariş başına maliyet bireysel sistemin kat kat üstüne çıkar.

**Kayda geçmesinin sebebi:** fikir yeniden bulunup aynı yol tekrar yürünmesin. Nüfustan eşik
hesaplama parçası ayrı olarak kıymetli — müşteriye ödül vermek için değil, **bölge genişletme
kararlarında** işe yarayabilir.

**2g · KOMŞU DAVETİNİN ARAYÜZ KURGUSU — ONAYLANDI (kullanıcı 11.08: *"bu kurgu bana doğru
geliyor"*). ŞİMDİ YAPILACAK olan bu.**

**Nerede çıkar:** sipariş tamamlandı ekranında, teslimat gününün hemen altında —
*"Salı günü sokağınıza geliyoruz. Komşunuzu çağırın — aynı güne sipariş veren her komşu için 100
puan."* + tek düğme.
**TEK YERDE BIRAKILMAZ:** sipariş verirken müşterinin aklına komşusu gelmeyebilir; aynı kart
**süren sipariş ekranında** da durur, sefer kapanana kadar — *"Pazartesi akşamına kadar sipariş
alınıyor · 1/3 komşunuz sipariş verdi."*
**Paylaşım telefonun KENDİ penceresiyle:** rehber okunmaz, e-posta sorulmaz, uygulama içi kişi
seçici yazılmaz. Müşteri komşusuyla zaten nasıl konuşuyorsa öyle gönderir.
**Komşunun gördüğü karşılama (web):** *"Komşunuz Yaman sizi davet etti. Salı günü aracımız
sokağınızda olacak; o güne yetişecek şekilde sipariş verirseniz ikiniz de kazanırsınız."*
**Davet edene geri bildirim:** komşu sipariş verince — *"Komşunuz sipariş verdi, 100 puan yolda,
ödemesi alınınca hesabınıza geçecek."*
**"SEFER" KELİMESİ MÜŞTERİYE HİÇ GÖRÜNMEZ** — her yerde "Salı günü" yazar.

**2h · DOĞRU ZAMANDA DOĞRU YÖNLENDİRME — puanın öğretilme ilkesi (kullanıcı kararı 11.08).**
*"Başta hepsini ifade etmek kafa karıştırıcı olabilir; doğru zamanda doğru puan kazanma yöntemine
yönlendirebiliriz."* Onboarding'de **tek cümle** geçer (*"alışveriş ettikçe, yorum yazdıkça ve
komşunuzu çağırdıkça puan biriktirirsiniz"*) — liste yok, sayı yok. Öğretme işini o an yapılabilecek
tek şeyi söyleyen bağlam mesajları yapar:

| An | Ne söylenir | Puan |
| --- | --- | --- |
| Sipariş tamamlandı | "Salı günü sokağınıza geliyoruz, komşunuzu çağırın" | 100 / komşu |
| Teslimattan sonra (bildirim + uygulamada bant) | "Aldığınız ürünlere yorum yazın" | 20 / ürün |
| Uygulama açılınca | Sessiz — küçük bir tost | 10 |
| Yeni keşif kartı geldiğinde | "3 yeni lezzet oylanmayı bekliyor" | 2 / kart |

Hesap ekranındaki puan kartı **başvuru yeri** olarak kalır: öğretmez, merak edene cevap verir
(MB-55'in sayfası da bu role hizmet eder).

**AÇIK BAĞIMLILIKLAR (ölçüldü 11.08):** (a) teslimat sonrası yorum daveti bugün e-posta ile gidiyor,
**uygulama bildirimi altyapısı yok** — o gelene kadar uygulama açıldığında görünen bir bant yapılır,
bedava; (b) davet bağlantısının **karşılayan sayfası web'de** ve henüz yok — komşu davetinin
çalışması için gereken TEK altyapı bu, gerisi mobil taraftadır (MB-53).

**3 · "PARA ALINDIĞINDA" NE DEMEK:** kartla ödeyende sipariş anı, kapıda ödeyende teslimat anı.
Tek cümlelik kural: **puan, para gerçekten alındığında yazılır.** Sömürülemez — bedava sipariş
verip puan üretmek mümkün değil. Bekleme hissi ayrı çözülür: komşu siparişi verdiği anda davet
edene *"komşun sipariş verdi — 100 puan yolda, ödeme alınınca hesabına geçecek"* gösterilir; puan
yazılmaz ama görünür olur.
*(Bu, "sipariş anında yaz + teslim edilmezse geri al" ara kararının yerini aldı — sipariş puanı
kalkınca müşterinin KENDİ alışverişi için beklediği puan kalmadı; geriye kalan tek gecikme
başkasının hareketine bağlı olanlar, orada bekleme zaten doğal.)*

**4 · GÜNLÜK TAVAN İLKESİ (kullanıcı onayı 11.08): tavan yalnız PARA ÖDENMEDEN yapılabilen
eylemleri kapsar; parayla gelen ödüller tavanın DIŞINDADIR.**
Gerekçe: bedava yapılabilen yalnız iki şey var — uygulamaya girme (zaten günde bir) ve keşif oyu
(bizim yayınladığımız kart sayısı kadar). Ötekilerin hepsinin arkasında ödenmiş bir sipariş var;
*kimse bize para ödeyerek bizi sömüremez.* Tavanın içinde kalan azami bugün **18 puan**
(giriş 10 + 4 aday kart × 2), dolayısıyla ~~`points_daily_cap` **100'de kalır**~~ — yükseltmeye
gerek yok, ve en çok istediğimiz davranışları (yorum, davet) artık hiç reddetmez.
**GÜNCELLENDİ (kullanıcı kararı 15.08): `points_daily_cap` = 270.** Kullanıcı tavanın 100
olmadığını hatırlıyordu; beş kaynak (canlı ayar · migration · iki kod varsayılanı · git geçmişi)
tarandı ve hepsi 100 diyordu, `250`/`270` puan bağlamında hiçbir dosyada geçmiyordu — **ama
`docs/talep/` repoya gitmediği için silinmiş bir notun izi kurtarılamaz**, o yüzden "yok" diye
kapatılmadı. Kullanıcı sayıyı doğrudan 270 yaptı: *"sonra bakalım gene."*
**Bugünkü davranış DEĞİŞMİYOR** — tavana tabi azami kazanç 18 puan, yani 100 de 270 de hiçbir
ödülü reddetmiyor; sayı yalnız ileriye nefes payı. Kapsam kararı (§4'ün kendisi) aynen geçerli.
**Neden önemliydi:** tavan kırpmıyor, ödülün TAMAMINI reddediyor. Eski kurguda dört ürününü
yorumlayan müşteri üçüncüde duvara çarpıp dördüncü yorumundan hiçbir şey alamıyordu, sebebini de
göremiyordu.

**5 · DAVET SAYISINDA SINIR YOK.** Ölçüldü: bugün ne günlük ne toplam sınır var. Konulmasına da
gerek yok — her davet ödülü karşı tarafın gerçekten para ödemesini şart koşuyor, yani 20 arkadaş
getiren müşteriye 10 € ödüyoruz ama karşılığında 20 kişi alışveriş yapmış oluyor. **Kişi başı
0,50 € müşteri kazanma maliyeti**; engellenecek değil, istenen davranış.

**6 · KEŞİF, "METİN VARSA YORUM PUANI" KURALININ DIŞINDA (kullanıcı kararı 11.08):**
*"metin varsa yorum puanı ile keşfin bir alakası yok."* Bugünkü kural (`feedbackPointsReason`)
metin varsa bağlama BAKMADAN 20 puan yazıyor; keşfe bir gün yorum alanı eklenirse kimse fark
etmeden 10 kat puan dağıtan bir kapı açılırdı. Keşif kartı **her hâlükârda 2 puan**.

**7 · İADE EDİLİRSE PUAN GERİ ALINIR.** Tek geri alma ihtiyacı bu — puan zaten para alınmadan
yazılmadığı için başka bir geri alma senaryosu yok. **Teknik engel ölçüldü (11.08):** defterde
`(müşteri, sebep, kaynak)` üçlüsü UNIQUE (`points_entry_source_key`), yani aynı kayda ters işaretli
ikinci bir satır yazılamaz; `manual` sebebi de veri kuralıyla PERSONEL ve NOT istiyor, otomatik
geri almada ikisi de yok. ~~**Çözüm:** sebep enum'una geri alma türü eklenir.~~ Ayrıca
`points_entry_daily_idx` yalnız pozitifleri saydığı için tavan geri sarmıyor — tavan artık davet
ödüllerini kapsamadığından bu sorun da küçüldü.

**7b · İLKE NETLEŞTİ (kullanıcı kararı 17.08): "kazanılmış ödül geri alınmaz" ile bu karar
ÇELİŞMİYOR — çünkü geri alınan şey HENÜZ HAK EDİLMEMİŞTİR.** Kullanıcının cümlesi: *"hak edilmiş
puan alınamaz evet, ama henüz hak edilmemiş puanlar vardır."* Verdiği örnek komşu daveti: komşu
sipariş verdi, **kapıda ödemeyi** seçti, teslimat gerçekleşmedi, sipariş iptal oldu — davet edenin
100 puanı hak edilmiş sayılmaz. Ölçüt tek cümlede duruyor ve karar 3'ün aynısıdır: **ödülü hak
ettiren şey paranın alınmış OLMASI, alınmış olması ise kalıcı bir olgu değil** — iade edilirse
geriye döner, ödül de onunla döner. `DOMAIN §14`'ün *"kazanılmış ödül geri alınmaz"* cümlesi
kazanılmış olanı korur; burada kazanç zaten geri sarılmıştır.

**7c · ÖLÇÜLDÜ (17.08) — kullanıcının verdiği örnekte boşluk YOK, ama endişesi başka yerde
GERÇEK.** Kod okundu (`order/payment.ts:171`): ödül yalnız `paymentStatus` **`paid`e DÖNDÜĞÜ** anda
yazılıyor. Yani *kapıda ödeme + iptal* akışında `paid` hiç olmaz → puan hiç yazılmaz → geri
alınacak bir şey de yoktur. **Açık olan yol kartla ödeme:** para sipariş anında alınır, durum
`paid` olur ve ödül yazılır; sipariş sonradan iptal edilip para iade edilince
`statusOf` (`domain-core/payment/payment-status.ts:133`) durumu `refunded`e çevirir — ama
`finalize` yalnız `if (derivation.status === 'paid')` diye baktığı için **`paid`ten ÇIKIŞ hiçbir
şey tetiklemiyor.** Puan defterde kalıyor.

**7e · İKİ ÖDÜLÜN GERİ ALMA ÖLÇÜTÜ AYNI DEĞİL (kullanıcı sorusu 17.08 — kusur buldurdu).**
Kullanıcı *"iptal iki kere tetiklenip fazladan 100 puan silinir mi"* diye sordu; komşu ödülünde risk
yoktu (üç katman: durum değişimi kapısı · `hasReversalFor` · `points_entry_reversal_key`, cihazda
rollback'li işlemle kanıtlandı) **ama getiren ödülünde başka bir aileden gerçek bir kusur çıktı.**
Komşu ödülünün kaynağı SİPARİŞTİR (`refId = order.id`), getiren ödülününki KİŞİDİR
(`refId = newCustomerId`) — ve bir kişinin birden çok siparişi olur. Koşulsuz geri alma şunu
yapardı: A'yı B getirir, A'nın ilk siparişi ödenir (B'ye 500 yazılır), A ikinci siparişini verip
iptal eder → **ikinci siparişin iptali B'nin ilk siparişte hak ettiği ödülü silerdi.** Ölçüt ödülün
kendi anlamından türetildi: kişinin ödenmiş başka bir siparişi kaldıysa *"bu kişi müşterimiz oldu"*
olgusu sürüyordur (`countPaidForCustomer > 0` → ödül durur). Kullanıcının kuralı:
*"benim davet ettiğim kişi bana davet ödülü kazandırabilmesi için öyle veya böyle bir tane başarılı
sipariş gerçekleştirmesi lazım."*

**7f · KOMŞU DAVETİ GETİREN ÖDÜLÜNÜ DE DOĞURUR — kod bunu YAPMIYORDU (ölçüldü 17.08).**
Kullanıcının sorusu: *"komşumu bir sefere davet ettim, hesabı yok, geliyor kayıt oluyor, o sefere
değil BAŞKA sefere sipariş veriyor — davet puanımı alabiliyor muyum?"* **Cevap hayırdı ve bu bir
boşluktu.** Ölçüm: `referred_by`yi yazan tek yol `linkReferrer`dı ve onu yalnız
`attachReferralOnLogin` çağırıyordu — o da **`referralCode`** ile çalışıyor; komşu daveti bağlantısı
ise kod değil **token** taşıyor (`neighborInviteUrl`). `acceptNeighborInvite` yalnız
`neighbor_invite_claim` yazıp `referred_by`ye hiç dokunmuyordu. Sonuç: komşu davetiyle gelip
kaydolan kişi *"kimsenin getirmediği müşteri"* olarak doğuyor, 500 puanlık ödül hiç doğmuyordu.
**`feedback/points.ts` künyesi bunun TERSİNİ vaat ediyordu** (*"hem `referral` hem `neighbor`
kazanır"*) — yani niyet doğru yazılmış, kod eksik kalmıştı. Bu maddenin kendisi kullanıcının
17.08 uyarısının kanıtı: *"notları kodla teyit etmeden oradaki ifadelere inanma."*

**İKİ ÖDÜLÜN AYRIMI (kullanıcı, 17.08):** komşu ödülü SEFERE bağlıdır — *"o seferde benimle beraber
komşum benim davetimle bir şey alırsa"*. Getiren ödülünün seferle **hiç** ilgisi yoktur — *"o kişi o
sefer veya başka sefer veya benimle çok alakasız posta kodunda dahi oturabilir"*; tek koşul bir
başarılı sipariş. Düzeltme ortak kapıya kondu (`linkReferrerById`), kural kopyalanmadı: bağın üç ret
ölçütü (`self` · `already_referred` · `already_customer`) artık tek yerde ve iki davet türü de
oradan geçiyor.

**7d · SEBEP ENUM'U BÜYÜTÜLMEYECEK — indeks işarete göre bölünür (sapma, 17.08).** 11.08'de
önerilen çözüm *"enum'a geri alma türü eklenir"*di; ölçüm sonrası daha sade bir yol seçildi ve
gerekçesi CLAUDE §1'dir (*"hiçbir türde duplication yok — önce türetebilir miyim diye bak"*).
Enum yolu her ödül türü için **ikinci bir tür** doğururdu (`referral` → `referral_reversal`,
`neighbor` → `neighbor_reversal`, …) ve yarın eklenecek her ödül aynı vergiyi öderdi. Bunun yerine
`points_entry_source_key` işarete göre ikiye ayrılır: ödüller `where points > 0`, düzeltmeler
`where points < 0` — ikisi de kendi içinde tekil, birbirini engellemiyor. Kazanç: `ref_id`nin
sebebe göre değişen sözleşmesi (getirende YENİ MÜŞTERİ, komşuda KOMŞUNUN SİPARİŞİ) olduğu gibi
kalıyor ve `referral` toplamı doğrudan **net etkiyi** veriyor — geri alınmışları ayrıca düşmek
gerekmiyor. Defter zaten hazır: `points int not null check (points <> 0)` negatifi kabul ediyor ve
migration künyesi *"düzeltme de negatif olabilir"* diyor.

---

> Kullanıcının yönergesi: **puan verdiğimizi söylediğimiz TÜM senaryolar tek tek incelenecek**;
> değerler veritabanından dinamik olmalı, dinamik yapmak pahalıysa önceden iyi belirlenmeli.
> Bugünkü durum ölçüldü: **motor zaten ayardan okuyor** (`settings`: `points_review=20`,
> `points_feedback_purchase=5`, `points_feedback_candidate=2`, `points_order=10`,
> `points_referral=50`, `points_visit=10`, `points_daily_cap=100`, `points_redeem_min=500`,
> `points_cent_value=1`). Sorun değerlerde değil, **ekranların o değerleri okumamasında.**

- [x] **MB-15 · Ekrana gömülü puan vaadi.** Vitrin Keşif kartı: *"Her tamamlanan tur +10 puan
  kazandırır"* — sabit metin (`screens/home/messages.json`), hiçbir ayara karşılık gelmiyor.
  Gerçek kazanç = kart sayısı × `points_feedback_candidate`. Dört kartlık turda 8 oluyor.
  Cümle ya ayardan kurulmalı ya sayı vermemeli.

- [x] **MB-16 · Keşif bitişinde gösterilen puan eksik.** **Ölçüldü:** 4 oy verildi, deftere
  4 × 2 = **8 puan** yazıldı, ekran **"+6 puan"** dedi. Bir oyun karşılığı toplama girmiyor
  (`use-discover.hook` `awardedPoints` birikimi).

- [x] **MB-17 · Geri bildirim bitişinde gösterilen puan eksik.** **Ölçüldü:** ekran "+5 puan"
  dedi, deftere `feedback_purchase 5` + `review 20` + `feedback_purchase 5` = **30 puan** yazıldı.
  *(İki `feedback_purchase` kaydı hata DEĞİL — biri kart başına, öteki tamamlama primi, gerekçesi
  `packages/application/src/feedback/invite.ts:170`.)* Ekran yalnız tamamlama primini gösteriyor.

- [x] **MB-49 · Sipariş onayındaki puan vaadi ekranda HESAPLANIYOR — motorun kuralıyla ilgisi yok.**
  → **KAPANDI, görev `(21.49)` (14.08).** Satır, taşıyan rota parametresi, üç dildeki metin ve
  `POINTS_PER_EURO` sabiti birlikte söküldü; yerine bir sayı KONMADI (★ karar 1: sipariş puanı yok).
  İki yan kusur da kendiliğinden düştü — ekranın müşteri tipini bilmemesi ve tavanı gözetmemesi,
  artık olmayan bir satırın kusuru.

  **Cihazda ölçüldü 11.08 (uçtan uca, kanıtlı):** 47,40 €'luk sipariş verildi, onay ekranı
  *"✦ Teslimatta +47 puan kazanacaksınız"* dedi; motorun ödül kapısı (`rewardCompletedOrder`)
  çalıştırıldı ve deftere **10** yazıldı. Ekran `POINTS_PER_EURO = 1` diye kendi sabitiyle
  `tutar ÷ 100 × 1` hesaplıyor (`checkout-screen.tsx`); motor ise `points_order` ayarını okuyor —
  **sabit 10**, tutarla ilgisi yok. Fark 4,7 kat.
  **İki yan kusur aynı yerde:** (a) onay ekranı müşteri TİPİNİ bilmiyor — B2B puan kazanamıyor
  (`canEarnPoints` → `b2b`) ama aynı vaadi görüyor; (b) günlük tavan (`points_daily_cap`=100)
  gözetilmiyor — tavana dayanmış müşteriye "kazanacaksınız" deniyor, hiçbir şey yazılmıyor.
  ~~**Çözüm yönü:** sayı sipariş cevabıyla gelsin.~~ → **KARAR DEĞİŞTİ (11.08): sipariş puanı
  tümden KALDIRILDI** (★ karar 1). Vaat edilecek puan kalmadığı için ekrandaki satır silinir;
  sözleşmeye alan eklenmez. Bulgu geçerliliğini korumuyor, **kaydı ölçümün kendisi için duruyor** —
  ekranın kendi sabitiyle hesap yapması bir desen hatasıydı ve tekrarlamaması gereken bir şey.

- [x] **MB-50 · Günlük ziyaret puanı native uygulamada HİÇ yazılmıyor** → **KAPANDI, görev `(21.47)`
  (12.08).** Ölçüldü 11.08 (kod): `awardVisitPoints` yalnız web yüzeyinden çağrılıyor
  (`apps/web/lib/feedback/visit-actions.ts`); mobil arka uçta karşılığı yok. Sonuç: yalnız
  uygulamayı kullanan müşteri günde 10 puanı hiç kazanamıyor, aynı müşteri web'e girse kazanıyor —
  **aynı müşteri iki yüzeyde iki farklı kural.** MB-36'nın (iki yüzeyde iki fiyat) akrabası.

  **Kapanış:** `POST /api/v1/me/points/visit` + `lib/points/use-visit-points.hook.ts` (kök layout).
  Kalemin ACELEYE GELMESİNİN sebebi başka bir iş: onboarding'in yeni puan adımı bu ödülü müşteriye
  SÖYLÜYOR, yani açık kapanmadan metin yazmak ekranı motordan cömert yapardı.

  **Cihazda ölçülen ikinci açık (12.08):** ilk kurgu iki tetikleyiciyle geldi — ilk kare ve
  uygulamanın öne gelmesi. İkisi de müşteri MİSAFİRKEN koşuyor, giriş sonrası hiçbir şey
  tetiklemiyordu; `points_entry`de satır doğmadı. Yani **uygulamayı indirip hesap açan yeni
  müşteri ilk gününün puanını hiç alamıyordu** — tam olarak onboarding'in vaat ettiği kişi.
  Üçüncü tetikleyici (`onAuthStateChange`) eklendi, satır doğdu (bakiye 18 → 28).

- [x] **MB-51 · Adres formu "67 ile başlayan posta kodları teslimat bölgemizdedir" diyor — YANLIŞ.**
  Ölçüldü 11.08 (cihaz + veritabanı): aktif bölgeler yalnız **67000 · 67100 · 67200 · 67300 ·
  67400 · 67540 · 67800**. Müşterinin kayıtlı adresi 67380 (Lingolsheim) ve ödeme ekranı aynı adres
  için *"Bu adres teslimat bölgemizin dışında"* diyor, kapıya teslim kapanıyor, 7,90 € kargo
  çıkıyor. Yani **iki ekran aynı adres için zıt şey söylüyor**; müşteri ücretsiz teslimat
  bekleyerek adresini kaydediyor, ödemede kargo ücretiyle karşılaşıyor.
  **KAPANDI (11.08) — cümle TÜMDEN KALDIRILDI.** Kullanıcı kararı: *"genellenmiş ve statik bir metin
  istemiyoruz, böyle bir şey yazmaya gerek yok — zaten tüm posta kodlarının listesine kullanıcı
  erişebiliyor."* Yerine yenisi yazılmadı; iki sebeple gerek de yok: kodların tam listesi teslimat
  bölgeleri sayfasında duruyor, ve **girilen kodun durumunu onboarding zaten GERÇEK veriden
  söylüyor** (`usePlaceResolution` → dört hâlin her biri kendi cümlesini alıyor). Yani doğru bilgi
  zaten iki yerde var; kaldırılan şey yalnız uydurma genellemeydi.

- [x] **MB-52 · Keşif'ten kataloğa dönerken native çökme — BİR KEZ görüldü, ÜRETİLEMEDİ.**
  → **KAPANDI (kullanıcı kararı 15.08), GÖZLEMDE KALIYOR: peşinden koşulmaz, tekrarlarsa yeniden
  açılır.** Tek kare, üretilemedi ve koşulları MB-03'ünkiyle birebir aynı (paralel şerit
  `catalog-screen.tsx`e yazıyordu, paket tazeleniyordu) — tazelemenin yeniden bağlama hatası
  olması en yakın açıklama. Kapanış "sebep kanıtlandı" değil, "tek kareye makine kurulmaz"dır.
  Üretim derlemesinde ya da ağaç sakinken tekrarlarsa gerçek arızadır ve kayıt yeniden açılır.

  11.08: *"addViewAt: failed to insert view … child already has a parent"*. Aynı geçiş sonradan
  sorunsuz çalıştı.

- [x] **MB-53 · "Arkadaşını getir" zinciri ORTASINDAN KOPUK — bugün kimse davet puanı kazanamaz.**

  **KAPANDI (11.08 gecesi · iki şerit birlikte).** Sunucu yarısı web şeridinde (`17.9`): karşılama
  sayfası `/[dil]/davet/[kod]`, `PATHNAMES`e davet rotası, `inviteUrl`, `linkReferrer`ın OTP
  akışına girmesi, ilişkilendirme dosyaları, ve getiren ödülünün teslimattan **ödemeye** taşınması.
  Cihaz yarısı bu şeritte (`21.43`): bağlantının uygulamada açılması (iOS `associatedDomains` +
  Android `intentFilters` + `+native-intent` çevirisi), dört hâlli karşılama ekranı, kabul edilen
  kodun cihazda saklanıp ilk girişte kayda bağlanması, ve kartın metni. **Artık paylaşılan şey kod
  değil bağlantı** — aşağıdaki "ekran kodu paylaşıyor, arkadaş onu hiçbir yere yazamıyor" cümlesi
  tarihe karıştı. Metnin üç yanlışı da düzeltildi: 5 € vaadi kalktı, ödülün gerçek anı yazıldı
  (*"hesabını açıp ilk siparişinin ödemesini tamamladığında"*), sayı yazılmadı çünkü miktar ayardan
  gelir. **Değer merdiveni (§2f: yeni müşteri 500) HENÜZ UYGULANMADI** — ayar hâlâ
  `points_referral=50`; o, puan setinin kendi işidir ve mobil müşteri işlerinin sonuna bırakıldı.
  Kalan tek açık MB-60'ta.

  Ölçüldü 11.08 (kod). Var olanlar: kod üretimi (`ensureCustomerReferralCode`, 8 hane), kodun
  profilde saklanması (`referral_code`), getirene 50 puan yazan motor (`awardReferralPoints`,
  yeni müşterinin ilk siparişi teslim edilince). **Olmayan:** kodu GİREBİLECEĞİ hiçbir alan —
  `findOrCreateCustomer`ın `referralCode` girdisini hiçbir çağıran doldurmuyor, `referred_by` hiç
  yazılmıyor, davet bağlantısının biçimi ve onu karşılayan rota yok. Kod bu açığı künyesinde
  beyan ediyor (`packages/application/src/customer/referral.ts`) — sessiz değil, ama kapalı da
  değil. **Ekran kodu paylaşıyor, arkadaş onu hiçbir yere yazamıyor.**

  **KARTIN METNİ ÜÇ KAT YANLIŞ (ölçüldü 11.08).** Ekrandaki cümle: *"Kodunuzla ilk siparişini veren
  arkadaşınız 5 € indirim kazanır; teslimattan sonra size de 5 € kupon yüklenir."* Karşılıkları:
  (1) **arkadaşın 5 € indirimi HİÇ ÜRETİLMİYOR** — davetten kupon/indirim doğuran tek satır kod yok;
  (2) davet edene yazılan şey kupon değil **50 PUAN**, ve bugünkü kur ile (`points_cent_value`=1)
  bu **0,50 €** eder — vaat edilenin onda biri; (3) zaten hiçbiri tetiklenemiyor, çünkü `referred_by`
  hiç yazılmıyor. Yani müşteri ekranda üç ayrı söz okuyor ve üçünün de arkasında bir şey yok.
  Metin, zincir kurulurken gerçek davranışa göre yeniden yazılacak.

  **YÖN KARARI (kullanıcı 11.08): KOD GİRME DİYE BİR ADIM OLMAYACAK — her hâlükârda BAĞLANTI.**
  *"Arada bir kod gönderme, kod kaydetme olmasın."* Akış: bağlantıya tıklanır → *"sizi şu kişi
  davet etti, hoş geldiniz"* ekranı açılır → kullanıcı hesabını **oradan doğrudan** oluşturur →
  davet bağı o anda kurulur; ödül ilk sipariş teslim edilince yazılır. Kod hâlâ üretilir ama
  kullanıcıya gösterilen şey bağlantıdır; kod yalnız bağlantının içindeki taşıyıcıdır.
  **İş kalemleri:** bağlantı biçimi + karşılayan web rotası (`PATHNAMES`e davet yolu) + uygulamayı
  açan bağlantı tanımı (evrensel/uygulama bağlantıları) + `findOrCreateCustomer`a daveti geçiren
  çağrı. Bu altyapı **MB-56'nın da zemini** — ikisi aynı bağlantı mekanizmasını paylaşır.

- [~] **MB-54 · Ziyaret puanı native'de yazılacak + hesap sayfasında görünecek (kullanıcı kararı 11.08).**
  **İKİ PARÇANIN İKİSİ DE İLERLEDİ, BİRİ AÇIK KALDI — görev `(21.47)` (12.08).** (a) yazım kapısı
  KAPANDI (MB-50) · sözleşme üçten altıya genişledi, ziyaret satırı listede. (c) **AÇIK:** *"o gün
  ziyaret puanı alınmışsa satır İŞARETLİ görünür"* — bugünkü hakkının kullanılıp kullanılmadığı
  ekranda görünmüyor. Sözleşme bunu taşımıyor: `earnWays` yalnız "hangi yol, kaç puan" diyor,
  "bugün alındı mı" demiyor. `BEKLEYEN(MB-54)`.
  MB-50'nin kararı: *"ziyaret puanı native'de yazılmalı… hesabım sayfasında bu da olmalı ve
  kullanıcı geldiği zaman o tik yanmalı."* İki parça: (a) mobil arka uçta günlük ziyaret kapısı
  (web'deki `awardVisitPoints` aynı motoru kullanır, ikinci nüsha YAZILMAZ); (b) hesap ekranındaki
  "puan kazanmanın yolları" listesine ziyaret satırı eklenir ve **o gün ziyaret puanı alınmışsa
  satır işaretli görünür** — müşteri bugünkü hakkını kullanıp kullanmadığını görsün. Sözleşmedeki
  kazanma yolu anahtarları bugün üç tane (`referral` · `review` · `feedback_candidate`); ziyaret
  eklenince liste dörde çıkar, yani sözleşme işi de var.

- [x] **MB-55 · "Nasıl puan kazanılır" anlatımı** → **KAPANDI, görev `(21.47)` (12.08).**
  *"Puan kazanma olayını çok daha anlaşılabilir yapmak için hangi durumlarda puan kazanılıyor,
  tıpkı onboarding gibi bir sayfa yapmak istiyorum."* Bugün bu bilgi hesap ekranındaki üç satırlık
  kutuya sıkışmış durumda ve sipariş/ziyaret/günlük tavan hiç anlatılmıyor. **Sayılar sözlüğe
  gömülMEZ** — ayardan gelen kazanma yolları uçtan okunur (MB-15'in dersi).

  **~~Ayrı SAYFA~~ → ÇEKMECE + ONBOARDING ADIMI** (kullanıcı isteği 12.08: *"kod ve komponent
  istemediğim için kullanıcı hesap sayfasından puan dönüştürdüğü yerde 'nasıl puan kazanabilirim'
  gibi bir metin butonuna tıklayıp puan kazanma yöntemlerini inceleyebilsin"*). Sayfa yerine
  çekmece: müşteri bir MERAK sorusu soruyor ve cevabı aldıktan sonra bulunduğu yere dönmek istiyor;
  sayfa geri tuşuyla dönülen bir gezinme adımı doğururdu. Anlatımın kendisi üç yüzeyin ORTAK
  bileşeninde (`customer-kit/points-earn-list.tsx`) — onboarding'in son adımı da aynı listeyi
  çiziyor, yani "onboarding gibi" isteği kopyayla değil ortak bileşenle karşılandı.

  **Liste üçten ALTIYA çıktı** (MB-54'ün sözleşme yarısı burada kapandı): sözleşmedeki daraltma
  ölçütü *"müşterinin kendi iradesiyle başlatabileceği yollar"*dı ve tek tüketicisi düğmeli hesap
  kartıydı. Anlatım ekranında soru başka: *"bu sistem beni neyle ödüllendiriyor"*. `visit`,
  `feedback_purchase` ve `neighbor` artık listede; düğme haritası `Partial` (ikisi bir yere
  gitmiyor). **Liste artık bakiyesi OLAN müşteriye de açık** — eskiden yalnız bakiye sıfırken
  çiziliyordu, yani ilk puanını kazanan müşteri geri kalan yolları bir daha hiç göremiyordu.

- [x] **MB-56 · SEFER DAVETİ — yeni puan enstrümanı. TASARIM KAPANDI (kullanıcı kararları 11.08).**

  **UYGULANDI (12.08 · iki şerit birlikte).** Sunucu yarısı web'de (`17.10`): `neighbor_invite`
  tablosu (sefer = `(bölge, gün)` fotoğrafı, kullanım sayaçla değil siparişten türetilir), ayrı
  `neighbor` puan sebebi, karşılama sayfası, checkout bağı, ödeme anında doğan ödül. Kullanıcının
  12.08 sorusu üzerine kabul **kişiye** yazılır oldu (`neighbor_invite_claim`) — çerez artık yalnız
  kimlik doğana kadar taşıyan bir köprü. Cihaz yarısı bu şeritte (`21.45`): derin bağlantı, beş
  hâlli karşılama ekranı, belirtecin devri, checkout'ta davet cümlesi + **önseçili gün**, ve
  sipariş sonrası paylaşım şeridi.

  **Değerler kullanıcının merdivenine çekildi:** komşu daveti **100** (getiren 500 — beş kat fark).
  ~~Bugünkü değer 3 × 100 = 300 puan~~ artık gerçek: üç komşu 300 puan eder, kupon 500 olduğu için
  *"üç komşu çağır kuponu al"* denemiyor — metin sayıyı söylüyor, vaat uydurmuyor.

  **Uygulanmayan tek parça:** zincirin kendiliğinden yayılması ("her komşu sipariş verince onun
  ekranında kendi daveti doğar") — teknik olarak zaten böyle çalışıyor, çünkü her rota siparişi
  kendi davetini açabiliyor; ayrıca kodlanacak bir şey kalmadı.

  Kullanıcının çıkış cümlesi: *"aracım bir rotaya çıkacak ve o rotadan sipariş vermiş bir müşterim
  var; bu müşterim o rotadaki bir arkadaşının — hesabı olsun veya olmasın — sipariş vermesini teşvik
  ederse müşterime puan vermek istiyorum."*

  **NEDEN GENEL DAVETTEN AYRI BİR ENSTRÜMAN (kullanıcı: *"genel davet başka bir şey, sefer puanı
  ayrı bir şey"*):** genel davet MÜŞTERİYE bağlanır — bir kez, kalıcı, "bu müşteriyi X getirdi".
  Sefer daveti ise **SİPARİŞE** bağlanır ve tekrarlanabilir. Ayrılmasının zorunlu sebebi: komşunun
  hesabı zaten olabilir; ödül yeni müşteri kazanmaya değil **aracın o günkü doluluğuna** yazılıyor.
  Değeri de bu yüzden farklı: araç o sokağa zaten gidiyor, ikinci durak marjinal maliyeti düşürüyor.
  Yani bu bir pazarlama ödülü değil, **lojistik ödülü**.

  **SEFER = (bölge, teslimat günü).** Yeni tablo gerekmiyor: `order` zaten `delivery_zone_id` +
  `delivery_date` taşıyor ve bu çift bir seferi tek başına tarif ediyor.

  **KOD YOK, YALNIZ BAĞLANTI (kullanıcı kararı, kesin):** *"kod göndermek gibi bir yöntem
  istemiyorum. Her halükarda link gönderilsin."* Bağlantı bir kişiyi değil **bir seferi** davet
  eder; içinde iki şey vardır: kim davet ediyor, hangi sefer. Sipariş tamamlandığı anda üretilir —
  günü müşteri o anda seçmiştir.

  **KENDİLİĞİNDEN SONA ERER:** araç yola çıktıktan sonra o bağlantıyla gelen sipariş aynı sefere
  düşemez, yani ödül koşulu sağlanamaz. Ayrı bir geçerlilik süresi kuralı YAZILMAZ.

  **NEREDE GÖRÜNÜR (kullanıcı kararı):** sipariş tamamlandı ekranında. En değerli an orası — sefer
  somut, gün belli. Hesap sayfasındaki kod kutusu bu anı hiç yakalamıyordu.

  **BİR SİPARİŞTEN ÜÇ KOMŞU (kullanıcı kararı 11.08, ilk "tek komşu" kararı REVİZE edildi).**
  Gerekçesi kullanıcının: *"tek kullanımda dolması aslında bizim çok hoşumuza gidecek bir şey
  olmayabilir"* — doğru, çünkü amaç seferi doldurmak; ilk tıklayanla kapanan bir davet aracı yarım
  dolu bırakır. Bağlantı **üç kez** kullanılabilir (parametrik: `route_invite_max_uses`, varsayılan
  3), sonra tükenir. **Zincir ayrıca sürüyor:** her komşu sipariş verince onun ekranında kendi
  daveti doğar — sokak sokak yayılır.
  ~~**TAVANLA ETKİLEŞİM:** 3 komşu × 30 = 90 + sipariş puanı 10 = tam 100, tavanın tamamı.~~ →
  **DÜŞTÜ:** sipariş puanı kaldırıldı ve tavan artık davet ödüllerini kapsamıyor (★ karar 4).
  Bugünkü değer 3 × 100 = **300 puan**; kupon 500 olduğu için *"üç komşu çağır, kuponu al"*
  denemez — metin sayıyı söyler (★ karar 2f).

  **TEK ADRES, İKİ KAPI — ve metin SAMİMİ (kullanıcı kararı 11.08).** Bağlantı **gerçek bir web
  adresidir** (`https://…/davet/…`), uygulamaya özel bir şema DEĞİL. Aynı adres iki yere birden
  gider: uygulaması olanda işletim sistemi **uygulamayı** açar, olmayanda **tarayıcı** açar.
  *(İlk yazımda "karşılama ekranı web'de" deniyordu; yanıltıcıydı — ekran İKİ YÜZEYDE de yazılır,
  web olan yalnız ADRESTİR.)*
  **Neden uygulamaya özel şema olamaz:** o adres uygulaması olmayan telefonda hiçbir şey açmaz;
  mağazaya gidip kuran kişide de kimin davet ettiği bilgisi yolculukta **kaybolur** (ertelenmiş
  derin bağlantı — ayrı ve kırılgan bir altyapı). Komşuların çoğunun uygulaması olmayacağı için bu
  yol baştan ölüdür.
  **BEKLENEN KAPI DAVET TÜRÜNE GÖRE DEĞİŞİR (kullanıcı 11.08):** *yeni müşteri daveti* → alıcı
  büyük ihtimalle uygulamasız, **web sayfası** normal karşılayıcıdır. *Komşu daveti* → alıcı çoğu
  zaman aynı sokakta yaşayan, hâli hazırda müşterimiz olabilecek biri; orada **uygulamanın
  açılması** normaldir ve mevcut müşteriyi tarayıcıya atıp yeniden giriş yaptırmak kötü olur.
  Mekanizma aynı, öncelik farklı: web zorunlu (adresin sahibi ve yedek yol), uygulama ekranı
  "sonra bakarız" değil.
  Metnin taşıması gerekenler (kullanıcının tarifi): komşusunun **ADI** (*"Sizi Ayşe davet etti"* —
  *"biri davet etmiş, kim olduğunu bilmiyorum, bu da kötü bir şey"*), hangi **SEFERİN** seçildiği,
  ve o sefere **YETİŞECEK ŞEKİLDE** sipariş verilmesi gerektiği, artı komşunun ne kazanacağı.
  **Açığa çıkmayacaklar:** davet edenin adresi ve kimliği — yalnız adı. Ton dile/kültüre göre
  değişebilir (üç dil).

  **KENDİNİ DAVET ETME ENGELLENMEZ (kullanıcı kararı):** *"kendini bu şekilde davet etmek istiyorsa
  davet etsin, bunu engellemeyelim."* Önerilen "adres farklı olmalı" kısıtı BU KARARLA DÜŞTÜ.
  Karşılığında yine gerçek para ödenen bir sipariş var; günlük tavan (`points_daily_cap`) fren.

  **ÖDÜL KURALLARI (kullanıcı kararları):**
  - **Yalnız AYNI SEFER ödüllendirilir.** Komşu başka bölgeye ya da başka güne sipariş verirse
    sefer puanı YAZILMAZ — kademeli geri dönüş yok. Mesaj keskin kalsın: "aynı gün, aynı rota".
  - **Komşu zaten müşteriyse de yazılır.** Amaç seferi doldurmak; hesabının olup olmaması aracın
    doluluğunu değiştirmiyor.
  - **Her seferde yeniden yazılır.** Aynı komşu her ay aynı sefere sipariş verirse davet eden her ay
    kazanır — doluluk her sefer yeniden kazanılıyor.
  - **TETİK, davet edenin değil KOMŞUNUN SİPARİŞİ.** Ödül "seferi doldurduğun için" veriliyor,
    seferi dolduran şey komşunun siparişi. **Anı da TESLİMAT DEĞİL, SİPARİŞ** — kullanıcı kararı
    11.08: *"teslimat anında puan görmek insanları rahatsız edebilir, sipariş verdiklerinde
    yazalım; eğer teslim edilmezse alırız."* Bu karar MB-57'nin konusu ve **tüm puan türlerini**
    ilgilendiriyor, yalnız sefer davetini değil.
  - **Değer parametrik, varsayılan 100 puan** (`points_route_invite`) — kullanıcı kararı 11.08.
    Merdivenin gerekçesi ★ karar 2f'de: yeni müşteri 500, komşu 100; beş kat fark bilinçli.

  **KOMŞUNUN ÖDÜLÜ (kullanıcı kararı):** **yeni komşuya indirim, mevcut müşteriye puan.** Gerekçe:
  puan 500 eşiğine ulaşana kadar yeni komşunun elinde kullanamayacağı bir sayıdır — zayıf çağrı;
  genel davette arkadaşa 5 € indirim verilmesinin sebebi de bu. Davet mesajı kime gittiğini
  bilmediği için ikisini birden söyler.

  **GENEL DAVETLE ÜST ÜSTE BİNMESİ — İKİSİ DE YAZILIR (kullanıcı 11.08, teyit edildi):**
  *"Hem bu sefere davet etmiş ama aynı zamanda uygulamaya davet etmiş anlamına gelir; bu yüzden her
  ikisini de alması mantıklı."* Aynı bağlantıdan gelen YENİ müşteride iki ödül de yazılır, **aynı
  anda değil ayrı anlarda**: sefer puanı komşunun o siparişinde, genel davet puanı onun ilk
  siparişinde. Müşteri ikisini ayrı ayrı görür, tek bir toplamda erimezler — iki ayrı iş yapıldı,
  iki ayrı satır.

  **DAVET EDENİN SİPARİŞİ İPTAL EDİLİRSE (kullanıcı sordu, karar verildi — *"cevabın gayet
  mantıklı"*):** ilke — **kazanılmış ödül geri alınmaz, kazanılmamış olan durur.**
  - Davetin kalan hakkı varsa ve henüz kullanılmadıysa → bağlantı ölür ("bu davet artık geçerli
    değil"). Davet o siparişten doğdu; sipariş yoksa davet de yok.
  - Komşu zaten sipariş verdiyse → o kullanım geçerli kalır ve ödül durur. Komşu aracı doldurdu;
    davet edenin sonradan vazgeçmesi onun yaptığını geçersiz kılmaz.
  *(KOMŞUNUN kendi siparişi iptal edilirse ödül geri alınır — MB-57'nin genel kuralı.)*

  **BAĞIMLILIK:** MB-53 (bağlantı altyapısı) önce kapanmalı — bağlantı biçimi, karşılayan rota ve
  kaydolurken bağı kuran çağrı yokken sefer koşulu eklemek, olmayan bir zincire halka takmaktır.
  **AÇIK İŞ (ölçülmedi):** komşuya verilecek indirimin mekanizması — genel davetteki "5 € indirim"
  sözünün kuponu gerçekten üretiliyor mu, kontrol edilecek.

- [x] **MB-57 · Puanın yazıldığı ANIN yeniden kurulması — kural ★ karar 2, 3 ve 7'de.**
  → **KAPANDI (17.08), görev `(21.73)`.**
  Kısaca: kendi eylemleri (giriş · yorum · beğeni · prim · keşif oyu) **anında**; başkasının
  hareketine bağlı olanlar (arkadaş getirme · sefer daveti) o kişinin **parası alındığında**.

  **DÖRT İŞ KALEMİNİN İKİSİ ZATEN YAPILMIŞTI, SATIR BAYATTI.** Ölçüm (17.08): ödül çağrısı
  `order/payment.ts` → `finalize` içinde `paid` geçişine bağlıydı (künyesi *"ANI TESLİMAT DEĞİL,
  ÖDEME"* diye yazılı) ve sipariş puanı çağrısı da sökülmüştü — üretim kodunda `reason: 'order'`
  yazan tek çağrı yok, `POINTS_PER_EURO` sabiti de yok. Kapanmamış satırın yapılmış işi anlatması,
  kullanıcının 17.08 uyarısının kanıtı: *"dokümana değil koda güven."*

  **BUGÜN YAZILAN İKİ KALEM:**
  · **İadede geri alma** — `revokeReferralOnUnpaidOrder`, `finalize`de `paid`ten ÇIKIŞTA. Defterden
    SİLMEZ, ters satır yazar (`-award.points`, tutar ayardan değil o gün yazılan satırdan okunur).
    Tekillik indeksi işarete göre bölündü (★ karar 7d); çifte silme üç katmanda engelli ve
    veritabanı katmanı rollback'li işlemle kanıtlandı (ikinci negatif satır `23505` ile reddedildi).
  · **"Puan yolda"** — `readPendingNeighborAwards` + kart sözleşmesinde `pendingNeighborAwards`.
    Defterde karşılığı YOK ve olmamalı (bekleyen ödül henüz yazılmadı); ekranda listeye karışmıyor,
    geçmişin ÜSTÜNDE ayrı blok. ★ karar 3 bunu yalnız komşu ödülü için tanımlıyor — getiren
    tarafında bekleme belirsiz olduğu için orada söz verilmedi.

  Mobil arka uç ile web ortak motoru kullandığı için ikisi de **iki yüzeyde birden** çalışıyor;
  "yolda" bloğunun ÇİZİMİ web'de henüz yok (veri orada da var) — `docs/talep/` altına not bırakıldı.

- [x] **MB-58 · Vitrindeki KEŞİF bölümü: oturumsuzda hiç, kartsızken hiç, iskelette var
  (kullanıcı kararı 11.08).** ÜÇÜ DE KAPANDI — (b) 20.08'de, cihazda iki yönlü ölçümle. Üç şart:
  (a) **Oturum açılmadan görünmez** — keşif oyu puanı kimliğe yazılıyor (`awardFeedbackPoints`
  kimliksiz kayda puan vermiyor), yani misafire gösterilen davet karşılığı olmayan bir davettir.
  (b) **Oylanacak kart kalmadıysa bölüm KALKAR** — bugün aday ürün sayısı 4 ve müşteri hepsini
  oyladıysa tur boş açılıyor. Sistem oylanmışları zaten eliyor (`votedProductIds`), yani "kaç kart
  kaldı" bilgisi elde var; eksik olan, sıfırsa bölümü hiç çizmemek.
  (c) **İskelete dahil edilir** — bölüm gerçek uçtan besleniyorsa yükleme anında da yeri tutulmalı,
  yoksa vitrin kart sayısı belli olunca zıplıyor.

  **(a) ve (c) KAPANDI (14.08).** (a) davet artık `signedIn` şartına bağlı; gerekçe künyede:
  puan KİMLİĞE yazılıyor, yani misafire gösterilen davet karşılığı olmayan bir davetti. Turun
  KENDİSİ misafire açık kaldı (tasarımın kararı: *"misafirin oyu da talep sinyalidir"*), kapanan
  yalnız ödül vaat eden çağrı. (c) iskelet artık iki değil, misafirde tek davet kutusu tutuyor —
  `HomeSkeleton`a ayrı bir `discoverInvite` prop'u eklendi; `HomeLayout`a EKLENMEDİ çünkü o şema
  cihazda SAKLANIYOR ve bu bilgi saklanacak cinsten değil (her açılışta oturumdan türer).

  **(a) CİHAZDA ÖNCE-SONRA ÖLÇÜLDÜ (15.08).** Aynı misafir, aynı ekran: **12:06 eski paketle
  Keşif daveti VAR** (hata üretildi) · **12:08 taze paketle YOK** (düzeltme doğrulandı).
  *Yan ders:* uygulamayı arka plandan öne getirmek BAYAT paketi sürdürüyor ve düzeltme yokmuş
  gibi gösteriyor; ölçüm `force-stop` + yeniden açılışla yapılmalı.
  **(c) GÖRSEL OLARAK DOĞRULANAMADI:** iskeletin çizildiği `uiautomator` dökümüyle kanıtlandı ama
  davet kutuları ekranın ALTINDA kaldığı için sayılamadı; iskelet penceresi de saniyenin altında.
  Bugün yalnız kod düzeyinde doğru.

  **(b) KAPANDI (20.08) — ve askının dayanağı ölçümle çürüdü.** Askı gerekçesi *"iki sorgu, hem de
  en çok vurulan uca"*ydı; o gerekçe sorguların **sıraya ekleneceğini** varsayıyordu. Ölçüldü: vitrin
  ucu zaten **yedi okumayı paralel** koşuyor (`home.ts` `Promise.all`) ve yeni okuma demetin İÇİNE
  girdi — ucun süresi en yavaş bölümün süresidir, yenisi onlardan hızlı. Ziyaretçide tek sorgu
  (eleyecek geçmiş yok), girişlide iki.

  Yapılan: `discoverCards` vitrin sözleşmesine eklendi (`home-api.schema`) ve **desteyi kuran
  kuralın aynısından** besleniyor — `remainingCandidates` ayrıştırıldı, `openDiscoverDeck` ile
  `countDiscoverDeck` ikisi de onu çağırıyor. İki ayrı sayım yazılsaydı biri bir gün ötekinden ayrı
  düşer ve vitrin, açtığında boş çıkan bir tura davet ederdi. Ekranın şartı `discoverCards > 0`.

  **ASIL ENGEL BAŞKA ÇIKTI — ve tek satırdı.** Sayı sözleşmeye taşındıktan SONRA bile davet
  kaybolmadı; ölçüm sebebi gösterdi: `fetchHome` çıplak `apiFetch` kullanıyordu, yani vitrin çağrısı
  **Bearer taşımıyordu** ve sunucu müşteriyi hiç tanımıyordu — "bu kişi kaç kart oyladı" sorusunun
  cevabı yapısal olarak yoktu. `maybeAuthorizedFetch`e geçildi (uygulamada zaten var, künyesi tam bu
  hâl için: *"ziyaretçiye açık ama kimlikten yararlanan çağrı"*); kimliksizde davranış aynen korunur.

  **YAN BULGU — B2B FİYATI VİTRİNDE HİÇ KİŞİSELLEŞMİYORMUŞ.** Aynı satır ikinci bir şeyi de sessizce
  bozuyordu: ucun kendi künyesi *"Bearer varsa yalnız fırsat FİYATINI kişiselleştirir (B2B/özel
  fiyat)"* diyor, ama Bearer hiç gitmediği için o dal HİÇ koşmuyordu — onaylı B2B müşteri vitrinde
  B2C fiyatı görüyordu. Uç doğruydu, çağıran eksikti; aynı düzeltme ikisini birden kapattı.
  **B2B hesapla cihazda DOĞRULANMADI** (elde onaylı B2B hesap yok) → `BEKLEYEN(21.92)`.

  **CİHAZDA İKİ YÖNLÜ ÖLÇÜLDÜ (20.08).** Hesabın kalan 20 adayına oy yazıldı → **davet kayboldu**;
  yazılan satırlar kimlikleriyle kaydedilip **tam olarak** silindi (hesap 6 oyluk ilk hâline döndü)
  → **davet geri geldi**. Ziyaretçi sayısı ikisinde de 20 kaldı, yani eleme kimliğe bağlı çalışıyor.
  `typecheck` (çalışma alanı) · `lint` temiz, mobil paket **599/599**.

- [ ] **MB-18 · Tüm puan senaryolarının uçtan uca denetimi.** Kapsam: sipariş · ürün yorumu ·
  keşif turu · davet (referans) · ziyaret · günlük tavan (`points_daily_cap`) · B2B'de puan
  verilmemesi · ikinci kez tamamlamada puan verilmemesi · kupona çevirme eşiği
  (`points_redeem_min` = 500, `points_cent_value`). Her senaryo için: **motor ne yazıyor · ekran
  ne diyor · ikisi tutuyor mu.** Bugünkü turda yalnız keşif ve geri bildirim ölçüldü; ikisi de
  tutmadı — bu, kalanların da ölçülmesi için yeterli sebep.

  **İKİNCİ TUR (15.08, görev `(21.59)`) — soru "sayı doğru mu"dan "ekran BUNU SÖYLÜYOR MU"ya
  döndü.** Kullanıcı isteği: *"her puan kazanma durumunun sonucunda aynı sayfayı göstermek lazım —
  ne kadar kazandı ve şu ana kadar ne oldu?"* Denetimin çıkardığı tablo:

  | Sebep | Ne kadar | Ekran ne diyordu | Bugün |
  | --- | --- | --- | --- |
  | `visit` | 10 | hiçbir şey (bilinçli sessiz, karar 11.08) | değişmedi |
  | `feedback_candidate` | 2 | *"+N puan kazandınız"* — **toplam yok** | ortak blok: kazanılan + toplam |
  | `feedback_purchase`/`review` | 5 / 20 | kazanılan + toplam | ortak blok (biçim buradan alındı) |
  | `neighbor` | 100 | **hiçbir şey** | **hâlâ hiçbir şey** |
  | `referral` | 500 | **hiçbir şey** | **hâlâ hiçbir şey** |

  **KAPANDI:** iki sonuç ekranı tek bloğa indi (`customer-kit/points-award.tsx`), keşif turu artık
  güncel bakiyeyi de söylüyor (`DiscoverSwipeSchema.balance`).

  **AÇIK ve yapısal:** `referral`/`neighbor` **başkasının** eylemiyle doğuyor (davet edilen kişi
  parasını ödediğinde) — müşteri o an uygulamada değil, yani gösterilecek bir "sonuç sayfası" YOK.
  **En büyük iki ödül bu yüzden görünmez.** Cevapları sonuç sayfası değil: **puan geçmişi**
  (aşağıda) ve bildirim.

- [x] **MB-59 · Puan geçmişi native'de HİÇ YOK — en büyük iki ödül görünmez (kullanıcı isteği 15.08).**
  → **KAPANDI, görev `(21.60)` (15.08).** `GET /api/v1/me/points/history` (keyset, en yeni önce,
  opak imleç) + `/points-history` ekranı; kapısı hesap kartının içinde ("Puan geçmişim").
  Sebep sözlüğü ekranda, üç dilde, **dokuz sebebin dokuzu** (`redemption` ve `manual` dahil) — küme
  `Record` ile tam kapsanıyor, defter yeni bir sebep öğrenirse ekran derlenmez. B2B 403
  `not_eligible` alır, boş liste değil.
  **AYNI GÜN + AYNI SEBEP TEK SATIRDA** (kullanıcı isteği 15.08, ekran görüntüsünden sonra): bir
  keşif turu dokuz satır üretiyordu ve sekizi özdeşti. Birleştirme ÇİZİMDE, defterde değil —
  ölçüt sebep değil ayırt edilebilirlik, grup anahtarı ekrana yazılan tarih.
  **Cihazda ölçüldü:** 8 oy (+16, "8 hareket") + günlük giriş (+10) = 26, kartın bakiyesiyle birebir.
  **Ölçülemeyen dallar** (yerelde tek B2C hesap, tek sayfalık defter): boş · misafir · B2B · hata
  ve ikinci sayfa. `BEKLEYEN(MB-18)`.

  *(Özgün kayıt:)*
  **Ölçüldü 15.08:** `/api/v1/me/points` üç uç veriyor (kart · ziyaret · çevirme); kart bilerek
  yalnız `balance` taşıyor, `earned`/`spent` sözleşmeden çıkarılmış
  (`points-api.schema.ts` künyesi). Defterin okuması (`listPointsHistory`) uygulama katmanına
  BİLEREK terfi etmemiş — künyesi *"bugün tek yüzeyleri var"* diyor, yani unutulmuş değil
  ERTELENMİŞ bir karar. Kullanıcının isteğiyle ikinci yüzey doğdu.

  **İstek:** *"hangi puan nereden geldi konusunu da gösterebileceğimiz bir bölümümüz olmalı."*

  **Kapsam:** `GET /api/v1/me/points/history` (keyset + sonsuz kaydırma — defter veriyle SINIRSIZ
  büyüyen bir küme, CLAUDE §1) + hesap kartından açılan liste. Satır = *tarih · sebep · ±N*. Sebep
  metni İSTEMCİDE kurulur (`points-earn-list`in deseni), ama küme **tam** olmalı: `redemption` ve
  `manual` da geçmişte görünür — `MePointsEarnWayKey` yalnız KAZANMA yollarını kapsıyor, geçmiş
  harcamayı da göstermek zorunda.

  **Web'de karşılığı VAR ama bozuk** — not bırakıldı: `not-web-puan-gecmisi-ham-enum.md`.

- [x] **MB-19 · Puan/teşekkür kartının tasarımı elden geçecek (kullanıcı kararı 11.08).**
  → **YAPILDI (15.08), görev `(21.58)` — ve yön TUR TUR değişti, üçüncüde durdu.**
  **Sonuç: KUTU YOK.** Kullanıcı kararı 15.08: *"kart görmek istemiyorum… tüm sayfayı kullanan…
  sayfa ekran ile bütünleşik olsun, bölüm bölüm görünmesini istemiyorum."* Kum zeminli, eğik,
  gölgeli etiket kaldırıldı; hiyerarşi artık ÖLÇEK ve BOŞLUKLA kuruluyor. Blok ekranın kalan
  yüksekliğini doldurup içeriği dikey ortalıyor, renk kırılması yok.
  **Kahraman işaret değişti:** kalp → **puan yıldızı `✦`** (terracotta, 120 dp, dairesiz).
  Gerekçe ölçümle çıktı: daire 88'den 148'e büyütülünce `olive-bg` kum zeminde LEKE gibi okundu ve
  kalp boş bir halkanın ortasında kaldı — düşük karşıtlık ölçek büyüdükçe kusura döndü. Ayrıca
  kalp jenerikti; anın konusu beğeni değil PUAN, ve `✦` uygulamanın puan dilinin kendisi
  (hesap kartı `✦ 10`, sonuç satırı `✦ +15 puan`). İkon `feedback-icons.tsx`e eklendi.
  **Bir regresyon önlendi:** kartın kapısı puana bağlıydı (`invitePointsTotal > 0`), yani B2B'de
  ya da puanın yazılmadığı turlarda hiç çizilmiyordu; kutu kalkınca bu kapı da doğru yere taşındı.
  **TASARIM KAYNAĞI UYARISI:** yerel `.dc.html` **9 Ağustos** tarihli, yani 11.08 kararından ÖNCE,
  ve o dosyada kalp/başlık kartın dışında — yani eski kod tasarımla birebir uyuyordu, sorun
  uygulamada değil tasarımdaydı. `claude_design` MCP bu oturumda bağlı değildi, güncel tasarım
  çekilemedi. **Tasarım dosyası bu üç turun sonucuyla güncellenmeli.**
  **Cihazda üç tur da görüldü** (kartlı → kutusuz+daire → kutusuz+yıldız); ekran görüntüleri
  kullanıcıya sunuldu ve yön her turda onun kararıyla değişti. Görülen hâl "zaten tamamlanmış"
  olanıdır; **puanlı hâl cihazda ölçülmedi** çünkü görüntülemek veri yazmayı gerektiriyor.

  *(Özgün kayıt:)*
  Sipariş ya da ürün yorumu sonrasında kazanılan puan + mevcut bakiyeyi gösteren ekran
  (`screens/feedback/feedback-screen.tsx` sonuç bloğu; cihaz görüntüsü 11.08). İstenen:
  **ortadaki kart büyüsün ve çevresindeki metinleri de içine alsın** — bugün kalp ve başlık kartın
  DIŞINDA, kartın içinde yalnız üç satır var. Görsel karar `.dc.html`den alınacak.

---

## 5. Fiyat ve sayı tutarlılığı

- [x] **MB-20 · Katalog kartındaki fiyat ile detayın açılış fiyatı farklı.** **Ölçüldü:** kart
  *4,11 €* gösterdi, detay *6,80 €* (450g) seçili açıldı. Kartta **"…'dan" eki yok** — oysa aynı
  ürün sayfasında aile kartı *"Cevizli 4,82 €'dan"* diye doğru yazıyor.
  **Zaten açık bir talep var:** `docs/talep/musteri-liste-fiyati-baslangic.md` (denetim → müşteri,
  09.08) aynı iki maddeyi web için istiyor: (1) kartta "…'dan" eki, yalnız çok boylu üründe;
  (2) detay AYNI boyu seçili açsın. **Native yüzeyde de aynen geçerli** ve burada ölçüldü.

  **(2) KAPANDI (15.08), görev `(21.53)` — ve sebep kanıtlandı.** MB-28'in sebebi aranırken çıktı:
  mobil detay açılış boyunu `variants[0]`dan seçiyordu, oysa kartta yazan fiyat `primaryVariantOf`
  ile (fiyatı olan EN UCUZ aktif boy) hesaplanıyor. `variants` listesi `sort_order`da, yani
  operatörün sırasında ve fiyatı bilmiyor — ikisi ayrışınca kart bir fiyat, detay başka bir fiyat
  gösteriyordu. **Web müşteri yüzeyi aynı kararı `08.10`'da almıştı**
  (`product-client.tsx:45` → `primaryVariantId ?? variants[0]`); mobil geride kalmıştı çünkü
  **alan mobil sözleşmesinde hiç yoktu** ve `CatalogProductDetailSchema.parse` onu düşürüyordu.
  Yapılan: `primaryVariantId` sözleşmeye eklendi (uç değişmedi — gövde zaten taşıyordu),
  ekran onu okuyor. **Cihazda doğrulandı:** aynı ürün (`baklava-with-pistachio`) kartta 4,11 €,
  detay **225g / 4,11 €** seçili açılıyor (eskiden 450g / 6,80 €); `18,27 €/kg` de 225g'ı doğruluyor.
  Boy sırası bilerek DEĞİŞMEDİ (`450 · 225 · 2500 · 1250`) — `08.10` kararı: sıra operatörün.

  **(1) MOBİL YARISI KAPANDI (15.08), görev `(21.55)`.** Kartta "…'dan" eki artık **çok boylu**
  üründe yazılıyor; ölçüt boy sayısı (`variantCount > 1`), fiyat aralığı değil. Türetme kite
  taşındı (`customer-kit/price-label`) ve dört çağıranın dördü — katalog ızgarası, vitrin rayı,
  detayın benzerler rayı, ailenin çeşit kartları — aynı kaynaktan okuyor; `family.from` metni üç
  dilden silindi. Cihazda doğrulandı: `5,00 €'dan (2 seçenek)` · `4,11 €'dan (4 seçenek)`, tek
  boylular düz (`2,30 €`).
  **Yan bulgu aynı turda kapandı:** `ProductCircleCard.priceLabel` zorunluydu, bu yüzden vitrin ve
  detay `?? 0` yazıp fiyatsız üründe **0,00 €** gösterebiliyordu. Alan isteğe bağlı yapıldı, çip
  çizilmiyor. Ölçüldü: bugün fiyatsız dört ürünün dördü de `candidate`, yani yol ekrana çıkmıyordu
  — düzeltme yaşayan bir arızayı değil, sessiz bir tuzağı kapattı.
  ~~**WEB YARISI AÇIK:** aynı ek web müşteri kartlarında yok — talep dosyası duruyor
  (`docs/talep/musteri-liste-fiyati-baslangic.md`). İki yüzey bir süre ayrışacak; ayrışma doğru
  yönde, mobil daha dürüst.~~
  → **WEB YARISI DA KAPANMIŞ — kayıt bayattı, ölçüldü 23.08.** Talep dosyası defterde YOK, yani
  açan şerit karşılandığını görüp silmiş (`docs/talep/README` yaşam döngüsü). Kodda karşılığı var:
  `apps/web/.../messages.json` üç dilde `fromPrice` taşıyor (`"{price}'dan"` · `dès {price}` ·
  `ab {price}`) ve `components/customer/ui/storefront-cards.tsx:305` onu `fromTemplate` olarak
  geçiriyor. **Kalem bu yüzden `[~]`ten `[x]`e alındı.**
  *Tek fark ÖLÇÜTTE ve bilerek kayda geçiyor:* web `purchaseMode === 'options'`e bakıyor, mobil
  `variantCount > 1`e. İkisi bugün aynı kümeyi seçiyor gibi duruyor ama AYNI ŞEY DEĞİL — biri satın
  alma kipini, öteki boy sayısını soruyor. Ayrıştıkları gün iki yüzey farklı kart gösterir; o gün
  gelirse ölçüt tek kaynağa çekilmeli, bugün müdahale edilmedi (yaşayan bir arıza yok).

- [x] **MB-21 · Sepette asgari sepet uyarısı ekrandaki toplamla çelişiyor** → **KAPANDI (11.08).**
  **Ölçüldü:** ekranda `Toplam 3,80 €`, hemen altında `Asgari sepet 40,00 € — 33,20 € eksik`. Eksik,
  indirim ÖNCESİ ara toplamdan (6,80) hesaplanıyordu; müşteri 36,20 bekliyordu.
  **KARAR (kullanıcı 11.08): eşik İNDİRİMSİZ toplam fiyata bakar.** Yani motor zaten doğru
  çalışıyormuş — `read.ts` → `meets(subtotalCents - undeliverableSubtotalCents, …)`. Hesapta
  değişiklik YOK; kusur cümlenin tabanını söylememesindeydi.
  **Yapılan:** cümleye tabanı yazıldı — *"Asgari sepet {minimum} — **ara toplamınıza** {missing}
  eksik"* (fr *au sous-total*, de *Ihrer Zwischensumme*). Müşteri hemen üstteki **Ara toplam**
  satırına bakıp çıkarmayı kendi yapabiliyor; indirimlerin sayılmadığı da cümleden anlaşılıyor.
  **Web'de aynı mantık geçerli** (kullanıcı: *"bu sepet eşik konusu web'de de aynı mantıkla
  çalışmalı"*) — motor ortak olduğu için hesap zaten aynı; cümle için dosya açıldı:
  `docs/talep/musteri-asgari-sepet-cumlesi.md`.

- [ ] **MB-22 · Sepetteki indirimin kaynağı — İKİ AYRI SORUN, biri düzeltildi diye yazılmıştı.**
  **(a) Anonim kampanya — SEBEP ÖLÇÜLDÜ 11.08, kod hatası DEĞİL veri eksiği.** Sepette bazen
  *"İndirim · **Bayram Sofrası** −3,00 €"* yazıyor, bazen *"İndirim · **Kampanya** · %8"*. Ölçüm:
  `discount.public_label` dolu olan indirim adıyla görünüyor (`Bayram Sofrası seçkisi` — üç dilde
  etiketi var), boş olan anonim "Kampanya"ya düşüyor (`Büyük sepet indirimi` — etiketi yok).
  Mekanizma doğru; **indirim açılırken herkese açık etiketin zorunlu tutulmaması** sorun. Çözüm
  operasyon yüzeyinde: etiketsiz indirim kaydedilememeli, çünkü müşteriye "Kampanya" demek hiçbir
  şey söylemiyor. *(Bu yarısı web/operasyon şeridinin alanı.)*
  **(b) Ürün sayfası kampanyayı hiç söylemiyor** — müşteri sepete gelene kadar indirimli olduğunu
  bilmiyor. Ürün sayfası ile sepet aynı şeyi söylemeli. Bu yarısı mobil tarafta.
  **ÖLÇÜLDÜ 14.08 — ekran işi DEĞİL, ve önce bir DOMAİN kararı istiyor.** Katalog sözleşmesindeki
  tek indirim alanı `wasCents` ve künyesi kapsamını açıkça daraltıyor: *"yalnız yakın-SKT teklifi
  normal fiyatı yendiğinde dolar"* (`catalog-api.schema.ts:105`) — yani parti teklifi, kampanya
  değil. Sepetteki indirim ise ayrı bir yerde hesaplanıyor (`cart/read.ts`).
  **Asıl engel teknik değil:** sepet indirimlerinin bir kısmı **SEPET kapsamlıdır** (MB-22a'nın
  ölçtüğü *"Büyük sepet indirimi"* gibi) ve o, ürüne atfedilemez — ürün sayfasında *"bu ürün
  indirimli"* demek, sepet toplamına bağlı bir şeyi ürünün özelliğiymiş gibi söylemek olurdu ve
  müşteri sepette indirimi göremediğinde haklı olarak yanıltıldığını düşünürdü. Yani önce
  **hangi indirim kapsamlarının ürün sayfasında gösterilebilir olduğu** kararlaştırılmalı
  (ürün/koleksiyon kapsamlı → evet; sepet kapsamlı → hayır), sonra sözleşmeye alan açılmalı.
  Karar verilmeden ekran yazılırsa yanlış vaat üretir.

- [x] ~~**MB-23 · Vitrindeki bölge ile sepetteki teslimat adresi farklı yer gösteriyor.**~~ →
  **ELENDİ, ARIZA DEĞİL (kullanıcı kararı 11.08).** Tasarım zaten tutarlı: vitrindeki yer bir
  **tarama bağlamıdır** (onboarding'de müşterinin kendi kodu; başkasına gönderecekse bilerek
  değiştirir), sepetteki adres **bağlayıcıdır**, ve hangisinin geçerli olduğu kararın verildiği
  yerde açıkça yazılıdır: *"Sepetiniz teslimat adresinize göre değerlendirildi."*
  **Bulgunun neden yanlış olduğu:** ölçüm test hesabının yapaylığından doğmuştu — o hesapta beş
  deneme adresi var (Berlin · Toulouse · Volckerinckhove…) ve onboarding kodu 67000'de bırakılıp
  sipariş başka yere yönlendirilmişti; gerçek müşteri davranışı değil, test kurgusu. "Geç anlaşılıyor"
  itirazı da sepetteki o cümleyi görmezden geliyordu. *Tekrar açılmasın diye kaydı duruyor.*

- [ ] **MB-80 · Vitrin başlığında yer adının kaybolduğu bir kare — ÜRETİLEMEDİ.** 11.08'de bir kez
  görüldü: *"67000 STRASBOURG"* yerine yalnız *"67000"*. Yer adı ayrı bir uçtan çözülüyor
  (`usePlaceResolution`), yani çözüm gecikince ya da düşünce kod tek başına kalıyor olabilir —
  **teori, ölçülmedi.** MB-23 elenirken tek gerçek gözlem olarak ayrıldı.

  **KİMLİK DÜZELTİLDİ 23.08: bu kalem MB-59 diye yazılmıştı ama o numara ZATEN KULLANIMDAYDI**
  (puan geçmişi, `docs/build/21-mobil-uygulama.md` `(21.60)` o kimlikle anıyor). İki ayrı maddenin
  aynı kimliği taşıması, "işi kimlikle üstlen" kuralını sessizce kırar: `(21.60)`'ı okuyan ajan
  kapanmış bir kalemi bu açık gözlemle karıştırırdı. Numara MB-80'e alındı, dışarıdan bağı yoktu.

- [x] **MB-60 · Google ile kaydolan davetlinin davet bağı KURULMUYOR — iki yüzeyde de.** Ölçüldü
  11.08 (kod, `21.43` turunda).

  **KAPANDI (12.08 · iki şerit birlikte).** Web yarısı 17.11: ortak kapı `attachReferralOnLogin` ve
  "yeni müşteri" ölçütünün kayıt anından **siparişsizliğe** çevrilmesi — OAuth'ta kaydın anı
  ölçülemiyor, zaman penceresiyle tahmin etmek sessizce yanlışlanabilir bir ölçüt olurdu. Mobil
  yarısı `21.44`: `POST /api/v1/me/invite/claim` + cihazda tek çağrı (`claimPendingInvite`), OTP
  gövdesindeki alan kaldırıldı. **Bağ artık giriş yöntemini bilmiyor** — WhatsApp açıldığında
  ayrıca bir şey yazılmayacak. *(Aşağıdaki eski metin, arızanın kaydı olarak duruyor.)*

  Davet kodu yalnız OTP doğrulamasının içinde okunuyor
  (`packages/application/src/auth/otp.ts` → `verifyOtpCode`, yeni müşteride `linkReferrer`). Google
  akışı Supabase'e doğrudan gidiyor: profil satırını auth trigger'ı açıyor ve o yoldan geçen hiçbir
  yerde davet kodu sorulmuyor. Yani bağlantıya tıklayıp Google ile kaydolan davetli sessizce bağsız
  kalır — hata vermez, getiren de puanını hiç almaz. **Web'de de aynı** (`otp-actions` ve misafir
  checkout'u dışında okuyan yok), yani kapatılacak yer ortak kayıt yoludur; tek yüzeyde yamamak
  ikinci bir sessiz boşluk açar. Ölçüt basit: "yeni müşteri kartı DOĞDUĞU an" nerede biliniyorsa
  bağ orada kurulmalı.

- [x] **MB-61 · Birden fazla komşu daveti — arayüz tek daveti gösteriyor, ödül sırası tanımsız.**
  → **NATIVE TARAFI KAPANDI, görev `(21.93)`** (21.08). Kutucuk 23.08'e kadar boş kalmıştı: gövde
  *"TESLİM EDİLDİ"* diyor ama başlık 12.08'in eski hâlini taşıyordu, yani satırın başını okuyan
  ajan kapanmış bir işi açık sanıyordu. Kayıt kodla karşılaştırılarak düzeltildi (23.08) —
  beş vaadin beşi de yerinde: çoğul sözleşme (`checkout-api.schema.ts:67`), çoğul okuma
  (`neighbor.ts:307` `readPendingNeighborInvites`), `chosen_at`+`declined_at` ve
  `(customer_id, chosen_at desc)` dizini (`0044_neighbor_invite.sql:125-138`), ret ucu
  (`invite.ts:232`), sınırın yazılması ve doluysa paylaşımın çizilmemesi
  (`order-confirmed-screen.tsx:126-133`).
  **WEB YARISI AÇIK — `docs/talep/not-web-komsu-daveti-sinir-yalniz-native.md`** (23.08): 21.08'in
  şeffaflık kararı iki yüzeyden yalnız native'e yazılmış. Bu satır o işi TUTMAZ (dosya native
  kapsamıdır); not web şeridine bırakıldı, takibi orada.
  Ölçüldü 12.08 (kod + cihaz). Bir müşteri birden çok komşusundan davet almış olabilir; davetler
  aynı sefere de olabilir farklı seferlere de. **Bugün:** sunucu yalnız EN YAKIN açık daveti dönüyor
  (`readPendingNeighborInvite`), yani ikinci davet hiç görünmüyor; aynı gündeki iki davette ise hem
  ekranda yazılan ad hem ödülün yazıldığı komşu **dizinin geldiği sıraya** bağlı — aynı girdi farklı
  sonuç verebiliyor.

  **KARAR (kullanıcı 12.08, onaylandı):** (a) *farklı seferler* için yeni bir kontrol yok — seçim
  zaten gün seçicidir: davet olan günün çipi işaretlenir ve bant **seçili güne göre** konuşur;
  (b) *aynı sefer* için müşteriye sorulmaz, **ilk kabul edilen kazanır** (`linkReferrer`in "ilk
  getiren kazanır" kuralıyla aynı soydan). Ödül bölünmez ve ikiye verilmez: bu bir lojistik
  ödülüdür, araca eklenen tek bir durak vardır.

  ── **KARAR GÜNCELLENDİ (kullanıcı 21.08) — "SON KABUL EDİLEN KAZANIR"** ─────
  Kullanıcı 12.08 kararının gerekçesindeki iki hatayı düzeltti:

  **1. "Araca eklenen tek durak" diye bir algoritma YOK** (kullanıcının sorusu üzerine ölçüldü).
  Kodda sokak ya da adres yakınlığı hiç geçmiyor; davetin anahtarı `(bölge, gün)` ve iktisadi
  gerekçe modülün kendi künyesinde yazılı: *"o güne ikinci sipariş = durak başına maliyet düşer."*
  Yani ödül **zaten planlanmış bir sefere sipariş eklemeye** veriliyor, ortak durağa değil.

  **2. Kabul, davetlinin AÇIK EYLEMİDİR** (ölçüldü — `acceptNeighborInvite` ancak bağlantıya
  tıklanıp kabul edildiğinde bir kabul satırı yazıyor; o ana kadar davet, davetlinin hesabında
  hiç yok). Kullanıcının çıkarımı: *"son gelendeki kullanıcı tekrar kendisi tıklamış oluyor"* —
  yani **en son tıklama en güncel niyettir.** "İlk kazanır" eski bir seçimi dondurur ve
  kullanıcının yeni, bilinçli tıklaması hiçbir şey yapmaz; ekranda *"tıkladım, bir şey olmadı"*
  hissi doğar.

  Kararı güçlendiren ölçüm: aynı gün + aynı bölgedeki iki davette **teslimat sonucu birebir aynı**
  (aynı sefer). Değişen tek şey ödülün kime yazıldığı — yani bu bir lojistik seçimi değil bir
  ATIF kuralı, dolayısıyla kullanıcıya sormamak doğru.

  **Kararın tamamı:**
  · **Son kabul edilen kazanır** — ölçüt dizinin sırası DEĞİL kabul ZAMANI (arızanın kökü buydu).
  · **Davet edenin adı görünür** — rota günü seçilirken / rota seçenekleri içinde *"şu komşunuz
    sizi bu güne davet etti"*. Ad zaten sunucudan geliyor (`inviterName`), eksik olan tek davet
    yerine hepsini döndürmek.
  · **Davetli reddedebilir**; reddedilen davet seçime girmez.
  · **Geri dönüş serbest** — önceki davet bağlantısına yeniden tıklamak onu tekrar öne alır.

  **ŞEMA SONUÇLARI (ölçüldü, `0044_neighbor_invite.sql`):** bugünkü kabul satırı yalnız
  `created_at` taşıyor ve tekrar kabulde `acceptNeighborInvite` erkenden çıkıp **hiçbir şeyi
  tazelemiyor** — yani "geri dönüş" bugün fiilen çalışmaz. Reddin yazılacağı alan da yok.
  İkisi de kolon ister; migration doğrudan düzenlenir (greenfield).

  ~~**İş bölümü:** sözleşmenin çoğula dönmesi ve sıralamanın kabul tarihine bağlanması web
  şeridinde (deftere yazıldı); gün çipindeki işaret ve bandın seçili güne göre konuşması bizde.~~
  **Bölünmedi — tek turda yazıldı (21.08).** Sözleşme çoğula dönünce web'in checkout ekranı da
  aynı anda kırılıyordu; iki şeride bölmek, arada derlenmeyen bir ağaç bırakmak olurdu.

  **TESLİM EDİLDİ (21.08) — cihazda ölçüldü, Claire → Julien senaryosu:**
  · `chosen_at` + `declined_at` kolonları eklendi; dizin `(customer_id, chosen_at desc)`.
  · Sözleşme çoğula döndü (`neighborInvites`), gün başına tek kayıt, kazanan en yeni `chosen_at`.
  · Ret ucu `POST /me/invite/neighbor/decline` — kimlik **Bearer'dan**, gövdeden değil.
  · Ölçüm: iki davet kabul edildi (10:08 ve 10:09), ekranda **tek not** çizildi ve uç ikinciyi
    bağladı. Ret sonrası not ve gün ön seçimi kalktı; aynı bağlantı yeniden açılınca `declined_at`
    temizlenip `chosen_at` öne alındı — geri dönüş gerçekten çalışıyor.
  · Kabul satırı ret'te **silinmiyor**, yalnız damgalanıyor: geri alınabilirliğin dayanağı bu.

  **SINIR ARTIK YAZILI (kullanıcı kararı 21.08 — şeffaflık).** Ekran kaç komşunun
  yararlanabileceğini hiç söylemiyordu; `maxUses` müşteri yüzeyine hiçbir yoldan ulaşmıyordu.
  Sonuç: dolmuş bir daveti paylaşmaya devam eden müşteri, tıkladıktan SONRA "bu davet dolu"
  cümlesiyle karşılaşan komşu. `OrderNeighborInviteSchema` artık `remainingUses` + `maxUses`
  taşıyor; sipariş onayı *"Bu davetten {n} komşunuz daha yararlanabilir (en fazla {max})"* yazıyor
  ve **doluysa paylaşım düğmesini çizmiyor**. Sayı SUNUCUDA sayılıyor (iptal olan sipariş
  sayılmaz, tavan davet satırında dondurulmuş) — ekrana gömülmüş bir "3", ayar değiştiği gün
  yalan söyleyen bir cümle olurdu.

  **Onay diyaloğu KONMADI** (kullanıcı sordu, ölçüldü): `Share.share` ateşle-unut bir çağrıdır —
  kullanıcının gönderip göndermediği geri dönmez. "Üçüncü paylaşımdan sonra uyar" düğmeye basma
  sayısını sayardı, paylaşımı değil. Sayılan şey TÜKETİM; söylenen de o.

  BEKLEYEN(MB-61): "davet doldu" hâli cihazda GÖRÜLMEDİ — üç ayrı komşunun aynı güne gerçekten
  sipariş vermesi gerekiyordu. Uç tarafı (`remainingUses: 0`) doğrulandı, ekran dalı değil.

- [~] **MB-24 · Fiyat değişti bildirimi** (`DOMAIN §5`: fiyat arttıysa müşteriye söylenir ve onay
  istenir; düştüyse sessizce uygulanır) — `design/BACKLOG.md` §1'den devralındı.

  **KAYIT BAYATTI — ÖLÇÜLDÜ 13.08 (kod), native yarısı ZATEN ÇALIŞIYOR.** *"`CartItem.unitPrice`
  yazılıyor ama karşılaştırılmıyor; native sepette de karşılığı yok"* cümlesinin iki yarısı da
  bugün yanlış: (a) karşılaştırma var — `priceChangeOf` (`apps/web/lib/cart/read.ts`) yalnız
  ARTIŞTA `priceChange: { previousCents }` üretiyor, düşüş sessiz; (b) native sepet bunu
  ÇİZİYOR — `cart-screen.tsx:273`, *"Fiyat güncellendi — önceki {price}"*. Onay kapısı da
  yazılmış ve testli: checkout taslağı artışta AÇILMIYOR, `price_changed` ile eski ve yeni tutarı
  birlikte döndürüyor, ikinci deneme geçiyor (`apps/web/lib/order/checkout-draft.test.ts`).
  Yani `DOMAIN §5`'in *"bağlayıcı fiyat checkout başlangıcında sabitlenir"* kararı uygulanmış
  durumda ve **ayrı bir bildirim altyapısı gerektirmiyor** — bu bir sepet/checkout kuralı,
  itilen bir mesaj değil.

  **Kalan tek açık BİZDE DEĞİL:** web sepeti `priceChange` alanını okumuyor. Aynı müşteri
  native'de uyarıyı görüyor, web'de görmüyor — MB-36'nın "iki yüzeyde iki kural" soyundan.
  Web şeridine bildirilecek; bu satır o kapanınca kapanır.

---

## 6. Yerleşim ve tasarım

- [x] **MB-25 · Koleksiyon bandı uzun başlıkta sayaç satırını kırpıyor.** **Ölçüldü:** dört
  satırlık başlıkta *"23 çeşit ›"* satırının yalnız üst yarısı görünüyor, altını sonraki bant
  boyuyor. Sebep: sabit `132 dp` yükseklik (`screens/home/collection-band.tsx:115`) + alt başlıkta
  satır sınırı yok. **Dikkat:** yükseklik serbest bırakılamaz — üst katman dairesi
  `index * collectionBand` ile konumlanıyor (`:97`); ya başlığa satır sınırı konur ya ikisi birlikte
  ölçülür.
  → **KAPANDI, görev `(21.49)` (14.08) — satır sınırı seçildi, yükseklik sözleşme olarak durdu.**
  Sınır göze göre değil bütçeye göre: 132 dp'den "Büyük" yazı boyutunda göz üstü ~15 + sayaç ~17 +
  iki boşluk 4 düşünce başlığa 96 kalıyor, satır boyu ≈ 26,5 dp — üç satır 79 (sığar), **dört
  satır 106 (taşar, ölçülen hâl)**. Başlık iki satırda durduruldu (üçüncü aritmetik olarak sığsa
  da payı sıfırlıyor ve daha büyük erişilebilirlik ölçeklerinde ilk taşan o olurdu); göz üstü tek
  satır — o bir koleksiyon adı, sarsa aynı bütçeden yiyecekti.

- [x] **MB-26 · Şirket bilgileri alanları dolduktan sonra etiketsiz kalıyor.** Yalnız yer tutucu
  var; "67380" ve "LINGOLSHEIM"in ne olduğu içerikten tahmin ediliyor.
  → **KAPANDI, görev `(21.49)` (14.08).** Karşılaştırma yapıldı ve kitte bu rol ZATEN vardı
  (`TextField.label`, künyesi: *"görünür etiket isteyen ekran ayrıca `label` verir"*) — hiçbir
  ekran kullanmıyordu. Başvuru formunun sekiz alanının hepsi etiketlendi. Neden hepsi: kusur
  yalnız resmî kayıttan KENDİLİĞİNDEN dolan alanlarda görünüyor (yer tutucu dolunca kaybolur),
  ama formun yarısını etiketlemek ötekini bozuk gösterirdi.

- [x] **MB-27 · Vitrin altındaki iki davet kartı iki ayrı görsel dilde.** Keşif kartı canlı
  terracotta kesikli çerçeve, Profesyonel kartı soluk gri — ikincisi **devre dışı gibi** duruyor.
  İkisi de aynı işi yapıyor (bir sayfaya davet).
  → **KAPANDI, görev `(21.49)` (14.08) — sonra 15.08'de bir adım daha atıldı.**
  **Birinci adım:** kusur tonun kendisinde değil, KURALIMIZA aykırı seçilmiş olmasındaydı;
  `dashed-invite.tsx` künyesi *"`terracotta` çağırıdır, `sand` bilgidir"* diyor ve bu kart durum
  bildirmiyor, davet ediyor. Ton `terracotta`ya, işaret Keşif kartıyla aynı `›`e döndü; ölü kalan
  `inviteArrow` stili silindi.
  **İkinci adım (kullanıcı kararı 15.08):** o zaman da iki davet alt alta AYNI renkte kaldı ve
  bu istenmedi. Profesyonel kartı **zeytine** geçti — kite üçüncü ton eklendi (`olive`), ok
  işaretinin rengi de eşlendi. Ayrım *"biri sönük"* diye değil, **ikisi ayrı yere götürüyor**
  diye kuruldu; zeytin uygulamanın olumlu rengi olduğu için kart canlı kalıyor.
  **Cihazda doğrulandı (15.08, 12:25):** iki kart yan yana ayrışıyor, hiçbiri devre dışı
  görünmüyor. Aynı karede MB-58a'nın ters yönü de kanıtlandı — girişli kullanıcıda Keşif daveti
  GÖRÜNÜYOR (misafirde 12:08'de gizliydi).

- [x] **MB-28 · Ürün varyantlarının sırası düzensiz.** Ölçülen sıra: `450g · 225g · 2500g · 1250g`
  — ne artan ne azalan.
  → **KAPANDI (15.08), görev `(21.53)` — MOBİL ARIZASI DEĞİL, kod değişikliği YOK.**
  Okuma zaten sıralı: `catalog/product-context.ts:64` varyantları `sortOrder`a, eşitlikte
  `createdAt`e göre diziyor. Ekrandaki sıra veritabanındaki `sort_order`ın kendisi — ürün
  `11850393-…` için ölçüldü: `0→450g · 1→225g · 2→2500g · 3→1250g`. Makine doğru, veri öyle
  yazılmış; **yerel veri sahte olduğu için buradan iş çıkarımı yapılmadı** (CLAUDE.md).
  **Ve sıranın operatörde kalması ZATEN KARARA BAĞLANMIŞ** — `08.10` / commit `da91ea97`
  (kullanıcı hatırlattı, 15.08): *"`sort_order`'A DOKUNULMADI ve dokunulmamalı: o kolonu detayın
  boy seçicisi, mobil ana ekran ve fikirler şeridi de okuyor — fiyata bağlansaydı operatör '1 kg'ı
  öne al' diyemezdi."* Yani "ağırlığa göre sırala" diye bir seçenek YOK; o karar verilmiş.
  Değişen şey sıra değil, **hangi boyun fiyatının kartta yazacağıydı** (`primaryVariantOf`).
  **Asıl açık operasyon alanında:** `sort_order`u yazan tek metot (`syncVariants`,
  `product-variant.service.ts:55`) kaynak ağacında HİÇ ÇAĞRILMIYOR — yani `08.10`'da operatöre
  bırakılan kaldıraç bugün operatörün elinde değil. Not düşüldü:
  `docs/talep/not-operasyon-varyant-sirasini-kimse-yazmiyor.md`.
  **Bu turun asıl kazancı MB-20'ye gitti:** sebebi ararken mobilin `primaryVariantId`i hiç
  okumadığı bulundu — aşağıya bak.

- [ ] **MB-29 · Görselsiz koleksiyon/paket kartında ekranın yarısı kadar tek harf çiziliyor**
  ("Y", "F"). Yedek gösterim bilinçli ama fotoğraflı kartların yanında arıza gibi duruyor.
  Bağlantılı: `design/BACKLOG.md` §1 — **boş sepet kahraman görseli** (native 180×140) ve
  **paketler kahraman görseli** (3:2) hâlâ görselsiz.
  **ÖLÇÜLDÜ 14.08 (cihazda görüldü + kod) — "ekranın yarısı" abartı, ve kusur BOYUTTA DEĞİL.**
  Harf 148 dp'lik dairenin içinde 30 px, yani çapın ~%20'si; tonlar da zaten sessiz seçilmiş
  (daire `scrim-soft`, harf `on-image-soft`). Rahatsız eden şey oran değil **BAĞLAM**: fotoğraflı
  bantların arasında çıplak bir harf, eksik bir şey varmış hissi veriyor — ki gerçekten de eksik
  olan GÖRSELİN KENDİSİ. Yani asıl çözüm içerik tarafında (§8'deki görsel bekleyenleri), yedek
  gösterimi kurcalamak değil.
  **Bu şerit yedek gösterime DOKUNMADI ve bu bilinçli (CLAUDE §3):** görsel karar `.dc.html`den
  gelir, improvise edilmez. Harfi küçültmek/silmek bir tasarım kararıdır — Claude Design'a
  sorulmalı. **Karar maddesi olarak işaretlendi**, kod işi değil.

- [x] **MB-48 · Alttan açılan çekmece YUKARIDAN taşıyordu; öneri listesinin boyu sınırsızdı**
  → **KAPANDI, görev `(21.41)`** (11.08, kullanıcı bulgusu + cihazda ölçüldü). Panelin tavanı tam
  ekrana göreydi ve klavyeyi hesaba katmıyordu; taşan içerik yukarı kaçıyor, kaydırma olmadığı için
  geri gelmiyordu. Adres önerileri tetikleyiciydi (beş satır = ekranın %36'sı) ama sebep listede
  değil kaptaydı — girdi taşıyan her çekmeceyi ilgilendiriyordu. `new-ticket-sheet`in yerel çözümü
  kite taşındı. **iOS'ta da düzeldi** (kullanıcı doğrulaması 11.08): önce klavyenin üstünde ölü bir
  şerit kalıyordu, alt güvenli alan payı klavye açıkken de eklendiği içindi; koşul eklenince kalktı.

- [x] **MB-30 · Unistyles uyarısı kütükte tekrarlıyor:** `we detected style object with 2 unistyles
  styles … use array syntax instead of object syntax`. Hangi bileşen olduğu bulunup düzeltilecek.
  → **KAPANDI (15.08), görev `(21.52)` — sebep cihazda ölçülerek bulundu: `components/ui/skeleton.tsx`.**
  **Ve suç dizi sözdiziminde değildi:** `Skeleton` zaten diziyi doğru kullanıyordu; `Animated.View`
  diziyi İÇERİDE tek nesneye düzleştiriyor ve düzleşen nesnede iki unistyles anahtarı yan yana
  geliyordu. Yani uyarının önerdiği düzeltme ("dizi kullan") burada zaten yapılmıştı — statik
  aramanın 14.08'de boş dönmesinin sebebi de buydu. Riski gerçek: tema değişiminin (karanlık mod)
  iskelete işlememesi. Çözüm: zemin ton başına TAM stile taşındı (`soft`/`default`/`deep`), diziye
  tek unistyles stili giriyor. Uyarı açılışta **2–3 → 0**; iskelet cihazda görsel olarak doğrulandı.
  Ölçüm yolu (iki yanlış adım dahil — Metro kitaplığın `src/`ini çözüyor, derlenmiş çıktısını
  değil) `(21.52)`de yazılı.
  **STATİK ARAMA SONUÇ VERMEDİ (14.08).** Uyarının klasik sebebi iki unistyles stilini NESNE
  olarak birleştirmektir (`style={{ ...styles.a, ...styles.b }}`); depoda böyle tek bir kullanım
  YOK — aranan desenlerin hiçbiri eşleşmedi, buna karşılık dizi sözdizimi 64 yerde doğru
  kullanılmış. Yani kaynak daha dolaylı (bir bileşenin aldığı `style`ı içeride birleştirmesi ya
  da kitin bir kabı olabilir) ve **çalışma anında yakalanmalı**: cihaz kütüğü okunacak. `adb
  logcat` bu turda zaman aşımına düştü, ölçüm yapılamadı. Cihaz işi (§13 ⚑) — bir sonraki
  cihaz turunda uygulama açıkken kütük süzülerek bulunur.

### 18.08 cihaz turunda açılanlar (A bölümü — MİSAFİR, ilk kez koşuldu)

> A1…A13 ve A15–A16 koşuldu; **A17 ile A14'ün giriş duvarı açık kaldı.** Turun kendi ön koşulları da düzeldi
> (`pm clear` bu cihazda çalışmıyor, veri silme dev client'ı da sıfırlıyor) — ayrıntısı
> `05-cihaz-turu-musteri.md` başındaki durum kutusunda.
>
> **Geçenler:** A1 (seçim aynı karede çeviriyor ve kendiliğinden ilerliyor; üç dil kendi adıyla) ·
> A2 ("Büyük" seçiliyken sonraki adımların hiçbiri taşmadı) · A3/A4 (bölge içi ve dışı AYRI cümle;
> **bölge dışı cevabı ret gibi değil, alternatif gibi okunuyor** — *"soğuk zincir korumalı kargoyla
> 2–4 iş gününde"*) · A5 (havale satırı *"Profesyonel müşterilerimize özel"* diyor, B2C şaşırmıyor) ·
> A6 (*"500 puan = 5,00 € kupon"* tek satır; altı satırlık liste kapalı, açılınca iki davet tipi
> ayrı ayrı ve ödeme koşuluyla anlatılıyor) · A7 (vitrine düşüyor) · A8 (**misafire hiçbir "önce
> hesap aç" duvarı çıkmıyor** — bölge seçici, fırsat şeridi, koleksiyonlar, tarifler, paketler
> hepsi açık) · A14 kısmen (sepet misafirde cihazda yaşıyor, adres yerine posta kodu gösteriliyor;
> **giriş duvarının yeri ölçülemedi** çünkü "Siparişi tamamla" asgari sepet yüzünden kapalıydı).

- [x] **MB-74 · Onboarding'in iki adımı SOĞUK ZİNCİR konusunda birbiriyle çelişiyor.**
  Ölçüldü (18.08, cihazda, Türkçe):
  · **Teslimat adımı:** *"Kargoyla — Bölge dışında yalnız kargolanabilir ürünler; **soğuk zincir
    gerektirenler kargoyla gönderilemez**."*
  · **Posta kodu adımı, bölge dışı cevabı:** *"**Soğuk zincir korumalı kargoyla** 2–4 iş gününde
    ulaştırırız."*

  İki ekran arayla biri "gönderemeyiz" diyor, öteki "gönderiyoruz" diyor. Aradaki ayrım muhtemelen
  gerçek (yalıtımlı ambalajla kısa süre serin kalan ürün ≠ donuk ürün) ama **müşteri o ayrımı bu
  iki cümleden ÇIKARAMAZ**: kelimeler neredeyse aynı. Bölge dışındaki müşteri ilk cümleyi okuyup
  "demek bana donuk ürün gelmiyor" diye katalogdan çekilebilir ya da tersine ikinci cümleye
  güvenip donuk ürün bekleyebilir.
  **A15 TURUNDA ÜÇÜNCÜ YER ÖLÇÜLDÜ VE ÇELİŞKİNİN HANGİ TARAFI OLDUĞU BELLİ OLDU (18.08).**
  *"Nerelere gidiyoruz"* sayfası şöyle diyor: *"Kalan her yere kargoyla gönderiyoruz; **yalnız
  soğuk zincir isteyen ürünler gidemiyor**."* Yani üç yerin **ikisi** (teslimat adımı + bu sayfa)
  aynı kuralı söylüyor; **aykırı olan tek yer onboarding'in posta kodu adımıdır.**

  **Yapılacak (daraldı):** düzeltilecek cümle belli — posta kodu adımının bölge dışı cevabı.
  Bugün *"soğuk zincir korumalı kargoyla 2–4 iş gününde ulaştırırız"* diyerek gönderemeyeceğimiz
  bir şeyi vaat ediyor. Öteki iki yerin diliyle yazılmalı: kargo var, ama soğuk zincir isteyen
  ürünler kargoya girmiyor. Metin kararı olduğu için yazımı kullanıcıya bırakıldı.

  **KAPANDI (18.08 · `(21.82)`) — ve kökü çelişki değil KOPYAYMIŞ.** Kullanıcı cümleyi eledi
  (*"anlamsız geliyor kulağa"*) ve doğru kurgusunu verdi: önce ÜRÜN, sonra yol. Ölçünce görüldü ki
  onboarding'in dört hâl cümlesi `lib/places/messages.json` ile **birebir aynıydı, biri hariç** —
  yani iki kopyadan biri zamanla ayrışmıştı ve hangisinin doğru olduğunu kimse göremiyordu. Kopya
  kaldırıldı: onboarding artık ortak sözlüğü okuyor, cümle bir daha ayrışamaz. Konunun tamamı
  (11 temas noktası, üç dil) tek kalıba indi ve ilan edilen tutarlar `settings`ten okunur oldu.
  Ayrıntı ve öteki üç çelişki `docs/build/21-mobil-uygulama.md (21.82)`de.

- [x] **MB-75 · MİSAFİRİN KEŞİF TURUNA HİÇBİR KAPISI YOK — künye açıkça tersini söz veriyor.**
  Kullanıcı sordu (18.08): *"vitrinde en altta keşif kartı görünmesi gerekirken herhangi bir şey
  yoktu."* Ölçüldü — kartın çizilmemesi **kasıtlı ve doğru**: MB-58a (14.08) misafirde daveti
  kaldırmış, çünkü davetin vaadi puandır ve motor kimliksiz oya puan vermiyor
  (`application/feedback/discover.ts`, `pointsAwarded: null`). Karşılığı olmayan bir davet
  gösterilmiyor; buraya kadar tutarlı.

  **Ama aynı künye şunu yazıyor:** *"Turun KENDİSİ misafire açık kalmaya devam ediyor (tasarımın
  kararı: 'misafirin oyu da talep sinyalidir'), kapanan yalnız ödül vaat eden çağrı. Keşfe girmek
  isteyen misafir SEKMEDEN ya da bitiş ekranının giriş davetinden geçer."*
  **İkisi de yok.** `/discover`a giden üç çağrının üçü de girişli hâle bağlı:
  `home-screen.tsx:670` (`!signedIn ? null : …`), `account-screen.tsx:147` ve `:762` — hesap
  sekmesi ise misafiri doğrudan `/login`e itiyor. Sekme çubuğunda keşif YOK
  (`app/(tabs)`: index · catalog · packages · account). "Bitiş ekranının giriş daveti" de turun
  İÇİNDE — oraya girmeden ulaşılamıyor.

  **Yani 14.08'in düzeltmesi, ödül vaadiyle birlikte TURUN KENDİSİNİ de misafire kapatmıştı** ve
  künye kapanmadığını sanıyordu.
  → **KAPANDI (18.08), görev `(21.80)` — kullanıcı kararı hatırlattı: iptal edilmemiş.**
  Kullanıcı sordu: *"misafir keşif yaptıktan sonra en son seçenekte giriş yapmayı ve puanları
  toplamayı teklif edebiliriz. Bunu daha önce yapıyorduk sanki."* Ölçüldü — **yapılıyor, hepsi
  kurulu:** turun bitiş ekranı misafire *"Giriş yaparsanız keşif turları puan kazandırır"* diyor ve
  "Hızlı doğrulama" düğmesi veriyor (MB-14, 14.08); girişsiz oylar da cihazda tutulup girişte
  hesaba bağlanıyor (`lib/discover/pending-swipes-store` → `/me/discover/claim`). Eksik olan tek
  şey KAPIYDI.

  **Çare cümleyi düzeltmekti, kapıyı kapatmak değil — ve o cümle zaten yazılmıştı.** Kart artık
  misafirde de çiziliyor, ama bitiş ekranının kullandığı koşullu registerle: *"…giriş yaparsanız
  tamamlanan tur puan da kazandırır."* Girişlide vaat kesindir, eski cümle aynen kalır. Vitrin
  iskeleti de kutuya artık her hâlde yer ayırıyor (eskiden misafirde ayırmıyordu — kart gelince
  sayfa bir kutu boyu kayardı).
  **Cihazda uçtan uca doğrulandı (18.08):** misafir kartı görüyor, basınca tur açılıyor (1/20,
  kaydırma çalışıyor).

- [x] **MB-76 · YASAL SAYFALARIN MİSAFİRE AÇIK HİÇBİR KAPISI YOK.**
  A17'de ölçüldü (18.08, cihazda): `/legal/*`e giden çağrıların tamamı üç yerde ve üçü de kapalı —
  `account-screen.tsx:575` (Teslimat ve iade), `:694` (Gizlilik), `login-screen.tsx:367` (Gizlilik).
  Hesap sekmesi misafirde *"Hesabınıza ulaşmak için birkaç saniyede doğrulanın"* duvarını çiziyor;
  altında tek düğme var ve o da giriş. Yani **teslimat kuralları, kargo ücreti, asgari sepet,
  iade koşulları ve SSS satın alma kararını verecek kişiye kapalı.** Sayfalar deep-link ile
  açılınca sorunsuz çalışıyor (ölçüldü) — eksik olan yalnız kapı.

  Bu MB-75'in **birebir aynı sınıfı**: içerik kurulu, kapı yok. Orada da çare kapıyı açmaktı.
  Aciliyeti şu iki şey artırıyor: (a) yeni *"Güncel tutarlar"* bölümü `(21.82)` ile canlı ayardan
  okunuyor ve müşteri onu göremiyor; (b) Fransız tüketici mevzuatında teslimat koşulları ve ücretler
  **satın almadan ÖNCE** erişilebilir olmak zorunda — web'de site altbilgisinden açık, uygulamada
  değil. **Yapılacak:** kapının yeri kullanıcı kararı — hesap duvarının altına bir bağ şeridi mi,
  onboarding'in sonuna mı, yoksa sepet/ödeme ekranına mı.

  **KAPANDI (19.08 · `(21.87)`) — ve kaydın İKİ yeri ölçümle değişti.**

  **1 · Sorun "misafire kapalı"dan büyüktü: iki belge HİÇ KİMSEYE açık değilmiş.** Beş belgeye
  giden dört çağrı sayıldı (hesap menüsü → `delivery`, veri kartı → `privacy`, giriş ekranı →
  `privacy`, sayfaların çıkış bantları) ve bantların yönü de çıkarıldı (`delivery → faq`,
  `privacy → account`, `sales → delivery`, `terms → sales`). **`sales` (satış koşulları) ve `terms`
  (yasal bilgiler) hiçbir yoldan açılmıyordu** — girişli müşteri de dahil; yalnız deep-link.

  **2 · Önerilen kapı yeri yanlıştı.** Kayıt *"hesap duvarının altı"*nı ilk aday sayıyordu; ama
  `account-routes.test` misafirin hesap sekmesinden **doğrudan `/login`e itildiğini** kanıtlıyor
  (08.08 kararı) — duvar yalnız girişten VAZGEÇENE görünüyor. Tek başına oraya konan kapı,
  misafirlerin çoğunun hiç görmeyeceği bir kapı olurdu.

  **Yapılan:** tek blok (`screens/legal/legal-links.tsx`, beş belge, web altbilgisinin sırası),
  **hesap ekranında** — girişli gövde + misafir duvarı. Ayrıca checkout'a web'in cümlesi taşındı:
  *"Onaylayarak satış koşullarını kabul etmiş olursunuz"* + satış koşulları bağı — native'de yoktu,
  yani müşteri kabul ettiği metni ne görüyor ne açabiliyordu. Satış koşulları sayfası cayma hakkını,
  yasal garantileri, fiyatı, ödemeyi ve teslimatı zaten taşıyor (bölümleri sayıldı), o yüzden
  checkout'a **tek bağ** kondu; ikincisi fazlalık olurdu.

  **VİTRİNE DE KONMUŞTU, GERİ ALINDI (kullanıcı ölçütü 19.08):** *"doğru yerde, doğru bilgiyi, doğru
  miktarda; devlet nerede neyi göstermemizi istiyorsa o kadar."* Kanun belgelerin **erişilebilir**
  olmasını istiyor, her ekranda **gösterilmesini** değil — vitrin alışverişin kendisi, oraya konan
  beş satırlık hukuk listesi gereksiz yük. Sözleşme öncesi bilginin anı zaten checkout ve misafir
  hesapsız sipariş veremiyor. Ayrıntı `(21.87)`.
  **Cihaz turu yapılmadı** — yeni kapı ve yeni izin satırı görsel olarak doğrulanmalı, sıradaki tura kaldı.

- [x] **MB-77 · YASAL METİNDE WEB DİLİ KALMIŞ — uygulamada karşılığı olmayan yerler tarif ediliyor.**
  A17'de ölçüldü (18.08, cihazda). Mobil sözlük web'in `content.json`larından üretilmişti
  (`legal-types.ts` künyesi) ve üretim sırasında yüzey farkı gözetilmemiş:
  · *"Posta kodunuzu **sitenin üst şeridinde** her an değiştirebilirsiniz"* — uygulamada üst şerit
    yok; posta kodu vitrin başlığındaki hapta ve çekmeceyle değişiyor.
  · *"sepete koyup **checkout'ta** sürprizle karşılaşmazsınız"* — "checkout" müşteri dili değil;
    uygulamadaki adım "Siparişi tamamla".
  · SSS: *"**Site** ve e-postaların dilini nasıl değiştiririm?"* — uygulamada dil Hesabım'dan.
  Üç cümle de yanlış bilgi vermiyor ama **olmayan bir yeri tarif ediyor**; müşteri aradığını
  bulamaz. Kalemi `BEKLEYEN(21.82)` ile birlikte okumak gerek: iki nüsha elle senkron tutulduğu
  sürece bu sınıf yeniden doğar.

  **KAPANDI (19.08 · `(21.86)`) — ve tam tarama üç değil SEKİZ yer buldu.** Cihazda görülen üçü
  başlangıçtı; sözlüğün tamamı taranınca aynı sınıfın daha ağır bir kolu çıktı: **gizlilik metni
  uygulamada var olmayan bir mekanizmayı tarif ediyordu.**
  · *"Çerezler ve tarayıcı kaydı"* başlığı, *"Tarayıcınızda tutulanlar…"*, *"tarayıcıdaki sepetiniz
    … tarayıcıdan silinir"*, *"posta kodu tarayıcınızda saklanır"* — **uygulamada ne tarayıcı var
    ne çerez.** Ölçüldü: oturum `expo-secure-store` ile işletim sisteminin güvenli kasasında
    (iOS Anahtar Zinciri · Android Keystore), ilk açılış işareti `Settings`te (`device-store.ts`
    künyesi). Başlık *"Cihazınızda saklananlar"* oldu ve saklama yeri ADIYLA yazıldı — GDPR
    metninin işi zaten budur: nerede durduğunu söylemek.
  · Posta kodu değiştirme yeri, *"checkout"* jargonu ve SSS'in dil sorusu da uygulamanın gerçek
    yerlerine bağlandı (*"vitrinin üstündeki bölge hapı"*, *"Siparişi tamamla"*, *"Hesabım"*).
  · Fikri mülkiyet maddesindeki *"tarayıcınızda görüntüleme"* (yalnız TR'de vardı) sadeleşti.

  **⚠ AŞAĞIDAKİ "BİLEREK DOKUNULMADI" KARARI ERTESİ GÜN GERİ ALINDI (19.08 · `(21.87)`).** Kullanıcı
  ölçütü koydu: *"gereksiz bilgilerle kendimizi sorumluluk altına sokmayacağız."* Paragraf yapmadığımız
  bir işlemi beyan etmekle kalmıyor, bir de yöntem sözü veriyordu (*"çerezsiz, her gün değişen ve
  ertesi gün atılan anahtar"*) — karşılığı olmayan bir taahhüt. Üç dilde silindi; ölçüm gerçekten
  başladığında paragrafı MB-63'ü yazan, kurduğu mekanizmayla birlikte yazacak. *(Eski gerekçe,
  kararın nasıl döndüğü görünsün diye aynen duruyor.)*

  **BİLEREK DOKUNULMADI — ve gerekçesi kayda değer.** Gizlilik §6'nın ikinci paragrafı *"Sayfaların
  ne sıklıkla görüntülendiğini ölçüyoruz"* diyor; **MB-63 ölçtü, native'de sıfır analitik çağrısı
  var**, yani cümle bugün uygulamada doğru değil. Yine de silinmedi: (a) fazladan beyan etmek
  (over-disclosure) gizlilik metninde müşterinin aleyhine bir kusur değildir, eksik beyan öyledir;
  (b) **MB-63 kapandığı gün cümle kendiliğinden doğru olacak** — bugün silip yarın geri yazmak,
  düzelttiğimiz hatanın aynısını ters yönde yapmak olurdu.

  **AÇIK KALAN — kullanıcı kararı bekliyor:** yasal metinlerde *"site"* kelimesi tüzel bağlamda da
  geçiyor (*"Site sahibi"*, *"Bu site … barındırılmaktadır"*, *"Bu sitedeki metinler … site
  sahibine aittir"*, *"bu site üzerinden yapılan tüm satışlar"*). Bunlar **olmayan bir yeri tarif
  etmiyor**, hizmetin adı olarak duruyor — ama uygulamada okununca yine de tuhaf. Değiştirmek
  (*"site ve uygulama"* ya da *"Lezzet Anatolia hizmeti"*) bir HUKUK METNİ kararıdır ve web
  nüshasını da ilgilendirir; tek başıma yazmadım.

### 17.08 cihaz turunda açılanlar (B bölümü — girişli müşteri)

> Beşi de **görsel/metin** kalemi; hiçbiri veri ya da hesap arızası değil. Turun aynı gününde
> ölçülen üç şey ise arıza DEĞİL çıktı ve ilgili künyelerine yazıldı: MB-03 (sebep ölçüm aracı),
> MB-20 (kart↔detay fiyatı üç yerde de aynı), MB-50 (`visit` satırı defterde).
>
> **DURUM 18.08 — dördü kapandı, biri daraltıldı** (görevler `(21.74)` · `(21.75)`): MB-67 · MB-71 ·
> MB-66 · MB-68 · MB-69 tamam; MB-70'in bulgusu ölçülünce tasarımın kendisi çıktı ve kalem tek bir
> cihaz ölçümüne indirildi. Beşinin dördü **aynı kusurun** ayrı yüzüydü: ekranın iki ayrı yeri aynı
> şeyi söylüyor, çünkü ikisi de ötekinin ne söylediğini bilmiyor.

- [x] **MB-66 · Hesap kartında e-posta iki kez yazılı.** Ölçüldü (17.08): `user_profiles.name`
  boş string, `phone` NULL. Ekran ad satırını e-postaya düşürüyor, ama hemen altındaki satır zaten
  `data.email`. Sonuç: aynı adres üst üste iki kez.
  → **KAPANDI (18.08), görev `(21.75)`.** Karar doğruydu, YERİ yanlıştı: yedeğe düşme rotada
  yapılınca ekran o satırın gerçek ad mı yedek mi olduğunu bilemiyordu. Rota adı olduğu gibi
  geçiriyor (boşsa boş), yedek `account-screen`de seçiliyor ve alt satır adresi tekrar etmek yerine
  eksiği söylüyor (*"Adınızı ekleyin"* · *"Ajoutez votre nom"* · *"Fügen Sie Ihren Namen hinzu"*).
  **Yan kazanç:** profil çekmecesi taslağı yedeğe düşülüp düşülmediğini `data.name === data.email`
  ile TAHMİN ediyordu — adı e-postasıyla aynı olan hesapta yanlış cevap verirdi; artık tek karardan
  okuyor.

- [x] **MB-67 · Puan geçmişi ekranı toplamsız ve çağrısız.** Liste doğru çalışıyor
  (`Visite du jour · 17 août 2026 · +10`, defterle birebir), ama ekranda **bakiye yok** ve tek
  satırın altında ~1500 piksel boşluk kalıyor. Müşteri buraya *"puanlarım nerede"* diye gelir;
  bakiyeyi görmek için hesap kartına dönmek zorunda.
  → **KAPANDI (17.08), görev `(21.73)`** — MB-57 ile aynı turda, çünkü ikisi aynı ekranda buluşuyor.
  Başlığa **bakiye satırı** kondu (kart okunmadan çizilmez: "0 puan" gösterip gerçek sayıya atlamak,
  olmayan bir bakiyeyi bir an doğru gibi okuturdu) ve altına **"yolda" bloğu** geldi. Ekran artık iki
  ucu birden okuyor (`/points` + `/points/history`) ve bu bilinçli: kartın tavanı sabit, defter
  sınırsız büyüyor — sözleşme künyesindeki ayrım korundu.
  **Aynı turda üçüncü bir kusur çıktı ve düzeltildi:** gruplama anahtarı `sebep + tarih`ti, işaret
  yoktu — aynı gün yazılıp iptal edilen ödülün iki satırı tek satırda toplanıp ekranda
  **"Komşu daveti · 2 hareket · +0"** yazacaktı. İşaret anahtara eklendi; kazanç ile iptal ayrı
  satırlar ve ayrı etiketler (*"— iptal edildi"* · *"— annulée"* · *"— storniert"*).

- [x] **MB-68 · Talepler boş hâlinde aynı işi yapan iki çağrı, iki ayrı isimle.** Üst çubukta
  `+ Nouvelle`, ortadaki boş hâlde `Écrivez-nous`. İkisi aynı yere gidiyor ama isimleri farklı
  olduğu için müşteri iki ayrı şey sanıyor.
  → **KAPANDI (18.08), görev `(21.75)`.** Çubuk artık ekranın hâlini biliyor (`bar(withNew)`): boş
  hâlde çizilmiyor, ortadaki kalıyor — o anki tek iş odur ve gerekçesini de yazar.
  **Aynı satırda ikinci bir kusur çıktı:** misafir dalında çekmece hiç çizilmiyor (talep açmak
  oturum ister) ama çubuktaki bağlantı duruyordu — basınca görünür hiçbir şey olmuyordu. O dalda da
  kaldırıldı. Yükleme ve hata hâllerinde kalıyor: rakip çağrı yok, çekmece çiziliyor.

- [x] **MB-69 · Sepette asgari sepet uyarısı iki kez.** Aynı cümle hem kart içinde
  (*"Panier minimum 40,00 € — il manque 36,32 €"*) hem alt çubukta (*"Il manque 36,32 € pour le
  panier minimum"*). Sayı ikisinde de doğru; tekrar eden bilgi.
  → **KAPANDI (18.08), görev `(21.75)` — ama not "kartaki kopyayı kaldır" değil.** 16.08'de bara
  gerekçe satırı konurken dipteki uzun açıklamanın KALMASINA karar verilmişti; ikisi ayrı soruyu
  cevaplıyor ("neden basamıyorum" ↔ "ne yapmalıyım"). Kusur metindeydi: ikisi de aynı eksik tutarı
  yazıyordu. Tekrar eden sayı dipten silindi — bar EKSİĞİ, dipteki EŞİĞİ ve ne yapılacağını
  söylüyor. Notu tümden kaldırmak asgari sepetin KAÇ olduğunu hiçbir yerde bırakmazdı.
  **Cihazda doğrulandı (18.08):** 1,84 €'luk tek kalemle sepet açıldı — dipte *"Asgari sepet
  40,00 €. Sipariş verebilmek için birkaç ürün daha ekleyin."*, barda *"Asgari sepete 38,16 €
  eksik"*. Tekrar eden sayı yok, iki uç birbirinde olmayanı söylüyor.

- [x] **MB-71 · Başlık üstü etiketler SABİT Türkçe yerelle büyütülüyor — Fransızca ve Almanca'da
  noktalı `İ` çıkıyor.** → **KAPANDI (17.08), görev `(21.74)`.** Kural `lib/i18n/locale`a taşındı
  (`upperIn(text, locale)`) ve **19 çağrının hepsi** oradan geçiyor; depoda sabit yerel kalmadı.
  **Cihazda iki yönde doğrulandı:** Almanca `KOLLEKTIONEN` · `MEIN KONTO` (noktasız `I`) ve Türkçe
  `KOLEKSİYONLAR` (noktalı `İ`) · `FIRIN` (noktasız `I`). Yani öteki diller düzelirken Türkçenin
  kendi kuralı bozulmadı — asıl risk buydu.
  **Bir istisna bilerek dışarıda:** kupon kodu düz `toUpperCase()` ile büyütülüyor
  (`cart-screen`), çünkü kod bir KİMLİKTİR — Türkçe kuralıyla `i → İ` olsaydı sunucudaki kod
  bulunamazdı. Ayrım yardımcının künyesine yazıldı: *insan okuyorsa dil kuralı, makine
  eşleştiriyorsa dilsiz.* Ölçüldü (17.08, cihazda üç dilde): `toLocaleUpperCase('tr-TR')` yereli
  koda gömülü ve **17 dosyada** aynı desen var (vitrin · katalog · ürün detayı · kasa · siparişler
  · paketler · hesap · puan geçmişi …). Türkçe'de doğru (`i → İ`), ama öteki iki dilde yanlış:
  ekranda görülenler **`MEİN KONTO`** (de — olması gereken `MEIN KONTO`) ve **`COLLECTİONS`**
  (fr — olması gereken `COLLECTIONS`).

  Türkçe yerelin oraya konması bilinçliydi ve gerekçesi geçerli: JavaScript'in varsayılan
  büyütmesi Türkçe `i`yi noktasız `I` yapar, yani Türkçe yüzeyde `İSTANBUL` yerine `ISTANBUL`
  çıkardı. Eksik olan şey yerelin SABİT yazılması — ekran zaten `useAppLocale()` ile hangi dilde
  olduğunu biliyor. Doğru biçim büyütmeyi o yerelle yapmak; tek satırlık bir yardımcıya toplanırsa
  (`helper`/`customer-kit`) 17 çağıran da tek yerden düzelir ve kural bir daha kopyalanmaz
  (CLAUDE §1).

  *Bulgunun çıkışı:* puan geçmişi ekranının Almanca turunda `MEİN KONTO` görüldü; desen aranınca
  yüzeye yayılmış olduğu ortaya çıktı. Yani tek ekranın kusuru değil, ortak bir kalıbın kusuru.

- [x] **MB-70 · Öneri listesi açıkken `Kaydet` düğmesi görünür alanın dışında mı?** *(18.08'de
  daraltıldı, aynı gün KAPANDI — görev `(21.75)`.)*
  **Turun asıl bulgusu ÖLÇÜLÜNCE DEĞİLLENDİ.** "Dördüncü öneri yarım kalıyor, üstüne kaynak künyesi
  biniyor" diye yazılmıştı; ikisi de tasarımın kendisi çıktı. `SuggestionList` 11.08'de bir kullanıcı
  bulgusuyla tavana bağlanmış (`VISIBLE_ROWS = 3.5`) ve künyesi yarım satırın niye yarım olduğunu
  yazıyor: *"tam 3 olsaydı dördüncü satır tamamen gizlenirdi ve listede devamı olduğu hiçbir yerden
  anlaşılmazdı"*. Kaynak künyesi de kaydırma alanının DIŞINDA, kendi ayıracıyla (Etalab 2.0 listeyle
  birlikte görünmek zorunda) — binmesi yapısal olarak imkânsız.
  **CİHAZDA ÖLÇÜLDÜ (18.08) — ve kalem KAPANDI: ARIZA YOK (kullanıcı bulgusu).**

  İlk tur yarım ölçümdü ve yanlış sonuca götürdü. Ölçülen: adres çekmecesinde *"avenue"* yazılınca
  BAN dört öneri döndü, öneri kutusu formu aşağı itti ve `Kaydet` düğmesinden geriye ~4 dp'lik bir
  ŞERİT kaldı. Buradan *"birincil eylem kırpılmış bir çizgi, bozuk gibi duruyor"* diye kalem
  tutuldu.

  **KULLANICI DOĞRU SORUYU SORDU (18.08):** *"kullanıcı zaten adres yazıyor ve buradan bir adres
  seçecek — seçimden sonra ekran olması gerektiği gibi olmuyor mu?"* Ölçüldü: **oluyor.** Öneri
  seçilir seçilmez liste kapanıyor, form eski boyuna dönüyor, posta kodu ve şehir KENDİLİĞİNDEN
  doluyor (`33100` · `Bordeaux`) ve `Kaydet` klavye hâlâ açıkken TAM görünür oluyor.

  Yani şerit hâli bir arıza değil, **geçici bir ara kare**: müşteri o kutuya zaten seçim yapmaya
  bakıyor ve seçtiği anda ekran kendini toparlıyor. Kalan tek kenar durum, hiç öneri seçmeyip
  adresi elle yazan müşteridir — onda da liste açık kalır ve düğmeye kaydırarak ulaşılır; sıradan
  mobil form davranışı.

  **Yarım satır da tasarımın kendisi:** `VISIBLE_ROWS = 3.5` 11.08'de bir kullanıcı bulgusuyla
  konmuş ve künyesi gerekçesini yazıyor. Turdaki *"künye biniyor"* izlenimi de yanlış okumaydı —
  binme yok, künye kaydırma alanının dışında kendi ayıracıyla duruyor.

  **DERS:** ekranı TEK KAREDE değerlendirmek yanıltıyor. Bir ara hâlin çirkin görünmesi, akışın
  bozuk olduğu anlamına gelmiyor; ölçüm akışın SONUNA kadar götürülmeliydi.

- [x] **MB-45 · Onboarding teslimat/ödeme adımlarının metinleri "Büyük"te bile küçük kalıyordu**
  → **KAPANDI (11.08, kullanıcı bulgusu).** Yazı boyutu özelliği çalışıyor; kusur o iki adımın
  **hangi durağa bağlandığındaydı**: satır açıklamaları (`paySub`) ve güvence cümlesi
  (`secureText`) `helper`e (12) çakılıydı — yani formların "yardımcı ipucu" basamağına — oysa
  aynı ekranların üst gövdesi `control` (16) kullanıyor.
  **Ölçüm:** `helper` "Büyük"te (×1,15) **13,8**'de kalıyor, `control` **18,4**'e çıkıyor; aynı
  işi gören iki metin arasında kalıcı 4 px uçurum. Yeni merdiven: başlık 16 · açıklama
  **`body-sm` 14** · güvence **`note` 13**. Cihazda doğrulandı.

- [x] **MB-46 · `helper` durağı ASIL İÇERİK taşıyan başka yerlerde de kullanılıyor olabilir.**
  MB-45'in genel hâli; ilk ölçümde `theme.text.helper` **124 yerde** geçiyordu.
  → **KAPANDI (18.08), görev `(21.76)` — ve şüphenin büyük kısmı ÖLÇÜNCE DAYANAKSIZ ÇIKTI.**

  **Sayı önce düştü:** `(21.38)` süpürmesinden sonra `helper` 124 → **52**, `micro` **42**; müşteri
  yüzeyinde `helper` 28, `micro` 24 çağrı. Bu 52'nin tamamı "bu metin ipucu mu, içerik mi" diye tek
  tek okundu.

  **Dokuz ciddi şüpheli çıktı, sekizi ŞABLONLA BİREBİR uyuştu** (`Mobil - Musteri v3.dc.html` satır
  satır karşılaştırıldı): tarif satırındaki *Tükendi* `700 11px` · aynı satırın etiket+fiyatı
  `400 11,5px` · varyant çipi fiyatı `600 12px` · aile üyesi fiyatı `600 11px` · puan kartının
  eksik-puan satırı `600 12px` · kupon kodu `700 13px` · kupon değeri `400 12px`. Yani **şablon
  yoğun satırlarda ve çiplerde bilerek 10–13 px kullanıyor**; "içerik 14'ün altına inmez" ölçütü
  bunlara MEKANİK uygulanamaz — ölçüt müşterinin KARAR için okuduğu düz metin içindir (MB-45'te
  olduğu gibi: adım açıklaması, güvence cümlesi), çipin içindeki etiket için değil.
  *(Keşif ekranının iki ipucu başlığı da yanlış alarmdı: gövdeleri başlığın İÇİNE yuvalanmış
  `Text`, yani boyutu ondan miras alıyor — ters düşme yok.)*

  **İki gerçek bulgu kaldı ve ikisi de "aynı seste konuşma" kusuru:**
  · **Hesap · *Verileriniz* kartının başlığı gövdesinden KÜÇÜKTÜ** (12 ↔ 14). Şablonda oran doğru
    (`700 12,5` ↔ `400 11,5`); `(21.38)` gövdeyi 14'e çıkarıp başlığı 12'de bırakınca oran tersine
    dönmüş. Başlık gövdeyle aynı durağa alındı, ayrım ağırlıkta (700 ↔ 400).
  · **Talep detayında gönderim hatası ile pasif künyeler AYNI boydaydı** (`micro`, 11,5). *"Mesaj
    gönderilemedi — tekrar deneyin"* ile *"Cevap geldiğinde e-posta ile haber veririz"* aynı sesle
    okunuyordu; biri bilgi, öteki eylem istiyor. Hata `note`a (13) alındı — `body-sm` değil, çünkü
    satır yazma alanının altında ve alan 13,5; ondan büyük olsaydı bağırırdı.

  **Cihaz turu gerekmedi** (kullanıcı kararı 11.08 — süpürmede kod tarafı doğrulama yeter).

- [x] **MB-72 · Beş yer BAŞLIK durağını başlık olmayan içerik için ödünç alıyor.**
  `(21.77)` taramasında açılmıştı; ilk yazımı *"ölçekte o durak YOK, token eklenmeli"* diyordu.
  → **KAPANDI (18.08) — ŞABLONA SORULUNCA PREMİS ÇÖKTÜ, token EKLENMEDİ.** MB-46'nın aynı dersi:
  şüphe koddan değil, şablona bakılmadan kurulmuş bir varsayımdan geliyordu.

  | yer | bugünkü durak | şablonun dediği | hüküm |
  |---|---|---|---|
  | `package-detail` `price` | `card-title` (24) | `700 24px Karla` | **birebir** — doğru |
  | `code-field` `field` | `page-title-sm` (26) | `700 26px Karla` | **birebir** — doğru |
  | `account-screen` `pointsValue` | `h2-sm` (20→21) | `700 22px Karla` | 1 px fark |
  | `discover-screen` `stampLabel` | `h2-sm` (20→21) | `700 22px Karla` | 1 px fark |
  | `order-confirmed` `markGlyph` | `page-title-sm` (26) | şablonda YOK | tek açık nokta |

  **Neden premis çöktü:** ölçekteki boyut durakları **aile-bağımsızdır** — bir kademenin Lora mı
  Karla mı olduğu `theme.font.display` ↔ `theme.font.body` ekseninde ayrı seçiliyor. Yani "başlık
  durağını gövde ailesiyle kullanmak" başlı başına kusur değil; şablon da tam bunu yapıyor (paket
  fiyatı 24 = `card-title`, OTP alanı 26 = `page-title-sm`). Ayrı durak İKONLARA verilmiş, çünkü
  onlar açıkça *"metin hiyerarşisinin parçası DEĞİL"* (`customer.ts` künyesi) — bu yüzden `(21.77)`de
  adet seçicinin imleri `icon-sm`e alındı ve o düzeltme yerinde. Bir rakam ya da fiyat ise
  hiyerarşinin parçasıdır. **Kalan 1 px fark için yeni token açmak, ölçeğe bir daha okunmayacak
  bir durak eklemek olurdu.**

  **Tek açık nokta kayda geçti:** `order-confirmed`ın ✓ imi bir İM ve `page-title-sm`de duruyor
  (adet seçicileriyle aynı kategori), ama onun boyunda bir ikon durağı yok (`icon` 22) ve şablonda
  ✓ hiç çizilmemiş. Bugünkü coupling gerçek — daire `confirmMark: 92` dp'de sabit, im ise başlık
  merdivenine bağlı, yani başlık ölçeği ayarlanırsa im dairesinden taşabilir. Ama düzeltmesi
  boyut UYDURMAK demek olduğu için yapılmadı; şablona ✓ eklendiğinde tek dokunuşla çözülür.

- [x] **MB-73 · Hesap kartında ad satırı e-postaya düşünce uzun adres ORTADAN BÖLÜNÜYOR.**
  Cihazda görüldü (18.08): adı girilmemiş hesapta kart *"yamansehzade@gmail"* / *".com"* diye iki
  satıra kırılıyordu — kırılma `@gmail` ile `.com` arasına düşüyor ve adres tek bir şey olarak
  okunmuyordu. **Sebep MB-66 değildi** (yedek eskiden de aynı satırdaydı); `(21.77)`'nin bir kademe
  büyütmesi kusuru görünür kıldı.
  → **KAPANDI (18.08), görev `(21.75)`.** Boyutla oynanmadı — kırılma tesadüf değildi: o yuva KISA
  BİR AD için ayrılmış (şablon oraya hep bir ad koyuyor) ve e-posta sığmadığı için ilk yasal
  kırılma noktasından, alan adının ortasından bölünüyordu. Bir kademe küçültmek eşiği kaydırırdı,
  kaldırmazdı; kısaltmak ise kimliğin bir parçasını gizlerdi.
  **Roller yerine oturtuldu:** büyük satır ya adı söyler ya adın eksik olduğunu (*"Adınızı
  ekleyin"*), e-postanın yeri zaten künye satırıdır ve orada TAM hâliyle tek satıra sığıyor.
  Avatar harfi kimlikten alınıyor (e-postanın "y"si, davet cümlesinin "A"sı değil).
  **Yan kazanç:** kod da sadeleşti — "hangi satır neyi gösterecek" dallanması kalktı, e-posta tek
  yerde yazılıyor. **Cihazda doğrulandı:** kart üç satırdan ikiye indi, adres bölünmüyor.

---

## 7. İçerik ve dil

- [ ] **MB-31 · ~~Katalog Türkçe yüzeyde tamamen İngilizce ve toptancı dilinde.~~ → ARTIK
  ÜRETİLMİYOR; ölçüm TERS YÖNDE bir açık gösterdi (17.08).**

  Eski kayıt İngilizce/B2B metinlere işaret ediyordu (*"Artisan Lemon Cake"*, *"…wholesale supply and
  private label"*) ve *"kaynağı veri mi çeviri düşüşü mü ölçülmedi"* diyordu. **Ölçüldü, veriydi ve
  düzelmiş** — katalog o tarihten sonra yeniden kuruldu: 127 ürünün **hepsinde** Türkçe ad var,
  Türkçe açıklamalarda `wholesale|horeca|private label|retail|frozen|dessert|supply` kalıplarına
  **0 eşleşme**. Örnek: *"Tereyağlı çıtır yufka ve uzayan peynir dolgusuyla, altı dilim hâlinde
  dondurulmuş."* Eski gövde bu yüzden üstü çizili; bir daha "katalog İngilizce" diye açılmasın.

  **AÇIK KALAN, TERS YÖNDEKİ AÇIK — MÜŞTERİ YÜZEYİ ASLEN FRANSIZCA ama Fransızcası olmayan satırlar
  var.** Yerel katalogda ölçülen: 4 üründe Fransızca ad yok (`Humus` · `Peynirli Adana Böreği` ·
  `San Sebastian Cheesecake` · `Sebzeli Kalzone`), 3 üründe Fransızca **açıklama** yok
  (`Çikolatalı Sufle` · `Özel Künefe` · `Tabaklı Şerbetli Künefe`). *(Sayılar YEREL veriden ve yerel
  veri sahtedir — burada iş çıkarımı değil, ALANIN BOŞ OLABİLDİĞİ gerçeği kanıtlanıyor.)*

  **Asıl karar KODDA ve o veriden bağımsız:** `resolveLocalizedText` yedek zinciri
  **seçili → TR → FR → DE** (`packages/types/src/primitives/localized-text.schema.ts:43`). Yani
  Fransızca eksikse Fransız müşteri **sessizce Türkçe** görüyor — hiçbir işaret yok. Talep
  mesajlarında bunun karşılığı var (*"Traduit automatiquement"*), katalogda yok.
  **KARAR VERİLDİ (kullanıcı kararı 17.08): katalog metinleri de ÇEVİRİ KUYRUĞUNA girsin.** Motor
  zaten var (`translateUserText`) ve talep mesajlarında çalışıyor; eksik dil kendiliğinden dolar.
  Yedek zincir SÖKÜLMEZ — çeviri gelene kadar geçen sürede tek koruma odur, ve bir metin hiç
  gelmezse boş ekran göstermek Türkçe göstermekten kötüdür. İşaretli yedek (b) seçilmedi: kalıcı
  çözüm varken kusuru görünür kılmakla yetinmek olurdu.

  **Yan bulgu (alan: arka-uç/denetim):** `product` tablosunda damgalı bir test fikstürü duruyor —
  `İçli köfte 1786922725238`. Teardown'dan kaçmış; katalog okuyan her ekranda görünür.

- [x] **MB-32 · Süresi dolmuş davet ile bozuk bağlantı aynı cümleyi alıyor:**
  → **KARARLA KAPANDI (14.08): SIRAYA KONMUYOR.** Kutucuk 23.08'e kadar boş duruyordu ve kalem
  açık iş listelerinde görünüyordu, oysa gövdedeki karar zaten *"sıraya konmuyor"* diyor. Bu
  dosyanın kendi kuralı (MB-23 "elendi", MB-33 "arıza değil") kararla kapanan kalemi `[x]` yazar;
  kayıt ölçümüyle aşağıda duruyor ki bir daha "ucuz metin işi" sanılmasın. *"bağlantı eksik ya
  da eskimiş olabilir"*. Süresi dolmuş davete kendi cümlesi gerekiyor.

  **ÖLÇÜLDÜ 14.08 (kod) — METİN İŞİ DEĞİL, ve ayrımın olmaması BİLİNÇLİ.** Ekran iki hâli
  ayıramıyor çünkü **sunucu da ayırmıyor**: davet 90 gün yaşıyor (`0029_feedback_request.sql`:
  `expires_at … + interval '90 days'`) ve süzgeç okumanın kendisinde
  (`FeedbackRequestService.findByToken` → `expiresAt > now`), yani süresi geçmiş token `null`
  dönüyor — "yok" ile tam olarak aynı cevap. Servisin künyesi bunu gerekçesiyle yazmış: *"süzgeç
  burada, tek yerde; kapıya bırakılsaydı ikinci bir okuma yolu açıldığı gün unutulurdu."*
  Ayrım için gereken: ikinci bir okuma yolu + `openFeedbackInvite`in ayrık bir sonuç döndürmesi +
  uçta yeni bir hâl + **web davet sayfasının da aynı ayrımı öğrenmesi** (motor ortak). Yani
  "cümle yazma" işi değil, iki yüzeyi ilgilendiren bir sözleşme işi.
  **Kazanç ölçüldü ve küçük:** bugünkü cümle iki hâli zaten "ya … ya" ile birlikte söylüyor;
  kazanılan tek şey 90 günü aşmış bir e-postayı tıklayan müşteriye sebebini söylemek.
  **Karar: sıraya konmuyor, ama kaydı ölçümüyle duruyor** — bir daha "ucuz metin işi" sanılmasın.

- [x] **MB-33 · Ekran başlığı "Professionnels"** — üç dilde de aynı. Web'in kararıyla tutarlı
  (orada da program adı), ama native başlıkta tek başına duruyor ve Türkçe yüzeyde ne olduğu
  anlaşılmıyor; web meta başlığı açıklama ekliyor. *Karar maddesi, hata değil.*

  **KAPANDI (19.08 · `(21.84)`) — ölçüm kaydı ZAYIFLATTI, değişiklik yapılmadı.** Kalemin dayanağı
  *"müşteri başlığı tek başına okuyor"* varsayımıydı; ölçünce öyle olmadığı görüldü. Ekrana giden
  TEK kapı vitrindeki davet kartı ve o kart şunu yazıyor: *"Restoran ya da market misiniz? Toptan
  fiyatlar için profesyonel hesap açın."* Yani müşteri ne olduğunu **başlığı okumadan önce**
  öğreniyor; başlığın hemen altındaki üstbaşlık da yerel (*"Restoran · Market · Toplu Mutfak"*).
  Web de "Professionnels"i program adı olarak koruyor (gezinme + meta) ve açıklamayı yalnız meta
  başlığına tire sonrası ekliyor — native'de o tirenin karşılığı zaten üstbaşlık.
  Başlığı çevirmek iki yüzeyi ayrıştırırdı ve kazancı yoktu; kalem **arıza değil** diye kapandı.

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
- **İlk-açılışta adres önerilerinin gelmemesi arıza değil (ölçüldü 15.08, kullanıcı kararı).**
  Şikâyet *"adres yazıyorum, seçim bölümü gelmiyor"*du. Ölçüm: BAN ucu (`api-adresse.data.gouv.fr`)
  yarım sokak adına — girilen metin `192c Rue` — `{"features":[]}` döndürüyor, hata değil **boş
  sonuç**; tam sokak adı yazılınca liste geliyor (cihazda ` de Vaugirard` yazılarak doğrulandı).
  Yani müşteri yazmayı bıraktığı için öneri yoktu. **Müdahale edilmedi:** "bulunamadı" uyarısı
  koymak, müşteri hâlâ yazarken yanlış bilgi vermek olurdu (kullanıcı kararı 15.08). Kancanın
  dört hata durumunu (`too_short`/`rate_limited`/`unavailable`/`invalid_response`) ayırdığını,
  "sonuçsuz ama başarılı" beşinci durumun bilinçli olarak sessiz kaldığını da not düşüyoruz —
  bu bir boşluk değil, tercih.

---

## 10. Önerilen sıra

1. ~~**MB-01 + MB-02** — klavye tuzağı ve kapanan alan. Tek turda, 13 dosya.~~ → **İKİSİ DE KAPANDI
   (11.08), ve "13 dosya / tek tur" tahmini YANLIŞ ÇIKTI.** Klavye tuzağı `(21.33)`'te ölçülerek
   40 kaydırıcıdan **10**'una daraltıldı (`f521aef`); kapanan alan ayrı bir sebepti (tema
   kenardan-kenara olduğu için Android'in pencere küçültmesi ölü) ve `(21.36)`'da kite konan
   kaydırma kabıyla çözüldü (`9f680bbb`). Aynı turda bitmediler — §11.A'nın son paragrafı zaten
   bunu söylüyordu.
2. **MB-04 + MB-05 + MB-07 + MB-08 + MB-11** — 21.31'in açık kalanları; dilim **commit edilmeden**
   kapanırsa git geçmişi bütün olur.
3. ~~**MB-03 → MB-13** — adres formunun yeniden yüklemesi ve oturumun misafire düşmesi.~~
   → **İKİSİ DE KAPANDI (kullanıcı kararı 15.08), MB-52 ile birlikte.** Üçünün de ortak açıklaması
   Metro'nun paket tazelemesiydi ve hiçbiri üretim müşterisini ilgilendirmiyor. MB-03 **bir daha
   açılmaz**; MB-13 ve MB-52 **gözlemde** — tekrarlarsa açılır, peşinden koşulmaz. Kod yazılmadı,
   çünkü sebep düzeltilecek bir yerde değildi (CLAUDE §0).
4. **MB-06** — ortak adres bloğu (BAN önerili) başvuru formuna. MB-03 kapandıktan sonra.
5. **MB-15..MB-19** — puan sisteminin komple denetimi + teşekkür kartının yeniden tasarımı.
6. **MB-20 + MB-28** — liste fiyatı/"…'dan" eki ve varyant sırası; web talebiyle (`musteri-liste-
   fiyati-baslangic.md`) **aynı turda**, iki yüzey ayrışmasın.
7. **MB-21 + MB-22 + MB-51** — sepetteki sayı çelişkisi, indirimin anonim kalması ve adres
   formunun yanlış bölge sözü. *(MB-23 bu kümeden çıktı — elendi, arıza değilmiş.)*
8. **MB-31** — katalog dili; önce ölçüm (veri mi, yedek dil mi), sonra karar.
9. Kalan yerleşim/içerik maddeleri ve §8'in görsel bekleyenleri.

---

## 11. Mobil şeridin okuması — dört madde tek karara bağlı (11.08)

> Bu bölüm listeyi yargılamıyor, **grupluyor**: aşağıdaki maddeler ayrı ayrı yapılırsa aynı iş üç
> kez kurulur. Her başlıkta ölçüm var; ölçmediğim yerde "ölçülmedi" yazıyor.

### A. MB-01'in yayılımı 13 değil — ve dosya dosya prop eklemek yanlış çare

> **DÜZELTME (11.08, `(21.33)`'ün ölçümü):** aşağıdaki "39" ayarı **olmayan** dosyaların sayısıdır,
> ayara **ihtiyacı olan**ların değil. Gerçek kapsam ölçüldü: 40 kaydırıcıdan **10**'u. Kalan 30'da
> ya klavye açan alan yok ya kaydırma kabı ile alan arasında dokunuş ilişkisi kurulmuyor. Yani
> aşağıdaki teşhis (13'lük liste yanlış sayılmış) doğru, önerilen çare de doğru; yalnız sayı yüksek.

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
**tek ölçüm iki maddeyi kapatabilir** — ya da MB-13'ün bağımsız olduğu kanıtlanır.
**Öyle de oldu, ama ölçümle değil kararla (15.08):** ikisi de aynı gerekçeyle kapandı. Bu bölümün
tespiti — `useMe`nin bellekte duran bir modül deposu olması ve paket yeniden yüklenince
sıfırlanması — kapanışın da dayanağıdır; MB-13 yeniden açılırsa ölçüm buradan başlar.

---

## 12. Mobil şeridin eklediği kalemler (11.08)

> Yeni ölçülenler + şeridin elinde duran, listeye girmemiş açıklar. Kimlikler MB dizisini sürdürüyor.

- [~] **MB-34 · Kaydırma kabı kitte yok — 39 ekran ham `ScrollView` kullanıyor.** §11.A'nın işi:
  `components/ui/` altına klavye davranışı doğru kurulmuş tek bir kap, ekranların ona geçmesi ve ham
  `ScrollView` kullanımının lint'le kapatılması. MB-01 + MB-02 bunun içinde çözülür; ayrıca 40'ıncı
  ekranın aynı tuzağa düşmesini yapısal olarak engeller.

  → **KAP ZATEN VARDI** (`(21.36)`, `components/ui/form-scroll.tsx`) ve **"39 ekran" ÖLÇÜLÜNCE
  BEŞ KAT ABARTILI ÇIKTI (15.08, görev `(21.57)`).** Süzgeç süzgeç: ham `ScrollView` kullanan 40
  dosya → içinde girdisi olan **14** → girdi gerçekten kaydırıcının İÇİNDE olan **7** → bunlardan
  müşteri yüzeyi **0**. Üç yanlış aday haklı sebeple elendi: katalogda arama kutusu kaydırıcının
  DIŞINDA (cihazda da ölçüldü), hesap ve sepetteki alanlar ÇEKMECENİN içinde (`BottomSheet`
  korumayı 08.08'den beri kendisi taşıyor), onboarding zaten `FormScroll` kullanıyor.
  **Yani müşteri yüzeyi kapalıydı; MB-34 ölçülünce bir OPERASYON işi çıktı.**
  **Yedi operasyon ekranı geçirildi** (kurye teslimat + gün kapanışı · depo transfer, sayım, kurye
  iadesi, mal kabul · yönetim teklif onayı). **Ölçülen asıl açık:** bu 14 ekranın hiçbirinde
  `KeyboardAvoidingView` YOKTU — yedisinde `keyboardShouldPersistTaps` vardı (`(21.33)`'ün noktasal
  düzeltmesi), yani MB-01 kapatılmış ama **MB-02 açık kalmıştı.**
  **AÇIK KALAN (bu yüzden `[~]`):** (a) talep detayı ve şikâyet ekranı farklı kalıpta — yazma alanı
  kaydırıcının ALTINDA sabit duruyor, `FormScroll` sarmak yanlış olur, ayrı çözüm gerekiyor;
  (b) ham `ScrollView`u lint'le kapatma adımı yapılmadı (33 dosya hâlâ ham kullanıyor ve
  ÇOĞU HAKLI — klavyesiz kaydırıcıyı sarmak kabın kendi künyesine aykırı).

- [x] **MB-35 · Hesap sekmesi `/me` okunurken TAMAMEN BOŞ.** `app/(tabs)/account.tsx:44` yükleme
  anında `return null` veriyor. Künyesi bilinçli (*"misafir daveti yanıp sönmesin"*), ama okuma
  uzarsa müşteri boş bir sekmeye bakıyor — ve MB-13'ün belirtisiyle karışıyor: "hesabım açılmıyor"
  şikâyeti hangisinden geldiği ayırt edilemez. Ekranın `account-skeleton.tsx`i ZATEN VAR, yalnız bu
  dalda kullanılmıyor. `BEKLEYEN(21.14)` olarak kayıtlı.

- [x] **MB-36 · B2B müşterisi teklif tutarını mobilde GÖRMÜYOR** → **BU KAYIT ESKİDİR, aşağıdaki
  ölçüm geçerlidir** (bu dosyada "MB-36 · MB-37 → ÖLÇÜLDÜ, İKİSİ DE ZATEN KAPALI" satırı, 11.08).
  Aynı kimlik iki kez kullanılmıştı ve iki satır birbirini çürütüyordu; karar kod okumasından yana:
  dayandığı bekleyen işaret 09.08'de kapanmış. Metin tarih kaydı olarak duruyor.
  Katalog uçları teklif fiyatını
  okumuyor (`BEKLEYEN(21.6)` `catalog.ts`te); bilinçli bir bekletme — yer çözümü terfi etmeden
  indirimi gösterip ödemede yükseltmek verilmiş sözü bozardı. Ama sonuç şu: onaylı B2B müşterisi
  web'de indirimli fiyat görüyor, native'de görmüyor. **Aynı müşteri iki yüzeyde iki fiyat görüyor.**

- [x] **MB-37 · Ürün detayında YERE BAĞLI stok işareti yok** → **BU KAYIT ESKİDİR** (MB-36 ile aynı
  gerekçe: kimlik iki kez kullanılmış, geçerli olan aşağıdaki 11.08 ölçümü). Metin tarih kaydı.
  Bugün yalnız ürün düzeyli "kargoya
  verilmez" künyesi var; `stockMarkOf` (yere bağlı işaret) ve "haber ver"in rota dışında BÖLGE
  notuna dönmesi yazılmadı (`BEKLEYEN(21.20)`). Müşteri detayda "var" görüp sepette bölge kısıtıyla
  karşılaşabiliyor.

- [ ] **MB-38 · Test defteri boşaltılmadı** (`docs/talep/not-mobil-test-defteri.md`, kullanıcı
  talimatı 09.08: *"testleri sonra topluca yaz"*). İçinde ölçülmemiş bir düşüş var:
  `account-routes.test` TAM koşuda düşüyor, tekil koşuda geçiyor — hata metni hâlâ yakalanmadı.
  **İKİNCİ ÖRNEK ÖLÇÜLDÜ (14.08):** `app-shell.test.tsx` de aynı şekilde davrandı — tam koşuda
  *"seçili sekmeye tekrar dokunmak rotayı OYNATMAZ"* düştü (`toHavePathname('/')`), tekil koşuda
  geçti, ve **aynı tam koşu ikinci kez çalıştırıldığında 84/84 · 599/599 yeşil geldi.** Yani
  düşüş dosyaya değil KOŞUYA bağlı; iki örnek de rota durumu okuyan testler. Ortak şüpheli
  expo-router'ın modül düzeyinde yaşayan bellek durumu ve testler arası sızması — ölçülmedi,
  teori kurulmuyor. Defter kapanırken bu iki dosya birlikte bakılmalı.
  Ayrıca "Jest did not exit" uyarısı ve 21.20'nin birim test borcu (`StockMark`, `stockMarkOf`,
  `placeModeOf`). *Müşteri turunu bitirirken bu defter de kapanmalı, yoksa yeşil koşu bir şey
  kanıtlamıyor.*

  **İLK SAYISAL KANIT (19.08 · `(21.86)` turunda ölçüldü).** Bugüne dek desen "tam koşuda düşüyor,
  tekil koşuda geçiyor" diye kayıtlıydı ama SEBEBE dair ölçüm yoktu. Bugün üçü birden ölçüldü:
  · **Makine yük ortalaması 22.96** (Metro + üç dev sunucu + Supabase + eşzamanlı koşular).
  · **Paket süresi 11 sn → 58 sn** (beş kat), aynı 599 test.
  · **Aynı dosya tek başına YEŞİL:** `app-shell` izole koşuda 3/3 geçti, tam koşuda düştü.
  Düşen dördün dördü de **rota durumu okuyan** testler (`app-shell` · `operations-shell` ·
  `account-routes` · geri bildirim rotası) — yani kayıttaki "ortak şüpheli expo-router'ın modül
  düzeyi durumu" teorisiyle uyumlu, ve artık altında bir ölçüm var. **Defter kapanırken eşik
  şudur: yükü düşürüp koşmak arızayı GİZLER; asıl iş bu dosyaların yükten bağımsız hâle gelmesi.**

- [x] **MB-39 · `knip` mobil pakette dokuz kullanılmayan ihraç tip görüyor** (ölçüldü 11.08):
  `B2bApplicationResult` · `DiscoverSwipe` · `DiscoverClaimResult` · `MeCoupon` ·
  `PaymentSheetInput` · `StripeConfig` · `DiscountSummary` · `SheetState` · `UseHomeOrdersResult`.
  CLAUDE §2 "ölü kod yok" diyor; her biri ya tüketilmeli ya ihracı kapatılmalı. Ucuz, mekanik.

- [ ] **MB-44 · B2B'de FATURA e-postasının ayrı verilebilmesi — ileriye bırakıldı (kullanıcı kararı 11.08).**
  MB-04 kararının bilinçli açığı: bugün hesap e-postası her şeye gidiyor (karar maili, fatura,
  bildirim). Muhasebede yetkili adresi ile fatura adresi genelde ayrıdır ve kullanıcı bunu
  *"ileride küçük bir özellik olarak eklenir ve çalıştırılır"* diye kayda geçirdi. **Bugün bir
  arıza DEĞİL, ertelenmiş bir yetenek** — o güne dek kimse "fatura adresi nerede" diye aramasın
  diye buraya yazıldı. Geldiği gün dokunacağı yer: profil künyesi (ikinci bir adres alanı) +
  mail gönderen taraf; başvuru formu değil.

  **ÖLÇÜLDÜ 19.08 (kullanıcı isteği: "fatura konusunu sistemden önce incele") — KALEM YANLIŞ
  SIRADAYMIŞ.** Sistemde yönlendirilecek bir fatura maili YOK ve tasarım gereği olmayacak:
  `DOMAIN §9` *"Sistem resmî muhasebe değildir, e-fatura kesmez; hiçbir resmî belge (fatura, avoir
  vb.) sistemde üretilmez — müşteri faturasını muhasebe tarafından alır, sitede fatura indirme
  yoktur."* Kod bunu birebir uyguluyor: `order.reference_no` künyesinde *"resmî fatura no DEĞİL"*
  yazıyor, `order.invoice_no` dış muhasebeden SONRADAN eşleşiyor (`matchInvoiceNo`), teslim maili
  belge veriyor ama üstünde *"resmî fatura değildir"* diyor.
  Yani "ayrı fatura e-postası alanı" açmak, **olmayan bir postanın adresini sormak** olurdu.
  Sıra tersine döndü: önce faturanın yolu müşteriye ANLATILMALI (**MB-78**), ayrı adres ihtiyacı
  ancak muhasebe yazılımı ve süreç netleşince konuşulur. Kalem o güne kadar açık ama **bloke**.

- [x] **MB-79 · FIRSAT KARTI "YALNIZ BUGÜN" DİYORDU — arkasında hiçbir veri yoktu.**
  Kullanıcı cihazda gördü ve sordu (19.08): *"Gerçekten sadece bugüne özel bir indirim mi yoksa
  bugün son günü mü? Ya da bu metin neden burada yazıyor?"* — **ikisi de değildi.**
  · `home-screen.tsx` satırı **koşulsuz** basıyordu; sözlükteki dize sabitti.
  · `HomeOfferSchema`'da **bitiş anı diye bir alan yok** — ekran bilse bile yazamazdı.
  · Fırsat bir kampanya değil: **SKT'si yaklaşan bir partiden doğuyor**, kimse seçmiyor.
    `design/BACKLOG.md` bunu zaten yazmış: *"kimse seçmez ve **süresi yoktur**"*.
  · **Bu, 09.08'de kaldırılan "GÜNÜN FIRSATI · {süre} KALDI" bandının hayatta kalan ikiziydi** —
    o blok tam bu gerekçeyle sökülmüştü (*"ekranın en görünür yerinde tutulamayacak bir söz"*),
    ama aynı yalanı söyleyen tek satır kalmış ve gözden kaçmıştı.
  · Fransa'da bunun adı var: ürünün sınırlı süreyle sunulduğuna dair yanlış beyan.

  **ÇARE — gerçek sınır gün değil ADET, ve o sayı zaten elimizdeydi.** `limitLabel`: teklif fiyatı
  partiye bağlı, o partide kalandan fazlası normal fiyata taşıyor (DOMAIN §5). Alan mobil
  sözleşmede vardı ve **ürün detay ekranı doğru kullanıyordu**; yalnız vitrin kartı yok sayıp
  uydurma cümleyi basıyordu.
  **İki kademe (kullanıcı kararı):** eşiğin üstünde *"STOKLA SINIRLI"*, altında *"SON {n} ADET"* —
  çok kalanda aciliyet uydurmak yanlış, az kalanda sayıyı saklamak bilgi gizlemek olurdu. Sınır
  YOKSA satır hiç çizilmiyor. Eşik parametrik (`LAST_FEW_THRESHOLD`, varsayılan 5).
  **Cihazda doğrulandı (19.08):** uç 14/12/10 sınırlı üç fırsat döndü, üçü de eşiğin üstünde ve
  kartlar *"STOCK LIMITÉ"* yazdı; *"AUJOURD'HUI SEULEMENT"* gitti. **"SON {n} ADET" dalı cihazda
  ÜRETİLEMEDİ** — bunun için bir partide kalan adedi 5'in altına düşürmek gerekirdi, o da yerel
  veriye müdahaledir ve kullanıcının kararıdır.

  **Artık ölü:** sözlükteki `flash` blokları (`GÜNÜN FIRSATI · {time} KALDI`, `SÜRE DOLDU`) üç dilde
  hâlâ duruyor ama hiçbir yerde kullanılmıyor — 09.08'de blok kalkarken sözlük temizlenmemiş.
  Ayrı bir iş değil; bir dahaki dokunuşta silinsin.

- [ ] **MB-78 · FATURANIN NEREDEN ALINACAĞI HİÇBİR YERDE YAZMIYOR — B2B'de yasal ağırlığı var.**
  ⚑ **BU KALEM GÜNDEME GETİRİLMEZ — kullanıcı kendisi açacak** (kararı 21.08). Kayıt duruyor,
  hatırlatması yapılmaz; sıradaki işler önerilirken bu madde sayılmaz.
  Ölçüldü 19.08 (kullanıcı isteğiyle sistem geneli tarandı). Sistemin kararı net ve tutarlı
  (`DOMAIN §9`: resmî belge üretilmez, fatura muhasebeden gelir) — **eksik olan bu kararın müşteriye
  söylenmesi.**
  · **Satış koşullarında (CGV) fatura maddesi YOK** — "fatura" kelimesi hiç geçmiyor; tek ilgili
    satır *"Fiyatlar KDV dâhildir"*.
  · **SSS'te fatura sorusu YOK** (dokuz sorunun hiçbiri).
  · Gizlilik sayfası *"faturanın üzerindeki ad ve adres"*ten bahsediyor → müşteri bir faturanın var
    olduğunu **biliyor**.
  · Teslim maili *"bu resmî fatura değildir"* diyor → müşteri gerçeğini **arıyor** ve gidecek adres
    yok.
  · **B2B'de kritik:** restoran/market KDV indirimi için faturayı almak zorunda ve Fransız ticaret
    kanunu B2B satışta faturayı zorunlu kılıyor. Başvuru ekranı ve onay maili süreçten hiç
    bahsetmiyor; onay maili yalnız *"faturada bu ibare yer alır"* (autoliquidation) diyor — hangi
    faturada, kimden, ne zaman: yazmıyor.

  **BLOKE — metin yazılmadı ve bu bilinçli (kullanıcı kararı 19.08).** *"Müşteri faturasını bugün
  fiilen nasıl alıyor?"* sorusunun cevabı **henüz belirlenmedi**; süreç kurulmadan cümle yazmak
  tutamayacağımız bir söz vermek olurdu. Süreç netleşince yazılacak yerler hazır: CGV'ye bir madde,
  SSS'e bir soru, B2B onay mailine bir paragraf. Karar gelene kadar bu kalem **MB-44'ü de bloke
  ediyor**.

- [ ] **MB-42 · `packages/design-tokens` yerelden import edilemiyor — göreli ihraçlarında uzantı yok.**
  Ölçüldü (11.08, MB-41 turunda): `app.config.ts`ten `@lezzet/design-tokens` import etmek
  `expo config`i **düşürüyor** (`ERR_MODULE_NOT_FOUND`); sebep paketin girişindeki uzantısız göreli
  yeniden-ihraçlar. Uzantılı denek modül AYNI yükleyicide çalıştı, yani engel yükleyici değil paketin
  kendisi. Bugünkü bedeli: splash rengi token'a bağlanamıyor (`(21.34)`'te gerekçesiyle hex kaldı).
  Paket web ve mobil ortak, o yüzden değişiklik iki yüzeyi de ilgilendirir.

- [ ] **MB-43 · İkon/splash PNG'lerinin krem zemine yeniden üretimi HİÇBİR YERDE kayıtlı değil.**
  MB-41 turunda görüldü: `app.config.ts` splash rengini taşıyor ama görsel varlıkların kendisi
  eski zeminde. İş bir tasarım kararı ister (hangi zemin, hangi boyut seti); şimdilik yalnız kayıt.

- [x] **MB-65 · `OTP_TEST_CODE` mobile-api'nin env'inde YOKTU — native'de kimlik akışları cihazda
  hiç yürütülemiyordu** (ölçüldü 14.08, cihaz turunda) → **KAPANDI, görev `(21.49)`.**
  Kök `.env` deterministik dev kodunu taşıyor ve web/e2e kullanıyor; mobile-api kendi
  `.env.local`ini okuyor (`src/env.ts`) ve orada yoktu. **Belirti yanıltıcı:** kod isteniyor,
  ekran "gönderdik" diyor, girilen kod hep "yanlış" çıkıyor — çünkü gerçek rastgele kod üretilip
  Resend'e veriliyor ve kimse okuyamıyor. Yani hata mesajı doğruyu söylüyordu ama sebebi
  söylemiyordu. Yerel dosyaya eklendi; **kalıcı çözüm `apps/mobile-api/.env.example`'a gerekçesiyle
  yazıldı** — yoksa bir sonraki kurulum aynı duvara çarpardı. Kapı üretimde kendini kapatıyor.

- [x] **MB-64 · Kitte YIKICI onay düğmesinin karşılığı yoktu** (ölçüldü 14.08, cihaz turunda)
  → **KAPANDI, görev `(21.49)`.** `SecondaryButton` yalnız `sand` ve `olive` taşıyordu; hesap
  silme çekmecesi bu yüzden onayı `PrimaryButton` ile çizmişti — dolgulu zeytin, ekranın en güçlü
  çağrısı — ve çekmecenin kendi künyesiyle (*"bu bir birincil eylem değil"*) çelişiyordu. Web'in
  aynı diyaloğu kararı zaten vermişti. Üçüncü ton (`terracotta`) eklendi, ikinci bir düğme türü
  açılmadı (CLAUDE §1); vazgeç sessiz metne indi. **Ders kayda değer:** çelişki kodu okurken
  değil, ekrana bakarken görüldü — künye doğruydu, uygulaması değildi.

- [x] **MB-63 · Native uygulama HİÇ ölçülmüyor — analitikte karşılığı yok** (denetim ölçtü 10.08,
  kayıt bu listede yoktu) → **KAPANDI, görev `(21.103)` (24.08).** Tek defter + `surface` boyutu,
  sekiz atıcı, gizlilik paragrafı üç dilde. Aşağıdaki "bloke" satırı **artık geçerli değil**:
  kullanıcı A1'i (tek defter) ve kapsamı (ürün/paket sayımı) 24.08'de verdi; **kurulum kimliği ön
  koşul ÇIKMADI** — girişli müşteri için tuzdan türeyen anahtar yeterli, misafir tarafı ise ölçüsüz
  değil eksik ölçülü kaldı ve yönü (taban) künyeye yazıldı. *(Eski gerekçe, kararın nasıl döndüğü
  görünsün diye aynen duruyor.)* Ölçüm: `apps/mobile` ve `apps/mobile-api` içinde tek `recordEvent`
  çağrısı yok, `/api/v1`'de analitik ucu yok, şemada yüzey kolonu yok. Sonuç `analytics_daily`
  sayılarının **web'in sayıları olması ama ekranda "toplam" yazması** — her gün biraz daha yanlış
  olan ve hata vermeyen bir cümle.
  **İnceleme dosyası:** `docs/talep/inceleme-analitik-web-native.md` — beş kırılma noktası ölçülü,
  iki seçenek ve denetimin önerisi (tek defter + `surface` boyutu) orada.
  **Bu şeridin altı sorusu CEVAPLANDI (14.08)**, dosyanın §5'inde: UA'da kuruluma özgü entropi
  olamayacağı kod düzeyinde kanıtlandı · kurulum kimliği YOK ve iOS Keychain'in silinmemesi
  yüzünden yeri `NSUserDefaults` tarafı · rol JWT'de değil profil satırında · huninin beş adımından
  üçü sunucudan atılabilir, `add_to_cart`ın MİSAFİR yarısı yapısal olarak ölçülemez, `page_view`
  tümden istemci beyanı olmalı · ekran→rota eşlemesi üç sınıfa ayrılıyor · ortak kapının sahibi
  web şeridi olmalı.
  **Bloke: kullanıcı kararları A1–A4** (tek/iki defter · rota kalıbı · kurulum kimliğinin
  hash'lenme yeri ve yeniden kurulum · sıra). Ön koşul kurulum kimliği; ondan önce kod yazmak,
  sonradan değişecek bir anahtarla veri toplamak olur.

  **BU KALEM AÇILDIĞINDA GİZLİLİK METNİ DE YAZILACAK (19.08 · `(21.87)`).** Native gizlilik
  metninde ölçümü anlatan paragraf vardı ve **silindi** — yapmadığımız bir işlemi beyan ediyor,
  üstelik yöntem sözü veriyordu (*"çerezsiz, her gün değişen ve ertesi gün atılan anahtar"*).
  Kullanıcı ölçütü: gereksiz beyan bizi karşılığı olmayan bir taahhüdün altına sokar. Ölçüm gerçekten
  kurulduğunda paragrafı **bu kalemi yazan** ekler ve **kurduğu mekanizmayı** anlatır — bugünkü
  metni geri yapıştırmaz; sözü verilen yöntem ile kurulacak yöntem aynı olmayabilir.
  Yeri: `apps/mobile/src/screens/legal/messages.json` → `pages.privacy.sections[6]`
  (*"Cihazınızda saklananlar"*), üç dilde. **Web nüshası ayrı** ve orada ölçüm gerçekten var —
  web metnine dokunulmadı.

- [x] **MB-62 · Hesabını silme native'de YOKTU — mağaza yayın engeliydi** (ölçüldü 13.08, kod)
  → **KAPANDI, görev `(21.49)` (14.08).** Web hesap sayfası 08.21'den beri siliyor
  (`deleteAccountAction` → `UserProfileService.anonymize` → `anonymize_customer` RPC); native'de
  karşılığı yoktu ve ekran müşteriyi *"bonjour@lezzetanatolia.fr adresine yazın"* diye e-postaya
  yolluyordu. **Eksik özellik değil, YAYIN ENGELİ:** App Store 5.1.1(v) hesap açtıran uygulamadan
  hesabın uygulama içinden silinebilmesini istiyor ve e-posta yönlendirmesini kabul etmiyor.
  **Kapanış:** `DELETE /api/v1/me` (web'in çağırdığı kapının AYNISI — ikinci bir silme kuralı
  yazılmadı) + hesap kartının altında metin düğmesi + giden/kalan bloklarını aynı ağırlıkta çizen
  onay çekmecesi. **CİHAZDA UÇTAN UCA YÜRÜTÜLDÜ (14.08):** iki kullan-at hesap açıldı ve
  silindi; silmeden önce alınmış jeton sonrasında `401` döndü, yani `auth.users` satırı gerçekten
  yok edildi. Seed müşterisine dokunulmadı (siparişleri var, silinmesi `db:refresh` isterdi).
  Tur iki bulgu çıkardı — MB-64 (kitte yıkıcı onay tonu yoktu) ve MB-65 (`OTP_TEST_CODE`
  mobile-api env'inde yoktu).

- [x] **MB-40 · Talep maili kart genişliği açık** (`docs/talep/not-mobil-talep-maili-duzeltildi-
  genislik-acik.md`) → **KAPANDI, görev `(21.102)` (23.08).** Ölçüm bulgunun ADINI düzeltti:
  kartların kutuları AYNI genişlikte (536 px), farklı olan metnin nerede BAŞLADIĞI — sayfa
  kenarından beş ayrı değer vardı ve dördü sipariş/geri bildirim maillerinde de duruyordu. Hiza
  artık türetiliyor (`TEXT_INSET = 57`, `innerX(kenarlık, şerit)`); altıncı bir değer doğamaz.

- [x] **MB-41 · Ham hex yalnız `app.config.ts` splash'ta kaldı** (`BEKLEYEN(21.3)`). Tek satır;
  token'a bağlanamıyorsa gerekçesi künyeye yazılıp işaret kapatılmalı.

- [x] **MB-47 · "Buraya da gelin" kaydını katalog ile paketler AYRI AYRI hatırlıyordu** (kullanıcı
  bulgusu 11.08) → **KAPANDI, görev `(21.39)`.** Bant iki listenin başında çiziliyor ve künyesi
  *"kayıt alındığında düğme kalkar"* diyor; hafıza bandın kendi `useState`inde olduğu için söz
  yalnız TEK ekranda tutuluyordu — katalogda kaydını bırakan müşteri paketler sekmesinde aynı
  düğmeyi yeniden görüyordu (aynısı sayfadan çıkıp geri gelince de). Hafıza modül deposuna taşındı
  (`lib/places/place-notice-store.ts`), anahtar YER. Arıza düzeltmeden önce testle üretildi.

- [x] **MB-36 · MB-37 → ÖLÇÜLDÜ, İKİSİ DE ZATEN KAPALI** (11.08). Kalemler eski bir okumayla
  girmiş: **MB-37**'nin istediği yere bağlı işaret ürün detayında var
  (`product-detail-screen.tsx` — `stockMarkOf`, `info` eleniyor, "haber ver" `pending`de açılıp
  `blocked`ta kapanıyor). **MB-36**'nın dayandığı `BEKLEYEN(21.6)` 09.08'de kapanmış: mobil katalog
  ucu yeri istekten, alıcıyı oturumdan çözüyor (`readViewer` → `pricingViewerOf`) — web'in
  çağırdığı fonksiyonun aynısı; teklif alanları (`wasCents`/`limitLabel`/`stockId`) ekranlarda
  tüketiliyor. **Kapanış KOD OKUMASINA dayanıyor, cihaz ölçümüne değil** — B2B onaylı bir hesapla
  görsel doğrulama istenirse cihaz şeridinin işi.

### Şeridin sıra önerisine eki

§10'un sırası doğru; iki düzeltme öneriyorum:

1. **Adım 1, MB-01 + MB-02 yerine MB-34 olsun.** Aynı işi yapıyor ama 39 ekranı kapsıyor ve
   Profesyonel formunu da gerçekten düzeltiyor (§11.A). MB-02 aynı bileşende ama ayrı ölçümle.
2. **Adım 6'ya (MB-20 + MB-28) arka-uç notu eklensin** ve iş "birincil boy alanı" olarak
   adlandırılsın — üç maddenin ortak kökü o (§11.C).

Bir de kapsam sorusu: §10 dokuz adım sayıyor ve içinde **karar bekleyen** maddeler var (MB-04'ün
e-posta kararı, MB-12'nin adres kararı, MB-31'in katalog
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

### ⚑ FİZİKSEL CİHAZ TEK ELDE (kullanıcı kararı 11.08 — bağlayıcı)

**Fiziksel cihazda yapılacak TÜM testler `cihaz` şeridinindir.** Kullanıcının sözü: *"fiziksel
cihazla yapılacak testler senin tarafından yapılmasını istiyorum… fiziksel cihaz kullanımında
çakışma olmamalı."*

- Cihaz: **OPPO CPH1907 · Android 11 · 1080×2400**, `adb` ile sürülüyor (`5cf6c351`).
- **Başka bir şerit cihazda ölçüm isterse doğrudan denemez** — `docs/talep/not-cihaz-<konu>.md`
  açar ya da `koordinasyon-web-mobil.md`ye girer ve **`cihaz` şeridine adıyla söyler.** İstek
  şunları içermeli: hangi ekran/akış, hangi somut soru, beklenen ile şüphelenilen davranış.
  Ölçümü `cihaz` yapar, bulguyu kanıtıyla (ekran görüntüsü + varsa DB/log satırı) geri yazar.
- **Gerekçe teknik, nezaket değil:** cihazda tek uygulama örneği ve tek `adb` bağlantısı var. İki
  şerit aynı anda sürerse dokunuşlar birbirinin ekranına düşer, ölçüm tekrarlanamaz hâle gelir —
  ve yalancı bulgu, yavaş ölçümden pahalıdır (CLAUDE §4b'nin paylaşılan-DB dersiyle aynı mantık).
- **Cihazda yazılan veri geri alınır.** Ölçüm yazma yapıyorsa (`başvuru`, `oy`, `yorum`, `sepet`)
  `cihaz` şeridi önce mevcut hâli kaydeder, ölçümden sonra geri yükler ve raporunda bunu yazar.
- Emülatör/simülatör ve birim/entegrasyon testleri bu kuralın DIŞINDA — herkes serbest.

| kalem | ajan | ne zaman | dokunulan yollar | durum |
| --- | --- | --- | --- | --- |
| MB-15 · MB-16 · MB-17 (ekran yarısı) | mobil | 11.08 · 12:0x | `apps/mobile/src/screens/{discover/**,feedback/**,home/messages.json}` | **bitti** — MB-16 sebebi testle üretildi; MB-17'nin ekran yarısı |
| MB-35 (hesap boş yükleme) · MB-41 (ham hex splash) | mobil | 11.08 · 12:0x | `apps/mobile/src/app/(tabs)/account.tsx` · `apps/mobile/app.config.ts` · `screens/account/account-routes.test.tsx` | **bitti** |
| MB-17 (SÖZLEŞME yarısı — turun toplamı) | mobil/backend | 11.08 · 12:3x | `packages/types/src/contracts/feedback*` · `packages/application/src/feedback/**` · `apps/mobile-api/src/api/v1/feedback.ts` | **bitti** — `invitePointsTotal` açıldı |
| MB-01 (klavye tuzağı) | denetim/cihaz | 11.08 · 11:4x — görev `(21.33)` | 10 ekran dosyası: `screens/{feedback,professionals,login,catalog}` + `{courier/day-close,courier/delivery,management/offer-approval,warehouse/adjustment,warehouse/courier-return,warehouse/transfer}` | **bitti ve COMMİT EDİLDİ** — `f521aef` (11.08 · 11:5x). Cihazda doğrulandı: iki senaryo da tek dokunuşla çalıştı, geri bildirim yorumu veritabanında görüldü. **MB-34'ün önü açık.** |
| MB-34 (kaydırma kabını kite alma) | — | — | — | **ÖNÜ AÇIK, sahibi yok** — askı şartı *"(21.33) commit edilsin"*di, `f521aef` ile doldu (11.08). Kit kabı da `(21.36)`'da doğdu (`components/ui/form-scroll.tsx`); kalan iş o kabın geri kalan ekranlara yayılması + ham `ScrollView`un lint'le kapatılması. Alan ilan etsin |
| MB-46 (küçük duraklara bağlı İÇERİK metinleri) | cihaz | 11.08 · 13:35 | `apps/mobile/src/components/ui/{note.tsx,suggestion-list.tsx}` · `screens/{account/{account-screen,address-card}.tsx,cart/{cart-screen,cart-line-row}.tsx,checkout/{checkout-screen,order-confirmed-screen}.tsx,customer-kit/{address-form,dashed-invite,option-row,summary-panel}.tsx,feedback/feedback-screen.tsx,home/home-screen.tsx,orders/{order-detail-screen,order-timeline,orders-screen}.tsx,package/package-detail-screen.tsx,packages-list/packages-list-screen.tsx,product/product-detail-screen.tsx,professionals/{professionals-screen,application-form}.tsx,support/{new-ticket-sheet,order-line-picker,tickets-screen}.tsx}` | **bitti ve COMMİT EDİLDİ** — `429fd85f`, görev `(21.38)` (11.08); 23 ekran dosyası. Doğrulama KOD tarafında yapıldı (kullanıcı kararı: süpürmede cihaz turu gerekmez) — müşteri yüzeyinde 14'ün altında kalan içerik metni sıfır. Kullanıcı kararı 11.08: 1.+2. kademe birlikte. Ölçüt: *müşterinin karar için okuduğu metin `body-sm` (14) altına inmez*; `helper`/`micro` yalnız gerçek yardımcı role kalır. **YALNIZ MÜŞTERİ yüzeyi** — operasyon/kurye/depo ekranları listeye alınmadı (başka şeridin tasarım alanı) |
| MB-47 (bant kaydının hafızası) · MB-36 · MB-37 (ölçüm) | mobil | 11.08 · 14:0x — görev `(21.39)` | **YENİ:** `apps/mobile/src/lib/places/place-notice-store.ts` · **DEĞİŞEN:** `screens/customer-kit/place-notice-band.{tsx,test.tsx}` | **bitti** — MB-46'nın dosya listesiyle kesişmiyor. MB-36/MB-37 kod okumasıyla kapatıldı, cihaz ölçümü YAPILMADI |
| MB-62 (hesabını silme) · MB-49 (onaydaki uydurma puan satırı) | cihaz | 14.08 — görev `(21.49)` | `apps/mobile-api/src/api/v1/router.ts` · `apps/mobile/src/lib/api/me.ts` · `screens/account/{account-screen.tsx,messages.json}` · `screens/checkout/{checkout-screen.tsx,order-confirmed-screen.tsx,messages.json}` · `app/checkout/confirmed.tsx` | **bitti** — `tsc` iki pakette temiz, 4 test dosyası/17 test geçti, uç mount'u ölçüldü (jetonsuz `DELETE /me` → 401). Silmenin CİHAZ turu yapılmadı (tek yönlü işlem) — `(21.48)`'e bırakıldı |
| MB-05 · MB-07 · MB-08 · MB-11 (B2B ekranının açık kalanları) | mobil | 11.08 · 12:4x | `apps/mobile/src/screens/professionals/**` · `apps/mobile/src/lib/api/b2b.ts` | **alındı** |
| MB-04 (e-posta alanı kalkıyor — kimlik oturumdan) | mobil | 11.08 · 13:1x | `apps/mobile-api/src/api/v1/b2b.ts` (bitti) · `apps/mobile/src/screens/professionals/**` | **alındı** |
| MB-39 (ölü ihraç tipler — B2B dışı yarısı) | mobil | 11.08 · 12:4x | `apps/mobile/src/lib/api/{discover,points}.ts` · `lib/payment/{payment-sheet,stripe-config}.ts` · `screens/customer-kit/{discount-label.ts,use-sheet.hook.ts}` · `screens/home/use-home-orders.hook.ts` | **alındı** |
| MB-02 (klavye odaklanan alanı kapatıyor) | cihaz | 11.08 · 12:19 → yollar 12:3x'te kesinleşti | **YENİ:** `apps/mobile/src/components/ui/form-scroll.tsx` · **DEĞİŞEN:** `screens/{professionals/professionals-screen.tsx,login/login-screen.tsx,feedback/feedback-screen.tsx}` | **bitti ve COMMİT EDİLDİ** — `9f680bbb`, görev `(21.36)` (11.08). Sebep ölçüldü: tema `Theme.EdgeToEdge`, `adjustResize` ölü, pencere küçülmüyor (klavye açıkken kaydırma da işlemiyor). Çözüm kite kondu (`form-scroll.tsx`), `bottom-sheet`in 08.08'de verdiği kararın aynısı; şimdilik yalnız FORM ekranlarına uygulandı. **Kalan geniş göç MB-34'ün işi** — o satır da artık açık |
| MB-48 (çekmece taşıyor · öneri listesi sınırsız) | cihaz | 11.08 · 14:2x — görev `(21.41)` | `apps/mobile/src/components/ui/{bottom-sheet.tsx,suggestion-list.tsx}` · `apps/mobile/src/screens/support/new-ticket-sheet.tsx` (yerel kaydırıcı kite taşındı) | **bitti** — Android'de ölçüldü ("Büyük" yazı boyutu), **iOS'ta kullanıcı doğruladı** (11.08) |
| MB-09 (B2B misafir yolu cihazda hiç yürütülmedi) | cihaz | 11.08 · 14:2x | **yalnız ölçüm — kod değişikliği YOK.** Misafirle tur: e-posta → tek kullanımlık kod → başvurunun kendiliğinden gitmesi → "inceleniyor" | **bitti (15.08) — görev `(21.51)`.** Tur baştan sona koştu, DB'de doğrulandı (`b2b_pending`, `b2b_applied_at`, `company_info`). Telefonun boş kalması yanlış alarm çıktı (tekil kimlik anahtarı, kasıtlı atlanıyor). Yazılan veri uygulamanın kendi silme akışıyla geri alındı |
| MB-03 · MB-13 (yeniden yükleme · oturum misafire düşüyor) | cihaz | 11.08 · 12:19 | **yalnız ölçüm — kod değişikliği YOK.** Okunacaklar: `screens/customer-kit/use-address-search.hook.ts` · `lib/hooks/use-debounced-lookup.hook.ts` · `lib/auth/authorized-fetch.ts` · `screens/customer-kit/use-me.hook.ts` | **bitti — İKİSİ DE KAPANDI (kullanıcı kararı 15.08), kod değişikliği YOK.** Ortak açıklama Metro'nun paket tazelemesi; MB-03 bir daha açılmaz, MB-13 gözlemde kalır. MB-52 de aynı kararla kapandı. Görev `(21.30)` kapandı, ona asılı `BEKLEYEN` işaretleri kaldırıldı |
| MB-77 (yasal metinde web dili) · MB-76 (yasal belgelerin kapısı) | mobil/cihaz | 19.08 · 13:0x — görevler `(21.86)` · `(21.87)` | `apps/mobile/src/screens/legal/{messages.json,legal-links.tsx}` · `screens/{home/home-screen.tsx,account/account-screen.tsx,checkout/{checkout-screen.tsx,messages.json}}` · `app/legal/[page].tsx` | **bitti** — MB-77 commit `5a1e3d16`. **SATIR İŞE BAŞLADIKTAN SONRA YAZILDI**, kuralın istediği gibi öncesinde değil; kayda geçsin ki sıradaki ajan aynı gecikmeyi tekrarlamasın. Çakışma doğmadı (yollar başka şeridin ilan listelerinde yok) |

**Kapananların görev satırı `(21.34)`:** MB-15 · MB-16 · MB-17 · MB-35 · MB-41. Ölçümler, seçilmeyen
yollar ve kalan borç orada. **Web şeridine bir iş doğdu:**
`apps/web/app/(customer)/[locale]/feedback/[token]/components/feedback-outcome.tsx` hâlâ yalnız
`pointsAwarded` basıyor — web davet sayfası da aynı eksikliği yaşıyor (ekranda tamamlama primi,
defterde turun toplamı). Alan sözleşmede hazır, bağlaması tek satır; koordinasyon defterinde bildirildi.

### Boşta duran kalemler — alan ilan etsin

~~**MB-03 · MB-13** ölçümü kimin yapacağı ilan edilmeli.~~ → **İLAN EDİLDİ:** `cihaz` şeridi aldı
(tabloda satırı var, 11.08 · 12:19). Boşta duran kalem değil.

~~**MB-20 · MB-28** tek karara bağlı (§11.C "birincil boy") ve **web şeridiyle ortak**.~~
→ **BÜYÜK KISMI ÇÖZÜLDÜ (15.08, görev `(21.53)`) ve "karar bekliyor" tespiti YANLIŞTI:** karar
`08.10`'da zaten verilmişti (birincil boy = fiyatı olan en ucuz aktif boy, `primaryVariantId`;
sıra ise operatörün `sort_order`ı). Web müşteri yüzeyi bunu 10.08'den beri uyguluyordu; mobil
geride kalmıştı çünkü alan mobil sözleşmesinde yoktu. **MB-28 kapandı** (arıza değildi),
**MB-20'nin (2). maddesi kapandı** (detay artık kartla aynı boyu açıyor, cihazda doğrulandı).
**Açık kalan tek şey MB-20'nin (1). maddesi:** kartta *"…'dan"* eki — metin işi, iki yüzeyde
birden yapılmalı, açık talep `docs/talep/musteri-liste-fiyati-baslangic.md`.

**MB-04 · MB-12 · MB-23 · MB-31** kod işi değil, **karar** işi (§11 sonu). Kararlar verilmeden
kimse almasın.

### MB-34'ün askısı KALKTI (11.08) — ama kaydı duruyor, bu tablonun ilk sınavıydı

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

~~**Çalışma ağacında ŞU AN duran, commit edilmemiş 10 dosya** (`(21.33)`, başka ajanın)~~ →
**COMMİT EDİLDİ, uyarı düştü** (`f521aef`, 11.08). Ondan sonra aynı ekranların üçü `(21.36)` ile
kit kabına geçti (`9f680bbb`). Kalıcı olan kısım şu: **paylaşılan dosyalara dokunan herkes Write
değil Edit kullanır** ve **yol adı vererek commit eder** — üç şerit tek indeksi paylaşıyor
(CLAUDE §0'ın 08.08 künye kayması vakası).
