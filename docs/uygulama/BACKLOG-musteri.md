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

- [ ] **MB-03 · Adres formunda sokak alanına yazınca uygulama yeniden yükleniyor** → görev
  `(21.30)` açık, ölçümü orada. **11.08 · 14:1x — BUGÜN ÜRETİLEMEDİ:** kullanıcı cihazda sokak
  alanına üç harf yazdı, öneriler geldi, birini seçti, adres kaydedildi; hiçbir sıfırlanma olmadı.
  Görevin kendi listesindeki üçüncü şüpheli — **geliştirme ortamının kod tazelemesi** — birinci
  sıraya geçti ve mekanizması ölçüldü (uygulama geliştirme yapısı, kod sunucusu dinliyor; mobil
  dosyası kaydedilince paket baştan koşuyor). İlk ölçüm sırasında üç ajan aynı anda mobil dosyalarına
  yazıyordu. **Kapatılmadı:** ilk ölçüm üç tekrarlı ve kontrol turlu; kesin karar ağaç sakinken
  ya da üretim derlemesinde tekrarla verilir.
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

- [x] **MB-07 · Ülke seçim rozetlerinin (Fransız/Alman şirketi) tasarımı bozuk.** Kullanıcı
  bulgusu 11.08 + ölçüm: çipin **yatay dolgusu yok**, metin kenarlığa yapışıyor/taşıyor. Doğrusu
  `.dc.html`den alınmalı (Claude Design), improvise edilmemeli (CLAUDE §3).

- [x] **MB-08 · "1 Kaydolun — bir dakikada" adımı girişli müşteriye de gösteriliyor.** Zaten
  hesabı olan müşteriye kayıt adımı anlatılıyor. Web'de aynı adımın gövdesi var ve daha bilgilendirici
  (*"SIRET'inizle bir dakikada — bilgiler resmî kayıttan kendiliğinden dolar"*).

- [ ] **MB-09 · Doğrulanmamış: misafir yolu cihazda ölçülmedi.** Kod ve birim testleri kuruyor
  (401 → kimlik çekmecesi → doğrulama → aynı gövdenin yeniden gönderimi), ama 11.08 turunda yalnız
  **girişli** yol yürütüldü. Misafirle bir tur atılmalı: e-posta → OTP → başvurunun kendiliğinden
  gitmesi → "inceleniyor" bloğu.

- [ ] **MB-10 · Başvuru ekranının kahraman görseli yok.** `design/BACKLOG.md` §1'de
  `professionals_hero` slot'u tanımlı ve arka ucu 09.08'de yazıldı (`site_image` tablosu + kova);
  görsel künyesi hâlâ boş.

- [x] **MB-11 · "Başvurunuz inceleniyor" gövdesi başlığı birebir tekrarlıyor.** Başlık
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
  **11.08 · 14:1x — MB-03 ile ORTAK ADAY ÇIKTI:** cihazdaki uygulama geliştirme yapısı ve kod
  sunucusu dinliyor; mobil kaynak dosyası kaydedilince paket baştan koşuyor ve **bellekteki oturum
  deposu sıfırlanıyor** — ekranın "misafir" demesi ve soğuk açılışın düzeltmesi tam olarak buna uyar.
  Ölçümün yapıldığı dakikalarda üç ajan aynı anda mobil dosyalarına yazıyordu. Kanıtlanmadı;
  kesin karar ağaç sakinken ya da üretim derlemesinde tekrarla verilir.
  **BEKLEYEN(21.30): sebep ölçülmedi, teori kurulmuyor.** Sıradaki ölçüm önerisi: `useMe`'nin
  `guest`e düştüğü anı ve `authorizedFetch`in yerel 401 kısa devresini izlenebilir kılmak
  (`lib/auth/authorized-fetch` + `screens/customer-kit/use-me.hook`). MB-03 ile birlikte bakılmalı.

