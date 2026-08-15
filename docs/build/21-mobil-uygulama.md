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
  ~~PROFESYONEL başvuru formu tam çalışır, gönderim ucu yok → `BEKLEYEN(21.14)`~~ → 11.08'de
  kapandı: üç uç da açıldı ve form bağlandı (21.31).
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

- [x] (21.29) **SİPARİŞTEN SONRA DÖRT AÇIK — sepet duruyor, puan uydurma, yenileme eksik/renksiz (kullanıcı bulgusu 10.08).**
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

  **Durum (11.08 · tamamlandı). ÜSTTEKİ (a) VE (b) İDDİALARI ÖLÇÜMLE ÇÜRÜDÜ — düzeltmeleri burada,
  yukarısı tarihsel kayıt olarak duruyor.**

  · **(a) "Sepet boşalmıyor, künye yalan söylüyor" YANLIŞTI.** `placeOrder` → `clearOrderedLines`
    (`place-order.ts:231`) sepeti SUNUCUDA temizliyor, üstelik yalnız SİPARİŞE GİREN kalemleri —
    iki gruplu sepette kargo yarısı yerinde kalıyor. `checkout-screen` künyesi de doğruydu. Gerçek
    açık künyenin ikinci yarısında zaten yazılıydı: **istemci deposunun haberi yoktu.** `cart-store`
    sunucu turunu yalnız dil/yer/oturum değişiminde atıyordu; sipariş bunların hiçbiri değil.
    Çözüm: `refreshCart()` ihraç edildi (`resetCart` DEĞİL — o kargo yarısını da silerdi) ve onay
    yönlendirmesinden önce çağrılıyor.
  · **(b) "Sunucu sipariş puanı yazmıyor" YANLIŞTI.** `rewardCompletedOrder` (`points.ts:166`)
    yazıyor — ama sipariş VERİLİNCE değil, müşterinin ELİNE GEÇİNCE (`delivered`/`completed`), ve
    gerekçesi künyede: *"iptal edilen ya da hiç ödenmeyen bir sipariş de puan öderdi."* Sistem
    doğru; yanlış olan ekranın ZAMAN KİPİYDİ. Metin üç dilde düzeltildi: "+{n} puan kazandınız" →
    **"Teslimatta +{n} puan kazanacaksınız"**. Puan yazan kod eklenmedi — eklemek, teslim edilmemiş
    siparişe ödül vermek olurdu.
  · **(c)** Hesabım'a aşağı-çekip-yenile geldi; üç okuma birden tazeleniyor (kimlik rotadan —
    `onRefreshIdentity`, puan ve adres ekrandan) ama TEK halka dönüyor. `usePoints`/`useAddresses`
    artık `reload(): Promise<void>` veriyor; halka üçünü bekleyip kapanıyor.
  · **(d) Sebep tahmin edilenden farklı çıktı.** Altı ekranın hepsinde `tintColor` VARDI; eksik
    olan `colors` dizisiydi ve o YALNIZ katalogda vardı. `tintColor` iOS'un, Android `colors`
    ister — bu yüzden Android'de yalnız katalog yeşil, ötekiler sistem siyahı dönüyordu. Karar
    tek yere alındı (`components/ui/pull-refresh.ts`) ve yedi ekran ona geçti. Komponent değil
    YAYILAN PROPLAR, çünkü `ScrollView` `refreshControl` elementini `cloneElement` ile klonluyor.

  **Cihazda ölçüldü (11.08):** sipariş `LA-26-H3QUND` verildi → sepet rozeti kayboldu ve `cart`
  satırı DB'de **0**; onay ekranı *"✦ Teslimatta +67 puan kazanacaksınız"* yazdı; sipariş `confirmed`
  (teslim edilmedi), yani puan hâlâ yazılmamış — cümle ile veri uyumlu. Hesabım ve Siparişlerim'de
  yenileme halkası **yeşil** döndü.

  **Cihaz testi gerçek bir hata yakaladı:** yenileme bayrağı (`useState`) ilk yazımda erken
  `return`ların ALTINDAYDI ve ekran *"Rendered more hooks than during the previous render"* ile
  çöküyordu. Birim testler bunu görmedi (misafir dalı ayrı render ağacı); hook en üste taşındı.

