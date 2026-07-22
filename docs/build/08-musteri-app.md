# 08 — Müşteri Web Uygulaması (Vitrin)

## Kapsam

Müşterinin gördüğü tüm yüzey: katalogdan checkout'a, hesaptan talebe. **Önce komponentler, sonra sayfalar** — Claude Design'ın müşteri evreni komponent envanteri kodlanır, sayfalar bu parçalardan inşa edilir. Sayfalar `design/pages/musteri-*.md` içerik envanterlerini birebir karşılar. Üç dil, dil başına URL, çerezsiz analitik olayları.

## Okunacaklar

- `design/README.md` + `design/pages/musteri-*.md` (15 sayfa — içerik envanteri bağlayıcı)
- `SEO_I18N.md` (dil başına URL, hreflang, sitemap, yedek zinciri)
- `FEATURES.md` (Müşteri web uygulaması), `DOMAIN.md §5` (fiyat gösterimi), `§10` (misafir/giriş)

## Bağımlılık

`04-auth` (giriş/hesap), `05-katalog` (vitrin okuma), `07-siparis` (sepet/checkout). **Ayrıca: tasarım onayları — sayfa sayfa** (design/README çalışma sırası). Tasarım dili onaylanmadan ilgili sayfa kodlanmaz.

## Başlarken verilecek izah (örnek)

> "Müşteri sitesini kuruyoruz. Önce Claude Design'ın çıkardığı ortak parçaları (buton, kart, form, liste...) birer kez kodluyoruz; sayfaları bu hazır parçaları birleştirerek yapıyoruz — böylece her sayfada tekrar tekrar yazmıyoruz ve görünüm tutarlı kalıyor. Her sayfanın ne içereceği `design/pages` dosyalarında yazılı; biz o içeriği üç dilde ve mobil-web uyumlu hayata geçiriyoruz. Tasarımı beğenmediğin sayfayı ilerletmiyoruz — sayfa sayfa onayla gidiyoruz."

## Görevler

- [ ] **i18n altyapısı:** dil başına URL yapısı (`/fr`, `/de`, `/tr`), arayüz i18n dosyaları, LocalizedText gösterimi + yedek zinciri (TR→FR→DE), dil değiştirici; hreflang + çok dilli sitemap + `Product`/`LocalBusiness` schema.org
  - *Bitti:* aynı sayfa üç dilde açılıyor; sitemap ve hreflang doğrulayıcıdan geçiyor
- [ ] **Müşteri komponent envanteri:** onaylı tasarımdan ortak komponentler (buton/kart/form alanı/liste/durum göstergesi/boş durum/uyarı/miktar seçici...) — her biri varyant ve durumlarıyla, tek yerde
  - *Bitti:* envanterdeki her komponent izole kullanılabilir; sayfalar bunları tüketiyor
- [ ] **Katalog grubu:** ana sayfa, katalog (arama/filtre + sıfır-sonuç → `search` olayı), ürün detay, paket detay
  - *Bitti:* her sayfa `design/pages` envanterini eksiksiz karşılıyor; fiyat girene göre çözülüyor; iç terim sızmıyor
- [ ] **Satın alma grubu:** sepet, checkout (07 akışına bağlanır), giriş/hızlı doğrulama
  - *Bitti:* misafir son adımda doğrulanıp sipariş kapatabiliyor; üç dilde
- [ ] **Hesap grubu:** hesap (profil/adres/dil/izinler/puan), siparişler (+ tek tuş tekrar sipariş), sipariş detay (+ "bir sorun mu var?")
  - *Bitti:* tekrar sipariş güncel fiyatla sepet oluşturuyor; sipariş durumu sade dille görünüyor
- [ ] **Talep grubu:** talep oluşturma (sipariş kalemi/tip/foto + genel "bize yaz" yönlendirmesi), talep listesi + yazışma (16'ya bağlanır)
  - *Bitti:* siparişli ve siparişsiz talep açılıyor; durum takip ediliyor
- [ ] **Geri bildirim grubu:** keşif/swipe (aday ürün), alım-sonrası anket (link ile), Professionnels (B2B self-servis kayıt)
  - *Bitti:* swipe olayı `dwell_ms` ile kaydediliyor; SIRET ile kayıt formu doluyor
- [ ] **Statik sayfalar:** yasal/statik şablon (mentions légales/CGV/gizlilik/teslimat-iade/SSS), çok dilli
  - *Bitti:* statik rotalar üç dilde açılıyor
- [ ] **Analitik olay atma:** sunucu tarafı `page_view/product_view/add_to_cart/checkout_start/order_placed/search/product_swipe/share`; UTM yakalama (13'e besleme)
  - *Bitti:* olaylar çerezsiz kaydediliyor; UTM oturuma bağlanıyor

## Netleşecekler

- **Tasarım onay ritmi:** hangi sayfa hangi sırada tasarlanıp onaylanacak (design/README: müşteri evreni ürün detayla başlar) — kodlama bu ritme uyar, toplu üretim yapılmaz.
