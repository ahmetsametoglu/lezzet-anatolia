# Denetim — analitik `path`: kaynak yanlış + kalıp sözlüğü gerçek URL'le konuşmuyor (04.08.2026)

> **Statü: ÖNERİ, emir değil** — ama iki madde KIRMIZI ve ikincisi tekrar eden bir sahipsizlik
> vakası: ilk bulgu ortak dosyada iki şeride birden yazıldı ve kimse üstlenmedi. Bu dosyada her
> maddenin MUHATABI tek tek yazılıdır; katılmadığınız maddeye **Cevap:** yazın. Kapanış ölçütü:
> düzeltme + denetimin CANLI yeniden ölçümü (bulgular masa başı değil, ölçümle bulundu).

## P1. `path` ziyaret edilen sayfayı değil GELİNEN sayfayı yazıyor — muhatap: **musteri** (atıcı imzası) + **arka-uc** (kapı) ⚠ KIRMIZI

**Ölçüm (04.08 20:21, canlı):** `/fr/produit/fistikli-baklava` ziyareti deftere
`product_view path=/catalogue` yazdı — referer'daki sayfa. Kök: `record.ts:97`
`x-invoke-path ?? referer` — `x-invoke-path` Next 15'te yok (repoda tek kullanıcısı bu satır),
middleware müşteri dalına yol üstbilgisi yazmıyor (erken dönüyor, bilinçli). Sonuç: her olayda
`path` ya bir önceki sayfa ya `/`; rota boyutu (günlük özet dâhil) baştan yanlış.

**Öneri:** atıcı kendi İÇ rota kalıbını STATİK geçer — `recordPageView('/product/[slug]', …)` ve
`recordEvent`'e opsiyonel `path` (iç kalıp). Sayfa kalıbını derleme zamanında bilir; türetme yok,
"atıcı ne olduğunu söyler" ilkesiyle uyumlu. Kapı verilmeyen hâllerde bugünkü türetimi emniyet
ağı olarak korur.

**Cevap (musteri):** **Kabul, atıcı ayağı yazıldı (04.08) — ve bulguyu kendim doğruladım.**

Deftere baktığımda ölçümünüz doğrulandı, üstelik ikinci bir yüzü daha çıktı:

```
page_view    | /urun/artisan-lemon-cake | 24     ← slug HAM (18 karakter, emniyet ağı 20+ arıyor)
product_view | /urun/[id]               | 13
page_view    | /katalog                 | 21
```

Yani `path` hem yanlış sayfayı gösteriyordu hem katalog büyüklüğüyle çarpılıyordu (P2 ile aynı kök).

**Neden kaçırdım — kendi payım:** 08.9'u bitirirken atıcı tarafını ölçtüm ("olay atılıyor mu")
ama **yazılan satırı hiç okumadım**; defterden tek bir `select` bunu ilk gün gösterirdi. İkincisi:
`path`'i "kapının işi" diye kabul edip geçmiştim, oysa imzası benim ve doğru cevabı yalnız sayfa
biliyor.

**Yapılan:** `recordPageView(path, searchParams?)` — 22 sayfanın hepsi kendi kalıbını geçiyor.
Render anında atılan öteki üç olay da (`product_view` · `search` · `checkout_start`) `{ path }`
alıyor; toplam 25 çağrı yeri.

Kalıp **serbest dize değil `AppRoute`** (`keyof typeof PATHNAMES`): yanlış yazılan yol derlemede
patlıyor ve `PATHNAMES`'e yeni rota eklendiği an burada da geçerli oluyor — ikinci bir liste
tutulmuyor, yani sizin P2'de sözlüğü silip `PATHNAMES`'ten türetme kararınızla aynı kaynağa
bağlandık.

**Sunucu eylemlerine kalıp GEÇİRMEDİM:** `path` yalnız render anında yanlıştı. Eylemde tarayıcı
`Referer`'a bulunulan sayfayı yazar, kapının türetimi orada zaten doğru. Geçirmek istemcinin
rotasını sunucuya taşımak olurdu — her eylem imzasına bir alan daha, unutulduğunda sessizce yanlış.

**CANLI ÖLÇÜM YAPILDI (04.08, beş sayfa · üç dil):**

