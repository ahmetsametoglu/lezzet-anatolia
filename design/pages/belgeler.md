# Basılabilir Belgeler — teslimat özeti · hazırlık kâğıdı · tedarik siparişi

> Ekran değil **kâğıt** tasarımı. Üç belge, üç ayrı okuyucu, üç ayrı gizlilik sınırı. Ortak bir
> iskeletleri var (kim düzenledi · ne zaman · hangi kayıt) ama **ne gösterebilecekleri farklı** —
> aynı siparişten doğan iki kâğıttan biri parti numarası taşır, öteki asla taşıyamaz.

## 1. Amaç ve kullanıcı

Sistemin ürettiği **tek belge ailesi** budur. Üçü de PDF olarak üretilir; ikisi yazıcıdan çıkar,
biri telefondan paylaşılır.

| Belge | Kim okur | Nereye gider |
| --- | --- | --- |
| **Teslimat özeti** | Müşteri (B2C ve B2B) | Kutunun içine konur + e-postayla gider; kurye isterse kapıda çıktı verir |
| **Hazırlık kâğıdı** | Depocu | Depoda kalır — **kutuya asla konmaz** |
| **Tedarik siparişi** | Tedarikçi | Telefondan WhatsApp'la paylaşılır; bazen yazdırılır |

**Fatura YOKTUR ve olmayacaktır** (işletme kararı). Sistem resmî fatura kesmez; faturayı dışarıdaki
muhasebe kesiyor ve sistem yalnız numarasını kendi sipariş referansıyla eşleştiriyor. Bu yüzden
teslimat özeti "faturanın basit hâli" değildir — **tek belgedir** ve tasarımı da bir fatura taklidi
olmamalıdır (aşağıda §6).

**Rapor diye ayrı bir belge yok.** Kârlılık, analitik ve muhasebe dökümü ya ekranda yaşar ya da
muhasebecinin programına giren ham veri dosyasıdır (tablo); ikisi de tasarlanacak bir sayfa değil.
Bu doküman kapsamındaki her şey yukarıdaki üç satırdır.

## 2. İçerik envanteri — ne var, neden

### Ortak iskelet (üçünde de)

- **Kim düzenledi** — işletmenin künyesi: ad, adres, iletişim. Kutunun içinden çıkan bir kâğıt kimin
  gönderdiğini söylemek zorunda; müşteri kutuyu iki gün sonra açabilir. *(Bu veri bugün sistemde
  hiçbir yerde yok — §8.)*
- **Ne zaman** — belgenin basıldığı tarih. Sipariş tarihiyle aynı olmayabilir ve bu bilinçli:
  belge hazırlıktan sonra doğuyor.
- **Hangi kayıt** — sipariş referansı (müşterinin ve bizim ortak dilimiz; destek konuşması bununla
  başlar). Tedarik belgesinde tedarik siparişi numarası.

### A. Teslimat özeti — müşteriye giden tek belge

**Ne zaman doğar:** kutu **hazırlandıktan sonra.** Bu bir zamanlama tercihi değil, belgenin varlık
sebebi: eksik konan bir şey varsa müşteri onu kâğıtta görmeli. Sipariş anında basılan bir kâğıt
"ne sipariş ettiğinizi" söyler; bizim istediğimiz "kutuda ne var"ı söylemesi.

- **Kalemler** — ürün adı + boy/gramaj + **sipariş edilen adet** + **kutuya konan adet**. İki sayı
  da yazılır: yalnız konan yazılsaydı eksiklik görünmezdi, yalnız sipariş edilen yazılsaydı kâğıt
  kutuyla çelişirdi.
- **Eksik kalemler ayrıca ve açıkça** — hangi kalem, ne kadar eksik ve **neden**. Kâğıdın en çok
  işe yarayan yeri burası: müşteri kutuyu açtığında zaten fark edecek; kâğıt ya cevabı önceden
  verir ya da müşteri telefona sarılır. *(Sebep bugün kaydedilmiyor — §8.)*
- **Hiç konulamayan kalem de yazılır** — listeden düşürülmez. Sessizce kaybolan bir satır, en
  kötü hâl: müşteri yanlış ürün geldiğini sanır.
- **Tutarlar** — kalem tutarları ve sipariş toplamı. B2B alıcı bu kâğıdı kendi kaydına koyuyor ve
  tutarsız bir kâğıt işini görmez. **Ama:** eksik teslimde tahsil edilecek tutar düzeltiliyor;
  kâğıt, sonradan yanlış çıkacak bir toplam basmamalı. Eksik varsa toplamın düzeltileceği belgede
  söylenmeli — hangi biçimde söyleneceği tasarımın kararı.
