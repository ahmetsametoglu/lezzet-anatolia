# Admin — Asistan Onay Kuyruğu

> **Yeni ekran (22.3).** AI yönetici asistanının önerdiği yazma işlemleri burada onaylanır.
> Kurgu: `docs/architecture/AI_ADMIN_ASSISTANT.md §5`. Emsal desen: `admin-b2b-onay.md`
> (kuyruk + karar kartı + tek dokunuş) — oradaki iskelet korunur, farkı §3'te.

## 1. Amaç ve kullanıcı

Asistan işletmenin işini **hazırlar**, patron **uygular**. Bu ekran o devrin tek kapısıdır:
asistanın yazma niyetleri (paket kur, sipariş aç, stok gir, para yaz…) burada birikir; patron
tek tek bakar, uygular ya da reddeder. **Onay başka hiçbir yerden verilemez** — asistanın kendi
yüzeyinde onay aracı yoktur, yani kaçak bir asistanın yapabileceği en kötü şey reddedilecek bir
liste üretmektir.

Kullanıcı: yalnız admin. Tipik karar birkaç saniye ile bir dakika arasıdır; ekran bunun için kurulur.

## 2. Tasarımın çözmesi gereken ASIL problem

Kuyruktaki kalemler **birbirine benzemez**: biri altı kalemlik bir paket, biri 340 €'luk bir
tedarik siparişi, biri son kullanma tarihli üç parti stok girişi, biri tek satırlık bir para
hareketi. Hepsinin verisi farklı tablolara gider ve içeriği farklı şekildedir.

**Çözüm: tek kuyruk, tipe göre değişen önizleme.** Liste ve karar çerçevesi HER TİPTE AYNIDIR
(öğrenilecek tek bir ekran); değişen yalnız ortadaki önizleme bloğudur.

**Ham JSON asla ana yüzey değildir.** Operatöre `{"items":[{"variantId":"a3f…"}]}` göstermek,
onaydan anlam beklemeyi bırakmaktır — üç kez sonra herkes okumadan onaylar. Önizleme, **işlemin
sonucunun kendisini** gösterir: paket önerisinde müşterinin göreceği kart, stok girişinde parti
tablosu, para hareketinde muhasebe satırı. Ham JSON yalnız katlanmış bir "teknik döküm"
bölümünde durur (denetim ve hata ayıklama için).

## 3. İçerik envanteri — ne var, neden

### Kuyruk (sol/üst)

- **Bekleyen öneriler** — en eskisi üstte (unutulmasın; B2B kuyruğunun kuralı). Her satır:
  **tip rozeti** (paket · tedarik · stok · para · vitrin · bölge · ürün · tarif · indirim) +
  **özet cümlesi** (asistanın yazdığı tek cümle: *"6 kalemlik 'Kış Sofrası' paketi, 89 €"*) +
  **yaş** (*"2 saat önce"*) + varsa **tutar**.
- **Tazelik uyarısı** — süresi dolmaya yakın kalemler işaretli; dolmuş olanlar kuyruktan düşer
  (ayrı bir "süresi geçti" görünümünde kalır). Gerekçe: dünkü stoğa göre kurulmuş bir öneri
  bugün doğru olmayabilir.
- **Karar geçmişi** — uygulananlar/reddedilenler (kim, ne zaman, ret notu). *"Bunu neden
  reddetmişiz"* sorusunun cevabı burada durur.

### Karar çerçevesi (her tipte AYNI)

