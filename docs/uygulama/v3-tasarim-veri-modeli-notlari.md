# v3 tasarımı ↔ veri modelimiz — iki not defteri

> Kullanıcı isteği (30.08): *"Arada bizim data modelimiz uymadığı için değiştirdiğin ekranlar varsa
> bunları bana not düş. Veya gelen tasarımda bizim ihtiyacımız olan ekranlardan varsa bunları da
> not düş."*
>
> Bu dosya iki soruyu ayrı tutar ve **karışmamalarının sebebi var**: birincisi *"tasarıma
> uymadık, çünkü uyamazdık"*, ikincisi *"tasarım bize bir şey öğretti"*. İlki bir borç, ikincisi
> bir kazanç. Aynı listeye konsalardı, kapatılması gereken açıklar ile kazanılmış fikirler aynı
> kefeye girerdi.
>
> Geçişin kendi günlüğü: `gunluk-operasyon-v3-gecisi.md` (ekran ekran ne yapıldığı + uyuşmazlık
> defteri). Burada yalnız bu iki soru var.

---

## 1. VERİ MODELİ UYMADIĞI İÇİN TASARIMDAN SAPILAN EKRANLAR

Sıra ekran numarasına göre. Her satırda: tasarım ne istiyordu · biz ne yaptık · **niçin** · kapanış
yolu (varsa).

### 1.1 Kapanmış sapmalar (veri geldi ya da karar verildi)

| Ekran | Tasarım | Bizde | Durum |
| --- | --- | --- | --- |
| 01 Depo Hub · D8 | "2 kutu **verildi**" | "3 kutu taşıyıcıyı **bekliyor**" | **Bilinçli sapma.** Verilen kutu geçmiştir; depocunun sorusu "bitti mi", yani bekleyen kutudur. |
| 02 Toplama kuyruğu | Beş örnek satırın sol durum işareti tek kurala uymuyor (maket elle boyanmış) | Çoğunluğun kuralı yazıldı: işaret ile metin AYNI kuralı izler | **Kapandı** — şablonun kendi tutarsızlığıydı. |
| 23 Tahsilat izleme | Tahsilat **adedi** ve kurye kurye nakit dökümü | `todayCount` + `courierFloat` sefer başına dizi | **Kapandı (30.08, kullanıcı bulgusu).** Veri defterde vardı, eksik olan sözleşmeydi — adet hareket sayısından, künye `delivery_run`dan. |
| 24 Gün sonu | Uyuşmazlığın **sefer künyesi** (hangi sefer, kim, saat) | `discrepancy.runs` | **Kapandı (30.08, kullanıcı bulgusu).** Yalnız farkı olan kapanışlar; tek sefer varsa künye, çoksa sayı yazılır. |

### 1.2 Açık sapmalar (sözleşmede alan yok)

Bu listenin tamamı `gunluk-operasyon-v3-gecisi.md` içindeki **uyuşmazlık defterinde** madde madde,
gerekçesiyle duruyor. Burada yalnız **ekran → ne eksik** özeti var; ayrıntı ve kapanış yolu orada.

| Ekran | Tasarımın istediği, bizde OLMAYAN alan |
| --- | --- |
| 01 · 10 · 11 · 21 · 23 | **Deponun ADI** — üstbaşlıklar "hangi depodayım"ı yanıtsız bırakıyor |
| 04 Mal kabul | Sipariş durumu · "SKT gerekli" bayrağı |
| 05 Mal kabul formu | Tedarikçi kodu · "SKT zorunlu" bayrağı · kalan ömür yüzdesi |
| 06 Siparişsiz kabul | Okutmayla eklenen satırda **SKU** |
| 08 Sayım | **Parti etiketini okuma** (kod → parti çözümü yok) |
| 09 Yazıcılar | Yazıcının **bağlantı durumu** · "test bas" |
| 11 Transfer | **ÇIKAN** ve **KAPANAN** transfer listeleri · depo adları |
| 13 Kurye dönüşü | Dört hazır sebep çipinin **metni** (tasarımda da yok — yer tutucu) |
| 15 Sefer künyesi | Aracın künyesi (plaka/tip) · rota zinciri |
| 20 Yerinde satış | **Barkod okutma** · "sık satılanlar" sıralaması |
| 21 Son satışlar | **PAZARLIK** rozeti · "tahsilat deftere geçmedi" uyarısı |
| 26 Şikâyet · 25 Karar | **Karar seçenekleri** ve "Kararı uygula" kapısı · talep referansı |
| 28 Konuşma | Asistan taslağını **reddetme** · künyede işletme adı |
| 29 Gün özeti | B2B/B2C kırılımı · "zamanında teslim" oranı · "imha + iade" tutarı |
| 30 Kampanya | Partinin kalan ömür **yüzdesi** · üç indirim oranı çipi |
| 31 Tedarik | Günlük satış hızı · **gün kapağı** · "imha oranı yüksek" sinyali |
| 32 Bildirimler | Satır alt metnindeki "detay" alanı |

