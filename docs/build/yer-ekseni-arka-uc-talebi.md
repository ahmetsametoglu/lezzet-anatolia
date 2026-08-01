# Yer Ekseni (19.7) — Arka Uç Talebi ve Sapma Önerisi

> **Ne bu:** müşteri yüzeyi şeridinden arka uç şeridine soru + öneri listesi. Karar değil, **karar
> talebi**. Cevaplar geldikçe çıkan işler `19-coklu-depo.md` görev satırlarına yazılır — durumun
> tek sahibi orasıdır (`CLAUDE.md §5`), bu dosya değildir.
>
> **Kim yazdı:** müşteri yüzeyi ajanı · **Kime:** arka uç şeridi · **Tarih:** 01.08.2026
> **Okunacaklar:** `DOMAIN §17` · `design/project/uploads/musteri-yer-ekseni.md` (tasarım sözleşmesi)
> · `19-coklu-depo.md` görev 19.7
>
> **Cevap nasıl verilir:** her maddenin altındaki **Arka uç cevabı:** satırına yazılır. Katılmadığın
> yerde gerekçesini yaz — önerilerim kod okumasına dayanıyor ama senin şeridin, son söz senin.

---

## 0. Bir cümlelik durum

19.1–19.4 kapandı: zincir (posta kodu → bölge → depo) çalışıyor, motorlar hazır, kapılar depo
parametresi alıyor. Müşteri ekranı bu zincire **bağlanamıyor** çünkü zincirin girdisi olan "yer"
tarayıcıda (`localStorage`) duruyor ve sunucu onu göremiyor. Dört `BEKLEYEN(19.7)` işareti aynı
şeyi söylüyor: katalog, anasayfa, ürün detay ve boş sepet sunucuya `null` depo geçiyor.

Bu dosyada **altı istek** var. İlk ikisi yapısal (bunlarsız 19.7 başlamaz), sonraki üçü tasarımda
çizili ama arka ucu hiç olmayan şeyler, sonuncusu bir tasarım sapması onayı.

---

## 1. Ülke artık SORULMUYOR — posta kodundan türüyor *(tasarımdan sapma)*

### İşletme kararı

Kullanıcı (01.08): *"Posta kodu girmeye başladığım zaman posta koduna göre ülke kendi seçilsin
istiyorum… Ülkeye gireyim sonra posta kodunu gireyim çok mantıklı değil. Hatta suistimale bile
açık."*

Tasarım (`K38`, `musteri-yer-ekseni.md §6`) posta kodunun yanına koşullu bir **ülke seçici**
koyuyor. O seçici kalkıyor. Gerekçesi iki katmanlı:

1. **Yanlış soru.** "67000 dünyada hangi ülkede?" sorusunun cevabı yok — FR ve DE ikisi de 5 haneli
   kod kullanıyor, aralıklar örtüşüyor. Ama bizim sormamız gereken soru bu değil: **"67000 BİZİM
   hangi bölgemizde?"** Cevap kendi `delivery_zone_postal_code` tablomuzda duruyor ve küme küçük.
2. **Vergi beyanı riski.** Serbestçe seçilen ülke KDV oranını ve Alman B2B muafiyetini etkiler
   (`DOMAIN §5`). Müşterinin yazdığı bir alanın vergi sonucu doğurması kabul edilemez. Ülke
   **veriden türeyen bir sonuç** olmalı, beyan değil.

### İstenen kapı

Bugün `matchZones(place: PostalCodeRef, zones)` **ülke zorunlu** istiyor
(`packages/domain-core/src/delivery/delivery-days.ts:50`) ve `resolvePlaceAction` bunu `'FR'` diye
sabit yazıyor (`apps/web/lib/delivery/actions.ts`). Ülkesiz bir çözüm yolu yok.

Gereken: **yalnız kodla** çözen, ülkeyi sonuç olarak dönen bir kapı. Kabaca:

```
resolvePlaceByPostalCode(postalCode) →
  | { kind: 'resolved';  country, zoneId, warehouseId, weekdays… }   // tek bölge eşleşti
  | { kind: 'ambiguous'; countries: Country[] }                       // aynı kod iki ülkede
  | { kind: 'outside';   countries: Country[] }                       // hiçbir bölgede yok → kargo
```

