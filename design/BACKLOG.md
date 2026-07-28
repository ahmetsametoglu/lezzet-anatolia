# Tasarım Backlog'u — Çizilmiş Ama Kodlanamayan

Bu dosya **tasarımda kararı verilmiş ama koda geçemeyen** işleri tutar. Üç sorunun cevabı burada:
neyi bilerek yapmadık, neyi neden bekliyoruz, neyi tasarımdan saparak yaptık.

> **Rol ayrımı.** Kapsam (ne yapılacak) → `docs/architecture/BACKLOG.md`. İlerleme (nerede kaldık)
> → `docs/build/NN-*.md` görev satırı. Burası ikisi de değil: **tasarım ile kod arasındaki açığın**
> envanteri. Bir madde kapandığında buradan silinir, izi ilgili `docs/build` Durum notunda kalır.
>
> **Neden ayrı dosya:** bu açıklar kod içi `STUB(...)` yorumlarında dağınık duruyordu. Yorum, o
> dosyayı açanı uyarır; ama "müşteri yüzeyinde neler eksik" sorusunun tek bir cevabı olmalı — yoksa
> soru her sorulduğunda `grep` ile yeniden derleniyor ve her seferinde bir madde atlanıyor.

---

## 1. Tasarımı hazır, başka modül bekliyor

Bu maddelerde **kodlanacak bir şey yok** — arayüz tamam, arkasındaki model yok. Bekleyen iş gelince
değişecek yer parantezde.

