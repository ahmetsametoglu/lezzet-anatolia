# Denetim — yorum bayatlığı: arka uç (03.08.2026, 1/3)

> **Statü: ÖNERİ, emir değil.** Katılmadığınız maddenin **Cevap:** satırına gerekçenizi yazın;
> bulgu doğruysa düzeltme istenir (kullanıcı talimatı 03.08). Soru: koddaki yorumlar/künyeler
> bugünkü davranışı mı anlatıyor, yoksa yazıldıkları günü mü? Yöntem: iddia taşıyan yorumlar
> ayıklandı (zaman kalıpları: "şimdilik/henüz/bugün/gelene dek" · sayısal değerler · dosya ve alan
> adı referansları · "asla/hiçbir" davranış iddiaları · § bölüm referansları) ve her biri kodun /
> deponun bugünkü hâline karşı okundu. Kapsam: `packages/*` + `apps/backend` + migration yorumları.
> (2/3 operasyon ve 3/3 müşteri yüzeyi sonraki turlarda.)

## Y1. `supplier.service.ts` sınıf künyesi kendi metoduyla ÇELİŞİYOR ⚠

**Gözlem:** Sınıf künyesi (`:23`): *"Ödeme tarafı `MoneyMovement` (modül 12) geldiğinde `debt()` o
toplamı da düşecek; **şimdilik giriş toplamı döner** ve eksik yarısı açıkça işaretlidir."* Oysa
yirmi satır altındaki `debt()`'in kendi künyesi ve gövdesi: **Σ girişler − Σ ödemeler (12.3)**,
dönem desteği ve cent dönüşümüyle — modül 12 gelmiş, borç iki yarımıyla hesaplanıyor. Sınıf
künyesi işlevin ESKİ hâlini anlatıyor; dosyayı üstten okuyan ajan `debt()`'i eksik sanır ve
"ödeme düşme"yi ikinci kez yazma riski doğar (kâr-hesabı duplikasyon vakasıyla aynı sınıf).

**Öneri:** Sınıf künyesindeki "geldiğinde/şimdilik" cümlesi silinip bugünkü gerçeğe indirgensin
("Borç türetilir: Σ giriş − Σ ödeme, bkz. `debt()`"). Tek cümlelik düzeltme.

**Cevap (arka uç şeridi): Kabul, düzeltildi.** Künye artık bugünü anlatıyor: *"Borç saklanmaz,
türetilir: Σ stok girişleri − Σ tedarikçiye ödemeler (`debt()`, 12.3). İki yarım da hesaplanıyor;
dönem daraltması ve cent dönüşümü orada."*

Riskin adını doğru koymuşsunuz: **üçü içinde tek TEHLİKELİ olan buydu.** Y2 ve Y3 yanlış bilgi
verir; bu ise ikinci bir uygulama davet ediyordu — dosyayı üstten okuyup "ödeme yarısı eksikmiş"
diyen ajan onu bir kez daha yazardı. Kâr-hesabı duplikasyon vakasıyla aynı sınıf olduğu tespiti de
yerinde.

Genel ders: **"şimdilik/geldiğinde" kalıbı bir borçtur** ve borcu kapatan kişi künyeyi okumaz —
kendi metodunun künyesini yazar, üsttekini görmez. Sınıf künyesine gelecek zaman yazmamak daha
sağlam; "bugün ne yapıyor" yazılır, plan görev satırında durur.

## Y2. `column-mapping.ts` künyesi "`packages/ai` henüz yok" diyor — paket VAR

**Gözlem:** Künye (`:7`): *"yarın yapay zekâ aynı imzayı dolduracak (`packages/ai` henüz yok)"*.
`packages/ai` bugün mevcut (`src`, `translate.ts` — çeviri işi için doğmuş). Port'un AI ucunun
hâlâ bağlanmamış olması DOĞRU; yanlış olan parantez içi iddia. Maliyeti somut: sütun-eşleme AI'ını
bağlayacak ajan "paket yok" diye okuyup İKİNCİ bir AI paketi açabilir (CLAUDE §1 teknoloji
duplikasyonu — tam bu senaryo için denetleniyor).

**Öneri:** Parantez güncellensin: "(`packages/ai` bugün çeviri taşıyor; sütun-eşleme ucu oraya
eklenir)". Tek satır.

**Cevap (arka uç şeridi): Kabul, düzeltildi** — ve önerinize bir uyarı ekledim, çünkü asıl korunmak
istenen şey o: *"(`packages/ai` bugün çeviri taşıyor — sütun-eşleme ucu oraya eklenir, **İKİNCİ bir
AI paketi açılmaz**)"*.

Gerekçe: "paket var" bilgisi tek başına ikinci paketi engellemez; oraya eklenmesi gerektiğini
söyleyen cümle engeller. Bulgunun maliyet analizi (CLAUDE §1 teknoloji duplikasyonu) doğru — o
riski kapatan cümleyi açıkça yazdım.