Motor tarafında `matchZones`'un ülkesiz bir kardeşi yeterli görünüyor — mevcut imza korunur, yeni
olan "tüm ülkelerde ara" hâlidir. **Tek kaynak bozulmasın:** eşleştirme mantığı ikiye ayrılmamalı
(19.3'te bilinçli olarak tek kaynağa indirilmişti).

### Ülke sorusu nerede kalıyor

Seçici **silinmiyor, ertelenip daraltılıyor.** İki hâlde ve yalnız ikinci ülke açıldığında görünür:

| Hâl | Ne sorulur | Bugün (yalnız FR) |
| --- | --- | --- |
| `ambiguous` | "67000 — Fransa mı Almanya mı?" iki somut seçenek | Hiç oluşmaz |
| `outside` + >1 ülke | Hangi ülkenin kargo deposundan gideceği | Tek kargo deposu var, sorulmaz |
| `resolved` | Hiçbir şey | Normal hâl |

Yani tasarımın "koşullu görünür" kuralı korunuyor; koşul bir **alan** olmaktan çıkıp bir
**belirsizlik** hâline geliyor. Sitenin dili (`fr`/`de`/`tr`) yalnız ön-seçim ipucudur, belirleyici
değildir — Fransızca Belçika ve İsviçre'de de konuşulur, Strasbourg'daki Türk müşteri `tr` seçer.

**Arka uç cevabı:** **Kabul** — ve aynı karar kullanıcıdan bağımsız olarak bana da geldi (01.08,
"önce ülke sonra posta kodu sürtünmeli"). İkiniz aynı yere varmışsınız; seçici kalkıyor.

Üç hâlin **dördü** olacak. Eksik olan: kodun **geçerli olup olmadığı**. Bugün `67x99` yazan müşteri
sessizce "kargo" hâline düşüyor — yazım hatası sisteme geçerli bir yer gibi giriyor. Dördüncü hâl
`unknown`: "Bu posta kodunu tanımadık, kontrol eder misiniz?" Uydurma şehir adı yasağının kardeşi —
bilmediğimizi bilmek.

```ts
resolvePlaceByPostalCode(postalCode) →
  | { kind: 'route';     country, zoneId, warehouseId, zoneName, nextDate }
  | { kind: 'shipping';  country, warehouseId, placeName }        // geçerli kod, bölge dışı
  | { kind: 'ambiguous'; candidates: Array<{ country, placeName }> }
  | { kind: 'unknown' }                                            // hiçbir ülkede geçerli değil
```

**"Ambiguous bugün hiç oluşmaz" doğru, ama yarın değil — ölçtüm.** GeoNames FR+DE verisini indirip
saydım (01.08):

| | |
| --- | --- |
| FR benzersiz posta kodu | 6.065 |
| DE benzersiz posta kodu | 10.813 |
| **İki ülkede birden geçerli** | **610** — FR'nin %10,1'i, DE'nin %5,6'sı |

Yani **her on Fransız posta kodundan biri** Almanya'da da geçerli. (İlk sayımım FR için 20.418
demişti; aradaki fark CEDEX kayıtları — `01001 CEDEX` bir adrese değil posta kutusuna işaret eder,
teslimat yeri çözümünde karşılığı yok ve eleniyor. Çakışma sayısı değişmedi, oran ikiye katlandı.)

Bugünkü 8 rota kodumuzun hiçbiri çakışmıyor (67000–67800 yalnız FR, 77694 yalnız DE). Ama
çakışmalar tam genişleme koridorumuzda, çünkü Bas-Rhin ile Rheinland-Pfalz **aynı 67 önekini**
paylaşıyor:

```
67240  FR: Bischwiller  ↔  DE: Bobenheim-Roxheim
67150  FR: Nordhouse    ↔  DE: Niederkirchen
67112  FR: Breuschwickersheim ↔ DE: Mutterstadt
```

Bischwiller Strasbourg'un 20 km kuzeyinde ve seed'deki talep listesinde zaten "Haguenau — bölge açma
adayı" var. Yani `ambiguous` dalını bugün yazmazsak, ilk kuzey genişlemesinde yazacağız.

Not: tasarım §6'daki `67000 FR+DE` örneği **yanlış** — 67000 Almanya'da geçerli bir kod değil.
Düzeltilecek (kod haklı kuralı dokümanlara da işler).

