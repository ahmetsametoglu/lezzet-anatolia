# Rakip Haritası ve Fiyat Politikası

> **Ölçüm günü: 17.09.2026.** Kaynak, rakiplerin herkese açık ürün uçları. Ham veri `temp/rakipler/`
> altında (git dışı). Betikler sırayla çalıştırılır: `node temp/rakipler/indir.mjs` katalogları indirir,
> `node temp/rakipler/eslesme.mjs` bizim kalemleri rakiplerle eşleştirir,
> `tsx temp/rakipler/oneri.ts` fiyatları ve aşağıdaki kalem tablosunu üretir. Rakip fiyatları
> rakibin kendi sitesindeki KDV dahil fiyattır. Ülkelerin gıda KDV'si farklı: FR %5,5 · BE %6 · DE %7.

## Kim, nerede

| Mağaza | Merkez | Altyapı · veri ucu | Ürün | Fransa'ya | Teslimat |
|---|---|---|---|---|---|
| **gurmeavrupa.de** | DE | Shopify · `products.json` | 90 | ✓ | **Kendi aracı**, kargo firması yok, kargo ücreti yok · AT BE DE FR LU NL · helal sertifikalı |
| **degrandbazaar.be** | BE | Lightspeed · sayfa `?format=json` | 375 | ✓ | Kargo · BE'de 12:00'ye kadar verilen sipariş aynı gün yola çıkar · diğer AB ülkelerine 72 saat |
| oznatur.de | DE | Shopify · `products.json` | 687 | ✓ (29 ülke) | UPS/DHL · DE'de 100 € üstü ücretsiz, altı 5,99 € · FR/BE/NL/LU/AT'de 100 € altı 9,99 € · "Soğuk Kargo" etiketli 35 ürün |
| anadolulezzetleri.de | DE | Shopify · `products.json` | 160 | ✓ (27 ülke) | Kargo (koşul metni sitede yok) |
| grandturkishbazaar.com | TR (İstanbul) | WooCommerce · Store API | 1.358 | ✓ | Uluslararası gönderim · fiyatlar **USD** · AB içi doğrudan rakip değil, hesaba girmez |

- **Veri eksiksiz.** Beş sitenin her birinde çekilen ürün sayısı, sitenin bildirdiği yayındaki ürün sayısıyla aynı.
- **İndirimsiz liste fiyatı dört Avrupa sitesinde ayrı bir alanda duruyor.** oznatur'da ürünlerin %42'si indirimde; grandturkishbazaar'da ise neredeyse her ürün "indirimli" görünüyor.
- **En doğrudan rakip gurmeavrupa.de.** Donuk ürünü kendi aracıyla, soğuk zinciri koruyarak Fransa'ya teslim ediyor. Ürün gamı börek, poğaça, simit, döner, mantı, çiğ köfte, baklava, künefe, cheesecake ve Maraş dondurmasıyla bizimkiyle çakışıyor.
- **degrandbazaar.be** Behotrade'in bulunduğu Belçika'da; kiler ve bitki rafımızın tamamını satıyor.
- **Ücretsiz kargo eşiği:** bizde 125 €, oznatur'da Almanya içinde 100 €; gurmeavrupa hiç kargo ücreti almıyor.

## Bizim markalarımız rakipte

- **Lezza / Lamour / Lezita adı hiçbir sitede geçmiyor.** Ama boyu ve tarifi Lezza kataloğuyla birebir aynı ürünler var: gurmeavrupa'da cheesecake 1.800 g, trileçe 2.000 g, Maraş dondurması 70 g dilim ve 500 g; degrandbazaar'da künefe 2×145 g (şerbet içinde) ve çıtır simit (%80 pişmiş, 4 adet). Büyük olasılıkla markası yazılmadan satılan Lezza ürünleri; ambalajı görmediğimiz için kesin değil.
- **Zühre Ana:** oznatur'da 58, degrandbazaar'da 9 ürün.
- **Şifamix:** yalnız bizde olmayan kalemler (Detox kahve) var.
- **Beşe:** hiçbir sitede yok.

## Fiyat politikası

İşletmecinin kararı. Beslemedeki fiyatlar (`scripts/seed-real/data.ts` · `SALE_PRICES`) bu kuralın ölçüm günündeki çıktısıdır.

