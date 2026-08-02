# Operasyon — Depo Ekseni (bağlam + süzgeç deseni)

> **Sayfalar-üstü sözleşme (01.08).** Çok depo kararıyla (`DOMAIN §17`, `build/19`) operasyon
> yüzeyine giren depo boyutunun davranış kuralları. Sayfa dokümanları kendi içeriklerinin sahibi
> olmaya devam eder; bu doküman yalnız depo ekseninin **her sayfada aynı** işlemesini bağlar.
> Görsel karar Claude Design'ındır — burada stil yok, davranış ve içerik var.
> **Müşteri evrenindeki eşi: `musteri-yer-ekseni.md`** — müşteri depo görmez, onun ekseni
> teslimat yeridir; iki doküman birlikte çok depo tasarım paketinin sözleşmesidir.

## 1. Amaç ve kapsam

Operasyonda artık birden çok depo var ve iki farklı ihtiyaç aynı anda yaşıyor:

1. **"Hangi evrende çalışıyorum?"** — operatör gününü çoğu zaman tek deponun gerçeğiyle geçirir;
   her sayfada yeniden seçmek istemez.
2. **"Bu listede şu an neye bakıyorum?"** — tüm depolara bakarken bir tabloda geçici olarak tek
   depoya daralmak ister; bu bakış, çalıştığı evreni değiştirmemelidir.

Bu ikisi tek kontrole sıkıştırılırsa birbirini ezer. Çözüm iki katmandır ve katmanlar arasındaki
ilişki aşağıda **tanımlıdır** — tanımsız kesişim yoktur.

## 2. Model: iki katman

| | **Depo bağlamı** (context) | **Tablo süzgeci** (filter) |
| --- | --- | --- |
| Sorusu | Hangi evrende çalışıyorum | Bu listede şu an neye bakıyorum |
| Kapsamı | Operasyon geneli — sayfadan sayfaya taşınır | Yalnız o sayfanın o tablosu |
| Ömrü | Kalıcı: oturumlar arası hatırlanır (kullanıcı tercihi) | Geçici: URL'de yaşar (paylaşılabilir link), sayfayla gider |
| Değerleri | "Tüm depolar" *(yalnız yetkisi olana)* ya da tek depo | Bağlam evrenindeki depolardan biri ya da hiçbiri |
| Kime görünür | Depo-üstü roller + kapsamı birden çok depo olan personel | Yalnız bağlam = "Tüm depolar" iken |
| Ailesi | Kimlik/ortam düzeyi (rol gibi) | Diğer tablo süzgeçleriyle aynı aile (kategori, durum, dönem…) |

## 3. Mantık kuralları (bağlayıcı)

1. **Süzgeç bağlamı ASLA yazmaz.** Tabloda depo seçmek üst bağlamı değiştirmez; sayfadan çıkıp
   dönünce bağlam neyse odur. ("Bir tabloda STR'yi süzdüm diye bütün operasyonum STR'ye dönmez.")
2. **Bağlam süzgeci kapsar.** Bağlam tek depoya inince tablo depo süzgeci **kaybolur ve temizlenir**
   — tek elemanlı evrende süzgecin işi yoktur. Bağlam "Tüm depolar"a dönünce süzgeç temiz başlar;
   eski seçim hatırlanmaz (hatırlanan süzgeç, "neden eksik görüyorum" sürprizinin kaynağıdır).
3. **Tanımsız kesişim yoktur.** "Bağlam=KEHL iken süzgeç=STR" hâli yapısal olarak imkânsızdır —
   kural 2 bunu üretilemez kılar. İki kontrol aynı eksende ama farklı katmandadır: bağlam evreni
   daraltır, süzgeç o evrenin **içinde** daraltır.
4. **Depo sütunu/işareti yalnız çok depolu bakışta görünür.** Bağlam = "Tüm depolar" iken satırlar
   deposunu söyler; bağlam tek depoyken aynı bilgi gürültüdür, kaybolur.
