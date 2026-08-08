# 11 — Kurye ve Rota Teslimat

## Kapsam

Kuryenin sahadaki iki ekranı (gün listesi, teslimat) + gün kapanışı. Teslim onayı (imza/foto), tahsilat, ulaşılamadı/reddedildi ayrımı, teslimat özeti PDF. Rota bölgesi yönetimi ve kurye atama admin'de (09); burası kuryenin gördüğü yüzey. **İzin:** kurye yalnız kendi teslimatlarını, marj/maliyeti görmez.

## Okunacaklar

- `design/pages/kurye-gun.md`, `kurye-teslimat.md`, `kurye-kapanis.md` (içerik bağlayıcı)
- `DOMAIN.md §4` (teslim edilememe/rezervasyon çıpası), `§6` (teslim onayı/özet), `§7` (gün kapanışı/nakit uyarısı), `§8` (kısmi/kapıda)

## Bağımlılık

`07-siparis` (teslim/durum RPC'leri), `09-admin` (kurye atama + operasyon komponentleri), `14-bildirim` (teslimat özeti PDF + e-posta). **`19-coklu-depo` (01.08):** kurye depoya bağlı roldür (kapsam ataması 19.5; kapsamsız kurye hiçbir teslimatı görmez) — ekranlar 19.1–19.3'ten sonra yazılır; gün listesi/kapanış kurye-gün ekseninde kalır (`DOMAIN §17`).

## Başlarken verilecek izah (örnek)

> "Kuryenin telefonunda kullanacağı ekranları kuruyoruz. Gün listesinde sadece kendi teslimatlarını rota sırasıyla görüyor. Teslimatta kalemleri işaretliyor, B2B müşteride imza/foto alıyor, parayı topluyor — nakit yasal sınırı aşarsa uyarı çıkıyor ama engellemiyor. Müşteri evde yoksa 'ulaşılamadı', kabul etmezse 'reddedildi' diyor; ikisinin stok sonucu farklı. Gün sonunda topladığı parayı kasayla karşılaştırıyoruz, fark aynı gün görünüyor."

## Görevler

- [x] (11.1) **Gün listesi:** kuryenin o günkü teslimatları rota sırasıyla (adres, müşteri, ödeme beklentisi + tutar, içerik özeti); yalnız kendi teslimatları
  - *Bitti:* başka kuryenin teslimatı görünmüyor; ulaşılamayanlar listede kalıyor
  - **Durum (28.07) — ARKA UÇ HAZIR, ekran yok.** Kapı `apps/web/lib/courier/day.ts`: `listCourierDay` (adres anlık kopyadan, ödeme beklentisi, içerik özeti, "yoldayım" bağlantısı). Ekranı yüzey ajanı yazacak; bu kapı onun sözleşmesidir.
  - **Durum (05.08) — EKRAN YAZILDI:** `/operations/deliveries` (cihaz forklu, `requireCourier`). **Rayın son ölü girişi kapandı** — on beş nav hedefinin hepsinin artık rotası var.
    - **Kurye kimliği GUARD'dan, adresten DEĞİL.** `?courierId=` gibi bir parametre olsaydı bir kurye başkasının gününü açardı; kapının zorunlu imzası da aynı sınırı yapısal kılıyor.
    - **Rota bilerek TEK adres:** sevkiyatçının gün planı (`09.15`) aynı sayfanın ikinci dalı — nav zaten tek giriş taşıyor ("Teslimat & Rota") ve ikisi aynı veriye bakıyor. Ayrı rotalar açmak aynı günü iki adresten anlatmak olurdu. **İkinci dal 07.08'de yazıldı**; dal ROLDEN seçiliyor, adresten değil (`?view=mine` yalnız iki şapkayı da taşıyan kişi için, ve yetki değil GÖRÜNÜM seçiyor).
    - **Tahsilat toplamı güne EŞLİK ediyor** (tasarım §2: "kapanışta sürpriz olmaz"): kurye akşam kasayı sayarken beklenen tutarı ilk kez görmemeli. Yalnız **kapıda ödenecek** duraklar toplanıyor — önceden ödenmiş sipariş kuryenin eline hiç girmiyor, toplama katılsaydı kasa fazla görünürdü.
    - **"Ödendi" kapısında rakam GÖSTERİLMİYOR**, tek cümle yazılıyor: tutar basmak kuryeyi olmayan bir tahsilata hazırlardı.
    - **Sonuçlanan duraklar listede KALIYOR ve yeniden sıralanmıyor** — soluklaşıyor. Dibe atmak, kuryenin gün ortasındaki "ne yaptım" haritasını bozardı; gizlemek ulaşılamayanların geri dönülecek adresini yutardı.
    - **Çalışmayan düğme yok:** telefon/WhatsApp/adres bağlantısı olmayan durakta o düğme hiç çizilmiyor. Sahada çalışmayan bir düğme en kötü şeydir.
    - **Masaüstü dar sütunda** (560 px): bu ekranın bilgisi telefonda dizilmek üzere kuruldu; 1360 px'e yaymak kartı seyreltip okunmaz kılardı. Masaüstü hâli sevkiyatçının omuz üstünden bakması ve geliştirme içindir.
  - **"Yalnız kendi teslimatları" İMZADA durur:** `courierId` zorunlu parametredir, seçenek değil — çağıranın süzmeyi hatırlamasına bağlı bırakılmadı. `OrderService.listByCourier` de aynı imzayı taşır.
  - **Kurye tek bir para görür: tahsil edeceği tutar.** Maliyet, kâr, marj, alış fiyatı, vade/limit/borç dönen görünüm modelinde YOK (depo kuyruğuyla aynı yapısal sınır) — test serileştirilmiş çıktıda arıyor.
  - **"Ulaşılamadı" ile "henüz sıra gelmedi" TÜRETİLİR:** ikisi de `ready`'dir; ayrım `out_for_delivery → ready` geçiş sayısından çıkar, ayrı kolon açılmadı.
- [~] (11.2) **Teslimat ekranı — onay:** kalem listesi + eksik/reddedilen işaretleme (tutar kendiliğinden düşer); B2B'de imza/foto zorunlu (parametrik) → `Order.delivery_proof`
  - *Bitti:* B2B teslimatı imzasız kapanmıyor; eksik işareti tutarı düşürüyor
  - **Durum (28.07) — arka uç hazır.** Kapı `apps/web/lib/courier/delivery.ts` (`confirmDoorDelivery`).
  - **Sıra kuralın kendisidir:** kanıt kapısı (hiçbir yazım yapılmadan) → MAL → teslim → PARA. Kanıt sonda kalsaydı yarısı yazılmış teslimat üstüne "olmadı" denirdi; kalem düzeltmesi teslimden sonra yapılsaydı aynı mal iki kez oynatılırdı (0026'nın "tam bir kez say" kuralı); tahsilat teslimden önce yazılsaydı `stale` dönüşte karşılıksız para kalırdı.
  - **Kurye hesap yapmaz:** eksik işaretlendiğinde tutarı düşüren şey bir çarpma değil, ödeme durumu türetimidir (`domain-core/payment`) — tutar tek yerde hesaplanır.
  - **Ayar okunamazsa kanıt zorunlu SAYILMAZ:** eksik ayar yüzünden kuryenin kapıda kilitlenmesi, kanıtsız bir teslimattan pahalıdır.
  - **Durum (06.08) — EKRAN YAZILDI, KANIT YAKALAMA AÇIK DEĞİL.** `/operations/deliveries/<orderId>` (`requireCourier`, sahiplik gün listesinden). Kalem sayacı, tahsilat ve iki olumsuz sonuç çalışıyor; **imza/fotoğraf yakalama yok** ve bu yüzden satır `[~]` kalıyor: kanıtın zorunlu olduğu kanalda (varsayılan B2B) teslim kapanamıyor. Eksik olan bir depolama kapısı — `DeliveryProofInput.imageKey` bir R2 anahtarı bekliyor, `r2Keys`'te teslim kanıtı anahtarı ve imzalı yükleme kapısı yok (talep açık: `docs/talep/arka-uc-teslim-kaniti-yukleme.md`). **BEKLEYEN(11.2)**
  - **Kanıt OKUMASI düzeltildi (07.08) — sipariş detayı kanıtı hiç göremiyormuş.** Arka uç şeridi yükleme kapısını yazarken ölçtü ve bildirdi; doğruladım. Sözleşmenin iki ucu ayrışmıştı: yazan `kind · imageKey · receivedBy · courierId · at`, okuyan (`proofOf`) `signature · photos[] · note · by · at`. **Ortak tek alan `at`** — yani `parts` her zaman boş, `by` her zaman `null` ve `imageKey` hiçbir yerde okunmuyordu. Kanıt yazılıyor ama **hiç açılamıyordu**; ekran "kanıt var" diyor, neyin var olduğunu söyleyemiyordu. Hiçbir yerde hata vermiyordu çünkü iki taraf da kendi içinde tutarlıydı — açılamayan bir sigorta, olmayan sigortadır. Ekran artık `readDeliveryProof` kapısını kullanıyor: türü (`imza`/`foto`), **teslim ALAN kişiyi** (B2B'de "kim imzaladı" ihtilafın asıl cevabı) ve görselin kendisini gösteriyor. Görsel ham `<img>` ile çiziliyor (emsal `ticket-thread`): adres R2'nin 15 dakikalık imzalı adresi, `next/image` onu önbelleğe alıp süresi dolduktan sonra kırık gösterirdi. Kova yapılandırılmamışsa boş çerçeve değil SEBEP yazılıyor. **Yakalama hâlâ yok** — satır `[~]` kalıyor; kapı (`requestDeliveryProofUploadUrl`) artık hazır, kurye ekranına bağlanması ayrı iş.
    - **Uydurma anahtar YAZILMADI.** En kolay yol `imageKey: 'pending'` gibi bir dize geçip teslimi kapatmaktı; o da kanıtı VAR göstermek olurdu — "eksik geldi" ihtilafının tek sigortası açıldığında boş çıkardı. Ekran bunun yerine kapalı bir düğme ve yazılı bir sebep gösteriyor.
    - **Sayaç yalnız DÜŞER** (tavan bugünkü karşılanan adet): karşılananı artırmak "mal nereden çıktı" sorusunu cevapsız bırakır, `adjust_fulfillment` da reddeder.
    - **Satır başına tutar YOK, toplam tek yerde.** Kurye hesap yapmaz; rakam satıra da yazılsaydı kafadan toplamaya davet olurdu.
    - **Tutar ekranda hesaplanmıyor, motorda:** `derivePaymentStatusForOrder` istemcide de koşuyor (motor saf, DB bilmez) — kapıda her dokunuşta sunucuya sormak, şebekesi zayıf sokakta rakamı bekleten bir ekran demekti. Aynı fonksiyon yazımdan sonra sunucuda da koşuyor; görünen tutarla kaydedilen tutar bu yüzden ayrışamaz.
    - **"Yola çıktım" kuryenin ekranında:** teslim de, ulaşılamadı da yoldaki siparişten olur (`0016_deliver_order`). Sevkiyatçı bunu toplu işaretleyecek (09.15) ama kapısı yok; kuryenin kendi eliyle söylemesi bugün tek çalışan yol ve sahada da doğrusu.
  - **Durum (08.08) — KANIT YAKALAMA YAZILDI; satır `[~]` KALIYOR, sebebi altta (CORS).** `delivery-proof.tsx`: imza tuvali (fare/dokunmatik → PNG) + fotoğraf seçimi, ikisi de aynı yoldan — `requestProofUploadAction` ile kısa ömürlü izin alınır, tarayıcı **doğrudan R2'ye** yükler, dönen anahtar teslim onayına girer. Teslim ALAN kişi de burada (`receivedBy`) — B2B'de ihtilafın sorusu "imza var mı" değil "kim imzaladı". Tasarımın karesi birebir: *"Teslim kanıtı · [İmza al] [Foto çek]"*, *"Kanıtsız 'tamamla' pasiftir"*.
    - **Anahtar ancak YÜKLEME BİTİNCE doğar:** `onProof` yalnız `PUT` başarılı dönerse çağrılır. İzin alınır alınmaz anahtarı kaydetmek daha kolaydı ve yanlıştı — izin "yazabilirsin" demektir, "yazdın" demez; yarıda kalan yükleme kanıtı VAR gösteren bir teslimat bırakırdı. Ölçüldü: yükleme başarısızken kanıt eklenmiyor, "Teslim ettim" kapalı kalıyor ve kurye sebebini okuyor.
    - **Boş tuval yüklenmez** (`drawn` bayrağı): imza çizmeden kaydetmek beyaz bir dikdörtgeni kanıt diye yazardı.
    - **CSP AÇILDI — bu bir arızaydı ve tüketicisi olmadığı için görünmemişti.** İlk gerçek `PUT` tarayıcıda kesildi: `connect-src` yalnız `*.r2.dev`e izin veriyordu, imzalı yükleme adresi ise `*.r2.cloudflarestorage.com`. `next.config.ts` künyesi S3 API host'unu 05.11'de *bilerek* dışarıda bırakmıştı ("yükleme sunucu tarafında") — sonra kapı değişti (`proof.ts`: *"dosya sunucudan geçmez"*), CSP güncellenmedi ve hiçbir yerde patlamadı çünkü imzalı yükleme kapısını **hiçbir ekran çağırmıyordu** (şikâyet eki dahil). Host yalnız `connect-src`e eklendi: bu host'tan script çalışmaz, çerçeve açılmaz.
    - ⚠ **R2 kovasının CORS'u yapılandırılmamıştı** — CSP'den sonra çıkan ikinci duvar: `localhost:3000` kaynağına `Access-Control-Allow-Origin` dönmüyordu, tarayıcı ön-denetimi düşüyordu. **Kod değil kova ayarı**; kullanıcı ekledi (08.08).
    - **UÇTAN UCA DOĞRULANDI (08.08, CORS eklendikten sonra).** Ön-denetim ölçüldü: `204` + `Allow-Origin: http://localhost:3000` + `Allow-Methods: PUT` + `Allow-Headers: content-type`. Ekranda imza çizilip kaydedildi → **`PUT 200`** (dosya R2'ye fiilen yazıldı), önizleme geldi, ve asıl kapı çalıştı: **"Teslim ettim" kanıt öncesi KAPALI, kanıt sonrası AÇIK.** Konsol temiz. Bitti-kriterinin ilk yarısı (*"B2B teslimatı imzasız kapanmıyor"*) böylece kanıtlandı.
    - **Teslimin kendisi tamamlanamadı:** ölçüm sırasında yerel veritabanı başka bir şerit tarafından yenilendi ve sipariş kaydı ortadan kalktı. Kanıtın `delivery_proof`a yazılıp `readDeliveryProof` ile okunması bu yüzden ekranda görülmedi — kapının kendi testleri o yolu tutuyor, ama ekran üstünden doğrulanmış değil. Satır bu tek boşluk için `[~]` kalıyor. BEKLEYEN(11.2)
- [x] (11.3) **Teslimat ekranı — tahsilat:** nakit/kart/çek + tutar; nakit yasal sınır aşımında uyarı (engel yok); kapıda tavan/`cod_allowed` zaten checkout'ta uygulandı
  - *Bitti:* nakit sınır uyarısı çıkıyor ama tahsilat tamamlanabiliyor
  - **Durum (28.07) — arka uç hazır.** Aynı kapıdan (`confirmDoorDelivery`) geçer; `cashLimitExceeded` dönen bir BİLGİDİR, akış durmaz (DOMAIN §7). Sınır ayardan (`cash_legal_limit_cents`), yalnız nakde ait — aynı tutar kartla alınırsa uyarı yok.
  - **Yöntem siparişe yazılır:** gün kapanışının yöntem bazlı beklenen toplamı bundan türer; ayrıca bir "kurye tahsil etti mi" bayrağı tutulmadı.
  - **Durum (06.08) — EKRAN YAZILDI.** Kapıda üç yöntem (nakit/kart/çek), tutar kutusu türetilen tutarla açılıyor, nakit eşiği aşınca amber uyarı çıkıyor ve **onay açık kalıyor**.
    - **Kutu değiştirilebilir olmalı:** kapıda müşteri elindekini verir; yazılan tutar da o olmalıdır, sistemin beklediği değil. Eksik girilirse kalan borç açıkça yazılıyor — sessizce yutulmuyor.
    - **Hesap seçilmemişse tahsilat YAZILMAZ, kutu da açılmaz** (`door_cash_account_id`). Açık bırakıp yazmamak en kötüsü olurdu: kurye parayı alır, kayıt doğmaz, fark gün kapanışında patlar. Ekran sebebi yazıp teslimi tahsilatsız kapatmaya izin veriyor, borç açık kalıyor.
    - **Yöntem sözlüğü şemaya bağlandı** (`Record<PaymentMethod, …>`): serbest `Record<string, …>` iken iki anahtar ayrışmıştı (`check`/`transfer` yazılmış, şemada `cheque`/`bank_transfer`) — çek bekleyen kapıda ekran ham `cheque` yazıyordu. Tip artık ayrışmayı derlemede yakalıyor.
- [x] (11.4) **Ulaşılamadı / reddedildi:** iki ayrı işaret; ulaşılamadı → `ready` (mal ayrılmış kalır), reddedildi → `returned` (depoya döner); `wa.me` "yoldayım" tek tık
  - *Bitti:* iki durumun stok sonucu 07/06 kurallarına uygun
  - **Durum (28.07) — arka uç hazır.** `markUndelivered` (day.ts) + saf motor `domain-core/delivery/on-the-way.ts` (6 birim testi).
  - **"Yoldayım" mesajı MÜŞTERİNİN dilinde** kurulur, kuryenin değil: operasyon yüzeyi Türkçedir, ekranın diline uyulsaydı Fransız müşteriye Türkçe giderdi. Metin bu yüzden motorda; bir sayfa `messages.json`'una konsaydı operasyon sözlüğüne düşer, müşteri dilleri hiç doğmazdı.
  - **Numara biçimi normalize edilir:** `+33 6…`, `0033 6…` ve yerel `06…` aynı sonuca iner; ayırt edilemeyecek kadar kısa girdide bağlantı üretilmez (çalışmayan düğme gösterilmez).
  - **Durum (06.08) — EKRAN YAZILDI.** Tek pencere, iki sonuç: soru aynı ("ne oldu?"), akıbet farklı. Ayrımı başlığın ve onay düğmesinin tonu taşıyor, ve **pencerenin alt başlığı stok sonucunu düz Türkçe yazıyor** ("mal araçta kalır" ↔ "mal depoya döner") — kurye doğru olanı seçebilsin diye; iç terim ("rezervasyon", `returned`) hiç görünmüyor.
  - **Durum (08.08) — KAYIP `note` ARIZASI KAPANDI (denetim, kullanıcı onayıyla; bulan: mobil sorumlusu).** `markUndelivered` imzası notu alıyor ama gövde HİÇBİR yere yazmıyordu — kurye "zil bozuk" yazıyor, kayıt buharlaşıyordu (dosyada `note` yalnız imzada geçiyordu; ölçüldü). Not artık geçişle BİRLİKTE atomik yazılıyor: `order_status_log.note` kolonu (0012) + `transition_order_status(p_note)` + servis imzası + kapı geçişi. Okuma/gösterme tarafı ayrı iş (ekran sahibi); kurye orkestrasyonunun `@lezzet/application` taşıması bu düzeltme üstünden birebir gidecek (koordinasyon defteri kaydı). **Şema değişti → yereli görmek `db:refresh` ister (kullanıcının kararı); entegrasyon testleri o güne dek bu satırda kırmızı kalabilir.**
    - Not **serbest ve kısa** (200 karakter, isteğe bağlı): sebebi standartlaştırmak sahada doğru seçeneği aramaya zorlar, kurye de en yakınına basar — yanlış veri doğru görünümlü olur.
    - **"Ara / Yoldayım / Yol tarifi" şeridi tek yerde:** gün kartı ile durak ekranı aynı üç düğmeyi taşıyor, ikinci kez yazılmadı (`StopContactActions`).
- [ ] (11.5) **Teslimat özeti PDF:** teslimde e-postalı müşteriye otomatik (parametrik); kurye isterse çıktı ("resmî fatura değildir")
  - *Bitti:* teslimde PDF üretiliyor + gönderiliyor; çıktı alınabiliyor
  - **Not:** `14.6` ile AYNI iştir; tek yerde yapılır (PDF üretimi + `delivered` mailine ek). Yeni bir PDF bağımlılığı gerektirdiği için ayrı ele alınıyor.
- [x] (11.6) **Gün kapanışı (RPC):** `CourierDayClose` — teslim edilenler, yöntem bazında toplam, iadeler; beklenen vs sayılan farkı aynı gün; kapanmış gün salt-okunur
  - *Bitti:* fark hesabı doğru; kapanan gün değiştirilemiyor
  - **Durum (28.07) — TAMAM.** `0025_courier_day_close.sql` (görünüm + tablo + RPC), `CourierDayCloseService`, kapı `apps/web/lib/courier/day-close.ts`. 9 test. Ekran yüzey ajanının.
  - **Kapanış bir MUTABAKATTIR, para hareketi değil:** para kapıda tahsil edilirken yazıldı (11.3). Burada beklenen ile sayılan yan yana konur, fark aynı gün görünür.
  - **Beklenen toplam tek yerde toplanır:** `courier_day_collection` görünümü — hem kapanış öncesi ekran hem RPC oradan okur. Yalnız kapıda toplanan üç yöntem sayılır; online/havale kuryenin eline hiç girmez.
  - **`expected_*` saklanır ama `reconciled` SAKLANMAZ:** beklenen tutar kapanış anının fotoğrafıdır (sonradan bir hareket düzeltilse de o gün ne konuşulduğu değişmemeli — testli); "fark var/yok" ise iki kolondan generated kolonla türer, çelişme şemada kapalıdır.
  - **Sonuçlanmamış durak kapanışı engellemez** (tasarım §4): kurye depoya döndüyse günü kapatabilmeli; `pendingCount` uyarı içindir. Kapanmış gün salt-okunur — ikinci çağrı `already_closed` döner, kayıt ezilmez.
  - **Durum (06.08) — EKRAN DA YAZILDI:** `/operations/deliveries/close`. Gün listesi "kasa mutabakatı için gün kapanışına geçebilirsiniz" diyor ve gidilecek yer yoktu; bir ekranın söz verip tutmadığı şey onun en zayıf yeridir.
    - **Sayılan tutarlar BOŞ başlar (`null`), sıfır ya da beklenen tutar değil.** Kutuları beklenenle doldurmak en "yardımsever" seçenekti ve en tehlikelisi: kurye bakmadan onaylar, mutabakat kendi kendini doğrular, fark hiç doğmaz — oysa ekranın varlık sebebi o farkı görünür kılmak. Sıfır da yanlış olurdu: "saydım, hiç yok" ile "henüz saymadım" aynı şey değil (CLAUDE.md §1).
    - **Fark varsa açıklama ZORUNLU.** Tasarım §3 "fark gizlenmez, açıklanır" diyor; açıklamasız kaydedilen bir fark ertesi gün kimsenin hatırlamayacağı bir sayıdır. Fark yoksa not isteğe bağlı.
    - **Farkın İŞARETİ korunur** ("2,00 € eksik" ↔ "2,00 € fazla"): mutlak değere indirmek iki ayrı gerçeği aynı gösterirdi. Dil suçlayıcı değil — değerlendirme admin'in işi.
    - **Beklenen hiç yoksa para adımı çizilmiyor** (tasarım §4 "tahsilatsız gün"): üç sıfır kutusu, olmayan bir işi varmış gibi okutur.
    - **Getirilen mal listesinde "teslim ettim" düğmesi YOK** ve olmayacak: malın akıbeti depocunun kararıdır (DOMAIN §8) ve depo iade girişinde sonuçlanır — buradaki bir onay hiçbir yere yazılmazdı.
    - Kapanış sonrası başka ekrana GÖTÜRMÜYOR, aynı ekran salt-okunur hâliyle tazeleniyor: kurye ne kaydettiğini görmeden çıkmamalı.

## Netleşecekler

- **İmza yakalama tekniği:** ekran imzası mı, foto mu, ikisi de mi — sahada (eldiven/soğuk) hangisi güvenilir; tasarım+pratik test sırasında kesinleşir.
- **Offline dayanıklılık:** sahada bağlantı kesilirse teslim işaretinin nasıl tutulup senkronlanacağı — kapsam kararı (basit tutulabilir).
