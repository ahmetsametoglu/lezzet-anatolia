# App — Depo Bölümü (D1–D8)

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

## D7 · Yerinde satış (kapıya gelen müşteri)

> Brief'e 29.08'de eklendi — ekran ÇALIŞIYOR ama bu dosyada hiç anlatılmamıştı; v3 tasarımı bu
> yüzden akışı eksik kurguladı. Aynı ekrana KURYE de kendi bölümünden girer ("yoldan gelen müşteri").

- **An:** kapı çalıyor, müşteri hesabı yok, elden alıp gidecek. **Anonim satış** — müşteri kaydı
  istenmez, adres sorulmaz.
- **Veri:** deponun satılabilir katalogu — ürün · **boy/varyant** · liste fiyatı · **kalan stok**.
  Ürünün birden çok boyu varsa satır "kaç boy" olduğunu söyler; boy seçilmeden sepete girilemez.
  Satışa kapalı ve tükenmiş boy AYRI hâllerdir ("satılacak boy yok" ≠ "tükendi").
- **İş (üç adım):** ürün/boy seç → **adet** ver → **birim fiyatı onayla ya da değiştir** → sepet →
  tahsilat türü (nakit/kart) → satışı yaz.
  - **Adet stoğa karşı sınırlıdır:** kalan adetten fazlası tek satışta yazılamaz, ekran sebebiyle
    söyler.
  - **PAZARLIK FİYATI MEŞRUDUR** (bugün çalışan davranış): birim fiyat düzenlenebilir; liste
    fiyatından SAPAN satır "pazarlık" olarak işaretlenir ve **kim yazdıysa onun izinde** kaydedilir.
    Ekran bunu saklamaz — sepette pazarlıklı satır görünür durur. *(Bu, D7'nin depo "para görmez"
    kuralının bilinçli istisnasıdır: kapıda satış para konuşmadan olmaz.)*
  - Ara toplam gösterilir ama **kesin toplam sunucudan gelir** (indirim/KDV) — ekran "~" ile
    yaklaşık olduğunu söyler.
- **Satış sonrası:** yazılan satışın künyesi (referans · tutar · yöntem · saat). **Fiş yazdırma
  bugün bağlı değil** — ekran bunu söyler, sözü olmayan bir düğme çizmez.
- **Son satışlar:** bu deponun kapı satışları, en yeni önce — referans · tutar · kalem sayısı ·
  yöntem · **satan personelin adı**. Ayrı bir ekran; "kim sattı" sorusunun tek cevabı burası.
- **Başarısızlık hâlleri ekranda cümleyle durur:** stok yetmedi (hangi satır, kalan kaç) · satışa
  kapalı kalem · **satış yazıldı ama tahsilat deftere geçmedi (kasa hesabı ayarsız)** — bu üçü
  birbirinden farklı ve üçünde de para/stok durumu farklıdır.

## D8 · Kargo devri (kutuları taşıyıcıya verme)

> Brief'e 29.08'de eklendi — ekran ÇALIŞIYOR, v3 tasarımında hiç yok.

- **An:** taşıyıcı kurye rampada, depocu kutuları tek tek uzatıyor.
- **Ekran bir LİSTE DEĞİL, bir OKUTUCUDUR.** "Hangi siparişi vereceğim" diye bir soru yok —
  eldeki kutu okutulur, hangi gönderi olduğunu sistem çözer. Bekleyenler listesi çizilmez:
  olmayan bir seçimi varmış gibi göstermek olur.
- **Gövde = okutma geçmişi:** hangi kutu verildi, kaç kaldı. Depocunun tek sorusu budur.
- **Sayım GÖNDERİYİ sayar, siparişi değil** — bir siparişin kutuları iki gönderiye bölünmüş
  olabilir; ekran "2/3 kutu verildi" derken duyurulan gönderiyi sayar.
- **Sonuç cümleleri birbirinden ayrı:** kutu verildi (k/m) · **son kutuyla sipariş YOLA ÇIKTI** ·
  zaten verilmişti · **başka deponun kutusu (geri koy)** · **mühürlü değil (açık kutu verilmez)** ·
  **etiket alınmamış (önce hazırlıktan kargoya ver)** · kod tanınmıyor.