- **Profesyonel fiyat (HT)** = alış × 1,40.
- **Son tüketici fiyatı (TTC)** = alış × piyasa katsayısı.
- **Taban:** son tüketici fiyatı, profesyonel fiyatın KDV'li hâlinin altına inmez (alış × 1,40 × 1,055 ≈ alış × 1,48).
- **Kâr oranı alış üzerinden** hesaplanır: kâr ÷ alış; aldığın fiyatın iki katına satınca %100. Projenin tek tanımı budur ([`margin.ts`](../../packages/domain-core/src/pricing/margin.ts)). Perakende fiyat önce KDV'den arındırılır: net = TTC ÷ 1,055.

### Piyasa katsayısı

Piyasa katsayısı, rakibin **indirimsiz liste fiyatının** (bizim boya çevrilmiş) bizim alışımıza oranıdır. Rakip malını eritmek için indirim yapsa da, liste fiyatını şişirse de katsayı kaymasın diye şu kurallar uygulanır:

1. İndirimli üründe indirimli fiyat değil **liste fiyatı** alınır.
2. Birden çok rakip varsa **medyan** alınır. Örnek: 5 l zeytinyağının liste fiyatları 45 · 60 · 79,99 €; sonuncusu indirimle 49,99 €'ya satılıyor. Medyan 60 € çıkıyor, yani indirim de şişkin liste fiyatı da sonucu kaydırmıyor.
3. **Yalnız aynı ürün tipi eşleşir.** Katı pekmez ile sıvı pekmez, fıstıklı muska ile fındıklı muska ayrı sayılır.
4. **Şu rakip ürünler listelenir ama hesaba girmez:** boyu ürün adında yazmayanlar, 10'lu ve üstü koli satışları, boyu bizimkinin yarısından küçük ya da iki katından büyük olanlar. g ile ml 1:1 kabul edilir.

Kendi eşleşmesi olmayan kalemin katsayısı sırasıyla **ailesinden**, **kategorisinden** (en az iki eşleşme varsa) ya da **bütün eşleşmelerin medyanından** alınır.

| Grup | Eşleşme | Katsayı | Aralık |
|---|---|---|---|
| Aile · Sirke | 5 | 3,48 | 3,00–3,97 |
| Aile · Kuru Meyve | 1 | 2,70 | — |
| Aile · Bitki Özü | 1 | 2,55 | — |
| Aile · Macun | 3 | 2,06 | 1,65–2,19 |
| Aile · Zeytinyağı | 1 | 2,01 | — |
| Aile · Tavuk Fileto | 1 | 2,00 | — |
| Aile · Pekmez | 2 | 1,48 | 1,48–1,48 |
| Kategori · Kiler | 10 | 2,50 | 1,24–3,97 |
| Kategori · Fırın | 2 | 2,26 | 1,67–2,85 |
| Kategori · Öz & Macun | 6 | 2,12 | 1,65–2,55 |
| Kategori · Et & Tavuk | 5 | 1,38 | 1,31–2,00 |
| **Genel medyan** | **25** | **2,01** | 1,24–3,97 |

### Kalem kalem

Yalnız piyasa fiyatı çıkan 25 kalem. Rakip fiyatı liste fiyatıdır; boyu bizimkinden farklıysa parantezde yazılı.
Fiyatlar € cinsinden. Profesyonel fiyat KDV hariç, son tüketici fiyatı KDV dahil.

