# Tasarım isteği — Depo yüzeyinin MASAÜSTÜ hali (10.1–10.5)

> **Claude Design'a.** Depo alanının üç canvas'ı da bugün **yalnız telefon** çiziyor:
> `Operasyon - Depo Hazirlik` (*"· mobil"*), `Operasyon - Depo Imha Sayim` (*"· mobil"*),
> `Operasyon - Depo Stok Giris` (*"· mobil (rampada, koli etiketi karşısında)"*). Masaüstü karesi
> hiçbirinde yok. Kod tarafı bu üç ekranın **masaüstü** çizimini bekliyor; arka uç tamamen hazır.

## Neden masaüstü isteniyor — ve mevcut mobil kareler neyin oluyor

**06.08 yüzey formülü** (`docs/uygulama/README.md`) yüzeyleri ayırdı:

> Web = operasyon **MASAÜSTÜ** (tam kontrol) + müşteri (masaüstü + mobil)
> Mobil uygulama = operasyon (birçok yönüyle) + müşteri

Aynı karar operasyonun web-mobil forkunu kaldırdı: *"personelin mobil deneyimi native uygulamaya
taşınır… operasyon tarafı **sonra ve komple yeniden kurgulanır**."* Depocunun telefon işi artık
`21.11 (Depo bölümü, hub + D1–D6)` görevinin konusu ve mobil şeridin kendi tasarım hattını izliyor.

Yani **mevcut üç mobil kare boşa gitmiyor** — ama web şeridinin uygulayacağı çizim değiller.
İçerik dosyaları (`design/pages/depo-{hazirlik,stok-giris,imha-sayim}.md`) **bağlayıcı ve
güncel**; istenen şey aynı içeriğin masaüstü karşılığı.

## Masaüstünde neyin değiştiğini soruyoruz

Mobil kareler üç kısıt üzerine kurulu: tek el, eldiven, raf karşısında ayakta. Masaüstünde
üçü de yok — ama yerine başka bir şey var: **aynı anda çok şey görebilmek**. İçerik dosyası bunu
zaten söylüyor (`depo-hazirlik.md §7`): *"Web (masaüstü) hali **günün tamamını görüp planlamak**
için kullanılabilir; işin kendisi telefonda biter."*

Karar verilmesi gereken yer tam burası: masaüstü hali **yalnız izleyen** bir pano mu, yoksa
**tam işlevli** mi (onay da buradan verilebilir)? Kod tarafının görüşü: tam işlevli olmalı —
formül web'e *"tam kontrol"* diyor, native depo bölümü henüz başlamadı, ve bu ekranlar bugün
sistemin **tek** hazırlık/kabul/imha yolu. Ama karar sizin; çizim hangisini söylerse o uygulanır.

Somut olarak cevabını aradığımız üç soru:

1. **"✓ Hazırlandı (basılı tut)" masaüstünde ne olur?** Basılı-tut eldivenli yanlış dokunmaya karşı
   bir jest. Fareyle o kısıt yok, ama yanlış onayın bedeli aynı (parti kaydı düşer, sipariş
   ilerler). Tek tık mı, ikinci bir doğrulama mı, yoksa satır satır işaretleyip toplu onay mı?
2. **"Kalem bitince sonraki kalem otomatik açılır" masaüstünde geçerli mi?** Telefonda tek kalem
   ekranı doğru; masaüstünde siparişin bütün kalemleri aynı anda görünebilir. Sıralı akış mı,
   hepsi-birden liste mi?
3. **Üç ekran ayrı sayfa mı, tek sayfada sekme mi?** Depocu güne hazırlıkla başlıyor, mal kabul
   kamyon gelince, imha gün içinde dağınık. Operasyon gezinme rayında bugün *Stok · Tedarik ·
   Depolar* var; bu üçü nereye oturuyor?

## İstenen kareler

### A. Hazırlık — masaüstü (10.1–10.3)

Bugünün kuyruğu + seçili siparişin kalemleri + kalem başına parti önerisi. Mobil karedeki üç
durum masaüstünde de gerekli:

- **Normal kalem** — bölünmüş öneri (24 paket · son tarih 18 Eyl · RAF D-2 · *önce bu* + 16 paket ·
  2 Kas · RAF D-4). "FEFO" kelimesi geçmez.