- **Çevrimdışıyken okutma düğmesi çizilmez** (bölüm kuralı: kuyruk yok).

## Kargo zinciri — D1'in devamı (brief'te yoktu)

Hazırlık kutu kapanışında bitmiyor; kargo kulvarındaki sipariş için iki halka daha var:

1. **Kutu tipi sorusu (kutu AÇILIRKEN).** Kargo kulvarındaki siparişte "elindeki kartonu seç"
   sorulur — **gönderinin ağırlığı ve ölçüsü buradan hesaplanır**. Seçenek satırı kutunun adı ve
   ölçüsüdür (en×boy×yükseklik · dara · varsa ağırlık tavanı). **"Tip seçmeden aç" çıkışı ZORUNLU**:
   listede olmayan bir karton kullanılıyor olabilir; depocuyu yanlış tip seçmeye zorlamak,
   ölçüsüzlükten beterdir (yanlış ölçü kendini söylemez). Deponun hiç kutusu tanımlı değilse ekran
   bunu söyler ve "etiket alınırken ölçü sorulacak" diye uyarır.
   *(Not: bu, mal kabuldeki "kolide kaç paket var" sorusuyla KARIŞTIRILMAMALI — o sayım çarpanı,
   bu fiziksel karton.)*
2. **"Kargoya ver" (etiket satın alma).** Kutular mühürlenince hazırlık ekranında bir teklif
   doğar: *"<ref> hazır — kutular mühürlendi, etiketi şimdi alabilirsin."*
   - Servis seçimi bir çekmecedir: **kaç koli · toplam kg** yazılı, altında seçenekler —
     **taşıyıcı · fiyat**, teslim süresi (bilinmiyorsa "bildirilmiyor"), **noktaya mı adrese mi**.
   - **Seçmek satın almaktır:** ekran bunu SEÇMEDEN ÖNCE söyler ("seçtiğin an etiket SATIN ALINIR").
   - Sonuç: alınan **takip numaraları listesi** + basım sonucu. Basım düşse bile **gönderi
     ALINMIŞTIR** — ekran bu ikisini ayırır, "yeniden bas" teklif eder.
   - Uygun servis çıkmayabilir ("elle taşıyıcı girişi hazırlık masasında").
   - **Engel sebepleri tek tek söylenir** (kargo kulvarında değil · mühürlü kutu yok · **kutu tipi
     seçilmemiş** · ambalaj ağırlığı yazılmamış · deponun adresi eksik · adres kopyası eksik · koli
     sayısı tavanı aşıyor · zaten kargoya verilmiş · sağlayıcı cevap vermedi · bağlantı yok).
3. Sonra **D8** devreye girer (yukarıda).

## Bu cihaz · Yazıcılar (hub'da ⚙ satırı)

- Kutu etiketi ve kargo etiketi **hangi yazıcıdan** basılacak — cihaz başına ayar. Etiket kartının
  "yazıcı tanımlı değil" hâli buraya gönderir.

## Yapmaması gerekenler

- Fiyat/maliyet/fark tutarı HİÇBİR depo ekranında görünmez. **Tek istisna D7 yerinde satış** —
  kapıda para konuşulur (satış fiyatı ve tahsilat); maliyet/marj orada da yoktur.
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

---

## v3 tasarım denetimi (29.08) — brief'te VARDI, tasarımda DÜŞTÜ

> `Operasyon Mobil v3.dc.html` depo ekranlarıyla bu dosya karşılaştırıldı. Aşağıdakiler yukarıda
> zaten anlatılmıştı ama v3'te karşılığı çizilmemiş. Yeni bilgi değil — **kapatılacak açık**.

**Toplama (D1):**
- **Çok kutulu hazırlık çizilmemiş.** Kutu döngüsünün özü "tek kutu, döngünün özel hâlidir" iken
  tasarım tek kutuyu TEK hâl saymış: kapanmış kutuların şeridi, "önceki kutularda N", "yeni kutu aç
  (Kutu 2)" yok. B2B siparişleri çok kutuludur.
