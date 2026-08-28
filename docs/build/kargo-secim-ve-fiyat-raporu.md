# Kargo: seçim modeli, fiyat tespiti ve Almanya deposu — ölçüm raporu (28–29.08)

> **Bu bir RAPORDUR, talep değil.** Kullanıcı soruları: *"nereden nerelere, hangi büyüklükte, kaça?
> Almanya'da bir depo ne kadar kârlı olur ve hangi durumda açmak gerekir? Eşik altında müşteri
> seçmeli, eşik üstünde biz seçmeliyiz — ve ücretsiz kargo eve gitmeli, teslimat noktasına değil.
> Sınırı geçen siparişlerde eve teslim fiyatlarına bakılmalı."* (28–29.08)
>
> **Fiyatlar GERÇEK hesaptan, canlı ölçüldü** (`/shipping-options`, salt okuma — gönderi açılmadı,
> etiket alınmadı, **para harcanmadı**). İki tur: 28.08 tek depoyla · **29.08 kullanıcı Almanya'ya
> geçici gönderici adresi ekledikten sonra iki depoyla.** Kardeş belgeler:
> `kargo-kanali-tasarimi.md` (tasarım) · `kargo-kanali-gunluk.md` (günlük).
>
> ⚠ **29.08 turu, 28.08'de yazdığım bir TAHMİNİ çürüttü** — Almanya deposunun kazancını
> "≤5 €/gönderi" diye kestirmiştim, ölçüm 19 €'ya kadar çıkardı. Düzeltme §2'de.

---

## 0. Önce: ölçüm bir ARIZA buldu — ücretsiz "mektup" seçeneği otomatik seçiliyor

Sağlayıcı her sorguya **`sendcloud:letter` · 0,00 €** seçeneğini de döndürüyor (ücretsiz prova
kanalı; kargo şeridi uçtan uca provayı bilerek bununla yapmış). Ama:

- `quoteShipping` yalnız **fiyatı `null` olanı** süzüyor (`quote.ts:61`), **sıfır olanı değil**.
- Liste ucuzdan pahalıya sıralı ve `checkout-snapshot.ts:342` seçim yoksa **`options[0]`**'ı
  seçiyor — yani **daima `sendcloud:letter`**.
- Sonuç: her kargo siparişinde ücret **0,00 €** hesaplanıyor ve müşteri checkout'ta *"0,00 €"*
  yazan bir kart görüyor. 15 kg'lık bir koli **mektup** tarifesiyle işaretlenmiş oluyor.

**Ölçüm (FR·Strasbourg → FR·Paris, 5 kg):** listenin ilk satırı `0.00 € sendcloud:letter`,
ikinci satırı `8.50 € mondial_relay:home_domestic`. Yani fark somut: sipariş başına **8,50 €**
hesaplanmıyor.

Bu, kullanıcının *"ön tanımlı kargo şirketleri arasından seçilsin"* kuralının neden gerekli
olduğunun kanıtı: **onaylı liste, bu sınıf arızanın tek gerçek panzehiri.** Süzgeç "fiyatı sıfır
olanı at" diye yazılsaydı yarın gerçek bir kampanya tarifesi de düşerdi; doğru olan beyaz listedir.

**Alan:** `packages/application/src/shipping/quote.ts` + `order/checkout-snapshot.ts` — kargo
şeridinin dosyaları. Dokunulmadı, talep dosyasıyla bildirildi.

---

## 1a. SINIR ÖTESİ — EVE TESLİM fiyat eğrisi (asıl tablo)

> **Neden yalnız eve teslim** (kullanıcı kuralı 28.08): *"sınırı geçen müşterilere biz evlerine
> göndereceğimiz için teslimat noktaları geçersiz oluyor."* Yani yurt dışı siparişte karar
> ekseninde nokta yok; aşağıdaki tablo **yalnız `home_delivery`** seçeneklerinin en ucuzudur
> (mektup elenmiş). Çıkış: hesabın gerçek gönderici adresi **FR · 67380 Lingolsheim**.
> Kutu sabit: **40×30×25 cm**; değişen yalnız ağırlık.

| Varış | 1 kg | 2 kg | 5 kg | 10 kg | 15 kg | 20 kg | En ucuzu veren | Süre |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| **FR** Paris *(yurt içi)* | 6,03 | 6,40 | 8,50 | 10,74 | 15,67 | 23,86 | Mondial Relay | — |
| **DE** Berlin | 10,43 | 11,69 | 13,48 | 20,65 | 20,65 | 27,82 | Mondial Relay | 72 sa |
| **BE** Bruxelles | 10,43 | 11,69 | 13,48 | 20,53 | 20,65 | 27,82 | Mondial Relay | 72 sa |
| **NL** Amsterdam | 10,43 | 11,69 | 13,48 | 20,65 | 20,65 | 27,82 | Mondial Relay | 72 sa |
| **LU** Luxembourg | 10,43 | 11,69 | 13,48 | 20,65 | 20,65 | 27,82 | Mondial Relay | 72 sa |
| **ES** Madrid | 11,69 | 12,22 | 16,44 | 22,98 | 30,50 | 35,94 | Mondial Relay | 72 sa |
| **IT** Milano | 15,41 | 17,21 | 20,15 | 24,70 | 30,83 | 36,12 | Colissimo | 96 sa |
| **AT** Wien | 15,72 | 17,55 | 20,51 | 25,07 | 31,44 | 36,84 | Colissimo | 96 sa |
| **CH** Zürich *(AB dışı)* | 16,45 | 18,43 | 24,29 | 37,04 | 48,89 | 58,51 | Colissimo | 96 sa |

**Sınır ötesi primi ağırlıkla ERİYOR** — yurt içiyle farkın oranı:

| | 1 kg | 2 kg | 5 kg | 10 kg | 15 kg | 20 kg |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| DE/BE/NL/LU farkı | +4,40 € | +5,29 € | +4,98 € | +9,91 € | +4,98 € | +3,96 € |
| oran | +%73 | +%83 | +%59 | +%92 | +%32 | +%17 |

Yani **hafif siparişte sınır pahalı, ağır siparişte fark kapanıyor.** Almanya'ya 1 kg göndermek
%73 zam demek; 20 kg göndermek yalnız %17.

