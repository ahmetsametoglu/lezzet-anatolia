# Çok günlü sefer (tur) — açık tartışma

> **Statü: TARTIŞMAYA AÇIK — karar YOK, kapsam kararı da YOK.** Kullanıcı kararı 17.08: *"ilerleyen
> dönemde birkaç ajan bu konuyu inceler, kendi görüşlerini yazar; sonra o görüşlerden ben de kendi
> düşüncemi söylerim, ona göre yol alırız."*
>
> **Ajanlara: §7'deki açık soruları okuyun, §8'e görüşünüzü YAZIN.** Görüş yazarken kendi şeridinizin
> penceresinden bakın (arka uç · operasyon · müşteri · mobil · denetim) ve **ölçün** — bu dosyadaki
> sayılar 17.08'de ölçüldü, siz okuduğunuzda değişmiş olabilir. §1-§6'yı değiştirmeyin; yanlış bir
> ölçüm bulursanız görüşünüzde düzeltin.

## 1. Soru nedir

Bugünkü model her rotayı **tek günlük** varsayıyor: sabah çık, akşam dön, kasayı teslim et. Kullanıcı
şunu söyledi (17.08): *"Bazı rotalar belki üç günlük rota olacak. Çıkacak iki veya üç gün boyunca
yolda gezilecek belki dört yüz, beş yüz kilometrelik bir hat takip edilecek."*

Soru: **fiziksel olarak tek sefere çıkan bir araç, yazılımsal olarak üç günü nasıl taşır?**

## 2. Kullanıcının kurduğu çerçeve (17.08)

Kullanıcının kendi cümlesi ve bu çerçeve tartışmanın zeminidir:

> *"Fiziksel olarak tek sefere çıkacak. Ama yazılımsal olarak üç seferi içinde mi barındıracak? Ve bu
> araç içerisinde seferlere göre üçüncü günü en arkaya, ikinci günü ortaya, böyle bir mantık olması
> gerekiyor."*

Buna eklenen ayrım: **müşteri GÜN seçer, araç TUR yapar.** Müşteri kendi bölgesinin teslim gününü
görür ve seçer (bugünkü davranış); aracın o güne kaçıncı günde vardığı müşterinin sorunu değildir.

## 3. Mevcut zemin (ölçüldü 17.08)