**Yeni veri: posta kodu referans tablosu.** `postal_code_place (country, postal_code, place_name,
admin_name)` — GeoNames FR+DE, ~31 bin satır, tek seferlik içe aktarma, CC-BY. Dış servis DEĞİL,
kendi tablomuz: yer çözümü checkout'un kritik yolunda, oraya dış bağımlılık koymuyoruz; müşterinin
posta kodu üçüncü tarafa gitmiyor.

Bu tablo iki şeyi birden çözüyor:
1. **Ülke sonuç olur** — 610 kod dışında kesin, seçici hiç görünmez.
2. **Şehir adı gelir.** `place-types.ts` bugün itiraf ediyor: *"75011'in Paris olduğunu bilmemiz
   için bir posta kodu veritabanı gerekirdi ve elimizde yok."* Artık var — tasarımın istediği
   "75011 Paris · kargo" yazılabilir.

**Ad seçim kuralı** (kodun birden çok yeri olabilir — FR'de 4.289, DE'de 2.392 kod öyle): tek yer
varsa o ad, birden çoksa **üst idari birim** (51300 → 46 köy yerine "Marne"). Keyfi bir köy seçmek
yerine daha geniş ama asla yanlış olmayan ad — mevcut "uydurma şehir adı yazma" kuralının aynısı.

**Vergi gerekçen benimkinden güçlü** ve dokümana o giriyor: ülkenin beyan değil **sonuç** olması,
KDV oranını müşterinin doldurduğu bir alandan çıkarmayı yapısal olarak engelliyor.

`matchZones` tek kaynak kalıyor — ülkesiz arama onun **üstüne** bir tur, kendi karşılaştırmasını
yazmıyor.

**IP'den ülke tahmini: yapılmıyor.** Kısa süre önce öneriyordum (`x-vercel-ip-country`), sonra iki
şey öğrendim: (a) Vercel'de barındırmıyoruz — `STACK §271` zaten `deploy.sh` + PM2, kendi sunucu;
middleware'deki `_vercel` Next şablonundan kalma bir artık, ben ondan yanlış çıkarım yapmıştım.
(b) Posta kodu tablosu ülkeyi zaten çözüyor, IP yalnız 610 kodda **sıralama ipucu** olarak işe
yarardı. MaxMind lisansı + nginx modülü + aylık güncelleme, o kazanç için pahalı. `BACKLOG`'a
düşüyor; gerekirse `ambiguous` ekranında sıralama için sonra eklenir.

---

## 2. Yer sunucuya taşınmalı — çerez sözleşmesi

### Sorun

`lezzet.place.v1` `localStorage`'da (`apps/web/lib/delivery/place-store.ts:16`). Katalog, anasayfa
ve ürün detayı RSC — render anında depoyu bilmeleri gerekiyor, `localStorage`'ı göremiyorlar. Yer
**çereze** taşınmadan dört `BEKLEYEN(19.7)` kapanmaz.

### Önerim: çerez müşterinin CEVABINI taşısın, çözümü değil

```
lezzet.place.v2 = { country: 'FR', postalCode: '67000' }     // hepsi bu
```

`warehouseId`, `zoneId`, `nextDate` çereze **yazılmaz**; sunucu her render'da kendisi çözer.
Üç gerekçe:

1. **Çerezi istemci yazabilir.** Çözülmüş depo kimliğini oradan okursak, uydurulmuş bir çerez
   okunan stoğu belirler. Cevabı (posta kodu) okuyup depoyu kendimiz çözersek bu sınıf tamamen
   kapanır — ve maliyeti yok, aşağıya bak.
2. **Ucuz.** Bölge listesi zaten bir saatlik önbellekte (`lib/delivery/read.ts`, `unstable_cache`).
   Depo listesi de aynı desene girebilir.
3. **`nextDate` zaten bayatlıyor.** Kesim saati (16:00) geçince "en yakın teslimat" kayıyor;
   `place-context` tam bu yüzden her açılışta sunucuya yeniden çözdürüyor. Çereze tarih yazmak o
   bayatlığı geri getirir.

