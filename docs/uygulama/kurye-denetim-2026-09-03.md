# Kurye akışı denetimi — bulgular (03.09.2026)

Yürünen gün: rota/araç seçimi → araca yükleme → sefer başlatma → duraklar (teslim · kısmi · ret ·
ulaşılamadı · tahsilat) → araçtan satış → araç stoğu → sefer kapanışı → ertesi gün.
Okunan katmanlar: `apps/mobile/src/screens/courier/*`, `apps/mobile-api/src/api/v1/courier.ts`,
`packages/application/src/courier/*`, `order/quick-sale.ts`, `order/delivery`, `0046_delivery_run.sql`,
`ORDER_LIFECYCLE.md`, `DOMAIN §17`. Yerel DB yalnız "hangi durumda ne yazılmış" için okundu.

Sıra önem sırasıdır. Her maddede **Varsayım** satırı benim gerçek dünya kabulüm; yanlışsa madde düşer.

---

## 1 · Sefer başlatınca müşteriye bildirim GİTMİYOR — ekran gittiğini söylüyor

- **Ekran vaadi:** `courier/messages.json:195` "durakları açar · müşterilerine bildirim gider";
  `:191` "Geri alınamaz: bildirim gönderilmiş olur"; `:184` "müşterilere bildirim gönderir".
- **Ölçüm:** `startCourierDay` geçişi doğrudan DB RPC'siyle yazıyor (`courier/day.ts:716`
  `orders.transition`) — uygulama katmanının `transitionOrder`/`effects` yolu değil. Teslim ucu da
  `effects`i bilerek geçirmiyor (`api/v1/courier.ts:474`; `fulfillment.ts:40` port boş → yalnız
  `logger.warn`). `markUndelivered` (`day.ts:1034`) aynı: ret/ulaşılamadı da haber vermiyor.
  `notify.ts:27-28` bu iki durumun (`out_for_delivery`, `delivered`) mail konusu olduğunu söylüyor.
- **Sonuç:** Müşteri "yolda" ve "teslim edildi" haberini mobil yoldan hiç almıyor; kurye ise geri
  alınamaz diye uyarıldığı bir şeyin olmadığını bilmiyor. Web'den "yola çıktım" diyen operatör
  haber gönderiyor, mobilden çıkan kurye göndermiyor — iki yüzey aynı geçişte ayrışıyor.