**Üç kademe var, dokuz ülke değil:** *(1)* yurt içi FR · *(2)* yakın AB — DE/BE/NL/LU **kuruşu
kuruşuna aynı**, ES çok yakın · *(3)* uzak AB (IT/AT) ~%50 daha pahalı · *(4)* AB dışı CH, ağırda
**iki katından fazla** ve gümrük istiyor.

---

## 1b. İki kademeli tablo — FR yurt içi (nokta seçimi burada anlamlı)

Yurt içinde müşteri eşik altındaysa **nokta ↔ eve** seçebiliyor. Üç profil: **S** 1 kg ·
25×20×10 · **M** 5 kg · 40×30×25 · **L** 15 kg · 60×40×40 cm.

| Varış | S · eve | S · noktaya | M · eve | M · noktaya | L · eve | L · noktaya |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **FR** Strasbourg / Paris / Marseille | 6,03 | 4,29 | 8,50 | 9,49 | 25,93 | 18,13 |
| **DE** Frankfurt / Berlin | 10,43 | 7,00 | 13,48 | 13,28 | 20,65 | 24,61 |
| **BE** Bruxelles | 10,43 | 5,10 | 13,48 | 10,62 | 20,65 | 20,11 |
| **NL** Amsterdam | 10,43 | 5,71 | 13,48 | 10,62 | 20,65 | 20,11 |
| **LU** Luxembourg | 10,43 | 5,10 | 13,48 | 10,62 | 20,65 | 20,11 |
| **CH** Zürich | 16,45 | — | 24,29 | — | 48,89 | — |

*(Yurt dışı sütunları yalnız karşılaştırma içindir — kullanıcı kuralına göre sınır ötesinde nokta
seçilmiyor.)*

### ⚠ Bulguların en pahalısı: KUTU ÖLÇÜSÜ taşıyıcıyı eliyor, ağırlık değil

Aynı **15 kg**, iki farklı kutuda, Fransa içine eve teslim:

| Kutu | Fiyat | Taşıyıcı |
| --- | ---: | --- |
| 40×30×25 cm | **15,67 €** | Mondial Relay |
| 60×40×40 cm | **25,93 €** | Colissimo *(Mondial Relay listeden düşüyor)* |

**%65 fark ve tek değişken kutu.** Yani koli planının "hangi kutuya sığdı" kararı, ağırlıktan daha
belirleyici. Depoda büyük kutu seçmek — az sayıda büyük kutu kullanmak — sezgisel olarak verimli
görünür ama tarifede tersine dönebiliyor. `parcel-plan` bugün hacim + ağırlık tavanına bakıyor;
**tarife eşiğine bakmıyor** ve bu ölçüm onun bir gün bakması gerekebileceğini söylüyor.

### Beş bulgu

**1. Fransa içinde MESAFE FİYATI DEĞİŞTİRMİYOR.** Strasbourg → Strasbourg, → Paris ve → Marseille
**kuruşu kuruşuna aynı**. Yani "yakına ucuz" diye bir şey yok; ulusal tarife düz. Fiyatı belirleyen
tek eksen **ağırlık/hacim**.

**2. AB komşuları TEK BÖLGE.** DE · BE · NL · LU dördü de **aynı** fiyatı veriyor (10,43 / 13,48 /
20,65 eve). Almanya'ya göndermekle Hollanda'ya göndermek arasında fark yok.

**3. İsviçre AYRI BİR DÜNYA.** ~%60–90 daha pahalı, **teslimat noktası seçeneği YOK** (yalnız 3
seçenek, hepsi eve) ve AB dışı olduğu için gümrük beyanı gerekir. Bugünkü kanalda gümrük alanları
hiç yazılmadı — CH'ye satış açılacaksa ayrı bir iş.

**4. AĞIRLAŞTIKÇA EVE TESLİM SEÇENEĞİ TÜKENİYOR.** 15 kg'da Fransa içinde Mondial Relay'in **eve
teslim tarifesi yok**; geriye Colissimo kalıyor ve fiyat 8,50 €'dan **25,93 €**'ya sıçrıyor (üç
katı). Toptan (B2B) siparişte kargo maliyeti bu yüzden doğrusal değil.

**5. "Teslimat noktası her zaman daha ucuz" YANLIŞ.** 1 kg'da nokta %29 ucuz (4,29 ↔ 6,03), 15
kg'da %30 ucuz (18,13 ↔ 25,93) — ama **5 kg'da eve teslim daha ucuz** (8,50 ↔ 9,49). Kademeyi
"nokta = tasarruf" diye anlatmak bazı sepetlerde yalan olur; ekran fiyatı yazmalı, vaadi değil.

> ⚠ **Bu tarifeler hesabımızın BUGÜNKÜ (pazarlıksız) tarifeleridir.** Kodlarda `c2c` eki görünüyor
> — yani sözleşmeli iş tarifesi değil, Sendcloud'un varsayılanı. Hacim taahhüdüyle pazarlık
> yapıldığında tablo değişir; karar verirken oran değil **sıralama** güvenilir.

---

## 2. ALMANYA DEPOSU — artık ÖLÇÜLDÜ (29.08)

Kullanıcı 29.08'de Sendcloud paneline **geçici bir Alman gönderici adresi** ekledi
(`DE · 77694 Kehl`) ve DE çıkışı ölçülebilir hâle geldi. Doğrulandı:
`GET /api/v2/user/addresses/sender` → iki adres, `FR · 67380 Lingolsheim` + `DE · 77694 Kehl`.

> **28.08'de yazdığım tahmin YANLIŞTI ve düzeltiliyor.** *"Almanya deposu gönderi başına en çok
> ~5 € kazandırır"* demiştim; dayanağım "Alman yurt içi tarifesi Fransız yurt içi tarifesine
> benzer" varsayımıydı. **Benzemiyor:** Alman yurt içi tarifesi ağırlıkta neredeyse DÜZ —
> 20 kg'a kadar **8,45 €** — Fransız tarifesi ise 23,86 €'ya tırmanıyor. Gerçek kazanç ağır
> gönderide **19 €'ya** çıkıyor. Kıyasla tahmin, ölçümün yerini tutmuyor.

