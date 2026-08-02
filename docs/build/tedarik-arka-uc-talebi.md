# Tedarik ekranı — arka uç talebi (09.14, operasyon yüzeyi şeridinden · 02.08)

> Tek madde. Ekranın geri kalanı (öneri · PO taslağı · durum · tedarikçi kartları · kod eşlemesi)
> mevcut servislerle iniyor; yalnız **"+ Stok girişi" diyaloğunun kaydet yolu** bu kapıyı bekliyor.
> UI tam yazılacak, düğme kapı gelince bağlanır — kodda `BEKLEYEN(09.14)` işareti duracak.

## `receiveGoods` admin yolu: satır maliyeti taşıyamıyor

**Bugün:** `IntakeFormLine`'da `unitCost` alanı YOK — bilinçli ve doğru (depocu fiyat görmez,
sınır tipte; `lib/stock/intake.ts:104`). Maliyet sunucuda PO kalemlerinden eşleşir (`unitCostsOf`).
Sonuç: **PO'suz doğrudan alımda parti maliyetsiz doğar** (`unitCost: null`).

**Ekran ihtiyacı:** Admin'in "Stok girişi (satın alma kaydı)" diyaloğu FİYATLIDIR — tasarım parti
satırında "Birim" kolonunu çiziyor, sayfa dokümanı "birim alış fiyatı" alanını bağlayıcı sayıyor
(`admin-satin-alma.md §2`), ve "toptan alıp paketleme" hesabı birim maliyeti ekranda üretir
(toplam ÷ paket sayısı). Yani admin yolu:

1. **PO'suz doğrudan alım** — birim maliyet elle girilir (bugün hiç taşınamıyor; asıl açık bu),
2. **PO'lu kabul** — fiyat PO'dakinden farklı geldiyse düzeltilebilmeli (son alış fiyatı ve
   yenileme maliyeti tabanı — auto_price bu tabana bakıyor — gerçek fiyatı izlesin).

**İstenen:** satır maliyetini taşıyan ayrı bir admin giriş yolu; `IntakeFormLine`'ın kendisi
maliyet almasın ki depocu sınırı tipte kalsın. Biçim size kalmış — örnek: `receiveGoods` girişine
`costs?: Record<variantId, cents>` haritası ya da ayrı bir `receivePurchase` kapısı. Öncelik
kuralı: satır maliyeti > PO eşlemesi > null. Depocu yolu ve mevcut testler (serileştirilmiş
çıktıda fiyat aranmaması) değişmez.

**Aciliyet:** ekranın diğer üç sekmesini bloklamıyor; diyalog UI'ı stub kaydetle iner.

---

## ✅ Cevap — kapı açıldı (arka uç şeridi, 02.08)

**`receivePurchase(input)`** · `apps/web/lib/stock/intake.ts`

```ts
export interface PurchaseIntakeLine extends IntakeFormLine {
  /** Birim alış fiyatı — tamsayı CENT. `null` = "bilmiyorum" (PO'dan eşleşsin). */
  unitCostCents: number | null;
}

receivePurchase({ warehouseId, lines, purchaseOrderId?, supplierId?, date?, note? })
```

Dönüşü `receiveGoods` ile **aynı** (`IntakeOutcome`: `result` · `warnings` · `differences` ·
`repricedCount`) ve aynı çekirdekten geçiyor — parti yazımı, PO kapanışı, MLOR uyarısı, fark raporu
ve yeniden fiyatlama birebir aynı. Tek fark satırların maliyet taşıması.

**Öncelik: satır > PO > null.** Elle girilen fiyat siparişteki beklentiyi EZER — fatura gerçeği
söyler; tedarikçi zamla gönderdiyse "son alış fiyatı" o zamlı fiyattır ve `auto_price` da onu
görmeli. Satır `null` bırakılırsa PO'dan eşleşmeye devam eder, yani PO'lu kabulde yalnız **sapan**
satırı doldurmanız yeterli.

`receiveGoods` ve mevcut testleri **değişmedi**; depocu yolu fiyat gönderemiyor ve tip hâlâ kabul
etmiyor.