| Ne | Tasarım | Bekleyen |
| --- | --- | --- |
| **Sepet kupon kartı — bağlanması** | **UI çizildi** (alan + "Uygula" + sebep satırı); uygulanmış çip + ✕, dört ret hâli ("süresi dolmuş" · "geçersiz" · "40 € üzeri" · "otomatik indirim daha büyük") ve özetteki yeşil indirim satırı motorla gelir | indirim/kupon motoru (`BACKLOG §15`) |
| **Sepet teslimat satırı** ("Teslimat: Ücretsiz" / "6,90 €") | çizili, **kodlanmadı** | ücret teslimat türüne, tür ADRESE bağlı → checkout adres adımı. Ücretsiz kargo ilerleme çubuğu bundan AYRI ve yapıldı (eşik `Setting`'ten, ilerleme ara toplamdan) |
| **"Checkout'a geç" düğmesi** — girişli müşteri doğrudan, ziyaretçi önce hızlı doğrulamaya | çizili, tam görünür ve pasif | `07.4`/`07.5` |
| **"Fiyat değişti" bildirimi** — `DOMAIN §5`: fiyat arttıysa müşteriye açıkça söylenir ve onay istenir (kabul et / çıkar); düştüyse sessizce uygulanır | tasarımda yok (yalnız stok uyarısı çizili) | `CartItem.unitPrice` okuma tarafına bağlanmalı — alan yazılıyor, karşılaştırılmıyor |
| **Boş sepet: "Bu hafta çok sevilenler"** — 4'lü ürün ızgarası (web) / 2'li (mobil), kart üstünde "Sepete ekle" | `Musteri - Sepet.dc.html` → `Bos Sepet Web/Mobil` | **popülerlik sinyali yok** — aşağıda §1b |
| **Boş sepet: B2B sipariş şablonları** ("Haftalık standart · 14 kalem" + "Yükle") | aynı tasarım, durum kartı | şablon modeli yok (`07`); B2B müşteri bugün "son siparişi tekrarla" bloğunu görür |
| **Boş sepet kahraman görseli** (hasır sepet / tezgâh fotoğrafı, web 260×200 · mobil 180×140) | çizili | görsel künyesi yok; çerçeve tam boyutuyla duruyor, yer tutucu sepet işareti |
| **Paketler kahraman görseli** (3:2, "kurulmuş sofra, birkaç paket bir arada") | çizili; çerçeve tam ölçüsüyle duruyor | görsel künyesi yok — paket sayfasının kendi kahramanı için ayrı bir varlık gerekiyor |
| **Paketler listesi: etiket çipleri + `?etiket=` süzgeci** | çizili; sayfanın kendisi indi (kartlar, "Daha fazla", boş durum) | paketin etiket alanı yok — süzgeç uydurma bir sınıflandırma olurdu |
| **Tüm Yorumlar paneli** (web modal · mobil tam ekran, yıldız süzgeci, 10'ar sayfalama, `?yorumlar=1`) | `Musteri - Urun Detay.dc.html` → `Tum Yorumlar Web/Mobil` | `17-geri-bildirim` |
| **Ürün detay yorum bölümü** — puan satırı, ortalama kartı, "N yorumun tümü →" | çizili; **boş hâli kodlandı** (bugün her ürünün yorum sayısı gerçekten sıfır) | `17` |
| **"Yorum yaz"** — yalnız o ürünü satın almış girişli müşteride | çizili | `17` + `04-auth` + `07` |
| **Fiyat sıralaması** (K18'in "Artan/Azalan fiyat" seçenekleri) | çizili, seçenekler görünüyor ama sonucu değiştirmiyor | **okuma görünümü (migration)** — aşağıda §1a |
| **Menü: Fırsatlar · Keşif · Professionnels** | K12'de çizili, bugün düz metin (Paketler bağlandı) | kendi sayfaları (`08.7`) |
| **Menü: Hesabım** | K12'de tanımlı | `04-auth` |
| **İmha geçmişi: "Kayıt" sütunu** | `Operasyon - Stok.dc.html` imha tablosunda çizili | `stock_adjustment`'ta referans alanı yok; numara **yazma akışında** doğar (`10` depo) — aşağıda §1c |

### 1a. Fiyat sıralaması neden ayrı bir engel

Stub bir süre `→05.4` etiketliydi; 05.4 (fiyat) indi ve sıralama yine açılmadı — **etiket yanlış
hedefi gösteriyordu.** Gerçek engel şu: uygulanabilir fiyat ayrı tablodadır (kanal + geçerlilik
tarihi + müşteriye özel satır) ve "bu ürünün b2c fiyatı" tek bir kolon değil bir **seçimdir**.
Ürünleri o seçime göre sıralayıp aynı anda keyset sayfalamak `available_stock` gibi bir okuma
görünümü ister. Sayfa çekildikten sonra sıralamak seçenek değil: "artan fiyat" yalnız o 30 satır
içinde artan olur.

### 1b. "Çok sevilenler" neden bugün çizilmiyor

Başlık bir POPÜLERLİK İDDİASIDIR. Elimizde popülerlik ölçüsü yok: satış sayısı `order_item`
satırlarından çıkar ve gruplayarak saymak ya bir okuma görünümü (migration) ya da sınırsız
büyüyen bir kümeyi uygulamada toplamak demek — ikincisi sipariş sayısı arttıkça sessizce yavaşlar.

Anasayfanın `featured` seçkisi (bugün "ilk dört ürün") oraya konabilirdi ama **konmadı**: "çok
sevilenler" diye etiketlenen rastgele dört ürün, uydurma sosyal kanıttır — projenin yorum
tarafında reddettiği şeyin aynısı. Tasarımın kendi kuralı da bu boşluğu zaten çözüyor: *"Bağlam
yoksa alan tamamen kaldırılır, ekran yalnız başlık + iki butonla kalır (boşluk doldurulmaz)."*

> Aynı hata bir kez daha yaşandı: "Fırsat" rozeti `→05.6` (genel indirim motoru) etiketliyken,
> gerçekte beklediği şey `05.6` değil zaten var olan near-expiry teklifiydi — kablo eksikti, modül
> değil. **Ders:** stub'a bağımlılık yazarken "hangi modül" kadar "gerçekten o modül mü" da sorulur.

### 1c. "Kayıt" sütunu — faydalı, ama satır başına DEĞİL (28.07 kullanıcı kararı)

Sütunun arkasında gerçek bir ihtiyaç var, üç yerde çıkıyor: **kâğıt ↔ kayıt eşleşmesi** (imha
tutanağı fiziksel tutulur; denetmenin elindeki kâğıdın ekranda karşılığı bulunmalı), **tedarikçiye
talep** (hasarlı teslimat / soğuk zincir kaybında alacak yazışması bir numara anar), **sayım
oturumu** (tek sayımda düşen onlarca satırı muhasebeye giden tek cümlede toplamak).

Üçüncüsü tasarımın çizdiği şekli çürütüyor: ihtiyaç **satır başına** değil **olay başına**
numaradır. Bir imhada üç ayrı parti çöpe gidebilir; üçüne üç numara vermek, eşleştirmek istenen
kâğıdı üçe böler. Doğru şekli `IMH-26-0012` / `SAY-26-0043` gibi, aynı operasyonun bütün
satırlarının **paylaştığı** bir referans.

Bugün eklenirse sütun ya boş durur ya UUID'nin son altı hanesini gösterir — okunabilir ama kimsenin
kâğıda yazmayacağı bir şey. Numara ancak **doğduğu yerde** anlamlı olur: `Order` deseninde
`reference_no` ilk kalıcı durumda RPC içinde üretilir, tabloya sonradan iliştirilmez. Karşılığı
`adjust_stock` yazma akışıdır ve orası depo modülünün (`10`) alanı.

**Karar:** sütun tasarımdan düşürülmedi, `10`'a **park edildi**. 10 yazılırken üretilecek şey satır
referansı değil olay referansıdır; stok ekranı o alanı okuyup sütunu açar.

---

## 2. Karar bekleyen (tasarım tarafında netleşmeli)

- [ ] **Koleksiyonlar bandı** — `pages/musteri-anasayfa.md` içerik envanterinde var,
      `Musteri - Anasayfa.dc.html` tasarımında **yok**. İmprovize edilmedi. Ya tasarıma bant eklenir
      ya envanterden düşülür.
- [ ] **Katalogun "koleksiyon görünümü" varyantı** — `Musteri - Katalog.dc.html`'de üstbaşlıklı
      başlık bandıyla çizili, ama koleksiyon rotası yok. Rota açılınca yalnız başlık bloğu değişir.
- [ ] **Paketler listesinin içerik envanteri** — tasarımı var (`Musteri - Paketler.dc.html`) ama
      `pages/musteri-paketler.md` **yok**. Diğer 15 müşteri sayfasının hepsinde ikisi de var; bu
      sayfa envantersiz kaldı, "hangi bilgi neden" yazılı değil.
- [ ] **Hata sayfası başlık ölçüleri** — `message-screen.tsx` üç ham kademe taşımaya devam ediyor
      (emoji 42 · başlık 40/27 px); bunlar envanter §0.4 ölçeğinde yok. Kademe eklemek mi yuvarlamak
      mı — hata sayfası tasarımının ayrı ele alınmasını gerektiriyor. **Dosyanın kalanı token'landı**
      (üstbaşlık → `text-eyebrow`), yalnız bu üç değer kaldı.

---

## 3. Bilinçli sapmalar (kapanmış — yeniden tartışılmasın)

Bunlar eksik değil, **verilmiş karar**. Not düşülüyor ki bir sonraki denetimde "tasarımdan sapma"
diye yeniden açılmasın; itiraz gelirse madde §2'ye taşınır.

- **Ürün adı 40 px yerine `text-page-title` (38).** Katalog başlığıyla aynı kademe; envanterin resmî
  ölçeği (h1 52 · h2 28 · kart 24) ikisini de tanımlamıyor. İki ayrı token yerine tek kademe.
- **Satın alma butonu 17 px yerine `text-lead` (18)**, yeni `lg` buton boyu olarak.
- **Ara kademeler yuvarlandı** (26→24 · 19→18 · 17→15). Kademe çoğaltmak hiyerarşiyi görünmez yapar.
- **Token öneki `--mus-*` değil, öneksiz** (`--color-ink`); operasyon `--color-ops-*`. İşlevsel fark
  yok, iki evren yine ayrık.
- **Stok rozeti sola yaslı.** Tasarımda puan satırının sağına yaslıdır; puan satırı `17` gelene kadar
  hiç çizilmediği için rozet o satırın yerinde tek başına duruyor. Yorumlar bağlanınca sağa geçer.
- **Galeri "+N" kutusu şeridi büyütür**, ışık kutusu açmaz. Tasarım bu kutunun davranışını yazmıyor;
  yeni bir katman yerine var olan şeridi genişletmek seçildi.
- **Mobil beyan akordeonları `<details>` ile.** Yerli öğe: klavyeyle çalışır, JS istemez ve
  **kapalıyken de içerik DOM'da durur** — INCO gereği beyan satın alma öncesi erişilebilir olmalı.
- **Sepette fiyat DONDURULMAZ.** Tasarımın etkileşim sözleşmesi "fiyatlar sepete eklendiği andaki
  fiyattır, liste yenilense de satır fiyatı değişmez" diyor; `DOMAIN §5` (karar 27.07) bunun
  tersini karara bağladı — bağlayıcı fiyat **checkout başlangıcında** sabitlenir, sepetteki fiyat
  yalnız gösterim ve değişiklik tespiti içindir. Sepet aylarca bekleyebiliyor; orada donan fiyat
  maliyeti oynayan üründe zarar, fiyat düştüğünde müşteriye haksızlık olur. Karar tasarım notundan
  SONRA verildi ve onu ezer. **Not:** kararın ikinci yarısı (fiyat arttıysa müşteriye bildir ve
  onay iste) henüz kablolanmadı — `CartItem.unitPrice` yazılıyor ama karşılaştırmada okunmuyor;
  §1'de izleniyor.
- **Geri alma şeridi ekranın ÜSTÜNDE.** Tasarım yerini yazmıyor. Altta iki sabit çubuk var (sepette
  toplam, ürün detayda satın alma); şerit alta konsaydı "Geri al" düğmesi tam onların üstüne düşerdi.
- **Ürün detayda TEK KONTROL** (28.07, kullanıcı kararı). Tasarım adet seçici + "Sepete ekle —
  {toplam}" düğmesini YAN YANA gösteriyor; ekleme sonrası düğme 1,5 sn "Eklendi ✓" olup eski hâline
  dönüyor. İki sorunu var: (1) dönen hâl yine "Sepete ekle" ve seçici aynı sayıda duruyor — ikinci
  kez basan müşteri adedi **ikiye katlıyor** ve göremiyor (sepet adetleri toplar); "3 ekledim, hâlâ
  3 yazıyor, olmadı galiba" refleksi tam buraya basıyor. (2) Sepette olmayan bir şeyin "3 adedi"
  hiçbir yerde karşılığı olmayan bir sayıdır — ekleme öncesi adet sormak, henüz var olmayanı ölçmek.
  Yerine katalog kartının modeli: önce yalnız "Sepete ekle" düğmesi vardır ve HER ZAMAN 1 ekler;
  kalem sepete girince düğme yerini **aynı kutuyu dolduran** adet seçicisine bırakır, 0'a inmek
  düğmeyi geri getirir. İki kontrol piksel piksel aynı kutudur (çerçeve farkı düğmeye şeffaf
  kenarlıkla kapanır) — geçiş, bir düğmenin başka bir düğmeye dönüşmesi gibi görünür. "Sepete git"
  konmaz (yol başlıkta zaten var); "Eklendi ✓" kaldırıldı (kalıcı mod değişimi daha güçlü onay).
  Varyantlı üründe adet SEÇİLİ BOYA aittir: 500 g'dan 3 alıp 1 kg'a geçene hâlâ 3 göstermek yalan.
- **Tasarımdan piksel alırken KUTU MODELİ toplanır.** Tasarım HTML'i `content-box` (reset yok),
  Tailwind `border-box`. Tasarımda aynı öğede hem genişlik hem ped varsa gerçek genişlik
  `genişlik + ped + çerçeve`dir; sayıyı olduğu gibi yazmak öğeyi dar bırakır. İki kez yaşandı:
  boy kartı 44 px (150 → 194), arama alanı 38 px (250 → 288). Sabit genişliğin YANINDA ped yoksa
  (görsel çerçevesi, kategori dairesi, benzer ürün şeridi) sayı doğrudan yazılır — onlar denetlendi.
- **Sepet satırı görseli kare (1:1).** Tasarımın 72×72 kutusuyla ve görsel künyesiyle
  (`image.schema`: "1:1 · sepet · paket satırı") uyumlu; katalog kartının 3:2'si satırı şişirirdi.

---

## 4. Tasarımı olmayan yüzeyler

Müşteri evreninin 15 sayfasının hepsinde hem içerik envanteri hem görsel karar var (üstteki
Paketler istisnası dışında). Operasyon, depo ve kurye yüzeylerinin **sayfa** tasarımları da mevcut;
onların kod tarafındaki açıkları kendi `docs/build` dosyalarında izlenir, burada tekrarlanmaz.

**İstisna — operasyonun diyalog formları.** `.dc.html` dosyaları sayfaları çiziyor; form
diyaloglarının (ürün · katalog · paket) görsel kararı çizilmedi ve bilinçli olarak **bize** bırakıldı
(kullanıcı kararı, 28.07: "operasyon tarafında özellikle diyalog formlarında kendi custom
tasarımlarımızı yapıyoruz — bunlar sapma değil, bilinçli tercih"). Bu yüzden aşağıdaki §5 bir
"sapma" listesi değil, **yazılmış kararlar** listesidir: sapılacak bir tasarım yok.

---

## 5. Operasyon evreni — yazılmış kararlar (yeniden tartışılmasın)

Diyalog formlarında ve onların beslediği liste satırlarında verilmiş kararlar. Mekanik bir denetim
(ör. ölçü/token turu) bunları "tasarıma çekilecek sapma" sanıp geri almasın: geri çekilecek bir
tasarım yok, gerekçe burada yazılı. İtiraz gelirse madde §2'ye taşınır.

**Paket formu (`tabs/package/`) — tümüyle yazılmış.** Referansı ürün form diyaloğu; ondan ayrılan
tek yer sekme yokluğu (paketin alanı çok daha az, ürün formunu ikiye bölen yasal beyan yığını yok).

- **Mutabakat şeridinin zemini NÖTR, yeşil değil.** Toplamın tutması olağan hâldir; her kayıtta
  yeşil kutlamak dikkati ucuzlatır. Renk yalnız dikkat gerektiğinde (amber) girer.
- **Şerit üç satır, her biri bir soru:** anlaşma (ayrı ayrı → paket → indirim) · bize ne kalıyor
  (maliyet · kâr · marj) · varsa sorun ve TEK çare. Altı sayı yan yana yazılıyordu, hiçbiri
  öbüründen önemli görünmüyordu.
- **Mutabakat rozeti AMBER, kırmızı değil** (formda da listede de). Tutmayan paket satılabilir,
  yalnız faturası eksik olur; kırmızı gerçekten satışı engelleyen durumlara saklı.
- **Liste satırında rozet yalnız BOZUKKEN çıkar.** Olağan hâl sessizdir; kazanılan sütun paraya
  (marj · kâr · maliyet) gitti.
- **"Payları yeniden dağıt" düğmesi YOK.** Dağıtım otomatik olduğu için düğme kendiliğinden olanı
  elle yapıyordu. Yerine duruma göre tek çare: elle girilen satır varsa "elle girilenleri bırak",
  yoksa kalan kuruş durumudur ve "paket fiyatını X € yap".
- **İndirim yüzdesi saklanan bir alan değil**, paket fiyatının ikinci yazımı — birini gir, öbürü
  dolsun. Operatör kimi zaman "34,90 olsun", kimi zaman "%10 vereyim" diye düşünür.
- **Diyalog genişliği 1160 px** (mobilde 520). Envanterde diyalog ölçüsü yok; kalem tablosu 1040'ta
  sıkışıyor, 1240'ta diyalog ekranı yutuyordu.
- **"vitrinde yok" işareti.** Kalemin ürünü satıştan çıkınca paket vitrine çıkamaz ama `is_active`
  ÇEVRİLMEZ (o alan operatörün niyeti) — satır gerçeği söyler, niyeti bozmaz.

**Ürün ve katalog formları — kabuk kararları.**

- **Kaydet engellendiğinde SEBEBİ yazılır** (`DialogFooter.blockedReason`) ve düğme kilitlenir.
  Önce düğme etkin görünüp submit sessizce yutuluyordu: basılıyor, hiçbir şey olmuyordu.
- **Ürün formunun altlığı ürün ↔ paket bağını söyler** ("N pakette kullanılıyor"; satıştan
  çıkarırken düşecek paketler adıyla).
- **Para ve yüzde girdileri** odakta serbest yazım, odaktan çıkınca iki hane + virgül
  (`MoneyInput`/`PercentField`). Aynı ekranda üç ayrı yazım görünüyordu.
- **Sekme çubuğunda eylem alanı + sekmeye bağlı arama.** "Yeni …" düğmesi ve arama kutusu sayfa
  başlığından buraya taşındı; arama hangi sekme açıksa onda arar (eskiden her sekmede üründe
  arıyordu).
- **Teklif diyaloğu kendi alt barını kurar** (ortak `DialogFooter` yerine): "Teklifi kapat" İptal ve
  Kaydet'in yanında ÜÇÜNCÜ bir yol ve ortak altlık iki düğme varsayıyor. Kapatma hiçbir koşulda
  kilitlenmez — yanlışlıkla açılmış bir teklif her zaman geri alınabilmeli.
- **Mobil stok ekranı "Karar" sekmesiyle açılır**, seviyelerle değil. Tasarımın kendi notu: telefonda
  günlük iş "yaklaşan tarihliye bakıp teklif açmak", acil iş lot sorgusu — ikisi de başta durur.

### Stok ekranı — tasarım güncellemesi uygulandı (28.07)

Tasarım güncellendi ve önceki sapmam **kapandı**: sağ panel artık "En acil partiler" (karar kuyruğunun
ilk üçü + riskteki tutar + "N partinin tümü →"), yani karar kuyruğunun önizlemesi. Tasarımdaki hâliyle
uygulandı; panel seçili satıra değil KUYRUĞA bağlı, çünkü aciliyet listeden bağımsızdır.

Karar sekmesi de yeniden kurgulandı ve birebir uygulandı: **üç grup** (satılamaz · DLC yaklaşıyor ·
DDM yaklaşıyor), grup başına parti sayısı + riskteki tutar + kuralın bir cümlelik açıklaması; kartta
MLOR rozeti, tarih satırı, maliyet satırı, açık teklif kutusu ("N / M çıktı") ve açık teklifte ikinci
düğme ("Teklifi kapat"). İmha sekmesi dönem seçici + neden dağılımı + geniş tabloya döndü.

**Kalan açık — parti listesi (varyant altında).** Brief (`admin-stok.md §2`) bunu istiyor, güncellenmiş
tasarım da çizmiyor: web seviyeler tablosunda satır açılmıyor ve sağ panel artık karar kuyruğu. Parti
künyesi (lot · konum · alış fiyatı · kalan raf) bugün yalnız KARAR BEKLEYEN partiler için görünüyor;
sağlıklı bir partinin lotuna bakmanın yolu yok. Mobilde satır açılıyor, webde açılmıyor — bu da ayrıca
tuhaf. Ya seviyeler satırına açılır bir künye çizilmeli ya brief maddesi düşmeli.

**Eklenen — kâr marjı alanı (tasarımda yok, bilinçli).** Teklif diyaloğunda fiyatın ÜÇÜNCÜ yüzü:
alış fiyatına göre kâr marjı (%). Tasarım yalnız liste fiyatına göre indirimi çiziyor, ama elden
çıkarma kararında asıl soru "listeden ne kadar indirdim" değil, "bu maldan kâr mı ediyorum, ne kadar
zarara razıyım". Liste fiyatı bir referans; karar alış fiyatına göre verilir. Marj EKSİ girilebilir —
zararına satmak da bir karardır ve elde kalıp imha edilecek maldan iyidir. Üç kutu tek sayının farklı
okunuşu: birini yazan öbür ikisini doldurur.

**Kalan açık — "Kayıt" sütunu (IM-118).** İmha tablosunda tasarım okunur bir kayıt numarası gösteriyor
(`IM-118` · `SY-27`) ve kayda köprü kuruyor. `stock_adjustment`'ta böyle bir alan YOK; uuid'in ilk
altı hanesini "IM-118" gibi göstermek uydurma olurdu. Sütun **çizilmedi**. Gerekiyorsa `Order`'ın
`reference_no` deseni buraya da uygulanır (sıra + önek) — veri modeli kararı, ekranın değil.

### Yazı ölçeği — karar (28.07)

Envanter §0 yalnız font AİLELERİNİ veriyordu. Ölçüm şunu gösterdi: **ölçek tasarımda da yoktu** — 20
operasyon `.dc.html` dosyası **18 farklı boy** kullanıyor (en sık: 12 · 13 · 11,5 · 12,5 · 11), çünkü
ekranlar ayrı zamanlarda çizilmiş ve her biri kendi boyunu seçmiş. Yani "envanterden gelecek doğru
cevap" diye beklenen şey aslında verilecek bir karardı; beklemek 175 ham değeri bir tur daha
yaşatırdı. Yedi rol tanımlandı (`globals.css` §0), 18 boy bunlara indi, **her birleştirme ≤ 2 px**:

| token | px | rol | yuttuğu ham boylar |
|---|---|---|---|
| `text-ops-title` | 22 | sayfa başlığı | 22 · 24 |
| `text-ops-section` | 18 | bölüm/dialog başlığı | 17 · 18 · 20 |
| `text-ops-lead` | 15 | öne çıkan sayı, kart adı | 15 · 16 |
| `text-ops-base` | 13 | gövde, tablo hücresi | 13 · 13,5 · 14 |
| `text-ops-sm` | 12,5 | ikincil satır, hücre alt bilgisi | 12 · 12,5 |
| `text-ops-xs` | 11 | etiket, yardım metni | 11 · 11,5 |
| `text-ops-micro` | 10 | tablo başlığı, rozet (uppercase + tracking) | 9 · 9,5 · 10 · 10,5 |

- **Satır yüksekliği ve ağırlık token'a GÖMÜLMEDİ** (müşteri evreninde gömülü). Yoğun tabloda
  `leading` yerel bir karar; token'a gömmek, hiç `leading` yazmayan yerlerin satır aralığını sessizce
  değiştirirdi. Ayrı bir tur konusu.
- **Ad çakışması tuzağı:** renk token'larında `body` ve `card` dolu (`text-ops-body` bir RENK
  yardımcısı). Ölçek adları bu yüzden `base`/`sm` seçildi — `text-ops-body` yazan yer hâlâ renk demek.

### Ölçek bir kademe büyütüldü (28.07, kullanıcı kararı)

Tasarım dosyalarındaki ham boylar (9–22px) ekranda küçük kalıyordu. **Tüm ölçek ~1px yukarı taşındı,
oranlar korundu** — hiyerarşi aynı, yalnız taban yükseldi:

| token | önce | sonra |
|---|---|---|
| `title` | 22 | **24** |
| `section` | 18 | **19** |
| `lead` | 15 | **16** |
| `base` | 13 | **14** |
| `sm` | 12,5 | **13** |
| `xs` | 11 | **12** |
| `micro` | 10 | **11** |

Bu **tek dosyalık** bir değişiklikti (`globals.css`) — 186 kullanım yerinin tek tek dolaşılması
gerekmedi. Token turunun asıl kazancı buydu ve ilk kez burada nakde çevrildi.

Metin ~%8 genişlediği için **sabit px sütunlar** aynı oranda açıldı (18 sütun, beş tabloda); `fr`/
`minmax` ile tanımlı sütunlar zaten esniyordu. Yan etki: `micro` 11px olunca rozetler tasarımın
istediği boya OTURDU — daha önce 1px küçüktü.

Bu bir tasarım sapmasıdır: `.dc.html` dosyaları eski boyları taşımaya devam ediyor. Tasarım tarafı
ölçeği güncellerse bu madde kapanır; güncellemezse fark bilinçli olarak kalır.

### Palete kurşuni ton eklendi (28.07)

`slate` (#5a6472 / #eceff3, karanlıkta ters çevrilmiş) — **ölçüm/nötr kayıt** anlamı için. İmha
geçmişindeki "Sayım farkı" tasarımda bu renkte; palette karşılığı yoktu ve mavi kullanılıyordu, oysa
mavi bizde "onay/aday" demek ve sayım farkına yanlış anlam yüklüyordu. `OpsTone` kapalı liste olduğu
için derleyici üç tüketiciyi de yakaladı (Badge · MultiToggle · dağılım çipi).

Rozetin dolgusu ve yarıçapı da tasarımın değerlerine çekildi (3×9 · r7); önce 2×8 · r6 idi.

### Açık kademeler (envanter kararı bekliyor)

Operasyon envanteri (§0) yalnız renk, yarıçap ve font ailesi veriyor; **ölçü kademesi yok.** Bunlar
uydurulmadı, envantere yazılması bekleniyor:

- ~~Yazı ölçeği~~ → **KARARA BAĞLANDI (28.07), aşağıda.**
- **Küçük (iç) yarıçap.** Kart 8 · diyalog/çip 14 token'ları var; iç öğeler (tablo satırındaki 3:2
  görsel 7 · küçük görsel 5 · anahtar dilimi 6) hiçbirine oturmuyor. Bir "iç öğe" kademesi (≈6 px)
  gerekiyor; o gelene kadar bu on yer ham kaldı.
- **Kontrol yarıçapı.** Girdi kutuları (`field-shell`) kart token'ına bağlandı; ayrı bir kademe
  isteniyorsa envanterde belirtilmeli.