### 2a. İki depodan aynı yerlere — eve teslim, en ucuz seçenek

Kutu sabit **40×30×25 cm**; değişen yalnız ağırlık. Sol blok bugünkü depo, sağ blok Almanya.

| Varış | FR 1kg | FR 5kg | FR 10kg | FR 20kg | | DE 1kg | DE 5kg | DE 10kg | DE 20kg |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| **FR** Paris | 6,03 | 8,50 | 10,74 | 23,86 | | 15,94 | 20,07 | 21,52 | 21,52 |
| **DE** Berlin/München | 10,43 | 13,48 | 20,65 | 27,82 | | **6,92** | **6,92** | **8,45** | **8,45** |
| **BE** Bruxelles | 10,43 | 13,48 | 20,53 | 27,82 | | 14,49 | 14,49 | 16,88 | 19,11 |
| **NL** Amsterdam | 10,43 | 13,48 | 20,65 | 27,82 | | 14,76 | 14,76 | 16,88 | 19,11 |
| **LU** Luxembourg | 10,43 | 13,48 | 20,65 | 27,82 | | 14,49 | 14,49 | 16,88 | 19,11 |
| **AT** Wien | 15,72 | 20,51 | 25,07 | 36,84 | | 15,55 | 15,55 | 17,48 | 19,15 |
| **IT** Milano | 15,41 | 20,15 | 24,70 | 36,12 | | 16,10 | 20,23 | 21,56 | 21,56 |
| **ES** Madrid | 11,69 | 16,44 | 22,98 | 35,94 | | 16,10 | 20,23 | 23,01 | 23,01 |
| **CH** Zürich | 16,45 | 24,29 | 37,04 | 58,51 | | 20,43 | 24,15 | 24,56 | 24,56 |

Taşıyıcılar: FR çıkışında **Mondial Relay** (yurt içi + yakın AB) ve **Colissimo** (uzak AB, CH);
DE çıkışında **DPD** (yurt içi + yakın AB) ve **DHL Germany** (uzak AB, CH, FR).

### 2b. FARK TABLOSU — pozitif sayı, Almanya deposunun kazandırdığıdır (€/gönderi)

| Varış | 1 kg | 2 kg | 5 kg | 10 kg | 15 kg | 20 kg |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **DE** | +3,51 | +4,77 | +6,56 | +12,20 | +12,20 | **+19,37** |
| **AT** | +0,17 | +2,00 | +4,96 | +7,59 | +12,29 | +17,69 |
| **CH** | −3,98 | −2,93 | +0,14 | +12,48 | **+24,33** | **+33,95** |
| **IT** | −0,69 | +0,08 | −0,08 | +3,14 | +9,27 | +14,56 |
| **BE** | −4,06 | −2,80 | −1,01 | +3,65 | +1,54 | +8,71 |
| **NL** | −4,33 | −3,07 | −1,28 | +3,77 | +1,54 | +8,71 |
| **LU** | −4,06 | −2,80 | −1,01 | +3,77 | +1,54 | +8,71 |
| **ES** | −4,41 | −4,91 | −3,79 | −0,03 | +7,49 | +12,93 |
| **FR** | −9,91 | −10,57 | −11,57 | −10,78 | −5,85 | +2,34 |

### Üç bulgu

**1. Almanya içi tarife DÜZ, Fransa içi tarife TIRMANIYOR.** DPD Almanya'da 1–5 kg **6,92 €**,
10–20 kg **8,45 €** — yani ağırlık neredeyse fiyatsız. Fransa'da aynı yol 6,03 → 23,86 €.
Almanya deposunun asıl gücü Almanya'ya satmak değil, **ağır göndermek**.

**2. Ağır gönderide Almanya deposu HER YERE ucuz — Fransa hariç.** 20 kg'da CH'ye **+33,95 €**,
DE'ye +19,37 €, AT'ye +17,69 €, IT'ye +14,56 €. Sebep aynı: DHL Germany'nin uluslararası tarifesi
de 10 kg'dan sonra düzleşiyor (21,52 € FR'ye, 24,56 € CH'ye — ağırlıktan bağımsız).

**3. Ters yön gerçek ve pahalı.** Fransa'ya Almanya'dan göndermek 5 kg'da **11,57 € daha pahalı**.
Yani Almanya deposu Fransız siparişlerini **karşılayamaz**; stok TAŞINMAZ, ÇOĞALTILIR. Bu, kararın
gizli maliyeti: aynı ürünü iki yerde tutmak sermaye bağlar.

---

## 2c. OPTİMUM YÖNLENDİRME — hangi sipariş hangi depodan

Fark tablosundaki işaret değişimi, kuralı kendisi yazıyor:

| Sipariş | Çıkış deposu | Gerekçe |
| --- | --- | --- |
| **Almanya'ya, her ağırlıkta** | 🇩🇪 **DE** | En hafifte bile +3,51 €; ağırda +19 € |
| **Avusturya'ya, her ağırlıkta** | 🇩🇪 **DE** | 1 kg'da başabaş (+0,17), sonrası hep DE |
| **≥10 kg — CH · IT · BE · NL · LU** | 🇩🇪 **DE** | Almanya tarifesi düzleştiği için fark açılıyor |
| **≥15 kg — ES** | 🇩🇪 **DE** | +7,49 € (15 kg) · +12,93 € (20 kg) |
| **<10 kg — BE · NL · LU · ES · IT · CH** | 🇫🇷 **FR** | Mondial Relay hafifte ucuz; DE'den gitmek 3–5 € pahalı |
| **Fransa'ya, <20 kg** | 🇫🇷 **FR** | DE'den gitmek 6–12 € pahalı |
| **Fransa'ya, ≥20 kg** | 🇩🇪 DE *(marjinal)* | Yalnız +2,34 €; bu fark için stok bölmeye değmez |