- **Partiye kilitli teklif kalemi** — *"bu kalem şu partiden çıkmalı"*; parti değiştirme seçeneği o
  satırda **hiç sunulmaz**.
- **Eksik kararı** — sistem tavsiyesi ("kalanı gönder" / "müşteriye sor") görünür, **karar
  depocunun**. Tavsiyenin gerekçesi tutar olarak yazılmaz.
- **Yarım kalan iş** — `confirmed` + `preparing` birlikte listelenir, ilerleme (kalem 2/3) görünür.

### B. Mal kabul — masaüstü (10.4)

`depo-stok-giris.md` iki kaynağı ayırıyor ve ikisi de gerekli:

- **Tedarik siparişinden (PO) dolu form** — depocu ürün seçmez, gelen sayıyı doğrular + son
  tarih/lot girer; beklenen ↔ gelen farkı işaretlenir. **Fark hata değildir**, kabul yine tamamlanır.
- **Siparişsiz (boş) kabul** — her zaman mümkün; bu yolda fark üretilmez (karşılaştırılacak
  sipariş yok).
- **Kısa raf ömrü uyarısı engellemez** — "yine de kabul et" yolu açık kalır.
- Ardışık girişte tedarikçi gibi ortak alanlar korunarak akar; yeni tedarikçi listede yoksa akış
  kırılmadan eklenir (ad + telefon yeter).

### C. İmha / sayım / sıcaklık — masaüstü (10.5 + 10.6)

- **Stoktan düşme formu** — parti (ürün + son tarihiyle) + adet + sebep (son tarih / hasar / sayım
  farkı / kayıp) + opsiyonel not. Sebep zorunlu.
- **Çok satırlı olay** — bir imhada birden çok parti çöpe gidebilir ve üçü **tek tutanak
  numarasıyla** yazılır (`IMH-26-0012`). Kare bu "olay = bir kâğıt" ilişkisini göstermeli;
  satır başına ayrı numara yanlış olur.
- **Günün kayıtları** — bugün girilen imha/sıcaklık dökümü ("girdim mi" belirsizliği kalmaz).
- **Sıcaklık kaydı** (10.6) — dolap/araç + derece, günde 1-2 elle giriş; bugün hangi noktaların
  ölçüldüğü/ölçülmediği görünür. *Bunun arka ucu HENÜZ YOK* — çizim gelirse birlikte yazılır.

## Bağlayıcı kurallar (üç karede de, mobilde olduğu gibi)

- **Rol duvarı:** fiyat, tutar, kâr, maliyet **asla render edilmez**; müşteri adresi/telefonu da
  yok, yalnız ad (koli eşleştirme). Bu bir arayüz disiplini değil **yapısal sınır** — arka ucun
  dönen görünüm modelinde para alanı yoktur, ekran isteseydi bile gösteremez.
- **İç terim yasağı:** "FEFO", "rezervasyon", "batch-pinned", "fulfilled_qty" arayüz dilinde
  geçmez → *"önce şu tarihli partiden"*, *"ayrılmış"*, *"karşılanan adet"*.
- **Arşiv yığılmaz:** liste yalnız bugünün işi; teslim edilmiş sipariş hiç girmez.
- **Depo açık seçimdir, varsayılan yoktur** — tek kapsamlı depocuda seçici görünmez, deposu kimlik
  bilgisi olarak yazar (`operasyon-depo-ekseni.md §4`).
- Renk/tipografi operasyon evreninin token'larından (`globals.css`); ham hex yok.

## Arka uç durumu — çizim gelince ekranlar tek turda yazılır

| Ekran | Kapı | Ne veriyor |
| --- | --- | --- |
| Hazırlık | `apps/web/lib/order/preparation.ts` | `listPreparationQueue` (gün + depo süzgeci, kalem başına bölünmüş parti önerisi + konum + ilerleme), `confirmPreparation` (parti kaydı + kilitli parti ihlali + eksik tavsiyesi) |
| Mal kabul | `apps/web/lib/stock/intake.ts` | `openIntakeForm` (PO'dan dolu form), `receiveGoods` / `receivePurchase` (kabul + kısa ömür uyarısı + fark) |
| İmha/sayım | `apps/web/lib/stock/adjustment.ts` | `recordAdjustment` (çok satırlı olay, tek tutanak no), `findByDocument` |

Üçü de testli ve bugün **hiçbir ekrandan çağrılmıyor**. Eksik olan tek şey çizim.