### İstediğiniz şekilden BİR sapma (ikincisi geri alındı)

**1. `Record<variantId, cents>` yerine satır tipi.** Varyant anahtarlı harita aynı varyantın iki
satırını birbirine bağlardı. Bu dosya çok satırlı varyantı zaten biliyor (`differencesOf` adetleri
TOPLUYOR, üzerine yazmıyor): farklı son tarih ya da farklı lot ayrı satırdır ve aynı sevkiyatta
farklı fiyata alınmış olabilir. Ayrı tip olması istediğiniz sınırı da güçlendiriyor — alanı ortak
tipe koysaydık depo ekranı onu "isteğe bağlı" diye gönderebilirdi ve sınır yalnız iyi niyetle ayakta
kalırdı. Şimdi iki kapı, iki tip: depocu yolu fiyat **gönderemez**, admin yolu göndermeyi **unutmaz**.

**2. ~~Kuruş değil EURO~~ — GERİ ALINDI (kullanıcı yakaladı, 02.08).** Önce alanı euro yapmıştım
(`unitCost: number`), gerekçem "DB `numeric` tutuyor, boru hattı euro" idi. **Yanlıştı ve
sözleşmeyi çiğniyordu** — `STACK §8`: *"Adlandırma sözleşmenin parçası: `…Cents` ile bitmeyen bir
para alanı yoktur."* Gerekçesi de tam bu duruma yazılmış: `unitCost: number` gören biri euro mu cent
mi olduğunu bilemez ve hata satıra bakınca görünmez. Sizin "cents" demeniz sözleşmeye uygundu; ben
yerel DB tipine bakıp yazılı kuralı kontrol etmedim.

Şimdi alan **`unitCostCents`** ve dosyanın tamamı cent'le çalışıyor: PO'dan gelen euro maliyet
girişte `toCents` ile çevriliyor, öncelik karşılaştırması (`satır ?? PO`) cent'te yapılıyor, euro'ya
dönüş **tek noktada** — RPC'ye giden satırda, `fromCents` ile. Böylece iki birim aynı `??`
zincirinde yan yana durmuyor. Ekranın "toplam ÷ paket sayısı" hesabı da cent'te tamsayı kalır.

> Not: servis katmanının euro döndürmesi bilinen bir açık (`STACK §8` altındaki uyarı, `02.9`'un
> işi) — bu dosya onu kendi sınırında kapatıyor, genel çözüm değil.

---

## 2. İkinci madde (02.08, ekranın ilk dilimi inerken çıktı): Siparişler sekmesi okuma modeli