- **Çıpalı parti (⚓) uyarısı yok** — indirimli teklife bağlı kalem başka partiden verilemez;
  ekranın bunu göstermesi brief'te yazılı.
- **"Önceden N yazılmış — yeni kayıt onun yerine geçer"** uyarısı yok (yarım iş sürer kuralının
  görünen yüzü).
- **Kapanış CTA'sının iki sonucu ayrılmamış:** "Sipariş HAZIR" ile "Bildirildi — Hazırlanıyor'da
  kalır" farklı sonuçlardır; tasarımda tek düğme var.
- **Toplama sırası** (`storage_area` sırası + alan adının satırda görünmesi) çizilmemiş.
- Çok kalemli sipariş hiç çizilmemiş — tasarımda tek kalem var.

**Mal kabul (D2):**
- **"Bu kod hangi ürün?" öğrenen eşleme yok.** Tanınmayan kod tasarımda yalnız "yabancı ürün"
  uyarısına düşüyor. Brief: kod bilinmiyorsa satır seçilir, kod o varyanta kaydedilir, ikinci
  gelişte tanınır. *(Tasarımdaki "başka koli boyu" bundan farklı bir şey — o çarpan ekler.)*
- **Fark özeti yok** (kabul sonunda yalnız sapan satırlar: beklenen ↔ gelen).
- **Raf ömrü uyarısı yok** ("kalan ömür %X — uyarı, engellemez") ve **"bilinmiyor" hâli** yok.
- **Kısmi kabul düğmesi yok** — parçalı kabul dipnotta anlatılmış ama "kısmen teslim alındı olarak
  kaydet" çıkışı çizilmemiş; tek düğme "Kabulü kapat".
- Okutma sonucunun türü söylenmiyor (barkod / SKU eşleşmesi / tedarikçi kodu).

**Sayım (D4):**
- **Geri eklemede sebep notu zorunlu** — not alanı çizilmemiş (brief: "sistem zorlar").
- **Parti seçilmeden girilen hâl** yok; ekran hep parti seçiliymiş gibi başlıyor.

**Transfer (D5):**
- **`0` ile boş ayrımı düşmüş.** Brief: boş bırakmak kabulü BLOKLAR, `0` "geldi ama kayıp"
  demektir — ekran bu farkı sorar. Tasarım transfer kabulünü doğrudan mal kabul satırlarına
  bağlamış; o ekran ise SKT'yi zorunlu kılıyor, oysa transferde **SKT/lot yeniden yazılmaz**
  (tasarımın kendi dipnotu da bunu söylüyor — iki ifade çelişiyor).

**Kurye dönüşü (D6):**
- "Jest"in ne yaptığı yazılmamış (mal ve stok DEĞİŞMEZ, yalnız kayıt düşülür).

**Bölüm geneli:**
- **Çevrimdışı hâli hiçbir depo ekranında yok.** Bölüm kuralı bağlayıcı: bağlantı yokken yazma
  kapalıdır ve ekran bunu açıkça söyler (kuyruk yok).
- **Boş · hata · yükleniyor hâlleri çizilmemiş** (hiçbir depo ekranında). Her listenin boş hâli
  ne olduğunu ve nereden dolacağını söylemeli.
- **"Hangi depoda çalıştığın belli değil" hâli yok** — kapsamında birden çok depo olan (ya da
  ataması yapılmamış) personelde bölüm açılmaz; bunun bir ekranı olmalı.
- **Alt sekme çubuğu dört sekmeyi sabit gösteriyor.** Zemin kuralı: kişi hangi rollere sahipse o
  bölümler görünür; tek bölümlüde çubuk hiç çizilmez. Prototipte kolaylık olabilir, ama tasarım
  rol süzmesini bir hâl olarak göstermeli.
- **Hub'da "vardiya 08:00–17:00" yazıyor — böyle bir veri yok.** Brief'te olmayan alan
  uydurulmaz (zemin §7, paket-etiketi dersi); ya kaldırılmalı ya da veri olarak istenmelidir.