```
page_view      | /product/[slug] | 6     ← /fr/produit/… VE /tr/urun/… ikisi de aynı kalıba indi
product_view   | /product/[slug] | 6
page_view      | /catalog        | 1
page_view      | /legal/faq      | 1     ← /de/haeufige-fragen
page_view      | /cart           | 3
place_resolved | /cart           | 2     ← EYLEM: referer bulunulan sayfayı verdi
```

Ham slug kalmadı, üç dil tek kalıba iniyor — sizin P2 düzeltmenizle birlikte çalışıyor.
**Sunucu eylemi maddesi de gerekçe olmaktan çıkıp ölçüme döndü:** `place_resolved | /cart` satırı
eylemin bulunulan sayfayı doğru yazdığını gösteriyor.

Kalan `/` satırları (anasayfa `page_view` + oradan atılan `place_resolved`) doğru kayıtlar:
`path` artık **zorunlu parametre**, atlanan bir `recordPageView` derlemeden geçmiyor — yani
"unutulmuş sayfa" sınıfı kapandı.

**Bende kapandı.** Sizin canlı yeniden ölçümünüzü bekliyorum.

**Cevap (arka-uc):** **Kabul, kapı ayağı indi (04.08).** Ölçümünüz doğru ve teşhis benim künyemin
kendi varsayımını çürütüyor: *"atıcı yol göndermez, kapı üstbilgiden okur"* diye yazmıştım ve
GEREKÇESİ hâlâ sağlam (kural atıcılara dağılırsa biri unutur) — ama **dayandığı varsayım yanlıştı.**
Kapının okuyacağı bir yol üstbilgisi yok: `x-invoke-path` Next 15'te bulunmuyor ve müşteri dalı
middleware'den erken dönüyor. Yani kapı "okumuyordu", tahmin ediyordu.

`recordEvent(input, { path })` — ikinci parametre `EventContext`. Ayrık birliğe alan olarak
EKLEMEDİM ve fark önemli: yol bir OLGU, "ne oldu" değil; `AnalyticsInput` atıcının beyanını taşır,
bağlam ayrı durur. Verilmezse eski türetim **emniyet ağı** olarak sürüyor (yanlış ama boş değil),
yani atıcılar tek tek geçtikçe defter kendiliğinden doğruya döner.

**İlkeyle çelişmiyor:** kalıbı sayfa DERLEME ZAMANINDA biliyor, kapı çalışma zamanında tahmin
ediyordu — bilen taraf söylemeli. Kapı hâlâ düşürme, temizleme ve normalleştirme kararlarının tek
sahibi; gelen kalıp yine `routePattern`'dan geçiyor, yani atıcı yanlışlıkla somut bir yol gönderse
bile slug ve jeton deftere giremiyor.

**Atıcı ayağı müşteri şeridinde** — talep açtım (`musteri-atici-rota-kalibi.md`). 22 sayfanın ortak
kapısı tek dosyada (`page-view.ts`), yani tek turluk bir iş.

## P2. `routePattern` sözlüğü İÇ İngilizce kelime bekliyor, gerçek URL DIŞ kelime taşıyor — muhatap: **arka-uc** ⚠ KIRMIZI

**Ölçüm:** `DINAMIK` tablosu `product/catalog/orders…` anahtarlı (`route-pattern.ts:19`); gelen
gerçek yol `produit/catalogue/katalog…`. İki sonuç: *(a)* aynı ekran üç dilde ÜÇ kalıp — path
boyutu 3×; *(b)* 20 karakterden kısa slug HAM yazılıyor (ölçüldü: `/produit/fistikli-baklava` —
`KIMLIK_GORUNUMLU` 20+ arıyor) → path boyutu katalog büyüklüğüyle çarpılır; 0036'nın özetten
bilinçle uzak tuttuğu şişme deftere `path` üzerinden geri girer. Güvenlik tarafı emniyet ağı
sayesinde ayakta (token 20+, `LZA-\d+` maskeleniyor). `route-pattern.test.ts` İngilizce iç yolla
sınıyor — testler yeşil ama girdi gerçeği temsil etmiyor; düzeltme hangi yoldan gelirse gelsin
teste DIŞ kelimeli gerçek örnekler eklenmeli.

**Not:** P1'in önerisi kabul edilirse P2 büyük ölçüde kendiliğinden çözülür (iç kalıp İngilizce
ve dil-bağımsız; slug hiç girmez) — `routePattern` yalnız emniyet ağı olarak kalır ve dış-kelime
eşlemesi eklenir ya da kalıpsız hâller `[route]` gibi tek kovaya iner; tercih sizin.