> ⚠ **BUGÜNKÜ KOD BU OPTİMUMU İFADE EDEMEZ.** Kargo deposu seçimi
> `findShippingWarehouse(country, warehouses)` ile yapılıyor
> (`domain-core/delivery/warehouse-resolve.ts:114`) ve kuralı tek satır: *"varış ülkesiyle AYNI
> ülkedeki depo"*. Yani Almanya deposu açılınca Alman siparişleri kendiliğinden oradan çıkar
> (**kazancın büyük kısmı otomatik gelir**) — ama İsviçre'ye giden 15 kg'lık sipariş, 24 € daha
> ucuz olmasına rağmen Fransa'dan çıkmaya devam eder, çünkü CH'de depomuz yok.
>
> Ülke eşleşmesinden **maliyet karşılaştırmasına** geçmek ayrı bir iştir: her iki depodan teklif
> alıp ucuzunu seçmek (iki çağrı, ikisi de ücretsiz) — ama stok iki depoda da olmalı, yoksa
> "ucuz olan depoda mal yok" hâli doğar. Bu, açılış kararı verildikten SONRA konuşulacak bir
> ikinci tur; ilk turda ülke kuralı zaten kazancın çoğunu topluyor.

---

## 2d. NE ZAMAN AÇMAYA DEĞER — kaba hesap (brüt kâr = ciro ÷ 2)

Kullanıcı varsayımı 29.08: **cironun yarısı brüt kâr.** O hâlde her 1 € kargo tasarrufu, **2 €'luk
ek satışın** brüt kârına denktir — ölçüyü bu şekilde okumak kararı kolaylaştırıyor.

### Bir Alman siparişinde ne değişiyor

100 €'luk bir sipariş → brüt kâr **50 €**.

| 5 kg'lık sipariş | Kargo | Brüt kârın yüzdesi |
| --- | ---: | ---: |
| Bugün — Fransa'dan | 13,48 € | **%27,0** |
| Almanya deposundan | 6,92 € | **%13,8** |
| **Kazanç** | **6,56 €** | **%13,1 puan** |

Yani Almanya deposu, Alman siparişlerinde kargonun brüt kârdan aldığı payı **neredeyse yarıya**
indiriyor. 6,56 €'luk tasarruf, **13,12 €'luk ek satışın** brüt kârına denk.

### Başabaş noktası — aylık sabit maliyet ÷ gönderi başına tasarruf

Sabit maliyeti bilmiyorum (kira + personel + kurulum) ve **uydurmuyorum**; tablo bir aralık üstünden:

| Aylık sabit maliyet | Ortalama 2 kg (4,77 €/sipariş) | Ortalama 5 kg (6,56 €) | Ortalama 10 kg (12,20 €) |
| --- | ---: | ---: | ---: |
| 500 € | 105 sipariş/ay | 76 | 41 |
| 1.000 € | 210 | 153 | 82 |
| 1.500 € | 315 | 229 | 123 |
| 2.000 € | 419 | 305 | 164 |
| 3.000 € | 629 | 457 | 246 |

**Okunuşu:** ayda 1.500 € tutan bir Alman deposu, ortalama 5 kg'lık **229 Alman siparişinde**
kendini yalnız kargo tasarrufundan çıkarır. Aynı depo ciro diliyle: ayda **3.000 €'luk ek satışın**
brüt kârı kadar üretiyor demektir.

### Eksik kalırsa — ek satış ne kadar olmalı

Aylık Alman sipariş adediniz `N` ise, kargo tasarrufu `N × S`. Açık kalan kısım ek satışla
kapanmalı ve brüt kâr ciro ÷ 2 olduğu için:

```
gereken ek CİRO  =  2 × ( aylık sabit maliyet − N × tasarruf )
```

Örnek: sabit 1.500 €/ay, ayda 100 Alman siparişi, ortalama 5 kg → tasarruf 656 €. Açık 844 € →
başabaş için ayda **1.688 €'luk ek ciro** gerekir. Bu ek ciro hayali değil, deponun kendi getirisi
olabilir: Almanya'da teslim süresi 72 saatten **DPD yurt içine** düşüyor ve ücretsiz kargo eşiğini
Almanya'da aşağı çekmek mümkün hâle geliyor (kargo maliyeti yarıya indiği için).

### Karara giren, tabloda OLMAYAN üç kalem