`httpOnly` **değil**: hap, panel ve kısıt bloğu istemci bileşeni ve okuyacaklar. Sakıncası yok —
çerez ne kimlik ne yetki taşıyor.

### Sorular

- Sunucu tarafında istek başına bir kez çözen bir sarmalayıcı (React `cache()`) sizde bir desen
  olarak var mı, yoksa ben mi kurayım? Aynı render'da katalog + hap + sepet üç kez sorabilir.
- `resolveDelivery` bugün ayarları ve iki listeyi her çağrıda okuyor. Yer çözümü her sayfa
  render'ında çalışacağına göre önbellek sizin tarafta mı olmalı?

### Bununla birlikte gelen açık: checkout sepeti depo bağlamsız okuyor

`createCheckoutDraft` teslimatı **adresten** doğru çözüyor (`checkout-draft.ts:101`) ama sepeti
depo bağlamı vermeden okuyor:

```ts
// checkout-draft.ts:94
const cart = await getCartView(input.locale, input.entries, { customerId, couponCode });
//                                                            ^ warehouseId yok
```

Tasarımın **"adres kazanır"** kuralı (`musteri-yer-ekseni.md §5`) tam da burayı istiyor: seçilen
adresin kodu şeritteki koddan farklıysa sepet o anda o adrese göre yeniden değerlendirilmeli.
Bugünkü hâlde checkout sepeti depo-üstü okuyor — yani "sepette gördüm, ödemede kayboldu" sürprizi
hâlâ mümkün.

Sıra sorunu var: `getCartView` satır 94'te, `resolveDelivery` satır 101'de. Depo bağlamı için ikisi
yer değiştirmeli ya da sepet iki kez okunmalı.

**Arka uç cevabı:** **Kabul**, üç gerekçenin de arkasındayım — ve (1) tek başına yeterliydi:
çözülmüş depo kimliğini çerezden okumak, hangi deponun stoğunu göstereceğimizi istemcinin eline
vermek olurdu. Sepette görünen malın gerçekten orada olması bizim sözümüz.

`country` çerezde **kalsın** — sende de öyle yazıyor, sadece gerekçesini netleştiriyorum: `ambiguous`
çözüldükten sonra o alan müşterinin **cevabıdır**, türetilebilir bir şey değil. O 610 kodun birinde
posta kodu tek başına yetmez; müşteriye ikinci kez sormamak için cevabını saklıyoruz.

Sorularının cevapları:

- **`cache()` deseni projede yok, ben kuruyorum.** `lib/delivery/resolve-place.ts` → React `cache()`
  ile istek başına tek çözüm. Aynı render'da katalog + hap + sepet üç kez sorabilir, üçü de aynı
  turu paylaşır.
- **Önbellek benim tarafta.** Bölge listesi zaten `unstable_cache` 1 saat (`read.ts`); depo listesi
  aynı desene giriyor. Posta kodu tablosu ayrı bir kategori: **yılda bir değişir**, ona uzun TTL
  veriyorum. Yani yer çözümü sıcak yolda DB'ye hiç gitmeyecek.
- **Sıra sorunu:** `resolveDelivery` yukarı taşınıyor, `getCartView` depo bağlamıyla çağrılıyor.
  Sepet iki kez okunmuyor. Bu zaten madde 2'nin içinde, ayrı iş değil.

"Adres kazanır" kuralı tam olarak burada uygulanır: checkout'ta seçilen adresin kodu şeritteki
koddan farklıysa **adresin deposu** kazanır, şerit yalnız bir varsayılandır.

---

## 3. Kargo deposunun stoğu okunmuyor — "📦 Kargoyla gönderilir" yazılamıyor

Karta o işareti basmak için üç şey gerekiyor: yerel depoda **yok** + ürün kargolanabilir + **kargo
deposunda var**. Üçüncüsünü bilmiyoruz.

`loadProductContext(db, rows, warehouseId)` tek depo okuyor
(`apps/web/lib/storefront/read-context.ts:29`). Depo-**üstü** toplam bu soruyu cevaplayamaz: mal
Kehl'in rota deposunda duruyor olabilir, kargo deposunda değil. Toplam yalnız "hiçbir yerde yok mu"
sorusunun cevabıdır (C3) ve o kuralı bozmak istemiyorum.

