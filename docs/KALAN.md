# KALAN — açık işler

Tek liste. Satır = kimlik + ne + (varsa) neden. Biten satır silinir; ilerleme notu yazılmaz.
Koddaki `BEKLEYEN(<kimlik>)` işareti buradaki bir satıra bağlıdır (`pnpm repo:check` doğrular).
Yeni iş: kimlik `K.<sıradaki sayı>` (son: K.27). Eski kimlikler (`NN.k`, `BACKLOG §n`) korunur.
`[~]` = başlandı, eksiği altında yazılı. Tarihler ve "kullanıcı kararı" ibareleri eski kayıttan kalmadır.

Sayım (2026-09-15): açık 88 · kısmi 80 · kapalı ama koddaki işaretin andığı 25

## 00 · Monorepo İskeleti

- [~] (00.9) **Playwright — önce GÖZ, sonra duman** (kullanıcı kararı 03.08; denetim etüdü)
- [ ] (00.10) **İstemciden barrel'a DEĞER yolu `docs:check` ile zorlansın** *(kalıbın kendi önerisi, 10.08; kayda geçirildi 15.08)*
- [~] (00.11) **Paket yapısı elden geçirme — en basitten, tek paket tek tur** *(kullanıcı kararı 15.09: "packages altındaki yapıyı en basitten başlayarak elden geçireceğiz; her seferinde bir tanesini alacağız")* · tur akışı: nerede ve nasıl kullanıldığının incelemesi → değişiklik → YALNIZ o değişikliğin kırabileceği yeri sınayan test → commit

## 04 · Kimlik ve Yetki: Supabase Auth, Guard'lar, Müşteri Bağlama

- [~] (04.10) **Kimlik çapası: e-posta bağlama + güvenlik kodu** — WhatsApp'tan gelen müşterinin hesabını sürdürülebilir kılan akış.

## 05 · Katalog: Servisler ve Yönetim Zemini

- [x] (05.22) ~~**Koli/palet künyesi veri modeline** — basılı katalogdan gelen `logistics` bugün yalnız besleme dosyasında duruyor~~ **YAPILMAYACAK — soru başka eksende çözüldü, artığı söküldü** *(kullanıcı kararı 28.08)*
  - Görev kapandı; koddaki `BEKLEYEN(05.22)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [~] (05.37) **Görsel boyutlandırma — ölçekleme CDN'e, kırpma kararı bizde** *(kullanıcı isteği 27.08 · `05.7`'nin "sonraya bırakıldı" cümlesinin karşılığı)*

## 06 · Stok ve Tedarik: Parti, Rezervasyon, Satın Alma

- [x] (06.14) **Stok hareket defteri (`stock_movement`) — depodan mal çıkmasının TEK kaydı** *(kullanıcı kararı 27.08)*: `stock_adjustment` yutuldu, satış/kapı satışı/sevk/kabul/iptal de deftere yazıyor
  - Görev kapandı; koddaki `BEKLEYEN(06.14)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [ ] (06.15) **Sipariş silen testler `purgeOrders` kapısına alınır — `06.14`'ün yarım kalan yarısı** *(denetim ölçümü 28.08, körlemesine ajan bulgusu)*

## 07 · Sipariş, Checkout ve Ödeme