- [ ] **MB-14 · Keşif bitiş ekranı girişli müşteriye "Giriş yaparsanız… / Hızlı doğrulama"
  gösterdi** — üstelik aynı ekranda *"+6 puan kazandınız"* yazarken. MB-13'ün görünen yüzü olabilir;
  ayrıca `signedIn === false` iken puan çipinin çizilebilmesi kendi başına bir tutarsızlık
  (`screens/discover/discover-screen.tsx:488` ve `:494` aynı anda doğru olamaz).

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
(giriş 10 + 4 aday kart × 2), dolayısıyla `points_daily_cap` **100'de kalır** — yükseltmeye gerek
yok, ve en çok istediğimiz davranışları (yorum, davet) artık hiç reddetmez.
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
geri almada ikisi de yok. **Çözüm:** sebep enum'una geri alma türü eklenir (greenfield → migration
doğrudan düzenlenir). Ayrıca `points_entry_daily_idx` yalnız pozitifleri saydığı için tavan geri
sarmıyor — tavan artık davet ödüllerini kapsamadığından bu sorun da küçüldü.

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

- [ ] **MB-49 · Sipariş onayındaki puan vaadi ekranda HESAPLANIYOR — motorun kuralıyla ilgisi yok.**
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

- [ ] **MB-50 · Günlük ziyaret puanı native uygulamada HİÇ yazılmıyor.** Ölçüldü 11.08 (kod):
  `awardVisitPoints` yalnız web yüzeyinden çağrılıyor (`apps/web/lib/feedback/visit-actions.ts`);
  mobil arka uçta karşılığı yok. Sonuç: yalnız uygulamayı kullanan müşteri günde 10 puanı hiç
  kazanamıyor, aynı müşteri web'e girse kazanıyor — **aynı müşteri iki yüzeyde iki farklı kural.**
  MB-36'nın (iki yüzeyde iki fiyat) akrabası.

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

- [ ] **MB-52 · Keşif'ten kataloğa dönerken native çökme — BİR KEZ görüldü, ÜRETİLEMEDİ.**
  11.08: *"addViewAt: failed to insert view … child already has a parent"*. Aynı geçiş sonradan
  sorunsuz çalıştı. Ölçüm sırasında paralel şerit `catalog-screen.tsx`e yazıyordu ve uygulama
  geliştirme yapısı — kod tazelemesinin yeniden bağlama hatası olması kuvvetle muhtemel. **Teori
  kurulmadı, kayıt tutuluyor:** üretim derlemesinde ya da ağaç sakinken tekrarlarsa gerçek arızadır.

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