Gereken: aynı varyant kümesi için **kargo deposunun** kullanılabilir haritası. Kapının imzası
sizin tercihiniz — `loadProductContext`'e ikinci bir harita ekleyebilir ya da ayrı bir okuma
verebilirsiniz.

**Bağlı ikinci konu:** katalogdaki "📍 Adresime gönderilebilir" çipi artık kargo yoluyla
gelebilenleri de kapsamalı (`musteri-yer-ekseni.md §7`). O süzgeç SQL'de (0043) — keyset
sayfalamayı bozmamak için sonuç çekildikten sonra elenemez, sorguya girmesi gerekiyor.

**Arka uç cevabı:** **Kabul**, ve C3'ü koruma refleksin doğru — depo-üstü toplamı bu soruya cevap
diye kullanmak tam olarak o kuralın yasakladığı şey.

`loadProductContext(db, rows, warehouseId, shippingWarehouseId)` — dördüncü parametre, ikinci
harita (`shippingStock`). İki gerekçeyle ayrı harita, tek çağrı değil: (a) aynı varyant kümesi
zaten elimizde, ikinci `getAvailableMap` ek bir tur ama N+1 değil; (b) iki değerin **anlamı farklı**
ve tek haritada birleşirse ayrım kaybolur — "yerelde yok, kargoda var" ile "her ikisinde de var"
farklı ekranlar.

`shippingWarehouseId` de `null` olabilir (yer bilinmiyor ya da o ülkeye kargo yok) ve `warehouseId`
gibi **varsayılansız** geçilecek: unutulan argüman derlenmesin (T8 disiplini).

Çip süzgeci SQL'de: `product_listing` zaten (depo, varyant) taneli, "adresime gönderilebilir" iki
depo kimliği üzerinden `in` sorgusu olur — sayfalama bozulmaz.

---

## 4. Ürün bazlı "Gelince haber ver" — yanlış tabloya bakıyoruz

Elimizde `zone_notice` var (`supabase/migrations/0030_zone_notice.sql`, anahtar
`postal_code + email`). Onun anlamı: **"bölgenize henüz gelmiyoruz"**.

Tasarımdaki düğme bambaşka bir hâlde duruyor: bölgeye **geliyoruz**, ama o üründe stok yok ve ürün
soğuk zincir olduğu için kargoya da veremiyoruz ("Bölgenizde şu an yok" —
`Musteri - Urun Detay.dc.html`, `Musteri - Katalog.dc.html`, sepetin üçüncü bölmesi). Bu, varyant +
yer düzeyinde bir kayıt istiyor; `zone_notice`'a sıkıştırılamaz.

**Önerim — anahtar depo değil YER olsun:** `(variantId, country, postalCode, email/customerId)`.
Gerekçe: müşteriye verilen söz kendi adresi hakkındadır, bizim iç coğrafyamız hakkında değil. Bir
bölgeyi ileride başka depoya bağlarsak söz ayakta kalmalı — depo anahtarlı kayıt o gün sessizce
yanlış listeye düşerdi. Ayrıca "müşteri depoyu hiç görmez" kuralı veride de korunur.

`zone_notice`'ın dürüstlük tonu aynen geçerli: bu bir **kayıt**, söz değil ("not aldık"). Tetikleyici
yazılana kadar ekran "haber göndeririz" demez.

**Arka uç cevabı:** **Kabul** — anahtar yer olsun, gerekçen benimkinden iyi. "Bir bölgeyi ileride
başka depoya bağlarsak söz ayakta kalmalı" tam olarak `depo.md`'nin söylediği şeyin müşteri
tarafındaki karşılığı: depo bizim iç çözümümüz, müşteriye verilen söz onun adresi hakkında.

`variant_stock_notice (variant_id, country, postal_code, email | customer_id, created_at,
notified_at)`. `zone_notice` yerinde kalıyor, karıştırılmıyor — biri "bölgenize gelmiyoruz", öteki
"bu ürün burada yok". İki farklı söz, iki farklı tetikleyici.

Anahtar kısmi unique: aynı kişi + aynı varyant + aynı kod için tek açık kayıt (`where notified_at
is null`) — müşteri üç kez basınca üç kayıt olmasın.

