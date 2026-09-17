# Rakip Haritası ve Fiyat Politikası

> **Ölçüm günü: 17.09.2026.** Kaynak, rakiplerin herkese açık ürün uçları. Ham veri ve betikler
> `temp/rakipler/` altında (git dışı). Sıra: `node temp/rakipler/indir.mjs` katalogları indirir,
> `node temp/rakipler/birim.mjs` Shopify ilanlarının net miktarını okur, `node temp/rakipler/aday.mjs`
> eşleştirmeyi denetler, `node temp/rakipler/eslesme.mjs` piyasa fiyatını hesaplar,
> `tsx temp/rakipler/oneri.ts` satış fiyatlarını ve aşağıdaki tabloları üretir. Rakip fiyatı rakibin kendi
> sitesindeki KDV dahil fiyattır. Ülkelerin gıda KDV'si farklıdır (DE %7 · BE %6 · FR %5,5 · NL %9 · CH %2,6);
> hesaba girmez. CHF, ECB'nin 16.09.2026 kuruyla (1 EUR = 0,9449 CHF) çevrilir.

## Kim, nerede

Hedef pazar önce Fransa ve Almanya, sonra Avrupa. Rakibin Fransa'ya gönderip göndermemesi seçim ölçütü değildir.

| Mağaza | Ülke | Altyapı · veri ucu | Ürün (satır) | Stoksuz | İndirimli görünen | Kabul · hesapta | Not |
|---|---|---|---|---|---|---|---|
| gurmeavrupa.de | DE | Shopify · `products.json` | 90 (91) | %25 | %0 | 20 · 8 | Donuk ürünü kendi aracıyla teslim ediyor, kargo ücreti yok |
| degrandbazaar.be | BE | Lightspeed · sayfa `?format=json` | 375 | %16 | %13 | 26 · 13 | Behotrade'in ülkesinde; kiler ve bitki rafımızın tamamını satıyor |
| oznatur.de | DE | Shopify · `products.json` | 687 (695) | %7 | %42 | 44 · 35 | Ürün adında boy yok; boy birim fiyat ölçüsünden okunur |
| turkmarket.eu | DE | WooCommerce · Store API | 116 | %7 | %59 | 29 · 19 | Lezita markalı 4 ürün; kalıcı indirim, satış fiyatı alınır |
| dodom.be | BE | Shopify · `products.json` | 1.614 | %13 | %5 | 77 · 38 | |
| aima-online.de | DE | Shopify · `products.json` | 3.400 (3.403) | %6 | %1 | 108 · 38 | |
| foodpaket.de | DE | Shopify · `products.json` | 897 (914) | %13 | %7 | 19 · 9 | |
| bizimkiler.ch | CH | Shopify · `products.json` | 467 (826) | %13 | %22 | 50 · 0 | İsviçre: hesap dışı |
| yasamfood.com | NL | Shopify · `products.json` | 71 (79) | %14 | %3 | 14 · 7 | |
| morgenmarkt.de | DE | Site haritası · sayfadaki ürün verisi | 5.450 | %74 | — | 226 · 17 | Yalnız aday sayfaları açılır (710); açılanların çoğu stoksuz |
| turkishmarket.ch | CH | Ecwid · genel API | 204 (436) | %12 | %19 | 27 · 0 | İsviçre: hesap dışı |
| anadoludanikram.com | BE | Shopify · `products.json` | 31 (34) | %15 | %0 | 15 · 5 | |
| dogaltakil.com | NL | Shopify · `products.json` | 437 (496) | %8 | %83 | 20 · 17 | Kalıcı indirim, satış fiyatı alınır |
| istanbul-market.com | FR | Shopify · `products.json` | 186 | %16 | %4 | 7 · 4 | |
| back-lava.de | DE | Shopify · `products.json` | 82 (176) | %35 | %65 | 3 · 0 | Kalıcı indirim, satış fiyatı alınır |
| deliceland.com | FR | WooCommerce · Store API | 74 | %0 | %12 | 0 · 0 | Eşleşen kalem yok |
| hasan-oezdag.com | DE | Shopify · `products.json` | 2.117 (4.424) | %0 | %2 | 0 · 0 | Kişiye özel pasta seçenekleri süzülür; eşleşen kalem yok |
| tunamarket.fr | FR | WooCommerce · Store API | 281 | %0 | %0 | 15 · 4 | Mağaza fiyatı, online satış yok; kabul edilen 15 ilanın 9'unda boy yazmıyor |

