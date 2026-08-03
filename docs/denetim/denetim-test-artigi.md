# Denetim — DB'de artık bırakan testler (03.08.2026)

> **Statü: ÖNERİ, emir değil.** Katılmadığınız maddenin **Cevap:** satırına gerekçenizi yazın;
> karşı soru serbest (ikinci tur deseni). Soru: entegrasyon testleri paylaşılan yerel Supabase'i
> temiz bırakıyor mu? Yöntem: **ampirik ölçüm** — 21 test grubu `with-test-lock` kuyruğunda tek tek
> koşuldu, her grubun öncesi/sonrası tüm tabloların KESİN satır sayımı alındı; artık gösteren
> gruplar ikinci kez koşularak tekrarlanabilirlik doğrulandı (gürültü tekrarlamaz, sızıntı
> tekrarlar). Statik tarama tek başına YETMEZDİ: 74 dosyanın hemen hepsinde `afterAll` var —
> sızıntı temizliğin yokluğundan değil, **kapsam ve sıra hatalarından** geliyor.

## Ölçüm özeti — tam paket başına birikim

İki bağımsız koşuda birebir tekrarlayan artıklar:

| Grup | Artık (koşu 1) | Artık (koşu 2 — doğrulama) |
|---|---|---|
| `lib/courier` | `money_movement +31 · account +5` | `money_movement +16 · account +3` |
| `lib/order` | `money_movement +3` | `money_movement +2` |
| `lib/stock` | `stock_intake +9 · supplier +1 · warehouse +1 · document_counter +2` | birebir aynı |
| diğer 17 grup | temiz | temiz |

Birikim gerçek: `money_movement` bu denetim oturumunun koşuları sırasında 41 → 187 satıra çıktı.
Bu satırlar operasyonun **Kasa ekranında** gerçek hareketmiş gibi görünür — `cleanup.ts`
künyesinin uyardığı "bu kayıt gerçek mi test mi" durumu bugün fiilen yaşanıyor.

## R1. Para grafiği sızıntısı — üç kurye dosyası hareketi HİÇ silmiyor ⚠

**Gözlem:** `courier/delivery.test.ts` · `courier/day.test.ts` · `courier/day-close.test.ts` —
üçü de damgalı kasa açıyor (`Kurye/Kapı/Kapanış kasası ${stamp}`), `confirmDoorDelivery` /
`recordOrderPayment` ile hareket yazıyor, ama `afterAll`'da **`money_movement` silme adımı yok**
(day-close'daki `:188` silmesi senaryonun parçası, temizlik değil). Zincir şöyle kopuyor:

1. `afterAll` siparişi siler → `money_movement.order_id` **`on delete set null`** ile koparılır
   (hareket artık siparişten bulunamaz).
2. `afterAll` hesabı siler → `money_movement.account_id` **`on delete restrict`** engeller —
   ve Supabase `delete()` hatayı FIRLATMAZ, sonuç nesnesinde döndürür; kimse bakmadığı için
   teardown **sessizce** yarım kalır.
3. Sonuç: koşu başına ~15-30 hareket + 2-5 kasa hesabı kalıcı olarak birikir.

**Dayanak:** §4b ("testler kirletmez") + `cleanup.ts` künyesi (silme SIRASI tek yerde tutulmalı;
"sıra yanlışsa teardown sessizce patlar ve kirlilik birikir" — birebir bu).

**Öneri:** para grafiği `purgeTestData`'ya girsin: `accountIds` hedefi eklensin ve sıra
**önce `money_movement` (`in account_id`), sonra `account`** olsun. Üç dosya kendi elle silmelerini
bu hedefle değiştirsin. Silme anahtarı olarak `order_id` HİÇ kullanılmasın — `set null` yüzünden
sipariş silindiği anda anahtar buharlaşıyor; doğru anahtar damgalı hesap (quick-sale'in kendi
kasası için zaten doğru yaptığı gibi).

**Cevap:** —

## R2. `quick-sale.test` hesapsız çağrıları DEMO kasasına yazıyor ⚠

**Gözlem:** `quickSale({ … })` altı senaryoda `paymentAccountId` vermeden çağrılıyor;
`quick-sale.ts:125` bu durumda `settings.door_cash_account_id`'ye düşüyor — ve bu DB'de o ayar
**dolu**, demo "Kasa" hesabını gösteriyor. Testin `:195` yorumu "hesap yok, ayar da yok" diye
varsayıyor; ayarı yalnız TEK senaryo (`:190`, `settingsSnapshot.remove`) gerçekten kaldırıyor.
Kalan çağrıların tahsilatı kullanıcının demo kasasına akıyor ve `afterAll` yalnız testin KENDİ
kasasını temizlediği için koşu başına +2-3 hareket demo hesapta kalıyor ("Kapı önü satış | Kasa").

**Dayanak:** §4b "küresel tekil satırı kirletme / önce oku sonra geri koy" — ayar-bağımlı davranış
ancak ayar bilinen bir duruma getirilerek test edilir; `settingsSnapshot` tam bunun için var ve
dosya onu zaten import ediyor.

**Öneri:** hesapsız senaryolar iki gruba ayrılsın: *(a)* "ayar dolu → ayardaki hesaba yazar"
senaryosu damgalı bir test hesabını ayara `settingsSnapshot` ile YAZIP onu kullansın;
*(b)* "ayar yok → tahsilatsız kapanır" senaryosu bugünkü `:190` gibi `remove` ile koşsun.
Demo hesaba tek satır bile yazılmamalı.

**Cevap:** —

## R3. `intake.test` `stock_intake`'i unutmuş — zincirleme üç tablo daha sızdırıyor

**Gözlem:** `receiveGoods`/`receivePurchase` her koşuda 9 `stock_intake` satırı yazıyor;
`afterAll` stok/sipariş/tedarikçi/ürün/depoyu siliyor ama **`stock_intake`'i hiç silmiyor**.
FK'ler `restrict` olduğu için tedarikçi (`:58`) ve depo (`:60`) silmeleri de sessizce başarısız →
koşu başına `stock_intake +9 · supplier +1 · warehouse +1`, artı kabul numaratöründen
`document_counter +2`. Ölçümde iki koşuda BİREBİR aynı rakamlar.

**Öneri:** `purgeTestData`'nın tedarikçi bölümü zaten `stock_intake`'i biliyor (`supplier_id`
üzerinden) — dosya elle silmek yerine `purgeTestData(db, { supplierIds, warehouseIds, … })`
çağırsın; `document_counter` da purge'ün depo bölümüne eklensin (test deposunun sayaç satırı
depoyla birlikte gitmeli).

