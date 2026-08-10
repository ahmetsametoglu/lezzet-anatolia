# 21 — Mobil Uygulama

## Kapsam

Native mobil uygulama (Expo/React Native) + onun arka ucu (`apps/mobile-api`, Hono). Yüzey
formülü ve sahiplik: `docs/uygulama/README.md` (kullanıcı kararları 05–06.08). Teknoloji kararı
ve gerekçesi: `docs/uygulama/01-teknoloji-secimi.md`. Mimari, ajan sınırları ve **bağlayıcı
duplikasyon tüzüğü**: `docs/uygulama/02-mimari-ve-sinirlar.md`.

**Ne DEĞİL:** web müşteri/operasyon yüzeyleri (08, 09), backend cron işleri (apps/backend —
backend şeridi). Bu modül `apps/mobile` + `apps/mobile-api` + mobil şeridin sahiplendiği yeni
paketlerden (`design-tokens`) ibarettir.

## Okunacaklar

- `docs/uygulama/02-mimari-ve-sinirlar.md` — sınırlar ve duplikasyon tüzüğü (her iş öncesi)
- `docs/uygulama/01-teknoloji-secimi.md` §6, §10, §11 — kurulum kararları (Expo, CNG, dev
  client, Unistyles, jest-expo/Maestro; Expo Go test planına girmez)
- `CLAUDE.md §4b` — paylaşılan DB test disiplini (mobile-api entegrasyon testleri de tabidir)

## Bağımlılık

`01-types`, `03-domain-core`, `02-database` (paylaşılan çekirdek — mobil bunları AYNEN
kullanır); `04-auth-kimlik` (OTP akışının sunucu servisleri). Tasarım hattı: Claude Design
(mobil ekranlar sıfırdan kurgulanır, web tasarımı taşınmaz).

## Görevler

- [x] (21.1) **`apps/mobile-api` iskeleti:** Hono servisi — `apps/backend` desenleri ayna
  (env, logger, request-log yaklaşımı), `/health`, Bearer auth middleware (Supabase JWT),
  `GET /api/v1/me` (account profili, mevcut database servisiyle), `{data,error}` zarfı;
  vitest entegrasyon kökü olarak kayıt. `touches: apps/mobile-api, vitest.config.ts`
  - **Durum (06.08):** teslim + yönetici denetimi geçti: typecheck/eslint temiz, 3/3
    entegrasyon testi (~850 ms, `app.request()` — port yok), knip sıfır bulgu. `boundaries`
    kapsamına `apps/mobile-api` eklendi (kök package.json) ve yakaladığı tip-import döngüsü
    (auth→app→router→auth) `src/context.ts` çıkarımıyla giderildi. Kararlar: port 3002
    (`MOBILE_API_PORT` ile ezilebilir); Bearer doğrulaması anon istemciyle (en az yetki,
    yerel fabrika), veri okuması `serviceDb` + `UserProfileService`; `/me` cevabı
    `UserProfileSchema.pick` + çalışma zamanı `parse` süzgeci (operasyon-içi alanlar sızamaz);
    hata metinleri anahtar (`unauthorized` vb.), metin istemci i18n'inde yaşar. Terfi
    talepleri arka-uc'a açıldı (anon fabrika · SOURCES mobil kaynakları — `docs/talep/`);
    `MeSchema`'nın `packages/types`'a terfisi ilk Expo tüketimiyle (21.4) yapılacak.