- **Varsayım:** Bildirim gerçekten isteniyor (notify portu terfi bekliyor, defterde "ayrı
  pozisyon"). İstenmiyorsa metinler yalan söylüyor ve düzeltilmeli.

## 2 · "Sürülen sefer"in iki tanımı var — kenar hâllerde ayrışıyor (kullanıcı düzeltmesiyle ORTA)

- **Düzeltme (03.09):** Normal çok günlük akışta sorun YOK — yarının seferi yarın başlatılır, o gün
  "bugün"dür, tarihler örtüşür. Ayrışma yalnız sefer KENDİ GÜNÜNDEN BAŞKA bir günde sürülürse:
  (a) bir gün önce başlatma (uzak rota, `depart_delivery_run` gün kontrolü yapmıyor),
  (b) kapatmadan gece geçmesi (yereldeki 02.09 seferi bu — test kalıntısı, senaryo değil).
- **Model:** araç ara depo, iki-üç günlük yolculuk (`day.ts:741` künyesi, `routes.ts:91`).
- **Ölçüm:** `readCourierRun` GÜNE bağlı (`day.ts:786-787`, varsayılan bugün). Onu okuyanlar:
  - `quick-sale.ts:155` — araçtan satış sefere ancak seferin `delivery_date`i BUGÜNSE bağlanıyor
    (künye bunu bilerek yazmış: "dünün seferi hiç aday olmaz"). Yolculuğun 2. günü araçtan
    satılan her şey mutabakata girmiyor → kapanış her seferinde FAZLA verir.
  - `openDayClose` `runId`siz dalı (`day-close.ts:53-55`) — 2. günde `run: null`.
  - Yerel DB bunu bugün gösteriyor: `SF-26-MYUXET` 02.09'da çıktı, kapanmadı; `/day` onu sürülen
    sefer olarak veriyor (`readCourierRuns` güne bakmıyor), `readCourierRun` bugün için bulamıyor.
    Aynı soruya iki cevap.
- **Yan bulgu (aynı kök):** gün ekranındaki "kalanları yola çıkar" (`use-courier-day.hook.ts:595`)
  seferin gününü değil BUGÜNÜ gönderiyor. Sürülen seferin günü bugün değilse
  `open_delivery_run(zone, bugün)` **yeni bir sefer satırı açar**, `depart` `another_running` der,
  satır geri alınmaz ("kurma zaten istenen şeydi", `day.ts:631`) → araçta hayalet bir sefer.
  `zoneId` verildiğinde rota o gün koşuyor mu diye de bakılmıyor (`day.ts:584-586`).
- **Sonuç:** Çok günlük yolculuk veri katmanında var, para ve yeniden-başlatma katmanında yok.
- **Varsayım:** İki-üç günlük yolculuk gerçek bir senaryo (kullanıcı 31.08).

## 3 · Sefer başladıktan sonra geç yüklenen kutunun durağı açılamıyor

- **Akış:** Kutusu eksik seferi başlatmak serbest (`departShort`); uyarı "kutusu binmemiş durak
  AÇILMAZ". Kurye kutuyu sonradan rampada okutuyor: `loadBox` yalnız damga yazıyor, geçiş yok
  (`load.ts:13-25`). Durağı `out_for_delivery` yapacak tek kapı yeniden `startCourierDay`.
- **Ölçüm:** O kapıya giden düğme gün ekranında yalnız `canRetryStart` ile çiziliyor
  (`courier-day-screen.tsx:625`), o da yalnız `skipped`/`stale` hâlinde açılıyor —
  `awaitingBoxes` bilerek dışarıda (`use-courier-day.hook.ts:271-275`). Araçtaki seferler ekranında
  sürülen sefer için yalnız "Duraklara git" var (`van-runs-screen.tsx:213-215`), başlat yok.
- **Sonuç:** Teslimat ekranı kutuların hepsini yüklü görüp kapıyı açıyor (`use-delivery.hook.ts:319`
  `loadedOnVan`), sunucu `deliver_order` `ready`den teslim etmediği için `stale` döner ve ekran
  "bu durak başkası tarafından kapatılmış olabilir" der. Durak o gün teslim edilemez.
- **Varsayım:** Eksik kutuyla başlayıp sonra tamamlamak sahada olur (uyarı metni bunu zaten
  varsayıyor).

## 4 · Araç, kurye ve depo bağı tutarsız (tek araç varken görünmüyor)

- Seferler ARACA değil KURYEYE bağlı: "araçtaki seferler" = kuryenin kapanmamış seferleri
  (`day.ts:759`). İki sefer farklı `vehicle_id` taşısa da tek araçta gösterilir.
- Araç tekelliği yok: `open_delivery_run` aracın başka açık seferde olup olmadığına bakmıyor
  (`0046:475-479`), `listCourierVehicles` kullanımda olanı süzmüyor (`routes.ts:254`). İki kurye
  aynı kamyoneti aynı sabah seçebilir.
- Araç DEPOSU kapsamdan çözülüyor, seferin aracından değil (`van-stock.ts:102`
  `vehicleWarehouseOf` "ilk vehicle depo"); `vehicle.warehouse_id` künye, stok yeri değil.
  Devirde (`reassign_delivery_run`) araç stoğu eski kuryenin kapsamında kalır, yeni kurye
  kapsamında VAN yoksa `no_vehicle`.
- Serbest ürünün ÇIKIŞ deposu = kuryenin kapsamındaki İLK tesis (`api/v1/courier.ts:295,337`),
  seferin deposu değil. İki tesisli kuryede yanlış depodan düşer.
- **Not:** Web şeridine `docs/talep/not-web-arac-deposu-filo-kaydiyla-bagli-degil.md` olarak
  02.09'da yazıldı; burada bütün olarak duruyor.

## 5 · Kapanış parayı sayıyor, malı saymıyor

- **Durum (03.09, ikinci tur):** teşhis doğru, YER yanlıştı — bölümler kuryenin kapanışında değil
  depocunun kurye dönüşü ekranında (v3:14 `kuryeDonus`, D6; `BEKLEYEN(21.194)`). Tasarım kuralı:
  ulaşılamayanın kutusu araçta KALIR, yalnız reddedilen iner (aşağıdaki "ghost kutu" cümlesi bu
  yüzden yalnız reddedilen için geçerli). Kapı yazıldı (`courier/return.ts`), uç + ekran depo
  şeridine talep. Kuryeye ek saha adımı yok.

- **Tasarım v3:14:** "SERBEST ÜRÜN — SAY VE DEVRET" (alınan · satılan · dönen · fark) ve
  "KUTULAR — ARAÇTA KALAN" bölümleri. **Kodda yok:** gün ve kapanış ekranlarında serbest ürün/
  kutu sayımı geçmiyor (`courier-day-screen.tsx`, `day-close-screen.tsx` — grep boş); araç stoğu
  ayrı ekranda (`van-stock-screen`) ve isteğe bağlı.
- Kutu damgası kapanışta SİLİNMİYOR: `loaded_at` yalnız `discard_delivery_run` temizliyor
  (`0046:405`). Reddedilen/ulaşılamayan siparişin kutusu kapanıştan sonra da "araçta" yazıyor.
  Sipariş yeniden planlanıp yeni sefere girince `startCourierDay` kutuyu yüklü görüyor ve okutma
  istemeden yola çıkarıyor (`day.ts:706-707`).
- **Sonuç:** Akşam depoya indirilen kutu ertesi sabah sistemde hâlâ araçta; araçta gerçekten
  kalan serbest ürün ise hiçbir mutabakata girmiyor. "Kaybolan mal" tam burada doğar.
- **Varsayım:** Ulaşılamayan siparişin kutusu geceyi depoda geçirir (soğuk zincir); araç stoğu
  her akşam boşaltılmaz ama sayılır.

## 6 · Rota kartının sayaçları siparişin durumuna bakmıyor

- `listRouteOrdersByDate` durum süzmüyor (`order.service.ts:879`): iptal edilmiş ve teslim
  edilmiş siparişler de "durak · kutu · tahsilat" sayısına giriyor (`routes.ts:140-157`).
  `routeHasWork` (`use-courier-day.hook.ts:225`) böyle bir rotayı seçilebilir yapar; claim ise
  iptal/teslimi almaz (`0046:513`) → boş sefer kurulur.
- `collectionCount` vadeli (`on_account`) siparişi tahsilat sayıyor (`routes.ts:146`), durak
  ekranı aynı sipariş için "para konuşulmaz" diyor (`day.ts:903`). Kart "2 tahsilat" der, yolda
  0 çıkar.
- **Varsayım:** Rota kartındaki sayılar "bugün araca binecek iş"i anlatmalı.

## 7 · Kapanış hazırlanmamış ve ulaşılamayan durakları sessizce bırakıyor

- **Durum (03.09, ikinci tur — kullanıcı seçimi: sevkiyatçı karar verir + dürtü):** 16.08 kararı
  korundu. Kapanışta `run_close_pending` personel bildirimi (admin + tesisin depocusu); gün
  cevabında `stranded[]` ve gün ekranında kapısız bir şerit ("kutusu araçta — sevkiyat
  planlayacak"). Web'de satır rotası eşlemesi web şeridine not.

- `open_delivery_run` `confirmed`/`preparing` siparişi de sefere damgalıyor (`0046:513`); bunlar
  gün listesinde durak olarak görünür, hiç yola çıkmaz (`skipped`), kapanış yalnız
  `out_for_delivery` olanı `ready`ye düşürür (`0046:741`). Sefer kapanınca damga kapalı seferde
  kalır; mobilde bir daha görünmez.
- Ulaşılamayan durak (`ready`, `attempts>0`) da ertesi gün mobilde YOK: yeni sefer claim'i
  `delivery_date = bugün` süzüyor; dünün tarihini taşıyan sipariş ancak web'in "askıda"
  kapısıyla (`dispatch-actions.ts:104` `bringForward`, `delivery_date < bugün` şartı) yeniden
  yazılır.
- **Sonuç:** Kurye "yarın tekrar denerim" der, uygulama yarın onu göstermez; sevkiyat masası
  bakmazsa durak askıda kalır. Kapanış cümlesi "yarına devroldu" diyor (`dayClose.released`),
  devir kendiliğinden olmuyor.
- **Varsayım:** Küçük operasyonda sevkiyat masasına her gün bakan biri olmayabilir.

## 8 · Kısmi ret teslimden ÖNCE yazılıyor; teslim düşerse düzeltme geri alınmıyor

- `confirmDoorDelivery`: `adjustFulfillment` (`delivery.ts:147-160`) → `deliverOrder`
  (`:167`). Teslim `stale` dönerse (başka cihaz, kapanış araya girdi) `fulfilled_qty` düşmüş
  kalır, sipariş teslim edilmemiş. Künye yalnız parayı sona aldığını söylüyor; mal için aynı
  güvence yok.
- **Varsayım:** Nadir ama gerçek (kapanış + teslim yarışı 0046:740'ta zaten anılıyor).

## 9 · Kurulmuş seferden çıkarma, web'den yola çıkmış siparişi sahipsiz bırakıyor

- Claim `out_for_delivery` siparişi de alıyor (web'in tekil "yola çıktım"ı, `0046:513`);
  `discard_delivery_run` serbest bırakırken `courier_id = null` yazıyor (`0046:644`), durum
  `out_for_delivery` kalıyor. Artık ne mobil teslim edebilir (`courierId` eşleşmez), ne kapanış
  çözer (sefer yok).
- **Varsayım:** Web'den tekil "yola çıktım" hâlâ kullanılıyor; kullanılmıyorsa madde düşer.

## 10 · Saat dilimi: sunucu UTC günü, cihaz yerel gün

- `/day`, `/routes`, `startCourierDay` günü `toISOString().slice(0,10)` ile (UTC) alıyor
  (`courier.ts:145,194`, `day.ts:548`); cihaz "BUGÜN" etiketini yerel günle kuruyor
  (`day-tag.ts`, künyesi tam bu tuzağı anlatıyor). Yaz saatinde 00:00–02:00 arası iki taraf farklı
  gün söyler; rota penceresi dünden başlar, "bugün" etiketi yarını gösterir.
- **Varsayım:** Gece yarısından sonra rampa işi nadir; kapanış saati ayarı 18:00.

## 11 · Ayar ve besleme tutarsızlıkları (küçük)

- `delivery_proof_required` beslemede `{b2b:false, b2c:false}`; kod varsayılanı ve DOMAIN §6
  B2B'yi zorunlu sayıyor. Yerelde B2B teslimi imzasız kapanıyor — gerçek kurulumda ayar
  girilmezse kod varsayılanı devreye girer, yani yerel test gerçek davranışı sınamıyor.
- `0046` künyesi "araç zorunluluğu `Setting` ile" diyor; öyle bir ayar anahtarı yok
  (`settings`te yalnız `courier_close_time`, o da mobilde okunmuyor).
- `readCourierRuns` son 30 seferi okuyup kapanmamışları süzüyor (`delivery-run.service.ts:67`);
  30'dan eski kapanmamış sefer araçtan sessizce düşer (bugünkü veride 1 sefer, sorun değil).

---

## Doğru bulduğum, dokunulmaması gerekenler (kısa)

- Kanıt → mal → teslim → para sırası ve "eksik girdide hiç yazım yok" kuralı.
- Rota+gün başına tek sefer, yarışın veride çözülmesi, catch-up claim.
- Vadeli siparişte kapıda tahsilat yok; kapıdaki tutar karşılanan mal üstünden.
- Kutu okutmasının yükleme ve teslimde iki ayrı kapı olması; yanlış kutunun rotasını söylemesi.
- Kapanışın fotoğrafı çözümden önce çekmesi; mutabakat farkının işaretli kalması.