- **Özet cümlesi** — büyük ve ilk okunan şey.
- **Neden bu öneri** — asistanın dayandığı sinyal (*"67500 kodu 47 kez soruldu"*, *"un eşiğin
  altında, 8 gün yeter"*). Gerekçesiz öneri onaylanmaz; bu blok boşsa tasarım onu belli etmeli.
- **Etki satırı** — uygulanınca ne olacak, düz Türkçe: *"Katalogda yeni bir paket oluşur; müşteri
  vitrininde görünmez (pasif doğar)"*.
- **Aksiyonlar** — **Uygula** (birincil) · **Reddet** (nedeni yazılabilir) · **Sonra bak**
  (kuyrukta kalır). Reddedilen öneri silinmez; geçmişe düşer.
- **Teknik döküm** (katlanmış) — ham `payload`, hedef tablolar, öneri kimliği.

### Önizleme bloğu — TİPE GÖRE değişen tek bölüm

| Tip | Önizlemede ne görünür |
| --- | --- |
| **Paket taslağı** | Müşterinin göreceği **paket kartı** (ad, görsel, fiyat) + kalem tablosu (ürün · boy · adet · atanmış pay) + **mutabakat rozeti** (payların toplamı paket fiyatını tutuyor mu — tutmuyorsa farkı yazan uyarı) + "ayrı ayrı alınsa" karşılaştırması |
| **Tedarik siparişi (PO)** | Tedarikçi + kalem tablosu (ürün · adet · birim · beklenen tutar) + **toplam** + hedef depo + "yolda olan" bilgisi (aynı üründen bekleyen sipariş varsa uyarı) |
| **Stok girişi / mal kabul** | Parti tablosu (ürün · boy · adet · **son kullanma tarihi** · lot) + hedef depo + belge no. Tarihi geçmiş/çok yakın parti satırı **işaretli** — gıdada en pahalı hata burada |
| **Para hareketi** | Muhasebe satırının kendisi: hesap · tür (gider/tahsilat/transfer) · kategori · tutar · karşı taraf · tarih + varsa bağlı sipariş/tedarikçi |
| **Vitrin işareti** | **Öncesi → sonrası**: hangi kayıt vitrine giriyor/çıkıyor + o bandın doluluk sayısı (*"vitrinde 5 kategori olacak"*) |
| **Bölge genişletme** | Küçük harita/liste: eklenecek posta kodları + hangi bölgeye + o kodların talep sayısı + **haber bekleyen müşteri sayısı** (uygulanınca onlara bildirim gider — bu, geri alınamaz bir dış etkidir ve önizlemede AÇIKÇA yazmalı) |
| **Ürün taslağı** | **Alan bazında fark**: hangi alan boştu, asistan ne yazdı (üç dil yan yana). Alerjen/saklama alanları asistan tarafından DOLDURULMAZ — eksik kalır ve o eksiklik burada kırmızı görünür |
| **Tarif taslağı** | Tarif kartı önizlemesi (başlık, adımlar, malzeme→ürün bağları) + üç dil doluluk göstergesi (dolmadan yayınlanamaz) |
| **İndirim/kampanya** | Kural özeti düz Türkçe (*"Tatlı kategorisinde %15, 30 Eylül'e kadar, alt sınır 25 €"*) + kimlere uygulanır + tahmini etki |

## 4. Aksiyonlar

- **Uygula** → işlem normal servis/motor yolundan koşar. Motor reddederse (stok bitmiş, mutabakat
  tutmuyor) öneri **"uygulanamadı"** hâline geçer ve **sebebi ekranda yazar** — sessizce
  kaybolmaz. Bu hâl "reddedildi"den ayrı görünmeli: biri patronun kararı, öteki sistemin cevabı.
- **Reddet** (opsiyonel not) · **Toplu ret** (seçilenler) — toplu UYGULA yok: her uygulama ayrı
  bir karardır, çoklu seçim onayı hızlandırmaz, dikkatsizleştirir.
- Uygulandıktan sonra **doğan kayda köprü** (*"paketi aç"*, *"siparişi gör"*).
- Kuyruk boşken: sakin bir boş durum (*"Bekleyen öneri yok"*) — asistanın çalışmadığı anlamına
  gelmez, sorulmadığı anlamına gelir.

## 5. Durumlar ve varyasyonlar

- **Bekleyen / süresi yaklaşan / süresi geçmiş** — üç görsel hâl.
- **Uygulandı / reddedildi / uygulanamadı** — geçmişte üç ayrı renk; "uygulanamadı" sebebiyle.
- **Dış etkili öneri** (bölge genişletme → müşteriye bildirim) — onay düğmesi bunu ayrıca
  söylemeli; geri alınamaz eylem, geri alınabilir olanla aynı görünmemeli.
- **Gerekçesiz öneri** — sinyal bloğu boşsa görsel olarak zayıf durmalı (onaylanabilir ama
  patron neye dayandığını göremediğini bilmeli).
- **Mobil YOK** (operasyon yüzeyi yalnız masaüstü — `docs/uygulama/README.md` yüzey formülü).

## 6. Bu ekranın ötesinde

Kuyruk bir **bildirim** kaynağı da olacak (bekleyen öneri sayısı üst çubukta) — ama tasarımı
mevcut bildirim deseninden gelir, burada yeni bir şey icat edilmez.
