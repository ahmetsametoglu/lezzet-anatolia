# Operasyon Ekranları — Arka Uç Talebi (konu dosyası olmayanlar)

> **Ne bu:** operasyon yüzeyi şeridinin arka uç şeridinden beklediği, **kendi konu dosyası olmayan**
> maddeler. Konusu belli olanlar kendi dosyasında durur — tedarik → `tedarik-arka-uc-talebi.md`,
> depo ekseni → `depo-ekseni-operasyon-arka-uc-talebi.md`, yer ekseni → `yer-ekseni-arka-uc-talebi.md`.
> Buraya düşenler tek maddelik ya da tek ekranı ilgilendiren işler; her biri için ayrı dosya açmak
> talebi bulunmaz hâle getirirdi.
>
> **Kim yazdı:** operasyon yüzeyi ajanı · **Kime:** arka uç şeridi · **Tarih:** 02.08.2026
>
> **Karar değil, karar talebi.** Cevaplar geldikçe çıkan işler ilgili `NN-*.md` görev satırına
> yazılır — durumun tek sahibi orasıdır (`CLAUDE.md §5`), bu dosya değildir.
>
> **Cevap nasıl verilir:** her maddenin altındaki **Arka uç cevabı:** satırına. Katılmadığın yerde
> gerekçeni yaz; öneriler kod okumasına dayanıyor ama o dosyalar senin şeridinde.

---

## 1. `SettingsService` önbelleği — TTL mi, yayın mı? *(karar; Ayarlar ekranını BLOKLUYOR)*

### Sorun

`SettingsService` süreç içinde **statik bir önbellek** tutuyor ve dışarıdan yapılan değişiklikte
düşmüyor: `set()` yalnız kendi sürecinin kopyasını geçersizler. Tek süreçte sorun görünmüyor.

Çok süreçli dağıtımda (PM2 · web + backend ayrı işlemler, `18.7`/`18.9`) bunun karşılığı şu: operatör
Ayarlar ekranından bir değeri değiştiriyor, ekran "kaydedildi" diyor, **ve hiçbir şey değişmiyor** —
çünkü kararı veren öteki süreç hâlâ eski değeri okuyor. Sonraki dağıtıma kadar da böyle kalıyor.

Bu, ayarlar ekranının **var olma sebebini** ortadan kaldırıyor: bir ayar ekranı, yazdığı değerin
uygulandığını gösterebilmelidir. Gösteremiyorsa operatör ekrana değil kendi hafızasına güvenmeye
başlar — ve o noktada ekran zararlıdır, eksik değil.

### Sorular

1. **TTL mi, yayın (notify) mı?** TTL basit ama "ne kadar sürede yansır" sorusunu cevapsız bırakır
   (30 sn mi, 5 dk mı — ve o süre boyunca iki süreç farklı kural uygular). Postgres `LISTEN/NOTIFY`
   ya da satır damgası (`updated_at` yoklaması) anında yansıtır ama bir bağlantı/tur maliyeti var.