- [x] (21.2) **`apps/mobile` Expo iskeleti:** SDK 57 + TS + expo-router + expo-dev-client +
  Unistyles 3 (tema stub'ı — gerçek token seti 21.3'te) + jest-expo/RNTL v14 hattı çalışır
  durumda (paket paylaşımını kanıtlayan test dahil); CNG (`ios/`/`android` git dışı); ekran
  YOK (tasarım hattı ayrı). `touches: apps/mobile`
  - **Durum (06.08):** teslim + yönetici denetimi geçti: typecheck/eslint/prettier temiz,
    2 suite / 3 test PASS (~0,8 sn — jest-expo + RNTL v14 async API; `@lezzet/types` paylaşım
    kanıtı `LocalizedTextSchema` parse testiyle), expo-doctor 20/20, `expo export` iOS bundle
    1262 modül (Metro pnpm çözümlemesi elle config'siz), src'de ham hex SIFIR. Sürümler: Expo
    57.0.11 · RN 0.86.2 · React 19.2.3 · Unistyles 3.3.0 · jest-expo 57.0.3 · RNTL 14.0.1.
    Kararlar: OTA kapalı (`updates.enabled:false` — EAS Update kararı ileriye); reanimated
    şimdilik YOK (unistyles'ta opsiyonel peer çıktı, ekran işleriyle eklenecek); şablonun
    TS 6.0.3'ü paket-içi tutuldu (repo 5.7.2 — çakışmıyor, hizalama ayrı karar);
    `app.json`'daki nötr `#FFFFFF` splash/ikon zemini 21.3'te token'dan güncellenecek
    (README'de beyanlı — app.json statik JSON, token import edemez; 21.3'te `app.config.ts`
    değerlendirilir). RN bağımlılık beyanları STACK §2 tablosuna eklendi (üç mobil satır).
- [~] (21.3) **`design-tokens` paketi:** tek kaynak TS token modülü; web `@theme` CSS'i
  bu modülden türetilir (web şeridiyle koordineli — talep), RN Unistyles teması doğrudan
  import eder. `touches: packages/design-tokens, apps/web/app/globals.css`
  - **Durum (07.08):** paket kuruldu + mobil tema bağlandı; `[x]` olmamasının tek eksiği web
    türetimi (talep açıldı, müşteri şeridinde — o güne dek İKİ YÖNLÜ parite testi köprüyü
    tutuyor: `packages/design-tokens/src/parity.test.ts`, birim projesinde, globals.css ↔
    modül 218 token değer-değer + 5 font istisnası; mutasyon kontrolü yapıldı — bozulan tek
    hex testi kızartıyor). Sayım: 223 custom property (158 `@theme` + 60 karanlık).
    `renderThemeCss()` üretici hazır. `apps/mobile` teması `customerColors/Text/Radius`'tan,
    ham değer SIFIR; müşteri vitrini tek temalı (karanlık yalnız operasyon evreni — envanter
    kuralı, operasyon teması ileriki operasyon işinde). Mobil doğrulama: 3 suite / 5 test,
    expo-doctor 20/20, iOS bundle 1266 modül (paket Metro grafiğinde). globals.css'te
    parser'ın bulduğu iki içerik gözlemi (çift "§0.4" başlığı; iki karanlık-eşdeğerlik yorum
    kayması) web şeridine talep dosyasında raporlandı.
  - **Durum (07.08 — tasarım mutabakatı işlendi):** `Mobil - Token Kararlari.md`'nin 13 kararı
    pakete girdi: 30 yeni token (sand-150/250 · error · scrim · shadow · gradient · brand
    ailesi · 5 tipografi kademesi · radius badge/control) + 7 değer değişikliği (sand-300,
    olive-line, star, closed-bg, disabled-fill, radius card 18→20 / pill 26→22). Parite testi
    BEYANLI sapma mekanizması kazandı: `TRANSITION` (CSS eski / modül yeni — ikisi ayrı ayrı
    kilitli) + `MOBILE_ONLY`; listeler kendi kendini denetler (web çekince satır testi kırar
    ve silinmeyi zorlar — negatif kontrol koşuldu). `sand-250` adı KULLANICI ONAYLI (07.08;
    karar dosyası "sand-100" demişti, ad doluydu). **Üretim yönü kararı revize:** web'in
    itirazı haklı (renderThemeCss yorum-kayıplı) — TS→CSS üretimi rafa, kalıcı mekanizma iki
    yönlü parite kilidi; web senkronu `docs/talep/musteri-token-senkronu.md`. Doğrulama
    (yönetici tekrarı): design-tokens 9/9 · apps/mobile 22/22 · typecheck/eslint temiz.
    Kalan: web'in 7+30'u çekmesi (talepte) · `brand-whatsapp-pure` adı tasarımdan ·
    shadow/gradient'in mobil temaya bağlanması (komponent kiti işiyle — Expo ajanı).
  - **Durum (07.08 — KÜÇÜK AYAK İZİ düzeltmesi, kullanıcı kararı):** "7 değer değişikliği +
    web görsel turu" yaklaşımı İPTAL — mobil kararı web'e tur yaptırmaz, ortaklık da
    zorlanmaz (tüzük §3.6'ya yazıldı). Paylaşılan token'lar web değerlerinde DEĞİŞMEDEN
    kaldı; mobilin farklı değerleri `-app` sonekli 7 YENİ token oldu (sand-300/olive-line/
    star/closed-bg/disabled-fill + radius card/pill). `TRANSITION` mekanizması tamamen
    kaldırıldı — modül ile CSS ortak kümede yine DEĞER-BİREBİR; tek beyanlı liste
    `MOBILE_ONLY` (37 additive token, web'e sıfır görsel etki). Senkron talebi buna göre
    yeniden yazıldı. Doğrulama: design-tokens 8/8 · apps/mobile 22/22 · typecheck/eslint
    temiz · globals.css'e dokunulmadı (oradaki diff web şeridinin kendi yorum işi).
  - **Durum (07.08 — YAPISAL AYRIM, kullanıcı fikri):** sonek yaklaşımı da İPTAL — mobil
    token'ları kendi dosyasına taşındı: `customer-app.ts` (37 token: 7 fark, soneksiz doğal
    adlarla + 30 yeni aile). Tema "ortak taban + uygulama farkları" KOMPOZİSYONU (aynı adda
    uygulama kazanır — `customer-app.test.ts` 7 testle kilitli). `customer.ts` yalnız
    globals.css ikizine döndü (158 token); parite İSTİSNASIZ iki yönlü (`MOBILE_ONLY` listesi
    de silindi — ayrım listeyle değil dosyayla). **Web senkron talebi GERİ ÇEKİLDİ** — web'e
    hiçbir iş kalmadı (not düşüldü). Tüzük §3.6 dosya-deseniyle güncellendi. Doğrulama
    (yönetici tekrarı): design-tokens 15/15 · apps/mobile 22/22 · birim seti 1041/1041 ·
    typecheck/eslint temiz. Kalan: kompozisyonun mobil temaya bağlanması (komponent kiti,
    Expo ajanı) · `brand-whatsapp-pure` adı tasarımdan.
- [x] (21.4) **Auth akışı:** OTP uçları (`/api/v1/auth/*`) — web'le aynı sunucu servisleri
  (`email-verification`, `notify`); cihazda supabase-js oturumu + SecureStore; oturum
  yenileme. **Karar (07.08, kullanıcı + yönetici):** verify orkestrasyonu `packages/application`'a
  (uygulama katmanının ilk vatandaşı) — web `otp-actions.ts` geçiş köprüsü olarak kalır,
  benimseme talebi açılacak; cihazdan doğrudan supabase-js OTP yolu ELENDİ (web akışı özel
  tablo+RPC, Supabase auth OTP'si değil — keşif 07.08).
  `touches: apps/mobile-api, apps/mobile, packages/application (yeni), packages/types (yalnız ekleme), vitest.config.ts`
  - **Durum (07.08 — API ayağı tamam, `[~]`):** `packages/application` kuruldu (uygulama
    katmanının ilk vatandaşı): `requestOtpCode`/`verifyOtpCode` taşıma-nötr (Next/Hono importu
    SIFIR — elle doğrulandı); `devOtpCode` ve dil tohumunun KAYNAĞI artık paket (web kopyaları
    geçiş köprüsü, benimseme talebi `docs/talep/musteri-application-otp-benimseme.md`).
    `token_hash` tüketimi bilinçli olarak taşıma katmanında: web çerez yazacak, mobil kısa
    ömürlü anon istemciyle (`ephemeralAnonClient` — süreç istemcisini kirletmeme kuralı)
    session zarflıyor. Uçlar: `/api/v1/auth/otp/{request,verify}` — 429'da `Retry-After`,
    yanıt `AuthSessionSchema.parse` son kapısından. Types ekleri: `OtpCodeSchema` ·
    `AuthSessionSchema` · `AuthErrorKeyEnum` (yalnız ekleme; index'e tek satır). Doğrulama
    (yönetici tekrarı): 3 dosya / 14 test (altın yol: request → verify → dönen token'la
    `/me` 200; dil tohumu kanıtı; tek kullanım; cooldown 429), 3 paket typecheck, eslint,
    boundaries 2×temiz, knip sıfır. Purge kapsamı yeterli çıktı (verificationEmails +
    authUserIds + profileIds — ekleme gerekmedi).
  - **Durum (07.08 — cihaz ayağı da tamam, satır `[x]`):** `apps/mobile/src/lib/` tesisatı:
    `api/client.ts` (zarf açma + çağıranın Zod şemasıyla parse — tek kapı), `auth/`
    (SecureStore TEK anahtarda oturum; supabase-js custom storage + autoRefresh;
    `authorized-fetch` 401'de BİR tazeleme + BİR tekrar, düşerse ilk 401 döner — yönlendirme
    kabuk kararı; `sign-out` depo her durumda temiz). Biçimsiz kod cihazda `OtpCodeSchema` ile
    elenir (deneme sayacı boşa yanmaz); istek atılamadıysa `status: null` (ölçülemeyen ≠ 0).
    Doğrulama (yönetici tekrarı): 8 suite / 22 test ~1,1 sn, typecheck/eslint temiz,
    expo-doctor 20/20, ham değer/console SIFIR. Giriş EKRANI bu satırın kapsamında değil —
    tasarım geldiğinde müşteri ekran dilimleriyle açılacak (`/me` şemasının types'a terfisi de
    o gün — mobile-api `contract.ts` notu).

- [x] (21.5) **Komponent kiti (müşteri):** tema kompozisyonu bağlanır (taban + `customerApp*`,
  gölge/gradyan dahil) + çekirdek set (~12 komponent, `03-tasarim-envanteri §2` adaylarından:
  Tag · Primary/Secondary/TextAction · AppBar+BackButton · SectionHeader · Chip · TextField ·
  ProductCircleCard · AvatarThumb · EmptyState · Loading/Skeleton · Note) — tamamı token'lı
  (ham değer sıfır), RNTL testli, a11y sözleşmeli (rol/etiket/44pt); basılı durum karar #8
  kuralıyla. EKRAN YOK. `touches: apps/mobile`
  - **Durum (07.08):** teslim + yönetici denetimi geçti: 16 komponent + 2 paylaşılan çekirdek
    (`pressable-surface` — karar #8'in TEK kaynağı, öteki komponentler yalnız `feedback`
    varyant adı geçirir [elle doğrulandı]; `circle-photo` — foto/baş-harf fallback,
    `image-slot`un RN karşılığı). 26 suite / 113 test (~3 sn), typecheck/eslint temiz,
    expo-doctor 20/20, export dumanı kit-render'lı koşturulup GERİ ALINDI (ağaç temiz).
    Ham renk/px/em taraması SIFIR. Tema kompozisyonu kanıt-testli (fark token'larında uygulama
    kazanıyor; `eyebrow` üç alt-anahtarıyla birlikte). **Gölge çözümü:** RN 0.76+ çapraz
    platform `boxShadow` — `3px 3px 0` imzası iki platformda birebir; `elevation` bilinçli
    reddedildi (bulanıklaştırır, ofset/renk almaz). **Gradyan:** expo-linear-gradient (STACK'e
    beyan edildi) + tek çevirici (`theme/gradient.ts`, CSS dizge → colors/locations, tip
    LinearGradientProps'tan türer). Token/tasarım açıkları (10 kalem: alfalı çubuk örtüsü,
    rozet gölgesi/kademesi, on-olive, 21px başlık, TAKİP çipi ikilisi, metrics terfisi, font
    varlıkları, daire-mi-köşeli-mi kart tutarsızlığı...) `design/BACKLOG §6`ya envanterlendi —
    Claude Design kararı bekliyor; kit en yakın token'la kuruldu, hiçbir değer uydurulmadı.
  - **Durum (07.08 — kare katalog kartı düzeltmesi, kullanıcı kararı):** katalog kartı KARE
    (`ProductPhotoCard`, şablon satır 218-233 birebir: aspect-ratio 1 + r20 + alt gradyan +
    foto-üstü ad + taşan fiyat çipi); daire kart yalnız vitrin (146) + benzerler (96) —
    katalog boyutu (138) emekli. A11y incelik: "tükendi" RN durum sözlüğünde yok, `disabled`
    yalan olurdu (kart açılıyor) — durum erişilebilir ADA eklendi, testli. 8 ek token açığı
    en-yakınla kuruldu ve `design/BACKLOG §6`ya işlendi (en önemlisi: foto-üstü ad renginde
    ROL↔DEĞER ayrışması — `cream` değeri birebir, `on-image` rolü sapıyor). Tasarım tarafında
    kalan tek bayatlık: katalog İSKELETİ hâlâ 138 daire (satır 202-205). Doğrulama (yönetici
    tekrarı): 27 suite / 122 test · typecheck/eslint temiz · yeni kartta ham hex yalnız
    yorumlarda (karar belgeleri).
- [~] (21.6) **Katalog okuma uçları:** `GET /api/v1/categories` (tek tur) + `GET /api/v1/products`
  (keyset imleç + arama/kategori/sıralama) + `GET /api/v1/products/:slug` (çeşit/aile/benzer) —
  oturumsuz gezilebilir (public), depo süzgeci ve fiyat kuralı WEB İLE AYNI çekirdekten;
  web lib'inde kalan orkestrasyon varsa YENİDEN YAZILMAZ, terfi raporlanır (tüzük §3.1).
  `touches: apps/mobile-api`
  - **Durum (07.08 — uçlar teslim, `[~]`):** üç uç public (mount `bearerAuth`tan önce,
    gerekçeli yorumla), şemalar types'tan `.pick/.extend`, keyset imleç OPAK dize (`nextCursor`
    üretili — CLAUDE §1), `locale` zorunlu (dilsiz çağrı sessiz Türkçe'ye düşerdi). Depo
    bağlamı web'in posta-kodsuz ziyaretçisiyle BİREBİR (`warehouseId: null` = `product_listing`
    görünümünün liste-fiyatı satırı — depo süzgeçsiz okuma DEĞİL, bilinçli "yer bilinmiyor"
    boyutu; damgalı çift-depo testi her ürünün tek göründüğünü kanıtlıyor). Doğrulama (yönetici
    tekrarı): 24/24 entegrasyon · eslint/boundaries temiz · typecheck 16/16 (apps/mobile hariç —
    21.5 uçuşta). **Neden `[x]` değil:** sözleşmede fiyat/stok/teklif/aile/benzer BİLEREK YOK —
    o ticari bağlam webin `lib/storefront` orkestrasyonunda; kopyalanmadı (tüzük §3.1), terfi
    programı çıkarıldı: **(A)** storefront orkestrasyonu → `packages/application` (OTP emsali;
    sonrasında web benimseme talebi) · **(B)** yer çözümü gövdesi → application (adaptör webde
    kalır) · **(C)** `pricingViewerOf` zaten taşıma-nötr, olduğu gibi terfi edebilir (Bearer'lı
    B2B fiyatın yolu) · **(D)** `pickSimilar` → domain-core · **(E)** `product_listing` satır
    şeması (types+database — KÜÇÜK; talep açıldı: `arka-uc-product-listing-satir-semasi.md`;
    tek başına ziyaretçi fiyatını açar) · **(F)** `CatalogSort`/`StockStatus` sözlükleri →
    types. Yolda bulunan WEB ARIZASI (sayaç, çipli süzgeçleri saymıyor) kanıtla müşteri
    şeridine not düşüldü (`not-musteri-katalog-sayac-suzgeci.md`).
  - **Durum (07.08 — terfi A+C+D+F tamam):** ticari bağlam artık paylaşılan katmanda —
    `packages/application/src/catalog/` (getCatalogData · getProductDetail · loadProductContext ·
    pricingViewerOf · map indirgeme; 28 entegrasyon testi), `pickSimilar` → domain-core (9 birim
    testi), `CatalogSort`/`StockStatus` → types (`CATALOG_SORTS` şemadan türer). Davranış web'le
    BİREBİR (yönetici diff denetimi: fark yalnız istemci enjeksiyonu + fixture'ın
    `fallbackCategories` parametresine çıkması — web benimserken geçirir). **(B) gerekmedi**:
    `PlaceWarehouses` yapısal ikiz olarak taşındı, yer-çözümü gövdesi webde. Web benimseme talebi
    açıldı: `musteri-application-storefront-benimseme.md` (dosya→export eşlemesi içinde). Aynı
    turda İKİ karşılanan talep benimsendi: anon istemci fabrikası (`anonDb`/`createAnonClient` —
    yerel `lib/supabase.ts` silindi) + `SOURCES` mobil kaynakları (yerel `lib/sources.ts`
    silindi); mobile-api'nin yerel `CatalogSortEnum`u da types'a döndü (üç kopyanın sonuncusu).
    Doğrulama (yönetici tekrarı): birim 1052 · katalog entegrasyonu 28/28 · mobile-api 24/24 ·
    typecheck 5 paket · boundaries temiz. ~~Hâlâ `[~]`: uçlar ticari bağlama BAĞLANMADI~~ (aşağıda
    bağlandı).
  - **Durum (07.08 — uçlar ticari bağlama BAĞLANDI):** sözleşme şemaları types'a terfi etti
    (`packages/types/src/contracts/catalog-api.schema.ts`; zarf dahil — `CatalogCategoryListSchema`)
    ve fiyat · stok hâli · tükendi · `purchaseMode` · `variantCount` · aile · benzer alanlarıyla
    genişledi; uçlar artık `getCatalogData`/`getProductDetail` çağıran saf taşıma. İsteğe bağlı
    kimlik: Bearer varsa `findByAuthUserId` → `pricingViewerOf` (web `guard.ts` eşlemesinin aynı),
    yoksa/geçersizse VISITOR — katalog hiçbir hâlde 401 dönmez. Yer bağlamı web'in posta-kodsuz
    ziyaretçisiyle birebir (`read-place.ts` `EMPTY` ölçümü). Application'a iki onaylı additive
    ekleme: `CatalogInput.limit?` + `StorefrontProduct.variantCount`; `PurchaseMode` types'tan
    (ikiz kapandı). **Hâlâ `[~]` — kalan tek iş (B):** yer çözümü terfisi; o gelene dek teklif
    tutarı mobilde okunmuyor (bilinçli: indirimi gösterip ödemede yükseltmek verilmiş sözü bozar;
    `BEKLEYEN(21.6)` `catalog.ts`te). Doğrulama (yönetici tekrarı): entegrasyon 34+28 · birim
    1068 · typecheck/boundaries/docs:check temiz.

- [~] (21.7) **Katalog ekranı — ilk gerçek ekran:** v3 tasarımından birebir; kategori çipleri +
  2 sütun kare kart ızgarası (`ProductPhotoCard`) + keyset sonsuz kaydırma + iskelet/boş/hata
  durumları; ekran başına messages (fr/de/tr, cihaz dili eşlemesi); fiyat cihazda biçimlenir.
  Ticari bağlamın uca bağlanmasıyla (21.6 kapanışı) aynı turda, iki ajan paralel.
  `touches: apps/mobile`
  - **Durum (07.08 — ekran teslim, `[~]`):** sekme kabuğu (4 sekme; katalog dışı
    `screen-placeholder`) + katalog ekranı: çipler · 2 sütun `ProductPhotoCard` ızgarası ·
    keyset sonsuz kaydırma (eskimiş-cevap düşürme testli) · pull-to-refresh · KARE iskelet
    (tasarım da kareye çekildi, Token Kararları 22) · boş/hata+yeniden-dene · kart→detay rota
    stub'ı. i18n: ekran messages'ı (fr/de/tr), cihaz dili `expo-localization` →
    `@lezzet/i18n` `LOCALES`/`DEFAULT_LOCALE`. `formatPrice` `@lezzet/helper`a TERFİ
    (02-mimari §3.4; web kopyası köprü — benimseme talebine eklendi); `/categories` zarf şeması
    types'ta. Onaylı metin sapmaları: rozet webin sözlüğüyle "Fırsat" (tek kavram tek kelime);
    hata metninden "Sepetiniz güvende" çıktı (sepet yok, tutulamayacak söz verilmez).
    Doğrulama (yönetici tekrarı): mobil 31 suite/156 test · birim 1068 · entegrasyon 34+28 ·
    typecheck/eslint/boundaries/knip/docs:check temiz; ham hex sıfır (tek eşleşme karar yorumu).
    ~~Kalan: ikon sistemi · app.config.ts geçişi~~ (aşağıda kapandı).
  - **Durum (08.08 — Token Kararları 14–24 UYGULANDI + ikon/font):** `customer-app.ts` yeni
    aile/duraklar: badge yazı+gölge (16) · `cream-glass`/`cream-glass-soft` + blur kuralı (17,
    `expo-blur`; AppBar+sekme çubuğu cam zemine geçti) · `scrim-72` (18) · `accent-leaf`+`ink-deep`
    (19, varyant ekranıyla) · `on-image-soft` app-override `#d5d0c2` (15 — `customer.ts`e
    dokunulmadı, parite istisnasız) · kart adı `on-image` (14) · metrics 20 durağı, ızgara 20/14
    (22). Fontlar: Lora 400/600 + Karla 400/600/700 (`@expo-google-fonts/*`; seam ağırlıkla
    indekslenir — RN'de ağırlık aile adındadır). İkon sistemi: `react-native-svg` + v3 yol sözlüğü
    (`icon-paths.ts`) + `Icon`; sekme ikonları, katalog ARAMA kutusu + SÜZGEÇ (yeni `BottomSheet`,
    sıralama `CATALOG_SORTS`tan) ekranda. `app.json` → `app.config.ts` (`supportedLocales` =
    `LOCALES`, ikinci yazım kalktı). Bilinçli sapma: "Sadece indirimliler" anahtarı çizilmedi —
    sözleşmede yok, istemcide süzmek sayfalı listeyi yalan söyletir. Doğrulama (yönetici tekrarı):
    mobil 33 suite/187 test · design-tokens 19 (parite istisnasız) · typecheck/eslint/boundaries
    temiz; ham hex yalnız `app.config.ts` splash (`BEKLEYEN(21.3)`). ~~Üç yerel modül eklendi →
    dev-client yeniden derlenmeli~~ (08.08: iOS dev-client yeniden derlendi ve simülatöre kuruldu —
    `Build Succeeded`, `com.lezzetanatolia.app`; paket kimlikleri `app.config.ts`'e eklendi çünkü
    prebuild dinamik config'e otomatik yazamıyor, değer parametrik ve mağaza öncesi kesinleşecek.
    Android dev-client derlemesi Android işleriyle aynı sıraya bırakıldı).
  - **Durum (08.08 — kabuk smoke testi + `ui:shot:mobile`):** `src/app-shell.test.tsx` — rota
    dosyaları GERÇEK (`renderRouter('./src/app')`): dört sekme + dokunuşla rota değişimi + seçili
    sekmenin rotayı oynatmaması (3 test; RNTL v14'ün async `render`ı ile `renderRouter`ın senkron
    sarması uyuşmuyor — sarmalayıcı ve gerekçesi dosyada, matcher tipi elle çünkü paketin
    `expect.d.ts`i boş basılmış). `pnpm ui:shot:mobile [<yol> …]` kuruldu (`scripts/ui-shot-mobile.mjs`):
    açık simülatör + kurulu uygulama + (yol verildiyse) Metro ölçülür, derin bağlantı
    `lezzetanatolia://<yol>` ile gidilir, çıktı `.ui-shots-mobile/<slug>/native-app.png` (07.08
    kararındaki ayrı klasör); argümansız kip Metro'suz da çeker — ekranda ne varsa o. Doğrulandı:
    iki kip de gerçek simülatörde koşuldu (görüntü üretimi + Metro-kapalı reddi). **Kalan (bu görev
    `[~]`):** Android cam bulanıklığı (`BlurTargetView` bağı) · `BottomSheet` çift-eğri animasyonu
    (Reanimated'la).
- [x] (21.8) **Operasyon yüzeyi ön hazırlık — rol × senaryo etüdü + tasarım brief seti:**
  `docs/uygulama/04-operasyon-rolleri-ve-senaryolar.md` (kullanıcı kararları: tek kabuk + rol
  bölümleri; telefon, barkod v2; tedarik kapsamda; TEK SÜRÜM) + Claude Design yükleme dosyaları
  `design/pages/app-{operasyon-zemin,kurye,depo,yonetim,para}.md`.
  - **Durum (07.08):** 21 senaryo kartı (K1-K7 · D1-D6 · Y1-Y6 · M1-M2) denetim yorumları +
    arka uç ajanının kart-başına veri envanteri ölçümüyle DOĞRULANDI; beş brief veri-gerçekli
    (enum kümeleri/etiket sözlükleri birebir, YOKLAR bölümlü). Ölçümün çıkardığı iş listesi doc
    04 omurgasında (operasyon uçları mobile-api'de yok · push altyapısı yok · K5 not/foto
    kalıcılığı · D6 guard). Denetime iki bulgu bildirildi (defter): Y4 "eşik yok" tespiti
    yanlıştı (alan+motor var; kanıtla düzeltildi) + `markUndelivered` `note` kaybı arızası.
  - **Durum (08.08 — KAPANDI):** v1 değerlendirmesi 10 işlevsel istekle iletildi; iterasyon
    `design/project/Operasyon Mobil v2.dc.html` olarak döndü ve ONU da karşılıyor (madde madde
    doğrulandı: gün başlatma kapısı, iki adımlı sonuç akışı, üç hâlli kalem + iade adedi, imza
    paneli, doğrudan sayı girişi + "tamamı ✓", satır başına SKT/hasar, boş-hata durumları,
    Y3 satır kontrolü + Y1 YZ aksiyonları, sıradaki-durak geçişi + kapanış onayı/notu, bildirim
    rol süzmesi). Üç küçük açık tasarıma DEĞİL implementasyona not edildi: sonuç notuna serbest
    metin seçeneği, Para kökünün hata/boş durumu, D2 hasar not+foto alt akışı (21.11/21.12
    kapsamında çözülür). Ekran programı 21.9–21.13 olarak açıldı.
- [x] (21.9) **Operasyon token seti + kabuk:** v2 tasarımının paleti ölçüldü — çekirdek MÜŞTERİ
  evreninden (ink/olive/terracotta/muted/error birebir aynı hex), durakları kendine ait (zemin
  `#f2f0e8`, kart `#fbfaf4`, yeşil/kırmızı/turuncu vurgu zeminleri, kesikli ayraç, depo kahvesi);
  web-operasyonun "Veri Masası" evreni (`operations.ts`) DEĞİL. İş: `design-tokens`e
  `operationsApp*` seti (müşteri çekirdeği + v2 durakları; `customer*`/`operations*` değerlerine
  DOKUNULMAZ — küçük ayak izi; parite testi genişler) · `MeSchema`nın `packages/types`a terfisi
  (contract.ts'teki vaat: ilk tüketen kabuk, cevabı AYNI şemayla parse eder) · Expo'da
  `(operations)` rota grubu: `/me.roles`tan rol tespiti, rol bölümü sekmeleri (tek rol → tek
  sekme, çubuk gizlenir), bildirim ekranı iskeleti + rol süzme kuralı, oturumsuz/müşteri →
  operasyona giremez.
  `touches: packages/design-tokens, packages/types (yalnız ekleme), apps/mobile-api (contract), apps/mobile`
  - **Durum (08.08 — sözleşme parçası tamam):** `MeSchema` → `packages/types/src/contracts/me-api.schema.ts`
    (katalog emsalindeki `-api.schema` deseni; pick kümesi birebir korundu, makineyle karşılaştırıldı);
    mobile-api `contract.ts` boşaldığı için SİLİNDİ, yaşayan gerekçeler taşındı. `Me` tipi bilerek
    ihraç edilmedi — gerekçe dosyada ve DÜZELTİLDİ: knip `packages/types`ta ölü ihracı GÖREMİYOR
    (barrel + `includeEntryExports:false`; ölçüldü — bilerek bırakılan ölü ihraç yakalanmadı), yani
    disiplin elle korunuyor. Doğrulama: auth-otp 6 + catalog 25 test, typecheck 17/17, lint/boundaries
    temiz. Kalan: token seti (koşuyor) + Expo kabuğu.
  - **Durum (08.08 — token seti tamam):** `operations-app.ts` + sözleşme testi (10) yazıldı.
    Ölçümün ana bulgusu: operasyon mobil, müşteri UYGULAMASININ üstüne kurulu bir alt evren —
    27 hex'in 15'i birleşimde zaten var (dördü yalnız `customer-app.ts`te), hiçbiri kopyalanmadı;
    yeni durak eşiği ilan edildi (birleşimdeki durağa kanal başına ≤8 yakın değere yeni ad
    açılmaz). Set: 2 fark (`cream`, `olive-bg`) + 5 yeni renk (`panel`, `neutral-bg`, `ink-inset`,
    `warehouse`, `tab-inactive`) + 2 yazı durağı (`meta` 10.5, `tag` 11 — 800 ağırlığa basamak
    açılmadı, kademe-üstü ağırlık) + `tight` 8px + `hard-on-ink` (kumdan türer) + `sticky-fade`.
    WhatsApp yeşili yazılmadı — `operationsBrand['brand-whatsapp']` zaten o değer. Kompozisyon üç
    katman, birleştirme tüketicinin (Unistyles teması). Doğrulama: paket 30 test + birim 1090 +
    typecheck/lint/knip/boundaries temiz.
  - **Durum (08.08 — kabuk tamam, görev KAPANDI):** `(operations)` rota grubu: kapı
    (`_layout.tsx` — `/me` TEK KEZ, dört hâl: 401→müşteri · ağ/500→hata+tekrar dene, "yetkin yok"
    DENMEZ · yalnız customer→müşteri · yetkili→kabuk) + `(sections)` sekmeleri (rol süzmeli;
    tek rol → çubuk gizli, erişilmeyen bölüm `Tabs.Screen redirect`le navigatörden çıkar) +
    bildirim iskeleti (süzme kuralı saf ve testli; akış fixture — 21.13). Tema: Unistyles'ta
    temalar tip düzeyinde BİRLEŞİM okunur (farklı şekilli temalar önerilmiyor) → operasyon
    komponentleri token'ı `operationsTheme` SABİTİNDEN okur, `setTheme` yalnız paylaşılan kiti
    hizalar (gerekçe `theme/unistyles.ts`; dikişin sınırı `_layout` künyesinde — kabuk-içi ilk
    çapraz bağlantı geçişi focus/blur'a bağlamalı). i18n: tek dilli sözlük, `LocalizedCopy`
    zarfsız (operasyon yalnız Türkçe; zarf yokluğu bilgi). Doğrulama: 42 suite / 253 test +
    tsc + eslint + knip + expo-doctor 20/20. Çok-ajanlı inceleme turu (3 boyut + çürütme):
    5 bulgu → 4'ü düzeltildi (hata metnindeki yersiz yetki iddiası; test iskelesi duplikasyonu →
    `src/testing/render-shell.ts`; yalancı test adı → gerçek yokluk testi; fixture künyesi),
    1'i bugün erişilemez diye SINIR olarak belgelendi (tema geri dönüşü unmount'a bağlı).
    Tasarımın kendi gerçeği aynen bırakıldı: yalnız `accounting` rollü kullanıcı Para kökünden
    bildirim ziline ulaşamıyor (v2'de zil yok) — tasarım iterasyonuna not edilebilir.
- [~] (21.10) **Kurye bölümü (K1 Günüm · Teslimat · Gün Kapanışı):** UI v2'den birebir ve TAM
  (fixture'la — CLAUDE §3: dış-modül bekleyende UI tam, arka uç stub). Arka uç zinciri sıralı ön
  şartlı: webde `markUndelivered` `note` düzeltmesi (defter, denetim şartı 1) → kurye
  orkestrasyonunun `packages/application/courier` terfisi (K4 tahsilata `idempotencyKey`
  sözleşmesi taşımada girer — şart 2; §4b test disiplini — şart 3; benimseme talebi katalog
  emsali — şart 4) → `/api/v1/courier/*` uçları → ekran bağlanır. K5 not/foto kalıcılığı ve K3
  imzalı yükleme ucu bu kapsamda (doc 04 iş listesi). **Denetim onayları (defter, 08.08):**
  `note` düzeltmesi webde tamam (`95428fb`, `db:refresh` yapıldı) — zincir BLOKSUZ; `refund.ts`
  (`adjustFulfillment`) de taşınır (port-enjeksiyon reddedildi: iki yüzeyde iki orkestrasyon
  kalmasın) ve D6 akıbet kapısı terfi sırasında depo kapsamına açılır (`requireAdmin` fazla
  kısıtlıymış — DOMAIN §8 "akıbet kararı depocunundur", uygulama düzeltmesi; web köprüsü
  benimsemeyle döner).
  `touches: apps/mobile, packages/application (yeni courier + refund), apps/mobile-api`
  - **Durum (08.08 — terfi ayağı tamam):** `application/src/courier/{day,delivery,day-close,proof}`
    + `order/{refund,payment,fulfillment,effects}` (payment/fulfillment zorunlu geçiş — kapı web'e
    bakamazdı; refund `courier/` İÇİNDE DEĞİL: üç kurye-dışı çağıranı var, künyede ölçümlü).
    Sözleşmeler `types/contracts/courier-api.schema.ts` (210; olumsuz sonuçlar ayrımlı birleşimde —
    görünür ret). K4 `idempotencyKey`: `meta.idempotencyKey`e kalıcı yazım + yazım öncesi arama;
    SINIRI künyede (oku-sonra-yaz, atomik değil — eşzamanlı çift eş-anahtar geçebilir; birinci
    kilit durum makinesi: `deliver_order` yalnız `out_for_delivery`den). Tam kapanış
    `money_movement.idempotency_key` migration'ı ister — defterden arka-uc'a önerildi. D6 hazır:
    `warehouseScope` parametresi (verilmezse köprü davranışı birebir; verilirse yazım öncesi
    `out_of_scope` reddi, dört test). **Bilinen sınır:** müşteri maili + puan + Stripe iadesi PORT
    (`order/effects.ts` — uygulamaları notify/i18n/points/stripe bağımlılığı istiyordu, kök lock'a
    dokunulmadı); port takılmazsa `logger.warn`. Effects terfisi defterde ayrı pozisyon olarak
    önerildi — o gelmeden `/api/v1/courier` teslimatı mail atmaz/puan yazmaz (uçlar bu sınırla
    açılır, künyeye yazılır). Web köprüsüne dokunulmadı (kanıt: köprü dosyaları git status'ta yok).
    Doğrulama (yönetici tekrarı): taşınan 60 test + birim 1108 + typecheck 17/17 + lint/knip/
    boundaries/docs:check temiz. Kalan: `/api/v1/courier/*` uçları + Expo ekranları.
  - **Durum (08.08 — uç ayağı tamam):** `/api/v1/courier/{day, stops/:orderId/{deliver,
    undelivered, proof-upload}, day-close}` (`courier.ts`, transport-only, `z.input` compile-lock).
    Guard: Bearer + `courier|admin` rolü; kurye kimliği JETONDAN profil zinciriyle
    (`findByAuthUserId` — auth kimliği `order.courier_id`yle eşleşmez, boş gün tuzağı). Sonuç →
    statü çizgisi künyede: HTTP "kapıya ulaştı mı", `data.status` "kapı ne dedi" (`stale`/`proof_required`/
    `deduped`… 200 döner — görünür ret). K5 notu uçta ZORUNLU (`.extend` daraltması; web köprüsü
    serbest kalır). Yan etki sınırı künyede (mail/puan çıkmaz — defter). Sapma: kanıt ucu
    `stops/:orderId/proof-upload` (kapı orderId istiyor, sözleşme gövdesi temiz kalsın).
    24 uç testi + paket telefon damgası düzeltmesi (defter bulgusu: sabit numara unique kısıta
    çarpışıyordu; beklenti de damgadan türer, '07' öneki aynı-milisaniye çakışmasını keser).
    Doğrulama (yönetici tekrarı): 35 test (uç 24 + paket 11) + lint temiz. Kalan: Expo ekranları.
  - **Durum (08.08 — ekran ayağı tamam):** K1 Günüm (`courier.tsx` gerçek ekran) + Teslimat
    (`delivery/[orderId]`) + Kapanış (`day-close`) — v2'den birebir; imza paneli uygulama-içi
    (PanResponder + SVG, rasterleştirme `signature-capture.ts`te izole; kanıt PNG olarak imzalı
    adrese cihazdan gider), `stale`/`proof_required`/`deduped`/`forbidden` EKRANDA (yutulmaz),
    sonuç akışı çip + serbest metin, tahsilatta doğrudan giriş birincil. `idempotencyKey`
    istemcide `newRequestKey` (zaman+sayaç+rastgele; sır değil eşleştirme etiketi — yeni paket
    açılmadı, gerekçe künyede). Bilinçli sapmalar ekran künyelerinde (yükleniyor hâli eklendi;
    kuyruk rozetleri 21.13'e — dürüst hata; foto kanıtı çizili-kapalı: kamera modülü yok).
    Doğrulama (yönetici tekrarı): 49 suite / 331 test + tsc + eslint + expo-doctor 20/20.
    **Kalan (görev `[~]` — üç SÖZLEŞME boşluğu, ekran değil):** (1) `doorAccountId` gün cevabında
    yok → borçlu durakta teslim kapısı kapalı (sebep ekranda; web ayardan sunucuda okuyor);
    (2) durak kalem satırları (`orderItemId`) yok → kısmi iade uçtan gönderilemiyor;
    (3) "Yola çıktım"ın sunucu ayağı yok (`ready → out_for_delivery` ucu). Üçü de mobil-backend
    dilimi; kamera + çevrimdışı kuyruk 21.13 hattında.
  - **Durum (08.08 — sözleşme boşlukları kapandı, 21.10d):** `CourierStopSchema.items[]`
    (kimlikli kalem satırları — zincir testle kanıtlı: gün cevabındaki `orderItemId` kısmi iade
    olarak kapıdan geçip stok düşürüyor) · `CourierDayResponseSchema.doorAccountId` (gün başına;
    ayardan, uuid değilse null+warn) · `POST /courier/day/start` (`startCourierDay` — yalnız
    `ready` aday, kısmi başarı DÖRT listeyle görünür: started/alreadyOut/stale/skipped; eşzamanlı
    çift çağrıda geçiş tam bir kez). Mevcut imzalar kırılmadı — web köprüsü 35 test yeşil.
    Fixture iki alanı öğrendi (Expo tarafı, yönetici). Doğrulama (yönetici tekrarı): kurye
    uç+paket 82 test + mobil 331 + typecheck 17/17.
  - **Durum (08.08 — bağlanma tamam, 21.10e):** hook'lar gerçek veride: `doorAccountId` gün
    cevabından (null → tahsilat kapısı kapalı, sebep "ayar boş"), `adjustments` `items[]`ten
    (satır anahtarı `orderItemId`), K1 CTA'sı `POST day/start`a bağlı — kısmi başarı üç tonlu
    bildirimle görünür + ajanın kendi bulduğu boşluk kapandı: kısmi başlangıçta "Kalanları yola
    çıkar" ikincil eylemi (yoksa gün içinde hazırlanan durak uygulamadan hiç yola çıkamazdı).
    `parseContentSummary`/`SummaryLine` söküldü; `BEKLEYEN(21.10)` işareti depoda kalmadı
    (kamera/kuyruk 21.13'e bağlandı). Doğrulama (yönetici tekrarı): 49 suite / 338 test + tsc +
    eslint. **Kalan (görev `[~]`):** kamera kanıtı + çevrimdışı kuyruk (21.13 hattı — dev-client
    yeniden derlemesi gerektirir) · mail/puan yan etkisi web'in 14.11 terfisini bekliyor (defter
    kararı: Stripe refunder kalıcı port) · cihazda koşum (dev server kullanıcıda).
- [~] (21.11) **Depo bölümü (hub + D1–D6):** önce ölçüm — hazırlık/kabul/transfer/sayım/dönüş
  orkestrasyonlarının bugünkü adresi (web server action mı, pakette mi; tüketicisiz kapılar doc
  04 notu) → gerekirse terfi/benimseme talepleri defterden → `/api/v1/warehouse/*` uçları +
  D1–D6 ekranları. Çevrimdışı kural v2'de çizili: saha işareti kuyruğa yazılır, depo YAZMA
  ekranları kilitli (raf ↔ sistem çelişkisi yasak). D6 guard'ın depocuya açılması + D2 hasar
  not/foto alt akışı burada. **Denetim onayı (defter, 08.08):** hazırlık/kabul terfisi =
  benimseme (köprüsüz) kabul; tek şart — web bir gün aynı kapıya ihtiyaç duyarsa (10.1 hazırlık
  ekranı) PAKETTEN çağırır, ikinci yol açılmaz.
  `touches: apps/mobile, packages/application, apps/mobile-api`
  - **Durum (08.08 — terfi ayağı tamam, 21.11a):** `application/warehouse/{preparation,intake,
    adjustment,transfer,names}` + `contracts/warehouse-api.schema.ts` (olumsuzlar ayrımlı
    birleşimde; `WarehouseAdjustmentReasonEnum` varlık enum'undan `.exclude` ile türer). Depo
    değişmezi: her kapı TEK `warehouseId` ister (varsayılan yok), kapsam dışı `out_of_scope` +
    dışarıda kalan `stockIds` ile görünür; hazırlık kuyruğunda depo süzgeci pakette ZORUNLU oldu.
    **Ölçüm düzeltmesi:** D1/D2/D4 web'de artık TÜKETİCİSİZ DEĞİL (üç operasyon sayfası bu arada
    yazılmış) — "köprüsüz benimseme" düştü, web kopyaları KÖPRÜ; benimseme web'in işi (deftere
    yazıldı). `transferDecision` bağlanmadı (hâlâ sıfır tüketici; v2 D5 rampada sayım, öneri
    istemiyor). Bilinen sınırlar: `RepricePort` boşsa `repricedCount: null` + warn (fiyat
    hizalaması web'in `auto-price`ında); D3 yakın-SKT kapısı YOK — `batch-view.ts` server-only,
    terfisi gerekiyor (defter). Doğrulama (yönetici tekrarı): depo 61 test + application 168 +
    birim 1108 + typecheck 17/17. Kalan: `/api/v1/warehouse/*` uçları + Expo ekranları + D3 kapısı.
  - **Durum (08.08 — uç ayağı tamam, 21.11b):** 9 uç (D1 kuyruk/onay · D2 form/kabul + "+ plansız
    kabul" ayrı adresle · D4 sayım · D5 gelen/rampada sayım · D6 üç akıbet); `dispatch/cancel`
    bilinçli AÇILMADI (v2 D5 rampa ekranı, sevk kurgusu yok) — tüketicisiz uç ölü kod.
    `receivePurchase` mobilde YOK (fiyat sınırı kapının kendisi). Guard: `requireStaffRole` +
    `warehouseGuard` — tek kapsamlı depocu hiçbir şey göndermez; boş kapsam 400 `warehouse_required`
    (DB kısıtı gereği boş kapsamın tek sahibi admin — 403 yanlış cevap olurdu, ölçümlü); iki
    `forbidden` ayrımı: rol=403, veri kapsamı=200+gövde (`stockIds` ekrana lazım). Ortak parçalar
    `auth.ts`/`lib/request.ts`e terfi etti (courier künyesindeki söz; 67 eski test yeşil).
    ~~Ölçülen paylaşılan-paket kusuru: RPC reddi düz nesne fırlatıyor~~ (21.11c'de düzeltildi:
    `rpc-error.ts` tek yardımcı, 4 yer bağlandı, kilitli testler gerçek mesaja döndü).
    Doğrulama (yönetici tekrarı): 41 uç testi.
  - **Durum (08.08 — ekran ayağı tamam, 21.11c):** hub + D1–D6 ekranları (27 dosya; 8 suite /
    69 ekran testi + `qty-field` kit komponenti). Depo kimliği İSTEMCİDE ÇÖZÜLMEZ, ölçülür:
    her cevap `warehouse-status`a işlenir, `warehouse_required` → hub "depo belirsiz" der (admin
    hâli; seçici yok çünkü depo LİSTESİ ucu yok). Çevrimdışı: ağ hatası ölçülünce yazma CTA'ları
    kilitli (NetInfo yok — 21.13 rebuild kümesi). Bilinçli sınırlar künyelerde: D3 fixture
    (06.13'e bağlı) · D2 plansız kabulde satır açılamıyor (`variantId` kaynağı yok — tedarik
    ürün araması ucu yok) · D2 künyesinde PO referansı/tedarikçi adı eksik (`IntakeFormResponse`
    taşımıyor — 21.11d'de kapandı) · ~~D1 yarım işte parti dağılımı sözleşmede yok~~ (21.11d:
    `pickedBatches` sözleşmede; ekranın bunu ÇİZMESİ ayrı iş, fixture derlemesi bağlandı). Tarih
    seçici yerel modül ister (21.13 kümesi — SKT alanı şimdilik doğrulamalı metin). Doğrulama
    (yönetici tekrarı): depo 96 + paket 61 test. Kalan: kamera/tarih-seçici/NetInfo (21.13).
  - **Durum (08.08 — sözleşme ayağı tamam, 21.11d):** depo sözleşme boşlukları kapandı:
    `IntakeFormResponse.purchaseOrder` künyesi (PO referansı + tedarikçi) · `PendingIntakeSchema`
    + `GET /warehouse/intake` bekleyen-sevkiyat listesi (D2 konusuz açılış) · `pickedBatches`
    türetilmiş şema (D1 yarım iş parti dağılımı) · dönüş kuyruğu (`listWarehouseReturns`,
    `GET /warehouse/returns` — kaynak `status='returned' + return_disposition IS NULL`;
    `?courierDayCloseId` İKİ ölçümle elendi) · `readIntakeHeader`. Doğrulama: paket +20 /
    uç +9 test; mobil kabul testi mock'u yeni zorunlu anahtara uyarlandı (`purchaseOrder: null`),
    mobil paket 449/449.
- [ ] (21.12) **Yönetim + Para bölümleri (Y1–Y6 · M1–M2 · gün özeti):** okuma ağırlıklı; Y5 gün
  özeti birleştirme ucu (doc 04 iş listesi) + Y1 üstlen/YZ-cevap aksiyonları, Y2 istisna kararı
  (motor önerisi + para önizlemesi uçtan), Y3 teklif onayı, Y4 taslak TS, Y6 not düşme; M1/M2
  salt okuma (yazma aksiyonu ÇİZİLMEZ — tasarım böyle). Para kökünün boş/hata durumu (21.8
  notu) burada eklenir.
  `touches: apps/mobile, packages/application, apps/mobile-api`
- [ ] (21.13) **Push altyapısı:** cihaz token modeli + teslim hattı — web şeridiyle koordineli
  (14 notify sürücüsü; defterden yürür). Kabuktaki bildirim ekranı ve rol süzmesi 21.9'da;
  bu görev yalnız İLETİM altyapısıdır. Bildirim hızlandırıcıdır, tek kapı değil (zemin brief
  kuralı) — her listeye elle giden yol push'suz da çalışır.
  `touches: apps/mobile, apps/mobile-api, packages/database (token modeli — talep gerekebilir)`

  **Durum (09.08):** modül sıraya alındı (kullanıcı kararı) ve **kalıcı defteri açıldı**:
  `docs/talep/bildirim-modulu-web-mobil.md`. Ölçüm: üç katmanın üçü de bugün YOK — bildirim
  tablosu yok (olaylar doğrudan maile gidiyor, `packages/notify` → `packages/email`),
  `expo-notifications` kurulu değil, zilin açtığı ekran yer tutucu
  (`apps/mobile/src/app/notifications.tsx`). Kapsam bölündü: **kayıt + okuma ucu** web şeridinde
  (defterin ilk girdisi), **cihaz jetonunun saklandığı yer** de orada (kişisel veri → silme
  akışının kapsamı); **izin akışı · jeton alma · Expo teslim hattı · bildirime dokununca doğru
  ekrana gitme · uygulama içi bildirim listesi ekranı** bizde. Sıra: web'in kayıt katmanı
  gelmeden ekran yazılmaz — yazılırsa boş bir listeye bakar.
- [~] (21.14) **Müşteri ekran seti — İLK ETAP: tasarım birebir, UI-only (kullanıcı kararı 08.08):**
  `Mobil - Musteri v3.dc.html` (~21 ekran) fixture'la birebir geçirilir; **backend işi ÜRETMEZ**
  (uç yoksa ekran fixture'la TAM çalışır, bağlanma sonraki etap). Üçüncü alt ajan (musteri-expo)
  yürütür; yazı alanı yalnız müşteri ekran/rota dosyaları — **kit/tema/ikon değişikliği YASAK**,
  ihtiyaç yöneticiye raporlanır (operasyon ekranlarıyla çakışma önlemi; kurum: şeritte artık üç
  alt ajan — operasyon-expo · musteri-expo · mobil-backend). Sayfaya-özel komponent kendi
  klasöründe serbest.
  `touches: apps/mobile/src/screens (müşteri), apps/mobile/src/app/(tabs)`
  - **Durum (08.08 — ilk büyük dilim, 21.14a):** vitrin · sepet · checkout (2 adım + onay) ·
    giriş · hesap + hesap düzenleme · siparişlerim + sipariş detayı · taleplerim + talep detayı +
    bize yazın · keşfet · paket detayı · tarif ekranları fixture'la yazıldı; `customer-kit`
    (kart/rozet/FAB/stepper…) kuruldu. Kabuk düzeltmeleri canlı cihaz turundan: kök font kapısı
    (`_layout` — `useFonts` bu kurulumda hiç tamamlanmıyor, `loadAsync`+kapı), tab bar
    `Math.max(inset, dolgu)`, koleksiyon dairelerinin üst katmanı (RN kardeş z-sırası), fırsat
    kartına foto (`CirclePhoto`). Talep durum sözlüğü müşteri dilinde — web ile aynı cümleler.
    Doğrulama: jest 449/449 · tsc 0 · eslint 0 · knip 0.
  - **Durum (08.08 gece — bağlanma dalgası, 21.14b):** vitrin GERÇEK uca bağlandı
    (`GET /api/v1/home` — bantlar: 4 işaretli kategori + RASTGELE 2 işaretli koleksiyon karışımı,
    kullanıcı kuralı; seçki rayı GEÇİCİ olarak kataloğun `featured` sırası, web `readShowcase`
    terfisiyle o kapıya dönecek; paketler yalnız işaretliler; tarif kartları; fırsatlar yer çözümü
    terfisine dek BOŞ). Kategori bandı kataloğu o süzgeçle açar (`requestedCategory` köprüsü).
    ÜRÜN DETAY gerçek ekran+uçla yazıldı (`screens/product` — aile çipleri `setParams`la yerinde
    tazeler, kullanıcı kararı; yorum/puan sözleşmede bilerek yok → "yorum yok" hâli). Sepet FAB'ı
    v3 dörtlüsüne tamamlandı (vitrin·katalog·ürün; paket kendi ekranıyla). Tasarım bölme aracı:
    `pnpm design:split` → `design/derived/*` (ekran başına dosya + kaynak satır aralıkları).
  - **Durum (08.08 gece — kimlik dalgası, 21.14c):** GİRİŞ GERÇEK: login v3 birebir (logo şeffaf
    PNG türetimi · üç yollu seçim · 62'lik kod alanı · gömülü gizlilik bağlantısı); OTP maili
    gerçek gider (Resend; `OTP_TEST_CODE` kapısı kapatıldı), 429 sayacı TEK kaynakta (düğme).
    Google PKCE + şema dönüşü (`lib/auth/oauth`; dev'de Android `adb reverse` köprüsü şart, iOS
    cihazda dev'de yok — künyede); WhatsApp düğmesi web'le aynı "çok yakında" bilgisi. `useMe`
    TEK depo (`publishMe` — kaydeden yayınlar, vitrin+hesap birlikte döner). Vitrin selamlama/
    rozet `/me`den; puan+bildirim rozetleri kaynakları gelene dek ÇİZİLMEZ. Hesap: misafir sekmeye
    gelince login otomatik açılır (vazgeçene karşılama), girişli kart gerçek. PROFİL DÜZENLEME
    v3 çekmecesi (kullanıcı kararı — ayrı sayfa SÖKÜLDÜ) + gerçek `PATCH /me`
    (`application.updateCustomerProfile` — web hesap formuyla TEK kural; telefon doğrulaması
    `BEKLEYEN(04.10)` web'le ortak). Kit: `TextField` içerik türü (e-posta önerisi), `BottomSheet`
    klavye kaçınması + klavye-köşe kanaması. Adres düzenleme kapıları adres uçlarına dek bilerek
    kapalı. Doğrulama: jest 458/458 · tsc/eslint/knip 0 · uç kanıtları canlı (curl) + DB.
    Kalan: adres uçları + v3 `shAddr` çekmecesi · tercihlerin (dil/izin) gerçek yazımı · geri
    bildirim akışı (vFb) · bildirimler içeriği · statik sayfalar · profesyonel başvuru ·
    onboarding (posta kodu → fırsatların da anahtarı).
  - **Durum (09.08 — detay sayfaları, 21.14d):** PAKET DETAY (`GET /api/v1/packages/:slug`,
    3 DB turu; `screens/package`; sepete paket satırı `cart-store.addBundle` — aynı paket adet
    toplar; "tükendi" hâli BİLEREK yok: stok zinciri webden terfi etmeden basılamaz,
    `BEKLEYEN(21.14)` şema+uç künyesinde) ve TARİF DETAY (`GET /api/v1/recipes/:slug`, 5 DB turu;
    `screens/recipe`; satır fiyat/stok kararı MOTORDAN — `loadProductContext`/`sellingOf`;
    `qty` ekseni veriden, Σ qty×fiyat barı; fiyatsız satır +'sız, hiç eklenebilir yoksa bar
    çizilmez) v3 birebir gerçek uçlarla yazıldı; iki uç da oturumsuz küme (katalog kararı).
    Doğrulama: paket 7 + tarif 8 jest · üç paket tsc/eslint 0 · canlı curl (paket 3 slug×dil,
    tarif 9/9). Kilitli tam koşu: mobil/mobile-api/application/types kapsamı YEŞİL (kalan 2
    düşüş `stock.test` — dokunulmayan alan, yarışma deseni).
  - **Durum (09.08 — üç paralel ajan dalgası, 21.14e):** GERİ BİLDİRİM (vFb) ekranı yazıldı
    (`app/feedback/[token]` derin bağlantı; üç aşama oy→yorum→sonuç + "bulunamadı" hâli; 11 test)
    — UI-only: fixture eşzamanlı yazılan sözleşmenin AYNASI, gerçek uca bağlanma sonraki dilim.
    ONBOARDING yazıldı: kök kapı `_layout`ta tek hook (`use-onboarding-gate` — SecureStore
    `lezzet.onboarding` `{done, locale, postalCode}`; bayrak okunana dek boş ekran; `(operations)`
    segmenti kapının DIŞINDA), 4 adım v3 birebir (dil seçimi kaydedilir ama uygulamayı ÇEVİRMEZ —
    v3'ün kendi davranışı; posta kodu maskeli, 67 kuralı yerel ve "sunucu bağlantı noktası"
    işaretli), Atla/Bitir ikisi de yazar; 22 test; kapının kırdığı 4 rota testi tek-satır
    `__mocks__` dikişiyle onarıldı. SUNUCU: `GET /api/v1/feedback/:token` + `vote/review/complete`
    (token kimliğin kendisi — Bearer'sız açık küme; adlı retler `invalid_link` · `vote_failed` ·
    `review_empty`; davet/oy/puan çekirdeği `application/feedback/{invite,write,points}`e TERFİ —
    web 17.2/17.6 akışıyla TEK kural, +90 gün ömür, iki katlı tekrar-engeli, ≥%80 motor eşiği;
    web köprü, benimseme defterde) ve `GET /api/v1/places/by-postal-code` (dört hâlli çözüm —
    `application/delivery/place` 19.8 kapısının kompozisyonu; cihaz anahtarı `{country,postalCode}`
    web `PlaceAnswer`ın ikizi, depo kimliği BİLEREK zarf dışında 19.9; vitrinin `UNKNOWN_PLACE`
    kapısının beklediği terfi — 21.6 B). Kablolama tek elden (yarış önlemi): barrel + application
    + router satırları yönetici şeritte eklendi; `layering.test` 5/5; canlı curl (67000 →
    Strasbourg `inRoute:true` · geçersiz token 404 `invalid_link`). Doğrulama: mobil jest
    73 suite / 508 TAM yeşil · kök typecheck 17/17 · lint/knip temiz. Kalan bağlar: ~~vFb
    fixture→şema dönüşü + gerçek uç bağlanması~~ (10.08'de kapandı — aşağıdaki durum notu) ·
    onboarding posta kodunun vitrin fırsat/flash
    kapısına bağlanması · kit terfileri (TextField büyük-kalın varyant · feedback ikon
    geometrileri · yerel ölçü sabitleri).
  - **Durum (09.08 — toast altyapısı, kullanıcı isteği):** v3'ün `toastM`i kuruldu ve ajan
    dalgalarının "toast yok" sapmaları kapandı. `lib/toast/toast-store` (modül-durumlu, 2400 ms,
    yeni mesaj sayacı sıfırlar — v3:437 birebir) + `components/ui/toast-host` (kökte TEK kopya,
    mürekkep zemin/kum metin, tab çubuğu üstü `size.toastBottom`, dokunuş yutmaz, pop animasyonu
    native sürücüde) + kök `_layout`a bağlandı. DOKUZ dikiş, hepsi v3'ün kendi mesajıyla: adres
    silindi · "{etiket} varsayılan yapıldı" · profil güncellendi · onboarding Bitir karşılaması
    (Atla sessiz — v3 öyle) · login "Doğrulandı — hoş geldiniz" · vitrin flash "Sepete eklendi" ·
    ürün detay · paket ("Paket sepete eklendi") · tarif satır + toplu ("{n} malzeme sepete
    eklendi" — sapma 5 kapandı). Metinler ekran sözlüklerinde (fr/de/tr), depo çeviri bilmez.
    Doğrulama: jest 74 suite / 510 yeşil · lint temiz.
  - **Durum (10.08 — vitrin SKELETON'ı son açılışın izini çiziyor, kullanıcı kararı):** vitrinin
    bölümleri koşullu (sipariş bandı oturuma · fırsat şeridi yere · tarif/paket uçtan gelene bağlı)
    ama skeleton hepsini var sayıyordu — veri gelince bloklar kaybolup ekran zıplıyordu; günün
    fırsatı bloğu ise sayfada HİÇ çizilmediği hâlde her açılışta ~124 dp yer tutuyordu. Artık her
    BAŞARILI yüklemede hangi bölümün kaç elemanla çizildiği cihaza yazılıyor
    (`screens/home/home-layout-memory.ts`; depo mevcut `lib/storage/device-store`, yeni saklama
    kapısı yok — anahtar `DEVICE_STORE_KEYS.homeLayout`) ve skeleton onu çiziyor (`sections`
    prop'u; skeleton izi kendisi OKUMAZ, saf çizim kalır). İz yoksa `DEFAULT_HOME_LAYOUT` — "her
    zaman görünen" bölümler, uç sözleşmesinin tavanlarıyla (bant 6 · fırsat 2 · seçki 4 · tarif 3 ·
    paket 2); sipariş bandı ve günün fırsatı varsayılanda YOK. Sipariş bandı iki kapıdan geçiyor —
    İZ ve OTURUM: misafirde iz "vardı" dese bile çizilmez, oturum henüz okunmadıysa ize güvenilir
    (ölçülmemiş değer "yok" sayılmaz). Günün fırsatı silinmedi, ize bağlandı (`flash` alanı bugün
    hep `false`) — ucu geldiği gün skeleton kendiliğinden takip eder. Hata hâlinde iz YAZILMAZ:
    o boşluğu kaydetmek sonraki açılışın skeleton'ını yanlış küçültürdü. Karar ekran-üstü yazıldı:
    `docs/uygulama/02-mimari-ve-sinirlar.md §4b` — koşullu bölümü olan her skeleton bu deseni
    izler. Doğrulama: yeni 12 birim testi yeşil · tsc/eslint temiz.
    **Ek (kullanıcı bulgusu, aynı gün):** bant yığınının ÜSTÜNDEKİ koleksiyon DAİRELERİ skeleton'da
    hiç yoktu — sayfada altı bandın her birinde bir daire var, sırayla sağ/sol, banttan taşarak ve
    hafif eğik. Eklendi; konum/taşma/eğim değerleri bandın kendi dosyasından (`collection-band`),
    ikinci bir çizim kuralı yazılmadı. **Ton ritmi de geldi** (aynı turun ikinci bulgusu: "hepsi
    gri ve dip dibe, tek blok görünüyor"): `Skeleton` kitine üç kademeli `tone` eklendi
    (`soft`/`default`/`deep` → `sand-250`/`sand-300`/`sand-400`) ve bantlar sayfadaki gibi SIRAYLA
    dönüyor — ton veriden değil sıradan türer, bandın kendi dosyasındaki kuralın aynısı. Daire
    zemininden ayrışır (bant koyuysa daire açık): tek kural "daire ile altındaki bant asla aynı
    tonda olmasın". Kitte varsayılanın dışına yalnız bloklar BİRBİRİNE DEĞİYORSA çıkılır; ayrı
    duran bloklarda ton farkı bir şey söylemez, gürültü olur.
  - **Durum (10.08 — ÜRÜN DETAY SKELETON'ı ayrı dosyaya çıktı, kullanıcı kararı):** skeleton
    ekranın içine gömülü dört çubuktu ve iki kusuru vardı: ölçüleri HAM SAYIYDI (`120` `12` `26`
    `14` `90` — hiçbiri sayfadan alınmamış, yani skeleton'ın yüksekliği sayfanınki değil) ve
    sayfanın yarısını temsil etmiyordu — akordeonlar, değerlendirmeler ve en görünürü YAPIŞKAN BAR
    (her hâlde ekranın altında duran sabit yükseklikli tek öğe; skeleton'da olmayınca veri gelince
    aşağıdan aniden beliriyordu). Yeni `screens/product/product-skeleton.tsx`: ölçülerin hepsi
    sayfanın kendi stillerinden türüyor (dolgu · `fontSize × satır oranı` · `customerMetrics`),
    kap stilleri sayfadan kopya, kök `progressbar`+`busy`. **Yalnız HER ZAMAN görünenler çizilir**
    (kullanıcı kararı): kahraman + yüzen geri/paylaş daireleri · künye (ad + birim satırı) · üç
    akordeon başlığı · değerlendirmeler · yapışkan bar. Koşullular (kategori üstbaşlığı ·
    limit/kargo çipleri · aile rayı · boy çipleri · açıklama · benzerler · rozetler · yer
    filigranı) çizilmez — vitrindeki "son açılışın izi" burada işlemez, iz ürüne özel olurdu ve
    slug başına kayıt depoyu şişirirdi. Akordeon çerçevesi ve barın zemini GERÇEK çiziliyor (sabit
    yapı veriye bağlı değil). Politikaya iki ek madde yazıldı (`docs/uygulama §4b`): izin
    işlemediği ekranlarda "yalnız her zaman görüneni çiz" + ekranın altına yapışık sabit öğe
    mutlaka temsil edilir. Doğrulama: ürün detay 9/9 test yeşil · tsc/eslint/knip temiz.
  - **Durum (10.08 — TARİF ve PAKET detaylarının SKELETON'ları, aynı kalıp):** ikisi de ürün
    detayının eski hastalığındaydı — ekranın içine gömülü dört çubuk, ham ölçüler (`120` `12` `26`
    `46` / `26` `18` `66`), bölümlerin çoğu temsilsiz. Yeni `recipe-skeleton.tsx` ve
    `package-skeleton.tsx`; ölçüler sayfaların kendi stillerinden, kök `progressbar`+`busy`.
    **Tarif:** kahraman + yüzen geri · künye · "Bizden" başlığı ve 3 malzeme satırı ·
    "Hazırlanış" başlığı ve 3 adım · yapışkan bar. **Paket:** kahraman (16:10, oran ekranın gerçek
    genişliğinden) · künye (ad + fiyat) · içerik başlığı ve 3 satır · alt not · yapışkan bar;
    BAŞLIK ÇUBUĞU skeleton'a girmedi — sayfa onu yüklenirken de GERÇEK basıyor (geri yolu açık) ve
    çalışan bir düğmeyi griye çevirmek kullanıcıyı sayfaya kilitlerdi. Çizilmeyenler (opsiyonel
    olanlar): süre·porsiyon rozeti · açıklama · "Evinizden" listesi · tükendi rozeti · kargo çipi ·
    yer işareti. Politikaya üç ölçüt daha yazıldı (`docs/uygulama §4b`): ölçüt "kodda `if` var mı"
    değil "bu bölüm olmadan sayfa var olabilir mi" · sayısı bilinmeyen listede EN AZ makul sayı
    (fazlası kaybolur, azı eklenir) · yüklenirken de çalışan gerçek öğe gri çizilmez.
    **Yan terfi:** iki ekranın künyesinde "kit yazıya kapalı, terfi ihtiyacı raporlandı" diye
    bekleyen ölçüler `customerMetrics`e taşındı (`recipe*` + `packageItemPhoto`) — skeleton'lar
    aynı ölçüleri isteyince ekran dosyasından import dairesel bağımlılık, kopyalamak duplikasyon
    olurdu. Doğrulama: tarif+paket 15/15 test yeşil · tsc/eslint/knip temiz.
  - **Durum (10.08 — MOBİL SKELETON ENVANTERİ + iki liste ekranı, kullanıcı isteği):** uygulamanın
    TAMAMI tarandı; skeleton kullanan/kullanması gereken 17 yer çıktı. Bu turda **paket ve tarif
    LİSTELERİ** kalıba alındı (`packages-list-skeleton.tsx` · `recipes-list-skeleton.tsx`):
    paket listesinin gövde satırı `width={size.circleSm} height={text.note}` ile çiziliyordu —
    DAİRE ÇAPI genişlik, YAZI BOYU satır yüksekliği olarak; ikisi de o rol için ölçülmemiş
    değerlerdi. İki ekranda da sayfa BAŞLIĞI skeleton'a girmedi (her dalda gerçek çiziliyor;
    tariflerde içinde çalışan geri düğmesi var) ve kök `progressbar`+`busy` eklendi.
    Doğrulama: mobil paket 77 suite / 541 test yeşil · tsc/eslint/knip temiz.

    **KALAN (envanter — sırayla kapatılacak):**
    · ~~sipariş şeridi: `orders-screen` + `order-detail-screen`~~ → **KAPANDI 10.08** (aşağıdaki
      durum notu);
    · ~~destek şeridi: `tickets-screen` · `ticket-detail-screen` · `order-picker` ·
      `order-line-picker`~~ → **KAPANDI 10.08** (aşağıdaki durum notu);
    · ~~skeleton olması gerekirken dönen halka~~ → **HEPSİ KAPANDI 10.08**: `discover-screen` ·
      `delivery-zones` · `new-ticket-sheet` kapsam adımı · `cart` · `checkout` (aşağıdaki durum
      notları);
    · ~~`account-screen` adres defterinin YÜKLEME HÂLİ HİÇ YOK~~ → **KAPANDI 10.08** (aşağıdaki
      durum notu).
    **Ek durum (10.08 — SİPARİŞ ŞERİDİ KAPANDI):** `order-detail-skeleton.tsx` ve
    `orders-skeleton.tsx` yazıldı; envanterin en ağır kalemi buydu (detayda dört ölçünün dördü de
    hamdı ve sayfanın hiçbir bölümü tanınmıyordu — `140`lık blok neyi temsil ettiği belli olmayan
    bir dikdörtgendi). **YÜKSEKLİK ARTIK HİÇ YAZILMIYOR:** iki panel (zaman çizgisi · tutar özeti)
    ve sipariş kartı kendi komponentlerinde yaşıyor; skeleton onların yüksekliğini hesaplamaya
    çalışmak yerine AYNI YAPIYI aynı kap stilleriyle kuruyor ve yükseklik kendiliğinden çıkıyor —
    bir formüle çevrilseydi panel her değiştiğinde formül sessizce yanlışa düşerdi. Detayda
    çizilenler: zaman çizgisi (dört durak — motorun sabit sayısı) · kalemler (üstbaşlık + 3 satır) ·
    tutar özeti (4 koşulsuz satır + toplam rozeti) · destek eylemi; çizilmeyenler: canlı takip
    haritası, eksik karşılama notu, kargo takip bağı, durum etiketi. Listede kartın kabuğu gerçek,
    gri kalan numara/künye/durum/küçük resimler/tutar. İki ekranda da `AppBar`/başlık skeleton'a
    girmedi (ikisinde de çalışan geri düğmesi var). **"En az makul" iki yerde:** zaman çizgisi
    durağında yalnız AD çubuğu var (saat yalnız kaydı olan adımda yazılıyor — saati de çizseydik
    veri gelince satır KISALIR ve aşağısı yukarı kayardı) ve kalem sayısı 3.
    Doğrulama: mobil paket 77 suite / 541 test yeşil · tsc/eslint/knip temiz.

    **Ek durum (10.08 — HESABIM: ağdan bekleyen iki bölüm, kullanıcı isteği):** hesap ekranı tek
    parça yüklenmiyor — kimlik kartı rota `/me`yi çözdükten sonra çiziliyor (yani açılışta zaten
    dolu), ama PUAN CÜZDANI (`/me/points`) ve ADRES DEFTERİ (`/me/addresses`) kendi çağrılarını
    bekliyor ve ikisi de yüklenirken HİÇ çizilmiyordu: veri gelince ekranın ortasına girip
    altındaki her şeyi aşağı itiyorlardı. Adres defterinde ayrıca yanlış bir cümle vardı — liste
    boş dizi olarak başladığı için "yükleniyor" ile "hiç adresin yok" ayırt edilemiyordu (taramanın
    bulduğu tek sessizce yanlış konuşan yer). `account-skeleton.tsx` iki AYRI bileşen veriyor
    (`AccountPointsSkeleton` · `AccountAddressesSkeleton`): bölümler ayrı çağrılara bağlı ve ayrı
    anlarda doluyor; tek bir tam ekran skeleton'ı hazır olan kimlik kartını ve menüyü de
    gizlerdi — eldeki bilgiyi saklamak beklemeyi uzatmaktan kötüdür. Puan kartında düğme ve
    "kazanma yolları" listesi çizilmez (hangisinin geleceği bakiyeye bağlı, ikisi çok farklı
    yükseklikte); adreste satır sayısı 2 (en az makul). Her bileşen kendi `progressbar`ını taşır —
    ekranda aynı anda iki bekleme olabilir. Doğrulama: 77 suite / 541 test yeşil · tsc/eslint/knip
    temiz.
    · `BEKLEYEN(21.14)` Kalan tek nokta hesapta: rota `/me` okunurken sekme TAMAMEN BOŞ
      (`return null`) — künyesinde bilinçli ("misafir daveti yanıp sönmesin"), ama okuma uzarsa
      kullanıcı boş ekran görüyor. Kimlik kartının skeleton'ı ayrı bir karar, kullanıcıya soruldu.

    **Ek durum (10.08 — DESTEK ŞERİDİ KAPANDI):** dört yerin dördü de ham ölçülüydü ve a11y'siz.
    İki EKRAN kendi skeleton dosyasını aldı (`tickets-skeleton.tsx` · `ticket-detail-skeleton.tsx`),
    iki SEÇİCİ ise çekmece içi form adımı olduğu için kendi yerlerinde düzeltildi — ayrı dosya
    açmak bakım yükü olurdu, kusur zaten gömülülük değil HAM ÖLÇÜydü. Yazışma ekranı en ilginci:
    üç ortalanmış çubuk buranın bir SOHBET olduğunu hiç göstermiyordu; skeleton artık balonları
    sırayla sağa/sola yaslıyor (%78 tavanı sayfanın kendi sınırı) ve altta yapışkan yanıt kutusunu
    çiziyor. **Yön sırası gerçek yazışmayı taklit etmiyor** (kim ne zaman yazdı bilinmiyor);
    amaç ekranın İKİ YANLI olduğunu göstermek — tek yana yaslanmış balonlar sohbeti tek taraflı
    bir liste gibi okuturdu. Balon yüksekliği TEK SATIR (en az makul: fazlası veri gelince balonu
    küçültür, azı yalnız aşağı açar). Dört yerde de yükseklik artık YAZILMIYOR; satır/kart
    kabuğu gerçek kuruluyor. Doğrulama: 77 suite / 541 test yeşil · tsc/eslint/knip temiz.

    **Ek durum (10.08 — HALKA ↔ SKELETON AYRIMI, kullanıcı sorusu):** "halka başka sayfalarda da
    var mı, ikisi muadil mi?" sorusuyla uygulamanın TAMAMI yeniden tarandı. Cevap: **muadil
    değiller** ve ölçüt tek soruda toplanıyor — bekleyen şey bir YERLEŞİM mi, bir İŞLEM mi.
    Kullanıcının gördüğü vitrin/paket/katalog halkaları aslında **aşağı çekme** halkalarıydı
    (`RefreshControl`) ve onlar DOĞRU. Üç sınıf dokunulmadan bırakıldı: aşağı çekme (6 ekran) ·
    sonsuz kaydırmanın kuyruğu (4 yer) · işlem-geçiş halkaları (giriş · doğrulama · profil kurma ·
    sepet çözümleme). Skeleton'a çevrilenler: `discover-screen` (deste + ilerleme dilimleri +
    ipucu kutuları; alt iki kart katmanı GERÇEK çiziliyor — derinlik veriye bağlı değil),
    `delivery-zones-screen` (iki ülke öbeği, dörder yer satırı) ve `new-ticket-sheet`in kapsam
    adımı (soru + gövde + iki cevap düğmesi). Üçünde de skeleton EKRANIN İÇİNDE kaldı: ölçüleri
    ekranların kendi stil/metrik bloklarından geliyor ve ayrı dosya ya dairesel bağımlılık ya
    40 satırlık taşıma isterdi — kusur gömülülük değil, YANLIŞ GÖSTERGEydi. Ekran okuyucuya giden
    ses değişmedi (rol + ad + meşgul), o yüzden bölgeler ekranının testi aynı sorguyla ayakta
    kaldı; yalnız adı düzeltildi. Ayrım ekran-üstü kural olarak yazıldı: `docs/uygulama §4b`.
    Doğrulama: 77 suite / 541 test yeşil · tsc/eslint/knip temiz.

    **Ek durum (10.08 — SEPET ve ÖDEME; müşteri yüzü KAPANDI):** paralel şerit kendi işini
    commit'leyip alanı boşaltınca iki ekran da alındı. **Sepette bir ÖLÇÜM DÜZELTMESİ var:** bu
    envanterde `cart` önce "halka doğru, ekran zaten dolu" diye kaydedilmişti — yanlış. Ekranın
    kendi koşulu `unresolved = products.length > 0 && view.lines.length === 0`, yani "elimde ürün
    var, satırları kuramadım": o anda liste BOŞ çiziliyor ve altında halka dönüyordu; satırlar
    gelince kupon daveti, özet ve bar aşağı zıplıyordu. `cart-skeleton.tsx` satırların yerini
    tutuyor ve **satır sayısı TAHMİN DEĞİL** — sepet cihazda yaşıyor, kaç ürün olduğu biliniyor
    (`cart.products.length`, tavan 6); çözülmeyen şey satırların İÇERİĞİ. Bu, envanterdeki tek
    "sayıyı biliyoruz" hâli. `checkout-skeleton.tsx` ise üç bölümün yerini tutuyor (teslim adresi ·
    teslimat yolu · ödeme yöntemi, her biri üstbaşlık + iki seçenek satırı); TUTAR ÖZETİ skeleton'a
    ALINMADI çünkü sayfa onu `ready` bloğunun dışında, beklerken de çiziyor — duran bir paneli
    griye çevirmek olurdu. Doğrulama: 77 suite / 541 test yeşil · tsc/eslint/knip temiz.
    **Müşteri yüzünde skeleton işi bitti**; ~~kalan tek gelecek borcu geri bildirim ekranı
    (`BEKLEYEN(21.14)` — bugün fixture'la çalışıyor, ucu bağlanınca skeleton gerekecek)~~ →
    o borç da aynı gün kapandı: ekran uca bağlanırken `feedback-skeleton.tsx` yazıldı (aşağıdaki
    durum notu).
    Operasyon ekranları (kurye 3 + depo 4) bilinçli olarak kapsam dışında: müşteri tasarım dilinde
    değiller ve personel akışında halkanın zararı yok — istendiğinde aynı ölçütle geçilir.

    Halkanın DOĞRU olduğu yerler (kusur değil, kayda geçti): `login`/`profile-setup`/
    `auth-callback` ve bölge talebi çekmecesi (form ve geçiş ekranları — bekleyen bir yerleşim
    değil, bir cevap) · aşağı çekme halkaları (6 ekran) · sonsuz kaydırmanın kuyruğu (4 yer) ·
    kurye ve depo ekranları (operasyon yüzeyi). ~~`cart`~~ ve ~~`delivery-zones`~~ bu listeden
    ÇIKTI: ikisi de ölçülünce yerleşim beklediği görüldü ve skeleton'a çevrildi.

  - **Durum (10.08 — GERİ BİLDİRİM EKRANI GERÇEK UÇLARA BAĞLANDI):** ölçülen boşluk şuydu — dört
    uç (`GET /feedback/:token` + `vote`/`review`/`complete`) 09.08'de yazılmış ve testliydi, ama
    `apps/mobile/src/lib/api/` altında karşılığı YOKTU: ekran `feedback-fixture`tan okuyordu. Yani
    davet bağlantısıyla gelen müşteri KURGU ürünleri oyluyor, oyu hiçbir yere yazılmıyordu.
    Yazılanlar standardın kendisinden türedi, yeni bir desen açılmadı:
    · `lib/api/feedback.ts` — `apiFetch` (korumasız; **token kimliğin kendisi**, `authorizedFetch`
      olsaydı oturumsuz cihazda davet linki sessizce ölürdü), şemalar `@lezzet/types`tan, gövde
      tipleri `z.input` ile derlemede kilitli (`recipe.ts`/`discover.ts` deseni).
    · `screens/feedback/use-feedback.hook.ts` — `use-ticket.hook`un okuma+yazma deseni; dört hâl
      (`loading`/`ready`/`missing`/`error`), `guest` YOK (token oturumun yerine geçiyor).
      **Oy iyimser ama ret GERİ ALIR** (web `feedback-client.tsx`in ölçülmüş kararı: ekranda duran
      ama sunucuda olmayan bir cevap, müşteriye yapmadığı işi yaptığını söyler) — ekran o karta
      kendiliğinden döner, çünkü hangi kartta olduğumuz AYRI BİR DURUM DEĞİL, oy haritasındaki ilk
      boşluk. **Yorum tamamlamadan ÖNCE gider ve düşerse tamamlama hiç çağrılmaz:** akış kapanınca
      müşteri o kutuya dönemez, metni sessizce kaybederdik.
    · `screens/feedback/feedback-skeleton.tsx` — §4b: davet en az bir kartla gelir (sözleşmenin
      `min(1)` kilidi), yani beklenen yerleşim TEK ve bilinir (oy aşaması). Başlık çubuğu gerçek
      basılır (içindeki geri düğmesi beklerken de çalışmalı), sipariş rozeti çizilmez (nullable).
    · Şablonda olmayan üç hâl eklendi ve üçü de ekran künyesinde gerekçeli: yükleme · bağlantı
      hatası + "Tekrar dene" (cümleler tarif/paket detaylarının sözlüğüyle BİREBİR) · **zaten
      tamamlanmış davet** (web'in `AlreadyDone` kutusu — kartları göstermek puanı ikinci kez
      kazanılabilirmiş gibi okuturdu).
    **İKİ DUPLİKASYON KAPANDI:** (a) `feedback-fixture.ts` sözleşmenin ELLE YAZILMIŞ aynasını
    taşıyordu (`FeedbackInviteView` · `FeedbackCardView` · `FeedbackCompletionView` · `FeedbackVoteBody`
    · `FeedbackOutcome`) — kendi künyesi "barrel açıldığı gün bu tipler silinir" diyordu, barrel
    açıktı; dosya artık `FeedbackInvite`/`FeedbackCard`/`FeedbackCompletion`ten TÜREYEN test verisi
    (ürün fixture'ının kuralı). (b) `screens/orders/orders-fixture.ts` SİLİNDİ — künyesindeki söz
    aynen buydu ("geri bildirim de kendi ucuna bağlandığında bu dosya silinir"); son tüketeni oydu.
    Fotoğraf (380) ve oy düğmesi (56) ölçüleri `customerMetrics`e terfi etti — skeleton aynı
    ölçüleri isteyince ekrandan import dairesel bağımlılık olurdu (tarif/paket emsali).
    **Canlı ölçüm (uç 3002, seed):** açık davet → 1 kart · oy `recorded` · yorum `recorded` ·
    tamamlama `outcome:thanks · +5 puan · bakiye 55` · **ikinci tamamlama `pointsAwarded: 0`,
    bakiye değişmedi** · tamamlanmış davet tekrar açılınca `completedAt` dolu geliyor (ekran
    "zaten tamamladınız" kutusunu çiziyor) · süresi dolmuş token ve uydurma token `404 invalid_link`
    · dilsiz istek `400 invalid_locale`. Doğrulama: mobil 78 suite / **551 test** yeşil (geri
    bildirim 17 test: rollback · yorum sırası · üç açılış hâli) · eslint/knip temiz; `tsc`de kalan
    tek hata paralel şeridin süren `address-form` işinde, bu dilimin dışında.
    **Kalan (bu ekranın kendi borcu):** `outcome:'review_invite'` dalı canlıda görülemedi —
    `review_platform_url` ayarı boş olduğu için motor `thanks` dönüyor; dalın kendisi testte
    kanıtlı. Ayrıca ölçüm sırasında görüldü: `locale=tr` istenen kartın adı İngilizce geldi
    ("Baklava with Walnut") — ürünün TR adı yoksa dil yedek zinciri böyle davranır, ama
    doğrulanması gereken bir veri gözlemi (katalog şeridine ait).
- [x] (21.15) **Adres dilimi — uçlar + v3 `shAddr` çekmecesi (kullanıcı onaylı sıra, 09.08):**
  hesap ekranının adres bölümü gerçek uçlara bağlanır; ekleme/düzenleme/silme/varsayılan v3
  çekmecesinden. Checkout adres seçiminin zemini.
  `touches: packages/types/src/contracts, packages/application/src/customer, apps/mobile-api/src/api/v1, apps/mobile/src/{lib/api,screens/account}`
  - **Durum (09.08):** SÖZLEŞME `address-api.schema.ts` (`MeAddress` pick'i; yazma gövdesi 5
    haneli FR posta kodu; `isDefault` gövdede BİLEREK yok — varsayılan kendi ucu; **her cevap
    GÜNCEL LİSTE** — bayrak devri komşu satırları oynatır, tek kayıt dönmek istemciyi ikinci
    tura mecbur bırakırdı). UYGULAMA KAPISI `application/customer/addresses.ts` — web
    `lib/account/addresses.ts` kurallarının TERFİSİ (kopya değil; web köprü, benimseme talebi
    defterde): sahiplik her eylemde ("başkasınınki de bulunamadı"), `isDefault` yazma yolundan
    sızamaz (tip + çalışma zamanı), varsayılan silinirse EN YENİ devralır, ilk adres varsayılanı
    SERVİSTE, sıralama tek yerde (varsayılan başta → en yeni). UÇLAR `/api/v1/me/addresses`
    GET/POST/PATCH/DELETE + `POST /:id/default` (Bearer arkası; profil çözümü tek middleware,
    `profile_not_found` emsali). MOBİL: `lib/api/addresses` (`ApiFetchInit`e DELETE eklendi) +
    `use-addresses.hook` (ekran-yerel; checkout günü terfi) + kart sözleşme tipinde (etiketsiz
    adreste başlık ŞEHİR; `line2` satıra girer) + v3 çekmece birebir (4 alan + zip maskesi +
    67 bölge notu + düzenlemede "Adresi sil"); `line2` formda YOK ve gövdeye girmez —
    gönderilmeyen alana kapı dokunmaz, web'den girilmiş kat/daire korunur. Doğrulama:
    application entegrasyon testi 5 senaryo YAZILDI (paylaşılan-DB kuralı gereği kilitli tam
    koşuya bırakıldı) · `account-screen.test` 8/8 · üç paket tsc/eslint 0. (`account-routes`
    1 düşüş — eşzamanlı onboarding dalgasının `_layout` kapısı, o teslimle birlikte çözülecek.)
- [x] (21.16) **Tercihler + siparişlerim gerçek (09.08):** dil ve kampanya izinleri
  `PATCH /api/v1/me/preferences` ile kalıcı — kural `application/customer/preferences.ts`
  (web `setConsentAction`/`language-actions` terfisi; **yalnız DEĞİŞEN kanala damga**, dokunulmayan
  kanalın `at`/`source`u korunur, "hiç sorulmadı" hâli sahte rede dönmez). Hesap ekranı iyimser
  yazar, ret gelirse anahtar eski değerine döner ve sebep söylenir. SİPARİŞLERİM:
  `GET /me/orders` (keyset) + `/me/orders/:reference`, kural `application/order/customer-orders.ts`
  (web sipariş sayfalarının terfisi: taslak süzmesi, paket katlaması, zaman çizgisi, takip adresi).
  `touches: packages/{types,application}, apps/mobile-api, apps/mobile/src/screens/{account,orders}`
- [x] (21.17) **Puan cüzdanı (09.08):** `GET /me/points` + `POST /me/points/redeem` — bakiye
  `customer_points_balance`ten, eşik AYARDAN (`points_redeem_min` × `points_cent_value`), kuponlar
  kişisel indirim satırlarından (kullanılabilirlik süzgeci web'den terfi). B2B'de `points: null`
  (sıfır DEĞİL — bölüm çizilmez); ölçülen web arızası (iki ayrı B2B ölçütü) kapıda birleşimle
  kapatıldı, kök karar web şeridinde.
  `touches: packages/{types,application,domain-core}, apps/mobile-api/src/api/v1/points.ts`
- [x] (21.18) **Taleplerim gerçek + statik sayfalar/profesyonel başvuru (09.08):** `GET/POST
  /me/tickets` (+ mesaj yazımı) — kural `application/ticket/{read,write}.ts`, bildirim tetikleri
  çağırana `TicketEffects` ile geçer (kapı taşıma bilmez). STATİK sayfalar (teslimat · SSS ·
  gizlilik · satış/kullanım koşulları) webin içeriğinden ÜRETİLDİ (elle metin yazılmadı);
  PROFESYONEL başvuru formu tam çalışır, gönderim ucu yok → `BEKLEYEN(21.14)`.
  `touches: packages/{types,application}, apps/mobile-api, apps/mobile/src/screens/{support,legal,professionals}`
- [x] (21.19) **Kabuk dalgası (09.08):** TOAST altyapısı (v3 `toastM` — 2400 ms, kökte tek host,
  9 dikiş) · ONBOARDING (5 adım: dil → yazı boyutu → posta kodu → teslimat mantığı → ödeme; kapı
  `_layout`ta, seçim SecureStore'da) · YAZI BOYUTU ayarı (%90/%100/%115, tema `text` durakları
  çarpılır, hesaptan da değişir) · OAUTH dönüş rotası (`/auth/callback` — dinleyici kurgusu
  cihazda 404 basıyordu, değişimin sahibi rota oldu) · DEV giriş kapısı (yalnız yerel; mail turunu
  atlayan GERÇEK oturum) · FONT KURALI: stillere `fontWeight` yazılmaz (285 satır söküldü —
  aile+ağırlık ikilisi iki platformda da sistem fontuna düşürüyordu, cihazda kanıtlandı).
  `touches: apps/mobile/src/{app,components,lib,screens,theme}`

- [~] (21.20) **YER EKSENİ mobilde tek kaynaktan okunacak — posta kodu katalog okumasına TAŞINSIN**
  *(kullanıcı kararı 09.08: "biz müşterimize ürünlerimizin hepsini gösterme üzerine bir kurgu
  yapıyoruz"; iş birimi olarak alındı)*
  `touches: apps/mobile/src/{lib,screens}, apps/mobile-api/src, packages/application/src/delivery`

  **Web'de kural KURULU, mobilde YARIM.** Web kararı (`08-musteri-app.md` 08.32): ürünlerin
  hepsi gösterilir, posta kodu GÖRÜNÜRLÜĞÜ değil söylenen CÜMLEYİ değiştirir. Kural tek nüsha —
  `elsewhereReasonOf(place)` → rota içinde `stock` (beklenen KALEM), rota dışında `out_of_route`
  (beklenen BÖLGE); üç ekran öğesi (stok işareti · haber-ver düğmesi · teslimat satırı) aynı
  kaynaktan okur. **Yer bilinmiyorsa `stock`:** "gönderemiyoruz" demek için rota dışında olduğunu
  BİLMEK gerekir (CLAUDE §1).

  **Mobilde bugün ölçülen durum (09.08):** `shippable`/`inRoute` yalnız ürün detayı, paket detayı
  ve onboarding'de geçiyor, çoğu FIXTURE üzerinden. Katalog KARTLARINDA yer ekseni işareti YOK;
  `elsewhereReasonOf` karşılığı yok, yani rota içi/dışı ayrımı tek kaynaktan okunmuyor.
  Onboarding posta kodu alıyor ama o yerin sonucu katalog okumasına taşınmıyor.
  **Tehlikeli olan sessizliktir:** işaretsiz kart, rota dışındaki müşteriyi hiçbir uyarı görmeden
  sepete götürür; kısıtla ancak sepette karşılaşır.

  Kapsam: (a) onboarding/hesaptaki yerin katalog + vitrin + kart okumalarına taşınması;
  (b) `elsewhereReasonOf` kuralının `@lezzet/application`a TERFİSİ (web'de
  `apps/web/lib/delivery/place-types.ts`; iki yüzey aynı cümleyi kurmalı, kopyalanmaz);
  (c) mobil kart + ürün detayında işaretin tek kapıdan çizilmesi.
  **PAKETLER AYRI BİR HAL:** paket birden çok ürün taşıyor ve web'de bunun kendi yapısı var
  (`apps/web/lib/storefront/packages.ts` → `inRouteOnly`: kalemlerden biri kargolanamıyorsa paketin
  TAMAMI rota-içine kilitleniyor). Mobil paket kartı/detayı bu kuralı bugün okumuyor.

  **(d) SÜZGEÇ — karar verildi (kullanıcı 09.08, ikinci tur).** İlk turda "web kodunda karşılığı
  bulunamadı" diye yazılmıştı; **o not YANLIŞTI**, aranan ad yanlıştı. Web'de süzgeç TAM kurulu:
  `📍 Adresime gönderilebilir` çipi (`catalog.desktop/mobile.tsx`, üç dilde metin) → URL'de
  `shippable=1` → orkestrasyonun `onlyShippable` süzgeci → **SQL'de** çözülür
  (`ProductService.list`). Yani sunucu tarafı hazır ve keyset sayfalamayla uyumlu; mobil ucu bunu
  bilerek AÇMAMIŞTI (`catalog.ts` künyesi).

  Mobilde kurgu web'in aynısı: kart kendi cümlesini taşır, süzgeç **VARSAYILAN KAPALI** bir çiptir
  ve daraltmayı müşteri seçer. Görünürlük kararı değişmiyor (08.32: hepsi gösterilir, posta kodu
  söylenen CÜMLEYİ değiştirir) — süzgeç müşterinin kendi tercihi, sistemin gizlemesi değil.
  Süzgeç YALNIZ yer eksenini daraltır: tükenmiş ürün listede kalır (o başka bir eksen ve kendi
  işareti var), yoksa çip adının söylemediği ikinci bir daraltma yapardı.

  **Durum (10.08) — KART İŞARETİ + SÜZGEÇ ÇİPİ TAMAMLANDI; paket ve ürün detayı açık kaldı.**

  Yapılanlar:
  · **Kural terfi etti, tek nüsha:** `elsewhereReasonOf` + `ElsewhereReason`
    `packages/helper/src/delivery.ts`e taşındı; `apps/web/lib/delivery/place-types.ts` KÖPRÜ
    (re-export), web'in üç çağıranı dokunulmadan çalışıyor. **Hedef `@lezzet/application` DEĞİL
    `@lezzet/helper` oldu** — ölçüldü: `apps/mobile/package.json` application'a bağlı değil
    (brand · design-tokens · helper · i18n · types) ve bağlanması `@supabase/supabase-js`i RN
    paketine sokardı. `normalizePostalCode`in emsali (denetim A2) birebir aynı.
  · **Uç:** `GET /api/v1/products?shippable=1` açıldı (`apps/mobile-api/src/api/v1/catalog.ts`) →
    orkestrasyonun `onlyShippable`ı, SQL'de çözülüyor. Ad web'in URL'siyle AYNI. Süzgeç yalnız
    rota DIŞINDA uygulanır (`shippableApplies`) — web'in `shippableFilterApplies` ikizi.
    **Canlı ölçüm (uç 3002, seed):** `postalCode=69002` → 114 ürün, sayfada 32 `shipping` + 18
    `elsewhere`; `+shippable=1` → 72 ürün, `elsewhere` sıfır. `postalCode=67000` ve kodsuz istekte
    `shippable=1` sayıyı DEĞİŞTİRMİYOR (114). Guard'sız hâli ölçüldüğünde 67000 de 72'ye düşüyordu
    — o adrese GİDEBİLEN 42 soğuk zincir kalemi gizleniyordu; web'de 08.08'de bulunan arızanın aynısı.
  · **Kart işareti:** `StockMark` (`apps/mobile/src/components/ui/stock-mark.tsx`) — üç ton
    (`info` · `pending` · `blocked`), cümleyi `stockMarkOf` kuruyor
    (`apps/mobile/src/lib/places/place-view.ts` + `messages.json`, üç dil). Katalog ızgarası
    (`ProductPhotoCard`, durum rozetinin altındaki yuvada) ve vitrin rayı (`ProductCircleCard`,
    adın altında) AYNI komponenti çiziyor. Rota dışı `elsewhere` kartı soluyor (`dimmed`) ama
    basılabilir kalıyor — detay o hâlde tek çıkış.
  · **Çip:** katalog başlığında, kategori rayının altında, YALNIZ rota dışında görünür
    (`shippableChipVisible`), varsayılan KAPALI; yer rota içine dönerse süzgeç kendiliğinden kapanır.
    Metin web'inkiyle aynı üç dilde.

  **Durum (10.08, ikinci tur) — PAKET EKSENİ DE KAPANDI.** Kullanıcı bulgusu: paketler sayfası
  yere KÖRDÜ — o adrese gidemeyecek paket de normal bir kart olarak görünüyordu. Ölçüldü:
  `GET /api/v1/packages?locale=tr` yalnız beş alan döndürüyor (slug · ad · fiyat · kalem sayısı ·
  görsel) ve `?postalCode=` okunmuyordu bile (69002 ile de aynı üç kart).

  Yapılanlar:
  · **Sözleşme:** liste kartı (`HomePackageSchema`) ve detay (`PackageDetailSchema`) `soldOut` +
    `route` kazandı (`CartLineRouteEnum.nullable()`). İki eksen AYRI: `soldOut` ağ geneli
    ("hiç var mı", C3), `route` yere bağlı ("bana nasıl gelir"); `route: null` = yer bilinmiyor.
    Rota kilidi (`inRouteOnly`) kartta taşınmıyor — sonucu zaten `not_shippable_here` olarak
    geliyor; kısıtın kendisi detayda `shippable` olarak duruyor.
  · **Uç:** `apps/mobile-api/src/api/v1/packages.ts` liste ve detayda `?postalCode=` okuyup
    `readPlace` ile çözüyor, kapıya `place` geçiyor. `readPackageCards` artık kartı KENDİ kurmuyor;
    `listStorefrontPackages` / `getPackagesByIds` kapılarından alıyor (vitrin şeridi iki adım:
    işaret süzgeci `isFeatured` ister, kart onu taşımaz — mobilin "işaret yoksa şerit yok" kuralı
    kapının `pickFeatured` yedeğine düşmesin diye). `/home` de aynı `place`i geçiriyor.
  · **Ekranlar:** paket listesi (`screens/packages-list`), paket detayı (`screens/package`) ve
    vitrin paket şeridi (`screens/home`) kataloğun AYNI cümlesini kuruyor — paketin kendi gerçeği
    `packageStockStatus` ile ürün sözlüğüne çevriliyor, cümleyi yine `stockMarkOf` kuruyor
    (ikinci bir sözlük YOK). Solma yalnız FOTOĞRAFA (`PhotoTile.dimmed` + liste kartının kendi
    katmanı), not rozet değil YAZI, "Kargoyla gelir" kartta hiç yazılmıyor.
  · **Bilgi bandı:** `PlaceNoticeBand` katalogdan kite taşındı
    (`screens/customer-kit/place-notice-band.tsx`, metni `lib/places/messages.json`e); paketler
    sekmesi ikinci çağıranı — o sekmeye alt çubuktan DOĞRUDAN gelinebiliyor.
  · **Tükendi:** sözleşme alanı geldiği için liste kartında rozet, detayda kahraman rozeti ve
    tükendi barı çizildi (ekleme düğmesi o hâlde HİÇ çizilmez). "Bu adrese gönderemiyoruz" ekleme
    yolunu KAPATMAZ — yer bir söz, bir filtre değil.
  · **Canlı ölçüm (uç 3002, seed):** `67000` → üç paket de `route=local`. `69002` → *Fıstık
    Sevenler* `shipping` (sessiz; cümle bantta), *Maraş Dondurma Seti* ve *Baklava İkilisi*
    `not_shippable_here` (soluk + "❄ Bu adrese gönderemiyoruz"). Detay ucu aynı ölçütü veriyor
    (`baklava-ikilisi`: `shippable=false`, 67000'de `local`, 69002'de `not_shippable_here`).
  · **Test borcu:** `packageStockStatus`, paket kartının solma/not kapısı ve bandın ikinci
    çağıranı için birim testi yazılmadı (görev kapsamı dışı).

  Açık kalanlar (bu yüzden `[~]`):
  · ~~**Paketler** — `inRouteOnly` kuralı mobil paket kartı/detayında okunmuyor~~ → 10.08'de
    kapandı (üstteki ikinci tur).
  · **Ürün detayı** — bugün yalnız ürün düzeyli "kargoya verilmez" künyesi var (`product-noship`);
    yere bağlı işaret (`stockMarkOf`) ve "haber ver"in rota dışında BÖLGE notuna dönmesi yazılmadı.
  · **Sözleşme dosyası** — `packages/types/src/contracts/catalog-api.schema.ts`e sorgu alanı
    EKLENMEDİ: `contracts/` bugün yalnız CEVAP zarflarını tutuyor, orada tek bir sorgu şeması yok
    (ölçüldü). Sorgu şeması ucun kendi dosyasında kaldı — tek tüketicisi olan yeni bir desen açmak
    knip'in ölü göreceği bir sözleşme üretirdi.
  · **Test borcu** — `StockMark`, `stockMarkOf`, `placeModeOf`/`shippableChipVisible` ve çipin
    görünürlüğü için birim testi yazılmadı (görev kapsamı dışı bırakıldı).

- [x] (21.21) **Mobilden verilen siparişte "siparişiniz alındı" maili GİTMİYORDU — bildirim
  gönderimi `@lezzet/application`a terfi etti (10.08).**
  `touches: packages/application/src/{order/{notify,notification-data,effects,transition}.ts,feedback/points.ts}, packages/helper/src/format.ts, apps/web/lib/{order/{notify,notification-data}.ts,feedback/points.ts,storefront/format.ts}, apps/mobile-api/src/api/v1/checkout.ts`

  **Ölçülen arıza.** Üç geçiş mail doğuruyor (`confirmed` · `out_for_delivery` · `delivered`) ve
  yan etkiler `transitionOrder`ın `OrderEffects` PORTUNDAN akıyor. Web köprüsü portu varsayılan
  olarak dolduruyordu; `apps/mobile-api/src/api/v1/checkout.ts` ise `placeOrder`a `effects`
  GEÇMİYORDU. Sonuç tek bir dala saklanmış bir ayrışmaydı: **mobilden verilen KAPIDA ÖDEME /
  VADELİ siparişte onay maili hiç gitmiyor**, online ödemede gidiyordu (Stripe webhook'u web
  köprüsünden geçiyor). Engel `notifyOrderStatus` + `buildOrderNotification`ın `apps/web` içinde
  olmasıydı — `apps/mobile-api` onları import edemez.

  **Ölçüm, terfi kararını değiştirdi.** `effects.ts`in eski künyesi "`@lezzet/notify` +
  `@lezzet/i18n` bu paketin bağımlılığı olamaz" diyordu; ölçüldü ve YANLIŞ çıktı:
  `@lezzet/notify`ın npm kapanışı (`resend`, `@react-email/*`, `react`) `@lezzet/email` üzerinden
  ZATEN `@lezzet/application`daydı (paket OTP mailini oradan gönderiyor, `auth/otp.ts`) ve
  `@lezzet/i18n`ın hiç bağımlılığı yok. Ayrıca `apps/mobile` (RN paketi) `@lezzet/application`a
  hiç bağlı değil — "RN ağacı" kısıtı bu paket için bağlayıcı değil. İki `workspace:*` satırı
  eklendi, **yeni npm paketi girmedi**.

  Yapılanlar:
  · `apps/web/lib/order/notification-data.ts` → `packages/application/src/order/notification-data.ts`
    (`db` çağırandan; `serviceDb()` içeride çağrılmıyor). Web dosyası KÖPRÜ.
  · `apps/web/lib/order/notify.ts` → `packages/application/src/order/notify.ts`. Web dosyası KÖPRÜ.
    Hata kaynağı `SOURCES.webAction` → `SOURCES.applicationOrder` (kapıyı iki yüzey çağırıyor).
    `notifier` tekili yerine gönderim anında `defaultNotifier()` — o fonksiyonun kendi künyesindeki
    "modül yüklenirken donmuş liste" uyarısı gereği.
  · `formatShortDate` → `packages/helper/src/format.ts` (`formatPrice`in yanına, `INTL_LOCALE`
    ikinci kez yazılmadı). Web `lib/storefront/format.ts` yeniden dışa veriyor — o dosyanın künyesi
    bu adımı "ikinci tüketen doğunca" diye zaten söz vermişti.
  · `rewardCompletedOrder` + `awardReferralPoints` → `packages/application/src/feedback/points.ts`
    (puan yazım çekirdeği `awardPoints` zaten oradaydı; yeni bağımlılık gerekmedi). Web KÖPRÜ.
  · `apps/mobile-api/src/api/v1/checkout.ts`: `mobileOrderEffects(db)` portu geçiliyor
    (webin `webOrderEffects`inin ikizi). `BEKLEYEN(21.13)` işareti SİLİNDİ — kapandı.
  · **Port KALDI, varsayılan yapılmadı:** port kayıt yeri değil KARAR yeridir; varsayılan olsaydı
    fikstür kuran her `transitionOrder` çağrısı mail göndermeye kalkardı.

  Açık kalanlar:
  · **`BEKLEYEN(14.11)` yerinde duruyor:** `/api/v1/courier/*` (`stops/:orderId/deliver`,
    `undelivered`) hâlâ `effects` geçmiyor — mobil kuryenin teslim ettiği siparişte "teslim edildi"
    maili gitmiyor ve sipariş puanı yazılmıyor. Engel kalktı; kalan iş aynı nesneyi o çağrılara da
    geçirmek. Kurye ucu bu görevin kapsamı dışında bırakıldı (ayrı kapı, ayrı ölçüm).
  · **Test borcu:** terfi edilen kapıların paket düzeyinde entegrasyon testi yazılmadı; web'in
    mevcut `apps/web/lib/order/{notify,notification-data}.test.ts` dosyaları köprü üzerinden aynı
    gövdeyi koşuyor (imza korundu, testler değişmedi). Mobil ucun `effects` geçtiğini doğrulayan
    test yok.
  · **`awardPoints` İKİ NÜSHA:** web `lib/feedback/points.ts` kendi `awardPoints`/`pointsSettings`
    ikilisini sürdürüyor (ziyaret · elle düzeltme · kupon çevrimi için), paket ayrı bir nüsha
    tutuyor. Bu terfi öncesinden gelen bir borç; kapanışı modül 17'nin işi.

- [x] (21.22) **SEPET SUNUCUYA BAĞLANDI — niyet cihazda, PARA sunucuda (09.08–10.08).**
  `touches: packages/types/src/contracts/cart-api.schema.ts, packages/database/src/services/cart.service.ts, apps/mobile-api/src/api/v1/{cart,cart-view}.ts, apps/mobile/src/{lib/api/cart.ts,screens/{customer-kit/cart-store.ts,cart/**}}`

  Sepet iki yüzeyde PAYLAŞILIR (kullanıcı kararı 09.08): telefonda doldurulan sepet webde açılır.
  Kabı zaten vardı (`cart` tablosu, `customerId` anahtarlı — 07.1); eksik olan mobilin o kaba
  açılan kapısıydı. Beş uç + misafirin oturumsuz görünüm ucu (`POST /api/v1/cart/view`).

  **Tutarı İSTEMCİ HESAPLAMAZ.** Ad, fiyat, indirim, yol, asgari sepet, ücretsiz kargo eşiği —
  hepsi `getCartView` kuralından gelir ve web sepeti AYNI kapıyı çağırır. Misafir de sunucudan
  okur; yoksa aynı sepet misafirken bir, giriş yapınca başka bir tutar gösterirdi. Ekrandaki
  uydurma kupon sözlüğü ve asgari tutar sabiti (`cart-local-rules.ts`) SİLİNDİ.

  **Ölçülen iki arıza kapandı:**
  · *Tarif sayfası üç malzemeden birini ekliyordu.* Sepet tek satırda yaşıyor (`cart.items` jsonb)
    ve her ekleme onu okuyup geri yazıyor; "Malzemeleri sepete ekle" üç AYRI istek atıyordu ve
    eşzamanlı okumalar birbirini eziyordu. Ölçüm: sırayla 3 satır, eşzamanlı **1–2 satır**,
    hangisinin kalacağı belirsiz — bildirim ise "3 kalem eklendi" diyordu. Çare "istekleri sıraya
    diz" DEĞİLDİ (kural her çağrı yerinde hatırlanmak zorunda kalırdı): gövde artık HER ZAMAN
    liste, tek ürün bile. `CartService.addItem`/`takeOver` tek gövdede birleşti — ikisi zaten aynı
    birleştirmeyi iki kez yazıyormuş. Ölçüm sonrası: tek istekte 3 satır, adetler yerinde.
  · *Paket satırı sunucuya yazılamıyordu.* Sebep tek bir alandı: `PackageDetailSchema` paketin
    uuid'sini taşımıyordu. Sonuç sessizdi — uygulamadan eklenen paket cihazda kalıyor, sunucunun
    çözdüğü toplama hiç girmiyordu. Yazma gövdesi ayrık birliğe çevrildi (`kind: 'variant' |
    'bundle'`), paket çözüm kapısı terfi etti. Ölçüm: aynı satır önce `ad:"" · fiyat:null ·
    engelli · toplam 0`, sonra **"Baklava İkilisi" · 20,24 € · engelsiz**.

  **Durum:** çalışıyor, canlı doğrulandı. Test borcu: uç entegrasyonu (beş uç × birleşme/silme/
  parti ayrımı/devir), `cart-store` birim (iyimser yazım, ret geri alması, yarış sayacı, 401 dalı),
  sepet ekranı (bölünmüş sepet başlıkları, kupon ret cümleleri).

- [x] (21.23) **SİPARİŞ VERİLEBİLİYOR — checkout uçları + sipariş açma + yerel ödeme (10.08).**
  `touches: packages/types/src/contracts/checkout-api.schema.ts, packages/application/src/order/**, packages/application/src/delivery/places.ts, apps/mobile-api/src/{lib/stripe.ts,api/v1/{checkout,router}.ts}, apps/web/lib/order/**`

  **Kural iki yüzeyde TEK.** Sipariş zinciri `apps/web`ten `@lezzet/application`a terfi etti — yer
  çözümü · teslimat · ödeme seçenekleri · stok rezervasyonu · taslak sipariş · checkout anlık
  görüntüsü · onay akışı (`placeOrder`) · ödeme oturumu. Web dosyaları KÖPRÜ; `apps/web`in çağrı
  yerleri değişmedi. Sağlayıcı istemcisi PAKETE GİRMEDİ (`CheckoutSessionCreator` portu) — `stripe`
  npm paketi `@lezzet/application`ın bağımlılığı olamaz.

  İki uç: `GET /api/v1/me/checkout` (adres seçilince yol · uygun günler · kargo ücreti · açık ödeme
  yolları · toplam, TEK turda) ve `POST /api/v1/me/checkout/order`. Gövde YALNIZ seçim taşır —
  tutar, kargo, indirim, teslimat türü istemciden hiç kabul edilmez.

  **RET BİR HATA DEĞİL, CEVAPTIR:** on beş adlı hâl `200` ile ve `data`da döner, çünkü her biri
  müşteriden BAŞKA bir şey istiyor ve çoğu yapısal ayrıntı taşıyor (hangi satır engelli, hangi
  üründen kaç kaldı, fiyat neyden neye çıktı). Tek "olmadı"ya indirgemek nedeni yutmak olurdu.

  **Canlı ölçüm (kapıda ödeme):** `status: placed` · sipariş `confirmed` · referans **LA-26-6VFJXA**
  doğdu · 2 kalem bağlayıcı fiyatıyla yazıldı · 2 stok rezervasyonu açıldı · sepet boşaldı. Aynı
  `idempotencyKey` ile ikinci istek YENİ sipariş açmadı, açılmış olanı döndürdü. Anahtarsız online
  yol `payment_unavailable/provider_unavailable` döndü — sessiz başarı yok.

  **Yol boyunca kapatılan PARA kusuru:** siparişi açan kapı ödeme seçeneklerini KAPSAMSIZ
  çağırıyordu (`country`/`zoneId`/`warehouseId` geçmiyordu). Sepet bloğu kapsamlı ayarı okuyor,
  **siparişe yazılan kargo ücreti** global değeri okuyordu. Veride gerçek karşılığı var (ölçüldü):
  `shipping_fee_cents` global 7,90 € ⟷ **DE 12,90 €**; `min_basket_cents` **b2b 120 €** ⟷ zone
  Illkirch 45 €. Yani Alman müşteriye 5 € eksik kargo kesiliyor, toptancının asgari sepeti hiç
  uygulanmıyordu — `settings-keys` künyesindeki "sepette bir sayı, kasada başka sayı" arızasının
  ikinci yarısı. Üç eksen de geçildi.

  **Durum:** uçlar çalışıyor ve ölçüldü. **EKRAN hâlâ sahte veride** (`checkout-fixture.ts`) —
  bağlanması sürüyor. Test borcu: uç entegrasyonu (anlık görüntü + on beş ret hâli), idempotency,
  `lib/stripe` portunun birim testi.

- [x] (21.24) **Ürün ve paket detayında GÖRSEL GALERİSİ (kullanıcı isteği 09.08).**
  `touches: apps/mobile/src/{components/ui/photo-gallery.tsx,screens/{product,package}/**}, design/KARARLAR.md`

  Veri ZATEN geliyordu: `CatalogProductDetailSchema.gallery` sözleşmede vardı, uç dolduruyordu
  (`catalog.test.ts` üç görselli ürün için doğruluyor) — **ekran onu atıyordu**, tek görsel
  çiziyordu. Yeni `PhotoGallery` (RN `FlatList`, yeni kütüphane YOK) ürün detayının kahramanına ve
  paket detayının kutusuna girdi; yerleşim, degrade, düğmeler, rozetler DEĞİŞMEDİ. Tek görselde
  şerit ve gösterge çizilmez (sözleşmenin kendi kuralı), görselsizde yer tutucu kalır. Paket şeridi
  paketin KENDİ kapağıyla başlar, kalem görselleriyle sürer — paket satılan şeydir, kalemler içeriği.
  Tasarımda karusel yoktu; sapma `design/KARARLAR.md`ye yazıldı.

  **Durum:** çalışıyor. Test borcu: galeri kaydırma + tek görsel dalı + erişilebilir ad.

- [x] (21.25) **FRANSIZ ADRES ARAMASI (BAN) hesap adres formuna bağlandı (10.08).**
  `touches: apps/mobile/src/{screens/customer-kit/use-address-search.hook.ts,components/ui/suggestion-list.tsx,screens/customer-kit/**}, design/KARARLAR.md`

  Paket (`@lezzet/address-fr`) 09.08'de yazılmıştı ama **hiçbir tüketicisi yoktu** — ölçüldü, sıfır
  çağıran. Yani araç vardı, iş yarım kalmıştı.

  **Kapı DEĞİŞTİ ve kurum DEĞİŞMEDİ:** `api-adresse.data.gouv.fr` kullanımdan kaldırıldı (resmî
  kapanış "Ocak 2026 sonu", o tarih GEÇTİ). Yerine IGN **Géoplateforme** (`data.geopf.fr/geocodage`).
  Veriyi üreten kurumlar aynı: Ministère de la Transition Écologique · IGN · ANCT; lisans **Etalab
  2.0**; sınır **50 istek/IP/sn**; anahtar yok. Yani hâlâ Fransız devletinin resmî adres tabanı (BAN).

  Çağrı CİHAZDAN yapılıyor: sunucudan yapılsaydı bütün müşteriler tek IP'nin sınırını paylaşırdı.
  300 ms parametrik gecikme, 40'lık önbellek, yarış sayacı, dört adlı retin ayrı karşılığı, Etalab
  künyesi listenin içinde. Elle yazma yolu KAPANMADI — servis düşse de form çalışır.
  Canlı ölçüm: kapı `HTTP 200 · 84 ms`, alan adları şemayla birebir.

  **Durum:** çalışıyor. Test borcu: gecikme + yarış sayacı + dört ret dalı + önbellek.

- [x] (21.26) **KÜNYE TAMAMLAMA AKIŞI — ad · adres · telefon (kullanıcı kararı 10.08).**
  `touches: apps/mobile/src/{screens/profile-setup/**,screens/customer-kit/{address-form.tsx,address-sheet.tsx,use-me.hook.ts},app/{profile-setup.tsx,cart.tsx,_layout.tsx},screens/login/**}`

  **Ölçülmüş arıza:** e-posta/OTP ile açılan hesapta müşterinin ADI hiç dolmuyor — profil satırını
  açan tetik adı sağlayıcı künyesinden okuyor (`raw_user_meta_data`) ve OTP yolunda orası boş.
  Telefon ve adres de boş kalıyordu ve uygulama hiçbir yerde sormuyordu. Onboarding soramaz: o
  giriş ÖNCESİ akıştır ve girişsiz de geçilebiliyor (kullanıcının kendi ölçümü).

  Akış üç adımlı ve **her adım kendi başına kaydeder** (ad/telefon `PATCH /me`, adres
  `POST /me/addresses`) — toplu kaydetseydik ikinci adımda uygulamayı kapatan müşterinin adı da
  kaybolurdu. Adım listesi açılışta kurulup DONDURULUR: yarıda bırakılan akış bir sonraki açılışta
  yalnız eksik kalanı sorar. Adres formu kitten (`customer-kit/address-form` — hesap ekranı,
  sipariş ekranı ve bu akış AYNI dosyayı çağırır; dördüncü bir form yazılmadı). Görsel dil
  onboarding'in adım deseninden; sapma `design/KARARLAR.md`'ye yazıldı.

  **TETİK DEĞİŞTİ (kullanıcı kararı 10.08 — ikinci tur):** ilk hâli kök layout'a takılıydı ve
  açık oturumla uygulamayı AÇAN herkesin önüne çıkıyordu. Kullanıcının itirazı: açılış künye
  sorusunun yeri değil, "elimi kolumu bağlıyor". Soru artık anlamlı olduğu üç anda soruluyor —
  ① giriş biter bitmez (`login-screen`), ② OAuth dönüşünde (`auth-callback-screen`),
  ③ **sepete girerken** (`app/cart.tsx`; sipariş yolunun başı — ad posta etiketine, telefon
  kuryeye gider). Akış bitince müşteri BAŞLADIĞI yere döner (`next` parametresi).

  Kök kapının ikinci bedeli de böyle kapandı: kanca kökte dururken `useMe`nin oturum aboneliği
  uygulamanın TAMAMINA yayılıyor, ziyaretçiye açık yollar (davet linkiyle gelen geri bildirim —
  kimlik token'ın KENDİSİ) oturum altyapısına bağlanıyordu. `useMe`nin geçici `enabled` kapısı da
  gereksiz kaldı, söküldü.

  Ölçüt **ad + telefon**; adres BİLEREK ölçütte değil çünkü akışın adres adımı "Sonra
  ekleyeceğim" ile geçilebiliyor — ölçüte konsaydı, adresi erteleyen müşteriye akış her sepete
  girişte yeniden açılırdı (nag döngüsü). Adres akışın İÇİNDE sorulur, sipariş ekranı da kendi
  çekmecesiyle oracıkta ister.

  **Yol boyunca kapatılan iki kusur:** (a) giriş ve OAuth dönüşünde profil okuması patlarsa ekran
  doğrulanmış hâlde ASILI kalıyordu — iki yolda da açık çare kondu (giriş ekranı kapanır, dönüş
  hesaba devam eder); (b) `auth-callback-screen.test.tsx` bir süredir kırmızıydı ve sebebi
  ölçüldü: testin supabase mock'unda `getSession` yoktu, yani test gerçek akışı değil kendi
  kurgusunun patlamasını ölçüyordu. Mock tamamlandı.

  **Durum:** çalışıyor; mobil paket **71/71 dosya, 495/495 test** (önceki tek kırmızı da kapandı),
  `typecheck` + `lint` temiz. Yeni testler: künye eksikse giriş ekranı kapanmaz/akışa gider, OAuth
  dönüşü hesaba değil akışa gider. Test borcu: sepet rotasının kapısı ve akışın adım adım koşusu.

- [x] (21.27) **BÖLGE DIŞI MÜŞTERİNİN İKİ SORUSU — bant kapıya döndü, "nerelere gidiyoruz" sayfası açıldı (10.08).**
  `touches: apps/mobile/src/{screens/{customer-kit/{place-notice-band.tsx,postal-code-sheet.tsx},delivery-zones/**,home/home-screen.tsx},app/delivery-zones.tsx,lib/{api/places.ts,places/messages.json}}, apps/mobile-api/src/api/v1/places.ts, packages/{application/src/delivery/zones.ts,database/src/services/delivery-zone.service.ts,types/src/{contracts/place-api.schema.ts,entities/delivery-zone.schema.ts}}, supabase/migrations/0014_delivery_zone.sql, scripts/seed/delivery.ts`

  **Ölçülmüş arıza (cihazdan):** bandın "Buraya da gelin" düğmesi HER seferinde kırmızı dönüyordu —
  *"Kaydınızı alamadık. Bağlantınızı kontrol edip tekrar deneyin."* Sebep taşıma değildi:
  ```
  ÖNCE:  POST /places/notice            → HTTP 400 {"error":"invalid_locale"}
  SONRA: POST /places/notice?locale=tr  → HTTP 200 {"status":"email_required"}
  ```
  Uç dili zorunlu tutuyor (kayıtsız kişiye yanlış dilde haber gitmesin diye), istemci hiç
  göndermiyordu. Yani misafire e-posta soran adım ZATEN kuruluydu, oraya hiç ulaşılamıyormuş; hata
  cümlesi de yanlış yeri gösterip teşhisi geciktiriyordu. Dil imzaya kondu, gövdeye değil —
  gövdeye konsaydı sözleşme yüzey diline bağlanırdı (katalog · sepet · sipariş de sorguda taşıyor).

  **Kullanıcının iki sorusu, iki çıkış.** Bant eskiden yalnız kapıyı kapatıyordu; müşterinin elinde
  tek hareket vardı (talep bırakmak). *"On posta kodu denedim, hiçbirine gitmiyorsunuz — siz nereye
  gidiyorsunuz?"* Metin de kısaldı (iki cümle → tek cümle: başlık zaten "aracımız gitmiyor" diyor,
  gövdede tekrar etmek altındaki eylemleri okunmaz kılan bir duvar kuruyordu).

  **YERLEŞİM İKİ TURDA OTURDU (kullanıcı cihazda gördü).** İlk hâlde üç eylem kutunun ALTINA,
  alt alta düşüyordu ve satır içi e-posta bloğuyla birlikte ürün kartlarını ekranın yarısına
  itiyordu — kullanıcının sözü: *"üç tane metin butonu var, alt alta, gerçekten kötü görünüyor"*.
  Son hâl: kutunun İÇİNDE cümle + **iki metin butonu** (`Buraya da gelin` · `Posta kodunu değiştir`),
  iki eşit ve ortalanmış sütun; birincil düğme YOK, kutunun altına taşan parça YOK.
  **"Nerelere gidiyorsunuz?" banttan kalktı** ve posta kodu çekmecesinin içine girdi (kullanıcı
  gerekçesi: kodu denemekle "nereye gidiyorsunuz" aynı sorunun iki yüzü). Çekmecenin üç çağıranı
  var (vitrin · bant · bölgeler sayfası) ve bölgeler sayfasından açılanda bağlantı ÇİZİLMEZ —
  müşteriyi zaten bulunduğu sayfaya yollayan ölü bir kapı olurdu. `PostalCodeSheet` vitrinden KİTE
  taşındı, ikinci nüsha yazılmadı.

  **TALEP AKIŞI ÇEKMECEDE, VE ARTIK HESAP AÇIYOR (kullanıcı kararı 10.08 — bilinçli dönüş).**
  Satır içi e-posta alanı kalktı; "Buraya da gelin" bir çekmece açıyor: e-posta → altı haneli kod →
  oturum → talep. Kullanıcının iki gerekçesi: *"zaten alttan çekmece çıkarıp posta kodu
  alabiliyoruz, neden mail adresini de orada yapmayalım"* (tutarlılık) ve *"mail + OTP olmalı,
  kullanıcı hemen oluşmalı"*. **Bandın eski hükmü — "giriş duvarı KURULMAZ, vazgeçmeye en yakın anda
  ikinci engel çıkarılmaz" — bilerek terk edildi**; künyede silinmedi, üstü çizilip yeni karar
  bedeliyle yazıldı: talep sayısı düşer, ama gelen her talep doğrulanmış bir hesaba dönüşür.
  Yeni altyapı YOK — giriş ekranının yolu (`requestOtp`/`verifyOtp` → `generateLink` kullanıcı yoksa
  yaratıyor, profil tetiği künyeyi kuruyor), kod alanı ve 429 bekleme sayacı yeniden kullanıldı;
  auth hata sözlüğü iki ekranın ortak yerine çıkarıldı (`lib/auth/error-text.ts`). Doğrulamadan
  sonra e-posta GÖVDEDE GİTMEZ, sunucu oturumdan çözer.

  **`delivery_zone.public_name` (kullanıcı kararı 10.08).** Sayfa şehir adı gösterecekti ama veride
  şehir adı YOK; ölçüm hem bölge hem depo adının iç etiket olduğunu gösterdi (`Kehl (DE) —
  hazırlanıyor`, `Colmar — pilot depo (kapalı)`, `Test deposu MSMY26851`). Bugün aktif olanların adı
  temiz ama garantisi yoktu. Yeni kolon nullable ve **`null` = bölge müşteri listesinde hiç
  görünmez**; varsayılanı bilerek `name`e düşürülmedi — sessiz varsayılan, kaçınılmak istenen
  sızıntının ta kendisi olurdu. Aynı ölçüm GRUPLAMAYI da eledi: grup başlığının tek kaynağı depo
  adıydı, o da iç etiket; üstelik aktif bölgelerin hepsi tek depoda, yani gruplama tek başlıklı bir
  liste üretirdi. İkinci depo açılınca bilinçli kararla eklenir.

  Okuma `@lezzet/application`da (`delivery/zones.ts`): süzgeç veritabanında (aktif + adı yazılmış),
  sıra `localeCompare(fr)` ile ÇAĞIRANDA — `order by public_name` sırayı harmanlama ayarına
  bırakırdı (`C`'de aksanlı ad Z'den sonra gelir) ve yerelde bir sıra, sunucuda başka sıra çıkardı.
  Aynı ad iki kez basılmaz: `public_name` benzersiz değil, iki rota bölgesi aynı şehri ilan edebilir.
  Uç dilsiz ve gerekçesi künyede: dönen şey çeviri değil ÖZEL ADDIR.

  **Yol boyunca kapatılan kusur:** `publicName` şemaya önce ZORUNLU yazıldı ve uygulamayı KIRDI —
  greenfield'da migration doğrudan düzenleniyor ama yerele inmesi `db:refresh` istiyor ve o
  kullanıcının kararı; aradaki pencerede kolon yok, PostgREST anahtarı döndürmüyor, Zod her
  `delivery_zone` okumasını reddediyordu. Sonuç cihazda görüldü: yer çözümü 500, katalog "Bağlantı
  kurulamadı" (`GET /products` 200 — arka uç ayaktaydı). Alan `.default(null)` oldu; bu bir şey
  gizlemiyor (kolon nullable, `null` zaten "adı verilmemiş" demek ve sonucu aynı) ve kayma yine
  doğru yerde yakalanıyor: `docs:check` migration ↔ Zod alanlarını karşılaştırıyor.

  **Durum:** kod tamam, mobil paket **74/74 dosya, 513/513 test**, typecheck + lint temiz.
  Cihazda doğrulandı (Android): bant tek blok hâlinde çiziliyor, "Buraya da gelin" çekmecesi açılıyor.
  **Kolon yerel veritabanında YOK** — `db:refresh` kullanıcının kararı; o güne kadar uç 500 dönüyor
  (`app.onError` kaydediyor, sessiz düşme yok) ve ekran hata hâlini çiziyor. Test borcu: ucun
  entegrasyon vakası (üç aktif+adlı bölge, pasif Kehl listede yok) — denetim penceresinde.
  Operasyon şeridine not düşüldü: bölge formunda `public_name` alanının karşılığı yok.

- [x] (21.28) **ADRESİN ÜLKESİ POSTA KODUNDAN GELSİN — bugün her adres sessizce FRANSA (kullanıcı sorusu 10.08).**
  `touches:` `packages/types/src/contracts/address-api.schema.ts` · `apps/mobile-api/src/api/v1/addresses.ts` ·
  `apps/mobile/src/screens/customer-kit/address-form.tsx`

  **Ölçüldü (10.08):** `AddressWriteSchema` bir `country` alanı TAŞIMIYOR ve künyesi *"`postalCode`
  beş haneli **Fransız** kodu"* diyor; `address.country` kolonu veritabanında `default 'FR'`. Alman
  posta kodu da beş haneli olduğu için `^\d{5}$` onu kabul eder ve satır **Fransa olarak yazılır**.

  **Bedeli parasal, görüntü değil:** ülke ayar kapsamının ekseni — DE kargo tarifesi `1290`, FR/global
  `790`; DE ücretsiz kargo eşiği `9000`, global `6000` (`settings` ölçümü). Almanya'ya giden bir
  adres Fransa sanıldığı sürece müşteriden EKSİK kargo alınır ve eşik yanlış ölçülür.

  **Cevap zaten veride:** `postal_code_place` (country, postal_code) çiftini tutuyor — 6065 FR +
  10813 DE satır. Kullanıcı önerisi: posta kodu serbest metin olarak YAZILMASIN, bu tablodan
  SEÇİLSİN; ülke ve şehir seçimin kendisinden gelsin. Fransa'da BAN otomatik tamamlaması zaten
  dolduruyor (21.25); eksik olan Almanya yolu — orada müşteri elle yazıyor ve şehir adını da kendi
  uyduruyor.

  Sıra: iki-sipariş bölünmesi senaryosundan SONRA (kullanıcı kararı 10.08).

  **Durum (10.08 · tamamlandı).** Kod artık listeden seçiliyor; ülke ve şehir seçimin kendisinden
  geliyor. Yapılanlar: `GET /api/v1/places/suggest` (kapı `suggestPlaces`, servis `searchPrefix`
  üstünde) · `AddressWriteSchema.country` (opsiyonel, **beyan değil seçim** — kapı `postal_code_place`
  ile doğruluyor) · `MeAddressSchema.country` (düzenlemede seçim kaybolmasın) · formda kod combo
  box'ı + çok yerleşimli kodda ŞEHİR SEÇİCİ · gecikme/önbellek/yarış kararları BAN aramasıyla ortak
  çekirdeğe alındı (`use-debounced-lookup.hook`, ikinci nüsha yazılmadı).

  **Ölçümün YARISI çürüdü, yazıldığı gibi bırakılmıyor:** üstteki "bedeli parasal" gerekçesi bugünkü
  veride GEÇERSİZ — `KEHL` deposu `is_active=t` ama **`ships_online=f`**, yani Almanya'ya kargo
  çıkışı yok ve DE tarifesi hiç uygulanamıyor (`findShippingWarehouse`). Para etkisi sıfır. Ayakta
  kalan gerekçe başkası ve daha büyük: **610 kod iki ülkede birden geçerli** (ölçüldü, `67240` →
  Bischwiller FR / Bobenheim-Roxheim DE) ve elle yazıldıklarında motor `ambiguous` dönüyor — sepetin
  yeri hiç çözülemiyor (`UNRESOLVED_PLACE`). Seçim bu belirsizliği doğmadan kapatıyor.

  **Geri alınan bir tasarım (kullanıcı itirazı 10.08):** ilk yazımda satır bir `serviced` bayrağı
  taşıyor, form da "buraya henüz teslim edemiyoruz" diyordu; ülke çözümü de `resolvePlaceForPostalCode`
  üzerinden yapılıyor ve kapı çözemediği kodda kaydı REDDEDİYORDU. Kullanıcının sorusu haklıydı —
  *"depoların hizmet ettiği posta kodlarıyla müşterinin adres girmesinin ne alakası var"*: adres
  defteri hizmet alanını bilmez, o soru sipariş anının. Depo okuması, `serviced` alanı ve her iki ret
  (`country_required`, `unknown_postal_code`) söküldü; ülke artık `postal_code_place`ten DOĞRUDAN
  çözülüyor (`activeCountries` süzgeci yok) ve çözülemezse alan hiç yazılmıyor — kayıt geçiyor.

  **Cihazda ölçüldü (10.08):** `672` → sekiz aday · `67240` → iki ülke yan yana · FR seçimi → şehir
  boş + yedi yerleşim listesi · DE seçimi → şehir doldu. Kayıtlar: `TestDE 67240 Bobenheim-Roxheim
  **DE**`, `TestBerlin 10115 Berlin **DE**` — ikisi de hizmet alanımız dışında ve ikisi de sorunsuz
  kaydedildi (test satırları sonra silindi).

- [ ] (21.29) **SİPARİŞTEN SONRA DÖRT AÇIK — sepet duruyor, puan uydurma, yenileme eksik/renksiz (kullanıcı bulgusu 10.08).**
  `touches:` `packages/application/src/order/checkout-draft.ts` · `apps/mobile/src/screens/checkout/*` ·
  `apps/mobile/src/screens/account/*` · `apps/mobile/src/components/ui/*`

  **(a) Sipariş verilince sepet BOŞALMIYOR — ölçüldü.** `checkout-draft.ts`te `cartService`in tek
  yazması `replace(...)` ve o da YALNIZ `price_changed` ret dalında (satır 466); başarılı siparişte
  sepete hiç dokunulmuyor. Üstelik `checkout-screen.tsx:390` künyesi *"sunucu o siparişin
  kalemlerini zaten düşürdü (`placeOrder`)"* diyor — **bu cümle YANLIŞ**, düşürmüyor. Künye önce
  düzeltilmeli: yanlış künye, okuyan ajanı kodu açmadan yanıltıyor (CLAUDE §5).
  Karar gerektiren yanı: iki gruplu sepette yalnız SİPARİŞE GİREN kalemler düşmeli, kargo yarısı
  sepette kalmalı — `orderableLines` kapsamı zaten elde.

  **(b) "Puan kazandınız" cümlesi UYDURMA — ölçüldü.** Onay ekranı puanı istemcide hesaplıyor
  (`checkout-screen.tsx:389`, `Math.round(totalCents/100 * POINTS_PER_EURO)`) ama sunucu sipariş
  için puan YAZMIYOR: `awardPoints` yalnız geri bildirim akışından çağrılıyor
  (`feedback/invite.ts:172`). Ölçüm: siparişten sonra `points_entry` satır sayısı **0**, hesap
  ekranı da haklı olarak "0 puan" gösteriyor. İki yoldan biri seçilmeli — ya sipariş gerçekten puan
  yazsın, ya ekran o cümleyi kurmasın. Müşteriye kazanmadığı bir şeyi söylemek en kötüsü.

  **(c) Hesabım ekranında aşağı çekip yenileme YOK.** Vitrin ve Paketler'de var; hesap ekranı
  puan/adres/sipariş özetini taşıdığı hâlde tazelenemiyor (b maddesindeki puanı görmek için bile
  gerekiyordu).

  **(d) Yenileme/yükleme göstergesinin RENGİ tutarsız.** Katalogda yeşil, öteki ekranlarda siyah.
  Tek bir token'a bağlanmalı — hangisinin doğru olduğu tasarım kararı.

- [ ] (21.30) **ADRES FORMUNDA SOKAK ALANINA YAZINCA UYGULAMA YENİDEN YÜKLENİYOR — form kapanıyor (ölçüldü 11.08).**
  `touches:` `apps/mobile/src/screens/customer-kit/use-address-search.hook.ts` ·
  `apps/mobile/src/lib/hooks/use-debounced-lookup.hook.ts` · `packages/address-fr/src/ban-client.ts`

  **Belirti:** yeni adres çekmecesinde sokak alanına yazıldıktan ~3 sn sonra JS bundle baştan
  yükleniyor (`ReactNativeJS: Running "main"`), çekmece kapanıyor ve girilen alanlar kayboluyor.
  Cihazda ÜÇ kez tekrarlandı.

  **Ölçüm — eşik tam olarak BAN sorgu eşiği:**

  | sokak alanına yazılan | sonuç |
  |---|---|
  | `Torstrasse` · `Torstr 5` · `Torstrasse 5` (3+ karakter) | üçünde de yeniden yükleme |
  | `12` (2 karakter) | yeniden yükleme YOK — form ayakta, 6 sn beklendi |

  `MIN_QUERY_LENGTH = 3` (`ban-client.ts:40`): iki karakterde ağa hiç çıkılmıyor. Yani tetikleyen
  şey, sokak alanının dış adres servisine (BAN, `api-adresse.data.gouv.fr`) çıkan isteği.

  **Ne DEĞİL:** logcat'te JS istisnası, `FATAL`, ANR ya da lowmemory-kill YOK; yalnız bundle'ın
  baştan çalışması var. Native çökme olsaydı yığın izi düşerdi.

  **BEKLEYEN(21.30): sebep ölçülmedi, teori kurulmadı.** Şüpheliler sırayla: (1) 21.28'de
  `use-address-search.hook` gecikme/önbellek/yarış mantığı ortak çekirdeğe taşındı — arıza o turda
  görüldü, ilk şüpheli kendi değişikliğimiz; (2) cihazın dış ağa çıkışı sınırlı (mobil veri kapalı)
  ve BAN isteği sırasında Metro websocket'i kopuyor olabilir — o hâlde bu bir GELİŞTİRME ortamı
  davranışıdır, üretimde görünmez. Ayrım tek ölçümle yapılır: BAN çağrısı geçici olarak devre dışı
  bırakılıp aynı metin yazılır. Yeniden yükleme sürerse sebep hook değildir.

  Sıra: 21.29'dan önce (adres kaydetmeyi fiilen engelliyor). Kullanıcı kararı 11.08: 21.28 önce
  commit edilsin, bu ayrı görev olarak açılsın.

Sonraki kalemler (sıra ve kapsam kullanıcıyla): **önce MÜŞTERİ tarafı** (kullanıcı kararı
06.08 — uygulamanın müşteri yüzü mevcut müşteri tasarım deseninin ÇOK BENZERİ kurgulanır:
katalog/sepet/sipariş uçları + ekranları); operasyon ekran seti SONRA ve komple yeniden
kurguyla; push bildirim (notify'a driver — 14 ile koordineli), Maestro E2E hattı,
mağaza/dağıtım süreci. **Müşteri sayfa tasarımına BAŞLAMADAN ÖNCE kullanıcıyla konuşulacak
konular var (kullanıcı notu 07.08) — ekran işine onunla konuşmadan girilmez. Tasarım GELDİ
(07.08): `design/project/Mobil - Musteri v3.dc.html` (~21 ekran; müşteri yüzeyinin tamamı) —
kullanıcı vurgusu: tekrar kullanılabilir komponentlerle inşa.** Giriş modeli kararı için `docs/uygulama/02 §4` (tek kapı,
rol-bazlı yüzey; oturumsuz = müşteri).

**Mobil ekran görüntüleri (kullanıcı kararı 07.08):** tüm mobil uygulama görüntüleri —
E2E/Maestro `takeScreenshot` çıktıları ve web'deki `ui:shot`'un mobil muadili — YALNIZ
`.ui-shots-mobile/` altına düşer (kökte, git dışı; web'in `.ui-shots/`'u her çekimde silindiği
için bilinçli ayrı klasör). Kullanıcı buradan ara ara bakıp uygulamanın durumunu görmek istiyor;
`ui:shot:mobile` aracı kuruldu (08.08 — 21.7 Durum bloğunda; simülatör + dev build ister).