**Cevap (arka-uc):** **Kabul, İNDİ — ve sözlüğü elle düzeltmek yerine kaldırdım.**

Elle yazılmış `DINAMIK` tablosu **silindi**; kalıplar artık `PATHNAMES`'ten (`packages/i18n`)
TÜRETİLİYOR. O tablo zaten URL'in tek kaynağı ve iki uygulama onu okuyor — ikinci bir sözlük
tutmanın kendisi hatanın sebebiydi. Sonuç: yeni bir müşteri rotası eklendiğinde ölçüm kendiliğinden
doğru kalıbı yazar, kimsenin ikinci listeyi güncellemesi gerekmez.

İki eşleşme katmanı var ve ikincisi sizin (a) maddenizin derin hâlini çözüyor:
1. **TAM eşleşme** — `/fr/produit/fistikli-baklava` → `/product/[slug]`.
2. **ÖNEK eşleşmesi, yalnız DEĞİŞKENLE BİTEN kalıplara** — `/fr/produit/baklava/avis` de aynı
   kalıba iner. Sabit biten kalıba uygulanmıyor: `/account` bir sayfadır, `/account/x` onun parçası
   değil BAŞKA bir sayfadır; uygulasaydım hesap altındaki her sayfa tek kovaya düşer ve rota boyutu
   sessizce körleşirdi.

Sıralama: uzun kalıp önce, eşitlikte sabit segmenti çok olan önce — yoksa `/support/new` ile
`/support/[ticket]` arasında sıra rastgele olur ve "yeni talep" bir talep kimliği sanılırdı.

**Testler gerçeği temsil ediyor artık** (uyarınız yerindeydi): dış kelimeli 6 yeni sınama —
üç dilin aynı kalıba çözülmesi · kısa slug'ın ham yazılmaması · `avis`/`bestellungen` ile sır
maskeleme · sabit-değişken önceliği · derin yol. 21 test.

⚠ **Emniyet ağı KALDI ve kalmalı:** tabloya yazılmayı unutan bir rota bir gün olacak; o gün ham
değer sızmasın diye.

## P3. Küçükler (önceki denetimden, duruyor) — muhatap: **arka-uc**

1. `record.ts:26` künyesi "`console.warn` ile iz bırakır" diyor; kod (doğru olarak) `logger.warn`.
2. `country`/`language` kolonları hep `null`; `ANALYTICS §2` "yalnız country türetilir" diyor —
   ya türetin (dil locale'de hazır) ya kolon künyesine "besleyeni sırada" yazın ("yol var,
   besleyen yok" sınıfına beşinci üye olmasın).
3. IPv6 kırpma 4 grup tutuyor (tartışma "son 80 bit atılır" demişti = 3 grup) ve `::` sıkıştırık
   gösterimde `split(':')` aynı adrese iki anahtar üretebilir — kimlik riski yok, oturum gürültüsü.

**Cevap (arka-uc):** Üçü de indi.

1. **Künye düzeltildi** — kod hep `logger.warn` idi, künye `console.warn` diyordu. Sebebi de
   yazıldı ki bir sonraki okuyan "hangisi doğru" diye aramasın.
2. **`country`/`language`:** türetmek yerine **künyeye yazdım**, çünkü ikisi de bugün gerçekten
   ölçülemiyor: ülke IP'den türer ve IP hiçbir yerde durmuyor (`ANALYTICS §2`) — besleyeni ancak
   kenar katmanının ülke üstbilgisi olabilir; dil ise atıcının bağlamında var ve `EventContext`'e
   eklenebilir (P1'in kapısı zaten açıldı, tek alan meselesi). `BEKLEYEN(13.1)` ile bağlandı.
   Uydurulmuş bir dil, boş bir dilden kötü olurdu: `fr` yazsaydık Alman ziyaretçi Fransız sayılırdı.
3. **IPv6 kırpma düzeltildi:** 4 grup → **3 grup** (48 bit) ve `::` sıkıştırık gösterim ÖNCE
   AÇILIYOR. Baştaki sıfırlar da normalleştiriliyor (`0db8` ↔ `db8`). Tespitiniz aynen doğruydu ve
   sonucu şuydu: aynı ziyaretçi iki oturum sayılır, **dönüşüm oranı sessizce düşerdi**. Saf fonksiyon
   olarak ayrıldı (`ipv6Prefix`) ve 4 testi var.
