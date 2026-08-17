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

Ön koşul: uygulama verisi silinir (`adb shell pm clear`), böylece onboarding kapısı açılır ve
"ilk açılış" gerçekten ilk açılış olur.

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
| B2 | **Giriş puanı (YENİ)** | `points_entry` tablosunda `visit` satırı doğuyor mu — **MB-50'nin ölçümü** | Sessiz olması doğru mu, yoksa müşteri kazandığını hiç fark etmiyor mu |
| B3 | Künye tamamlama | Ad · adres · telefon | Neden sorulduğu belli mi |
| B4 | Adres ekleme (BAN araması) | **MB-03**: sokak alanına yazınca uygulama yeniden yükleniyor mu (ölçüldü 11.08, sebep henüz kanıtlanmadı) | — |
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
| `/(tabs)` vitrin | | | |
| `/(tabs)/catalog` | 17.08 | geçti | adlar Fransızca ve doğru — **MB-31 üretilmedi**; tükenen kartta "ÉPUISÉ" rozeti soluk, fiyat çipi tam renkli: göz önce fiyata gidiyor, oysa haber "yok" |
| `/product/[slug]` | | | |
| `/(tabs)/packages` · `/package/[slug]` | | | |
| `/recipes` | 17.08 | geçti | liste ve künyeler doğru; **görseller amatör** (plastik ambalaj, dağınık masa, mutfak fayansı) — ürün fotoğrafları stüdyo kalitesindeyken tarif kartları kullanıcı fotoğrafı gibi duruyor, aynı ekranda yan yana gelince fark göze batıyor. İçerik işi, kod değil |
| `/discover` | | | |
| `/cart` | | | |
| `/login` · `/auth/callback` | | | |
| `/profile-setup` | | | |
| `/(tabs)/account` | | | |
| `/checkout` · `/checkout/confirmed` | | | |
| `/orders` · `/order/[reference]` | 17.08 | **ŞÜPHE — ölçüm yarım** | Oturum AÇIKKEN derin bağlantıyla açıldığında ekran MİSAFİR hâlinde kaldı. Aynı desen gün boyu üç ekranda görüldü (talep listesi · talepler · siparişler) ve her seferinde hesap sekmesi girişli görünüyordu. **Teori:** ekran, oturum SecureStore'dan geri yüklenmeden monte olunca misafir kararını bir kez veriyor ve bir daha sormuyor. Kanıtlanmadı — iki ekranı aynı anda karşılaştırma denemesi yanlış yere dokundu. Kanıt yolu: aynı saniyede hesap sekmesi + siparişler dökümü |
| `/feedback/[token]` | | | |
| `/support` (üç rota) | | | |
| `/professionals` | | | |
| `/delivery-zones` | | | |
| `/legal/[page]` | | | |
| `/notifications` | | | |
| `/invite/[code]` · `/neighbor/[token]` | 12.08 | geçti | görev `(21.46)` |