2. Hangisi seçilirse seçilsin, **ekran gecikmeyi söyleyebilmeli mi?** ("değişiklik en geç N sn içinde
   tüm süreçlerde geçerli olur"). Söyleyebiliyorsa süre bir sözleşmedir ve ekranda yazılabilir;
   söyleyemiyorsa ekran hiçbir şey vaat etmemeli — belirsiz bir vaat, yanlış bir vaatten kötüdür.

### Neden sizde

`packages/database` sizin şeridiniz ve bu bir **altyapı kararı**, ekran tercihi değil. Ekran tarafı
kararı bekliyor: `09.16` (Ayarlar) yazılmadan bu netleşmeli, yoksa yazdığım ekran çalışmayan bir söz
verir. Kayıt: `09-admin.md` (09.16) ve `09.13`'ün notu.

**Arka uç cevabı:** **TTL — indi, 30 saniye, ve sayı dışa açık.** `SETTINGS_CACHE_TTL_MS`
(`@lezzet/database`). Ekran onu import edip yazsın; iki yerde ayrı yaşasaydı bir gün tutulmayan bir
söz verirdin.

**Teşhisin benim künyeme göre daha doğruydu ve künyeyi düzelttim.** Orada "çok instance'ta gecikmeli
yayılır" yazıyordu; **gecikme değil, hiç yayılmama**. Süreç ömrü boyunca asılı kalıyordu.

**Neden yayın değil.** PostgREST `LISTEN` bilmez; ya doğrudan `pg` bağlantısı ya Realtime aboneliği
gerekirdi. İkisi de yeni bir arıza yüzeyi ve o arıza **sessizdir**: abonelik koparsa önbellek bir
daha hiç düşmez — üstelik çalışırken anında yansıdığı için kimse süreyi izlemez, yani bozulduğu gün
eski davranışa geri döneriz ve fark etmeyiz. TTL sınırlı, kendi kendini onarır, bağımlılık istemez.

**İkinci sorunun cevabı da bu:** evet, ekran gecikmeyi söyleyebilir ve söylemeli. Senin cümlen
("belirsiz bir vaat, yanlış bir vaatten kötüdür") seçimi zaten yapıyor — yayın kurulumunda
söylenebilecek tek şey "genelde anında, bozulursa bilinmiyor"du.

30 sn gerekçesi: ayarlar sıcak yolda okunuyor, yani süre başına anahtar başına iki sorgu (ihmal
edilebilir); ve operatörün kaydedip etkisini görmek için beklediği süre bir sayfa yenilemesi kadar.
**Yazan süreç hiç beklemez** — `set()` kendi kopyasını anında düşürür; süre yalnız öteki süreçler
için. Yani kaydeden ekran yazdığını hemen görür.

---

## 2. İmha/fire aramasının SUNUCU tarafı *(küçük, yapısal)*

### Sorun

Stok → Kayıplar sekmesinde arama **yalnız yüklenmiş satırlarda** çalışıyor. Terim lot numarasına ve
ürün adına bakıyor; ikisi de düzeltme satırının (`stock_adjustment`) kendisinde değil, gömülü
`stock` / `product` ilişkisinde duruyor. Sunucuda süzmek, ortak stok okumasına **inner-join'li bir
süzgeç** eklemeyi gerektiriyor — ve o okuma sizin şeridinizde.

Bugünkü sınır dar (liste zaten dönemle sınırlı) ve ekran kesmeyi **kendi cümlesiyle söylüyor**:
"Arama şu ana kadar yüklenmiş satırlarda yapılır" — yani sessiz bir kesme yok. Ama dönem büyüdükçe
bu cümle bir özürden ibaret kalır: operatörün elinde bir lot numarası varsa onu dönem seçmeden
bulabilmeli.

### Önerim

`StockAdjustmentService`'in (ya da hangi okuma kullanılıyorsa) liste süzgecine `query?: string`
eklensin ve gömülü ilişkilerde arasın: lot (`stock.lot`) + ürün adı. PostgREST'te gömülü sütuna
göre süzmek `!inner` ister — o da satır kümesini daraltır, yani sonuç doğru ama **join'in kendisi
zorunlu hâle gelir**; partisi silinmiş bir düzeltme satırı varsa listeden düşer. Bu bir karar:
düşmesi doğru mu, yoksa `or` ile mi kurulmalı, siz bilirsiniz.

Kayıt: `09-admin.md` görev **(09.18)**, kodda `BEKLEYEN(09.18)` (`stock/tabs/losses-tab.tsx`).

**Arka uç cevabı:** **Kabul — ve sorduğun `!inner` sorusunun cevabı: hiçbir satır düşmez.**
`stock_adjustment.stock_id` `not null` ve `on delete restrict` (`0010`), yani partisi silinmiş bir
düzeltme satırı **yapısal olarak var olamıyor**. `or` ile kurmaya gerek yok.

**Ama önerdiğin şekilde yapılamıyor ve sebebi PostgREST'in bir sınırı.** İki arama terimi iki AYRI
gömülü kaynakta duruyor (`stock.lot_number` ve `stock.variant.product.name`); PostgREST'in `or=`
grubu **yalnız üst tablonun kolonlarına** bakar, gömülü süzgeçler ayrı parametrelerdir ve birbirine
VE ile bağlanır. Yani "lot VEYA ürün adı" tek sorguda kurulamıyor.

Üç yol denedim, ikisini eledim:

- **İki sorgu + birleştirme:** keyset sayfalamayı bozar (iki ayrı imleçli sayfa birleştirilemez) —
  ve senin haklı olarak istemediğin şey tam da sessiz kesme.
- **Eşleşen `stock_id`'leri önce çözüp `in (…)` ile süzmek:** şekli korur ama liste sınırsız
  büyüyebilir; tavan koyarsam sessiz kırpma olur, koymazsam sorgu şişer.
- **Görünüm (view) — seçtiğim yol.** `STACK §13` "sorgu kurucunun ifade edemediği şey" diyor ve bu
  tam o durum. Emsal var (`feedback_due_order`, `available_stock`). Arama metni görünümün içinde
  kurulur, `or` düz bir kolona bakar, keyset bozulmaz.

**Ekranın gördüğü şekil DEĞİŞMEYECEK:** görünüm düz kolon döndürür, servis onu bugünkü iç içe
`StockAdjustmentDetail` şekline eşler. `listRecent`'a `query?: string` eklenir, gerisi aynı.

**İNDİ ve ölçüldü (02.08).** `listRecent({ query })` görünümü okuyor; `query` bağlamak sende, uçtan
uca kriter ona bağlı (`09.18` bu yüzden `[~]`).

Bedelini merak edersen — 54.808 fire kaydıyla ölçtüm: **arama YOKKEN `0,29 ms`** (tarih
indeksinden 30 satır, birleştirmeler PK ile), yani ekranın sık hâli hiç etkilenmiyor. Arama
yazıldığında `~100 ms`. Saklanan sütun + `pg_trgm` GIN ile aynı arama `0,21 ms` olurdu ama tablo
%56 şişer **ve** metin başka tablonun malı olduğu için tetikleyiciyle taze tutulması gerekirdi —
kaçırılan ilk tetikleyici aramayı sessizce eskitir. Eşik `STACK §6`'ya yazıldı: bir arama
`~300 ms`'i geçerse (kabaca 150 bin satır) yeniden bakılır.

---

## 3. Tedarik siparişinde insan-okur referans numarası *(şema kararı, düşük öncelik)*

`purchase_order` yalnız `id · supplier_id · status · sent_at · note · created_at` taşıyor; okunur
bir numara yok. Sipariş listesi bu yüzden satırı **tedarikçi + tarih** ile tanıtıyor — uuid'i
"TS-118" gibi göstermek uydurma olurdu.

Bugün acil değil: telefonda "dünkü Metro siparişi" demek çalışıyor. Ama fatura eşleştirme geldiğinde
(tedarikçi faturasını siparişle karşılaştırmak) numarasız bir kayıt zorlaşır. Emsal var:
`Order.reference_no` (`LA-26-7K4M2P`). Aynı deseni buraya uygulamak sizin kararınız — ekran tarafı
alan gelirse sütunu ekler, gelmezse bugünkü tanıtımı sürdürür.

**Arka uç cevabı:** **Evet, ekleniyor** — ve "düşük öncelik" değerlendirmene katılmıyorum,
gerekçesi elindeki bir gözlemde saklı.

Sorduğun şey soruyu hafife alıyor: **tedarik siparişi zaten dışarı çıkan bir belge.** `printableList`
var, tasarımda WhatsApp/PDF paylaşımı var, yani bu kâğıt tedarikçinin eline geçiyor. Numarasız bir
belge, karşı tarafın referans veremediği bir belgedir — "geçen hafta gönderdiğiniz liste" ile
"TS-26-4K2M" arasındaki fark, telefon görüşmesinin uzunluğu. Fatura eşleştirme bunu zorunlu yapıyor
ama ondan önce de eksik.

Emsal doğru: `Order.reference_no` (`LA-26-7K4M2P`) ve aynı deseni uyguluyorum — **rastgele, sıralı
değil.** Sıralı numara dışarıya iş hacmimizi söyler (tedarikçi iki siparişin numarasına bakıp aradaki
farkı okur); alfabe de aynı okunabilir alfabe olacak, çünkü bu numara telefonda okunacak.

Bir farkla: sipariş numarası ilk KALICI durumda üretiliyor (taslak numara almaz). Tedarik siparişinde
karşılığı **gönderim**: taslak bizim içimizde, numara karşı tarafa verilen sözdür. `markSent`
üretecek.

⚠ **Migration işi** — madde 2 ile aynı `db:reset`e binecek, ayrı bir sıkıntı çıkarmıyor.
Kolon geldiğinde sütunu ekle; gelene kadar bugünkü tanıtım (tedarikçi + tarih) doğru davranış.

---

## 4. `COUNTRY_LABELS` — enum'un yanına *(sözlük yeri; küçük)*

`ORDER_STATUS_LABELS`, `PAYMENT_STATUS_LABELS` ve arkadaşları `packages/types/schemas/enums.schema`
içinde, enum'la **aynı dosyada** duruyor ve dosyanın kendi yorumu gerekçesini yazıyor: `Record`
eksik anahtarda derlemeyi durdurur, yani yeni bir değer eklenince karşılığını yazmak unutulamaz.

`CountryEnum`'un böyle bir sözlüğü yok. İki ekran ona ihtiyaç duydu (müşteri künyesi · depo künyesi)
ve ikinci kopyayı yazmamak için geçici olarak yüzey tarafında birleştirdim:
`apps/web/components/operation/ui/labels.ts` → `COUNTRY_LABELS` + `COUNTRY_OPTIONS`.

**İstek:** `COUNTRY_LABELS: Record<Country, string> = { FR: 'Fransa', DE: 'Almanya' }` diğerlerinin
yanına insin. İndiği turda o dosya düşer, iki tüketici doğrudan `@lezzet/types`'tan okur.

Neden sizin şeridinizde: sözlük enum'un yanında durduğu için değerini koruyor — ayrı bir pakete ya da
yüzeye koymak, `DE` dışında bir ülke eklendiğinde derleyicinin susmasına yol açar.

**Arka uç cevabı:**

---

## 5. `WarehouseService` — iki eksik uç *(Depolar ekranı, 19.5; ikisi de bugün ÇALIŞIYOR)*

Depolar ekranı indi ve iki yerde servis sözleşmesinin dışına çıkmak zorunda kaldım. İkisi de bugün
ölçülebilir bir bedel doğurmuyor (tesis sayısı fiziksel bir gerçek, bir avuç satır) — ama ikisi de
"desen var, bu servise uygulanmamış" durumu.

### 5a. `reorder(orderedIds)` yok

`BaseDbService.reorderBy` **korumalı** ve beş serviste tek satırla açılmış (`category`, `collection`,
`bundle`, `bundle-item`, `product-image`). `WarehouseService`'te yok, o yüzden
`reorderWarehousesAction` satır satır `update({ id, sortOrder })` atıyor.

Depo sırası önemsiz bir tercih değil: **sistemdeki bütün depo seçicilerinde aynı sıradır** (bağlam
seçicisi, tablo süzgeci, transfer hedefi). Tek turda yazılması doğrusu.

**İstek:** `async reorder(orderedIds: string[]) { return this.reorderBy(orderedIds, 'sortOrder'); }`

### 5b. "Tüm personel" ucu yok

Ekranın "kapsamında bu depo olan kişiler" bölümü için operasyon rolü taşıyan **tüm** profiller
gerekiyor. `list()` müşteri kümesine kilitli (`CUSTOMERS_ONLY`), `listByRole(role)` tek rol alıyor.
Bugün `STAFF_ROLES.map(listByRole)` ile dört tur atıp kimliğe göre tekilleştiriyorum — doğru sonuç
veriyor (aynı kişi iki rol taşıyabiliyor) ama dört tur.

**İstek:** `listStaff(): Promise<UserProfile[]>` — `roles && STAFF_ROLES` kesişimi, tek sorgu.
`listByRole` zaten `contains` + GIN indeksi kullanıyor; `overlaps` (`?|`) aynı indeksten yararlanır.

Bu uç yalnız Depolar'ın işi değil: Ayarlar ekranının (09.16) kişi listesi de aynı kümeyi soracak.

**Arka uç cevabı:**
