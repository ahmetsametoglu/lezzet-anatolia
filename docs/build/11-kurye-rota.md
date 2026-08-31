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
  - ⚠ **Durum (31.08) — "rota sırasıyla" vaadi HENÜZ KARŞILANMADI.** Bu satır `[x]` ama listenin sırası
    coğrafi değil: `OrderService.listByCourier` sabit `orderBy: 'createdAt'` kullanıyor, yani gösterilen
    sıra **siparişin verilme sırası**dır ve ekranda `index + 1` olarak rota sırasıymış gibi çiziliyor.
    Sevkiyat masası aynı sayıyı yazmayı bilerek reddediyordu (`dispatch-read.ts` künyesi: *"sistem
    sırayı bilmiyor"*) — yani kod kendiyle çelişiyordu. Gerçek hesap **11.9**'un işi; o kapanana dek
    buradaki "rota sırasıyla" ifadesi bir niyet, teslim edilmiş bir yetenek değil.
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
- [x] (11.6) **Gün kapanışı (RPC):** ~~`CourierDayClose` — kurye×gün ekseni~~ → **18.08'de SEFER eksenine indi (11.7):** kapanışın sahibi artık `delivery_run_close`; buradaki mutabakat kuralları (beklenen dondurulur, fark açıklanır, salt-okunur kapanış) aynen 11.7'de yaşıyor
  - *Bitti:* fark hesabı doğru; kapanan gün değiştirilemiyor
  - **Durum (28.07) — TAMAM.** ~~`0025_courier_day_close.sql` (görünüm + tablo + RPC), `CourierDayCloseService`~~, kapı `apps/web/lib/courier/day-close.ts`. 9 test. Ekran yüzey ajanının.
  - **Durum (26.08 — DENETİM DÜZELTMESİ): yukarıdaki notun İKİ vaadi artık YOK.** Eksen 18.08'de
    sefere inince `0025` migration'ı kaldırıldı (halefi `0046_delivery_run.sql`) ve
    `CourierDayCloseService` söküldü; ölçüldü, ikisi de dosya sisteminde yok. Ayakta kalan tek şey
    kapı: `apps/web/lib/courier/day-close.ts` — ama o da artık gövde değil, `@lezzet/application`a
    giden bir **köprü** (terfi aşama 2/3). Başlık üstü çizilmişti, NOT çizilmemişti; satırı okuyup
    notu okuyan bir ajan var olmayan bir migration arardı.
    **`docs:check` bunu neden görmedi:** vaat denetimi (§3c) yalnız `apps/…`/`packages/…` gibi
    ÖNEKLİ yolları tarıyordu; ~~`0025_courier_day_close.sql`~~ çıplak bir dosya adıydı ve desene hiç
    girmiyordu. Denetim aynı turda genişletildi — migration adları tek klasörde yaşadığı için
    çıplak yazılsalar da tekil olarak çözülebiliyor.
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

- [x] (11.7) **SEFER — gerçekleşen teslimat rotası (`delivery_run`, 0046):** rota+gün başına tek sefer; kurye rotayı SEÇER, sefer kaydı doğar, kurye bilgisi seferden senkronlanır; kapanış sefer ekseninde
  - *Bitti:* sefer başlatma claim + geçiş ayrımıyla çalışıyor; kapanış takılı durakları çözüyor; geçmiş seferler listeleniyor
  - **Durum (18.08) — UÇTAN UCA YAZILDI (kullanıcı kararları K1–K4, etüt `docs/feature/sefer.md`).**
    Şema `0046_delivery_run.sql` (0025 kaldırıldı — kapanışın halefi sefer eksenli `delivery_run_close`):
    `delivery_run` + `order.delivery_run_id` + `delivery_run_collection` görünümü + üç RPC
    (`start_delivery_run` · `close_delivery_run` · `reassign_delivery_run`). Kapılar
    `@lezzet/application/courier/{day,routes,day-close}` — `startCourierDay` artık sefer açar
    (tek-rota otomatiği: tek adayda soru sorulmaz), `listCourierRoutes` seçim ekranının verisi,
    `openDayClose/closeCourierDay` run eksenli. Web: dispatch'e sefer şeridi + DEVİR (toplu atama
    SÖKÜLDÜ — `assignCourierAction` silindi), kapanış ekranı sefer künyeli, `deliveries`e üçüncü
    sekme **Seferler** (keyset), sipariş detayına SF köprüsü, panel kartları sefer kimlikli.
    Mobil: K1 rota seçimi + "Seferi başlat", K7 sefer kapanışı, `GET /courier/routes` ucu.
    Seed rota+gün başına sefer kurup kapanışın üç hâlini üretiyor (kapsam kovaları `seed:coverage`).
    **Catch-up claim:** aynı kuryenin açık sefere ikinci basışı reddedilmez, sonradan hazırlanan
    durakları da sefere bağlar (mobil şeridin bulgusu). **`courier_id` sökülmedi:** beş sahiplik
    kapısı ona yaslanıyor; yazan el sevkiyatçı menüsünden kuryenin sefer başlangıcına geçti.
  - ✅ **KAPSAM SÜZGECİ YAZILDI (21.08, kullanıcı kuralı: "kurye hangi depoya aitse o depoya ait
    rotaları görebilmeli ve alabilmeli")** — eski kayıt: rota seçimi depo kapsamını süzmüyordu, A
    deposunun kuryesi B'nin rotasını başlatabilirdi. Artık: `listCourierRoutes` `scope` (zorunlu,
    `WarehouseScope`) alıyor ve bölgeleri `canAccessWarehouse` ile süzüyor; `startCourierDay`
    kapsamı KURYENİN PROFİLİNDEN sunucuda çözüyor (istemciden kapsam alınmaz — hazırlık kapılarının
    gerekçesi) ve verilmiş `zoneId` kapsam dışıysa `no_route` dönüyor (`zone_not_found` emsali:
    seçim listesi zaten yalnız kendi deposunu gösterir, yazım hiç yapılmaz). İki eksen ayrık kaldı:
    kurye eksenine daraltma YOK (sahiplik claim'le doğar), depo ekseni süzer. Boş kapsam = hiçbir
    rota (fail-closed, motorun kuralı). Sevkiyat masası depo-üstü bakışını `{ kind: 'all' }` ile
    AÇIKÇA söylüyor (sayfaya yalnız admin ulaşıyor). Mobil `/courier/routes` ucu `staff` profilinden
    kapsam geçiriyor — uyarlama mekanik yapıldı, not bırakıldı
    (`docs/talep/not-mobil-kurye-rota-kapsam-suzgeci.md`). **Negatif taraf TESTLE kilitli**
    (kullanıcı onayı 21.08): `day.test` › *"başka deponun rotası listede görünmez ve kimliği elle
    verilse bile başlatılamaz"* — yabancı rota listede yok, elle `zoneId` `no_route` + sıfır sefer
    kaydı, boş kapsam boş liste (fail-closed).
  - **Durum (26.08) — "AÇIK SEFER" ARTIK TEK TANIM (mobil şeridin cihaz turu ölçtü, kök bizde).**
    Araç satışını sefere bağlayan adım (`quick-sale.ts` 4b, 26.08) kendi ölçütünü kurmuştu
    (`returnedAt is null`), kurye ekranı ise başkasını okuyordu (kapanış kaydı var mı). Gerçek
    akışta ikisi çakışıyor — `close_delivery_run` dönüş damgasını ve kapanış satırını **aynı
    çağrıda** yazar (`0046:320`) — ama çakışmaları bir tesadüftü, kural değil: seed damgayı
    kapanışsız yazınca ayrıştılar ve ekranın "açık · kapat" dediği sefere motor bağ kurmayı
    reddetti; araçtan satılan malın parası yine hiçbir mutabakata girmedi (4b'nin kapatmak için
    yazıldığı arıza, bu yoldan hâlâ doğuyordu).
    **Tanım ölçütü DAMGA DEĞİL KAPANIŞ:** sorulan soru *"araç yolda mı"* değil, *"bu para hâlâ bir
    mutabakata girebilir mi"*. Motor artık ekranın okuduğu fonksiyonu çağırıyor
    (`readCourierRun`) — ikinci bir tanım kalmadı. Dünün kapatılmamış seferi bugünün parasını
    yutamaz: okuma **güne** bağlı.
    **Seed'deki kök de düzeldi:** her sefere çıkış VE dönüş damgası yazılıyordu, yarınki sefer bile
    "dönmüş" görünüyordu — üstelik seed'in kendi niyetiyle çelişerek ("kapanmamış sefer" hâli
    bilerek kuruluyor). Artık geçmiş gün = kapanmış sefer, **bugün = AÇIK sefer** (yerinde satışın
    denenebileceği tek zemin), gelecek gün = sefer yok (sefer çıkışta doğar).
    **İki test çiviliyor** (`quick-sale.test.ts`, ikisi de sabotajla sınandı): damgalı-ama-kapanmamış
    sefer hâlâ açıktır (ölçüt damgaya çevrilirse kırmızı) · kapanmış sefere bağlanmaz (kapanış
    denetimi kalkarsa kırmızı — mutabakat fotoğrafı geçmişe dönük değişmez).

