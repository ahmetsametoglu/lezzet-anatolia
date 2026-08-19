# Cihaz turu — misafir ve müşteri yüzeyi (senaryo + kapsam defteri)

> **Neden bu dosya var.** Cihaz testlerimiz bugüne kadar NOKTASAL yapıldı: her turun başlangıcı bir
> arıza şüphesiydi (klavye, çekmece, davet zinciri). "Şu ekranı baştan sona bir gez" diye yapılmış
> tek bir tur yok ve hangi ekranın cihazda hiç açılmadığını söyleyen bir kayıt tutulmuyordu.
> Bu dosya o kaydın kendisidir: **senaryo + hangi rota ne zaman, hangi sonuçla açıldı.**
>
> **Kapsam: yalnız MİSAFİR ve MÜŞTERİ yüzeyi** (kullanıcı kararı 12.08 — *"operasyon kısmına
> yetiştirme"*). Kurye/depo/yönetim rotaları bu turun dışında.
>
> **Veritabanı serbest** (kullanıcı kararı 12.08 — *"veritabanı test veritabanı, istediğin gibi
> kullanabilir"*): tur gerçek sipariş açabilir, puan yazabilir, başvuru gönderebilir.
>
> Cihaz: **OPPO CPH1907 · Android 11 · 1080×2400**, `adb -s 5cf6c351`. Kural: fiziksel cihaz tek
> elde (`BACKLOG-musteri §13`).

## 0. Turun iki sorusu

Her ekranda AYNI iki soru sorulur ve ikisinin cevabı ayrı yazılır:

1. **ÇALIŞIYOR MU** — beklenen şey oluyor mu, veri doğru mu, ret hâlleri adlı mı.
2. **ANLAŞILIYOR MU** — kullanıcı isteği 12.08: *"müşterinin vakit geçireceği sayfaların ne kadar
   anlamlı olduğunu, ne kadar anlaşılır olduğunu da incele."* Ölçüt üç madde:
   - **Bu ekran ne için var, tek cümlede söylenebiliyor mu?** Söylenemiyorsa ekranın kendisi
     karışıktır, metni değil.
   - **Bir sonraki adım belli mi?** Müşteri "şimdi ne yapacağım" diye duraksıyorsa çağrı zayıftır.
   - **Söylenen her şey DOĞRU mu?** Vaat edilen sayı motorun yazdığı sayı mı, vaat edilen davranış
     gerçekleşiyor mu. (Bu maddenin ağırlığı ölçülmüş bir dersten geliyor: 11.08–12.08 turlarında
     bulunan arızaların çoğu koddan değil METİNDEN çıktı.)

**Bulgu formatı:** `MB-xx` açılır, gerekçesi ve ölçümü `BACKLOG-musteri.md`ye yazılır. Ekranda
görülen ama üretilemeyen şey bulgu DEĞİL, not olarak durur (CLAUDE §0: sebebi kanıtlanmadan
müdahale yok).

## A · Misafir turu — hesabı olmayan kişi

Ön koşul: uygulama verisi silinir, böylece onboarding kapısı açılır ve "ilk açılış" gerçekten
ilk açılış olur.

> **DURUM 18.08 (akşam) — A TURU KAPANDI: A1…A17'nin tamamı koşuldu.** Son iki adım `(21.83)`te:
> **A17 ✓ ama bir açıkla** — beş yasal sayfa ve SSS açılıyor, arama ve akordeon çalışıyor; ancak
> **misafirin bu sayfalara hiçbir kapısı yok** (tek kapı hesap ekranı, o da giriş duvarının
> arkasında). Deep-link ile ölçüldü. **A14 ✓** — giriş duvarının yeri sepette DEĞİL, ödeme
> ekranında: misafir sepeti 53,40 €'ya doldurup "Siparişi tamamla"ya basabiliyor, sipariş özetini
> (4× kalem, ara toplam, genel toplam) GÖRÜYOR; duvar en üstteki kesikli kutu ve "Siparişi onayla"
> pasif, altında gerekçesi yazılı. Yani duvar müşteriyi geri çevirmiyor, ne alacağını gösterip
> sonra doğrulanmasını istiyor.
>
> **DURUM 18.08 — A1…A8 koşuldu, A14 kısmen; kalanlar açık.** Üç şey ölçümden çıktı:
>
> · **`adb shell pm clear` BU CİHAZDA ÇALIŞMIYOR** (Oppo CPH1907): kabuk kullanıcısında
>   `CLEAR_APP_USER_DATA` izni yok, komut `SecurityException` ile düşüyor. Yol şudur:
>   `adb shell am start -a android.settings.APPLICATION_DETAILS_SETTINGS -d package:com.lezzetanatolia.app`
>   → *Saklama alanı kullanımı* → *Verileri temizle* → *Tamam*.
> · **VERİ SİLME GELİŞTİRME DERLEMESİNİ DE SIFIRLIYOR.** Dev client'ın hatırladığı Metro adresi de
>   siliniyor ve uygulama açılışta "Development Servers" ekranına düşüyor. Turdan önce
>   `adb reverse tcp:8081 tcp:8081` kurulur, sonra adres alanına `http://localhost:8081` yazılır.
>   Bu adım tur belgesinde yoktu; ilk kez burada yaşandı.
> · **ADIM SIRASI VE SAYISI BELGEYLE UYUŞMUYOR.** Uygulamada onboarding **dokuz** noktalı ve sıra
>   dil → yazı boyutu → **teslimat** → **posta kodu** → ödeme → puan → (puan detayı) …; belgedeki
>   A3/A4 ise posta kodunu teslimattan ÖNCE yazıyor. Aşağıdaki tablo bu yüzden **kod tarafından
>   doğrulanmadan okunmamalı** (CLAUDE: kod ile doküman çelişirse KOD haklı).

| # | adım | çalışıyor mu — ölçüt | anlaşılıyor mu — ölçüt |
| --- | --- | --- | --- |
| A1 | Onboarding · dil | Seçim ekranın dilini AYNI karede çevirir; 250 ms sonra ilerler | Üç dil de kendi adıyla mı yazılı |
| A2 | Onboarding · yazı boyutu | Örnek kart seçimle canlı ölçeklenir | "Büyük" seçildiğinde sonraki adımlar taşmıyor mu |
| A3 | Onboarding · posta kodu | 5 hanede uç sorulur; rota içi/dışı AYRI cümle | Rota dışı cevabı bir RET gibi mi okunuyor, yoksa alternatif gibi mi |
| A4 | Onboarding · teslimat | İki yol da çizili | "Kargo soğuk zincir taşımaz" kuralı anlaşılıyor mu |
| A5 | Onboarding · ödeme | Üç yol çizili | Havale satırı B2C müşteriyi şaşırtıyor mu |
| A6 | **Onboarding · puan (YENİ)** | Oran ve satır puanları SUNUCUDAN (`/points/rules`); liste kapalı açılır | "500 puan = 5 €" ilk bakışta anlaşılıyor mu; altı satır fazla mı |
| A7 | Onboarding · "Sonra bakarım" | Vitrine düşer, onboarding bir daha açılmaz | Vazgeçme gibi mi duruyor |
| A8 | Vitrin (misafir) | Bölge bandı, şeritler, keşif kartı | Misafire "önce hesap aç" duvarı çıkıyor mu (çıkmamalı) |
| A9 | Katalog + süzgeç | Kategori çipleri, sonsuz kaydırma | Ürün adları Türkçe mi (MB-31 şüphesi) |
| A10 | Ürün detayı | Galeri, varyant sırası, stok/yer işareti | Kart fiyatı ile detay açılış fiyatı aynı mı (MB-20 şüphesi) |
| A11 | Paketler + paket detayı | Yer notu, içindekiler | Paketin ne olduğu anlaşılıyor mu |
| A12 | Tarifler | Liste + detay | — |
| A13 | Keşif turu (misafir) | Oy verilebiliyor mu, puan vaadi ne diyor | Girişsize puan vaat ediliyor mu (edilmemeli) |
| A14 | Sepete ekleme (misafir) | Sepet cihazda yaşıyor | Giriş duvarı NEREDE çıkıyor, beklenen yerde mi |
| A15 | Bölge dışı akışı | Bant → "nerelere gidiyoruz" sayfası | Müşteri ne yapacağını biliyor mu |
| A16 | Profesyonel başvurusu (misafir) | **MB-09** — e-posta → OTP → başvurunun kendiliğinden gitmesi | "İnceleniyor" ekranı ne söz veriyor |
| A17 | Yasal sayfalar + destek | Açılıyor mu | — |

## B · Müşteri turu — girişli, gerçek sipariş

Ön koşul: A turundan devam; hesap açılır (OTP ile).

| # | adım | çalışıyor mu — ölçüt | anlaşılıyor mu — ölçüt |
| --- | --- | --- | --- |
| B1 | Giriş (OTP) | Kod gelir, oturum açılır | Kodun nereye gittiği belli mi |
| B2 | **Giriş puanı (YENİ)** | ~~`points_entry` tablosunda `visit` satırı doğuyor mu~~ → **ÖLÇÜLDÜ 17.08, yazılıyor:** `visit · 10 puan · 12:20:18`, ekrandaki bakiye (10) ve puan geçmişindeki satır (`Visite du jour · +10`) defterle birebir. MB-50 kapanışı doğrulandı | **Sessiz.** Hiçbir bildirim yok; müşteri kazandığını yalnız hesap kartındaki sayıdan ya da çekmecedeki *"crédités sans rien avoir à faire"* satırından anlayabiliyor. Karar kullanıcının |
| B3 | Künye tamamlama | Ad · adres · telefon | Neden sorulduğu belli mi |
| B4 | Adres ekleme (BAN araması) | ~~**MB-03**: sokak alanına yazınca uygulama yeniden yükleniyor mu~~ → **SEBEP KANITLANDI 17.08 ve uygulamada değil:** RN'in çift-`R` reload kısayolu, `adb input text`in donanım tuş akışıyla tetikleniyor (ölçüm MB-03 künyesinde). Akışın kendisi geçti: BAN önerileri geldi, seçim posta kodu/şehri doldurdu, adres DB'ye yazıldı | Öneri listesi 4+ sonuçta son satırı kırpıyor ve kaynak künyesi üstüne biniyor (**MB-70**) |
| B5 | Hesap · puan kartı | Bakiye, eşik, kupon listesi | Bakiye 0'ken ne diyor |
| B6 | **Hesap · "Nasıl puan kazanırım?" (YENİ)** | Çekmece açılır, altı yol ve para karşılıkları | Kullanıcı isteği 12.08'in karşılığı: merak eden cevabını bu ekranda buluyor mu |
| B7 | Sepet | Toplam, asgari sepet, indirim kaynağı | Asgari sepet uyarısı ekrandaki toplamla tutuyor mu |
| B8 | Kasa · gün seçimi | Rota günleri, kargo yolu | Hangi günün ne demek olduğu belli mi |
| B9 | **Sipariş verme (GERÇEK)** | `order` satırı, rezervasyon, sepetin boşalması | Onay ekranı ne söylüyor |
| B10 | **Sipariş onayı · komşu daveti şeridi** | Paylaşım penceresi açılıyor mu, davet doğuyor mu — **bugüne dek cihazda HİÇ ölçülmedi** | "Salı günü sokağınıza geliyoruz" cümlesi doğru günü mü söylüyor |
| B11 | Siparişlerim + detay | Zaman çizgisi, durum | Müşteri siparişinin nerede olduğunu anlıyor mu |
| B12 | Ürün değerlendirme | Yorum → 20 puan, beğeni → 5 puan; defterde satır | Ekranın söylediği puan defterdekiyle aynı mı |
| B13 | Keşif turu (girişli) | Kart başına 2 puan, defterde satır | Tur bitince ne diyor |
| B14 | Talep açma (destek) | Sipariş satırı seçici, çekmece | — |
| B15 | Tercihler + dil | Kayıt `PATCH /me/preferences` | — |
| B16 | Puan → kupon çevirme | Eşiğe ulaşınca düğme açılır, kupon doğar | Kuponun nerede kullanılacağı belli mi |

## Kapsam defteri

> Her satır turun kendisinde doldurulur: **tarih · sonuç · açılan bulgu**. Boş satır "cihazda hiç
> açılmadı" demektir — ve bu bilginin kendisi de bir ölçümdür.

| rota | ilk cihaz turu | sonuç | bulgular |
| --- | --- | --- | --- |
| `/onboarding` | | | |
| `/(tabs)` vitrin | 17.08 | geçti | bölge bandı `67000 STRASBOURG`, indirim şeridi ve koleksiyon blokları doğru; ürün sayıları (`32 produits`) yazılı |
| `/(tabs)/catalog` | 17.08 | geçti | adlar Fransızca ve doğru — **MB-31 üretilmedi**; tükenen kartta "ÉPUISÉ" rozeti soluk, fiyat çipi tam renkli: göz önce fiyata gidiyor, oysa haber "yok" |
| `/product/[slug]` | 17.08 | geçti | **MB-20 kapanışı cihazda doğrulandı:** kart `1,84 €` → detay `1,84 €` → sepet düğmesi `1,84 €`, üçü aynı. Kilo fiyatı, KDV notu, eski fiyat, stok tavanı (`À ce prix, 14 maximum`) ve varyant şeridi (`Vous consultez` işaretli) yerinde |
| `/(tabs)/packages` · `/package/[slug]` | | | |
| `/recipes` | 17.08 | geçti | liste ve künyeler doğru; **görseller amatör** (plastik ambalaj, dağınık masa, mutfak fayansı) — ürün fotoğrafları stüdyo kalitesindeyken tarif kartları kullanıcı fotoğrafı gibi duruyor, aynı ekranda yan yana gelince fark göze batıyor. İçerik işi, kod değil |
| `/discover` | | | |
| `/cart` | 17.08 | geçti | teslimat adresi kartı üstte (*"panier évalué selon votre adresse"* — depo değişmezi görünür), satır aritmetiği doğru (`2 × 1,84 € = 3,68 €`), **asgari sepet uyarısı toplamla tutuyor** (`40,00 − 3,68 = 36,32 €`), düğme pasif. Tek kusur: aynı uyarı hem kartta hem alt çubukta — **MB-69** |
| `/login` · `/auth/callback` | | | |
| `/profile-setup` | | | |
| `/(tabs)/account` | 17.08 | geçti | puan kartı (10 puan · eşik 500 · `Encore 490`), davet kodu, menü, adres defteri, dil/yazı boyutu çipleri ve pazarlama anahtarları doğru. İki bulgu: kimlik kartında **e-posta iki kez** (**MB-66**), puan geçmişi ekranı toplamsız ve çağrısız (**MB-67**) |
| `/checkout` · `/checkout/confirmed` | | | |
| `/orders` · `/order/[reference]` | 17.08 | **geçti — 17.08 sabahki ŞÜPHE ÇÜRÜTÜLDÜ** | Ekran girişli açıldı, misafir duvarı YOK; boş hâl doğru (*"Aucune commande pour l'instant"* + katalog çağrısı). Sabahki "oturum misafire düşüyor" gözlemi ekranın kusuru değildi: o saatlerde başka bir şerit tam test paketini koşuyordu ve her `generateLink` cihazın tek kullanımlık jetonunu geçersiz kılıyordu (aynı kök: görev `(21.71)`). Yığın sakinken desen üretilemedi |
| `/points-history` | 17.08 | geçti | **`(21.73)` cihazda doğrulandı, üç dilde:** bakiye satırı (`Votre solde · Bakiyeniz · Ihr Guthaben`), "yolda" bloğu (`Claire a commandé — 100 points…`) ve **kazanç ile iptalin AYRI satır** olması (`Komşu daveti +100` · `Komşu daveti — iptal edildi −100`; eskiden tek satırda `+0` görünecekti). Bakiye bekleyen ödülü içermiyor — doğru. Bulgu: eyebrow üç dilde de Türkçe yerelle büyütülüyor → `MEİN KONTO` (**MB-71**) |
| `/feedback/[token]` | | | |
| `/support` (üç rota) | 17.08 | talep listesi geçti | Girişli açıldı (burada da misafir duvarı yok), boş hâl doğru. Bulgu: boş hâlde **aynı işi yapan iki çağrı iki ayrı isimle** — üstte `+ Nouvelle`, ortada `Écrivez-nous` (**MB-68**) |
| `/professionals` | | | |
| `/delivery-zones` | | | |
| `/legal/[page]` | | | |
| `/notifications` | | | |
| `/invite/[code]` · `/neighbor/[token]` | 12.08 | geçti | görev `(21.46)` |
