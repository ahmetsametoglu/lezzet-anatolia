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
  - **Durum (27.07 — tipografi ölçeği + §1/§2/§3 parçaları):** Envanter (`Komponent Envanteri - Musteri.dc.html`) §0.4 bir **tipografi ölçeği** tanımlıyor (Lora: h1 52/600 · h2 28/600 · kart başlığı 24/600; Karla: gövde 14-18/400 · etiket 13-16/700 · üstbaşlık 13-14/600 harf aralıklı) ama `globals.css`'te yalnız font AİLELERİ token'dı; ölçek yoktu. Sonuç: renk disiplinliyken ("ham hex yasak") ölçü serbestti ve ilk anasayfa 25 ham `text-[NNpx]` ile yazıldı. Ölçek token'a çevrildi — `text-h1/h2/card-title/lead/body/note/micro/eyebrow` + `-sm` mobil karşılıkları (satır yüksekliği, ağırlık ve üstbaşlık harf aralığı token'a gömülü, elle yazılmaz). **Kural artık simetrik: ham `text-[NNpx]` de yasak** — kademe yoksa kodlanmaz, envantere eklenir.
    **Ara değerler bilerek yuvarlandı:** tasarımdaki 26 · 19 · 17 px kademe olarak eklenmedi (26→`card-title` 24, 19→`card-title-sm` 18, 17→`body` 15). Gerekçe: kademe çoğaltmak hiyerarşiyi görünmez yapar; envanter üç başlık kademesi tanımlamış, ölçek ona sadık kaldı.
    **Kodlanan parçalar:** K4 `search-field` · K5 `badge` (anlam seçilir, renk değil — `offer/positive/pending/closed`) · K6 `price` (biçimlendirme + "eski fiyat üstü çizili" tek yerde; `was` verilince fırsat rengine döner) · K13 `SectionHeading` · K14 `CtaBand` · K15 `InviteBand` (üçü `section.tsx`'te — aynı iş: sayfayı bölümlere ayırmak). Kartlar (K7-K10) artık kendi fiyatını biçimlendirmiyor, kendi rozetini boyamıyor; anasayfa bir KOMPOZİSYON dosyasına indi.
    **Kalan:** `message-screen.tsx` (K20/K27 hata ekranları) hâlâ ham ölçü kullanıyor — 42/40/27 px kademeleri ölçekte yok, eklemek hata sayfası tasarımının ayrı ele alınmasını gerektiriyor. Footer bağlantıları `text-sm` (14 px) — ölçekte 14 kademesi yok, `note` (13) ile `body` (15) arasında kaldı.
    **Envanterden sapma (bildirim):** envanter müşteri token'ları için `--mus-*` öneki öngörüyor; `globals.css` müşteriyi ÖNEKSİZ (`--color-ink`), operasyonu `--color-ops-*` tutuyor. İşlevsel fark yok, iki evren yine ayrık; ad kuralı bilinçli olarak envanterden ayrı — değiştirilirse tüm müşteri yüzeyi dokunulur, kazancı yok.
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

- [~] (08.10) **Vitrin veri sözleşmesi + fixture katmanı — müşteri yüzeyinin açılış işi** · `touches: apps/web/lib/storefront/**, apps/web/app/(customer)/**, apps/web/components/customer/**, apps/web/i18n/routing.ts`
  - *Bitti:* müşteri sayfaları gerçek servis olmadan tasarımına birebir uygun açılıyor; eksik veri kaynağı geldiğinde **yalnız `lib/storefront` içi** değişiyor — bağlama commit'inin diff'i o dizinle sınırlı kalıyor (sayfa/komponent/`messages.json` dosyalarına dokunulmuyor).
  - **Neden (27.07 kullanıcı kararı):** müşteri tarafı hiç başlamadı, ama 15 sayfanın içerik envanteri (`design/pages/musteri-*.md`) ve görsel kararı (`.dc.html`) hazır. Beklemek yerine yüzey şimdi kurulur; eksik olan yalnız veri kaynağıdır. Bu, `CLAUDE.md §3`'ün "dış-modül bekleyende UI tam, arka uç stub" kuralının uygulanmasıdır.
  - **"Dummy sayfa" DEĞİL — iskelet gerçek, veri sahte.** Tasarımın statik kopyası çıkarılmaz: müşteri sayfa deseni (`page → *-client → *.desktop/*.mobile` + kendi `messages.json` + `*-types.ts`) sonradan uygulanması baştan yapmaktan pahalıdır. Üç dilli metni hard-code edip sökmek ve tek dosyayı sonradan cihaz forkuna bölmek, bu işin iki klasik battığı yerdir. Kopyalanacak kanıtlanmış örnek: `(customer)/[locale]/login/`.
  - **Sözleşme katmanı (işin özü):** sayfalar servisi doğrudan çağırmaz, aradaki tek dizin çağırır → `apps/web/lib/storefront/` (`catalog.ts` gibi okuma fonksiyonları + `fixtures.ts`). **İmzalar ve dönüş tipleri gerçek** (`packages/types` şemalarından türer), içi bugün fixture döner. Kaynak geldiğinde yalnız bu dosyaların içi bağlanır.
  - **Katmanı yaşatan iki kural:**
    1. **Fixture Zod'dan `parse` edilir**, elle yazılmış nesne değil → alan adı uydurmak imkânsızlaşır, şema değişince fixture derlemede patlar (sessiz sapma olmaz).
    2. **Her stub etiketli:** `// STUB(08.k → NN.k)` — "ne kadar sahte kaldı" tek `grep` ile sayılabilir. Etiketsiz mock kalıcılaşır; `knip` bunu yakalayamaz (ölü değil, sahte).
  - **Gerçek yapılacaklar (stub'lanmaz):** cihaz forku, üç dil `messages.json`, `routing.ts` pathnames kaydı, tasarımın birebir uygulanması. Görsel karar `.dc.html`'de verili — improvise edilmez, implementten önce güncel tasarım **claude_design MCP'den** çekilir (yerel kopya bayat olabilir; `CLAUDE.md §3`).
  - **Zemin sanılandan hazır:** katalog okumasının bir kısmı bugün gerçek çalışabilir — `ProductService.listSellable`, kategori/koleksiyon servisleri, `publicImageUrl` (05.11) var. Stub gereken yerler: fiyat çözümü (05.4) ve sepet/checkout (07). Var olanı stub'lama; sözleşmenin arkasına gerçek servisi koy.
  - **Paralel çalışma (bu görev üçüncü ajana uygundur):** `touches` kümesi `packages/**` içermez → şu an koşan işlerin sıcak noktalarıyla (`schemas/index.ts`, `database/src/index.ts`, `base.service.ts`, `pnpm-lock.yaml`) kesişmez. **Şart:** bu görevi üstlenen ajan `packages/`'a dokunmaz; eksik bir şey bulursa oraya yazmaz, `lib/storefront`'ta stub'lar ve buraya not düşer (`WORKFLOW §7`).
  - **Başlangıç kapsamı:** 08.3 katalog grubu (anasayfa → katalog → ürün detay) — tasarımı en olgun, arka ucu en hazır, müşteriye gösterilebilir ilk somut yüzey. Diğer gruplar aynı sözleşme üzerine sırayla gelir; **toplu üretim yapılmaz** (Netleşecekler: tasarım onay ritmi).
  - **Durum (27.07 — sözleşme + anasayfa):** `lib/storefront` kuruldu: `storefront-types` (vitrin görünüm tipleri; çok dilli alanlar BURADA çözülür, sayfa dil yedek zincirini bilmez) · `fixtures` (şemadan `parse`) · `format` (para; `Intl`, EUR her dilde) · `home.ts` (tek okuma kapısı). Anasayfa tam desenle kodlandı: `page → home-client (useDevice) → home.desktop/home.mobile` + üç dilli `messages.json` + `home-types`. Vitrin kartı ailesi (kategori · ürün · fırsat · paket) sayfa klasöründe değil `components/customer/ui/storefront-cards.tsx`'te — katalog ve ürün detay da tüketecek. `SiteFrame` iki opsiyonel prop aldı (çok maddeli duyuru şeridi, arama girişi); hata sayfaları etkilenmedi.
    **Kaynak durumu:** kategoriler + vitrin ürünleri GERÇEK (`CategoryService`, `ProductService`, R2 görselleri); fiyat/ölçü `STUB(→05.4·05.10)`, fırsatlar `STUB(→05.6)`, paketler `STUB(→05.5)`. Katalog boşken (seed atılmamış) fixture'a düşülür — gerçek katalog dolunca yedek kendiliğinden devre dışı kalır. `packages/**`'a dokunulmadı (paralel çalışma şartı korundu).
    **Tasarım ↔ içerik envanteri çelişkisi (karar bekliyor):** `musteri-anasayfa.md` içerik listesinde **Koleksiyonlar** bölümü var, `Musteri - Anasayfa.dc.html` tasarımında YOK. İmprovize edilmedi — tasarım birebir uygulandı, koleksiyon bölümü kodlanmadı. Ya tasarıma koleksiyon bandı eklenir ya envanterden düşülür; karar kullanıcıda.
    **Yapılmayan (bilinçli):** footer'ın üç sütunlu tasarımı (K16) ve sepet rozeti sayısı. Footer sütunları `SiteFrame`'in TÜM çağıranlarının metin dosyalarını değiştirmeyi gerektiriyor → 08.2'nin işi. Sepet sayısı 07'ye bağlı; sahte sayı basmak yerine rozet hiç gösterilmiyor (boş sepette zaten görünmemeli). Kart bağlantıları henüz `/`'a gidiyor — hedef rotalar 08.3'te açılınca `routing.ts` pathnames ile bağlanır.
    **Düzeltme (27.07, kullanıcı geri bildirimi):** (1) sayfa geniş ekranda **yayılıyordu** — tasarımın masaüstü ekranı 1360 px'tir ve bu bir viewport temsili değil, düzenin kendisidir. `SiteFrame`'e tek `SHELL` sabiti kondu: zeminler (duyuru şeridi, footer) tam genişlikte kalır, yalnız içerik 1360'ta ortalanır. (2) Başlıkta marka **metni** vardı, tasarımda **logo** var (`public/logo.jpg`, masaüstü 58 px · mobil 40 px, `mix-blend-multiply` — jpg şeffaf değil, krem zemine bu şekilde oturur). Footer'da metin kalır; tasarım orada da metin gösteriyor.
    **Katalog sayfası (27.07, ikinci teslimat):** `/catalog` rotası açıldı (`routing.ts` pathnames: fr `/catalogue` · de `/katalog` · tr `/katalog`). Okuma `lib/storefront/catalog.ts`; indirgeme `map.ts`'e çıkarıldı — anasayfa ve katalog AYNI dönüşümü kullanır, ayrı yazılsa iki sayfa aynı ürünü farklı gösterebilirdi. **Gerçek olanlar:** kategori süzgeci, ad araması (üç dilde birden, SQL'de), keyset sayfalama, sonuç sayısı, aday ürünün katalogdan dışlanması (`status: 'active'`). **Stub:** fiyat sıralaması (→05.4), "yalnız indirimliler" (→05.6), tükendi/varyant durumu (→06, →05.5).
    **Süzgeç durumu URL'de, client state'te değil** — filtreli liste paylaşılabilir, geri tuşu çalışır, ilk boya sunucudan tam gelir. `hrefFor` bir süzgeci değiştirip diğerlerini korur (çipe basmak sıralamayı sıfırlamaz).
    **Yeni komponentler:** K17 `FilterChip` · K18 `SortSelect` · K20 `EmptyState` (`filter-controls.tsx`, üçü de link tabanlı). K7 `ProductCard` tasarımın "Etkileşim sözleşmesi" bölümüne göre dört duruma çıktı: normal · çok varyantlı ("Seçenekler →", varyant seçimi ATLANAMAZ) · fırsat (rozet + üstü çizili fiyat) · tükendi (aksiyon pasif, görsel soluk, kart yine detaya tıklanır). Tükendi fırsat rozetini ezer — satın alınamayan üründe indirim vurgusu yanıltır.
    **Ölçeğe eklenen kademe:** `text-page-title` (web 38 · mobil 26) — liste sayfalarının başlığı; envanter §0.4'te yoktu, Katalog tasarımından geldi. Kural gereği ham yazılmadı, kademe olarak eklendi.
    **Boş durum kuralı:** sıfır-sonuçta arama sorgusunun talep sinyali olarak kaydedildiğinden müşteriye SÖZ EDİLMEZ, "talebini ilet" formu açılmaz (`musteri-katalog.md §6`) — ekran sade kalır. Sinyal kaydı 13-analitik'e ait, henüz yok.
    **Doğrulama:** `lint` temiz; `typecheck` ve `knip`teki iki bulgu bu görevin dosyalarında DEĞİL (`product-photos.tsx` eksik ikon importu, `order.schema.ts` henüz tüketilmemiş) — paralel yürüyen işlere ait. Görsel doğrulama kullanıcıda (dev server onun yönetiminde).

## Netleşecekler

- **Tasarım onay ritmi:** hangi sayfa hangi sırada tasarlanıp onaylanacak (design/README: müşteri evreni ürün detayla başlar) — kodlama bu ritme uyar, toplu üretim yapılmaz.

---

**Modül durumu (27.07.2026):** yalnız §0 token katmanı kuruldu.
- **Var:** `globals.css` müşteri bloğu envanterin §0'ıyla birebir — kum skalası (9 kademe), semantik aileler (zeytin · terracotta · bal · nötr) dört katmanıyla, etkileşim durumları, odak halkası. Kullanımdaki komponentler (buton K1-K3, site çerçevesi K11/K12/K16, durum ekranı K20/K27, form kiti) token'a taşındı; **müşteri yüzeyinde ham hex kalmadı** (yalnız Google/WhatsApp marka renkleri ve `global-error.tsx` — o kök layout yerine geçtiği için globals'a güvenemez).
- **Kararlar (kullanıcı onaylı):** tek mürekkep — `#3a4147`/`#3a3f35` ve diğer dört koyu ton `ink`'e indi, ayrı `slate` token'ı yok. Terracotta ailesi hem fırsat hem hata taşımaya devam eder (ayrı kırmızı aile açılmadı).
- **Yok:** K4-K10, K13-K19, K21-K26 — sayfaları kodlanınca. Karanlık mod müşteri yüzeyinde **planlanmıyor** (envanter §0.5: vitrin gündüz krem zemin üstünde kurulu).