1. **Stok çoğaltma sermayesi.** Ters yön ölçüldü: Almanya deposu Fransız siparişlerini
   karşılayamaz (5 kg'da 11,57 € pahalı). Yani aynı ürün iki yerde durmalı — bağlanan sermaye ve
   iki depoda birden SKT riski.
2. **Almanya'ya giden sipariş adedi ve ortalama ağırlığı.** Bu bilgi **sizde**; yereldeki veri
   sahte ve ondan çıkarım yapılmaz (`CLAUDE.md` başı). Tablodaki üç ağırlık senaryosu tam da bu
   yüzden var — kendi rakamınızı satıra koyun.
3. **Yasal/idari:** Almanya'da işletme kaydı, KDV (OSS mi yerel kayıt mı), gıda mevzuatı. Kargo
   tarifesi bu maliyetlerin yanında küçük kalabilir.

---

## 2e. DEPO AÇMADAN — Fransa'dan toplayıp Almanya yurt içi ağına veren kim var?

Ölçümde DE→DE'yi kazandıran şey Alman **taşıyıcı sözleşmesiydi** (DPD 6,92 € · DHL), deponun
kendisi değil. Sektörde bunun adı **"direct injection"** (doğrudan enjeksiyon / zone-skipping):
siparişler çıkış ülkesinde toplanır, tek yük olarak varış ülkesine taşınır ve oradaki **yurt içi**
ağa verilir — müşteri paketi kendi alıştığı kuryeden alır.

> Aşağısı **piyasa araştırmasıdır, ölçüm değil.** Fiyat vermiyorum: bu sağlayıcılar tarife
> yayımlamıyor, hacme göre teklif veriyor. Amaç "kimlerle konuşulur" sorusunu cevaplamak.

### Üç kategori

**① Sanal taşıyıcı / enjeksiyon platformları** — asıl aradığınız sınıf.

| Sağlayıcı | Ne yapıyor | FR çıkışı? | Almanya'da son mil |
| --- | --- | --- | --- |
| **Seven Senders** (Berlin) | Ürünün adı doğrudan *"Seven Senders Delivery (direct injection)"*; sanal taşıyıcı olarak yerel akışlara enjekte ediyor | ✅ Belgelenmiş: Colissimo · Mondial Relay · DHL · DPD · Chronopost · **Colis Privé** · GLS · UPS ile toplama | **DHL / DHL-Paket · Hermes · DPD · GLS · UPS · FedEx** (+ Dachser, nox Nachtexpress, gel-express) |
| **Asendia** (La Poste + İsviçre Postası ortak girişimi) | Sınır ötesi konsolidatör: toplar, toplu taşır, varış ülkesinin ağına enjekte eder (`e-PAQ` ürün ailesi) | ✅ Yarısı La Poste — Fransa doğal çıkış ülkesi | Almanya'da büyük bir iştiraki var; son mil yerel ortak |
| **exporto** | **DACH'a odaklı**: hat taşıması + gümrük (CH/UK) + taşıyıcı devri tek elden | Enjeksiyon varışları arasında DE · CH · FR · IT sayılıyor | Yerel ağ; müşteri "alıştığı kuryeden" alıyor |
| **Spring GDS** (PostNL) · **Landmark Global** (bpost) · **MH Direkt** | Aynı model, farklı posta gruplarının kolu | ✅ | Yerel ağ |

**② Sendcloud'un KENDİ enjeksiyon ağı — bizim için sıfır entegrasyon.**
Sendcloud açıkça şunu söylüyor: *"ortak ağımızdan yararlanarak paketlerinizi yurt dışındaki yerel
taşıyıcılara enjekte edebilirsiniz"* — ve yöntem tarif ediliyor: **yerel taşıyıcı etiketleri
Sendcloud'dan önceden basılır**, paketler toplu hâlde enjekte edilir. Kendi vaka örneklerinde
%10 tasarruf anlatılıyor.
**Bizim için önemi:** entegrasyon zaten kurulu — `announce` etiket satın alıyor, etiket basımı
telefonda çalışıyor. Yani bu yol **kod yazmadan** denenebilecek tek yol.

**③ Zaten iki ülkede de kendi ağı olanlar — belki de en ucuz cevap.**
Ölçümde Almanya'yı ucuzlatan taşıyıcı **DPD** idi (6,92 €). DPD ve **GLS** hem Fransa'da hem
Almanya'da kendi ağlarına sahip; onlar için FR→DE zaten "ağ içi" bir harekettir.
**Ama bizim Fransız hesabımızda DPD/GLS sözleşmesi YOK** — ölçümde FR çıkışında yalnız Mondial
Relay ve Colissimo çıktı (`c2c`, yani pazarlıksız varsayılan tarifeler).

> 💡 **En ucuz ilk deneme burada:** *"Fransa'dan DPD ya da GLS sözleşmesi eklesek FR→DE kaça
> düşer?"* Bu ne depo açmayı, ne enjeksiyon anlaşmasını, ne de kod yazmayı gerektiriyor —
> yalnız Sendcloud'da bir taşıyıcı daha etkinleştirmeyi. **Cevabı §2f'de: bulundu ve rakamlandı.**

### Hacim eşiği — ve bu bizim tablomuzla ÖRTÜŞÜYOR

Sektör kaynakları enjeksiyonun anlamlı olduğu tabanı şöyle veriyor: **ülke başına ayda birkaç yüz
sipariş** (byrd), daha iyimser kaynaklarda **haftada 20–30 gönderi** (yani ayda ~100). Altında
kurulum ve işletme yükü tasarrufu yiyor.

Bu, §2d'deki başabaş tablosuyla aynı büyüklük sırasında: 1.000–1.500 €/ay sabit maliyet için
**153–229 Alman siparişi/ay**. Yani iki yol da aynı eşiği işaret ediyor — **ayda ~150–250 Alman
siparişi**. Altındaysanız ne depo ne enjeksiyon; üstündeyseniz **önce enjeksiyon** (sabit maliyet
yok, geri dönülebilir), sonra hacim büyürse depo.

### Sıra önerisi — ucuzdan pahalıya

1. **Sendcloud'da FR için DPD/GLS sözleşmesi sor** → sıfır maliyet, sıfır kod, aynı gün ölçülür
2. **Sendcloud'un enjeksiyon ortak ağını sor** → entegrasyon zaten kurulu
3. **Seven Senders / Asendia / exporto'dan hacim teklifi al** → sözleşme var, sabit maliyet yok
4. **Almanya deposu** → en büyük kazanç (§2b) ama sabit maliyet + stok çoğaltma sermayesi

**Kaynaklar:** [Seven Senders — taşıyıcı listesi](https://support.portal.sevensenders.com/support/solutions/articles/15000040312-available-carriers) ·
[Seven Senders — direct injection](https://blog.sevensenders.com/en/benefits-direct-injection-shipping) ·
[Asendia e-PAQ](https://www.asendia.com/e-paq-how-we-do-it) ·
[byrd — direct injection ve hacim eşiği](https://blog.getbyrd.com/en/direct-injection) ·
[Sendcloud — uluslararası gönderi](https://www.sendcloud.com/international-shipping/) ·
[MH Direkt](https://www.mhdirekt.com/en/cross-border-e-commerce/)

---

## 2f. "DPD'yi ekleyemedim" — SEBEBİ BULUNDU, ve kazancı rakamlandı

Kullanıcı 29.08: *"hizmet aldığım yerin farklı paketleri var, kontrat eklenebiliyor ama DPD'yi
ekleyemedim."* Araştırıldı — sebep abonelik kademesi, ve **kendi ölçümümüz bunu doğruluyor.**

### Sendcloud paketleri ÜÇ ayrı şeyi birden kilitliyor

| | Free | Lite ~35 € | Growth ~109 € | Premium ~219 € | Pro ~799 € |
| --- | :-: | :-: | :-: | :-: | :-: |
| Sendcloud'un pazarlıklı tarifeleri (Colissimo · Mondial Relay) | ✅ | ✅ | ✅ | ✅ | ✅ |
| **DPD FR — Sendcloud tarifesiyle** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Kendi taşıyıcı sözleşmeni yükleme** | ❌ | ✅ | ✅ | ✅ | ✅ |
| Aylık etiket kotası | — | 400 | 1.000 | 10.000 | 30.000 |
| Kota üstü etiket başına | — | +0,10 € | +0,09 € | +0,08 € | +0,07 € |

**Ölçümümüz bunu birebir doğruluyor:** FR çıkışında dönen tek fiyatlı taşıyıcılar **Colissimo ve
Mondial Relay** oldu — yani tam olarak Free planın kapsadığı ikili. DPD listede hiç görünmedi.
Kodlardaki `c2c` eki de aynı şeyi söylüyor: pazarlıksız, en alt kademe tarife.

**Kademeler Fransa'da HACME göre tanımlıydı** (Sendcloud'un kendi FR tarife kitapçığı):
*Essentiel* <100 koli/ay · *Small shop* 100–400 · *Large shop* 400–1.000 · *Business* >1.000.
Ve **kademe tarifenin kendisini de değiştiriyor** — ama az: bağımsız incelemeler kademeler arası
farkı **koli başına 0,30–0,70 €** olarak veriyor. Yani üst pakete geçmenin asıl getirisi ucuzluk
değil, **erişim** (DPD ve kendi sözleşmen).

### Kendi DPD sözleşmenizi eklemek isterseniz — ölçülmüş şartlar

- Kimlik bilgileri (**User ID + şifre**) **DPD satış ekibinden** alınıyor; Sendcloud yalnız bağlıyor
- **Ayda en az ~20 koli** tavsiye ediliyor
- ⚠ **İlk ay hiç gönderi yapılmazsa aylık 20 € ceza**; bir aydan uzun kullanılmayan sözleşme
  devre dışı bırakılabiliyor
- DPD FR'de **toplama (collecte) dahil ve ZORUNLU** — depoya günlük alım gelir

### 💡 DPD Fransa gerçekten ne kazandırır — rakamlandı

Sendcloud'un FR kitapçığındaki **DPD Europe (Zone 1)** tarifesi tam bizim sorumuz: *"Fransa ve
Monako'dan çıkan, **Almanya**, Belçika, Lüksemburg ve Hollanda'ya giden gönderiler."*

| Ağırlık | Bugün ödediğimiz (ölçüldü) | DPD Europe FR→DE (kitapçık) | Kazanç |
| --- | ---: | ---: | ---: |
| 1 kg | 10,43 € | 10,48 € | −0,05 € |
| 2 kg | 11,69 € | 11,03 € | +0,66 € |
| 5 kg | 13,48 € | 12,70 € | +0,78 € |
| 10 kg | 20,65 € | 15,48 € | **+5,17 €** |
| 15 kg | 20,65 € | 18,26 € | +2,39 € |
| 20 kg | 27,82 € | 21,03 € | **+6,79 €** |

> **Kendi önerimi düzeltiyorum.** §2e'de *"en ucuz ilk deneme DPD sözleşmesi"* demiştim; rakam
> bunu **kısmen** doğruluyor: hafif gönderide kazanç **kuruşluk**, ağır gönderide **5–7 €**.
> Yani DPD Fransa hafif siparişleri kurtarmıyor — **ağır siparişleri** kurtarıyor.

Ve üçünü yan yana koyunca sıra netleşiyor (FR→DE, eve teslim):

| Ağırlık | Bugün | + DPD Fransa | **Almanya deposu** |
| --- | ---: | ---: | ---: |
| 5 kg | 13,48 € | 12,70 € | **6,92 €** |
| 10 kg | 20,65 € | 15,48 € | **8,45 €** |
| 20 kg | 27,82 € | 21,03 € | **8,45 €** |

**Almanya deposu her kademede DPD Fransa'yı da açık ara geçiyor** (5 kg'da 5,78 € · 20 kg'da
12,58 € daha ucuz). DPD Fransa bir ara adım, alternatif değil.

### Yan bulgu — DPD'nin KUTU TOLERANSI çok daha geniş

§1b'de ölçmüştük: 60×40×40 cm'lik kutuda Mondial Relay listeden düşüyor ve fiyat %65 sıçrıyordu.
Kitapçık sebebini veriyor:

| | Azami ağırlık | Azami ölçü |
| --- | ---: | --- |
| Mondial Relay | 30 kg | **yükseklik + uzunluk + genişlik = 150 cm** |
| Colis Privé | 20 kg | L + l + h < 150 cm |
| **DPD France** | 30 kg | **L + l + h = 200 cm** (tek kenar 300 cm'e kadar) |

Yani DPD sözleşmesi yalnız fiyat değil, **hangi kutuyu gönderebildiğimizi** de değiştiriyor —
büyük hacimli siparişte bugün elimizde tek seçenek (pahalı Colissimo) kalıyor.

### Kullanmadığımız bir Fransız taşıyıcı: Colis Privé

Sendcloud Fransa'da **Colis Privé**'yi de sunuyor (24–48 saat, 4.000 teslim noktası) ve nokta
teslimi Mondial Relay'den ucuz başlıyor (0–0,25 kg **3,23 €** ↔ MR 3,45 €). Ölçümümüzde hiç
görünmedi — yani hesapta etkin değil. Eşik altı yurt içi siparişte müşteriye ikinci bir ucuz
seçenek demek; **etkinleştirilirse aynı script ölçer.**

### Sendcloud dışı seçenekler — abonelik istemeyenler

Fransa'da aynı işi abonelik olmadan yapan toplayıcılar var: **Boxtal** (abonelik yok, hacim
taahhüdü yok, Colissimo/Mondial Relay/DPD dahil), **Packlink PRO** (30+ Avrupa taşıyıcısı, aylık
ücret yok), **Shippingbo**. Bağımsız karşılaştırmalar şunu söylüyor: **taşıyıcıyla doğrudan
pazarlık ayda 300–500 koliden itibaren anlamlı**; altında toplayıcı kullanmak daha ucuz.

⚠ **Kitapçık 2023 tarihli**, kademe adları o günün adları (bugün Free/Lite/Growth/Premium/Pro) ve
fiyatlar **KDV hariç**. Rakamları **sıralama** olarak okuyun, kesin tutar olarak değil — canlı
ölçümle (2026) kitapçık arasında zaten küçük sapmalar var (ör. MR nokta 1 kg: kitapçık 3,86 €,
canlı 4,29 €).

**Kaynaklar:** [Sendcloud — Fransa tarife kitapçığı (PDF)](https://www.sendcloud.com/wp-content/pdf/pricing/Sendcloud-Grille-Tarifaire-France-FR.pdf) ·
[Sendcloud — kendi sözleşmeni ekleme](https://support.sendcloud.com/hc/en-us/articles/360025449372-How-can-I-add-my-own-carrier-contract) ·
[Sendcloud — DPD France sözleşme etkinleştirme](https://support.sendcloud.com/hc/en-us/articles/4404198757780-DPD-contract-activation-France) ·
[Sendcloud — fiyatlandırma](https://www.sendcloud.com/pricing/) ·
[Sendcloud fiyat analizi](https://www.authencio.com/blog/sendcloud-pricing-compare-plans-hidden-costs) ·
[Boxtal alternatifleri karşılaştırması](https://www.lafabriquedunet.fr/logiciels/alternatives/alternative-boxtal) ·
[Sendcloud FR incelemesi](https://saask.fr/softwares/sendcloud/test/)
## 3. Ücretsiz kargonun bize maliyeti — eşik üstü siparişte

Kural (`resolveShippingFee` künyesi): **eşik canlı fiyata bakmaz, çünkü eşik bir pazarlama
sözüdür.** Bugünkü eşik `free_shipping_threshold_cents` = **100 €**.

Ve sizin kuralınız: **ücretsiz kargo EVE gider, teslimat noktasına değil.** İkisi birleşince eşik
üstü siparişin bize maliyeti şu (Fransa içi):

| Sepet ağırlığı | FR içi (eve) | FR → DE/BE/NL/LU (eve) | FR içi payı | Yurt dışı payı |
| --- | ---: | ---: | ---: | ---: |
| 1 kg | 6,03 € | 10,43 € | %6,0 | %10,4 |
| 5 kg | 8,50 € | 13,48 € | %8,5 | %13,5 |
| 15 kg | 15,67 € | 20,65 € | %15,7 | %20,7 |
| 20 kg | 23,86 € | 27,82 € | %23,9 | %27,8 |

**İki şey birden dikkat çekiyor:**

1. **Ağırlık arttıkça pay hızla büyüyor** — 20 kg'lık 100 €'luk bir sipariş, kargoya kârın dörtte
   birinden fazlasını veriyor.
2. **Yurt dışında aynı sepet 4–5 € daha pahalıya gidiyor** ve nokta seçimi de kapalı olduğu için
   ucuzlatma kanalı yok. 1 kg'lık 100 €'luk bir Alman siparişinde kargo payı **%10,4**.

Eşiği **tutara değil, tutar + ağırlığa** ya da **ülkeye** bağlamak konuşulmaya değer (ayarda ülke
kapsamı zaten var — `0013`'te DE için ayrı satır mevcut). Ticari karar sizin; ben sayı önermiyorum.

**Noktaya teslimin ucuz olduğu yerde farkı biz yiyoruz:** 1 kg'da 1,74 €, 15 kg'da 7,80 €. Yani
"eve gitmeli" kuralının bir bedeli var ve bu bedel bilinçli (müşteri deneyimi > birim maliyet).

---

## 4. Teslimat noktası seçimi — referans proje ne yapmış, bizde ne var

### Referansta (`~/dev/petitcigogne`)

- **İki kademeli seçim:** *Point relais (recommandé)* ↔ *À domicile*. Müşteri önce kademeyi seçiyor,
  sonra o kademedeki taşıyıcıları görüyor (`cart-shipping-options.tsx`).
- **Nokta seçimi kendi haritalarında:** Leaflet + OpenStreetMap, `react-leaflet` ile bir diyalog
  (`cart-service-point-dialog.tsx` + `service-point-map.tsx`). Sendcloud'un hazır widget'ı
  KULLANILMAMIŞ — kendi arama kutusu, kendi pin'leri, açılış saatleri kendi biçimlemesi.
- **Seçilen nokta bir ADRES TÜRÜ olarak yaşıyor:** `address.type === 'service_point'` ve normal
  teslimat adresi havuzundan ayrı tutuluyor (`address-mode.ts`) — yani nokta bir "seçenek" değil,
  siparişin gittiği yerin kendisi.
- Bağımlılık: `leaflet` + `react-leaflet` + `@types/leaflet`.

### Bizde

| Parça | Durum |
| --- | --- |
| Sağlayıcı tarafında nokta desteği | ✅ var — `LAST_MILE` kümesinde `service_point` · `locker` · `locker_or_service_point`, teklifler `lastMile` taşıyor |
| Duyuruda noktaya gönderme | ✅ var — `announce` `servicePointId` alıyor, `shipment.service_point_id` kolonu yazılı |
| **Nokta ARAMA ucu** | ❌ **yok** — istemcinin "yakınımdaki noktalar" sorusunu soracağı kapı hiç yazılmadı |
| **Harita / nokta seçici** | ❌ yok (ne web ne native) |
| **Noktanın adres olarak saklanması** | ❌ yok — adres türlerimizde `service_point` kavramı yok |
| Müşteri seçim ekranı | ⚠ var ama **yanlış modelde** — düz taşıyıcı listesi, kademe yok (§5) |

---

## 5. Önerilen model — kullanıcı kurallarının kod karşılığı

Kurallar (28.08): *eşik altında müşteri seçer · eşik üstünde biz seçeriz · ücretsiz kargo eve
gider · her seferinde elle taşıyıcı seçilmez, ön tanımlı listeden süre içinde teslim edenlerin en
ucuzu otomatik · uygun yoksa liste depocuya gösterilir.*

### Eşik ALTI — müşteri seçer

```
sepet < eşik  ve  varış YURT İÇİ   →  checkout iki kademe gösterir
                                        ├─ Teslimat noktası → harita, nokta seçilir
                                        └─ Adrese teslim    → kayıtlı adres
sepet < eşik  ve  varış YURT DIŞI  →  yalnız ADRESE TESLİM seçenekleri listelenir
                                        (kullanıcı kuralı: sınırı geçen sipariş EVE gider)
```
Ücret müşteriden alınıyor, dolayısıyla **seçim onun hakkı**: hangi kanalın ne kadar tuttuğunu
görüyor ve ödüyor. Bugünkü ekranın eksiği kademe ayrımı, nokta seçicisi ve **yurt dışında kademenin
hiç çizilmemesi**.

> Kademe kararı **varış ülkesine** bakar, mesafeye değil: ölçümde Strasbourg'un 3 km ötesindeki
> Kehl (DE) ile Berlin aynı tarifeye düşüyor. "Sınır" burada coğrafi değil, tarifenin kendi çizgisi.

### Eşik ÜSTÜ — biz seçeriz, eve gider

```
sepet ≥ 100 €  →  müşteriye "Ücretsiz kargo · adrese teslim" YAZILIR, seçim sorulmaz
                  arka tarafta otomatik seçim:
                    onaylı taşıyıcı listesi
                      ∩ lastMile = home_delivery        ← nokta ELENİR (kullanıcı kuralı)
                      ∩ teslim süresi ≤ azami süre
                      ∩ (çok koliyse) multicollo destekli
                    → en ucuzu
                  hiçbiri kalmazsa → ham liste DEPOCUYA gösterilir, o seçer
```

### İki ölçülmüş tuzak

**(a) `sendcloud:letter` (§0).** Onaylı liste hem müşteri kademelerini hem otomatik seçimi
korumalı — yoksa "en ucuz" daima 0,00 €'luk mektuptur.

**(b) Teslim süresi ÇOĞU SEÇENEKTE BOŞ.** Ölçüldü: Mondial Relay seçeneklerinin **`leadTimeHours`
değeri `null`** (Colissimo'da 48 sa, uluslararasında 96 sa dolu). En ucuz seçenekler tam da süresi
bilinmeyenler. Yani *"süre içinde teslim edenler"* süzgeci ham hâliyle **en ucuzları eler**.
Öneri: süre bilinmiyorsa seçenek elenmez ama **onaylı listede süresi elle yazılabilir** — bilgi
sağlayıcıdan gelmiyorsa bizim bildiğimiz gerçekten gelir. *(Ölçülemeyen değer sıfır değildir —
`CLAUDE §1`; burada da "süresi yok" ≠ "süresi sonsuz".)*

---

## 6. Yapılacaklar — ve hangi şeritte

| # | İş | Şerit |
| --- | --- | --- |
| 1 | **Onaylı taşıyıcı listesi** (ayar) + `quoteShipping`'e beyaz liste süzgeci · `sendcloud:letter` arızasının kapanması | kargo/arka uç |
| 2 | **Otomatik seçim politikası** — onaylı ∩ süre ∩ multicollo → en ucuz; eşik üstünde ayrıca `home_delivery` zorunlu | kargo/arka uç |
| 3 | Checkout'un **iki kademeye** dönmesi (nokta ↔ eve); eşik üstünde seçimin hiç sorulmaması | müşteri yüzeyi (web) |
| 4 | **Nokta arama ucu** (`/service-points`) — sağlayıcıda var, bizde kapısı yok | kargo/arka uç |
| 5 | **Harita seçici** — web (Leaflet, referans deseni) | müşteri yüzeyi (web) |
| 6 | **Harita seçici** — native (React Native harita, ayrı bağımlılık kararı) | mobil |
| 7 | Noktanın **adres türü** olarak saklanması (`service_point`) | arka uç + iki yüzey |
| 8 | **Depocu fallback seçimi** — otomatik seçim boş dönerse hazırlık ekranında liste | mobil |
| 9 | Sendcloud panelinde **Almanya gönderici adresi + DE sözleşmeleri**, sonra DE→DE ölçümünün tekrarı | kullanıcı (panel) + ölçüm |
| 10 | **Yurt dışı varışta nokta kademesinin hiç çizilmemesi** (kullanıcı kuralı) | müşteri yüzeyi + mobil |

**Sırası bizde olan:** 8 (ve 6, harita kararı verilince). Ötekiler kargo/müşteri şeridinin dosyaları
— talep dosyasıyla iletiliyor.

---

## 7. Açık kalan sorular (sizin kararınız)

1. **İsviçre satılacak mı?** Gümrük beyanı ayrı bir iş ve nokta teslimi orada yok. Ölçüldü: 15
   kg'da **48,89 €** — Almanya'nın iki katından fazla. Açıksa fiyatlandırma ayrı düşünülmeli;
   kapalıysa checkout'un ülkeyi reddetmesi gerekir.
2. **Ağır ve yurt dışı siparişte eşik.** 20 kg'lık 100 €'luk sepette kargo 23,86–27,82 €. Eşik
   ağırlığa/ülkeye de bakmalı mı, yoksa ağır ürünlerin fiyatına mı gömülmeli?
3. **Onaylı listede kim var?** Ölçümdeki gerçek adaylar: **Mondial Relay** (neredeyse her satırda
   en ucuz — ama **çok koli desteklemiyor** ve yurt içinde teslim süresi bildirmiyor),
   **Colissimo** (her boyda var, süre belli: 48 sa yurt içi / 96 sa yurt dışı), **Chronopost**
   (hızlı, pahalı). Mondial Relay'i listeye almak, çok kutulu siparişte otomatik seçimin ona hiç
   düşmemesi demek — yani çok kutulu gönderilerde fiyat bir anda Colissimo seviyesine çıkar.
4. **Almanya deposu için panel adımı.** Gönderici adresi eklenmeden DE→DE ölçülemiyor (§2). Bunu
   siz eklerseniz aynı gün tabloyu üretirim.

---

## Ek — ölçüm nasıl tekrarlanır

Matris script'i bu turda **scratchpad'de** yazıldı ve repoya konmadı (kargo şeridinin
`scripts/sendcloud-*` ailesine ait). Kalıcı hâle getirilecekse adı `scripts/sendcloud-rates.ts`
olur ve `pnpm sendcloud:rates` ile koşar. Çağrı **ücretsizdir** (salt okuma); tarife değiştiğinde
tabloyu tek komutla tazeler.