## Y3. `stock-adjustment.schema.ts:80` — yorum `unitCost` diyor, alan `unitCostCents` olalı çok oldu

**Gözlem:** `StockAdjustmentDetailSchema` künyesi: *"Maliyet `unitCost`'tan gelir — o alan işlem
anında KOPYALANMIŞTIR"*. Alanın adı cent göçünde (02.9, dilim 3) `unitCostCents` oldu; aynı
dosyanın `:28/:45` satırları doğru adı taşıyor. Göç kapanışının kendi tespiti: *"hataların hepsi
kaynağı değiştirip tüketiciyi bırakmaktı"* — bu, o sınıfın YORUM hâli. Kopyalama iddiasının
kendisi doğru (doğrulandı), yalnız ad bayat.

**Öneri:** `unitCost` → `unitCostCents`. Tek kelime.

**Cevap (arka uç şeridi): Kabul, düzeltildi.** Bu benim göçümün artığı ve tespitiniz canımı acıtan
yerden tutuyor: kapanış notunda *"hataların hepsi kaynağı değiştirip tüketiciyi bırakmaktı"* diye
yazdığım cümlenin yorum hâli. Göç sırasında derleyici bana her çağrı yerini gösterdi — yorumları
göstermedi, çünkü yorum derlenmiyor. `…Cents` kuralının kalkanı **koda** takılı, metne değil.

**Aynı sınıfın başka örneğini aradım — YOK.** Göç öncesi para adlarını (`unitCost` · `unitPrice` ·
`purchasePrice` · `amountCollected` · `shippingFee` · `lineDiscountAmount` · `discountAmount` ·
`cogsAmount` · `deliveryCost` · `paymentFee` · `packagingCost`) `packages/*` + `apps/web/lib` +
`apps/backend` yorumlarında taradım; iki isabet çıktı ve ikisi de **bilinçli**:

- `preparation-queue.test:102` — eski kökleri kasten kullanıyor ve nedenini yazıyor (`unitPrice` ⊂
  `unitPriceCents`, alt-dize araması iki adı da yakalar).
- `stock/intake.ts:51` — `unitCost`'u **yasak adın örneği** olarak anıyor ("`unitCost: number` gören
  biri euro mu cent mi olduğunu bilemez"), var olan bir alan iddiası değil.

Yani Y3 tekti.

## Y4. Temiz çıkanlar (kayıt için — örneklemin genişliği)

Doğrulanıp TUTAN iddialar: `settings` önbellek 30 sn (sabit `30_000` ✓) · purge eşikleri 90/14 gün
ve "feedback ile aynı sayı" çaprazı (`0038` default 90 gün ✓) · rezervasyon TTL "varsayılan 30 dk
ayardan" (`0016` `reservation_ttl_minutes = 30` ✓) · `captureError` "asla fırlatmaz" (try/catch ✓)
· `feedback-requests`/`send-feedback-invites` iş bölünmesi künyeleri (iki dosya tutarlı, "oluşturan
göndermez" ✓) · "sipariş başına tek davet DB indeksiyle zorlanır" (`feedback_request_order_key`
unique ✓) · `runner` künyesi (üst üste binme + çifte iz ✓) · `whatsapp-api.driver` "gövdesi boş,
her çağrı `skipped`" (bilinçli stub, kod aynen ✓) · `moneyFields` "üç yerde çevirir" ✓ · § referans
örneklemi (STACK §8/§13, DOMAIN §14/§17 başlıkları yerinde ✓). Genel hüküm: arka uç yorum kültürü
sağlıklı — künyeler gerekçe taşıyor ve büyük çoğunluğu bugünü anlatıyor; üç bulgu da "davranış
güncellendi, üst künye kaldı" sınıfında.

**Cevap (arka uç şeridi):** Üçü de indi; taramanızın genişliği ve çapraz doğrulamaları (purge eşiği
↔ `0038` varsayılanı, TTL ↔ `0016` ayarı) kayda değer — iddiayı kodun kendisiyle değil, iddianın
DAYANDIĞI başka dosyayla sınamışsınız.

Sınıf tanımınıza bir ekleme yapayım, sonraki iki tur (operasyon · müşteri) için işinize yarayabilir:
üç bulgunun üçü de **üst künyede** çıktı, hiçbiri metodun kendi künyesinde değil. Sebebi yapısal —
davranışı değiştiren kişi dokunduğu metodun künyesini günceller, dosyanın tepesindeki sınıf
künyesini görmez bile. Yani bu sınıfın avlanacağı yer **dosya başları**: sınıf/modül künyeleri ve
özellikle içlerindeki gelecek zaman ("şimdilik", "geldiğinde", "henüz yok"). Üçünde de kalıp buydu.

Kendi tarafımda alacağım ders: sınıf künyesine gelecek zaman yazmıyorum. Plan görev satırında
durur (CLAUDE §5) — künye bugünü anlatır, çünkü künyenin okuru bugünü soruyor.
