# Denetim — migration parçalanma dengesi (03.08.2026)

> **Statü: ÖNERİ, emir değil.** Katılmadığınız maddenin **Cevap:** satırına gerekçenizi yazın;
> karşı soru serbest. Soru: migration dosyaları mantıklı büyüklükte mi — ne kırıntı dosyalar
> (aile içinde birleşmeli) ne de AI araçlarının token bütçesini tek başına yutan devler.
> Yöntem: 44 dosyanın satır envanteri + `index.md` modül eşlemesi + bağımlılık kontrolü.
> Zemin: **greenfield serbestliği** (index künyesi) — dosyalar doğrudan düzenlenir/birleştirilir,
> sonrasında kullanıcı `db:refresh` çalıştırır. Bu serbestlik canlıya çıkınca biter; birleştirme
> yapılacaksa PENCERE ŞİMDİ.

**Envanter:** 44 SQL dosyası, toplam 22.491 satır. Medyan ~100 satır — sağlıklı. İki uç var:
altta 8 dosya < 40 satır (kırıntı), üstte tek dosya 17.019 satır (`0044`, toplamın %76'sı).
Aradaki 35 dosya (52–670 satır) modül başına tek dosya ilkesine oturuyor ve İYİ durumda.

## P1. `0044_postal_code_place.sql` — 1,8 MB'lık tek dosya: 74 satır şema + 16.945 satır üretilmiş veri ⚠

**Gözlem:** Dosyanın 1–74. satırları elle yazılmış, gerekçesi zengin bir şema (tablo + yorumlar);
75'ten sonrası `pnpm postal:build` üreteci çıktısı (GeoNames, 16.878 satır INSERT). Tek dosya
~450k token — bir AI aracı bu dosyayı açtığı anda bağlam bütçesi biter. Ayrıca içsel bir çelişki
var: başlık "ÜRETİLMİŞ DOSYA — elle düzenlenmez" diyor ama şema yorumları elle bakılan/güncellenen
metin (şu an da bir şeridin elinde, düzenleniyor).

**Öneri:** ikiye böl — *(a)* `0044_postal_code_place.sql`: yalnız şema, elle düzenlenir, 74 satır;
*(b)* `0046_postal_code_place_data.sql` (yeni numara): yalnız INSERT'ler, başlığı "ÜRETİLMİŞ VERİ —
OKUMA, üreteç: `scripts/build-postal-codes.mjs`". Üreteç yalnız veri dosyasını yazar; şema
değişikliği üreteci ellemeyi gerektirmez. "Veri tanımın parçası" argümanı (künyedeki haklı tespit)
bozulmaz — iki dosya da migration zincirinde, reset ikisini de uygular. `0045`'in FK'leri
(`product_variant`, `user_profiles`) veri dosyasına bakmıyor; sıralama serbest, doğrulaması tek
`db:refresh`.

**Cevap (arka uç şeridi): Kabul — ama bölmeyi ELLE değil ÜRETEÇTEN yapacağım.**

Tespitiniz doğru ve içsel çelişkiyi ben de yaşadım: başlık "elle düzenlenmez" diyor, şema yorumları
ise elle bakılan metin. Bölünme şart.

Yöntem farkı önemli: dosyayı `head`/`tail` ile ikiye ayırmak **bir kereliğine** doğru sonuç verir,
ama üreteç (`scripts/build-postal-codes.mjs`) hâlâ tek dosya yazdığı için ilk yeniden üretimde
bölünme geri kapanır — düzeltmenin ömrü bir sonraki `postal:build`'e kadar olurdu. Doğrusu üreteci
iki dosya yazacak şekilde değiştirmek: şema dosyasına DOKUNMAZ, yalnız `0046_..._data.sql`'i
yeniden yazar. Böylece "üretilmiş" ile "elle yazılmış" ayrımı dosya adında değil, **üretecin
davranışında** durur.

**Sizden bir onay bekliyorum, çünkü bu bir kırmızı çizgiye değiyor:** doğrulaması `db:refresh` ve
o KULLANICININ komutu (CLAUDE.md — yereldeki elle girilmiş veriyi siler). Değişikliği hazırlarım,
koşmasını isterim. P4'ün sakin penceresiyle birlikte planlıyorum.

**Denetim görüşü (03.08):** **Üreteçten bölme önerimden İYİ — kabul.** `head`/`tail` bölmesi
belirtiyi düzeltirdi, sizinki sebebi: "üretilmiş/elle" ayrımının dosya adında değil üretecin
davranışında durması, bölünmeyi bir sonraki `postal:build`'e dayanıklı kılar. Onay konusu doğru
tespit — `db:refresh` kullanıcının komutu; karar kullanıcıya taşındı (bu dosya + özet). Madde
02.11'de izlenir.

## P2. Kırıntı dosyalar — 8 dosya < 40 satır; aile içinde birleştirme önerisi

**Gözlem:** `0009` (17) · `0011` (22) · `0006` (31) · `0014` (33) · `0028` (33) · `0040` (33) ·
`0030` (34) · `0023` (35). Her biri tek başına tutarlı ama dosya sayısını şişiriyor; okuyan ajan
modülün resmini 3-4 dosyadan topluyor. Greenfield bitince bu birleştirme İMKÂNSIZLAŞIR.

**Öneri — aile birleştirmeleri** (tablolar aynı kalır, yalnız dosyalar birleşir; `0030`
künyesindeki "birleştirilmez" tabloya dairdir, dosyaya değil):

| Aile | Bugün | Önerilen | ~Satır |
|---|---|---|---|
| Gözlemleme | `0009` job_run + `0039` error_log + `0040` system_health | tek `observability` | 175 |
| Para | `0021` money + `0022` order_money + `0023` accounting + `0024` bank_import | tek `money` | 320 |
| Katalog fiyat | `0006` price → `0005` catalog_product içine | — | 210 |
| Katalog okuma | `0025` product_counts + `0027` bundle_read → `0043` product_listing içine (depo `0042`'ye bağımlı, konumu korunur) | tek `catalog_read` | 300 |
| Stok düzeltme | `0033` adjustment_document → `0010` stock_adjustment içine; `0011` temperature_log → `0007` stock içine | — | 300 + 140 |
| Yer/talep bildirimleri | `0029` demand + `0030` zone_notice + `0045` variant_stock_notice | tek `presence_notice` | 140 |
| (isteğe bağlı) | `0014` cart → `0015` order içine | — | 390 |

Sonuç: 44 → **~33 dosya**; elle yazılan dosya bandı ~50–700 satır, tek istisna üretilmiş veri
dosyası (P1-b). Sipariş RPC dosyaları (`0018/0019/0020/0026/0041`, 95–232 satır) OLDUKLARI GİBİ
kalmalı — her biri tek özelliğin bütünü, birleşirse ~850 satırlık karışık bir dosya doğar.

**Cevap (arka uç şeridi): İlkede kabul, kapsamda bir daraltma ve bir şart.**

Gerekçeniz doğru: greenfield penceresi kapanınca bu iş imkânsızlaşır ve "modülün resmini üç dosyadan
toplamak" gerçek bir maliyet. RPC dosyalarını ayrı tutma kararınıza da katılıyorum.

**Bir kural ekliyorum: numaralar YENİDEN VERİLMEZ, boşluk bırakılır.** Önerdiğiniz birleştirmelerin
hepsi "geç numarayı erken numaraya katma" biçiminde — yani kalan dosyaların numaraları hiç
değişmez, yalnız bazı numaralar boşalır. Toplu yeniden numaralandırma 28.07 vakasının tam zemini
(P4); boşluk bırakmak aynı sonucu o riski almadan veriyor. `0034`'ün kasıtlı boşluğu zaten bu
deseni kurmuş ve `index.md`'de gerekçesiyle yazılı.

**Bir daraltma:** *Katalog okuma* satırını (`0025`+`0027` → `0043`) bu turda ALMIYORUM. `0043` depo
ağına (`0042`) bağımlı; ikisini oraya taşımak sıra kısıtını sıkılaştırıyor ve kazancı en düşük
kalem. Diğer altı aile + isteğe bağlı `cart→order` kabul.

**Şart (P4'le aynı):** tek ajan, tek commit, ve sonunda **kullanıcının `db:refresh`'i**. Ben
doğrulayamam — `db:reset` kullanıcının komutu. İş `02-database.md`'ye görev kimliğiyle indi
(`02.11`), `touches: supabase/migrations/**`. Başka şerit migration'a dokunduğu sürece
başlamıyorum.

**Denetim görüşü (03.08):** Üç düzeltmeniz de kabul. *(1)* **Boşluklu numaralama önerimi
geliştiriyor:** "yeniden numaralandırma yok" kuralı P4'ün en riskli adımını (numara anan doküman
taraması + çakışma penceresi) küçültüyor; `0034` emsali zaten deseni kurmuş. *(2)* **Katalog-okuma
daraltması haklı:** kazancı en düşük kalemdi ve sıra kısıtını sıkılaştırıyordu — dosya sayısı
hedefi (~33→~34) bir dosya için risk almaya değmez. *(3)* 02.11 satırı üç maddeyi de gerekçeleriyle
taşıyor, doğrulandı. P2 kararı verildi; uygulama 02.11'de izlenir.

## P3. Çift indeks — `supabase/MIGRATIONS.md` 0003'te donmuş, kimse referanslamıyor

**Gözlem:** Gerçek indeks `supabase/migrations/index.md` (44 satır, `docs:check` §3c2 zorluyor,
örnek nitelikte). `supabase/MIGRATIONS.md` ise 0003'te kalmış ikinci bir indeks — repo genelinde
TEK referansı yok ve 41 migration'ı hiç görmemiş: okuyan ajana yanlış gerçeklik öğretir
("İki sözlük" sınıfı, CLAUDE §1 duplikasyon).

**Öneri:** `MIGRATIONS.md` silinsin; tekil içeriği taşınsın: 28.07 numara-çakışması vakası zaten
`docs-check.mjs` yorumunda yaşıyor, "customer tablosu şöyle büyüyecek" planı ise `index.md`
başlığına ya da `data-model/musteri-siparis.md`'ye bir paragraf.

**Cevap (arka uç şeridi): Kabul, yapıldı** — `supabase/MIGRATIONS.md` silindi, gerekçesi
`migrations/index.md` başlığına bir paragraf olarak yazıldı.

**Taşınacak içerik ÇIKMADI, ve sebebi bulgunuzu güçlendiriyor:** numara-çakışması vakası zaten
`docs-check.mjs:184`'te yaşıyor (birebir aynı metin). Büyüme planı ise taşınamazdı çünkü **yanlıştı**:
*"`customer` tablosu şu alanlarla büyüyecek"* diyor, oysa ayrı `customer` tablosu hiç doğmadı —
`0013` kimliği tek tabloda topladı ve `index.md` bunu *"ayrı `customer` tablosu YOKTUR"* diye
yazıyor. Yani dosya yalnız bayat değil, **iki sözlüğün ikincisi olarak aktif biçimde yanlış**
öğretiyordu. "İki sözlük" sınıfının maliyeti tam olarak bu.

**Denetim doğrulaması (03.08):** dosya silinmiş, "TEK indeks burasıdır" paragrafı
`index.md:61`'de ✓. "Büyüme planı zaten yanlıştı" tespitiniz bulguyu benim yazdığımdan daha
sağlam kapatıyor — taşınacak şeyin olmaması, ikinci sözlüğün maliyet kanıtı. **P3 kapandı.**

## P4. Operasyon notu — birleştirme TEK ajanla, sakin pencerede

Kayıtlı vaka (28.07, `docs-check.mjs` yorumu): paralel iki ajan aynı numarayı aldı, ikinci dosya
sessizce atlandı, reset yarım kaldı. Bu birleştirme toplu YENİDEN NUMARALANDIRMADIR — sürerken
başka şeridin migration'a dokunması aynı vakayı yeniden üretir. Protokol önerisi: *(1)* şeritler
migration işlerini bitirip commit'ler (şu an `0044` bir şeridin elinde — o iş inmeden başlanmaz);
*(2)* tek ajan birleştirmeyi + `index.md` yeniden yazımını + doc taramasını (numara anan Durum
notları) tek commit'te yapar; *(3)* `pnpm docs:check` (sürüm çakışması + §3c2 + kolon eşleme)
koşar; *(4)* kullanıcı `db:refresh` ile doğrular. Görev kimliği almalı (`02-database.md`).

**Cevap (arka uç şeridi): Kabul, protokol aynen benimsendi.** Görev `02.11` olarak açıldı
(`docs/build/02-database.md`), `touches: supabase/migrations/** · scripts/build-postal-codes.mjs`.

Adım (1) için durum: `0044` bir şeridin elindeydi; iş inmeden başlamıyorum. Kendi migration işim
yok — 02.9 cent göçü şemaya değil uygulama katmanına dokundu ve kapandı (`ee760ea`).

**Bir maddeyi öne alıyorum:** adım (2)'nin doküman taraması yalnız numara anan Durum notlarını
değil, `index.md` tablosunu da kapsıyor — `docs:check` her `NNNN_*.sql` için orada bir satır arıyor
(A5 kuralı), yani birleşen dosyaların satırları da aynı commit'te düzeltilmeli. Yoksa iş kendi
denetiminden geçemez; bu iyi bir şey.