- [~] (07.12) **Taşıyıcı + kargo takip numarası:** `order.carrier` (tanımlı küme: `colissimo · chronopost · dhl · ups · other`) + `order.tracking_number`; ikisi de yalnız `delivery_type = 'shipping'` siparişlerde anlamlı — kısıt veride (rota siparişine takip numarası yazılamaz). Numarayı hazırlık ekranı girer (paketi kapatan kişi etiketi elinde tutar), ayrı sevk adımı açılmaz. Takip bağlantısı taşıyıcının URL kalıbından üretilir; `other` seçilirse bağlantı gösterilmez, numara düz metin durur
  - Eksik: `GET /api/v3/parcels/statuses` taksonominin tamamını veriyor (35 kod, HTTP 200) — ilk yazımın *"kamuya açık liste yok"* varsayımı yanlıştı. Sezgisel (metin araması) tablo gerçek listeye karşı koşturulunca **yedi kod yanlış, on biri tanınmıyor** çıktı; en tehlikelisi `CANCELLATION_FAILED` → `cancelled` (iptal EDİLEMEDİ…
- [ ] (07.17) **AB ülkelerine kargo satış kanalı — bugün sistem iki ülke tanıyor, üçüncüsünü SESSİZCE Fransa yazıyor** *(kullanıcı kararı 02.09)*
- [~] (07.18) **Ödeme sonucu gelmezse sistem afallamaz — kart taslağı sağlayıcıya sorularak netleşir** *(kullanıcı bildirimi ve kararı 14.09)*

## 08 · Müşteri Web Uygulaması (Vitrin)

- [~] (08.5) **Hesap grubu:** hesap (profil/adres/dil/izinler/puan), siparişler (+ tek tuş tekrar sipariş), sipariş detay (+ "bir sorun mu var?")
  - Eksik: Bugün zarar yok ve bunu ölçerek söylüyorum: temiz seed'de kişisel kupon **2**, müşteri başına en çok **2** — tavan 50. Risk zamanla doğuyor, çünkü kullanılmış kupon silinmiyor **kapatılıyor** (`setActive` künyesi: *"geçmişi kalsın"*), yani 50'lik pencere yıllar içinde kullanılmışlarla dolar ve eleme sonrası ekranda kup…
- [x] (08.8) **Statik sayfalar:** yasal/statik şablon (mentions légales/CGV/gizlilik/teslimat-iade/SSS), çok dilli
  - Görev kapandı; koddaki `BEKLEYEN(08.8)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [x] (08.11) **Ürün detay sayfası — katalog grubunun son halkası**
  - Görev kapandı; koddaki `BEKLEYEN(08.11)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [~] (08.12) **Sepet — vitrinin ölü kontrollerini kapatan iş**
- [~] (08.13) **Checkout + sipariş alındı — sepetin ölü düğmesini kapatan iş**
- [x] (08.22) **OTP test kapısı — deterministik dev kodu**
  - Görev kapandı; koddaki `BEKLEYEN(08.22)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [~] (08.39) **Terfi aşama 2/3 — müşteri şeridinin dört ikizi köprüye indi, biri engelli** *(denetim bulgusu `docs/denetim/denetim-K5-application.md` K5-1)*
- [x] (08.44) **KAMPANYA VİTRİNDE VE FİLTRELENMİŞ KATALOGDA GÖRÜNSÜN — rozet ve cümle, FİYAT DEĞİL** *(kullanıcı kararı 19.08; ölçüm ve karşılaştırma aynı gün yapıldı)* · `touches (planlanan): packages/application/src/catalog/**, apps/web/lib/storefront/home.ts, apps/web/app/(customer)/[locale]/catalog/**, apps/mobile-api/src/lib/home.ts, apps/mobile-customer/src/screens/home/**`
  - Görev kapandı; koddaki `BEKLEYEN(08.44)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [~] (08.58) ~~**MOBİL WEB v1 — kabuk birebir, ekranlar sırayla**~~ → **MOBİL WEB — telefon görünümü native uygulamanın tasarımına (kullanıcı kararı 14.09)** *(kullanıcı isteği 13.09: öteki şerit masaüstünü `Musteri Web v1.dc.html`'e taşırken mobil web `Musteri Mobil v1.dc.html`'e; sıra ve dosya ayrımı kullanıcıyla konuşuldu)*
  - Kalan ekranlar — kare adı `design/01-musteri/Musteri Mobil.dc.html`'in `data-screen-label`'ı; tur bu sırayla, biten satır silinir:
    - [ ] Keşif `discover` ↔ native `discover`
    - [ ] Sepet `cart` ↔ native `cart`
    - [ ] Checkout + Ödeme `checkout` ↔ native `checkout`
    - [ ] Sipariş Onayı `checkout/[reference]` ↔ native `checkout`
    - [ ] Siparişler `orders` ↔ native `orders`
    - [ ] Sipariş Detay `orders/[reference]` ↔ native `orders`
    - [ ] Hesap `account` ↔ native `account`
    - [ ] Bildirimler `account/notifications` ↔ native `notifications`
    - [ ] Tarifler `recipes` ↔ native `recipes-list`
    - [ ] Tarif `recipe/[slug]` ↔ native `recipe`
    - [ ] Geri Bildirim `feedback/[token]` ↔ native `feedback`
    - [ ] Professionnels `professionals` ↔ native `professionals`
    - [ ] Bilgi Sayfası `legal/*` ↔ native `legal`
    - [ ] Tasarımda karesi yok, ölçü native ikizinden: `account/points` (native `points-history`) · `account/preferences` · `invite/[code]` (native `invite`) · `neighbor/[token]` (native `neighbor`)
    - [ ] En son, kullanıcı inceler (müşteriyle yoğun etkileşen sayfalar): Talepler `support` · Talep Detay `support/[ticket]` · Yeni Talep `support/new` ↔ native `support`
  - Şu sayfaların ayrı telefon gövdesi yok, telefonda masaüstü gövdesinin `compact` dalı çiziliyor: `support/new` · `feedback/[token]` · `account/preferences` · `invite/[code]` · `neighbor/[token]`. Sırası gelen ekranda ilk iş fork.
- [~] (08.59) **MASAÜSTÜ WEB v1 — başlık, yer paneli ve adres penceresi `Musteri Web v1.dc.html`'in birebir aynısı; ikon seti müşterinin gördüğü her ekranda** *(kullanıcı isteği 13.09: "Tasarımın bire bir aynısını yapmanı istiyorum… Kod güncel, doküman bayat olabilir."; ikon seti kullanıcı kararı 14.09 — ikon deseni her yerde aynı; mobil web aynı anda `08.58`, iki şeridin işi birbirine bağlı olduğu için tek commit — kullanıcı kararı 13.09 + 14.09)*

## 09 · Admin Yüzeyi: Komponentler ve Sayfalar

- [~] (09.1) Route izolasyonu: `(operations)` route group + toptan oturum+rol kontrolü (sayfa içi guard tekrarıyla çift kat) + `noindex`
- [~] (09.2) **Operasyon evreni komponent envanteri** — envanterdeki her komponent varyant ve durumlarıyla (normal/devre dışı/yükleniyor/hata/boş) `components/ui` + `components/form` katmanında kodlanır; iç galeri sayfasında hepsi görülür
- [~] (09.3) **Dashboard** — bugünün siparişleri, bekleyen işler (B2B başvuru, limit aşan vadeli, açık talep, yaklaşan tarihli parti), kritik göstergeler, gecikmiş vade, uyuşmayan kapanış; hepsi ilgili ekrana köprü
- [~] (09.4) **Ürünler**
- [~] (09.5) **Fiyatlar**
- [x] (09.6) **Fiyatlar: indirim/kupon + near-expiry teklif** — kupon/otomatik kampanya CRUD (koşullar, tek-en-büyük bilgisi), kişisel kuponlar; teklif önerisi listesi → teklif açma/güncelleme/kapatma (önerilen %30 parametrik; karar admin'in)
  - Görev kapandı; koddaki `BEKLEYEN(09.6)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [~] (09.9) **Müşteriler: liste + detay**
- [~] (09.10) **Müşteriler: birleştirme + GDPR silme** — birleştirmede hedef/kaynak ve taşınacaklar onaydan önce net; RPC ile siparişler/puanlar/konuşmalar taşınır, kaynak kapanır. GDPR silme: kişisel veri silinir/anonimleşir, sipariş kayıtları muhasebe bütünlüğü için kalır; iki işlem de bilinçli onaylı
- [~] (09.11) **B2B onay**
- [~] (09.14) **Tedarik / satın alma**
- [~] (09.15) **Rotalar** — bölge CRUD (posta kodları + haftalık günler; bir kod tek bölge), günün rota listesi (hazırlık durumu bağlamıyla), ~~kurye atama~~, siparişi başka güne taşıma, kesim saati etkisi görünümü
- [~] (09.16) **Ayarlar** — kapsamlı Setting yönetimi (genel değer + kanal/bölge/ülke istisnaları; anlaşılır ad/açıklama; alt sınır kontrolü — TTL 30 dk altına inemez; değişiklik izi) + kullanıcı/rol yönetimi (çoklu rol, pasifleştirme)
- [~] (09.17) **Sonsuz kaydırma tek geçişte düzeltilir**
- [~] (09.18) **İmha/fire aramasının sunucu tarafı**
- [~] (09.21) **Tarif yönetim ekranı** *(veri modeli 05.16; müşteri yüzeyi 08.24)*

## 11 · Kurye ve Rota Teslimat

- [ ] (11.5) **Teslimat özeti PDF:** teslimde e-postalı müşteriye otomatik (parametrik); kurye isterse çıktı ("resmî fatura değildir")
- [ ] (11.10) **Gerçek yol matrisi — OSRM adaptörü:** `RouteMatrixProvider` portunun HTTP tarafı; sıra kuş uçuşu yerine yol süresiyle dizilir
- [~] (11.11) **Adres DOĞRULANABİLİRLİĞİ — "bu kapı var mı" sorusu hiç sorulmuyor:** kaba eşleşme tespit edilir, müşteriye düzeltme teklif edilir, düzeltilmezse sevkiyat ve kurye uyarılır

## 12 · Para, Ön Muhasebe ve Kârlılık

- [x] (12.11) **`money_movement.idempotency_key` — K4 tahsilatının atomik kapanışı** *(mobil önerisi 08.08, koordinasyon defteri; kabul edildi)*: kolon + kısmi tekil indeks + hareket RPC'sine parametre. Bugünkü ara mekanizma `meta.idempotencyKey` + yazım-öncesi arama (`application/order/payment.ts`) — atomik değil, birinci kilit durum makinesi. Emsal: `order.idempotency_key` (`0012`). Migration ister; bir sonraki şema penceresiyle kümelenir (`db:refresh` kullanıcı kararı)
  - Görev kapandı; koddaki `BEKLEYEN(12.11)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [ ] (12.25) **Ciro tabanı — sipariş edilen mi, teslim edilen mi** *(14.09: 12.2'nin 01.09 notundaki karar sahipsiz kalmıştı — not kararı 13.2'ye, SQL'deki işaret 12.2'ye bırakmış, ikisi de kapalı)*: müşteri kartının toplamı (`customer_order_totals`) ve analitik ciro (`analytics_order_revenue`) bugün sipariş edilen tutarı (`ordered_total`) topluyor, muhasebe dosyası (12.7) kalemlerden teslim edileni sayıyor; gerçekleşen ciro (`revenue_total`, tetikleyiciyle yazılıyor) hiçbir yerden okunmuyor — sistemde iki ciro tanımı var. Karar kullanıcının: tek sayı mı iki sayı mı; ölçümüyle sorulur (iki tanımın ayrıştığı siparişler: kısmi karşılama, iade). İki tanım iadede de ayrışıyor: analitik tabanı (`analytics_ord…

## 13 · Analitik

- [x] (13.2) **UTM → sipariş eşleşmesi:** link UTM → sunucu oturumu → sipariş; `acquisition_source` ilk siparişte (07 ile); kampanya ROI raporu (ciro + gider yan yana, 12'den)
  - Görev kapandı; koddaki `BEKLEYEN(13.2)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [~] (13.5) **Segmentler:** edinim kaynağı kohortu (tekrar sipariş), RFM + uyuyan müşteri (siparişten türetilir), export'lu
- [~] (13.8) **Analitik ekranı** *(tasarım: `Operasyon - Analitik.dc.html`, `design/pages/admin-analitik.md`)*

## 14 · Bildirim ve E-posta: `packages/email` + `packages/notify`

- [ ] (14.6) **Teslimat özeti PDF:** kalemler + karşılanan miktarlar + `reference_no` + "resmî fatura değildir" ibaresi; teslimde e-postası olan müşteriye **otomatik** gönderim (parametrik `Setting`, varsayılan açık); kurye için indirilebilir/yazdırılabilir hâli
- [ ] (14.8) **Kampanya e-postası elle gönderim aracı (admin):** alıcı listesi yalnız `marketing_consent.email` izinlilerden; içerik elle hazırlanır, önizleme + gönder; otomasyon/zamanlama **yok**
- [ ] (14.9) **Bülten kayıt kutusu (site) + `marketing_consent` yazımı:** kutu baştan işaretsiz (AB açık eylem şartı); kayıtta `{granted, at, source}` yazılır — checkout/kayıt kutuları da aynı yazım fonksiyonunu kullanır
- [ ] (14.11) **`notification-data` + `rewardCompletedOrder` terfisi (`@lezzet/application`)** *(mobil ucun ön şartı — koordinasyon defteri 08.08; kabul edildi)*: kurye/refund orkestrasyonları pakete terfi etti, yan etkileri port (`order/effects.ts`) — port boş kaldıkça `/api/v1/courier` teslimatı müşteriye mail atmıyor, puan yazmıyor (sessiz değil: süreç başına bir `logger.warn`). Web bugün etkilenmiyor: köprü kendi uygulamalarını çağırıyor. Terfi `@lezzet/notify` + `@lezzet/i18n` bağımlılığını pakete ekler; `17.4`'ün `rewardCompletedOrder`'ı aynı turda gider. **Stripe refunder TAŞINMAZ** — anahtar ve webhook bağlamı yüzeyin işidir, kalıcı port olarak kalır. Zamanlama: en geç kurye köprüsünün benimseme t…
- [ ] (14.17) **Tarayıcı bildirimi (web push) + "uygulama önce" kuralı** *(kullanıcı kararı 10.09 — `design/KARARLAR.md` "Web push AÇILDI")*: müşteri web yüzeyinde (masaüstü + mobil web) tarayıcı aboneliği; bir haber TEK cihaz bildirimine gider — native uygulama (son 30 gün içinde görülmüş; parametrik) → tarayıcı → e-posta; BELGE'de e-posta daima + tek push. Parçalar: `app/manifest.ts` (iOS 16.4+ ana ekran şartı `display: standalone`) · service worker · VAPID anahtarları (web + backend + mobile-api — üç süreç de bildirim gönderiyor) · abonelik kaydı (`push_device`a `web` platformu + aboneliğin iki anahtarı; 0050 yerinde) · `packages/notify` tarayıcı sürücüsü (`web-push`; 404/410'da abonelik budanır) + sır…

## 15 · WhatsApp: Zemin ve Canlı Kanal

- [~] (15.3) **`wa.me` click-to-chat girişleri:** sitede buton (çok dilli önceden yazılı mesaj), QR üretimi; IG bio linki operasyon notu olarak
- [~] (15.7) **Webhook alıcısı (~~yer kesin değil~~ ~~→ `apps/web` — Stripe'la aynı bilinçli sapma~~ → **`apps/backend`**, 29.08'de taşındı · gerekçe `ADR Sapma 5` ve kabuk künyesinde):** imza doğrulama + `WebhookEvent` idempotency (provider+event_id unique, tekrar = no-op) + gelen mesajın `Conversation`/`Message`'a yazımı + 24s pencere güncellemesi (`window_expires_at`)
- [~] (15.8) **AI ajanı (`packages/ai`):** çok dilli sohbet; stok/fiyat/sipariş durumunu **domain-core'dan okur** — cevap + kart/aksiyon kararı üretir, ticari değer uydurmaz
- [~] (15.9) **İnteraktif kartlar:** buton/liste/carousel/ürün kartı gönderimi (içerik ajandan, render 360dialog/Cloud API)
- [ ] (15.10) ~~**Sohbette sipariş kapatma:** ajan sepeti kurar → rezervasyon (önce ayır) → **Stripe payment link, süresi rezervasyon TTL'ine eşit** → ödeme webhook'unda `confirmed`~~ → **YAZILMAYACAK: yerine SEPET BAĞI (07.09 · kullanıcı kararı) → `15.20`–`15.22`.**
- [~] (15.11) **Utility template'ler:** sipariş onayı / kargo bildirimi şablonları onaylatılır; `packages/notify` WhatsApp API sürücüsü doldurulur; pencere içi serbest mesaj / pencere dışı template kararı `Conversation`'dan
- [~] (15.14) ~~**Ajanın Ticket açması:** şikâyette hangi sipariş → hangi ürün → birkaç netleştirme sorusu → `Ticket` (`conversation_id` bağlı; 16 servisleri)~~ → **Ajan talebi AÇMAZ, talep sayfasının bağlantısını verir** (kullanıcı kararı 10.09)
- [~] (15.16) **Messenger/IG kimlik bağlama:** kimliksiz sosyal konuşmayı müşteri kaydına bağlayan operatör eylemi (`open_conversation`'ın "yalnız boşsa dolar" güvencesiyle aynı kural) + 04.10 çapraz-kanal çapasının (kod e-postaya gider, müşteri sohbetten geri yazar) Messenger/IG'ye genellenmesi — orada telefon HİÇ olmadığı için kimliğin tek otomatik yolu bu.
- [~] (15.20) **Ajan sepeti OKUR ve YAZAR — kimliği olan sohbette (WhatsApp):** sepetteki kalemler, indirim ve toplam okunabilir; ajan sepete kalem ekler/çıkarır; müşteri sepete yönlendirilir
- [~] (15.21) **Sepete YÖNLENDİRME — her kanaldan tek akışa:** sohbette kurulan/var olan sepetin bağlantısıyla müşterinin sepet sayfasına taşınması; onay ve ödeme orada
- [~] (15.22) **Kimliksiz kanalda sepet — Messenger/Instagram + kimlik köprüsü:** kimliği çözülmemiş sohbette sepet kurulabilmesi ve bağlantıyı açıp giriş yapan kişinin hem sepeti hem kimliği kazanması
- [~] (15.23) **Sohbetin dokunduğu sepetin siparişi sohbetin KANALINI taşır** (kullanıcı kararı 07.09: *"orada web yazmaması lazım… Instagram, Facebook veya WhatsApp'ı ifade etmemiz lazım"*): `order_source`a `messenger` + `instagram`; sepet kendisine dokunan sohbeti hatırlar (ajan yazınca ya da bağlantı devralınınca damga); checkout kaynağı o sohbetin kanalından yazar; sipariş kesinleşince damga silinir
- [ ] (15.24) **Sohbet hunisi — platform verimliliği** (kullanıcı sorusu 07.09: *"hangi platformun daha verimli olduğunu gözlemleyebilecek miyiz?"*): gün × platform özeti — açılan sohbet · sepet kurulan sohbet · gönderilen bağlantı · açılan bağlantı · sipariş · ciro; analitik ekranına bölüm
- [~] (15.25) **Gelen medya İNDİRİLİR ve GÖRÜNTÜLENİR:** fotoğraf/ses/belge Meta'dan indirilip PRIVATE R2 kovasına yazılır, operasyon ekranında ~~imzalı süreli adresle~~ **yetkili geçitten** (`/operations/social/media/<id>`) çizilir
- [~] (15.26) **Sesli mesaj METNE ÇEVRİLİR; ajan sesten gelen isteği TEYİT ETMEDEN işlemez** (kullanıcı kararı 07.09, itiraz turuyla olgunlaştı)
- [~] (15.27) **AI maliyeti ÖLÇÜLÜR** — tarife ayarı + her koşuda hesap + kaydedildiği yer
- [~] (15.28) **Sohbet İKİ YÖNLÜ çevrilir — müşteri kendi dilinde okur, operatör Türkçe** (kullanıcı kararı 07.09: *"bu çok dil yapısını da şimdi yapalım. Bu kilit bir konu."*)
- [~] (15.29) **AI devir SEBEBİ deftere yazılır ve ekranda okunur** — ~~`conversation.ai_handoff_reason` + `ai_handoff_at`; başlıkta *"AI devretti: …"*~~ → sohbetin İÇ NOTU (`conversation_note`), akışta devrin olduğu yerde
- [~] (15.30) **Yeni sohbet VARSAYILAN olarak AI modunda açılır; varsayılan Ayarlar'dan ve Sosyal Mesajlar'dan seçilir** (kullanıcı kararı 07.09)

## 16 · Talep / Şikâyet

- [~] (16.2) **Müşteri girişleri:** sipariş kaleminden (tip + foto), genel "bize yaz" yönlendirmesi (siparişe bağlan / serbest); foto yükleme (`packages/storage`)
- [~] (16.4) **Bildirimler:** cevap gelince müşteriye e-posta; müşteri durumu + yazışmayı hesabından görür (08 talep sayfası)
- [ ] (16.6) **Analitik bağı:** ürüne bağlı şikâyetler (bozuk/eksik) admin analitiğine kalite sinyali (13/geri bildirim ile yan yana)
- [ ] (16.7) **Talep fotoğrafı fikstürü kayıp — ek hiç yüklenmiyor** *(katalog şeridinin bulgusu 16.08, 05.25 sırasında)*

## 17 · Geri Bildirim, Yorum ve Puan

- [~] (17.1) **Yorum + ürün skoru (`ProductFeedback`):** yalnız satın alan yazar; moderasyon (onay/ret) → ürün sayfasında gösterim; **ürün skoru türetimi** (yorum ortalaması + beğen/beğenme oranı)
- [ ] (17.8) **"Elimize geldi" varış bildirimi:** aday ürün kataloğa girince, o ürünü beğenmiş müşterilere haber

## 18 · Operasyon ve Güvenlik

- [ ] (18.1) **Veri erişim modeli (RLS kapsamı):** service-role + guard tek kat mı, + RLS ikinci hat mı; RLS'nin ilk kapsadığı tablolar (müşteri kendi satırı, kurye kendi teslimatı). *Öneri:* çift kat, RLS temel tablolarda ikinci savunma.
- [ ] (18.3) **Webhook güvenliği gözden geçirme:** 07 (Stripe) ve 15 (360dialog) idempotency + imza doğrulaması yerinde mi; `WebhookEvent` tablosu tüm sağlayıcıları kapsıyor mu. *Öneri:* tek desen, her sağlayıcı aynı.
- [ ] (18.4) **Yedekleme / felaki kurtarma:** günlük yedek/PITR (Supabase planı) + haftalık off-site `pg_dump` + Storage senkronu + yılda bir **restore provası**. *Öneri:* provası yapılmamış yedeğe güvenilmez — provayı takvime bağla.
- [ ] (18.6) **Cron disiplini doğrulama:** `apps/backend` tek instance (fork); her iş taramalı-idempotent; kritik işler `last_run` + gecikince alarm. (TTL süpürme 06'da, feedback daveti 17'de bu disiplinle yazıldı — kontrol.)
- [ ] (18.8) **CI + staging:** GitHub Actions (typecheck+lint+birim test her push); entegrasyon testleri lokal Supabase'de (özellikle **paralel rezervasyon yarışı** + para RPC'leri); staging = ikinci ücretsiz Supabase projesi + ikinci PM2 app; migration provası önce staging. *Öneri:* erken kur — geliştirmeyi hızlandırır.
- [ ] (18.10) **Paket sınırı aracı son kontrolü:** `apps/*` sipariş/stok/para yazımını yalnız domain-core üzerinden yapıyor; database servislerini doğrudan import edemiyor (00'da kurulan kural üretimde sağlam mı).
- [~] (18.11) **Süreç emniyet ağı + cron kabuğu testi** (denetim G2 · T4).
- [~] (18.12) **GDPR: kişisel verinin silinmesi ve maskelenmesi — arka uç motoru.**
- [ ] (18.13) **`OTP_TEST_CODE` kapısı üretime çıkmadan SÖKÜLECEK** (kullanıcı kararı 15.08: *"şimdilik kalsın ama ileride kaldırılması gereken bir özellik"*).

## 19 · Çok Depo (Depo Ağı)

- [~] (19.7) **Müşteri yüzeyi**: yer bağlamı v2 (`lezzet.place.v2` çerezi: `{country, postalCode}` — v1 `localStorage` kaydı geçersiz sayılır, yeniden sorulur) + belirsizlik seçici (ülke ALANI değil; yalnız `ambiguous`/`unknown` hâllerinde) + katalog/ürün "kargoyla gönderilir" işareti + sepette kargo grubu + "kargolu ürünleri ayrıca sipariş ver" iki-checkout akışı + posta kodu daveti deseni (tasarım paketinden)
- [~] (19.17) **Posta kodu → TÜM yerleşimler (yer adı doğruluğu + adres tutarlılığı)** *(müşteri şeridinin bulduğu açık — 01.08, kullanıcı bildirimi)*: `postal_code_place` bugün **kod başına tek satır** tutuyor (`primary key (country, postal_code)`) ve çok yerleşimli kodda üst idari birime çıkıyor. İki ayrı şeyi birden bozuyor: **(a) gösterim** — indirgenen ad geçerli bir belediye adı gibi okunuyor ve yanlış şehri söylüyor (aşağıdaki bulgu); **(b) doğrulama** — "yazılan şehir bu koda ait mi" sorusu cevaplanamıyor. İstenen: kod başına tüm yerleşimler (GeoNames dökümü zaten hepsini taşıyor, üreteç eliyor) + adın güvenilirliğini söyleyen ayrım. Sonra kapı: `placesForPostalCode(country, code) → string[]`
- [~] (19.18) **Posta kodunun harita üstündeki yeri** *(tasarım kararının arka uç ön koşulu — `design/pages/admin-depolar.md` §2, 02.08)*: bölge kurulumu artık haritadan yapılıyor ve harita kod başına tek işaret basıyor; `postal_code_place` koordinat taşımıyordu. `lat`/`lng` üretece ve tabloya eklendi
- [~] (19.20) **Bölge kurulumu — harita** *(tasarım: `Depolar - Bolge Haritasi.html`, `design/pages/admin-depolar.md §2`)*: bölge kararı coğrafi bir karardır (operatör kodu değil YOLU bilir) ve tasarım asıl giriş aracını harita olarak tanımlıyor; bugün yalnız liste yolu var (aranabilir seçici, `PostalCodePlaceService.searchPrefix`). ~~MapLibre GL JS + OpenFreeMap vektör karoları (teknik karar 02.08, bağlayıcı)~~ → **Leaflet + raster karo** (07.08, gerekçe aşağıda); kodlar `postal_code_place.lat/lng`'den biner (19.18 indirdi); tıkla-ekle/tıkla-çıkar, kod hâlleri ayrışır (bu bölge · başka bölgede tanımlı · boşta), poligon sınırı v1'de YOK
- [x] (19.30) **Hijyen takvimi — noktanın son 3 ayı, ve sıcaklık sayfasının kapanışı** *(kullanıcı tarifi 17.08: "bir iki üç aylık periyodu gösteren bir date time komponenti görünse… istenen aralıkta değilse farklı renkte görünse… üzerine gelerek tool tip olarak girilen tarihleri görsek veya yenisini ekleyebilsek")*
  - Görev kapandı; koddaki `BEKLEYEN(19.30)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.

## 20 · Yapay Zekâ

- [~] (20.3) **Maliyet görünürlüğü:** tarife `settings`'ten okunur, ~~çağrı başına yaklaşık maliyet `job_run`/`error_log` bağlamına yazılır~~ → her koşu kendi defterine (`ai_usage`, 15.27); operasyonda basit bir "bu ay AI" satırı

## 21 · Mobil Uygulama

- [x] (21.6) **Katalog okuma uçları:** `GET /api/v1/categories` (tek tur) + `GET /api/v1/products` (keyset imleç + arama/kategori/sıralama) + `GET /api/v1/products/:slug` (çeşit/aile/benzer) — oturumsuz gezilebilir (public), depo süzgeci ve fiyat kuralı WEB İLE AYNI çekirdekten; web lib'inde kalan orkestrasyon varsa YENİDEN YAZILMAZ, terfi raporlanır (tüzük §3.1).
  - Görev kapandı; koddaki `BEKLEYEN(21.6)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [x] (21.7) **Katalog ekranı — ilk gerçek ekran:** v3 tasarımından birebir; kategori çipleri + 2 sütun kare kart ızgarası (`ProductPhotoCard`) + keyset sonsuz kaydırma + iskelet/boş/hata durumları; ekran başına messages (fr/de/tr, cihaz dili eşlemesi); fiyat cihazda biçimlenir. Ticari bağlamın uca bağlanmasıyla (21.6 kapanışı) aynı turda, iki ajan paralel.
  - Görev kapandı; koddaki `BEKLEYEN(21.7)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [x] (21.11) **Depo bölümü (hub + D1–D6):** önce ölçüm — hazırlık/kabul/transfer/sayım/dönüş orkestrasyonlarının bugünkü adresi (web server action mı, pakette mi; tüketicisiz kapılar doc 04 notu) → gerekirse terfi/benimseme talepleri defterden → `/api/v1/warehouse/*` uçları + D1–D6 ekranları. Çevrimdışı kural v2'de çizili: saha işareti kuyruğa yazılır, depo YAZMA ekranları kilitli (raf ↔ sistem çelişkisi yasak). D6 guard'ın depocuya açılması + D2 hasar not/foto alt akışı burada. **Denetim onayı (defter, 08.08):** hazırlık/kabul terfisi = benimseme (köprüsüz) kabul; tek şart — web bir gün aynı kapıya ihtiyaç duyarsa (10.1 hazırlık ekranı) PAKETTEN çağırır, ikinci yol açılmaz.
  - Görev kapandı; koddaki `BEKLEYEN(21.11)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [x] (21.13) **Push altyapısı:** cihaz token modeli + teslim hattı — web şeridiyle koordineli (14 notify sürücüsü; defterden yürür). Kabuktaki bildirim ekranı ve rol süzmesi 21.9'da; bu görev yalnız İLETİM altyapısıdır. Bildirim hızlandırıcıdır, tek kapı değil (zemin brief kuralı) — her listeye elle giden yol push'suz da çalışır. *(Bu hatta asılı kamera kanıtı için zemin DEĞİŞTİ — denetim gözlemi 23.08: `expo-camera` artık dev-client'ta KURULU (modül 23 kutu QR'ı için girdi, 23.4'te cihazda ölçüldü). Teslim ekranının "kamera modülü kurulu değil" açıklaması bayat; kalan iş modül kurmak değil, foto kanıtını aynı yükleme kapısına BAĞLAMAK.)*
  - Görev kapandı; koddaki `BEKLEYEN(21.13)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [x] (21.14) **Müşteri ekran seti — İLK ETAP: tasarım birebir, UI-only (kullanıcı kararı 08.08):** `Mobil - Musteri v3.dc.html` (~21 ekran) fixture'la birebir geçirilir; **backend işi ÜRETMEZ** (uç yoksa ekran fixture'la TAM çalışır, bağlanma sonraki etap). Üçüncü alt ajan (musteri-expo) yürütür; yazı alanı yalnız müşteri ekran/rota dosyaları — **kit/tema/ikon değişikliği YASAK**, ihtiyaç yöneticiye raporlanır (operasyon ekranlarıyla çakışma önlemi; kurum: şeritte artık üç alt ajan — operasyon-expo · musteri-expo · mobil-backend). Sayfaya-özel komponent kendi klasöründe serbest.
  - Görev kapandı; koddaki `BEKLEYEN(21.14)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [x] (21.15) **Adres dilimi — uçlar + v3 `shAddr` çekmecesi (kullanıcı onaylı sıra, 09.08):** hesap ekranının adres bölümü gerçek uçlara bağlanır; ekleme/düzenleme/silme/varsayılan v3 çekmecesinden. Checkout adres seçiminin zemini.
  - Görev kapandı; koddaki `BEKLEYEN(21.15)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [ ] (21.48) **CİHAZ TURU — MİSAFİR VE MÜŞTERİ YÜZEYİ, KAPSAMLI** (kullanıcı kararı 12.08).
- [~] (21.78) **CİHAZ TURUNUN A BÖLÜMÜ İLK KEZ KOŞULDU — misafir yüzeyi (kullanıcı onayı 18.08)** → A1…A13 ve A15–A16 tamam; **A17 ile A14'ün giriş duvarı açık kaldı.**
- [ ] (21.88) **NATIVE BİLDİRİM ALTYAPISI — kurulacak, kullanımı sonraya** *(kullanıcı kararı 19.08: "biz bir kere native notifikasyon özelliğini ekleyeceğiz, bunun kaçarı yok. Diğer taraftan bunu kullanmayı sonraya erteleyebiliriz")*
- [x] (21.91) **SUNUCUYA ULAŞILAMAYINCA EKRAN SUSUYORDU — vitrin ve hesap konuşmaya başladı (20.08).**
  - Görev kapandı; koddaki `BEKLEYEN(21.91)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [x] (21.103) **NATIVE ARTIK ÖLÇÜLÜYOR — tek defter, `surface` boyutu, sekiz atıcı (MB-63)**
  - Görev kapandı; koddaki `BEKLEYEN(21.103)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [x] (21.110) **SEPET UÇLARI TESTLENDİ — ve testler GERÇEK bir sızıntı buldu (13 iddia)**
  - Görev kapandı; koddaki `BEKLEYEN(21.110)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [~] (21.160) **DEPO MODÜLÜ v3 DENETİMİ — tek elden, ekran ekran** (kullanıcı kararı 30.08)
  - Eksik: Kullanıcı cihazda birçok ekranın tasarımdan farklı olduğunu söyledi; ölçtüm,
- [~] (21.161) **OPERASYON KONTROL KİTİ — ölçüm tasarımdan, komponent tek yerden** (kullanıcı kararı 30.08)
- [~] (21.164) **YÖNETİM MODÜLÜ v3 DENETİMİ — kartlar sayaç değil İŞ söylüyor** (v3:2069-2386)
  - Eksik: Yönetim şeridi açıldı (koordinasyon defteri, alan tablosu). Yöntem depo
- [ ] (21.185) **FABRIC ÇÖKMESİ — İNCELEME DURDURULDU (kullanıcı kararı 31.08)**
- [x] (21.192) **D3 SAF DEPOCU EKRANI OLDU — teklif bilgisi ve ömür yüzdesi söküldü** (kullanıcı kararı 31.08)
  - Görev kapandı; koddaki `BEKLEYEN(21.192)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [~] (21.193) **KURYE ROTASI CİHAZDA: BESLEME ÜÇ HÂLİ ÜRETİYOR · TASARIM ÖLÇÜLERİNE OTURDU** (kullanıcı isteği 31.08)
- [ ] (21.218) **"Eksikleri bildirerek siparişi kapat" düğmesi açık kutu varken görünmesin** — sunucu kuralı ZATEN var (`declareOrderShort` içi dolu açık kutuda `open_box_not_empty` dönüyor); eksik olan ekranın kapıyı önden okuması. **DOLU** açık kutuda gizlenir, boşta gizlenmez: sunucu boş kutuyu "niyet artığı" sayıp siliyor ve beyanı yazıyor — her açık kutuda gizlemek, boş kutu açmış depocuyu çıkışsız bırakırdı.
- [~] (21.235) ~~**SAYIM LİSTESİ LOT ALTINDA GRUPLANIR — aynı ürün · aynı lot · aynı son tarih · aynı alan tek satır, sayım fark dağılımını sistem yapar** (kullanıcı kararı 03.09, henüz başlanmadı)
- [ ] (21.238) **KURYE DENETİMİ — kalan bulgular (kenara not, kullanıcı kararı 03.09: "şimdilik not olarak düş")**
- [ ] (21.245) **Dokunma ertelemesi geçicidir — RN/screens kök düzeltmesi gelince sökülür** (21.219'un kalanı)
- [ ] (21.266) **İadeyi hesap başına BÖL — bölünmüş tahsilatta bugün hiç yazılmıyor** (21.265'in kalanı)
- [x] (21.272) ~~**Kurye sözleşmesine `already_marked` dalı — bugün `stale` diye söyleniyor**~~ → **AKIBET ALANI KURYE İSTEĞİNDEN ÇIKARILDI** (21.271'in kalanı · yön değişti 07.09, kullanıcı kararı)
  - Görev kapandı; koddaki `BEKLEYEN(21.272)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [ ] (21.284) **Hedefi olmayan iki bildirim türü — belge ve askıda kapanış** (21.217'den ayrıldı 07.09)
- [~] (21.310) **NATIVE UYGULAMA İKİYE BÖLÜNÜYOR — müşteri `apps/mobile-customer` + operasyon `apps/mobile-operations` ("Lezzet Operasyonu"); ortak çekirdek `packages/mobile-kit`** (kullanıcı kararları 14.09: *"mevcut mobil uygulamanın ikiye parçalanması … Operasyon uygulamasının adı lezzet-operasyonu olacak"* · *"Klasör yapısı bize projelerin tipi ve ne ile ilgili olduğu hakkında fikir vermeli"* · ortak kod ayrı pakette · taşıma sınırlı betik + kanıtla, önce iki dosyalık pilot · push jetonuna uygulama sütunu → 21.311)
  - Eksik: Klasör
- [~] (21.312) **OPERASYON GİRİŞİ TASARIMINDA — sistemde kayıtlı olmayan giremez; kod ve Google aynı kurala bağlı** (tasarım 14.09: 02-operasyon / Operasyon Mobil - Giris; kullanıcı kararları 14.09)
- [~] (21.313) **ADRES ÇEKMECESİ TASARIMDA — ülke, tek arama, rozetli öneri, doğrulama; adres araması TEK KAPIDAN** (tasarım: 01-musteri / Musteri Mobil `shAddr`; kullanıcı kararları 13.09 · 14.09)

## 22 · MCP Yönetici Asistanı

- [~] (22.4) **Üretim turu — MCP kapısının GÜVENLİK ve İZ katmanı** *(kullanıcı talimatı 26.08: «önce MCP ile alakalı kısmı bitirelim»)*
- [~] (22.10) **İkinci gövde: kampanya/kupon — B sınıfının ilk tipi, GERÇEK formuyla** *(kullanıcı talebi 10.08: "uygula dediğim zaman bana tarihi ve oranı indirim ekranında düzenlenir diye bir şey geliyor; doğrudan bu indirimle alakalı formun önüme gelmesini istiyorum")*
- [~] (22.11) **Kuyruk IZGARAYA döndü: tipe özel önizleme kartları** *(kullanıcı kararı 10.08: "grid şeklinde kartlar olacak, bir kart listesi şeklinde görünecek öneri; her önerinin kendi kart formatı olacak, sadece ön izleme için. Bu karta tıkladığımız zaman bir diyalog açılacak")*
- [x] (22.13) **Kimlik köprüsü: modelden istenen her kimliğin bir kaynağı olmalı** *(MCP denetim raporu 11.08, madde 12 — altı turdur açık; kullanıcı kararı: "bu rapor doğrultusunda yapman gereken değişiklikler varsa bunları yap")*
  - Görev kapandı; koddaki `BEKLEYEN(22.13)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [x] (22.14) **Üçüncü gövde: ürün beyanı — ALAN ALAN karar** *(kullanıcı kararı 11.08: "daha önce tecrübeli olduğumuz konuyla başlayalım… ürünle alakalı bilgilerin güncellendiği öneriler" + form şekli seçimi: **alan alan seçim + düzenleme**)*
  - Görev kapandı; koddaki `BEKLEYEN(22.14)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [x] (22.19) **Ortak form kontrollerine `disabled`** — karar verilmiş öneride form GERÇEKTEN kilitli görünsün
  - Görev kapandı; koddaki `BEKLEYEN(22.19)` işaretleri bu satıra bağlı kalır, işaret sökülünce satır silinir.
- [~] (22.23) **Mal kabul kuyruğun içinde — fatura fotoğrafından tek kararla stok girişi** *(kullanıcı kurgusu 12.08: "MCP ajanına ekran görüntüsü gönderip 'bu ürünlerin depo kabulünü yaptık' derse … kullanıcı bunları düzenleyip kaydet deyip hepsinin depo girişini yapabilecek")*
- [~] (22.27) **Çıkışlar sekmesi TÜM çıkışları göstersin** — hazırlık · kapı satışı
- [~] (22.33) **Tedarik siparişi önerisi kuyruğun içinde — kalemler DÜZENLENEBİLİR** *(kullanıcı talimatı 15.08: "kalan öneri diyalogları hangileri tespit edelim")*
- [~] (22.34) **Panel başlığı: ürün görseli + depolar arası geçiş · denklemin İKİ eksik hareketi** *(kullanıcı isteği ve iki ekran görüntüsü 15.08)*
- [~] (22.35) **ARAÇ TAKIMININ AÇIKLARI KAPATILDI + VİTRİN GÖVDESİ** *(kullanıcı kararı 15.08: «taşıma yerine düzeltmen gereken yerler varsa düzelt» — MCP 8. turunun kendi raporu üzerine)*
- [~] (22.36) **`zone_extend` gövdesi — SON gövdesiz tip kuyruğun içine girdi, haritasıyla** *(kullanıcı kararı 15.08; ilk gerçek dilekçe aynı gün geldi)*

## Tasarım açıkları (eski design/BACKLOG.md; koddaki `BEKLEYEN(BACKLOG §n)` buraya bağlanır)

### BACKLOG §1 · Tasarımı hazır, başka modül bekliyor

- [ ] **Sepet teslimat satırı** ("Teslimat: Ücretsiz" / "6,90 €") — bekleyen: ücret teslimat türüne, tür ADRESE bağlı → checkout adres adımı. Ücretsiz kargo ilerleme çubuğu bundan AYRI ve yapıldı (eşik `Setting`'ten, ilerleme ara toplamdan)
- [ ] **"Checkout'a geç" düğmesi** — girişli müşteri doğrudan, ziyaretçi önce hızlı doğrulamaya — bekleyen: **ENGEL KALKTI (28.07):** `07.4`/`07.5` indi. Kapı hazır — `lib/order/checkout-session.ts` `createCheckoutSession` (rezervasyon → Stripe oturumu, TTL'li), webhook `api/webhooks/stripe`. Kalan iş yüzeyin: düğmeyi kapıya b…
- [ ] **Hediye kartı / hediye çeki** (bakiye taşıyan) — bekleyen: kavramın kendisi kararlaştırılmadı. `order.is_gift_order` var ama o "siparişi hediye olarak gönder"dir — bakiye taşıyan bir enstrüman değil. İstenirse önce `architecture/BACKLOG` kapsamına girer (kupon `§15`'ten AYRI: ku…
- [ ] **Sipariş kalemi düzenleme** — hazırlanmamış siparişte kalem ekleme/çıkarma/adet değiştirme (`design/pages/admin-siparisler.md` §4 "İşlemler"), stok yeniden ayrılır/bırakılır — bekleyen: **09.8 kapandı ama bunu KAPSAMADI (26.08).** Elle giriş siparişi AÇIYOR; açılmış bir siparişin kalemini değiştirmek ayrı bir iş ve ayrı bir risk: rezervasyon geri bırakılıp yeniden alınmalı, indirim payları (`discount_am…
- [ ] **"Fiyat değişti" bildirimi** — `DOMAIN §5`: fiyat arttıysa müşteriye açıkça söylenir ve onay istenir (kabul et / çıkar); düştüyse sessizce uygulanır — bekleyen: `CartItem.unitPrice` okuma tarafına bağlanmalı — alan yazılıyor, karşılaştırılmıyor
- [ ] **Boş sepet: B2B sipariş şablonları** ("Haftalık standart · 14 kalem" + "Yükle") — bekleyen: şablon modeli yok (`07`); B2B müşteri bugün "son siparişi tekrarla" + vitrin seçkisi görür. Kod işareti: `BEKLEYEN(BACKLOG §2)` → aşağıdaki karar maddesi
- [ ] **Boş sepet kahraman görseli** (hasır sepet / tezgâh fotoğrafı, web 260×200 · mobil 180×140) — bekleyen: görsel künyesi yok; çerçeve tam boyutuyla duruyor, yer tutucu sepet işareti
- [ ] **Paketler kahraman görseli** (3:2, "kurulmuş sofra, birkaç paket bir arada") — bekleyen: görsel künyesi yok — paket sayfasının kendi kahramanı için ayrı bir varlık gerekiyor
- [ ] **Paketler listesi: etiket çipleri + `?etiket=` süzgeci** — bekleyen: paketin etiket alanı yok — süzgeç uydurma bir sınıflandırma olurdu
- [ ] **Bölge haberi tetikleyicisi** — bölge genişleyince bekleyenlere TEK e-posta — bekleyen: bölge kaydedilince kontrol eden iş + gönderim (`14-bildirim`)
- [ ] **Operasyon → Analitik "bölge dışı talep" listesi** — bekleyen: `postal_code_demand` doluyor; ekran operasyon yüzeyinin işi
- [ ] **Ayarlar → "Vitrin görselleri" sekmesi** (ürüne ait OLMAYAN sayfa görselleri: ana sayfa hero, fırsat bandı, Professionnels hero, Hakkımızda; ayrıca "statik" işaretli iki kalem) — bekleyen: **İKİ ŞERİT birden:** (1) ~~*arka uç* — `site_image` tablosu + depolama kovası yok~~ **→ YAZILDI (09.08):** `site_image` (0043) + `site_image_slot` enum + `SiteImageService` (`bySlot`/`getSlot`/`put`/`setCrop`/`clear`) +…
- [ ] **Menü: Fırsatlar · Keşif · Professionnels** — bekleyen: kendi sayfaları (`08.7`)
- [ ] **Menü: Hesabım** — bekleyen: `04-auth`
- [ ] **Panel → teslimat listesinde KOLİ sayısı** ("4 koli · B2B") — bekleyen: kutu kavramı (`23-barkod-kutu`, `order_box`). Panel bugün **"N kalem"** yazıyor (`itemCount = lines.length`) ve bunu beklemiyor; kutu gelince sayı kendiliğinden gerçekleşir. Budama kararı: `KARARLAR.md` › Panel (17.08)
- [ ] **Panel → teslimat listesinin ZAMAN EKSENİ** (durak sırası 1…6 + gelecek durakların saati) — bekleyen: durak sırası ölçütü yok (`stop_order` kolonu yok) ve teslim penceresi kavramı yok → `architecture/BACKLOG §8` (a) durak sırası. Panel bugün duruma göre grupluyor, geçmiş durakta `order_status_log`'un GERÇEK saatini göste…
- [ ] **Panel → marj-altı SATIŞ ölçümü** ("2 ürün · bugün 4 satırda") — bekleyen: satış düzeyi ölçüm kâr snapshot'larından (COGS/teslimat/komisyon/paketleme) türetilebilir ama kapısı yok. Panel bugün **ürün düzeyinde** okuyor ("marj-altı fiyatlı ürün: N", kapı hazır) ve aynı kararı tetikliyor — satış…
- [ ] **Sosyal sohbet: GİDEN yönde medya** — operatörün fotoğraf/ses ile cevap vermesi — bekleyen: gönderim kanalı (`15.11`). Bugün `SocialReplyRequestSchema` yalnız metin alıyor ve bu bilinçli: alanı şimdiden açmak, hiç gönderilemeyen bir eki ekranda vaat etmek olurdu. Gerekeni ölçüldü — yükleme adresi (`privateUploa…
- [ ] **Panel → KPI kartlarında DEPO KIRILIMI** ("STR 12 · COL 7 · KEHL 5" alt satırları) — bekleyen: 17.08 budama turunda ayrıca ele alınmamış — tasarım↔ekran karşılaştırmasında fark edildi (19.08). Kısmi karşılık başlıktaki depo süzgeci: seçilince kartlar o depoya iner; kart içi kırılım ise "hangi depoda sorun var" sor…

### BACKLOG §2 · Karar bekleyen (tasarım tarafında netleşmeli)

- [ ] **B2B sipariş şablonu diye bir varlık var mı** — tasarım boş sepette B2B'ye vitrin seçkisi yerine şablon listesi gösteriyor ("Haftalık standart · 14 kalem" + "Yükle"). Böyle bir veri modeli yok ve şablonun ne olduğu kararlaştırılmadı: müşterinin kaydettiği bir sepet mi (`cart.saved_items`'ın adlandırılmış çoğulu), operatörün kurduğu bir liste mi, yoksa "son N siparişten türetilen" bir şey mi? Üçü farklı şema demek. Karar verilene kadar B2B müşteri B2C'nin bloklarını görüyor — müşteri tipi bu yüzden hiç okunmuyor (`lib/cart/empty-cart.ts`, `BEKLEYEN(BACKLOG §2)`).
- [ ] **Koleksiyonlar bandı** — `pages/musteri-anasayfa.md` içerik envanterinde var, `Musteri - Anasayfa.dc.html` tasarımında **yok**. İmprovize edilmedi. Ya tasarıma bant eklenir ya envanterden düşülür.
- [ ] **Katalogun "koleksiyon görünümü" varyantı** — `Musteri - Katalog.dc.html`'de üstbaşlıklı başlık bandıyla çizili, ama koleksiyon rotası yok. Rota açılınca yalnız başlık bloğu değişir. **SEO gerekçesi eklendi (denetim 08.08, kullanıcı bilgisinde):** bugün kategori/koleksiyon süzgeci sorgu parametresinde yaşadığı için "baklava" sınıfı aramalara indekslenebilir bir landing üretilmiyor — bu rota açıldığında her koleksiyon kendi URL'i + meta'sı + (operasyonda ZATEN toplanan) 16:9 OG kapağıyla bir arama giriş sayfası olur. Kapsam kararı kullanıcının; iş büyüdüğü için kendiliğinden başlatılmaz.
- [ ] **Paketler listesinin içerik envanteri** — tasarımı var (`Musteri - Paketler.dc.html`) ama `pages/musteri-paketler.md` **yok**. Diğer 15 müşteri sayfasının hepsinde ikisi de var; bu sayfa envantersiz kaldı, "hangi bilgi neden" yazılı değil.
- Talepler kuyruğu — iki gerçek süzgeç hâlâ ekranda yok (03.08 · daraltıldı 23.08, 16.3)
- Geri Bildirim — üç bilinçli sapma (03.08, 17.1)
- Talepler — çizimin karşılığı olmayan üç sunum kararı (03.08, 16.3)
- Sipariş Alındı — "komşunu bu sefere çağır" şeridi geçici gramerde (12.08, 17.10)

### BACKLOG §4 · Tasarımı olmayan yüzeyler

- Belge ve tedarikçi pencerelerinin yeni alanları — çizimi yok (14.09, 12.26 · 22.44)

### BACKLOG §5 · Operasyon evreni — açık kararlar

- Açık kademeler (envanter kararı bekliyor)
- İç-içe kart zemini — token sözlüğünde adı yok (03.08, denetim OP3)
- Diyalog kabuğu modal olduğunu SÖYLEMİYOR (08.08, 09.21 sırasında ölçüldü)
- Asistan onay kuyruğu — çizimin dört öğesi VERİ olmadığı için çizilmedi (09.08, 22.3)
- Yönetim v3 (native) — çoklu ajan turu kapanırken açık kalan üç madde (30.08, 21.164)
- Kapıda kimlik: WhatsApp OTP — imzanın yerine (30.08, kullanıcı kararı)

### BACKLOG §6 · Bildirim TÜRLERİ — tasarım çiziyor, sistem üretmiyor (ölçüldü 05.09)

- 6.1 `run_reassigned` — sefer başka kuryeye devredildi (KURYE'nin tek meşru türü)
- 6.2 `whatsapp_window_closing` — 24 saatlik ücretsiz cevap penceresi doluyor
- 6.3 `refund_failed` — iade borcu yazılamadı, hiçbir kuyrukta yok
- 6.4 `delivered_uncollected` — teslim edildi, kapıda tahsil edilmedi
- 6.5 `job_partial_failure` — zamanlanmış iş "başarılı" yazıp işi yapmamış
- 6.6 `order_not_ready_on_delivery_day` — teslim günü geldi, sipariş hâlâ hazır değil
- YAZILMAYACAKLAR (kapanmış kararlar, `KARARLAR.md`)

## BACKLOG.md (eski docs/architecture/BACKLOG.md)

### BACKLOG §8 · Teslimat ve rota

- [ ] Posta kodu talebi ÜLKESİZ: `postal_code_demand` anahtarı yalnız `postal_code`; ülke gelince anahtar (ülke, kod) olmalı — koddaki `BEKLEYEN(BACKLOG §8)` buna bağlı.
- [ ] Rota dışına soğuk zincir EKSPRES kargo — araştırılacak, şimdi değil.
- [ ] Kuryenin telefonunda harita + akıllı rota.
- [ ] Otomatik taşıyıcı seçiminde onaylı liste + azami teslim süresi.
- [ ] Sınır ötesi satış — üç ayrı eksik (ölçüldü, analiz ertelendi).

- [ ] Ana logo seçimi + renk paleti → `packages/brand`, Tailwind token _(0. Bekleyen kararlar (kod öncesi netleşmeli))_
- [ ] Fiyat listesi (B2B/B2C) → seed verisi _(0. Bekleyen kararlar (kod öncesi netleşmeli))_
- [~] Kategori yapısı: **düz (tek seviye) + koleksiyon** kararı verildi; nihai kategori/koleksiyon **içeriği** (isimler) bekliyor _(0. Bekleyen kararlar (kod öncesi netleşmeli))_
- [ ] Ürün bazında KDV oranları _(0. Bekleyen kararlar (kod öncesi netleşmeli))_
- [ ] Raf ömrü bilgisi (DLC uyarı eşiği için) _(0. Bekleyen kararlar (kod öncesi netleşmeli))_

## BACKLOG-musteri.md (eski docs/uygulama/BACKLOG-musteri.md)

- [~] **MB-18 · Tüm puan senaryolarının uçtan uca denetimi.** Kapsam: sipariş · ürün yorumu · keşif turu · davet (referans) · ziyaret · günlük tavan (`points_daily_cap`) · B2B'de puan verilmemesi · ikinci kez tamamlamada puan verilmemesi · kupona çevirme eşiği (`points_redeem_min` = 500, `points_cent_value`). Her senaryo için: **motor ne yazıyor · ekran ne diyor · ikisi tutuyor mu.** ~~Bugünkü turda yalnız keşif ve geri bildirim ölçüldü~~ *(bu cümle 24.08'de BAYAT çıktı — aşağıya bakın.)* _(★ PUAN SİSTEMİNİN KARARLARI — 11.08 oturumunda kapandı, TEK KAYNAK BURASI)_
- [~] **MB-24 · Fiyat değişti bildirimi** (`DOMAIN §5`: fiyat arttıysa müşteriye söylenir ve onay istenir; düştüyse sessizce uygulanır) — `design/BACKLOG.md` §1'den devralındı. _(5. Fiyat ve sayı tutarlılığı)_
- [ ] **MB-31 · ~~Katalog Türkçe yüzeyde tamamen İngilizce ve toptancı dilinde.~~ → ARTIK ÜRETİLMİYOR; ölçüm TERS YÖNDE bir açık gösterdi (17.08).** _(7. İçerik ve dil)_
- [~] **MB-34 · Kaydırma kabı kitte yok — 39 ekran ham `ScrollView` kullanıyor.** §11.A'nın işi: `components/ui/` altına klavye davranışı doğru kurulmuş tek bir kap, ekranların ona geçmesi ve ham `ScrollView` kullanımının lint'le kapatılması. MB-01 + MB-02 bunun içinde çözülür; ayrıca 40'ıncı ekranın aynı tuzağa düşmesini yapısal olarak engeller. _(12. Mobil şeridin eklediği kalemler (11.08))_
- [ ] **MB-38 · Test defteri boşaltılmadı** (`docs/talep/not-mobil-test-defteri.md`, kullanıcı talimatı 09.08: *"testleri sonra topluca yaz"*). İçinde ölçülmemiş bir düşüş var: `account-routes.test` TAM koşuda düşüyor, tekil koşuda geçiyor — hata metni hâlâ yakalanmadı. **İKİNCİ ÖRNEK ÖLÇÜLDÜ (14.08):** `app-shell.test.tsx` de aynı şekilde davrandı — tam koşuda *"seçili sekmeye tekrar dokunmak rotayı OYNATMAZ"* düştü (`toHavePathname('/')`), tekil koşuda geçti, ve **aynı tam koşu ikinci kez çalıştırıldığında 84/84 · 599/599 yeşil geldi.** Yani düşüş dosyaya değil KOŞUYA bağlı; iki örnek de rota durumu okuyan testler. Ortak şüpheli expo-router'ın modül düzeyinde yaşayan bellek durumu ve testler ara… _(12. Mobil şeridin eklediği kalemler (11.08))_
- [ ] **MB-44 · B2B'de FATURA e-postasının ayrı verilebilmesi — ileriye bırakıldı (kullanıcı kararı 11.08).** MB-04 kararının bilinçli açığı: bugün hesap e-postası her şeye gidiyor (karar maili, fatura, bildirim). Muhasebede yetkili adresi ile fatura adresi genelde ayrıdır ve kullanıcı bunu *"ileride küçük bir özellik olarak eklenir ve çalıştırılır"* diye kayda geçirdi. **Bugün bir arıza DEĞİL, ertelenmiş bir yetenek** — o güne dek kimse "fatura adresi nerede" diye aramasın diye buraya yazıldı. Geldiği gün dokunacağı yer: profil künyesi (ikinci bir adres alanı) + mail gönderen taraf; başvuru formu değil. _(12. Mobil şeridin eklediği kalemler (11.08))_
- [ ] **MB-78 · FATURANIN NEREDEN ALINACAĞI HİÇBİR YERDE YAZMIYOR — B2B'de yasal ağırlığı var.** ⚑ **BU KALEM GÜNDEME GETİRİLMEZ — kullanıcı kendisi açacak** (kararı 21.08). Kayıt duruyor, hatırlatması yapılmaz; sıradaki işler önerilirken bu madde sayılmaz. Ölçüldü 19.08 (kullanıcı isteğiyle sistem geneli tarandı). Sistemin kararı net ve tutarlı (`DOMAIN §9`: resmî belge üretilmez, fatura muhasebeden gelir) — **eksik olan bu kararın müşteriye söylenmesi.** · **Satış koşullarında (CGV) fatura maddesi YOK** — "fatura" kelimesi hiç geçmiyor; tek ilgili satır *"Fiyatlar KDV dâhildir"*. · **SSS'te fatura sorusu YOK** (dokuz sorunun hiçbiri). · Gizlilik sayfası *"faturanın üzerindeki ad ve adres"*ten ba… _(12. Mobil şeridin eklediği kalemler (11.08))_

## backlog-operasyon-web.md (eski docs/denetim/backlog-operasyon-web.md)

- [ ] **OB-09 · Aynı üründen çoklu adet içeren siparişlerde İade (Return) ve İmha (Disposal/Waste) işlemlerinin veritabanında tutarsızlığa yol açması** _(1. Bloke Edici Bulgular / Hatalar)_
- [ ] **OB-02 · Harita üzerinde Shift + Sürükle ile çoklu posta kodu seçimi (alan seçimi)** _(2. Geliştirme ve İyileştirme Talepleri)_
- [~] **OB-03 · Posta kodu arama kutusunda yerleşim/şehir adına göre arama yapılabilmesi** _(2. Geliştirme ve İyileştirme Talepleri)_
- [ ] **OB-06 · Sipariş detay panelinde müşteri güvenilirlik geçmişi ve güven puanı gösterimi** _(2. Geliştirme ve İyileştirme Talepleri)_
- [ ] **OB-07 · Operasyon panelindeki küçük yazı tipleri (Font Size) ve token yapısı uyumluluğu** _(2. Geliştirme ve İyileştirme Talepleri)_
- [ ] **OB-10 · İade başlatıldığında açılan talebin (Request) iade tamamlandıktan sonra açık kalması** _(2. Geliştirme ve İyileştirme Talepleri)_
- [ ] **OB-11 · Talepler sayfasında mesaj yazıldıktan sonra klavye kısayolu ile (Enter veya Shift+Enter) gönderim yapılması** _(2. Geliştirme ve İyileştirme Talepleri)_
- [ ] **OB-12 · Talepler sayfasında Yapay Zeka destekli (AI-assisted) mesaj cevaplama özelliği** _(2. Geliştirme ve İyileştirme Talepleri)_
- [ ] **OB-16 · Müşteri GRUBU bazlı genel yüzde indirimi (iskonto)** _(2. Geliştirme ve İyileştirme Talepleri)_
- [ ] **OB-17 · Müşteriye özel, TEK ÜRÜN kapsamlı, TEK SEFERLİK indirim yapılamıyor** _(2. Geliştirme ve İyileştirme Talepleri)_

## Kullanıcı bulguları (eski docs/kullanici-bulgulari.md)

- [ ] (B.3) Native uygulama · sipariş tamamlama — mevcut adres düzenlenemiyor ⟶ MOBİL ŞERİT
- [ ] (B.4) Native uygulama · dokunmatik geri bildirim (haptic) kapsamı dar ⟶ MOBİL ŞERİT
- [ ] (B.6) Native uygulamada online ödeme "henüz açık değil" — anahtar eksik, kod değil
- [ ] (B.7) Native uygulama · kapsam bilgisi bayat kalıyor — uygulama kapatılmadan tazelenmiyor ⟶ MOBİL ŞERİT
- [ ] (B.9) Stripe çekmecesinde test kartı otomatik doldurma ⟶ MOBİL ŞERİT · araştırma gerekiyor
- [ ] (B.11) Talebin varsayılan modu `human` — AI taslağı hiç üretilmiyor
- [ ] (B.12) AI cevap yazdı, müşteriye hiçbir bildirim gitmedi — bildirim mailin bastırma kuralına asılı

## Şeritler arası (eski `docs/talep/` — arşiv: `.arsiv/2026-09-15/talep/`)

Talep ve not dosyaları arşive taşındı (95 dosya; yalnız 3'ünde kapanış işareti vardı). Her şerit kendi
hedefindeki dosyaları BİR KEZ gözden geçirir: hâlâ geçerli olan işi buraya `[hedef: …] ne — neden` satırı
olarak yazar, gerisini arşivde bırakır; bittiğinde kendi gözden geçirme satırını siler.

- [ ] (K.1) [hedef: mobil] Arşivdeki 24 dosya (`not-mobil-*`, `mobil-*`) gözden geçirilecek.
- [ ] (K.2) [hedef: müşteri] Arşivdeki 20 dosya (`not-musteri-*`, `musteri-*`) gözden geçirilecek.
- [ ] (K.3) [hedef: operasyon] Arşivdeki 12 dosya (`not-operasyon-*`, `operasyon-*`) gözden geçirilecek.
- [ ] (K.4) [hedef: web/denetim] Arşivdeki 15 dosya (`not-web-*`, `not-denetim-*`) gözden geçirilecek.
- [ ] (K.5) [hedef: arka uç] Arşivdeki 9 dosya (`not-arka-uc-*`, `arka-uc-*`) gözden geçirilecek.
- [ ] (K.6) [hedef: sosyal] Arşivdeki 2 dosya (`sosyal-*`) gözden geçirilecek.
- [ ] (K.23) [hedef: operasyon] Ürün formuna **hazırlama adımları** (`product.preparation_steps`), kategori formuna
  **yapay zekâ sorusu** (`category.ai_question`) alanı — iki kolon 20.09'da açıldı ve müşteri ürün sayfası ikisini de
  çiziyor, ama operatörün doldurabileceği bir yer yok; adımlar sıralı üç dilli liste, soru `{n}`/`{w}` yer tutuculu tek metin.
- [ ] (K.7) [hedef: web] Arşivdeki hedefi belirsiz 13 dosya (`not-yonetim-*`, `not-kargo-*`, `not-sepet-*`,
  `not-fiyat-*`, `not-bildirim-*`, `bildirim-*`, `inceleme-*`, `koordinasyon-*`, `ekler-*`, `biriken-*`) gözden geçirilecek.
- [ ] (K.8) [hedef: paket] `mobile-kit` turunda `screens/login/login-notice.ts` tek başına kaldı (giriş ekranı müşteri
  uygulamasına taşındı); iki uygulamanın ortak uyarı tanımı `lib/auth` gibi bir yere alınmalı.
- [ ] (K.10) [hedef: paket] 300 ms arama gecikmesi üç yerde ayrı: `@lezzet/address/react` çekirdeği, web `use-search-draft`,
  native operasyon `use-batch-subject`; aynı ölçü, tek sabit olmalı.
- [ ] (K.11) [hedef: web] Web adres araması iki yoldan gidiyor (Fransa tarayıcıdan, Almanya sunucu eylemiyle), native tek kapıya
  geçti ve Fransa'yı da sunucudan soruyor; BAN'ın IP başına kota gerekçesiyle çelişiyor, hangisinin doğru olduğu kullanıcı kararı.
- [ ] (K.12) [hedef: mobil] Keşif ekranının ortak metni `@lezzet/i18n/customer/discover`tan okunsun — web telefon görünümü aynı
  cümleleri oradan okuyor, native `screens/discover/messages.json` ikinci kopya olarak kaldı.
- [~] (K.14) [hedef: web] Gerçek başlangıç beslemesi kuruldu (`scripts/seed-real.ts` + `seed-real/data.ts`, `pnpm db:seed:real`);
  eksikler: aracın geçici plakası (`AA-000-AA`), taslak ürünlerin künyesi ve yeni faturaların kalemleri.
- [ ] (K.15) [hedef: web] Mal kabulde "birim alış" alanı kaldırılsın ya da salt okunur gösterilsin — fiyat siparişin ve
  faturanın kaydıdır, kabul ekranında değiştirilmesi maliyeti ve otomatik fiyatı sessizce kaydırır (işletmeci kararı:
  "anlamsız, hatta problemli"). Bugün boş bırakılınca zaten siparişteki fiyat yazılıyor (`application/warehouse/intake.ts`).
- [ ] (K.18) [hedef: mobil] Profesyoneller ekranının başlığı her dilin kendi sözcüğü olsun: TR "Profesyoneller", DE
  "Geschäftskunden" (FR "Professionnels" kalır) — web menüsü ve sayfası bu sözcüklere geçti, native
  `screens/professionals/messages.json` üç dilde hâlâ "Professionnels" diyor.
- [ ] (K.19) [hedef: mobil] Hesap ekranının şirket kartı gerçek kullanımda hiç çizilmiyor: rota `company: null` geçiyor
  (`app/(tabs)/account.tsx`), çünkü `/me` şirket künyesini taşımıyor. Web telefon görünümü kartı "SIRET · KDV" ile
  çiziyor (`companyInfo` + `vatNumber`); native de aynı veriyi okumalı.
- [ ] (K.20) [hedef: mobil] Sipariş detayı gel-al (`pickup`) siparişinde teslim satırına "kargoyla" yazıyor
  (`order-detail-screen.tsx`: `route` değilse `deliveryShipping`). Web bu türde teslim türünü hiç yazmıyor; native de
  yalnız `route` ve `shipping` için yazmalı.
- [ ] (K.21) [hedef: web] Sipariş durumu WhatsApp'tan gitmeli — canlıya çıkmadan önce. Hesap sayfasındaki WhatsApp kartı
  müşteriye "WhatsApp'tan sipariş vermek ve siparişinizin durumunu WhatsApp mesajıyla öğrenmek için numaranızı bağlayın"
  diyor; bugün `packages/notify` WhatsApp API sürücüsü her gönderimi `skipped` döndürüyor. İş `15.11`in sürücü yarısı.
- [ ] (K.27) [hedef: mobil] Müşteri uygulamasının sepeti ayarları ülkesiz ve bölgesiz okuyor: `mobile-api` `readCartView`
  yalnız depo kimliğini geçiyor (`api/v1/cart-view.ts`), istemci de yalnız posta kodu gönderiyor. Almanya'daki müşteri
  sepette FR kargo ücretini görür, checkout DE ücretini keser; bölge asgari sepeti sepette görünmez. Web `readPlaceScope`
  ile ülke + bölge + depo geçiyor; mağaza yayınından önce.
- [ ] (K.22) [hedef: web] Künye aynası `preparation_steps`e bölünecek (`15da29f9` alanı açtı). Aynadaki 39 ürünün
  hazırlaması bugün `storage` metninin satırlarında duruyor; satırlar KOŞUL ve ADIM diye ayrılıp adımlar diziye
  taşınacak. Ayrım ölçütü: koşul, uyarı ve "doğaldır" gözlemi saklamada kalır; yalnız müşterinin SIRAYLA yaptığı
  hareket adım olur. Raf ürünlerinin çoğunda (pekmez, sirke, macun) dizi boş kalır — beklenen hâl, kutu çizilmez.
  Zorunlu takviye ibareleri (Bromelain: "ilaç değildir", doz) adım YAPILMAZ: onlar beyan, `storage`ta kalır.
