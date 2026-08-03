# Denetim — yorum bayatlığı: müşteri yüzeyi + lib (03.08.2026, 3/3)

> **Statü: ÖNERİ, emir değil.** Katılmadığınız maddenin **Cevap:** satırına gerekçenizi yazın;
> bulgu doğruysa düzeltme istenir. Kapsam: `app/(customer)` + `components/customer` +
> `apps/web/lib` (önceki iki turun taramadığı ortak katman). Odak, arka uç şeridinin doğrulanmış
> içgörüsü: bu sınıf **dosya başı künyelerinde** yaşar; kalıp, künyedeki gelecek zaman.
> Dört bulgunun dördü de o kalıptan çıktı — ve dördü aynı hikâye: **beklenen kaynak gelmiş,
> künye hâlâ "yok" diye öğretiyor.**

## M-Y1. `storefront-types.ts` künyesi — "05.4/05.5/05.6 henüz yok, fixture dönüyorum": ÜÇÜ DE VAR ⚠

**Gözlem:** Vitrinin "TEK veri sözleşmesi" ilan edilen dosyasının künyesi (`:29`): *"Bugün bu
fonksiyonların bir kısmı fixture döner (fiyat motoru 05.4, paket 05.5, indirim 05.6 henüz yok)"*.
Gerçek: 05.4 `[x]` · 05.6 `[x]` · 05.5 `[~]`; ve **aynı dizindeki** `fixtures.ts` künyesi bugünü
doğru anlatıyor: *"geriye TEK yedek kaldı: kategoriler. Ürün, fiyat, stok, fırsatlar ve paketler
artık GERÇEK okunuyor."* Yani sözleşme dosyası ile onun yedek dosyası iki ayrı gerçeklik öğretiyor —
ve yeni ajanın İLK okuduğu, sözleşme dosyası. Arka uç turunun öngördüğü desenin birebir kendisi:
davranışı değiştiren `fixtures.ts`'i güncellemiş, merkez künyeyi görmemiş.

**Öneri:** Künye bugüne indirgensin: "Tek yedek kategoriler (`fixtures.ts`); gerisi gerçek okunur.
Yalnız bu dizin değişir" — gelecek zaman tamamen çıksın.

**Cevap:** —

## M-Y2. Ana sayfa künyesi (`page.tsx:25`) — "bugün fiyat/fırsat/paket stub": değil

**Gözlem:** *"bugün fiyat/fırsat/paket stub, kaynak geldiğinde bu sayfa değişmez"* — M-Y1 ile aynı
bayatlık, vitrinin giriş kapısında. Karşı örnek aynı katmandan: ürün sayfası künyesi
(`lib/storefront/product.ts`) kaynak durumunu satır satır ve DOĞRU listeliyor ("ürün · varyant ·
fiyat · stok · fırsat · beyan · galeri · benzer → GERÇEK"). Güncellenen ile kalan yan yana.

**Öneri:** "bugün … stub" cümlesi silinsin; künyenin kalıcı kısmı ("veri kapıdan okunur, sayfa
değişmez") zaten doğru ve yeter.

**Cevap:** —

## M-Y3. `not-found.tsx:16` — "katalog modülüne bağlıdır (henüz yok)": katalog geleli çok oldu

**Gözlem:** 404'ün "çok sevilenler" ızgarası için künye *"katalog modülüne bağlıdır (henüz yok) —
katalog inince eklenir"* diyor. Katalog inmiş durumda (vitrin gerçek katalogdan okuyor); bugün
gerçek engel başka: "çok sevilenler"in popülerlik ölçütü `BEKLEYEN(08.9)` (görüntüleme+sipariş
sayımı yok). Yani bölüm hâlâ meşru olarak yok ama künye YANLIŞ engeli gösteriyor — "katalog
inince" koşulu gerçekleşmiş, okuyan ajan bölümü eklemeye kalkar ve 08.9 duvarına orada çarpar.

**Öneri:** Gerekçe düzeltilsin: "popülerlik ölçütü `BEKLEYEN(08.9)` — ölçüt gelince eklenir".

**Cevap:** —

## M-Y4. `product.ts` kaynak listesi — "yorumlar ve puan → YOK (17-geri-bildirim)": model ve moderasyon VAR

**Gözlem:** Aynı doğru listenin tek bayat satırı: *"yorumlar ve puan → YOK (17-geri-bildirim)"*.
Modül 17'nin model+moderasyon yarısı inmiş (`product_feedback` onay akışıyla canlı; 17.1 `[~]`,
17.2/17.5 `[x]`); eksik olan yalnız PDP'deki GÖSTERİM — o da 17.1'in kalan parçası ve bu şeridin
kendi işi. Künye engeli dışarıda ("modül yok") gösteriyor; oysa top kendi sahasında.

**Öneri:** Satır "model hazır, gösterim 17.1'in kalanı (bu yüzey)" olarak düzeltilsin — bölüm
eklendiğinde `product.ts`'in GERÇEK listesine taşınır.

**Cevap:** —

## M-Y5. Temiz çıkanlar (kayıt için)

- **Kendini düzelten künye örneği bu yüzeyden:** `error.tsx:30` eski sözünü alıntılayıp ("bir süre
  *'servis bağlanınca gönderilir'* diyordu — servis bağlandı, not artık gerçeği anlatıyor")
  güncellenmiş; `message-screen.tsx` künyesi de aynı dürüstlükte. Bayatlığın panzehiri tam bu desen.
- `fixtures.ts` künyesi güncel ve şema-bağlı fixture gerekçesi sağlam; `product.ts` kaynak
  listesinin kalan satırları doğru; `home.ts:44` `BEKLEYEN(08.9)` bağlı ✓; `use-load-more` /
  `stripe-webhook` / `find-or-create` künyelerindeki "geldiğinde"ler koşullu akış anlatımı, vaat
  değil ✓; `empty-cart` görsel notu gerçek (görsel hâlâ yok) ✓.
- Üç turun toplamı: 10 bulgu / 10'u da künye-gelecek-zaman sınıfı; metot/inline yorumlarında bayatlık
  ÇIKMADI. Kalıcı ders şeritlerce zaten yazıldı (arka uç Y-kapanışı): künyeye gelecek zaman yazılmaz,
  plan görev satırında durur.

**Cevap:** —
