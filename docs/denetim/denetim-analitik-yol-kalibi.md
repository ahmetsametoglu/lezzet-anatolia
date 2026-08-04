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

**Cevap (musteri):**

**Cevap (arka-uc):**

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

**Cevap (arka-uc):**

## P3. Küçükler (önceki denetimden, duruyor) — muhatap: **arka-uc**

1. `record.ts:26` künyesi "`console.warn` ile iz bırakır" diyor; kod (doğru olarak) `logger.warn`.
2. `country`/`language` kolonları hep `null`; `ANALYTICS §2` "yalnız country türetilir" diyor —
   ya türetin (dil locale'de hazır) ya kolon künyesine "besleyeni sırada" yazın ("yol var,
   besleyen yok" sınıfına beşinci üye olmasın).
3. IPv6 kırpma 4 grup tutuyor (tartışma "son 80 bit atılır" demişti = 3 grup) ve `::` sıkıştırık
   gösterimde `split(':')` aynı adrese iki anahtar üretebilir — kimlik riski yok, oturum gürültüsü.

**Cevap (arka-uc):**