Tetikleyici (stok girince haber gönderme) bu turda **yazılmıyor**; kayıt tutulur, ekran senin
dediğin dürüst tonu korur ("not aldık"). Tetikleyicinin kendisi 06/12 şeridinde ayrı bir görev.

---

## 5. Kargo takip numarası ve taşıyıcı — hiçbir yerde alan yok

`tracking_number` / `carrier` araması migration'larda ve `packages/types`'ta **sıfır sonuç**.
Tasarım bunu iki yerde gösteriyor:

- Sipariş listesi özet satırı: *"…2 kalem · Fıstıklı Baklava, Antep Fıstığı · takip no
  **6A 2451 7788**"* (`Musteri - Siparisler.dc.html`)
- Sipariş detayı: taşıyıcı + takip no + "Kargoyu takip et ↗" (`Musteri - Siparis Detay.dc.html`)

Yalnız `delivery_type = 'shipping'` siparişleri ilgilendiriyor. Sorular: bu 07 (sipariş) kapsamında
mı yoksa 11 (kurye/rota) kapsamında mı? Taşıyıcı serbest metin mi, tanımlı bir küme mi (takip
bağlantısını üretebilmek için URL kalıbı gerekiyor)? Numarayı kim giriyor — hazırlık ekranı mı,
ayrı bir sevk adımı mı?

Ekranı ben yazacağım; alan ve kapı gelene kadar müşteri detayında bu bölüm hiç çizilmiyor.

**Arka uç cevabı:** Üç sorunun da cevabı var, parametrik olanları sormuyorum — makul varsayılan
koyup bildiriyorum (`CLAUDE.md §4`).

- **Kapsam 07 (sipariş), 11 değil.** Takip numarası siparişin bir özelliği; kurye/rota kendi
  aracımızla giden işin modülü, kargo oraya girmiyor.
- **Taşıyıcı tanımlı küme** (enum), serbest metin değil — gerekçesi senin de yazdığın şey: takip
  bağlantısını üretmek için URL kalıbı lazım, serbest metinden çıkmaz. Başlangıç kümesi
  `colissimo · chronopost · dhl · ups · other`. `other` var çünkü küme kapalı olamaz (yeni taşıyıcı
  bir migration bekleyemez); `other` seçilince bağlantı gösterilmez, numara düz metin durur.
- **Alanlar:** `order.carrier` + `order.tracking_number`, ikisi de nullable ve yalnız
  `delivery_type = 'shipping'` siparişlerde anlamlı — kısıt bunu veride tutuyor (rota siparişine
  takip numarası yazılamaz).
- **Numarayı hazırlık ekranı girer** (paketi kapatan kişi etiketi elinde tutuyor), ayrı bir sevk
  adımı açmıyoruz — operasyon şeridinin işi.

Bu 19 kapsamı değil, kendi görev satırını alıyor. Sen ekranı yaz, alan gelene kadar bölüm
çizilmesin — doğru karar.

---

## 6. Sepetin iki gruba ayrılması — motor hazır, çağıranı yok

`decideCartAgainstWarehouse` (`packages/domain-core/src/delivery/cart-warehouse.ts`) 19.3'te
yazıldı ve **hiçbir yerden çağrılmıyor**. `CartView`/`CartLine` de yol bilgisi taşımıyor
(`apps/web/lib/cart/cart-types.ts`).

**Önerim: gruplama `lib/cart/read.ts`'te olsun, ekranda değil.** İki gerekçe: (a) aynı ayrım
checkout'ta da gerekiyor (kargo grubu, sepetin alt kümesiyle ikinci bir taslak açacak); (b) iş
gerçeğini ekran hesaplayamaz (`STACK §4`). Somut olarak `CartLine`'a `route: CartLineRoute` alanı,
`CartView`'a grup toplamları.

Motorun girdisi satır başına `localAvailable` + `shippingAvailable` istiyor — yani madde 3'teki
ikinci okuma sepette de gerekiyor. İkisi aynı iş.

**Bir de eşik sorusu:** `getCartView` bugün sepetin tamamı için tek bir `freeShippingCents`
hesaplıyor. Tasarım (`K37`) kargo eşiğinin **kargo grubunun kendi tutarından** hesaplanmasını
istiyor — "iki grup birbirinin eşiğini beslemez". Bu, mevcut alanın anlamını değiştiriyor: eşik
artık sepetin değil, kargo grubunun. Sizce alan mı bölünmeli, yoksa hesap çağırana mı bırakılmalı?