5. **Sayaçlar bağlamı izler, süzgeç yalnız satırları daraltır.** Sekme sayıları ve özet kartlar
   bağlam evreninin gerçeğidir (iş yükü göstergesi, gezinme çapası). Tablo süzgeci aktifken tablo
   bunu **görünür biçimde söyler** ("süzülüyor: STR" gibi bir ibare — biçimi Claude Design'ın);
   sayaçla satır sayısının neden ayrıştığı hiçbir an belirsiz kalmaz.
6. **Bağlam URL'e yazılmaz, süzgeç yazılır.** Paylaşılan link alıcının bağlamını ezmemelidir;
   daraltılmış bakışın kendisi (süzgeç) zaten URL ile taşınır.
7. **Bağlam üstündür.** URL'den gelen depo süzgeci, açan kişinin bağlam evreninin dışını
   gösteremez — uymayan süzgeç düşer ve kullanıcıya kısaca bildirilir (sessiz düşme yok).
8. **Seçenek listeleri kapsamdan türer.** Kapsam dışı depo hiçbir seçicide ve süzgeçte seçenek
   olarak var olmaz (görüp de seçememek değil; hiç görmemek). Boş kapsamlı depo-bağlı personel
   kapalı kapı hâlini görür (aşağıda §4).
9. **Varsayılan depo yoktur** (`DOMAIN §17`). Bağlamın ilk değeri belirsizlikten değil kimlikten
   gelir: depo-üstü rolde "Tüm depolar", kapsamlı personelde kapsamı.

## 4. Rol davranışı

- **Admin / muhasebe (depo-üstü):** tam bağlam seçici — "Tüm depolar" + her aktif depo.
- **Tek kapsamlı depocu/kurye:** seçici **hiç görünmez**; evreni deposudur. Deposunun adı ekranda
  kimlik bilgisi olarak yer alabilir (bilgidir, kontrol değildir).
- **Çok kapsamlı personel:** seçici kapsamıyla sınırlıdır; "tümü" onun için "kapsamımdaki depolar"
  demektir.
- **Boş kapsamlı depo-bağlı personel:** hiçbir depo verisi görmez — kapalı kapı hâli: durumun
  sebebi ("size henüz depo atanmadı") ve kime başvuracağı söylenir; boş tablo gibi görünmez.

## 5. Sayfa sayfa uygulama

**Depo ekseni ALAN sayfalar:**

- **Stok (`admin-stok`):** bağlam + tablo süzgeci + kural 4 sütunu. Satır modeli: bağlam = "Tüm
  depolar" iken seviye listesi varyant başına **tek satır** (toplamlar + "N depoda" ipucu), satır
  açılınca depo kırılımı — varyant×depo düz listesi tarama düzenini bozar. **Eşik/karar kuyruğu
  istisna:** asgari stok eşiği depo bazlı bir gerçektir, o kuyruğun satırları (depo × varyant)
  kalır ve deposunu söyler. Parti her zaman tek depodadır; parti satırı çok depolu bakışta
  deposunu taşır.
- **Siparişler (`admin-siparisler`):** bağlam + tablo süzgeci + depo sütunu/işareti; sekme
  sayaçları kural 5'e uyar. Sipariş detayında "hangi depodan" künye bilgisidir.
- **Satın alma (`admin-satin-alma`):** PO listesi depo-üstüdür (satın alma tüm şirketin işi);
  kalemde isteğe bağlı hedef depo görünür ("20 koli STR'ye"). **Mal kabulde depo açık seçimdir**
  (kapsamdan; varsayılan yok) ve parçalı kabul ilerlemesi kalem bazında "sipariş edilen ↔ gelen"
  olarak görünür — hangi kabul hangi depoya yapıldı, listeden okunur.
- **Dashboard (`admin-dashboard`):** bağlamı izler; kartlar bağlam evreninin toplamıdır.
- **Rotalar (`admin-rotalar`):** bölge kartı bağlı depoyu söyler; bölgeye depo atama buradadır.
  Bir posta kodu tek bölgede olabilir — çakışma kayıt anında reddedilir, tasarım bu ret hâlini
  içermelidir.
- **Depo yüzeyi (`depo-hazirlik`, `depo-stok-giris`, `depo-imha-sayim`):** depocu kural gereği
  kendi evreninde yaşar (§4); sayfa içinde ayrıca depo süzgeci yoktur. Başka deponun stoğu,
  karşılaştırması veya "diğer depoda var" bilgisi **gösterilmez** (`DOMAIN §17`).
- **Yeni ekranlar — Depolar ve Transfer:** kendi sayfa dokümanları ayrıca yazılacak. Bu desenle
  ilişkileri şimdiden bağlayıcı: **Depolar** yönetim nesnesidir, bağlamdan bağımsız listelenir;
  **Transfer** listesi bağlam tek depoyken "bu deponun gönderdikleri + aldıkları" olarak süzülür.

**Depo ekseni ALMAYAN sayfalar** (eksen buralara çizilmez): fiyatlar (fiyat depo-üstü —
`DOMAIN §17`), ürünler (katalog tanımı depo-üstü; stok gösteren bir alanı varsa yalnız o alan
bağlamı izler), müşteriler, talepler, geri bildirim, WhatsApp, para/raporların depo kırılımı
(kendi modüllerinin işi). Kurye ekranları kurye-gün ekseninde kalır — araç depoya bağlı değildir.

## 6. Kenar durumlar

- **Bağlam değişimi anı:** açık sayfa yeni evrenle yeniden yüklenir; tablo depo süzgeci kural 2
  gereği temizlenir. Diğer süzgeçler (durum, kategori, dönem) korunur — onlar depo ekseni değildir.
- **Link ile gelen süzgeç, bağlamla çelişiyor:** kural 7 — süzgeç düşer, kısa bilgi verilir.
- **Tek aktif depo olan kurulum (bugünkü durum):** bağlam seçici ve depo sütunu hiç görünmez;
  ekranlar bugünkü halinden farksızdır. Desen, ikinci depo eklendiği gün kendiliğinden belirir —
  bu "boş hâl" tasarımın bilinçli bir durumudur.
- **Kapsamı sonradan daraltılan personel:** hatırlanan bağlam artık kapsam dışıysa ilk girişte
  kapsamındaki tek/ilk anlamlı değere döner ve bilgilendirilir; eski bağlam sessizce sürdürülmez.

## 7. Yapmaması gerekenler

- **İki kontrol tek görsel öğede birleştirilmez** — "tek açılır menü iki işi görsün" çözümü,
  kural 1'in ihlalini kaçınılmaz kılar; ayrık kalırlar.
- **Süzgeç seçimi bağlama otomatik terfi etmez.** ("Bunu bağlamım yap" gibi bir kısayol ancak
  açık ve ayrı bir eylem olarak önerilebilir; varsayılan davranış asla değildir.)
- **Depocuya depo seçtirilmez** (tek kapsamda) ve depocu ekranlarına karşılaştırma taşınmaz.
- **"Varsayılan depo" üretilmez** — hiçbir ekran, hiçbir form belirsizliği varsayılanla çözmez;
  depo ya kimlikten (kapsam) ya açık seçimden gelir.
- Müşteri yüzeyine bu desenin hiçbir parçası taşınmaz — müşteri depo kavramını hiç görmez.

## 8. Claude Design'dan beklenen

1. **Operasyon evreni komponent envanterine** depo ekseni parçaları: bağlam seçici (web + mobil),
   tablo depo süzgeci hâli, satırdaki depo işareti/sütunu, "süzülüyor" ibaresi, kapalı kapı hâli.
2. **Etkilenen sayfaların `.dc` güncellemeleri:** stok, siparişler, satın alma, dashboard,
   rotalar (bkz. §5 — her birinin kendi sayfa dokümanındaki içerik envanteri geçerli kalır).
3. **Yeni sayfalar (Depolar, Transfer) ayrı turda** — sayfa dokümanları yazıldığında.

Kural seti (§3) davranıştır ve bağlayıcıdır; görünümü, yerleşimi ve biçimi tamamen serbesttir.