| Ürün | Alış | Rakibin liste fiyatı | Piyasa | Katsayı | Profesyonel | Son tüketici |
|---|---|---|---|---|---|---|
| Vegan Çiğ Köfte Topu 1000 g | 3,50 | gurmeavrupa 7,00 | 7,00 | 2,00 | 4,90 | 7,00 |
| Şerbetli Künefe 2 × 145 g | 3,05 | gurmeavrupa 5,00 (270 g) · degrandbazaar 7,99 | 6,68 | 2,19 | 4,27 | 6,68 |
| Simit 4 × 105 g | 1,75 | degrandbazaar 4,99 | 4,99 | 2,85 | 2,45 | 4,99 |
| Su Böreği 800 g | 4,50 | gurmeavrupa 7,50 | 7,50 | 1,67 | 6,30 | 7,50 |
| Tavuk Fileto 10 × 70 g | 3,65 | gurmeavrupa 7,50 (720 g) | 7,29 | 2,00 | 5,11 | 7,29 |
| Geleneksel Et Döner 700 g | 8,00 | gurmeavrupa 15,00 (1 kg) | 10,50 | 1,31 | 11,20 | 11,82 **taban** |
| Geleneksel Tavuk Döner 700 g | 6,10 | gurmeavrupa 12,00 (1 kg) | 8,40 | 1,38 | 8,54 | 9,01 **taban** |
| Kıymalı Mantı 1000 g | 5,15 | gurmeavrupa 7,00 · gurmeavrupa 14,00 (2 kg) | 7,00 | 1,36 | 7,21 | 7,61 **taban** |
| Üzüm Pekmezi 650 g | 5,50 | degrandbazaar 9,99 (800 g) | 8,12 | 1,48 | 7,70 | 8,12 |
| Keçiboynuzu Pekmezi 650 g | 5,50 | degrandbazaar 9,99 (800 g) | 8,12 | 1,48 | 7,70 | 8,12 |
| Tahin 500 g | 4,75 | degrandbazaar 12,99 (935 g, beyaz) · degrandbazaar 12,99 (935 g, çifte kavrulmuş) · anadolulezzetleri 10,00 (1 kg) | 6,95 | 1,46 | 6,65 | 7,02 **taban** |
| Alıç Sirkesi 500 ml | 3,00 | degrandbazaar 9,99 · oznatur 10,90 | 10,45 | 3,48 | 4,20 | 10,45 |
| Ananas Sirkesi 500 ml | 3,00 | degrandbazaar 10,99 · degrandbazaar 11,99 (Zühre Ana) · oznatur 11,90 | 11,90 | 3,97 | 4,20 | 11,90 |
| Enginar Sirkesi 500 ml | 3,00 | degrandbazaar 9,99 | 9,99 | 3,33 | 4,20 | 9,99 |
| Elma Sirkesi 500 ml | 3,00 | degrandbazaar 8,99 | 8,99 | 3,00 | 4,20 | 8,99 |
| Işkın Kökü Sirkesi 500 ml | 3,00 | degrandbazaar 10,99 · oznatur 9,99 | 10,49 | 3,50 | 4,20 | 10,49 |
| Zeytinyağı 5 l | 29,90 | gurmeavrupa 45,00 · degrandbazaar 79,99 · anadolulezzetleri 60,00 | 60,00 | 2,01 | 41,86 | 60,00 |
| Antep Fıstığı 700 g | 16,50 | degrandbazaar 25,99 · anadolulezzetleri 17,00 (800 g) | 20,43 | 1,24 | 23,10 | 24,37 **taban** |
| Bromelain Şurubu 250 ml | 8,00 | oznatur 19,99 · degrandbazaar 18,99 | 19,49 | 2,44 | 11,20 | 19,49 |
| Zühre Ana Kekre Termojenik Mix 250 ml | 8,45 | oznatur 16,90 | 16,90 | 2,00 | 11,83 | 16,90 |
| Propolis Macunu 240 g | 8,50 | oznatur 13,99 | 13,99 | 1,65 | 11,90 | 13,99 |
| Form Macunu 240 g | 8,00 | oznatur 14,99 · degrandbazaar 19,99 | 17,49 | 2,19 | 11,20 | 17,49 |
| Kozalak Macunu 240 g | 8,00 | oznatur 13,99 · degrandbazaar 18,99 | 16,49 | 2,06 | 11,20 | 16,49 |
| Karadut Özü 670 g | 7,25 | oznatur 16,99 · degrandbazaar 19,99 | 18,49 | 2,55 | 10,15 | 18,49 |
| Kurutulmuş Trabzon Hurması Cipsi 180 g | 2,00 | anadolulezzetleri 6,00 (200 g) · degrandbazaar 5,99 (200 g) | 5,40 | 2,70 | 2,80 | 5,40 |

Kalan 26 kalemin katsayısı ailesinden, kategorisinden ya da genel medyandan gelir.
Rakipte karşılığı listelenen ama hesaba girmeyen kalemler de var: E böreği, poğaça ve açma koli satışları; Coconut Mix, keçiboynuzu özü ve kuru elmanın boysuz ilanları; fıstıklı muska.

### İlk iki faturanın brüt kârı

Partinin tamamı tek kanaldan satılırsa:

| | Ödenen HT | Ciro HT | Kâr | Alış üzerinden |
|---|---|---|---|---|
| Son tüketici | 2.769,49 € | 5.491,46 € | +2.721,97 € | %98 |
| Profesyonel | 2.769,49 € | 3.878,03 € | +1.108,54 € | %40 |

Profesyonel kâr tam %40 değil; fiyatlar kalem başına kuruşa yuvarlandığı için 74 kuruş fazla çıkıyor.

