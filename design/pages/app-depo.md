# App — Depo Bölümü (D1–D6)

> Zemin: `app-operasyon-zemin.md`. Web brief'leri `depo-hazirlik` / `depo-stok-giris` /
> `depo-imha-sayim` ile aynı iş — bu dosya NATIVE anları ve veri gerçekliğini bağlar.
> **Bölüm kuralı: BAĞLANTI ŞARTLI** (kuyruk yok — mal rafta ↔ sistem çelişkisi yasak; çevrimdışıyken
> yazma ekranları bunu açıkça söyler). **Depo ekranları PARA GÖRMEZ.** Personelin deposu sabittir —
> ekranlar hep "benim depom" bağlamında, depo seçtirme yok.

## D1 · Toplama listesi (🔔 yeni sipariş)

- **An:** bildirimle raf arasına; telefon elde, koli önde.
- **Veri (kalem başına):** ürün adı + boy etiketi (boş = tek boylu) · istenen adet · daha önce
  toplanan adet (yarım iş sürer) · parti önerisi (SKT sırasıyla; bir kalem birden çok partiye
  bölünebilir; parti kararı motorun — depocu seçmez) · **ÇIPALI parti işareti**: kalem indirimli
  teklife bağlıysa parti ZORUNLUDUR, başka partiden verilemez — ekran bunu net gösterir.
- **İş:** kalem kalem işaretle; eksikse "eksik" bildir (adet). Tamamlanınca sipariş HAZIR olur;
  eksik varsa "Hazırlanıyor"da kalır.
- **Eksik akıbeti:** sistem eksikte bir ÖNERİ üretir (müşteriye sor / kalanı gönder) ama karar
  YÖNETİM ekranında verilir — depo ekranı öneriyi ve fark TUTARINI GÖRMEZ, yalnız "bildirildi"
  durumunu görür.

## D2 · Mal kabul

- **An:** tedarikçi aracı rampada, koli başında. Bağlantı şartlı.
- **Veri:** tedarik siparişi kalemleri (beklenen adet) · durum sözlüğü: taslak · gönderildi ·
  kısmen teslim alındı · teslim alındı · iptal. Kalem başına giriş: gelen adet · **SKT, zorunlu**
  (ürün DLC mi DDM mi — etiket ona göre) · tedarikçi lot numarası (`null` olabilir ama geri
  çağırma anahtarıdır — boş bırakmak bilinçli olmalı) · depo İÇİ konum (raf/dolap, isteğe bağlı) ·
  serbest not.
