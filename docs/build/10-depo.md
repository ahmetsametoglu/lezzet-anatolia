# 10 — Depo Yüzeyi

## Kapsam

Depo sorumlusunun üç ekranı: sipariş hazırlama (FEFO önerisi + parti kaydı), mal kabul (tedarik siparişinden dolu form), imha/sayım + sıcaklık. Operasyon evreni komponentlerinden inşa edilir. **Altın kural burada çok sıkı:** depocu fiyat, kâr, maliyet, müşteri iletişimi **görmez**.

## Okunacaklar

- `design/pages/depo-hazirlik.md`, `depo-stok-giris.md`, `depo-imha-sayim.md` (içerik bağlayıcı)
- `DOMAIN.md §2` (izin ilkesi), `§4` (FEFO/parti kaydı/rezervasyon), `§16` (tedarik/mal kabul)

## Bağımlılık

`06-stok` (parti/intake/adjustment servisleri, FEFO hesabı), `07-siparis` (hazırlık → durum), `09-admin` (operasyon komponent envanteri). Tasarım onayı: operasyon evreni. **`19-coklu-depo` (01.08):** bu modülün ekranları 19.1–19.3 (şema + çekirdek) inmeden yazılmaz — kuyruk/mal kabul/imha depo kapsamıyla doğar; tek-depo varsayımıyla yazılan ekran iki kere yapılır (`DOMAIN §17`).

## Başlarken verilecek izah (örnek)

> "Deponun ekranlarını kuruyoruz. Hazırlık ekranında sistem her sipariş için hangi partiden alınacağını söylüyor (önce tarihi yakın olan) — depocu 'hazırlandı' deyince hangi partiden çıktığı kendiliğinden kaydediliyor, ekstra iş yok. Mal kabulde, admin bir sipariş göndermişse form hazır geliyor; depocu sayıyı, tarihi, lot numarasını doğruluyor. Bu ekranların hiçbirinde fiyat ya da kâr görünmüyor — depocunun işi mal, para değil."

## Görevler

- [~] (10.1) **Hazırlık ekranı:** günün hazırlama listesi (FEFO sırası), sipariş kalemleri + sistem parti önerisi; "hazırlandı" onayı → `OrderItemBatch` otomatik yazılır (07 teslim akışına zemin)
  - *Bitti:* onayla parti kaydı düşüyor; ekranın hiçbir yerinde fiyat/kâr yok
  - **Durum (28.07) — ARKA UÇ HAZIR, ekran yok.** Kapı `apps/web/lib/order/preparation.ts`: `listPreparationQueue` (gün süzgeci, kalem başına parti önerisi + konum + ilerleme) ve `confirmPreparation`. 11 test. Ekranı yüzey ajanı yazacak; bu kapı onun sözleşmesidir.
  - **Altın kural YAPISAL hale getirildi:** "depocu fiyat/kâr/maliyet görmez" bir arayüz disiplini olarak bırakılsa er geç sızardı. Dönen görünüm modelinde para alanı YOK — ekran isteseydi bile gösteremez. Testte serileştirilmiş çıktıda `unitPrice`/`total`/`purchasePrice` aranıyor, bulunmaması şart. Müşteri e-postası ve adresi de yok; koli etiketi için yalnız ad var.
  - **Yarım kalan iş kuyrukta kalır:** `confirmed` ve `preparing` birlikte listelenir, öneri KALAN adet için kurulur (toplanan tekrar toplanmaz). Teslim edilmiş sipariş hiç girmez — arşiv yığılmaz.
  - **Durum (08.08) — MASAÜSTÜ ÇİZİMİ YOK, istendi.** Ekranı yazmak için canvas'a bakıldı: `Operasyon - Depo Hazirlik.dc.html` başlığıyla *"Depo — Hazırlık · **mobil**"* diyor ve üç karesi de telefon (liste · toplama · eksik kararı). Masaüstü karesi yok. Aynısı 10.4 ve 10.5'in canvas'larında da geçerli — üçü de "· mobil". İçerik dosyaları (`design/pages/depo-*.md`) bağlayıcı ve tam; eksik olan yalnız görsel karar. İstek yazıldı: `design/project/uploads/depo-masaustu-tasarim-istegi.md`. **Kullanıcı kararı 08.08: önce çizim istenecek, ekran beklemede** — mobil çizimden masaüstü türetmek ya da depoyu tümüyle native'e bırakmak seçenekleri elendi.
    - **Çelişki DEĞİL, yüzey ayrımı:** içerik dosyası §7 *"telefon önceliklidir"* diyor, CLAUDE §2 ise operasyonu masaüstü-yalnız kılıyor. İkisi çelişmiyor — 06.08 yüzey formülü depocunun telefon işini native'e verdi (`21.11`, henüz `[ ]`) ve aynı dosya §7 web için zaten *"günün tamamını görüp planlamak"* diyor. Mevcut mobil kareler 21.11'in referansı, web şeridinin uygulayacağı çizim değil.
  - **KARGO TAKİP NUMARASI bu ekranın işi** (`yer-ekseni-arka-uc-talebi.md §5`: *"numarayı hazırlık ekranı girer — paketi kapatan kişi etiketi elinde tutuyor"*). Kapı hazır ve **bugün hiç çağrılmıyor**: `OrderService.setShipment` yalnız kendi testinde geçiyor, `trackingNumber` hiçbir `.tsx`'te yok (besleme şeridi ölçtü, 03.08). Seed artık üç taşıyıcıyı da taşıyor (DHL · Colissimo · UPS) ve bir kargo siparişi bilinçle TAŞIYICISIZ — "henüz kargoya verilmedi" de bir hâl ve takip kutusunun boş görünümü de çizilmeli. Ekran yazılırken uydurmaya gerek yok, veri gerçek.