- [x] (21.30) **ADRES FORMUNDA SOKAK ALANINA YAZINCA UYGULAMA YENİDEN YÜKLENİYOR — form kapanıyor (ölçüldü 11.08).**
  → **KAPANDI (kullanıcı kararı 15.08): geliştirme ortamının yan etkisi, üretim müşterisini
  ilgilendirmiyor. Tekrar gözlemlenmedikçe BİR DAHA AÇILMAZ.** Aşağıdaki ölçüm zinciri zaten bu
  kapanışın şartını yazmıştı ("üretilemezse kayıt geliştirme ortamının yan etkisi diye kapanır");
  eksik olan tek şey kararın verilmesiydi. Kanıt sırası: BAN çağrısı elendi (ağ turu olmadan da
  tekrarladı) → tetikleyici Metro'nun tazelemesi olarak YAKALANDI (mavi "Refreshing…" şeridi +
  paralel şeridin dosya kayıt zamanları) → 11.08 · 14:1x'te kullanıcı aynı turu yaptı, hiç
  yeniden yükleme olmadı. **`BEKLEYEN(21.30)` işaretleri bu kararla kaldırıldı** — açık bir
  ölçüm borcu kalmadı.
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

  **BAN ÇAĞRISI ELENDİ (ölçüldü 11.08).** `use-address-search.hook`taki `lookup` geçici olarak dış
  servise HİÇ çıkmadan `EMPTY` dönecek şekilde kısaldı (gecikme, önbellek, yarış sayacı ve `setState`
  aynen koştu; yalnız ağ turu yok) ve sokak alanına yine `Torstrasse` yazıldı: **yeniden yükleme
  SÜRDÜ.** Yani tetikleyen şey ne BAN isteğinin kendisi ne de cihazın dış ağa çıkışı. Geçici kod
  ölçümden hemen sonra geri alındı (dosya commit hâlinde).

  Bu, ilk şüpheliyi de zayıflatıyor: BAN kapalıyken `lookup` hemen modül düzeyindeki `EMPTY`
  nesnesini döndürüyor, yani `setState` referansı değiştirmiyor ve React yeni bir render bile
  yapmıyor — buna rağmen yeniden yükleme oluyor. Hook'un state mantığı sebep olsaydı burada
  susması gerekirdi.

  **(O GÜNÜN NOTU — sebep hâlâ ölçülmemişti, teori kurulmuyordu.)** Elenmemiş şüpheliler: (1) sokak
  alanının `content="streetAddress"` beyanı — Android Autofill yalnız BU alanda devrede (posta kodu
  `postalCode`, şehir `city` alanlarında aynı davranış YOK); (2) `SuggestionList`in açılıp kapanması;
  (3) Metro/dev ortamının kendisi — o hâlde üretim derlemesinde görünmez. Sıradaki ölçüm: `content`
  prop'u geçici kaldırılıp aynı metin yazılır. Logcat'te JS istisnası, `FATAL`, ANR, autofill izi ya
  da lowmemory-kill YOK; yalnız `Running "main"` var.

  **Durum (11.08 · 14:1x — BUGÜN ÜRETİLEMEDİ, şüpheli (3) başa geçti):** kullanıcı cihazda aynı işi
  yaptı — yeni adres çekmecesinde sokak alanına **`Eyr` (3 karakter)** yazdı, öneri listesi geldi
  (`Eyres-Moncube 40500` · `Aux Eyres 33410`), bir öneri seçildi ve adres kaydedildi. **Hiçbir
  yeniden yükleme olmadı, çekmece kapanmadı.** Ekran görüntüsü kanıt olarak alındı. Yani yukarıdaki
  "3+ karakterde her seferinde" bağıntısı bugün tutmadı.

  **Şüpheli (3) — Metro/dev ortamı — artık BİRİNCİ, ve mekanizması ölçüldü:** cihazdaki uygulama
  geliştirme yapısı (`dumpsys package com.lezzetanatolia.app` → `flags=[ DEBUGGABLE … ]`, kurulum
  08.08) ve bilgisayarda kod sunucusu **şu an dinliyor** (8081'de node süreci). Bu ikisi varken
  mobil kaynak dosyalarından biri kaydedildiği anda paket tazeleniyor: JS baştan koşuyor
  (`Running "main"`), açık çekmece kapanıyor ve bellekteki oturum deposu sıfırlanıyor. İlk ölçümün
  yapıldığı dakikalarda **üç ajan aynı anda `apps/mobile` altına yazıyordu** — kullanıcının okuması
  da bu yönde (*"muhtemelen sen o testleri yaparken paralel ajan çalışıyordu"*).

  **Yine de KAPATILMIYOR.** İlk ölçüm üç tekrarlı ve iki karakterlik bir kontrol turu içeriyor;
  tazeleme rastgele olsaydı o kontrolün de düşmesi beklenirdi. İki ihtimal de ayakta: (a) tazeleme
  o kontrol turunun 6 saniyesine denk gelmedi, (b) gerçek bir tetikleyici var ve bugün koşulları
  oluşmadı. **Kesin kapanış tek ölçümle gelir:** ağaç sakinken (hiçbir ajan `apps/mobile` altına
  yazmazken) ya da üretim derlemesinde aynı tur tekrarlanır. Üretilemezse kayıt "geliştirme
  ortamının yan etkisi" diye kapanır, üretim müşterisini hiç ilgilendirmez.

  **Durum (11.08 · 14:2x — CANLI TEKRAR, ve tetikleyici ölçüldü):** aynı tur `(21.41)` çalışması
  sırasında bir kez daha yaşandı — sokak alanına yazılırken uygulama baştan yüklendi, çekmece
  kapandı, açılış sekmesine dönüldü. Aynı dakikalarda ekranın tepesinde Metro'nun mavi
  **"Refreshing…"** şeridi yakalandı (ekran görüntüsü var). Dosya kayıt zamanları ölçüldü:
  `catalog-screen.tsx` **14:24:39**, `place-notice-band.tsx` **14:24:09** — ikisi de PARALEL
  ŞERİDİN dosyaları; bu şeridin son kaydı 14:20:39'du. Yani mobil kaynak dosyaları yarım dakikada
  bir kaydediliyor ve her kayıt paketi tazeliyor.
  **Sonuç:** başka bir ajan `apps/mobile` altına yazarken cihazda yapılan HİÇBİR ölçüm güvenilir
  değil. Bu, `(21.30)`'un ilk ölçümündeki üç tekrarı da açıklıyor.
  O gün işaret yerinde bırakılmıştı — kalan tek adım, ağaç sakinken ya da üretim derlemesinde bir
  doğrulama turuydu. **15.08'de kullanıcı o turu beklemeden kapattı** (yukarıdaki kapanış notu):
  belirti bir daha gözlenmedi, ve tetikleyici zaten yakalanmıştı.

  Sıra: 21.29'dan önce (adres kaydetmeyi fiilen engelliyor). Kullanıcı kararı 11.08: 21.28 önce
  commit edilsin, bu ayrı görev olarak açılsın.

- [x] (21.31) **PROFESYONEL BAŞVURUSU GERÇEK — üç uç açıldı, motor kopyası söküldü (11.08).**
  `touches:` `packages/{application/src/{b2b/**,customer/b2b.ts},types/src/contracts/b2b-api.schema.ts,observability/src/capture.ts}` ·
  `apps/web/lib/b2b/**` · `apps/mobile-api/src/api/v1/{b2b.ts,router.ts}` ·
  `apps/mobile/src/{lib/api/b2b.ts,screens/{professionals/**,customer-kit/{use-otp-sign-in.hook.ts,otp-sign-in-fields.tsx,place-notice-sheet.tsx}}}`

  **Ölçülen arıza:** form tamdı ama hiçbir yere gitmiyordu — müşteri "Başvurunuz alındı" ekranını
  görüyor, başvuru ekranın durumunda kalıyordu (`BEKLEYEN(21.14)`). Web'de akış TAM kurulu ve
  kuralların çoğu zaten paylaşılan motorda (`domain-core/b2b-application`); eksik olan mobilin
  kapısıydı.

  Yapılanlar:
  · **TERFİ:** `apps/web/lib/b2b/{company-registry,vat-check}.ts` → `@lezzet/application/b2b/`,
    `submitB2bApplication` + `readB2bApplicant` → `application/customer/b2b.ts`. Web dosyaları
    KÖPRÜ; imzalar korundu, `application.test.ts` dokunulmadan yeşil. `notifyB2bDecision` TAŞINMADI
    (tek çağıranı operasyon yüzeyi — terfi ölçütü "en az iki yüzey"). Değişen tek kural: ret artık
    **görünür** — `CustomerError` yerine adlı sonuç ve eksik ALAN listesi (mobil form o alanları
    işaretleyebilsin diye; web köprüsü sonucu eskisi gibi `CustomerError`a çeviriyor).
    `cache: 'no-store'` bayrağı düştü (Next genişletmesiydi, Next 15'te zaten varsayılan) ve hata
    kaynağı `SOURCES.applicationB2b` oldu — dış servis düşünce arıza iki kovaya bölünmesin.
  · **SÖZLEŞME:** `contracts/b2b-api.schema.ts`. Alan denetimi ŞEMADA DEĞİL motorda (ikinci bir
    denetim, biri ötekinden sıkı olduğu gün çıkılamayan bir döngü olurdu); motorla bağ uçta
    `B2bApplicationInput` ataması ile derlemede kilitli (`types` `domain-core`a bağlanamıyor).
  · **UÇLAR:** `GET /b2b/company/:siret` · `GET /b2b/vat/:number` (ikisi AÇIK — form kimlik
    sorulmadan doldurulur; maruziyet künyede) · `GET /me/b2b` · `POST /me/b2b/application`
    (Bearer'ın arkasında: başvuru bir müşteri kaydının hâli, sahibi olmalı).
  · **DUPLİKASYON KAPANDI:** `apps/mobile` artık `@lezzet/domain-core`a bağlı (ölçüldü: o paketin
    npm bağımlılığı SIFIR — `types` + `helper`, ikisi de mobilde vardı) ve
    `professionals-types.ts`in elle yazılmış yarısı (`normalizeSiret` · `formatSiret` ·
    `normalizeVatNumber` · `isGermanVatNumber` · `applicationIssues` + üç tip) SİLİNDİ. Kopyanın
    bilerek zayıf bıraktığı iki kural da kapandı: SIRET Luhn denetimi ve AB numarasının biçimi.
  · **İKİNCİ DUPLİKASYON:** akış-içi kimlik adımı (e-posta → kod → oturum) 21.27'de bölge talebi
    çekmecesinde kurulmuştu; ikinci tüketen doğunca mantığı `customer-kit/use-otp-sign-in.hook`a,
    ÇİZİMİ `otp-sign-in-fields.tsx`e çıktı ve çekmece de onları kullanıyor. Cümleler her ekranın
    kendi sözlüğünde kaldı (CLAUDE §2) — zaten farklı olmaları gerekiyor.
  · **EKRAN:** akışın tamamı `professionals-screen`de (kayıt getir → doldur → motorla denetle →
    gönder → gerekirse kimlik → tekrar dene), form yalnız çiziyor. Üç yeni hâl: `pending` ·
    `approved` · `rejected` (gerekçesi + "otomatik çevrildi" rozetiyle, "Yeniden başvur" formu geri
    açar). AB numarasının işareti artık TAHMİN değil ÖLÇÜM: VIES'in üç cevabı ayrı çiziliyor ve
    "doğrulanamadı" başvuruyu engellemiyor.
  · **KİMLİK (kullanıcı kararı 11.08):** *"kullanıcı başvurmadan önce giriş yaparsa daha iyi olur,
    ama başvuru formunda da giriş yöntemini seçip OTP kodunu girebilir"* — ikisi de karşılandı:
    girişli müşteri ek adım görmez, misafir gönderirken çekmeceden geçer ve başvuru kendiliğinden
    gider. Kapı SUNUCUDA (401), ekranın tahmininde değil.

  **Canlı ölçüm (uç 3002):** `GET /b2b/company/90749664000026` → gerçek kayıt geldi (*QUALITE ·
  47.91B · 2021 · 46 RUE DES PRES · 67380 LINGOLSHEIM*) · biçimi bozuk numara `not_found` (dış
  servise hiç gidilmiyor) · VIES üç cevabı da verdi: `DE12` → `false` (biçim), `DE999999999` →
  `false` (INVALID), `DE811907980` → **`null`** (üye ülke sunucusu cevap vermedi — `null` hâlinin
  var olma sebebi tam olarak bu) · jetonsuz `/me/b2b` → `401` · eksik gövde → `200`
  `{"status":"invalid_application","issues":["legalName","line1","city"]}` · tam gövde → `200`
  `pending`, DB'de `company_info` (legal_name · siret · activity_code · founded_year · is_active),
  `b2b_pending = true`, işletme adresi künye adıyla yazıldı. **Ölçüm verisi geri alındı**: seed
  müşterisi (Julien Fischer) başvuru öncesi hâline döndürüldü — künye null, açılan adres silindi.

  **Doğrulama:** mobil **79 suite / 559 test** (yeni 8: kayıt doldurma · bulunamadı · biçimsizde
  dış servise gitmeme · eksik formun uca gitmemesi · misafirde kimlik adımı · başarılı gönderim ·
  iki durum bloğu) · `application`/`types`/`mobile-api`/`web` typecheck temiz · eslint · knip ·
  boundaries temiz.

  **Test borcu:** terfi edilen kapının paket düzeyinde entegrasyon testi yazılmadı (web'in
  `apps/web/lib/b2b/application.test.ts`i köprü üzerinden AYNI gövdeyi koşuyor, imza korundu);
  uçların entegrasyon testi de yok (§4b: DB'ye vuran koşu denetmenin işi).

- [x] (21.32) **OPERASYON YÜZEYİNE YERELDE GİRİLEMİYORDU — üç kopuk halka (kullanıcı bulgusu 11.08).**
  `touches:` `scripts/{seed.ts,seed/people.ts}` · `apps/mobile-api/src/api/v1/dev-login.ts` ·
  `apps/mobile/src/{lib/auth/dev-login.ts,screens/login/{login-screen.tsx,auth-callback-screen.tsx,post-login-route.ts}}`

  **Belirti:** *"hesap sayfasından tıklayıp girebiliyoruz… operasyon tarafına giriş yapamadım."*
  Ölçüm üç ayrı sebep buldu, her biri tek başına yeterliydi:

  | # | sebep | ölçüm |
  |---|---|---|
  | 1 | "Operasyon (test)" düğmesi `sametoglu@ayas.fr`e basıyordu | o hesap `{customer}` → `operationsSectionsOf` boş → kapı `denied` |
  | 2 | rol doğru olsa bile kabuğa giden **hiçbir bağlantı yoktu** | giriş sonrası `router.back()`; `/courier`·`/warehouse` adreslerine müşteri yüzeyinden tek bağ yok (arandı) |
  | 3 | personel profillerinin `auth_user_id`'si boştu | altı personelin altısı da bağsız; `db:refresh` bağı zaten siliyor |

  **YANLIŞ ÇIKAN BİR TEŞHİS — kayda geçiyor.** Önce *"dev kapısı kullanıcı yaratmadığı için personel
  hiç giriş yapamaz, seed auth kullanıcısı açmalı"* denmişti; dayanak `dev-login.ts` künyesindeki
  bir cümleydi ve **ölçülmemişti**. Ölçünce tersi çıktı: `generateLink` kayıtsız e-postada auth
  kullanıcısını AÇIYOR (aynı çağrının `packages/application/src/auth/otp.ts` künyesi bunu zaten
  söylüyordu — iki künye çelişiyordu) ve `0002` trigger'ı onu e-postayla eşleşen profile bağlayıp
  **rolünü koruyor**. Kanıt: `kurye@lezzetanatolia.fr` çağrı öncesi bağsız → sonrası bağlı, `/me`
  `roles: ['courier']`, `/courier/day` **200**, `/warehouse/preparation` **403**. Yanlış künye
  düzeltildi.

  Yapılanlar:
  · **SEED (`seedStaffLogins`)** — personel profillerine `auth.users` satırı açar, `seedKisiler`den
    SONRA (trigger profilin var olmasını ister). `db:refresh` = `db reset && seed` olduğu için bağ
    ancak burada doğarsa yenilemeden sağ çıkar. İdempotent; müşteri hesabı AÇILMAZ (müşterinin
    girişi OTP akışının kendisidir, hazır auth satırı sınananın yarısını atlatırdı).
  · **YÖNETİCİ HESABI (`yonetim@lezzetanatolia.fr`)** — web bypass'ının `dev-admin@lezzet.local`
    satırından AYRI. Sebep ölçüldü: `.local` adresi `generateLink`te reddedildi, gerçek alan adlı
    altı personel adresi ilk denemede geçti. Bypass'ın e-postası değiştirilemez (kimliği webin
    guard'ına sabit bağlı), o yüzden ikinci bir yönetici profili açıldı.
  · **DÖRT DEV DÜĞMESİ** — Müşteri · Kurye · Depo · Yönetim (kullanıcı kararı 11.08). Rol → bölüm
    eşlemesi birebir olduğu için tek düğme bölümlerin yalnız birini açardı; webin ölçülmüş
    arızasının (dört kurye ekranının yalnız erişimsiz hâliyle doğrulanabilmesi) mobil karşılığı.
    Muhasebe çok bölümlüdür, yani sekme çubuğunun görünür hâli de denenebilir hâle geldi.
  · **YÖNLENDİRME (`post-login-route.ts`)** — personel giriş yapınca doğrudan kabuğa gider (webin
    tek `/connexion` modeli). Kararı İKİ kapı da aynı dosyadan okuyor (OTP girişi + OAuth dönüşü):
    kopyalansaydı "Google ile girince neden operasyona gitmiyor" diye aranan bir fark doğardı.
    Rol kuralı yeniden yazılmadı, kabuğun okuduğu `operationsSectionsOf`a soruluyor. Künye sorusu
    personele SORULMAZ (ad/telefon sipariş yolunun ön şartı, personel o yoldan geçmez).
  · **YUTULAN SEBEP AÇILDI** — `dev-session` reddi gerekçesiz dönüyordu; artık Supabase'in mesajı
    `logger.warn` ile kayda düşüyor (e-posta maskeli). `.local` farkını ancak o mesaj söylüyordu.

  **GÜVENLİK — bypass mobile TAŞINMADI ve taşınmamalı.** Web'in bypass'ı SUNUCUDA `requireStaff`i
  kısa devre yapıyor (`apps/web/lib/guard.ts`); mobilin dev girişi ise gerçek Supabase oturumu
  kuruyor ve sunucu kontrolleri tam işliyor. Ölçüldü: jetonsuz **401**, uydurma jeton **401**,
  müşteri jetonuyla `/courier/day` **403**, kurye jetonuyla **200**. Bypass'ı taşımak, dev'de
  yakalanabilen yetki hatalarını görünmez kılardı.

  **Doğrulama:** mobil **81 suite / 572 test** yeşil (yeni 10: rol→bölüm kararının 8 hâli · OTP
  girişinde personel yönlendirmesi · OAuth dönüşünde aynısı) · mobil + mobile-api typecheck ·
  scripts typecheck · eslint temiz; yeni ihraç edilen kullanılmayan tip yok.

  **BEKLEYEN(21.13): kabuktan müşteri yüzeyine DÖNÜŞ yolu hâlâ yok** — personel giriyor ama
  çıkamıyor (uygulamayı kapatıp açmak gerekiyor). Kabuğun künyesi bu geçişin tema dikişini de
  şart koşuyor (odak/blur), o yüzden ayrı ve bilinçli bırakıldı.

- [x] (21.33) **KLAVYE AÇIKKEN DÜĞMEYE İLK DOKUNUŞ YUTULUYORDU — geri bildirim yorumu sessizce
  kayboluyordu (cihazda ölçüldü 11.08).**
  `touches:` `apps/mobile/src/screens/{feedback/feedback-screen.tsx,professionals/professionals-screen.tsx,login/login-screen.tsx,catalog/catalog-screen.tsx,courier/{day-close-screen.tsx,delivery-screen.tsx},management/offer-approval-screen.tsx,warehouse/{adjustment-screen.tsx,courier-return-screen.tsx,transfer-screen.tsx}}`

  **Belirti (fiziksel cihaz, OPPO CPH1907 · Android 11):** klavye açıkken bir düğmeye basılınca
  yalnız klavye kapanıyor, düğmenin işi çalışmıyordu. İki ekranda birebir ölçüldü — Profesyonel
  "Bul" (1. dokunuş sonuçsuz, 2. dokunuşta resmî kayıt geldi) ve Geri bildirim "Değerlendirmeyi
  tamamla" (1. dokunuş sonuçsuz, 2. dokunuşta gönderildi). **İkincisi veri kaybettiriyordu:**
  müşteri yorumunu yazıp bastığını sanarak çıkarsa değerlendirme hiç kaydedilmiyordu.

  **Sebep:** `ScrollView`in `keyboardShouldPersistTaps` varsayılanı `'never'` — klavyeyi kapatan
  dokunuş çocuklara HİÇ ulaşmıyor. Aynı tuzak bir kez çözülmüş ve künyesi yazılmıştı
  (`support/new-ticket-sheet.tsx`), ama kural yayılmamıştı.

  **KAPSAM ÖLÇÜLEREK DARALTILDI — 40 `ScrollView`den 10'u.** İlk tarama "dosyada hem `ScrollView`
  hem alan var mı" diye sorup 13 dosya saymıştı; o soru YANLIŞTI, iki yönden birden: alanı çocuk
  bileşende olan ekranı (Profesyonel → `ApplicationForm`) kaçırıyor, alanı ÇEKMECEDE olanı ise
  boşuna sayıyordu. Doğru ölçüt **klavyenin açılabildiği yüzeyde dokunulabilir öğe taşıyan
  kaydırıcı**: alan çekmecedeyse (`BottomSheet`) arkadaki kaydırıcıya dokunulamaz, ayrıca çekmecenin
  kendisinde kaydırıcı yoksa dokunuş zaten yutulmaz — `keyboardShouldPersistTaps` bir `ScrollView`
  davranışıdır. Nesting satır satır ölçüldü; `home` (4 kaydırıcı) · `cart` · `account` · `checkout` ·
  `legal` · `packages-list` · `intake` · `preparation` gibi 30 kaydırıcı **bilerek dokunulmadı**.
  Tek istisna katalog: alan kaydırıcının içinde DEĞİL ama çip şeridi arama alanının hemen altında,
  yani klavye açıkken kategori çipine dokunmak süzgeci değiştirmiyordu — o da girdi.

  **Doğrulama CİHAZDA, ölçümün aynısı tekrarlanarak:** Profesyonel "Bul" → tek dokunuşta resmî
  kayıt geldi (QUALITE · 46 RUE DES PRES · 67380 LINGOLSHEIM) ve klavye açık kaldı; Geri bildirim
  → yorum yazılıp tek dokunuşta tamamlandı, veritabanında `vote=like` + yorum + `completed_at`
  doğrulandı. Test verisi (puan kayıtları · oy · davetin tamamlanma damgası) geri alındı.
  Kapılar: mobil **81 suite / 572 test** · typecheck · eslint temiz.

  Kalanı `docs/uygulama/BACKLOG-musteri.md`: **MB-02** (klavye odaklanan alanın üstünü kapatıyor —
  `KeyboardAvoidingView` yalnız `BottomSheet`te kurulu) aynı ailedendir ama ayrı iştir.

- [x] (21.34) **EKRANIN SÖYLEDİĞİ PUAN İLE DEFTERE YAZILAN TUTMUYORDU — üç ekranda üç ayrı kök (11.08).**
  `touches:` `packages/types/src/contracts/feedback-api.schema.ts` ·
  `packages/application/src/feedback/{invite.ts,points.ts}` · `apps/mobile-api/src/api/v1/feedback.ts` ·
  `apps/mobile/src/screens/{discover/**,feedback/**,home/{messages.json,home-screen.tsx}}` ·
  `apps/mobile/src/app/(tabs)/account.tsx` · `apps/mobile/app.config.ts`

  Kapsam `docs/uygulama/BACKLOG-musteri.md` MB-15..17 · MB-35 · MB-41. **Ortak eksen §11.B'de
  bulundu ve iş o eksende yapıldı:** soru "sayı yanlış mı" değil, **"ekran KİMİN sayısını okuyor"**.
  Üç ekranın üçünde cevap farklı çıktı, yani üç ayrı düzeltme gerekti.

  **MB-16 (keşif) — sebep TESTLE ÜRETİLDİ, teori kurulmadı.** Üç aday vardı; ikisi elendi
  (talep kapısı ayrı kaynak değil, ikisi de tek toplayıcıdan geçiyor · geri alınan oy zaten hiç
  gönderilmiyor), biri kanıtlandı: **tur bitiş ekranı çizildiğinde son oy hâlâ 6 sn'lik geri alma
  penceresinde ve sunucuya HİÇ gitmemiş.** Yani "+6 ≠ 8" cihazdaki tesadüf değil, deterministik —
  `use-discover.hook.test.ts` önce düşüyor, pencere dolunca 8 oluyor. Toplama mantığına
  DOKUNULMADI (ölçüm desenin doğru olduğunu söyledi, künyesi de zaten yazmıştı); eklenen tek şey
  "sayı oturdu mu" bilgisi: `pointsSettling` → yolda oy varken ekran **sayı yazmaz**, hesaplandığını
  söyler. Kuyruğu bitişte zorla boşaltmak en kısa yoldu ve BİLEREK SEÇİLMEDİ: bitiş ekranında
  "Geri al" duruyor (v3:370-378) ve boşaltma o düğmeyi yalana çevirirdi — sunucuda oyu geri alan uç
  yok. Ödünleşme: müşteri en fazla 6 sn "hesaplanıyor" görür, ama gördüğü hiçbir sayı yanlış olmaz.

  **MB-17 (geri bildirim) — sebep SÖZLEŞMEDEYDİ, ekranda değil.** Bir tur üç defter kaydı doğuruyor
  (kart oyu `feedback_purchase` 5 · yorum `review` 20 · tamamlama primi 5 = 30) ama `/vote` ve
  `/review` yalnız `{recorded:true}` dönüyordu, `/complete`in `pointsAwarded`ı ise sadece primi.
  Toplam istemcide HESAPLANAMAZ — günlük tavan, B2B ve `(müşteri, sebep, kaynak)` tekilliği hep
  motorun kararı; ekranda toplamak motoru taklit etmek olurdu (CLAUDE §1). **Uç açıldı:**
  `invitePointsTotal` (zorunlu; `pointsAwarded`ın adı ve anlamı DEĞİŞMEDİ — web'in canlı tüketicisi
  `feedback-outcome.tsx` kırılmasın diye additive). Motor toplamı `sumInvitePoints` ile KENDİ
  DEFTERİNDEN okuyor: `ref_id ∈ {davet, o davetin product_feedback satırları}`, `since =
  request.createdAt` (bir doğruluk süzgeci — `write.ts` var olan satırın davetini değiştirebiliyor,
  önceki davetin puanı bu turun kazancı değil). "Kart sayısı × ayar" çarpımı bilerek yazılmadı:
  tavana takılan ya da tekillikte düşen kayıt o çarpımda görünmezdi. **Ekran kapısı da prime değil
  TOPLAMA bağlandı** — eskiden `pointsAwarded > 0` kapısındaydı ve tavan dolduğunda ya da davet
  ikinci kez tamamlandığında prim 0'a düşüp müşteri, yorumundan 20 puan kazanmış olsa bile hiçbir
  puan bilgisi görmüyordu.

  **MB-15 (vitrin) — sayı hiçbir ayara karşılık gelmiyordu.** "+10 puan" muhtemelen `points_visit`
  ile karışmıştı; gerçek kazanç kart sayısı × `points_feedback_candidate` (=2). Ayardan kurulamıyor
  (vitrin sözleşmesinde puan yok, kart sayısı da orada bilinmiyor — deste `/discover` çağrılınca
  kuruluyor), o yüzden cümle üç dilde **sayısız** hâle geçti. Vaadin kendisi doğru, yanlış olan
  yalnız sayıydı.

  **MB-35 · MB-41 (aynı turda):** hesap sekmesi `/me` okunurken `return null` veriyordu — artık nötr
  yer tutucu çiziliyor (künyedeki asıl endişe korundu: "girişlisiniz/misafirsiniz" iddiası taşımaz).
  Ölçümde bir düzeltme: tam ekran iskeleti **yoktu** — `account-skeleton.tsx` iki bölüm iskeleti
  taşıyor ve ikisi de zaten kullanımdaydı. `BEKLEYEN(21.3)` ham hex ölçümle kapandı:
  `@lezzet/design-tokens` importu `expo config`i düşürüyor (paket girişindeki uzantısız göreli
  yeniden-ihraçlar → `ERR_MODULE_NOT_FOUND`); uzantılı denek modül aynı yükleyicide çalıştı, yani
  engel paketin kendisi. Gerekçe künyeye yazıldı.

  **⚠ BU İŞİN BİR PARÇASI BAŞKA BİR COMMIT'İN ALTINDA — `git log` yanıltır (kayıt, 11.08).**
  `f521aef` (21.33, paralel şerit) yol adı vererek commit atarken çalışma ağacında BENİM o an
  yazdığım değişiklikler de vardı ve onları da aldı: `feedback-screen.tsx`in TAMAMI (puan kapısının
  `pointsAwarded > 0` → `invitePointsTotal > 0` çevrimi + MB-17 künyesi) ve
  `docs/uygulama/BACKLOG-musteri.md`nin §11–§13 bölümleri (analiz · eklenen kalemler · sahiplik
  tablosu). Kod kayıp değil, gerekçesi başkasının künyesinin altında. **CLAUDE §0'ın 08.08'de
  kaydettiği vakanın aynısı, yönü ters** — ve o gün konan kuralın (`git commit -- <yollar>` +
  add'siz tek adım) tek başına yetmediğini gösteriyor: iki ajan AYNI dosyada eşzamanlı çalışıyorsa
  yol süzgeci koruma sağlamaz. Sahiplik tablosu (`BACKLOG-musteri.md` §13) tam bunun için açıldı;
  bu satır da o tablonun ikinci sınavının kaydı.

  **Doğrulama:** mobil **83 suite / 581 test** yeşil (yeni 8: keşifte bekleme hâlinin dört ölçümü,
  ekranın çipi, geri bildirimde toplam/prim ayrımı, prim 0 iken kartın kalması, toplam 0 iken
  kaybolması) · `pnpm test:unit` **1347 test** · types/application/mobile-api/**web** typecheck
  rc=0 · eslint · boundaries temiz.

  **Test borcu:** `invite.test.ts`e turun toplamını ölçen entegrasyon iddiası YAZILDI ama
  KOŞULMADI (§4b: DB'ye vuran koşu denetmenin işi). İddia literal sayıya bakmıyor — ayarlar küresel
  tekil olduğu için toplamın bakiyeye yaptığı FARKA bakıyor.

  **BEKLEYEN(21.34):** `PointsEntryService`te `ref_id` KÜMESİYLE süzen okuma yok (`hasEntryFor`
  yalnız "var mı" der); `sumInvitePoints` bugün sayfa döngüsüyle okuyor (sayfa 100, kaçak freni 20
  sayfa + `logger.warn`). Pencere dar olduğu için ölçülebilir bedel yok, ama taban sınıfın `.in()`
  süzgeciyle ~5 satırlık bir metot bunu tek sorguya indirir.

  **Web'e devredilen:** `apps/web/app/(customer)/[locale]/feedback/[token]/components/feedback-outcome.tsx`
  hâlâ yalnız `pointsAwarded` basıyor — yani web davet sayfası AYNI eksikliği yaşıyor. Alan
  sözleşmede hazır, bağlaması tek satır; `docs/talep/koordinasyon-web-mobil.md`de bildirildi.

- [x] (21.35) **PROFESYONEL BAŞVURUSUNUN BEŞ AÇIĞI + ÖLÜ İHRAÇLAR — kimlik artık oturumdan (11.08).**
  `touches:` `apps/mobile/src/screens/professionals/**` · `apps/mobile-api/src/api/v1/b2b.ts` ·
  `apps/mobile/src/lib/api/{b2b,discover,points}.ts` · `apps/mobile/src/lib/payment/{payment-sheet,stripe-config}.ts` ·
  `apps/mobile/src/screens/customer-kit/{discount-label.ts,use-sheet.hook.ts}` ·
  `apps/mobile/src/screens/home/use-home-orders.hook.ts`

  Kapsam `docs/uygulama/BACKLOG-musteri.md` MB-04 · MB-05 · MB-07 · MB-08 · MB-11 · MB-39.

  **MB-04 — KİMLİK GÖVDEDEN DEĞİL OTURUMDAN (kullanıcı kararı 11.08).** Kullanıcının kurgusu:
  *"profesyonel bir kere oturum açsın, mailini girsin, OTP kodu gelsin ve onaylasın; bu bizim mail
  adresimiz olsun."* Fatura için ayrı adres sorulunca: *"şimdilik her şeye yetsin, ileride küçük bir
  özellik olarak eklenir"* → MB-44 olarak kaydedildi.
  **Ölçüm:** formdaki e-posta hiçbir yere yazılmıyordu ama motor onu ZORUNLU tutuyordu
  (`b2b-application.ts:156`) — müşteri, hiçbir işe yaramayan bir alanı doldurmak zorundaydı. Dahası
  iki adres ayrışabiliyordu: misafir yolunda kimlik çekmecesi formdaki adresten beslenmiyor, kendi
  boş alanıyla açılıyor; müşteri X yazıp Y ile doğrulayabiliyor ve karar maili Y'ye gidiyordu.
  Asıl çelişki: formdaki adres DOĞRULANMAMIŞ bir metin, hesabınki OTP'den geçmiş.
  **Yapıldı:** uç gövdedeki `email`i yok sayıp oturum sahibinin profilinden yazıyor (`b2b.ts`
  künyesi); ekrandan alan kalktı, yerine hesabın adresi gösteriliyor.
  **AJANIN YAKALADIĞI TUZAK — kaydediyorum:** alanı kaldırıp boş göndermek YETMEZDİ. `send()`
  motoru İSTEMCİDE de koşuyor; boş e-posta ön denetimde takılır, istek uca hiç çıkmaz, 401 gelmez
  ve **misafirin kimlik çekmecesi hiç açılmazdı** — yani düzeltme, misafir başvurusunu tamamen
  öldürürdü. Çözüm kuralı gevşetmek değil taşımak oldu: ön denetimden yalnız `email` süzüldü,
  denetim sunucuda yerinde duruyor.
  **Misafirin cümlesi dürüst:** adres henüz yokken "hesabınızın adresi" denemezdi; ekran sırayı
  söylüyor ("gönderirken doğrulayacağınız e-posta adresine"). Okuma sürerken satır HİÇ çizilmiyor —
  girişliye bir an yanlış vaat okutmamak için, testle kilitli.

  **MB-07 — kök sebep BACKLOG'DA YAZILANDAN FARKLI ÇIKTI.** Backlog "çipin yatay dolgusu yok"
  diyordu; ölçüm başkasını söyledi: `PressableSurface` stili **iç** yüzeye veriyor, dış `Pressable`a
  `flex: 1` geçmiyor — haplar ekranı yarılamıyor, kendi metni kadar daralıyordu. Kitin kendi çözümü
  uygulandı (`bottom-tab-bar.tsx` yuva deseni); ölçü v3'ten
  (`design/derived/mobil-musteri-v3/18-vPro-professionnels.html`), yatay dolgu aynı sayfanın mobil
  çipinden. Etiket genişlikleri fontTools ile ölçüldü (en uzun 125,9 dp / yuva 158 dp) — improvise
  edilmedi (CLAUDE §3).

  **MB-05** ön dolgu ALAN BAZLI ve tek seferlik: dolu alanın üstüne yazmıyor (yarış, testte elle
  tutulan cevapla kuruldu). **MB-08** girişliye kayıt adımı gösterilmiyor; ölçüt `b2b.status`
  (`useMe` ikinci bir ağ okuması açardı). **MB-11** gövde başlığı tekrarlamıyor, üç dilde yeni metin.

  **MB-39 — knip 9 → 0 ölü ihraç tipi.** Altısında yalnız `export` kalktı (tip kendi dosyasının
  imzasında yaşıyor), `MeCoupon` tamamen silindi (kendi dosyasında bile kullanılmıyordu; yerine
  "geri ekleme, kuponlar `MePointsView['coupons']`ten gelir" künyesi). "Tüketiciye bağla" seçeneği
  hiçbirinde çıkmadı — tüketiciler tek tek okundu, hepsi çıkarımla okuyor.

  **Doğrulama:** mobil **83 suite / 590 test** yeşil · `test:unit` 1347 · mobil + mobile-api
  typecheck · eslint · boundaries · `docs:check` temiz. Düzeltmeler geçici geri alınınca yeni
  testler kırmızı verdi (tautoloji değil).

  **BEKLEYEN(21.35):** sözleşmedeki `B2bApplicationInput.email` ve motorun zorunluluğu DURUYOR —
  ikisi de web yüzeyiyle ortak, kaldırma kararı iki yüzeyin. Bugünkü hâl kırılmıyor (uç doğruyu
  yazıyor) ama sözleşme hâlâ yazılmayan bir alan taşıyor. Koordinasyon defterinde soruldu.

  **Web'e devredilen:** web B2B formu da aynı arızayı taşıyor olabilir — gövdedeki adres orada da
  hiçbir yere yazılmıyor. Aynı defterde bildirildi.

- [x] (21.36) **KLAVYE ÜÇ AÇIK KAPATTI + ONBOARDING'DE YAZI BOYUTU GERÇEKTEN İŞLİYOR (11.08).**
  `touches:` `apps/mobile/src/components/ui/form-scroll.tsx` (YENİ) ·
  `apps/mobile/src/screens/{login/login-screen.tsx,feedback/feedback-screen.tsx,onboarding/onboarding-screen.tsx}`
  *(`professionals/professionals-screen.tsx`in kaydırıcı takası `(21.35)` commit'ine bindi —
  aynı dosyada iki şeridin işi vardı, koordinasyon defterinde anlaşıldı.)*

  **1 · ODAKLANAN ALAN KLAVYENİN ALTINDA KALIYORDU** (MB-02). Sebep ölçüldü, varsayılmadı:
  `AndroidManifest`teki `adjustResize` İŞLEMİYOR. Üç ölçüm — klavye açılınca içerik hiç kaymadı ·
  klavye açıkken kaydırma denendi, pikseller birebir aynı kaldı (yani kaydırıcı "sığmış" sayıyor) ·
  `res/values/styles.xml` → `AppTheme` **`Theme.EdgeToEdge`**'den türüyor
  (`react-native-edge-to-edge@1.8.1`). Kenardan kenara modda Android pencereyi klavye için
  küçültmez; boşluğu uygulamanın KENDİSİ tüketmek zorundadır.

  Çare **kite** kondu (`form-scroll.tsx`): `KeyboardAvoidingView` + `ScrollView`, iki korumayı
  birlikte taşır — alan görünür kalır VE ilk dokunuş yutulmaz. Bu, `bottom-sheet`in 08.08'de aynı
  arıza için verdiği kararın tekrarı; prop'u ekran ekran dağıtmak bir gün unutulacak bir kural
  olurdu (nitekim `(21.33)`te on ekrana tek tek yazılmıştı). **Yeni bağımlılık YOK:** kenardan
  kenara için yaygın çare `react-native-keyboard-controller` ama depoda çalışan emsal zaten vardı
  (WORKFLOW §6). Kap yalnız FORM ekranlarına kondu; 30 kaydırıcılık geniş göç ayrı iş
  (`BACKLOG-musteri` MB-34).

  **Doğrulama cihazda:** profesyonel formunda en alttaki telefon alanına odaklanıldı — içerik
  yukarı kaydı, tanıtım kartı üstten kırpıldı ve alan klavyenin hemen üstünde imleçle göründü.
  Aynı ölçüm düzeltmeden önce alanı klavyenin ALTINDA bırakıyordu.

  **2 · ONBOARDING'DE BOŞLUĞA DOKUNUNCA KLAVYE KAPANMIYORDU** (kullanıcı bulgusu, iPhone).
  Bu davranış RN'de PLATFORMDAN GELMEZ: arka plandaki `View` dokunuşu yakalamaz. Klavye yalnız üç
  yoldan kapanır — kaydırıcıda sürükleme, alanın blur olması, açıkça `Keyboard.dismiss()`; bu
  ekranda üçü de yoktu. Adım ÇIKIŞSIZDI çünkü posta kodu alanı `keyboardType="number-pad"` açıyor
  ve o klavyede **iOS'ta return/Done tuşu YOK** (Android'in ✓ tuşunun karşılığı yok), "Devam"
  düğmesi de klavyenin altında kalıyordu. Kök `View` şeffaf bir `Pressable`a döndü
  (`onPress={Keyboard.dismiss}`, `accessible={false}`). **Otomatik ilerleme YAZILMADI** — önce
  beşinci hanede klavyeyi kapatan bir sürüm yazıldı, kullanıcı istemeyince geri alındı. Kullanıcı
  iOS'ta doğruladı; Android'de de ölçüldü.

  **3 · TESLİMAT/ÖDEME ADIMLARI YAZI BOYUTU AYARINI ALMIYOR GİBİ GÖRÜNÜYORDU** (MB-45).
  Ayar çalışıyor; kusur o iki adımın hangi DURAĞA bağlandığındaydı: satır açıklamaları (`paySub`)
  ve güvence cümlesi (`secureText`) `helper`e (12) çakılıydı — formların "yardımcı ipucu"
  basamağı — oysa aynı ekranların üst gövdesi `control` (16) kullanıyor. Ölçüm: "Büyük"te (×1,15)
  `helper` **13,8**'de kalıyor, `control` **18,4**'e çıkıyor; aynı işi gören iki metin arasında
  kalıcı 4 px uçurum. Yeni merdiven: başlık 16 · açıklama **`body-sm` 14** · güvence **`note` 13**.

  **Kalan borç:** `theme.text.helper` uygulamada 124 yerde geçiyor ve bir kısmı yine ASIL içerik
  taşıyor olabilir. Topluca değiştirilMEDİ — ölçülmemiş toplu müdahale olurdu; ekran ekran tarama
  `BACKLOG-musteri` **MB-46** olarak açıldı (kullanıcı istedi, cihaz işi).

  **Doğrulama:** mobil typecheck · eslint · **83 suite / 581 test** yeşil.

- [x] (21.37) **PAKET KARTININ YER NOTU VURGU TONUNA GEÇTİ (kullanıcı kararı 11.08).**
  `touches:` `apps/mobile/src/screens/{packages-list/packages-list-screen.tsx,home/home-screen.tsx}`

  Soğuk zincirli paket müşterinin posta koduna gidemiyorken kart zaten bir not taşıyordu ("Bu adrese
  gönderemiyoruz" / "Bölgenizde şu an yok"); kullanıcı o notun **vurgu renginde** yazılmasını istedi.
  Renk krem (`on-image`) → `terracotta`; token'dan, ham hex yok. Kremin sorunu tondan öteydi: ad ve
  üstbaşlık da kremdi, yani not bir UYARI değil ÜÇÜNCÜ bir künye satırı gibi okunuyordu.

  **İKİ EKRAN TEK KARAR** (kullanıcı onayı, şıkla): aynı cümle vitrindeki "Hazır paketler" karosunda
  da var ve iki ekranın künyesi zaten *"işaret yalnız birinde çizilseydi müşteri iki farklı gerçek
  okurdu"* diyor — rengin ayrışması aynı cümleyi iki ekranda iki ağırlıkta gösterirdi. Kataloğun
  kare kartı DIŞARIDA: oradaki not kartı örten koyu filigranın üstünde duruyor ve terracotta orada
  kremden daha az okunur (kullanıcıya şıkta soruldu, dışarıda bırakıldı).

  Cümlenin kendisine ve hangi hâlde basılacağına DOKUNULMADI — o karar `stockMarkOf`un
  (`lib/places/place-view.ts`), ekranın değil. Not iki hâli birden taşıyor (`blocked` kalıcı ·
  `pending` geçici) ve ikisi tek `Text` ile çiziliyor, yani ikisi de vurgu tonunda.

  **Doğrulama:** mobil typecheck rc=0 · eslint · `pnpm test:unit` 116 dosya / **1347 test** yeşil.

- [x] (21.38) **MÜŞTERİNİN OKUDUĞU METİN 14'ÜN ALTINA İNMEZ — küçük duraklara çakılı içerik
  taranıp yükseltildi (kullanıcı isteği 11.08, MB-46).**
  `touches:` `apps/mobile/src/components/ui/{note,suggestion-list}.tsx` ·
  `apps/mobile/src/screens/account/{account-screen,address-card}.tsx` ·
  `apps/mobile/src/screens/cart/{cart-screen,cart-line-row}.tsx` ·
  `apps/mobile/src/screens/checkout/{checkout-screen,order-confirmed-screen}.tsx` ·
  `apps/mobile/src/screens/customer-kit/{address-form,dashed-invite,option-row,summary-panel}.tsx` ·
  `apps/mobile/src/screens/orders/{order-detail-screen,order-timeline,orders-screen}.tsx` ·
  `apps/mobile/src/screens/support/{new-ticket-sheet,order-line-picker,tickets-screen}.tsx` ·
  `apps/mobile/src/screens/professionals/{professionals-screen,application-form}.tsx` ·
  `apps/mobile/src/screens/feedback/feedback-screen.tsx` ·
  `apps/mobile/src/screens/package/package-detail-screen.tsx` ·
  `apps/mobile/src/screens/product/product-detail-screen.tsx`
  *(`home/home-screen.tsx` ve `packages-list/packages-list-screen.tsx`teki aynı düzeltme `(21.37)`
  commit'ine bindi — o dosyalar o sırada başka şeridin elindeydi.)*

  **SORU KULLANICIDAN GELDİ:** `(21.36)`da onboarding'in teslimat/ödeme metinleri düzeltilince
  *"başka yerlerde de kullanıcı Büyük seçse bile çok küçük font gösteriliyor olabilir, aynı
  kontrolü tüm sayfalarda yap"* dendi.

  **YÖNTEM — önce ölçüm, sonra kalem.** Tüm `apps/mobile/src` taranıp `StyleSheet.create` blokları
  ayrıştırıldı: **255 stil** küçük duraklardan okuyor (`micro` 54 · `note` 77 · `helper` 58 ·
  `eyebrow` 49 · `badge` 17). Bunların adından İÇERİK taşıdığı anlaşılan **63'ü** ayrıldı, cihazda
  "Büyük" seçiliyken doğrulandı ve kullanıcı kararıyla ilk iki kademe alındı.

  **KURAL (tek cümle, artık ölçüt):** *müşterinin KARAR için okuduğu metin `body-sm` (14) altına
  inmez; `helper` ve `micro` yalnız gerçek yardımcı role kalır* — form ipucu, birim, sayaç, zaman
  damgası. Kuralın en görünür yeri kitin uyarı kutusu (`components/ui/note.tsx` künyesi).

  Neden ölçekle çözülemiyordu: yazı boyutu ayarı ÇALIŞIYOR ama çarpan küçük bir sayıyı yine küçük
  bırakır — `helper` "Büyük"te (×1,15) **13,8**'de, `micro` **13,2**'de kalıyordu; `body-sm` ise
  **16,1**'e çıkıyor.

  Yükseltilenlerden bazıları ve neden: **alerjen satırı** (sağlık bilgisi, `micro`) · **kitin
  uyarı/hata kutusu** (tüm ekranlarda) · **adres satırları** (müşteri teslimatı oradan doğruluyor) ·
  ödeme adımının bilgi satırları · sepetteki ürünün boyu · veri hakları ve izin sonucu cümleleri ·
  geri bildirimin hata satırı.

  **DOKUNULMAYANLAR bilinçli:** operasyon · kurye · depo ekranları listeye ALINMADI (başka şeridin
  tasarım alanı) ve 3. kademe (`note` 13 → "Büyük"te 14,9) bugün yeterli sayıldı. `helper` hâlâ
  ~100 yerde ve çoğu meşru; topluca değiştirmek ölçülmemiş bir toplu müdahale olurdu.

  **Doğrulama:** cihazda hesap ekranı önce/sonra karşılaştırıldı — izin ve veri hakları cümleleri
  ile adres satırları gözle görülür büyüdü. typecheck · eslint temiz. **Tam test paketi bu
  pencerede GÜVENİLİR DEĞİL ve sebebi ölçüldü:** makine yük ortalaması 13,99 (sanallaştırma VM'i
  %212, Next %73 CPU) ve düşen testler her koşuda DEĞİŞİYOR; aynı yedi dosya birlikte koşturulunca
  **89 test 8,5 saniyede geçiyor**. Yani zaman aşımı, kırılma değil. Makine sakinleştiğinde tam
  paket bir kez daha koşturulmalı — `BEKLEYEN(21.38)`.

- [x] (21.39) **"BURAYA DA GELİN" KAYDINI İKİ LİSTE AYRI AYRI HATIRLIYORDU (kullanıcı bulgusu 11.08).**
  `touches:` `apps/mobile/src/lib/places/place-notice-store.ts` (YENİ) ·
  `apps/mobile/src/screens/customer-kit/place-notice-band.{tsx,test.tsx}`

  Bölge dışı bant iki listenin başında çiziliyor (katalog · paketler) ve künyesi açık bir söz
  veriyordu: *"kayıt alındığında düğme kalkar — alınmış bir kaydı ikinci kez isteten düğme
  'sayılmadım mı?' sorusunu doğururdu."* Söz **ekranlar arasında tutulmuyordu**: hafıza bandın
  kendi `useState`indeydi, iki liste iki ayrı bileşen örneği, yani iki ayrı hafıza. Katalogda
  kaydını bırakan müşteri paketler sekmesine geçince aynı düğmeyi yeniden görüyordu. Aynı arıza
  tek ekranda da vardı — sayfadan çıkıp geri gelen müşteri bandı sıfırlanmış buluyordu.

  **Sebep ölçüldü, varsayılmadı:** düzeltmeden ÖNCE yazılan iddia kırmızı koştu (`pkg-cta` ekranda
  duruyordu), depo bağlandıktan sonra yeşile döndü. Ölçüm ekranda değil testte yapıldı — arıza
  görsel değil, durumun nerede saklandığıyla ilgili.

  Hafıza modül deposuna taşındı (`place-notice-store`), sepetin ve teslimat adresi seçiminin aynı
  kalıbı: `useSyncExternalStore` + modül düzeyinde kayıt. **Anahtar YER** (`ülke:posta kodu`) —
  kodunu değiştiren müşteride düğme haklı olarak geri gelir; **kimlik anahtara girmez** çünkü
  misafir akışında hesap kaydın tam ortasında kuruluyor ve kimliği anahtarlasaydık kayıt biter
  bitmez hafıza başka kovaya düşerdi. **Diske yazılmaz:** kaydın kalıcı sahibi sunucu ve ikinci
  istek zaten `already` dönüyor, yani yeniden açılışta düğme görünse bile müşteri yanlış cevap
  almaz.

  **Sınıf taraması yapıldı:** kitin öteki `useState`leri form taslağı ya da çekmece safhası —
  sunucu gerçeğini yansıtan tek yerel durum buydu. Aynı sınıfın kalan üyesi `BACKLOG-musteri`
  **MB-23** (vitrindeki bölge ≠ sepetteki adres) ve o **karar bekliyor**, kod işi değil.

  **Doğrulama:** mobil typecheck rc=0 · eslint · knip temiz (yeni ölü ihraç yok) ·
  **83 suite / 592 test** yeşil (bandın kendi dosyası 9/9).

- [x] (21.40) **BÖLGE DIŞI KART YENİDEN DÜZENLENDİ — süzgeç sayfadan kartın içine, kod tıklanabilir
  (kullanıcı kararı 11.08, dört dokunuş).**
  `touches:` `apps/mobile/src/screens/customer-kit/place-notice-band.tsx` ·
  `apps/mobile/src/screens/customer-kit/place-notice-band-filter.test.tsx` (YENİ) ·
  `apps/mobile/src/screens/catalog/catalog-screen.tsx` · `apps/mobile/src/lib/places/messages.json`

  **1 · "Adresime gönderilebilir" süzgeci "Sırala & filtrele" SAYFASINDAN ÇIKTI.** Kullanıcının
  gerekçesi: *"zaten bu ancak teslimat noktalarımızın dışında çıkan bir filtreleme özelliği, bu
  sebepten doğrudan katalog sayfasının içine — uyarı kartının içerisine koyabiliriz."* Yerleşim
  kazancının yanında bir DOĞRULUK kazancı da var: kapalı bir sayfanın içindeki anahtar açık kalıp
  listeyi ekranda hiçbir iz bırakmadan kısabiliyordu. **İkinci bir görünürlük kapısı yazılmadı:**
  süzgecin koşulu (`shippableChipVisible` → rota dışı) ile bandın koşulu (çözülmüş + rota dışı)
  AYNI — kapı çağıranın kapısıdır. Bant paylaşılan olduğu için yuva isteğe bağlı tek nesne
  (`shippableFilter: {value, onChange}`); paketler listesi vermez, orada süzülecek bir şey yok.

  **2 · Süzgeç kartın EN ALTINDA:** kutunun içindeki sıra bilginin sırası — başlık + cümle, sonra
  yerle ilgili eylemler, en sonda listeyi daraltan denetim.

  **3 · "Kaydınız zaten var" satırı KALKTI, düğme komple gidiyor.** Kayıt alınınca eylemin yerine
  geçen cümle bir bilgi gibi görünüp yer kaplıyordu; müşteri kaydını bıraktığını zaten toast'ta
  okuyor. Cümle sözlükte duruyor — toast'ın metni odur.

  **4 · "Posta kodunu değiştir" metin eylemi → TIKLANABİLİR POSTA KODU** (*"tıpkı vitrinde olduğu
  gibi… daha anlaşılır ve görsel olur"*). Vitrin başlığındaki hapın aynı görsel dili (`{postal} ▾`,
  vurgu tonu) ve AYNI çekmece — ikinci nüsha yok. Eski cümle silinmedi: ekran okuyucunun adı oldu,
  yani dokunulan şeyin ne yaptığı hâlâ söyleniyor.

  **KOŞUCUDA ÖLÇÜLEN TUZAK — kayda geçiyor.** Yeni iddialar tek koşarken geçip PAKET İÇİNDE
  düşüyordu; sebep aranınca kod değil koşucu çıktı: `use-me.hook`un modül deposu cevabını `act`
  dışında yayınlıyor, yayın bir sonraki testin `render`ıyla üst üste biniyor ("You seem to have
  overlapping act() calls") ve React o testte ağacı HİÇ KURMUYOR — boş ağaç. İki sonuç: (a) süzgeç
  iddiaları kimlikle işi olmadığı için `useMe`yi misafire sabitleyen AYRI dosyaya alındı; (b) yeni
  deponun `resetPlaceNotices`ı boşken haber salmıyor (kardeşlerinin erken dönüşü) — duyuru boşuna
  dinleyici uyandırıyordu. Ana dosyanın act hijyeni ayrı borç: `BACKLOG-musteri` MB-38.

  **5 · HAP KUTUNUN EN ÜSTÜNE, BAŞLIKTAN ÖNCEYE** (üçüncü tur). Sıra cümlenin mantığı: önce
  "hangi yer için konuşuyoruz", sonra o yer hakkındaki hüküm. Hap eylem yuvasındayken hükümden
  SONRA geliyordu. Kutu başlığın üstünü bilmiyordu — kite **`Note header`** yuvası eklendi
  (`action`ın ikizi, aynı gerekçe: kontrolü kutunun DIŞINA koymak kutuyu bir cümleye indirir).
  Yuvanın taşıdığı söz SIRADIR, o yüzden testi `toBeOnTheScreen` değil ağacın ÇOCUK SIRASI:
  kutunun ilk çocuğu üst yuvadır. Öteki on çağıran değişmedi. Hap tek başına kalınca iki eşit
  sütun da gereksizleşti ve söküldü; "Buraya da gelin" artık yığında tek başına.

  **6 · HAPTA ŞEHİR DE VAR, HAP SOLA YASLI, BAŞLIK "BÖLGE" DİYOR** (ikinci tur, aynı gün).
  Etiket vitrin başlığının biçimine tam oturdu: `67000 STRASBOURG ▾`. Şehir sözleşmede `null`
  olabiliyor (tanınan kodun adı bilinmeyebilir) — o hâlde yalnız kod yazılır, uydurma yer tutucu
  basılmaz; iki iddia da bunu tutuyor. Hap ORTALI değil SOLA yaslı: kutunun başlığı ve cümlesi de
  sola yaslı, ortalanmış hap onlarla aynı sütundan başlamıyordu — ayrıca kayıt alınıp "Buraya da
  gelin" kalkınca ortalı hap kutunun ortasına kayardı. Başlıktaki *"Bu adrese"* → **"Bu bölgeye"**
  (üç dilde): kart bir ADRESİ değil, posta kodunun tarif ettiği BÖLGEYİ konuşuyor.

  **AÇIK BIRAKILAN, gerekçesiyle:** "Buraya da gelin"e basınca *"zaten kayıtlısınız"* deyip düğmenin
  kaybolması bir gecikme gibi görünüyor ama başka türlü olamaz — kaydın varlığını **ancak POST'un
  cevabı** söylüyor (`ok`/`already`), okuma ucu YOK. Düğmeyi baştan gizlemek için ya bir okuma ucu
  açılmalı (`zone_notice` sorgusu, iki yüzeyin ortak motoru) ya da her liste açılışında fazladan
  bir istek atılmalı. Kullanıcı ölçümü duyunca *"gerekiyorsa kalabilir, problem değil"* dedi;
  ihtiyaç doğarsa iş `BACKLOG-musteri`ye açılır.

  **Doğrulama:** mobil typecheck rc=0 · eslint · knip (yeni ölü ihraç yok) ·
  **84 suite / 598 test** yeşil.

- [x] (21.41) **ÇEKMECE YUKARIDAN TAŞIYORDU — müşterinin yazdığı kutu ekranın dışına kaçıyordu
  (kullanıcı bulgusu 11.08, cihazda ölçüldü).**
  `touches:` `apps/mobile/src/components/ui/bottom-sheet.tsx` ·
  `apps/mobile/src/components/ui/suggestion-list.tsx` ·
  `apps/mobile/src/screens/support/new-ticket-sheet.tsx`

  **Belirti (Android, yazı boyutu "Büyük"):** yeni adres çekmecesinde sokak alanına yazınca öneri
  listesi açılıyor, çekmecenin başlığı · etiket alanı · **yazılan kutunun kendisi** ekranın üstünden
  taşıyor ve durum çubuğunun altında kalıyordu. Kullanıcı iOS'ta daha ağır olduğunu bildirdi
  (*"komple ekranın dışına kaçıyor"*) — üstteki güvenli alan orada daha yüksek.

  **İKİ AYRI KUSUR, biri zemin biri tetikleyici:**

  **1 · Panelin tavanı klavyeyi ve üst güvenli alanı hesaba katmıyordu.** `maxHeight` TAM EKRANIN
  %82'siydi; klavye ekranın ~%35'ini alırken panel yine %82'ye kadar büyümeye yetkiliydi. Panel
  ALTA yaslı olduğu için fazlalık yukarıdan taşıyordu ve **içerik kaydırılamadığı için** geri
  getirmenin yolu yoktu. Üst güvenli alan hiç düşülmüyordu (alt taraf için `insets.bottom` vardı).

  **2 · Öneri listesinin boyu sınırsızdı.** Adres servisi beş öneri dönüyor, her satır iki satırlık;
  liste ekranın **%36'sını** yiyordu. Tavan `VISIBLE_ROWS = 3.5` ile kondu — yarım satır bilerek,
  "aşağısı var"ın kendisi. Yükseklik token'lardan hesaplanıyor, yazı boyutu ayarıyla ölçekleniyor.
  Lisans künyesi kaydırma alanının DIŞINDA sabitlendi (içeride olsaydı kayınca ekrandan çıkardı ve
  Etalab şartı ihlal edilirdi) ve kendi ayıracını aldı — üçüncü bir öneri gibi okunuyordu.

  **ÖLÇÜ TEK BAŞINA YETMEDİ (ilk turda cihazda görüldü):** klamp `insets.ime`ye dayanıyor, klavye
  yüksekliği her zaman raporlanmıyor; raporlanmayınca sınır düşüyor ve başlık yine kesiliyordu.
  Çare ölçüye değil KABA dayandırıldı: panel `flexShrink: 1` — klavyeden kaçınma katmanı ne kadar
  yer bırakmışsa panel en fazla o kadar olur, klavye ölçüsü hiç okunamasa bile taşma imkânsız.
  Sığmayan içerik panelin kendi kaydırma alanında kayar. `marginTop: insets.top` üst güvenli alanı
  kapatır.

  **DUPLİKASYON KAPANDI:** aynı çözümü `new-ticket-sheet` 09.08'de kendi içinde bulmuştu (künyesi:
  *"sığmayan adım sessizce kırpılırdı"*). Tek ekranda kalması, aynı taşmanın öteki yedi çekmecede
  sürmesi demekti — kaydırma kaba taşındı, ekrandan kaldırıldı (CLAUDE §1).

  **3 · KLAVYE AÇIKKEN ALT GÜVENLİ ALAN EKLENMEZ (iPhone bulgusu, aynı gün — düzeltmenin ikinci
  turu).** Kullanıcı iOS'ta klavyenin hemen üstünde kullanılamaz bir şerit gördü ve ekran ilk
  bakışta kesilmiş gibi duruyordu; ikinci bakışta **işlev kaybı olmadığı** anlaşıldı (içerik
  kayıyor, Kaydet düğmesine ulaşılıyor) — kusur görüntüde, davranışta değil. Sebep: panelin alt
  nefesi ana ekran çubuğu payını (`insets.bottom`) klavye açıkken de ekliyordu; o pay çubuğun
  üstünü boş tutmak içindir, klavye zaten orayı kapatıyor. Android'de ölçü klavye açılınca sıfıra
  düşüyor, iOS'ta düşmüyordu — koşul (`insets.ime > 0`) ikisini aynı davranışa getirdi.
  **iOS'ta KULLANICI DOĞRULADI** (11.08 — *"iOS'taki problem şimdilik düzeldi"*); Android'de
  gerileme olmadığı ölçüldü.

  **Doğrulama:** mobil typecheck rc=0 · `customer-kit` + `components/ui` **25 suite / 142 test**
  yeşil · **cihazda ölçüldü** (OPPO CPH1907, yazı boyutu "Büyük"): düzeltmeden önce başlık ve kutu
  kesikti, sonra başlık · etiket · yazılan kutu · üç öneri + künye · posta kodu · şehir · uyarı ·
  Kaydet düğmesi hepsi ekranda; alt nefes değişikliğinden sonra da aynı. Ekran görüntüleri alındı;
  **veritabanına yazılmadı** (Kaydet'e dokunulmadı).

- [x] (21.42) **SEPET VE ADRESTE İKİ ÇELİŞKİ KAPANDI — biri cümlenin tabanını söylemesi, öteki
  uydurma bir genellemenin kaldırılması (kullanıcı kararları 11.08).**
  `touches:` `apps/mobile/src/screens/cart/messages.json` ·
  `apps/mobile/src/screens/customer-kit/address-form.tsx` ·
  `apps/mobile/src/screens/customer-kit/address-sheet-messages.json`

  **1 · ASGARİ SEPET CÜMLESİ TABANINI SÖYLÜYOR (MB-21).** Cihazda ölçülmüştü: ekranda
  `Toplam 3,80 €` yazarken altında `Asgari sepet 40,00 € — 33,20 € eksik` çıkıyordu; eksik indirim
  ÖNCESİ ara toplamdan (6,80) hesaplanıyor, müşteri 36,20 bekliyordu.
  **Kullanıcı kararı: eşik İNDİRİMSİZ toplam fiyata bakar** — yani motor zaten doğruymuş
  (`packages/application/src/cart/read.ts` → `meets(subtotalCents - undeliverableSubtotalCents, …)`).
  **Hesapta tek satır değişmedi**; kusur cümlenin hangi tutara baktığını söylememesiydi. Yeni metin:
  *"Asgari sepet {minimum} — **ara toplamınıza** {missing} eksik"* (fr *au sous-total*, de *Ihrer
  Zwischensumme*). Müşteri hemen üstteki **Ara toplam** satırını görüp çıkarmayı kendi yapıyor;
  indirimlerin sayılmadığı da cümleden anlaşılıyor. Web'de aynı mantık geçerli, motor ortak olduğu
  için hesap zaten aynı — cümle için `docs/talep/musteri-asgari-sepet-cumlesi.md` açıldı.

  **2 · ADRES FORMUNDAKİ BÖLGE GENELLEMESİ KALDIRILDI (MB-51).** Form *"67 ile başlayan posta
  kodları teslimat bölgemizdedir — kapıya ücretsiz teslim"* diyordu. **Ölçüldü (cihaz + veritabanı):
  aktif bölgeler yalnız 67000 · 67100 · 67200 · 67300 · 67400 · 67540 · 67800.** Müşterinin kayıtlı
  67380 adresi bu cümleye göre bölge içindeydi, ödeme ekranı ise aynı adrese *"teslimat bölgemizin
  dışında"* deyip 7,90 € kargo çıkarıyordu — iki ekran zıt şey söylüyordu.
  **Yerine yenisi YAZILMADI** (kullanıcı: *"genellenmiş ve statik bir metin istemiyoruz… zaten tüm
  posta kodlarının listesine kullanıcı erişebiliyor"*). Doğru bilgi zaten iki yerde: teslimat
  bölgeleri sayfasındaki tam liste, ve onboarding'in GERÇEK veriden kurduğu dört hâlli cümle
  (`usePlaceResolution`). Kaldırılan yalnız uydurma genellemeydi. Sözlükten üç dilde silindi.

  **Doğrulama:** mobil typecheck rc=0 · eslint (kullanılmayan `Text` importu da temizlendi) ·
  `customer-kit` **24 test** + `cart` **9 test** yeşil.

- [x] (21.43) **DAVET ZİNCİRİNİN MOBİL YARISI — bağlantı uygulamada açılıyor, kabul cihazda
  saklanıyor, ilk girişte kayda bağlanıyor; hesap ekranındaki üç kat yanlış vaat kalktı.**
  `touches:` `packages/types/src/contracts/{invite-api.schema.ts,index.ts}` ·
  `apps/mobile-api/src/api/v1/{invite.ts,router.ts,auth-otp.ts}` ·
  `apps/mobile/app.config.ts` · `apps/mobile/.env.example` ·
  `apps/mobile/src/app/{+native-intent.tsx,invite/[code].tsx}` ·
  `apps/mobile/src/screens/invite/*` · `apps/mobile/src/lib/invite/*` ·
  `apps/mobile/src/lib/{auth/otp.ts,storage/device-store.ts}` ·
  `apps/mobile/src/screens/account/{account-screen.tsx,messages.json,use-points.hook.ts}`

  **BAĞLAM:** zincirin sunucu yarısını web şeridi kurdu (17.9 — karşılama sayfası, `/invite/[code]`
  rotası, `inviteUrl`, `linkReferrer`ın OTP akışına girmesi, ilişkilendirme dosyaları, ve getiren
  ödülünün teslimattan **ödemeye** taşınması). Bu satır o zincirin cihaz ucudur; ikisi birlikte
  17.7'nin iki yıldır kopuk duran halkasını kapatıyor.

  **1 · BAĞLANTI UYGULAMADA AÇILIYOR.** Davet bağlantısı bir web adresi
  (`https://…/<dil>/davet/<kod>`) ve öyle kalması gerekiyor — uygulaması olmayan davetli onu
  tarayıcıda açar. Uygulaması olanda açılabilmesi için üç parça yazıldı: `app.config.ts`e iOS
  `associatedDomains` + Android `autoVerify`lı `intentFilters`, ve `+native-intent.tsx` — gelen
  adresi (`/fr/parrainage/AB12CD34`) iç rotaya (`/invite/AB12CD34`) çeviren kanca. **Üç dilin
  davet segmenti YAZILMADI, `PATHNAMES`ten türetiliyor** (`localizedPath`): elle yazılan liste,
  rota adı değiştiğinde sessizce eskir ve bağlantı bir gün uygulamayı hiç açmaz — hata da vermez.
  **Alan adı yoksa beyan da yok:** `EXPO_PUBLIC_SITE_URL` boş/yerelken derin bağlantı yapılandırması
  hiç yazılmıyor; `localhost` ilişkilendirilemez ve uydurma bir alan adı, işletim sisteminin
  BAŞARISIZ doğrulamayı önbelleğe almasına yol açar (gerçek alan adı geldiğinde de çalışmaz).

  **2 · KARŞILAMA EKRANI — dört hâl, web sayfasıyla birebir.** `GET /api/v1/invite/:code` (açık uç,
  `optionalCustomerId` ile kimlikten yararlanır) `readInviteWelcome`i çağırıyor; ekran `ok` ·
  `self` · `already_customer` · `unknown` hâllerini kitin boş-durum bloğuyla çiziyor. **Tanınmayan
  kod hata ekranı DEĞİL** — bağlantı WhatsApp'ta kırpılmış olabilir; katalog kapısı açık kalır.
  Ağ hatası ondan AYRI çizilir: ikisini birleştirmek, geçici bir bağlantı sorununda davetliye
  kodunun geçersiz olduğunu söylemek olurdu.

  **3 · KABUL DOKUNUŞTA, BAĞ İLK GİRİŞTE.** Kod cihaza ancak davetli bir düğmeye bastığında yazılır
  (`lib/invite/invite-store.ts` — web çerezinin native karşılığı; bağlantıyı açmak bir niyet
  değildir). Doğrulama anında `verifyOtp` onu gövdeye ekleyip tüketiyor. **Kodu ekranlar değil bu
  kapı taşıyor** ve bilerek: uygulamada giriş iki yerden yapılıyor (giriş ekranı · akış içi kimlik
  adımı) ve çağıranlara bırakılsaydı sunucuda yaşanan arızanın aynısı istemcide kurulurdu — bir
  yüzey unutur, davetli sessizce bağsız kalır, ödül hiç yazılmaz, kimse fark etmez.

  **4 · HESAP EKRANINDAKİ VAAT GERÇEĞE ÇEKİLDİ (MB-53).** Metin üç kat yanlıştı: arkadaşa vaat
  edilen 5 € indirim hiç üretilmiyor, davet edene yazılan şey kupon değil puan, ve paylaşılan şey
  **kodun kendisiydi** — o kodun girilebileceği bir yer hiçbir ekranda yoktu, zincir orada
  kopuyordu. Artık **bağlantı paylaşılıyor** (`wallet.inviteUrl` — adresi ekran KURMAZ, sunucu
  verir) ve cümle ödülün gerçek anını söylüyor: *"davet ettiğiniz kişi hesabını açıp ilk siparişinin
  ödemesini tamamladığında puanınız yazılır"*. Sayı yazılmadı — miktar ayardan gelir ve kazanma
  yolları kartı onu zaten sunucudan okuyor. Bir yan arıza da kapandı: blok koşulu profilin HAM
  `referralCode`üne bakıyordu, yani kodu henüz üretilmemiş müşteri davet bölümünü hiç görmüyordu;
  koşul artık kodu GARANTİLEYEN cüzdan kartından okunuyor. Sipariş puanı kalktığı için "Sipariş,
  yorum ve keşif turlarıyla birikir" cümlesi de üç dilde düzeltildi.

  **AÇIK KALAN (kayda geçti: `docs/uygulama/BACKLOG-musteri.md` MB-60): Google ile kaydolan
  davetlinin bağı kurulmuyor.** Davet kodu
  yalnız OTP doğrulamasında okunuyor (`verifyOtpCode`) — Google akışı Supabase'e doğrudan gidiyor ve
  oradan geçmiyor. **İki yüzeyde de aynı** (web'de de yalnız `otp-actions` ve misafir checkout'u
  okuyor), yani kapatılacak yer ortak kayıt yolu; `docs/talep/` üzerinden web şeridine bildirildi.

  **Doğrulama:** `pnpm typecheck` **18/18** rc=0 · `pnpm lint` temiz · `pnpm knip` yeni bulgu
  üretmedi · `pnpm test:unit` **1347 test** yeşil · mobil jest **84 suite / 598 test** yeşil.
  **Cihaz turu YAPILMADI:** derin bağlantının cihazda sınanması gerçek bir alan adı + ilişkilendirme
  dosyaları ister (ikisi de mağaza başvurusuyla doğar), yerelde `localhost` ilişkilendirilemez.
  Karşılama ekranının kendisi rota üzerinden sınanabilir.

- [x] (21.44) **DAVET BAĞI GİRİŞ YÖNTEMİNİ ARTIK BİLMİYOR — Google ile kaydolan davetli sessizce
  bağsız kalıyordu.**
  `touches:` `apps/mobile-api/src/api/v1/{invite.ts,router.ts,auth-otp.ts}` ·
  `apps/mobile/src/lib/invite/invite-api.ts` · `apps/mobile/src/lib/auth/{otp.ts,oauth.ts}`

  **ÖLÇÜLMÜŞ BOŞLUK.** `(21.43)`te davet kodu `/auth/otp/verify` gövdesine konmuştu ve gerekçesi
  o gün doğruydu — "müşteri kartının doğduğu tek yer burası". **Ama o cümle yalnız OTP için
  doğruydu:** Google akışı Supabase'e doğrudan gidiyor, profili trigger açıyor ve o uçtan hiç
  geçmiyor. Davet bağlantısına tıklayıp *"Google ile devam et"* diyen davetli bağsız kalıyordu —
  hata yok, log yok, ödül yok. Üstelik **en olası yol buydu**: davetli çoğu zaman telefonunda
  oturumu açık bir Google hesabıyla geliyor. (Kullanıcının kendi sorusu da buradan çıktı:
  daveti yalnız e-postaya bağlamak bunu çözer miydi — çözerdi ama tek kapıya indirerek; doğru
  çözüm yolu kapatmak değil, bağı yöntemden bağımsız kılmaktı.)

  **ÇARE İKİ YOLU AYRI AYRI YAMAMAK DEĞİL.** Web aynı boşluğu 17.11'de ortak bir kapıyla kapattı
  (`attachReferralOnLogin`) ve "yeni müşteri" ölçütünü kayıt anından **siparişsizliğe** çevirdi —
  OAuth'ta "kart az önce mi doğdu" sorusu ancak bir zaman penceresiyle tahmin edilebilirdi, o da
  sessizce yanlışlanabilir bir ölçüt olurdu. Mobil yarısı bu satır: yeni uç
  `POST /api/v1/me/invite/claim` (Bearer'ın ardında, gövdesi tek alan) aynı ortak kapıyı çağırıyor;
  cihazda da tek bir çağrı var (`claimPendingInvite`) ve **oturumun gerçekten kurulduğu iki noktadan**
  çağrılıyor — `verifyOtp`un `setSession`i ve `exchangeOAuthCode`un değişimi.

  **OTP GÖVDESİNDEKİ ALAN KALDIRILDI.** İki mekanizma bırakmak, yarın doğacak üçüncü giriş yolunun
  (WhatsApp — bugün her iki yüzeyde de yalnız "çok yakında" düğmesi) hangisini çağıracağını
  belirsiz bırakırdı; CLAUDE §1'in duplikasyon yasağı burada bir davranış kuralı olarak işliyor.
  Tek kapıya inmenin ikinci faydası: kapı **idempotent** olduğu için derin bağlantının iki kez
  işlendiği hâlde (soğuk açılış + olay) ikinci çağrı zararsız.

  **Tek kaynağa inilmedi, İNİLEMEDİ:** `onAuthStateChange` dinleyicisi tek nokta olurdu ama abone
  olur olmaz `INITIAL_SESSION` ile de tetikleniyor (sepet deposunun künyesi) — her açılışa ölü bir
  bağlama denemesi eklerdi. İki çağıran da `lib/auth/` içinde ve ikisi de tek satır.

  **Doğrulama:** `pnpm typecheck` 18/18 rc=0 · `pnpm lint` temiz · `pnpm knip` yeni bulgu yok ·
  `pnpm test:unit` **1357 test** yeşil · mobil jest **84 suite / 598 test** yeşil. Cihaz turu
  yapılmadı: Google turu gerçek bir OAuth istemcisi ve derin bağlantı dönüşü ister.

- [x] (21.45) **KOMŞU DAVETİNİN CİHAZ YARISI — bağlantı uygulamada açılıyor, davet sepete kadar
  taşınıyor, komşunun günü önseçili geliyor ve sipariş sonrası paylaşılıyor.**
  `touches:` `packages/types/src/contracts/{invite-api.schema.ts,checkout-api.schema.ts}` ·
  `apps/mobile-api/src/api/v1/{invite.ts,router.ts,checkout.ts}` ·
  `apps/mobile/app.config.ts` · `apps/mobile/src/app/{+native-intent.tsx,neighbor/[token].tsx,checkout/confirmed.tsx}` ·
  `apps/mobile/src/screens/neighbor/*` · `apps/mobile/src/screens/checkout/*` ·
  `apps/mobile/src/lib/invite/*` · `apps/mobile/src/lib/storage/device-store.ts`

  **BAĞLAM:** sunucu yarısı web şeridinde (17.10 + 12.08 düzeltmesi). Bu satır cihaz ucu; ikisi
  birlikte davetin İKİNCİ türünü — kullanıcının *"sefer daveti"* dediği şeyi — çalışır hâle
  getiriyor. Getiren davetinden farkı kavramsal: o bir KİŞİYE çağırır, bu bir GÜNE.

  **1 · BAĞLANTI UYGULAMADA AÇILIYOR.** Komşu rotası kendi segmentlerini kullanıyor (`komsu` ·
  `voisin` · `nachbarn`) ve `(21.43)`ün filtresi yalnız getiren davetini tanıyordu — yani komşu
  bağlantısı uygulamayı **hiç açmıyordu**, sessizce: açılmayan bir derin bağlantı tarayıcıda
  açılır ve kimse arıza sanmaz. Hem Android filtresi hem `+native-intent` eşlemesi artık bir
  LİSTE üzerinden çalışıyor ve segmentler yine `PATHNAMES`ten türüyor; üçüncü bir davet rotası
  doğsa tek satırla katılır. Web tarafı da aynı turda aynı şeyi yaptı (ilişkilendirme dosyası
  artık tablodan türetiyor) — iki taraf aynı kümeyi okuduğu için el sıkışma kendiliğinden eşleşiyor.

  **2 · KARŞILAMA EKRANI — beş hâl.** Getiren davetinin dördüne karşılık burada iki hâl daha var
  ve ikisi de gerçek: seferi GEÇMİŞ olabilir, kontenjanı DOLMUŞ olabilir. Ayrı ekran yazıldı,
  ortak ekrana sığdırılmadı: hiç dolmayan dallar taşıyan bir bileşen olurdu. **Reddedilen hâller
  de tarih taşıyor** — "sefer geçti" cümlesi hangi seferin geçtiğini söyleyebilmeli. Müşteri
  yüzeyinde *"sefer"* kelimesi geçmiyor (kullanıcı kararı): gün söyleniyor.

  **3 · DAVET SEPETE KADAR TAŞINIYOR — kullanıcının asıl sorusu buydu.** *"Kullanıcı ister önce
  gitsin, hesap açsın, gezinsin. Sonra mobil uygulamayı yüklesin. Sepete geldiğinde bunu
  görebilmeli."* Cihaz belirteci yalnız KİMLİK doğana dek taşıyor; giriş anında kişiye devrediliyor
  (`/me/invite/claim`, iki davet türü tek gövdede) ve ondan sonrası **sunucudan** okunuyor.
  Checkout anlık görüntüsü `neighborInvite` alanını taşıyor: ekran davet cümlesini gün seçiminin
  hemen ÜSTÜNDE yazıyor (cümle o seçimin gerekçesi) ve **komşunun günü önseçili** geliyor — ama
  kilitli değil: müşteri dokunduğu an kendi seçimi geçerli. Davet bir çağrıdır, kısıt değil.

  **4 · SİPARİŞ SONRASI PAYLAŞIM ŞERİDİ.** Kullanıcının işaret ettiği an: *"nerede görünür —
  sipariş tamamlandı ekranında; en değerli an orası, sefer somut, gün belli."* Ekran `orderId`
  taşımaya başladı (görünmüyor, yalnız daveti açıyor) ve `POST /me/invite/neighbor` daveti
  ÜRETİYOR — peşinen açılmıyor, çünkü müşterilerin çoğu komşusunu çağırmaz. Bağlantı yoksa şerit
  hiç çizilmiyor (kargo siparişi · kesim saati dolmuş sefer): süzgeç sunucuda, iki yerde
  süzülmüyor.

  **DÜZELTİLEN KUSUR (kendi turumuzda ölçüldü):** devir çağrısı düşse bile cihazdaki davet
  siliniyordu. Profil henüz yazılmamışsa (trigger yarışı) ya da ağ koparsa davet HİÇ sorulmadan
  kaybolurdu — kullanıcının şikâyet ettiği sessiz kaybın ta kendisi. Artık tüketim yalnız çağrı
  başarılıysa; web'in *"profil yoksa çerez korunur"* kuralının aynısı.

  **Doğrulama:** `pnpm typecheck` **18/18** rc=0 · `pnpm lint` temiz · `pnpm knip` yeni bulgu yok ·
  `pnpm test:unit` **1358 test** yeşil · mobil jest **84 suite / 598 test** yeşil. *(Bir koşuda dört
  rota testi zaman aşımına düştü — 29,6 sn süren yüklü koşu; tekil ve sonraki iki tam koşuda hepsi
  yeşil, 11 sn. Kod değil yük.)*

- [x] (21.46) **CİHAZ TURU — üç arıza ölçüldü ve düzeltildi; ikisi metin, biri akışı sessizce
  öldürüyordu.** `touches:` `apps/mobile/src/screens/{invite,neighbor,checkout,account}/*`
  (sözlükler + iki `accept` + checkout bandı)

  Şema `db:reset`siz tamamlandı (kullanıcı, 12.08) ve akış OPPO CPH1907'de uçtan uca sürüldü.
  Karşılama ekranları derin bağlantıyla açıldı, kabul yazıldı, checkout'ta bant ve önseçili gün
  görüldü. **Üç arıza çıktı:**

  **1 · GİRİŞLİ MÜŞTERİDE KABUL SUNUCUYA HİÇ YAZILMIYORDU.** Ölçüldü: daveti kabul ettik,
  `neighbor_invite_claim` boş kaldı. Sebep: devir yalnız GİRİŞ anında koşuyordu, oysa oturum
  kalıcı — o an hiç gelmeyebilir. Ve komşu davetinin alıcısı **çoğu zaman zaten müşterimiz**
  (kullanıcı kararı 11.08), yani akışın en olası yolu sessizce ölüydü. Kabulden hemen sonra devir
  deneniyor artık; kapı oturum varsa şimdi yazar, yoksa 401'e düşer ve belirteç ilk girişte
  değerlendirilir — **kullanıcının vurgusu:** *"her halükarda ihtiyacımızı karşılayan bir yapı
  olması lazım"*. Tekrar ölçüldü: kayıt düşüyor.

  **2 · BANT SEÇİMDEN BAĞIMSIZ KONUŞUYORDU.** Tek metin yazılmıştı: *"…çağırdı — o gün sizin için
  seçili."* Müşteri başka güne dokununca cümle YALANA dönüyordu ve zararsız değildi: davet yalnız
  tam gün eşleşmesinde bağlanıyor, yani müşteri komşusunun seferine katıldığını sanırken ödül hiç
  yazılmayacaktı. İkinci cümle eklendi — uyarı değil ÇAĞRI: *"Birlikte teslim alıp puan kazanmak
  için o günü seçin."*

  **3 · METİNLER ÜÇ YERDE FAZLA SÖZ VERİYORDU** (kullanıcı sorusu: *"kullandığın cümlelerin
  kullanıcıyı yanlış yönlendirmediğinden emin misin"*):
  · *"hesabını açtığında / sipariş verdiğinde puanınız yazılır"* → ödül **ödeme** anındadır;
  · paylaşım metnindeki *"bu hafta"* → gün gelecek haftaya da düşebilir, bilmediğimiz bir şeydi;
  · davetliye *"soğuk zincirle kapınıza kadar"* → **adresini bilmiyoruz**; bölge dışındaysa kargoyla
    gider ve soğuk zincir ürünü hiç gidemez. Getiren davetinden ve paylaşım metninden çıkarıldı,
    komşu davetinde bırakıldı (orada araç gerçekten o güne çıkıyor). Komşu ekranındaki *"aracımız
    SİZİN sokağınızda"* da *"komşunuzun sokağında"* oldu.

  **DOĞRULANAN KURGU (kullanıcı sorusu 12.08 — çoklu sefer):** davet ÜÇÜNCÜ sefere kurulup ölçüldü;
  checkout en yakın günü değil **davetin gününü** önseçili getirdi. Bağ da tam eşleşme istiyor
  (`matchNeighborInviteForOrder`), yani başka güne verilen sipariş daveti tüketmiyor.

  **AÇIK KALAN (denetim şeridine iletildi):** `readPendingNeighborInvite` bekleyen davetlerden
  yalnız EN YAKINI dönüyor. Bir kişi iki ayrı sefere çağrılmışsa bant ötekini hiç anmaz ve yeni
  "o günü seçin" cümlesi onu geçerli bir seçimden geri çağırır. Alan sözleşmesi web'de.

  **Doğrulama:** `pnpm typecheck` 18/18 · `pnpm lint` temiz · mobil jest **598 test** yeşil ·
  **cihazda ölçüldü** (OPPO CPH1907): getiren `self`, komşu `unknown`/`ok`, kabul → kayıt,
  checkout bandı + önseçili gün + gün değişince cümlenin dönmesi. Ekran görüntüleri alındı.
  **Sipariş sonrası paylaşım şeridi denenmedi** — gerçek sipariş açmayı gerektiriyor.
  **Gerçek `https://` bağlantısı yerelde sınanamaz** (`localhost` ilişkilendirilemez).

- [~] (21.47) **PUAN ARTIK ANLATILIYOR — VE NATIVE'DE GERÇEKTEN YAZILIYOR** (kullanıcı kararı 12.08).
  `touches: packages/types/src/contracts/points-api.schema.ts, packages/application/src/customer/points.ts,
  apps/mobile-api/src/api/v1/{points,router}.ts, apps/mobile/src/{app/_layout.tsx,lib/api/points.ts,
  lib/points,screens/{customer-kit/points-earn-*,onboarding,account,login}}`

  **İSTEK:** onboarding'in SON adımı puan olsun; kazanılabilecek puan **paraya çevrilerek** söylensin;
  detayını isteyene her yolun mantığı anlatılsın; hesap ekranında puanı kupona çevirdiği yerde
  *"nasıl puan kazanırım"* bağlantısı olsun. *"Eğer sonra derse uygulamaya giriş yapsın."*

  ── ÖNCE ÖLÇÜM: SÖYLEYECEĞİMİZ ŞEYİN YARISI DOĞRU DEĞİLDİ ───────────────────
  Metni yazmadan önce motorun ne yazdığı ölçüldü. **Günlük giriş puanı native'de HİÇ yazılmıyordu**
  (MB-50): `awardPoints(reason:'visit')`ın tek çağrı yeri `apps/web/lib/feedback/visit-actions.ts`
  köprüsüydü. Onboarding o ödülü müşteriye söyleyecekti — yani açık kapanmadan metin yazmak,
  ekranı motordan cömert yapmaktı (29.07 denetiminin arıza sınıfı). Açık bu görevde kapandı.

  ── SÖZLEŞME: KURAL KİMLİKTEN AYRILDI ───────────────────────────────────────
  Onboarding'i gören kişi MİSAFİR: bakiyesi yok, `/me`ye gidemez. Yeni `PointsRulesSchema`
  (`redeem` + `centValue` + `earnWays`) kimliksiz okunur (`GET /api/v1/points/rules`, `bearerAuth`
  ÖNCESİ); `MePointsCardSchema` onu `merge` ile alır ve üstüne bakiye/kod/adres bindirir — iki
  okuma **kopya değil**, kart kural kapısını çağırıyor. `MePointsEarnWayKeyEnum` üçten **altıya**
  genişledi (`referral · neighbor · review · visit · feedback_purchase · feedback_candidate`);
  `order` DIŞARIDA çünkü sipariş puanı kaldırıldı (karar 1) — kazanılamayan yolu listelemek
  motorun vermeyeceği bir sözdür. Genişleme hesap ekranını DERLEMEDE kırdı, tasarlandığı gibi.

  ── ÜÇ YÜZEY, TEK ANLATIM ───────────────────────────────────────────────────
  `screens/customer-kit/points-earn-list.tsx` + kendi sözlüğü: onboarding kartları · hesap kartının
  boş hâli · hesaptan açılan çekmece. Üç ayrı metin kümesi, bir ödül değiştiğinde ikisinin
  unutulduğu üç ayrı hikâye olurdu. Para karşılığı `points × centValue` ile TÜRETİLİR, metne
  gömülmez. **Onboarding sayı UYDURMAZ:** kural okunamazsa satırlar hiç çizilmez ve nedeni yazılır.

  ── ONBOARDING'DE LİSTE DEĞİL, KART KART (kullanıcı kararı 13.08) ───────────
  İlk kurgu altı yolu tek adımda açılır bir liste yapıyordu. Kullanıcı cihazda görüp eledi:
  *"listeyi beğendim, fakat bu liste HESAP SAYFASINDAN açılmak için uygun. Bilgi verme stilimiz
  bu şekilde liste değil — onboarding KART KART bilgi veriyor."* Puan bölümü **dört karta** bölündü:
  giriş kartı (oran + en güçlü sayı) → **Çağırdıkça** (500 + 100) → **Anlattıkça** (20 + 5) →
  **Uğradıkça** (10 + 2). Gruplar "kaç puan"a göre değil **"ne yaparak"**a göre: müşteri kendini
  bir gruba yerleştirebiliyor ("ben alışveriş yapmam ama uğrarım"). Sıra ödülün büyüklüğüne göre —
  kart kart ilerleyen müşteri en çok kazandıran yolu ilk görür.

  **Ana düğme soruyu KENDİSİ soruyor:** giriş kartında *"Nasıl puan kazanılır?"* yazıyor ve cevabı
  bir sonraki kart veriyor; merak açılır bir listeye değil akışın kendisine bağlanıyor.
  **Hesap teklifi ancak SON kartta** (kullanıcı: *"en son adıma gelirse puan sisteminde, o zaman
  hesap açmayı öneririz"*) — puanı anlatmadan hesap istemek, sebebini söylemeden kapıda kimlik
  sormaktı. *"Sonra bakarım"* puan bölümünün her kartında duruyor ve doğrudan vitrine sokuyor.

  **Adım sayısı SABİT DEĞİL, karttan türer:** ayarı okunamayan yol listeye girmiyor, yani bir grup
  boş kalabilir — boş grubun kartı da açılmıyor ve noktalar onu saymıyor. Var olmayan bir kartı
  saymak, müşteriye tamamlanamayacak bir ilerleme göstermek olurdu.

  **"Bol puan" paraya çevrildi ama VAAT edilmedi:** ekran *"ayda şu kadar kazanırsınız"* demiyor —
  o bir davranış varsayımıdır. Söylenen şey oran (`500 puan = 5,00 € kupon`) ve her yolun kendi
  para karşılığı; en güçlü sayı ayrıca anılıyor (*"bir arkadaşınızı getirmek tek başına 5,00 €"*).

  **11.08'in kararı GÜNCELLENDİ:** o gün *"onboarding'de tek cümle, liste yok, sayı yok"* denmişti
  (`BACKLOG-musteri §4` karar 2h). Yeni kurgu itirazı karşılıyor — ekranda özet + tek sayı, altı
  satırlık döküm yalnız İSTEYENE açılıyor.

  ── CİHAZ TURU: ÜÇ ARIZA ÖLÇÜLDÜ VE DÜZELTİLDİ ──────────────────────────────
  1. **Vurgu satırı çizilmiyordu.** `secureText` stili `flex: 1` taşıyor; güvence kutusunun SATIR
     düzeninde doğru, ama yeni DİKEY yığında yüksekliği sıfıra düşürüyor. Metin render ediliyor
     ama görünmüyordu — `uiautomator` dökümünde düğüm hiç yoktu. Kendi durağı açıldı.
  2. **Giriş ekranı ÖLÜ KAPI ile açılıyordu.** Onboarding `/login`e `replace` ile geliyor, oysa o
     ekran kendini `router.back()` ile kapatıyordu — yığında altında hiçbir şey yok. Cihazda
     görüldü: dev girişi başarılı oldu, ekran *"Doğrulandı — hoş geldiniz"*te ASILI kaldı,
     navigatör `The action 'GO_BACK' was not handled by any navigator` bastı. Çare onboarding'de
     değil giriş ekranında (`closeLogin`): çağıranı olmayan her yol — bildirim, derin bağlantı —
     aynı duvara çarpardı.
  3. **Giriş puanı hâlâ yazılmıyordu** — ilk iki tetikleyici (ilk kare · öne gelme) müşteri
     MİSAFİRKEN koşuyordu, giriş sonrası hiçbir şey tetiklemiyordu. Yani uygulamayı indirip hesap
     açan yeni müşteri ilk gününün puanını hiç alamıyordu. Üçüncü tetikleyici eklendi
     (`onAuthStateChange`). **Ölçüldü:** `points_entry`de `visit` satırı doğdu, bakiye 18 → 28.
  4. **Çekmecede iki başlık üst üste bindi** (kabuğun başlığı + listenin kendi başlığı). Başlık
     bileşenden söküldü; başlık her zaman ÇAĞIRANIN işi.

  **Doğrulama:** `pnpm typecheck` (mobil · mobile-api · types · application yeşil; `apps/web`in
  düşen 12 satırı BAŞKA ŞERİDİN commit edilmemiş dosyaları) · `pnpm lint` temiz · `pnpm knip`
  yeni bulgu yok · `pnpm test:unit` **1358 test** yeşil · mobil jest **599 test** yeşil ·
  `GET /api/v1/points/rules` kimliksiz ölçüldü (altı yol, gerçek ayar değerleriyle) ·
  **cihazda ölçüldü** (OPPO CPH1907): onboarding altı adım, puan ekranı, açılır liste, iki çıkış,
  giriş → vitrin, `visit` satırı, hesap çekmecesi.

  ── AYNI TURDA KAPANAN ÜÇ İŞ DAHA (kullanıcı istekleri 13.08) ───────────────
  **1 · POSTA KODU GEREKÇEDEN SONRA.** Adım sırası `dil → yazı boyutu → **teslimat** → posta kodu →
  ödeme` oldu: *"posta kodunu istediğimiz sayfa, neden istediğimizi anlattığımız sayfadan sonra
  olmalı."* Sebebini bilmeyen kişi kişisel veri alanını boş geçiyor.

  **2 · CEVAP BEKLENİRKEN SKELETON.** Posta kodu çözümü uçuştayken mesaj alanı boş duruyordu; artık
  cevabın ŞEKLİNİ taklit eden bir iskelet var (kısa satır = yer adı, uzun satır = teslimat cümlesi),
  yani cevap gelince ekran yeniden düzenlenmiyor. Aynı alan vitrinin teslimat çekmecesinde de var,
  iskelet oraya da kondu. **Ölçülmüş tuzak:** bekleyiş ilk kurguda `place === null`dan TÜRETİLİYORDU
  ve o hâl "istek düştü"yü de kapsıyor — ağ kesilse iskelet sonsuza kadar dönerdi. Bayrak artık
  isteğin kendisinden geliyor (`usePlaceLookup`, `finally` ile sönüyor); `usePlaceResolution` onun
  üstünde ince bir sarmalayıcı, sekiz çağrı yeri değişmedi.

  **3 · METİN DENETİMİ — üç olgusal yanlış (üç dilde birden).**
  · *"Yaptığınız her şey puan kazandırır — **alışveriş**…"* → alışveriş puan KAZANDIRMIYOR (sipariş
    puanı 11.08'de kaldırıldı). Ekran ilk cümlesinde motorun vermediği ödülü vaat ediyordu.
  · *"Posta kodunuza göre size ulaşabilen ürünleri gösteriyoruz — katalog yere göre değişir."* →
    katalog SÜZÜLMÜYOR (21.20 kararı, `catalog-screen.tsx`); posta kodu yalnız CÜMLEYİ değiştirir.
  · *"60 € üzeri kargo ücretsiz"* → `free_shipping_threshold_cents` KAPSAMLI: global 60 € · ülke
    90 € · b2b 250 €. Sabit sayı Alman müşteriye tutmayacak bir sözdü; sayı metinden çıkarıldı,
    gerçek tutar sepette söyleniyor. (Rota teslimatının ücretsizliği DOĞRU — `resolveShippingFee`
    rotada `feeCents: 0` dönüyor, o cümle korundu.)
  Ayrıca dilbilgisi: *"hem bize hem sonraki"* → **hem de** · *"getirmek tek başına 5,00 €"* fiyat
  gibi okunuyordu · *"İkisi de günlük"* yanlıştı (keşif oyu kart başına) · *"Size nasıl
  ulaştıralım?"* nesnesizdi.

  **4 · TERS YAZI KADEMESİ.** Kullanıcı *"fontlar küçük gibi, sanki daha önce üzerinde çalıştığımız
  konu"* dedi ve haklı çıktı: satır başlıkları `control` (13,5), açıklamaları `body-sm` (14) idi —
  **başlık kendi açıklamasından küçük**. `control` bir DÜĞME/SÜZGEÇ durağıdır, okunacak metnin
  değil. Aynı ters kademe teslimat/ödeme satırlarında da vardı (21.38 açıklamayı 14'e çıkarmış,
  başlığa dokunmamış). Yeni merdiven: **başlık ve rozet 15 · açıklama ve koşul 14 · güvence 13.**
  Sıklık satırı özellikle yükseldi — orada yazan şey süsleme değil ödülün KOŞULU ("en fazla 3").

  **5 · KOMŞU SINIRI SÖYLENİYOR.** *"Her komşu için 1,00 €"* iki şeyi gizliyordu: davet TEK BİR
  SEFERE ait ve kullanım hakkı SINIRLI. Ölçüldü (`0044_neighbor_invite.sql`): `max_uses` varsayılanı
  **3**. Sayı ekrana gömülmedi — `NEIGHBOR_INVITE_MAX_USES` `domain-core`da adlı bir sabit, davet
  açılırken AÇIKÇA o değerle yazılıyor ve aynı sabit kural ucundan ekrana geliyor.

  **Kalan (`BEKLEYEN(21.47)`):** kazanma yollarının BAĞLAM mesajları (karar 2h'nin tablosu —
  teslimat sonrası bant, keşif kartı bildirimi) yazılmadı; `feedbackPointsReason` keşifte metin
  varsa hâlâ `review` (20) döndürüyor (karar 6 — bugün keşifte metin alanı YOK, gizli tuzak).

- [ ] (21.48) **CİHAZ TURU — MİSAFİR VE MÜŞTERİ YÜZEYİ, KAPSAMLI** (kullanıcı kararı 12.08).
  `touches: docs/uygulama/05-cihaz-turu-musteri.md, apps/mobile/src`

  Senaryo ve kapsam defteri: `docs/uygulama/05-cihaz-turu-musteri.md`. Gerekçe ölçüldü — cihaz
  testlerimiz bugüne dek NOKTASAL yapıldı (her tur bir arıza şüphesiyle başladı), hangi ekranın
  cihazda hiç açılmadığını söyleyen kayıt YOKTU. Kapsam yalnız misafir + müşteri (kullanıcı:
  *"operasyon kısmına yetiştirme"*). Her ekranda İKİ soru: çalışıyor mu · anlaşılıyor mu.
  **Durum:** A1–A2 ve A6–A7 ile B1–B2, B5–B6 geçildi (görev 21.47'nin turu); geri kalanı açık.

- [x] (21.49) **HESABINI SİLME NATIVE'E GELDİ — ve dört backlog kalemi aynı turda kapandı**
  (14.08). `touches: apps/mobile-api/src/api/v1/router.ts, apps/mobile/src/lib/api/me.ts,
  apps/mobile/src/screens/account/{account-screen.tsx,messages.json},
  apps/mobile/src/screens/checkout/{checkout-screen.tsx,order-confirmed-screen.tsx,messages.json},
  apps/mobile/src/app/checkout/confirmed.tsx,
  apps/mobile/src/screens/professionals/application-form.tsx,
  apps/mobile/src/screens/home/{home-screen.tsx,collection-band.tsx},
  docs/talep/inceleme-analitik-web-native.md`

  Kapananlar: **MB-62** (hesabını silme) · **MB-49** (onaydaki uydurma puan satırı) · **MB-26**
  (etiketsiz form alanları) · **MB-27** (iki davet kartı iki görsel dilde) · **MB-25** (koleksiyon
  bandının kırptığı sayaç). Ayrıca **MB-24 ve MB-32'nin kayıtları ölçümle düzeltildi** (ikisi de
  sanıldığından başka çıktı) ve **analitik incelemesinin altı sorusu cevaplandı** — o dosya
  *"mobil cevabı gelmeden kod yazılmaz"* diyordu, yani başka bir şerit bekliyordu.

  **1 · HESABINI SİLME (MB-62) — MAĞAZA ŞARTIYDI, ölçüldü.** Web hesap sayfası 08.21'den beri
  siliyor (`deleteAccountAction` → `UserProfileService.anonymize` → `anonymize_customer` RPC);
  native'de karşılığı YOKTU ve ekran müşteriye *"silinmesini bonjour@lezzetanatolia.fr adresine
  yazarak talep edebilirsiniz"* diyordu. Bu bir eksik özellik değil **yayın engeli**: App Store
  5.1.1(v), hesap açtıran uygulamadan hesabın UYGULAMA İÇİNDEN silinebilmesini istiyor — e-posta
  yönlendirmesi kabul edilmiyor. Yani uygulama bugünkü hâliyle incelemeden geçmezdi.

  **İkinci bir silme kuralı YAZILMADI:** `DELETE /api/v1/me` web eyleminin çağırdığı kapının
  aynısını çağırıyor. Hangi tablonun silineceği, hangisinin kimliksizleşeceği kararı `0037`
  migration'ının içinde tek yerde duruyor; ikinci bir nüsha, iki yüzeyin bir gün farklı şey
  silmesi demekti (MB-50'nin "aynı müşteri iki yüzeyde iki kural" dersi).

  **Kimlik gövdeden alınmıyor, jetondan çözülüyor** — web eyleminin künyesindeki kalkanın aynısı:
  `anonymize` verilen kimliği sorgusuz anonimleştirir, yani bir parametre kabul etmek "bu benim
  hesabım mı" sorusunu uçta doğru sormayı şart koşardı. Soruyu ortadan kaldırmanın tek güvenli
  yolu parametreyi hiç almamak.

  **Çekmece bir "emin misiniz?" değil, NE OLACAĞINI söyleyen ekran** — ve GİDENLE KALAN aynı
  ağırlıkta çiziliyor. Gerekçe web'in künyesinden: silme bir `DELETE` değil, fatura kayıtları
  yasal olarak duruyor **faturadaki ad ve adres dâhil** (Fransız mevzuatı zorunlu kılıyor). Bunu
  yazmayan bir ekran, müşteriyi "hesabımı sildim" sanmaya bırakır ve faturasında adını gördüğü
  gün haklı olan o olur. Metin web'den KOPYALANMADI, birebir aynı karar üç dilde aynı cümlelerle
  verildiği için aynı metin kullanıldı — iki yüzeyin aynı yasal beyanı farklı kelimelerle
  yapması, hangisinin doğru olduğunu sorduracaktı.

  **Sıra ölçülmüş bir tuzağa göre:** önce sunucu siler, SONRA cihaz çıkış yapar. Sunucu
  `auth.users` satırını siliyor ama cihazdaki jetona dokunamıyor — web'de 08.08'de tarayıcıda
  ölçülmüştü (silme bitince oturum çerezi yerinde kalıyordu). Ters sıra, silmenin düştüğü bir
  koşuda müşteriyi hem hesabıyla hem çıkışla bırakırdı.

  **Doğrulama:** `tsc` iki pakette temiz; `jest src/screens/account src/screens/checkout
  src/lib/api` → 4 dosya / 17 test geçti; uç mount'u ölçüldü (`DELETE /api/v1/me` jetonsuz
  **401** dönüyor — 404 dönseydi rota hiç bağlanmamış olurdu).

  **CİHAZ TURU YAPILDI (14.08, kullanıcı yönlendirmesi).** İlk yazımda *"tek yönlü işlem, test
  hesabını geri getiremeyiz"* diye ertelenmişti; kullanıcı düzeltti — müşteri girişi hesabı
  KENDİLİĞİNDEN açıyor, yani kullan-at hesap serbest. **Seed müşterisine
  (`yamansehzade@gmail.com`, dev "Müşteri" düğmesi) DOKUNULMADI:** o hesabın siparişleri var ve
  silinmesi `db:refresh` gerektirirdi — tur iki kullan-at adresle yürütüldü, ikisi de silindi,
  curl ile açılan üçüncü deneme hesabı da temizlendi.
  Ölçülenler: hesap kartının altında **"Hesabımı sil"** görünüyor · çekmece giden/kalan bloklarını
  tasarlandığı gibi çiziyor · onaydan sonra uygulama misafire düşüyor · **silmeden önce alınmış
  jeton sonrasında `401` dönüyor**, yani `auth.users` satırı gerçekten yok edilmiş.
  **ÖlçülMEYEN sınır:** profil satırının silinmek yerine kimliksizleştiği ve sipariş/fatura
  kayıtlarının kaldığı bu turda GÖRÜLMEDİ — test hesaplarının siparişi yoktu. O yarı motorun
  sözleşmesi (`anonymize_customer`, 0037) ve web tarafında testli.

  **CİHAZ TURUNUN İKİ BULGUSU — ikisi de tur olmadan görünmezdi:**

  **(a) Onay düğmesi DOLGULU zeytin çizilmişti — kendi künyemizle çelişiyordu.** Çekmecenin
  künyesi *"bu bir birincil eylem değil"* diyor, düğme ise ekranın en güçlü çağrısıydı; web'in
  aynı diyaloğu bu kararı zaten vermiş (`delete-account.tsx`: *"dolgulu kırmızı bir düğme…
  müşteriyi silmeye davet ederdi"*) ve dolgusuz kullanıyor. **Kitte yıkıcı onayın karşılığı
  YOKTU** — `SecondaryButton` yalnız `sand` ve `olive` taşıyordu. Üçüncü ton (`terracotta`)
  eklendi (ikinci bir düğme türü açmak yerine — CLAUDE §1), vazgeç sessiz metne indi. Cihazda
  yeniden bakıldı: ikisi de dolgusuz, yıkıcı olan çerçeveli terracotta.

  **(b) `OTP_TEST_CODE` mobile-api'nin env'inde YOKTU — native'de OTP gerektiren hiçbir akış
  cihazda yürütülemiyordu.** Kök `.env` bunu taşıyor ve web/e2e kullanıyor; mobile-api kendi
  `.env.local`ini okuyor (`src/env.ts`) ve orada yoktu. Belirti yanıltıcıydı: kod isteniyor,
  ekran *"gönderdik"* diyor, girilen kod hep *"yanlış"* çıkıyor — çünkü gerçek rastgele kod
  üretilip Resend'e veriliyor ve kimse okuyamıyor. Yerel dosyaya eklendi (git dışı) ve **kalıcı
  çözüm `apps/mobile-api/.env.example`'a gerekçesiyle yazıldı**, yoksa bir sonraki kurulumda aynı
  duvara çarpılırdı. Kapı üretimde kendini kapatıyor (`NODE_ENV === 'production'` → kod yok).

  **2 · SİPARİŞ ONAYINDAKİ PUAN SATIRI SİLİNDİ (MB-49).** Ekran *"✦ Teslimatta +{n} puan
  kazanacaksınız"* diyor ve sayıyı KENDİSİ hesaplıyordu (`POINTS_PER_EURO = 1`, `tutar ÷ 100`);
  motor ise `points_order` ayarını okuyup sabit yazıyordu. Cihazda ölçülmüştü (11.08): 47,40 €'luk
  siparişte ekran **47**, defter **10** — 4,7 kat. Sonra kullanıcı kararıyla (11.08) sipariş puanı
  TÜMDEN kalktı, yani vaat edilecek puan da kalmadı. Satır, taşıyan rota parametresi, üç dildeki
  metin ve sabit birlikte söküldü — yerine bir sayı KONMADI. Ekranın puandan haberi olmaması
  artık bilinçli; puanın anlatıldığı yer hesap ekranı ve onboarding'in ortak listesi.

  **Kaldırılan iki yan kusur da kendiliğinden düştü:** ekran müşteri TİPİNİ bilmiyordu (B2B puan
  kazanamaz ama aynı vaadi görüyordu) ve günlük tavanı gözetmiyordu (tavana dayanmış müşteriye
  "kazanacaksınız" diyordu). İkisi de olmayan bir satırın kusuruydu.

  **3 · ÜÇ YERLEŞİM KUSURU (MB-26 · MB-27 · MB-25) — üçü de KENDİ KURALIMIZIN uygulanmaması.**
  Ortak dersi bu: hiçbiri yeni bir desen istemedi, üçünde de doğru davranış zaten bir künyede
  yazılıydı ve kullanılmamıştı.
  · **MB-26** — başvuru formunun sekiz alanı yalnız yer tutucu taşıyordu, oysa `TextField` künyesi
  *"görünür etiket isteyen ekran ayrıca `label` verir"* diyor ve hiçbir ekran vermiyordu. Kusur
  resmî kayıttan KENDİLİĞİNDEN dolan alanlarda görünür (yer tutucu dolunca kaybolur): müşteri
  "67380" ile "LINGOLSHEIM"i hiç yazmadan karşısında bulup ne olduklarını tahmin ediyordu.
  · **MB-27** — vitrindeki Profesyonel kartı `sand` tonundaydı ve canlı Keşif kartının yanında
  devre dışı gibi duruyordu. `dashed-invite.tsx` künyesi tonu zaten tanımlamış: *"`terracotta`
  çağırıdır, `sand` bilgidir."* Bu kart bilgi vermiyor, davet ediyor. Ton ve işaret aynılaştı;
  ölü kalan `inviteArrow` stili silindi.
  · **MB-25** — koleksiyon bandı dört satırlık başlıkta sayaç satırını kırpıyordu. Yükseklik
  SERBEST BIRAKILAMAZ (üst katman dairesi `index * collectionBand` ile konumlanıyor), o yüzden
  satır sınırı konuldu — ve sınır bütçeden türetildi: 132 dp'den "Büyük" yazı boyutunda göz üstü
  ~15 + sayaç ~17 + boşluklar 4 düşünce başlığa 96 kalıyor, satır ≈ 26,5 dp → üç satır sığar,
  dört satır 106 ile taşar (ölçülen hâl). İki satırda durduruldu; üçüncü aritmetik olarak sığsa
  da payı sıfırlıyordu.

  **4 · ANALİTİK İNCELEMESİNİN ALTI SORUSU CEVAPLANDI**
  (`docs/talep/inceleme-analitik-web-native.md` §5). Dosya 10.08'de denetim tarafından açılmış ve
  *"mobil cevabı gelmeden kod yazılmaz"* diyordu — yani bir şerit bekliyordu. Cevapların üçü
  denetimin varsayımını DEĞİŞTİRDİ: (a) UA'da kuruluma özgü entropi olmadığı tek cihazdan string
  okuyarak değil, **kod düzeyinde** kanıtlandı — `apiFetch` `User-Agent` başlığını hiç yazmıyor,
  yani değere kurulumdan gelen bir girdi giremiyor; (b) `staff_role` diye bir JWT talebi native'de
  YOK, rol `user_profiles.roles`ta ve bir profil okuması gerektiriyor; (c) huninin
  `add_to_cart` adımının **misafir yarısı yapısal olarak ölçülemez** — misafirin sepeti cihazda
  yaşıyor, uca hiç uğramıyor; oradaki tek uç bir GÖRÜNÜM okuması ve ona niyet yazmak
  `ANALYTICS §1` İlke 1'i tersinden ihlal ederdi. Ayrıca iOS Keychain uygulama silinince
  silinmediği için "yeniden kurulum yeni ziyaretçidir" kararının iki platformda farklı
  davranacağı önden söylendi. Backlog kaydı da açıldı (**MB-63**) — listede hiç yoktu.

- [x] (21.50) **KEŞİF YÜZEYİNİN İKİ YALANI KAPANDI — biri ölçülmüş bir SEBEBE dayanıyordu**
  (14.08). `touches: apps/mobile/src/screens/discover/discover-screen.tsx,
  apps/mobile/src/screens/home/{home-screen.tsx,home-skeleton.tsx}`

  **1 · MB-14 — bitiş ekranı aynı karede hem ödül hem giriş daveti gösteriyordu.** 11.08'de
  ölçülmüştü ama sebebi *"MB-13'ün görünen yüzü OLABİLİR"* diye tahmin olarak duruyordu.

  **DİKKAT — BU SATIR BİR KEZ FAZLA İDDİALI YAZILDI ve düzeltildi (kullanıcı denetimi 15.08).**
  İlk yazımda *"sebep bulundu, teori değil"* deniyordu; doğrusu şu: **kod düzeyinde belirtiyi
  açıklamaya YETEN bir mekanizma bulundu, ama o mekanizmanın gerçekten işlediği ÖLÇÜLMEDİ.**
  11.08'deki kare ne yeniden üretildi ne de ayrışma anı yakalandı — MB-13 zaten "tetikleyici
  üretilemedi" diye açık duruyor. Aradaki fark önemli: bulunan şey yeterli bir açıklama, kanıt
  değil. Aşağıdaki mekanizma bu çekinceyle okunmalı.

  Mekanizma: **"giriş yaptım mı" sorusunun uygulamada İKİ AYRI KAYNAĞI
  var.** Ekran `useMe`nin `signedIn`ini okuyor; ağ katmanı Supabase'e KENDİSİ soruyor
  (`maybeAuthorizedFetch` → `auth.getSession()`). İkisi ayrıştığı an — jeton geçerliyken
  arayüzün misafire düşmesi — sunucu oyu müşterinin üstüne yazıp puanı döndürüyor, ekran davet
  gösteriyor.
  **Çare, davetin KENDİ ölçütünü kullanması:** davet *"bu turun sahibi yok"* der ve bunun kanıtı
  `signedIn` değil, ödülün yazılıp yazılmadığıdır (motor kimliksiz oya puan vermiyor,
  `pointsAwarded: null`). Koşul `signedIn || awardedPoints !== null` oldu. **MB-13'ü kapatmaz** —
  iki kaynak hâlâ ayrışabilir — ama yalanı kapatır.
  **Bu değişikliğin DOKUNDUĞU dal cihazda ÜRETİLEMEZ** (ekranın misafir sanıp jetonun geçerli
  olduğu an, yani MB-13'ün kendisi) ve testi de yok; mevcut test yalnız *misafir + puan yok*
  hâlini tutuyor (`discover-screen.test.tsx:130`, koşuda geçiyor — gerileme yok). Yani bu
  düzeltme **savunmacıdır ve doğrulanmamıştır**; öyle kaydediliyor.

  **2 · MB-58 (a + c) — vitrindeki keşif daveti misafire çizilmiyor artık.** Davetin vaadi puan,
  puan ise kimliğe yazılıyor: misafire gösterilen davet karşılığı olmayan bir davetti. **Turun
  KENDİSİ misafire açık kaldı** (tasarımın kararı: *"misafirin oyu da talep sinyalidir"*),
  kapanan yalnız ödül vaat eden çağrı. İskelet de düzeltildi: misafirde iki değil TEK davet
  kutusu tutuyor — yer ayırdığı ama gelmeyen kutu, sayfanın oturduğu an zıplaması demekti, yani
  iskeletin önlemek için var olduğu şey. Bayrak `HomeLayout`a EKLENMEDİ (o şema cihazda saklanıyor
  ve bu bilgi saklanacak cinsten değil, her açılışta oturumdan türer) — ayrı prop, sıfır göç.

  **(a) CİHAZDA ÖNCE-SONRA ÖLÇÜLDÜ (15.08, kullanıcı talimatı: "hatanı da doğrula, düzeltmeni
  de").** Aynı cihaz, aynı misafir oturum, aynı ekran:
  · **12:06 — eski paket (düzeltme öncesi kod):** vitrinin altında İKİ davet; *"Keşif — yeni
  lezzetleri ilk siz oylayın"* misafire çiziliyordu. **Hata üretildi.**
  · **12:08 — taze paket (düzeltmeden sonra):** yalnız Profesyonel daveti; Keşif daveti YOK.
  **Düzeltme doğrulandı.**
  *(Aradaki ders ayrıca kayda değer: uygulama arka plandan `monkey` ile öne getirildiğinde BAYAT
  paketi sürdürdü ve düzeltme yokmuş gibi göründü. Ölçüm `force-stop` + yeniden açılışla
  tekrarlanınca doğru sonuç geldi. Cihazda ölçüm yapan herkes için: öne getirmek yeniden
  yüklemek değildir.)*

  **(c) GÖRSEL OLARAK DOĞRULANAMADI ve öyle yazılıyor.** İskeletin çizildiği `uiautomator`
  dökümüyle kanıtlandı (`home-skeleton` düğümü yakalandı, 9. denemede), ama davet kutuları
  **ekranın altında kaldığı** için döküm onları görmüyor ve iskelet penceresi saniyenin altında
  olduğundan kaydırıp bakmak da mümkün olmadı. Yani (c) bugün yalnız kod düzeyinde doğru; ekranda
  gösterilmedi.

  **3 · DÖRT KALEM ÖLÇÜLDÜ VE "HIZLI DEĞİL" ÇIKTI — sessizce yapılmadı, gerekçesi yazıldı.**
  Turun kazancının yarısı bu: hangi kalemin ucuz OLMADIĞINI bilmek de ilerlemedir.
  · **MB-58b** ("kart kalmadıysa bölüm kalksın") — bilgi sunucuda var ama vitrin sözleşmesi
  taşımıyor; taşıtmak `openDiscoverDeck`in iki sorgusunu **uygulamanın en çok vurulan ucuna**
  eklemek demek. Kuyruk hâli zaten nazikçe karşılanıyor. Bedel sıcak yolda, karar olarak bırakıldı.
  · **MB-22b** ("ürün sayfası kampanyayı söylesin") — ekran işi değil, önce bir DOMAİN kararı
  istiyor: sepet kapsamlı indirim ürüne atfedilemez ("bu ürün indirimli" demek sepet toplamına
  bağlı bir şeyi ürünün özelliğiymiş gibi söylemek olurdu). Hangi kapsamların gösterilebilir
  olduğu kararlaşmadan yazılan ekran yanlış vaat üretir.
  · **MB-29** (görselsiz kartta tek harf) — ölçüldü: harf 148 dp dairede 30 px, çapın ~%20'si ve
  tonlar zaten sessiz. Rahatsız eden oran değil BAĞLAM; asıl eksik olan görselin kendisi. Yedek
  gösterime dokunulmadı çünkü o bir tasarım kararıdır (CLAUDE §3, improvise edilmez).
  · **MB-30** (unistyles uyarısı) — klasik sebebi olan nesne-birleştirme deseni depoda HİÇ yok
  (dizi sözdizimi 64 yerde doğru kullanılmış), yani kaynak dolaylı ve çalışma anında yakalanmalı.
  `adb logcat` bu turda zaman aşımına düştü; cihaz turuna bırakıldı.

- [x] (21.51) **B2B BAŞVURUSUNUN MİSAFİR YOLU CİHAZDA YÜRÜTÜLDÜ — kod kuruyordu, ölçüm yoktu (MB-09)**
  `touches:` **yalnız ölçüm — kod değişikliği YOK.**

  11.08 turunda başvurunun yalnız **girişli** yolu yürütülmüştü; misafir yolu (401 → kimlik
  çekmecesi → doğrulama → aynı gövdenin kendiliğinden yeniden gönderimi) kod ve birim testleriyle
  kuruyor ama cihazda hiç koşmamıştı. 15.08'de baştan sona koşuldu.

  **Tur ve kanıtları (cihaz `5cf6c351`, 13:0x):**
  1. Oturum kapatıldı, vitrin *"Hoş geldiniz"* dedi — misafir.
  2. Profesyonel ekranı misafire açıldı; **resmî kayıt sorgusu misafirken çalıştı** (uç public):
     SIRET `907 496 640 00026` → `QUALITE` · `46 RUE DES PRES` · `67380 LINGOLSHEIM` alanlara doldu.
  3. *"Başvuruyu gönder"* → **kimlik çekmecesi açıldı** (*"Başvuruyu kimin adına yazalım?"*).
  4. E-posta → kod → **başvuru KENDİLİĞİNDEN gitti**, form yeniden doldurulmadı:
     *"Başvurunuz alındı · İnceliyoruz — sonucu e-posta ile bildireceğiz."*
  5. **Veritabanı kanıtı:** `user_profiles.b2b_pending = true`, `b2b_applied_at` 11:04:06Z,
     `company_info` resmî kayıttan (`siret`, `legal_name`, `activity_code`, `founded_year`).

  **YANLIŞ ALARM ELENDİ — telefon boş kalıyor ama bu KASITLI.** Profilde `phone: null` görüldü,
  oysa forma numara yazılmıştı. Ölçüldü: numara zaten **başka bir kayıtta** duruyor (seed müşterisi
  `Élodie Martin`, `+33612345678`). Telefon kimlik anahtarı ve tekil (`user_profiles_phone_key`);
  `customer/b2b.ts:86-93` künyesi bunu satır satır anlatıyor — numara sessizce atlanır, mükerrer
  sinyali onay kartına düşer, kararı operatör verir. Yani sözleşmeye uygun davranış.

  **AÇIKLANAMAYAN BİR KARE — teori kurulmadı, ölçüm kaydedildi.** Turun ortasında bir kez
  *"Kod gönderilemedi — biraz sonra yeniden deneyin."* göründü; ikinci denemede **aynı kod** çalıştı.
  Ölçüm sebebi DIŞLADI, bulmadı: `email_verifications`ta o adresin **tek** satırı var ve
  `attempts = 0` — yani sunucuya başarısız bir doğrulama isteği HİÇ ulaşmamış, yeniden gönderim de
  satır yazmamış. `error_log`da o dakikalarda kayıt yok. Test kodu açıkken sunucu Resend'e zaten
  hiç gitmiyor (`application/auth/otp.ts:99`), yani sunucu kaynaklı `send_failed` o dalda imkânsız.
  **Kayda değer olan yapısal bulgu:** `send_failed` cümlesi ÜÇ ayrı hâlin ortak karşılığı —
  (a) ağ/beklenmedik anahtar (`lib/auth/otp.ts:35`), (b) kod doğruydu ama cihaz oturumu kurulamadı
  (`:79`), (c) sunucunun 502'si. Ekrana bakarak hangisi olduğu anlaşılamaz. MB-32'nin ailesinden
  bir kalem; **`design/BACKLOG.md`ye değil buraya yazıldı** çünkü açık bir tasarım borcu değil,
  tekrarlarsa teşhis edilecek bir gözlem.

  **Cihazda yazılan veri geri alındı** (⚑ kuralı): hesap **uygulamanın kendi silme akışıyla**
  kapatıldı — `anonymized_at` 11:09:06Z, `name` boş, `email` null, `b2b_pending` false. Bu aynı
  zamanda `(21.49)`'un hesap silmesini **başvurusu olan gerçek bir hesapta** ikinci kez doğruladı.
  Ölçüm için açılan tek `email_verifications` sonda satırı da silindi.

  **Yan doğrulama (bedava çıktı):** aynı misafir turunda `home-discover` ekranda YOK,
  `home-professional` VAR — `(21.50)`'nin MB-58a düzeltmesi taze paketle ikinci kez doğrulandı.
  **Yan gözlem:** Türkçe yüzeyde ekran başlığı hâlâ *"Professionnels"* (MB-33, açık kalem).

- [x] (21.52) **UNISTYLES UYARISININ SEBEBİ BULUNDU — `Skeleton`, ve suç dizi sözdiziminde değildi (MB-30)**
  `touches:` `apps/mobile/src/components/ui/skeleton.tsx`

  **Statik arama 14.08'de sonuç vermemişti ve haklıydı:** uyarının klasik sebebi olan nesne
  birleştirme (`style={{ ...styles.a, ...styles.b }}`) depoda gerçekten YOK — tüm uygulamada tek
  bir `style={{` var, o da animasyon değeri. Sebep bu yüzden statik olarak bulunamıyordu.

  **Çalışma anında yakalandı (cihaz `5cf6c351`).** Sıra, ve iki yanlış adım da dahil:
  1. `adb logcat` bu kez çalıştı: uyarı **açılışta 2–3 kez**, `displayName = "View"`.
  2. Kitaplığın koşulu okundu (`core/warn.ts`): `style` prop'u DİZİ DEĞİL bir nesne olacak ve
     içinde birden çok `unistyles_*` anahtarı bulunacak.
  3. Yığın izi konuldu → uyarı **`ref` geri çağrısından** çıkıyor (`commitAttachRef`), yani
     yığında hiç uygulama karesi yok; bileşen bu yolla bulunamaz.
  4. *(Yanlış adım 1)* İz `lib/module/core/warn.js`'e konuldu, hiç görünmedi. **Sebep ölçüldü:**
     `package.json`'ın `exports["."]["react-native"]` girişi `./src/index.ts` — Metro derlenmiş
     çıktıyı DEĞİL, kitaplığın kaynak TypeScript'ini çözüyor. Yamanan dosya hiç bundle'a girmiyordu.
  5. *(Yanlış adım 2)* İz `react/jsx-dev-runtime` üzerinden yakalanmak istendi; ad alanı salt
     okunur çıktı (`Cannot assign to property 'jsxDEV'`) ve kök layout bir tur çöktü. Geri alındı.
  6. İz doğru dosyaya (`src/core/warn.ts`) konunca **stil parmak izi düştü:**
     `{"unistyles_c587f081":{},"backgroundColor":"#ece3c8","unistyles_a79fa174":{},"width":"100%","height":132,"borderRadius":0,"opacity":0.45}`
     — `#ece3c8` = `sand-250`, `#d8cfb6` = `sand-300`, `opacity 0.45` = iskeletin nabız tabanı.
     Bileşen: **`components/ui/skeleton.tsx`**.

  **Asıl bulgu — kod DOĞRU yazılmıştı.** `Skeleton` zaten dizi sözdizimi kullanıyordu
  (`style={[styles.block, ton, {…}]}`); ama `Animated.View` diziyi **içeride tek nesneye
  düzleştiriyor** ve düzleşen nesnede `block` ile `soft`/`deep` anahtarları yan yana geliyordu.
  Yani uyarı yanlış değildi, yalnız işaret ettiği yer çağıranın dizisi değil kitaplığın düzleştirmesiydi.
  **Riski gerçek:** kitaplığın dediği "no updates" hâli, tema değişiminin (karanlık mod) iskelete
  işlememesi demek.

  **Çözüm zemini ton başına TAM stile taşımak:** `block` + üstüne binen `soft`/`deep` yerine üç
  bağımsız ton (`soft` · `default` · `deep`), ve seçim ton adıyla eşleşiyor (`styles[tone]`) —
  `(21.50)`'de `DashedInvite`e konan desenin aynısı. Diziye artık TEK unistyles stili giriyor.
  Görünen renkler değişmedi: eskiden de `soft`/`deep` `block`un zeminini eziyordu.

  **Doğrulama:** aynı açılış turunda uyarı **2–3 → 0**; uygulama ayakta (`Running "main"`);
  `tsc` temiz; `jest src/components src/screens/home` **30 dosya / 161 test** geçti; katalog
  iskeleti cihazda görsel olarak yakalandı (kum kutular, kart yarıçapı, nabız yerinde).
  Ölçüm için kitaplığa konan iki iz de geri alındı — `node_modules` commit'e girmez ama
  **ölçüm bitince geri alınmayan yama, bir sonraki ajanın açıklayamayacağı bir davranıştır.**

- [x] (21.53) **VARYANT SIRASI ARIZA DEĞİLMİŞ — ama sebebi ararken KARTLA DETAYIN FİYAT ÇELİŞKİSİ çıktı (MB-28 + MB-20/2)**
  `touches:` `packages/types/src/contracts/catalog-api.schema.ts` ·
  `apps/mobile/src/screens/product/{product-detail-screen.tsx,product-fixture.ts}`

  Şikâyet: ürün detayında boylar `450g · 225g · 2500g · 1250g` sırasıyla çıkıyor, ne artan ne
  azalan. İlk refleks "mobil sıralamıyor" demekti; ölçüm bunu çürüttü.

  **Okuma zaten sıralı:** `packages/application/src/catalog/product-context.ts:64` varyantları
  `sortOrder`a, eşitlikte `createdAt`e göre diziyor. Ekranda görünen şey veritabanındaki
  `sort_order`ın kendisi — ürün `11850393-564f-477e-b7a5-b18c937aca64` için doğrudan okundu:
  `0→450g · 1→225g · 2→2500g · 3→1250g`. **Yerel veri sahte olduğu için buradan iş çıkarımı
  yapılmadı** (CLAUDE.md); ölçüm yalnız "makine mi bozuk, veri mi böyle" sorusunu yanıtladı.

  **Sebebi ararken çıkan asıl açık — ve alanı bu şerit DEĞİL:** `sort_order`u yazan tek metot
  `ProductVariantService.syncVariants` (`product-variant.service.ts:55`, `sortOrder: i` satır 76)
  ve kaynak ağacında **hiç çağıranı yok** — yalnız kendi testi çağırıyor (`apps/web/app`,
  `apps/backend/src`, `packages/application/src`, `scripts` tarandı: sıfır). Yani bugün hiçbir
  ekran varyant ekleyemiyor, düzenleyemiyor ya da sıralayamıyor; varyantlar yalnız seed'den
  geliyor ve operatör bir ürünün boylarını yeniden dizemiyor. Ürün formu
  (`operations/products/tabs/product/product-form-dialog.tsx:105`) varyantlara yalnız `id`
  üzerinden bakıyor.

  **Sıranın operatörde kalması ZATEN KARARA BAĞLIYMIŞ — kullanıcı hatırlattı (15.08).**
  `08.10` / commit `da91ea97`: *"`sort_order`'A DOKUNULMADI ve dokunulmamalı: o kolonu detayın boy
  seçicisi, mobil ana ekran ve fikirler şeridi de okuyor — fiyata bağlansaydı operatör '1 kg'ı öne
  al' diyemezdi."* **Bu, bir önceki turda kullanıcıya sorduğum soruyu geçersiz kılıyor:**
  "sıra operatörden mi gelsin, `net_weight_g`ten mi türesin" diye iki seçenek sunmuştum; ikincisi
  zaten elenmiş bir seçenekti ve sormadan önce git geçmişine bakmalıydım. Not da düzeltildi.
  Kalan tek açık: kaldıracı kullanacak arayüz yok
  (`docs/talep/not-operasyon-varyant-sirasini-kimse-yazmiyor.md`).

  ## Ve asıl kazanç: MB-20'nin ikinci maddesi kapandı

  `08.10`'un ne yaptığına bakarken ayrım netleşti: **sıra operatörün, ama hangi boyun fiyatının
  kartta yazacağı FİYATIN** — `primaryVariantOf` (fiyatı olan en ucuz aktif boy, depo boyutlu,
  fiyatsızlar sona) ve sonucu `primaryVariantId`. Web müşteri detayı bunu 10.08'den beri okuyor
  (`product-client.tsx:45`, künyesi: *"Ölçüt artık SUNUCUDAN geliyor… ekran hesap yapmıyor, okuyor"*).

  **Mobil okumuyordu — ve okuyamıyordu:** `product-detail-screen.tsx` açılış boyunu `variants[0]`
  seçiyordu, çünkü **alan mobil sözleşmesinde hiç yoktu**; uç gövdeyi zaten taşıyor ama
  `CatalogProductDetailSchema.parse` bilinmeyen anahtarı düşürüyordu. Üstelik sözleşmenin kendi
  künyesi eski varsayımı yazılı taşıyordu: *"ilk boy başlangıç fiyatıdır"* — `08.10` tam da bunu
  çürütmüştü. Künye de düzeltildi.

  **Belirti buydu ve ölçülmüştü (MB-20):** kart *4,11 €*, detay *6,80 € (450g)* seçili açılıyordu.
  **Cihazda önce-sonra doğrulandı** (`baklava-with-pistachio`): kart 4,11 € → detay artık
  **225g / 4,11 €** seçili açılıyor, sepet düğmesi de 4,11 €, `18,27 €/kg` 225g'ı doğruluyor.
  Boy sırası bilerek değişmedi: `450 · 225 · 2500 · 1250` (operatörün sırası).

  **Uç DEĞİŞMEDİ** — tek satır sözleşmede, tek satır ekranda. Fikstür sözleşme kilidini yaptı:
  alan eklenince `product-fixture.ts` derlemede kırıldı ve güncellenmeden yeşile dönmedi.
  **Testle korunmuyor:** mevcut fikstürde en ucuz boy zaten ilk boy, yani düzeltmenin değiştirdiği
  dal örtülmüyor. Yeni test yazılmadı (kullanıcı kararı 11.08: istenmeden test yazılmaz);
  doğrulama cihazda yapıldı ve kanıtı yukarıda.

  **Doğrulama:** `tsc` üç pakette temiz (`types`, `mobile-api`, `mobile`);
  `jest src/screens/product src/screens/catalog` **3 dosya / 39 test** geçti; cihaz turu yukarıda.

- [x] (21.54) **KATALOG ARAMASI TEK DOKUNUŞLA TEMİZLENİYOR (kullanıcı isteği 15.08)**
  `touches:` `apps/mobile/src/screens/catalog/{catalog-screen.tsx,messages.json}`

  Arama kutusunda yazılanı silmenin tek yolu harf harf geri almaktı. Kutuya, **yalnız yazı varken**
  çizilen bir temizle düğmesi kondu (`catalog-search-clear`); boşken çizilmiyor, çünkü hiçbir işi
  olmayan bir düğme kutunun içinde kalıcı gürültüdür.

  **İki şey uydurulmadı, kitten alındı:**
  · Dokunma payı — ikon `inlineIcon` (16 dp) ve o boy parmakla ıskalanır; `PressableSurface`ın
    `compact` işareti kitin TEK payını getiriyor (`theme.touchSlop`). Kendi `hitSlop` değerimi
    yazacaktım, kit bu kararı zaten vermişti (`pressable-surface` künyesi: *"pay tek değerdir,
    öğe başına hesaplanmaz"*).
  · Basılı geri bildirimi `scale-small` — küçük yuvarlak ikon düğmesinin kitteki karşılığı.

  **KLAVYE TUZAĞI (MB-01) ÖLÇÜLDÜ, VARSAYILMADI.** Kuralın klasik hâli şu: `keyboardShouldPersistTaps`
  varsayılanı `'never'` olan bir kaydırıcının içindeki düğme, klavye açıkken ilk dokunuşu yutar ve
  yalnız klavyeyi kapatır. Burada arama satırı listenin DIŞINDA, kardeş bir `View`de duruyor, yani
  `FlatList`in ayarı ona işlemiyor — ama bu bir çıkarımdı, **cihazda sınandı**: `baklava` yazıldı,
  klavye açıkken düğmeye BİR kez dokunuldu, alan yer tutucuya döndü ve düğme kayboldu.

  Metin üç dilde (`Aramayı temizle` · `Effacer la recherche` · `Suche löschen`) — ekran okuyucunun
  duyduğu ad, çünkü çarpı işaretinin kendisi bir ad değildir.

  **Kapsam bilerek dar:** onboarding'in adres alanına dokunulmadı. O bir arama kutusu değil,
  öneri listesi olan bir FORM alanı; temizlenmesi formun kendi akışının parçası ve ayrı bir karar.

  **Doğrulama:** `tsc` temiz · `eslint` temiz · `jest src/screens/catalog` **2 dosya / 30 test** ·
  cihazda klavye açıkken tek dokunuş (yukarıda).

- [x] (21.55) **ÇOK BOYLU ÜRÜNÜN KARTI ARTIK "…'dan" DİYOR — ve fiyatsız ürün 0,00 € yazamıyor (MB-20/1)**
  `touches:` **YENİ:** `apps/mobile/src/screens/customer-kit/{price-label.ts,price-label-messages.json}` ·
  **DEĞİŞEN:** `screens/{catalog/catalog-screen.tsx,home/home-screen.tsx,product/product-detail-screen.tsx,product/messages.json}` ·
  `components/ui/product-circle-card.tsx` · `packages/types/src/contracts/catalog-api.schema.ts` (yalnız künye)

  Kartta yazan sayı ürünün EN UCUZ fiyatlı boyunundur (`primaryVariantOf`, `08.10`). Çok boylu
  üründe bu bir **başlangıç fiyatıdır** ve ekini yazmamak tutulamayacak bir sözdür: müşteri
  4,11 € görüp giriyor, üründe 35,95 €'luk bir boy da var. Ailenin çeşit kartları bu eki zaten
  kullanıyordu; kural kite taşındı.

  **TEK TÜRETME, DÖRT ÇAĞIRAN.** `customer-kit/price-label` — katalog ızgarası, vitrin rayı,
  detayın "benzer ürünler" rayı ve ailenin çeşit kartları. Üç ekran ayrı ayrı
  `formatPrice(...)` çağırıyordu; ek de oraya üç kez yazılsaydı bir gün ayrışırdı (CLAUDE §1) ve
  o gün müşteri aynı ürünü iki ekranda iki farklı cümleyle görürdü. `family.from` metni üç dilden
  **silindi**, kaynağı artık kitin kendi mesaj dosyası.

  **Ölçüt BOY SAYISI, fiyat aralığı değil:** iki boyu aynı fiyata satılan üründe de "…'dan" doğru
  kalır (müşteri ikinci boyu seçince sayı değişmez, söz tutulur); "fiyatlar farklıysa yaz" kuralı
  ise sunucudan tüm boy fiyatlarını istemeyi gerektirirdi.

  ## Yan bulgu: gizli bir "0,00 €"

  Aynı satırlara bakarken çıktı. Katalog fiyatsız ürünü baştan doğru ele alıyordu (çip çizilmez),
  ama **vitrin ve detayın benzerler rayı `?? 0` yazıyordu**. Vitrinin künyesi gerekçeliydi (*"uç
  fiyatsızı zaten süzer"*); detay o gerekçe OLMADAN aynı satırı taşıyordu ve `readSimilar` fiyat
  süzgeci uygulamıyor — yalnız kategori + `status='active'` (`application/catalog/product.ts:117`).
  Asıl engel kitteydi: `ProductCircleCard.priceLabel` **zorunluydu**, yani çağıranın sıfıra düşmekten
  başka çaresi yoktu. Alan isteğe bağlı yapıldı ve fiyat yoksa çip hiç çizilmiyor — kare kartın
  (`ProductPhotoCard`) zaten verdiği karar. *"Ölçülemeyen değer SIFIR değildir"* (CLAUDE §1).

  **ÖLÇÜLDÜ, ABARTILMIYOR:** bugün fiyatsız dört ürün var ve **dördü de `candidate`** — `active`
  süzgecini geçemiyorlar, yani yol ekrana çıkmıyor. Düzeltme yaşayan bir arızayı değil, sessiz
  duran bir tuzağı kapatıyor. Cihazda "0,00 €" GÖRÜLMEDİ ve görülmüş gibi yazılmadı.

  **Bir künye daha bayat çıktı:** `CatalogFamilyMemberSchema.fromPriceCents` *"çeşidin ilk aktif
  boyu"* diyordu; `08.10`'dan beri yanlış — ölçüt o gün `primaryVariantOf`a bağlandı
  (`product.ts:177` → `card.priceCents`). Düzeltildi. Bugünün ikinci bayat künyesi; ilki
  `(21.53)`'teydi. **İkisi de aynı commit'in (`da91ea97`) mobil sözleşmeye yansımayan yüzüydü.**

  **Mevcut bir test güncellendi, yenisi yazılmadı** (kullanıcı kararı 11.08): `catalog-screen.test`
  çok boylu ürün için düz `8,50 €` bekliyordu, değişiklik o beklentiyi kasten geçersiz kıldı.

  **Doğrulama:** `tsc` temiz · `eslint` temiz · `knip` yeni ölü ihraç yok ·
  `jest` **84 dosya / 599 test** · cihazda katalog: `5,00 €'dan (2 seçenek)` · `4,11 €'dan
  (4 seçenek)` · `4,82 €'dan`, tek boylular düz (`2,30 €` · `11,85 €`); vitrin rayı da doğru.

  **Web yarısı AÇIK:** aynı ek web müşteri kartlarında yok. Talep dosyası duruyor
  (`docs/talep/musteri-liste-fiyati-baslangic.md`); iki yüzey bir süre ayrışacak ama **ayrışma
  doğru yönde** — mobil daha dürüst.

- [~] (21.56) **PUAN SİSTEMİNİN UÇTAN UCA DENETİMİ — İLK TUR + GÜNLÜK TAVAN 270 (MB-18)**
  `touches:` `supabase/migrations/0028_points.sql` ·
  `packages/{domain-core,application}/src/feedback/points.ts`

  ## Tavan: 100 → 270 (kullanıcı kararı 15.08)

  **Önce bir güven meselesi vardı ve ölçümle çözüldü.** Kullanıcı tavanın 100 değil 250 (ya da 270)
  olduğunu, bunu konuşup **not aldığımızı** hatırlıyordu. Beş kaynak tarandı — canlı `settings`
  satırı · `0028_points.sql` · iki kod varsayılanı · `BACKLOG-musteri` (dört yer) · o satırın TÜM
  git geçmişi — **hepsi 100**, ve git geçmişi o satırın ömrü boyunca yalnız AÇIKLAMASININ
  değiştiğini gösteriyor. `250`/`270` puan bağlamında hiçbir dosyada geçmiyor.

  **Ama "yok" diye kapatılmadı, çünkü kapatılamaz:** `docs/talep/` ve koordinasyon defteri
  **repoya gönderilmiyor** (`.gitignore`), yani o dosyaların eski sürümleri hiçbir yerde durmuyor;
  yazılıp silinmiş bir notun izi git'ten kurtarılamaz. Ölçemediğim tek yer burasıydı ve öyle
  söylendi. *(Koordinasyon defterinde tavan tartışması BULUNDU — 12.08: `500 > 100` olduğu için
  davet ödüllerinin hiç yazılamayacağı görülmüş, ama seçilen çözüm tavanı yükseltmek değil
  KAPSAMINI daraltmak olmuş. Kullanıcının hatırladığı tartışma büyük olasılıkla bu.)*

  Kullanıcı sayıyı doğrudan **270** yaptı (*"sonra bakalım gene"* — değer geçici).
  **Bugünkü davranış DEĞİŞMİYOR ve bu abartılmadı:** tavana tabi tek iki sebep var
  (`visit`, `feedback_candidate`), azami günlük kazanç **18 puan** — 100 de 270 de hiçbir ödülü
  reddetmiyor. Sayı yalnız ileriye nefes payı; kapsam kararı (11.08) aynen geçerli.

  **VERİTABANI HENÜZ 100** — migration değişti ama çalışan satır değişmedi. `db:refresh`
  kullanıcının komutu; daha ucuz yol Ayarlar ekranından elle yazmak (anahtar orada tanımlı).
  **Web'de iki kopya 100'de kaldı** (`web/lib/feedback/points.ts:48`, `settings-catalog` `fallback`)
  — web'e dokunmama kararı gereği elleşilmedi; not düşüldü
  (`docs/talep/not-musteri-gunluk-tavan-270-oldu.md`). İkisi de yalnız YEDEK değer, ayar satırı
  durdukça okunmuyor; ama `domain-core` künyesinin uyardığı "ayrışan kopya" hâli tam olarak budur.

  ## Denetimin ilk turu — dört ölçüm

  · **Korkulan arıza sınıfı YAPISAL OLARAK engellenmiş.** Ekranın sayıları sunucudan, sunucununki
    ayardan geliyor (`customer/points.ts` → `readEarnWays`); ayar okunamazsa ya da sıfırsa **yol
    ekranda hiç gösterilmiyor**. Künyesinin deyişiyle *"kart hiçbir zaman motordan cömert olmaz."*
  · **Yazım kapısı dört kapıyı da tutuyor** (`feedback/points.ts:120-145`): B2B reddi · tavan
    (kısmi değil, ya hep ya hiç) · `no_value` · tekillik (ön kontrol + DB kısıtı, `23505` yarışı
    sessizce yutuluyor ve asıl işlemi durdurmuyor).
  · **Kupon eşiği tutuyor:** `points_redeem_min=500` × `points_cent_value=1` = **5,00 €**; hesap
    ekranının cümlesi ve cihazda görülen *"Kupona 490 puan kaldı"* (bakiye 10) ikisi de doğru.
  · **`points_order` YETİM AYAR.** Sipariş puanı 11.08'de kaldırıldı; kodda yazan yok, defterdeki
    6 `order` kaydının altısı da TEMMUZ tarihli seed satırı, ekran da onu listelemiyor (sözleşme
    künyesi gerekçeli). Ama `settings`te `points_order = 10` duruyor — Ayarlar'a bakan operatör
    "siparişten 10 puan veriliyor" sonucuna varır. Bugün kimse okumuyor, yani zararsız; **yanlış
    bilgi veren bir kayıt.** Kaldırmak migration işi → kullanıcının kararı, sıraya kondu.

  **AÇIK KALAN (bu yüzden `[~]`):** yorum · ziyaret · getiren · komşu ödüllerinin gerçek yazım
  yolları, teşekkür kartının sayıları ve "ikinci kez tamamlamada puan yok" hâli ölçülmedi.

- [~] (21.57) **YEDİ OPERASYON EKRANI KAYDIRMA KABINA GEÇTİ — ve MB-34'ün "39 ekran"ı beş kat abartılıymış**
  `touches:` `apps/mobile/src/screens/courier/delivery-screen.tsx` ·
  `apps/mobile/src/screens/courier/day-close-screen.tsx` ·
  `apps/mobile/src/screens/warehouse/transfer-screen.tsx` ·
  `apps/mobile/src/screens/warehouse/adjustment-screen.tsx` ·
  `apps/mobile/src/screens/warehouse/courier-return-screen.tsx` ·
  `apps/mobile/src/screens/warehouse/intake-screen.tsx` ·
  `apps/mobile/src/screens/management/offer-approval-screen.tsx`

  ## Önce kapsam ölçüldü, sonra kod yazıldı

  MB-34'ün kaydı *"39 ekran ham `ScrollView` kullanıyor, hepsi kite geçsin"* diyordu. Süzgeç süzgeç
  ölçüm:

  | süzgeç | sayı |
  |---|---|
  | ham `ScrollView` kullanan dosya | 40 |
  | …içinde **girdisi olan** | 14 |
  | …girdi gerçekten **kaydırıcının içinde** | **7** |
  | …bunlardan **müşteri yüzeyi** | **0** |

  **Üç yanlış aday, üçü de haklı sebeple elendi:** katalogda arama kutusu kaydırıcının DIŞINDA
  (bugün `(21.54)`te cihazda da ölçüldü) · hesap ve sepetteki alanlar ÇEKMECENİN içinde ve
  `BottomSheet` korumayı 08.08'den beri kendisi taşıyor · onboarding zaten `FormScroll` kullanıyor.
  **Yani müşteri yüzeyi zaten kapalıymış; MB-34 ölçülünce bir OPERASYON işi çıktı.**

  **Kabın kendi künyesi de bu daraltmayı zaten söylüyordu:** *"Kaydırıcısı olan ama klavyesi
  açılmayan ekranlar (vitrin, ürün, sipariş detayı…) sarılMAZ: klavye kaçınması olmayan bir yerde
  bedava değildir."* Yani "40 kaydırıcının hepsini sar" hedefi kabın tasarım kararına aykırıydı.

  ## Ölçülen asıl açık: koruma YARIM kalmış

  Bu 14 ekranın **hiçbirinde `KeyboardAvoidingView` yoktu.** Yedisinde `keyboardShouldPersistTaps`
  vardı — `(21.33)`'ün on ekrana tek tek yazdığı noktasal düzeltme. Yani **MB-01 (yutulan ilk
  dokunuş) kapatılmış, MB-02 (alanın klavye altında kalması) açık kalmıştı.** `FormScroll` ikisini
  birlikte taşıyor; geçiş yedi ekrana ikinci yarıyı getirdi. Mal kabul ekranı ikisini birden aldı
  (onda `keyboardShouldPersistTaps` de yoktu).

  **Transfer ekranında İKİ kaydırıcı var ve yalnız biri geçti:** kuyruk listesi (girdisiz) ham
  `ScrollView` olarak BIRAKILDI — sarmak kabın künyesine aykırı olurdu.

  ## Doğrulama

  `tsc` temiz · `eslint` temiz · `jest` **84 dosya / 599 test** · cihazda **Kurye Dönüşü Kabulü**
  ekranı açıldı (depo hesabıyla): kaydırıcı yerinde (`warehouse-return-body`), başlık · içerik ·
  alttaki yapışkan düğme yerleşimi bozulmadı. **Yedi ekranın hepsi cihazda gezilmedi** — kullanıcı
  operasyon yüzeyine ayrıca çalışacağımızı söyledi (15.08), görsel tur o çalışmaya bırakıldı.

  **AÇIK KALAN (bu yüzden `[~]`):**
  · **Talep detayı ve şikâyet ekranı farklı kalıpta** — yazma alanı kaydırıcının ALTINDA sabit
    duruyor (mesaj çubuğu). `FormScroll` sarmak yanlış olur: kaydırıcı mesaj listesi, alan onun
    kardeşi. Ayrı bir çözüm gerekiyor.
  · **Ham `ScrollView`u lint'le kapatma adımı YAPILMADI.** 33 dosya hâlâ ham kullanıyor ve çoğu
    HAKLI (klavyesiz kaydırıcı). Kuralı "ham `ScrollView` yasak" diye yazmak, kabın künyesindeki
    kapsam kararıyla çelişirdi; doğru kural "girdisi olan kaydırıcı ham olamaz" ve onu makineyle
    ifade etmek ayrı bir iş.

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