- **Satır** bir satılabilir boydur (varyant). İndirimli payı fiyatı okunan satırlardan, stoksuz payı stok bilgisi okunan satırlardan hesaplanır.
- **Listede olmayanlar:** anadolulezzetleri.de (160 ürünün hepsi 29.07–03.08.2025'te eklenmiş, sonrasında yeni ürün yok); grandturkishbazaar.com (merkez İstanbul, fiyatlar USD).
- **Ücretsiz kargo eşiği:** bizde 125 €, oznatur'da Almanya içinde 100 €; gurmeavrupa hiç kargo ücreti almıyor.

## Bizim markalarımız rakipte

- **Lezza ve Lamour adı hiçbir sitede geçmiyor.** Lezita adı turkmarket'te 4 üründe geçiyor; tavuk burger, kanat ve çıtır fileto bunların arasında.
- **Lezza kataloğuyla boyu ve tarifi birebir aynı ürünler var:** gurmeavrupa'da cheesecake 1.800 g, trileçe 2.000 g, Maraş dondurması 70 g dilim ve 500 g; degrandbazaar'da künefe 2×145 g (şerbet içinde) ve çıtır simit (%80 pişmiş, 4 adet). Ambalajı görmediğimiz için markası kesin değil.
- **Zühre Ana:** oznatur'da 55, bizimkiler'de 65, dodom'da 10, degrandbazaar'da 9 satır.
- **Şifamix:** degrandbazaar, oznatur ve bizimkiler'de 4 satır; ikisi bizde olmayan Detox kahve.
- **Beşe:** hiçbir sitede yok.

## Eşleştirme

Anahtar sözcük yalnız aday bulur; ilanı kalemle eşleştiren karar daima elle yazılır (`temp/rakipler/kararlar.mjs`). Kalemler ve kurallar `temp/rakipler/kalemler.mjs`'te.

1. **Aday:** kalemin tür sözcükleri (Türkçe, Almanca, Fransızca, Hollandaca, İngilizce) ürün adında geçen ilan adaydır. Türkçe ek ve Almanca bileşik sözcük için sözcüğün başı eşlenir (Käsefüllung, Traubensirup, Maulbeerextrakt).
2. **Kapı:** kalemin öznitelik şartı (peynirli, tavuk, sirke…) sağlanmayan ilan aday olmaz.
3. **Adlı ret kuralı:** gerekçesi yazılı otomatik ret (koli, fıstıklı çikolata, nar ekşisi sosu…). Elle verilen karar kuralı ezer ve kayıtta görünür.
4. **Kabul:** boyuyla ve gerekiyorsa özniteliğiyle yazılır: sirke türü, zeytinyağı sınıfı, fıstık kabuğu, tahin çeşidi, köken. Karar bekleyen aday varken piyasa fiyatı yazılmaz.
5. **Ters tarama:** ürün ailesi ağına düşüp hiçbir kaleme aday olmayan her satır, kimliğiyle ya da bir sınıfla "görüldü" işaretlenir. Kaçan eşleşme burada yakalanır.
6. **Boy:** ürün adındaki boy esastır. Adda boy yoksa sitenin birim fiyat için girdiği net miktar (Shopify `unit_price_measurement`) kullanılır; ölçüm gününde yalnız oznatur ve foodpaket bu alanı dolduruyor. Adla çelişen ölçü kopyalanmış sayfadan kalmıştır, kullanılmaz. oznatur'un gram alanı gönderi ağırlığıdır (kavanoz dahil), boy değildir.

Ölçüm gününde 19.670 satırdan 2.044 aday çıktı: 904'ü kuralla, 440'ı elle reddedildi, 700'ü elle kabul edildi. Ters taramada 1.406 satır görüldü. Denetim `node temp/rakipler/aday.mjs`; bekleyen aday, sahipsiz karar ve görülmemiş satır sıfır olmalıdır.

## Fiyat politikası

İşletmecinin kararı. Beslemedeki fiyatlar (`scripts/seed-real/data.ts` · `SALE_PRICES`) bu kuralın ölçüm günündeki çıktısıdır.

- **Profesyonel fiyat (HT)** = alış × 1,40.
- **Son tüketici fiyatı (TTC)** = alış × piyasa katsayısı.
- **Taban:** son tüketici fiyatı, profesyonel fiyatın KDV'li hâlinin altına inmez (alış × 1,40 × 1,055 ≈ alış × 1,48).
- **Kâr oranı alış üzerinden** hesaplanır: kâr ÷ alış; aldığın fiyatın iki katına satınca %100. Projenin tek tanımı budur ([`margin.ts`](../../packages/domain-core/src/pricing/margin.ts)). Perakende fiyat önce KDV'den arındırılır: net = TTC ÷ 1,055.

### Piyasa katsayısı

Piyasa katsayısı, rakip ilan fiyatlarının (bizim boya çevrilmiş) medyanının bizim alışımıza oranıdır.

1. **Fiyat:** liste fiyatı alınır. Ürünlerinin yarısından çoğu indirimli görünen sitede liste fiyatı kalıcı bir çıpadır; orada satış fiyatı alınır (ölçüm gününde turkmarket %59, dogaltakil %83, backlava %65).
2. **Boy:** ilan bizim boya orantıyla çevrilir; ağırlık ağırlıkla, parça parçayla. g ile ml 1:1 kabul edilir.
3. **Medyan:** birden çok ilan varsa medyan alınır. Örnek: 5 l zeytinyağında yedi ilan 45,00–79,99 € arasında, medyan 55,00 €.
4. **Kalem tanımı (işletmecinin cevapları):** sirke doğal fermente sirkedir, etiketinde yazmayan sayılmaz. Zeytinyağı sızmadır, Antep fıstığı kabukludur. Nar kalemi nar özüdür, nar ekşisi sayılmaz. Katı pekmez ile sıvı pekmez, fıstıklı muska ile fındıklı muska ayrı ürünlerdir.
5. **Listelenir ama hesaba girmez:** stoksuz ilan; İsviçre sitelerinin ilanı; 10'lu ve üstü koli; boyu bizimkinin yarısından küçük ya da iki katından büyük ilan; boyu ne adında ne birim fiyat ölçüsünde yazan ilan; organik ürün.

Bir kalemin kendi katsayısı **en az iki ilanla** hesaplanır. Daha az ilanı olan kalemin katsayısı sırasıyla **ailesinden**, **kategorisinden** (en az iki kalem varsa) ya da **bütün kalemlerin medyanından** alınır.

| Grup | Kalem | Katsayı | Aralık |
|---|---|---|---|
| Aile · Kuru Meyve | 1 | 3,30 | — |
| Aile · Sirke | 5 | 3,15 | 1,98–3,48 |
| Aile · Bitki Özü | 2 | 2,18 | 1,57–2,78 |
| Aile · Zeytinyağı | 2 | 2,09 | 1,84–2,33 |
| Aile · Tavuk Fileto | 1 | 2,00 | — |
| Aile · Macun | 2 | 1,72 | 1,25–2,19 |
| Aile · Pekmez | 2 | 1,33 | 1,26–1,41 |
| Kategori · Kuru Meyve & Kuruyemiş | 2 | 2,31 | 1,32–3,30 |
| Kategori · Doğal & Geleneksel | 16 | 2,08 | 1,15–3,48 |
| Kategori · Fırın | 4 | 1,89 | 1,83–2,11 |
| Kategori · Et & Tavuk | 5 | 1,76 | 1,44–2,00 |
| **Genel medyan** | **29** | **1,92** | 1,15–4,28 |

### Kalem kalem

Piyasa fiyatı çıkan 37 kalem. "İlan · site" hesaba giren ilan ve site sayısıdır; "Rakip" bu ilanların bizim boya
çevrilmiş fiyat aralığıdır. Tek ilanlı kalemde katsayı parantezdeki gruptan gelir. Fiyatlar € cinsinden; profesyonel
fiyat KDV hariç, son tüketici fiyatı KDV dahil.

| Ürün | Alış | İlan · site | Rakip (bizim boyda) | Piyasa | Katsayı | Profesyonel | Son tüketici |
|---|---|---|---|---|---|---|---|
| Peynirli E Böreği 200 g | 0,52 | 1 · 1 | — | 2,00 | 1,89 (kategori Fırın) | 0,73 | 0,99 |
| Vegan Çiğ Köfte Topu 1000 g | 3,50 | 2 · 2 | 9,95–19,98 | 14,97 | 4,28 | 4,90 | 14,97 |
| Şerbetli Künefe 2 × 145 g | 3,05 | 6 · 6 | 4,49–6,95 | 5,87 | 1,92 | 4,27 | 5,87 |
| Simit 4 × 105 g | 1,75 | 4 · 4 | 3,49–3,95 | 3,70 | 2,11 | 2,45 | 3,70 |
| Su Böreği 800 g | 4,50 | 3 · 3 | 4,95–9,58 | 8,22 | 1,83 | 6,30 | 8,22 |
| Peynirli Kol Böreği 800 g | 2,70 | 2 · 2 | 4,95–5,59 | 5,27 | 1,95 | 3,78 | 5,27 |
| Açma 4 × 80 g | 2,15 | 3 · 3 | 3,50–4,99 | 3,95 | 1,84 | 3,01 | 3,95 |
| Sade Poğaça 4 × 80 g | 1,80 | 1 · 1 | — | 3,50 | 1,89 (kategori Fırın) | 2,52 | 3,41 |
| Tavuk Fileto 10 × 70 g | 3,65 | 7 · 5 | 5,13–10,26 | 7,29 | 2,00 | 5,11 | 7,29 |
| Acılı Tavuk Fileto 10 × 70 g | 3,60 | 1 · 1 | — | 6,03 | 2,00 (aile Tavuk Fileto) | 5,04 | 7,19 |
| Acılı Tavuk Kanat 700 g | 3,50 | 5 · 3 | 5,24–10,26 | 6,17 | 1,76 | 4,90 | 6,17 |
| Geleneksel Et Döner 700 g | 8,00 | 6 · 5 | 7,99–16,79 | 11,49 | 1,44 | 11,20 | 11,82 **taban** |
| Geleneksel Tavuk Döner 700 g | 6,10 | 6 · 4 | 5,24–15,39 | 9,45 | 1,55 | 8,54 | 9,45 |
| Kıymalı Mantı 1000 g | 5,15 | 11 · 5 | 7,00–14,98 | 9,49 | 1,84 | 7,21 | 9,49 |
| Üzüm Pekmezi 650 g | 5,50 | 20 · 9 | 4,63–9,39 | 7,74 | 1,41 | 7,70 | 8,12 **taban** |
| Keçiboynuzu Pekmezi 650 g | 5,50 | 12 · 6 | 4,59–10,25 | 6,92 | 1,26 | 7,70 | 8,12 **taban** |
| Tahin 500 g | 4,75 | 31 · 7 | 2,65–8,73 | 5,45 | 1,15 | 6,65 | 7,02 **taban** |
| Alıç Sirkesi 500 ml | 3,00 | 6 · 5 | 3,99–10,90 | 9,49 | 3,16 | 4,20 | 9,49 |
| Ananas Sirkesi 500 ml | 3,00 | 6 · 4 | 8,99–11,99 | 10,45 | 3,48 | 4,20 | 10,45 |
| Enginar Sirkesi 500 ml | 3,00 | 5 · 5 | 3,99–9,99 | 8,99 | 3,00 | 4,20 | 8,99 |
| Elma Sirkesi 500 ml | 3,00 | 6 · 5 | 2,49–9,99 | 5,95 | 1,98 | 4,20 | 5,95 |
| Işkın Kökü Sirkesi 500 ml | 3,00 | 6 · 5 | 5,99–10,99 | 9,45 | 3,15 | 4,20 | 9,45 |
| Şifamix Kozalak Özü 670 g | 4,25 | 1 · 1 | — | 12,36 | 2,18 (aile Bitki Özü) | 5,95 | 9,25 |
| Şifamix Keçiboynuzu Özü 700 ml | 3,75 | 6 · 4 | 6,66–19,98 | 10,43 | 2,78 | 5,25 | 10,43 |
| Coconut Mix 250 ml | 4,95 | 3 · 2 | 12,50–19,99 | 15,90 | 3,21 | 6,93 | 15,90 |
| Zeytinyağı 5 l | 29,90 | 7 · 7 | 45,00–79,99 | 55,00 | 1,84 | 41,86 | 55,00 |
| Zeytinyağı 750 ml | 5,50 | 22 · 7 | 7,49–19,79 | 12,82 | 2,33 | 7,70 | 12,82 |
| Antep Fıstığı 700 g | 16,50 | 3 · 3 | 19,99–25,99 | 21,79 | 1,32 | 23,10 | 24,37 **taban** |
| Bromelain Şurubu 250 ml | 8,00 | 6 · 4 | 9,90–19,99 | 14,99 | 1,87 | 11,20 | 14,99 |
| Zühre Ana Kekre Termojenik Mix 250 ml | 8,45 | 1 · 1 | — | 16,90 | 2,08 (kategori Doğal & Geleneksel) | 11,83 | 17,62 |
| Propolis Macunu 240 g | 8,50 | 1 · 1 | — | 13,99 | 1,72 (aile Macun) | 11,90 | 14,60 |
| Form Macunu 240 g | 8,00 | 2 · 2 | 14,99–19,99 | 17,49 | 2,19 | 11,20 | 17,49 |
| Kozalak Macunu 240 g | 8,00 | 3 · 2 | 7,90–13,99 | 9,99 | 1,25 | 11,20 | 11,82 **taban** |
| Karadut Özü 670 g | 7,25 | 5 · 4 | 9,56–19,99 | 11,39 | 1,57 | 10,15 | 11,39 |
| Fındıklı Muska Pestil 300 g | 3,95 | 1 · 1 | — | 7,99 | 2,08 (kategori Doğal & Geleneksel) | 5,53 | 8,23 |
| Kurutulmuş Elma 180 g | 2,75 | 1 · 1 | — | 8,09 | 3,30 (aile Kuru Meyve) | 3,85 | 9,06 |
| Kurutulmuş Trabzon Hurması Cipsi 180 g | 2,00 | 2 · 2 | 5,09–8,09 | 6,59 | 3,30 | 2,80 | 6,59 |

Kalan 14 kalemde hesaba giren rakip ilanı yok: ıspanaklı, kıymalı ve patatesli E böreği; dört artisan kek; iğde
çekirdeği macunu; nar özü; Şifamix andız özü; bal sirkesi; kuru aronya, kavun ve şeftali. Katsayıları ailesinden,
kategorisinden ya da genel medyandan gelir.

### İlk iki faturanın brüt kârı

Partinin tamamı tek kanaldan satılırsa:

| | Ödenen HT | Ciro HT | Kâr | Alış üzerinden |
|---|---|---|---|---|
| Son tüketici | 2.769,49 € | 5.375,10 € | +2.605,61 € | %94 |
| Profesyonel | 2.769,49 € | 3.878,03 € | +1.108,54 € | %40 |

Profesyonel kâr tam %40 değil; fiyatlar kalem başına kuruşa yuvarlandığı için 74 kuruş fazla çıkıyor.

**Tabanda 6 kalem var.** Bu kalemlerin piyasa fiyatı profesyonel fiyatımızın KDV'li hâlinin altında, yani alışımız piyasaya göre yüksek:

| Kalem | Katsayı | İlan |
|---|---|---|
| Tahin | 1,15 | 31 |
| Kozalak macunu | 1,25 | 3 |
| Keçiboynuzu pekmezi | 1,26 | 12 |
| Antep fıstığı | 1,32 | 3 |
| Üzüm pekmezi | 1,41 | 20 |
| Et döner | 1,44 | 6 |

Bu kalemlerde ya tedarikçiyle pazarlık yapılmalı ya da ürün gamdan çıkarılmalı.

## Aday ürünler — fiyat için referans

Faturada olmayan ve fiyatsız aday bıraktığımız kalemler. Alış Lezza'nın teklifinden (Q00332, 22.12.2025, KDV hariç), satış gurmeavrupa'dan (KDV dahil):

| Ürün | Lezza alış | gurmeavrupa | Katsayı |
|---|---|---|---|
| Cheesecake 1.800 g (frambuazlı / limonlu) | 15,50 € | 25,00 € | 1,61 |
| Trileçe 2.000 g | 12,00 € | 20,00 € | 1,67 |
| Maraş dondurması dilim 70 g | 0,62 € | 1,00 € (10'lu 10 €) | 1,61 |
| Maraş dondurması sade 500 g | 3,35 € | 6,00 € | 1,79 |

Aynı teklifte fiyatı olan başka aday kalemler de var: Fıstık Bahçesi 19,00 €, Kırmızı Kadife 15,00 €, Bitter Çikolatalı 14,25 €, Sobiyet Baklava 22,00 €. gurmeavrupa'nın baklavası 1.300 g ve 24–30 €; Lezza teklifindeki tepsi 1.250 g ve 17,50 € (katsayı ≈ 1,6).

gurmeavrupa'nın bu kalemlerdeki katsayısı (1,6–1,8) genel piyasa katsayımızın (1,92) altında. Aday ürüne fiyat konurken bu farka bakılmalı.

## Çıkarımlar

1. **Sirke en kârlı ailelerden.** Alış 3 €, piyasa 5,95–10,45 €; elma sirkesi dışındaki dört kalemde katsayı 3,0–3,5.
2. **Tabandaki altı kalemde alış fiyatı sorun.** Tahin ve pekmezde 12–31 ilan var; piyasa bu ürünleri bizim profesyonel fiyatımıza yakın ya da altında satıyor.
3. **Fırın ürünlerinde katsayı 1,8–2,1.** Simit, açma, künefe, su böreği ve kol böreği bu aralıkta.
4. **Zühre Ana ve Şifamix ürünlerinde siteler arası fark iki kata varıyor.** Bromelain 9,90–19,99 €, karadut özü 9,56–19,99 €; tek bir sitenin fiyatı yerine medyan alınır.
5. **Üç sitede liste fiyatı gerçek fiyat değil.** turkmarket, dogaltakil ve backlava'da ürünlerin yarısından çoğu indirimli görünüyor; bu sitelerde satış fiyatı alınır.
6. **morgenmarkt'ta ilanların çoğu satışta değil.** Açılan sayfaların %74'ü stoksuz; 226 kabulden 17'si hesaba giriyor.

## Hesap notları

- **Hesaba girmeyenler:** nakliye, fire, son kullanma kaybı, ambalaj, kargo, kart komisyonu, kira ve personel. Gerçek net kâr buradaki rakamdan düşüktür.
- **Fatura toplamları:** Behotrade kalemlerinin toplamı faturadaki 1.802,07 € ile kuruşu kuruşuna aynı. Lezza faturasının toplamı kayıtlı olmadığı için o faturanın kalemleri bir toplamla kontrol edilemiyor.
- **Tek ilan katsayı belirlemez.** Tek ilanı olan kalemin piyasa fiyatı tabloda görünür ama katsayısı grubundan gelir; E böreği ailesinin tek ilanı (foodpaket) E böreği değil, peynirli rulo böreğidir.
- **Menşe süzülmez.** Antep fıstığı kaleminin üç ilanından biri Siirt fıstığıdır; zeytinyağında Yunan ve İtalyan sızma yağları da sayılır.