### 1.3 Yerleşim sapmaları (veri var, tasarımın kurgusu bize uymadı)

| Ekran | Tasarım | Bizde | Niçin |
| --- | --- | --- | --- |
| 20 Yerinde satış | **Tek ekran**: liste + sepet + tahsilat alt alta | İki yüzey: katalog (`/sale`) ve sepet (`/sale/cart`) | **Kullanıcı kararı 26.08** — "ürün listesi ve sepet aynı yerde olması kötü". Tasarımın yerleşimi alınmadı, içeriği alındı. |
| 30 Kampanya | **Tek partinin** detay sayfası | Aday LİSTESİ, her aday bir kart, toplu onay | Uç liste döndürüyor ve teklif kararı günde bir kez toplu verilir; tekile indirmek N parti için N yolculuk demekti. |
| 31 Tedarik | Tek tedarikçinin taslağı, yapışkan tek CTA | Gruplu; **CTA her grubun sonunda** | Üç grup varken yapışkan tek düğme hangisini onayladığını söyleyemez. |
| 24 Gün sonu | Kasa satırlarında fark sütunu YOK (ama notu "fark işaretlidir" diyor) | Fark sütunu KALDI | Sütun sökülseydi ekranda **karşılığı olmayan bir cümle** kalırdı. |
| 29 Gün özeti | "YARIN — SEVKİYAT" şeridi yok | Aynı kutucuk dilinde tam genişlikte kart | Veri gerçek ve tüketicisi var; bilgi yerini korudu, dili değişti. |
| 17 Durak | Kanıt yolu olarak **fotoğraf** | Düğme çizili ama KAPALI, sebebi yazılı | Kamera modülü kurulu değil; dev-client'ın yeniden derlenmesini ister. `BEKLEYEN(21.13)` |

---

## 1.4 YAPILMAMIŞ İŞ — ortak etkileşim katmanı (denetim 30.08)