- [ ] **MB-54 · Ziyaret puanı native'de yazılacak + hesap sayfasında görünecek (kullanıcı kararı 11.08).**
  MB-50'nin kararı: *"ziyaret puanı native'de yazılmalı… hesabım sayfasında bu da olmalı ve
  kullanıcı geldiği zaman o tik yanmalı."* İki parça: (a) mobil arka uçta günlük ziyaret kapısı
  (web'deki `awardVisitPoints` aynı motoru kullanır, ikinci nüsha YAZILMAZ); (b) hesap ekranındaki
  "puan kazanmanın yolları" listesine ziyaret satırı eklenir ve **o gün ziyaret puanı alınmışsa
  satır işaretli görünür** — müşteri bugünkü hakkını kullanıp kullanmadığını görsün. Sözleşmedeki
  kazanma yolu anahtarları bugün üç tane (`referral` · `review` · `feedback_candidate`); ziyaret
  eklenince liste dörde çıkar, yani sözleşme işi de var.

- [ ] **MB-55 · "Nasıl puan kazanılır" anlatım sayfası (kullanıcı isteği 11.08).**
  *"Puan kazanma olayını çok daha anlaşılabilir yapmak için hangi durumlarda puan kazanılıyor,
  tıpkı onboarding gibi bir sayfa yapmak istiyorum."* Bugün bu bilgi hesap ekranındaki üç satırlık
  kutuya sıkışmış durumda ve sipariş/ziyaret/günlük tavan hiç anlatılmıyor. **Sayılar sözlüğe
  gömülMEZ** — ayardan gelen kazanma yolları uçtan okunur (MB-15'in dersi). Onboarding'in adım
  deseni yeniden kullanılır; giriş noktası hesap ekranındaki puan kartı.

- [ ] **MB-56 · SEFER DAVETİ — yeni puan enstrümanı. TASARIM KAPANDI (kullanıcı kararları 11.08).**
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

- [ ] **MB-57 · Puanın yazıldığı ANIN yeniden kurulması — kural ★ karar 2, 3 ve 7'de.**
  Kısaca: kendi eylemleri (giriş · yorum · beğeni · prim · keşif oyu) **anında**; başkasının
  hareketine bağlı olanlar (arkadaş getirme · sefer daveti) o kişinin **parası alındığında**.
  *(Ara karar "sipariş anında yaz + teslim edilmezse geri al" idi; sipariş puanı kalkınca gereksiz
  kaldı ve ödeme şartıyla değiştirildi — gerekçesi ★ karar 3'te.)*

  **İŞ KALEMLERİ:** ödül çağrılarının teslimat etkisinden **ödeme** anına taşınması · davet edene
  "puan yolda" durumunun gösterilmesi · iade yoluna geri alma çağrısı + sebep enum'una geri alma
  türü (engel ve gerekçesi ★ karar 7'de) · sipariş puanı çağrısının ve onay ekranındaki satırın
  kaldırılması. Mobil arka uç ile web ortak motoru kullandığı için **iki yüzeyi birden** ilgilendirir.

- [ ] **MB-58 · Vitrindeki KEŞİF bölümü: oturumsuzda hiç, kartsızken hiç, iskelette var
  (kullanıcı kararı 11.08).** Üç şart:
  (a) **Oturum açılmadan görünmez** — keşif oyu puanı kimliğe yazılıyor (`awardFeedbackPoints`
  kimliksiz kayda puan vermiyor), yani misafire gösterilen davet karşılığı olmayan bir davettir.
  (b) **Oylanacak kart kalmadıysa bölüm KALKAR** — bugün aday ürün sayısı 4 ve müşteri hepsini
  oyladıysa tur boş açılıyor. Sistem oylanmışları zaten eliyor (`votedProductIds`), yani "kaç kart
  kaldı" bilgisi elde var; eksik olan, sıfırsa bölümü hiç çizmemek.
  (c) **İskelete dahil edilir** — bölüm gerçek uçtan besleniyorsa yükleme anında da yeri tutulmalı,
  yoksa vitrin kart sayısı belli olunca zıplıyor.

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

- [x] ~~**MB-23 · Vitrindeki bölge ile sepetteki teslimat adresi farklı yer gösteriyor.**~~ →
  **ELENDİ, ARIZA DEĞİL (kullanıcı kararı 11.08).** Tasarım zaten tutarlı: vitrindeki yer bir
  **tarama bağlamıdır** (onboarding'de müşterinin kendi kodu; başkasına gönderecekse bilerek
  değiştirir), sepetteki adres **bağlayıcıdır**, ve hangisinin geçerli olduğu kararın verildiği
  yerde açıkça yazılıdır: *"Sepetiniz teslimat adresinize göre değerlendirildi."*
  **Bulgunun neden yanlış olduğu:** ölçüm test hesabının yapaylığından doğmuştu — o hesapta beş
  deneme adresi var (Berlin · Toulouse · Volckerinckhove…) ve onboarding kodu 67000'de bırakılıp
  sipariş başka yere yönlendirilmişti; gerçek müşteri davranışı değil, test kurgusu. "Geç anlaşılıyor"
  itirazı da sepetteki o cümleyi görmezden geliyordu. *Tekrar açılmasın diye kaydı duruyor.*

- [ ] **MB-59 · Vitrin başlığında yer adının kaybolduğu bir kare — ÜRETİLEMEDİ.** 11.08'de bir kez
  görüldü: *"67000 STRASBOURG"* yerine yalnız *"67000"*. Yer adı ayrı bir uçtan çözülüyor
  (`usePlaceResolution`), yani çözüm gecikince ya da düşünce kod tek başına kalıyor olabilir —
  **teori, ölçülmedi.** MB-23 elenirken tek gerçek gözlem olarak ayrıldı.

- [ ] **MB-60 · Google ile kaydolan davetlinin davet bağı KURULMUYOR — iki yüzeyde de.** Ölçüldü
  11.08 (kod, `21.43` turunda). Davet kodu yalnız OTP doğrulamasının içinde okunuyor
  (`packages/application/src/auth/otp.ts` → `verifyOtpCode`, yeni müşteride `linkReferrer`). Google
  akışı Supabase'e doğrudan gidiyor: profil satırını auth trigger'ı açıyor ve o yoldan geçen hiçbir
  yerde davet kodu sorulmuyor. Yani bağlantıya tıklayıp Google ile kaydolan davetli sessizce bağsız
  kalır — hata vermez, getiren de puanını hiç almaz. **Web'de de aynı** (`otp-actions` ve misafir
  checkout'u dışında okuyan yok), yani kapatılacak yer ortak kayıt yoludur; tek yüzeyde yamamak
  ikinci bir sessiz boşluk açar. Ölçüt basit: "yeni müşteri kartı DOĞDUĞU an" nerede biliniyorsa
  bağ orada kurulmalı.

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

- [x] **MB-48 · Alttan açılan çekmece YUKARIDAN taşıyordu; öneri listesinin boyu sınırsızdı**
  → **KAPANDI, görev `(21.41)`** (11.08, kullanıcı bulgusu + cihazda ölçüldü). Panelin tavanı tam
  ekrana göreydi ve klavyeyi hesaba katmıyordu; taşan içerik yukarı kaçıyor, kaydırma olmadığı için
  geri gelmiyordu. Adres önerileri tetikleyiciydi (beş satır = ekranın %36'sı) ama sebep listede
  değil kaptaydı — girdi taşıyan her çekmeceyi ilgilendiriyordu. `new-ticket-sheet`in yerel çözümü
  kite taşındı. **iOS'ta da düzeldi** (kullanıcı doğrulaması 11.08): önce klavyenin üstünde ölü bir
  şerit kalıyordu, alt güvenli alan payı klavye açıkken de eklendiği içindi; koşul eklenince kalktı.

- [ ] **MB-30 · Unistyles uyarısı kütükte tekrarlıyor:** `we detected style object with 2 unistyles
  styles … use array syntax instead of object syntax`. Hangi bileşen olduğu bulunup düzeltilecek.

- [x] **MB-45 · Onboarding teslimat/ödeme adımlarının metinleri "Büyük"te bile küçük kalıyordu**
  → **KAPANDI (11.08, kullanıcı bulgusu).** Yazı boyutu özelliği çalışıyor; kusur o iki adımın
  **hangi durağa bağlandığındaydı**: satır açıklamaları (`paySub`) ve güvence cümlesi
  (`secureText`) `helper`e (12) çakılıydı — yani formların "yardımcı ipucu" basamağına — oysa
  aynı ekranların üst gövdesi `control` (16) kullanıyor.
  **Ölçüm:** `helper` "Büyük"te (×1,15) **13,8**'de kalıyor, `control` **18,4**'e çıkıyor; aynı
  işi gören iki metin arasında kalıcı 4 px uçurum. Yeni merdiven: başlık 16 · açıklama
  **`body-sm` 14** · güvence **`note` 13**. Cihazda doğrulandı.

- [ ] **MB-46 · `helper` durağı ASIL İÇERİK taşıyan başka yerlerde de kullanılıyor olabilir.**
  MB-45'in genel hâli. Ölçüm: `theme.text.helper` uygulamada **124 yerde** geçiyor ve çoğu
  meşru (form ipucu, alt yazı, resim künyesi). **Topluca değiştirilMEZ** — her kullanım "bu metin
  ipucu mu, içerik mi" diye tek tek bakılmalı, yoksa ölçülmemiş bir toplu müdahale olur.
  Yöntem önerisi: yazı boyutu "Büyük"ken ekran ekran gezip 13,8 pikselde kalan ama müşterinin
  KARAR için okuduğu metinleri işaretlemek. Cihaz işi (§13 ⚑).

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

1. ~~**MB-01 + MB-02** — klavye tuzağı ve kapanan alan. Tek turda, 13 dosya.~~ → **İKİSİ DE KAPANDI
   (11.08), ve "13 dosya / tek tur" tahmini YANLIŞ ÇIKTI.** Klavye tuzağı `(21.33)`'te ölçülerek
   40 kaydırıcıdan **10**'una daraltıldı (`f521aef`); kapanan alan ayrı bir sebepti (tema
   kenardan-kenara olduğu için Android'in pencere küçültmesi ölü) ve `(21.36)`'da kite konan
   kaydırma kabıyla çözüldü (`9f680bbb`). Aynı turda bitmediler — §11.A'nın son paragrafı zaten
   bunu söylüyordu.
2. **MB-04 + MB-05 + MB-07 + MB-08 + MB-11** — 21.31'in açık kalanları; dilim **commit edilmeden**
   kapanırsa git geçmişi bütün olur.
3. **MB-03 → MB-13** — adres formunun yeniden yüklemesi ve oturumun misafire düşmesi; ikisi de
   **ölçüm işi**, düzeltme işi değil. Sebep çıkmadan kod yazılmaz (CLAUDE §0).
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
**tek ölçüm iki maddeyi kapatabilir** — ya da MB-13'ün bağımsız olduğu kanıtlanır. Bugün ikisi de
`BEKLEYEN(21.30)`'a asılı, bu doğru.

---

## 12. Mobil şeridin eklediği kalemler (11.08)

> Yeni ölçülenler + şeridin elinde duran, listeye girmemiş açıklar. Kimlikler MB dizisini sürdürüyor.

- [ ] **MB-34 · Kaydırma kabı kitte yok — 39 ekran ham `ScrollView` kullanıyor.** §11.A'nın işi:
  `components/ui/` altına klavye davranışı doğru kurulmuş tek bir kap, ekranların ona geçmesi ve ham
  `ScrollView` kullanımının lint'le kapatılması. MB-01 + MB-02 bunun içinde çözülür; ayrıca 40'ıncı
  ekranın aynı tuzağa düşmesini yapısal olarak engeller.

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
  Ayrıca "Jest did not exit" uyarısı ve 21.20'nin birim test borcu (`StockMark`, `stockMarkOf`,
  `placeModeOf`). *Müşteri turunu bitirirken bu defter de kapanmalı, yoksa yeşil koşu bir şey
  kanıtlamıyor.*

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

- [ ] **MB-42 · `packages/design-tokens` yerelden import edilemiyor — göreli ihraçlarında uzantı yok.**
  Ölçüldü (11.08, MB-41 turunda): `app.config.ts`ten `@lezzet/design-tokens` import etmek
  `expo config`i **düşürüyor** (`ERR_MODULE_NOT_FOUND`); sebep paketin girişindeki uzantısız göreli
  yeniden-ihraçlar. Uzantılı denek modül AYNI yükleyicide çalıştı, yani engel yükleyici değil paketin
  kendisi. Bugünkü bedeli: splash rengi token'a bağlanamıyor (`(21.34)`'te gerekçesiyle hex kaldı).
  Paket web ve mobil ortak, o yüzden değişiklik iki yüzeyi de ilgilendirir.

- [ ] **MB-43 · İkon/splash PNG'lerinin krem zemine yeniden üretimi HİÇBİR YERDE kayıtlı değil.**
  MB-41 turunda görüldü: `app.config.ts` splash rengini taşıyor ama görsel varlıkların kendisi
  eski zeminde. İş bir tasarım kararı ister (hangi zemin, hangi boyut seti); şimdilik yalnız kayıt.

- [ ] **MB-40 · Talep maili kart genişliği açık** (`docs/talep/not-mobil-talep-maili-duzeltildi-
  genislik-acik.md`): arka-uç notun iki bulgusunu kapattı, üçüncüsünün ölçümünü mobile bıraktı ve
  hâlâ ölçülmedi.

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
| MB-05 · MB-07 · MB-08 · MB-11 (B2B ekranının açık kalanları) | mobil | 11.08 · 12:4x | `apps/mobile/src/screens/professionals/**` · `apps/mobile/src/lib/api/b2b.ts` | **alındı** |
| MB-04 (e-posta alanı kalkıyor — kimlik oturumdan) | mobil | 11.08 · 13:1x | `apps/mobile-api/src/api/v1/b2b.ts` (bitti) · `apps/mobile/src/screens/professionals/**` | **alındı** |
| MB-39 (ölü ihraç tipler — B2B dışı yarısı) | mobil | 11.08 · 12:4x | `apps/mobile/src/lib/api/{discover,points}.ts` · `lib/payment/{payment-sheet,stripe-config}.ts` · `screens/customer-kit/{discount-label.ts,use-sheet.hook.ts}` · `screens/home/use-home-orders.hook.ts` | **alındı** |
| MB-02 (klavye odaklanan alanı kapatıyor) | cihaz | 11.08 · 12:19 → yollar 12:3x'te kesinleşti | **YENİ:** `apps/mobile/src/components/ui/form-scroll.tsx` · **DEĞİŞEN:** `screens/{professionals/professionals-screen.tsx,login/login-screen.tsx,feedback/feedback-screen.tsx}` | **bitti ve COMMİT EDİLDİ** — `9f680bbb`, görev `(21.36)` (11.08). Sebep ölçüldü: tema `Theme.EdgeToEdge`, `adjustResize` ölü, pencere küçülmüyor (klavye açıkken kaydırma da işlemiyor). Çözüm kite kondu (`form-scroll.tsx`), `bottom-sheet`in 08.08'de verdiği kararın aynısı; şimdilik yalnız FORM ekranlarına uygulandı. **Kalan geniş göç MB-34'ün işi** — o satır da artık açık |
| MB-48 (çekmece taşıyor · öneri listesi sınırsız) | cihaz | 11.08 · 14:2x — görev `(21.41)` | `apps/mobile/src/components/ui/{bottom-sheet.tsx,suggestion-list.tsx}` · `apps/mobile/src/screens/support/new-ticket-sheet.tsx` (yerel kaydırıcı kite taşındı) | **bitti** — Android'de ölçüldü ("Büyük" yazı boyutu), **iOS'ta kullanıcı doğruladı** (11.08) |
| MB-09 (B2B misafir yolu cihazda hiç yürütülmedi) | cihaz | 11.08 · 14:2x | **yalnız ölçüm — kod değişikliği YOK.** Misafirle tur: e-posta → tek kullanımlık kod → başvurunun kendiliğinden gitmesi → "inceleniyor" | **alındı** — cihaz işi olduğu için bu şeritte (⚑ kuralı); MB-03/MB-13 turundan sonra |
| MB-03 · MB-13 (yeniden yükleme · oturum misafire düşüyor) | cihaz | 11.08 · 12:19 | **yalnız ölçüm — kod değişikliği YOK.** Okunacaklar: `screens/customer-kit/use-address-search.hook.ts` · `lib/hooks/use-debounced-lookup.hook.ts` · `lib/auth/authorized-fetch.ts` · `screens/customer-kit/use-me.hook.ts` | **alındı** — tablo "ölçümü kim yapacak, ilan edilsin" diye sormuştu; cihaz bu şeritte (üstteki ⚑ kuralı). Sebep çıkmadan kod yazılmaz (CLAUDE §0) |

**Kapananların görev satırı `(21.34)`:** MB-15 · MB-16 · MB-17 · MB-35 · MB-41. Ölçümler, seçilmeyen
yollar ve kalan borç orada. **Web şeridine bir iş doğdu:**
`apps/web/app/(customer)/[locale]/feedback/[token]/components/feedback-outcome.tsx` hâlâ yalnız
`pointsAwarded` basıyor — web davet sayfası da aynı eksikliği yaşıyor (ekranda tamamlama primi,
defterde turun toplamı). Alan sözleşmede hazır, bağlaması tek satır; koordinasyon defterinde bildirildi.

### Boşta duran kalemler — alan ilan etsin

~~**MB-03 · MB-13** ölçümü kimin yapacağı ilan edilmeli.~~ → **İLAN EDİLDİ:** `cihaz` şeridi aldı
(tabloda satırı var, 11.08 · 12:19). Boşta duran kalem değil.

**MB-20 · MB-28** tek karara bağlı (§11.C "birincil boy") ve **web şeridiyle ortak** — açık talep
`docs/talep/musteri-liste-fiyati-baslangic.md`. İki yüzey ayrışmasın diye tek turda kapanmalı;
sahibi web ile mobil arasında `koordinasyon-web-mobil.md`den kararlaştırılacak.

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