| Var | Yok |
| --- | --- |
| `order.delivery_date` (teslim günü) + `order.delivery_zone_id` — yani "3 gün, 3 bölge, 3 teslim günü" bugünkü şemada **ifade edilebiliyor** | "Bu üç gün aynı araçta gidiyor" bilgisi — tur kavramı |
| `delivery_zone.weekdays int[]` (haftanın hangi günleri) + `warehouse_id` | Turun çıkış günü · tur içi sıra · tur kimliği |
| `vehicle` tablosu (19.28) — araç künyesi + ölçüm noktası | Araç ↔ tur ↔ kurye bağı (araç bugün bir güne/kuryeye bağlanmıyor, `DOMAIN §7`) |
| `courier_day_close` — `unique (courier_id, date)`, tarih **parametreli** (`close_courier_day(p_courier_id, p_date, …)`) → geçmiş gün kapatılabilir, kısıt yok | Tur başına tek kapanış (bugün gün başına) |
| Nakit **teslim anında** kasaya yazılıyor (`recordOrderPayment`, `courier/delivery.ts:161`) — kapanış para hareketi YAZMAZ, yalnız sayım/mutabakat | Kurye üzerindeki paranın görünürlüğü (tek `Kasa` hesabı var, kurye kasası yok) |
| `reservation.expires_at` nullable → onaylı siparişin rezervasyonu kalıcı olabilir | **"Yoldaki mal" kavramı** — aşağıda, §7.6 |
| Rapor/analitik tarafı bölgeye HİÇ bakmıyor (yedi `analytics_*` RPC'sinin hiçbiri zone eksenli değil) | — |

## 4. Öneri (tartışmaya açık): iki kolon, yeni tablo değil

- `delivery_zone.trip_group` — turun adı/kimliği; tek günlük rotada boş
- `delivery_zone.trip_day` — turun kaçıncı günü (1 · 2 · 3)

Üç soruyu birden cevaplıyor: **yükleme sırası** (`trip_day` büyükten küçüğe → 3. gün en arkaya),
**hazırlık ne zaman biter** (turun TÜM günlerinin malı çıkış sabahı hazır), **kesim ne zaman**
(teslim gününe değil turun çıkış gününe bağlı). Tek günlük rota özel hâl olur (`trip_group` boş,
`trip_day = 1`) — bugünkü akış bozulmaz.

**Neden tablo değil:** "aynı araçta giden yük" sorusu `courier_id` + tarih aralığı + `trip_group` ile
cevaplanabiliyor. Ama bu bir tercih, tartışılabilir — §7.1.

## 5. Kesimin rotaya bağlanması bu işin ÖN KOŞULU ve o parça yapılıyor

Kullanıcı kararı 17.08: eşik saatleri (sipariş kesimi · hazırlık kapanışı · rota çıkışı · kurye
kapanışı) **yalnız rota (`zone`) ekseninde** tanımlanır; depo ekseni bu anahtarlar için kapatıldı
(*"sessiz kapsam tuzağına düşmeyelim"*). Ayrıntı: `design/KARARLAR.md` › Panel (17.08) ve `09.3`
görev satırı.

Bu, çok günlü turun en zor parçasıdır ve panelin ilk diliminde **zaten yapılıyor** — yani bu iş
ertelenirken bedava bir hazırlık birikiyor. Kesim depo eksenine bağlanmış olsaydı çok günlü tur hiç
ifade edilemezdi.

## 6. Etki analizi (ölçüldü 17.08 — sayılar tüketici tarafında)

**Şema yükü hafif, tüketici yükü orta.** İlk değerlendirmede "iki kolon yeter" denmişti; tüketiciler
ölçülünce tablo şöyle çıktı:

| Alan | Ölçüm | Ne olur |
| --- | --- | --- |
| **Rapor / analitik** | **0 dosya** | Değişiklik yok — hiçbir rapor bölge eksenli değil |
| `deliveries/` (rota tanımlama + sevkiyat) | **11 dosya** | Asıl yük: `routes-*` (6) bölge formu/harita/tablo yeni alanları taşır · `dispatch-*` (5) "çıkış günü ≠ teslim günü" ayrımını öğrenir |
| `warehouses/` | 4 dosya | `weekdays` gösteriyor → tur bilgisi **gösterime** eklenir, mantık değişmez |
| `assistant/` · `settings/` · `orders/` | 5 dosya | Dokunulmayabilir (`settings` bölge seçicisi zaten var; `orders`'ta yalnız test) |
| **Çekirdek motorlar** | **4 dosya** | `domain-core/delivery/delivery-days.ts` · `warehouse-resolve.ts` · `application/order/delivery.ts` · `dispatch-read.ts` |
| `weekdays` toplam geçtiği yer | 27 dosya (testler dahil) | Çoğu okuma/gösterim; mantık değiştiren yukarıdaki dört |

**En kritik tek dosya `delivery-days.ts` → `upcomingDeliveryDates({ weekdays, cutoffTime, … })`.**
Müşterinin **hangi günleri gördüğünü** bu üretiyor ve kesimi "kesim geçtiyse bir sonraki güne kay"
diye uyguluyor (`startOffset`). Çok günlü turda yanlış gün verir — somut örnek: C bölgesi Çarşamba
teslim, tur Pazartesi 14:00'te çıkıyor; müşteri Pazartesi 15:00'te sipariş verirse bugünkü motor
*"Çarşamba'ya yetişir"* der, oysa araç yolda ve sipariş **gelecek turun** Çarşamba'sına kalmalı.

## 7. Açık sorular — ajanların tartışacağı

**7.1 Tur bir VARLIK mı, iki kolon mu?** Kolon hafif ama `trip_group` serbest metin: yazım farkı
("Doğu turu" ↔ "doğu turu") iki turu sessizce ayırır. Tablo kimlik + araç + kurye + tarih aralığı
taşır ama yeni tablo + CRUD ekranı demek. Ara yol: kolon + `check`/normalizasyon, ya da
`trip_group_id` ile küçük bir sözlük tablosu.

**7.2 Kesim hangi ana bağlanır?** *Turun çıkış gününe* mi, yoksa *"teslim gününden N gün önce"*ye mi?
İkincisi turdan bağımsız çalışır ama "N" nereden gelir — bölgeden mi, mesafeden mi? Birincisi tur
takvimi gerektirir (tur ne zaman çıkıyor?) ve bugün o takvim YOK.

**7.3 `weekdays` haftalık tekrarı varsayıyor — tur haftada birden seyrekse yetmiyor.** 3 günlük tur
**iki haftada bir** çıkarsa bölgenin teslim günü "her Çarşamba" değil "iki haftada bir Çarşamba"
olur; `int[]` bunu ifade edemez. Müşteriye gösterilen gün listesi (`upcomingDeliveryDates`) o zaman
yanlış olur. Tur takvimi mi gerekiyor, yoksa turlar haftalık kabul mü edilecek?

**7.4 Kasa: gün başına mı tur başına mı kapanır?** Ölçüldü — gün başına **bugün çalışıyor** (tarih
parametreli, geçmiş gün kapatılabilir, `unique (courier_id, date)` yalnız çift kapanışı engelliyor).
Yani kurye dönüşte üç kapanışı arka arkaya yapabilir. Soru operasyonel: operatör üç form doldurmak
ister mi, yoksa tur başına tek mutabakat mı doğru? Tek kapanış seçilirse `courier_day_close` anahtarı
değişir (gün → tur) ve bu **para tarafında şema değişikliğidir.**

**7.5 Kurye üzerindeki para görünmüyor.** Nakit teslim anında tek `Kasa` hesabına yazılıyor; kurye 3
gün yolda 400 € topladıysa sistem parayı "kasada" gösterir, oysa kuryenin cebinde. Öneri: **kurye
başına `cash` hesabı** → teslimde kurye hesabına, kapanışta ana kasaya transfer. Bu tek günlük
rotada da doğruyu söyler; çok günlü turda zorunlu hâle geliyor.

**7.6 "YOLDAKİ MAL" KAVRAMI YOK — en sinsi açık.** Fiili stok düşümü **teslimde** oluyor
(`deliver_order`: `physical_qty = physical_qty - qty`). Yani araç 3 gün yolda dolaşırken mal
sistemde **hâlâ depoda** görünüyor. Satış tarafı korunuyor (rezervasyon `available`dan düşürüyor)
ama **sayım tarafı korunmuyor**: depocu rafa bakıyor, mal yok; sistem "var" diyor → sayım farkı, ya
da daha kötüsü "kayıp" olarak yazılan bir düzeltme. Tek günlük rotada pencere birkaç saat, üç günlük
turda üç gün. Dikkat çekici olan şu: **transfer için bu karar zaten verilmiş** — `app-depo.md` D5:
*"mal kaynaktan O AN düşer (sanal transit depo yok)"*. Sipariş teslimi neden farklı davranıyor,
davranmalı mı?

**7.7 Soğuk zincir üç gün yolda.** Araç ölçüm noktası var (`vehicle` + `temperature_log`, 19.28) ama
çok günlü taşımanın kuralı yok. Raf ömrü/MLOR hesabı **teslim gününe** göre mi **çıkış gününe** göre
mi yapılmalı? Donuk üründe bu bir uygunluk (mevzuat) sorusu, yalnız lojistik değil.

**7.8 Yükleme sırası zorlanacak mı, söylenecek mi?** `trip_day` + kutu etiketindeki teslim günü
(`23-barkod-kutu`) sırayı **söyler**; sistem yanlış sırayla yüklemeyi engellemez. Yeterli mi, yoksa
yükleme okutmasında sıra kontrolü mü olmalı?

## 8. Görüşler

*(Ajanlar buraya yazar — şerit adı, tarih, görüş. §1-§6'ya dokunmayın; yanlış ölçüm bulursanız
burada düzeltin.)*

—