- **Teslimat künyesi** — alıcı adı, teslim adresi, teslim tarihi/günü. Kutuyu açan kişi ile sipariş
  veren aynı olmayabilir (hediye, iş adresi).
- **Ödeme durumu** — ödendi mi, kapıda mı tahsil edilecek. Kapıda ödemede kurye ile müşteri aynı
  kâğıda bakıyor; tutarın orada olması tartışmayı bitirir.
- **"Resmî fatura değildir" ibaresi** — zorunlu ve göze görünür. Belgenin ne OLDUĞU kadar ne
  OLMADIĞI da söylenmeli; aksi hâlde B2B alıcı bunu muhasebesine fatura diye koyar.
- **Siparişin canlı sayfasına bağlantı (QR/kısa adres)** — kâğıt bir **anlık görüntüdür**, ekran
  canlıdır. İade, düzeltme ya da bir sonraki adım kâğıtta değil ekranda yaşıyor; bağlantı ikisini
  birbirine bağlar. Girişsiz açılabilmeli mi, yoksa hesaba mı bağlı — §8.
- **Dil** — **siparişin dili.** Müşteri hangi dilde sipariş verdiyse kâğıt o dilde. Kutuyu açan
  kişi arayüzü hiç görmedi; kâğıt onun tek teması olabilir.

### B. Hazırlık kâğıdı — depoda kalan iç belge

Depocunun sipariş hazırlarken elinde tuttuğu referans. Ekran zaten var; kâğıt, eli dolu ve soğuk
bir ortamda çalışan biri için ekrana dokunmadan bakılabilen şey.

- **Kalemler ve adetler** — ekranın sırasıyla aynı sırada (kâğıt ile ekran farklı sırada olursa
  depocu ikisini karşılaştırmak zorunda kalır).
- **Sistemin önerdiği parti** — hangi partiden alınacağı ve **son kullanma tarihi.** Tazelik
  kuralı burada uygulanıyor: en yakın tarihli önce çıkar.
- **Konum/raf bilgisi** — varsa; toplama sırasını o belirler.
- **İşaretlenecek boşluk** — depocu kâğıt üzerinde eksikleri işaretleyip sonra ekrana geçebilmeli.
- **Sipariş referansı ve kutu sayısı** — kâğıt hangi kutuya ait olduğunu söylemeli.
- **Fiyat YOKTUR** — depo tarafı para görmez (kural).

### C. Tedarik siparişi — tedarikçiye giden liste

- **Kalemler TEDARİKÇİNİN kendi ürün koduyla** — bizim iç adımızla değil. Tedarikçi kendi
  sistemine bakıyor; bizim "Kayseri Mantısı 500 g" adımız onun için bir şey ifade etmiyor.
- **Adet, tedarikçinin birimiyle** — koli/kasa karşılığı; biz adet düşünüyoruz, o koli gönderiyor.
- **Kim sipariş etti, nereye gelecek** — işletme künyesi + teslim adresi.
- **Sipariş numarası ve tarihi** — tedarikçiyle konuşmanın ortak referansı.
- **Not alanı** — "salı sabahı teslim" gibi serbest bir satır; bu yazışma bugün telefonla oluyor.

## 3. Aksiyonlar

- **Teslimat özeti:** teslim anında müşteriye e-postayla kendiliğinden gider (açılıp kapanabilir bir
  ayar); kurye ekranından çıktı alınabilir; depocu kutuya koymak için basar; müşteri sipariş
  sayfasından kendisi indirebilir.
- **Hazırlık kâğıdı:** depocu hazırlık ekranından basar. Tek aksiyon.
- **Tedarik siparişi:** taslak onaylanınca basılır ya da doğrudan paylaşılır — **en olası yol
  telefondan WhatsApp**, yani belge küçük ekranda okunabilir olmalı.

## 4. Durumlar ve varyasyonlar

- **Tam teslim** — en sık hâl ve kâğıt bunda sade olmalı; eksik bölümü hiç görünmemeli.
- **Kısmi teslim** — bir ya da birkaç kalem eksik. Kâğıdın asıl sınavı bu.
- **Kalemin tamamı eksik** — "0 kondu" satırı görünmeli; listeden düşmemeli.
- **B2C ↔ B2B** — B2B alıcı belgeyi kendi kaydına koyar; şirket unvanı ve varsa vergi numarası
  görünmeli. B2C'de bu alanlar boştur ve kâğıt onlarsız da tam görünmeli.