- **İş:** kalemlere karşı say, PARÇALI kabul mümkün (kalan açık kalır, sipariş "kısmen teslim
  alındı"); kabul stok partilerini açar. **Tedarik siparişsiz (plansız) kabul de MEŞRU** — form
  boş açılır, satırlar elle girilir.
- **Raf ömrü uyarısı:** ömrünün %75'inden azı kalmış parti kabulde UYARI üretir ama ENGELLEMEZ
  (bilinçli — mal kapıda geri çevrilmez, karar operatörün); ürünün raf ömrü girilmemişse uyarı
  hiç üretilmez ("bilinmiyor" ≠ "sorun yok" — ekran ikisini karıştırmaz).
- **Fark özeti:** kabul sonunda yalnız SAPAN satırlar gösterilir (beklenen ↔ gelen).

## D3 · Yakın-SKT turu

- **An:** sabah rutini, raf önünde.
- **Veri:** partiler SKT sırasında — ürün/boy adı ("Fıstıklı Baklava · 1 kg") · adet · kalan gün
  (geçmişse negatif) · kalan ömür yüzdesi (`null` = ürünün raf ömrü girilmemiş — eşik kararı
  VERİLMEZ, "bilinmiyor" gösterilir) · **karar sözlüğü (sistem türetir, depocu işaretlemez):**
  karar yok · teklife girebilir · teklif AÇIK · imha edilmeli. Kararın eşikleri (%25 yakın-SKT,
  %30 öneri indirimi) satırla birlikte YAZILI durur — operatör neyin neden listede olduğunu görür.
- **İş:** liste FİZİKSEL ayıklama rehberidir: "imha edilmeli" → D4 imha akışına; "teklife
  girebilir" → indirim kararı ve oranı yönetimde (Y3) — bu ekranda işaretleme/aday seçme YOKTUR
  (adaylık türetilir, elle durum tutulmaz).

## D4 · Sayım / düzeltme

- **Veri — DEPOCUNUN sebep kümesi DÖRT** (tip düzeyinde sınırlı): süresi geçti (imha) ·
  hasar/soğuk zincir · sayım farkı (iki yönlü) · kayıp. ("İade stoğa döndü" depocuya AÇILMAZ —
  yönetim istisnasıdır, D6/Y2 akışından gelir.) Adet İŞARETLİ: + düşüm, − stoğa geri ekleme
  (yalnız sayım FAZLASI); **geri eklemede sebep notu ZORUNLU** (sistem zorlar).
- **İş:** parti(ler) seç → fark + sebep gir → olay TEK sıralı referans alır (ör. `IMH-STR-26-0012`
  — depo kodlu; önek sebepten: sayım `SAY`, imha `IMH`) — **numara ekranda gösterilir**, kâğıt
  tutanakla eşleşir. Kayıt atomiktir: bir satır düşerse hiçbiri yazılmaz; fiziksel gerçeğin
  ihlali operatöre CÜMLEYLE söylenir (hata koduyla değil).
- Partinin maliyeti sistemce kopyalanır ama TUTAR BU EKRANDA GÖRÜNMEZ (depo para görmez).

## D5 · Transfer al / ver

- **Veri:** transfer durumu sözlüğü: yolda · teslim alındı · iptal ("taslak" BİLEREK yok — sevk
  anı ilk kalıcı andır; iptal yalnız "mal hiç çıkmadı" hâlidir, dönüş TERS transferdir). Referans
  kaynak depo kodlu (`TRF-STR-26-0007`). Kalem listesi + adetler.
- **İş (sevk):** kalemleri seç → "yolda" — mal kaynaktan O AN düşer (sanal transit depo yok);
  ölçü KULLANILABİLİR stoktur (rezerve mal sevk edilemez).
- **İş (kabul):** rampada SAY, satır satır gelen adedi gir — `null` bırakmak kabulü bloklar;
  **`0` girmek "geldi ama kayıp" demektir, ikisi ayrı şeydir** (ekran bu farkı sorar). Bağlantı
  şartlı (kuyruk yok — iki deponun stoku aynı anda doğru kalmalı).

## D6 · Kurye dönüşü kabulü

- **An:** rota kapandı, kurye rampada.
- **Veri:** gün kapanışının DÖNÜŞ DÖKÜMÜ (kabul etmeyen durakların malları) — sipariş · içerik ·
  kurye notu. (Ulaşılamayanların malı ARAÇTA kalır — dökümde ayrı küme, kabul edilmez.)
- **İş:** dökümü fiziksel malla karşılaştır; kalem başına AKIBET işaretle — **stoğa dön · imha ·
  müşteride kaldı (jest)** üçlüsü (model hazır): "stoğa dön"de sebep notu zorunlu; "jest"te mal
  ve stok DEĞİŞMEZ. Miktarlar HEDEF değer olarak girilir (kalan adet), fark sistemde hesaplanır.
- **Yetki notu (tasarımı etkiler):** akıbet kararı bugün yönetici kapısında — mobilde depocuya
  açılması bizim iş listemizde; ekran depocu akışı olarak çizilir, "yönetici onayı" hâli
  varyasyon değildir.

## Yapmaması gerekenler

- Fiyat/maliyet/fark tutarı HİÇBİR depo ekranında görünmez.
- Depocu partiyi kendisi SEÇMEZ (hangi partiden toplanacağını motor söyler); sipariş içeriğini
  değiştiremez; teklif oranı belirleyemez.
- İç terimler yok ("rezervasyon", "keyset").

## YOKLAR (v1)

- ~~Barkod/QR okuma (v2 — v1 liste-işaretle)~~ → **karar değişti, satır düştü (21.08):** tarama
  artık bu bölümün işi — aşağıdaki güncelleme. · depo seçimi (sabit) · tedarik siparişi OLUŞTURMA
  (yönetimin işi, Y4) · raf/alan YÖNETİMİ (alanlar artık modelde VAR — `storage_area`, 19.28 —
  ama yönetimi web Depolar ekranında; mobil yalnız okur).

## Barkod güncellemesi (21.08 — `docs/feature/barkod-okuyucu.md §1`, 13 karar bağlayıcı)

> Tarama DAİMA telefon kamerasıyla (karar §1.1) — bu yüzden akışların evi bu bölüm. İki kimlik
> karıştırılmaz: **ürün barkodu** (EAN/GTIN — "bu hangi mal") ve **bizim bastığımız kutu QR'ı**
> ("bu hangi kayıt"). Aşağıdaki anlar çizilecek; web tarafında tarama HİÇ olmayacak.

### D1'e eklenen: KUTU DÖNGÜSÜ (karar §1.4)

Toplama artık kutu ekseninde döner: **sipariş seç → kutu aç → kalemleri okutarak doldur →
"kutu kapandı" → her şey konduysa sipariş kapanır, değilse yeni kutu açılır.** Tek kutu bu
döngünün özel hâlidir — ayrı bir "tek kutulu" akış çizilmez. Çizilecek anlar:

- **Kutu açma:** sipariş seçilince ilk kutu tek dokunuşla açılır; başlıkta "Kutu 1 · <sipariş>".
- **Okutma anı:** vizör + altında siparişin kalem listesi (istenen/konan sayaçlarıyla). Okutulan
  ürün listede bulunur ve kutuya işlenir; **koli barkoduysa adet çarpanı kadar** işlenir (kod
  çarpanı kendisi taşır — karar §1.2), depocu adedi düzeltebilir.
- **Yanlış ürün reddi:** sipariş kaleminde OLMAYAN ürün okutulursa ekran ANINDA durdurur —
  kutuya girmez; cümle net ("bu siparişte yok"), ses/titreşim ayrımı düşünülebilir.
- **Kutu kapanışı:** "Kutuyu kapat" → içerik özeti → 4×6 etiket basılır (aşağıda) → etiket
  kutunun üstüne yapıştırılır. Kapanan kutu SALT-OKUNUR.
- **Eksik kalem:** mevcut eksik akışının (D1 "eksik bildir") kutu döngüsündeki yeri — eksik
  bildirilen sipariş kutuları kapansa da "Hazırlanıyor"da kalır; karar yine yönetimde.
- **Toplama sırası:** kalem listesi `storage_area.sort_order`'a göre dizilir ve satırda alanın
  ADI görünür ("Derin dondurucu 2") — depocu raf düzeninde yürür (karar §1.13).
- **Paralel toplama masa kuralıyla:** bir masa = bir sipariş = bir kişi (karar §1.7); ekran rol
  VARSAYMAZ — toplayan kimi gün depocu, kimi gün kuryenin kendisidir (kullanıcı kararı 21.08).

### D2'ye eklenen: TARAMA + ÖĞRENEN EŞLEME (karar §1.3)

- **Tarama:** koli okutulur → kabul satırı kendiliğinden bulunur; koli barkoduysa gelen adet
  çarpan kadar ÖNERİLİR (ölçülmüş gerçek — beklenen adet değil), depocu düzeltir. SKT/lot girişi
  aynen sürer.
- **"Bu kod hangi ürün?":** okutulan kod sistemde yoksa ekran sorar — formdaki satırlardan biri
  seçilir, kod o varyanta KAYDEDİLİR, ikinci gelişte tanınır. "Barkodsuz koli" yok, *henüz
  tanımadığımız* koli var; kimse oturup katalog barkodu girmez. (Yanlış eşleme web'den geri
  alınır — mobilde geri alma çizilmez.)
- PO kalemiyle uyuşmazlık MEVCUT fark mekanizmasına düşer; yeni uyarı dili çizilmez.

### 4×6 ETİKET (karar §1.5-§1.6, kutu kapanışında basılır)

İçerik: ürün + adet dökümü · müşteri/sipariş kimliği · rota/gün · **tahsilat YÖNTEMİ** · QR
(kutu kodu — sipariş referansı DEĞİL). **Fiyat/tutar ASLA yazılmaz** — depo yüzeyi tutar görmez;
kurye QR'ı okutunca tahsil edilecek tutarı kendi ekranında görür. Basım sistem diyaloğu olmadan,
kapanışta kendiliğinden (karar §1.8).