- [~] (10.2) **Öneriden sapma:** depocu farklı partiden aldıysa yalnız o satırı değiştirir; partiye kilitli teklif kalemi değiştirilemez
  - *Bitti:* sapma kaydediliyor; pinned kalem sabit kalıyor
  - **Durum (28.07) — arka uç hazır.** Sapma zaten serbest (`record_preparation` neyi verirsen onu yazar); eklenen şey **kilitli kalem kontrolü**: teklife çıpalı kalem başka partiden verilmek istenirse kapı `pinned_violation` döner ve HİÇBİR yazım yapılmaz (testli).
  - **Kontrol neden kapıda, RPC'de değil:** RPC fiziksel gerçeği korur (olmayan mal yazılmaz); "bu kalem şu partiden çıkmalı" ise bir İŞ kuralıdır (DOMAIN §4) — yeri uygulama katmanıdır.
- [~] (10.3) **Eksik işaretleme:** karşılanamayan adet işaretlenir; sistem akıllı öneri sunar (müşteriye sor / kalanı gönder) ama karar depocuda; para hesabı depocuya görünmez
  - *Bitti:* eksik işareti 07 kısmi karşılama akışını tetikliyor; tutar görünmüyor
  - **Durum (28.07) — arka uç hazır.** Motor `domain-core/stock/shortfall.ts` (7 birim testi) + kapı eksik kalemler için tavsiyeyi döner. Para dallanması zaten 07.8'de: "kalanı gönder" seçilirse `adjustFulfillment` farkı çözüyor.
  - **Ölçüt İKİLİ (oran + tutar), çünkü tek başına ikisi de yanılır:** yalnız oran, 40 €'luk kalemin yarısını "önemsiz" sayardı; yalnız tutar, ucuz ama siparişin tamamını oluşturan kalemi kaçırırdı. Biri eşiği aşarsa müşteriye sorulur — şüphede insana danışılır. Eşikler ayardan (`shortfall_ask_ratio_percent`, `shortfall_ask_value_cents`).
  - **Kalemin tamamı eksikse oran hesaplanmaz:** müşteri sipariş ettiği şeyi hiç almayacak, doğrudan sorulur.
  - **Tavsiye TUTAR TAŞIMAZ:** parasal ölçüt motora GİRDİ olarak verilir, dönen değerde yer almaz (testli) — tasarımın "fark iadesi bile tutar olarak gösterilmez" kuralı.