- **Kapı teslimi ↔ kargo** — kapıda kurye kâğıdı elden verebilir; kargoda kâğıt kutunun içindedir
  ve tek iletişim odur (kimse yanında değil).
- **Kapıda ödeme** — tahsil edilecek tutar belgede net olmalı.
- **Siyah-beyaz yazıcı** — depo ve kurye çıktıları renkli olmayabilir; **renk tek başına anlam
  taşımamalı** (eksik satırı yalnız kırmızıyla ayırmak, gri basılınca ayrımı yok eder).

## 5. Akış bağlantıları

- **Teslimat özeti** hazırlık tamamlandıktan sonra doğar → teslim anında e-postaya eklenir →
  müşterinin sipariş detay sayfasından her zaman yeniden indirilebilir.
- **Hazırlık kâğıdı** hazırlık ekranından doğar → işi biter, saklanmaz.
- **Tedarik siparişi** tedarik taslağından doğar → tedarikçiye gider → gelen mal "mal kabul"
  ekranında aynı numarayla karşılanır.

## 6. Yapmaması gerekenler

- **Fatura taklidi olmamalı.** "Facture", "Rechnung", "Fatura No", vergi dökümü gibi bir fatura
  dilini kullanmaz; bir alıcının onu muhasebesine fatura diye koyması, düzeltmesi zor bir sorundur.
- **Müşteri belgesinde depo, parti, raf, tedarikçi ve maliyet YOKTUR.** Sistemin coğrafyası ve
  tedarik zinciri müşterinin sorunu değil. Hazırlık kâğıdı ile teslimat özetini tek belgede
  birleştirmek tam olarak bu sızıntıyı yapar — **ikisi ayrı belgedir.**
- **Depo kâğıdında fiyat ve müşteri parası yoktur.**
- **İç durum adları görünmez** — sistemin durum kodları, alan adları, iç kısaltmalar kâğıtta yer
  almaz; her şey insan diliyle yazılır.
- **Sessiz eksik yoktur** — konulmayan kalem listeden düşürülmez.
- **Sonradan yanlış çıkacak bir toplam basılmaz** (§2.A).

## 7. Kâğıt / ekran notları (yalnız işlevsel)

- **Teslimat özeti** hem A4 basılır hem ekranda okunur. Kutuya konan kâğıt katlanır; ilk bakışta
  görülmesi gereken şey "hangi sipariş" ve "eksik var mı".
- **Hazırlık kâğıdı** çalışırken elde tutulur: satırlar parmakla takip edilecek kadar seyrek,
  işaretlenecek yer gerçekten yazılabilir olmalı.
- **Tedarik siparişi** çoğunlukla **telefon ekranında** okunacak (WhatsApp'tan açılıyor) — A4'e
  göre tasarlanıp telefonda okunmaz hâle gelmemeli.
- Üç belge de **tek sayfaya sığmayabilir**; sayfa numarası ve her sayfada referansın tekrarı gerekir
  (kâğıtlar birbirine karışır).

## 8. Açık girdiler — tasarımdan ÖNCE cevaplanması gerekenler

Bunlar tasarım kararı değil, **eksik veri ve eksik karar.** Tasarım bunlar olmadan da çizilebilir
ama alanların yerini şimdiden ayırmak gerekir.

1. **İşletme künyesi hiçbir yerde yok.** Ad, adres, iletişim, (B2B için) vergi numarası — sistemde
   böyle bir kayıt bulunmuyor. Üç belgenin de başlığı buna bağlı. Ayarların altında bir "işletme
   künyesi" bölümü gerekiyor.
2. **Eksik SEBEBİ kaydedilmiyor.** Bugün yalnız "kaç adet kondu" tutuluyor; "neden konmadı"
   tutulmuyor. Müşteriye sebebi söylemek isteniyorsa depocunun kısa bir listeden seçmesi gerekir
   (ör. stokta kalmadı · tazelik nedeniyle çıkarıldı · hasarlı). Seçim yoksa kâğıt yalnız olguyu
   yazabilir, sebebini değil.
3. **Canlı sayfa bağlantısı girişli mi?** Kâğıttaki QR'ı kutuyu açan herkes okuyabilir. Sipariş
   sayfası hesaba bağlıysa bağlantı işe yaramaz; bağlı değilse referansı bilen herkes siparişi
   görür. İkisinin arası (kısa ömürlü bağlantı) bir karar ister.
4. **Logo/marka varlığı** — belgelerde kullanılacak logo dosyası ve kullanım kuralları.
