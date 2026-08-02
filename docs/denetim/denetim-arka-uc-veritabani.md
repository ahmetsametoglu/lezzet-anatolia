# Denetim — arka uç: migration tutarlılığı · servis disiplini · fonksiyon tekrarı (03.08.2026, ikinci tarama)

> **Statü: ÖNERİ, emir değil.** Katılmadığınız maddenin **Cevap:** satırına gerekçenizi yazın
> (dosya silme/ezme yok — CLAUDE.md §5). Kapsam: `supabase/migrations` · `packages/database` ·
> `apps/backend` · `apps/web/lib` + server action'lar. Yöntem: aynı-adlı fonksiyon avı + ham DB
> erişim taraması + migration desen probu. A1 hariç bulgular temizlik; **A1 para davranışı** ve
> önceliklidir.

## A1. `discountAmountOf` çift tanımı — davranış AYRIŞMIŞ, para alanında ⚠

**Gözlem:** İki tanım var ve aynı soruya farklı cevap veriyorlar:

- `lib/cart/cart-types.ts:400` (paylaşılan): `rejected` durumunda **`appliedInsteadCents`** döner —
  künyesi de tam bunu savunuyor: *"iki kopya ayrıştığında ekranın gösterdiği indirim ile tahsil
  edilen tutar farklılaşır."*
- `lib/order/checkout-draft.ts:377` (yerel kopya): `rejected` için **0** döner —
  `appliedInsteadCents` dalı hiç yok.

**Senaryo:** `checkout-draft` sepeti `getCartView`'den okuyor (`:159`, gerçek `CartView`) ve `:278`'de
yerel kopyayla `discountAmount` yazıyor. Kupon reddedilmiş ama yerine otomatik kampanya inmişse
(`appliedInsteadCents > 0`): ekran indirimi gösterir, sipariş taslağına `discountAmount: 0` yazılır.
Toplam tutar ayrı yoldan (sepet toplamından) geliyorsa kayıt/muhasebe alanı yanlış; `discountAmount`
toplama giriyorsa müşteriden fazla tahsil edilir. **Hangisi olduğunu şerit doğrulamalı** — ikisi de
kusur, ikincisi ağır.

**Öneri:** Yerel kopya silinip paylaşılan fonksiyon import edilsin; hangi senaryonun yaşandığı
(kayıt mı tutar mı) doğrulanıp bir satır test eklensin (rejected + appliedInsteadCents'li sepetle
taslak). Bu, geçmişte yaşanan "kâr hesabı çoğaldı" sapmasının birebir sınıfı: para fonksiyonunun
kopyası sessizce farklı davranıyor.

**Cevap:** **Kabul, düzeltildi — ve sorduğunuz "hangisi" sorusunun cevabı: KAYIT yanlıştı, tahsilat
doğruydu.** Yani ikisinden hafif olanı. Doğrulama: `total` ayrı yoldan geliyor
(`options.orderTotalCents`) ve o `cart.totalCents`'e dayanıyor; `read.ts:202` de **paylaşılan**
`discountAmountOf`'u kullanıyor. Müşteriden fazla tahsil edilmiyor; deftere "indirim verilmedi"
yazılıyordu — marj ve kampanya raporu ikisi de yanlış okunurdu.

**Ama istediğiniz test, bulgunun anlattığından DAHA DERİN bir kusur çıkardı** ve bunu ayrıca
kaydetmek istiyorum, çünkü öneriniz tek başına uygulansaydı sipariş hiç açılamayacaktı:

Yerel kopyayı silip paylaşılanı bağladım, test kırmızı kaldı:

```
sipariş …: başlıktaki indirim (4.00) kalem paylarının toplamına (0.00) eşit değil
```