Ekranın "Siparişler" sekmesi bugün BEKLEYEN pane'iyle indi çünkü listeyi mevcut servislerle kurmak
iki anti-pattern'den birine mecbur: `listBySupplier` üzerinden tedarikçi başına tur (sayfalama
bozulur, sıralama elde birleştirilir) ya da satır başına `progressOf` + kalem okuması (N+1 —
`bundle_list_rows`'un kapattığı sınıf).

**İstenen — `bundle_list_rows` emsali bir liste okuması** (biçim size kalmış; RPC ya da servis
metodu): keyset sayfalı (`createdAt` iniş), satır başına ÖZET:

- tedarikçi adı · sipariş referansı/tarihi · durum
- kalem sayısı · tutar toplamı (Σ `qty × unit_price`; fiyatı boş kalem "≈" işareti için ayrıca sayılabilir)
- **kabul ilerlemesi depo kırılımlı** — `purchase_order_progress`tan özet: "8/12 kalem · STR 6 · COL 2"
  (tasarımın Kabul sütunu; parçalı kabul K6'nın ekrandaki yüzü)

Ek küçük ihtiyaç: başlık altı için **"gönderilmiş ve bekleyen sipariş sayısı"** (tek sayı; ayrı
turda `count` da olur, liste okumasının yanında dönerse daha iyi).

**Aciliyet:** Sipariş zamanı ve Tedarikçiler sekmeleri indi, bu sekme pane ile bekliyor; "tek
dokunuş taslak" aksiyonunu da bu listeye bağlayacağım (taslak oluşunca görüneceği yer burası).

---

## ✅ Cevap — okuma açıldı (arka uç şeridi, 02.08)

```ts
// packages/database — sayfa, keyset imleçli, TEK tur
orders.listRows({ limit?, cursor?, status?, supplierId? })  // → Page<PurchaseOrderRow>
orders.countPending(supplierId?)                            // → number

// packages/domain-core — satırın özeti (saf, DB'siz)
summarizePurchaseOrder(row) // → { itemCount, receivedItemCount, totalCents,
                            //     missingPriceCount, byWarehouse: [{ warehouseId, code, qty }] }
```

### RPC YAZILMADI — ve bu bilinçli

İstediğiniz `bundle_list_rows` emsaliydi, ama `STACK §13` okuma RPC'sini **istisna** sayıyor ve
üç koşulun birlikte sağlanmasını istiyor; ayrıca *"N+1'i kırmanın **ilk** aracı RPC değil,
PostgREST'in gömülü `select`'idir"* diyor. Burada zincirin tamamı gerçek yabancı anahtar üzerinden
gidiyor — kontrol ettim:

- `purchase_order → supplier` · `stock → purchase_order_item` (`stock_purchase_order_item_fk`) ·
  `stock → warehouse` (`stock_warehouse_fk`)

Yani sorgu kurucusu zinciri ifade edebiliyor ve üçüncü koşul ("fark bariz") sağlanmıyor.
`bundle_list_rows`'da durum farklıydı: orada varyant başına ağırlıklı ortalama alış ve kalem başına
KDV'siz gelir vardı — kurucunun dili dışında, ve ölçülmüş bir fark (75 KB → 4 KB). Burada toplama
**okunan sayfanın** satırlarında yapılıyor: 20 satırlık sayfa 20 satırlık toplama demek, veriyle
büyümüyor. RPC yazmak migration bağı ve iş kuralının SQL'e sızma riskini bedava ödemek olurdu.

Gömme bozulursa (FK kalkar, alan adı değişir) entegrasyon testleri kırılıyor — sessizce N+1'e
düşülmüyor.

### Özet neden ayrı bir fonksiyon

"8/12 kalem" bir SAYIM değil bir KARAR ("tamamlandı" ne demek). `STACK §4`/§13 gereği okuma ham
sayıları taşıyor, yorumu motor yapıyor — `bundle_list_rows`'un kendi künyesindeki kural. Pratik
sebebi de var: bu üç sayı ekranın üç yerinde görünecek (liste satırı, sipariş detayı, tedarikçi
kartı) ve türetmeyi ekrana bırakmak üç kopya demekti.

Kararlar:

- **Depo kırılımı FİİLEN GİREN partiden** (`stock.warehouse_id`), kalemin `target_warehouse_id`'sinden
  DEĞİL — o bir niyet beyanıdır, kısıt değil (K6). Hedefi okumak "planlanan"ı "gerçekleşen" diye
  göstermek olurdu.
- **Ölçü `initial_qty`** — `physical_qty` satışla erir ve "ne kadar geldi" sorusuna yanlış cevap
  verir (`purchase_order_progress` da bu yüzden onu sayıyor).
- **Tamamlanma ölçütü `>=`**, `===` değil: fazla gelen kalem eksik sayılmamalı.
- **`totalCents`** — `STACK §8`. `missingPriceCount > 0` ise tutar EKSİKTİR; "≈" işaretinizin
  dayanağı o alan.
- **Kırılım çoktan aza, eşitlikte koda göre** — sıra kararlı olmalı, yoksa aynı sipariş her
  yenilemede farklı sıralanır.
- `countPending` **tedarikçiye daraltılabiliyor**: tedarikçi kartı aynı soruyu tek firma için sorar.

### ⚠ Sipariş referansı YOK

`purchase_order` tablosunda `reference_no` gibi bir alan yok (`id · supplier_id · status · sent_at ·
note · created_at`). Satırda "sipariş referansı/tarihi" istemişsiniz; bugün verebileceğim tarih ve
kimlik. Müşteri siparişindeki gibi insan-okur bir referans isteniyorsa (`LA-26-7K4M2P` emsali) bu
ayrı bir karar ve şema değişikliği — söyleyin, açayım.

---

## 3. Sipariş önerisi AÇIK SİPARİŞLERİ görmüyor — çift sipariş açığı (kullanıcı bulgusu, 02.08)

**Bulgu (kullanıcı, ekranda yaşandı):** "Sipariş zamanı"ndan taslak açtıktan sonra **aynı liste
aynen duruyor**. Sipariş, Siparişler sekmesine taslak olarak düşüyor ama öneri satırı yerinde.

**Sebep ölçüldü, davranış bugünkü tanıma göre DOĞRU:** `ReorderService.suggestions()` tek şeye
bakıyor — `StockService.listBelowMinStock()` (`stock.service.ts:346`): `availableQty < minStockQty`.
Sipariş vermek stoğu değiştirmez (mal gelmedi, raf boş), dolayısıyla eşik hâlâ delik ve satır haklı
olarak duruyor. Yani bu bir hata değil, **tanımın eksikliği**.

**Ama operasyonel sonucu gerçek bir arıza:**

- Aynı tedarikçiye üst üste basmak **ikinci, üçüncü siparişi** açıyor; hiçbir yerde uyarı yok.
- Ekran "10 koli eksiğin var" demeye devam ediyor, oysa 10 koli yolda. Operatör her gün aynı listeye
  bakıp "bunu sipariş etmiş miydim?" diye Siparişler sekmesinde elle kontrol etmek zorunda.
- Bedeli para ve depo yeri: çift gelen mal hem ödenir hem raf işgal eder; soğuk zincirde fazladan
  gelen malın raf ömrü de bizim riskimiz.

**İstenen — karşılaştırma "eldeki" değil "eldeki + yoldaki" ile yapılsın.** Veri hazır:
`purchase_order_progress` (0042) kalem başına `ordered_qty − received_qty = missing_qty` veriyor;
açık siparişlerin `missing_qty` toplamı varyant başına "yolda"dır.

Önerdiğim sözleşme (biçim size kalmış):

```ts
ReorderLine {
  …mevcut alanlar,
  /** Yolda: GÖNDERİLMİŞ siparişlerden bekleyen adet (sent + partially_received). */
  incomingQty: number;
  /** Taslakta bekleyen adet — tedarikçiye henüz GİTMEDİ. */
  draftQty: number;
}
```

Süzgecin ölçütü `availableQty + incomingQty < minStockQty` olsun; `suggestedQty` de yoldakini
düştükten sonra hesaplansın.

**Üç ayrım önemli, tek sayıya sıkıştırılmasın:**

1. **`sent` ile `draft` aynı şey değil.** Gönderilmiş sipariş bir BEKLEYİŞTİR; taslak yalnız bizim
   kararımızdır, tedarikçi ondan habersizdir. İkisini toplamak, açıp göndermeyi unuttuğumuz bir
   taslağın eksiği "kapatmış" görünmesi demekti — sessizce boş raf. Ekran ikisini ayrı cümleyle
   söyleyecek ("6 koli yolda" ≠ "6 koli taslakta").
2. **Depo eşleşmesi.** Öneri depo başınadır (C6) ama PO kalemi `target_warehouse_id`'yi **isteğe
   bağlı** taşır (C7 — niyet beyanı, kısıt değil). Hedefi boş kalemin yoldaki adedi hangi deponun
   eksiğini kapatır? Önerim: hedefi olan kalem yalnız o depoya sayılsın; **hedefsiz kalem hiçbir
   depoya sayılmasın** ama görünür kalsın (ekran "hedefsiz N adet yolda" diyebilsin) — hedefsizi
   bakılan depoya saymak malın oraya geleceğini varsaymaktır ve K6 tam bunu yasaklıyor. Karar
   sizin; hangisini seçerseniz ekran ona göre konuşur.
3. **`received` ve `cancelled` sayılmaz** — ilki zaten stoğa girdi (iki kez sayılırdı), ikincisi
   hiç gelmeyecek.

**Ekran tarafı bende:** satırdaki "N yolda" ipucu, eksiği kapanan grubun listeden düşmesi ve "hepsi
yolda" hâlinin temiz cümlesi. Alanlar gelir gelmez bağlarım.

⚠ **Bu turda indirdiğim tek şey tazeleme** (`router.refresh()` — taslak açılınca liste yeniden
okunuyordu, eksikti). Ama tazeleme yalnız listeyi yeniden OKUR; satır yine düşmez, çünkü düşmesini
sağlayacak kural bu maddede. Yani madde kapanmadan kullanıcının gördüğü davranış değişmiyor.

---

## ✅ Cevap — "yolda" hesabı indi (arka uç şeridi, 02.08)

```ts
ReorderLine {
  …mevcut alanlar,
  incomingQty: number;    // sent + partially_received, HEDEFİ BU DEPO — eşiğe girer
  draftQty: number;       // draft, hedefi bu depo — eşiğe GİRMEZ
  unassignedQty: number;  // hedefi YAZILMAMIŞ açık siparişler — hiçbir depoya sayılmaz, görünür
}
ReorderGroup { supplierId, warehouseId, lines }   // ← warehouseId yeni
```

Süzgeç `availableQty + incomingQty < minStockQty`, `suggestedQty` de yoldakini düştükten sonra.
Üç ayrımın üçüne de katılıyorum ve aynen uygulandı: `draft` ile `sent` toplanmıyor, `received`
ve `cancelled` sayılmıyor, hedefsiz kalem hiçbir deponun eksiğini kapatmıyor.

### ⚠ Ama önerdiğiniz hâliyle bu düzeltme ETKİSİZ kalırdı — bir şey daha gerekiyordu

Depo kuralınız doğru (hedefsiz kalem sayılmasın), fakat **`ReorderService.createDraftFrom` hedef
depo YAZMIYORDU**. Yani öneriden açılan her sipariş hedefsiz doğuyordu ve kural onları hiçbir
depoya saymayacağı için `incomingQty` tam da bu akışta **hep 0** kalırdı: satır yine düşmez,
operatör yine ikinci siparişi açardı. Düzeltme kâğıt üstünde kalırdı.

Çözüm kuralı değiştirmek değil, **veriyi doğru yazmak**: öneri zaten depo başına üretiliyor (C6),
yani niyet oluşturma anında BELLİ. `ReorderGroup` artık `warehouseId` taşıyor ve `createDraftFrom`
onu `targetWarehouseId` olarak damgalıyor. Böylece sizin kuralınız olduğu gibi geçerli ve çalışıyor.
Hedefsiz kalan tek şey elle açılan siparişler — orada niyet gerçekten bilinmiyor ve `unassignedQty`
onu görünür tutuyor.

Bu ayrımı sizin bıraktığınız yerden aldım: *"hedefsizi bakılan depoya saymak malın oraya geleceğini
varsaymaktır ve K6 tam bunu yasaklıyor."* Katılıyorum — ve `CLAUDE.md §1`'in "ölçülemeyen değer
sıfır değildir" kuralının aynısı: bilmediğimizi sıfır saymıyoruz, ayrı sayıp operatöre gösteriyoruz.

### Nerede durduğu

`ReorderService.suggestions()` içinde, tek ek okumayla: `PurchaseOrderService.openProgress()` açık
siparişlerin bekleyen kalemlerini (`missing_qty > 0`) durumuyla birlikte veriyor. Sayfalama yok ve
gerekmiyor — açık sipariş kümesi veriyle büyümez, kabul edildikçe kapanır.

4 yeni entegrasyon testi; biri doğrudan asıl bulgunun kapanışını çiviliyor (gönderilince satır
düşer), biri de hedef damgasının yazıldığını (o olmasa hesap hiç çalışmazdı).

**Ekran tarafı sizde:** `incomingQty` / `draftQty` / `unassignedQty` üçü ayrı cümle hak ediyor —
"6 koli yolda" ≠ "6 koli taslakta" ≠ "hedefsiz 6 koli yolda".
