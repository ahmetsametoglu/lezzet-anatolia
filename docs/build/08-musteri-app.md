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

- [ ] (08.1) **i18n altyapısı:** dil başına URL yapısı (`/fr`, `/de`, `/tr`), arayüz i18n dosyaları, LocalizedText gösterimi + yedek zinciri (TR→FR→DE), dil değiştirici; hreflang + çok dilli sitemap + `Product`/`LocalBusiness` schema.org
  - *Bitti:* aynı sayfa üç dilde açılıyor; sitemap ve hreflang doğrulayıcıdan geçiyor
- [~] (08.2) **Müşteri komponent envanteri:** onaylı tasarımdan ortak komponentler (buton/kart/form alanı/liste/durum göstergesi/boş durum/uyarı/miktar seçici...) — her biri varyant ve durumlarıyla, tek yerde
  - *Bitti:* envanterdeki her komponent izole kullanılabilir; sayfalar bunları tüketiyor
- [ ] (08.3) **Katalog grubu:** ana sayfa, katalog (arama/filtre + sıfır-sonuç → `search` olayı), ürün detay, paket detay
  - *Bitti:* her sayfa `design/pages` envanterini eksiksiz karşılıyor; fiyat girene göre çözülüyor; iç terim sızmıyor
- [ ] (08.4) **Satın alma grubu:** sepet, checkout (07 akışına bağlanır), giriş/hızlı doğrulama
  - *Bitti:* misafir son adımda doğrulanıp sipariş kapatabiliyor; üç dilde
- [ ] (08.5) **Hesap grubu:** hesap (profil/adres/dil/izinler/puan), siparişler (+ tek tuş tekrar sipariş), sipariş detay (+ "bir sorun mu var?")
  - *Bitti:* tekrar sipariş güncel fiyatla sepet oluşturuyor; sipariş durumu sade dille görünüyor
- [ ] (08.6) **Talep grubu:** talep oluşturma (sipariş kalemi/tip/foto + genel "bize yaz" yönlendirmesi), talep listesi + yazışma (16'ya bağlanır)
  - *Bitti:* siparişli ve siparişsiz talep açılıyor; durum takip ediliyor
- [ ] (08.7) **Geri bildirim grubu:** keşif/swipe (aday ürün), alım-sonrası anket (link ile), Professionnels (B2B self-servis kayıt)
  - *Bitti:* swipe olayı `dwell_ms` ile kaydediliyor; SIRET ile kayıt formu doluyor
- [ ] (08.8) **Statik sayfalar:** yasal/statik şablon (mentions légales/CGV/gizlilik/teslimat-iade/SSS), çok dilli
  - *Bitti:* statik rotalar üç dilde açılıyor
- [ ] (08.9) **Analitik olay atma:** sunucu tarafı `page_view/product_view/add_to_cart/checkout_start/order_placed/search/product_swipe/share`; UTM yakalama (13'e besleme)
  - *Bitti:* olaylar çerezsiz kaydediliyor; UTM oturuma bağlanıyor

## Netleşecekler

- **Tasarım onay ritmi:** hangi sayfa hangi sırada tasarlanıp onaylanacak (design/README: müşteri evreni ürün detayla başlar) — kodlama bu ritme uyar, toplu üretim yapılmaz.

---

**Modül durumu (27.07.2026):** yalnız §0 token katmanı kuruldu.
- **Var:** `globals.css` müşteri bloğu envanterin §0'ıyla birebir — kum skalası (9 kademe), semantik aileler (zeytin · terracotta · bal · nötr) dört katmanıyla, etkileşim durumları, odak halkası. Kullanımdaki komponentler (buton K1-K3, site çerçevesi K11/K12/K16, durum ekranı K20/K27, form kiti) token'a taşındı; **müşteri yüzeyinde ham hex kalmadı** (yalnız Google/WhatsApp marka renkleri ve `global-error.tsx` — o kök layout yerine geçtiği için globals'a güvenemez).
- **Kararlar (kullanıcı onaylı):** tek mürekkep — `#3a4147`/`#3a3f35` ve diğer dört koyu ton `ink`'e indi, ayrı `slate` token'ı yok. Terracotta ailesi hem fırsat hem hata taşımaya devam eder (ayrı kırmızı aile açılmadı).
- **Yok:** K4-K10, K13-K19, K21-K26 — sayfaları kodlanınca. Karanlık mod müşteri yüzeyinde **planlanmıyor** (envanter §0.5: vitrin gündüz krem zemin üstünde kurulu).