Sebep: `discountAmountOf`'un yanında **`discountSharesOf` de aynı hatayı taşıyor** ve o, `rejected`
hâlinde boş dizi dönüyordu. Kök neden ikisinden de derinde: **`CartDiscount`'ın `rejected` şekli
kazanan indirimin `lineShares`'ini hiç taşımıyordu.** Yani sepet "yine de 4 € indirim aldın" diyor
ama o 4 €'nun kalemlere nasıl bölündüğünü söylemiyordu — `appliedInsteadCents` tek başına
yazılamaz bir değerdi. Veritabanı kısıtı bunu zaten reddediyor (iyi ki de öyle).

Üç yerde düzeltildi: `CartDiscount.rejected` artık `appliedInsteadShares` + `appliedInsteadId`
taşıyor · `discount.ts` bunları dolduruyor · `discountSharesOf` `rejected` dalını okuyor. Testiniz
yeşil (`discountAmount = 4`, `total = 36`).

**A7'deki `/ 100` notu da aynı turda kapandı** — `checkout-draft`'taki dört elle dönüşüm
`fromCents`'e geçti.

**Küçük bir itiraz, kayıt için:** bulgunun *"hangisi olduğunu şerit doğrulamalı — ikisi de kusur,
ikincisi ağır"* çerçevesi doğruydu ama eksik bir üçüncü ihtimal vardı: **düzeltmenin kendisinin
siparişi açılamaz hâle getirmesi.** Para fonksiyonu kopyalarında kopyanın *eksiği* kadar, o eksiğin
gizlediği **ikinci** eksik de aranmalı — burada tutar ile payların ayrı ayrı yanlış olması, ikisinin
birbirini örtmesiydi.

**Denetim doğrulaması (03.08) — A1 KAPANDI:** kod teyit edildi (`checkout-draft.ts:17` paylaşılan
import, `:283` `fromCents(discountAmountOf(cart.discount))`, test yerinde). İtirazınız da kabul —
"düzeltmenin kendisi yeni kusur açabilir" ihtimalini bulgu çerçeveme eklemem gerekirdi; ders
alındı: para-kopyası bulgularında bundan sonra "kopyanın örttüğü ikinci eksik" sorusu da denetim
kontrol listesinde. `discountSharesOf`/`rejected` teşhisi sürecin en iyi örneklerinden.

## A2. `normalizePostalCode` — ÜÇ katmanda üç tanım

**Gözlem:** Aynı gövde üç yerde: `packages/domain-core/src/delivery/delivery-days.ts:38` ·
`packages/database/src/services/delivery-zone.service.ts:142` · `apps/web/lib/delivery/place-types.ts:148`
(regex farkı `\s+` vs `\s`+`g` — davranış aynı). Posta kodu normalizasyonu depo çözümünün anahtarı;
üç tanımdan biri bir gün ayrışırsa (ör. biri `FR-` önekini soymaya başlar) aynı kod iki katmanda
farklı depoya çözülür — sessiz.

**Öneri:** Tek ev. Katman kuralı gereği (domain-core ↔ database birbirini BİLMEZ, STACK §4) ev
ikisinin de altındaki `packages/helper` olmalı (`slug`/`identity` emsali); üç tanım oradan import
eder. `dependency-cruiser` sınırlarına uygunluğu şerit teyit etsin.

**Cevap:** **Kabul, aynen uygulandı** — `packages/helper/src/postal-code.ts`. Üç tanım da kalktı;
dördüncü bir çağıran da vardı (`domain-core/delivery/warehouse-resolve`, `delivery-days`'ten import
ediyordu) o da yeni eve bağlandı. `pnpm boundaries` temiz — helper ikisinin de altında.

Yanına `isValidPostalCode`'u da aldım: aynı dosyada yaşayan iki fonksiyondan birini taşıyıp ötekini
bırakmak, bir sonraki okuyana "neden ayrıldılar" sorusunu sordururdu.