> **Bu bölüm bir özür değil, bir ölçüm.** Geçişi "32/32 tamam" diye bildirmiştim; kullanıcı
> cihazda birçok ekranın eksik olduğunu söyleyince yöntemi değiştirip yeniden ölçtüm ve haklı
> olduğu çıktı.
>
> **Niçin kaçtı:** tasarımı HTML'den **düz metne** indirgeyerek okumuştum. O ayıklama etiketleri
> atıyor — yani tam da ihtiyacım olan şeyi: hangi alanın neye dokunduğunu. Gün sonu ekranının kasa
> alanlarında `onClick="{{ kpOpen.nakit }}"` yazıyordu ("dokununca tuş takımı açılır"); ben o
> dosyayı okudum, metni eşleştirdim, dokunuşu görmedim. Yeni ölçüm tasarımın **dokunuş izlerini**
> (`onClick` handler'ları) çıkarıp kodla karşılaştırıyor.
>
> İkinci sebep: **`00-ortak` en sona bırakıldı.** O bir ekran değil, ekranların yarısının dokunduğu
> ortak etkileşim katmanı. Sona bırakılınca ekranlar eski kontrolleriyle kaldı.

| Tasarımdaki dokunuş | Ne olmalı | Hangi ekranlarda | Bugün ne var |
| --- | --- | --- | --- |
| ~~`kpOpen.*`~~ ✅ | **Büyük tuş takımı** — tasarımın kendi cümlesi: *"Cihaz klavyesi açılmaz — eldivenle de basılabilecek büyük tuşlar"* | 17 tahsilat · 18 kasa sayımı (üç alan) | Cihaz klavyesi (`TextInput`) |
| ~~`openSkt`~~ | **SKT seçici** — gün / ay / yıl | 05 · 06 | ✅ **YAZILDI** (30.08): üç sütun + hızlı çipler. "31 Şubat" artık yakalanmıyor, **doğmuyor** — listede yok. İlk çip ürünün raf ömründen türer; bilinmiyorsa çizilmez. |
| `openLot` | **Lot / parti sayfası** — okunan koliden gelen adaylar listelenir | 05 · 06 | Serbest metin alanı — **YAZILAMADI:** sayfanın beslendiği şey "okunan koliden gelen adaylar"dır; `ResolveCodeResponse` lot taşımıyor. GS1-128 barkodunun parti alanını (AI 10) çözmek yeni bir yetenek. Adaysız bir seçim sayfası, serbest metinden kötüdür. |
| `openAdet` | **Adet sayfası** — "KAÇ KOLİ GELDİ" (koli boyları × çarpan) + "KOLİ DIŞI TEK PAKET" | 05 (×3) · 06 | Satır içi alan + okutma çekmecesi. **Kısmen karşılandı:** koli OKUTULDUĞUNDA çarpan uygulanıyor (`qtyPerCode`). Elle sayım yolu için ürünün KAYITLI KUTU TİPLERİ gerekiyor (tasarım "KT-04, KL-12, KL-24 kayıtlı" diyor); kabul satırı onları taşımıyor. |
| `openKutuTip` | **"Kolide kaç paket var"** — ürünün kutu tipleri, yenisi eklenebilir | 00-ortak · 05 | Yok — aynı eksik: kabul satırı ürünün kutu tiplerini taşımıyor |
| `tg.navSheet` | **Navigasyon sayfası** — harita uygulaması seçimi | 17 (00-ortak'ta 4 kullanım) | Doğrudan Google Maps açılıyor |
| `tg.etiket` | **Etiket sayfası** | 02 | Yok |
| `sk.sec` | **Şikâyet karar seçenekleri** | 26 | Yok (sözleşmede de yok — bölüm 2, madde 1) |
| `or.sec` | Üç indirim oranı çipi | 30 | Tek oran (sözleşmede tek oran var) |

### Davranış kuralı metne çevrilmiş — geri alınacak
**17 · Durak.** Tasarım kanıt ve tahsilat adımlarını **kutular okutulana kadar kilitliyor**
(*"Kutular okutulmadan kanıt ve tahsilat adımları açılmaz"*). Kodu ölçtüm, kilidin yalnız teslim
düğmesinde olduğunu gördüm ve **cümleyi koda uydurdum**. Doğrusu tersiydi: kodu tasarıma
uyduracaktım. Kilit koda eklenecek, cümle tasarımın hâline dönecek.

### Sekme sırası — düzeltildi
Tasarım: **Depo · Kurye · Yönetim · Para**. Kod v2'yi izliyordu (Kurye başta). Kullanıcı onayıyla
düzeltildi (`lib/operations/sections.ts`).

### Kapsam belirsizliğinin çıkış yolu yok — açılıyor
Çok tesisli personel (tur hesabı `hepsi`, kapsamı `['str','van']`) Depo sekmesinde *"hangi depoda
çalıştığın belli değil"* bloğuna düşüyor ve **seçim sunulamıyor**, çünkü personelin depolarının
listesi mobile hiç ulaşmıyordu. Kapsam ucu açılıyor; blok bir SEÇİCİ kazanacak.

---

## 2. TASARIMDA OLUP BİZDE KARŞILIĞI OLMAYAN — İHTİYACIMIZ OLAN EKRANLAR/YETENEKLER

Bunlar "eksik alan" değil: tasarımın bize **öğrettiği** işler. Her biri yeni bir yazma kapısı ya da
yeni bir okuma ucu istiyor.

| # | Ne | Nerede | Niçin gerçekten gerekli |
| --- | --- | --- | --- |
| 1 | **Şikâyet kararı** — seçenekler + "Kararı uygula" | 26 (25'ten girilir) | Bugün şikâyet ekranı okunuyor ama karara BAĞLANMIYOR. Tasarımın kurduğu şey şu: müşteriye giden mesaj taslağı ile stok akıbeti (iade · imha · yeniden gönderim) **tek kayıtta** yazılır. Bugün ikisi ayrı ellerden geçiyor ve biri unutulabiliyor. |
| 2 | **Asistan taslağını reddetme** | 28 | Hibrit modun ikinci yarısı. Bugün yalnız "Taslağı al" var; operatör kötü bir taslağı yalnız GÖRMEZDEN gelebiliyor, o da kuyruğu temizlemiyor. |
| 3 | **Parti etiketini okuma** (`P-0698` → parti) | 08 (sayım) · 05 (kabul) | Sayım ekranının boş hâli iki çıkış yolu vaat ediyor, biri yazılamadı. Depoda parti etiketi zaten basılıyor; okutulamıyor. |
| 4 | **Yazıcı erişilebilirliği + test basımı** | 09 | "Yazıcı bağlı mı" sorusu bugün ancak gerçek bir etiket basarak öğreniliyor. |
| 5 | **Barkodla sepete ekleme** | 20 | Kapıdaki satışta ürünü adıyla aramak, elinde ürün olan personel için yavaş yol. |
| 6 | **Transferin ÇIKAN ve KAPANAN listeleri** | 11 | Bugün yalnız GELEN görünüyor; "yolladığım mal nerede" sorusunun mobilde cevabı yok. |
| 8 | **Hasarlı paket sayısı** (kabulde satır başına) | 05 · 06 | Tasarım satırda kırmızı bir blok istiyor: −/+ ile "sağlam X · hasarlı Y" ve altında kuralı: *"Hasarlı paketler stoğa 'hasarlı' olarak girer; iade mi imha mı olacağı yönetimde karara bağlanır."* Bugün yalnız SERBEST METİN notu var ve o not siparişin tamamına yazılıyor — hangi kalemin kaç paketi hasarlı, kayıtta YOK. Bu bir ekran işi değil: `IntakeFormLineSchema`'ya hasarlı adet, stoğa da "hasarlı" hâli gerekiyor. |
| 9 | **Ürünün kutu tipleri** (kabul satırında) | 05 · 06 | Elle sayımın "kaç koli geldi" yolu bunu istiyor (KT-04 · KL-12 · KL-24). Okutmada çarpan zaten geliyor (`qtyPerCode`); elle girişte depocu çarpanı kafadan yapıyor ve **kafadan yapılan çarpan stok sayımını bozar** (tasarımın kendi cümlesi: "sahada uydurulmuş çarpan stok sayımını bozar"). |
| 7 | **Kabul fotoğrafı** (kamera) | 05 · 17 | Hasarlı mal kabulünde ve kapıda kanıt olarak; iki ekran birden bekliyor. `BEKLEYEN(21.13)` |

---

## 2B. BİZDE GEREKLİ OLUP TASARIMDA OLMAYAN — brief yazıldı, tasarım bekleniyor

§2'nin tersi: orada *tasarım bize bir şey öğretti*, burada **tasarım bir boşluk bıraktı**.

| # | Ne | Ölçüm | Nerede duruyor |
| --- | --- | --- | --- |
| 1 | **Talep bölümü — KUYRUK + talep ekranı** (kullanıcı isteği 30.08) | v3 yönetime tek bir "Şikâyet" ekranı (26) çizdi ve o ekran karar kutusundan gelen **TEK** talebi açıyor (`/complaints/next`). Taleplerin LİSTESİ tasarımda hiç yok: ikinci talep, dünkü talep, AI'ın yürüttüğü talep ve kapanmış talep telefonda görünmüyor. Kuyruk webde var (`/operations/tickets`), mobilde yok. | Brief: [`design/pages/app-yonetim-talep.md`](../../design/pages/app-yonetim-talep.md) — Claude Design'a verilecek. Zemin brief'ine de bağlandı (`app-operasyon-zemin.md` §6). |

**Kullanıcının cümlesi (30.08):** *"Sosyal gelen kutusu gibi bizim mesajları görebildiğimiz bir
talep bölümümüz olması gerekiyor. Ve o talep bölümünde hem işlemler yapabildiğimiz gibi hem de
yazışabilmemiz gerekiyor."*

**Motor tarafı hazır, eksik olan sözleşme:** webde çalışan sekiz kapı (cevap · durum · üstlenme ·
mod · taslak iste/tüket · **iade tetikleme** · elle talep) mobil uca taşınmamış; kuyruk süzgeçleri
(`TicketQueueFilter`: durum · tür · cevap bekleyen · siparişli · yürütücü) ve sayfalama da
serviste duruyor. Yani tasarım bölümü TAM çizebilir.

## 3. Bu dosyanın bakımı

Yeni bir sapma ya da yeni bir ihtiyaç doğduğunda **buraya** yazılır; uyuşmazlık defterine değil.
Defter geçişin çalışma kaydıdır ve geçiş bitti — bu dosya ise açık borcun ve kazanılmış fikrin
kaydı, yani yaşamaya devam eder.
