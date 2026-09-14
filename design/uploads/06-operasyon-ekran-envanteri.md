# 06 — Operasyon Ekran Envanteri (native uygulama)

**Amaç:** operasyon yüzeyinin **bugünkü hâlini** Claude Design'a eksiksiz devretmek. Yeniden
tasarım, var olanı görmeden yapılamaz: her ekranın hangi bilgiyi taşıdığı, hangi kararı sorduğu ve
hangi ara hâllere (çekmece, panel, hata bandı, boş hâl, pasif düğme) girdiği burada yazılı.

> **Bu doküman envanterdir, tasarım kararı DEĞİLDİR.** Ekranların bugünkü düzeni `Operasyon Mobil v2`
> tasarımından geliyor; yeniden kurgu kararı (`docs/uygulama/README` — "operasyon tarafı SONRA ve komple
> yeniden kurgulanır") duruyor. Buradaki notlar "ne yapılıyor"u anlatır, "nasıl görünmeli"yi değil.

## Çekim künyesi

| | |
|---|---|
| Tarih | 28.08.2026 |
| Cihaz | OPPO CPH1907 · 1080×2400 · yoğunluk 408 dpi (fiziksel cihaz, emülatör değil) |
| Uygulama | `com.lezzetanatolia.app` · dev derlemesi (Metro bağlı, `__DEV__` açık) |
| Hesaplar | dev giriş düğmeleri — Yönetim (Selin Kaya · admin) · Depo (Deniz Arslan · warehouse/STR) · Kurye (Marc Lemoine) · Muhasebe (Ayşe Demir · accounting+warehouse) |
| Veri | yerel seed — **sahtedir, istatistik çıkarılmaz** (CLAUDE.md); sayılar yalnız "bu alan nasıl doluyor"u gösterir |
| Görüntüler | [`ekran-goruntuleri/operasyon/`](ekran-goruntuleri/operasyon/) — 59 kare |

**İki teknik not — tasarımı yanıltmasın:**
- Sağ altta duran **gri dişli baloncuk cihazın kendi katmanıdır** (ColorOS kenar çubuğu), uygulamanın
  arayüzü değil. `adb` ile kapatılamadı (`WRITE_SECURE_SETTINGS` yok); her karede aynı yerde durur.
- Üst şeritteki saat/pil satırı sistem durum çubuğudur; uygulama başlıkları onun altından başlar.

---

## 0. Kabuk — bütün operasyon ekranlarının ortak çerçevesi

Operasyon, müşteri kabuğundan **ayrı bir navigasyon ağacıdır** (`app/(operations)`). Kapı `/me`yi bir
kez okur, rolleri bölümlere çevirir ve sonucu altına dağıtır.

**Rol → bölüm eşlemesi birebirdir** (`lib/operations/sections.ts`): `courier`→Kurye, `warehouse`→Depo,
`admin`→Yönetim, `accounting`→Para. Rol değiştirme anahtarı **yoktur**; kullanıcı hangi şapkaları
taşıyorsa hepsini aynı anda görür.

**Sekme çubuğu yalnız birden çok bölümü olan kullanıcıda çizilir.** Tek bölümlüde çubuk hiç
görünmez — ekranın 60 px'ini yiyen, seçim varmış gibi duran bir süs olurdu.

| Kare | Ne gösteriyor |
|---|---|
| ![](ekran-goruntuleri/operasyon/depo-01-hub.png) | **Çubuksuz kabuk** — tek bölümlü kullanıcı (Depo). Başlık: üst satırda bölüm künyesi, altında ekran adı; sağda zil + baş harf rozeti. |
| ![](ekran-goruntuleri/operasyon/muhasebe-01-depo-kapsam-belirsiz-sekmeli.png) | **Çubuklu kabuk** — iki bölümlü kullanıcı (Depo + Para). Aynı karede ikinci bir hâl var: kullanıcının kapsamında birden çok depo olduğu için Depo bölümü "hangi depoda çalıştığın belli değil" bloğuyla kapalı. |

### Ortak başlık öğeleri

| Kare | Not |
|---|---|
| ![](ekran-goruntuleri/operasyon/yonetim-02-kimlik-menusu.png) | **Kimlik menüsü** (alt çekmece) — ad, e-posta, rol adı; iki eylem: *Müşteri uygulamasına geç* · *Oturumu kapat*. Çekmece perdeyle (scrim) kapanır. |
| ![](ekran-goruntuleri/operasyon/yonetim-03-bildirimler.png) | **Bildirimler** — rol süzgeçli tam ekran liste. Alt başlık süzmeyi açıkça yazar ("yalnız Yönetim — rol süzmesi"). Satır: başlık + tip · bölüm · yaş. |
| ![](ekran-goruntuleri/operasyon/kurye-08-bildirimler-bos.png) | **Bildirim boş hâli** — "Yeni iş düştüğünde burada görünür — listeler elle de açılır." Bildirim bir hızlandırıcıdır, tek kapı değil. |

**Alt yapışkan CTA deseni:** neredeyse her iş ekranı altta tek bir birincil düğmeyle biter; düğme
**ne eksikse onu söyler** ("Sebep ve adet gerekli", "Kalem kalem say — ya da tamamı", "Her kalemde
akıbet işaretle"). Pasif hâl gri, aktif hâl zeytin/koyu.

---

## 1. Yönetim — "Karar Kutusu"

Yönetim bölümünün sözleşmesi başlıkta yazılı: **bildirim → kısa karar**. Uzun iş masaüstünde kalır;
her ekranın altında "masada devam et" notu vardır ve kurulum/ayar mobile taşınmaz.

### 1.1 Karar Kutusu (hub)
![](ekran-goruntuleri/operasyon/yonetim-01-karar-kutusu.png)

- **Sosyal Mesajlar** kartı (tek gelen kutusuna kapı) → §1.2
- **Gün Özeti** kartı — günün fotoğrafı, tek satır özet + ciro/şikâyet/yarın kırılımı → §1.5
- **Karar satırları** — renk noktası önceliği, sağda durum rozeti (*top bizde*), sonda ›:
  şikâyet/talep · yakın-SKT kampanya onayı · tedarik önerisi · WhatsApp cevap bekleyen
- Sayfa dipnotu kapsamı söylüyor: uzun iş masaya kalır.

### 1.2 Sosyal Mesajlar — tek gelen kutusu

| | |
|---|---|
| ![](ekran-goruntuleri/operasyon/yonetim-04-sosyal-gelen-kutusu.png) | **Liste.** İki süzgeç şeridi: durum (Tümü · Cevap bekleyen) ve kanal (Tüm kanallar · WhatsApp · Messenger · Instagram). Satırın sol kenarındaki **renkli çubuk kanalı** kodluyor (WhatsApp yeşil, Messenger mavi, Instagram pembe). Sağda saat/tarih + *top bizde* rozeti. Liste sonunda "Liste bitti". |
| ![](ekran-goruntuleri/operasyon/yonetim-05-sosyal-suzgec-whatsapp.png) | **Süzgeç seçili hâl** — "Cevap bekleyen" + "WhatsApp". Seçili çip zeytin dolgu, seçilmemiş çerçeve. |
| ![](ekran-goruntuleri/operasyon/yonetim-17-sosyal-cevap-bekleyen-kisayol.png) | Hub'daki "WhatsApp — cevap bekleyen" satırı aynı listeye açılıyor (ayrı ekran değil, kısayol). |

### 1.3 Konuşma (sohbet defteri)

| | |
|---|---|
| ![](ekran-goruntuleri/operasyon/yonetim-06-sosyal-konusma.png) | **Hibrit mod.** Başlık: muhatap + kanal · telefon. Altında **yürütücü seçici** (İnsan · Hibrit) ve *top bizde* rozeti. Yeşil bant cevap penceresini sayar ("Cevap süresi açık · 22 saat kaldı"). Müşteri balonu solda; **YZ taslağı** sağda, kesik çerçeveli ve "operatör cevabı değildir" künyeli — içinde "Cevap kutusuna al" düğmesi. |
| ![](ekran-goruntuleri/operasyon/yonetim-07-sosyal-taslak-cevap-kutusunda.png) | Taslak **cevap kutusuna alınmış** hâl — metin composer'a düşer, "Deftere işle" aktifleşir. |
| ![](ekran-goruntuleri/operasyon/yonetim-08-sosyal-insan-modu.png) | **İnsan modu** — YZ balonu ve öneri düğmesi hiç çizilmez. |
| ![](ekran-goruntuleri/operasyon/yonetim-09-sosyal-yz-onerisi-iste.png) | **Hibrit + taslak yok** — akışın sonunda "YZ önerisi iste" düğmesi. |

> **Ekranın en kritik cümlesi dipnotta:** *"Mesaj buradan gönderilmez — yazışma telefondan yürür,
> defter burada tutulur."* Yani composer bir gönderim kutusu değil, **kayıt kutusudur**. Yeniden
> tasarım bu ayrımı korumalı; "Gönder" gibi okunan bir düğme yanlış vaat olur.

### 1.4 Şikâyet / Talep

| | |
|---|---|
| ![](ekran-goruntuleri/operasyon/yonetim-11-sikayet-talep.png) | Başlıkta künye (siparişsiz · kaynak: form · tarih). Üstte üç etiket: tip (Soru) · durum (Açık) · top kimde. Müşteri balonu **kendi dilinde** (burada Almanca). **YZ önerisi** balonu iki çıkışlı: *Cevaba çevir →* (doğrudan) ve *Düzenleyerek gönder*. Altta composer + iki eylem: **Cevabı gönder** · **Üstlen — İşlemde**. Dipnot: masada devam et. |
| ![](ekran-goruntuleri/operasyon/yonetim-12-sikayet-taslak-cevap-kutusunda.png) | "Düzenleyerek gönder" sonrası: öneri composer'a iner, gönder düğmesi aktifleşir, YZ balonu kaybolur. |

### 1.5 Gün Özeti
![](ekran-goruntuleri/operasyon/yonetim-10-gun-ozeti.png)

Salt okuma. Üstte tek cümlelik gün durumu; **ciro kanal kırılımı** (Web · Kapıda satış · WhatsApp);
iki kutu (tahsilat bekleyen · açık şikâyet); yarının sevkiyatı; **YZ içgörüsü** bloğu (bugün boş —
"motor bağlandığında dolacak") ve **stok riski** bloğunun *ısınıyor* hâli. Üç hâl açıkça yazılı:
hazır · ısınıyor · yok — CLAUDE §1 "ölçülemeyen değer sıfır değildir" kuralının arayüzdeki karşılığı.

### 1.6 Yakın-SKT Kampanya Onayı

| | |
|---|---|
| ![](ekran-goruntuleri/operasyon/yonetim-13-kampanya-onayi.png) | Aday parti listesi motordan. Satır: ürün · parti kodu · adet · kalan gün · öneri fiyat · depo. Sağda **düzenlenebilir fiyat alanı** ve **✕ listeden çıkar**. Alt CTA sayıyı taşır: "49 partiyi teklife aç". |
| ![](ekran-goruntuleri/operasyon/yonetim-14-kampanya-satir-cikarma-ve-fiyat.png) | İki ara hâl bir arada: **çıkarılmış satır** (üstü çizili, soluk, düğme *+* ile geri alınabilir) ve **fiyat düzenleme** (sayısal klavye). Dikkat: klavye açıkken alt CTA tamamen örtülüyor. |

### 1.7 Tedarik Önerisi

| | |
|---|---|
| ![](ekran-goruntuleri/operasyon/yonetim-15-tedarik-onerisi.png) | Tedarikçi × depo gruplu liste. Satır: varyant · **+öneri adedi** · "mevcut / eşik / son alış" · *başka depoda var: KEHL 16 — transfer seçeneğinin ham verisi*. Grup sonunda **Grubu onayla — taslak TS** ve altında sınır cümlesi: *sistem tedarikçiye bir şey göndermez; metni kurar, gönderim insanın*. |
| ![](ekran-goruntuleri/operasyon/yonetim-16-tedarik-onerisi-alt.png) | Listenin altı: **eşlenmemiş gruplar** — tedarikçisi olmayan varyantlar tek tek sayılıyor ve kırmızı satır siparişi kapatıyor: *"Bu gruptan sipariş açılamaz — önce masada tedarikçi eşleyin."* |

### 1.8 Eksik Toplama Kararı
![](ekran-goruntuleri/operasyon/yonetim-18-eksik-toplama-bos.png)

Hazırlık kuyruğundan doğan istisna ekranı; **boş hâli** yakalandı ("Karar bekleyen eksik yok").
Dolu hâli için depoda bir kutunun *eksik beyanıyla* kapanması gerekiyor — bu turda üretilemedi
(§5'te not).

---

## 2. Depo — "Depo İşleri"

Hub yedi işi D1–D7 kodlarıyla sıralar (![](ekran-goruntuleri/operasyon/depo-01-hub.png)). Sayfa
dipnotu bölümün sınırını çiziyor: **depo ekranları fiyat/tutar görmez**; parti kararı motorundur,
mal kabulde kod okutulur.

### 2.1 D1 · Toplama

| | |
|---|---|
| ![](ekran-goruntuleri/operasyon/depo-02-toplama-listesi.png) | **Kuyruk.** Üstte "Hazırlık kâğıdını okut" (barkodla doğrudan siparişe atlama). Satır: referans · müşteri · B2B/B2C ve ilerleme ("3/3 kalem hazır", "1/2 · yarım"). |
| ![](ekran-goruntuleri/operasyon/depo-03-toplama-siparis-detay.png) | **Sipariş detayı, kutu açılmadan.** "Koliye: <ad>" satırı; kalem satırı: ürün · istenen adet · **parti SKT — motor önerisi**; sağda adet alanı + "tamamı ✓"; altında **eksik bildir**. Dipnot kutu mantığını anlatıyor: adet **bu kutuya** konanı sayar. CTA: *Kutu aç*. |
| ![](ekran-goruntuleri/operasyon/depo-09-toplama-cta-pasif.png) | **Pasif CTA** — hiçbir adet girilmemişken düğme ne istediğini yazıyor: "Kalem kalem say — ya da 'tamamı'". Ayrıca ikinci bir uyarı hâli: *önceden 3 yazılmış — yeni kayıt onun yerine geçer*. |
| ![](ekran-goruntuleri/operasyon/depo-04-toplama-eksik-bildir.png) | **Eksik bildirildi** — satır altına "karar yönetim ekranında" notu düşer; karar depocunun değil. |
| ![](ekran-goruntuleri/operasyon/depo-05-kutu-acik.png) | **Kutu açık.** Üstte "KUTU 1 · AÇIK" rozeti, altında "Kalemi kutuya okut". CTA "Kutuyu kapat"a döner (eksik beyanı varsa "— eksikleri bildir" ekiyle). |

### 2.2 Barkod okutucu (paylaşılan çekmece)

| | |
|---|---|
| ![](ekran-goruntuleri/operasyon/depo-06-barkod-okutucu.png) | Tam ekran koyu modal: başlık + *Vazgeç*, ortada nişangâh çerçevesi ve kırmızı tarama çizgisi. Altta **yalnız geliştirmede** görünen simülasyon şeridi (Paket · Koli ×24 · Toplama · Yabancı ürün · Tanınmayan) ve kural cümlesi: *koli, çarpanı kadar sayılır*. Karede kamera önizlemesi siyah — izin/kamera durumu, tasarım hatası değil. |
| ![](ekran-goruntuleri/operasyon/depo-07-okutucu-yabanci-urun.png) | **Ret hâli** — çekmece kapanır, ekranın altında pembe bant: *"Bu kod <ürün> ürününe bağlı — bu siparişte yok, kutuya girmez."* Aynı bant deseni bütün okutma reddi için geçerli. |

### 2.3 Etiket ve yazıcı
![](ekran-goruntuleri/operasyon/depo-08-etiket-karti-ve-yazici.png)

Kutu kapanınca kuyruğun üstünde **etiket kartı** doğar: referans · alıcı · depo/tarih · tahsilat türü ·
içerik · QR kodu · "Etiket basıldı (QL-1110NWB)" + *yeniden bas*. Altında **iğne deneyi** kutusu
(Brother · "Ağda yazıcı ara") — geliştirme yardımı.

### 2.4 D2 · Mal Kabul

| | |
|---|---|
| ![](ekran-goruntuleri/operasyon/depo-10-mal-kabul.png) | **Bekleyen sevkiyatlar** listesi + "Siparişsiz mal geldi" girişi. Satır: TS referansı · tedarikçi · kalem sayısı. |
| ![](ekran-goruntuleri/operasyon/depo-11-mal-kabul-sevkiyat-detay.png) | **Satır formu.** Her satırda: gelen adet kutusu, **SKT gir \*** (zorunlu), *lot:* alanı, *hasar bildir*; altında tarih ve lot girişleri. CTA eksiği söylüyor: "Her satırda adet + SKT zorunlu". |
| ![](ekran-goruntuleri/operasyon/depo-12-mal-kabul-satir-dolu-hasar.png) | **Dolu satır + hasar açık** — çip "hasar notu eklendi ✓" olur (kırmızıya döner) ve altında serbest not alanı açılır. |
| ![](ekran-goruntuleri/operasyon/depo-13-siparissiz-mal-kabul.png) | **Plansız kabul boş hâli** — iki yol: *Koli okut* · *Ürün ara ve ekle*. |
| ![](ekran-goruntuleri/operasyon/depo-14-urun-ara-cekmecesi.png) | **Ürün arama çekmecesi** (alttan) — "Hangi ürün geldi?" + arama alanı; ipucu: kod yazılırsa doğrudan bulunur. |
| ![](ekran-goruntuleri/operasyon/depo-15-urun-ara-sonuclar.png) | Sonuçlar: ürün · gramaj, sağda SKU. Klavye açıkken çekmece yarım ekrana oturuyor. |
| ![](ekran-goruntuleri/operasyon/depo-16-siparissiz-satir-eklendi.png) | Seçilen ürün satır olarak eklenir; aynı satır formu (adet/SKT/lot/hasar) geçerli. Dipnot: *SKT her satırda zorunlu; parçalı kabul mümkün*. |

### 2.5 D3 · Yakın-SKT Turu
![](ekran-goruntuleri/operasyon/depo-17-yakin-skt-turu.png)

Başlıkta eşikler yazılı (%25 yakın-SKT · %30 öneri indirimi). Satır: parti · adet · kalan gün ·
kalan ömür yüzdesi; sağda **durum rozeti**: *teklif AÇIK* (yeşil) · *imha edilmeli* (kırmızı) ·
*teklife girebilir* (turuncu) · *karar yok* (nötr, raf ömrü bilinmiyorsa). **İşaretleme yok** —
liste fiziksel ayıklama rehberidir; karar sistemce türetilir. Tek çıkış: *Sayım/Düzeltme →*.

### 2.6 D4 · Sayım / Düzeltme

| | |
|---|---|
| ![](ekran-goruntuleri/operasyon/depo-18-sayim-parti-secilmedi.png) | **Öznesiz hâl** — doğrudan girilince "Hangi parti düzeltilecek?"; ekran Yakın-SKT turundan bir parti bekliyor. |
| ![](ekran-goruntuleri/operasyon/depo-19-sayim-duzeltme.png) | **Parti seçili.** Başlıkta parti kodu + ürün. Dört sebep çipi: süresi geçti (imha) · hasar/soğuk zincir · kayıp · sayım farkı. İşaretli adet alanı (− düşüm · + yalnız sayım fazlasında). **Olay referansı** kayıttan sonra veriliyor; kayıt atomik. |
| ![](ekran-goruntuleri/operasyon/depo-20-sayim-sebep-secili.png) | **Doğrulama reddi** — "+" değer başka sebeple girilirse turuncu bant: *fazla yalnız "sayım farkı" sebebiyle yazılır*. Seçili sebep çipi koyu dolgu. Ayrıca kural cümlesi: *"iade stoğa döndü" depocuya açılmaz — yönetim istisnasıdır*. |

### 2.7 D5 · Transfer
![](ekran-goruntuleri/operasyon/depo-21-transfer-bos.png) — boş hâl: "Yolda transfer yok · Başka depo sevk ettiğinde burada görünür."

### 2.8 D6 · Kurye Dönüşü Kabulü

| | |
|---|---|
| ![](ekran-goruntuleri/operasyon/depo-22-kurye-donusu.png) | Başlık: kurye adı · rota kapandı. **Dönen mallar** — her kalemde üç akıbet düğmesi: *Stoğa dön* · *İmha* · *Jest*. Altta ikinci blok: **ulaşılamayanlar — araçta kalır, kabul edilmez**. CTA: "Her kalemde akıbet işaretle". |
| ![](ekran-goruntuleri/operasyon/depo-23-kurye-donusu-akibet-secili.png) | Akıbet seçilince satır altında **not alanı** açılıyor ("soğuk zincir kesintisiz — ambalaj sağlam"). |

---

## 3. Yerinde Satış (D7 · kurye ekranından da açılır)

Kapıya gelen müşteri · **anonim satış**. Depo ve kurye rotasından aynı ekran açılıyor.

| | |
|---|---|
| ![](ekran-goruntuleri/operasyon/satis-01-yerinde-satis.png) | Arama alanı + *Son satışlar ›*. Ürün kartı: görsel, ad, gramaj · fiyat; sağda **"2 boy — dokun, seç"** ya da tek boyluda doğrudan "kalan N". |
| ![](ekran-goruntuleri/operasyon/satis-02-boy-secimi.png) | **Boy çekmecesi** — ürün adı, "BOY SEÇ", her boy için gramaj · fiyat · **kalan stok**; altta *Sepete ekle*. |
| ![](ekran-goruntuleri/operasyon/satis-03-boy-secili-cekmece.png) | Boy seçili hâl (çip dolgusu). |
| ![](ekran-goruntuleri/operasyon/satis-04-satis-listesi-dolu.png) | Sepet doluyken altta koyu yapışkan şerit: *Sepet · 1 kalem · ~1,02 €* (yaklaşık işareti bilinçli — kesin toplam sunucudan gelir). |
| ![](ekran-goruntuleri/operasyon/satis-05-sepet.png) | **Satış sepeti** — kalem satırı + ✕ çıkar; ara toplam; *kesin toplam (indirim · KDV) satış yazılınca sunucudan gelir*; **TAHSİLAT**: Nakit · Kart. CTA seçim isteyene kadar pasif. |
| ![](ekran-goruntuleri/operasyon/satis-06-sepet-nakit-secili.png) | Tahsilat seçili hâl. |
| ![](ekran-goruntuleri/operasyon/satis-07-son-satislar.png) | **Son satışlar** — bu deponun kapı satışları; referans · tutar · tarih/saat · kalem · yöntem · satan personel. |

---

## 4. Kurye — "Günün Rotası"

| | |
|---|---|
| ![](ekran-goruntuleri/operasyon/kurye-01-gun-listesi.png) | Üst künye: **KURYE · tarih · ad**. Sefer referansı, ilerleme çubuğu (0/1), **cepte 0,00 €**, kırmızı satır: *1 kapıda tahsilat kaldı · 60,00 €*. Durak kartı: numara rozeti · adres · müşteri/B2B/kalem · **KAPIDA · 60,00 € KART** etiketi. Ayrıca "Yoldan gelen müşteri → Yerinde satış" kısayolu. CTA: *Seferi kapat · 1 açık*. |
| ![](ekran-goruntuleri/operasyon/kurye-02-teslimat.png) | **Durak ekranı — üç numaralı adım.** Üstte iletişim üçlüsü (Navigasyon · Ara · WhatsApp). **1 · KANIT** (B2B'de zorunlu): *İmza al* + *Fotoğraf* (kesik çerçeve = bağlı değil, gerekçesi altında yazılı). **2 · MAL**: her kalem dokunuşla ✓ teslim / ✕ reddedildi. **3 · TAHSİLAT**: motor tutarı, ±'li tutar alanı, yöntem çipleri (nakit · kart · çek) ve güvenceli cümle: *"tekrar dene" güvenlidir, para iki kez yazılmaz*. Altta sıra hatırlatması ve iki olumsuz çıkış. |
| ![](ekran-goruntuleri/operasyon/kurye-03-imza-pad.png) | **İmza pad'i** satır içinde açılır (ayrı ekran değil): "buraya imzalayın — <ad>" + Temizle · Onayla · Vazgeç. Boşken Onayla pasif. |
| ![](ekran-goruntuleri/operasyon/kurye-04-imza-cizildi.png) | Çizim sonrası Onayla aktifleşir. |
| ![](ekran-goruntuleri/operasyon/kurye-05-ulasilamadi.png) | **Ulaşılamadı paneli (2/2: not + onay)** — sebep çipleri (kapı açılmadı · telefona yanıt yok · adres bulunamadı) + serbest not + Vazgeç/Onayla. |
| ![](ekran-goruntuleri/operasyon/kurye-06-kabul-etmedi.png) | **Kabul etmedi paneli** — sebepler (koku/hasar şüphesi · sipariş beklenmiyordu · çok geç geldi) ve sonucu söyleyen cümle: *koliler iade akışına düşer, akıbet kararı depo kabulünde verilir* (→ D6). |
| ![](ekran-goruntuleri/operasyon/kurye-07-gun-kapanisi.png) | **Seferi Kapat** — uyarı bandı ("1 durak sonuçlanmadı — kapanış engellenmez"), üç sayaç kutusu (teslim/bekleyen/dönen), **PARA — saydığını gir** (nakit·kart·çek: beklenen ↔ girilen ↔ fark) ve isteğe bağlı not. |

---

## 5. Para (Muhasebe) — salt okuma

| | |
|---|---|
| ![](ekran-goruntuleri/operasyon/muhasebe-02-para.png) | **Tahsilat İzleme.** Başlık künyesi "PARA · SALT OKUMA" diyor. Bekleyen tahsilatlar (referans · müşteri · durum · **Kapıda tutar · yöntem**); bugün gerçekleşen yöntem kırılımı; **kuryenin üstünde (K7'ye dek)** kutusu; hesap bakiyeleri. Kapanış cümlesi net: *"bakiye düzeltme" diye bir kavram yok — hiçbir yazma aksiyonu çizilmez*. |
| ![](ekran-goruntuleri/operasyon/muhasebe-03-gun-sonu.png) | **Gün Sonu Özeti** — tahsilat toplamı · iadeler · kurye nakit teslimi; **uyuşmazlık** bloğu (yalnız görünür, çözüm masaüstünde); eşleşmemiş hareket sayacı. |

---

## 6. Yakalanamayan hâller (bilerek açık bırakıldı)

Tasarımın bilmesi gereken ama bu turda üretilemeyen durumlar:

1. **Kargo kutusu tipi çekmecesi** (`warehouse-picking-box-type-sheet`). Koşulu: siparişin teslim
   türü `shipping` **ve** depoda etkin kargo kutusu tipi tanımlı. Kuyrukta kargo şeritli hazırlık
   siparişi kalmadığı için tetiklenemedi. İçeriği koddan bilinir: kutu adı + ölçü satırı listesi ve
   bir **"atla"** çıkışı — tipsiz kutu meşru bir hâldir (listede olmayan karton kullanılıyor olabilir).
2. **Eksik toplama kararının dolu hâli** — eksik beyanı taşıyan bir kutunun kapanmasını gerektiriyor.
3. **Kabuk kapısının üç hâli** — yükleniyor (halka) · yetkisiz (müşteriye yönlendirme) · **okunamadı**
   (hata bloğu + tekrar dene). Üçü de ağ/oturum koşuluna bağlı; kasten üretilmedi.
4. **Kamera önizlemesi** — okutucu karesinde siyah; kamera izni/donanımı devrede değil.
5. **Fotoğraf kanıtı** (kurye) — "bu sürümde bağlı değil" diye ekranın kendisi söylüyor.
6. **Transfer dolu hâli** — yolda transfer yok.

---

## 7. Yeniden tasarım için bir arada duran desenler

Bunlar bugünkü yüzeyin **tekrar eden** parçaları; yeni tasarımda karşılıkları bir kez kararlaştırılırsa
59 ekranın tamamı hizalanır:

- **Başlık bloğu** — üstte küçük kaps künyesi (bölüm · tarih · kişi), altında iri serif ekran adı; hub'da
  sağda zil + baş harf rozeti, alt ekranlarda solda yuvarlak geri düğmesi. Başlık **sayfayla kayar**,
  çizgisiz ve zeminle aynı renkte.
- **Yapışkan alt CTA** — tek birincil eylem; pasifken eksik olanı yazar.
- **Çip şeritleri** — süzgeç (Tümü/kanal), sebep (dört tip), yöntem (nakit/kart/çek), mod (İnsan/Hibrit).
  Seçili = dolgu, seçilmemiş = çerçeve.
- **YZ balonu** — kesik çerçeve + "operatör cevabı değildir" künyesi + tek/iki çıkış düğmesi. İki ayrı
  ekranda (sosyal, şikâyet) aynı desen.
- **Bant bildirimleri** — pembe/kırmızı ret, turuncu uyarı, yeşil süre; hep içerik ile CTA arasında.
- **Alt çekmece** — kimlik menüsü, boy seçimi, ürün arama, kutu tipi. Perde + tutamak + başlık.
- **Boş hâl kartı** — iri başlık + tek cümle gerekçe + (varsa) tek eylem. "Bilinmiyor" ile "yok"
  ayrımı metinde tutuluyor.
- **Sınır cümleleri** — neredeyse her ekranın dibinde "bu ekran şunu yapmaz" notu var (fiyat görmez ·
  mesaj göndermez · bakiye düzeltmez · masada devam et). Bunlar süs değil, yüzeyin sözleşmesi.
