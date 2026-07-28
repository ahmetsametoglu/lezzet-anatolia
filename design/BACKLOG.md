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
| **Sepet paket satırı** — antrasit çerçeveli grup, "Paket · N ürün" rozeti, kesikli ayraçla salt-okunur içerik listesi; adet/silme bütüne işler | `Musteri - Sepet.dc.html` (web + mobil) | `05.5` Bundle modeli |
| **Sepet kupon kartı — bağlanması** | **UI çizildi** (alan + "Uygula" + sebep satırı); uygulanmış çip + ✕, dört ret hâli ("süresi dolmuş" · "geçersiz" · "40 € üzeri" · "otomatik indirim daha büyük") ve özetteki yeşil indirim satırı motorla gelir | indirim/kupon motoru (`BACKLOG §15`) |
| **Sepet teslimat satırı** ("Teslimat: Ücretsiz" / "6,90 €") | çizili, **kodlanmadı** | ücret teslimat türüne, tür ADRESE bağlı → checkout adres adımı. Ücretsiz kargo ilerleme çubuğu bundan AYRI ve yapıldı (eşik `Setting`'ten, ilerleme ara toplamdan) |
| **"Checkout'a geç" düğmesi** — girişli müşteri doğrudan, ziyaretçi önce hızlı doğrulamaya | çizili, tam görünür ve pasif | `07.4`/`07.5` |
| **"Fiyat değişti" bildirimi** — `DOMAIN §5`: fiyat arttıysa müşteriye açıkça söylenir ve onay istenir (kabul et / çıkar); düştüyse sessizce uygulanır | tasarımda yok (yalnız stok uyarısı çizili) | `CartItem.unitPrice` okuma tarafına bağlanmalı — alan yazılıyor, karşılaştırılmıyor |
| **K21 · Sepet Özet Çubuğu (mobil)** — ekran altına sabit "3 ürün · 26,30 € / Sepete git"; sepet boşken görünmez, ekleme yapıldıkça canlı güncellenir | `Komponent Envanteri - Musteri.dc.html` K21; katalog etkileşim sözleşmesi de anıyor | **hiçbir şeyi beklemiyor** — sepet durumu hazır (`useCart`), yalnız yapılmadı |
| **Boş sepet: "Bu hafta çok sevilenler"** — 4'lü ürün ızgarası (web) / 2'li (mobil), kart üstünde "Sepete ekle" | `Musteri - Sepet.dc.html` → `Bos Sepet Web/Mobil` | **popülerlik sinyali yok** — aşağıda §1b |
| **Boş sepet: B2B sipariş şablonları** ("Haftalık standart · 14 kalem" + "Yükle") | aynı tasarım, durum kartı | şablon modeli yok (`07`); B2B müşteri bugün "son siparişi tekrarla" bloğunu görür |
| **Boş sepet: "Hazır paketleri gör" düğmesi** | çizili, tasarımdaki yerinde ve pasif | `05.5` + Paketler rotası |
| **Boş sepet kahraman görseli** (hasır sepet / tezgâh fotoğrafı, web 260×200 · mobil 180×140) | çizili | görsel künyesi yok; çerçeve tam boyutuyla duruyor, yer tutucu sepet işareti |
| **Paketler listesi sayfası** (Web + Mobil, üç boş durum, etiket çipleri, `?etiket=` süzgeci) | `Musteri - Paketler.dc.html` | `05.5` Bundle modeli |
| **Paket detay sayfası** | `Musteri - Paket Detay.dc.html` | `05.5` |
| **Anasayfa paket bandı** | çizili, bugün fixture veriyle | `05.5` |
| **Tüm Yorumlar paneli** (web modal · mobil tam ekran, yıldız süzgeci, 10'ar sayfalama, `?yorumlar=1`) | `Musteri - Urun Detay.dc.html` → `Tum Yorumlar Web/Mobil` | `17-geri-bildirim` |
| **Ürün detay yorum bölümü** — puan satırı, ortalama kartı, "N yorumun tümü →" | çizili; **boş hâli kodlandı** (bugün her ürünün yorum sayısı gerçekten sıfır) | `17` |
| **"Yorum yaz"** — yalnız o ürünü satın almış girişli müşteride | çizili | `17` + `04-auth` + `07` |
| **Fiyat sıralaması** (K18'in "Artan/Azalan fiyat" seçenekleri) | çizili, seçenekler görünüyor ama sonucu değiştirmiyor | **okuma görünümü (migration)** — aşağıda §1a |
| **Menü: Paketler · Fırsatlar · Keşif · Professionnels** | K12'de çizili, bugün düz metin | kendi sayfaları (`05.5`, `08.7`) |
| **Menü: Hesabım** | K12'de tanımlı | `04-auth` |

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
Paketler istisnası dışında). Operasyon, depo ve kurye yüzeylerinin tasarımları da mevcut; onların
kod tarafındaki açıkları kendi `docs/build` dosyalarında izlenir, burada tekrarlanmaz.