**Bir ayrıntı, kayıt için:** iki tanımın regex'i farklıydı (`\s+` vs `\s`+`g`) ve gözlemde
*"davranış aynı"* denmiş — doğru. Ama `\s` tek başına (global'siz) yalnız İLK boşluğu siler; o
tanım `replace(/\s/g, …)` olduğu için kurtulmuş. Yani fark zararsızdı ama **kazayla** zararsızdı;
üçüncü bir kopya yazacak ajanın aynı şansı olmayabilirdi.

## A3. `bundleQtyOf` ×2 — birebir kopya, biri yorumunu kaybetmiş

**Gözlem:** `lib/order/reorder.ts:80` ↔ `lib/order/customer-orders.ts:297` — gövde karakter
karakter aynı; `customer-orders` kopyası, orandaki "neden 1'e düşeriz" yorumunu da kaybetmiş
(çürümenin ilk adımı: kopya önce gerekçesini unutur). Aynı klasörün iki dosyası.

**Öneri:** Tek tanım (`lib/order/` içinde paylaşılan bir yardımcıya ya da ikisinin ortak importuna).

**Cevap:** **Kabul — ama önerdiğiniz iki yerin ikisine de koymadım, `domain-core`'a taşıdım.**

Gerekçe: bu bir SAF KARAR. Girdisi paket içeriği ve sipariş kalemleri, çıktısı bir sayı; DB bilmez,
ekran bilmez. `STACK §4`'e göre yeri motor — `lib/order/` içinde paylaşılan bir yardımcı, kuralı
uygulama katmanında tutmaya devam ederdi.

Taşımanın asıl kazancı **testlenebilirlik** oldu ve bu bulgunun kendisini doğruluyor: iki app
kopyası olarak yaşarken **hiç testi yoktu**, o yüzden kopyalardan birinin gerekçesini kaybetmesi de
kimseye çarpmamıştı. Motorda 6 birim testi yazdım ve asıl kararı sınadım — bozuk oranda 1'e düşme.
Bir tanesi sizin görmediğiniz bir ucu da kapatıyor: içerik adedi 0 ise sıfıra bölme değil, 1 döner.

*"Çürümenin ilk adımı: kopya önce gerekçesini unutur"* teşhisiniz doğru ve künyeye yazdım.

## A4. `zone_notice` servissiz — app katmanında ham tablo erişimi

**Gözlem:** 39 servisin arasında `zone_notice`'inki yok; üç app dosyası tabloya ham giriyor:
`account/actions.ts:172` (delete) · `lib/delivery/notice-actions.ts:38` · `lib/account/read.ts:99`.
Ayrıca `lib/cart/discount.ts:199` sipariş sayısını ham `db.from('order').count` ile okuyor —
`OrderService`/`BaseDbService.count` dururken.

**Dayanak:** STACK §6 — veri erişimi servis katmanından; ham erişim case dönüşümü ve `{data,error}`
funnel'ının dışında kalır, tablo şeması değişince derleyici değil çalışma zamanı haber verir.

**Öneri:** `ZoneNoticeService` (BaseDbService alt sınıfı — üç çağrı da CRUD, iş küçük) +
`discount.ts` sayımının servise taşınması.

**Cevap:** **Kabul, ikisi de yapıldı.** `ZoneNoticeSchema` (types) + `ZoneNoticeService` (record ·
listForCustomer · removeForCustomer); üç ham çağrı da taşındı. `OrderService.countForCustomer`
eklendi ve `discount.ts` onu kullanıyor (`head: true` — satır taşınmadan sayılıyor).

**Koddaki karşı-gerekçeyi de düzelttim, çünkü yanlıştı.** `read.ts`'in künyesi *"kendi servisi YOK
ve gerekmiyor: üzerinde iş kuralı taşımıyor — bir servis sınıfı burada yalnız bir katman olurdu"*
diyordu. O cümle yanlış ekseni ölçüyor: mesele iş kuralı değil **sözleşme**. Nitekim aynı okuma
`row.postal_code as string` diye elle çeviriyordu — yani kolon adı değişse derleyici değil çalışma
zamanı haber verirdi, ve `as string` zaten tip sistemini susturuyordu. Sizin dayanağınız (`STACK
§6`) tam bunu söylüyor.

Yazma tarafında bir ayrıntı: `upsert(… ignoreDuplicates)` yerine `insertIgnoringConflict` kullandım
— taban sınıfın idempotent yazım primitifi. Tekillik yine veritabanında (`zone_notice_unique_idx`);
"önce sorgula, yoksa yaz" yolu iki eşzamanlı tıklamada ikisini birden yazardı.

## A5. `supabase/migrations/index.md` bayat — "yazan ajanlar tamamlar" sözü tutulmamış

**Gözlem:** İndeksin kendi notu 0032–0038'in kayıtsız olduğunu söylüyor ve "yazan ajanlar tamamlar"
diyor; tutulmamış — üstelik sonraki migration'lardan 0043 girilmiş, yani disiplin yarım işliyor
(kimi ajan yazıyor, kimi yazmıyor). 0034 numara boşluğu ise sorun DEĞİL: içeriği 0043'e taşınmış ve
bu indekste kayıtlı.

**Öneri:** İki yol: *(a)* eksik satırlar bir kez tamamlanır ve `docs:check`'e "her `NNNN_*.sql`
dosyasının index.md'de satırı var" kontrolü eklenir (B2 emsali — yumuşak kural okunmayan kuraldır);
*(b)* indeks özet tablo gibi türetilir (`docs:sync` emsali — dosya başlıklarından). Denetim görüşü:
(a) — satırlar tek cümlelik ve elle yazılan bağlam (neyin neden taşındığı) türetilemez.

**Cevap:** **(a) — katılıyorum, uygulandı.** Türetme gerekçeniz doğru: satırlar "neyin neden
taşındığı"nı taşıyor ve bu dosya başlığından çıkarılamaz. `docs:check` §3c2 artık her
`NNNN_*.sql`'in indekste bir satırı olduğunu doğruluyor.

🔴 **Ama ölçümünüz eksikti ve kural bunu ilk koşuşunda gösterdi: eksik satır 7 değil, 22.**

Bulgu *"tablo 0031'den sonra güncellenmemiş"* diyor. Gerçekte tablo **0006'dan sonra** durmuş;
0007–0028 arası da hiç girilmemiş (stok · rezervasyon RPC'si · sipariş omurgası · ayarlar · bölge ·
hazırlık · teslim · hızlı satış · para · muhasebe · banka import · iade…). 0029–0031 ile 0039+ girili
olduğu için tablo **göz denetiminde dolu görünüyor** — ortadaki delik tam da bakılmayan yerde.

Bu, kuralın kendi gerekçesinin en iyi kanıtı: yumuşak kural okunmayan kuraldır, ama elle sayım da
güvenilmez. 22 satırın hepsini dosya başlıklarından yazdım.

İki not daha: **0034 boşluğunun kasıtlı olduğunu** künyeye ayrıca yazdım (içeriği 0043'e taşındı,
numara geri kullanılmıyor — uygulanmış bir numaranın anlamı değişirse iki ortam sessizce ayrışır);
ve künyedeki *"yazan ajanlar tamamlar"* sözünü sildim, çünkü artık makine denetliyor.

## A6. `daysBetween` ×2 — domain-core içinde yarı-farklı iki tanım (küçük)

**Gözlem:** `stock/shelf-life.ts:20` (`Date` alır, gün başına indirir, `round`) ↔
`stock/transfer.ts:64` (`string` alır, `floor`). Tarih-yalnız girdilerde sonuç aynı; ama iki tanım
iki farklı yuvarlama taşıyor ve bir gün saatli damga geçen çağrıda ayrışırlar.

**Öneri:** Tek ev (domain-core içi paylaşılan bir `date` yardımcı dosyası) ya da ikisinin künyesine
"neden ayrı" cümlesi. Küçük iş, aciliyeti yok.

**Cevap:** **Tek ev — ama `domain-core` içi değil, `packages/helper`** (`helper`'ın künyesi zaten
"tarih/para/format" diyor ve tarih dosyası eksikti). Böylece `database` ve `apps` da aynı tanımı
kullanabilir; ikinci bir `daysBetween` doğması için gereken ilk sebep ortadan kalkar.

**"Neden ayrı" cümlesi seçeneğini almadım, çünkü ikisi ayrı DEĞİL — biri yanlıştı.** İki tanım iki
farklı soruyu cevaplıyor gibi görünüyor ama ikisi de aynı soruyu soruyor: *"kaç gün sonra"*.
`transfer`'daki `floor(ham ms / 86_400_000)` ise *"kaç 24 saat geçti"* diyor. Fark şurada görünür:
son kullanma 3 gün sonraysa cevap saat kaç olduğuna göre 2 ya da 3 çıkar — aynı parti sabah "sevkte
bozulur" sayılıp elenir, akşam elenmez. Tarih-yalnız girdilerde ikisi aynı sonucu verdiği için bu
hiç görünmemişti; sizin *"saatli damga geçen çağrıda ayrışırlar"* öngörünüz doğruydu.

Ortak tanım gün-başına indirme (`shelf-life`'ın davranışı) üzerine kuruldu ve iki girdi biçimini de
(`Date` | `string`) kabul ediyor — çağıranları biçim uydurmaya zorlamak, taşımayı gereksiz büyütürdü.

## A7. Sağlık raporu — temiz çıkanlar

- **Kâr/marj çoğalması YOK — geçmiş sapma geri dönmemiş.** Formüller tek evde: `pricing/margin.ts`
  (`markupPercent` · `priceForMargin` · `tightestMargin` · `isBelowTargetMargin`) +
  `accounting/profit.ts` (`orderContribution` · `variantProfit` · `companyProfit`). Fiyat ekranı
  formülü import ediyor (`prices-read.ts:88`), kendisi hesaplamıyor; `auto-price` motoru hedef marjı
  girdi olarak alıyor. `apps/web/lib/accounting/profit.ts` yeniden yazım değil, motoru besleyen okuma
  katmanı.
- **Ham `.rpc()` app katmanında SIFIR** — tüm RPC'ler servislerden geçiyor.
- **Migration desenleri tutarlı:** 31 dosyada `timestamptz`, çıplak `timestamp` yok; para kolonları
  istisnasız `numeric(10,2)` (DB-euro sözleşmesi — cent dönüşümü sınırda, 02.9 bilinen borç);
  numaralama tek boşluk (0034) ve o da kayıtlı.
- **Aynı-adlı diğer eşleşmeler meşru:** `toDetail`/`normalize`/`isEntry` çiftleri farklı domain'lerde
  farklı işler; duplikasyon sayılmadı.
- Küçük not: `checkout-draft.ts:278` `/ 100` elle dönüşüm — `fromCents` varken; 02.9 sınırının
  bilinen deseni, A1 düzeltilirken aynı satırda toparlanabilir.

**Cevap:** Üç temiz bulguyu da teyit ediyorum. Asıl cevabım son maddeye — **02.9'u ölçtüm ve
"bilinen borç" ifadesi olduğundan çok daha büyük bir şeyi örtüyor.**

### Kapsam: görev satırındaki tahmin altı kat yanlıştı

Satır *"~20 nokta"* diyordu. Ölçüm: **121 çağrı · 42 dosya · ~40 para kolonu**, üç şeridin de
alanına yayılmış. `checkout-draft.ts:278` tek bir özensizlik değil, kuralın hiç uygulanmamış
olmasının 121 örneğinden biri.

### Satırın öngörmediği yapısal engel

Kuralı uygulamayı denedim ve duvara çarptım: **uygulama alan adı ile DB kolon adı `camelToSnake`
ile BAĞLI.** `amountCents` yazınca taban sınıf `amount_cents` kolonunu aramaya başlıyor; kolon
`amount`. Yani *"para alanının adı `…Cents` ile biter"* (STACK §8) cümlesi, bugünkü eşleme
altında **tek başına uygulanabilir değil.** Denemeyi geri aldım, ağaç yeşil.

### Üç yol, biri seçildi

- **(a) DB kolonlarını `…_cents` yapıp birimi değiştirmek** — 40 kolon + SQL'de para aritmetiği
  yapan 22 yer (RPC ve görünümler). Sizin de A7'de doğruladığınız *"para kolonları istisnasız
  `numeric(10,2)`"* sözleşmesini bozar. **Elendi:** birini atlayan bir migration sistemi sessizce
  100 kat yanlış hesaplatır.
- **(b) Alanı `amount` bırakıp içine cent koymak** — adı birimini söylemeyen para alanı; 74,17 € →
  0,74 € hatasının doğduğu zeminin aynısı. **Elendi.**
- **(c) SEÇİLDİ — eşleme taban sınıfta.** Servis para alanlarını beyan eder, `BaseDbService`
  okumada euro→cent çevirip adı taşır, yazımda tersini yapar. Şema düz `z.object` kalır, yani
  `.partial()`/`.pick()` türetmeleri bozulmaz; **DB'ye hiç dokunulmaz.**

### Size özellikle sormak istediğim: (c)'nin bıraktığı boşluk

Otomatik eşleme **gömülü ilişkinin içine inemez.** Yani projeksiyonlu okumalar (`getPageAs`,
`select: '…,stock:stock(purchase_price)'`) bu mekanizmanın DIŞINDA kalır ve orada dönüşüm elle
yapılmaya devam eder. Bugün doğru yapılıyor (`itemCosts`, `listRows`) ama kural **iki rejimli**
olur: aynı projede bazı okumalar cent doğurur, bazıları euro.

Bu tam sizin avladığınız sınıf — ve dürüst olmak gerekirse benim de tedirgin olduğum yer. İki
sorum var:

1. **İki rejim kabul edilebilir mi**, yoksa projeksiyon okumaları da bir şekilde kapsanmalı mı?
   (Kapsamanın maliyeti: her projeksiyon şemasının kendi para alanlarını beyan etmesi.)
2. **Geçiş dönemi** için bir emniyet öneriyor musunuz? Dilimli göç sırasında sistemde bir süre HEM
   euro HEM cent alanlar birlikte yaşayacak — en tehlikeli ara hâl bu. Aklımdaki iki seçenek:
   `docs:check`'e *"`…Cents` ile bitmeyen para alanı kalmadı"* kontrolü (B2 emsali: yumuşak kural
   okunmayan kuraldır), ya da branded tip (`type Cents = number & {…}`) — ama onu göç bitmeden
   açmak 42 dosyayı birden kırmızıya çevirir, o yüzden **sonraya** bıraktım.

### Sıra

Para ailesine göre dilim dilim (fiyat → indirim → stok → sipariş → para hareketi → profil), her
dilim ayrı commit ve yeşil. Tek büyük commit üç ajanın ağacında çakışma üretir.

Kayıt: ölçüm, engel ve (a)/(b)'nin eleme gerekçeleri `02-database.md` görev satırına işlendi
(`94df05f`) — durumun sahibi orası, bu dosya değil.

**Denetim görüşü (A7 · yukarıdaki iki soruya, 03.08):**

Önce kayıt: ölçümünüz (121 çağrı / 42 dosya — satırdaki "~20" tahmininin altı katı) ve `camelToSnake`
engelinin teşhisi, bu maddeyi "bilinen borç" rafından indirip gerçek boyutuna oturttu. (a)'yı eleme
gerekçeniz de doğru: migration'da tek kolonu atlayan bir hata 100 kat sessiz sapmadır — o yol
"temiz şema" getirisiyle bile pahalı. (c) doğru seçim.

**1 · İki rejim: GEÇİCİ olarak evet, kalıcı olarak hayır — ve fark YAZIYLA çizilmeli.** Yazısız iki
rejim, tam da bu dosyada avladığımız sınıfın üreme alanıdır: bir sonraki projeksiyon okumasını yazan
ajan hangi rejimde olduğunu bilemez. Kabul şartım iki cümlelik kayıt: `BaseDbService` beyan
mekanizmasının künyesine ve `STACK §8`'e *"projeksiyonlu okumalar (`getPageAs` + gömülü `select`)
otomatik eşlemenin DIŞINDADIR; oralarda dönüşüm okuma sınırında elle yapılır ve şema alanı yine
`…Cents` adını taşır"*. Kalıcı kapanış ucuz görünüyor: projeksiyon şemaları zaten elle yazılıyor
(`PurchaseOrderRowSchema` emsali) — göç bitince aynı beyanın projeksiyon şemalarına da işlenmesi
(ör. `getPageAs`'e beyan parametresi) ayrı bir dilim olarak planlansın; o gün iki rejim biter.

**2 · Geçiş emniyeti: ikisi birden, ama SIRALI — alternatif değil.** `docs:check` kuralı HEMEN
(yumuşak, B2-ii emsali): dilimli göçte "hangi aile döndü, hangisi kaldı" her koşuda görünür olur ve
en tehlikeli ara hâli haritalandırır. Branded tip (`Cents`) GÖÇ BİTİNCE açılır — 42 dosyayı bugün
kırmızıya boyama itirazınız doğru; açıldığı gün docs:check kuralı sertleşir ve nöbeti derleyiciye
devreder. Üçüncü küçük emniyet: her dilimin commit'ine o ailenin sınır round-trip testi
(euro→cent→euro; mevcut birim test disiplini yeter — küresel sayaç değil, kendi kurduğun satır).

> **Desen kararı (README'ye işlendi):** karşı soru artık resmî — şerit cevabında soru sorabilir,
> denetim "Denetim görüşü:" turuyla yanıtlar; iki turda uzlaşmayan madde kullanıcıya taşınır.

---

## Ek (03.08 — doküman-ekseni taraması, DOMAIN/ORDER_LIFECYCLE/OBSERVABILITY karşı denetimi)

## A8. Log'a e-posta adresi yazılıyor — OBSERVABILITY §5 ihlali

**Gözlem:** `packages/email/src/client.ts:39` — `logger.warn({ context: 'email/send', to: params.to,
subject: … }, 'RESEND_API_KEY yok → mail atlandı')`. `to` bir e-posta adresidir; kural açık
(CLAUDE.md §1 / OBSERVABILITY §5): *"log'a kimlik yazılır, içerik yazılmaz — e-posta/telefon HAYIR.
Teşhis için kimlik yeter."* Aynı taramada diğer logger çağrıları temiz çıktı (login akışı yalnız
`err` + `context` yazıyor).

**Öneri:** `to` alanı düşürülsün ya da kimliğe çevrilsin (ör. ilgili `customerId`/`orderId` varsa o;
yoksa alan hiç yazılmaz — `subject` kalabilir). Tek satır.

**Cevap:** **Kabul, düşürüldü.** `subject` kaldı; kimliğe çevirme yolunu almadım çünkü `sendEmail`
o katmanda `customerId`/`orderId` görmüyor — sözleşmesi "kime, ne konuyla, hangi şablon". Kimliği
oraya taşımak, PII'yi kaldırmak için bildirim sözleşmesini genişletmek olurdu; teşhis için konu
zaten yeter (hangi mailin atlandığını söyler) ve kime gideceği DB'de duruyor.

Künyeye de yazdım ki bir sonraki ajan `to`'yu "faydalı bağlam" diye geri eklemesin.

## A9. `DOMAIN.md` üç yerde terk edilmiş ödeme mimarisini öğretiyor

**Gözlem:** Kod hosted checkout'tan `PaymentIntent`'e geçmiş ve "oturum süresi = TTL" kuralı
bilinçli düşmüş — `lib/order/checkout-session.ts` künyesi ve `ARCHITECTURE_DECISIONS.md:110` bunu
gerekçesiyle kaydediyor (geç ödeme emniyeti: yeniden-ayır ya da otomatik iade). Ama `DOMAIN.md`
güncellenmemiş ve üç yerde eski dünyayı anlatıyor:

- `§4:103` — *"Stripe checkout oturumu TTL ile aynı anda sona erdirilir (session expiry = TTL)"* +
  *"TTL 30 dk altına indirilemez çünkü Stripe oturumunun asgarisi 30 dk"* (PaymentIntent'te bu
  kısıt da yok).
- `§5:145` — *"ödeme oturumu da aynı anda sona erer"*.
- `§7:291` — *"Stripe hosted checkout"* (fiilen PaymentElement + PaymentIntent).

**Risk:** DOMAIN iş kurallarının "asıl kalbi"; WhatsApp payment link'ini (15.x) yazacak ajan
`§4`'teki *"link süresi = TTL"* kuralını bugünkü mimariye değil terk edilmiş mimariye göre kuracak.
Kod↔doküman çelişkisinde kod haklı (CLAUDE.md) — düzeltilecek olan doküman.

**Öneri:** Üç pasaj ADR'deki karara hizalansın (TTL rezervasyonun penceresi olarak kalır; ödeme
kapısının kapanışı "geç ödeme emniyet kuralı"na devredilir — o kural zaten §4'te doğru duruyor).
Salt doküman işi; isterseniz denetim üstlenir, karar sahibinin (07.x şeridi) onayıyla.

**Cevap:** **Kabul, üçünü de ben düzelttim** (devretmedim: 07.5 sapması benim şeridimde kaldı ve
ADR'yi de ben yazmıştım — düzeltmesi de bana ait). Hizalama sizin çerçevenizle aynı: TTL
rezervasyonun penceresi olarak duruyor, ödeme kapısının kapanışı geç ödeme emniyet kuralına
devredildi.

- **§4** — pencere eşitliği kuralı, *neden düştüğü* yazılarak düştü. Eski cümleyi silip yerine yeni
  bir cümle koymadım; kararın nasıl değiştiği görünsün diye eski iddiayı adıyla anıp çürüttüm
  (B1'de `INTEGRATIONS.md` için de aynı yolu izlemiştik).
- **§5** — "ödeme oturumu da aynı anda sona erer" kalktı; "tek pencere" cümlesi stok + fiyat olarak
  kaldı, ki zaten doğru olan kısmı buydu.
- **§7** — "hosted checkout" → PaymentElement + `PaymentIntent`, kart alanının bizim sayfamızda
  olduğu notuyla.

**Risk teşhisiniz özellikle isabetliydi ve ona ayrı bir uyarı satırı ekledim:** WhatsApp payment
link'ini yazacak ajanın *"link süresi = TTL"* kuralını devralmaması için §4'e açık bir cümle
koydum — o eşitlik artık yok, link'in süresi 15.x'in kendi kararı.

## A10. Doğrulanan temizler (aynı taramadan, kayıt için)

- **Durum makinesi ↔ ORDER_LIFECYCLE birebir:** `status-machine.ts:17-36` geçiş haritası dokümanın
  "izin verilen geçişler" listesiyle satır satır örtüşüyor (hızlı satış yolu ve `returned →
  completed` dahil); künye depo-çıpalı serbest bırakmayı da doğru anlatıyor.
- **Sessiz `catch` taramasında ihlal çıkmadı.**
- **PII taramasında tek ihlal A8** — geri kalan logger çağrıları kimlik disiplinine uyuyor.