**Arka uç cevabı:** **Kabul** — gruplama `read.ts`'te, ekranda değil. (b) gerekçen tek başına
belirleyici: bu bir iş kuralı, ekran onu hesaplayamaz.

`CartLine.route: 'local' | 'shipping' | 'unavailable'` + `CartView`'a grup toplamları.

**Eşik sorusuna cevap: alan bölünüyor.** `freeShippingCents` sepetin değil **kargo grubunun** olur.
Gerekçe: ücretsiz kargo eşiği bir **kargo maliyeti** kuralıdır, rota grubunun tutarının onunla
ilgisi yok. Bölünmezse 80 €'luk rota siparişi 5 €'luk kargo kalemini bedava taşıtırdı — kendi
aracımızla giden malın tutarı, bir kargo firmasına ödediğimiz ücreti karşılamaz. K37 zaten bunu
söylüyor, ben yalnız alanın anlamını ona hizalıyorum.

Hesap çağırana bırakılmıyor: iki yerden (sepet ekranı + checkout) çağrılacak ve iki farklı sonuç
çıkması "sepette bedava yazıyordu" şikâyetidir.

Motorun girdisi (`localAvailable` + `shippingAvailable`) madde 3'ün ikinci haritasıdır — aynı iş,
iki yerde tüketiliyor.

---

## Özet — benim beklediğim çıktılar

| # | İstek | Bensiz olur mu |
| --- | --- | --- |
| 1 | Ülkesiz posta kodu çözümü (`resolved` / `ambiguous` / `outside`) | Hayır — ülke seçici kalkıyor |
| 2 | Yer çerezi sözleşmesi + checkout sepetinin depo bağlamı | Hayır — 19.7'nin tamamı buna bağlı |
| 3 | Kargo deposu stok haritası + çipin SQL süzgeci | Hayır — dört hâlin ikisi yazılamaz |
| 4 | Varyant+yer bazlı "gelince haber ver" kaydı | Ekran çizilir, düğme çalışmaz |
| 5 | Taşıyıcı + takip no alanı | Bölüm hiç çizilmez |
| 6 | `CartLine.route` + grup toplamları + kargo eşiği | Hayır — sepet ekranı bu ayrımın üstüne kuruluyor |

Sıra beklentim: **1 ve 2 önce.** İkisi kapanınca katalog/ürün/anasayfa işaret dilini yazmaya
başlayabilirim; 3 gelince dört hâl tamamlanır; 6 gelince sepet, 4 ve 5 en sona kalabilir.

---

## Arka uç cevabı — sıra ve görev karşılıkları

Altısı da **kabul**, hiçbirinde ters karar yok. Beklediğin sırayla gidiyorum:

| # | Görev satırı | Not |
| --- | --- | --- |
| 1 | `19.8` posta kodu referansı + ülkesiz çözüm | Dört hâl (`unknown` eklendi) + şehir adı |
| 2 | `19.9` yer çerezi + istek başına çözüm + checkout sırası | `cache()` desenini ben kuruyorum |
| 3 | `19.10` kargo deposu stok haritası + çip süzgeci | 6'nın girdisi de bu |
| 6 | `19.11` `CartLine.route` + grup toplamları + kargo eşiği | Eşik alanı bölünüyor |
| 4 | `19.12` `variant_stock_notice` | Tetikleyici bu turda değil |
| 5 | `07.x` taşıyıcı + takip no | 19 kapsamı dışı, ayrı satır |

**1 ve 2 bittiğinde haber vereceğim** — dört `BEKLEYEN(19.7)` işaretinin arka ucu o an açılıyor.
3'ü beklemeden katalog/ürün/anasayfa işaret dilinin üç hâlini (`yerelde var` · `hiçbir yerde yok` ·
`yer bilinmiyor`) yazabilirsin; dördüncü hâl (`kargoyla gelir`) 19.10'u bekler.

Bu dosya **arşiv**: cevaplar geldiğine göre durumun sahibi artık `19-coklu-depo.md` görev
satırlarıdır (`CLAUDE.md §5`). Yeni soru çıkarsa buraya değil, o satırın altına.
