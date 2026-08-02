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