**Cevap:** —

## R4. Sessiz teardown genel deseni — `delete()` hatası hiçbir dosyada kontrol edilmiyor

**Gözlem:** R1 ve R3'ün ortak kökü: test teardown'larındaki `db.from(x).delete()` çağrılarının
hiçbirinde dönen `error` okunmuyor. `restrict` FK'ye takılan silme, düşen bir test değil,
**görünmez bir hiç** oluyor; kirlilik ancak haftalar sonra sayımla fark ediliyor. Ayrıca düşen
bir dosyanın `afterAll`'u yarım kaldığında da aynı birikim oluşuyor (ölçümde: cent göçü sürerken
düşen `db-services` dosyaları her koşuda `warehouse +1 · document_counter +1` bıraktı — geçici
ama deseni kanıtlıyor).

**Öneri:** `@lezzet/database/testing`'e tek küçük yardımcı: `mustDelete(db, table, filter)` —
silme hatasını fırlatır (teardown'da fırlayan hata vitest çıktısında görünür; sessiz birikim
biter). `purgeTestData` içindeki silmeler de aynı yardımcıdan geçsin. Maliyet düşük, kazanç:
bir daha hiçbir teardown sessiz yarım kalamaz.

**Cevap:** —

## R5. Temiz çıkanlar (kayıt için)

- **17/21 grup iki koşuda da sıfır artık** — merkezi `purgeTestData` + damga deseni geniş ölçüde
  doğru çalışıyor; `feedback`/`ticket`/`identity`/`checkout` gibi en yoğun kurulumlu aileler dahil.
- DB'de duran büyük sayılar artık DEĞİL: `postal_code_place` 16.878 = referans verisi;
  `product_feedback` 83, siparişler, personel/müşteri profilleri = elle girilmiş demo dünyası;
  `system_health_snapshot`/`temperature_log` = dev cron/operasyon kullanımı. Test artığı bunların
  İÇİNE karışıyor (R1-R3) — sorunun asıl maliyeti bu karışma.
- Ölçüm notu: kilit dışı eşzamanlı koşular (başka ajanın o sıradaki tam paketi) ilk turda dört
  grubu kirletti; doğrulama turunda hepsi temiz çıktı. Sayıma dayalı her gözlem için kilit +
  tekrar şart — bu dosyanın rakamları o süzgeçten geçti.

**Cevap:** —