- [~] (10.4) **Mal kabul:** bekleyen tedarik siparişinden dolu form (yoksa boş); ürün/varyant + adet + son tarih + lot + tedarikçi + konum; MLOR uyarısı (engelsiz); paketleme girişi; PO → `received` · `touches: apps/web/app/(operations)/operations/receiving/** · apps/web/components/operation/**` *(üstlenildi 02.08 — operasyon yüzeyi ajanı)*
  - *Bitti:* PO'lu kabul dolu formla açılıyor, eksik/fazla fark olarak işaretleniyor; alış fiyatı alanı yok
  - **Durum (28.07) — arka uç hazır.** Kapı `apps/web/lib/stock/intake.ts`: `openIntakeForm` (PO'dan dolu form) + `receiveGoods` (kabul + MLOR uyarısı + fark). 7 test. Yazımın kendisi 06.10'un RPC'si.
  - **Durum (02.08 — çizim eksik, ekran bekliyor):** `.dc`'de yalnız iki kare var (mobil kabul formu + günün özeti); **PO'dan dolu form, yeni tedarikçi hızlı ekleme ve paketleme girişi kareleri çizilmemiş** — 10.4'ün bitti-kriteri çizilmeyen karede. Tasarım isteği yazıldı (`design/project/uploads/depo-mal-kabul-tasarim-istegi.md`), kullanıcı Claude Design'a iletiyor. Çizim gelince ekran tek turda iner (arka uç tam); şerit bu arada tedarik ekranına (09.14) geçti.
  - **Durum (08.08) — çizim BÜYÜDÜ ama hâlâ mobil.** Canvas 385 satıra çıkmış (02.08'de iki kare): PO'dan dolu form, özet, fark hâlleri çizilmiş — yani 02.08 isteği karşılanmış. Ama başlığı hâlâ *"Depo — Mal Kabul · **mobil** (rampada, koli etiketi karşısında)"* ve masaüstü karesi yok. Web şeridinin uygulayacağı çizim bu değil; masaüstü hali 10.1'in notundaki ortak istekte (`depo-masaustu-tasarim-istegi.md §B`). Arka uç (`openIntakeForm` · `receiveGoods` · `receivePurchase`) tam ve bekliyor.
  - **"Alış fiyatı alanı yok" TİPTE zorlanıyor:** depocunun gönderdiği satırda (`IntakeFormLine`) `unitCost` alanı YOKTUR; maliyet PO'dan sunucu tarafında eşleşir. Testte depocu fiyat girmeden partinin alış fiyatı 6 € doğuyor — gördüğü bir sayı değil, admin'in girdiği.
  - **Fark hata değildir:** eksik/fazla gelen mal işaretlenir, kabul yine tamamlanır ve mal fiilen girer. **PO'suz alımda fark üretilmez** — karşılaştırılacak sipariş yok, her satırı "beklenmedik" saymak gürültü olurdu (bu kusuru test yakaladı).
  - **MLOR engellemez, uyarır:** ömrünün onda dokuzu geçmiş parti de kabul edilir, uyarı listelenir — karar mal kabul edende (DOMAIN §4).
- [~] (10.5) **İmha/sayım:** `StockAdjustment` (parti + adet + sebep: son tarih/hasar/sayım/kayıp); teslim-sonrası iade → varsayılan imha (restok admin istisnası, depocuya restok seçeneği sunulmaz)
  - *Bitti:* imha kaydı düşüyor; fire raporuna besleniyor (12)
  - **Durum (28.07) — ARKA UÇ HAZIR, ekran yok.** `0009_stock_adjustment.sql` (sayaç + `adjust_stock_batch`), motor `domain-core/stock/document-no.ts`, kapı `apps/web/lib/stock/adjustment.ts`. 14 test. Bu iş **stok ekranının çizili ama park edilmiş "Kayıt" sütununu açar** (`design/BACKLOG.md §1c`).
  - **Numara OLAY başınadır, satır başına değil:** bir imhada üç parti çöpe gidebilir; üçüne üç numara vermek eşleştirilmek istenen kâğıdı üçe bölerdi. `adjust_stock`'a dokunulmadı — o tek partiyi düzeltir ve 07.8/11.4 onu tek tek çağırır; çok satırlı olay AYRI RPC'dir çünkü N parti + paylaşılan numara birlikte bölünemez. Bir satır tutmazsa HİÇBİRİ yazılmaz (testli): yarım tutanak, hiç tutanak olmamasından kötüdür.
  - **SIRALI, rastgele değil** — `Order.reference_no`'nun tersi ve bilerek: sipariş numarası dışarı gider, sıralı olsaydı sipariş hacmini sızdırırdı. Bu numara içeride kalır; denetmenin okuyup yazacağı şey `IMH-26-0012`'dir. Sıra atomik artar (`document_counter`), `max(...)+1` iki eşzamanlı imhada aynı numarayı verirdi.
  - **Sınıflandırma motorda, numara veritabanında:** hangi sebebin hangi kâğıda düştüğü bir iş kuralıdır (imha / sayım / iade — üç ayrı tutanak); benzersizlik ve atomiklik DB'nin işidir. Motor onu garanti edemez.
  - **"Depocuya restok seçeneği sunulmaz" TİPTE zorlanıyor:** kapının sebep tipi `return_restock`'u kabul etmez (admin istisnası, DOMAIN §4/§8) — arayüz disiplini olarak bırakılsaydı er geç bir ekranda o seçenek belirirdi.
- [ ] (10.6) **Sıcaklık kaydı:** `TemperatureLog` (dolap/araç + derece), günde 1-2 elle giriş
  - *Bitti:* kayıt tutuluyor, geçmiş görünüyor
  - **Durum (08.08) — tek gerçekten BOŞ görev.** Öteki beşinde arka uç hazır, bunda hiçbir şey yok: `TemperatureLog` şeması, servisi ve kapısı yazılmamış. Ekranı imha/sayım karesiyle aynı yerde yaşıyor (`design/pages/depo-imha-sayim.md §2`), o yüzden masaüstü isteğine birlikte yazıldı (`depo-masaustu-tasarim-istegi.md §C`) — ama çizim gelse bile arka uç ayrı bir iştir.

## Netleşecekler

- Yok — kurallar netleşti. İç terimlerin (FEFO/MLOR) sade karşılıkları tasarım sırasında kesinleşir; kod terimi arayüze taşımaz.