- [~] (11.8) **Navigasyon devri:** durak kartından cihazın navigasyon uygulamasına geçiş — rota kurar, yer kartı açmaz
  `touches: packages/domain-core/src/delivery/navigation.ts, apps/web/app/(operations)/operations/deliveries/deliveries-sections.tsx, apps/mobile/src/screens/courier/delivery-screen.tsx`
  - **Durum (31.08) — MOTOR + WEB YAZILDI, mobil şeritte bekliyor** (`docs/talep/mobil-navigasyon-koprusu.md`).
  - **Arıza neydi:** iki yüzeyde de URL elle yazılıydı ve ikisi de `maps/search/?api=1&query=` idi — o
    adres bir **yer kartı** açar, yolculuğu BAŞLATMAZ. Kurye ekranda ikinci kez "Yol tarifi"ne basmak
    zorundaydı; her durakta tekrarlanan bir dokunuş. Doğrusu `maps/dir/?api=1&destination=…`.
  - **Motor `domain-core`'da, sözleşmede DEĞİL** (`navigation.ts`): kardeşi `whatsAppLink` sunucuda
    hesaplanıp `CourierStop`a konuyor çünkü sunucunun BİLDİĞİ bir şeye dayanıyor (müşterinin dili,
    normalize numara). Navigasyon hedefi ise **cihazın** kararı — hangi harita uygulaması kurulu,
    iOS mu Android mi. Sunucu bilmediği bir şeye karar verseydi ekran onu düzeltmek zorunda kalırdı.
    `CourierStopSchema` bu yüzden hiç değişmedi.
  - **Yalnız `https` (+ Android'de `geo:`), `canOpenURL` YOK:** özel şemalar (`comgooglemaps://`)
    kurulu değilse sessizce başarısız olur ve doğrulaması `canOpenURL` ister; Android 11+ paket
    görünürlüğü yüzünden o da bildirilmemiş şemalarda yanlışlıkla `false` döner — doğru cevap
    `app.json`'a `android.queries` + prebuild turu isterdi. `https` her cihazda çözülür: kazanç aynı,
    bedel sıfır.
  - **Yeni bağımlılık yok** (`STACK §2` beyanı gerekmedi); dokuz birim testi, merkezinde "rota kurar,
    yer kartı açmaz" iddiası.
  - **BEKLEYEN(11.8):** mobil `delivery-screen.tsx` hâlâ elle URL yazıyor ve `openURL` reddini yutuyor.

- [x] (11.9) **Durak sırası — coğrafi, `createdAt` değil:** kapalı tur hesabı (2-opt + Or-opt), sıra `delivery_run.stop_order`'da; adres koordinatı (BAN) + posta kodu merkezi geri düşüşü, hangisi olduğu adlandırılır
  `touches: supabase/migrations/0011_customer_fields.sql, supabase/migrations/0031_warehouse.sql, supabase/migrations/0046_delivery_run.sql, packages/domain-core/src/delivery/route-order.ts, packages/application/src/courier/stop-order.ts, packages/application/src/delivery/geocode-port.ts, packages/types/src/contracts/courier-api.schema.ts, apps/web/app/(operations)/operations/deliveries/deliveries-sections.tsx`
  - **Etüt:** `docs/feature/durak-sirasi.md` (kardeşleri `sefer.md`, `cok-gunluk-sefer.md`) — üç
    kullanıcı kararı (31.08) ve kuş uçuşunun yazılı sınırı orada.
  - **`db:refresh` penceresi gerektirir** (üç migration) — **kullanıcının kararıdır**.
  - Kapsam dışı ve bilinçli: elle sıra düzeltme (önce motor izlenir; `stop_order_source` kapıyı açık
    tutar), mobil harita, zaman penceresi/soğuk zincir kısıtları.
  - **Durum (31.08) — ZİNCİR ÇALIŞIYOR, adres koordinatı henüz yok.** Şema + motor + kapı + sözleşme
    + web yüzeyi yazıldı; sıra bugün **posta kodu merkezinden** hesaplanıyor (`precision`
    `postal_centroid`). Aynı kodda birden çok durak varsa aralarındaki sıra keyfîdir ve ekran bunu
    söyleyebilir — bu, `createdAt`e göre devrim, gerçek yola göre yaklaşımdır.
    - **Motor** `packages/domain-core/src/delivery/route-order.ts`: NN tohum + **2-opt + Or-opt**,
      amaç fonksiyonu KAPALI TURUN toplamı (dönüş bacağı dahil). Kullanıcının U senaryosu bir kural
      olarak yazılmadı, doğru amaç fonksiyonundan çıkıyor. 22 birim testi; merkezinde iki paralel
      hat geometrisi ve *"depoya en yakın duraklardan biri en son teslim edilir"* iddiası.
      **Sabotajla sınandı:** dönüş bacağı toplamdan çıkarılınca iki test kırmızıya döndü.
    - **Determinizm yazılı:** süre bütçesi yok (adım tavanı var), tarama sırası sabit, yön kuralı
      adlandırıldı, ve **girdi dizisinin sırası sonucu etkilemiyor** — etkileseydi `createdAt` gizli
      bir eşitlik bozucu olarak arka kapıdan geri sızardı.
    - **Sıra `delivery_run.stop_order uuid[]`de**, `order.stop_seq` kolonunda değil: sıra turun
      özelliğidir, siparişin değil. Yazım RPC'den (`set_run_stop_order`) — `DeliveryRunService`in
      "yazım RPC'dendir" değişmezi korundu; `manual` kaynak motor yazımını kilitliyor.
    - **Hesap sefer başlatmayı BLOKE ETMİYOR:** `ensureStopOrder` hiçbir hâlde fırlatmıyor, düşerse
      sıra `null` kalıyor. Bir rota iyileştirici aracın yola çıkmasını durduramaz.
    - **Bayatlık zamana değil KÜMEYE bakıyor:** seferin bugünkü sipariş kümesi kayıtlı sırayı aşıyorsa
      bayat. Damga ikinci rolde (60 sn bekleme) — düşmüş sağlayıcı her tazelemede dövülmesin.
    - `postalOf`/`pointOfWarehouse` MCP aracından motora **terfi etti** (ikinci tüketici doğdu); kopya
      söküldü.
  - **Durum (31.08b) — ÖLÇÜLDÜ: posta kodu merkezi Strasbourg'da SIFIR bilgi taşıyor.** `db:refresh`
    sonrası bugünün seferi sıralandı ama kodlar blok hâlinde çıkmadı; sebep ölçüldü: GeoNames
    dökümünde **67000/67100/67200 kodlarının üçü de aynı noktayı** taşıyor (`0034:4298-4315`,
    şehrin merkezi). Yani o rotadaki 12 durağın hepsi tek noktada, aralarındaki mesafe sıfır ve
    üretilen sıra **keyfî**.
    - **Motor artık bunu adlandırıyor:** `indistinguishable` reti (`orderStops`) — duraklar birbirinden
      ayırt edilemiyorsa sıra YAZILMAZ. Keyfî bir sıra, sıra yokluğundan kötüdür: numaralanmış liste
      kuryeye "bu hesaplandı" der ve kurye ona güvenir (`CLAUDE §1`). Kısmi çakışma sıralanmaya
      devam ediyor — kaba sıra da bir sıradır, yeter ki kaba olduğu söylensin.
    - **Sonuç: adres koordinatı opsiyonel DEĞİL.** Kullanıcının "karışık" cevabı (31.08) doğruydu ama
      gerçek daha keskin — tek şehirli bir rotada posta kodu ekseni hiç ayırt etmiyor.
    - **Adres koordinatı zemini yazıldı:** geocoding portu (`geocode-port`/`geocode-provider`, mevcut
      `packages/address-fr` üstünde — **yeni npm bağımlılığı yok**), makullük süzgeci
      (`plausiblePoint`, istemcinin noktası bir BEYANDIR), tarama cron'u
      (`apps/backend/src/jobs/geocode-addresses.ts`, 10 dakikada bir, taramalı + idempotent),
      ve adres düzenlenince noktanın düşmesi (`resolveAddressPoint` → `updateCustomerAddress`) —
      yazılmasaydı müşteri adresini düzelttiğinde kurye ESKİ kapıya sıralanırdı.
  - **Durum (31.08c) — BESLEME DÖRT HATTA AÇILDI** (kullanıcı kararı; 16.08'in *"rota sayısını bire
    indirelim"* kararı yürürlükten kalktı). Gerekçe ölçümdü: tek rotanın üç kodu da aynı noktadaydı,
    yani sıralama hiç sınanamıyordu.
    - **Kuzey — Frankfurt** (STR, pzt+prş): 67000 · 67500 · 67160 · DE 76829 · DE 60311 → 183 km'ye
    - **Batı — Metz** (STR, salı+cuma): 67100 · 67200 · 67700 · 57400 · 57000 → 130 km'ye
    - **Güney — Mulhouse** (COLMAR, çrş+cts): 67600 · 68000 · 68100 → 98 km'ye
    - **Doğu — Stuttgart** (KEHL, salı+cuma): DE 77694 · 77652 · 70173 → 107 km'ye
    - Kodlar ve mesafeler `postal_code_place`ten **ölçüldü**, uydurulmadı. Hatların uçlarına on
      adres ve bugünün kuzey hattına üç sipariş eklendi (22/48/71 km) — kapalı turun şekli ancak
      yayılmış bir günde okunabilir.
    - Yan kazanç: KEHL deposu ilk kez bir rotaya sahip; Batı ve Doğu **aynı gün** koşuyor, yani
      kuryenin rota SEÇİMİ (K1) gerçekten sınanıyor. Rota dışı hâli Lyon (69007) taşımaya devam
      ediyor. Sınır ötesi hat ADR-002'nin meşru saydığı şey.
    - **Beslemede koordinat SABİT yazılıyor** (kullanıcı itirazı 31.08 — ilk hâlinde yazılmıyordu ve
      her `db:refresh` sonrası elle bir komut gerekiyordu; unutulduğu gün sıra sessizce posta kodu
      merkezine düşerdi). "Ağa çıkma" ilkesinin doğru sonucu *koordinat yazmamak* değil, **bir kez
      çekip sabitlemek** — `postal_code_place` verisi de aynı yolla üretiliyor. FR değerleri BAN'dan
      (`housenumber`, skorlarıyla doğrulandı), DE değerleri kod merkezi (`municipality` — kapı değil
      ve öyle söyleniyor). **19 adresin 19'u noktalı.**
    - `pnpm geo:backfill` duruyor ama artık refresh'in parçası değil: beslemenin bilmediği adresler
      (uygulamadan girilen, operasyon panelinden açılan) için — cron aynı işi zaten yapıyor.
    - ~~① öneri noktasının yazma yollarına bağlanması~~ **WEB YARISI KAPANDI (31.08 · kullanıcı
      düzeltmesi):** müşteri bir adres önerisine tıkladığında BAN'ın o cevapta gönderdiği koordinat
      artık kayıtla birlikte yazılıyor — `address-fields` → `address-form` → action → kapı zinciri.
      Kod ELLE değiştirilince nokta düşer (`country`nin aynı kuralı). Ham `lat`/`lng` yazma
      yolundan GİRMİYOR: ayrı bir `point` parametresi, çünkü istemcinin sayısı bir BEYAN değil ADAY
      ve süzgeci atlayan ikinci bir yol olmamalı.
      **Sıra ilk sürümde TERSTİ ve kullanıcı yakaladı:** cron birincil çözüm gibi yazılmış, asıl yol
      (öneri) `BEKLEYEN` bırakılmıştı. Cron'un "senkron çağrı kotayı tüketir" gerekçesi de
      abartılıydı — o kural otomatik tamamlama içindir (her tuş vuruşu), kaydetme için değil.
      Ölçüm de bunu söylüyordu: cron kuyruğu **0 satır**. Künyesi düzeltildi, iş artık TELAFİ olarak
      duruyor (elle yazılan adres · ops paneli · süzgeçten düşen aday · servis kesintisi · ileride
      DE sağlayıcısı). **Mobil yarısı native şeritte.**
    - **Durum (01.09) — PLANIN KALAN ALTI MADDESİ KAPANDI.**
      - **Sıranın künyesi sözleşmede** (`StopOrderInfoSchema`): ölçü · incelik · sıralı/sırasız
        sayısı. `DOMAIN §6` *"ekran bunu söyleyebilmeli"* diyordu ama söyleyemiyordu — doküman kodu
        yalanlıyordu, kapandı. Sefer başına (durak başına değil): sefer başına tekil bir değeri her
        durağa kopyalamak "bu durakta başka ölçüt olabilir" beklentisi kurardı.
      - **Bayatlık kapısı** `listCourierDay`de: gün ortasında sefere katılan durak sırasız kalıyordu
        (kurye "kalanları yola çıkar"a basmazsa düzelmiyordu). Ölçüt zaman değil KÜME.
      - **`RouteMatrixProvider` portu** + `costOfMatrix`: motor artık `cost`u porttan alıyor ve
        sağlayıcı yoksa kuş uçuşuna **adlı** düşüyor. İki kural testli — tek `null` hücre tüm matrisi
        reddeder, asimetrik matris simetrikleştirilir (2-opt tersleme yapar, asimetride geçersizdir
        ve bunu hiçbir test yakalamaz). OSRM adaptörü ölçüm bekliyor: **BEKLEYEN(11.9)**.
      - **Rota önizleme haritası** (`route-map` üçlüsü + `leaflet-base` ortaklaştırması): sevkiyat
        şeridinde katlanır harita. `ZoneMap` genişletilmedi — çizgi kavramı yok, işaretçi numara
        taşımıyor, anahtarı `country:postalCode` (aynı koddaki iki durak tek noktaya düşerdi).
        `design/pages/admin-teslimat.md`in "sıra gösterilmez" yasağı gerekçesiyle kaldırıldı.
      - **Kısıtlar veride ÖLÇÜLDÜ** (yerel DB, transaction + rollback): yarım nokta · kaynağı olup
        noktası olmayan satır · depo yarım noktası · geçersiz ölçü değeri → dördü de reddedildi;
        motor yazımı elle dizilmiş sıraya çarptı (`manual_order_kept`) ve `force` ile ezildi.
      - Mobil fikstür `stopOrder: null` taşıyor — "sırasız gün" ekranını besleyen hâl.

    - **BEKLEYEN(11.9):**
      ~~② mobil ekranın `stopSeq`e bağlanması~~ **KAPANDI (31.08 — kullanıcı isteğiyle mobil şerit
      adına yapıldı, o şerit yoğun):** gün ekranı artık saymıyor, `stop.stopSeq`i çiziyor; sıra
      bilinmiyorsa nötr işaret ve **ray çizilmiyor** (çizgi "bu bir sıradır" der, sıra yoksa o cümle
      yalan olur). Durak ekranının navigasyonu motora bağlandı (`maps/dir`) ve `openURL` reddi artık
      YUTULMUYOR — sebebi yazılıyor. Talep dosyaları kapatılabilir.
      ~~③ depo noktasının ops formundan girilmesi~~ **KAPANDI (31.08):** depo formunda enlem/boylam
      alanları var ve **boş bırakılırsa kapı adresten çözüyor** (BAN); doluysa operatörün değeri
      kazanır — otomatik çözüm bir başlangıç, son söz değil. Kaydı ENGELLEMİYOR: çözülemezse nokta
      `null` kalır ve tesis yine açılır (bir koordinat yüzünden depo açılamaması, koordinatsız bir
      depodan pahalı). Harita üstünde görsel onay Aşama 3'e (`route-map` üçlüsü) bırakıldı — aynı
      altyapıyı istiyorlar.
      ~~④ `geocode.testkit.ts` tüketicisiz~~ **KAPANDI (31.08):** `fakeGeocoder`, taramanın servise
      DÖRT alan gönderdiğini — müşteri adı ve telefonunu GÖNDERMEDİĞİNİ — çalışma anında çivileyen
      testte kullanılıyor. Kova sayımı bilerek ölçülmüyor: yazmaya bağlı, o yarı entegrasyonun işi.
  - **Durum (31.08d) — DOKÜMAN BORCU KAPANDI:** `BACKLOG §(a)` üstü çizildi (hâlâ *"sıra ölçütü yok"*
    diyordu — kodu yalanlıyordu), `DOMAIN §6`ya durak sırasının iş kuralı, `INTEGRATIONS`a coğrafi
    kodlama bölümü, `design/pages/{kurye-gun,app-kurye}.md`ye sırasız gün hâli ve YOKLAR ayrımı
    yazıldı.

## Netleşecekler

- **İmza yakalama tekniği:** ekran imzası mı, foto mu, ikisi de mi — sahada (eldiven/soğuk) hangisi güvenilir; tasarım+pratik test sırasında kesinleşir.
- **Offline dayanıklılık:** sahada bağlantı kesilirse teslim işaretinin nasıl tutulup senkronlanacağı — kapsam kararı (basit tutulabilir).
