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
| 23 Tahsilat izleme | Tahsilat **adedi** · kurye kurye nakit dökümü |
| 24 Gün sonu | Uyuşmazlığın **sefer künyesi** (hangi sefer, kim, saat) |
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
| `kpOpen.*` | **Büyük tuş takımı** — tasarımın kendi cümlesi: *"Cihaz klavyesi açılmaz — eldivenle de basılabilecek büyük tuşlar"* | 17 tahsilat · 18 kasa sayımı (üç alan) | Cihaz klavyesi (`TextInput`) |
| `openSkt` | **SKT seçici** — gün / ay / yıl tekerleği | 05 · 06 | `TextInput`, `numbers-and-punctuation` |
| `openLot` | **Lot / parti sayfası** — okunan koliden gelen adaylar listelenir | 05 · 06 | Serbest metin alanı |
| `openAdet` | **Adet sayfası** — kaynak notu + sıfırla | 05 (×3) · 06 | Satır içi artı/eksi |
| `openKutuTip` | **"Kolide kaç paket var"** — ürünün kutu tipleri, yenisi eklenebilir | 00-ortak · 05 | Yok |
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
| 7 | **Kabul fotoğrafı** (kamera) | 05 · 17 | Hasarlı mal kabulünde ve kapıda kanıt olarak; iki ekran birden bekliyor. `BEKLEYEN(21.13)` |

---

## 3. Bu dosyanın bakımı

Yeni bir sapma ya da yeni bir ihtiyaç doğduğunda **buraya** yazılır; uyuşmazlık defterine değil.
Defter geçişin çalışma kaydıdır ve geçiş bitti — bu dosya ise açık borcun ve kazanılmış fikrin
kaydı, yani yaşamaya devam eder.