**Tabanda 6 kalem var.** Bu kalemlerin piyasa fiyatı profesyonel fiyatımızın KDV'li hâlinin altında, yani alışımız piyasaya göre yüksek:

| Kalem | Katsayı | Kaynağı |
|---|---|---|
| Antep fıstığı | 1,24 | rakip |
| Et döner | 1,31 | rakip |
| Kıymalı mantı | 1,36 | rakip |
| Tavuk döner | 1,38 | rakip |
| Acılı tavuk kanat | 1,38 | kategori |
| Tahin | 1,46 | rakip |

Bu kalemlerde ya tedarikçiyle pazarlık yapılmalı ya da ürün gamdan çıkarılmalı. Kalemlerin üçünü aynı bölgede, aynı modelle çalışan gurmeavrupa satıyor.

## Aday ürünler — fiyat için referans

Faturada olmayan ve fiyatsız aday bıraktığımız kalemler. Alış Lezza'nın teklifinden (Q00332, 22.12.2025, KDV hariç), satış gurmeavrupa'dan (KDV dahil):

| Ürün | Lezza alış | gurmeavrupa | Katsayı |
|---|---|---|---|
| Cheesecake 1.800 g (frambuazlı / limonlu) | 15,50 € | 25,00 € | 1,61 |
| Trileçe 2.000 g | 12,00 € | 20,00 € | 1,67 |
| Maraş dondurması dilim 70 g | 0,62 € | 1,00 € (10'lu 10 €) | 1,61 |
| Maraş dondurması sade 500 g | 3,35 € | 6,00 € | 1,79 |

Aynı teklifte fiyatı olan başka aday kalemler de var: Fıstık Bahçesi 19,00 €, Kırmızı Kadife 15,00 €, Bitter Çikolatalı 14,25 €, Sobiyet Baklava 22,00 €. gurmeavrupa'nın baklavası 1.300 g ve 24–30 €; Lezza teklifindeki tepsi 1.250 g ve 17,50 € (katsayı ≈ 1,6).

gurmeavrupa'nın bu kalemlerdeki katsayısı (1,6–1,8) genel piyasa katsayımızın (2,01) altında. Aday ürüne fiyat konurken bu farka bakılmalı.

## Çıkarımlar

1. **Sirke en kârlı aile.** Alış 3 €, piyasa 9–12 €, katsayı 3–4.
2. **Tabandaki altı kalemde alış fiyatı sorun.** Piyasa bu ürünleri bizim profesyonel fiyatımıza yakın ya da altında satıyor.
3. **Lezza künefesi ve simidi piyasada 2,2–2,9 katsayıyla satılıyor.** Bu, Lezza'nın diğer ürünlerindeki katsayıdan (1,3–2,0) yüksek.
4. **Zühre Ana'da iki rakip arasında 5 €'ya varan fark var.** Macunlarda ve karadut özünde oznatur ucuz, degrandbazaar pahalı; medyan bizi ikisinin arasına koyuyor.
5. **gurmeavrupa fiyatla rekabet ediyor.** Mantıyı 7 €/kg'a satıyor ve kargo ücreti almıyor. Lezza kalemlerindeki fiyatı, Lezza'nın bize verdiği alışın yalnız 1,6–1,8 katı (onun kendi alışını bilmiyoruz). Donuk üründe asıl rakip o.

## Hesap notları

- **Hesaba girmeyenler:** nakliye, fire, son kullanma kaybı, ambalaj, kargo, kart komisyonu, kira ve personel. Gerçek net kâr buradaki rakamdan düşüktür.
- **Fatura toplamları:** Behotrade kalemlerinin toplamı faturadaki 1.802,07 € ile kuruşu kuruşuna aynı. Lezza faturasının toplamı kayıtlı olmadığı için o faturanın kalemleri bir toplamla kontrol edilemiyor.
- **oznatur'un gram alanı gönderi ağırlığıdır** (kavanoz dahil; 240 g'lık macunda 450 g yazıyor). Bu yüzden boyu ürün adında yazmayan oznatur ürünleri hesaba girmez. Zühre Ana istisnadır: aynı ürünün boyu degrandbazaar'ın ürün adında yazıyor.
- **Ürün adından boy okumak kaba bir iştir.** Almancada "Pasta" makarna demek, helva da "tahin" diye yakalanıyor. Eşleşmeler bu yüzden `eslesme.mjs`'te elle ve tek tek yazılı.
