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
- [x] (21.3) **`design-tokens` paketi:** tek kaynak TS token modülü; web `@theme` CSS'i
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
    typecheck/eslint temiz. ~~Kalan: kompozisyonun mobil temaya bağlanması (komponent kiti,
    Expo ajanı) · `brand-whatsapp-pure` adı tasarımdan.~~ **→ 27.08 tazelik turu (21.122):
    kompozisyon BAĞLI (`theme/unistyles.ts` gradyanı `parseLinearGradient` ile çeviriyor);
    kaydın öteki kalanı web şeridinin işi ve talebi açık. Mobil payı bitti, görev `[x]`.**
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
- [x] (21.6) **Katalog okuma uçları:** `GET /api/v1/categories` (tek tur) + `GET /api/v1/products`
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

- [x] (21.7) **Katalog ekranı — ilk gerçek ekran:** v3 tasarımından birebir; kategori çipleri +
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
    `[~]`):** ~~Android cam bulanıklığı (`BlurTargetView` bağı)~~ → **İSTENMİYOR, görev KAPANDI
    (kullanıcı kararı 27.08: *"eğer bulanıklıksa yok böyle bir şey"*)** · ~~`BottomSheet` çift-eğri
    animasyonu (Reanimated'la)~~ → 27.08 tazelik turu: KURULU (21.122).

    **BLUR ARTIĞI — DENENDİ, ÖLÇÜLDÜ, ÇALIŞMADI, GERİ ALINDI ve artık İSTENMİYOR (27.08).**
    Kimse yeniden denemesin diye ölçümüyle yazılıyor: `expo-blur@57`in Android yolu kuruldu —
    ekranın kökü `BlurTargetView` ile sarıldı, ref bara `blurTarget` prop'uyla verildi,
    `blurMethod="dimezisBlurViewSdk31Plus"` seçildi (paket kurulu olduğu için yeniden derleme
    gerekmedi; kütüphanenin uyarısı da düşmedi, yani hedef bağlanmıştı). **Cihazda A/B ölçüldü**
    (Oppo CPH1907, ürün detayının yapışkan barı): tek fark `blurMethod` prop'u olan iki kare
    alındı, **bar bölgesinin özeti bit bit AYNI çıktı** (`768011b0…`) — prop'un ekranda SIFIR etkisi
    vardı. Kullanıcı zaten bulanıklığı hiç görmediğini söylemişti ve ölçüm onu doğruladı;
    *"bulanıklık sandığım şey"* barın kendi %96 krem yüzeyiydi.
    **Ders:** tek kareye bakıp *"çalışıyor gibi"* demek ölçüm değildir — A/B alınana kadar iddia
    kurulmadı sayılır (`CLAUDE §1`).
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
- [x] (21.10) **Kurye bölümü (K1 Günüm · Teslimat · Gün Kapanışı):** UI v2'den birebir ve TAM
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
- [x] (21.11) **Depo bölümü (hub + D1–D6):** önce ölçüm — hazırlık/kabul/transfer/sayım/dönüş
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
  - **Durum (27.08 — stok hareket defteri sözleşmesine geçiş, 21.11e):** operasyon şeridinin
    talebi üzerine (`docs/talep/mobil-stok-hareket-defteri-sozlesme-degisti.md`) sayım/düzeltme
    ekranı yeni sözleşmeye taşındı. **`stock_adjustment` tablosu kalktı, yerine defter geldi**
    (`stock_movement`, 06.14) ve iki şey değişti:
    · **Yön artık ayrı alanda.** `qty` DAİMA pozitif, `direction: 'out' | 'in'`. Ekranın dili
      DEĞİŞMEDİ (operatör hâlâ "−4" yazıyor); değişen çeviri: `toRequestQty` (işaret çevirmesi) →
      `toRequestLine` (adet + yön). Gerekçe ölçülmüş bir arızaydı: işaret miktara gömülüyken
      girişlerle çıkışlar aynı toplamda eriyor, "Çıkışlar" sekmesi dönem toplamını EKSİ
      gösteriyordu. Para modülü aynı kuralı yıllar önce koymuş (`0018_money.sql:35`).
    · **Sonuç iki yönü ayrı döndürüyor** (`outQty`/`inQty`, `totalQty` kalktı). Ekran tek satır
      gönderdiği için dolu olanı yazıyor; TOPLAMIYOR — toplamak defterin ayırdığı iki büyüklüğü
      geri birleştirmek olurdu.
    **ASIL ZARAR TESTLERDE VE SESSİZDİ.** `warehouse.test.ts` olmayan bir tabloyu siliyordu ve
    teardown patladığı için **dosyanın 49 testi birden düşüyordu**; `courier.test.ts` ile
    `sale.test.ts` ise `db.from(...).delete()` kullanıyordu — o çağrı hatayı FIRLATMAZ, döndürür.
    Defter gelince her teslim/satış partiye bir hareket çıpaladı ve o satır hem partiyi hem
    siparişi `restrict` ile tuttu: silme sessizce yarım kalıyor, **her test bir öncekinin malını
    da sayıyordu** (ölçüm: kalan adet `4` yerine `17`, `18` yerine `137`). Üçü de `purgeVariantStock`
    + `mustDelete` kapısına geçti — sıra zorunlu: parti önce (purge bütün hareketleri toplar),
    sipariş sonra.
    Doğrulama: **kilitli tam paket 3579/3579 YEŞİL** (üçüncü tur; ilk turda kendi dört uç testim
    eski gövdeyle düşüyordu — istek gövdelerine de `direction` yazıldı). Kalan tek "failed suite"
    `packages/application/src/order/quick-sale.test.ts` teardown'ı ve **benim değil**: aynı düşüş
    değişikliklerimden ÖNCEKİ koşuda da vardı (`.test-results/previous.log`), kökü denetimin arka
    uca bıraktığı `not-arka-uc-stok-hareket-adlandirmasi-yarim-birakti.md`.
    **İkinci turda bir yalancı düşüş görüldü ve kaydı burada duruyor:** `analytics.test.ts`in
    *"iki ciro aynı tanımdan çıkar"* iddiası `2020-01-01`'den bugüne KÜRESEL toplam okuyor ve iki
    sorgu arasında dünyanın durmasını varsayıyor — CLAUDE §4b'nin adıyla yasakladığı desen
    (*"küresel sayıya bakan test yazma"*). Üçüncü turda tekrar üretilmedi. Dosya benim alanım
    değil; işaret olarak bırakıldı.
    **İki bayat not kapandı:** `not-mobil-management-teardown-yarim.md` (26.08) — ölçüldü, 13 test
    yeşil ve teardown gürültüsü YOK, çözüm `cleanup.ts`e girmiş; `not-mobil-tarifler-okuma-sozlesmesi.md`
    (07.08) — tarif ekranı 09.08'de yazıldı (21.14d). `not-mobil-test-defteri.md`nin son maddesi
    (*"vFb fixture → şema dönüşü"*) de ölçülünce KAPALI çıktı: fixture artık `FeedbackCard`/
    `FeedbackInvite`/`FeedbackCompletion`ten türüyor, elle yazılmış aynası silinmiş.

- [x] (21.12) **Yönetim + Para bölümleri (Y1–Y6 · M1–M2 · gün özeti):** okuma ağırlıklı; Y5 gün
  özeti birleştirme ucu (doc 04 iş listesi) + Y1 üstlen/YZ-cevap aksiyonları, Y2 istisna kararı
  (motor önerisi + para önizlemesi uçtan), Y3 teklif onayı, Y4 taslak TS, Y6 not düşme; M1/M2
  salt okuma (yazma aksiyonu ÇİZİLMEZ — tasarım böyle). Para kökünün boş/hata durumu (21.8
  notu) burada eklenir.
  `touches: apps/mobile, packages/application, apps/mobile-api, packages/{types,database}`

  **Durum (26.08 — DİLİM A: okuma hattı canlı; hub · gün özeti · M1 · M2 gerçek uçta).**
  Ölçümle başladı: 9 ekranın 9'u UI-TAM ama fixture'lıydı, mobile-api'de tek yönetim/para ucu
  yoktu, motorların çoğu hazırdı. Bu dilim OKUMALARI bağladı:
  · **Sözleşme:** `management-api.schema.ts` (karar kutusu ALAN bazlı — satır değil: her alan canlı
    sayı + en taze örnek; sıfır alan hub'da hiç çizilmez) + `money-api.schema.ts` (M ekranlarında
    istek gövdesi YOK — salt okuma sözleşmede de görünür).
  · **Motor:** `application/management/hub.ts` — doc 04'ün "birleştiren kapı yok" dediği Y5 kapısı
    açıldı; kutunun sayıları HEP mevcut motorlardan (hazırlık `shortfallQty` · raf ömrü
    `offerDecisionOf(can_offer)` · `ReorderService.suggestions` · `ticket_queue` · sosyal gelen
    kutusu) — ikinci bir kural yazılmadı. `application/accounting/money.ts` — M1/M2 defterden
    TOPLAR, hesaplamaz; kurye float'u "bugünün kapanmamış seferlerinin beklenen tahsilatı"ndan
    türer, ayrı bir "kurye kasası" uydurulmadı. Servis eklemeleri: `countAwaiting` ·
    `listByRuns(collection)` · `listOrderMoneyOfDay` · `listUnpaidByDeliveryDate`.
  · **Uçlar:** `/management/hub` (admin) · `/money/{overview,day-end}` (accounting+admin) —
    KORUMALI beyanı 33→36. "Gün" TESLİM günüdür (`order_counts` ekseni).
  · **Ekranlar:** hub + gün özeti aynı zarfı okur ("kutu 3 diyor, özet 2" çelişkisi motor düzeyinde
    imkânsız); M1/M2 bağlandı, `money-fixture.ts` SİLİNDİ, `management-fixture.ts` beş karar
    ekranının gövdesine inceldi. 21.8'in "para kökünün boş/hata durumu" TAM kapandı (boş liste +
    gerçek `Tekrar dene`). Hesap satırları artık defterdeki ADIYLA (Kasa/Revolut/Stripe…) — v2'nin
    iki sabit satırı gerçek kurulumu gizlerdi.
  · **Bilinçli sınırlar:** YZ içgörüsü uçtan BOŞ döner (motor modül 20/22'nin; uydurma içgörü yerel
    veriden iş çıkarımı olurdu — CLAUDE §0), ekran yokluğu söyler. Yarın satırından "rotaya
    atanmamış" ÇIKTI: sefer sabah kurulur, o sayı bugünden ölçülemez. Vadeli (term) tahsilat satırı
    yazılmadı: modelde vade alanı yok. M2 farkı kapanan sefer yokken `null` — 0 "fark yok" yalanı.
  · Doğrulama: uç entegrasyonu **7/7** (kendi kurduğu satırı sayar — küresel sayı iddia edilmez) ·
    mobil jest **806/806** (8 yeni ekran testi; sabotaj: sıfır-alan bekçisi kaldırılınca yalnız
    ilgili test düştü) · tsc (types/database/application/mobile-api/mobile/web) · lint · knip'e
    yeni bulgu eklenmedi.
  **Durum (26.08 — DİLİM B: Y3 teklif onayı + Y4 tedarik CANLI, okuma + aksiyon).**
  · **Y3:** aday listesi raf ömrü motorundan (`listOfferCandidates` — hub'ın saydığı kümenin ta
    kendisi, `can_offer`); onay `POST /management/offers`, akıbet SATIR SATIR gövdede (200 +
    `ok|not_found|must_discard`). **DLC kuralı tek motora indi:** `openBatchOffer` terfisi — web
    `setOfferPriceAction` artık aynı kapıyı çağırıyor (kural iki yüzeyde iki kez yaşamıyor;
    `withProposal` sarmalı webde aynen durdu). Ekran: fiyat düzeltme + geri alınabilir çıkarma
    aynen; açılamayan parti satırında İŞARETLİ kalır, onaydan sonra liste TAZE okunur.
  · **Y4:** öneri `ReorderService`ten adlandırılarak (`listSupplyGroups` — varyant/tedarikçi/depo
    adları + BAŞKA TESİSTEKİ adet transferin ham verisi olarak); onay `POST /supply/draft` —
    gövde YALNIZ grup kimliği, kalem listesi gönderilmez: sunucu öneriyi onay anında yeniden
    hesaplar, `no_suggestion` = "ekran bayattı" cevabı (liste tazelenir). Eşlenmemiş grup CTA
    çizmez — ölü düğme yasağının kendisi.
  · KORUMALI 36→40. Doğrulama: uç entegrasyonu **8/8** (aday→onay→DB'de `offer_price`; DLC geçmiş
    partide yazım YOK; taslak TS satırı + kalemde hedef depo) · mobil jest **812/812** (6 yeni) ·
    **sabotaj bir SAHTE YEŞİL yakaladı:** "çıkarılan satır gitmez" iddiası fiyatsız satırla
    kanıtlanıyordu, süzgeç kaldırılınca test yine geçti — satıra önce fiyat yazdırıldı, sabotaj
    artık yalnız o testi düşürüyor (21.111 dersinin üçüncü tekrarı) · tsc/lint/knip temiz;
    `apps/web` typecheck temiz (offer-actions refaktörü).
  **Kalan (Dilim C):** Y1 şikâyet detayı + Y2 istisna kararı + Y6 niyet — üçü talep/mesaj kümesi.
  · **Önkoşul KAPANDI (26.08):** web `lib/ticket` personel yolu pakete terfi etti —
    `staff-read.ts` (kuyruk + detay; `ticketOrderRefOf`/`ticketReturnOutcomeOf` ortak yardımcıları
    web'in MÜŞTERİ detayı da kullanıyor, yerel kopyaları silindi) + `staff-write.ts` (`openTicket` ·
    `replyAsStaff` · `changeTicketStatus` · `takeOverTicket` · `consumeTicketDraft`) +
    `customer/label.ts` (`customerLabel`). Web dosyaları KÖPRÜ (notify köprüsünün deseni; 16 web
    tüketicisinin importu değişmedi). Davranış web'in kendi suite'iyle kanıtlı: `ticket.test`
    45/45 · `tickets-read` 5/5 · `notify`/`attachments`/`name` yeşil; web+application typecheck.
  · ~~Üç ekran uca bağlanana dek fixture'da~~ — **DİLİM C tamam (26.08), modül fixture'sız:**
    `management-fixture.ts` SİLİNDİ, dokuz ekranın dokuzu gerçek uçta.

  **Durum (26.08 — DİLİM C: Y1 + Y2 canlı, Y6 çözüldü; 21.12 KAPANDI).**
  · **Y1 şikâyet:** okuma web talepler sayfasıyla AYNI motordan (`readComplaint` →
    `getStaffTicketDetail`); YZ önerisi artık mesaj değil TALEP TASLAĞI (`aiDraftReply`, 16.5) ve
    iki çıkışı gerçek (`consumeTicketDraft`: cevaba çevir / kutuya taşı — metin SUNUCUDAN döner,
    yerel kopya kullanılmaz); cevap `replyAsStaff` (çeviri → mail kuyruğu → zil sırası pakette),
    üstlen `changeTicketStatus`. Mesaj görünümüne `authorId` eklendi (artımlı) — "OPERATÖR · Selim"
    gerçek addan. UI-only döneminin "gönder düğmesi yok" sapması kapandı: kapı gelince düğme geldi.
  · **Y2 istisna:** kuyruk hazırlık motorundan TÜRETİLİR (`listOrderExceptions` — ayrı defter yok;
    hub'ın sayacı da aynı fonksiyondan), öneri `adviseShortfalls` (eşikler ayardan), eksik TUTARI
    admin'e görünür (doc 04). "Müşteriye sor" web'in kapısının aynısı (`shortfallQuestion` +
    `openTicket`); sorulan kalem kuyruktan kendiliğinden düşer. **"Kalanı gönder" düğmesi BİLİNÇLİ
    ÇİZİLMEDİ** (tasarımdan sapma): o kararın modelde kalıcı kaydı yok — depo kısmi hazırlığı
    sürdürür, fark teslim tarafında netleşir (07.8); mekanizmasız düğme ölü düğmedir (kullanıcı
    talimatı 26.08). Motorun önerisi ("kalanı gönder — eksik küçük" dahil) satırda BİLGİ olarak
    durur; karar kaydı modele girdiği gün düğme geri gelir (web şeridiyle konuşulacak).
  · **Y6 niyet:** ayrı ekran SÖKÜLDÜ (bilinçli sapma): v2 o ekranı sosyal gelen kutusundan (15.15)
    ÖNCE çizmişti — bugün gerçek kutu mobilde canlı ve tek mesajlık kopyası aynı konuşmanın ikinci
    zayıf ekranı olurdu (CLAUDE §1). Karar kutusunun niyet satırı `/social`e gider; sipariş masada
    kurulur (doc 04 Y6 v1 aynen).
  · **Purge iki halka öğrendi** (ölçüldü — teardown yarım kalıyordu): siparişe kalem bağlı talep
    SİPARİŞTEN önce (`ticket_items_need_order`), talepler PROFİLDEN önce (tek DELETE'te sıra
    tanımsız; personel cevabının `author_id`si `set null` düşünce `ticket_message_author` patlıyordu).
  · `stampOf` üçüncü tüketiciyle `lib/operations/stamp.ts`e indi (ilk ev satış geçmişiydi).
  · Doğrulama: uç entegrasyonu **13/13** (cevap yazar adıyla döner · üstlen motor kapısından ·
    taslaksız tüketme `no_draft` · istisna: eksik tutar + `already_asked` çift-soru koruması +
    sorulan kalemin kuyruktan düşüşü) · mobil jest **818/818** (6 yeni; sabotaj: "sunucudan dönen
    taslak" iddiası yerel kopyayla bozulunca yalnız o test düştü) · tsc/lint/knip temiz · KORUMALI
    40→47.
  **Test tamamlama turu (26.08 akşam — kullanıcı talimatı "tüm testleri bitir"):**
  · Para uçlarına GERÇEK tahsilat izi girdi: testin KENDİ hesabına (`accountIds` purge hedefi —
    işletmenin Kasa'sı kirletilmez) `recordOrderPayment` ile 6,00 € yazılıyor → kısmi satır
    `kind: partial` + kalan 14,00 €; yöntem kırılımı ve gün-sonu toplamı ALT SINIR iddiasıyla
    (paylaşılan DB'de eşitlik yalan söyler). Uç toplamı **66/66** (yönetim 13 · para 6 · KORUMALI 47).
  · Hub'a kimlikli gezinme testi: şikâyet satırı BAŞIN kimliğiyle `/complaint?id=` açar; niyet
    satırı `/social`e gider (Y6 kararının çivisi).
  · **Ders — ekran mock'ları URL-YÖNLENDİRMELİ olmalı, sıra-bazlı değil** (ölçüldü): bildirim
    şeridi zili gerçek fetch'e bağlayınca sıra-bazlı `mockResolvedValueOnce` yanlış çağrıya denk
    geldi; hub testleri yol süzgeçli `routeHub`a geçti — başka şeridin ekleyeceği yeni fetch'ler
    bu testleri bir daha kıramaz.
  · Float/fark TOPLAMASI için sefer fikstürü bilerek kurulmadı: toplama `delivery_run_collection`/
    `delivery_run_close` satırlarının düz `reduce`'u; satırların doğruluğu kuryenin
    `day-close.test` suite'inde çivili — boru hattını para testinde kopyalamak ikinci nüsha olurdu.
  · ~~Cihaz turu BEKLEMEDE~~ **Cihaz turu YAPILDI (26.08, OPPO CPH1907):** Android dev-client
    `expo run:android` ile yeniden derlendi (`ExpoPushTokenManager` engeli böyle kapandı — native
    modül eklendiğinde derleme şart, kullanıcı öngörüsü doğrulandı) ve dokuz ekran admin +
    muhasebe oturumlarıyla gerçek veriyle gezildi: hub karar kutusu (beş alan; sıfır alan
    çizilmiyor), gün özeti (kanal kırılımı + YZ boş hâli), teklif onayı (46 aday — hub sayacıyla
    birebir, tek motor gözle doğrulandı), tedarik önerisi (grup + "başka depoda var"), şikâyet
    (YZ taslak kutusu + iki taban düğmesi), sosyal geçiş (Y6: WhatsApp satırı gerçek kutuyu açtı),
    para M1 (bekleyen liste + "referanssız" geri düşüşü) ve M2 (uyuşmazlık null hâli cihazda
    görüldü: "kapanan sefer yok" — 0 değil). İstisna ekranı cihazda AÇILAMADI çünkü kuyruk boştu
    (hub kuralı gereği satır çizilmez); kapsamı jest + entegrasyon taşıyor. **Turda bir arıza
    bulunup düzeltildi:** şikâyet ekranının iki taban düğmesi metinsizdi — `flex: 1` `style`a
    yazılmıştı, `grow` prop'u verilmemişti (pressable-surface künyesindeki 23.08 arızasının
    birebir tekrarı; künye "Jest bunu göremez" diye uyarıyordu ve göremedi). Düzeltme cihazda
    ekran görüntüsüyle doğrulandı.
  **Bilinçli sınırlar (modül kapanışında açık kalanlar, sahipleriyle):** "kalanı gönder" karar
  kaydı (model işi — web şeridiyle) · kurye uçlarında `effects` (BEKLEYEN(14.11) hattı) · YZ
  içgörü motoru (modül 20/22) · hub'ın parti/tedarik taramasının maliyeti büyüyen katalogda
  yeniden ölçülür (bugün tek okuma ~çeyrek saniye sınıfı, kabul).
- [x] (21.13) **Push altyapısı:** cihaz token modeli + teslim hattı — web şeridiyle koordineli
  (14 notify sürücüsü; defterden yürür). Kabuktaki bildirim ekranı ve rol süzmesi 21.9'da;
  bu görev yalnız İLETİM altyapısıdır. Bildirim hızlandırıcıdır, tek kapı değil (zemin brief
  kuralı) — her listeye elle giden yol push'suz da çalışır.
  *(Bu hatta asılı kamera kanıtı için zemin DEĞİŞTİ — denetim gözlemi 23.08: `expo-camera` artık
  dev-client'ta KURULU (modül 23 kutu QR'ı için girdi, 23.4'te cihazda ölçüldü). Teslim ekranının
  "kamera modülü kurulu değil" açıklaması bayat; kalan iş modül kurmak değil, foto kanıtını aynı
  yükleme kapısına BAĞLAMAK.)*
  `touches: apps/mobile, apps/mobile-api, packages/database (token modeli — talep gerekebilir)`

  **Durum (26.08) — KAPANDI; uçtan uca tamamlama KULLANICI KARARIYLA web sorumlusunun elinden** ("mobil şerit dahil bu özelliği uçtan uca entegre et"). Üç katmanın üçü de yazıldı ve testli:
    **Katman 1-2 (kayıt + uygulama içi):** tablo/tek kapı/uç 14.12-14.13'te (defterde). Müşteri ekranı `screens/notifications/` (puan-geçmişi deseni birebir: keyset akış, beş hâl, iyimser okundu/gizle + düşerse GERİ ALMA — ekranda "okundu" duran ama sunucuda okunmamış satır, öteki cihazda rozeti yalancı çıkarırdı), cümle sözlüğü `notification-copy.ts` (üç dil; **bilinmeyen tür genel cümleye düşer** — küme sunucuda büyür, eski sürüm yeni türü boş satırla karşılamaz; zarfın `kind`'ı da bu yüzden düz dize, enum parse'ı ilk yeni türde bütün sayfayı düşürürdü). Vitrin zili gerçek rozete bağlandı (`use-notification-badge` — odak + kişinin kanalı; hata anında sayı SIFIRLANMAZ, son bilinen değerde kalır). Operasyon kabuğu fixture'dan uca geçti (`notification-map.ts` — kind→bölüm/nokta/başlık; fixture kendi künyesinin sözü gereği SİLİNDİ, süzme kuralı yerinde), hub rozetleri `unread` sayar, ekranı açmak "gördüm"dür.
    **Katman 3 (cihaz):** `expo-notifications ~57.0.9` (sürüm Expo'nun kendi eşleme dosyasından — tahmin değil) + config plugin. Kayıt her açılışta ve İZİN RAPORUYLA (`ensurePushRegistration`: kanal → izin → jeton → uç; Android 13 sırası v57 dokümanından). Çıkışta jeton silme `signOut`un İLK adımı — oturum kapandıktan sonra silme isteği atılamaz. Dokunuş yönlendirmesi `use-push-navigation`: sunucunun `data` yükü uygulama içi listeyle AYNI adres sözlüğünden (`notificationHref`) çözülür — iki eşleme olsaydı biri gün gelip başka yere götürürdü. Expo Go/projectId'siz ortamda jeton alınamaz ve bu KÜNYELİ sessizliktir: uygulama içi zil aynı satırları zaten taşıyor.
    **Testler:** mobil jest 108 suite / 827 (sözlük 5 · eşleme 3 · kabuk uçtan uca satır-basışı gerçek eşlemeden). **CİHAZDA DOĞRULANMADI ve açıkça yazılıyor:** gerçek push teslimi dev build + fiziksel cihaz ister (Expo Go Android'de kapalı) — cihaz turu mobil şeridin ilk fırsatına.
    **Cihaz ölçümü (26.08 turu, mobil şerit):** dev-client `expo run:android` ile yeniden derlendi — native modül engeli (`ExpoPushTokenManager`) kapandı, uygulama açılıyor. Ama **jeton kaydı hiç düşmüyor: `push_device` 0 satır** (defalarca açılışa rağmen) ve logcat'te push izi yok. Sebep ölçüldü: **`google-services.json` depoda/`app.config`te YOK** — Android'de `getExpoPushTokenAsync` FCM'siz fırlatır ve kayıt künyedeki gibi sessizce atlanır. Yani teslim turunun kalan engeli kod değil YAPILANDIRMA: Firebase projesi + `google-services.json` (+ Expo projectId) gelmeden push teslimi hiçbir cihazda ölçülemez — dış engel, kurulum kararı kullanıcının/şeridin.
  **Durum (09.08):** modül sıraya alındı (kullanıcı kararı) ve **kalıcı defteri açıldı**:
  `docs/talep/bildirim-modulu-web-mobil.md`. Ölçüm: üç katmanın üçü de bugün YOK — bildirim
  tablosu yok (olaylar doğrudan maile gidiyor, `packages/notify` → `packages/email`),
  `expo-notifications` kurulu değil, zilin açtığı ekran yer tutucu
  (`apps/mobile/src/app/notifications.tsx`). Kapsam bölündü: **kayıt + okuma ucu** web şeridinde
  (defterin ilk girdisi), **cihaz jetonunun saklandığı yer** de orada (kişisel veri → silme
  akışının kapsamı); **izin akışı · jeton alma · Expo teslim hattı · bildirime dokununca doğru
  ekrana gitme · uygulama içi bildirim listesi ekranı** bizde. Sıra: web'in kayıt katmanı
  gelmeden ekran yazılmaz — yazılırsa boş bir listeye bakar.
- [x] (21.14) **Müşteri ekran seti — İLK ETAP: tasarım birebir, UI-only (kullanıcı kararı 08.08):**
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
  - **Durum (27.08 — SON TUR: on dört işaretin ölçümü, 21.14f):** görev satırı 14 canlı
    `BEKLEYEN(21.14)` iddia ediyordu; her biri koda soruldu. **Onu bayat çıktı** — borç ödenmiş,
    künye yerinde kalmıştı: paket çözümü `@lezzet/application`a terfi etmiş ve `readCartView`
    kapıyı geçiyor (`getPackagesByIds`), `CartService.setQty`/`removeItem` satır anahtarına
    (`CartRef`) geçmiş ve uç paketi `?kind=bundle` ile adresliyor, checkout gerçekten sipariş
    açıyor, bölünmüş sepetin kargo düğmesi çalışıyor, `variantId`yi çıkarımla bulan ikinci adım
    hâlâ yazılıydı. Bayat künyeler gerekçeleriyle birlikte gerçeğe çekildi (silinmedi: kararın
    kendisi oradan okunuyor).
    **DÖRT GERÇEK AÇIK KAPANDI:**
    · **Salt-kargo sepette düğme YANLIŞ siparişi açıyordu.** Bölünmüş sepette kargo grubunun kendi
      düğmesi vardı ama `shippingOnly` sepette `split` false olduğu için o kart hiç çizilmiyor ve
      tek düğme düz `/checkout`a, yani ROTA taslağına gidiyordu — ekran "kargoyla gönderilir"
      derken sipariş kapıya teslim siparişi olarak açılıyor ve teslimat/ödeme adresin cevabından
      çözülüyordu. Web'in aynı kararı (`cart-checkout-bar`) mobile geçirildi; 3 test (sabotajla
      doğrulandı: salt-kargo dalı kırmızıya döndü).
    · **Sipariş NUMARASI onay ekranına taşınıyor.** Sözleşmenin `placed` dalına `referenceNo`
      eklendi ve değer geçişin KENDİ cevabından geliyor (`transitionOrder` → `referenceNo`) — ek
      okuma yok. Kart yolunda `null` ve bu doğru: sipariş o an hâlâ taslak, onayı webhook yazar.
      5 test (ekran + rota parametresi; sabotajla doğrulandı).
    · **`variantId` ekranlardan AÇIKÇA geçiyor** (ürün ve tarif detayı) — depo onu `id`nin sonundan
      ayıklayabiliyordu ama o bir çıkarımdır ve `id` biçimi değişse satır sessizce adressiz kalırdı.
    · **`resetDeliveryAddress` bağlandı.** Kendi künyesi "müşteri değişince seçim düşer" diyordu
      ama çağıranı yoktu (knip ölü ihraç gösterdi); `signOut` artık çağırıyor — kalan kimlik yeni
      müşteride karşılıksız.
    **Ölü kapılar silindi:** `cartSubtotalCents`/`cartTotalCents` — künyeleri "checkout kendi
    görünümüne bağlanınca silinir" diyordu, bağlandı (21.08) ve çağıransız kalmışlardı.
    Doğrulama: mobil hedefli jest yeşil (sepet 12 · checkout 5 · onay 3 yeni) · `knip` temiz ·
    `eslint` temiz · `typecheck` kendi kapsamımda temiz (kalan iki hata paralel şeridin süren
    `stock_adjustment` işinde: `use-adjustment.hook.ts` ile `application/warehouse/adjustment`
    sözleşmesi ayrışmış — bu dilimin dışında).
    **AÇIK KALAN TEK MADDE — vitrin seçkisi (`readShowcase`), ve o web'in alanı:** native vitrin
    kataloğun `featured` sırasını basıyor, web'in sinyalli seçkisi kopyalanmadı (yasak). Sinyalsiz
    veride iki yüzey aynı listeyi veriyor; sinyal birikince ayrışırlar ve hiçbir yerde hata çıkmaz.
    Terfi edecek kod `apps/web/lib/storefront/home.ts`te — not bırakıldı
    (`docs/talep/not-musteri-vitrin-seckisi-mobilde-sinyalsiz.md`). Terfi olduğu gün mobil tarafta
    iş tek satır.
  - **KAPANDI (27.08 · kullanıcı sorusu üzerine ölçüldü).** Kullanıcı sordu: *"tüm ekranlar
    fonksiyonelse 21.14 neden hâlâ açık?"* — ölçüm onu doğruladı, **satır hak etmediği hâlde
    `[~]` duruyordu.**

    **SAYILDI:** 23 müşteri ekran klasörü (tasarımda ~21 ekran) · 53 hook · 25 uç istemci modülü ·
    `ScreenPlaceholder` kullanan **tek dosya yok**. Bilerek stub bırakılan iki yer var ve ikisi de
    ekran değil, künyeli birer alt parça: ürün detayının "stok gelince haber ver" anahtarı
    (aboneliği yazacak uç yok) ve kurye imzası — `CLAUDE §3`'ün *"UI tam, arka uç stub"* kuralı.

    **Satırın vaadi** *"İLK ETAP: UI-only, fixture'la; backend işi ÜRETMEZ"* idi; o vaat
    tamamlandı ve AŞILDI — ekranlar fixture'da kalmadı, gerçek uçlara da bağlandı (ikinci etap,
    21.15 · 21.16 · 21.17 gibi kendi görevlerinde yürüdü).

    **Kalan iki işaret de bugün kapandı:** vitrin seçkisi (`readShowcase` pakete terfi etti — kendi
    bölümünde) ve `variantIdOf`un İKİNCİ ADIMI. İkincisi künyenin birebir söz verdiği şeydi
    (*"ekranlar `variantId`yi açıkça geçince ikinci adım silinir"*): kimliği `id`nin kuyruğundan
    çıkaran yedek silindi, `TRAILING_UUID` ile birlikte. Çıkarım `id` biçimine bağlıydı ve biçim
    değişse satır sessizce adressiz kalırdı. `null` dönüşü YAŞIYOR ve kalmalı — alan opsiyonel
    olduğu sürece üçüncü bir çağıran onu geçmeyi unutabilir; o zaman satır sunucuya gitmez, yerelde
    kalır ve senkron dışılığı görünür olur. Sepet KALICI DEĞİL (bellekte + sunucu senkronu, ölçüldü:
    `AsyncStorage` yok), yani eski biçimli satır riski de yoktu.
    Doğrulama: `typecheck` temiz · sepet/checkout/kit jest **80/80**.

    **DERS — satırın kendisi de bayatlayabilir.** 21.14f'de bu satırın iddia ettiği 14 borçtan onu
    bayat çıkmıştı (borç ödenmiş, künye kalmış). Bugün görüldü ki aynı şey SATIRIN KENDİSİNE de
    olmuş: bir aydır `[~]` görünüyordu çünkü kimse dönüp kapatmamıştı. `docs:check` bunu göremez —
    kapalı görevdeki asılı işareti denetliyor, AÇIK görevin hâlâ açık olmayı hak edip etmediğini
    değil.
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

- [x] (21.20) **YER EKSENİ mobilde tek kaynaktan okunacak — posta kodu katalog okumasına TAŞINSIN**
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

  **Durum (27.08) — ÜÇÜNCÜ TUR: KAYIT BAYATMIŞ, GERİYE YALNIZ TEST BORCU KALMIŞTI; O DA KAPANDI.**
  Kullanıcı "incele, bayat olabilir" dedi ve haklı çıktı — aşağıdaki iki açık madde ölçülünce
  ikisinin de gerçekte kapalı olduğu görüldü (görev satırı iddiadır, ölç):
  · **Ürün detayı YAZILMIŞ.** `product-detail-screen.tsx` `stockMarkOf`u katalogla aynı yerden
    okuyor; `info` tonu bilerek eleniyor (kullanıcı kararı 10.08 — "Kargoyla gelir" ekranlardan
    kalktı, kargolanabilirlik `noShip` çipiyle konuşuyor) ve fiyatsız ürün sessiz kalıyor.
  · **"Haber ver" bölge notuna DÖNMEDİ — ve dönmemesi doğru karar.** Kayıt onu bir borç gibi
    yazmıştı; kod daha dar bir söz veriyor: `blocked` (bu adrese gitmiyor) haber-ver dalına HİÇ
    girmiyor, çünkü orada beklenen kalem değil BÖLGEdir ve tutamayacağımız bir söz verilmez.
    Dal yalnız `pending` ("bölgenizde şu an yok") ve tükendide açılıyor — ikisinde de müşterinin
    yapabileceği şey aynı. Vaadin daralması kayda geçti; yeni düğme kurulmadı.
  · **Test borcu kapandı (27.08):** `place-view.test` +3 (`shippableChipVisible` — kargo modunda
    görünür, rota içinde ve yer bilinmezken görünmez: çipin sessiz arızası "basılır ama liste
    değişmez"dir) ve yeni `stock-mark.test` 4 (üç ton → üç renk çifti; `pending`in olumlu tona
    KATILMADIĞI ayrıca çivili — sabotaj turu ölçtü, olumlu tona çevirince test düştü). Yer
    dosyaları toplam **37/37**.
  **Kalan tek şey mobil kart/ekranların canlı cihaz turu değil, YOK — görev `[x]`.**

  Açık kalanlar (~~bu yüzden `[~]`~~ → 27.08'de hepsi kapandı):
  · ~~**Paketler** — `inRouteOnly` kuralı mobil paket kartı/detayında okunmuyor~~ → 10.08'de
    kapandı (üstteki ikinci tur).
  · ~~**Ürün detayı** — yere bağlı işaret ve "haber ver"in bölge notuna dönmesi yazılmadı~~ →
    ölçüldü 27.08: işaret yazılmış, haber-ver kararı bilinçli olarak daha dar (üstteki blok).
  · **Sözleşme dosyası** — `packages/types/src/contracts/catalog-api.schema.ts`e sorgu alanı
    EKLENMEDİ: `contracts/` bugün yalnız CEVAP zarflarını tutuyor, orada tek bir sorgu şeması yok
    (ölçüldü). Sorgu şeması ucun kendi dosyasında kaldı — tek tüketicisi olan yeni bir desen açmak
    knip'in ölü göreceği bir sözleşme üretirdi.
  · ~~**Test borcu** — `StockMark`, `stockMarkOf`, `placeModeOf`/`shippableChipVisible`~~ →
    27.08'de kapandı (üstteki üçüncü tur; 37/37).

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
  ~~`apps/mobile/src/lib/hooks/use-debounced-lookup.hook.ts`~~ → **`packages/react-hooks/src/use-debounced-lookup.hook.ts`**
  (dosya 21.08'de pakete TAŞINDI — web adres araması aynı çekirdeği çağırıyor, ikinci nüsha
  yazılmasın diye; mantığa dokunulmadı. Taşıyan: denetim şeridi, notu `docs/talep/`te) ·
  `packages/address-fr/src/ban-client.ts`

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

  ~~**BEKLEYEN(21.13): kabuktan müşteri yüzeyine DÖNÜŞ yolu hâlâ yok** — personel giriyor ama
  çıkamıyor (uygulamayı kapatıp açmak gerekiyor). Kabuğun künyesi bu geçişin tema dikişini de
  şart koşuyor (odak/blur), o yüzden ayrı ve bilinçli bırakıldı.~~ → **22.08'de kapandı (21.97):**
  kimlik menüsünün "Müşteri uygulamasına geç"i dönüş yolunu açtı, tema dikişi de aynı dilimde
  `useFocusEffect`e bağlandı. Ölçüm o gün bir üçüncüsünü de gösterdi — kabukta ÇIKIŞ da yoktu;
  o da aynı menüye kondu.

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

- [x] (21.47) **PUAN ARTIK ANLATILIYOR — VE NATIVE'DE GERÇEKTEN YAZILIYOR** (kullanıcı kararı 12.08).
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

  ~~**Kalan (`BEKLEYEN(21.47)`):** karar 2h'nin bağlam mesajlarından tek eksik parça —
  **teslimat-sonrası yorum daveti bandı**~~ → **KAPANDI (27.08): bant YAZILMAYACAK, çünkü işini
  BİLDİRİM yapıyor.** Kaydın kendi gerekçesi zaten şartlıydı (`BACKLOG-musteri §4` açık
  bağımlılık (a)): *"teslimat sonrası yorum daveti bugün e-posta ile gidiyor, **uygulama bildirimi
  altyapısı yok** — o gelene kadar uygulama açıldığında görünen bir bant yapılır, bedava"*.
  Altyapı 14.13–14.15'te geldi ve ölçüldü: `feedback_invite` uygulama içi bildirim olarak
  İŞARETLİ (`notify/types.ts`: `{ class: 'ping', inApp: true }`), teslimat sonrası zamanlı iş
  gönderiyor (`backend/jobs/send-feedback-invites.ts`) ve **cihazda görüldü** (27.08, CPH1907:
  *"AVIS · Que pensez-vous de votre commande (LA-26-KR7VGQ) ?"* — yıldız ikonlu, kendi tür
  etiketiyle). Şartın kalkması vaadi de kaldırır: aynı daveti hem bildirime hem vitrine koymak
  ikinci nüsha olurdu ve vitrin zaten dolu (kullanıcı bildirimi 27.08 — ayrı kalem).
  Tablonun öteki üç satırı zaten karşılanmıştı: keşif kartı vitrinde sayı × aday puanıyla
  duruyor, "uygulama açılınca sessiz" `use-visit-points` künyesiyle uygulanmış, sipariş-onayı
  ekranının puansızlığı bilinçli ve künyeli. **Karar 2h böylece tamamen karşılandı.**

  **YERİNE NE GELDİ (kullanıcı kararı 27.08 — davetin varış noktası):** bildirim müşteriyi
  **sipariş sayfasına** götürecek ve orada yorum için teşvik bloğu duracak. Ölçüm önce bir
  arıza buldu: davet bildirimi tıklanınca HİÇBİR YERE gitmiyordu (hedef `feedback_request`
  yazılıyor, iki yüzeyin adres fonksiyonu da yalnız dört dal tanıyor → `null`); ayrıca payload
  `orderReferenceNo`, adres fonksiyonu `referenceNo` arıyor. **Hedef çevirisi bildirim şeridine
  notla bırakıldı** (`not-bildirim-yorum-daveti-tiklaninca-hicbir-yere-gitmiyor.md`) — iki
  yüzeyin davranışı aynı olmalı, yoksa müşteri aynı bildirime iki cihazda başka tepki alır.
  **Bu şeridin payı yapıldı (27.08):** sipariş detayına açık-davet alanı eklendi
  (`MeOrderDetailSchema.feedback`), motoru `readOrderFeedbackInvite` (davet yok · tamamlandı ·
  süresi doldu → hepsi `null`, ekran ayrımı bilmez) ve ekranda kitin davet-kartı desenli teşvik
  bloğu — puan cümlesi AYARDAN, düğme akışın token'ıyla `/feedback/[token]` açıyor. Böylece
  sipariş detay künyesinin *"numaradan token'a yol YOK"* engeli de kalktı ve tasarımın
  v3:65 düğmesi yerine geldi. Testler: uç **12/12** (üç hâl + açık davet; iki sabotaj turu
  ölçtü), ekran **3/3** (blok yok/var + token'lı gezinme; sabotaj doğrulandı), mobil paket
  **838/838** · typecheck · lint temiz.
  ~~`feedbackPointsReason` keşifte metin varsa hâlâ `review` (20) döndürüyor (karar 6 — bugün
  keşifte metin alanı YOK, gizli tuzak).~~ **Tuzak kapandı (26.08):** keşif artık metinle bile
  aday puanında kalıyor; çivileyen test `domain-core/points.test`te.

- [ ] (21.48) **CİHAZ TURU — MİSAFİR VE MÜŞTERİ YÜZEYİ, KAPSAMLI** (kullanıcı kararı 12.08).
  `touches: docs/uygulama/05-cihaz-turu-musteri.md, apps/mobile/src`

  Senaryo ve kapsam defteri: `docs/uygulama/05-cihaz-turu-musteri.md`. Gerekçe ölçüldü — cihaz
  testlerimiz bugüne dek NOKTASAL yapıldı (her tur bir arıza şüphesiyle başladı), hangi ekranın
  cihazda hiç açılmadığını söyleyen kayıt YOKTU. Kapsam yalnız misafir + müşteri (kullanıcı:
  *"operasyon kısmına yetiştirme"*). Her ekranda İKİ soru: çalışıyor mu · anlaşılıyor mu.

  **Durum (17.08 · B bölümü koşuldu, A bölümü açık).** Kayıtlı: A1–A2, A6–A10, A12 ve B2, B4–B7,
  B11, B14–B15. Açık kalanlar gerçek etkileşim istiyor: B1 (OTP), B8–B10 ve B12–B13, B16 (sipariş
  · ödeme · paylaşım penceresi · puan eşiği) ve A bölümünün onboarding'i (`pm clear` gerektiriyor,
  cihazdaki oturumu siler — kullanıcının kararı).

  **Turun kazancı ölçüm oldu, kod değil:** üç şüphe cihazda ÇÜRÜTÜLDÜ — MB-20 (kart↔detay fiyatı
  üç yerde de `1,84 €`), MB-50 (`visit · 10 puan` defterde), ve 17.08 sabahının *"oturum misafire
  düşüyor"* deseni (siparişler ve talepler girişli açıldı; sabahki gözlem eşzamanlı test koşusunun
  eseriydi — aynı kök `(21.71)`). **MB-03'ün gerçek sebebi de bulundu:** RN'in çift-`R` reload
  kısayolu, `adb input text`in donanım tuş akışıyla tetikleniyor; 15.08'de yazılan *"Metro
  tazelemesi"* gerekçesi ölçümle çürüdü (reload anında değişen dosya yok). Beş yeni kalem açıldı
  (**MB-66…MB-70**), beşi de görsel/metin — hiçbiri veri ya da hesap arızası değil.
  Ölçümler `docs/uygulama/BACKLOG-musteri.md` ve turun kapsam defterinde.

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

- [x] (21.56) **PUAN SİSTEMİNİN UÇTAN UCA DENETİMİ — İLK TUR + GÜNLÜK TAVAN 270 (MB-18)**
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

  ~~**AÇIK KALAN (bu yüzden `[~]`):** yorum · ziyaret · getiren · komşu ödüllerinin gerçek yazım
  yolları, teşekkür kartının sayıları ve "ikinci kez tamamlamada puan yok" hâli ölçülmedi.~~
  **İKİNCİ TUR KAPANDI (26.08) — liste bayatlamıştı, açıkların hepsi sonradan yazılmış
  testlerle zaten kapalı çıktı** ("görev satırı iddiadır, ölç"):
  · getiren + komşu yazımı, iade kuralları ve "yeniden ödemede geri gelmez" tekilliği →
    `reward-revoke.test.ts` (25.08, 17 test) · yorum yolu (metinli `review`, boş metin reddi) →
    `product-feedback.test.ts` · ziyaret: native `POST /points/visit` `points.test.ts`te,
    günde-bir kuralı `visit-points.test.ts`te (tekillik `points_entry_visit_day` indeksinde) ·
    teşekkür kartının sayıları 21.59'da cihazda görülmüştü. Defter dağılımı da ölçüldü:
    `neighbor` satırı hiç yok — yol yalnız testte koşmuş, canlıda komşu davetli ödenmiş sipariş
    henüz doğmadı (arıza değil, veri hâli).
  · **`points_order` SÖKÜLDÜ (kullanıcı kararı 26.08):** `EarnablePointsReason` artık `order`'ı
    dışlıyor (yazım tip düzeyinde imkânsız; sebep geçmişi adlandırmak için `PointsReason`da
    durur), ayar satırı migration'dan ve Ayarlar kataloğunun "Sipariş puanı" girdisinden silindi
    (web dosyalarına dokunuş mekanik zorunluluktu — tip zinciri). Canlı satır bir sonraki
    `db:refresh`te düşer. Tavan 270'in canlıya inmesi de kullanıcı kararıyla `db:refresh`e
    bırakıldı (bugünkü davranışı değiştirmiyor; azami günlük kazanç 18).

- [x] (21.57) **YEDİ OPERASYON EKRANI KAYDIRMA KABINA GEÇTİ — ve MB-34'ün "39 ekran"ı beş kat abartılıymış**
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

  ## İki açık madde de kapandı (27.08) — ve kural artık MAKİNEDE

  **KURAL BEKÇİYE VERİLDİ:** `apps/mobile/src/lib/keyboard-scroll-guard.test.ts`. Kural "ham
  `ScrollView` yasak" DEĞİL (kabın kapsam kararıyla çelişirdi), **"girdisi olan kaydırıcı ham
  olamaz"** — ve ikinci kalıbı da soruyor: yapışkan yazma çubuğu olan ekranda kaçınma kabı bulunmalı.
  Her iki iddia da sabotajla doğrulandı; üçüncü test bekçinin KENDİSİNİ ölçüyor.

  **DEFTERDEKİ "36 ham, 16 korumalı" SAYISI YANLIŞ ÖLÇÜTTÜ.** O sayım *"dosyada kaydırıcı var,
  dosyada girdi de var"* diyordu. Gerçek ölçüt — girdi kaydırıcının İÇİNDE mi — uygulanınca depoda
  **tek ihlal** kaldı. Bekçinin ilk taslağı da aynı kusurun bir başka biçimini taşıyordu: generic
  tip parametresini (`useRef<ScrollView>`) açılış etiketi sanıyor ve iki sohbet ekranını haksız yere
  suçluyordu; ayraç daraltıldı (`<` hemen bir tanımlayıcıdan sonra geliyorsa tip parametresidir).

  **BULUNAN İHLAL GERÇEKTİ VE MÜŞTERİ YÜZEYİNDEYDİ:** `checkout-screen` ham kaydırıcı kullanıyordu
  ve 11.08'de bu DOĞRUYDU — o gün içinde metin alanı yoktu. **İletişim künyesi bölümü (ad + telefon)
  15.08'de eklendi** ve kaydırıcının içine düştü; koruma onunla gelmedi. Yani müşterinin ödeme
  yaptığı ekranda MB-01 ve MB-02'nin ikisi de açıktı. Kimse hata yapmadı: 21.57'nin *"müşteri
  yüzeyi zaten kapalı"* ölçümü doğruydu ama **bir kereye mahsustu** — bekçinin var olma sebebi tam
  olarak bu. Ekran `FormScroll`a geçti (yerleşim değişmedi: yapışkan bar yok, onay düğmesi zaten
  kaydırıcının içinde).

  **YAZIŞMA KALIBININ İKİ EKRANI DA KAPANDI.** Talep detayı bunu 16.08'de zaten çözmüştü
  (`KeyboardAvoidingView` kökü sarar, künyesi iki cihazda ölçülü) — defterdeki madde o gün bayatladı.
  Aynı kalıbın kopyaları olan `management/complaint-screen` ve `management/social-conversation-screen`
  korumasızdı; emsal birebir uygulandı (kaçınma kabı + kaydırıcıya `flex: 1`, çünkü esnemesi gereken
  listedir, çubuk değil). Yeni bir çözüm İCAT EDİLMEDİ.

  ## Kalıp KİTE ÇIKTI — üç kap, tek kural (aynı gün, kullanıcı sorusuyla)

  Yukarıdaki düzeltme yazışma kalıbını iki ekrana KOPYALAMIŞTI (doğru hamle: emsal uygula, yeni
  çözüm icat etme) — ama tekrarı üçe çıkardı. Kullanıcının sorusu bunu görünür kıldı: *"bizim
  çekmecemiz bir komponent değil mi? tek komponent olunca tek yaklaşım sergilemesi gerekmez mi?"*

  **Ölçüm:** çekmece gerçekten tek (`BottomSheet`, tek tanım, 12 kullanım) ve bulunan arızaların
  hiçbiri orada değildi — sezgi doğruydu. Ama "kap" üç çeşitti ve yalnız İKİSİ bileşendi:
  `BottomSheet` (12 kullanım) · `FormScroll` (15) · yazışma kalıbı (**3, bileşen değil**).

  Üçüncüsü kite çıktı: **`components/ui/chat-layout.tsx`** — kaçınma + listenin esnemesi + kardeş
  çubuk, tek yerde. Üç ekran (`support/ticket-detail` · `management/complaint` ·
  `management/social-conversation`) artık yalnız üç parça veriyor: üstteki şeritler, yazışma, çubuk.
  Bekçi de kapları tanıyor ve **dördüncü bir iddia** kazandı: hiçbir EKRAN kaçınmayı elle kurmaz —
  dördüncü bir yerleşim gerekirse dördüncü bir KAP yazılır, koruma ekrana kopyalanmaz.

  **AÇIK: PLATFORM STRATEJİSİ ÖLÇÜLMEDİ** (kullanıcı işaret etti: *"Android ile iOS farklı
  refleksler gösterebiliyor"*). Depoda aynı sorunun İKİ cevabı var ve fark bilinçli değil, tarihsel:
  `BottomSheet` ile `FormScroll` her platformda `behavior="padding"`, `ChatLayout` iOS'ta `padding`
  Android'de `height` (16.08'de talep detayında yazıldı, öteki kapların kararıyla hiç
  karşılaştırılmadı). İkisi de doğru olabilir — form ile yapışkan çubuk gerçekten farklı davranır —
  ama bugün kimse kanıtlayamıyor. `BEKLEYEN(21.78)`: iki platformda ölçülüp tek karara bağlanacak.
  Değer artık TEK yerde durduğu için o tur bir satır değiştirecek, üç ekranı gezmeyecek.

  Doğrulama: `keyboard-scroll-guard` 5/5 · `chat-layout` 5/5 (yapışkanlık sabotajla doğrulandı) ·
  mobil paket 862/863 (tek düşüş paralel şeridin süren `stock_adjustment` işinde) · `eslint`/`knip`
  temiz. **Cihaz turu YAPILMADI** — üç ekran da klavye davranışını değiştirdi ve kalıbın kendisi
  cihazda ölçülü olsa da bu üç ekranın turu operasyon yüzeyi çalışmasına kalıyor; platform sorusu
  da o turda ölçülecek.

- [x] (21.58) **TEŞEKKÜR SAYFASI KUTUSUZ VE BÜTÜNLEŞİK — kahraman işaret puan yıldızı oldu (MB-19)**
  `touches:` `apps/mobile/src/screens/feedback/feedback-screen.tsx` ·
  `apps/mobile/src/screens/feedback/feedback-icons.tsx`

  **Yön üç turda oturdu ve her turda kullanıcı yönlendirdi — ekran görüntüsüyle.**

  1. **Kart büyüsün, metinleri içine alsın** (11.08 kaydı). Yapıldı: kalp + başlık kartın içine
     girdi, kart `stretch` oldu. *Bu turda bir regresyon önlendi:* kartın kapısı puana bağlıydı
     (`invitePointsTotal > 0`), yani B2B'de ya da puan yazılmayan turlarda kart hiç çizilmiyordu —
     kalbi olduğu gibi içine taşımak o hâllerde ekranı BOŞ bırakırdı.
  2. **"Kart görmek istemiyorum, sayfa bütünleşik olsun"** (15.08). Kutu tamamen kalktı: zemin,
     çerçeve, gölge, −2° eğim gitti; blok ekranın kalan yüksekliğini doldurup içeriği dikey
     ortalıyor (`contentFill` yalnız sonuç aşamasında eklenir — öteki aşamalarda zorlanan yükseklik
     boşluk üretirdi). Hiyerarşi artık kutuyla değil ölçek ve boşlukla.
  3. **"Görsel daha da büyütülebilir, farklı bir görsel de seçilebilir"** (15.08, ekran
     görüntüsünden sonra). Ölçüm: daire 88 → 148'e büyütülünce `olive-bg` kum zeminde **leke** gibi
     okundu, kalp de boş bir halkanın ortasında kaldı — düşük karşıtlık ölçek büyüdükçe kusura
     döndü. Seçenekler sunuldu, kullanıcı **puan yıldızı**nı seçti.

  **Sonuç:** daire ve kalp kalktı; yerine **`✦` puan yıldızı** (terracotta, 120 dp) doğrudan
  sayfanın zemini üstünde. Gerekçe yalnız görsel değil ANLAMSAL: kalp "beğeni" der, oysa anın
  konusu PUAN — ve `✦` uygulamanın puan dilinin kendisidir (hesap kartı `✦ 10`, sonuç satırı
  `✦ +15 puan`). İşaret artık yanındaki metinlerle aynı şeyi söylüyor.
  Geometri `feedback-icons.tsx`e, o dosyanın kendi künyesindeki gerekçeyle eklendi (ikon
  sözlükleri bu etapta yazıya kapalı); kenarlar merkeze doğru içbükey — dolu bir eşkenar dörtgen
  büyük ölçekte ağır dururdu.

  **TASARIM KAYNAĞI — açık bir borç.** Yerel `design/project/Mobil - Musteri v3.dc.html`
  **9 Ağustos** tarihli, yani kullanıcının 11.08 kararından ÖNCE; o dosyada kalp ve başlık hâlâ
  kartın dışında, yani **eski kod tasarımla birebir uyuyordu** — sorun uygulamada değil tasarımdaydı.
  `claude_design` MCP bu oturumda bağlı değildi, güncel sürüm çekilemedi. Yerleşim kullanıcının
  kendi cümlelerinden türetildi ve yeni bir görsel dil icat edilmedi (mevcut token'lar, mevcut ikon
  deseni). **Tasarım dosyası bu üç turun sonucuyla güncellenmeli.**

  **Doğrulama:** `tsc` temiz · `eslint` temiz · `jest src/screens/{feedback,discover}` **4 dosya /
  25 test** (`HeartIcon` keşif ekranında kullanılmaya devam ediyor, ihracı korundu) · cihazda
  üç turun üçü de görüldü ve ekran görüntüleri kullanıcıya sunuldu.
  **Puanlı hâl cihazda ÖLÇÜLMEDİ** — görüntülemek daveti tamamlamayı, yani deftere puan yazmayı
  gerektiriyor; kod ve testlerle doğrulandı. *(Bu boşluk `(21.59)`da kapandı: aynı blok keşif
  turunun bitişine de konuldu ve orada puanlı hâl cihazda görüldü.)*

- [x] (21.59) **HER PUAN KAZANIMI ARTIK AYNI ŞEYİ SÖYLÜYOR — kazanılan + güncel toplam (kullanıcı isteği 15.08)**
  `touches:` `apps/mobile/src/screens/customer-kit/points-award.tsx` ·
  `apps/mobile/src/screens/customer-kit/points-award-messages.json` ·
  `apps/mobile/src/components/ui/empty-state.tsx` ·
  `apps/mobile/src/screens/{feedback,discover}/**` ·
  `packages/types/src/contracts/discover-api.schema.ts` ·
  `packages/application/src/feedback/discover.ts`

  **İstek:** *"bu bir puan alma durumuysa ne kadar kazandığı, sonra mevcut puanın ne olduğu —
  her puan kazanma durumunun sonucunda aynı sayfayı göstermek lazım."*

  **ÖLÇÜM ÖNCE, MÜDAHALE SONRA.** Puan sistemi uçtan uca okundu (motor · uygulama katmanı · uçlar ·
  üç ekran · web karşılığı) ve tablo şu çıktı: `visit` (10) sessiz — bilinçli (karar 11.08);
  `feedback_candidate` (2) keşif bitişinde **yalnız kazanılanı** yazıyor; `feedback_purchase`/
  `review` (5/20) teşekkür sayfasında kazanılan + **toplam** yazıyor; `referral` (500) ve
  `neighbor` (100) **hiçbir yerde görünmüyor**. Yani "aynı sayfa" diye bir şey yoktu: iki ayrı
  biçim, iki ayrı metin kümesi, iki sessiz yol.

  **Yapılan üç şey:**
  1. **Blok kite terfi etti** — `customer-kit/points-award.tsx` (`PointsAward` + `PointsSpark`).
     Kazanan biçim teşekkür sayfasınınkiydi ve bu zevk kararı değil: kullanıcı onu `(21.58)`de üç
     tur döndürerek onayladı. Keşif bitişindeki tek satırlık hap çip ve 88'lik solgun daire kalktı.
  2. **Sözleşme büyüdü** — `DiscoverSwipeSchema.balance`. Bakiye ekranda HESAPLANAMAZ ("açılıştaki
     bakiye + bu turda kazanılan" defterle ayrışır: ziyaret puanı sessizce yazılıyor, davet ödülü
     o sırada doğabilir, müşteri kupona çevirmiş olabilir). Tur sonunda `/me/points`e gitmek yerine
     her oy cevabında taşınıyor: o uç kart+kupon+kural okuyor ve davet kodu ÜRETİYOR — bakiye
     öğrenmek için tetiklenecek bir yan etki değil.
  3. **Not satırı bağlamı bıraktı** — *"bu değerlendirme için hesabınıza eklendi"* →
     *"hesabınıza eklendi"*. Ortak blokta bağlam cümlesi taşımak ikiliği geri getirirdi; bağlamı
     zaten üstteki başlık söylüyor.

  **DÖRDÜNCÜ ŞEY, ve bir KURAL olarak yazıldı — ekran görüntüsünden sonra geldi.** Kullanıcı ilk
  çekimi görünce: *"sayfa ortada olsun, içerik ortada olsun. Çünkü biz puan verdiğimiz zaman ekran
  ortalanıyor — ekranın ortasında bir puan verme sayfası varken bu bir TASARIM DESENİDİR, bunu
  takip etmek lazım."* Yani `(21.58)`de tek bir ekran için verilmiş görünen karar aslında puan
  kazanma anının kuralıymış. Kural künye olarak `points-award.tsx`e yazıldı: kazanımı gösteren her
  ekran içeriği dikeyde ortalar. Blok bunu kendi içinde YAPAMAZ — ortalanan şey blok değil SAYFA
  (başlık, gövde, düğme dahil), o yüzden her yüzey kendi kaydırma kabına uygular.

  **BEŞİNCİ ŞEY — aynı kusur BOŞ HÂLDE de görüldü, ama bileşene gömülmedi.** Kullanıcı cihazdan
  o an açık olan ekranı istedi; gelen görüntü kazanım sayfası değil *"değerlendirecek yenilik yok"*
  boş hâliydi (deste tükenmişti) ve o da üst üçte birde toplanmıştı. `EmptyState` **20 yerde**
  kullanılıyor ve hepsi tam ekran DEĞİL — kataloğun "sonuç yok"u bir listenin içinde, hesabın
  misafir bloğu kaydırılan sayfanın ortasında. Bileşene ortalama gömmek onları da bozardı.
  Bunun yerine **isteğe bağlı `fill` kapısı** açıldı (varsayılan kapalı) ve yalnız keşfin iki
  tam-ekran hâli (boş + hata) açtı. Kalan 18 çağrı yeri **bilerek dokunulmadı**: görülmeden
  değiştirilmiş bir yerleşim, düzelttiğinden fazlasını bozar. Cihazda ölçüldü 17:33 — üst ve alt
  nefes eşit.

  **Doğrulama:** `tsc` temiz (dokunulan beş paket) · `eslint` temiz · `knip` yeni ölü kod
  görmüyor · `jest src/screens/{feedback,discover}` **4 dosya / 25 test** · **cihazda ölçüldü
  16:57** — 4 kart oylandı, ekran `✦ +8 puan` · `hesabınıza eklendi` · `Toplam ✦ 18 puan` yazdı
  (8 = 4×2 oy, 18 = 8 + o günün ziyaret puanı 10); bekleme hâli de görüldü.
  **Ortalanmış hâl AYRICA ölçüldü 17:24** — ilk çekimde ortalama henüz yoktu ve deste tükenmişti
  (oylanan aday deste dışına düşer), o yüzden cihazda görülemiyordu. Turun kendi yazdığı dört
  `product_feedback` satırı silinip deste yenilendi ve tur tekrarlandı: `✦ +8 puan` ·
  `Toplam ✦ 26 puan` (26 = önceki 18 + yeni tur 8 — satırlar yeni kimlikle doğduğu için puan
  ikinci kez yazıldı, yerel veri zaten sahte). Üst ve alt nefes eşitlendi.

  **AÇIK KALAN, ve bu görevin kapsamı DEĞİL:** `referral`/`neighbor` başkasının eylemiyle doğuyor —
  müşteri o an uygulamada değil, gösterilecek bir sonuç sayfası yok. En büyük iki ödül bu yüzden
  hâlâ görünmez; cevapları **puan geçmişi** (sıradaki iş) ve bildirimdir. `BEKLEYEN(MB-18)`.

- [x] (21.60) **PUAN GEÇMİŞİ — "hangi puan nereden geldi" (MB-59 · kullanıcı isteği 15.08)**
  `touches:` `packages/types/src/contracts/points-api.schema.ts` ·
  `packages/application/src/customer/points.ts` · `apps/mobile-api/src/api/v1/points.ts` ·
  `apps/mobile/src/screens/points-history/**` · `apps/mobile/src/app/points-history.tsx` ·
  `apps/mobile/src/screens/account/**` · `apps/mobile/src/lib/api/points.ts`

  **Neden bir süsleme değil:** `(21.59)`un ölçümü şunu bıraktı — `referral` (500) ve `neighbor`
  (100) **başkasının** eylemiyle doğuyor (davet edilen kişi parasını ödediğinde) ve müşteri o an
  uygulamada değil, yani gösterilecek bir "sonuç sayfası" YOK. Programın en değerli iki ödülü
  hiçbir yerde görünmüyordu. Günlük ziyaret puanı da bilinçli sessiz (karar 11.08). Üçünün de
  müşteriye görünür olduğu ilk yer bu ekran.

  **Terfi, kopya değil.** `feedback/points.ts` künyesi puan geçmişi okumalarını bilerek dışarıda
  bırakmıştı: *"bugün tek yüzeyleri var; ikinci yüzeyleri doğduğu gün AYNI yoldan buraya
  taşınırlar."* Doğdu → `readCustomerPointsHistory` uygulama katmanına taşındı.

  **Üç karar:**
  1. **Sebep kümesi TAM** (`PointsReasonEnum`), kazanma yolları kümesi değil: geçmiş "program neyle
     ödüllendirir" sorusunu değil "defterde ne var" sorusunu yanıtlıyor — `redemption`, `manual` ve
     artık yazılmayan `order` da listede. Cümleler ekranda kurulur, `Record` derlemede tam kapsam
     ister (defter yeni bir sebep öğrenirse ekran DERLENMEZ, eksik çizmez).
  2. **Ayrı ekran, kart içi liste değil:** defter veriyle sınırsız büyüyor ve sonsuz kaydırma
     istiyor; karta koymak hesap ekranını her açılışta defter okumaya mecbur ederdi. Kart bir ÖZET,
     geçmiş bir ARŞİV. Kapı yine de kartın İÇİNDE — B2B ölçütü ikinci kez yazılmasın diye.
  3. **B2B adlı retle düşer** (403 `not_eligible`), boş sayfayla değil: boş liste "hiç hareketiniz
     yok" der, doğrusu "bu program size açık değil" (CLAUDE §1). Ölçüt kartınkiyle AYNI kapıdan
     (`isOutsideProgram`).

  **Dışarıda bırakılanlar ve gerekçesi:** `note` (yalnız `manual`da dolu ve PERSONELİN gerekçesi —
  müşteriye gösterilmek üzere yazılmadı) · `refId` (iç kimlik, açılabilecek bir şeye işaret etmiyor)
  · `createdBy` (personel kimliği).

  **DÖRDÜNCÜ KARAR — ekran görüntüsünden sonra geldi (kullanıcı isteği 15.08):** *"bu lezzet
  oylarının hepsi teker teker değil de birleşik gelse olmaz mı?"* İlk çekimde bir keşif turu
  DOKUZ satır üretiyordu ve sekizi özdeşti ("Yeni lezzet oyu · 15 Ağu 2026 · +2") — satırları
  ayıran hiçbir şey yoktu, çünkü oyun hangi ürüne verildiği zaten gösterilmiyor (`refId` bilerek
  dışarıda). Özdeş satırlar bilgi değil GÜRÜLTÜ ve arşivde asıl aranan şeyi (davet ödülü, kupona
  çevirme) aşağı itiyor.
  Birleştirme **ÇİZİMDE**, defterde değil (`points-history-group.ts`): defterdeki tekillik
  `(müşteri, sebep, kaynak)` üçlüsünde ve "aynı ürüne bir kez puan" kuralı oradan geliyor.
  Ölçüt sebep DEĞİL ayırt edilebilirlik — "şu sebepler birleşsin" listesi tutulmuyor; ekranda özdeş
  görünen satırlar hangi sebepten olursa olsun tek satır. Grup anahtarı ham damga değil **ekrana
  yazılan tarih**, ki cihaz ve sunucu saat dilimi ayrıştığında "aynı gün yazıyor ama ayrı gruplar"
  tuhaflığı doğmasın. Bilinen sınır: sayfa sınırına düşen grubun sayacı sonraki sayfayla büyür
  (künyede yazılı) — tamamlanmamış bir sayıdır, yanlış değil.
  **Cihazda ölçüldü 18:02:** dokuz satır ikiye indi — *"8 hareket · +16"* ve *"+10"*, toplam yine 26.

  **Doğrulama:** `tsc` · `eslint` · `knip` temiz · `jest src/screens/account` 2 dosya / 10 test ·
  **cihazda ölçüldü 17:51** — 8 × "Yeni lezzet oyu" (+2) + "Günlük giriş" (+10) = **26**, hesap
  kartındaki bakiyenin aynısı; hesaptaki "Puan geçmişim" bağlantısı da ekranı açıyor.
  **Ölçülemeyenler:** boş · misafir · B2B · hata dalları ve sonsuz kaydırmanın ikinci sayfası —
  yerelde tek B2C hesap ve tek sayfalık defter var. `BEKLEYEN(MB-18)`.

- [x] (21.61) **GİRİŞTE KÜNYE SORULMUYOR — ad ve telefon İLK SİPARİŞTE, gerekçesiyle (kullanıcı kararı 15.08)**
  `touches:` `apps/mobile/src/screens/login/**` · `apps/mobile/src/app/cart.tsx` ·
  `apps/mobile/src/screens/checkout/**` · `apps/mobile/src/screens/customer-kit/profile-gaps.ts`

  **İstek iki cümleydi:** *"kullanıcı adresini ve adını vermek istemeyebilir giriş yaptığında, bu
  da bizim için problem olmamalı"* + *"bunu ilk sipariş verdiği zaman talep edelim… siparişlerinizi
  size ulaştırabilmek, sizinle iletişime geçebilmek için telefon numaranıza ihtiyacımız var gibi
  bir şey diyerekten konuyu açalım."*

  **Kaldırılan:** `useProfileSetupGate` (dosya SİLİNDİ) ve `hasProfileGap` — üç kapı birden
  (OTP dönüşü · OAuth dönüşü · sepete giriş). Gerekçe ürünün kendisinde: kimliğini yeni kuran
  kişiden, ona daha hiçbir şey vermeden künye istemek bir bedeldir.

  **Eklenen:** ödeme ekranının **İletişim** bölümü — en üstte, gerekçesiyle açılıyor, ve YALNIZ
  eksik olan alanı çiziyor (adı varsa ad sorulmuyor; ikinci siparişte bölüm hiç görünmüyor).
  Kullanıcı kararı: telefon **zorunlu** (numarasız kurye kapıda ulaşamaz), ad da aynı yoldan.
  Yazım AYRI bir adım, sipariş gönderimine iliştirilmedi: `updateMe`nin adlı retleri (`phone_invalid`,
  `phone_taken`) künyenin sorunudur — tek çağrıda birleşseydi geçersiz bir telefon *"siparişiniz
  açılamadı"* diye görünürdü.

  **`profile-gaps` KİTE taşındı:** kapının iç ölçütüydü, artık iki ekranın (ödeme + künye akışı)
  ortak kuralı.

  **CİHAZDA AÇIĞA ÇIKAN ESKİ KUSUR — ve düzeltildi.** Ödeme ekranının "hangi hesapla buradasın"
  şeridi `✓ {name}` basıyordu; OTP ile açılan hesapta ad BOŞ DİZGEDİR, yani ekranda çıplak bir
  `✓ ` kalıyordu (cihazda görüldü 16.08). Kusur eskiydi ama GÖRÜNMEZDİ — künye kapısı adsız
  müşteriyi ödeme ekranına hiç bırakmıyordu. Sıra artık ad → e-posta → adsız cümle
  (`signedInAnon`); boş bir işaret müşteriye hiçbir şey söylemez.

  **CİHAZDA UÇTAN UCA ÖLÇÜLDÜ (16.08), gerçek akışla:** çıkış → künyesiz yeni hesapla OTP girişi →
  **`/profile-setup` AÇILMADI**, doğrudan hesap ekranı · sepete ürün eklendi, **sepet de kapı
  çıkarmadı** · ödeme ekranında bölüm gerekçesiyle çizildi, iki alan da boş, düğme KAPALI ·
  dolduruldu, kaydedildi → veritabanında `Test Kullanici` / `+33612009988`, bölüm kapandı, şerit
  `✓ Test Kullanici` oldu, engel sıradaki sebebe (adres) geçti. Test hesabı uygulamadan silindi
  (DB'de 0 satır), cihaz kullanıcının hesabına geri döndürüldü.

  **AÇIK:** `/profile-setup` ekranı artık hiçbir yerden erişilemiyor (kapıları söküldü, ekran
  duruyor). Silinmedi — kullanıcının kararı bekleniyor. `BEKLEYEN(21.61)`.

- [x] (21.62) **BOŞ HÂLLER ORTALANDI, İKON BÜYÜDÜ, HEADER KURALI YAZIYA GEÇTİ (kullanıcı turu 16.08)**
  `touches:` `apps/mobile/src/components/ui/empty-state.tsx` · `apps/mobile/src/theme/metrics.ts` ·
  `apps/mobile/src/screens/{orders,points-history,cart,invite,neighbor,catalog,packages-list,recipes-list,professionals,delivery-zones,home,support}/**` ·
  `design/KARARLAR.md`

  **Kullanıcı dört ekran görüntüsü aldırdı** (sepet · siparişler · talepler · yeni talep çekmecesi)
  ve sordu: *"Bu kadar header farklılığı neden var? Hangi header hangi sayfada doğru seçim?"*

  **ÖLÇÜM BEKLENENİN TERSİNİ SÖYLEDİ.** Üç header de `.dc` tasarımının kendi kararı — sapma YOK
  (sepet 449, siparişler 686, talepler 1028). Boş hâlin ortalanmaması, 44'lük ikon ve geri okunun
  hizasızlığı da tasarımın kendisi. Yani düzeltmek "implementi tasarıma uydurmak" değil, **tasarımı
  değiştirmek**ti — ve kullanıcı onayladı. Eksik olan tek şey **yazılı kuraldı**: bedeli ölçüldü,
  `(21.60)` puan geçmişi yazılırken bakacak kural olmadığı için DÖRDÜNCÜ bir varyant (başlık + alt
  başlık) doğmuştu.

  **Tasarım değişti (3):**
  1. **Boş hâl dikeyde yerleşir** — `EmptyState.fill` varsayılanı `false`tan `true`ya döndü.
     Varsayılanın yönü SAYILARAK belirlendi: **37 kullanımın 32'si tam ekran.** İlk hâlindeki
     "hepsi tam ekran değil" gerekçesi bir tahmindi. Beş istisna (liste boş hâli · kesikli kutu ·
     kaydırma kabı içi) `fill={false}` ile işaretlendi — unutulan bayrak artık doğru davranışa düşer.

     **İKİNCİ TUR: "ortala" YETMEDİ, %40 oldu (kullanıcı bulgusu, aynı gün).** İlk hâl
     `justifyContent: 'center'`ti ve hesabı doğruydu — blok, BAŞLIĞIN ALTINDA kalan alanın tam
     ortasındaydı. Ama göz o alana değil SAYFAYA bakıyor: ölçüldü, blok merkezi **1170**, sayfa
     merkezi **1000** (900×2000 ölçeğinde). Kullanıcı *"sayfanın ortasının aşağısına denk geliyor
     ve kötü bir görüntü oluşturuyor"* dedi ve haklıydı — iki sapma aynı yöne biniyordu: başlığın
     yüksekliği bloğu yarısı kadar aşağı itiyor, ve optik merkez zaten geometrik merkezin biraz
     ÜSTÜNDEDİR (göz tam ortadaki öğeyi "aşağı kaymış" görür).
     Çare SABİT bir kaydırma olamazdı: başlık boyu ekrandan ekrana değişiyor (sayfa başlığı ~200 dp,
     sıkışık satır ~60 dp) ve sabit sayı birini düzeltip ötekini bozardı. Blok artık kalan boşluğu
     **4:6** paylaştıran iki esnek payın arasında — üstte %40, altta %60; oran kendini ayarlıyor.
     **Ölçülen sonuç:** sepette merkez 1095 → **987** (sayfa merkezi 1000, yani 13 px yukarıda).
  2. **Boş hâl ikonu 44 → 80.** 120 kahraman ölçüsüdür (puan yıldızı) ve bilerek ayrı tutuldu.
     Vitrinin dairesindeki dekoratif ikon `decorIcon: 44` diye AYRILDI — iki kavram bir sayıyı
     paylaşıyordu, ayrım sayı değil ANLAM.
  3. **Geri okunun payı −8 → −16.** Daire 40 dp, glif ortalı, yani glifin sol kenarı 16 içeride;
     −8 ile başlığın 8 dp sağında kalıyordu. Yalnız DİKEY header'larda (ok başlığın üstünde);
     tariflerde ok başlığın yanında, orada dokunulmadı.

  **Bizim sapmamız düzeltildi (1):** boş hâl düğmeleri. Tasarımın iki biçimi var — boş hâl çağrısı
  **hap** (`radius:22`), form/seçim eylemi **blok** (`radius:16` + sert gölge). 10 düğme blok
  çiziyordu (siparişler 1 · davet 4 · komşu 5), hapa çevrildi. *(İlk kaba sayımım 17 demişti; blok
  sınırını doğru kapatan bir ölçümle 10 çıktı — kaba grep'e güvenilmedi.)*

  **KURAL YAZILDI** — `design/KARARLAR.md`, "üç header" kaydı. Ölçüt *"kaydırırken erişilebilir
  kalması gereken bir eylem var mı"*: sayfa başlığı (eylemsiz bölüm girişi) · sıkışık satır (eylem
  altta yapışkan barda) · yapışkan çubuk (eylem üstte). Puan geçmişi kurala uyduruldu: alt başlık
  kalktı, yerine `HESABIM` eyebrow'u geldi — siparişlerle birebir.

  **BİR ÖNERİM YANLIŞTI VE UYGULAMADAN ÖNCE FARK EDİLDİ.** "Yeni talep tam sayfaya dönsün" demiştim
  (tasarım öyle çiziyor); dosyanın künyesi bunun **kullanıcının 09.08 kararı** olduğunu söylüyor —
  *"talep yazmak, taleplerin listesinin İÇİNDEN yapılan bir eylemdir"*. Bilinçli sapma; geri
  alınmadı. Çekmecedeki çift başlık ise gerçekti ve metin değişikliğiyle kapandı: anlatım adımının
  başlığı *"Bize anlatın"* → *"Ne oldu?"* (çekmecenin başlığı zaten *"Bize yazın"*).

  **Doğrulama:** `tsc` · `eslint` · `knip` temiz · **84 dosya / 599 test** · cihazda üç ekran da
  görüldü (sepet · siparişler · puan geçmişi): ortalı, ikon 80, düğme hap, ok başlıkla hizalı.
  **`.dc` dosyası bu turun sonucunu taşımıyor** — tasarım turunda güncellenmeli, kayıt `KARARLAR`da.

- [x] (21.63) **YAPIŞKAN DİL KAYDI — cihaz Türkçe, uygulama Fransızca (kullanıcı bulgusu 16.08)**
  `touches:` `apps/mobile/src/lib/i18n/app-locale.ts` · `apps/mobile/src/lib/auth/sign-out.ts`

  Kullanıcı sordu: *"Fiziksel cihazın dili uygulama ilk açıldığında otomatik seçiliyor mu? Şu an
  Fransızca fakat neden Fransızca bilmiyorum — besleme dosyasında mı varsayılan Fransızca?"*

  **ÖLÇÜLDÜ, ÜÇ HALKA AYRI AYRI:**
  · **Cihaz yolu SAĞLAM.** Telefon `persist.sys.locale = tr-TR`; `deviceLocale()` → `getLocales()` →
    expo-localization Android'de `LocaleListCompat.getDefault()`, yani SİSTEMİN listesi (uygulama
    kaynaklarına süzülmüş hâli değil) → `tr`. Otomatik seçim çalışıyor.
  · **Besleme DEĞİL.** Kullanıcının kartı seed'in değil: seed profilleri `07:36:30`, onunki
    `07:54:02` ve `provider = email` (OTP). *Ama* `fr` üç yerde birden varsayılan — şemada
    `not null default 'fr'`, `DEFAULT_LOCALE`, seed'de `?? 'fr'`.
  · **SEBEP: kartın dili.** `user_profiles.preferred_language = 'fr'`, ve `use-me.hook` her `/me`
    okumasında `applyProfileLocale`la cihazın Türkçesini eziyor (09.08 önceliği — doğru davranış).

  **ASIL KUSUR bir alt katmandaydı ve döngüseldi:** yerel kayıt ÇIPLAK bir dil dizgesiydi, yani
  *kullanıcının seçimi* ile *kartın önbelleği* aynı gözde duruyordu. Çıkış yalnız oturum anahtarını
  siliyordu (`clearStoredSession`), dil kalıyordu; sonraki YENİ kart açılırken uygulama o değeri
  gönderiyor ve sunucu onu tohumluyordu (`seedPreferredLanguage`). Sonuç: Fransızcaya bir kez değen
  cihaz, telefonu Türkçe olsa ve kullanıcı Fransızcayı hiç seçmemiş olsa bile sonsuza dek Fransızca
  hesap açıyordu — tek çare uygulamayı silip kurmaktı. *(Cihazdaki `lezzet.locale` kaydının VARLIĞI
  görüldü; DEĞERİ okunamadı — SecureStore AES şifreli. O halka ölçüm değil, çıkarımdır.)*

  **Çare — kayıt kaynağını da taşıyor:** `{ locale, source: 'user' | 'profile' }`. `user` seçimdir,
  cihazın malıdır, çıkışta durur; `profile` yansımadır, çıkışta düşer (`forgetAccountLocale`, tek
  kapı — hesap silme de `signOut`tan geçtiği için o akış da kapsanıyor). Okuma sırası DEĞİŞMEDİ.
  Eski çıplak kayıt `profile` sayılır: cihazlarda duran değer zaten atılması gereken yapışkan
  değerdir. Değer aynıysa kaynak KORUNUR — kullanıcı `fr` seçtiyse kartın `fr` demesi o seçimi
  önbelleğe çevirmez.

  **Doğrulama:** `tsc` · `eslint` temiz · **84 dosya / 599 test** yeşil (`sign-out.test.ts` dahil).
  Kullanıcının kendi kartı DB'den değil, Hesabım ekranından düzeltilecek (onun kararı) —
  gerçek akış da böylece sınanmış olur.

- [x] (21.64) **KATALOGDA KOLEKSİYON KESİTİ — bant + çarpı (kullanıcı isteği 16.08)**
  `touches:` `packages/types/src/contracts/catalog-api.schema.ts` · `apps/mobile-api/src/api/v1/catalog.ts` ·
  `apps/mobile/src/lib/api/catalog.ts` · `apps/mobile/src/screens/catalog/**` ·
  `apps/mobile/src/app/(tabs)/catalog.tsx` · `apps/mobile/src/screens/home/home-screen.tsx`

  Kullanıcı: *"Kategorilerde süzme var ama koleksiyonlarda yok. Koleksiyon üzerinden gelindiyse
  süzme satırına bir bant gelsin, çarpıya basılınca koleksiyon süzgeci iptal olsun."* Açık zaten
  kayıtlıydı: koleksiyon bandı kataloğun KÖKÜNE gidiyordu, yani müşteri "Bayram Sofrası"na basıp
  116 ürünün tamamını görüyordu (`BEKLEYEN(21.14)`, o işaret kaldırıldı).

  **İŞ KURALI YAZILMADI — ortak okuma zaten biliyordu.** `getCatalogData` `collectionSlug` alıp
  `activeCollection`ı çözüyor ve sorguya `collectionId` süzgeci koyuyor (web bunu kullanıyor).
  Eksik olan tek şey mobil ucun parametreyi geçirmesiydi. Koordinasyon defterindeki (08.08) *"gömülü
  ilişkiyle yazmayın, `ids`e çözün"* uyarısı ARTIK GEÇERSİZ: `productSelect` koşullu `!inner`
  kuruyor, ölçüm de bunu doğruluyor (131 değil 24).

  **Tasarımda karar YOKTU** (mobil `.dc` dosyalarının hiçbirinde "koleksiyon" geçmiyor) ve web
  farklı çözmüş: orada koleksiyon sayfanın BAŞLIĞI olur, kategori şeridi tamamen gizlenir.
  Kullanıcıya iki seçenek sunuldu, **bant seçildi** (16.08): mobilde sayfa başlığı alanı yok, çip
  rayı ana gezinme — ve kesit içinde daraltma mümkün kalıyor. Uç ikisini AND'liyor.

  **Ölçüm (uçta, seed sonrası):** süzgeçsiz 116 · `bayram-sofrasi` 24 · `cay-saati` 12 ·
  `l-amour-de-paris` 29. Kesişim gerçek: `bayram-sofrasi`+`tatli` 24, +`firin` 0. Ad üç dilde
  çözülüyor (Çay Saati · L'heure du thé · Teestunde). PASİF koleksiyon (`yilbasi-sofrasi`) ve
  tanınmayan slug 400 `unknown_collection` — kategorinin kuralıyla aynı, gerekçesi uçta yazılı.

  **CİHAZDA BİR ARIZA YAKALANDI VE DÜZELTİLDİ (aynı gün).** Banda bas → kesit açılır → çarpıyla
  kapat → vitrine dön → **AYNI banda bas → hiçbir şey olmuyordu.** Sebep parametre değil ETKİYDİ:
  sekme mount kalıyor, etkinin tek bağımlılığı olan değer `'bayram-sofrasi'` → `'bayram-sofrasi'`
  "değişmediği" için hiç koşmuyordu. Kanıt: farklı slug (`cay-saati`) aynı an çalıştı. Çare
  parametreyi uygulandığı anda `setParams`la SİLMEK — istek tek seferlik bir mesajdır, okununca
  tüketilir. **Aynı arıza kategoride de vardı** ("Fırın" bandına basıp çipi "Tümü"ye çekince o
  banda ikinci basış işe yaramıyordu) ve aynı satırda kapandı.

  **Doğrulama:** `tsc` · `eslint` temiz · **84 dosya / 599 test** yeşil · cihazda üç tur
  (aç → çarpı → aynı slugla tekrar aç) ölçüldü. Ölçüm ortasında başka bir şerit `db:refresh`
  çalıştırdı (`collection` 5 → 0 → 5); ilk turun sayıları seed dönünce birebir tekrarlandı.

- [x] (21.65) **KEŞİF DESTESİNİN GEÇİŞİ — altı kusur, ve bir ölçüm dersi (kullanıcı turu 16.08)**
  `touches:` `apps/mobile/src/screens/discover/discover-screen.tsx`

  Kullanıcı: *"beğenme işlemi bittiği anda araya bir resim giriyor sonra arkadan görünen resim
  yeniden geliyor"*, sonra *"o göz kırpması devam ediyor"*. Tek bir arıza gibi görünen şey **altı
  ayrı kusurdu**; her tur bir tanesini açığa çıkardı, çünkü öndeki kusur arkadakini gizliyordu.
  Ölçüm için `exitMs` geçici olarak 2200/800 ms'ye çekildi ve `adb exec-out screencap` ile kare
  yakalandı (cihazda `screenrecord` yok; `uiautomator dump` ~0,5 sn, 330 ms'lik uçuş için kör).

  1. **Eski kart merkeze dönüyordu** — oy yazılırken `dragX` sıfırlanıyordu, kart uçarken bir kare
     merkeze atlıyordu. Sıfırlama uçuşun BİTİŞİNE alındı.
  2. **Öne geçen kart zıplıyordu** — arkadaki kart 30 px aşağıda, %94 ölçekte, %55 tülün altında
     duruyor; öne geçince üçü birden ANİMASYONSUZ sıfırlanıyordu. Kart artık kendi derinliğini
     paylaşılan bir değerde tutuyor ve `withTiming` ile yeni derinliğine gidiyor (`DeckLayer`).
  3. **Fotoğraf yeniden yükleniyordu** — üstteki ve arkadaki kart ayrı JSX yuvalarındaydı, derinlik
     değişince React elemanı sökülmüş sayıyordu. Tek listeye ve `key={productId}`ye geçildi.
  4. **Uçuş bırakma anında değil, React commit'inden sonra başlıyordu** (*"bıraktığım yerde birkaç
     saniye bekliyor"*). Kullanıcının kendi teşhisi yol gösterdi: *"aşağıdaki buton kullanıldığı
     zaman çok akıcı"* — düğme yolu JS'te başlıyordu, jest yolu ise bir thread gidiş-dönüşü
     bekliyordu. Artık iki kapı da uçuşu KENDİ thread'inde başlatıyor; üstteki kart uçtuğunu
     `flyingId` paylaşılan kimliğinden anlıyor, React'in haberini beklemiyor.
  5. **Yeni kart "İSTERİM" rozetiyle doğuyordu** — rozet kapısı bir React değeriydi (`exiting`), o
     da worklet'in kapanışında bir kare bayat kalıyordu. Kapı paylaşılan `locked`a çevrildi.
  6. **Uçan kart öne geçen kartın ALTINDA çiziliyordu** — kendi katmanına `zIndex: 3` verildi.

  **ÖLÇÜM DERSİ — bu ekran sıcak yeniden yüklemeyle DOĞRULANMAZ.** Aralarda "kaydırdım, deste
  taşlaştı" diye bir arıza bildirdim, dört ayrı düzeltme denedim ve **çalışan bir değişikliği
  bozuk sanıp geri aldım.** Kullanıcı komple yeniden başlatma isteyince gerçek çıktı: Metro sıcak
  yeniden yükleme yaptığında UÇMAKTA olan `withTiming` ölüyor, ama React durumu ayakta kalıyor —
  `exiting` dolu, `locked` 1, kilidi açacak tamamlanma çağrısı hiç gelmiyor. Kod hiç sebep
  olmamıştı. İkinci hata bendeydi: her turu TEK kaydırmayla doğruluyordum, kilit ancak İKİNCİ
  kaydırmada görünüyor. Kural yazıldı ve dosyanın künyesine geçti: **komple yeniden başlatma + en
  az beş ardışık kaydırma.** `BEKLEYEN(21.65)` işareti (o zaman "sebebi ölçülemedi" diye
  bırakılmıştı) bu ölçümle kapandı ve kaldırıldı.

  **Doğrulama (komple yeniden başlatılmış uygulamada):** 6 ardışık kaydırma 1/20 → 7/20, kilit her
  turda açıldı · beğen düğmesi 7/20 → 8/20 · geri al 8/20 → 7/20 · `logcat -s ReactNativeJS:V`
  yalnız `Running "main"`, sıfır hata · `tsc` · `eslint` temiz · **84 dosya / 599 test** yeşil.

  *Durum:* Deste ölçüm için 20 aday ürünle koşuldu (yerel DB'de `status='candidate'`); bu seed'de
  yazılı DEĞİL, `db:refresh` 4 adaya döndürür. Ölçümün kendisini etkilemez — kusurların hiçbiri
  aday sayısına bağlı değil.

- [x] (21.66) **TİTREŞİM (haptik) — niyet sözlüğü, tek kapı, kritik anlar (kullanıcı isteği 16.08)**
  `touches:` `apps/mobile/src/lib/haptics/**` · `apps/mobile/src/lib/toast/toast-store.ts` ·
  `apps/mobile/src/screens/**` (toast çağrı yerleri + checkout · discover · account · otp kancası) ·
  `apps/mobile/package.json`

  Kullanıcı: *"Her yerde olsun istemiyorum ama kritik yerlerde olsun. Kullanıcının bir feedback
  bekleyeceği senaryolarda kullanılmalı."* Üç karar kullanıcıya soruldu ve alındı (16.08):
  kapsam **müşteri + operasyon**, toast **tiplensin**, uygulama içi kapatma anahtarı **şimdilik
  yok** (iOS zaten sistem ayarına ve düşük güç moduna uyuyor; ikinci bir anahtar "neden titremiyor"
  sorusunu ikiye bölerdi).

  **Kütüphane:** `expo-haptics ~57.0.1` (`npx expo install`). Android'de `VIBRATE` izni otomatik.
  **YEREL MODÜL** — dev client yeniden derlenmeden çalışmaz.

  **TEK KAPI, ve sözlük NİYET (`lib/haptics/haptics.ts`).** Ekranlar `Haptics.*`ı doğrudan
  çağırmaz: `hapticSuccess` · `hapticError` · `hapticWarning` · `hapticCommit` · `hapticSelect`.
  Gerekçe dosyanın künyesinde: şiddet ekran ekran seçilirse uygulama altı ayda tutarsızlaşır ve
  kullanıcı titreşimden anlam çıkaramaz olur. Kapatma anahtarı ya da Android'e özgü desen
  gerekirse değişecek yer tek dosya.

  **TOAST TİPLENDİ.** `publishToast` kalktı; yerine `toastSuccess` · `toastError` · `toastInfo`.
  22 çağrı yeri tek tek sınıflandırıldı. Sebep ölçümden geldi: toast basılan an, tanımı gereği
  kullanıcının SONUÇ BEKLEDİĞİ andır — uygulamanın en doğal geri bildirim kanalı orasıydı ve
  tipsizdi. Titreşim yayın anında, host'ta DEĞİL: host yeniden çizilebilir, titreşim ise bir
  olaydır ve iki kez olmamalıdır.

  **OPERASYONDA ORTAK DESEN BULUNDU — sekiz kanca tek satırla bağlandı.** Depo ve kuryenin
  sekiz kancasının hepsi zaten aynı `{ tone: 'ok' | 'warn' | 'error' | 'info' }` sözlüğünü
  kuruyormuş; eksik olan yalnız o dilin dokunsal karşılığıydı. Sekize ayrı çağrı yazmak aynı
  kararın sekiz kopyası olurdu (CLAUDE §1), o yüzden `useState`in yerine geçen `useNotice`
  (`lib/haptics/use-notice.hook.ts`) yazıldı: kural kancanın KURULUŞUNDA duruyor, dokuzuncu
  kancayı yazan unutamaz. Operasyonda değeri daha yüksek — depocunun eli kolide, kuryenin
  direksiyonda; "kabul mü ret mi" cevabını görmeden almak burada konfor değil işin kendisi.

  **Titreşen anlar:** ödeme sonucu (oldu · her ret ve arıza) · girişte sunucunun her reddi (yanlış
  kod dahil) · sepete/tarife/pakete ekleme · keşifte kaydırma-düğme kararı ve geri alma (hafif) ·
  hesap silme (oldu · olmadı) · depo ve kuryede kabul, sapma, ret.
  **Sessiz bırakılanlar (gerekçeli):** sekme ve çip geçişleri, aşağı çekip yenileme, biçim
  doğrulaması (geçersiz e-posta — henüz bitmemiş bir yazım, sunucunun reddi değil), ödeme kartını
  müşterinin kendi kapatması (`warm` tonu), keşif turunun bitiş bildirimi (son kartın kararı zaten
  titretti; üstüne ikincisi tek harekete iki cevap olurdu).

  **BİR RİSK ÖLÇÜLDÜ VE KAPATILDI:** `expo-haptics` yerel modül, ve modülü içermeyen bir
  istemcide çağrı `Promise` reddiyle değil DOĞRUDAN FIRLATARAK düşer — `catch` zinciri hiç
  kurulmaz, hata çağırana geçer. Yani paket eklendikten sonra henüz yeniden derlenmemiş bir dev
  client'ta titreşimin yokluğu, bir toast'ı ya da sipariş onayını düşürebilirdi. `fire()` artık
  hem senkron hatayı hem reddi yutuyor; gerekçe dosyada yazılı.

  **Doğrulama:** `tsc` · `eslint` · `knip` temiz · **84 dosya / 599 test** yeşil ·
  **cihazda ölçüldü (Android, OPPO CPH1907):** kullanıcı turu — titreşim çalışıyor ve şiddet
  yerinde (16.08). Yerel modülün gerçekten kurulu olduğunun kanıtı izinde: cihazda
  `android.permission.VIBRATE: granted=true` (bu izni `expo-haptics` otomatik ekliyor).

  **DERLEME NOTLARI — dördü de ÇIKIŞ KODU 0 ile düştü** (yani "başarılı" görünen başarısızlık;
  doğrulama log'dan ve cihazdaki kurulum saatinden yapılmalı):
  - `expo run:android --device` adb SERİ NUMARASINI değil MODEL adını istiyor (`CPH1907`).
  - `expo prebuild --clean`, `android/local.properties`i de siliyor (izlenmeyen yerel dosya) ve
    gradle Android SDK'yı bulamıyor: `sdk.dir=…/Library/Android/sdk` elle geri yazılmalı.
  - `expo run:ios --device` girdiyi KÜÇÜK HARFE çeviriyor; cihaz adı (`AS`) da UDID de bu yüzden
    eşleşmiyordu — asıl sebep cihazın o an bağlı OLMAMASIYDI. Teşhisin doğru aracı
    `xcrun devicectl device info details`: `tunnelState` ve `lastConnectionDate` gerçeği söylüyor
    (`system_profiler SPUSBDataType` bu ortamda hiç çıktı vermiyor — ölçüm aracı olarak kullanılamaz).
  - Temiz prebuild sonrası ilk Android derlemesi **1 sa 11 dk**; iOS simülatör derlemesi 0 hata.

- [x] (21.67) **ASGARİ SEPET UYARISI KARARIN VERİLDİĞİ YERDE (kullanıcı bulgusu 16.08)**
  `touches:` `apps/mobile/src/screens/cart/cart-screen.tsx` · `apps/mobile/src/screens/cart/messages.json` ·
  `apps/mobile/src/screens/product/product-detail-screen.tsx` · `apps/mobile/src/screens/product/messages.json`

  Kullanıcı: *"Sepet hazırken müşteriyi asgari sepet için uyarmıyoruz, ödemeye kalkınca
  uyarıyoruz."* **Ölçüm bunu KISMEN çürüttü ve asıl kusuru gösterdi** (cihazda, OPPO CPH1907):
  uyarı VARDI ve düğmeyi de kilitliyordu — ama kaydırma alanının EN DİBİNDE, kalemlerin ve özet
  tablosunun altında. Tek kalemlik sepette y≈1401/2400 ile görünür; 23 kalemlik sepette ekranın
  çok altında kalıyor. Müşterinin gördüğü tek şey **gerekçesiz kilitli bir düğme** oluyordu.

  Ölçülen ikinci gerçek: **kargo yolunda uyarı ÇIKMAMASI hata değil, kural.** Asgari sepet
  ayarı kanal kapsamlı (`min_basket_cents`); kargoda ayar yoksa varsayılan **0** (`min-basket.ts`),
  kapıya teslimde **4000**. 67400'de 1,84 €'luk sepet gerçekten geçerli, 67000'de değil.

  **İKİ YERE UYARI KONDU (kullanıcı kararı 16.08 — "ikisi birden"):**
  - **Sepet:** yapışkan barın İÇİNDE, kilitli düğmenin hemen üstünde kısa gerekçe
    (`Asgari sepete {missing} eksik`). Sıra anlamlı — satılamayan kalem asgari sepetten ÖNCE
    söylenir (kalem çıkarılınca tutar da değişir); aynı sıra sunucunun `cartBlockReason`ında
    yazılı, mobil o paketi bilmediği için sıra ekranda tekrar ediyor. `unresolved` hâlinde SUSAR:
    ortada engel değil bilinmezlik var.
  - **Ürün ekranı:** ekleme toast'ı eşiğe kalanı yazıyor (`Sepete eklendi ✓ · asgari sepete
    38,16 € kaldı`). **İki kademeli, bilerek:** anlık onay (ve titreşimi) basma anında verilir,
    RAKAM sunucunun cevabı gelince aynı toast'a eklenir — toast deposu tek satır taşıdığı için bu
    ikinci bir bildirim değil, aynı satırın zenginleşmesi (`toastInfo`, yani ikinci titreşim yok).
    Tahmini sayı YAZILMADI: eklenen kalemin hangi gruba düştüğünü bilmeden yapılan hesap yanlış
    rakam gösterirdi — yanlış sayı, hiç sayı olmamasından kötüdür.

  **CİHAZ İKİ GERÇEK HATA YAKALADI.** (1) `useEffect` önce `addToCart`ın yanındaydı, yani ekranın
  erken `return`lerinden SONRA: React *"Rendered more hooks than during the previous render"* deyip
  ekranı kırmızıya çevirdi — hook'lar ilk `return`den öne toplandı. (2) Sepetin `network_error`
  vermesi koddan değil, `db:reset` öncesinden kalan yerel sepettendi; cihaz verisi temizlenince
  düzeldi.

  **Doğrulama:** `tsc` · `eslint` temiz · **84 dosya / 599 test** yeşil · cihazda ölçüldü: bar
  satırı y≈2134, düğme y≈2244 (yapışkan barın içinde, her zaman görünür); ekleme toast'ı
  *"Sepete eklendi ✓ · asgari sepete 38,16 € kaldı"*.

  *Durum:* Sepet ile kasanın asgari sepeti FARKLI matrahla ölçtüğünden şüphelenildi
  (`read.ts:344` sepetin tamamı ⟷ `checkout-draft.ts:365` siparişe giren kapsam) ama
  **kanıtlanamadı**, o yüzden paylaşılan `packages/application`a DOKUNULMADI — orası web sepetini
  de sürüyor. `orderScopeOf` okunduğunda iki yolun tek bir matrah farkından fazlasında ayrıştığı
  görüldü (rota adresinde kasa hiçbir kalemi düşmüyor, sepet gelemeyenleri düşüyor — bu yönde sepet
  kasadan daha KATI). Kanıt yolu: girişli hesapla rota+kargo karışık sepet kurup iki cevabı yan
  yana ölçmek; kanıt çıkarsa iş bu satırın altına yeni bir kalem olarak yazılır.

- [x] (21.68) **TALEP YAZIŞMASI CANLI — zil · klavye (kullanıcı isteği 16.08)**
  `touches:` `apps/mobile/src/screens/support/ticket-detail-screen.tsx` ·
  `apps/mobile/src/screens/support/use-ticket.hook.ts` ·
  `packages/types/src/contracts/realtime.contract.ts` · `packages/types/src/contracts/index.ts` ·
  `apps/web/lib/ticket/write.ts`

  Kullanıcı: *"Talep açılıp da mesajlaşırken Supabase'e subscription atıp mesajlaşma sırasında
  güncellenmesini istiyorum."*

  **CANLI YAZIŞMA — KAPI ZİLİ, VERİ BORUSU DEĞİL.** Var olan desen aynen kullanıldı (`bell.ts`
  künyesi): kanal boş bir `changed` yayınlar, ekran duyunca yazışmayı SUNUCUDAN yeniden ister.
  `postgres_changes` reddedildi ve gerekçesi eskidir — projede RLS yok, her okuma service-role ile
  yapılıyor; istemciyi `ticket_message` tablosuna abone etmek o duvarda ilk delik olurdu. Talep
  başına kanal (`ticket:<uuid>`), yük daima boş.
  Kanal ve olay adı `@lezzet/types`a kondu (`realtime.contract`) çünkü zili ÇALAN taraf sunucu
  paketinde ve native uygulama ona bağlı değil — adı iki yere yazmak, bir gün sessizce çalmayan
  bir zil demekti. Tazeleme `load`dan AYRI (`refresh`): ekranı iskelete çekmez, okunan yazışma
  yerinde kalır.

  **KLAVYE — ÜÇ AYRI KUSUR, ÜÇ AYRI SEBEP (cihaz + simülatör ölçümü 16–17.08).** Teoriyle üç kez
  yazıp üçünde de tutturamadıktan sonra ölçülerek çözüldü; dersi yazıya geçiyor.
  1. **Yazma çubuğu iOS'ta klavyenin altında kalıyordu, Android'de kalmıyordu.** Sebep `behavior`
     seçimi ya da ofset DEĞİLDİ: çubuk `position: absolute, bottom: 0` ile kabın ALT KENARINA
     asılıydı. Android'in `height` davranışı kabı kısaltıyor (alt kenar yukarı gelir, çubuk gelir);
     iOS'un `padding` davranışı kısaltmıyor, dolgu ekliyor — alt kenar yerinde kalıyor, çubuk da.
     "Android düzeldi, iOS düzelmedi"nin tek cümlelik cevabı buydu. Çubuk akışa alındı.
  2. **Yazışmanın sonunda gereksiz boşluk** — mutlak konumlu çubuk için ayrılmış rezerve dolgu;
     çubuk akışa geçince anlamsız kaldı, kaldırıldı.
  3. **Klavye kapanırken çubuk aşağı kayıp yukarı zıplıyordu** — iki animasyon: `KeyboardAvoidingView`
     kendi dolgusunu klavyenin süresinde yumuşatırken, alt güvenli alanı geri koyan koşul
     (`insets.ime > 0 ? 0 : insets.bottom`) 34pt'yi bir anda ekliyordu. Koşul silindi; güvenli alan
     kabın DIŞINA, ekranın köküne alındı — kap zaten o kadar yukarıda başladığı için örtüşme
     hesabından kendiliğinden düşüyor. Tek hareket, tek süre.
  Alt pay `insets.bottom`un TAMAMI değil (**kullanıcı kararı 17.08**): sistem şeridi yukarı kaydırma
  hareketi için ayrılmış, bu ekranda o hareket yok — tek etkileşim dokunmak. Pay ana ekran çubuğunun
  çizgisini açıkta bırakacak kadar (`min(insets.bottom, 16)`); ölçülen boşluk 44pt → **26pt**.

  ~~**YENİLEME AŞAĞI DEĞİL YUKARI ÇEKMEDİR** (kullanıcı kararı 16.08) — sürükleme bitince alt
  uçtaki taşma ölçülür, eşik parametrik (`PULL_UP_THRESHOLD = 64`).~~
  **ELLE YENİLEME KALDIRILDI (kullanıcı kararı 17.08).** Yön doğruydu — yazışmada en yeni mesaj en
  altta, ekran zaten sona kaydırılmış duruyor; müşteriyi upuzun bir yazışmanın başına çıkarmak
  hareketin maliyetini metnin uzunluğuna bağlamak olurdu. **Ama Android'de ÇALIŞAMAYACAĞI ölçüldü:**
  RN'in Android `ScrollView`'ü taşma ofseti üretmiyor (`ReactScrollView.java` `overScrollBy`ı
  ezmiyor, Android'in `overscrollDistance`ı fiilen 0), yani `contentOffset` liste sonunda
  kilitleniyor ve ölçülecek taşma hiç doğmuyor. Cihazda kanıtlandı (OPPO CPH1907): çekişten sonraki
  altı karenin beşi öncekiyle **bit bit aynı**, biri yalnız kaydırma çubuğunun sönmesiyle farklı.
  İki gerçek çözüm vardı (ters liste + sistemin halkası · kaydırılabilir alt pay + kendi
  göstergemiz) ama kullanıcı özelliğin kendisini kaldırdı: *"sistem çalışıyor, gerek yok, kullanıcı
  en kötü çıkıp yeniden girer."* Canlı zil zaten tazeliyor, ekrandan çıkıp girmek tam okuma yapıyor.
  Sökülenler: `PULL_UP_THRESHOLD` · `onScrollEndDrag` · `refreshing` hâli ve göstergesi.
  `useTicket.refresh` DURUYOR — tek çağıranı zil.

  **HEAD'DE BIRAKILMIŞ BİR KUSUR DA KAPANDI:** `500770c1` `bell.ts`i `@lezzet/types`tan
  `ticketChannelName` çağırır hâlde commit'lemiş ama sözleşme dosyası untracked kaldığı için
  commit'e girmemişti — HEAD derlenmiyordu. Dosya bu commit'te kapanıyor.

  **Doğrulama:** `tsc` · `eslint` temiz; klavye ve boşluk İKİ CİHAZDA ölçüldü (iPhone 16e simülatörü
  + OPPO CPH1907, kare kare).

  *Durum:* **ÜÇ PARÇA AÇIK.** (a) Klavye AÇIKKEN yeni yerleşimin karesini kendim alamadım —
  simülatöre dokunuş sentezlenemiyor (`osascript` erişilebilirlik izni yok; Swift/`CGEvent` ile
  gönderilen tıklamayı simülatör almıyor). Açık hâli kullanıcının gözlemiyle doğrulandı, kareyle
  değil. ~~(b) **Zil cihazda çalınmadı**~~ → **ÇALINDI VE ÖLÇÜLDÜ (17.08, OPPO CPH1907):** ekran
  açıkken `replyAsStaff` gerçek kapısından personel cevabı yazıldı; yazışma **cihaza hiç dokunmadan**
  kendiliğinden tazelendi ve yeni baloncuk belirdi. Yani abonelik · kanal adı · sunucudaki zil
  çağrısı üçü de çalışıyor.
  ~~(c) **Gönderim anında çeviri yazılMADI.**~~ → **(21.69)'da yazıldı.**

- [x] (21.69) **TALEP MESAJI GÖNDERİM ANINDA ÇEVRİLİYOR — kuyruk beklenmiyor (kullanıcı kararı 17.08)**
  `touches:` `packages/application/src/translate/user-text.ts` ·
  `packages/application/src/ticket/translate.ts` · `packages/application/src/ticket/{ai.ts,write.ts}` ·
  `packages/application/src/index.ts` · `apps/web/lib/ticket/write.ts` ·
  `apps/backend/src/jobs/translate-user-text.ts`

  Kullanıcı bulgusu: *"Operasyon tarafından Türkçe mesaj atıyorum fakat kullanıcının dili Fransızca;
  mesaj başta Türkçe geliyor, mesajlaşmadan çıkıp girdiğim zaman Fransızca olarak göstermeye
  başlıyor — biz bunun bu şekilde olmasını istemiyoruz."*

  **SEBEP HATA DEĞİL, ZAMANLAMAYDI.** Çeviri yalnız kuyrukta koşuyordu (`translate_user_text`, 20.2 —
  tur başına en fazla 20 satır) ve okuma ondan önce yapılıyordu. Yani ekran "yanlış dil" göstermiyor,
  ÇEVİRİSİ HENÜZ OLMAYAN satırı gösteriyordu; ikinci girişte kuyruk koşmuş oluyordu. Kırpışmanın
  tarifi buydu.

  **ÇÖZÜM: SIRA — yaz → çevir → haber ver.** Karşı tarafın ekranını uyandıran şey zil olduğu için,
  çeviri zilden ÖNCE satıra yazılırsa okuyan taraf mesajı İLK GÖRÜŞTE kendi dilinde görür. Zili öne
  almak aynı kırpışmayı bir kez daha üretirdi. Aynı sıra maili de düzeltiyor: `notifyTicketReplied`
  artık çevrilmiş satırı okuyor.

  **DÖRT YAZICININ DÖRDÜ DE geçiyor** (personel · AI · müşteri-web · müşteri-mobil) ve bu bilinçli:
  kırpışma iki yönde de aynı arızadır — müşteri Fransızca yazıyor, operatör Türkçe okuyor. Yalnız
  bildirilen yönü düzeltmek, ötekini "bir gün o da yaşanır" diye bırakmak olurdu. **Bedeli gönderenin
  beklemesidir** (bir model turu): gönderen kendi cümlesini zaten kendi dilinde okuduğu için ona
  faydası yok, fayda tamamen KARŞI tarafındır. Rahatsız ederse müşteri yönü arka plana alınabilir —
  ama o zaman operatör kırpışmayı görmeye devam eder.

  **ÇEVİRİ DÜŞERSE MESAJ DÜŞMEZ.** Kapı fırlatmaz, hiçbir şeyi geri almaz ve **damga da atmaz**
  (`translatedAt` boş kalır) — satır çeviri kuyruğunda durmaya devam eder, arka plan işi telafi eder.
  Yani en kötü hâlde davranış bugünküne geri döner, daha kötüsüne değil. Kaydedilmiş bir cevabı
  çevirisi olmadı diye reddetmek en kötü sonuç olurdu: operatör gönderdim sanır, müşteri hiç görmez.

  **NÜSHA AÇILMADI, TERFİ EDİLDİ.** "Modeli çağır → kaynak dili ayır → torbayı kur" üçlüsü cron'un
  içinde gömülüydü; ikinci çağıran çıkınca `packages/application/src/translate/user-text.ts`e taşındı
  ve **cron da oradan okuyor** (`CLAUDE §1`). Kuyruk ile gönderim anının kararı GERÇEKTEN farklı
  olduğu için ayrık kaldı: kuyruk düşen satırı damgalayıp sırayı açar, gönderim anı damgalamaz.

  **Doğrulama:** `tsc` · `lint` · `knip` temiz (knip'te yeni ölü kod yok).
  **Tam paket 2707/2708 — bir test düştü ve BENİM DEĞİL, ölçüldü:**
  `packages/database/src/services/analytics.test.ts` günlük özetten doğrulama yapıyor, özet ise bütün
  oturumları topluyor. O gün `/catalog · b2c · search` için başkasına ait **11 olay** vardı
  (`3270e2055b…` — testin `test-<damga>` anahtarı değil, hash'li gerçek bir gezinme oturumu); testin
  kendi 3 olayı onlarla birleşip 14 oldu. `CLAUDE §4b`nin yasakladığı küresel sayı. Aynı paket bugün
  daha önce iki kez 2708/2708 geçti. Alan arka-uçta, not bırakıldı
  (`docs/talep/not-arka-uc-analytics-testi-kuresel-sayiya-bakiyor.md`).

  **CİHAZDA ÖLÇÜLDÜ (17.08, OPPO CPH1907) — üç iddia tek karede.** Müşterinin dili `fr`; `replyAsStaff`
  gerçek kapısından **Türkçe** cevap yazıldı (`Kargo numaranız hazır: paketiniz bu akşam yola
  çıkıyor.`). Ekran açıkken, **cihaza hiç dokunmadan**: (1) baloncuk kendiliğinden belirdi — zil
  çalışıyor; (2) **ilk görüşte Fransızca** geldi (`Votre numéro de suivi est prêt : votre colis part
  ce soir.`) — kırpışma yok, Türkçe hiç görünmedi; (3) "Traduit automatiquement" işareti yerinde —
  okuma yolu çeviriyi kullanıyor. Veritabanında da doğrulandı: `language='tr'`, `translated_at`
  damgalı, `translations->>'fr'` dolu. **Personel cevabının tamamı 2382 ms** (çeviri turu dahil) —
  gönderenin ödediği bedelin ölçüsü budur.

  *Durum:* Ölçüm betiği `server-only`yi aşmak için Node'un `react-server` koşuluyla koştu; o koşulda
  `react-dom/server` yüklenemediği için **cevap MAİLİ üretilemedi** ve hata yakalandı. Bu ölçüm
  aracının yan etkisi, ürünün kusuru DEĞİL — mail yolu normal sunucuda çalışıyor; yine de mail
  tarafı bu turda ölçülmemiş sayılır. Yerel talep yazışmasına iki gerçek cevap yazıldı (ölçümün
  kendisi), silinmedi.

- [x] (21.70) **CEVAP MAİLİ ANINDA DEĞİL, OKUNMAMIŞSA — ve yazışma yatayda nefes aldı (kullanıcı isteği 16.08 · kararlar 17.08)**
  `touches:` `supabase/migrations/0026_ticket.sql` · `packages/types/src/entities/ticket.schema.ts` ·
  `packages/database/src/services/ticket.service.ts` · `packages/application/src/ticket/{reply-mail.ts,read.ts,ai.ts}` ·
  `packages/application/src/index.ts` · `apps/web/lib/ticket/write.ts` ·
  `apps/backend/src/jobs/ticket-reply-mail.ts` · `apps/backend/src/index.ts` ·
  `apps/mobile/src/screens/support/ticket-detail-screen.tsx` · `docs/architecture/data-model/iletisim-geribildirim.md`

  Kullanıcı: *"Mail gidiyor, her cevapta. Eğer kullanıcı talep kısmından anlık yazışıyorsa bu
  maillerin gidip gelmesi de çok hoş değil."*

  **ÖLÇÜM ÖNCE: `notify.ts` sanılandan disiplinliydi.** Müşterinin kendi mesajı · personelin açtığı
  talep · `in_progress` · müşterinin yeniden açması — dördü de zaten mail doğurmuyordu. Gürültünün
  kaynağı **tek kural**dı: karşı taraf cevabı istisnasız mail üretiyordu. Canlı zil (16.8) bunu
  büsbütün gereksiz kıldı — ekranı açık müşteri cevabı zaten anında görüyor.

  **ÇÖZÜM: SUSTURMA DEĞİL ERTELEME.** Tek kolon (`ticket.reply_pending_since`) + kısmi indeks; üç
  kapı: cevap yazılınca kuyruğa al (**yalnız damga boşsa** — her satırda tazelenseydi hızlı yazan
  operatör maili sonsuza dek ertelerdi), müşteri okuyunca iptal, dakikalık süpürge gecikme dolunca
  gönder. Gecikme 5 dk (`TICKET_REPLY_MAIL_DELAY_MIN`). Ayrı bir "okundu" damgası AÇILMADI: bu kolon
  zaten o sorunun cevabı. Maili tamamen kesmek yanlış olurdu — müşteri yazıp uygulamayı kapatmış
  olabilir ve cevabı hiç öğrenmemesi en kötü sonuçtur.

  **İptal kapısının yeri kritik ve tek:** `getCustomerTicket`. İki yüzeyin müşteri talep detayı da
  oradan geçiyor (native + web) ve **zilin tetiklediği sessiz tazeleme de** — yani ekranı açık duran
  müşteri her zilde okumuş sayılıyor, mail hiç gitmiyor. Kimlikle çalışıyor, nesneyle değil: okuma
  kapısı talebi kuyruk görünümünden okuyor ve o görünüm damgayı taşımıyor.

  **Özet bedava geldi:** mail şablonu zaten son dört mesajı taşıyor, yani patlamadan sonra giden tek
  mail beş ayrı mailden daha eksik değil — daha bütün. Ayrı bir digest makinesi yazılmadı.
  **Ertelenmeyenler:** açılış teyidi ve durum değişimi aynen anında gider (talep ömründe bir-iki kez).

  **YATAY SIKIŞMA (kullanıcı bulgusu 17.08, cihazda ölçüldü).** Kullanıcı yazışmanın yanlardan
  sıkıştığını bildirdi; ölçüldü (OPPO CPH1907, 1080 px): 48 px dış dolgu + 42 px baloncuk iç dolgusu
  (iki yan) + `%78` tavanından doğan **262 px** kalıcı boşluk = yatayın **%36'sı metin dışı**. Dış
  dolgu `4xl`→`3xl`, tavan `%78`→`%88`. Ölçülen sonuç: baloncuk 770→**873 px**, metne kalan
  686→**789 px** (%64 → **%73**). Tavan kaldırılMADI: karşılıklı hizada "kim yazdı" bilgisini taşıyan
  şey o boşluktur.

  **Doğrulama — CİHAZDA, kare kare:** damga cevap yazılınca doluyor (`reply_pending_since` set) ·
  yazışma cihazda açılınca **boşalıyor** (okuma bekleyen maili iptal etti) · zil canlı çalışıyor
  (mesajlar yazılırken ekran kendiliğinden güncellendi, cihaza dokunulmadı) · uzun URL baloncuk
  içinde kırılıyor, taşma yok. `tsc` · `lint` · `knip` temiz.

  *Durum:* **İKİ AÇIK.** (a) **Gecikmeli mailin kendisi ölçülmedi** — gerçek testi cevap yazıp
  yazışmayı AÇMADAN 5 dakika beklemek ve `apps/backend` cron'unun maili göndermesini görmek; hesap
  hazır (`yamansehzade@gmail.com`). (b) **Tam paket koşulamadı:** 382 test düştü ve **hepsinin sebebi
  tek ve BAŞKA ŞERİDİN**: `stock.schema.ts` `storageAreaId`'yi zorunlu tutuyor, `stock_batch`ta o
  kolon yok (şema migration'ın önünde, `0045` turu sürüyor). Talep tarafında düşen test YOK.
  Ayrıca gözlem: **"Traduit automatiquement" işareti dokuz mesajın yedisinde** çıkıyor; tek tek doğru
  ama üst üste gelince yazışmayı gürültülü kılıyor — `BEKLEYEN(21.70)`, kaydı `BACKLOG-musteri`de.

- [x] (21.71) **ÇEVİRİ İŞARETİ BALONCUKTAN EKRANA — ve gecikmeli mail uçtan uca ölçüldü (kullanıcı kararları 17.08)**
  `touches:` `apps/mobile/src/screens/support/{ticket-detail-screen.tsx,messages.json}` ·
  `packages/application/src/ticket/reply-mail.ts` · `docs/uygulama/BACKLOG-musteri.md`

  Kullanıcı: *"Otomatik çevrildi metninin sürekli görünmesi büyük. Bu metni hiç koymasak ne olur?
  Çünkü kötü görünüyor."*

  **İŞARET ATILMADI, YERİ DEĞİŞTİ — ve gerekçe ölçümden çıktı.** İşaret baloncuk başına
  çiziliyordu; sebebi sağlamdı (makine çevirisi bir şikâyeti yumuşatabilir, müşteri okuduğu
  cümlenin personelin YAZDIĞI cümle olduğunu sanmamalı — `21.14` künyesi). Ama o gerekçe çevirinin
  İSTİSNA olduğunu varsayıyordu; ölçüm tersini söyledi: yazışmanın **iki yönü de** çevriliyor, yani
  çeviri VARSAYILAN. Cihazda dokuz mesajın yedisinde çıkıyordu. **Her zaman görünen bir işaret bilgi
  taşımaz** — okuyucu ikinci mesajdan sonra bakmayı bırakır, geriye gürültü kalır. Bu yüzden güvence
  ekran başına tek satıra indi (üç dilde), ve **koşullu**: hiç çeviri yoksa satır da yok. Baloncuk
  altındaki metin, ekran okuyucu etiketindeki ek ve artık kullanılmayan stil söküldü.
  **Ölçüldü (OPPO CPH1907):** yedi mesajın tamamı artık TEK ekrana sığıyor; önce sığmıyordu.
  ~~MB-64~~ bu kalemle kapandı, kaydı silindi.

  **GECİKMELİ MAİL UÇTAN UCA ÖLÇÜLDÜ** — `(21.70)`'in açık bıraktığı parça. Uygulama KAPALIYKEN
  personel cevabı yazıldı: damga `11:03:21`de kondu, 1.–5. dakikalarda değişmedi, **6. dakikada
  boşaldı** — yani `ticket_reply_mail` süpürgesi maili gönderdi (5 dk gecikme + tur payı).

  **"EKRAN AÇIK" = "İNSAN OKUYOR" SAYILIYOR (kullanıcı kararı 17.08).** Aynı ölçümün ilk turunda
  damga hiç yazılmadı ve sebebi kusur gibi görünüyordu: uygulama ARKA PLANDAYKEN ekran ayakta
  kaldığı için zil sessiz tazelemeyi koşturuyor, sistem bunu okuma sayıyor — cebinde uygulaması
  açık duran müşteriye mail hiç gitmiyor, ekranına bakmasa bile. Kullanıcıya gerekçesiyle soruldu,
  **eşitlik kabul edildi**; ayırmak gerekirse yol künyede yazılı (uç "gerçekten açtı" ile "zil
  tazeledi"yi ayıran bir parametre alır). Bugün ayrılmıyor: kazanılan kesinlik, eklenen sözleşme
  karmaşasını hak etmiyor.

  **Doğrulama:** `tsc` · `eslint` temiz; cihazda kare kare ölçüldü.

  *Durum:* Mailin kutuya DÜŞTÜĞÜ kullanıcı teyidine bırakıldı — süpürgenin gönderdiği damgadan
  kesin, ama sağlayıcı tarafı buradan görülmüyor.

  ~~Dev giriş kapısının arızası~~ → **ARIZA YOK, SEBEP EŞZAMANLI TEST KOŞUSUYDU (kanıtlandı 17.08).**
  Gün boyu dev giriş düğmesi aralıklı olarak *"Email link is invalid or has expired"* verdi ve
  ekranlar misafir kaldı. Sırayla üç hipotez kuruldu ve **üçü de ölçümle çürütüldü**: (a) ekranın
  oturum yüklenmeden monte olması — hesap sekmesi de misafir gösteriyordu, yani ekranlar doğru
  söylüyordu; (b) `flowType: 'pkce'` uyuşmazlığı — aynı akış sunucudan 4/4 geçti, iki kipte de;
  (c) SecureStore'un 2048 bayt sınırı — oturum ölçüldü, **1970 bayt**.

  **Gerçek sebep Supabase auth kaydında görüldü:** `POST /verify` → `403 · "One-time token not
  found"`, üstelik jetonu üreten `generate_link` ile **aynı saniyede**. Kimse cihaza dokunmazken 30
  saniye dinlendi: **941 `/user` · 134 `/admin/users` · 88 `/token` · 42 `/admin/generate_link` ·
  39 `/verify`**. Kaynak `.test-results/latest.json`ta duruyordu — **başka bir şerit tam paketi
  koşuyordu** (12:16:20 → 12:19:28, 2710/2710). Entegrasyon testleri kullanıcı açıp giriş yapıyor;
  her `generateLink` o e-postanın tek kullanımlık jetonunu değiştirdiği için cihazdaki giriş yarışı
  kaybediyordu. Yığın sakinken aynı düğme çalıştı ve oturum kalıcı oldu (ölçüldü).

  **Ders, `CLAUDE §4b`nin zaten yazdığı ders:** paylaşılan yığında eşzamanlı koşu tekrarlanmayan
  düşüş üretir — ve bu kez düşüşü ÜRETEN taraf testler, GÖREN taraf cihazdı. Cihaz turu, tam paket
  koşarken yapılmaz. **Kod yazılmadı;** geçici ölçüm satırı ölçüm biter bitmez söküldü.

- [x] (21.72) **CEVAP MAİLİ BİRDEN ÇOK YENİ MESAJI TAŞIYOR — "biri cevap, gerisi geçmiş" varsayımı düştü (17.08)**
  `touches:` `packages/types/src/contracts/notification.schema.ts` ·
  `packages/application/src/ticket/notify.ts` ·
  `packages/email/src/templates/ticket-notification.tsx` · `packages/email/src/components/email-layout.tsx`

  **KUSURU ERTELEME DOĞURDU.** `(21.70)` cevap mailini geciktirince tek mail birden çok yeni cevap
  taşımaya başladı; şablon ise `history[0]`ı tek başına "cevap" sayıp kalanını soluk alıntıya
  düşürüyordu. Ölçülen karede son ÜÇ mesajın üçü de yeni ve bizdendi, ikisi "önceki mesajlar"
  bloğundaydı — aynı konuşma sebepsiz ikiye bölünmüştü.

  **AYIRAÇ ZAMAN DAMGASI DEĞİL, YÖN.** Okunmamış küme = müşterinin son mesajından sonraki
  kesintisiz karşı-taraf dizisi. Müşteri yazdığı anda orada olduğu kesindir, yani kendi mesajı
  doğal sınırdır; `reply_pending_since` ile karşılaştırmak aynı sonucu verirdi ama kurucuya ikinci
  bir parametre ve bir saniyelik tolerans sokardı. Sözleşmeye tek alan eklendi (`unread`), tavan
  `UNREAD_LIMIT = 6` — aşan yeni cevap kaybolmaz, alıntı tarafına düşer. Kırpma da yalnız BAĞLAM
  alıntılarında: haber olan mesaj müşteriye aynen görünmeli (DOMAIN §15).

  **SIRA BLOK İÇİNDE ESKİDEN YENİYE, BLOKLAR ARASI DEĞİŞMEDİ** — kullanıcının ayrımı:
  *"chat'te sürekli aşağıda dururken mail'de yukarıdan aşağı bir okuma gerçekleşir."* Yani sohbetin
  alta-sabit sırası maile kopyalanMAZ; blok içinde göz aşağı inerken zaman ileri akar, ama haber
  yine üstte ve bağlam altta durur (e-posta alıntı geleneği). Başlık yalnız ilk kartta: art arda üç
  kez "Cevabımız" yazmak bilgi değil gürültü (`MessageCard.title` bu yüzden `string | null` oldu).

  **İKİ KUSUR GERİ ALINDI — ÖLÇÜNCE BENİM HATAM ÇIKTI.** (a) *"İki ayrı tarih biçimi"* diye
  yazmıştım; `formatShortDate` ölçüldü, ikisi de aynı biçimi üretiyor — karedeki fark benim elle
  yazdığım önizleme verisiydi. (b) *"Zamanın ters akması"* kusur değil: mail yukarıdan aşağı
  okunur, yeni haber üstte doğrudur. (c) *"Autre iki kez geçiyor"* da bırakıldı: konu satırı +
  gövdedeki künye satırı e-postanın olağan kalıbı.

  **Doğrulama:** `tsc` · `lint` temiz; şablon gerçek `render` ile üretilip kareyle bakıldı — üç
  yeni cevap üç ayrı kartta, 08:13 → 08:14 → 08:15 sırasıyla, müşterinin iki mesajı alıntı izinde.

- [x] (21.73) **HAK EDİLMEMİŞ PUAN GERİ ALINIYOR, VE KOMŞU DAVETİ ARTIK MÜŞTERİ DE GETİRİYOR
  (kullanıcı kararları 17.08)** — MB-57 · MB-67 kapandı.
  `touches: supabase/migrations/0028_points.sql, packages/database/src/services/{points,order}.service.ts,
  packages/application/src/feedback/points.ts, packages/application/src/order/payment.ts,
  packages/application/src/customer/{referral,neighbor,points}.ts,
  packages/types/src/contracts/points-api.schema.ts,
  apps/mobile/src/screens/points-history/{points-history-screen.tsx,points-history-group.ts,messages.json}`

  **BAŞLANGIÇ NOKTASI BİR SATIRIN BAYAT OLDUĞUNU GÖRMEKTİ.** MB-57 dört iş kalemi sayıyordu;
  ölçünce ikisinin ZATEN yapılmış olduğu çıktı (ödül anı `paid` geçişine bağlanmış, sipariş puanı
  sökülmüş). Kullanıcının aynı gün koyduğu kural bunu adlandırdı: *"notları kodla teyit etmeden
  oradaki ifadelere inanma; bazen yapay zeka ajanları konseptten kopabiliyor."*

  **1 · GERİ ALMA — ve "kazanılmış ödül geri alınmaz" ile çelişmiyor.** Kullanıcının ayrımı düğümü
  çözdü: *"hak edilmiş puan alınamaz evet, ama henüz hak edilmemiş puanlar vardır."* Ödülü hak
  ettiren şey paranın alınmış olması (★ karar 3); para geri gittiyse hak ediş de geri gitmiştir.
  Ölçülen boşluk: `finalize` yalnız `paid`e GİRİŞİ dinliyordu, ÇIKIŞ hiçbir şey tetiklemiyordu.
  Kullanıcının verdiği örnekte (kapıda ödeme + iptal) boşluk YOKTU — orada `paid` hiç oluşmaz;
  açık olan yol kartla ödemeydi. Geri alma defterden silmez, **ters satır** yazar ve tutarı ayardan
  değil o gün yazılan satırdan okur.

  **2 · TEKİLLİK İNDEKSİ İŞARETE GÖRE BÖLÜNDÜ (★ karar 7d — bilinçli sapma).** 11.08'in önerisi
  *"enum'a geri alma türü eklenir"*di; seçilmedi çünkü her yeni ödül türü ikinci bir enum elemanı
  doğururdu (CLAUDE §1). `points_entry_source_key` artık `points > 0`, yeni `points_entry_reversal_key`
  `points < 0`. Kazanç: `ref_id`nin sebebe göre değişen sözleşmesi korundu ve
  `sum(points) where reason='referral'` doğrudan NET etkiyi veriyor.

  **3 · KULLANICININ İKİ SORUSU İKİ KUSUR BULDURDU.**
  · *"İptal iki kere tetiklenip fazladan 100 puan silinebilir mi?"* → Komşu ödülünde hayır (üç
    katman), **ama getiren ödülünde başka bir aileden gerçek kusur çıktı**: kaynağı sipariş değil
    KİŞİ olduğu için, getirilen müşterinin İKİNCİ siparişinin iptali ilk siparişte hak edilmiş
    ödülü siliyordu. Ölçüt ödülün anlamından türetildi (`countPaidForCustomer > 0` → ödül durur).
  · *"Komşumu çağırdım, hesabı yoktu, geldi kaydoldu, başka sefere sipariş verdi — davet puanımı
    alabiliyor muyum?"* → **Hayırdı ve bu bir boşluktu.** `referred_by`yi yazan tek yol getiren
    daveti KODUNDAN geçiyordu; komşu daveti bağlantısı kod değil TOKEN taşıyor. Komşu davetiyle
    gelen kişi *"kimsenin getirmediği müşteri"* olarak doğuyordu — `feedback/points.ts` künyesi
    tersini vaat ettiği hâlde. Bağ artık `acceptNeighborInvite`ta, ortak kapıdan (`linkReferrerById`).
    Kural kopyalanmadı: üç ret ölçütü (`self` · `already_referred` · `already_customer`) tek yerde
    toplandı, iki davet türü de oradan geçiyor.

  **İKİ ÖDÜLÜN AYRIMI KAYDA GEÇTİ:** komşu ödülü SEFERE bağlı, getiren ödülünün seferle ilgisi YOK
  — *"o kişi başka sefere veya benimle çok alakasız posta kodunda dahi oturabilir… bir tane
  başarılı sipariş gerçekleştirmesi lazım."*

  **4 · "PUAN YOLDA" + PUAN GEÇMİŞİ EKRANI (MB-67).** Bekleyen ödül deftere YAZILMAZ (defter
  *"ne oldu"*yu tutar), kart sözleşmesinde taşınır ve ekranda listenin ÜSTÜNDE ayrı blok olur.
  Ekran artık bakiyeyi de gösteriyor. Aynı turda üçüncü kusur çıktı: gruplama anahtarı
  `sebep + tarih`ti, aynı gün yazılıp iptal edilen ödül tek satırda toplanıp **"+0"** yazacaktı —
  işaret anahtara eklendi, kazanç ile iptal ayrı satır ve ayrı etiket (üç dilde).

  **Doğrulama:** `typecheck` 18/18 · `lint` · `knip` temiz · **1374 birim testi** geçti. İndeks
  bölünmesi veritabanında rollback'li işlemle sınandı: ödül (+100) ve geri alma (−100) aynı üçlüyle
  yazıldı, **ikinci geri alma `23505` ile reddedildi** — yani çifte silme koruması uygulama katmanı
  atlansa bile ayakta. ~~Cihaz turu yapılmadı~~ → **CİHAZDA DOĞRULANDI (17.08 akşamı, üç dilde).**
  Bakiye satırı, "yolda" bloğu ve iptal etiketi kareyle görüldü; kazanç ile iptal **ayrı satır**
  çıktı (gruplama düzeltmesinin kanıtı — eskiden tek satırda `+0` olacaktı) ve bakiye bekleyen
  ödülü içermedi. Doğrulama için deftere ödül+geri alma çifti ve bir komşu daveti kuruldu, tur
  sonunda temizlendi. **Yan bulgu:** Almanca turda `MEİN KONTO` görüldü — eyebrow'lar sabit Türkçe
  yerelle büyütülüyor ve desen 17 dosyada; **MB-71** açıldı.

  **Cihaz turunun kendi dersi ikinci kez üretildi:** giriş ilk denemede `403 One-time token not
  found` ile düştü, auth kütüğünde aynı saniyede test fixture'ının `user_deleted` kaydı vardı;
  koşu bitip yığın sakinleşince aynı düğme çalıştı. `(21.71)`de kanıtlanan desen artık tekrar
  üretilebilir — **yığın test koşarken cihazda giriş yapılamıyor.**

- [x] (21.74) **BÜYÜK HARF DİLİN KURALIYLA — 17 ekran sabit Türkçe yerelle büyütüyordu (17.08)**
  → MB-71 kapandı. `touches: apps/mobile/src/lib/i18n/locale.ts,
  apps/mobile/src/screens/{home,catalog,product,checkout,orders,packages-list,account,points-history,customer-kit}/*`

  **Bulgu cihazdan geldi:** `(21.73)`ün Almanca doğrulama turunda başlıkta **`MEİN KONTO`** görüldü.
  Desen aranınca tek ekranın kusuru olmadığı çıktı — `toLocaleUpperCase('tr-TR')` **17 çağrıda**
  sabit yazılmıştı ve vitrinde de görünüyordu (`COLLECTİONS`).

  **Türkçe yerelin oraya konması BİLİNÇLİYDİ ve gerekçesi geçerli:** varsayılan büyütme Türkçe `i`yi
  noktasız `I` yapar, yani `İstanbul → ISTANBUL`. Eksik olan yerelin sabit yazılmasıydı; ekranların
  hepsi zaten `useAppLocale()` ile dilini biliyor. **Kural ZATEN iki yerde doğru uygulanmıştı**
  (`place-notice-band` künyesi onu açıkça anlatıyor) — yani kural bilgi olarak vardı ama **adı
  olmadığı için** 17 kez kaçırılmıştı. Düzeltme o adı verdi: `upperIn(text, locale)`
  (`lib/i18n/locale.ts`), 19 çağrının hepsi oradan geçiyor, depoda sabit yerel kalmadı.

  **Bir istisna bilerek dışarıda:** kupon kodu düz `toUpperCase()` kullanıyor (`cart-screen`) —
  kod bir KİMLİKTİR ve Türkçe kuralıyla `i → İ` olsaydı sunucudaki kod bulunamazdı. Ayrım
  yardımcının künyesinde: *insan okuyorsa dil kuralı, makine eşleştiriyorsa dilsiz.*

  **Doğrulama:** `tsc` · `lint` temiz · **1374 birim testi**. Cihazda İKİ YÖNDE ölçüldü — Almanca
  `KOLLEKTIONEN` · `MEIN KONTO` (noktasız `I`), Türkçe `KOLEKSİYONLAR` (noktalı `İ`) · `FIRIN`
  (noktasız `I`). Asıl risk öteki dilleri düzeltirken Türkçeyi bozmaktı; bozulmadı.

- [x] (21.75) **TURUN ÜÇ KÜÇÜK BULGUSU: AYNI BİLGİ İKİ KEZ (18.08)**
  → MB-66 · MB-68 · MB-69 kapandı; MB-70 daraltıldı. `touches: apps/mobile/src/app/(tabs)/account.tsx,
  apps/mobile/src/screens/account/*, apps/mobile/src/screens/support/tickets-screen.tsx,
  apps/mobile/src/screens/cart/*`

  Üçü de 17.08 cihaz turunda ölçüldü ve üçü de **aynı kusurun** ayrı yüzleri: ekranın iki ayrı yeri
  aynı şeyi söylüyor, çünkü ikisi de ötekinin ne söylediğini bilmiyor.

  **MB-66 · Hesap kartında e-posta iki kez.** Kök sebep kararın YERİYDİ: "adı girilmemişse kart adsız
  kalmasın" kararı ROTADA uygulanıyordu (`name: me.name.trim() === '' ? me.email : me.name`), yani
  ekran eline geçen satırın gerçek bir ad mı yoksa yedek mi olduğunu bilmiyor ve altına aynı adresi
  ikinci kez yazıyordu. Karar ekrana taşındı: rota adı olduğu gibi geçiriyor (boşsa boş), yedeğe
  düşme `account-screen`de (`nameMissing` · `displayName`) ve alt satır adresi tekrar etmek yerine
  eksiği söylüyor (*"Adınızı ekleyin"* · *"Ajoutez votre nom"* · *"Fügen Sie Ihren Namen hinzu"*).
  **Yan kazanç:** profil çekmecesi taslağı yedeğe düşülüp düşülmediğini `data.name === data.email`
  karşılaştırmasıyla TAHMİN ediyordu — adı e-postasıyla aynı olan bir hesapta o tahmin yanlış cevap
  verirdi; artık tek karardan okuyor.

  **MB-68 · Talepler boş hâlinde iki çağrı, iki ad.** Üst çubuktaki *"＋ Yeni"* ile ortadaki *"Bize
  yazın"* aynı çekmeceyi açıyordu. Çubuk artık ekranın hâlini biliyor (`bar(withNew)`): boş hâlde
  çizilmiyor, ortadaki kalıyor — o anki tek iş odur ve gerekçesini de yazar.
  **Aynı satırda ikinci bir kusur çıktı: MİSAFİRDE ÖLÜ DÜĞME.** Misafir dalında çekmece hiç
  çizilmiyor (talep açmak oturum ister), ama çubuktaki bağlantı duruyordu — basınca görünür hiçbir
  şey olmuyordu. O dalda da kaldırıldı. Yükleme ve hata hâllerinde kalıyor: ikisinde de rakip bir
  çağrı yok ve çekmece çiziliyor.

  **MB-69 · Sepette asgari sepet uyarısı iki kez.** Burada bir KARAR vardı ve korundu: 16.08'de
  bara kısa gerekçe satırı kondu ve dipteki uzun açıklamanın kalmasına karar verildi, çünkü ikisi
  ayrı soruyu cevaplıyor ("neden basamıyorum" ↔ "ne yapmalıyım"). Kusur metindeydi — ikisi de aynı
  eksik tutarı yazıyordu. Tekrar eden sayı dipten silindi: bar EKSİĞİ, dipteki EŞİĞİ ve ne
  yapılacağını söylüyor. Notu tamamen kaldırmak da adaydı; o zaman asgari sepetin KAÇ olduğu hiçbir
  yerde yazmazdı — müşteri hedefi bilmeden mesafeyi okurdu.

  **MB-70 · BAN öneri listesi — ÖLÇÜM BULGUYU DEĞİLLEDİ, kalem daraltıldı.** Turda "dördüncü öneri
  yarım kalıyor, üstüne kaynak künyesi biniyor" diye yazılmıştı; kodda ölçülünce ikisi de tasarımın
  KENDİSİ çıktı. `SuggestionList` 11.08'de bir kullanıcı bulgusuyla tavana bağlanmış: `VISIBLE_ROWS
  = 3.5` ve künyesi yarım satırın niye yarım olduğunu yazıyor — *"tam 3 olsaydı dördüncü satır
  tamamen gizlenirdi ve listede devamı olduğu hiçbir yerden anlaşılmazdı"*. Künye de kaydırma
  alanının DIŞINDA, kendi saç teli ayıracıyla (Etalab 2.0 kaynak gösterimi listeyle birlikte
  görünmek zorunda), yani binmesi yapısal olarak imkânsız. Hesaplanan boy: satır
  `12×2 + 2 + 14×1,2×2 = 59,6` dp, tavan `×3,5 = 208,6` dp, künyeyle birlikte kutu ~246 dp. Geriye
  tek soru kalıyor — klavye açıkken çekmeceye kalan ~500 dp'de bu kutu `Kaydet` düğmesini görünür
  alanın dışına itiyor mu; o **cihazda** ölçülecek, kalem o parçaya indirildi.

  **Doğrulama:** `tsc` temiz · `lint` temiz · **1374 birim testi** + dokunulan dördünün jest paketi
  (**43 test**).

  **CİHAZDA DOĞRULANDI (18.08, Android):** hesap kartı e-postayı ad satırına yazıp altında
  *"Adınızı ekleyin"* diyor — adres bir kez görünüyor (MB-66). Talepler boş hâlinde üst çubukta
  *"＋ Yeni"* YOK, ortada tek çağrı *"Bize yazın"* duruyor (MB-68). MB-69 sepette dolu sepet
  gerektiriyor, o tur yapılmadı.

  **Turda YENİ bir kusur görüldü ve AYNI TURDA kapatıldı — MB-73.** Ad satırı e-postaya düştüğünde
  uzun adres başlık boyunda *"yamansehzade@gmail"* / *".com"* diye ikiye bölünüyordu. Kusur
  MB-66'nın getirdiği bir şey değildi (yedek eskiden de aynı satırdaydı), `(21.77)`'nin bir kademe
  büyütmesi onu görünür kıldı.
  **Boyutla oynanmadı, çünkü kırılma tesadüf değildi:** o yuva KISA BİR AD için ayrılmış (şablon
  oraya hep bir ad koyuyor) ve e-posta sığmadığı için ilk yasal kırılma noktasından, alan adının
  ortasından bölünüyordu. Bir kademe küçültmek eşiği kaydırır ama kaldırmazdı; kısaltmak kimliğin
  bir parçasını gizlerdi. **Roller yerine oturtuldu:** büyük satır ya adı söyler ya adın eksik
  olduğunu, e-postanın yeri zaten künye satırıdır. **İkinci turda cihazda doğrulandı** — büyük
  satır *"Adınızı ekleyin"*, künye satırı adresin TAMAMI tek satırda, avatar harfi kimlikten ("y").
  Kart üç satırdan ikiye indi. Kod da sadeleşti: e-posta artık tek yerde yazılıyor.

  **MB-69 ve MB-70 da AYNI GÜN cihazda ölçüldü** (turun kalanı):
  · **MB-69 doğrulandı.** 1,84 €'luk tek kalemle sepet açıldı: dipte *"Asgari sepet 40,00 €.
    Sipariş verebilmek için birkaç ürün daha ekleyin."*, barda *"Asgari sepete 38,16 € eksik"* —
    tekrar eden sayı yok, iki uç birbirinde olmayanı söylüyor. Tur kalemi sonra temizlendi.
  · **MB-70 KAPANDI — ARIZA YOK, ve bunu KULLANICI yakaladı.** İlk ölçümde adres çekmecesinde
    *"avenue"* yazıldı, BAN dört öneri döndü ve `Kaydet`ten geriye ~4 dp'lik bir ŞERİT kaldı;
    buradan "birincil eylem kırpılmış, bozuk gibi duruyor" diye kalem tutuldu. Kullanıcı doğru
    soruyu sordu: *"kullanıcı zaten adres yazıyor ve buradan bir adres seçecek — seçimden sonra
    ekran olması gerektiği gibi olmuyor mu?"* **Ölçüldü: oluyor.** Öneri seçilir seçilmez liste
    kapanıyor, form eski boyuna dönüyor, posta kodu ve şehir kendiliğinden doluyor
    (`33100` · `Bordeaux`), `Kaydet` klavye açıkken TAM görünür oluyor. Şerit hâli bir arıza değil,
    **geçici bir ara kare**. Turdaki *"künye biniyor"* izlenimi de yanlış okumaydı.
    **Ders:** ekranı TEK KAREDE değerlendirmek yanıltıyor — ölçüm akışın SONUNA kadar
    götürülmeliydi. Bugünün dersinin dördüncü tekrarı, bu kez ölçmeyen bendim.

- [x] (21.76) **KÜÇÜK DURAKLARDAKİ İÇERİK — ŞÜPHENİN DOKUZDA SEKİZİ ŞABLONA UYUYORMUŞ (18.08)**
  → MB-46 kapandı. `touches: apps/mobile/src/screens/account/account-screen.tsx,
  apps/mobile/src/screens/support/ticket-detail-screen.tsx`

  MB-45'in genel hâliydi: *"`helper` (12) durağı asıl içerik taşıyan başka yerlerde de kullanılıyor
  olabilir"*, ilk sayımda 124 çağrı. `(21.38)` süpürmesinden sonra bugün **`helper` 52 · `micro`
  42**; müşteri yüzeyinde 28 + 24. Hepsi tek tek okundu.

  **ÖLÇÜM ŞÜPHEYİ BÜYÜK ORANDA DEĞİLLEDİ.** Dokuz ciddi aday çıktı ve sekizi `Mobil - Musteri
  v3.dc.html` ile **birebir** uyuştu: tarif satırında *Tükendi* `700 11px`, aynı satırın
  etiket+fiyatı `400 11,5px`, varyant çipi fiyatı `600 12px`, aile üyesi fiyatı `600 11px`, puan
  kartının eksik-puan satırı `600 12px`, kupon kodu `700 13px`, kupon değeri `400 12px`. Şablon
  yoğun satırlarda ve çiplerde **bilerek** 10–13 px kullanıyor. Çıkarılan kural: *"içerik 14'ün
  altına inmez"* ölçütü müşterinin KARAR için okuduğu **düz metne** aittir (MB-45'te olduğu gibi:
  adım açıklaması, güvence cümlesi), çipin ya da liste satırının içindeki etikete DEĞİL — mekanik
  uygulansaydı sekiz yerde şablondan sapılırdı (CLAUDE §3: implement ederken improvise etme).
  Keşif ekranının iki ipucu başlığı da yanlış alarmdı: gövdeleri başlığın İÇİNE yuvalanmış `Text`,
  boyutu ondan miras alıyor.

  **İki gerçek bulgu kaldı, ikisi de "aynı seste konuşma" kusuru:**
  · Hesap · *Verileriniz* kartının **başlığı gövdesinden küçüktü** (12 ↔ 14). Şablonda oran doğru
    (`700 12,5` ↔ `400 11,5`); `(21.38)` gövdeyi 14'e çıkarıp başlığı bırakınca oran tersine dönmüş.
    Kendi süpürmemizin arkada bıraktığı bir ters düşme — kalem olmasa görülmezdi.
  · Talep detayında **gönderim hatası pasif künyelerle aynı boydaydı** (`micro`). *"Mesaj
    gönderilemedi — tekrar deneyin"* ile *"Cevap geldiğinde e-posta ile haber veririz"* aynı sesle
    okunuyordu. Hata `note`a (13) alındı; `body-sm` değil, çünkü yazma alanı 13,5 ve ondan büyük bir
    hata satırı bağırırdı.

  **Doğrulama:** `tsc` temiz · `lint` temiz · dokunulan iki ekranın jest paketi **10/10**. Cihaz
  turu gerekmedi (kullanıcı kararı 11.08 — süpürmede kod tarafı doğrulama yeter).

- [x] (21.77) **MÜŞTERİ YÜZEYİ BİR KADEME BÜYÜK OKUYOR — ve yazı ölçeği baştan sona denetlendi
  (kullanıcı isteği 18.08)**
  → `touches: apps/mobile/src/theme/{parse,unistyles,unistyles.test}.ts,
  apps/mobile/src/lib/settings/font-scale.ts, apps/mobile/src/components/ui/*,
  apps/mobile/src/screens/{product,package,recipe}/*`

  İstek üç parçaydı: (1) tüm fontlar merkeze bağlı olsun, (2) rolüne uygun token kullanılsın,
  (3) her boyut bir kademe büyüsün.

  **(1) MERKEZ ZATEN TAMDI — ölçüm şüpheyi karşıladı.** `apps/mobile` genelinde ham sayıyla
  yazılmış **tek bir `fontSize` yok** (0/372); hepsi `theme.text.*` okuyor. Ham renk yasağının
  (CLAUDE §3) yazı tarafındaki karşılığı tutmuş.

  **(3) BİR KADEME = SABİT +1 dp, TEK NOKTADA** (kullanıcı seçimi). `unistyles.ts`te müşteri
  temasının `text`i kurulurken uygulanıyor (`customerStops`), yani 372 çağıranın hiçbiri
  değişmedi. Neden sabit ekleme: şablonun yarım piksel farkları KARAR taşıyor (`control` 13,5 ↔
  `body-sm` 14 hizası) ve sabit ekleme bütün aralıkları birebir korur; "merdivende bir üst durak"
  başlığı +4, gövdeyi +0,5 büyütüp hiyerarşiyi oynatırdı. **Operasyon teması dokunulmadı** —
  büyütme müşteri yüzeyinin kararı; `unistyles.test` bu sınırın bekçisi (operasyon durakları ham
  token'la karşılaştırılıyor, sızarsa kırmızıya döner). **Token dosyalarına girilmedi**: `customerText`
  web müşteri yüzeyiyle paylaşılıyor (kullanıcı kararı: yalnız mobil uygulama).
  **Bir duplikasyon da kapandı:** "hangi anahtar boyut durağıdır, hangisi alt-özellik" kuralı hem
  `font-scale`de hem burada gerekiyordu; `theme/parse`taki `mapTextStops`a alındı. İki kopya
  kalsaydı yeni bir `--` soneki doğduğu gün biri onu tanımazdı (CLAUDE §1).

  **(2) FONT TİPİ — 14 aday, 4 gerçek.** Envanter betiği (aile ↔ durak çifti) üç öbek çıkardı:
  · **Ailesiz 3 → 1 gerçek.** İkisi yanlış alarmdı (`stock-mark`: aile ortak `label` stilinden
    geliyor, RN stil dizisi birleştiriyor). Gerçek olan `package-detail`in `itemChevron`ıydı: tek
    başına kullanılıyor ve ailesi yoktu — "›" işareti Karla'yla değil CİHAZIN SİSTEM FONTUYLA
    çiziliyordu. Bağlandı.
  · **Gövde durağında Lora 3 → 0 gerçek.** Üçü de ÜRÜN ADI; `fonts.ts` künyesi kuralı zaten
    yazıyor: *"Lora yalnız başlık ve ürün adı"*. Doğru kullanım.
  · **Başlık durağı ödünç alan 8 → 3 düzeltildi, 5 kayda geçti.** Adet seçicinin `−`/`+` imleri
    (ürün · paket) ve tarif satırının `+`ı `h2-sm` okuyordu — yani BAŞLIK kademesi. `icon-sm`e
    alındılar: **aynı boy (20), sıfır piksel değişim**, tek fark ölçekte doğru rol. Token künyesi
    rolü zaten söylüyor: *"İkon/emoji ölçüleri — metin hiyerarşisinin parçası DEĞİL"*.

  **KALAN BEŞİ MB-72'YE YAZILDI — ve o kalem ŞABLONA SORULUNCA ÇÖKTÜ (aynı gün kapandı).**
  İlk yazımı *"ölçekte durak yok, token eklenmeli"* diyordu; şablonla karşılaştırınca paket fiyatı
  (24 = `card-title`) ve OTP alanı (26 = `page-title-sm`) **birebir** çıktı, puan sayısı ile damga
  1 px farkla kaldı. **Premis yanlıştı:** ölçekteki boyut durakları AİLE-BAĞIMSIZDIR — kademenin
  Lora mı Karla mı olduğu `theme.font.display` ↔ `body` ekseninde ayrı seçilir. Ayrı durak
  İKONLARA verilmiş çünkü onlar açıkça *"metin hiyerarşisinin parçası DEĞİL"*; bir fiyat ya da
  rakam ise hiyerarşinin parçasıdır. 1 px için token açmak, ölçeğe bir daha okunmayacak bir durak
  eklemek olurdu. Tek açık nokta `order-confirmed`ın ✓ imi: İM olduğu için adet seçicileriyle aynı
  kategori ama o boyda ikon durağı yok ve şablonda ✓ hiç çizilmemiş — boyut uydurmamak için
  bırakıldı, gerekçesi ve somut riski (daire 92 dp'de sabit, im başlık merdivenine bağlı)
  `BACKLOG-musteri`de.

  **GÜNÜN TEKRAR EDEN DERSİ, ÜÇÜNCÜ KEZ:** `(21.74)`te künye doğruydu ama 17 çağrı kaçırmıştı,
  `(21.76)`da dokuz şüphelinin sekizi şablona uyuyordu, burada beş şüphelinin ikisi birebir çıktı.
  Şüphe ucuz, ölçüm pahalı — ama ölçmeden yazılan kod en pahalısı.

  **Doğrulama:** `tsc` temiz · `lint` temiz (`src` tamamı) · **599 jest testi, 84 paket, hepsi
  geçti**. 13 test düşmüştü ve hepsi beklenen boyutu token'dan türetiyordu; kural yine tek yerden
  verildi (`customerStops`), sekiz test dosyasında birer satır.

  **CİHAZDA ÖLÇÜLDÜ (18.08, Android) — ve ölçüm "+1 sabit"i KANITLADI.** Vitrin ekranı yeniden
  yüklemeden önce ve sonra çekildi, aynı üç metnin piksel genişliği karşılaştırıldı:

  | metin | durak | beklenen | ölçülen |
  |---|---|---|---|
  | *"Hoş geldiniz"* | `h1-sm` 30→31 | +3,3% | **+4,5%** |
  | *"67000 STRASBOURG"* | `note` 13→14 | +7,7% | **+7,0%** |
  | *"KOLEKSİYONLAR"* | `eyebrow` 10→11 | +10,0% | **+11,2%** |

  Kritik olan tek tek sayılar değil, ARALARINDAKİ İLİŞKİ: kademe küçüldükçe oransal büyüme
  artıyor. Çarpanla yapılsaydı üçü de aynı yüzdeyi verirdi — yani ekrandaki şey gerçekten sabit
  bir ekleme ve tema o değeri okuyor.

- [~] (21.78) **CİHAZ TURUNUN A BÖLÜMÜ İLK KEZ KOŞULDU — misafir yüzeyi (kullanıcı onayı 18.08)**
  → A1…A13 ve A15–A16 tamam; **A17 ile A14'ün giriş duvarı açık kaldı.** `touches: docs/uygulama/*`

  Tur **hiç yapılmamıştı** çünkü ön koşulu uygulama verisini silmek ve bu, cihazdaki oturumu
  götürüyor. Kullanıcı onayıyla yapıldı.

  **ÖN KOŞULUN KENDİSİ İKİ SÜRPRİZ ÇIKARDI, ikisi de tur belgesine yazıldı:**
  · `adb shell pm clear` **bu cihazda çalışmıyor** (Oppo CPH1907 — kabukta `CLEAR_APP_USER_DATA`
    izni yok, `SecurityException`). Yol Ayarlar üzerinden: *Uygulama bilgileri → Saklama alanı →
    Verileri temizle*. Sayfa `am start -a android.settings.APPLICATION_DETAILS_SETTINGS` ile açılıyor.
  · **Veri silme GELİŞTİRME DERLEMESİNİ de sıfırlıyor:** dev client'ın hatırladığı Metro adresi
    gidiyor ve uygulama "Development Servers" ekranına düşüyor. `adb reverse tcp:8081 tcp:8081` +
    adres alanına `http://localhost:8081` ile toparlanıyor. Bu adım belgede hiç yoktu.

  **GEÇEN ADIMLAR:** A1 (seçim aynı karede çeviriyor ve kendiliğinden ilerliyor) · A2 ("Büyük"te
  sonraki adımların hiçbiri taşmadı) · A3/A4 (bölge içi/dışı AYRI cümle; bölge dışı cevabı **ret
  gibi değil, alternatif gibi** okunuyor) · A5 (havale satırı *"Profesyonel müşterilerimize özel"*
  diyor) · A6 (*"500 puan = 5,00 € kupon"* tek satır, liste kapalı; açılınca iki davet tipi ayrı
  ayrı) · A7 · A8 (**misafire hiçbir "önce hesap aç" duvarı çıkmıyor**) · A14 kısmen.

  **BİR GERÇEK BULGU: MB-74 — onboarding'in iki adımı soğuk zincir konusunda ÇELİŞİYOR.** Teslimat
  adımı *"soğuk zincir gerektirenler kargoyla gönderilemez"* diyor, iki ekran sonraki posta kodu
  adımı bölge dışına *"soğuk zincir korumalı kargoyla 2–4 iş gününde ulaştırırız"* diyor. Ayrım
  muhtemelen gerçek (yalıtımlı ambalaj ≠ donuk) ama müşteri o ayrımı bu iki cümleden çıkaramaz.
  Metin kararı olduğu için ölçüm bırakıldı; kayıt `BACKLOG-musteri`de.

  **ÜÇÜNCÜ BULGU BELGENİN KENDİSİNDE:** uygulamada onboarding **dokuz** adımlı ve sıra
  dil → yazı boyutu → **teslimat** → **posta kodu** → …; belge A3/A4'te posta kodunu teslimattan
  ÖNCE yazıyor. Tablo artık "kod doğrulanmadan okunmasın" uyarısıyla duruyor.

  **TURUN KALANI DA KOŞULDU (aynı gün, kullanıcı onayıyla).**
  · **A9 ✓** Koleksiyon temizlenince kategori çipleri geri geldi — `(21.81)`in koşulu iki yönde de
    çalışıyor. Süzgeç sayfası açılıyor (Önerilen · Fiyat ↑ · Fiyat ↓). Ürün adları Türkçe (MB-31
    bir kez daha çürüdü).
  · **A10 ✓** Kart *"5,00 €'dan"* → detay açılışta **5,00 €** seçili; MB-20 tekrar çürüdü. Aile
    şeridi (Karışık/Fıstıklı/Cevizli) ve varyantlar (450g 5,42 € · 225g 5,00 €) yerinde.
  · **A11 ✓** *"tek fiyata gelir, içeriği bellidir"* — paketin ne olduğu tek cümlede anlaşılıyor.
  · **A12 ✓** Tarif şeridi: süre + malzeme sayısı + *"Tarifi gör"*.
  · **A13 ✓ (asıl sorusu)** Misafire **puan vaat EDİLMİYOR**: turun başlığında yalnız *"beğenileriniz
    ne getireceğimize yön verir"* var. Tur artık misafire erişilebilir de (`(21.80)`).
  · **A15 ✓ — ve MB-74'Ü ÇÖZDÜ.** Bölge sayfası → *"Nerelere gidiyoruz"*: posta kodu listesi,
    *"Kendi posta kodumu deneyeyim"* ve kargo notu; müşteri ne yapacağını biliyor. **Kritik olan
    notun kendisi:** *"Kalan her yere kargoyla gönderiyoruz; yalnız soğuk zincir isteyen ürünler
    gidemiyor."* Yani üç yerin İKİSİ aynı kuralı söylüyor ve **aykırı olan tek yer onboarding'in
    posta kodu adımıdır** — MB-74 artık "çelişki var" değil, "şu cümle yanlış" diyor.
  · **A16** `(21.51)`de zaten koşulmuştu (B2B misafir yolu, uçtan uca).
  · **AÇIK KALAN İKİSİ:** A17 (yasal sayfalar + destek) koşulmadı; **A14'ün giriş duvarı** da
    ölçülemedi — görmek için sepeti 40 €'ya doldurmak gerekiyor.

  **Cihaz durumu:** dil Türkçe · yazı boyutu Büyük · posta kodu 67000 geri kuruldu; kullanıcının
  **oturumu silindi**, yeniden OTP ile girmesi gerekiyor. Turda eklenen sepet kalemi temizlendi.


  ## Turun devamı (27.08) — A17 koşuldu, klavye kalıbı cihazda doğrulandı

  Bu tur **21.121'in unistyles avı** için açıldı (kökü bulundu, kendi kaydında) ve aynı pencerede
  günün klavye değişiklikleri ile A17 de ölçüldü. Depo hesabıyla açıldı, personel köprüsünden
  müşteri yüzeyine geçildi.

  **A17 · YASAL SAYFA — GEÇTİ.** Checkout'un dibindeki "Satış koşullarını okuyun" bağlantısı
  açıldı: başlık · son güncelleme tarihi · şirket künyesi (QUALITE SAS, SIRET, adres) · bölümler
  tam, tipografi ve kaydırma sorunsuz.

  **KLAVYE KALIBI CİHAZDA — üç ölçüm, üçü de geçti** (bugün kite çıkan `ChatLayout` ve checkout'un
  `FormScroll`a geçişi):
  · **Çekmece** ("Bize yazın") — klavye açıldı, panel yukarı itildi, alan ve "Gönder" görünür kaldı.
  · **`ChatLayout`** (talep detayı) — klavye açıkken yazma çubuğu klavyenin TAM ÜSTÜNDE durdu,
    yazışma listesi kısaldı, gönder düğmesi görünür kaldı. MB-02'nin karşılığı.
  · **MB-01 (yutulan ilk dokunuş)** — klavye AÇIKKEN gönder düğmesine TEK dokunuşla mesaj gitti,
    baloncuk düştü ve klavye kapandı. `keyboardShouldPersistTaps="handled"` çalışıyor.
  · **Checkout `FormScroll`** — yerleşim BOZULMADI (asıl risk buydu: kap bir `KeyboardAvoidingView`
    ekliyor ve flex zinciri bozulabilirdi). Başlık, kimlik şeridi, adres bloğu, özet, onay kutusu,
    düğme ve satış koşulları bağlantısı yerinde. İletişim künyesi bölümü ÇİZİLMEDİ ve bu doğru —
    hesabın adı ve telefonu dolu (bölüm yalnız künye eksikken doğar).

  **SEPET AKIŞI DA GÖZLENDİ (planlı değildi, yol üstündeydi):** asgari sepet kilidi doğru çalışıyor —
  düğme kapalıyken sebep düğmenin YANINDA ("Asgari sepete 33,02 € eksik"), eşiğin kendisi dipte
  ("Asgari sepet 40,00 €"); iki uç ayrı şey söylüyor (MB-69'un kararı). Eşik aşılınca uyarılar
  düştü ve düğme açıldı.

  **AÇIK KALAN:**
  · **A14'ün giriş duvarı** — bu turda da ölçülmedi; hesap zaten girişliydi.
  · ~~**Şikâyet (Y1) ve sosyal sohbet ekranlarının klavye turu** — admin girişiyle koşulacak.~~
    → **KAPANDI, koşulmayacak (kullanıcı kararı 27.08):** *"klavye eğer konu sadece oysa şimdilik
    beklet veya tamamlandı diye işaretle; klavyeyle alakalı yeni şikâyet gelirse testlerde bakarız."*
    Dayanak ölçülmüştü: kalıbın kendisi cihazda ÜÇ ölçümle doğrulandı (çekmece · `ChatLayout` ·
    MB-01 yutulan dokunuş) ve bu üç ekran AYNI kabı kullanıyor — kalan yalnız ekran bazlı yerleşim
    kontrolüydü. Admin hesabına geçmek cihazdaki oturumu değiştirmeyi gerektiriyordu; maliyet
    kalan riski aşıyor. Yeni şikâyet gelirse tur `ChatLayout` testlerinden başlar.
  · **21.7'nin Android cam bulanıklığı** — bu turda sıraya gelmedi.

  **Bir dev aracı gözlemi:** ayarlar FAB'ı sepette "+" düğmesinin üstüne denk gelip dokunuşları
  yutuyordu (adet artmıyordu). FAB sürüklenebilir olduğu için tur sürdürüldü — ama aynı örtüşme
  operatörün önüne çıkarsa "düğme çalışmıyor" diye okunur. Alan dev aracının sahibinde.
- [x] (21.79) **PUANIN PARA KARŞILIĞI OKUNUR HÂLE GELDİ — ve keşif kartının yokluğu araştırıldı
  (kullanıcı bulguları 18.08)**
  → MB-75 açıldı. `touches: apps/mobile/src/screens/customer-kit/{points-value.ts,points-earn-list.tsx},
  apps/mobile/src/screens/{onboarding,account}/*`

  **PUAN YAZIMI.** Kullanıcı cihazda gördü: *"puan ve bir nokta konmuş, sonra puanın para karşılığı
  yazılmış. Bu hiç anlaşılır değil."* Eski hâl `+500 · 5,00 €` idi. İki kusuru vardı:
  · **Orta nokta EŞİT şeyleri ayırır**, oysa bunlar eşit değil — biri kazanılan birim, öteki onun
    karşılığı. Parantez o astlığı yazının kendisiyle söylüyor: **`+500 (5 €)`**.
  · **`5,00` olmayan bir hassasiyet iddia ediyordu.** Kupon tam eurodur. Kural koşullu yazıldı:
    tam euroda kuruş yok (`5 €`), kesirlide var (`2,50 €`) — sınır aritmetik (`cents % 100`),
    zevk değil.

  Yeni yardımcı `customer-kit/points-value.ts` (`formatPointsValue`); **ortak `formatPrice`a
  DOKUNULMADI** çünkü fiyat için kuruş doğrudur (1,84 ≠ 1,80). Kuruş eki de elle kurulmuyor,
  `formatPrice`in çıktısından siliniyor — binlik ayracı ve € yerleşimi dile göre değişiyor.
  Beş çağıran birden geçti: puan kazanma listesi (rozet + iki cümle), onboarding puan adımı (oran
  + getiren vurgusu), hesap kartı (iki cümle).

  **KEŞİF KARTININ YOKLUĞU ARAŞTIRILDI → MB-75.** Kullanıcı haklı olarak *"tespit ettin ama
  araştırmadın"* dedi. Ölçüm: kartın misafirde çizilmemesi **kasıtlı ve doğru** (MB-58a — davetin
  vaadi puandır, motor kimliksiz oya puan vermiyor). **Ama aynı künye "turun KENDİSİ misafire açık
  kalmaya devam ediyor, misafir sekmeden geçer" diye söz veriyor ve o söz TUTULMAMIŞ:** `/discover`a
  giden üç çağrının üçü de girişli hâle bağlı ve sekme çubuğunda keşif yok. Yani 14.08'in
  düzeltmesi ödül vaadiyle birlikte turu da kapatmış. Karar kullanıcının; kayıt `BACKLOG-musteri`de.

  **Doğrulama:** `tsc` temiz · `lint` temiz (`src` tamamı) · **347 ekran testi**, ikisi yeni yazımı
  iddia edecek biçimde güncellendi. **Cihaz doğrulaması BEKLİYOR:** onboarding tamamlanmış
  işaretli olduğu için yeniden açılmıyor ve puan çekmecesi giriş istiyor — kullanıcı girdiğinde
  hesap kartından bakılacak.

- [x] (21.80) **MİSAFİR KEŞİF TURUNA GİREBİLİYOR — kapanan kapı açıldı (kullanıcı hatırlatması 18.08)**
  → MB-75 kapandı. `touches: apps/mobile/src/screens/home/{home-screen.tsx,messages.json}`

  Kullanıcı `(21.79)`daki kaydı okuyunca hatırladı: *"misafir keşif yaptıktan sonra en son
  seçenekte giriş yapmayı ve puanları toplamayı teklif edebiliriz. Bunu daha önce yapıyorduk
  sanki. Emin değilim."*

  **Ölçüm hatırlamayı doğruladı — karar iptal edilmemiş, HEPSİ ZATEN KURULU:** turun bitiş ekranı
  misafire *"Giriş yaparsanız keşif turları puan kazandırır"* diyor ve "Hızlı doğrulama" düğmesi
  veriyor (MB-14, 14.08); girişsiz oylar cihazda tutulup girişte hesaba bağlanıyor
  (`lib/discover/pending-swipes-store` → `/me/discover/claim`). Yani misafirin emeği kaybolmuyor.
  **Eksik olan tek şey KAPIYDI.**

  **MB-58a'nın (14.08) teşhisi doğruydu, çaresi fazla genişti.** Vitrin kartının cümlesi
  *"tamamlanan tur puan kazandırır"* diyordu ve motor kimliksiz oya puan yazmıyor — misafire
  tutulamayacak bir söz. Çözüm olarak kart TÜMDEN gizlenmiş; oysa `/discover`a giden öteki iki
  çağrı hesap ekranında ve o da misafiri `/login`e itiyor, sekme çubuğunda da keşif yok. Sonuç:
  ödül vaadiyle birlikte turun kendisi de kapanmış, künyesi ise *"tur misafire açık kalmaya devam
  ediyor"* diye yazmayı sürdürmüş.

  **Doğru çare cümleyi düzeltmekti — ve o cümle zaten yazılmıştı.** Bitiş ekranı aynı sorunu AYNI
  GÜN doğru çözmüş: koşullu, gelecek zamanlı, yalansız. Kart artık misafirde o registeri kullanıyor
  (`discover.guestBody`, üç dilde), girişlide eski kesin cümle aynen kalıyor. Vitrin iskeleti de
  kutuya her hâlde yer ayırıyor — eskiden misafirde ayırmıyordu ve kart gelince sayfa bir kutu boyu
  kayardı.

  **Doğrulama:** `tsc` temiz · `lint` temiz · vitrin ve kabuk testleri (**15 test**). **Cihazda
  uçtan uca ölçüldü:** misafir kartı görüyor, basınca tur açılıyor (1/20, kaydırma çalışıyor).

- [x] (21.81) **VİTRİN ARTIK GÜN İÇİNDE SABİT; KOLEKSİYON KATALOĞU BANT OLDU (kullanıcı bulguları 18.08)**
  → `touches: packages/application/src/catalog/featured.ts, packages/application/src/index.ts,
  apps/mobile-api/src/lib/home.ts, apps/mobile/src/screens/{catalog,onboarding}/*`

  **1 · VİTRİN RASTGELELİĞİ GÜNE SABİTLENDİ — iki yüzey aynı kararı ayrı ayrı yürütüyormuş.**
  Kullanıcı anomali listesindeki "koleksiyon sırası değişiyor" maddesini okuyup yönlendirdi:
  *"bilinçli bir karardı… fakat web tarafında bu konuyla alakalı random şeylerin sadece o gün
  içerisinde random olmasını sağlayacak yaklaşımlar var."* Ölçüldü ve yaklaşım bulundu:
  `rotateDaily` (`@lezzet/application`), yani **merkezî**. Web ana sayfası onu kullanıyor
  (`storefront/home.ts:243`); **mobil API ise `Math.random` kullanıyordu**
  (`mobile-api/src/lib/home.ts`). `rotateDaily`nin künyesi bu hâli zaten üç maddede reddetmişti —
  *"sayfa önbelleğini kırar · aynı müşteriye her yenilemede başka vitrin gösterir, vitrin değil
  kumar olur · 'dün gördüğüm koleksiyon neydi' sorusunun cevabı kalmaz"* — ama gerekçe mobilde
  uygulanmamıştı (CLAUDE §1: aynı karar iki yerde, biri ayrışmış).

  **KOMPOZİSYONA DOKUNULMADI** (kullanıcı uyarısı: *"bu dörde iki konusunu değiştirmemen lazım"*):
  hâlâ 4 kategori + 2 koleksiyon, koleksiyonlar işaretliler arasından, altısı rastgele konumlarda
  karışıyor, fotoğraflar kendi havuzundan geliyor. **Değişen tek şey TOHUM.** `rotateDaily`ye
  çevrilmedi çünkü o "havuzu sırayla döndür" der ve bu kompozisyonu ifade edemez; onun yerine
  kardeşi yazıldı: **`dailyRng(now)`** — gün numarasından tohumlanan deterministik üreteç
  (mulberry32; kriptografik değil, çünkü istenen tahmin edilemezlik değil **tekrarlanabilirlik**).
  Gün numarası hesabı `rotateDaily`den çıkarılıp `dayIndex()`e alındı, ikinci kez yazılmadı.
  **Ölçüldü:** uçtan üç ardışık okuma birebir aynı bant dizisini ve aynı fotoğraf kümesini döndü
  (`col:Yeni Gelenler | cat:Fırın | cat:Tatlı | cat:Pasta | cat:Tavuk Ürünleri | col:Çay Saati`).

  **2 · KOLEKSİYON KATALOĞU: KAP TÜMDEN KALKTI, ÇİP RAYI GİZLİ.** Kullanıcı cihazda gördü:
  *"koleksiyon çay saati kartı da çok kötü görünüyor. Böyle kart kart tasarıma dönüşmeye başlıyor
  burası"* ve *"kategori filtre butonları görünmesin."*
  · **İKİ ADIMDA GİDİLDİ VE BİRİNCİSİ YANLIŞTI — kayda geçsin.** Önce kutu kenardan kenara açıldı
    (kum zeminli bant). Kullanıcı onu da eledi: *"renk seçimlerimiz… genel proje tasarımımızdan
    kopuk duruyor."* Haklıydı ve sebebi ölçüldü: **bu ekranın koleksiyon hâli ŞABLONDA HİÇ YOK**
    (`Mobil - Musteri v3` katalog başlığında yalnız arama, süzgeç düğmesi ve çipler var), yani
    16.08'de eklenen zemin de benim seçtiğim ad kademesi de bir tasarım kararına değil TAHMİNE
    dayanıyordu. Küçük bir kutuda göze batmayan kum zemini, tam genişlikte büyük bir renk alanına
    dönüşünce ortaya çıktı. **Kullanıcı seçimi: metin-only.** Kap tümden kalktı; sayfa zemininde
    üstbaşlık + ad + temizle. Ad ise artık tahmin değil ölçüm: vitrindeki koleksiyon bandının
    başlığıyla BİREBİR aynı ikili (Lora `h2-sm`) — bağlantıyı kuran renk değil, kademeydi.
  · **BOŞLUK, İKİ AYRI KAYNAK.** (a) Zemin kalkınca bandın kendi dikey dolgusu `header.gap`in
    üstüne bindi (arama↔üstbaşlık 20 dp, ad↔çizgi 22 dp) — kapsız bir metin bloğunun kendi dolgusu
    olmaz, kaldırıldı, ikisi de 10. (b) Üstbaşlık↔ad arası ise `gap` 4 dp yazmasına rağmen cihazda
    **15 dp** ölçüldü: fark `gap`ten değil, ada AÇIK SATIR YÜKSEKLİĞİ verilmemesinden geliyordu —
    yazı tipi kendi payını ekliyor ve o pay BOYLA BİRLİKTE BÜYÜYOR, yani `gap`i kısmak "Büyük" yazı
    boyutunda sorunu geri getirirdi. Ada vitrin bandının formülü verildi
    (`h2-sm × h1--line-height`, uydurma değil — o bant zaten onu kullanıyor) ve `gap` `2xs`e indi;
    **ölçülen sonuç 15 → 8,7 dp.**
  · **TEMİZLE DÜĞMESİ:** `inlineIcon` (17) + `olive-dark`tı ve *"basılacağı çok anlaşılmayabiliyor"*
    dendi. `headerIcon` (20) + `terracotta` oldu — ölçü zaten bu rolün kendi durağı ("başlık
    satırındaki yuvarlak düğmenin ikonu"), renk ise uygulamanın eylem vurgusu. **Sonra çizgi de
    kalınlaştı** (kullanıcı isteği): ölçeğe ÜÇÜNCÜ durak açıldı — `iconStrokeBold: 2.2`. Uydurulmuş
    değil; `iconStroke` künyesi şablonun 1,5–2,2 arasında gezindiğini ve 2,2'nin "en yakın durağa
    çekildiğini" zaten yazıyordu, o üst uç geri alındı. Seçimi BOY değil ROL yapıyor (`Icon` `bold`
    prop'u): burada kalınlaştıran şey ikonun ölçüsü değil, taşıdığı eylemin ağırlığı. Ham kalınlık
    prop'u bilerek açılmadı — sayı verilebilseydi ikonlar birbirinden habersiz kalınlaşırdı.
  · **ÜSTBAŞLIK DA KIRMIZI TONUNA** (kullanıcı isteği): `olive-dark`tı ve satırda iki ayrı vurgu
    rengi vardı — üstbaşlık zeytin, çarpı terracotta; biri "bilgi" biri "eylem" gibi okunuyordu,
    oysa ikisi aynı şeyin parçası (etkin süzgeç ve onu kaldırma). Yeni ton açılmadı: `terracotta`
    üstbaşlıklarda zaten kullanılıyor.
  · **Çip rayı koleksiyon açıkken çizilmiyor. Bu 16.08 kararını DEĞİŞTİRİR:** o gün "web'de şerit
    gizlenir ama mobilde kalsın, kesit içinde daraltılabilsin" denmişti. Cihazda ölçülünce gerekçe
    çürüdü — koleksiyon süzgeci kategori havuzunu da daraltıyor ve rayda **yalnız "Tümü"** kalıyordu,
    yani daraltacak bir şey sunmayan ölü bir şerit. Artık iki yüzey aynı hizada.

  **3 · HAVALE SATIRININ İKONU.** Onboarding'in ödeme adımında *"Kapıda ödeme"* `home`, *"Havale ve
  vadeli hesap"* ise **`warehouse`** taşıyordu — ikisi de bina silüeti, bir bakışta ayrışmıyorlardı.
  Depo anlamca da yanlıştı: havale bir paranın yer değiştirmesidir. `money`ye alındı; kitte zaten
  vardı, yeni ikon açılmadı.

  **Doğrulama:** `tsc` (mobil + application + mobil API) temiz · `lint` temiz · **1374 birim testi**
  + katalog/onboarding jest paketi (**38 test**). **Cihazda ölçüldü:** koleksiyon kataloğu kenardan
  kenara bant, çip rayı yok, ızgara yerinde.

- [x] (21.82) **SOĞUK ZİNCİR ANLATISI TEK KALIBA İNDİ; İLAN EDİLEN TUTARLAR AYARDAN OKUNUYOR
  (kullanıcı kararı 18.08)**
  → `touches: packages/{helper,application,types,database}/src/**, apps/mobile-api/src/api/v1/{router,delivery-terms}.ts,
  apps/mobile/src/{lib/places,lib/api,screens/{customer-kit,delivery-zones,legal,onboarding}}/*,
  apps/web/app/(customer)/[locale]/{messages.json,legal/{delivery,faq,sales}}/*, apps/web/components/customer/ui/site-frame-messages.json`

  **NEDEN:** kullanıcı A15'te okuduğu cümleyi eledi — *"Her yere kargoyla gönderiyoruz. Yalnız soğuk
  zincir isteyen ürünler gidemiyor. Bu ifade anlamsız geliyor kulağa."* ve doğru kurgusunu verdi:
  **önce ÜRÜN, sonra yol.** Konuyla ilgili müşteriye görünen bütün metinler çıkarıldı (245 satır,
  üç dil, 11 temas noktası) ve tek kalıba indirildi: *"Soğuk zincir isteyen ürünler (donuk ve
  soğutulmuş) → yalnız kendi aracımızla, bölge içi adreslere. Diğer bütün ürünler → her adrese
  kargoyla."*

  **1 · KOD İKİ AYRI GERÇEK TUTUYOR, METİNLER İKİSİNİ EZMİŞ.** `storage_type` (soğuk zincir gerekir
  mi) ile `shippable` (kargoya verilebilir mi) AYRI alanlar — `domain-core/catalog/storage.ts`
  künyesi bunu açıkça yazıyor. Metinlerin çoğu ikisini tek cümlede birleştirip SEBEBİ kural gibi
  yazmıştı; *"soğuk zincir isteyen ürünler gidemiyor"* cümlesi buradan doğuyordu. Aynı ürün kümesine
  dört ayrı ad veriliyordu (*kargolanabilir · dayanıklı · raf ömürlü · gönderebildiğimiz*); tek terime
  indi.

  **2 · MB-74'ÜN KÖKÜ: AYNI SÖZLÜK İKİ KOPYA.** Onboarding'in posta kodu adımı dört hâl cümlesini
  KENDİ `messages.json`ında taşıyordu ve `lib/places` ile birebir aynıydı — biri hariç. Bölge dışı
  cümlesi ayrışmış, onboarding *"Soğuk zincir korumalı kargoyla ulaştırırız"* diyerek kargoya
  veremediğimiz bir şeyi vaat eder olmuştu. Kopya kaldırıldı; onboarding artık ortak sözlüğü okuyor,
  yani cümle bir daha ayrışamaz. Aynı sınıf ikinci kez de yakalandı: mobil SSS'in asgari sepet cevabı
  webinkinden geride kalmıştı (*"hem bölge içi hem kargo gönderiminde geçerlidir"* — 10.08 kararının
  tersi).

  **3 · SAYILAR METİNDEN ÇIKTI, AYARA BAĞLANDI.** Yasal *"Teslimat ve iade"*, SSS ve satış koşulları
  *"Kargo ücreti 7,90 €'dur ve 60 € üzeri siparişlerde alınmaz"* diyordu; ikisi de `settings` satırı
  (`shipping_fee_cents`, `free_shipping_threshold_cents`) ve operatör değiştirebiliyor. Kapı:
  `readPublicDeliveryTerms` (`@lezzet/application`) + `deliveryTermsLines` (`@lezzet/helper`, iki
  yüzeyin ortak cümle kurucusu) + `GET /api/v1/delivery-terms` (açık uç, `pointsRules` emsali).
  Tutarlar **prozanın içine girmiyor, kendi bölümünde** duruyor: native tarafta okuma düşerse bölüm
  tek cümleye iniyor ("sepetinizde görürsünüz") ve sayfanın kuralları anlatan kısmı hiç etkilenmiyor.
  `cod_max_cents` de ham dize olmaktan çıkıp aynı eve taşındı.

  **Posta kodu adımına tutar YAZILMADI ve bu bilinçli:** 13.08 kararı eşiği oradan çıkarmıştı çünkü
  `free_shipping_threshold_cents` KAPSAMLI (global 60 €, ülke 90 €, b2b 250 €) ve adres bazlı bir
  ekranda kanal kapsamlı bir sayı Alman müşteriye yanlış söz verirdi. Tutar yalnız GENEL kuralı
  anlatan yasal sayfada ve adresi çözülmüş sepette yazılıyor; yasal sayfanın not satırı da bunu
  söylüyor.

  **4 · ÜÇ ÇELİŞKİ DAHA KAPANDI.** (a) *Almanya var mı yok mu* — yasal sayfa "Fransa ve Almanya",
  site şeridi "Fransa geneline" diyordu; ikisi de varsayımdı. Küme artık veriden:
  `WarehouseService.listShippingCountries()` (ülke başına bir kargo deposu). (b) *2–4 gün ↔ 2-3 gün*
  ayrışması giderildi. (c) **`chilled` metinlerde hiç yoktu:** kod `requiresColdChain = chilled ||
  frozen` diyor, yasal metin yalnız "dondurulmuş" diyordu — soğutulmuş ürün alan müşteri "benimki
  dondurulmuş değil, kargoyla gelir" diye okurdu.

  **`formatCompactEuro` helper'a terfi etti** (`points-value.ts` → `packages/helper/src/format.ts`):
  ikinci tüketen doğdu ve o tüketen webde de var; kural mobil bir ekranın içinde kalsaydı web kendi
  kopyasını yazardı — `formatPrice`ın 29.07'de yaşadığı ayrışmanın aynısı.

  **Doğrulama:** `tsc` (18 paket) temiz · `lint` temiz · **1374 birim testi** + mobil jest paketi
  (**599 test, 84 dosya**) yeşil. `knip` çıktısındaki 5 dosya/9 ihracat bu değişikliğin DIŞINDA
  (`68cc1030` "sekiz ikiz söküldü" commit'inin web köprüsünde bıraktığı artıklar).
  **BEKLEYEN(21.82):** yasal metnin iki nüshası (web `content.json` ↔ mobil `messages.json`) elle
  senkron tutuluyor; üretici betik ya da paylaşılan içerik paketi hâlâ yok.

- [x] (21.83) **"SOĞUK ZİNCİR İSTEYEN" DİYE BİR ŞEY YOK — ve A TURU KAPANDI (kullanıcı düzeltmesi 18.08)**
  → `touches: apps/mobile/src/{lib/places,screens/{checkout,delivery-zones,legal,onboarding}}/messages.json,
  apps/web/app/(customer)/[locale]/legal/{delivery,faq,sales}/content.json, docs/uygulama/*`

  **1 · DİL DÜZELTMESİ.** Kullanıcı `(21.82)`nin cihazdaki hâline bakıp eledi: *"Soğuk zincir
  istememek diye bir ifade var mı? Doğru ifade nasıl?"* Haklı — ürün bir şey İSTEMEZ, o bir
  gerekliliktir; kodun kendi terimi de bunu söylüyor (`requiresColdChain`). **23 yerde** düzeltildi
  (yalnız TR; FR *"sous chaîne du froid"* ve DE *"mit Kühlkette"* zaten doğruydu):
  · `soğuk zincir isteyen` → **`soğuk zincir gerektiren`**
  · `soğuk zincir istemeyen` → **`diğer bütün ürünler`** — olumsuzu kurmak yerine kümeyi bir kez
    tanımlayıp ötekine "diğer" demek hem daha hafif hem daha Türkçe. "Gerektirmeyen" ancak cümle
    tek başına duruyorsa gerekir; burada durmuyor, hep ikinci cümle.
  Düzeltme `(21.82)`nin yazdığı cümlelerle sınırlı kalmadı: aynı kalıp checkout'un bölge dışı
  bloğunda 18.08'den ÖNCE de vardı, o da alındı.

  **2 · A TURU KAPANDI — A17 ve A14 koşuldu (cihazda, misafir, TR).**
  · **A17 ✓ ama bir açıkla:** beş yasal sayfa ve dokuz soruluk SSS açılıyor, arama ve akordeon
    çalışıyor, `(21.82)`nin *"Güncel tutarlar"* bölümü uçtan gelen değerleri **birebir** basıyor —
    ölçüldü: uç `{shippingFee 790, freeShipping 6000, minBasketRoute 4000, minBasketShipping 0,
    codMax 30000, shippingCountries ["FR"]}` döndü, ekran *"Kargo ücreti 7,90 €; 60 € ve üzeri…"*,
    *"Kapıya teslimde asgari sepet tutarı 40 €"*, *"Kargo siparişlerinde asgari sepet tutarı
    yoktur"*, *"Kapıda ödeme, 300 € ve altındaki…"*, *"Kargoyla gönderim yaptığımız ülkeler:
    Fransa"* yazdı. **İki eski sayı böylece kendiliğinden düzeldi:** metin 500 € ve "Fransa ve
    Almanya" diyordu, ayar 300 € ve yalnız FR. Kuruşsuz biçim de doğru çalışıyor (60 € · 40 € ·
    300 €, ama 7,90 €). **Açık:** sayfaların misafire açık kapısı yok → **MB-76**; ayrıca web dili
    metinde kalmış → **MB-77**.
  · **A14 ✓ — giriş duvarının yeri ölçüldü.** Sepette DEĞİL: misafir 4× ürünle sepeti 53,40 €'ya
    doldurdu (asgari 40 € aşıldı), *"Siparişi tamamla"* açıldı ve ödeme ekranına girdi. Ekran
    sipariş özetini GÖSTERİYOR (4× kalem · ara toplam · genel toplam · *"Teslimat: adres
    seçilince"*); duvar en üstteki kesikli kutu (*"Siparişinizi tamamlamak için hızlı doğrulama"*)
    ve *"Siparişi onayla"* pasif, hemen üstünde gerekçesi yazılı. Yani duvar müşteriyi geri
    çevirmiyor, **ne alacağını gösterip sonra doğrulanmasını istiyor** — doğru sıra. Tur artığı
    temizlendi (sepet 0 ürün).

  **Doğrulama:** `tsc` (mobil) temiz · kalan `isteyen/istemeyen` sayımı **0** · cihazda üç ekranda
  gözle doğrulandı (Nerelere gidiyoruz · SSS · Teslimat ve iade) · `lint` temiz · **1374 birim** +
  **599 mobil jest** yeşil · `pnpm test` 2691/2710 + 19 atlandı (düşen iki dosya `canceling statement
  due to statement timeout`, tek iddia hatası yok — günün üçüncü FARKLI kümesi, altyapı).

  **Durum — WEB YARISI COMMIT EDİLMEDİ (kullanıcı kararı 19.08).** Kullanıcı bu turda yalnız mobil
  tarafın gönderilmesini istedi; yasal metnin web nüshası (`legal/{delivery,faq,sales}/content.json`)
  çalışma ağacında **düzeltilmiş hâlde ama commit edilmemiş** duruyor ve web şeridine bırakıldı —
  `docs/talep/not-web-sogut-zincir-metni-yarim-kaldi.md`. İki nüsha o commit atılana kadar ayrık:
  mobil düzeltilmiş, web'in deposundaki hâli eski. `BEKLEYEN(21.82)`nin işaret ettiği risk tam olarak
  bu — üretici betik olsaydı bu ayrım hiç doğmazdı.

  **KÜNYE KAYMASI (CLAUDE §0, yaşandı 19.08).** Bu görev satırı ve `docs/build/README.md`'nin 21
  sayacı, mobil şeridin commit'ine değil **`3d0d2d4b` (sefer/kurye)** commit'ine girdi — o commit
  çalışma ağacında bekleyen dosyaları birlikte almış. Kod kayıp değil ama gerekçesi başka künyenin
  altında ve `git log docs/build/21-mobil-uygulama.md`'den bu iş bulunamıyor. Tarih yeniden
  yazılmadı: geri alma kullanıcının kararıdır.

- [x] (21.84) **B2B ALANI BÜTÜN ALINDI — adres bloğu tekleşti, sessiz kayıt söylendi; FATURA ise
  ölçüldü ve yazılmadı (kullanıcı kararı 19.08)**
  → `touches: apps/mobile/src/screens/{customer-kit/{address-fields.tsx,address-form.tsx},professionals/*},
  docs/uygulama/BACKLOG-musteri.md`

  Kullanıcı listeyi görüp bloğu seçti (*"B2B alanı bütün"* — CLAUDE §4: iş birimi talep değil
  ALANDIR). Dört kalem ölçüldü; **üçü kayıtta yazandan farklı çıktı.**

  **1 · MB-06 KAPANDI — paylaşılacak şey formun tamamı değil, ALAN BLOĞUYMUŞ.** Ölçüm kaydın
  teşhisini doğruladı: `address-form` kaydı KENDİSİ yazıyor (`createAddress`), oysa B2B'de adres
  bir kayıt değil başvuru gövdesinin parçası — o yüzden form olduğu gibi kullanılamıyordu ve
  başvuru ekranı üç düz `TextField` yazmıştı. Yeni `customer-kit/address-fields.tsx` BAN aramasını,
  posta kodu önerisini, çok yerleşimli kodun şehir listesini ve ülke türetimini taşıyor; kalıcılık
  çağıranda kaldı. Sözcükler ve alan biçimi prop'tan geçiyor (`copy`/`shape`/`withLabels`):
  **paylaşılan şey CÜMLE değil DAVRANIŞ** — iki ekranın kelimelerini tek sözlüğe hapsetmek,
  çözdüğümüz ayrışmanın başka türlüsü olurdu. Yan kazanç: posta kodu + şehir genişliği de tekleşti.

  **2 · MB-12 KAPANDI — ve kaydın bir yeri yanlıştı.** Adres **onayda değil, başvuru GÖNDERİLİRKEN**
  yazılıyor (`customer/b2b.ts`), yani kabul edilmeyen aday bile deftere giriyor. Davranış DOĞRU ve
  gerekçesi kodda: adres yoksa operatörün onay kartındaki rota sinyali *"ölçülemedi"* kalıyor.
  Kusur davranışta değil **sessizlikteydi** — alanların altına tek satır kondu (üç dilde).
  Adresi ayrı tutma seçeneği elendi: sinyal yeniden körleşir, müşteri aynı adresi iki kez yazardı.

  **3 · MB-33 KAPANDI — ÖLÇÜM KAYDI ÇÜRÜTTÜ, kod değişmedi.** Dayanak *"müşteri başlığı tek başına
  okuyor"*du; ekrana giden tek kapı vitrindeki davet kartı ve o kart *"Restoran ya da market
  misiniz? Toptan fiyatlar için profesyonel hesap açın."* diyor — müşteri ne olduğunu başlığı
  okumadan önce biliyor, üstelik başlığın altındaki üstbaşlık da yerel. Başlığı çevirmek web'le
  ayrışırdı, kazancı yoktu.

  **4 · MB-44 SIRAYI ŞAŞIRMIŞ, ve YENİ BİR AÇIK ÇIKTI (MB-78).** Kullanıcı *"fatura konusunu
  sistemden önce incele"* dedi; sistem geneli tarandı. `DOMAIN §9` net: **hiçbir resmî belge
  sistemde üretilmez**, fatura muhasebeden gelir, sitede indirme yok — ve kod bunu birebir
  uyguluyor (`reference_no` ≠ fatura no · `invoice_no` dıştan eşleşiyor · teslim maili *"resmî
  fatura değildir"* diyor · muhasebe export'u 14 sütunla muhasebeciye veri veriyor). Yani
  *"B2B'de ayrı fatura e-postası"* **olmayan bir postanın adresini sormak** olurdu.
  Asıl açık başka: **faturanın nereden alınacağı hiçbir müşteri yüzeyinde yazmıyor** — CGV'de
  fatura maddesi yok, SSS'te soru yok, ama gizlilik sayfası faturadan bahsediyor ve teslim maili
  *"bu fatura değil"* diyor. B2B'de bunun yasal ağırlığı var. **Metin YAZILMADI:** kullanıcıya
  *"müşteri faturasını bugün fiilen nasıl alıyor?"* diye soruldu, cevap **"henüz belirlenmedi"** —
  süreç kurulmadan cümle yazmak tutamayacağımız bir söz vermek olurdu. Kayıt `MB-78`, MB-44'ü de
  bloke ediyor.

  **Doğrulama:** `tsc` (mobil) temiz · mobil jest **84/84 · 599/599** yeşil. İlk koşuda sekiz paket
  düştü: biri GERÇEKTİ (başvuru testi eski `pro-line1` kimliğini arıyordu — bloğa geçince
  `pro-address-line` oldu), kalanı MB-38'in kayıtlı yük kırılganlığıydı (`app-shell` ·
  `operations-shell`) ve ikinci koşuda kendiliğinden temizlendi — defterdeki desenin birebir aynısı.

  ~~**Durum — cihazda doğrulanmadı:** mobil API (3002) bu oturumda düşmüş durumda~~ →
  **CİHAZDA DOĞRULANDI (26.08 turu, CPH1907):** elle giriş modunda "Rue et numéro"ya
  "8 rue de la Mesange" yazıldı, BAN önerileri geldi (dört şehirden "8 Rue des Mésanges" +
  Etalab lisans atfı), öneri seçilince sokak + posta kodu + şehir üçü birden doldu
  (53200 · Château-Gontier-sur-Mayenne). Form gönderilmedi — doğrulama görsel/akıştı.

- [x] (21.85) **FIRSAT KARTI ARTIK GERÇEĞİ SÖYLÜYOR — "YALNIZ BUGÜN"ün arkasında hiçbir veri yokmuş
  (kullanıcı bulgusu + kararı 19.08)**
  → `touches: apps/mobile/src/screens/home/{home-screen.tsx,messages.json}, docs/uygulama/BACKLOG-musteri.md`

  Kullanıcı cihazda gördü ve **soru olarak** getirdi: *"Gerçekten sadece bugüne özel bir indirim mi
  yoksa bugün son günü mü? Ya da bu metin neden burada yazıyor?"* Ölçüldü: **ikisi de değil.** Satır
  koşulsuz basılan sabit bir dizeydi (*"STOKLA SINIRLI · YALNIZ BUGÜN"*), sözleşmede bitiş anı diye
  bir alan yoktu ve fırsat bir kampanya değil — **SKT'si yaklaşan bir partiden doğuyor**, kimse
  seçmiyor. `design/BACKLOG.md` bunu zaten yazmıştı: *"kimse seçmez ve süresi yoktur."*

  **Bu, 09.08'de KALDIRILAN özelliğin hayatta kalan ikiziydi.** O gün "GÜNÜN FIRSATI · {süre} KALDI"
  bandı tam bu gerekçeyle sökülmüştü — *"ekranın en görünür yerinde tutulamayacak bir söz olurdu:
  sayaç işleyip biter, arkasında kampanya olmaz"*. Bant gitti, aynı yalanı söyleyen tek satır kaldı.
  Fransa'da bunun adı da var: ürünün sınırlı süreyle sunulduğuna dair yanlış beyan.

  **Çare uydurmak değil, ELDEKİ SAYIYI kullanmaktı.** Gerçek sınır gün değil ADET: `limitLabel`
  (teklif fiyatı partiye bağlı, kalandan fazlası normal fiyata taşar — DOMAIN §5). Alan mobil
  sözleşmede zaten vardı ve **ürün detay ekranı doğru kullanıyordu**; yalnız vitrin kartı yok
  sayıyordu. Web'in sözlüğü de dürüsttü (*"Stokla sınırlı"* + *"En fazla {n} adet"*) — ayrışan tek
  yer bu karttı.

  **İki kademe, kullanıcı kararı:** *"Belirli bir adetten fazla ise stoklarla sınırlı diyelim. Fakat
  belli bir adetin altındaysa son üç adet de sinirli bir ifade kullanabiliriz."* → eşiğin üstünde
  `STOKLA SINIRLI`, altında `SON {n} ADET`, sınır yoksa **satır hiç çizilmez** (CLAUDE §1: yok olan
  şey sıfır değildir). Eşik parametrik: `LAST_FEW_THRESHOLD = 5` — bir SUNUM kararı, iş kuralı
  değil (CLAUDE §4: eşik sorulmaz, makul varsayılan konur ve parametrik yapılır).

  **Cihazda doğrulandı:** uç `limitLabel` 14/12/10 olan üç fırsat döndü, üçü de eşiğin üstünde ve
  kartlar `STOCK LIMITÉ` yazdı — *"AUJOURD'HUI SEULEMENT"* gitti. **`SON {n} ADET` dalı cihazda
  üretilemedi:** bir partide kalanı 5'in altına düşürmek gerekirdi, o yerel veriye müdahaledir ve
  kullanıcının kararıdır.

  **BEKLEYEN(MB-79):** sözlükteki `flash` blokları (`GÜNÜN FIRSATI · {time} KALDI` · `SÜRE DOLDU`)
  üç dilde hâlâ duruyor ama hiçbir yerde kullanılmıyor — 09.08'de blok kalkarken sözlük
  temizlenmemiş. Ayrı iş değil, bir dahaki dokunuşta silinsin.

  **Doğrulama:** `tsc` temiz · mobil jest **84/84 · 599/599** (ilk koşuda iki paket düştü, ikinci
  koşuda temizlendi — MB-38'in kayıtlı yük kırılganlığı).

- [x] (21.86) **YASAL METİN ARTIK UYGULAMAYI ANLATIYOR — ve gizlilik metni olmayan bir mekanizmayı
  tarif ediyormuş (MB-77, 19.08)**
  → `touches: apps/mobile/src/screens/legal/messages.json, docs/uygulama/BACKLOG-musteri.md`

  A17 turunda üç cümle görülmüştü; sözlüğün tamamı taranınca **sekiz yer** çıktı ve ağırlık merkezi
  başka yerdeymiş.

  **1 · YERLER.** *"Posta kodunuzu **sitenin üst şeridinde** değiştirebilirsiniz"* → uygulamada üst
  şerit yok, vitrinin başındaki bölge hapı var. *"**checkout**'ta sürprizle"* → müşteri dili değil,
  adımın adı *"Siparişi tamamla"*. SSS'in *"**Site** ve e-postaların dilini"* sorusu → uygulamada
  dil Hesabım'dan değişiyor (ölçüldü: `account-screen.tsx` `setAppLocale`). Üçü de yanlış bilgi
  vermiyordu ama **olmayan bir yeri tarif ediyordu**; müşteri aradığını bulamazdı.

  **2 · ASIL BULGU — GİZLİLİK METNİ ÇEREZ VE TARAYICI ANLATIYOR.** *"Çerezler ve tarayıcı kaydı"*
  başlığı, *"Tarayıcınızda tutulanlar…"*, *"tarayıcıdaki sepetiniz … tarayıcıdan silinir"*, *"posta
  kodu tarayıcınızda saklanır"* — **uygulamada ne tarayıcı var ne çerez.** Ölçüldü: oturum
  `expo-secure-store` ile işletim sisteminin güvenli kasasında (iOS Anahtar Zinciri · Android
  Keystore), ilk açılış işareti `Settings`te (`device-store.ts` künyesi). Başlık *"Cihazınızda
  saklananlar"* oldu ve **saklama yeri adıyla yazıldı** — GDPR metninin işi zaten bu.

  **3 · BİLEREK DOKUNULMADI.** §6'nın ikinci paragrafı *"Sayfaların ne sıklıkla görüntülendiğini
  ölçüyoruz"* diyor; **MB-63 ölçtü, native'de sıfır analitik çağrısı var** — yani bugün doğru değil.
  Silinmedi: fazladan beyan gizlilik metninde müşterinin aleyhine bir kusur değil (eksik beyan
  öyledir), **ve MB-63 kapandığı gün cümle kendiliğinden doğru olacak.** Bugün silip yarın geri
  yazmak, düzelttiğimiz hatanın ters yönlüsü olurdu.

  **4 · KULLANICI KARARI BEKLİYOR.** Metinlerde *"site"* tüzel bağlamda da geçiyor (*"Site sahibi"*,
  *"Bu site … barındırılmaktadır"*, *"bu site üzerinden yapılan tüm satışlar"*). Bunlar olmayan bir
  yeri tarif etmiyor, hizmetin adı olarak duruyor — ama uygulamada okununca tuhaf. Değiştirmek bir
  HUKUK METNİ kararı ve web nüshasını da ilgilendiriyor; tek başıma yazmadım.

  **Doğrulama:** `tsc` temiz · mobil jest **595/599**, düşen dört testin dördü de MB-38'in kayıtlı
  ailesi (rota durumu okuyanlar) ve **hiçbiri yasal metne bakmıyor**. Bu kez "kırılgan" deyip
  geçilmedi, ölçüldü: **yük ortalaması 22.96 · paket süresi 11 sn → 58 sn · `app-shell` tek başına
  3/3 yeşil.** Ölçüm MB-38'e sayısal kanıt olarak işlendi.

- [x] (21.87) **YASAL BELGELERİN KAPISI AÇILDI — ve ikisi HİÇ KİMSEYE açık değilmiş (MB-76, 19.08)**
  → `touches: apps/mobile/src/screens/legal/{legal-links.tsx,messages.json}, apps/mobile/src/screens/{home/home-screen.tsx,account/account-screen.tsx,checkout/{checkout-screen.tsx,messages.json}}, apps/mobile/src/app/legal/[page].tsx`

  **ÖLÇÜM KAYDI GENİŞLETTİ.** MB-76 *"misafirin kapısı yok"* diye açılmıştı; sayılınca sorun daha
  büyük çıktı. Beş belge var (`terms` yasal bilgiler · `sales` satış koşulları · `privacy` ·
  `delivery` · `faq`), uygulamada `/legal/[page]`e giden **dört çağrı**: hesap menüsü (`delivery`),
  veri kartı (`privacy`), giriş ekranı (`privacy`), sayfaların kendi çıkış bantları. Bantların
  yönü de ölçüldü — `delivery → faq`, `privacy → account`, `sales → delivery`, `terms → sales`.
  Yani **`sales` ile `terms`e giden hiçbir yol yok**: girişli müşteri de dahil, uygulamanın hiçbir
  yerinden açılmıyorlar; yalnız deep-link ile geliyorlar. Fransız tüketici mevzuatında satış
  koşulları ile künyenin erişilebilir olması zorunlu.

  **MİSAFİR KAPISI SANILDIĞI YERDE DEĞİLDİ.** Kaydın önerdiği yer *"hesap duvarının altı"*ydı; ama
  `account-routes.test` şunu kanıtlıyor: misafir hesap sekmesine dokununca **doğrudan `/login`e
  itiliyor** (08.08 kararı), duvar ancak girişten VAZGEÇENE görünüyor. Oraya konan kapı bu yüzden
  tek başına yetmezdi.

  **YAPILAN — tek blok, İKİ yer.** `screens/legal/legal-links.tsx`: beş belgeyi web altbilgisinin
  sırasıyla listeliyor (künye → satış koşulları → gizlilik → teslimat → SSS). Sıra dizide, sözlükte
  değil — web künyesinin gerekçesi: hangi sayfaların olduğu dile göre değişmez, sözlüğe gömülen bir
  liste bir dilde eksik kalabilir. Adlar da yeniden yazılmadı, `pages.<anahtar>.title` okunuyor.
  Blok **hesap ekranında** duruyor (girişli gövde + misafir duvarı) — belgelerin kalıcı evi.
  Menüdeki teslimat kısayolu ve veri kartındaki gizlilik bağı **KALDI**: onlar bağlamsal kısayol,
  blok listenin tamamı — web'de de ikisi bir arada (hesap sayfasının gizlilik bağı + altbilgi),
  sökseydik iki yüzey ayrışırdı.

  **VİTRİNE DE KONDU, SONRA GERİ ALINDI (kullanıcı ölçütü 19.08) — ve gerekçesi kayda değer.**
  İlk yazımda blok vitrinin dibine de konmuştu; gerekçe web altbilgisinin her sayfada durmasıydı.
  Kullanıcının koyduğu ölçüt bunu çürüttü: *"doğru yerde, doğru bilgiyi, doğru miktarda; devlet
  nerede neyi göstermemizi istiyorsa o kadar."* Kanunun istediği belgelerin **ERİŞİLEBİLİR** olması,
  her ekranda **GÖSTERİLMESİ** değil. Web'de altbilgi sayfanın zaten parçası; native'de vitrin
  alışverişin kendisi ve oraya konan beş satırlık hukuk listesi müşteriyi gereksiz yorar. Kaldırıldı.
  Sözleşme öncesi bilginin yeri ayrı ve zaten karşılandı: **checkout** — kanunun *"satın almadan
  önce"* dediği an odur ve misafir hesapsız sipariş zaten veremiyor.

  **CHECKOUT'TAKİ AÇIK AYRIŞMAYDI, EKSİKLİK DEĞİL.** Web onay düğmesinin altında *"Onaylayarak
  satış koşullarını kabul etmiş olursunuz"* + bağ yazıyor (`checkout-steps.tsx:596`); native'de
  **hiç yoktu** — müşteri kabul ettiği metni ne görüyor ne açabiliyordu. Aynı cümle, aynı yer, aynı
  ayrı-satır kalıbı üç dilde taşındı. Tek sapma boy: web `text-micro` kullanıyor, burada `body-sm`
  (14) — MB-46'nın ölçütü (*karar için okunan metin 14'ün altına inmez*). Hemen üstteki kampanya
  onayı `helper`da kaldı, çünkü o isteğe bağlı.

  **Yan bulgu:** `app/legal/[page].tsx` künyesi çağıranları *"giriş ekranı, hesap menüsü, checkout
  ve sipariş detayı"* diye sayıyordu — checkout o gün bağ vermiyordu, sipariş detayı ise çoktan
  `/support`a geçmişti (kendi künyesi yazıyor). Künye ölçülen listeyle değiştirildi.

  **AYNI ÖLÇÜTÜN İKİNCİ SONUCU — `(21.86)`'nın "bilerek dokunulmadı" kararı GERİ ALINDI.** Dün
  gizlilik metnindeki *"Sayfaların ne sıklıkla görüntülendiğini ölçüyoruz…"* paragrafı, MB-63 ölçümü
  native'de **sıfır analitik çağrısı** bulmuş olmasına rağmen *"fazladan beyan zararsızdır"* diye
  bırakılmıştı. Kullanıcının ölçütü bunu bozuyor: **gereksiz bilgiyle kendimizi sorumluluk altına
  sokmayız.** Paragraf yapmadığımız bir işlemi beyan etmekle kalmıyor, bir de yöntem sözü veriyordu
  (*"çerezsiz, her gün değişen ve ertesi gün atılan anahtar"*) — yani tutmamız gereken bir taahhüt
  üretiyordu, hem de karşılığı olmayan bir şey için. Üç dilde de **silindi**; ölçüm gerçekten
  başladığında paragrafı MB-63'ü yazan kurduğu mekanizmayla birlikte yazar. Not MB-63'e düşüldü.

  **ÜÇÜNCÜ SONUÇ — SESSİZ ALINAN BİR İZİN BULUNDU (yeni bulgu, kalem açılmadı çünkü aynı turda
  kapandı).** Hesap ekranındaki *"Buraya teslimat açılsın istiyorum"* düğmesi, kampanya iletişiminin
  **e-posta kanalını sessizce AÇIYORDU** (`sendZoneInterest` → `toggleConsent('email', true)`) ve
  ekranda bunu söyleyen tek kelime yoktu; metin yalnız *"açık bıraktığınız kanaldan haber veririz"*
  diyerek zaten açık bir kanal varmış gibi konuşuyordu. Müşterinin niyeti BİR HABER almaktı, kampanya
  iznine evet demek değil. İzin **kaldırılmadı** — kaldırılsaydı düğme boş söz verirdi (talebin
  kendisini yazacak tablo yok, `BEKLEYEN(21.15)`) ve hat açıldığında kimseye ulaşamazdık. Yapılan:
  **ne olacağı önceden söylendi** — kanal kapalıyken düğmenin üstünde tek satır çıkıyor ve geri
  almanın yerini de gösteriyor (*"…yukarıdaki anahtardan istediğiniz an kapatabilirsiniz"*, üç dilde).
  Böylece izin bilinçli bir eylemle veriliyor. Dar kapsamlı *"yalnız bu haber"* izni ayrı bir alan
  ister; o, talep tablosuyla birlikte gelecek.

  **Doğrulama:** `tsc` temiz · `lint` temiz · `knip` yeni bulgu yok · mobil jest **84/84 · 599/599**
  (yük 13,55). Üç dilin gizlilik §7'si silmeden sonra da eşit uzunlukta — paritenin makine kontrolü.
  Ara koşularda `app-shell`/`operations-shell`/`account-routes` düştü ve **üçü de tek başına yeşildi**
  (5–7 sn; tam koşuda 12–19 sn): MB-38'in kayıtlı ailesi, hiçbiri yasal bloğa bakmıyor.
  ~~**Cihaz turu YAPILMADI**~~ → **CİHAZDA DOĞRULANDI (26.08 turu, CPH1907):** yasal kapılar
  iki dilde görüldü (TR admin: Yasal bilgiler içerikli açıldı — şirket kimliği/yayın
  sorumlusu/barındırma; FR Claire: Mentions légales · CGV · confidentialité · livraison · FAQ).
  İzin satırı GERÇEK koşulunda görüldü: Lyon varsayılan adres yapılınca "Vous êtes hors de notre
  zone" bloğu doğdu ve iki kanal da kapalıyken düğmenin üstünde kalın izin cümlesi çıktı
  ("nous activerons le canal e-mail — vous pouvez le désactiver à tout moment…"), düğme
  "Je veux la livraison ici". Düğmeye basılmadı (izni açardı); davranış jest'te çivili.
  Tur sonrası müşteri verisi geri kondu: varsayılan adres Strasbourg'a, e-posta anahtarı
  açığa, cihaz bölgesi 67000'e döndürüldü.

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

- [ ] (21.88) **NATIVE BİLDİRİM ALTYAPISI — kurulacak, kullanımı sonraya** *(kullanıcı kararı 19.08:
  "biz bir kere native notifikasyon özelliğini ekleyeceğiz, bunun kaçarı yok. Diğer taraftan bunu
  kullanmayı sonraya erteleyebiliriz")*

  **BUGÜN HİÇ YOK — ölçüldü 19.08.** `packages/notify` sürücüleri yalnız **e-posta + WhatsApp**
  (`drivers/{email,wa-link,whatsapp-api}`); `apps/mobile/package.json`da **`expo-notifications` yok**;
  müşteri bildirim ekranı **yer tutucu** (`app/notifications.tsx` → `ScreenPlaceholder`) ve okunmamış
  sayacı gerçek ekranda **sabit 0** (`home-screen.tsx:163`). Yani zil var, çalan bir şey yok.

  **Bu bir GÖREV değil MODÜL boyu iş** ve kapsamı bilinerek yazılıyor: izin akışı (iOS soruyor) ·
  cihaz jetonu kaydı + jeton tablosu · Expo push servisi · `notify`ye yeni sürücü · operatöre
  gönderim ekranı · **pazarlama izni** (push pazarlaması da izin ister — `(21.87)`de açılan izin
  hattının devamı) · sıklık sınırı. Ayrı bir modül dosyası açılması gerekebilir;
  `docs/talep/bildirim-modulu-web-mobil.md` zaten bu konunun defteri.

  **SIRA (kullanıcı 19.08):** önce ucuz %80 — kampanyanın vitrinde ve katalogda görünmesi
  (`08.44`), sepetin açıklaması (`08.43`, tamam), paylaşımın gerçek adres taşıması (`08.45`),
  sonra uygulama içi bildirim listesi; **push en sonda.** Gerekçe: push'un açacağı bir varış
  noktası olmalı; bugün duyurulacak kampanyanın kendi yüzü bile yok.

- [x] (21.89) **SEPET ONARIMI — donmuş görünüm · dokunma çakışması · paket toplama girmiyordu (20.08).**
  `touches: packages/database/src/services/cart.service.ts, packages/database/src/index.ts, apps/mobile-api/src/api/v1/cart.ts, apps/mobile/src/{lib/api/cart.ts,components/ui/{pressable-surface,text-action}.tsx,screens/{customer-kit/{cart-store.ts,quantity-stepper.tsx},cart/**,checkout/checkout-screen.tsx}}`

  Kullanıcı "sepette artı çalışmıyor" dedi; ölçüm dört ayrı arıza çıkardı ve üçü aynı aileden.

  **1. Ekran sunucunun cevabını uygulamıyordu.** `(21.22)` sonrası 10.08'de sepet adrese bağlanırken
  ekrana İKİNCİ bir okuma eklenmişti (`useAddressCartView`) ve yalnız dil/adres/kupon değişince
  yenileniyordu — adet bunlardan biri değil. Ölçüm (cihaz, aracı ile gövde kaydı): `PATCH` **200**,
  cevap `qty:4 · itemCount:4`, veritabanı **4**, ekrandaki satır **2**, başlık **"4 ürün"**. Ekran
  kendi kendini yalanlıyordu. Çare ikinci okuma DEĞİL, tek okumanın doğru yere sorulması: yer artık
  depoya bildiriliyor (`setPurchasePlace`), `useAddressCartView` **silindi**. 10.08'in kararı duruyor.

  **2. "+" düğmesine basmak ürünü SİLİYORDU.** Sayaç ile "kaldır" arasında 6 dp var, ikisi de 12 dp
  görünmez dokunma payı alıyor; "kaldır"ın eteği çizili "+" düğmesinin içine **16 px** giriyordu ve
  çakışan bölgeyi ağaçta sonra gelen kazanıyordu. Ölçüm: "+"ın görünen kutusuna dokunmak satırı
  sildi (**5 adet → 0 kalem**). Çare payı komşuya bakan yönden çekmek (`compactEdges`); aralık
  6 → 10 dp. Ölçüm sonrası dokunma alanları **705 ↔ 732**, 27 px pay.

  **3. Paket sepetin toplamına girmiyordu** — `BEKLEYEN(21.14)`ün kapanışı. Mobil paketi sunucuya
  hiç yazmıyordu çünkü `setQty`/`removeItem` satırı yalnız varyantla adresliyordu. Ölçülen zarar:
  ekranda **96,92 €**'luk sepet, alttaki bar **14,85 €**, "asgari sepete 22,54 € eksik" ve sipariş
  düğmesi kilitli. Web ise paketi yazıyordu (`cart.replace` → `itemOfEntry`), yani 09.08'in "sepet
  iki yüzeyde paylaşılır" sözü paketlerde tutmuyordu. Servis imzası satır anahtarına geçti
  (`CartRef`), uçlar `/items/:lineId` + `?kind=bundle` ile adresliyor, istemcinin üç paket kapısı
  ürün kapılarıyla aynı yoldan geçiyor. Ölçüm sonrası: paket sunucuda (`PAKET 3c218158 × 1`), ara
  toplam **39,64 €** = 3,50 + 17,45 + 18,69, başlık 8 ürün (çift sayım yok), paketin "+/−/kaldır"ı
  çalışıyor.

  **4. İyimser yazım ekrana ulaşmıyordu** *(kullanıcı kararı 20.08: "kullanıcı arayüzü güncellemesi
  1st olmalı")*. `commit` iyimserdi ama yamayı yerel niyet listesine yazıyordu, ekran ise görünümü
  çiziyor. Yama ekranın okuduğu yere taşındı: adet · satır toplamı · `itemCount` · **ara toplam** ·
  **genel toplam** · asgari sepet — hepsi sözleşmenin kendi alanları üzerinde düz aritmetik.
  İndirim HESAPLANMAZ, sunucunun son cevabından taşınır. Sunucu aynı şeyi söylüyorsa yeni yayın
  YAPILMAZ (`sameView`) — kullanıcının isteği: "değişiklik varsa değiştiririz, yoksa gereksiz bir
  state değişikliği oluşturmayız". Ölçüm: dokunuşun anındaki karede ara toplam **32,65 → 36,14 €**,
  bar **30,56 → 34,05 €**; sunucu cevabı toplamı 33,53 €'ya çekti (kampanya büyüdü).

  **5. Fiyat her dokunuşta ZIPLIYORDU** *(kullanıcı 20.08: "bu hâliyle kabul edilemez")*. İyimser
  toplam, sunucunun bir önceki İNDİRİM TUTARINI taşıyordu; oran tabanlı kampanyada sepet büyüdükçe
  o tutar eskiyor ve cevap gelince toplam ikinci kez oynuyordu (ölçüm: bar 34,05 € → 33,53 €).
  Çare ikinci bir hesap DEĞİL, **motorun kendisini istemcide çağırmak**: `applyBestDiscount`
  (`@lezzet/domain-core`) — sunucunun `resolveCartDiscount`u da onu çağırıyor. Sözleşme üç şey daha
  taşıyor: satırda `categoryId`+`collectionIds`, görünümde `discountRules` (**yalnız otomatik,
  `codes` SÜZÜLMÜŞ** — kupon kodlarını istemciye göndermek herkese geçerli kod listesi vermektir),
  `customerDiscountPercent`+`isFirstOrder`. Kupon yolunda ve adı bilinmeyen YENİ kampanyada motor
  çalıştırılmaz, sunucu beklenir. Ölçüm sonrası: bar 70,02 € → dokunuşun anında **72,98 €** →
  sunucu cevabından sonra **72,98 €**; özet de kendi içinde tutarlı (72,28 − 5,23 = 67,05).

  **Durum:** beşi de cihazda doğrulandı (Android, CPH1907). `typecheck` · `lint` temiz, mobil
  birim testleri 599/599, çalışma alanı birim testleri 1375/1375.

  **~~Açık kalan: oturum tazelenirken 401 dönen okuma sepeti bir an BOŞ gösteriyor~~ → KAPANDI
  (20.08, cihazda ölçüldü, arıza YOK.)** Şüphe `refreshView`in boş dalıydı: sunucuda kurulmuş
  sepette yerel niyet listesi boş olduğu için 401 gelince `EMPTY_VIEW` yayınlanır sanılıyordu.
  Kablosuz `adb` ile ölçüldü — mobil API (**3002**, 8787 DEĞİL: orası `@lezzet/backend`) kısa süre
  yerine `GET /api/v1/me/cart`e 401 dönen bir vekil konarak. Tehlikeli koşul birebir kuruldu:
  soğuk açılış → sunucu sepeti benimsendi (`adopted` yalnız bu cihazın eklediği satırları yazar,
  yani niyet listesi GERÇEKTEN boştu) → sonra 401. **Sepet boşalmadı:** 18 kalem, satırlar ve
  `96,46 − 6,80 = 89,66 €` yerinde. Kullanıcı kararı: *"gerçekleştirilemediyse yoktur"* — kapandı,
  koda dokunulmadı.

  Kullanıcının bildirdiği "sepet bir anda boşalıyor" belirtisinin gerçek sebebi **Fast Refresh**:
  dosya değişince paket yeniden yükleniyor ve modül düzeyindeki `let state` sıfırlanıyor (sepet
  bellekte, kalıcı kaydı yok). Geliştirme ortamına özgü; üründe karşılığı yok.

  **Aynı turda ölçülen, ASIL soru (kullanıcının işaret ettiği):** oturum düşmüşken "Siparişi
  tamamla" ne yapıyor? Cevap doğru — onay düğmesi DEVRE DIŞI, iki ayrı uyarı ("Hesabınızı
  okuyamadık…" · "Sipariş seçenekleriniz şu an okunamadı.") ve kapı metni ("Devam etmek için hızlı
  doğrulama gerekli.") çıkıyor; bağlantı gelince tekrar düğmeleri kimlik/adres/teslimat/ödeme ve
  özeti tam getiriyor. Oturumsuz yanlış sipariş açmak mümkün değil.

  **~~AÇIK MADDE: okunamayan sepet 0,00 € çiziliyor~~ → KAPANDI (20.08, temiz akışta ÜRETİLEMEDİ.)**
  Sepette 18 kalem varken checkout özeti bir kez `Ara toplam 0,00 € · Genel toplam 0,00 €` hâline
  düşmüştü. Mobil API tamamen kapatılıp (bağlantı reddi — 401 değil) dört senaryo sırayla ölçüldü:
  (1) checkout yüklüyken arka plan→dönüş, (2) teslimat günü seçme, (3) ödeme seçip **Siparişi
  onayla**, (4) sipariş gerçekten açıldı mı. Hiçbirinde sıfırlanma yok — tutar `89,66 €`da kaldı,
  onay *"Sipariş gönderilemedi — bağlantınızı kontrol edip tekrar deneyin."* dedi ve DB'de yeni
  sipariş oluşmadı (tek kayıt 19.08'den). İlk gözlem sunucunun isteğin ortasında yeniden doğduğu
  kirli pencerenin ürünüymüş. Aynı şey "son değişiklik geri alındı" gözlemi için de geçerli.
  Kullanıcı kuralı: *"gerçekleştirilemediyse yoktur"*.

  **Web'de aynı zıplama duruyor**
  (kullanıcı orada da doğruladı) — alan web şeridinin, not bırakıldı
  (`docs/talep/not-web-sepet-indirim-ziplamasi.md`). Aynı notta kayıtlı ikinci borç: `viewWithEntries`
  `@lezzet/application`da ve mobil onu çağıramıyor (`@lezzet/database` bağı RN bundle'ına giremez),
  bu yüzden `cart-store`daki `viewWithQty` onun İKİZİ — saf birleştirme `domain-core`'a terfi
  ettiğinde silinecek → `BEKLEYEN(21.89)`.

- [x] (21.90) **CHECKOUT TOPLAMI PAKETİ SAYMIYORDU — okuma kapıyı geçmiyordu (20.08).**
  `touches: apps/mobile-api/src/api/v1/checkout.ts, apps/mobile/src/screens/checkout/checkout-screen.tsx`

  Cihaz turunda yakalandı: aynı karede özet paketi listeliyor ve ara toplama katıyor, **genel
  toplam saymıyordu** — `92,97 − 6,28 = 86,69` iken ekranda **49,31 €**; fark tam olarak paketin
  37,38 €'su. Ekran kendi kendini yalanlıyordu.

  Sebep tek satırdı: `readCheckoutSnapshot` paket kapısını (`CartBundlePort`) kabul ediyor ve
  `placeOrder` onu GEÇİYOR, ama `/me/checkout` OKUMASI geçmiyordu. Kapısız çözülen paket satırı
  `orphanLine`a düşüyor (adı boş, fiyatı `null`, engelli) ve fiyatsız satır toplama girmiyor.
  Sipariş açılırken kapı zaten geçildiği için müşteri DOĞRU tutarı ödeyecekti — yanlış olan yalnız
  gördüğü tutardı; ikisinin ayrışması "gördüğüm ile tahsil edilen" arızasının ta kendisi.

  Ekranda da 21.89'un ikizi duruyordu: paketi eleyen yerel süzgeç (`localBundleIds`) ve özete
  yerelden yazılan paket satırı. İkisi de söküldü — paket artık `orderedLines`ın içinde, tutarı
  sunucunun.

  **Ölçüm (cihazsız, `readCheckoutSnapshot` doğrudan çağrıldı):** aynı sepette (3 kalem, 1'i paket)
  kapı YOKken toplam **49,31 €**, kapı VARken **86,69 €** — ekrandaki yanlış ve sepetteki doğru
  tutarla birebir. `typecheck` · `lint` temiz, mobil birim testleri 599/599.

  **Cihazda doğrulandı (20.08, kablosuz `adb`)** — `BEKLEYEN(21.90)` işareti kapandı. Aynı sepetle
  (Su Böreği ×12 · Bayram Sofrası Paketi ×2 · Karışık Baklava ×3) sipariş özeti: paket satırı artık
  **37,38 €** ile fiyatlı, `ara toplam 92,97 − indirim 6,28 = genel toplam 86,69 €` ve bu sayı sepet
  ekranındakiyle birebir aynı. Onay düğmesi de 86,69 € yazıyor — üç yer tek sayıda buluştu.

  **Not — cihaza kablosuz erişim:** `adb devices` boş, `adb mdns services` de boş dönüyor (adb'nin
  kendi Openscreen keşfi bu ağda çalışmıyor). Cihaz macOS'un Bonjour'uyla bulunuyor:
  `dns-sd -B _adb-tls-connect._tcp local` → örnek adı, `dns-sd -L <ad> _adb-tls-connect._tcp local`
  → `host:port`, sonra `adb connect`. Eşleşme kayıtlı olduğu için yeniden `adb pair` gerekmiyor.

- [x] (21.91) **SUNUCUYA ULAŞILAMAYINCA EKRAN SUSUYORDU — vitrin ve hesap konuşmaya başladı (20.08).**
  `touches: apps/mobile/src/components/ui/offline-notice.tsx, apps/mobile/src/screens/home/home-screen.tsx, apps/mobile/src/screens/home/messages.json, apps/mobile/src/app/(tabs)/account.tsx, apps/mobile/src/screens/account/messages.json`

  **Ölçüm (cihaz, mobil API kapalı, soğuk açılış):** dört sekme gezildi.
  · Katalog ✓ *"Bağlantı kurulamadı… Tekrar dene"* · Paketler ✓ aynı kalıp
  · **Vitrin ✗ BOMBOŞ** — koleksiyon yok, kampanya yok, sepet rozeti yok, **tek uyarı yok**
  · **Hesap ✗** — girişli müşteriye *"Hoş geldiniz — Hesabınıza ulaşmak için doğrulanın"*

  İkisi de yanlış beyandı. Vitrinde müşteri "mağaza boş" ya da (rozet kaybolduğu için) "sepetim
  gitmiş" sanıyor; hesapta oturumu YERLİ YERİNDEYKEN atıldığını sanıp yeniden giriş deniyor.
  Kaybolan veri değil, okunamayan sunucuydu — CLAUDE.md §1 *"Ölçülemeyen değer SIFIR değildir"*.

  **Görünüm İCAT EDİLMEDİ:** kalıp (ikon `connection-off` → başlık → açıklama → "Tekrar dene")
  uygulamada zaten 13 ekranda vardı ve künyeleri onu sözleşme gibi anlatıyordu (`orders-screen`:
  *"aynı arıza üç ekranda üç ayrı görünüme sahip olmasın"*). CLAUDE §1 gereği iki kopya daha
  EKLENMEDİ; kanonik bileşen çıkarıldı (`components/ui/offline-notice.tsx`) ve yeni iki yer onu
  kullanıyor. Metin ortak DEĞİL — her sayfa kendi `messages.json`unda (CLAUDE §2), üç dilde.
  Hesabın metni *"çıkış yapmadınız, oturumunuz duruyor"* cümlesini açıkça taşıyor.

  Vitrinin kancasında `status: 'error'` ve `retry` ZATEN vardı, ekran okumuyordu; dosya künyesi
  boşluğu *"tasarımdan bir hata hâli gelirse bu durumdan okunur"* diye bırakmıştı — karar geldi
  (kullanıcı 20.08: *"şu an hizmet veremiyoruz gibi bir şey çıkması gerekiyor"*).

  **Cihazda doğrulandı:** sunucu kapalıyken vitrin ve hesap *"Şu an hizmet veremiyoruz"* + gerekçe
  + **Tekrar dene** çiziyor; sunucu açılıp düğmeye basılınca ikisi de TAM dönüyor (hesapta ad,
  e-posta, telefon, puan; vitrinde kampanya ve fırsat şeritleri). `typecheck` · `lint` temiz,
  mobil paket 596/599 — düşen 3'ü kabuk düzeyi zaman aşımı ailesi, İZOLE koşuda ikisi de geçti
  (`app-shell` + `account-routes`, 5/5).

  **BEKLEYEN(21.91):** mevcut 13 çağrı `OfflineNotice`e göç etmedi — kalıbı hâlâ elle kuruyorlar
  (`catalog` · `packages-list` · `orders` · `discover` · `recipes-list` · `recipe` · `product` ·
  `package` · `points-history` · `feedback` · `support`×2 · `order-detail`). Göç tek turda
  yapılmalı ki iki biçim bir arada az yaşasın.

  ~~**BEKLEYEN(21.91):** toparlanma sonrası vitrin selamlaması misafir kalıyor — hesap sekmesinde
  "Tekrar dene" ile kimlik geri geldiği hâlde başlıkta *"Hoş geldiniz"* yazıyor, sekme değiştirmek
  de düzeltmiyor; soğuk açılışta doğru (*"İyi akşamlar, Yaman"*).~~ → **22.08'de ölçüldü ve
  kapandı (21.98).** İşaretin yarısı ÜREMEDİ: "Tekrar dene" selamlamayı gerçekten geri getiriyor.
  Üreyen ve düzeltilen yarısı başkaydı — kendiliğinden hiç toparlanmıyordu. Ölçüm ve çare aşağıda.
  Posta kodu 67000 ARIZA DEĞİL: o gezinme kodudur, satın alma tarafı adresten 67380'i çözer
  (`setPurchasePlace` künyesi).

- [x] (21.92) **KEŞİF DAVETİ ARTIK KART KALMADIYSA ÇİZİLMİYOR — ve vitrin çağrısı kimliği taşımıyormuş (MB-58b, 20.08).**
  `touches: packages/types/src/contracts/home-api.schema.ts, packages/application/src/feedback/discover.ts, packages/application/src/index.ts, apps/mobile-api/src/api/v1/home.ts, apps/mobile/src/lib/api/home.ts, apps/mobile/src/screens/home/home-screen.tsx`

  Aday kümesi operatörün eliyle büyür ve bugün küçük; hepsini oylamış müşteriye davet göstermek,
  **açtığında boş çıkan bir tura çağırmaktı**. Backlog bunu *"iki sorgu, hem de en çok vurulan uca"*
  diye askıya almıştı — **askının dayanağı ölçümle çürüdü:** o gerekçe sorguların SIRAYA ekleneceğini
  varsayıyordu, oysa vitrin ucu zaten yedi okumayı `Promise.all` ile paralel koşuyor ve yeni okuma
  demetin İÇİNE girdi. Ucun süresi en yavaş bölümün süresidir.

  `discoverCards` sözleşmeye eklendi ve **desteyi kuran kuralın aynısından** besleniyor:
  `remainingCandidates` ayrıştırıldı, `openDiscoverDeck` ile `countDiscoverDeck` ikisi de onu
  çağırıyor (CLAUDE §1 — iki ayrı sayım bir gün ayrı düşerdi). Ekranın şartı `discoverCards > 0`.
  Sayı davetin CÜMLESİNE girmez: kazanç `points_feedback_candidate` ayarıdır, bu sayı değil —
  ikisini çarpıp yazmak MB-15'te kapatılan arıza sınıfını geri getirirdi (sözleşme künyesi).

  **ASIL ENGEL TEK SATIRDI.** Sayı taşındıktan SONRA bile davet kaybolmadı; ölçüm sebebi gösterdi:
  `fetchHome` çıplak `apiFetch` kullanıyordu, yani vitrin çağrısı **Bearer taşımıyor** ve sunucu
  müşteriyi hiç tanımıyordu. `maybeAuthorizedFetch`e geçildi — uygulamada ZATEN var, künyesi tam bu
  hâl için yazılmış (*"ziyaretçiye açık ama kimlikten yararlanan çağrı"*); kimliksizde davranış
  aynen korunur (oturum yoksa çıplak `apiFetch`e düşer).

  **YAN BULGU — B2B fiyatı vitrinde hiç kişiselleşmiyormuş.** Aynı satır ikinci bir şeyi de sessizce
  bozuyordu: ucun künyesi *"Bearer varsa yalnız fırsat FİYATINI kişiselleştirir (B2B/özel fiyat)"*
  diyor, ama Bearer hiç gitmediği için o dal HİÇ koşmuyordu — onaylı B2B müşteri vitrinde B2C fiyatı
  görüyordu. Uç doğruydu, çağıran eksikti; aynı düzeltme ikisini birden kapattı.

  **Ölçüm (cihaz, iki yönlü):** hesabın kalan 20 adayına oy yazıldı → **davet kayboldu**; yazılan
  satırlar kimlikleriyle kaydedilip TAM OLARAK silindi (hesap 6 oyluk ilk hâline döndü) → **davet
  geri geldi**. Ziyaretçi sayısı ikisinde de 20 (deste tavanı `DECK_SIZE`), yani eleme kimliğe bağlı
  çalışıyor. Çalışma alanı `typecheck` · `lint` temiz, mobil paket **599/599**.

  **~~BEKLEYEN(21.92): B2B fiyat kişiselleşmesi cihazda doğrulanmadı~~ → DOĞRULANDI (20.08).**
  Onaylı B2B hesap ZATEN VARMIŞ (`Restaurant Bosphore`, `b2b_approved`, `discount_percent: 5`) ve
  hazırlamak için veri ameliyatı gerekmedi: giriş akışı *"e-postası eşleşen sahipsiz profili
  bağlar"* (0002 trigger'ı), yani cihazda e-posta + `OTP_TEST_CODE` ile girmek profili bağladı.

  **Cihazda görülen, doğrudan ölçümle birebir aynı:** başlıkta **TOPTAN** rozeti · fırsat şeridinde
  **3 yerine 1 ürün** · Mangolu Artisan Kek `0,83 €` ve üstü çizili tutar `1,27 €` DEĞİL **`0,89 €`**
  (−%7). Kaybolan iki fırsatın sebebi doğru: o ürünlerin `b2b` fiyat satırı yok, yani o kanalda
  satılmıyor. Düzeltmeden önce bu hesap, kendisine SATILMAYAN iki ürünü YANLIŞ referans fiyatla
  görüyordu. (Ölçüm öncesi kontrol: `price` tablosunda 231 `b2c` + 217 `b2b` satır — fark
  gösterilebilir durumdaydı.)

  **AYNI TURDA KAPANAN İKİNCİ KALEM — cevabı belli soru sorulmuyor artık.** Onaylı B2B müşteriye
  vitrinde hâlâ *"Restoran ya da market misiniz? Toptan fiyatlar için profesyonel hesap açın"*
  daveti çiziliyordu; cihazda aynı ekranda **TOPTAN rozeti VE bu davet** birlikte görüldü. MB-58(a)
  ile aynı sınıf: karşılığı olmayan davet. Kart artık onaylı toptancıda ve **başvurusu incelemede
  olanda** (`b2bPending`) çizilmiyor. Ölçüt yeni yazılmadı — `useWholesale` zaten vitrinde (TOPTAN
  rozetini o çiziyor), künyesi *"iki kopya bir gün ayrışır"* diyor ve bu üçüncü çağıran.

  **KİŞİSEL HESAPTA DURUYOR — bilinçli (kullanıcı kararı, seçenekli soruldu).** `/professionals`a
  giden TEK kapı bu kart (`grep`le doğrulandı: başka çağıran yok); girişli herkesten gizleseydik
  kişisel hesapla kaydolmuş bir restoranın başvuru yolu tamamen kapanırdı.

  **İki dal da cihazda ölçüldü:** Bosphore → davet GİZLİ (üçüncü sekme de "Paketler"den
  "Siparişler"e döndü, toptan çatalı) · Yaman (kişisel) → davet GÖRÜNÜR. Test hesabı ölçüm sonrası
  eski oturumuna geri alındı. `typecheck` · `lint` temiz; mobil paket 595/599 — düşen dördü kabuk
  düzeyi zaman aşımı ailesi, İZOLE koşuda dördü birden geçti (18/18).

- [x] (21.93) **KOMŞU DAVETİ: SON KABUL EDİLEN KAZANIR, DAVETLİ REDDEDEBİLİR, SINIR YAZILI**
  `touches:` `supabase/migrations/0044_neighbor_invite.sql` · `packages/types/src/{entities/neighbor-invite,contracts/checkout-api,contracts/invite-api}.schema.ts` · `packages/database/src/services/neighbor-invite.service.ts` · `packages/application/src/{customer/neighbor,order/checkout-snapshot}.ts` · `apps/mobile-api/src/api/v1/invite.ts` · `apps/mobile/src/screens/checkout/*` · `apps/web/app/(customer)/[locale]/checkout/*`

  **Durum (21.08):** kullanıcı kararı `docs/uygulama/BACKLOG-musteri.md` MB-61'de; kod ve ölçüm
  burada. `(21.45)` daveti cihaza getirmişti — bu tur onu **çoğullaştırdı ve geri alınabilir**
  yaptı.

  · Kabul satırına `chosen_at` + `declined_at`; dizin `(customer_id, chosen_at desc)`.
  · `neighborInvite` → `neighborInvites` (dizi); gün başına tek kayıt, kazanan en yeni `chosen_at`.
    Ölçüt dizinin sırası DEĞİL kabul zamanı — arızanın kökü buydu.
  · `POST /api/v1/me/invite/neighbor/decline` — `inviteClaim` router'ında, çünkü "kim reddediyor"
    Bearer'dan çözülür; açık uçta dursa kimlik gövdeden gelir ve başkasının daveti reddettirilirdi.
  · `OrderNeighborInviteSchema` artık `remainingUses` + `maxUses` taşıyor; sipariş onayı sınırı
    yazıyor ve doluysa paylaşım düğmesini çizmiyor. Sayı sunucuda sayılıyor.

  **Cihazda ölçüldü (OPPO CPH1907, Claire → Julien, Fransızca arayüz):** sınır satırı *"Encore 3
  voisin(s) peuvent profiter de cette invitation (maximum 3)"* · davet notu *"Claire vous invite à
  la livraison du mardi 25 août — cette date est présélectionnée"* + 25 Ağustos çipi ön seçili ·
  ret sonrası not ve ön seçim kalktı, `declined_at` damgalandı, satır silinmedi · aynı bağlantı
  yeniden açılınca `declined_at` temizlendi ve `chosen_at` 10:05 → 10:08 öne alındı · iki kabul
  (10:08, 10:09) varken ekranda **tek not**, uç ikinciyi bağladı.

  BEKLEYEN(21.93): "davet doldu" hâli cihazda görülmedi — üç ayrı komşunun aynı güne gerçekten
  sipariş vermesi gerekiyordu. Uç tarafı (`remainingUses: 0`) doğrulandı, ekran dalı değil.

  **Tam paket bu turda YEŞİL DEĞİL ve sebebi bu iş değil:** iki koşuda da yalnız
  `Test timed out in 15000ms` düştü, düşen kümeler kesişmedi (1 → 8) ve hepsi fiyat testlerindeydi
  (`price-change`, `pricing-viewer`) — dokunulan alanlarda düşen yok. Ayrıca ölçüm sırasında
  ödeme ekranında **döküm satırlarıyla genel toplamın farklı sepetlerden geldiği** görüldü
  (8× börek 47,47 € listelenirken toplam 16,00 € = sunucudaki 2 kalemin %30 indirimlisi);
  müdahale EDİLMEDİ, kökü ölçülüyor.

- [x] (21.94) **ÖDEME ÖZETİ TEK OKUMADAN — döküm ile toplam ayrı sepetleri anlatıyordu**
  `touches:` `packages/types/src/contracts/checkout-api.schema.ts` · `packages/application/src/{cart/cart-types,order/checkout-snapshot,order/checkout-draft,order/place-order}.ts` · `apps/mobile-api/src/api/v1/checkout.ts` · `apps/mobile/src/screens/{checkout,customer-kit}/*` · `apps/web/app/(customer)/[locale]/checkout/*` · `apps/web/lib/cart/discount-label.ts`

  **Durum (21.08):** kullanıcı cihazda gördü, kararı A+B birlikte verdi.

  ── ARIZA (cihazda ölçüldü, OPPO CPH1907) ───────────────────────────────────
  Ekran `2× Gâteau artisan citron 16,00 €` + `8× Peynirli Adana Böreği 55,84 €` listeleyip
  **Total général 16,00 €** yazıyordu; kalemler 63,47 € topluyordu. Sebep iki kaynak:
  `payment?.orderTotalCents ?? view.totalCents` — döküm YEREL sepetten, toplam SUNUCUDAN. Aynı
  ifade iki yüzeyde birebir kopyaydı ([checkout-screen.tsx:331], [checkout-steps.tsx:501]).

  **Doğru olan TOPLAMDI, bayat olan listeydi** — kullanıcının ilk okuması tersiydi ve düzeltmenin
  hedefini değiştiren fark bu. Asgari sepet uyarısı da doğru sayıya göre çıkıp ekrandaki listeye
  göre anlamsız görünüyordu.

  Sepet SUNUCUDA yaşayıp iki yüzeyde paylaşıldığı için (`cart-store` künyesi) ayrışma istisna
  değil: müşteri webde kalem çıkarırken telefonu ödeme adımında açık durabilir. Bu turda da bir
  seed koşusu üç hesabın sepetini birden yeniden yazdı (`updated_at` hepsinde sabit `2025-08-06`).

  ── A · ÖZET SÖZLEŞMEYE GİRDİ ───────────────────────────────────────────────
  Anlık görüntü toplamı ZATEN bu kalemlerden hesaplıyordu (`orderScopeOf`); yalnız toplamı
  döndürüyordu. Artık dökümü de döndürüyor (`summary`: satırlar, ara toplam, indirim, kapsam dışı
  satırlar). Kural tek cümle: **özet varsa hem liste hem toplam ondan; yoksa ikisi de sepetten —
  asla karışık.** Adres seçilmeden özet olmaz ve o hâlde sepete düşmek zaten doğruydu.

  ── B · `cart_changed` KAPISI ───────────────────────────────────────────────
  Özet bir içerik imzası taşıyor (`cartFingerprint`); onay gövdesi onu geri gönderiyor, taslak
  sunucudaki sepeti yeniden okuyup karşılaştırıyor. `price_changed`ın kardeşi ve ONUN ÖNÜNDE:
  içerik değiştiyse fiyat karşılaştırması başka bir sepeti anlatır. Bu kapı olmadan müşteri
  gördüğü listeyi onaylayıp SESSİZCE başka bir sipariş alabiliyordu — ret hâlleri arasında böyle
  bir hâl hiç yoktu.

  İmza `cart.updated_at` DEĞİL içerik özeti: o kolonu seed sabit tarihle yazıyor, yani hem yanlış
  alarm verir hem gerçek değişimi kaçırırdı. İmzasız istek reddedilmez — kapı imzayı GÖNDERENİ
  korur, eski istemciyi kırmaz.

  ── NEREDEYSE SESSİZCE ÖLÜYORDU ─────────────────────────────────────────────
  `placeOrder` alanları tek tek kopyalıyor ve `expectedCartFingerprint` orada yoktu; mobil taraf
  `spread` kullandığı için derleyici susmuştu ve kapı HİÇ çalışmayacaktı. Web'in tip denetimi
  yakaladı. Gerekçe `PlaceOrderInput` künyesine yazıldı.

  **Ölçümler:** eski imzayla sipariş → `cart_changed` · doğru imzayla → kapıyı geçti, gerçek
  duruma düştü (`min_basket`) · imzasız → geçti · cihazda döküm 16,00 + 55,84 = **71,84**,
  −8,37 → **63,47** ve üçü de sunucunun tek okumasıyla birebir (`7184 / 837 / 6347`).
  `typecheck` sekiz pakette temiz · `lint` · `boundaries` (1410 modül) · birim **1380/1380** ·
  mobil checkout 3/3. Metinler tr/fr/de, iki yüzeyde.

  ── DÜZELTME (21.08, aynı gün) · PARMAK İZİ YANLIŞ EVDEYDİ ──────────────────
  `cartFingerprint` ilk turda `cart/cart-types.ts`e yazılmıştı ve o dosyanın ilk satırına giren
  `import { createHash } from 'node:crypto'` **web production derlemesini kesti**:

  ```
  Module not found: Can't resolve 'node:crypto'
  cart/cart-types.ts → lib/cart/cart-types.ts → cart-context.tsx
  ```

  `cart-types.ts` iki yüzeyin **izomorfik** modülü — web'in İSTEMCİ bileşenleri de okuyor. Tek
  satırlık import bütün zinciri Node'a bağladı. **Bu şeritte görünmüyordu:** `tsc --noEmit`
  paketleyici çözümlemesine bakmaz ve mobil-api zaten Node'da koşar; arızayı denetim (web) yakaladı
  (`docs/talep/not-mobil-cart-types-node-crypto-...`, işlendi ve silindi).

  İşlev kendi dosyasına taşındı (`cart/fingerprint.ts`), mantığa dokunulmadı; çağıranı zaten
  yalnız iki SUNUCU modülüydü (`checkout-draft`, `checkout-snapshot`), yani ayrı dosya doğal evi.

  **Kural:** istemcinin okuduğu bir modül node-only hiçbir şey import edemez. Aynı disiplin
  `@lezzet/address-fr`te açıkça yazılı; `cart-types.ts` de o sınıfa girer. Sunucuya ait yardımcı
  gerektiğinde ayrı dosya açmak yeterli — ve **bu şeridin doğrulama listesine `pnpm prod:web`
  eklenmeli**: derlenmeyi kesen bu sınıf hata `typecheck`/`lint`/`boundaries` üçlüsünün hiçbirinde
  görünmüyor. Düzeltme `pnpm prod:web` ile doğrulandı (derleme geçti).

- [x] (21.95) **DEV GİRİŞ DÜĞMESİ MÜŞTERİ AÇMIYORDU + ARAMA ÇEKİRDEĞİNİN NÜSHASI SÖKÜLDÜ**
  `touches:` `apps/mobile/src/lib/auth/dev-login.ts` · `apps/mobile-api/src/api/v1/dev-login.ts` · `apps/mobile/src/screens/customer-kit/{use-address-search,use-postal-suggest}.hook.ts` · `apps/mobile/package.json`

  **Durum (21.08):** iki denetim notu işlendi ve silindi (`docs/talep/not-mobil-dev-giris-...`,
  `not-mobil-gecikmeli-arama-cekirdegi-...`).

  ── "MÜŞTERİ" DÜĞMESİ ADMİN AÇIYORDU ────────────────────────────────────────
  `yamansehzade@gmail.com` yerel `auth.users`ın EN ESKİ satırıydı — veritabanında hiç admin yokken
  doğmuş ve `0002` trigger'ının açılış kuralı (*"hiç admin yoksa ilk hesap admin olur"*) onu
  `{admin}` yapmıştı. Yani müşteri yüzeyi düğmeden HİÇ açılamıyordu (webde ölçüldü: `/operations`a
  düşüyordu). Bu, `(21.32)`nin personel düğmeleri için çözdüğü arızanın aynısıydı; müşteri düğmesi
  o turda dışarıda kalmıştı çünkü `seedStaffLogins` müşteriye auth açmıyordu.

  Düğme `claire.weber@example.fr`e bağlandı — seed'in siparişli, adresli, puanlı müşterisi.
  **Cihazda ölçüldü:** düğme müşteri yüzeyini açıyor (Claire Weber · 195 puan · iki adres · kupon),
  operasyona düşmüyor. OTP akışı kapanmadı: öteki müşteriler auth'suz.

  **Liste web'inkiyle hizalandı** (`apps/web/lib/auth/dev-login-gate.ts` ile aynı sıra, aynı
  adresler) ve **`Muhasebe` eklendi** — bu dosyanın kendi künyesi onu gerekçe diye anlatıyordu
  (*"çok bölümlüdür, sekme çubuğunun görünür hâli buradan denenir"*) ama listede yoktu; künye
  teslim etmediği bir şey vaat ediyordu. Rolü ölçüldü: `{accounting,warehouse}` = para + depo.
  Cihazda beş düğme doğrulandı.

  ── ARAMA ÇEKİRDEĞİ: İKİ NÜSHA → BİR EV ─────────────────────────────────────
  `use-debounced-lookup.hook` kullanıcı kararıyla `@lezzet/react-hooks`a taşındı (web de aynı üç
  kararı — gecikme · önbellek · yarış — istiyordu). Buradaki nüsha silindi, iki tüketici pakete
  bağlandı. **Cihazda ölçüldü:** adres formunda sokak önerisi çalışıyor (dört sonuç + BAN künyesi).

  ── KÜNYE DÜZELTMESİ ────────────────────────────────────────────────────────
  İki dosyada web'in dev bypass'ı ŞİMDİKİ ZAMANLA anılıyordu; o bypass 19.08'de tamamen söküldü
  (ölçüm: oturumsuz `/operations` yerelde 200 dönüyordu, artık 307 → giriş). Cümleler geçmiş
  zamana çekildi — bu dosyanın reddi haklı çıktı ve web de aynı yere geldi.

  BEKLEYEN(21.95): adres formu ALICI ve TELEFON sormuyor, web ikisini de zorunlu tutuyor
  (`not-mobil-adres-formu-alici-telefon-sormuyor`, cihazda doğrulandı — form yalnız
  Libellé/Adresse/Code postal/Ville soruyor). **Tüketen uç bağlandı (aşağıda); formun sorması
  ayrı turda**, `@lezzet/helper`ın `normalizePhone`/`DIAL_CODE` kapısıyla.

- [x] (21.96) **ADRESİN ALICISI VE TELEFONU YAZILIYOR AMA HİÇ OKUNMUYORDU — kurye ucu bağlandı**
  `touches:` `packages/application/src/courier/day.ts` · `packages/types/src/contracts/courier-api.schema.ts` · `apps/mobile/src/screens/courier/{delivery-screen,courier-fixture}.ts(x)`

  **Durum (21.08):** denetim notu adres formunun bu iki alanı sormadığını bildirdi. Ölçüm başka
  bir şey gösterdi ve **kullanıcı kararı "önce tüketeni bağla" oldu** (şıklı soruldu).

  ── ÜÇ ÖLÇÜM, BİRBİRİYLE ÇELİŞİYORDU ────────────────────────────────────────
  · `address.schema` künyesi niyeti yazmış: *"Kurye kapıda kimi soracağını buradan bilir"* /
    *"Kapıya teslimde kurye önce arar; hediye adresinde aranacak numara alıcınınkidir."*
  · **Kurye ikisini de okumuyordu:** `courier/day.ts` `customer?.phone` taşıyordu ve
    `address.recipient` kod tabanının HİÇBİR yerinde tüketilmiyordu.
  · Native telefon soruyor ama BAŞKASINI: profil kurulumu ve checkout `user_profiles.phone`u
    zorunlu tutuyor (`PATCH /me`) — yani hesabın numarası, adresin değil.

  Sonuç: notun *"kurye arayacak numarayı bulamaz"* gerekçesi bugün gerçekleşmiyordu (kurye zaten
  dolu olan hesap numarasını arıyor), ama şemanın vaat ettiği davranışın **tüketen ucu hiç
  bağlanmamıştı**. Forma iki zorunlu alan eklemek, hiçbir şeyin okumadığı veri için müşteriye
  sürtünme koymak olurdu — önce okuyan taraf yazıldı.

  ── YAPILAN ───────────────────────────────────────────────────────────────
  · `addressTexts` artık üçünü tek okumadan döndürüyor (metin + alıcı + telefon); **ikinci sorgu
    açılmadı**, aynı döngü zaten aynı kaynağı okuyordu. Öncelik değişmedi: siparişin anlık kopyası
    (`addressSnapshot`) önce — sipariş anında kime, hangi numaraya söz verildiyse o.
  · Durak telefonu `adres.phone ?? hesap.phone`. Hesabınki YEDEK kalıyor: adres telefonu bugün çoğu
    kayıtta boş ve yedek olmasaydı kuryenin elindeki çalışan numara da kaybolurdu.
  · `CourierStop.recipient` eklendi — `customerName`i EZMİYOR, yanında duruyor. İkisi ayrı gerçek:
    hesabın sahibi ödemenin muhatabı, alıcı kapıyı açan kişi. Tek alana sıkıştırmak kuryenin kime
    "borcunuz var" diyeceğini belirsizleştirirdi.
  · Teslimat ekranındaki `receiver` zaten bu adı taşıyordu ama hesabınkini okuyordu; artık
    `stop.recipient ?? stop.customerName`. İmza satırı ve imza ipucu da bu adı kullanıyor.
  · WhatsApp bağlantısı da çözülmüş numarayı ve alıcı adını kullanıyor.

  `typecheck` altı pakette temiz · `lint` · `boundaries` · mobil kurye **73/73**.

  BEKLEYEN(21.96): adres formunun alıcı+telefon sorması. Artık okuyan taraf var, yani sormak
  anlam kazandı; web zaten ikisini zorunlu tutuyor (`normalizePhone` ile E.164'e indiriyor).

- [x] (21.97) **KABUK ÇİFT YÖNLÜ AÇILDI — kurye artık rotasını kaybetmiyor, personel de kabuğa hapsolmuyor**
  `touches:` `apps/mobile/src/screens/operations/{use-staff-landing.hook.ts,sections-context.ts,use-operations-access.hook.ts,messages.json}` · `apps/mobile/src/components/operations/{staff-menu.tsx,section-header.tsx}` · `apps/mobile/src/app/(operations)/_layout.tsx` · `apps/mobile/src/app/(tabs)/{_layout.tsx,account.tsx}` · `apps/mobile/src/screens/{account/account-screen.tsx,account/messages.json,courier/courier-day-screen.tsx,warehouse/warehouse-hub-screen.tsx,management/management-hub-screen.tsx,money/money-screen.tsx}`

  **Kaynak:** sefer şeridinin cihaz turu (18.08, CPH1907) — *"kurye yeniden açılışta müşteri
  vitrinine düşüyor, rotasına uygulama İÇİNDEN köprü yok"*. Kabuğun kendi künyesindeki
  `BEKLEYEN(21.13)` de ters yönü yazmıştı: *"personel giriyor ama çıkamıyor"*.

  ── ÜÇ ÖLÇÜM (22.08) ────────────────────────────────────────────────────────
  · **Açılışta rol kararı hiç sorulmuyordu.** Girişte soruluyordu (`operationsHomeRoute`, 21.32),
    açılışta sorulmuyordu — aynı kullanıcı, aynı oturum, İKİ farklı iniş yeri.
  · **Kabuktan müşteri yüzeyine dönüş yolu yoktu** (alt barda personel girişi yok, hesap
    ekranının dibinde köprü yok — notun cihazda gezilmiş kanıtı).
  · **Ve kabukta ÇIKIŞ da yoktu** — bu ilk kez burada ölçüldü: `signOut`un native'deki tek
    çağıranı hesap ekranıydı ve oraya kabuktan gidilemiyordu. Web'de AYNI arıza ölçülüp
    çözülmüştü (02.08, `page-header.tsx`: *"operasyon yüzeyinde hiç çıkış yolu yoktu"*).
    Personel bugün kabuktan yalnız Android geri tuşuyla çıkabiliyordu — o da kaza eseri
    (sekmeler yığında altta duruyor) ve yeniden açılıştan sonra hiç işlemiyor.

  ── YAPILAN (kullanıcı kararları 22.08, şıklı soruldu) ──────────────────────
  · **Açılış girişle aynı yere iner** (kullanıcı seçimi): `use-staff-landing.hook` müşteri
    kabuğunda tek atış koşar ve personeli operasyon köküne taşır. Kararı kendi HESAPLAMAZ,
    `operationsHomeRoute`a sorar — iki kaynak ayrışamasın. Yalnız `/`dayken koşar: davet /
    geri bildirim / bildirim bağıyla açılan uygulama EZİLMEZ. Kapı değil yan etki — `/me`yi
    beklerdi ve şebekesiz kuryenin uygulaması hiç açılmazdı.
  · **Kimlik menüsü** (`staff-menu.tsx`) — zilin komşusu, dolu zeytin daire (web'in ölçtüğü ders:
    barda başka hiçbir şey daire değil). Çekmecede ad · e-posta · açabildiği bölümler, altında
    **"Müşteri uygulamasına geç"** ve **"Oturumu kapat"**. Rol ETİKETİ değil BÖLÜM etiketi
    yazılıyor: web'in `roleText` sözlüğü web UI modülünde ve ikinci kopyası nüsha olurdu.
  · **Hesap ekranında personel köprüsü** — çıkışın hemen üstünde, yalnız personelde çizilir.
    Ölçüt yine `operationsSectionsOf`; rota `staffRoute` prop'uyla geliyor, `AccountData`ya
    yetki alanı EKLENMEDİ (müşteri künyesi oturum kararının taşıyıcısı olmamalı).
  · **Tema dikişi odağa bağlandı** — kapının künyesi bunu ilk çapraz bağlantıyı ekleyen dilime
    şart koşmuştu (`useEffect` → `useFocusEffect`); kabuk odaktan düşünce tema müşteriye döner.
  · Ping-pong tuzağı kapatıldı: taze girişte bayrak tüketilmemiş oluyor, köprü basıldığında
    `markStaffLandingDone` çağırıyor — yoksa köprü basıldığı anda kendini iptal ederdi.

  **Tip kapısı iki gerçek bulgu yakaladı:** `/me.email` sözleşmede `string | null` (menü o satırı
  hiç çizmiyor, boş dizeye ÇEVRİLMEDİ) ve üç ekran testinin bağlam değeri eksik kaldı.

  `typecheck` · `lint` · `knip` (yeni bulgu yok) · `boundaries` · birim **1380/1380**.

  ── CİHAZ TURU KOŞULDU (22.08, OPPO CPH1907 · wifi adb) ─────────────────────
  Dördü de doğrulandı, kanıtları ekran görüntüleriyle:
  · Kurye oturumuyla uygulama **öldürülüp açıldı → doğrudan "Günün Rotası"** (arızanın kendisi:
    eskiden müşteri vitrinine düşüyordu). İki ayrı turda tekrarlandı.
  · Kimlik dairesi zilin yanında, **aynı çapta ve hizalı**; "ML" (Marc L.), dolu zeytin.
  · Menü: `Hesabın` · Marc Lemoine · kurye@lezzetanatolia.fr · `Kurye` · iki eylem.
  · Köprü → **"Bonjour, Marc"**, müşteri teması ve sekme çubuğu geri geldi; 10 sn beklendi,
    **operasyona geri savrulma YOK** (ping-pong guard'ı işliyor).
  · Hesap ekranının dibinde **"Accéder aux écrans du personnel"**, çıkışın hemen üstünde —
    notun "köprü yok" dediği tam nokta.

  ── VE TUR YENİ BİR ARIZA ÇIKARDI (21.97b, aynı gün ölçülüp düzeltildi) ─────
  **"Oturumu kapat" çalışıyordu ama ekran kurye rotasında kalıyordu.** İki kez tekrarlandı; kesin
  ölçüm uygulamayı öldürüp açmak oldu — misafir vitrini geldi, yani **çıkış gerçekten yapılmıştı**,
  kabuk duymamıştı. Sahadaki karşılığı: personel çıktığını sanıp paylaşılan cihazı bırakıyor, ölü
  bir oturumun rotası ekranda duruyor.

  **Kök sebep düğme değil KAPIYDI:** `useOperationsAccess` `/me`yi yalnız montajda okuyup bir daha
  hiç bakmıyordu. Künyeme "kapı 401'e düşünce yönleniyor" diye yazmıştım — YANLIŞTI, düzeltildi.
  Düğmeye `router.replace` yazmak pansuman olurdu: aynı boşluk oturum SÜRESİ dolduğunda da açık
  kalırdı ve kurye kabuğu bütün gün açık duruyor. Kapıya `onAuthStateChange` dinleyicisi kondu
  (müşteri tarafındaki desenin aynısı); `denied` dalı zaten müşteri yüzeyine yönlendiriyordu, yani
  karar zinciri değişmedi — yalnız tetiği doğdu. **Cihazda doğrulandı:** çıkış artık kabuğu anında
  bırakıp misafir vitrinine iniyor.

  Turda bir kez "Operasyon açılamadı" görüldü (dev girişin hemen ardından); ikinci turda
  **tekrarlanmadı**, bulgu sayılmadı. Kapının o hâlde "yetkin yok" değil "okunamadı" demesi
  tasarlanmış davranış — doğru çalıştı.

- [x] (21.98) **DÜŞEN KİMLİK OKUMASI KENDİ BAŞINA TOPARLANMIYORDU — müşteri, oturumu yerli yerindeyken uygulamayı çıkış yapmış gibi görüyordu**
  `touches:` `apps/mobile/src/screens/customer-kit/use-me.hook.ts`

  **Kaynak:** `BEKLEYEN(21.91)`'in ikinci işareti (20.08). Ölçüm işaretin YARISINI çürüttü, öteki
  yarısını doğruladı ve sebebi başka bir yerde buldu.

  ── CİHAZDA ÜRETİLDİ (22.08, OPPO CPH1907 · USB adb, wifi kesilerek) ─────────
  Kurulum: Claire oturumu açık → `svc wifi disable` → hesap sekmesinde aşağı çekip kimliği
  okutmak → `/me` düşüyor, `status: 'error'`. USB'den bağlanıldığı için ağı kesmek adb'yi
  düşürmüyor; arıza doğal yolundan üretilebiliyor.

  | Toparlanma yolu | Sonuç |
  | --- | --- |
  | Hesap sekmesi → "Tekrar dene" | **çalışıyor** (işaretin iddiası ÜREMEDİ) |
  | Vitrin → aşağı çekip tazeleme | **çalışıyor** (`onRefresh` zaten `meState.refresh` çağırıyor) |
  | Sekme değiştirmek | çalışmıyor |
  | **Ağ geri gelince kendiliğinden** | **çalışmıyor** ← gerçek açık |

  Yani `load` yalnız İLK abonede ve oturum değişiminde koşuyordu; düşen bir okumadan çıkış yolu
  iki elle yapılan harekete bağlıydı. Sahadaki karşılığı: metroda bağlantısı kopan müşterinin
  selamlaması, sipariş bantları ve toptan rozeti kayboluyor, ağ dönse bile geri gelmiyor —
  oturumu duruyorken uygulama çıkış yapmış gibi görünüyor. `error` hâlinin misafir GİBİ
  çizilmesi bilinçli bir karardı (hook künyesi: "giriş daveti basmak yalan olurdu"); yanlış olan
  o karar değil, ondan çıkışın olmamasıydı.

  ── ÇARE: ÖNE GELİNCE VE YALNIZ `error` HÂLİNDE YENİDEN OKU ─────────────────
  `AppState` dinleyicisi `subscribe`ın içinde, auth dinleyicisinin yanında (aynı ömür, aynı
  sökülme). Tetik öne gelmedir çünkü sahadaki toparlanma böyle oluyor: bağlantısı olmadığını fark
  eden kişi uygulamadan çıkıp wifi'yi düzeltiyor ve dönüyor. `netinfo` daha doğrudan bir sinyal
  olurdu ama projede o bağımlılık YOK ve tek bir tazeleme için kütüphane almak bakımıyla pahalı.
  **Yalnız `error`da koşar:** sağlıklı durumda her öne gelişte `/me` çekmek, düzeltmeye çalıştığı
  arızadan pahalı bir yoklama olurdu. `guest` de tazelenmez — o KESİN bir cevaptır (401), eksik
  bir okuma değil; oturum açılırsa `onAuthStateChange` zaten duyar.

  **Doğrulama cihazda, iki tur:** hata hâli kuruldu → wifi geri verildi (ping 8 ms ile gerçekten
  bağlı olduğu ölçüldü) → tek arka plan–ön plan turu → **"Bonsoir, Claire" ve sipariş bandı
  kendiliğinden geri geldi**, hiçbir düğmeye basılmadan. İlk denemede düzelmemişti ve sebebi
  ölçüldü: Android `svc wifi enable`ı bağlantı gerçekten kurulmadan "enabled" diye bildiriyor —
  tetik doğru anda koşmuştu, ağ hazır değildi. Mekanizma her öne gelişte yeniden denediği için
  o hâl kendini bir sonraki dönüşte düzeltiyor.

  `typecheck` · `lint` · birim **1384/1384**.

- [x] (21.99) **ADRES ARTIK TESLİM ALACAK KİŞİ VE NUMARAYLA BİRLİKTE KAYDEDİLİYOR — iki yüzeyin aynı veride zıt karar verdiği yer kapandı**
  `touches:` `packages/types/src/contracts/address-api.schema.ts` · `packages/application/src/courier/day.ts` · `apps/mobile/src/screens/customer-kit/{address-form.tsx,address-sheet.tsx,address-sheet-messages.json}` · `apps/mobile/src/screens/{account/account-screen.tsx,cart/cart-screen.tsx,checkout/checkout-screen.tsx,profile-setup/profile-setup-screen.tsx}`

  **Kullanıcı kararı (22.08):** *"Her hâlükârda net bir şekilde bir teslimat kişisi ve teslimat
  numarasına ihtiyacımız var… varsayılan olarak kişinin bilgileri ile gelebilir. Ve kaydedilen
  adresin de bir parçası olması gerekir."* + *"Tamamen yeni adres kaydedilirken alanlar dolu
  gelecek. Kullanıcı değiştirecek veya değiştirmeyip kaydedecek."*
  **KURUMSAL AYRI KONU** (aynı oturum): B2B'de fatura künyesi başka bilgiler ve başka biçim
  istiyor; bu görev **yalnız son müşteriyi (B2C)** kapsıyor.

  ── ÖLÇÜM: KURAL YORUMDA YAZILI, HİÇBİR YERDE ZORLANMIYORDU ─────────────────
  Alanlar (`address.recipient`, `address.phone`) vardı ve şema künyesi ne işe yaradıklarını
  anlatıyordu; ama kolonlar `nullable`, **native form ikisini de hiç sormuyordu** (yani native'den
  girilen HER adres alıcısız ve telefonsuz doğuyordu), web zorunlu tutuyordu ve hiçbir yüzeyde
  ön-doldurma yoktu. Boşluğu okuyan uçlar kendi yedeğini uydurdu ve **iki yüzey aynı gün zıt karar
  verdi**: web sipariş detayı yedeğe DÜŞMÜYOR (`09-admin.md`: *"hesabın numarası hediye adresinde
  başkasının olabilir"*), kurye durağı ise koşulsuz DÜŞÜYORDU (bizim 21.96).

  **Bizimki ölçünce somut bir yalan üretiyordu:** adreste alıcı yazılı ama telefon yazılı değilken
  ekran `Alıcı: Ali Şahin` yazıp sipariş verenin numarasını "kapıda aranacak numara" diye
  sunuyordu; WhatsApp bağlantısı da **"Ali Şahin"i o numarada selamlıyordu**. Bir kişinin adını
  başka birinin numarasının üstüne yazmak, bilgiyi tamamlamak değil UYDURMAKTIR.

  ── YAPILAN ───────────────────────────────────────────────────────────────
  · **Sözleşme:** `MeAddressSchema` iki alanı taşıyor (düzenlemede kaybolmasınlar — `country`nin
    21.28'de kümeye girmesiyle birebir aynı gerekçe); `AddressWriteSchema`'da **ikisi de zorunlu**.
    Sözleşme yalnız mobil+mobil-api'de kullanılıyor (ölçüldü), yani web hiç etkilenmedi.
  · **Form iki alanı soruyor ve hesabın künyesiyle DOLU açıyor.** Taslakta `string | null` tutuluyor
    ve `null` "boş" değil **"müşteri dokunmadı"** demek: görünen değer o hâlde varsayılana düşer,
    müşteri yazdığı an yedek devreden çıkar. `useEffect` ile doldurulmadı çünkü çekmece `/me`
    cevabından önce açılabiliyor — efekt ya boş gösterir ya müşterinin yazdığını ezerdi.
  · Telefon `normalizePhone` ile E.164'e iniyor — **web ile aynı kapı**; tek sütunda iki biçim
    (`06 12…` / `+336 12…`) aynı numarayı iki numara gibi gösterirdi.
  · **Varsayılanı ÇAĞIRAN geçiriyor** (`addressDefaultsOf`), form saf kaldı. İlk deneme kancayı
    doğrudan forma takmıştı ve **testler patladı**: `useMe`ye abone olmak `getSupabase()` çağırıyor,
    o da env istiyor (`use-me.hook` künyesinin 10.08'de ölçtüğü tuzak). Form kitte ve dört ekran
    çağırıyor; oturum bağını buraya koymak onu dördüne birden yayardı.
  · **Kurye yedeği koşullu oldu:** alıcı YOKSA hesabın numarası gerçekten kapıyı açanınkidir →
    yedek kalır; alıcı VARSA yedek yok, cevap "bilinmiyor" (CLAUDE §1) ve arama düğmesi çizilmez.
    İkinci bir "sipariş sahibinin numarası" alanı EKLENMEDİ: bu hâl kapanmakta olan bir boşluk
    (yeni adresler artık numarayla doğuyor), sözleşmeyi onun için büyütmek olurdu.

  Doğrulama: `typecheck` (19 paket) · `lint` · `boundaries` · birim **1388/1388** · mobil jest
  **620/620**. Hesap ekranı testi ön-doldurmayı da çiviliyor: müşteri iki alana hiç dokunmadan
  gövde `recipient: 'Ayşe Demir'` ve E.164'e inmiş numarayla gidiyor.

  ── ŞEMA SERTLEŞTİRİLDİ (kullanıcı talimatı 22.08: *"Besleme dosyalarını da güncelle. Sertleşmeyle yaz. Reset için onay bekle"*) ──
  · `0011_customer_fields.sql`: `address.recipient` ve `address.phone` artık **`not null`**.
    Varsayılan YOK ve bilerek — `''` koymak "yazılmamış"ı "boş" diye kaydetmek olurdu. Telefona
    biçim `check`'i de KONMADI: biçim dayatan bir kısıt, numarası olan müşteriyi adres ekleyemez
    hâle getirebilirdi (adres defteri reddetmez, 10.08); zorlanan şey "bir numara VAR" olması.
  · Zod aynası (`address.schema`) ve `AddressInsertSchema` da zorunlu — yazan hiçbir yol atlayamaz.
  · **Besleme uydu** (`scripts/seed/delivery.ts`): telefonlar E.164'e indi (kolonda iki biçim
    birikmesin) ve **alıcısız/telefonsuz Alman satırı doldu** — o satır "üç boş alanın ekran hâli
    denensin" diye duruyordu, oysa artık o hâl veritabanında var OLAMIYOR; üretilemeyecek bir
    ekranı beslemede tutmak olurdu. Etiketsiz hâli aynı satırda korundu.
  · `b2b.ts`: indirgenemeyen numara ham hâliyle yazılıyor (`phone ?? input.phone.trim()`) —
    `normalizePhone` `null` döndüğünde başvuranın beyanı geçer; uydurma değil, ve artık boş
    bırakmak mümkün de değil.
  · Kırılan fikstürler onarıldı: `packages/database`, `packages/application` (iki dosya),
    `apps/mobile-api` (iki dosya). **`apps/web`in dört test dosyasına DOKUNULMADI** — web şeridi
    o sırada aynı alanda çalışıyordu ve süpürmeyi kendisi yaptı (ölçüldü: dokunmadan önce 8 hata,
    beklerken 0'a indi). Elimizi çekmek doğru karardı; onların uçuşan dosyasını düzenlemek
    künye kaymasının ta kendisi olurdu.

  Doğrulama (sertleştirme turu): `typecheck` **19/19** · `lint` · `boundaries` · birim
  **1388/1388** · mobil jest **620/620**.

  **Reset KOŞULDU (22.08, kullanıcı onayıyla) — sertleştirme artık veride de yürürlükte.**
  `db:reset` tek başına bu projede BOŞ veritabanı bırakıyor (`supabase/config.toml`: SQL seed hook
  kapalı, besleme TS ile sürülüyor), o yüzden `pnpm db:refresh` koşuldu: reset + `seed.ts` +
  `seed-coverage.ts`. Ölçüm — `address.recipient` ve `address.phone` `is_nullable = NO`;
  9 satırın 9'u dolu ve 9'u da E.164 (`+33…` / `+49…`); `MeAddressListSchema.parse` gerçek satırlar
  üzerinde **temiz geçti** (web'in bildirdiği `ZodError: expected "string" · received "null"` artık
  üretilemiyor). Tam paket **2751/2751** (244 dosya, 127 sn). Web'e not bırakılmıştı
  (`docs/talep/not-web-adres-alici-telefon-degismez-oldu.md`) — form ön-doldurmasını kendileri yazdı.
  *(Satır `[~]`de "reset onayı bekleniyor" aşamasında kalmıştı; reset 22.08'de koşulup ölçüldüğü
  hâlde işaret çevrilmemişti — 26.08 tazelik turunda kapatıldı.)*

- [x] (21.100) **KAMPANYA ARTIK KARTTA GÖRÜNÜYOR — cümlenin içinde kaybolmuyor (MB-22b)**
  · touches: `packages/application/src/catalog/{campaign,catalog,map,product,storefront-types}.ts`,
  `packages/types/src/contracts/catalog-api.schema.ts`, `apps/mobile-api/src/lib/campaign-wire.ts`,
  `apps/mobile-api/src/api/v1/{catalog,home}.ts`, `apps/mobile-api/src/lib/home.ts`,
  `apps/mobile/src/screens/customer-kit/campaign-label.ts`,
  `apps/mobile/src/screens/{catalog,home,product}/**`

  **ŞİKÂYET ÖLÇÜLDÜ VE YARISI ÇÜRÜDÜ.** Kullanıcı *"kategori indirimlerini zaten katalog
  kartlarında gösteriyoruz, ama ne olduğu anlaşılmıyor, metinlerin arasında kayboluyor"* dedi.
  Ölçüm: kampanya gösteriliyordu ama **kartta değil** — katalogda kesitin başındaki not şeridinde
  (`catalog-screen.tsx:375`), vitrinde koleksiyon bandının ADET satırına eklenmiş hâlde
  (*"12 ürün · %15"*). Karttaki tek rozet **"Fırsat"**tı ve o başka bir şey: yakın-SKT parti
  teklifi, yani birim fiyatta gerçekten düşen, üstü çizili eski fiyatı olan indirim. Yani şikâyet
  birebir doğruydu ve **veri değil arayüz** işiydi — sözleşme zaten taşıyordu.

  **HARİTA ZATEN YAZILIYMIŞ (08.44) ve kullanıcının saydıklarıyla birebir aynı çıktı.** Dışarıda
  kalanlar: kupon (kodu olmayana duyurulamaz) · SEPET kapsamlı (ürüne atfedilemez) · kişiye özel
  (`customerId` — yanlış vaat ve o kişinin kaydının ifşası) · ilk siparişe bağlı (vitrinde kimin
  ilk siparişte olduğu bilinmez) · süresi geçmiş/pasif. İçeride: kategori + koleksiyon kapsamlı,
  otomatik, herkese açık kampanyalar. B2B fiyatı bu yolun içinde bile değil — o bir indirim kuralı
  değil, fiyat kişiselleşmesi.

  **KULLANICI KARARLARI (23.08, üçü de şıklarla soruldu):**
  · **Rozet, başlığın SÖYLEYEMEDİĞİ yerde.** Kategori/koleksiyon ekranında rozet kartta çizilmez
    (başlık zaten söylüyor; 40 özdeş rozet rozeti anlamsızlaştırır); karışık listede — vitrin
    seçkisi, arama sonucu, benzer ürünler — kartta çizilir.
  · **Eşikli kampanya karta HİÇ çıkmaz.** *"60 € üzeri %15"*i rozete sığdırmak koşulu gizler ve
    tutulmayan bir söz verir; yeri tam cümlesinin sığdığı kesit başlığıdır.
  · **Fırsat kampanyayı yener.** Fırsat birim fiyatta kesin bir indirimdir, kampanya sepete
    bağlıdır; kesin olan koşullu olanın önüne geçer.

  **ÜÇ KURAL DA TEK YERDE, ekranlarda değil:** "başlık söylüyor mu" `catalog.ts`te (kesit seçiliyse
  sunucu kampanyayı hiç göndermez), "Fırsat yener" `map.ts` → `toProduct`ta (teklif kazanmışsa
  `campaign` doğmaz), "eşikli rozete girmez" kitte (`campaign-label` → `cardBadgeOf`). Dördüncü
  ekran geldiği gün kimse bir `if`i unutamaz.

  **FİYATA YAZILMADI, ROZET OLARAK SÖYLENDİ** — gerekçe 08.44'te ölçülmüştü ve hâlâ geçerli:
  `applyBestDiscount` kazananı TÜM SEPET üzerinden tek-en-büyük seçip kalemlere oransal dağıtır.
  20 € baklavaya kategori %15 varken sepette %8'lik bir sepet kampanyası kazanırsa baklavaya düşen
  pay %8 olur; kartta *"%15"* diye bir fiyat vaadi sepet değişince yalan olurdu.

  **MALİYET TAHMİNİ ÖLÇÜMLE ÇÜRÜDÜ — ek sorgu YOK.** "Ürün başına kapsam için join gerekir"
  denmişti; `ProductWithRelations` zaten `collections[]` taşıyor ve `categoryId` ürün satırında.
  Kampanya okuması bağlam okumasıyla PARALEL koşuyor (`Promise.all`), kimlik başına sorgu yok.

  **ROZETİN SÖZLÜĞÜ CÜMLENİNKİNDEN AYRI:** ekranların cümle biçimi ayrışıktı (vitrin *"−%15"*,
  katalog *"%15"*); rozet birinden ödünç alsaydı iki ekranda farklı görünürdü. Kendi anahtarı var
  ve NE OLDUĞUNU söylüyor — *"%15 indirim"* / *"{amount} indirim"* (fr *de remise*, de *Rabatt*).
  Çıplak sayı yazılmadı: şikâyetin kendisi "ne olduğu anlaşılmıyor"du.

  Doğrulama: `typecheck` **17/19** (`@lezzet/web` ve `@lezzet/mobile-api` dahil temiz; düşen tek
  görev `@lezzet/mobile` ve oradaki iki hata BAŞKA şeridin commit'lenmiş `global.fetch` satırları —
  `social-inbox-screen.test.tsx:88`, `social-conversation-screen.test.tsx:91`, dokunulmadı) ·
  birim **1417/1417** · mobil jest **657/657** (90 dosya) · `lint` temiz.

  ~~**BEKLEYEN(21.100): rozetin GÖRSELİ tasarıma sorulmadı.**~~ → **YARISI KAPANDI (23.08).**
  Kullanıcının söylediği *"yuvarlak"* uygulandı: rozet hap köşeye alındı (`Tag shape="pill"` →
  `radius.pill`, resmî setin "hap düğme, çip, sayaç" kademesi). Prop varsayılanı `badge`, yani
  `Tag`in öteki ~18 kullanımı aynen kaldı.
  **RENK yükseltilmedi ve bu bilinçli:** daire kartta terracotta ZATEN fiyat çipinindir; indirimi
  de ona boyamak satın alma kararının birincil vurgusunu ikiye bölerdi. `ink` bu yuvada "Tükendi"
  demek, `sand` zaten yumuşak vurgu. Renk kademesinin yükseltilmesi bir TASARIM kararıdır ve
  uydurulmadı (CLAUDE §3) — gerekçesiyle `design/KARARLAR.md`'ye kapanmış karar olarak yazıldı.
  Karar gelirse **yalnız stil** değişir; veri yolu ve üç kural aynen durur.

  **MB-22a AÇIK ve web/operasyonun alanı:** etiketsiz indirim kaydedilebiliyor, o yüzden bazı
  kampanyalar müşteriye anonim *"Kampanya"* diye görünüyor. Rozet geldiği için artık daha görünür
  bir eksik. Not bırakıldı (`docs/talep/not-operasyon-kampanya-etiketi-zorunlu-olmali.md`).

  ### KATMAN DÜZELTMESİ (27.08, kullanıcı bildirimi) — rozet ÜRÜN kartından KESİT kartına

  Yukarıdaki iş rozeti doğru kurdu ama **yanlış katmana koydu.** Kullanıcı 23.08'de kampanyayı
  *"vitrin sayfasındaki ilgili katalog veya kategori kartlarında"* istemişti; rozet bir katman
  aşağıya, o kesitlerin İÇİNDEKİ ürün kartlarına konmuştu. 27.08'de bildirdi ve **yanıltıcı**
  olduğunu söyledi: *"sepette üç euro indirimken doğrudan burada üç indirim koyuyormuş gibi
  oluyor."*

  **ÖLÇÜM ŞİKÂYETİ DOĞRULADI** (`applyBestDiscount`): sabit tutar
  `Math.min(rule.amountCents, scopeBase)` ile sepetin kapsam toplamına **BİR KEZ** iniyor — rozeti
  gören müşteri üç ürün alsa 9 € değil 3 € indirim alır; üstelik motor adaylardan **tek kazanan**
  seçiyor, yani iki kampanyalı üründen birinin rozeti her hâlükârda tutulmayan bir söz.

  **YAPILAN:** `cardBadgeOf` kampanya dalını kaybetti — imzası artık yalnız `wasCents` okuyor,
  yani bir kampanyayı ürün kartına yazmanın yolu **derleyici düzeyinde** kapandı. Üç ekran birden
  sadeleşti (katalog ızgarası · vitrin seçkisi · ürün detayının öneri şeridi) ve üç sözlükten dokuz
  ölü anahtar (`card.campaign`, tr/fr/de) silindi. Yeni türetme `scopeBadgeOf` kitte; vitrin bandı
  (`CollectionBand`) `discountLabel` prop'uyla hap çiziyor — sayaç satırının yanında, ayrı satır
  DEĞİL (bandın yüksekliği bir ölçü değil sözleşme: üst katman dairesi `index * collectionBand`
  ile konumlanıyor).

  **ROZETİN YERİ AYNI TURDA BİR KEZ DAHA DÜZELTİLDİ (kullanıcı isteği):** önce sayaç satırının
  yanındaydı; kullanıcı cihazda baktı ve *"indirim oranı anlaşılmıyor — bu rozetleri resimlerin
  köşelerine koyalım"* dedi. Rozet dairenin üst köşesine taşındı ve kitin `Tag`ine devredildi
  (fırsat kartıyla aynı ölçü/ton/gölge; kendi hapı yazılmadı). Daire İKİ yoldan çizildiği için
  (bandın içinde · vitrinin üst katmanında) daire+rozet tek iç komponentte birleşti (`BandPhoto`)
  — iki yere ayrı yazılsaydı biri güncellenir öteki kalırdı. Rozetin yanı aynalanır: daima
  dairenin banda bakan kenarında, çünkü daire yatayda 30 dp taşıyor.

  **Eşikli kampanya rozete girmiyor** (23.08 kuralı aynen): *"60 € üzeri −%15"* hapa sığmaz, o
  yüzden bandın sayaç satırında tam cümlesiyle kalıyor. Kural tek yerde — iki türetme de aynı
  ölçütü okuyor. "Fırsat" rozeti ürün kartında KALDI: o sepete bağlı değil, ürünün kendi fiyatı.

  **Doğrulama:** `typecheck` temiz · `lint` temiz · `knip` temiz · mobil jest **544/544** (60 dosya,
  `src/screens`) · yeni `collection-band.test.tsx` (5 test) **sabotajla doğrulandı** (rozet çizimi
  susturulunca 2 test düştü). Testin ikinci bloğu vitrinin GERÇEKTEN kullandığı yolu (üst katman)
  ölçüyor: o blok olmasa vitrindeki rozetin kaybolması hiçbir testi düşürmezdi.
  **Cihazda ölçüldü** (Oppo CPH1907): katalogda "3,00 € İNDİRİM" rozetleri gitti ve "FIRSAT" kaldı ·
  ürün detayının öneri şeridi kampanyasız · vitrin bantlarında hap dairenin köşesinde
  (*"Bayram klasikleri −3,00 €"* sol üstte, aynalanmış *"Börekler ve hamur işleri −%15"* sağ üstte).

  **AYNI TURDA:** öneri şeridinin daireleri **96 → 120** (`circleSm`, kullanıcı isteği). Tarihçe
  ölçüldü — çap küçülmemişti, 07.08'den beri 96'ydı (şablonun kendi değeri). Tasarımdan bilinçli
  sapma, `design/KARARLAR.md`'ye yazıldı.

  ### VİTRİN SEÇKİSİ: altı kart, fırsatlı ürün girmiyor (27.08, kullanıcı bulgusu)

  Kullanıcı sordu: *"bu haftanın seçkisi … ürünler nasıl seçiliyor, adedini altı yedi yapalım"* ve
  *"karttaki fırsat ürünlerinin aşağıda bir daha çıkması anlamlı mı?"*

  **Cevap ölçümle:** seçkinin arkasında editoryal bir seçim YOKTU — `readHomeFeatured` kataloğun
  `sortOrder` sırasının ilk N'ini alıyordu, yani başlığı *"Bu haftanın seçkisi"* diyen ray ne
  haftalık ne de seçilmişti. **Kullanıcı aynı turda kapatılmasını istedi** (*"bu web tarafındaki
  seçki konusu ortak bir yere taşınsın, mobil de bunu kullansın"*) → aşağıdaki terfi bölümü.

  **Tekrar gerçekti:** cihazda seçkinin ilk iki kartı fırsat şeridinin aynı iki ürünüydü (Limonlu ·
  Mangolu Artisan Kek, ikisi de "Fırsat" rozetli) — fırsatlılar `sortOrder`ın başındaydı.

  **YAPILAN:** `featuredFrom` saf kuralı (fiyatsız + fırsatlı elenir, dilimleme elemeden SONRA) ve
  sınır **4 → 6**. Eleme sorgudan sonra olduğu için okuma bir pay ile çekiyor
  (`HOME_FEATURED_OVERSCAN = 10`); sınırı sorguya birebir vermek, fırsatlılar sıranın başındayken
  rayı boşaltabilirdi — testin üçüncü iddiası tam bunu çiviliyor.
  **Doğrulama:** uçtan ölçüldü — `featured` 6 kart, fırsat rayıyla kesişim **boş**
  (`offers: limonlu · mangolu`, `featured: fistikli-artisan-kek · cilekli-artisan-kek ·
  karisik-baklava · fistikli-baklava · cevizli-baklava · kara-orman-pastasi`).

  ### SEÇKİ ORTAK PAKETE TERFİ ETTİ — `BEKLEYEN(21.14)` KAPANDI (27.08, kullanıcı kararı)

  Kullanıcı: *"bu web tarafındaki seçki konusu ortak bir yere taşınsın, mobil de bunu kullansın."*

  `readShowcase` ölçütüyle birlikte `apps/web/lib/storefront/home.ts`ten
  **`packages/application/src/catalog/showcase.ts`**e taşındı (emsal: `cart/discount.ts` terfisi —
  web kopyası bırakılmadı, çağıranlar pakete yönlendirildi). `server-only` düştü; paket taşıma
  bilmez, kapı zaten `db`yi çağırandan alıyor. Mobil artık **sinyalli** okuyor: son N günün
  görüntüleme + sepete ekleme toplamı (`analytics_daily_product`), pencere ayardan
  (`showcase_window_days`, varsayılan 7), veri birikmemişken katalog yedeği.

  **AYRIŞAN TEK ŞEY YÜZEYİN KENDİ KARARLARI**, ölçüt değil: sınır (web 4 · native 6) ve fırsat
  elemesi (`excludeOffers`, yalnız native — web'in bant düzeni farklı ve o karar web şeridinin).
  Eleme `toProduct`tan SONRA yapılıyor ve başka türlü yapılamazdı: `wasCents` bir satır özelliği
  değil, motorun kararıdır — bu yüzden okuma eleme açıkken hedefi büyütüp fazladan satır çekiyor.

  **Web'e dokunulan yer minimum:** `home.ts`ten taşınan blok silindi ve `SHOWCASE_LIMIT` export
  edildi (boş sepet de aynı bandı çiziyor — iki yerde iki sayı bir gün iki ızgara üretirdi).
  Saf testler de taşındı (`showcase-rank.test.ts` → `catalog/showcase.test.ts`); `vitest.config.ts`
  birim listesi güncellendi.

  **Doğrulama:** `typecheck` üç pakette temiz (`application` · `mobile-api` · `web`) · `lint` temiz ·
  `knip` temiz · `boundaries` temiz (1508 modül) · seçki testleri **9/9** ·
  `apps/mobile-api` bant testleri **12/12**. Uçtan: mobil `featured` 6 kart, kesişim boş.
  Web'in İKİ tüketeni de çiziliyor (`/fr` **200**, `/fr/panier` **200**).

  ### YAYIN KISITI FİKSTÜRLERİ KESMİŞTİ — dört dosya sessizce ATLANIYORDU (27.08)

  Operasyon/katalog şeridinden not geldi (`not-mobil-urun-yayin-kisiti-fikstur-uc-dil-istiyor.md`):
  `0005_catalog_product.sql`e **`product_publish_requires_all_locales`** kısıtı kondu — `status:
  'active'` ürün ad · açıklama · içindekiler · saklama metnini ÜÇ DİLDE dolu ister (ölçüt
  `has_all_locales`: anahtarın varlığı yetmez, `{"fr": ""}` dolu sayılmaz) — ve `status` varsayılanı
  `active` → `candidate` oldu.

  **Kırılmanın biçimi tehlikeliydi: testler DÜŞMÜYOR, ATLANIYORDU.** Kısıt `beforeAll`da patlıyor,
  vitest dosyanın tamamını `skipped` sayıyor ve sebep dosyanın kendi konusuyla ilgisiz görünüyor.
  Yani paket YEŞİL kalırken dört dosyanın iddiası hiç koşmuyordu — ölçüldü, 7 yerde `status:
  'active'` vardı ve hiçbirinde `ingredients`/`storageInstructions` yoktu:
  `sale.test.ts` · `home.test.ts` · `packages.test.ts` · `feedback.test.ts`.

  **YAPILAN:** her dosyaya kendi `yayinaHazir` fikstür bloğu (emsal operasyon şeridinin dokuz
  dosyada yaptığı düzeltme: `packages/application/src/catalog/catalog.test.ts`). `feedback.test.ts`in
  adı `{tr, fr}` idi — kısıt anahtarın VARLIĞINI değil DOLULUĞUNU aradığı için o da yetmiyordu.
  `home.test.ts`te metinler PASİF ürüne de veriliyor: fikstürü iki dala bölmek, ileride biri
  `passive`i `active` yaptığında yeniden sessizce atlanan bir dosya bırakırdı.

  **ÖLÇÜLDÜ — 25 TEST KURTARILDI** (tam paket, 20.06): `sale` **10** · `home` **9** ·
  `packages` **6** koştu ve sayılar notun bildirdiği "atlandı" sayılarıyla BİREBİR aynı; koşu
  logunda tek bir `skipped` kalmadı.

  **KENDİ DÜZELTMEM BİR İDDİAYI KIRDI ve tam paket onu yakaladı:** `feedback.test.ts`in adını
  `ucDil` ile üç dile EŞİTLEMİŞTİM; oysa o dosyanın bir testi kartın adında *"FR"* arıyor (dil
  çözümü sunucuda mı yapılıyor sorusu). Kısıt karşılanıyordu ama iddia sessizce boşa çıkıyordu —
  3633/3634 ile düştü. Ad üç dilde AMA üç AYRI metin yapıldı. Ders kayda değer: *"kısıtı karşıla"*
  ile *"testin ölçtüğünü koru"* aynı şey değil ve fikstür tektipleştirmek ikincisini sessizce yer.

- [x] (21.101) **VİTRİN BAŞLIĞI YER ADINI ARTIK HATIRLIYOR — çıplak posta kodu karesi kapandı (MB-80)**
  · touches: `apps/mobile/src/lib/places/place-name-memory.ts`,
  `apps/mobile/src/lib/storage/device-store.ts`, `apps/mobile/src/screens/home/home-screen.tsx`

  **KAYIT "ÜRETİLEMEDİ, TEORİ" DİYORDU — ÖLÇÜLDÜ, DETERMİNİSTİKMİŞ.** Kullanıcı 11.08'de bir kez
  başlıkta *"67000 STRASBOURG"* yerine yalnız *"67000"* görmüş, sebep bulunamamıştı. Kod tek satırda
  söylüyor (`home-screen.tsx`): `savedPlaceName === null ? postalCode : …` — ve `savedPlaceName`
  ÜÇ durumda birden `null`: kod eksik · cevap HENÜZ gelmedi · istek DÜŞTÜ. Yani bu nadir bir arıza
  değil, **her açılışta olan** ve genelde çok kısa süren bir geçiş; kullanıcı o kareyi yakalamış.

  **İkinci ve daha kötü hâl:** istek düşerse başlık **kalıcı olarak** çıplak kodda kalıyor. Hook
  bu iki hâli ayırt edebilsin diye `pending` bayrağını zaten üretiyor (`use-place-resolution`
  künyesi: *"ekranın iskelet göstereceği tek hâl"*), ama vitrin ince sarmalayıcıyı kullanıp o
  bayrağı yere düşürüyordu.

  **ÇARE İSKELET DEĞİL, BELLEK.** "Cevap gelene kadar iskelet çiz" ilk akla gelen ama daha kötüsü:
  ilk açılışta yine bekleme çizilir ve DÜŞEN istekte iskelet hiç sönmez. Oysa cevabın kendisi
  biliniyor — **bir posta kodunun şehri değişmez.** Cihaz onu geçen sefer öğrendi; en doğru tahmin
  odur (vitrin yerleşim izinin `home-layout-memory` aynı gerekçesi).

  **YALNIZ AD SAKLANIYOR, ÇÖZÜMÜN TAMAMI DEĞİL:** `PlaceResolution` içinde `inRoute` gibi
  DEĞİŞEBİLEN alanlar var; onları saklayıp taze veri gibi okumak stok işaretini ve bölge uyarısını
  bayat bilgiyle çizmek olurdu (CLAUDE §0 — belirtiyi susturan çözüm). Stok işareti ve uyarı bandı
  canlı çözümü okumaya devam ediyor. Kayıt tek satır ve anahtarı kodun kendisi: kod değişirse
  eşleşmez ve kullanılmaz — bayat bir şehir adının yeni kodun yanında görünmesi, düzeltmeye
  çalıştığımız yanlışın daha beteri olurdu.

  Doğrulama: `typecheck` temiz (`@lezzet/mobile`de kalan iki hata BAŞKA şeridin commit'lenmiş
  `global.fetch` satırları) · mobil jest · birim paketi.

- [x] (21.102) **MAİLDE METNİN SOL KENARI ZIPLIYORDU — beş hiza tek sayıya bağlandı (MB-40)**
  · touches: `packages/email/src/components/email-layout.tsx`

  **BULGUNUN ADI YANLIŞTI.** Arka-uç şeridi talep mailinde *"üç kartın üç farklı genişliği"* diye
  bir bulgu bırakmış ve ölçümünü bize devretmişti (`docs/talep/not-mobil-talep-maili-…`). Ölçüm:
  **kartların kutuları AYNI genişlikte** — 600 − 2×32 = **536 px**, hepsi `width: 100%`. Farklı
  olan metnin nerede BAŞLADIĞI ve sayfa kenarından ölçüldüğünde beş ayrı değer vardı:
  `QuoteCard 46` · `InfoBlock 54` · `NoticeCard 55` · `HeaderCard/Timeline/Card 57` ·
  `StatusBlock 59`. İzlenim doğruydu, sebebin adı değil.

  **SÜRÜKLENME TALEP MAİLİNE ÖZEL DEĞİLDİ:** beş değerin dördü sipariş ve geri bildirim
  maillerinde de duruyordu. Yalnız talep mailinin üç bloğunu hizalamak aynı arızayı öteki
  maillerde bırakırdı — bu yüzden hiza TÜRETİLİR oldu: `TEXT_INSET = 57` tek yerde durur,
  `innerX(kenarlık, şerit)` her bloğun iç dolgusunu ondan hesaplar. Yeni blok yazan bir sayı
  seçmez, fonksiyonu çağırır; altıncı bir değer doğamaz.
  **57 keyfî değil:** bugün çoğunluk oydu (`HeaderCard` · `Timeline` · `Card`), yani en az bloğu
  oynatan ve en az görsel risk taşıyan değer.

  **YARIM BIRAKILMADI:** `ROW_INSET` tanımlanıp satırların elle `32px` yazmaya devam etmesi
  **yalan söyleyen bir sabit** olurdu — biri onu değiştirse satırlar yerinde kalır, hiza sessizce
  bozulurdu. `Row` artık dikey dolguyu prop alıyor (ritim bloktan bloğa gerçekten değişiyor),
  yatayı kendi biliyor; on iki çağrının on ikisi dönüştürüldü.

  **DOĞRULAMA GERÇEK RENDER'DAN, kâğıt hesabından değil.** Mail render edilip HTML'deki dolgular
  ölçüldü: `NoticeCard` metni **55 → 57**, `QuoteCard` metni **46 → 57**. İlk sonda SAHTE YEŞİL
  verdi (sipariş maili render'ı düşünce ölçülen küme boş kaldı ve iddia boşluğa geçti) — fark
  edilip fikstür düzeltildi, sonra sonda silindi. `@lezzet/email` typecheck temiz · mail testleri
  **26/26**.

- [x] (21.103) **NATIVE ARTIK ÖLÇÜLÜYOR — tek defter, `surface` boyutu, sekiz atıcı (MB-63)**
  · touches: `supabase/migrations/0035_analytics.sql`,
  `packages/types/src/entities/analytics.schema.ts`, `apps/mobile-api/src/lib/analytics.ts`,
  `apps/mobile-api/src/api/v1/{catalog,packages,places,cart,cart-view,checkout}.ts`,
  `packages/application/src/analytics/{salt,availability}.ts`,
  `packages/application/src/cart/cart-types.ts`, `packages/application/src/catalog/pricing-viewer.ts`,
  `apps/web/lib/analytics/{record,session-key}.ts`,
  `apps/mobile/src/screens/legal/messages.json`

  **ARIZA "eksik özellik" değil, EKRANDA YAZAN BİR YALANDI.** `analytics_daily_*` satırları "toplam"
  başlığıyla gösteriliyordu ama içinde yalnız web vardı: `apps/mobile*` içinde tek ölçüm çağrısı
  yoktu. Hata veren hiçbir yer yok — yalnız her gün biraz daha yanlış olan bir cümle.

  **TEK DEFTER + BOYUT (kullanıcı kararı 24.08).** İkinci bir tablo aynı huniyi iki kez tanımlar ve
  "toplam" sorusunu her seferinde elle birleştirmeye çevirirdi. `analytics_surface` (`web|native`)
  **varsayılansız `not null`**: `default 'web'` yazmak, yüzeyi söylemeyi unutan bir yazımı sessizce
  web saydırırdı — düzelttiğimiz arızanın aynısını yeniden kurmak. Günlük özete KOYULMADI: özet
  `product_id` kırılımlı olduğu için native olayları kendiliğinden akıyor ve "toplam" gerçekten
  toplam oluyor; yüzey kırılımı gerekirse ham defterden sorulur (25 ay duruyor).

  **KAPI ORTAK PAKETE TAŞINMADI — teori ölçülüp ÇÜRÜTÜLDÜ.** İlk taslak "yoksa kuralı iki yerde
  yazarız" diyordu; `record.ts`in yedi kuralının yedisinin native'de karşılığı yok (prefetch · bot
  UA · `headers()` · rota kalıbı · UTM · cihaz türetimi · IP+UA anahtarı). Terfi ettirilseydi
  `apps/web`e ait yedi kuralı taşıyan bir "ortak" kapı doğardı. Gerçekten ortak olan her şey zaten
  ortak pakette; günlük tuz oraya **taşındı, kopyalanmadı** (`application/analytics/salt`).
  Ret gerekçesi kapının künyesinde yazılı ki aynı yanlış bir daha kurulmasın.

  **OTURUM ANAHTARININ BEDELİ AÇIKÇA YAZILDI.** Web'in `hash(tuz‖ip‖ua)` formülü native'de
  ÇALIŞMAZ: `ua` aynı sürümün her kurulumunda birebir aynı, operatör NAT'ı binlerce kişiyi tek
  bloğa topluyor — uygulasaydık bütün kurulumlar tek oturuma çökerdi ve ölçülmemiş bir sayı
  ölçülmüş gibi görünürdü. Bugünkü dürüst hâl: girişli müşteri `hash(tuz‖müşteri‖native)` (tuz her
  gün döner, eskisi saklanmaz → ertesi gün geri hesaplanamaz; kimlik defterde DURMAZ), misafir ise
  günün tek ortak anahtarı. Yani native `session_count` bir **TABANDIR**, gerçek sayı bundan
  büyüktür — yönü bilinen eksik ölçüm, yalan değil (CLAUDE §1). Kurulum başına rastgele değer
  kullanıcı kararı ve bu turda kapsam dışı (kapsam ürün/paket sayımı).

  **SEKİZ ATICI, HEPSİ SUNUCUDAN VE NİYETTEN** (`ANALYTICS §1`): `search` · `product_view` (ürün ve
  paket) · `place_resolved` · `add_to_cart` · `cart_blocked` · `checkout_start` · `order_placed` ·
  `checkout_blocked`. Personel süzgeci kapıda ve native'de web'dekinden daha gerekli — kabuk çift
  yönlü (21.97), personel müşteri yüzeyine de girebiliyor.

  **UYDURULMAYAN ÜÇ ALAN.** `path: null` (native'de URL yok — uydurulmuş bir rota, boş rotadan
  kötüdür) · dil ucun BİLDİĞİ kadar, bilmiyorsa `null` · ülke **çözülmüş yerden**, IP'den değil.
  Ülke alanı kapı sözleşmesinde zorunlu ama `null` olabilir: opsiyonel olsaydı unutan uç sessizce
  ülkesiz yazardı, zorunlu olunca `null` bile BİR KARAR olur.

  **GİZLİLİK METNİ AYNI TURDA YAZILDI** — MB-63'ün şartıydı (`(21.87)`de paragraf silinmişti:
  yapmadığımız bir işlemi beyan ediyor ve yöntem sözü veriyordu). Yeni paragraf **kurulan
  mekanizmayı** anlatıyor, eski metni geri yapıştırmıyor: cihaza hiçbir şey yazılmadığı, reklam
  kimliği kullanılmadığı, kaydın yanında kimlik durmadığı ve anahtarın ertesi gün geri
  hesaplanamadığı. Üç dilde, `legal/messages.json` → `privacy.sections[6]`.

  **İKİ BACKEND TESTİ DÜŞTÜ VE SEBEBİ BENDİM** (web şeridi `db:refresh` sonrası bildirdi):
  `analytics-rollup.test.ts` + `analytics-insight.test.ts` ham `insert` ile fikstür yazıyor, yani
  Zod kapısını hiç geçmiyor ve zorunlu `surface` kolonunu taşımıyordu. Supabase `insert()` hatayı
  FIRLATMAZ, DÖNDÜRÜR: satırlar hiç doğmadı, iş boş günü özetledi, testler "0 satır" diye düştü —
  sebebi görünmeden. Beş + bir fikstür düzeltildi ve migration künyesindeki *"unutmayı derleme
  hatasına çevirir"* cümlesi **daraltıldı**: bu güvence yalnız Zod'dan geçen yazımda geçerli, ham
  `insert` kısıttan öğrenir ve orası sessizdir.

  **BEKLEYEN(21.103):** katalog ve paket uçları `country: null` geçiyor — `readPlace` yalnız depo
  kimliği döndürüyor, ülke taşımıyor. Yer çözümü ucunda alan DOLU — yani kolon ölü değil, kırılımı
  eksik. Kapatması `readPlace`in dönüşünü genişletmek; ayrı bir tur, çünkü o kapıyı web de kullanıyor.

- [x] (21.104) **TESLİM EDİLMİŞ BEŞ ÖZELLİĞİN TESTLERİ YAZILDI — biri gerçek bir arıza çıkardı**
  · touches: `packages/application/src/catalog/campaign.test.ts`,
  `packages/application/src/analytics/availability.test.ts`,
  `packages/application/src/cart/cart-blocker.test.ts`,
  `packages/application/src/catalog/pricing-viewer.test.ts`,
  `apps/mobile/src/screens/customer-kit/campaign-label.test.ts`,
  `apps/mobile/src/lib/places/place-name-memory.test.ts`,
  `apps/mobile/src/lib/places/place-name-memory.ts`,
  `packages/email/src/components/email-layout.test.tsx`, `vitest.config.ts`

  **KULLANICI ÖLÇÜTÜ (24.08):** *"Bir özelliği bitirdiysen sonrasında testi yazdın mı? Yazmadıysan
  yeni bir konuya geçmeden önce daha önce tamamlanmış özelliklerin testlerini yazmalıyız."* Testler
  modül modül, özellik özellik yazılır — dalganın kapsamı "hepsi" değil, TESLİM EDİLMİŞ olanlar.

  **ÖLÇÜM ÖNCE YAPILDI VE İYİ DEĞİLDİ:** son beş özellik commit'imde (21.100 · 21.101 · 21.102 ·
  21.103 · 08.53) **sıfır** yeni test vardı. 21.103'te dört test dosyası görünüyordu ama hepsi
  ONARIMDI — kendi kırdığım fikstürler. 21.102'de daha kötüsü: doğrulama için sonda kuruldu,
  ölçüldü ve **sonda silindi**; o sonda zaten bir test olmalıydı. *(Aynı günlerde yan şerit tersini
  yapıyordu: `link.test.ts` 259 satır, özelliğiyle AYNI commit'te.)*

  **YAZILAN: 47 iddia, 7 dosya.** Kampanya üstünlüğü (koleksiyon kategoriyi yener — eşikli olsa
  bile) · rozet kararı (fırsat kampanyayı yener, eşikli rozete girmez) · paket satılabilirliği
  (`route: null` "burada yok" DEĞİLDİR) · ödeme retlerinin ölçüm karşılığı (bilerek ölçülmeyenler
  `null` döner) · kanal kuralı (onaysız şirket B2C) · yer adı belleği · mail bloklarının sol hizası.

  **GERÇEK ARIZA ÇIKTI — `place-name-memory` yarışı.** `subscribe` diski `.then(publish)` ile
  KOŞULSUZ yayınlıyordu: `/places` cevabı diskten önce gelirse taze ad eski disk değeriyle geri
  alınıyor, yani **MB-80'in kapattığı çıplak kod karesi geri geliyordu**. Kod değişmişse daha
  kötüsü — eski kayıt yeni kodla eşleşmediği için ad TÜMDEN kayboluyordu (`COLMAR` → `null`).
  Kardeş modülde (`home-layout-memory`) aynı yarışa karşı `snapshot === undefined` koruması vardı
  ve 21.101 künyesi onu emsal gösteriyordu; kopyalanan desen korumayı taşımamıştı.
  Önce testle ÜRETİLDİ, sonra düzeltildi.

  **İKİ SAHTE YEŞİL YAKALANDI VE İKİSİ DE DERS:**
  · Yarış testi ilk hâlinde **korumasız kodda bile geçiyordu** — `renderHook` beklenirken mikro
    görev kuyruğu boşalıyor, disk cevabı yazımdan ÖNCE geliyor ve sınanmak istenen sıra hiç
    kurulmuyordu. Disk `deferRead()` ile askıya alınınca arıza göründü.
  · Mail hizası testinin ilk taslağı her blok için kenarlık/şerit kalınlığını ELLE yazıyordu ve
    ikisini YANLIŞ yazdım (QuoteCard'ın 2 px'i şerit değil `border-left`; StatusBlock'un 4 px'i
    kenarlık değil ayrı bir hücre). **Kaynağı tekrar eden test, kaynakla birlikte yanılır.** Ölçüm
    render edilmiş HTML'den TOPLANIR oldu ve testin yakaladığı bir blok bilerek bozularak
    kanıtlandı (57 → 61, üç iddia birden kırmızı).

  **`UYGULAMA_DBSIZ` LİSTESİ AÇILDI** (`vitest.config.ts`): `packages/application` entegrasyon
  köküdür ama içindeki saf karar fonksiyonları DB'ye vurmuyor — ve `CLAUDE §4b` entegrasyon
  koşusunu şeritlere kapattığı için o testleri YAZAN şerit KOŞAMIYORDU. `WEB_LIB_DBSIZ`in K8-1
  ölçümüyle çözdüğü sorunun aynısı, ikinci kökte. Üç dosya taşındı; ölçüldü: DB'siz, 40 test 11 ms.
  Listenin makineyle denetlenmediği (§3g yalnız `apps/` tarar) künyesine yazıldı.

  **`resetPlaceNameMemory` ölü ihracattı** — "testler için" yazılmış, hiç çağrılmamıştı. Testi
  gelince amacına kavuştu; `jest.resetModules()` burada İŞLEMİYOR çünkü taze yüklenen modül kendi
  React nüshasını çekiyor ve dispatcher `null` kalıyor (ölçüldü: 12 test birden düştü).

  Doğrulama: birim projesi **1473/1473** · mobil paket **702/702** · `@lezzet/email` typecheck ·
  `@lezzet/application` typecheck · `@lezzet/mobile` typecheck · lint temiz · `docs:check` yeşil.

- [x] (21.105) **KABUK VE KİMLİK TESTLENDİ — yetki kapısı, açılış kararı, düşen okumanın toparlanması**
  · touches: `apps/mobile/src/screens/operations/use-operations-access.hook.test.ts`,
  `apps/mobile/src/screens/operations/use-staff-landing.hook.test.ts`,
  `apps/mobile/src/screens/operations/use-staff-landing.hook.ts`,
  `apps/mobile/src/screens/customer-kit/use-me.hook.test.ts`

  **DALGA 2'NİN İLK DİLİMİ** (`docs/build/test-dalgasi.md`): plan bu şeride `21.9x` kabuk/kurye/davet
  kapsamını veriyor. Seçim ölçütü planın kendi ölçütü — kapsama yüzdesi değil **sessiz bozulma
  riski**: burada üç kalem birden var (yetki kapısı · "bir kez yaşandı" hatası · karar dalı).

  **38 iddia, 3 dosya.** `useOperationsAccess` 12 · `useStaffLanding` 11 · `useMe` 15.

  **NEDEN BU ÜÇÜ — üçü de bozulduğunda HATA VERMEZ, yanlış yere götürür:**
  · **Dört hâl, üç değil** (21.97): kapı *"erişemiyor"* ile *"ÖĞRENEMEDİK"*i ayırıyor ve bu ayrımı
    silmek KODU SADELEŞTİRİR — bedeli, wifi'si düşen kuryenin sessizce vitrine düşmesi. Sabotajla
    kanıtlandı: `error` dalı `denied`a katıldığında **5 iddia birden** kırmızı yandı.
  · **Karar YALNIZ kökte, bayrak kök dışında TÜKETİLMEZ** (21.97): derin bağla açılan uygulamada
    karar ertelenir, iptal edilmez. Sabotajla kanıtlandı: bayrağı kök dışında da yakan bir yazım
    **yalnız o tek testi** düşürdü, ötekiler yeşil kaldı — çivi tam yerinde.
  · **Tazeleme yalnız `error` hâlinde** (21.98): koşulu gevşetmek hiçbir yerde patlamaz, yalnız her
    sekme dönüşünde bir ağ turu doğurur. Sabotajla kanıtlandı: koşul kalkınca 2 iddia kırmızı.

  **GERÇEK KAPILAR TAKLİT EDİLMEDİ:** `operationsSectionsOf` ve `operationsHomeRoute` gerçek
  çalışıyor — girişin okuduğu kuralla açılışın okuduğu kural AYNI olmalı ve taklit edilseydi test,
  ayrışmayı ölçemeyeceği bir dünyayı doğrulardı. Taklit edilen tek şey tel (`fetchMe`), oturum
  tesisatı ve yönlendirici.

  **ÜÇ ÖLÇÜM, ÜÇÜ DE KURULUM DERSİ:**
  · `react-native` modülünü TOPTAN sahtelemek suite'i daha açılmadan düşürdü (`expo-modules-core`
    `Platform.select`i yüklenirken çağırıyor); `jest.requireActual` ile yaymak da düştü (gerçek
    index yerel modül arıyor — `TurboModuleRegistry … 'DevMenu'`). Doğru kapı `spyOn`: preset'in
    kurduğu dünya yerinde kalır, yalnız dinleyici teslim edilir.
  · **RNTL v14 asenkron:** `unmount()` de beklenmezse temizleme efektleri koşmamış olur ve iddia
    *"sızıntı var"* der — oysa yalnız erken bakılmıştır.
  · `import/first` bu depoda TANIMLI DEĞİL; ona yazılan `eslint-disable` üç dosyada birden lint
    hatası verdi. Var olmayan bir kuralı susturmak, kuralın kendisinden pahalı.

  **`resetStaffLanding` EKLENDİ** (üretim modülüne, tek satır): bayrak modül düzeyinde yaşıyor ve
  `jest.resetModules()` hook'larda İŞLEMİYOR (taze modül kendi React nüshasını çeker, dispatcher
  `null` kalır — `place-name-memory` testinde ölçüldü). `resetPlaceNameMemory`nin aynı gerekçesi.
  **`use-me` için ÜÇÜNCÜ bir sıfırlama kapısı AÇILMADI** — her iddia `waitFor` ile beklenen hâle
  bakıyor, yani sızan ilk kare hiçbir iddiayı taşımıyor. Bedeli açıkça yazılı: geçici `loading`
  karesi orada sınanmıyor.

  Doğrulama: mobil paket **740/740** (702 → 740) · `@lezzet/mobile` typecheck temiz · lint temiz.

- [x] (21.106) **KOMŞU DAVETİ TESTLENDİ — iki katman, 34 iddia; para tarafı da çivilendi**
  · touches: `apps/mobile/src/screens/invite/use-invite-welcome.hook.test.ts`,
  `packages/application/src/customer/neighbor.test.ts`

  **DALGA 2'NİN İKİNCİ DİLİMİ** (`test-dalgasi.md`). Davet, kabuktan sonra sıradaki en büyük
  korumasız yüzeydi: `screens/invite/` altında **hiç test yoktu** ve `customer/neighbor.ts` (505
  satır, paraya dokunan altı karar) da testsizdi.

  **CİHAZ YARISI — `use-invite-welcome` (13 iddia).** Çivilenen ayrım **ağ hâli ≠ iş hâli**:
  `unknown`/`self`/`already_customer` sunucunun KESİN cevaplarıdır. Bir ağ arızası `unknown`a
  katılırsa davetli, geçici bir bağlantı sorununda **kodunun geçersiz olduğunu** okur — kod
  geçerlidir, tıklamıştır, arkadaşı çağırmıştır. Tersi de yanlış: kesin cevabı `error`a katmak,
  hiç düzelmeyecek bir şey için "tekrar dene" dedirtirdi.
  **İki sabotaj, ikisi de tam hedefinde:** eskimiş-cevap sayacı sökülünce YALNIZ yarış testi
  düştü; boş-kod kısa devresi sökülünce YALNIZ o iki test düştü.

  **SUNUCU YARISI — `neighbor.test.ts` (21 iddia, 649 ms).** Dört karar:
  · **Davet İDEMPOTENT açılır** — ikinci çağrı yeni bağlantı doğurursa müşterinin PAYLAŞTIĞI
    bağlantı sessizce ölür ve bunu ancak komşusu tıklayıp "tanımadık" görünce fark eder.
  · **Sıra `self` → pencere → doluluk** — kendi bağlantısını açana *"hakkın doldu"* demek doğru
    ama işe yaramaz bir cümle.
  · **Kullanım SİPARİŞTEN türetilir, sayaçtan değil → iptal hakkı GERİ VERİR.** Sayaç tutulsaydı
    müşteri, üç komşu çağırma hakkını gelmemiş bir siparişe kaptırırdı.
  · **Kalan hak sıfırın altına düşmez** — tavan davet açılırken donuyor, ayar sonradan düşerse
    çıplak çıkarma negatif verir ve ekran *"-1 komşu daha yararlanabilir"* yazardı.
  Ayrıca 17.08'de ölçülen boşluk çivilendi: komşu bağlantısıyla gelen kişi `referred_by` alıyor mu
  — almazsa **500 puanlık getiren ödülü hiç doğmuyordu** (`referred_by`yi yazan tek yol getiren
  KODUNDAN geçiyordu, oysa komşu bağlantısı kod değil TOKEN taşıyor).

  **DB'YE VURAN TESTİN DOĞRULAMASI SAHTE YEŞİL VERDİ — ve yakalandı.** İlk sabotaj koşusu,
  koşucunun TEK UÇUŞLU olması yüzünden **benim değişikliğimden ÖNCE başlamış** bir koşuya katıldı;
  sonuç sabotajı hiç içermiyordu. Aracın kendi uyarısı bunu söylüyor (*"koşu senin değişikliğinden
  ÖNCE başladıysa bir kez daha tetikle"*) ve o satır okunmadan "kanıtlandı" denmişti. Kilit
  boşalması beklenip tekrarlandı: iptal süzgeci sökülünce **yalnız** hedeflenen test düştü
  (`× İPTAL edilen sipariş hakkı GERİ VERİR — 36ms`), komşusu yeşil kaldı.
  **Ders kayda geçsin:** paylaşılan kilitli koşuda bir sabotajın sonucu, koşunun `startedAt`i
  değişiklikten SONRA olmadıkça geçersizdir.

  **İKİ TİP HATASI YAZARKEN YAKALANDI:** sipariş başlığında `subtotalCents`, kaleminde
  `lineTotalCents` diye alanlar YOK (`vatRate` zorunlu). Fikstürü sözleşmeden değil hafızadan
  yazmanın bedeli; typecheck tuttu.

  Doğrulama: `neighbor.test.ts` **21/21** · mobil paket **753/753** · typecheck temiz · lint temiz.
  Pakette kalan tek düşen test bu şeridin DEĞİL: `roles.test.ts` **15002 ms** = zaman aşımı
  (kardeşi 11475 ms — sıra bekleme, iddia değil).

- [x] (21.107) **PUAN UÇLARI TESTLENDİ — MB-18'in adlandırdığı boşluk kapandı (20 iddia)**
  · touches: `apps/mobile-api/src/api/v1/points.test.ts`

  **MB-18 ÖLÇÜLDÜ VE İKİYE AYRILDI (24.08).** Kalem *"her puan senaryosunun uçtan uca denetimi"*ni
  istiyor ve açılış cümlesi *"bugünkü turda yalnız keşif ve geri bildirim ölçüldü"* diyordu — o
  cümle BAYATTI. Motor yarısı çoktan kapanmış: `domain-core/feedback/points.test.ts` **18 test**
  taşıyor (B2B kazanmaz · günlük tavan · tavanın kısmi uygulanmaması · getiren/komşu ödülünün
  muafiyeti · eşik altı çevrilemez · sıfır değerli aksiyon). Açık olan **uç yarısıydı**:
  `points.ts` beş uç taşıyor ve **tek testi yoktu** — on altı mobil ucun on altısı testsizken,
  bu ölçüte (para + yetki kapısı) göre en güçlü adaydı.

  **BURADA KURAL DEĞİL KAPI SINANIYOR.** Kaç puan kazanıldığı ve eşiğin ne olduğu motorun testinde.
  Bu dosya üç şeyi ölçüyor ve motor testleri üçünü de göremez: **kimlik doğru çözülüyor mu** ·
  **ret doğru KODLA mı dönüyor** · **zarfa sızmaması gereken alan sızıyor mu**.

  **ÇİVİLENEN KARARLAR:**
  · **B2B'de `points: null`, sıfır DEĞİL** — "0 puan" yazmak kazanılamayacak bir bakiyeyi boş bir
    hedef gibi gösterirdi (CLAUDE §1). Kuponlar da aynı koşula bağlı, ayrı sorulmuyor.
  · **Adlı retler AYRI kodlarla** — 403 `not_eligible` (B2B) · 400 `below_minimum` (eşik altı).
    Tek koda katmak ekranı *"neden olmadı"* diye tahmin etmeye bırakırdı.
  · **`/points/rules` AÇIK ama kişisel hiçbir şey taşımaz** — bakiye/davet kodu/kupon sızarsa
    kimliksiz okunan bir uç başkasının verisini herkese açar.
  · **Defterin iç alanları zarfa sızmıyor** — `note`/`refId`/`createdBy` yok; anahtar kümesi tam
    olarak `at·id·points·reason`.
  · **Ziyaret ucu HEP `true` der** — gün içindeki ikinci çağrı arıza değil, tekillik veritabanında.
    Hata dönseydi istemci *"bugün kazandın mı"* diye bir dal yazmaya davet edilirdi.
  · **Bozuk imleç listeyi BAŞTAN verir, 400 dönmez**; tavanı aşan `limit` ise reddedilir.
  · **Çevirme GÖVDE ALMAZ** — uydurulmuş bir miktar ne kabul edilir ne isteği düşürür.

  **İKİ SABOTAJ, İKİSİ DE YALNIZ HEDEFİNDE:** ret kodları tek koda katılınca sadece
  *"B2B 403 `not_eligible`"* düştü; B2B süzgeci kaldırılınca sadece *"B2B kartı `null`"* düştü.
  Çiviler yayılmıyor.

  **KÜRESEL AYAR DEĞİŞTİRİLDİ VE GERİ KONDU:** eşik `settings`te ve tüm suite onu okuyor
  (`CLAUDE §4b`). `settingsSnapshot` ile önce okunup `afterAll`da geri konuyor — varsayılan 500
  puanı ziyaret ödülleriyle biriktirmek onlarca gün simülasyonu isterdi.

  **BEKLEYEN(MB-18):** geriye kalan tek parça bu şeridin alanı DEĞİL — `referral`/`neighbor`
  ödülleri BAŞKASININ eylemiyle doğuyor, müşteri o an uygulamada değil ve gösterilecek bir sonuç
  ekranı yok. Cevabın yarısı verildi (puan geçmişi, `21.60`), öteki yarısı **bildirim** ve onun
  1. katmanı (kayıt tablosu) web şeridinin alanında — `docs/talep/bildirim-modulu-web-mobil.md`
  09.08'den beri *"AÇIK — cevap bekliyor"*.

  Doğrulama: `points.test.ts` **20/20**, 3,5 sn · `@lezzet/mobile-api` typecheck temiz.

- [x] (21.108) **KAPI SINIRI ÇİVİLENDİ — hangi ucun herkese açık olduğu artık bir BEYAN (42 iddia)**
  · touches: `apps/mobile-api/src/api/v1/router.test.ts`, `apps/mobile-api/src/api/v1/invite.test.ts`

  **BU DOSYAYI GÖZDEN KAÇIRMIŞTIM ve en değerlisiydi.** `router.ts` "varsayılan kapalı" kuruluyor:
  `v1.use('*', bearerAuth)` satırından ÖNCE bağlanan her uç herkese açık, sonrakiler korumalı.
  **Sıra bir stil tercihi değil, güvenlik kararının kendisi** — tek bir `v1.route(...)` satırını o
  çizginin üstüne taşımak bir ucu sessizce herkese açar. Hiçbir yerde hata vermez, testler geçer,
  tip sistemi susar; fark yalnız `curl`layan biri görür.
  **Sabotajla kanıtlandı:** `/me/points` çizginin üstüne taşındığında iki iddia birden kırmızı.

  **LİSTE KAYNAKTAN TÜRETİLMİYOR ve bu, mail hizası testinin TERSİ bir karar.** Orada kaynağı
  tekrar eden test kaynakla birlikte yanılıyordu; burada tam tersi isteniyor — liste bir
  **beyandır**. Router'dan türetilseydi, taşınan bir satır testi de kendiliğinden taşır ve iddia
  hiçbir şey söylemezdi. Yeni bir açık uç eklemek artık bu dosyayı da değiştirmeyi gerektiriyor.
  10 açık uç (her biri gerekçesiyle) · 15 korumalı uç.

  **İKİ ÖLÇÜM TESTİN KENDİSİNİ DÜZELTTİ:**
  · **Metot da listede olmalıymış:** ilk taslak her yolu GET'liyordu ve `POST`-only uçlar 401
    döndü — çünkü eşleşmeyen METOT da `bearerAuth`a düşüyor. "Açık mı" sorusu yol+metot çiftine
    sorulur; yalnız yola sormak yanlış alarm üretir.
  · **Tanınmayan yol 401 dönüyor, 404 değil — ve DAVRANIŞ HAKLI ÇIKTI.** İlk taslak 404
    bekliyordu. Ölçünce görüldü ki bu, "varsayılan kapalı"nın doğal uzantısı: dışarıdan bakan biri
    hangi ucun VAR OLDUĞUNU ayırt edemiyor. 404 döndürmek kimliksiz bir tarayıcıya uç envanteri
    çıkarma yolu açardı. Test artık davranışı gerekçesiyle çiviliyor.

  **DAVET UÇLARI (12 iddia)** — karar katmanı zaten çiviliydi (`neighbor.test.ts`, 21.106); burada
  taşıma sınandı. En kırılgan karar **açık ama kimliğe duyarlı** olmaları: Bearer istemezler
  (bağlantıyı açan kişi henüz müşterimiz değil, davetin bütün amacı o) ama jeton VARSA okunur ve
  kendi bağlantısını açan `self` cevabını alır. `optionalCustomerId` düşürüldüğünde iki iddia
  birden kırmızı yandı — sabotajla kanıtlandı.
  Ayrıca bir sızıntı sınırı: komşu karşılaması motorda `deliveryZoneId` taşıyor, şema süzüyor —
  bölge kimliği operasyonun iç künyesi, komşuya söylenecek şey GÜNDÜR.
  Ve *"cevap HEP `true`"* kararı: geçersiz davet de `true` döner, çünkü kaydolmayı yeni bitirmiş
  kişiye söylenecek ilk cümle *"davetin geçersiz"* değildir; reddin gerekçesi log'a düşer.

  Doğrulama: `router.test.ts` **30/30** · `invite.test.ts` **12/12** · typecheck temiz.

- [x] (21.109) **MİSAFİR SEPETİ TESTLENDİ — gözle yakalanan sızıntı artık kendiliğinden görünüyor**
  · touches: `apps/mobile-api/src/api/v1/cart-view.test.ts`

  **BU DOSYANIN YAZILMA SEBEBİ BİR HATANIN KENDİSİ.** 24.08'de `readCartView`in dönüşü genişletildi
  (`CartRead = {body, source, place}`) ve misafir ucu bir süre `ok(c, view)` ile **tamamını** tele
  gönderdi — yani `source` ve `place` istemciye sızdı. `ok()` gevşek tipli olduğu için **derlemede
  hata vermedi**; sızıntı gözle fark edilip düzeltildi. Testi olsaydı gözle aramaya gerek kalmazdı.
  **Sabotajla kanıtlandı:** `ok(c, read.body)` → `ok(c, read)` yapıldığında beş iddia birden
  kırmızı yanıyor.

  **ÇİVİLENEN ÜÇ KARAR:**
  · **NİYET gövdeden, FİYAT asla** — gövde satırın yalnız adresini ve adedini taşır. İstemcinin
    gönderdiği bir tutar yok sayılıyor; kabul edilseydi sepet müşterinin belirlediği fiyattan
    kurulurdu.
  · **HİÇBİR ŞEY YAZMAZ** — uç bir görünüm üretir; sunucuda satır açsaydı girişli kullanıcının
    sepeti buradan gölgelenebilirdi. İddia `cart` tablosunun sayımını önce/sonra karşılaştırıyor.
  · **Bayat sepet isteği DÜŞÜRMEZ** — cihazdaki sepette silinmiş bir varyant olabilir; isteği
    tümden reddetmek müşteriye sepetini hiç göstermemek olurdu.

  **TESTİN KENDİ HATASI ÖLÇÜLDÜ:** ilk taslak dili `accept-language` BAŞLIĞINDAN veriyordu, oysa uç
  `?locale=` SORGU parametresi okuyor — altı iddia birden 400 aldı. Sözleşmeyi hafızadan yazmanın
  bedeli; bu turda ikinci kez oldu (öncekinde sipariş başlığının alan adları).

  **ARA ÖLÇÜM — bir kırmızı benim değildi:** sabotaj koşusu bir kez `packages/application/src/
  ticket/ai.ts`te *"It can not be redeclared here"* diye düştü. `git status` o dosyanın BAŞKA
  şeridin çalışma ağacındaki yarım düzenlemesi olduğunu gösterdi; birkaç dakika sonra kendiliğinden
  düzeldi. Paylaşılan ağaçta bir kırmızıyı sahiplenmeden önce `git status`a bakmak, bu turda üçüncü
  kez işe yaradı.

  Doğrulama: `cart-view.test.ts` **8/8** · `@lezzet/mobile-api` typecheck temiz.

- [x] (21.110) **SEPET UÇLARI TESTLENDİ — ve testler GERÇEK bir sızıntı buldu (13 iddia)**
  · touches: `apps/mobile-api/src/api/v1/cart.test.ts`, `apps/mobile-api/src/api/v1/cart.ts`

  **BULGU: BEŞ UÇTAN ÜÇÜ İÇ NESNELERİ İSTEMCİYE SIZDIRIYORDU.** `viewOf` okuma kapısının TAM
  dönüşünü veriyor (`CartRead = {body, source, place}`); `PATCH /items/:id`, `DELETE /items/:id` ve
  `POST /takeover` `.body` çıkarmayı atlamış, tamamını göndermişti. `source` sepetin iç karar
  nesnesi, `place` depo çözümü — ikisi de operasyonun künyesi, müşterinin değil.

  **DERLEMEDE HATA VERMİYOR** çünkü `ok()` gevşek tipli. Bu yüzden bir gün önce (24.08) aynı
  sınıftan bir sızıntı `cart-view`da **gözle** yakalanıp düzeltilmiş, **kardeşleri görülmemişti**.
  Gözle arama tam olarak böyle yarım kalıyor: düzeltilen yer görülür, görülmeyen yer düzeltilmez.

  **SIRA: ÖNCE TEST, SONRA DÜZELTME.** Testler yazıldı, altı iddia birden kırmızı yandı (üçü doğrudan
  sızıntı iddiası, üçü de `lines`ın bir kat derinde kalmasından), sonra üç satır düzeltildi → 13/13.
  Koruma künyeye de yazıldı: yeni bir uç `.body`yi unutursa `cart.test.ts` kırmızı yanar.

  **ÖTEKİ ÇİVİLENEN KARARLAR:** gövde HER ZAMAN liste (09.08 — eşzamanlı ekleme birbirini eziyordu,
  ölçüm: üç eşzamanlı ekleme → 1–2 satır) · aynı adres BİRLEŞİR, ikinci satır açılmaz · devir
  sunucudaki sepeti KORUR, üstüne ekler (ezseydi telefonunda boş sepetle giren müşteri masaüstünde
  biriktirdiğini kaybederdi) · boş liste geçerli bir devir gövdesidir · başkasının satırı silinemez.

  **TESTİN İKİ HATASI ÖLÇÜLDÜ:** `lineId` ayrı bir kimlik sanılmıştı — sepette satır ADRESİYLE
  yaşıyor, `lineId` varyantın kendisi (`readLineKey` künyesi). Ve `CartService.addItems` `kind`
  almıyor. İkisi de sözleşmeyi hafızadan yazmanın bedeli; typecheck birini, koşu ötekini tuttu.

  Doğrulama: `cart.test.ts` **13/13** · `@lezzet/mobile-api` typecheck temiz.

- [x] (21.111) **ÖDEME ADIMI TESTLENDİ — ve iddia iki kez yazıldı, çünkü ilki SAHTE YEŞİLDİ (9 iddia)**
  · touches: `apps/mobile-api/src/api/v1/checkout.test.ts`

  **ÇİVİLENEN KARAR: NİYET SUNUCUDAN, GÖVDEDEN ASLA.** Siparişin KALEMLERİ istemciden gelmiyor,
  sunucudaki sepetten okunuyor; gövde yalnız *"nasıl"* sorusunu cevaplıyor (adres · gün · yöntem ·
  kupon). Kural gevşerse **istemci ne isterse sipariş eder** — kendi seçtiği ürünü, kendi yazdığı
  adetle. Ve gevşemesi kolay: gövdeye bir `items` alanı eklemek "esneklik" gibi görünür.

  **İLK İDDİA BOŞLUĞA GEÇİYORDU ve sabotaj yakaladı.** Test *"sepet değişmedi mi"* diye soruyordu;
  siparişin kaynağını gövdeye çeviren sabotaj sepeti zaten değiştirmiyor, dolayısıyla test
  **korumasız kodda da geçti**. Sepet yanlış ölçüttü — sınanması gereken şey siparişin NEREDEN
  okunduğuydu.
  **Ölçüm doğru iddiayı verdi:** bu fikstürde rota posta kodunu kapsamadığı için sipariş açılmıyor
  ve ret, engellenen kalemi **ÜRÜN ADIYLA** döndürüyor (`blocked_lines`). Sepetteki ürünün adı
  geliyorsa niyet sunucudan okunmuştur. Fikstür de buna göre değişti: ikinci varyant değil **ayrı
  ürün** kuruluyor — aynı ürünün iki boyu aynı adı taşır ve soru cevapsız kalırdı.
  Yeni iddia sabotajda kırmızı yanıyor (`blocked_lines` → `empty_cart`).

  **BU, OTURUMUN DÖRDÜNCÜ SAHTE YEŞİLİ.** Sırayla: mail hizası sondası (küme boş kaldı) · yer adı
  yarışı (`renderHook` kuyruğu boşaltıyordu) · sabotaj koşusunun tek-uçlu koşucuya katılması ·
  ve bu. Dördünün de ortak dersi tek: **doğrulamanın kendisi doğrulanmadan bir şey kanıtlanmış
  sayılmaz.**

  **ÖTEKİ İDDİALAR:** taslak sepetten kurulur (satırlar `summary.lines` altında — kökte
  aranmıştı) · boş sepette de taslak döner ve `summary: null` bir CEVAPTIR (sıfırlarla dolu sahte
  bir özetten dürüst) · adressiz/bozuk/gövdesiz istek 400 · parmak izi BOŞ bırakılabilir (zorunlu
  yapmak güncellemeyen her cihazı ödeme yapamaz hâle getirirdi) · Bearer olmadan 401.

  Doğrulama: `checkout.test.ts` **9/9** · `@lezzet/mobile-api` typecheck temiz.

- [x] (21.112) **KALAN ON UÇ TESTLENDİ + ORTAK YARDIMCI DOĞDU — dalga 2 kapandı (56 iddia)**
  · touches: `apps/mobile-api/src/lib/testing.ts`,
  `apps/mobile-api/src/api/v1/{orders,payments,b2b,tickets,addresses,preferences,public-reads}.test.ts`,
  `apps/mobile-api/src/api/v1/{cart,points,invite,checkout}.test.ts`

  **KAPSAM: TESTSİZ KALAN ON UCUN ONU.** Kullanıcı kararı 25.08 — *"hepsini yaz"*. Üçe ayrılmış
  triyaj sunulmuştu (4 yazmaya değer · 2 sınırda · 4 yazmamayı öneriyorum); kullanıcı hepsini
  istedi ve dördü de yazıldı. Öneri yanlış değildi ama kapsam kararı kullanıcınındır.

  **ÇİVİLENEN ORTAK EKSEN: SAHİPLİK JETONDAN, YOLDAN DEĞİL.** `orders` · `payments` · `tickets` ·
  `addresses` — dördünde de kimlik URL'de dolaşıyor (referans numarası, adres uuid'si, talep
  kimliği) ve **tahmin edilemezlik bir yetki denetimi değildir**. Her birinde "başkasınınkine
  dokunulamaz" iddiası, GERÇEKTEN VAR OLAN ama görünmemesi gereken bir kayıtla kuruldu; yanına da
  "sahibi görebiliyor" iddiası konuldu — yoksa liste hep boş olsa da ilki geçerdi (sahte yeşil).

  **SİPARİŞ SAHİPLİĞİ ÇİFT KAT KORUNUYORMUŞ** (sabotajla ölçüldü): servis sorguyu daraltıyor VE
  uygulama katmanı dönen satırı ayrıca doğruluyor. Tek katı kaldırmak testi düşürmedi, ikisi
  birden kalkınca düştü — iddia bir katmanı değil korumanın kendisini ölçüyor.

  **İKİ VARSAYIM ÖLÇÜMLE ÇÜRÜDÜ:**
  · **Dev giriş kapısı kayıtsız e-postayı REDDETMİYOR ve bu BİLİNÇLİ.** İlk iddia ret bekliyordu;
    kapının künyesi tersini söylüyor (*"e-posta süzgeci bilerek yok"*) ve `generateLink` kullanıcıyı
    açıyor. Sözleşmeyi okumadan varsayan test, doğru davranışı arıza gibi gösterecekti. İddia
    kapının ASIL güvenlik özelliğine çevrildi: uç oturum değil, Supabase'in kendi doğrulamasından
    geçmesi gereken tek kullanımlık HASH döndürüyor — üretime sızsa bile zinciri atlamıyor.
  · **`b2b`nin açık yarısı bilerek SINANMIYOR:** SIRET ve AB KDV sorgusu DIŞ SERVİSE çıkıyor;
    onları koşuya sokmak üçüncü tarafın çalışma süresini bu paketin içine almak olurdu.

  **ORTAK YARDIMCI DOĞDU — `BEKLEYEN(21.110)` kapandı.** `signedInUser` sekiz dosyada birebir
  tekrarlanıyordu ve on tane daha yazılacaktı (`CLAUDE §1`). `lib/testing.ts` tek kapı oldu;
  tekrarın bedeli teorik değildi — GitGuardian'ı tetikleyen parola deseni de sekiz kopyanın
  sekizinde birden yaşıyordu.

  **TAŞIMA İKİ ARIZA ÜRETTİ VE İKİSİ DE ÖLÇÜLDÜ:** yerel yardımcı silinirken `profileIds`/
  `authUserIds`e yazan satırlar da gitti — dört dosyada teardown hiçbir şey temizlemez oldu.
  `mustDelete` bunu SESSİZ değil GÜRÜLTÜLÜ hâle getirdi (*"teardown 2 adımda yarım kaldı"*), yani
  `CLAUDE §4b`'nin kurduğu koruma tam da tasarlandığı gibi çalıştı. Ayrıca davet testi rota siparişi
  açıyor ve onu silmiyordu; sipariş ürünü ve depoyu `restrict` ile tutuyordu.
  **BEKLEYEN(21.112):** o pencerede yerel veritabanında **11 test profili** artık kaldı. Düzeltilmiş
  teardown yenisini bırakmıyor (ölçüldü: `cart-api` profilleri 2 → 2). Eskilerin silinmesi bir DB
  YAZMA işidir ve kullanıcının kararıdır (`CLAUDE §0`) — istendiğinde tek sorguyla temizlenir.

  Doğrulama: `apps/mobile-api/src/api/v1` **22 dosya · 298 test yeşil** (101 sn) · typecheck temiz ·
  lint temiz.

- [x] (21.113) **ZİYARET PUANI ARTIK EKRANDA İŞARETLİ — MB-54 kapandı, çift tik çözüldü**
  · touches: `packages/types/src/contracts/points-api.schema.ts`,
  `packages/application/src/customer/points.ts`,
  `apps/mobile/src/screens/customer-kit/points-earn-list.tsx`,
  `apps/mobile/src/screens/customer-kit/points-earn-messages.json`,
  `apps/mobile/src/screens/account/account-screen.tsx`

  **MB-54'ün açık kalan (c) yarısı.** Kullanıcı kararı 11.08: *"kullanıcı geldiği zaman o tik
  yanmalı."* (a) yarısı 12.08'de kapanmıştı; sözleşme "bugün alındı mı" bilgisini taşımıyordu.

  **ÖNCE BİR TASARIM ÇAKIŞMASI ÇÖZÜLDÜ (kullanıcı kararı 25.08).** Ziyaret satırının KİMLİK ikonu
  zaten bir onay işaretiydi; durumu da tikle söylemek aynı satırda **iki tik** demekti ve ikisi de
  durum bildirmez, süs gibi okunurdu. Kullanıcı ikonu değiştirmeyi seçti — tik DURUMA serbest kaldı.
  **İkon `refresh` oldu, takvim DEĞİL ve gerekçesi ölçülü:** tasarım dosyalarında takvim ikonu YOK
  (yalnız metinde geçiyor) ve olmayan bir geometriyi elle çizmek, tasarımın söylemediği bir şeyi
  bizim uydurmamız olurdu (CLAUDE §3). `refresh` sözlüğün kendi ikonu, aynı elden, ve anlamı
  isabetli: dairesel ok *"tekrar eden"* der — ödülün kendisi de her gün tekrarlıyor.
  **Üçüncü parti ikon kütüphanesi KURULMADI** (karar bu şeride bırakılmıştı): 35 ikonun 35'i tek
  elden (24×24, konturlu, dolgusuz); Lucide/Phosphor yanlarına ikinci bir el yazısı koyardı.

  **BAYRAK KARTTA, `earnWays` SATIRINDA DEĞİL.** Program tarifi (`/points/rules`) AÇIK bir uç ve
  onboarding onu MİSAFİRE gösteriyor; oraya kimliğe bağlı bir alan koymak o ucun *"kişisel hiçbir
  şey taşımaz"* sınırını delerdi. Kart zaten kimliğin kendisi ve B2B'de tümden `null` —
  `referralCode`/`earnWays`in kartın içinde olmasının gerekçesiyle birebir aynı.

  **İKİNCİ BİR "BUGÜN" TANIMI YAZILMADI:** `earnedToday(customerId, ['visit'])` işletme gününü
  (Europe/Paris) kısıttaki (`points_entry_visit_day`) ve günlük tavandaki tanımla AYNI okuyor.
  Ayrı olsalardı yazın Paris'te 00:00–02:00 arasında ekran "bugün alındı" derken motor yeni günü
  açmış olurdu — hiçbir yerde hata vermeyen, yılda bir kez görünen bir ayrışma.

  **BİLMEMEK OLUMSUZ DEĞİLDİR:** prop İSTEĞE BAĞLI ve verilmediğinde durum HİÇ çizilmiyor.
  Zorunlu olsaydı onboarding'deki misafire uydurma bir `false` gösterilirdi — yani "alamadığı"
  değil, **alamayacağı** bir şey için eksik işareti (CLAUDE §1).

  **ÜÇ SABOTAJ, ÜÇÜ DE YAKALANDI** — ve ikincisi TESTİ DÜZELTTİRDİ: işareti kümeye yayan sabotaj
  metin iddiasını GEÇTİ, çünkü sıklık metni `'claimedToday' in copy` ile korunuyor (öteki yolların
  sözlüğünde o anahtar yok) ama İKON böyle bir korumaya sahip değildi. İddia ikona çevrildi
  (`points-earn-<yol>-claimed`) ve sabotaj artık düşüyor. Üçüncüsü sunucuda: sebep süzgeci
  kaldırılınca *"başka sebeple kazanılan puan ziyaret işaretini yakmaz"* kırmızıya döndü.

  **TESTİN KENDİ İKİ HATASI:** RNTL v14'te `render` da beklenmezse `screen` kurulmuyor (beş test
  birden *"render function has not been called"*) · cihaz dili sabitlenmezse metin iddiaları
  makinenin diline bağlanıyor.

  Doğrulama: mobil paket **763/763** (753 → 763) · `points.test.ts` **22/22** · beş paket typecheck
  temiz (types · application · mobile · mobile-api · web) · lint temiz.

- [x] (21.114) **TEST DEFTERİ GERÇEK KALANINA İNDİ — baş maddesi ÜRETİLEMEDİ (MB-38)**
  · touches: `apps/mobile/src/lib/places/place-view.test.ts`, `docs/talep/not-mobil-test-defteri.md`

  **DEFTERİN BAŞ MADDESİ KAPANDI ÇÜNKÜ ÜRETİLEMİYOR.** *"`account-routes.test` tam koşuda düşüyor,
  tekil koşuda geçiyor — hata metni hâlâ yakalanmadı"* diye 09.08'den beri duruyordu.
  **Bugün üç tam koşu: 763/763 · 763/763 · 763/763.** Desen yok.
  Sebep zaten 19.08'de ölçülmüştü ve dosyayla ilgisi yoktu: yük ortalaması **22.96**, paket süresi
  **11 sn → 58 sn**. Yani düşüş MAKİNENİN SIKIŞIKLIĞINA bağlıydı. Açık tutmak, üretilemeyeni
  "bilinen arıza" diye taşımak olurdu — ve bugün aynı sınıfı bir kez daha ölçtük (tam paket 190 sn
  → 5329 sn, takas 8 GB/9 GB dolu; izole koşuda aynı dosyalar 12,8 sn'de yeşil).
  *"Jest did not exit"* uyarısı da üç koşuda hiç çıkmadı.

  **`21.20`'NİN BİRİM TEST BORCU ÖDENDİ** (`place-view.test.ts`, 15 iddia). Çivilenen asıl karar:
  **yer bilinmiyorsa "gönderemiyoruz" DENMEZ.** `elsewhere` iki ayrı şey olabilir — rota dışısınız
  (kalıcı) ya da bölgenizde şu an yok (geçici); ayrımı yer çözümü belirliyor ve yer BİLİNMİYORSA
  kural "geçici" der, çünkü kalıcı ret için rota dışında olduğunu BİLMEK gerekir. Ters çevrilseydi
  posta kodunu henüz vermemiş HER ziyaretçiye kalıcı bir ret gösterilirdi ve hiçbir yerde hata
  vermezdi: müşteri sessizce vazgeçerdi. Sabotajla kanıtlandı.

  **BİR DEFTER MADDESİ ÖLÇÜLÜNCE YANLIŞ ÇIKTI:** dev giriş kapısı için *"kayıtsız 400
  `dev_session_failed`"* yazıyordu; kapının künyesi tersini söylüyor (*"e-posta süzgeci bilerek
  yok"*) ve `generateLink` kullanıcıyı açıyor. Defteri okuyup varsayan bir test, doğru davranışı
  arıza gibi gösterecekti.

  **DURUM — KALAN ÜÇ MADDE, biri KARAR:**
  · `account-screen.test`e iki toast iddiası (dosya var, iddia eksik). → `21.115`'te yazıldı.
  · vFb fixture→şema dönüşü **bloke** — o dönüş yapılmadan tip kaynağı güncellenemez.
  · ~~`social-inbox-screen` testi KARAR bekliyor~~ — **karar sorulduğunda ÖLÇÜLDÜ: iş zaten
    yapılmıştı.** Web şeridi kendi ekranının testini 23.08 21:01'de yazmış
    (`16dd89eb`, görev `15.18`); 8 iddia, koşuyor. Yani kural istisnası hiç gerekmedi.
    Defter maddesi bayattı — **bu satır, ölçmeden karar sorulmuş olmasının kaydıdır.**

  Doğrulama: mobil paket **778/778** (763 → 778) · `@lezzet/mobile` typecheck temiz.

- [x] (21.115) **ONAY TOAST'LARI ÇİVİLENDİ — "rozet kaydı" ile "sunucu yazdı" ayrı şeyler (4 iddia)**
  · touches: `apps/mobile/src/screens/account/account-screen.test.tsx`

  Defterin kalan iki mekanik maddesinden biri. Ama yazarken ölçüm bir şeyi büyüttü: **rozetin yer
  değiştirmesi "oldu" demek değildir.** Rozet iyimser bir çizim olabilirdi; onayın tek gerçek
  kaynağı, yalnız başarılı yazmadan SONRA basılan toast'tır (`makeDefault` hata dalında erken
  çıkıyor). Dördü birlikte anlamlı:
  · onay adresin ADIYLA söylenir (`İş varsayılan yapıldı`),
  · **etiketsiz adreste ŞEHİR yazılır** — yer tutucu doldurulmazsa müşteri "undefined varsayılan
    yapıldı" okurdu; hiçbir yerde hata vermez,
  · **başarısız yazmada toast BASILMAZ**, yerine hata bloğu çıkar ve rozet de kaymaz — aksi hâlde
    müşteri değişmemiş bir ayarı değişmiş sanır, hatayı ancak bir sonraki siparişinde fark ederdi,
  · silmede *"Adres silindi"* denir: çekmecenin kapanması onay değil ("Vazgeç" de kapatır) ve
    silme geri alınamayan tek adres işlemidir.

  Defterin *"her ikisi de `account-screen.test`e"* demesi yarı yanlıştı: silme toast'ı 10.08'de
  ortak çekmeceye (`customer-kit/address-form.tsx`) taşınmıştı. Çekmece bu ekranın içinde
  çizildiği için iddia yine buraya yazıldı — ama kaynağı başka dosyada.

  Doğrulama: `account-screen.test` **12/12** · üç ayrı sabotaj, her biri **tam bir** testi
  düşürdü (şehir yedeği söküldü → etiketsiz iddiası; toast erken çıkışın önüne alındı →
  başarısızlık iddiası; silme toast'ı söküldü → silme iddiası) · mobil paket **782/782** (100 dosya)
  · typecheck + lint temiz.

- [x] (21.116) **UYGULAMANIN İKONU ARTIK MARKANIN — ve açılış perdesi BOŞ DEĞİL (MB-43 + MB-42)**
  · touches: `apps/mobile/assets/images/*`, `apps/mobile/app.config.ts`, `packages/design-tokens/package.json`

  **İKİ SESSİZ KUSUR ÖLÇÜLDÜ — ikisi de hiçbir yerde hata vermiyordu.**
  · `icon.png` **Expo şablonunun MAVİ gradyanıydı** (#3EA1FF → #0173DE), `android-icon-background.png`
    soluk mavi (#E6F4FE). Uygulama markanın değil ŞABLONUN ikonuyla taşınıyordu.
  · `splash-icon.png`in **19 310 opak pikselinin TAMAMI #FFFFFF** idi ve perde zemini de `#FFFFFF`.
    Beyaz üstüne beyaz → **açılış perdesi boş görünüyordu.** Karanlık mod alternatifi de yoktu.
  · `app.config.ts` künyesi *"PNG'lerin zemini beyaz"* diyordu; **ölçüm bunu yalanladı** ve `MB-42`
    kaleminin bütün gerekçesi o yanlış ölçüme dayanıyordu.

  **KAYNAK KULLANICININ VERDİĞİ MARKA LOGOSU** ve **REPOYA ALINDI**:
  `apps/mobile/assets/brand/logo-master.png` (3000²) + üretim parametrelerini taşıyan `README.md`.
  Kaynağın repo DIŞINDA durması (`temp/`) seed fikstürlerinde alınan dersin aynısıdır: bir gün
  silinince yeniden üretim imkânsız olur. Yazısız sürüm bilerek seçildi (ikon boyutunda kelime
  markası okunmaz); yazılı sürüm giriş/onboarding ekranlarındaki `logo.png` olarak **ayrı bir
  varlık** hâlinde kalıyor — geniş oranlı ve üç ekranın yerleşimi ona göre kurulu.

  Yazılı logonun yeni (kare) sürümü de verildi ama **kullanılmadı ve bu bilinçli:** bugünkü
  `logo.png` geniş oranlı (1244×602) ve üç ekranın yerleşimi ona göre kurulu; kareye geçmek görsel
  bir karardır, improvise edilmez (CLAUDE §3). Kalem `BACKLOG-musteri §8`'e yazıldı.

  **ZEMİN UYDURULMADI, ÖLÇÜLDÜ:** logonun kendi zemini **#FAF6EC** ve bu birebir
  `customerSand['sand-25']` ("sayfa zemini"). Yani ikon, uygulamanın açtığı ilk ekranla AYNI yüzeyi
  gösteriyor — açılışta zemin bir kez zıplamıyor.

  Üretilenler (tek kaynaktan, ölçülen içerik kutusuyla): `icon.png` 1024² **opak** (iOS saydamlık
  kabul etmez) · `splash-icon.png` 512² saydam · `android-icon-foreground.png` 1024² saydam,
  sanat **güvenli bölgede** (%60 — uyarlanabilir ikonun görünen alanı tuvalin orta 72/108'i) ·
  `android-icon-background.png` düz krem · `android-icon-monochrome.png` siluet.

  **VE `MB-42` BUNUNLA BİRLİKTE KAPANDI — depo geneli bayrak GEREKMEDİ.** Paketin GİRİŞİ uzantısız
  yeniden-ihraçlar taşıyor ve Node onları çözemiyor (`ERR_MODULE_NOT_FOUND`, üretildi). Denendi:
  `allowImportingTsExtensions`i paketin kendi tsconfig'ine koymak YETMİYOR — tüketici paketin
  kaynağını kendi programına dahil ediyor (ölçüldü: paket temiz, `apps/mobile` 5 × TS5097), yani
  bayrak `packages/typescript-config/base.json`e girmek zorundaydı. **Çare girişi hiç kullanmamak
  oldu:** `customer.ts` YAPRAK modül (hiç göreli import'u yok) ve pakete **alt yol ihracı** eklendi
  (`"./customer": "./src/customer.ts"`). Paylaşılan alanda **EKLEME**; mevcut düzen korundu.

  **PERDE İŞARETİ BÜYÜTÜLDÜ — 76 dp → 164 dp (kullanıcı kararı 25.08).**
  *"Ekranın ortasında kocaman olsun."* Ölçüm gerekçeyi verdi: cihaz yoğunluğu 408 (ölçek 2,55),
  ekran **423 dp** geniş — 76 dp, genişliğin yalnız **%18'i** demekti. Şimdi %40, yani 2,2 katı.
  Kaynak da 512² → **1024²** büyütüldü (164 dp xxxhdpi'de 656 px eder).

  **ARA BİR DEĞER YANLIŞTI — VE ASIL DERS DEĞERDE DEĞİL, DOĞRULAMADA.** Önce 280 dp yazıldı ve
  işaret cihazda **kırpıldı**: sol ilmik ve sağ süpürme gitti, "A"nın tepesi kesildi. Sebep:
  Expo Android 12'nin splash API'sini bildiriyor (`windowSplashScreenAnimatedIcon`) ve işaret
  maskeleniyor — *"as with adaptive icons, one-third of the foreground is masked"*; ikon zemini
  yoksa tuval 288 dp, görünen daire **192 dp**. 280 dp'de mürekkep 257 dp'ye çıkıyordu.

  **BİR TUR "API 30'DA UYUM KATMANI MASKELEMEZ" DENDİ VE YANLIŞTI.** androidx'in kendi kaynağı
  aksini yazıyor (`compat_splash_screen_no_icon_background.xml`): *"We mask the outer bounds of the
  icon **like we do on Android 12**."* Cihazda ölçüldü (Android 11): görünen daire ≈ **191 dp**.

  **VE CİHAZ TURU BUNU GÖSTERMİŞTİ, GÖZDEN KAÇTI.** 280'lik derlemenin ekran görüntüsü alınmıştı ve
  kırpma oradaydı; yalnız işaretin BOYU ölçülüp bütünlüğü karşılaştırılmadı. Ölçüt basitmiş: kaynak
  sanatın oranı **1,141** (2377×2083), ekrandaki oran **0,85**. **Kırpılmış bir görüntünün oranı
  sapar** — perde/ikon doğrulaması bundan sonra bu karşılaştırmayı içermeli; *"büyük görünüyor"*
  bir doğrulama değildir. Kalıcı kaydı `assets/brand/README.md`de.

  Sınır ölçülerek bulundu: 164 dp → üretilen çizimde tüm mürekkebin çapı **191,5 dp** (izin verilen 192).

  **CİHAZDA DOĞRULANDI — repodaki dosyalar değil, TELEFONDAN GERİ ÇEKİLEN APK ölçüldü**
  (OPPO CPH1907, Wi-Fi, `adb pull` + kaynak pikselleri):

  | Kaynak | Önce (kurulu APK) | Sonra (kurulu APK) |
  | --- | --- | --- |
  | `ic_launcher.webp` | `#399DFC · #0475E0` (Expo mavisi) | `#FAF6EC` %84 + zeytin `#575B31` |
  | `ic_launcher_background.webp` | `#E6F4FE` %96 | `#FAF6EC` %100 |
  | `splashscreen_logo.png` | opakların %100'ü `#FFFFFF` | zeytin `#575B31`, saydam zeminde |

  Ekran görüntüsü de alındı: perde zemini **`#FAF6EC` %99,4**, işaret ortada ve genişliğin
  **~%55'i**. Yani "beyaz üstüne beyaz" hâli artık üretilemiyor.

  *(Derleme yerelde koşuldu: `expo prebuild --clean` + `gradlew app:assembleDebug`. `ANDROID_HOME`
  ajan kabuğunda tanımlı değildi ve ilk deneme `SDK location not found` ile düştü — SDK
  `~/Library/Android/sdk`. `expo run:android --device` cihaz adını tanımadı çünkü adb aynı telefonu
  IP ve mDNS olmak üzere İKİ kayıtla listeliyor; cihaz seçimi atlanıp `adb install -r` kullanıldı.)*

  **İKON ORANLARI BÜYÜTÜLDÜ — ve "daire" sorusunun cevabı kayda geçti (kullanıcı kararı 25.08).**
  Kullanıcı cihazda gördü: *"resmi daire içerisinde küçültmüşsün… daire hiç olmasın istiyorum."*
  **Daire bizim değil:** Android 8'den beri her ikon başlatıcının maskesinden geçiyor (ColorOS'ta
  daire) ve `adaptiveIcon` kaldırılsa maske KALKMAZ, kötüleşir — eski tip ikonu sistem kendi
  çizdiği zemine oturtup daha da küçültür. Elimizdeki tek değişken maskenin İÇİ.

  Ödünleşme ölçüldü: mürekkebin merkezden en dış uzaklığı sanat genişliğinin **%61,7'si**
  (köşelerde kıvılcım, ekmeğin ucu, A'nın ayağı), maskenin görünen daire yarıçapı tuvalin
  **%33,3'ü** → **hiç kırpılmadan sığmak için azami oran %54**, ve o oranda logo küçük duruyor.
  Üç oran çizilip bakıldı — %54 (%0,1 kayıp, küçük) · **%75 (%15,4 kayıp, seçildi)** · %95
  (%35,8 kayıp, "A" kesiliyor). Yani **büyüklük ile kırpılmazlık bu kompozisyonda aynı anda
  sağlanamıyor**; karar büyüklükten yana verildi.
  **BİR TUR %75 SEÇİLDİ, SONRA GERİ ALINDI.** Kırpma cihazda görülünce kullanıcı bütünlükten yana
  karar verdi (*"%50'ye indir — hiçbir şey kesilmesin"*); ölçüm %50'nin de güvenli bölgeyi 2 puan
  aştığını gösterdi (%63,4 > %61,1), o yüzden **%48**: mürekkebin çapı **65,8 dp**, Google'ın
  **66 dp güvenli bölgesine** sığıyor — hiçbir OEM maskesinde kesilmiyor (daire ve kavisli kare
  önizlemeleriyle doğrulandı). iOS ikonu **%78 → %88** (kavisli kare maskesi daireden cömert).
  Gerekçe kalıcı olarak `assets/brand/README.md`de.

  **Bu iki değişiklik CİHAZDA DOĞRULANMADI** — kullanıcı yeniden derleme istemedi (*"fakat yeniden
  derlemeni istemiyorum"*). Yerel maske önizlemeleriyle bakıldı; telefonda görünmesi için bir
  sonraki derleme gerekiyor.

  Doğrulama: `expo config` → `backgroundColor: '#faf6ec'` (ham hex kalktı) · mobil paket
  **786/786** · `@lezzet/design-tokens` birim **30/30** · mobil + web + tokens typecheck temiz · lint temiz.

- [x] (21.117) **`phone_taken` ÖLÜ METNİ SÖKÜLDÜ — sözlük artık olmayan bir kuralı anlatmıyor (04.10 artığı)**
  · touches: `apps/mobile/src/screens/{profile-setup,checkout,account}/messages.json`, aynı üç ekranın künyeleri

  Web şeridi `04.10`'da kimlik anahtarını taşıdı: `user_profiles.phone` artık **iletişim
  numarasıdır**, kimlik `customer_phone`da (migration 0049). Tekil indeks (`user_profiles_phone_key`)
  kalkınca ondan türeyen ret de kalktı — `MeUpdateErrorEnum` bugün `['name_required', 'phone_invalid']`.

  **Mobilde cümle duruyordu: üç ekran × üç dil = 9 satır**, artı üç künye yorumu onu var gibi
  anlatıyordu. Görünür bir arıza değildi (sunucu o anahtarı hiç döndürmüyor) ama **ileriye dönük
  yanlış bilgiydi**: dosyayı okuyan "demek numara tekil" diye düşünüp olmayan bir kurala göre kod
  yazardı. Sözleşmenin kendi künyesi de bunu adıyla koymuş: *"ekranlardaki cümlesi ölü metindir."*

  **Silme güvenli, ölçüldü:** üç çağrı yerinde de bilinmeyen anahtar yedeğe düşüyor
  (`t.errors[known] ?? t.errors.unexpected` · `?? t.contact.errors.generic`), yani bir gün
  beklenmedik bir ret gelse ekran boş kalmaz.

  **Müşteriye yansıması bir kayıp değil, kalkmış bir engelin artığı:** aynı numarayı iki hesabın
  taşıması artık meşru (aile telefonu, işyeri hattı) ve kimseye *"bu numara başka bir hesapta
  kayıtlı"* denmiyor.

  Doğrulama: `apps/mobile`da `phone_taken` **0 eşleşme** · mobil paket **787/787** · typecheck ·
  lint temiz. Notu kapatıldı (`not-mobil-phone-taken-reti-kalkti.md` silindi).

- [x] (21.118) **YERİNDE SATIŞ — ZEMİN: hızlı satış motoru pakete terfi etti (DOMAIN §17, kullanıcı kararı 26.08)**
  · touches: `packages/application/src/order/quick-sale.ts`, `packages/application/src/warehouse/preparation.ts`,
    `packages/application/src/index.ts`, `apps/web/lib/accounting/profit.test.ts`, `apps/web/lib/accounting/gift-order.test.ts`

  **NEDEN BU ŞERİTTE.** Kullanıcı kurye aracından satışı açtı ve ölçüm bir çelişki buldu: `09.8`
  kapı satışını admin ekranına koymuştu, oysa `DOMAIN §17` *"Admin yerinde satış yapmaz — satan
  kişi, malın yanında duran personeldir"* diyor. Bir ay görünmemişti çünkü ekran hiç yazılmamıştı.
  Karar: **yerinde satış (depo kapısı VE kuryenin aracı) native uygulamanın kurye/depo bölümünün
  işidir**; web'de kalan yalnız telefonla gelen siparişin masada yazılması.

  **ZEMİNİ WEB ŞERİDİ HAZIRLADI, ÖLÇÜLDÜ VE DOĞRU:**
  · `warehouse.kind` = `facility` | `vehicle` — **araç ayrı bir kavram değil, bir depo TÜRÜ**.
    Yükleme ve akşam dönüşü birer transfer; araçtaki mal gerçek parti, yani SKT · FEFO · geri
    çağırma izi · soğuk zincir bedavaya geliyor.
  · `delivery_type += 'pickup'` — yerinde satışta mal gitmez, müşteri alır. Eskiden varsayılana
    düşüp `route` yazılıyordu: adressiz, bölgesiz, kuryesiz bir "rota siparişi".
  · `order_item.list_unit_price` + `price_set_by` — pazarlık izi, kısıt veride
    (`order_item_negotiation_complete`, yarım iz yok).
  Üç kural VERİDE zorlanıyor (ölçüldü): araca bölge bağlanamaz (tetikleyici
  `delivery_zone_warehouse_is_facility`), araç kargo deposu olamaz (kısıt
  `warehouse_vehicle_never_ships`), araç depo-üstü toplama girmez (`available_stock_total`
  görünümünde `join … w.kind = 'facility'`). Depo bazlı okuma aracı **aynen gösterir** — kurye
  arabasında ne olduğunu görmek zorunda.

  **BU DİLİMDE YAPILAN: motorun evi değişti.** `quickSale` `apps/web/lib`de duruyordu ve
  `apps/mobile-api` oradan import EDEMEZ. Taşıma ucuz çıktı çünkü **web'de üretim çağıranı yoktu**
  — ölçüldü, tek çağıranı testleriydi. İmza paket kuralına uydu (`quickSale(db, input)`;
  `serviceDb()` uygulama katmanında çağrılmaz).

  **İKİNCİ BİR FEFO YAZILMADI (CLAUDE §1).** `quickSale`in ihtiyaç duyduğu parti önerisi pakette
  ZATEN vardı — `warehouse/preparation.ts` içinde özel bir `suggestPicksForVariant` (21.11
  terfisinde yazılmış). Kopyalamak yerine **ihraç edildi** (tek kelime). Tahsilat da öyle: web'in
  `lib/money/order-payment.ts`i 51 satırlık bir `serviceDb()` sarmalayıcısıydı, asıl uygulama
  zaten `packages/application/src/order/payment.ts`te — `quickSale` artık doğrudan onu çağırıyor.

  **YAN ETKİ BİLDİRİLDİ:** ~~`apps/web/lib/stock/fefo.ts`~~ bu taşımayla ölü kaldı (tek üretim çağıranı
  `quickSale`ti). Silmediniz, karar web şeridine bırakıldı — **ve o karar 26.08'de verildi: SİLİNDİ.**
  Ölçüm, notta önerilen "paket sürümünü zenginleştir" yolunu çürüttü: üç fazla alanı (`flag`,
  `remainingPercent`, `lotNumber`) hiçbir üretim kodu okumuyordu — eski çağıran `quickSale` de
  yalnız `stockId`+`qty` alıyordu, o alanları YALNIZ kendi testi doğruluyordu. Pakete taşımak
  okuyanı olmayan üç alan eklemek olurdu (paket künyesinin kendi uyarısı: *"hesaplanıp atılan bir
  değer, bir gün 'bu neden hep boş' diye aranacak ölü koddur"*). Alanlar, onları okuyacak ekran
  (D3 raf ömrü) geldiği gün pakete eklenir. *(Bu satırı denetim düzeltti — dosyayı silen taraf
  referansı da düzeltmeliydi.)*

  **KAPSAM BU TURDA KÜÇÜLDÜ — kullanıcıyla konuşarak (26.08).** Başta iki akış vardı: personelin
  cihazından misafir satış (A) ve müşterinin kendi telefonundan kimlikli satış (B, QR/kod ile).
  **B tamamen düştü:** *"Geçmişi olsun isteyen önceden sipariş versin, bizim sipariş kanallarımızı
  kullansın."* Böylece kod/QR, müşteri kataloğu, kuryeye devir ekranı — hepsi listeden çıktı.

  **A üç sorunu birden çözdüğü için tek başına yeterli:** pazarlığı personel zaten kendi yazıyor
  (`list_unit_price` doğal yerinde), kimlik hiç sorulmadığı için yanlış kimlik kurulamıyor, ve
  müşteri tarafında sürtünme sıfır (malı alır, parayı verir).

  **KİMLİK SORULMAMASI BİR KARARDIR, ihmal değil.** Ölçüldü: `customer_phone` künyesi
  *"operatörün elle yazdığı numara buraya YAZILMAZ — klavyeden geçmek kanıt değildir"* diyor, ve
  kayıt tetikleyicisi (`0002`) taslağı e-postayla sahipleniyor — koşulunda `is_draft` YOK. Yani
  kurye yanlış bir e-posta yazsa, o adresin gerçek sahibi kayıt olduğunda tanımadığı bir satın
  alma geçmişini devralırdı ve hiçbir yerde hata vermezdi. Kullanıcı kararı: *"onaylanmamış mail
  ile geçmiş miras alınamaz; geçmişini önemseyen hesap açsın"* — ve bu ekranda birebir söylenecek.

  ~~SIRADAKİ DİLİMLER (bu satır açık kalıyor): (a) orkestrasyon · (b) misafir alıcı kaydı ·
  (c) mobile-api ucu · (d) native ekran~~ — **dördü de aynı gün `21.119`'da teslim edildi**
  (`sellOnSite` · `ANONYMOUS_BUYER_ID` tek kayıt, `system` rolüyle müşteri listelerinden dışarıda ·
  `/api/v1/sale/*` · üç yüzeyli ekran, cihazda canlı satışla kanıtlı). Satır o teslimle kapandı;
  zemin kaydı (Drive şartları dahil) referans olarak duruyor.

  **DRIVE'IN ÖNÜ AÇIK BIRAKILDI ve şartları yazıldı** (`DATA_MODEL` › `pickup`). Kullanıcı sordu:
  *"ileride Drive mantığı olacak — müşteri sipariş verip depodan gelip alacak, belki randevuyla."*
  Bir tur *"pickup ⇒ anında tüketim"* diye bir değişmez önerilmişti ve **geri alındı**: tam o cümle
  kapıyı kapatırdı. Stok etkisini teslimat tipi değil GEÇİŞ belirliyor (`stockEffectOf`), yani aynı
  `pickup` siparişi hem anında tüketen hem ayıran yoldan geçebilir — Drive için ne yeni bir stok
  kavramı gerekiyor ne dördüncü bir teslimat tipi. **Kodda kapanan yok; kapanan tek şey `DOMAIN
  §624`'ün Google "hizmet bölgesi" kaydının bugünkü biçimi** (adres gizli, *"müşteri çekmez, ziyaret
  saati yoktur"*) — Drive geldiği gün o karar yeniden açılmalı.

  Doğrulama: taşınan test yeni evinde **10/10** (DB'ye vuruyor) · dokunulan iki web testi **7/7** ·
  birim paketi **1526/1526** · `packages/application` + `apps/web` + `apps/mobile-api` typecheck ·
  lint temiz.

- [x] (21.119) **YERİNDE SATIŞ TAMAM — depo kapısı ve kuryenin aracı tek kapıdan, tek ekrandan satıyor**
  · touches: `packages/application/src/order/on-site-sale.ts`, `packages/application/src/index.ts`

  `sellOnSite(db, input)` — personelin O ANKİ deposundan (tesis **ya da araç**) tek adımda satış:
  sepet okuması → taslak sipariş → `quickSale`. `DOMAIN §17`: *"Admin yerinde satış yapmaz — satan
  kişi, malın yanında duran personeldir."*

  **İKİNCİ BİR SİPARİŞ KURALI YAZILMADI (09.8'in dersi).** Fiyat, KDV, indirim ve toplam
  `getCartView`ten geliyor — müşterinin gördüğü sayıyı üreten motorun ta kendisi. Pazarlık da oraya
  giriyor (`priceOverrides`); o alanın künyesi zaten *"yalnız personel yolundan dolar (elle sipariş
  girişi, **yerinde satış**)"* diyordu, yani web şeridi bu kapıyı öngörmüş.

  **AMA `createCheckoutDraft` KULLANILMADI ve bu bilinçli.** O kapı **adresten çözülen** akıştır —
  dönüş tipi bile `AddressDeliveryType`, yani `pickup` HARİÇ. Yerinde satışta adres, bölge, gün ve
  kargo ücreti yok; dördü de `pickup`ın tanımı gereği anlamsız (`resolveShippingFee` `pickup`
  ALMAZ: cevabı "0" değil, sorunun kendisi geçersiz). Adres yolunu zorlamak, dar kümenin taşıdığı
  kararı sessizce delmek olurdu.

  **`draft → completed` KARARI BU KAPIDA DURUR**, `delivery_type` semantiğinde değil — Drive'ın
  önünü açık tutmanın birinci şartı buydu (`DATA_MODEL` › `pickup`). Aynı `pickup` değeri yarın tam
  yoldan geçecek: ayırır → hazırlar → teslimde tüketir.

  **`order_source='door'` ilk kez yazılıyor** — enum değeri tanımlıydı, yazan yolu yoktu.

  **Testte ölçülen bir kısıt:** kurye/depocu **kapsamsız olamıyor**
  (`user_profiles_warehouse_scope`: boş dizi "hiçbir depo" demek, kapı fail-closed kapanır). Yani
  araçtan satacak kuryenin kapsamına aracın deposu girmeli — ekran tarafının bileceği bir şey.

  **KULLANICI SORDU, TEST BİR KUSUR BULDU (26.08):** *"oradan satış yaptırırken oranın stoğunu göz
  önünde bulunduracak mıyız?"* Cevap evet ve iki katman birden — sepet okuması DEPO BAZLI
  (`availableHere`, araç deposu da aynen görünür) ve son söz RPC'nin. **Ama kontrol yalnız
  `quickSale`de kalınca satış doğru reddediliyor, geriye HAYALET BİR TASLAK kalıyordu:** hiçbir yere
  teslim edilmeyecek, hiç kapanmayacak, kimsenin silmediği bir sipariş satırı. Ölçüldü — araçta 5
  varken 6 istendi, satış olmadı, sipariş sayısı 0 → 1.

  Çare uydurulmadı: `createCheckoutDraft` aynı reddi **yazımdan önce** veriyor (`insufficient_here`)
  ve aynı alandan okuyor. Aynı ad, aynı biçim; **adet sessizce DÜŞÜRÜLMEZ**, kalan sayı söylenir —
  personel müşteriye "üçü var" diyebilsin diye. *"Önce kontrol, sonra yazım"* zaten `07.10`'un
  ilkesiydi; burada eksikti.

  Doğrulama: **7/7** (DB'ye vuruyor) · **üç sabotaj, her biri TAM BİR testi düşürdü**: pazarlık
  sepet okumasına geçirilmeyince toplam listeden çıktı; anonim alıcıya `customer` rolü verilince
  müşteri listesinde belirdi; yazım öncesi stok kontrolü sökülünce hayalet taslak geri geldi ·
  lint · birim **1526/1526** · `docs:check`.
  *(Not: `packages/application` typecheck'i şu an ÖTEKİ ŞERİDİN uçuşta olan değişikliği yüzünden
  kırmızı — `discount.publicLabel` zorunlu yapılıyor, yani bıraktığım notun karşılığı yazılıyor.
  Kendi dosyalarımda **0 hata**; ölçüldü.)*

  **ANONİM ALICI YAZILDI VE KOŞTU** (kullanıcı `db:refresh` izni 26.08). Sipariş sahipsiz olamıyor
  (`order.customer_id not null`) ama kimlik de sorulmuyor — `0001` sabit kimlikli tek satır açıyor:
  `roles = {system}`, `id = …d001`. **Rol bir yetki değil, bir beyandır:** *"bu satır bir kişi
  değil."* Hiçbir guard'a uymuyor ve müşteri okumaları `roles @> {customer}` ile süzüldüğü için
  (`CUSTOMERS_ONLY`, beş yerde) hepsinden **kendiliğinden düşüyor** — hiçbir sorgunun yeni bir kural
  hatırlaması gerekmedi. Ölçüldü: 9 müşteri, 1 sistem; liste anonim satırı hiç görmüyor.

  **Elenen alternatifler kayda geçiyor:** sefer/gün başına ayrı kayıt (sorun birikme değil GÖRÜNME —
  o kayıtlar da müşteri olarak sayılırdı, *"500 müşterimiz var"* demek *"müşterisi bilinmiyor"*
  demekten daha yanlış), rolsüz satır (kısıt reddediyor), personel rolü (kapı AÇARDI), ayrı bayrak
  (her müşteri sorgusuna ikinci koşul — ekleyeni unutan ilk sorgu anonimi müşteri sayardı).

  **VE ENUM GENİŞLEMESİ BİR DUPLİKASYONU AÇIĞA ÇIKARDI.** `system` eklenince web'de üç yerde elle
  yazılmış `Exclude<UserRole, 'customer'>` kırıldı — derleme durdurduğu için kimse yanlış etiketle
  karşılaşmadı. Tek ada toplandı: **`StaffRoleEnum = UserRoleEnum.exclude(['customer', 'system'])`**
  (`packages/types`). İki değer de personel değil ama ayrı sebeple: biri müşteri ekseni, öteki bir
  kişi bile değil. Sonraki rol de aynı kapıdan geçecek (CLAUDE §1).

  **UÇ AÇILDI — `POST /api/v1/sale/on-site`** (sözleşme `sale-api.schema.ts`).

  **AYRI YÖNLENDİRİCİ, ÇÜNKÜ AYRI ROL KÜMESİ.** Depo yönlendiricisinin kapısı `warehouse`/`admin` ve
  kurye oraya giremez — hazırlık kuyruğu, mal kabul, kutu mühürleme onun işi değil. Ama yerinde
  satışı **kurye de yapar** (`DOMAIN §17`). Rol kümesi farklı olduğu için kapı ayrı; paylaşılan tek
  şey depo çözümü — `warehouseGuard` **ihraç edildi, kopyalanmadı** (kapsam kuralı iki yerde
  yaşasaydı ayrıştığı gün biri sessizce zayıflardı).

  **DEPO VE MÜŞTERİ GÖVDEDE YOK.** Depo personelin künyesinden geliyor (kapsam kontrolüyle), müşteri
  anonim alıcı. İkisini de istemciden almak kararı istemciye vermek olurdu — `placeOrder`ın
  *"müşteri kimliği istemciden ASLA alınmaz"* kuralının aynısı. Ölçüldü: kapsam dışı depo istenirse
  **403** ve geriye sipariş kalmıyor.

  **KAPININ KARARI NE OLURSA OLSUN 200.** Yetersiz stok bir HTTP hatası değil, bir cevap: kalan sayı
  gövdede gelir ki personel müşteriye *"dördü var"* diyebilsin. Kapanış reddi ise gövdeye
  AYRINTISIZ iniyor (`failed`) ve sebebi `captureError` ile kimlikle loglanıyor — personelin
  yapabileceği bir şeye çevrilemeyen bir sebep, ekranda gürültüdür.

  **KAPI BEYANI GÜNCELLENDİ:** `router.test`in `KORUMALI` listesi bir *beyandır* (künyesi: *"router'dan
  türetilseydi taşınan bir satır testi de beraberinde taşırdı"*) — para alan bir uç oraya yazılmadan
  bırakılamazdı. 30 → 31 iddia.

  Doğrulama: uç testi **5/5** · `router` **31/31** · sabotaj: rol kümesinden `courier` çıkarılınca
  **üç** test düştü (kuryeye ait olanlar) · `apps/mobile-api` typecheck · lint.

  **BU DEPODA NE VAR — `GET /api/v1/sale/catalog`.** Ayrı bir "araç stoğu" okuması YAZILMADI:
  katalog okumasının (`getCatalogData`) ta kendisi, yalnız `place.warehouseId` personelin o anki
  deposu. Depo bazlı `available_stock` aracı zaten aynen gösteriyor. İkinci bir okuma, vitrinle
  satış ekranının aynı ürün için farklı *"tükendi"* demesine açık kapı bırakırdı. Kargo deposu
  bilerek `null` (yerinde satışta kargo yok), görüş `b2c` (alıcı anonim, kimlik yok).

  **KALAN ADET SINIRI KAPANDI (26.08 — eski `BEKLEYEN` buradaydı).** Katalog sözleşmesi kalan adedi
  bilerek taşımıyordu (müşteriye stok sayısı sızdırılmaz); personelin *"kaç tane var"* sorusu ise
  cevapsızdı. Çözüm vitrine dokunmadı: satış zarfı ayrı (`SaleCatalogProductSchema.availableHere`
  — `CatalogProductSchema.extend`, ikinci bir kart şekli YOK), kaynağı `getAvailableMap`, yani
  sepet doğrulamasının okuduğu görünümün ta kendisi. Çok boylu ürün için ikinci uç:
  `GET /sale/catalog/:slug/variants` — `getProductDetail`in kendisi (yer = personelin deposu), boy
  başına fiyat + kalan. Ölçüldü: aynı ürün için kurye ARACIN sayısını (4), depocu TESİSİN sayısını
  (9) görüyor — sayı ekranda, karar sunucuda.

  **NATIVE EKRAN YAZILDI — `/sale`, tek ekran iki bölümden** (kullanıcı onayı 26.08: *"mevcut
  desene uyarak kendimiz hazırlayalım"*). Depo hub'ına D7 satırı, kurye gününe sabit şerit eklendi;
  ikisi de aynı rotaya gider çünkü satan kişi malın yanındaki personeldir ve depoyu sunucu künyeden
  çözer — ekran depo SORMAZ. Akış mal kabulün çekmece deseni: ara → karta dokun → (çok boyluda boy
  seç) → `OperationsQtySlider` ile adet → fiyat alanı → sepet → nakit/kart → tek CTA.
  `apps/mobile/src/screens/sale/` (ekran + hook + sözlük + test) · `lib/api/sale.ts` (istemci).

  Ekranın çivilenen kararları: **pazarlık yalnız DOKUNULAN kalemde gider** (alan liste fiyatıyla
  açılır; değişmediyse istekte hiç yoktur — fiyatı sunucu çözer); **ara toplam GÖSTERGEDİR**,
  kesin toplam (indirim/KDV) cevaptan okunur ve sözlük bunu söyler; **adet kalanı aşınca çekmece
  onaylatmaz** ama bu ön kibarlıktır — gerçek kapı `insufficient_here`dir ve o cevap sepeti
  BOZMADAN adı+kalanıyla gösterilir; **kasa ayarsız satışta** (`paymentRecorded: false`) başarı
  cümlesi yerine "para deftere geçmedi" uyarısı basılır — CLAUDE §0 pansuman kuralının ekrandaki
  hâli. `system` rolü kabuğun rol→bölüm haritasına `null` olarak işlendi (bölüm doğurmaz).

  Doğrulama (üçüncü tur): uç testi **8/8** (kalan adet iki personel gözünden) · `router` **33/33**
  · ekran testi **6/6** (jest) · sabotaj: "pazarlık her kaleme gönderilsin" yapılınca tel-şekil
  testlerinin İKİSİ düştü, geri alınınca yeşil · mobil paket **793/793** · iki typecheck · lint.

  **CİHAZ TURU KOŞULDU (26.08) ve İKİ GERÇEK ARIZA BULUP DÜZELTTİ** — jest ikisini de göremezdi:
  1. **Kurye satış ekranını HİÇ açamıyordu** (`400 warehouse_required`): kapsamı bilerek çok
     depolu (rota seçimi tesislere bakar, 19.25) ve guard'ın "tek depo" kuralı ona uymuyor.
     Çözüm kural olarak veri modelinde zaten yazılıydı, uca uygulandı (`courierVehicleFirst`):
     parametresiz gelen kuryenin satış deposu kapsamındaki TEK araçtır; parametre verilirse
     kapsam kontrolü guard'da aynen koşar (depo kapısından satan kurye böyle mümkün). Seed de
     gerçeğe getirildi: Marc'ın kapsamına VAN-1 + araca yükleme transferi (STR → VAN-1, 4 kalem);
     `Depolar` tipine `van` girdi ve VAN-1 artık kendi seed kümesinde ("yabancı depo" raporu tuzağı).
  2. **Arama alanı tek harften sonra siliniyordu:** her tuş `status='loading'` yapıyor, o durum
     arama ALANINI da söküp yükleme halkasına çeviriyordu — odak ve IME kompozisyonu her tuşta
     ölüyordu. Alan durum dalının dışına alındı; yeniden yükleme artık ekranı karartmıyor.

  **İKİ KULLANICI BULGUSU DAHA KAPANDI (26.08, tur sonrası):**
  · *"Çekmece kasarak açılıyor"* — ölçüldü: karta dokunuş ve boy cevabı, animasyonla aynı karede
    KART LİSTESİNİ de yeniden çizdiriyordu (`memo`'suz 2 kart × 2 tur = 4 çizim; cihazda 30 kartla
    ~60). Kartlar `memo`'ya alındı; jest sayacı çiviliyor: dokunuştan sonra kart çizimi **0**.
  · *"Neyle ödendiğini seçmedim"* — "Nakit" önseçiliydi, satış dokunmadan kapanabiliyordu. Para
    yazan alanda varsayılan olmaz (kartla tahsil edilip "nakit" yazılan satış sefer kapanışının
    nakit beklentisini sessizce bozar): seçim artık zorunlu, CTA seçimsiz açılmaz, başarıda
    seçim sıfırlanır.

  **Bilinçli sınırlar (v1):** kısmi/fazla tahsilat gönderilmiyor (sözleşmede `collectedAmountCents`
  var, ekran vermiyor → her satış tam tahsil sayılır; kapı satışının olağan hâli bu); yanlış
  yazılmış satışı GERİ ALMA yolu bu ekranda yok — düzeltme, iade/istisna hattının işidir.

  **AKIŞ YENİDEN KURGULANDI + İKİ YENİ YÜZEY (kullanıcı kararı 26.08: "liste ile sepet aynı yerde
  olması kötü; resimler eklensin; kaydedilen satışı kim yaptıysa göreyim"):**
  · `/sale` artık ÜÇ rotalı bir yığın (`sale/_layout` + `SaleProvider` — sepet durumu rotalar arası
    ortak): **katalog** (görselli kartlar — `CirclePhoto`, görselsizde baş harf; sepet dolunca altta
    çubuk) → **sepet** (`/sale/cart`: kalem kontrolü, tahsilat seçimi, CTA, sonuç) → **son satışlar**
    (`/sale/history`).
  · **Son satışlar** ucu: `GET /sale/recent` → `listRecentDoorSales` (deponun `door` siparişleri,
    en yeni önce, sabit tavan — döküm değil satış anı kontrolü). **Satan kişi ayrı kolon DEĞİL,
    zaten tutulan iz:** `order_status_log`un `completed` geçişindeki `actorId` (`quick_sale` RPC
    0017'den beri yazıyordu); ad `null` ise ekran "bilinmiyor" der, uydurmaz.
  · Cihazda uçtan uca koşuldu (yeni seed + web'in sefer düzeltmesi sonrası): kadayıf boy seçimiyle
    satıldı (`LA-26-34UXXN`, 22,40 €) — kayıt **VAN-1 + SF-26-P6XUJL seferine bağlı + satan: Marc
    Lemoine**; Son Satışlar ekranı aynı kaydı saat/kalem/yöntem/satıcıyla gösterdi. Sefer bağı
    böylece canlıda İLK KEZ kurulmuş oldu (web'in `readCourierRun` hizalaması + açık seferli seed).
  Doğrulama (dördüncü tur): uç **10/10** (`/recent`: satan adı + depo süzgeci) · ekran **9/9**
  (tarihçe: satan adı, aktörsüzde "bilinmiyor") · mobil paket **796/796** · typecheck · lint.

  Turun kendisi: kurye "kalzone" aradı → "kalan 6" okudu → çekmecede adet 2 → **satış cihazdan
  yazıldı** (`LA-26-QECKQR`, 0,96 € — ara toplam 1,12 iken kampanya indirimini SUNUCU uyguladı,
  "kesin toplam sunucudan gelir" davranışı canlıda görüldü), sepet sıfırlandı, liste **kalan 4**'e
  tazelendi. DB'den doğrulandı: completed · door · pickup · VAN-1 · anonim alıcı · `money_movement`
  0,96 € "Kapı önü satış". Depocu gözü de doğrulandı: aynı ekran, STR sayıları (kalan 40/23), hub'da
  D7 satırı. **Bir gözlem web'e devredildi** (`not-web-sefer-acik-tanimi-ayristi.md`): satış anında
  ekran "1 açık" sefer gösterirken 4b bağ kurmadı — seed bugünün seferine bile `returned_at`
  yazıyor, iki "açık" tanımı ayrışmış; karar ve alan web'in.
- [x] (21.120) **YER ÇEKMECESİNE KOD ÖNERİSİ — weble ayrışma kapandı (kullanıcı kararı 26.08)**
  · touches: `apps/mobile/src/screens/customer-kit/postal-code-sheet.tsx`, `apps/mobile/src/lib/places/messages.json`

  Denetimin 25.08 kaydı: başlıktaki yer çekmecesi ("67000 STRASBOURG ▾") mobilde öneri listesizdi —
  müşteri beş haneyi eksiksiz yazmak zorundaydı, webde "672" sekiz aday getiriyordu. Kullanıcı
  seçimi: web ile aynı davranış. Mevcut parçalarla kuruldu, yeni yol AÇILMADI: `usePostalSuggest`
  (adres formununki) + `SuggestionList` (kitinki) + zaten hazır `/places/suggest` ucu.

  İki kural: liste yalnız YAZARKEN ve yalnız EKSİK kodda (beş haneye ulaşınca soruyu yer ÇÖZÜMÜ
  cevaplıyor; liste kapanmasaydı cevabın yanında kopyası dururdu) · seçim yalnız KODU doldurur —
  kayıt `postalCode`tan ibaret, iki ülkede geçerli kodun ülkesi adres girilirken netleşir
  (`ambiguousNote` bunu zaten söylüyor).

  Doğrulama: yeni test **2/2** (`postal-code-sheet.test.tsx` — ağ fetch seviyesinde, cevaplar
  sözleşme şeklinde; eksik bırakılan `places` alanını Zod anında yakaladı). İlk hâli SAHTE
  YEŞİLDİ: "liste hiç açılmaz" iddiası debounce penceresinden ÖNCE bakıyordu — sabotaj (eşik
  kaldırıldı) testi düşürmeyince görüldü, bekleme eklendi; sabotaj artık yalnız ilgili testi
  düşürüyor (21.111'in dersi ikinci kez işe yaradı). customer-kit + home **71/71** · `tsc` ·
  `lint` temiz.
  **Cihazda doğrulandı (26.08 turu):** "75" yazınca öneriler indi (75000-75003 · Paris),
  önerisiz Kaydet sönük, seçim kodu doldurdu; kapsam-dışı 75001 kaydedilince vitrin soğuk
  zincir ürününü "non livrable" griledi ve katalog bölge bandını çizdi.

- [x] (21.121) **CİHAZ TURU İKİ ARIZA ÖLÇTÜ — ikisi de KAPANDI (Fabric çökmesi · unistyles nüksü)**
  · touches: `apps/mobile/src/components/ui/bottom-sheet.tsx`, `apps/mobile/src/components/operations/staff-menu.tsx`

  **1 · Fabric çökmesi (personel→müşteri geçişi) — KÖK KANITLANDI ve KAPANDI (26.08 akşamı).**
  Belirti: avatar menüsünden "Müşteri uygulamasına geç" → `IllegalStateException: addViewAt —
  The specified child already has a parent`. Tek değişkenli ayrım deneyi cihazda koşuldu:
  · taze süreç + ilk geçiş, basışta `router.replace` → **4/4 çöktü**
  · aynı koşul, yönlendirme 400 ms ertelenmiş → geçti
  · müşteri kabuğu o süreçte daha önce mount olmuşsa, basışta replace bile → 3/3 geçti
  Yani kök: düğme çekmeceyi kapatıp AYNI karede kök yığını değiştiriyordu; `BottomSheet`in
  Modal'ı kapanış animasyonu bitene dek ayakta (kendi künyesi) ve Modal'ın sökümü, yeni kabuğun
  İLK (ağır) mount'uyla aynı Fabric penceresine binince "child already has a parent" doğuyor.
  Nondeterminizmin sebebi de bu: hafif re-mount yarışı kazanıyor, ilk mount hep kaybediyordu.
  **Çözüm sihirli bekleme DEĞİL:** `BottomSheet`e `onClosed` kancası (Modal söküldükten sonra,
  bir kare ertelemeyle) ve köprünün yönlendirmesi ona bağlandı — basış yalnız niyet bayrağı
  koyar. Cihazda taze-süreç senaryosuyla doğrulandı (çökme 0, vitrin açıldı). Testler:
  `bottom-sheet.test` +1 (örtü dokunuşu tek başına onClosed'u ÇAĞIRMAZ; kapanış tamamlanınca
  çağrılır) · yeni `staff-menu.test` 2 (replace ANINDA çekmece kapalı mıydı casusla ölçülür —
  basışta-yönlendiren sabotaj testi düşürdü; niyetsiz kapanış yönlendirmez). 8/8 · bileşenler
  172/172 · tsc · lint temiz.
  **2 · unistyles nüksü — KÖK BULUNDU VE KAPANDI (27.08, cihazda).** Kayıt *"ancak çalışma anında
  bulunur"* diyordu; öyle oldu. `adb logcat` ile taze süreç izlendi: uyarı depo hub'ının YÜKLEME
  anında, **2 kez** düştü (`ReactNativeJS:W`, 16:09:53 ve 16:09:55).

  **Suçlu `LoadingState`ti** — ekrandaki "İş listesi yükleniyor…" halkası:
  `<Animated.View style={[styles.ring, styles[size], …]}>`. Dizi sözdizimi DOĞRUYDU; sorun RN'in
  kendi `Animated`ının diziyi içeride tek nesneye DÜZLEŞTİRMESİ — düzleşen nesnede iki unistyles
  anahtarı yan yana gelince kütüphane uyarıyor. Statik aramaların iki turdur temiz çıkması da bu
  yüzdendi: aranan desen (obje yayma) hiç yoktu, kusur kitaplıktaydı. 21.52'nin tahmini doğruymuş.

  **Çözüm:** boyut ayrı bir stil değil, stilin PARAMETRESİ (`styles.ring(size)` — unistyles 3.3
  dinamik stili tek nesne döndürür). **Ölçüm: aynı senaryoda 2 → 0.** Hub tam yüklendi (D1–D7,
  gerçek veriyle), çökme yok.

  **REANIMATED MUAF ve bu da ÖLÇÜLDÜ:** `discover-screen`de aynı şekilli BEŞ kullanım var
  (`[styles.glow, styles.glowRest, glowStyle]`). Keşif ekranı açıldı ve kart iki yöne sürüklendi —
  **tek uyarı çıkmadı.** `react-native-reanimated`ın `Animated.View`'i düzleştirmiyor. Beş yeri
  "ihtiyaten" değiştirmek olmayan bir arızaya makine kurmak olurdu.

  **ÜÇÜNCÜSÜ OLMASIN DİYE KURAL MAKİNEYE VERİLDİ** (`lib/animated-style-guard.test.ts`): aynı arıza
  iki kez ayrı ayrı bulunup her seferinde TEK dosyada düzeltilmişti (15.08 `skeleton.tsx`, bugün
  `loading-state.tsx`) — 21.52 kardeşini görmedi çünkü arayacak bir yer yoktu. Bekçi importa bakıp
  RN `Animated`ı Reanimated'dan ayırıyor; dinamik stili tek sayıyor. Üç testin ikisi bekçinin
  kendisini ölçüyor, ihlal sabotajla doğrulandı (eski satır geri konunca dosya:satır ile yakalandı).

  **1'in cihaz doğrulaması da tekrarlandı:** personel çekmecesinden "Müşteri uygulamasına geç"
  basıldı — çökme yok, vitrin açıldı (`Merhaba, Deniz · 67000 Strasbourg`).


- [x] (21.122) **TAZELİK TURU — on üç kaydın iddiası ölçüldü, yedisi bayat çıktı** (kullanıcı
  kararı 27.08: *"önce notlarla ilgili tazelik/bayatlık çalışması, sonra sıraya sokup kapatma"*)
  `touches:` **yalnız ölçüm — kod değişikliği YOK.**

  21.20'nin üçüncü turu bir kalıbı gösterdi: kayıt "şu iş yapılmadı" diyor, kod ölçülünce iş
  bitmiş çıkıyor. Sebep basit ve suç kimsede değil — açık maddeler yazıldıkları gün doğruydu,
  sonraki turlarda kapandılar ve kapatan tur kendi bloğunu yazarken ESKİ bloğa dönmedi. Bu tur
  onu topluca düzeltti: her `[~]`/`[ ]` kaydın açık cümlesi tek tek koda soruldu.

  **BİTMİŞ ÇIKANLAR (işaret gerçeğe çekildi, `[x]`):**
  · **21.3** — "kompozisyonun mobil temaya bağlanması" bağlanmış (`theme/unistyles.ts` gradyanı
    `parseLinearGradient` ile çeviriyor). Kaydın öteki kalanı (`web'in 7+30'u çekmesi`) WEB
    şeridinin işi ve talebi açık; mobil payı bitti.
  · **21.6** — kayıttaki `BEKLEYEN(21.6)` işaretleri SAHTE: koddaki iki geçiş de *"eski
    BEKLEYEN(21.6) 09.08'de kapandı"* diyen künye cümlesi, canlı işaret değil.
  · **21.7** — "çekmecenin çift-eğri animasyonu (Reanimated'la)" kurulu (`bottom-sheet.tsx`:
    panel ve örtü ayrı eğrilerde, `TIMING`/`CLOSE_TIMING`). *(Bu kaydın Android cam-bulanıklığı
    artığı GERÇEK ve açık kaldı — aşağıda.)*
  · **21.10** — üç sözleşme boşluğundan `doorAccountId` yerinde (`courier-api.schema.ts`), kamera
    kanıtı teslim ekranında. Çevrimdışı kuyruk "yok" değil, **bilinçli yok**: künye ve testi
    (*"bağlantı yokken kuyruk YOKTUR: gönderilemedi dürüstçe yazılır"*) kararı zaten söylüyor.
  · **21.11** — "ürün araması ucu yok" iddiası bayat: `searchVariantsForIntake` var ve depo kabul
    ekranı onu çağırıyor (`warehouse.ts`).
  · **21.47** — 27.08'de kapandı (karar 2h tamamlandı: bant yerine bildirim + sipariş sayfasında
    teşvik bloğu; karar 6'nın tuzağı da 26.08'de kapanmıştı).
  · **21.68** — bloğun üç açığının üçü de kendi içinde üstü çizili: zil cihazda çalındı (17.08),
    çeviri (21.69)'da yazıldı, üçüncüsü zaten kapanmış.

  **AÇIK KALDIĞI DOĞRULANANLAR (sıraya girecek):** ~~21.14~~ ve ~~21.57~~ **27.08'de kapandı**
  (kendi bloklarında yazılı; ikisi de ölçülünce iddia edilenden küçük çıktı — 21.14'ün "14 canlı
  işaret"inin onu bayattı, 21.57'nin "36 ham kaydırıcı"sı yanlış ölçüttü ve gerçek ihlal tekti).
  Kalanlar: 21.78 + 21.48 (cihaz turlarının kalanları) · 21.88 (push — kullanıcı sırasında EN SON) ·
  ~~21.121~~ (27.08'de kapandı: kök `LoadingState`, cihazda ölçüldü) · **21.7'nin artığı**: Android'de cam bulanıklığı `BlurTargetView`
  bağı istiyor (açık künyesi `app-bar.tsx`te, tek yerde).

  **İkinci ders (27.08, iki turda üst üste):** bayat bir kayıt yalnız "iş bitmiş ama işaret duruyor"
  diye bayatlamaz — **yanlış ÖLÇÜTLE sayılmış bir sayı da bayattır ve daha tehlikelidir**, çünkü
  büyük görünür ve işi sıraya sokarken abartır. İki kez aynı biçimde oldu: "14 canlı işaret"
  (`grep BEKLEYEN`) ve "36 ham kaydırıcı" (`grep ScrollView`). İkisi de metin araması, ikisi de
  kuralın kendisini değil ismini sayıyordu. Bir sayı deftere yazılırken NASIL sayıldığı da yazılmalı.

  **Ders (üçüncü kez ölçüldü, artık kural gibi):** bir görev satırının açık maddesi, o maddeyi
  kapatan tur tarafından ESKİ bloğunda da işaretlenmeli. Aksi hâlde defter, kodun gerisinde kalır
  ve sıradaki ajan olmayan bir işi planlar (CLAUDE §5'in "durumun tek sahibi görev satırıdır"
  kuralının bakımı).

- [x] (21.123) **SUNUCU SEPETİNİN KAPISI SEKME KABUĞUNDAYDI — derin bağlantıyla gelen müşterinin
  sepeti sunucuya hiç yazılmıyordu** (cihaz turu bulgusu 28.08, fiziksel Android)
  `touches:` `apps/mobile/src/app/_layout.tsx` · `apps/mobile/src/app/(tabs)/_layout.tsx` ·
  `apps/mobile/src/screens/customer-kit/cart-store.ts` ·
  `apps/mobile/src/screens/customer-kit/cart-sync-gate.test.tsx`

  **Arıza.** Sunucu turunun tek kapısı `useCartSync()` ve o `(tabs)/_layout`ta takılıydı. Gerekçesi
  yazılıydı: *"kabuk müşteri ağacının altındaki her yığın ekranı boyunca MONTE KALIR"*. Bu normal
  gezinmede doğru, **derin bağlantıda değil** — sepet · ürün · paket · tarif · checkout rotalarının
  hepsi `(tabs)` grubunun DIŞINDA. Bildirimden ya da paylaşılan bir linkten doğrudan açan girişli
  müşteride kapı hiç açılmıyor, `source` `device`ta kilitleniyordu.

  **Ölçüm (temiz ortamda tekrar üretildi; mobile-api 200/25 ms, Metro 200, Supabase 200):**
  soğuk başlangıç + `/cart` derin bağlantısı → ekran **"0 articles"**, sunucuda 2 satır duruyor.
  Kabuk monte değilken ürün eklendi → ekran **"1 articles · 0,00 €"**, sunucu 2 satırda kaldı.
  Sekmeye dokunulur dokunulmaz → **"4 articles · 2,93 €"**, yerel niyet devredildi (3 satır).
  Ağırlığı şurada: checkout HER ZAMAN sunucudaki sepeti okur — müşteri gördüğünden başka bir sepeti
  onaylayabiliyordu (turun başında ölçüldü: ekran 43,10 €, checkout 22,61 €).

  **Çözüm.** Kapı köke taşındı (`app/_layout`), `(tabs)`taki kopya kaldırıldı. Körlemesine değil:
  kök yığından personel kabuğu ve kimliği TOKEN olan ziyaretçi yolları da geçiyor, onlar
  `CARTLESS_TREES` ile dışarıda (`(operations)` · `feedback` · `invite`) ve `useCartSync(enabled)`
  kapalıyken `getSupabase()` bile çağrılmıyor. Liste HARİÇ tutmadır: yeni bir müşteri rotası
  eklendiğinde kapı kendiliğinden açık gelir.

  **Eski gerekçe ölçülüp çürütüldü:** *"personelin sepeti yoktur, kökte takmak her personel
  oturumunda `profile_not_found` dönen bir tur açardı"* deniyordu. Bugün personelin de profil satırı
  var; `/api/v1/me/cart` yönetim ve depo oturumlarında **200 + boş sepet** dönüyor. Yine de kapı
  operasyonda kapalı tutuldu — bedeli yok, gereksiz istek de yok.

  **Doğrulama.** Cihazda: derin bağlantıdan ürün **ve** paket ekleme sunucuya yazıldı, sepet
  43,93 € ↔ checkout 43,93 € beş satırda birebir uyuştu. Ziyaretçi yolu bozulmadı (geri bildirim
  daveti açıldı; süresi dolmuş token'da doğru "Lien introuvable" ekranı). Testler 876/876, lint temiz.

  **Ders.** Bir kapının kapsamı, takıldığı kabuğun *gezinmeyle* monte olduğu ağaçtır — **derin
  bağlantı o ağacı atlar**. Kabuk-dışı rotası olan her kapı bu soruyu sormalı. Bekçi iki yönlü:
  `cart-sync-gate.test.tsx` kapalı kapının Supabase'e dokunmadığını, `feedback-routes.test.tsx` ise
  ziyaretçi yolunda kapının açılmadığını koruyor.

- [x] (21.124) **BÜYÜK HARF CİHAZIN DİLİYLE ÇEVRİLİYORDU — Fransızca arayüzde "PANİER PRÊT"**
  (cihaz turu bulgusu 28.08, fiziksel Android)
  `touches:` `apps/mobile/src/components/ui/section-header.tsx` ·
  `apps/mobile/src/components/operations/section-header.tsx` ·
  `apps/mobile/src/components/ui/product-photo-card.tsx` ·
  `apps/mobile/src/screens/cart/cart-line-row.tsx` ·
  `apps/mobile/src/screens/customer-kit/summary-panel.tsx` ·
  `apps/mobile/src/screens/discover/discover-screen.tsx` ·
  `apps/mobile/src/screens/professionals/professionals-screen.tsx` ·
  `apps/mobile/src/screens/package/package-detail-screen.tsx`

  **Arıza.** `upperIn` kuralı (i/İ ayrımı dilin kendi kuralıyla) 17.08'de kurulmuştu ama yalnız
  KODU kapsıyordu; stil katmanındaki `textTransform: 'uppercase'` aynı işi Android'de **native**
  yapıyor ve **CİHAZIN** dilini kullanıyor — uygulamanınkini değil. Türkçe telefonda Fransızca
  arayüz açan müşteride ölçüldü: sepetteki paket üstbaşlığı **"PANİER PRÊT"**.

  **Teşhis aynı ekranda, yan yana:** paketler sekmesinin üstbaşlığı "PANIERS PRÊTS" diye DOĞRU
  çıkıyordu. İkisi de aynı `textTransform`u alıyor, ikisi de kaynakta küçük harfli. Fark koddaydı —
  `packages-list-screen` metni `upperIn`den geçiriyor, `cart-line-row` geçirmiyordu. Yani kuralın
  var olması yetmemiş, uygulanmadığı yer sessizce dile kör kalmıştı.

  **Kapsam ölçüldü:** `textTransform: 'uppercase'` kullanan 11 dosyanın **8'i** `upperIn`
  çağırmıyordu. Ekranda o an bozulan tek metin sepettekiydi, ama ötekiler yalnız "bugün `i`
  içermedikleri" için sağlamdı: `t.stamp.like` ("J'aime"), `t.hero.eyebrow` ("Professionnels"),
  `t.badge.soldOut` ("Épuisé") hepsi `i` taşıyor ve ekrana koşullu geliyor — yani ölçüm anında
  görünmüyorlardı. Sekizi de düzeltildi.

  **Karar.** Metin `upperIn(text, locale)` ile büyür; `textTransform` kuralı stilde KALIR ve
  zararsızdır — buradan zaten büyük çıkan harflere dokunmaz (`courier-format` künyesinin aynı
  gerekçesi). Operasyon `section-header`ında dil SABİT `tr`: operasyon yüzeyi yalnız Türkçedir
  (CLAUDE §2), uygulama diline bağlansaydı Fransızca arayüz seçen personelde "Sipariş" → "SIPARIŞ"
  olurdu. Erişilebilirlik adları HAM kalır: ekran okuyucu büyük harfi hecelemez.

  **Doğrulama.** Cihazda (tr-TR telefon, fr arayüz): sepet **"PANIER PRÊT"** — noktasız I;
  profesyoneller **"ÉPICERIE · CUISINE COLLECTIVE"** (önce `ÉPİCERİE` olurdu). Testler iki yönü de
  tutuyor ve ikisi de gerçek: `catalog-screen.test.tsx` dili `tr-FR` mock'luyor → **"TÜKENDİ"**
  (noktalı İ), `section-header.test.tsx` varsayılan `fr` → **"KOLEKSIYONLAR"** (noktasız I). Aynı
  kod, iki dilde iki ayrı doğru sonuç. 877/877 test, lint ve typecheck temiz.

  **Ders.** Bir dil kuralı **stil katmanında uygulanamaz**: CSS-benzeri dönüşümleri platform yapar
  ve platformun bildiği tek dil cihazınkidir. Kuralın adı olması (`upperIn`) onu kendiliğinden
  yaymıyor — 17.08'de 17 çağrı düzeltilmişti, stil katmanı o turda hiç sorulmamıştı.

- [x] (21.125) **SEPETTE ÜRÜNLER ÜSTTE, PAKETLER ALTTA** (kullanıcı kararı 28.08: *"paketlerin
  arasına ürün girmesi çok hoş görünmüyor"*)
  `touches:` `apps/mobile/src/screens/cart/cart-screen.tsx` ·
  `apps/mobile/src/screens/cart/cart-view-fixture.ts` ·
  `apps/mobile/src/screens/cart/cart-screen.test.tsx`

  Sunucu satırları EKLENME sırasında veriyor, yani paket kartları ürünlerin arasına serpiliyordu.
  Paket kartı koyu mürekkep zeminli (`cart-line-row` tone `bundle`), ürün kartı açık kum — ikisi
  dönüşümlü gelince liste dikişli görünüyor. Sıralama artık grup içinde: ürünler önce, paketler
  sonra.

  **Teslimat grubunun sırası BOZULMADI** (`local` → `shipping` → `undeliverable`). O ayrım daha üst
  bir bilgidir — bir kalemin NASIL geleceği, NE olduğundan önce gelir; tür sıralaması grupları
  aşsaydı "kargoyla gelen paket" yerel başlığın altına düşerdi. Sıra ayrıca KARARLI (`sort` ES2019):
  iki ürün ya da iki paket kendi aralarında eklenme sırasını koruyor.

  Fikstür paket satırını taşımıyordu (`cartViewBundleLine` eklendi) — sepetin paket davranışları o
  güne dek yalnız varyantla sınanabiliyordu. İki test: grup içi sıra + grup sınırının korunduğu.
  Cihazda doğrulandı (üç açık ürün kartı, altında iki koyu paket kartı); 879/879.

- [x] (21.126) **VAR OLMAYAN KİMLİK SEPETE GİRİYORDU — sunucu doğrulama yapmıyordu**
  (cihaz turu bulgusu 28.08, uçtan ölçüldü)
  `touches:` `packages/database/src/services/cart.service.ts` ·
  `packages/database/src/services/cart.test.ts` ·
  `apps/mobile/src/screens/cart/cart-screen.tsx` · `apps/mobile/src/screens/cart/messages.json`

  **Ölçüm.** Uydurma bir varyant kimliği (`00000000-0000-4000-8000-000000000001`) `POST
  /me/cart/items` ile **200** aldı; sepete adsız (`name: ""`), fiyatsız (`unitPriceCents: null`)
  bir satır yazıldı. `itemCount: 7` — hayalet SAYILDI; `subtotalCents: 4393` — hayalet SAYILMADI.
  Yani başlık ile para birbirini yalanlıyordu.

  **Para riski YOK, motor sağlam:** sipariş açma denemesi `status: "blocked_lines"` ile reddedildi.
  Ama reddin gövdesi `lines: [""]` — müşteri sipariş veremiyor ve NEYİ çıkaracağını okuyamıyordu.

  **Kök.** `cart.items` bir `jsonb` kolonu, yani kimlikleri koruyan yabancı anahtar yok; kural
  veride duramıyor. `CartService.addItems` de gelen kimliği hiç sormuyordu.

  **Çözüm — REDDETMEZ, SÜZER** (`existingOnly`). Gelen varyant ve paket kimlikleri tek turda
  sorulur (`listByIds`, kimlik başına sorgu yok; boş listede ağa hiç çıkılmaz), var olmayan satır
  sepete YAZILMAZ. `400` dönmek yanlış olurdu: bayat bir cihaz sepeti devrederken bir kalemin
  yokluğu ötekileri de düşürür, müşteri sepetine hiçbir şey ekleyemez olurdu. Kapı `addItems`te,
  yani `takeOver` da oradan geçiyor — **ve web sepeti de aynı servisi kullandığı için iki yüzey
  birden korunuyor.**

  **Kalıntılar için AD** (`t.line.unknown`): sunucunun çözemediği satır artık adsız görünmüyor —
  "Artık satılmayan ürün" · "Produit retiré de la vente" · "Nicht mehr im Verkauf". Satır sessizce
  SİLİNMEZ (bugünkü "duruyor ama engelli" davranışı doğru), tek eksiği okunabilir olmamasıydı;
  erişilebilirlik adları da aynı metni taşıyor.

  **Hayalet nasıl doğdu:** `db:refresh` katalog kimliklerini yeniledi, cihazdaki sepet silinmiş
  varyantı taşıyordu, giriş anındaki devir onu sunucuya taşıdı. Yani kötü niyet değil ZAMAN farkı —
  ama kapı yokken token'ı olan herkes sepetine sınırsız çöp yazabilirdi.

  **Doğrulama.** Uçtan: geçerli ürün + geçerli paket + hayalet aynı istekte gönderildi → ikisi
  girdi, hayalet girmedi (adsız satır 0), HTTP 200. Dört yeni servis testi (`cart.test.ts`):
  yazılmaz · geçerliler girer · devir yolu da korunur · var olmayan paket de girmez.

- [x] (21.127) **KARGO KUTUSU TİPİ HAZIRLIK EKRANINDA SORULUYOR — gönderinin ağırlığı artık
  bilinen bir kartondan çıkıyor** (kargo kanalı 07.12'nin native yarısı; kullanıcı talebi 28.08:
  *"depoda kargo alma, kargo gönderme"*)
  `touches:` `packages/types/src/contracts/warehouse-api.schema.ts` ·
  `packages/types/src/entities/order-box.schema.ts` ·
  `packages/application/src/warehouse/{boxes,preparation}.ts` ·
  `apps/mobile-api/src/api/v1/warehouse.ts` ·
  `apps/mobile/src/screens/warehouse/{preparation-screen,use-preparation.hook,warehouse-format,messages.json}` ·
  `apps/mobile/src/lib/api/warehouse.ts`

  **Durum (28.08).** Kargo kanalının tasarım kaydı (`kargo-kanali-tasarimi.md §8.6`) native depo
  yüzeyinden üç iş istiyordu; bu tur BİRİNCİSİ: kutu açılırken **kargo kutusu tipi** seçimi.

  **Neden açılışta soruluyor, kapanışta değil.** Gönderi ağırlığı `Σ(ambalajlı ürün) + kutunun
  darası`, dış ölçü de kutunun kendisi (§4.4). Soru duyuru anında sorulsaydı cevap HATIRLANAN bir
  şey olurdu — depocu kartonu kutuyu doldurmaya başlarken eline alıyor, kapanışta karton çoktan
  kapalı.

  **Zincirin tamamı yazıldı:** `GET /warehouse/shipping-boxes` (deponun benimsediği AÇIK tipler;
  sistem şablonu gelmez — şablon seçilmez, benimsenir) → açılış gövdesinde `shippingBoxId` →
  `openBox` tipi doğrular → `order_box.shipping_box_id` (kolon `0052`'den beri vardı, yazanı yoktu)
  → kuyruk sözleşmesi tipi geri taşır → ekran açık kutunun künyesinde adını yazar.

  **Kural veride DURAMIYORDU, kapıya kondu.** Bileşik FK `(warehouse_id, shipping_box_id)` başka
  deponun kutusunu zaten engelliyor ama iki hâli yakalamıyor: *(1)* **kapatılmış tip** — FK
  `is_active`e bakmaz; *(2)* **okunur cevap** — kısıt ihlali depocuya `23503` diye görünür, ekran
  onu "sunucu hatası"na indirir. `unknown_box` bu yüzden ayrı bir dal ve `not_found`a katlanmıyor:
  ikisi tek cevap olsaydı depocu var olan bir siparişi yok sanardı, oysa gerçek çare listeyi
  tazelemek.

  **Rota kulvarı hiç değişmedi.** Soru yalnız `deliveryType === 'shipping'`te doğuyor (kuyruk
  sözleşmesine `deliveryType` eklendi — kapı alanı zaten okuyordu, sözleşmeye ulaşmıyordu). Tipsiz
  açılış meşru kaldı: gövde isteğe bağlı, atlama kapısı çekmecede duruyor. Kapatmak depocuyu
  YANLIŞ bir tip seçmeye zorlardı ve yanlış ölçü, ölçüsüzlükten beterdir — kendini söylemez.

  **Boş katalog sessiz geçmiyor.** Depo hiç kutu benimsememişse akış durmuyor ama uyarı SÜREKLİ
  görünüyor (geçici cümle değil): ölçüsüz kapanan kutu, etiket satın alınırken duyuru kapısının ön
  koşuluna takılır ve o an kartonu geri açmak gerekir.

  **Yeni paylaşılan komponent SIFIR** (§8.11 şartı): çekmece `BottomSheet`, satırlar kuyruğun
  `queueRow` iskeletinin aynısı, atlama `TextAction`. Komponent haritası `OperationsChoiceChip`
  öneriyordu — kullanılmadı ve gerekçesi kodda yazılı: çipin taşıdığı bilgi SEÇİLİLİKTİR, burada
  dokunuş kutuyu doğrudan açıyor ve `selected` daima yanlış kalırdı.

  **Doğrulama.** 4 entegrasyon (`boxes.test.ts`: tip yazılır ve kuyruk taşır · tipsiz açılış ·
  yabancı depo `unknown_box` ve **hiç kutu açılmaz** · kapatılmış tip) + 4 ekran testi
  (`picking-box.test.tsx`: rota sormaz ve tipleri OKUMAZ · kargo sorar ve gövdeye yazar · atlama
  tipsiz açar · boş katalog uyarısı) + 3 birim (`boxSizeLine`: mm→cm, `null` sınır, sıfır dara).
  Mobil jest **887/887**, `typecheck` · `lint` · `knip` · `docs:check` temiz.

  **BEKLEYEN(kargo-kanali-tasarimi.md §8.6):** aynı bölümün kalan iki işi — **etiket satın alma
  + PDF basımı** (`announceOrderShipment`in bugün hiç üretim çağıranı yok, ölçüldü) ve **devir
  okutması** (kutular okutulur, gönderi "taşıyıcıya verildi" olur). Üçüncüsü hub sayacı
  ("kargoya verilecek N kutu").

  **Ölçülen, bize ait olmayan bir arıza:** kök `pnpm typecheck`in `scripts` adımı **bu turdan
  ÖNCE de kırmızıydı** — `scripts/seed/orders.ts:899` `'kutuTipi' is possibly null` (HEAD sürümüyle
  yeniden üretildi). Kargo şeridinin dosyası; dokunulmadı, bildirildi.

- [x] (21.128) **NATIVE SİPARİŞ DETAYI ÇOK KUTULU GÖNDERİYİ DOĞRU ANLATIYOR** (kargo kanalı Faz 1.1;
  açık nottu: `docs/talep/not-mobil-cok-kutulu-kargo-takibi.md`)
  `touches:` `apps/mobile/src/screens/orders/{order-detail-screen.tsx,order-detail-screen.test.tsx,messages.json}`

  **Durum (29.08).** Sözleşme 28.08'de genişledi (`carrierName` + `parcels`), native ekran ise eski
  üç alanı okumaya devam ediyordu. Üçü de **İLK KOLİYİ** anlatıyor ve `carrier` sağlayıcının adını
  enum'a sıkıştırdığı için çoğu gönderide `other` diyor: üç kutulu bir siparişte ekran **yanlış
  taşıyıcı adı + üç numaradan biri** gösteriyordu.

  **Taşıyıcı adı iki kaynaklı, tek arama** (`carrierLabel`): sağlayıcıdan gelen ad özel isimdir,
  çeviri istemez; elle girilen taşıyıcı anahtardır, ister. Tanıdığımız anahtar çevrilir,
  tanımadığımız olduğu gibi basılır — webin aynı kararı. `carrierName` boşsa eski enum'a düşülür;
  elle girilmiş gönderi hâlâ meşru bir hâl ve o yol silinmedi.

  **Özet paneli koli başına satır yazıyor**; sıra (`2/3`) yalnız birden çok kutuda — `1/1` yazmak
  olmayan bir bölünmeyi varmış gibi göstermek olurdu.

  **Takip bağlantısı:** tek kutuda görüntü BİREBİR eskisi gibi (tek "Kargoyu takip et ↗"); çok
  kutuda kutu başına bir `TextAction`, etiketinde sırası yazılı. Web numaraları satır içi bağlantı
  yaptı — mobilde `SummaryPanel` dokunulabilir satır taşımıyor ve onu taşır hâle getirmek
  paylaşılan bir kit komponentini tek ekranın ihtiyacına göre genişletmek olurdu (`CLAUDE §1`).

  **Doğrulama.** 4 ekran testi: tek kutu değişmedi · çok kutuda her koli kendi satırı ve bağlantısı
  · gerçek taşıyıcı adı yazılıyor (`carrier: 'other'` gelmesine rağmen) · adresi olmayan koli düğme
  açmaz ama numarası özette durur. Mobil jest **891/891**, `typecheck` · `lint` temiz.

  **Sözleşme borcu:** eski üçlü artık native tarafından okunmuyor; kargo şeridi onları sözleşmeden
  silebilir (nota cevap yazıldı).

- [x] (21.129) **TELEFON ARTIK KARGOYA VERİYOR — kutu kapanışından etiket basımına** (kargo kanalı
  Faz 1.3)
  `touches:` `packages/types/src/contracts/warehouse-api.schema.ts` ·
  `apps/mobile-api/src/api/v1/warehouse.ts` ·
  `apps/mobile/src/lib/print/{brother,label-file}.ts` · `apps/mobile/src/lib/api/warehouse.ts` ·
  `apps/mobile/src/screens/warehouse/{preparation-screen,use-preparation.hook,picking-box.test,messages.json}`

  **Durum (29.08).** Zincir tamam: kutu kapanır → "Kargoya ver" → servis listesi → duyuru → etiket
  PDF'i indirilir → Brother'a basılır → damga.

  **Ekranın en zor kararı:** son kutu mühürlenince sipariş `ready`ye geçiyor ve hazırlık kuyruğu
  yalnız `confirmed`+`preparing` okuduğu için **listeden düşüyor**. Sevk kartı bu yüzden `order`a
  bağlı değil, kendi durumunu taşıyor. **Test bir arıza yakaladı:** kartı kuyruk ve sipariş
  dallarına koymuştum; kuyrukta tek sipariş varsa liste boşalıyor ve ekran "Toplanacak sipariş yok"
  dalına giriyor — depocu tam kutuyu mühürlediği anda etiket alma yolunu kaybediyordu. Kart üç
  dalda da çiziliyor ve boş dal onun EN OLASI yeri.

  **Seçim para harcıyor**, o yüzden karttan ayrı bir çekmecede: liste karta gömülseydi kart ekranın
  yarısını kaplayan bir tabloya dönerdi ve kaza eseri basılmaya en açık yer listenin ortasıdır.
  Çekmece komponent oldu — üç dalda da açılabilmeli.

  **Üç hâl de söyleniyor:** ön koşul tutmazsa sebebin ADI · süre bildirilmeyen serviste
  "bilinmiyor" (gizlemek "hemen gider" dedirtirdi) · basım için basıldı/modül yok/hata cümlesi.
  Basım hatası duyuruyu GERİ ÇEKMİYOR (23.7 çizgisi).

  **Etiket akıtılmıyor:** `GET /boxes/:id/shipping-label` imzalı adres döndürüyor, telefon kovadan
  indiriyor. `not_announced` ile `no_label` ayrı dallar — çareleri ayrı.

  **BEKLEYEN(kargo-kanali-tasarimi.md §4.7):** iş başına yazıcı yok; etiket bugün deponun tek
  ayarlı yazıcısından çıkıyor. Kargo etiketi A6 yatay, kutu etiketimiz 4×6 — aynı ruloya basılmaları
  fiziksel bir tesadüf olurdu. Envanter sunucuda, seçim cihazın local storage'ında olacak.

  **Doğrulama.** 4 ekran testi. Mobil jest **895/895**, `typecheck` · `lint` · `knip` temiz.

- [x] (21.130) **KARGO DEVRİ — kutular okutularak taşıyıcıya veriliyor** (kargo kanalı Faz 1.4)
  `touches:` `packages/application/src/shipping/{handover,sync-status}.ts` ·
  `packages/database/src/services/order-box.service.ts` ·
  `packages/types/src/contracts/warehouse-api.schema.ts` ·
  `apps/mobile-api/src/api/v1/warehouse.ts` ·
  `apps/mobile/src/screens/warehouse/{handover-screen,handover-screen.test,warehouse-hub-screen,messages.json}` ·
  `apps/mobile/src/app/(operations)/handover.tsx`

  **Durum (29.08).** Kutu etiketi alıp basılıyordu ama taşıyıcıya verildiğini yazan bir şey yoktu.
  `courier/load.ts` aynı fiziksel olayı yazıyor ama kapısı `order.courierId` şartına bağlı ve
  **kargo siparişinin kuryesi yok** — kendi kapısı gerekti. Sahiplik sorusu da farklı: orada "bu
  kutu senin rotanın mı", burada "bu kutu senin deponun mu".

  **İki kimlik uzayı da kabul:** kargo kulvarında bizim QR'lı etiketimiz basılmıyor, yani kutunun
  üstündeki tek barkod taşıyıcınınki. Bizim kodumuzun da kabul edilmesi yedek değil GERÇEK —
  etiketi saklanamamış ya da elle taşıyıcı girilmiş gönderide taşıyıcı barkodu olmayabilir.

  **Sipariş taşıyan kural kopyalanmadı:** webhook'un `siparisiTasi`sı dışa açıldı, devir de oradan
  geçiyor. Gönderi ilerideyse geri çekilmiyor (taşıyıcı bizden önce okutmuş olabilir).

  **Ekran bir liste değil okutucu:** depocu rampada kutuları tek tek uzatıyor, "hangi sipariş"
  sorusu yok. Gövde okutma geçmişi; en yeni üstte. Sayım GÖNDERİYİ sayıyor. İkinci okutma hata
  değil ("zaten verilmişti, sayı değişmedi").

  **Doğrulama.** 4 entegrasyon + 4 ekran testi. Mobil jest **899/899**, `typecheck` · `lint` ·
  `knip` temiz.

  **BEKLEYEN(kargo-kanali-tasarimi.md §8.6):** hub satırında rozet yok — "kargoya verilecek N kutu"
  sayacının ucu henüz yazılmadı ve uydurulmuş bir sayı olmayan bir işi varmış gibi gösterirdi.

- [x] (21.131) **KARGODA KUTUSUZ ONAY REDDEDİLİYOR** (kullanıcı kararı 28.08 · kargo kanalı Faz 1.5)
  `touches:` `packages/application/src/warehouse/{preparation,preparation.test}.ts` ·
  `packages/types/src/contracts/warehouse-api.schema.ts` ·
  `apps/web/app/(operations)/operations/preparation/preparation-actions.ts` ·
  `apps/mobile/src/screens/warehouse/{use-preparation.hook,preparation-screen.test,messages.json}`

  **Durum (29.08).** Gönderinin ölçüsü de ağırlığı da kutu tipinden geliyor; kutusuz kapanan bir
  kargo siparişinde ikisi de yok ve etiket satın alma HİÇ yapılamıyor — sipariş "hazır" görünüp
  sevk edilemez hâlde kalıyordu ve hiçbir yerde hata vermiyordu.

  **Duvarın yeri karar:** duyuruda çarpmak kutuların çoktan mühürlenmiş olması demekti. Kapı
  hazırlık onayında — kartonu doldurmadan önce.

  **Masa kısıtı açıkça söyleniyor:** kutu döngüsü yalnız telefonda (23.6 §1.1), yani kargo
  hazırlığı artık telefondan yürüyor. Web masasının cümlesi çareyi de yazıyor.

  **Rota kulvarı etkilenmedi** — kutusuz onay orada meşru ve testle korunuyor.

  **Doğrulama.** 2 entegrasyon (kargo reddedilir ve hiçbir satır yazılmaz · rota sürüyor) + 1 ekran
  testi (web masasından yarım başlamış kargo siparişi — ekranın ulaşabildiği gerçek hâl).
  Mobil jest **900/900**, kilitli tam paket **3935/3935**.

- [x] (21.132) **İŞ BAŞINA YAZICI — envanter deponun, seçim cihazın** (kullanıcı kararı 29.08 ·
  kargo kanalı Faz 1.6; `21.129`'un BEKLEYEN'i kapandı)
  `touches:` `supabase/migrations/0054_warehouse_printer.sql` ·
  `packages/types/src/entities/warehouse-printer.schema.ts` ·
  `packages/database/src/services/warehouse-printer.service.ts` ·
  `packages/application/src/warehouse/boxes.ts` ·
  `apps/mobile-api/src/api/v1/warehouse.ts` ·
  `apps/mobile/src/lib/print/printer-choice.ts` ·
  `apps/mobile/src/screens/warehouse/printer-setup-screen.tsx` ·
  `apps/web/app/(operations)/operations/warehouses/*`

  **Durum (29.08).** Etiket deponun TEK ayarlı yazıcısından çıkıyordu; kargo etiketi A6 yatay,
  kutu etiketimiz 4×6 kalıp kesim — aynı ruloya basılmaları fiziksel bir tesadüf olurdu.

  **Ayar yerine tablo:** 23.7'nin üç `label_printer_*` anahtarı o gün doğruydu (tek yazıcı, tek
  etiket); kargo kanalı ikisini de çoğalttı ve ayarla ifade edilemeyen şey bir LİSTEdir.
  `(warehouse_id, purpose)` bilerek benzersiz DEĞİL (kullanıcı düzeltmesi 28.08).

  **Seçim sunucuya HİÇ gitmiyor:** aynı depodaki iki telefon iki ayrı yazıcıya basabilir. Çözümün
  üç dalı ayrı — seçim varsa o · tek yazıcı varsa o · başka her hâlde ekran sorar. Birini
  kendiliğinden seçmek, kâğıdın hangi odadan çıkacağına yazılımın karar vermesi olurdu.

  **`BoxLabelResponse.printer` kaldırıldı** — sunucunun iliştirdiği yazıcı cihazın seçimini ezerdi.

  **Web Depolar kartı eksik AMACI ayrı söylüyor** ("kargo etiketi yazıcısı yok"): "yazıcı var"
  cümlesi hangi işin karşılıksız olduğunu gizlerdi.

  **Doğrulama.** 2 entegrasyon + 7 birim + 4 ekran testi. Mobil jest **910/911** (düşen 1 sosyal
  şeridin), kilitli tam paket **3937/3937**. `db:refresh` koşuldu (kullanıcı izni), kapsam 157/157.

- [x] (21.133) **SEVK LİSTESİ DARALTILDIĞINI SÖYLÜYOR — `homeOnly` telde kayboluyordu**
  (kargo kanalı Faz 2.1)
  `touches:` `packages/types/src/contracts/warehouse-api.schema.ts` ·
  `packages/types/src/contracts/warehouse-dispatch.schema.test.ts` ·
  `apps/mobile/src/screens/warehouse/use-preparation.hook.ts` ·
  `apps/mobile/src/screens/warehouse/preparation-screen.tsx`

  **Durum (29.08).** `quoteOrderShipment` "ücretsiz kargo EVE gider" süzgecini uyguladığında
  `homeOnly` bayrağını üretiyordu (`c7835348`), ama **sözleşmede karşılığı yoktu** ve uçtaki
  `DispatchOptionsResponseSchema.parse` onu her cevapta sessizce siliyordu.

  **Derleyici göremezdi:** uç `const body: z.input<Schema> = outcome` yazıyor ve TypeScript'in
  fazla-alan denetimi yalnız NESNE SABİTLERİNE uygulanır — değişkende duran fazla alan tipe uyar,
  derleme geçer, alan telde kaybolur.

  **Bedeli:** depocu daraltılmış listeye TAM liste diye bakıyordu; liste boşaldığında ekranın tek
  cümlesi "uygun servis çıkmadı"ydı ve sebebi taşıyıcıda/kolide arattırırdı — oysa KURAL elemişti.

  Bayrak **zorunlu** alan olarak eklendi: eksik cevap reddediliyor, "bilinmiyor" sessizce `false`a
  düşmüyor (`CLAUDE §1`). Atama artık ters yönü de kilitliyor — motor bayrağı üretmeyi bırakırsa
  uç derlenmez. Ekran iki cümle söylüyor: daraltma uyarısı, ve daraltma yüzünden BOŞ kalan liste
  için ayrı sebep metni.

  **Doğrulama.** 3 sözleşme birimi + 3 ekran testi; alan şemadan çıkarılınca üçü de kırmızıya
  döndü, geri konunca yeşil. Depo jest paketi **118/118**.

- [x] (21.134) **RAMPADA BEKLEYEN KUTU SAYACI — hub rozeti + devir ekranı başlığı**
  (tasarım `kargo-kanali-tasarimi.md §8.6`; `21.130`'un BEKLEYEN'i kapandı)
  `touches:` `packages/database/src/services/order-box.service.ts` ·
  `packages/application/src/shipping/handover.ts` ·
  `packages/types/src/contracts/warehouse-api.schema.ts` ·
  `apps/mobile-api/src/api/v1/warehouse.ts` ·
  `apps/mobile/src/screens/warehouse/{use-warehouse-hub.hook.ts,warehouse-hub-screen.tsx,handover-screen.tsx}`

  **Durum (29.08).** Devir satırının rozeti YOKTU ve künyesi sebebini yazıyordu: *"kaç kutu
  bekliyor sorusunun bir ucu henüz yok."* Uç yazıldı (`GET /warehouse/handover/pending`).

  **Hub'ın "sayaç listeden sayılır" kuralının TEK istisnası** ve gerekçesi ölçüldü: bekleyen
  kutuları hiçbir liste taşımıyor. Duyurulmuş bir siparişin kutuları hazırlık kuyruğundan
  DÜŞMÜŞTÜR (sipariş `ready`/`out_for_delivery`) ve gelen transferlerle ilgisi yok.

  **Liste değil SAYI:** devir ekranı bilerek bir okutucudur — depocu elindeki kutuyu okutur,
  "hangi siparişi vereyim" diye bir seçim yoktur. Sayı seçim davet etmiyor, **bitiş ölçüsü**
  veriyor. Bu soru bugüne kadar ancak İLK okutmadan sonra ve yalnız O gönderi için
  cevaplanabiliyordu (`handedBoxes/boxCount`); rampada üç ayrı siparişin kutuları varken
  "bitti mi" sorusunun cevabı hiçbir yerde yoktu.

  **Süzgeç devir kapısının reddettikleriyle BİREBİR aynı** (mühürsüz · duyurulmamış · verilmiş):
  gevşek bir sayaç "3 kutu bekliyor" der, depocu üçünü okutur ve biri reddedilirdi — sayının
  söylediği iş yapılamaz çıkardı.

  **Üç hâl ayrı cümle:** okunamadı ≠ sıfır (`CLAUDE §1`). "Rampa boş" demek, depocuyu kutuların
  yanından uzaklaştırırdı. Rozet yalnız gerçekten bekleyen kutu varken çizilir.

  **Sayaç hub'ın hata hâlini TETİKLEMİYOR:** bir rozetin düşmesi, çalışan iki listeyi gizleyen tam
  ekran hata bloğu doğurmamalı. Devir ekranında sayı her okutmadan sonra sunucudan tazeleniyor,
  yerelde eksiltilmiyor — aynı depoda ikinci bir telefon da okutuyor olabilir.

  **Doğrulama.** 3 entegrasyon (delta ile ölçüldü, mutlak sayıyla değil — `CLAUDE §4b`) + 1 uç
  testi + 6 ekran testi. Sabotajla doğrulandı: "okunamadı"yı sıfıra düşürünce ilgili test kırmızı.
  Depo jest paketi **124/124**, kilitli tam paket **3945/3945**.

- [x] (21.135) **OPERASYON v3 GEÇİŞİNİN ZEMİNİ — tasarım repoda + Maestro e2e altyapısı**
  (kullanıcı kararı 30.08: kapsam operasyon v3'ün TAMAMI, önce e2e altyapısı, ekran başına commit)
  `touches:` `design/project/Operasyon Mobil v3.dc.html` · `design/derived/operasyon-mobil-v3/` ·
  `scripts/design-split.mjs` · `apps/mobile/maestro/` · `apps/mobile/scripts/device.mjs` ·
  `apps/mobile/src/app/_layout.tsx` · `docs/uygulama/gunluk-operasyon-v3-gecisi.md`

  **Durum (30.08).** Geçişin kendisi başlamadan önceki iki hazırlık fazı. Ekranlar bundan sonra
  tek tek gelecek; her birinin durumu kendi görev satırında olacak. Çalışma günlüğü
  `docs/uygulama/gunluk-operasyon-v3-gecisi.md` — **ilerlemenin sahibi yine bu satırlardır**,
  günlük "nasıl gitti"yi tutar.

  **Faz 0 — tasarım repoda.** v3 repoda yoktu (yalnız v1/v2). 30.08 00:31 dışa aktarımı alındı,
  32 ekrana bölündü. Bölme aracı v3'ü tanımıyordu: tasarım aracı ekran koşulunun adlandırmasını
  değiştirmiş (`{{ vEkranAdi }}` → `{{ is.ekranAdi }}`). Araç iki adlandırmayı da tanıyor; eski
  dosyalarda ateşlenemediği ölçüldü. Ölçüm: 32 `is.` koşulu ↔ 32 `data-screen-label`, kapsama
  3475/3475 satır, boşluk ve çakışma yok.

  **29.08 denetimimin üç bulgusu KAPANMIŞ** — çevrimdışı kilidi, boş/yükleniyor/hata hâlleri,
  kargo devrinde kutu okutma. Bu dışa aktarım incelediğim paketten yenidir; ölçüldü ve günlüğe
  yazıldı. `design/pages/app-depo.md` sonundaki "tasarımda DÜŞTÜ" bölümü geçersiz kaldı, geçiş
  sırasında güncellenecek.

  **Faz 1 — Maestro.** Native tarafta e2e altyapısı yoktu (repodaki Playwright'ın üç projesi de
  web'dir). `maestro` 2.9.0 kuruldu, `apps/mobile/maestro/` açıldı, iki komut yazıldı:
  `pnpm mobile:device` (adb reverse tünellerini kurar **ve cihazın içinden ölçer** — tünel
  düştüğünde uygulama "sunucu yok" demez, boş ekran gösterir) ve `pnpm mobile:e2e`.

  **İlk akış fiziksel cihazda yeşil** (`depo-kapi.yaml`): depo hesabıyla giriş → operasyon kapısı
  → hub'ın dolu hâli → dokuz kartın hepsi. Veri uçtan gelir, gelmezse akış düşer.

  **Üç cihaz gerçeği ölçüldü** (hepsi künyelere yazıldı): OPPO CPH1907 `pm clear`ı reddediyor
  (`SecurityException`), oturum sıfırlama akıştan çıktı — yeni dev oturumu eskisinin üstüne
  yazıyor. Dev-client'ın yüzen menü düğmesi "Hesap" sekmesinin üstüne düşüyor ve dokunuşu
  **sessizce** yutuyor (akış "dokunuldu" diye COMPLETED yazıyor); giriş ekranına derin
  bağlantıyla gidiliyor, sekmeye hiç dokunulmuyor. İki kabuğun ortak "ayaktayım" kancası yoktu —
  kök düzene `app-root` eklendi.

  **Doğrulama.** typecheck · lint · knip · boundaries yeşil; mobil jest **920/920**; kilitli tam
  paket **3945/3945**; Maestro akışı gerçek cihazda yeşil.

- [x] (21.136) **DEPO HUB v3 — düz liste üç katmana ayrıldı** (Operasyon Mobil v3:35-174)
  `touches:` `apps/mobile/src/screens/warehouse/{warehouse-hub-screen.tsx,messages.json}` ·
  `apps/mobile/src/components/operations/section-header.tsx` ·
  `apps/mobile/src/components/ui/{icon.tsx,icon-paths.ts}` · `apps/mobile/src/theme/metrics.ts` ·
  `packages/design-tokens/src/operations-app.ts`

  **Durum (30.08).** v3 geçişinin ilk ekranı. v2 sekiz işi eşit ağırlıkta satırlara diziyordu;
  v3 onları işin aciliyetine göre ayırdı: koyu **özet kartı** (üç sayı) → **D1 büyük kartı** (ilk
  iki siparişin önizlemesiyle) → **D2–D8 ikili ızgarası** → **yazıcı şeridi**.

  **YENİ UÇ İSTEMEDİ.** Özet kartının üç sayısı da bölümün zaten okuduğu veriden çıkıyor; "yarım
  kutu" mühürlenmemiş kutusu olan sipariştir (`boxes[].sealedAt === null`, sözleşmede var). Hub'ın
  "sayaç uçtan gelmez, listeden sayılır" kuralı korundu. Üçü de `null` olabilir ve o zaman **"—"**
  yazılır, "0" değil — koyu kartta büyük bir sıfır "bugün iş yok" der (CLAUDE §1).

  **Ortak zemine dört dokunuş** (bölüm-üstü, ama bu ekranın ihtiyacıydı): başlığa **bağlam satırı**
  (`context`) — v3 dört bölümde de başlığın altına bir künye koyuyor; **üstbaşlık rengi dört
  bölümde de zeytin oldu** (v2'nin "üstbaşlık bölümün kimliğidir" kararı v3'te geri alınmış,
  şablonun dördü de `#5f7a2c`); ikon sözlüğüne **yedi geometri + `<rect>` desteği** (D8'in kutusu
  dikdörtgen, `d` yayına çevirmek geometriyi yeniden yazmak olurdu); koyu kartın üstü için **dört
  yeni renk token'ı** — krem zeminin hiçbir tonuyla karşılanamıyordu, ham hex yasak (CLAUDE §3).

  **İki arıza YALNIZ CİHAZDA görüldü, jest ikisini de göremez** (yerleşim ölçülmez): `flexBasis:
  '48%'` + `flexGrow` ile kutucuklar İÇERİĞE göre boyutlandı, uzun alt metinli "Mal kabul" tek
  başına satırı kapladı; `width: '48%'` ile yüzde beklenmedik bir tabana çözüldü ve kutucuklar
  ekranın beşte birine düştü. Sütun genişliği artık `useWindowDimensions`'dan hesaplanıyor
  (`discover-screen`in kart yolu hesabıyla aynı yol).

  **Üç uyuşmazlık kayda geçti** (günlüğün defteri): depo ADI mobile hiç ulaşmıyor (üstbaşlık
  kuyruksuz yazıldı); kapsam belirsizliği şablonda ince şerit, bizde tam ekran blok (kapsam
  çözülmeden uçlar veri döndürmüyor); D8 alt metni "verilen"i değil BEKLEYENİ sayıyor — bilinçli
  sapma, 21.134'ün kararı.

  **Doğrulama.** Hub jest **15/15** (dördü yeni), başlık jest **9/9**, token jest **11/11**, mobil
  paket **930/930**; typecheck · lint · knip · boundaries yeşil; Maestro akışı gerçek cihazda
  yeşil; ekran **gözle doğrulandı** (9 sipariş · 1 yarım kutu · 3 bekleyen sevkiyat, canlı veri).

- [x] (21.137) **TOPLAMA KUYRUĞU v3 — satır karta döndü, üç durum üç cümle** (v3:176-325)
  `touches:` `apps/mobile/src/screens/warehouse/{preparation-screen.tsx,use-preparation.hook.ts,warehouse-format.ts,messages.json}` ·
  `apps/mobile/src/components/operations/progress-bar.tsx` ·
  `apps/mobile/src/screens/courier/courier-day-screen.tsx`

  **Durum (30.08).** Kuyruk satırı kesikli çizgili bir satırdan **karta** döndü ve üç bilgi
  katmanı taşıyor: referans · künye (müşteri · kanal · kulvar) · ilerleme (çubuk + cümle). Üç
  durum üç ayrı cümle ve renk: yarım terracotta · hazır zeytin · başlanmamış gri. Taşıyıcı
  kulvarındaki siparişte **KARGO rozeti** — kutu tipi sorulacağının önceden haberi (07.12).
  Başlık künyesi artık kuyruğu anlatıyor ("9 sipariş bekliyor · 1 yarım").

  **ŞABLON KENDİ İÇİNDE TUTARSIZDI ve seçim yazıldı:** beş örnek satırın sol durum işareti tek
  kurala uymuyor (dördüncüsü hiç başlanmamışken terracotta, beşincisi tamamlanmışken gri) —
  statik maket, işaretler elle boyanmış. Çoğunluğun kuralı alındı: işaret ile metin AYNI kuralı
  izler. "Improvise etme"nin sınırı burası — tasarım tek şey söylemediğinde çoğunluğu alınır ve
  seçim künyeye yazılır.

  **İlerleme çubuğu PAYLAŞILANA çıkarıldı** (`OperationsProgressBar`): aynı çubuk kuryenin gün
  başlığındaydı, iki kopyaydı (CLAUDE §1). Renk çağırandan — kuryede hep zeytin, depoda durum.

  **CİHAZDA İKİ ARIZA BULUNDU, ikisi de koda döndü:**

  1. **Dipnot yalan söylüyordu.** "yarım kalan kutu en üstte durur" diyor, uç teslim gününe göre
     sıralıyor; ölçüldü: yarım sipariş dokuz satırın **sekizincisindeydi**. Kural ortak yardımcıya
     yazıldı (`orderPickingQueue` — kararlı, grup içinde ucun sırasını korur, girdiyi değiştirmez)
     ve hub'ın D1 önizlemesi de onu kullanıyor: aynı listenin iki ekranda iki farklı başı olamaz.
     **Sıralama uçta DEĞİL ekranda:** "yarım" bir görünüm önceliğidir; uca taşımak her tüketiciyi
     depo ekranının tercihine bağlardı.
  2. **Çevrimdışı kilidi HİÇ ERİŞİLEMİYORDU** — yazdığım dal ölü koddu. Her okuma hatası `error`a
     gidip eldeki listeyi gizliyordu; tasarımın kuralı ise "okumak serbest, YAZMAK kapalı". Hook
     düzeltildi: **ağ** hatasında bir kez dolu okunmuş kuyruk korunur, **sunucu** hatasında
     gizlenir (açıklanamayan bayatlık depocuyu olmayan bir işe gönderir). Koşul "elimizde liste var
     mı", "durum neydi" değil — `reload` önce `loading`e alıyor ve duruma bakan kural elle yapılan
     tekrar denemede hiç tutmazdı.

  **Doğrulama (21.137).** Kuyruk jest **23/23** (dördü yeni) · sıralama **4/4** · çevrimdışı hook **3/3**
  (ayrı dosya: kural iki yükleme istiyor, ekran testinde ikincisi tetiklenemiyor) · mobil paket
  **941/941**; typecheck · lint · knip · boundaries yeşil; kilitli tam paket 3945/3945; **cihazda
  gözle doğrulandı** — yarım sipariş başa çıktı, KARGO rozeti yerinde, tünel düşürülünce okutmanın
  yerine kilit geldi ve liste kaldı.

- [x] (21.138) **TOPLAMA DETAYI v3 — raf yeri, motor rozeti, sayım kilidi, kapanan kutu kaydı** (v3:327-507)
  `touches:` `apps/mobile/src/screens/warehouse/{preparation-screen.tsx,messages.json,preparation-screen.test.tsx,picking-box.test.tsx}`

  **Durum (30.08).** Dört ekleme, dördü de **zaten var olan veriyi** ekrana çıkarıyor — yeni uç,
  yeni alan, yeni sözleşme yok:

  1. **Adım satırı** ("1 · DERİN DONDURUCU 2") — sıra numarası + rafın adı. `suggestion[].areaName`
     sözleşmede VARDI ve hiçbir ekranda çizilmiyordu (ölçüldü 30.08); depocu rafı listede değil
     kafasında arıyordu. Raf `null` ise uydurulmaz, yalnız numara yazılır ("2. kalem") — uydurma
     bir raf adı depocuyu olmayan bir dolabın önüne gönderir (CLAUDE §1).
  2. **"MOTOR ÖNERİSİ" rozeti** — v2'de cümlenin kuyruğuydu ("… — motor önerisi"); artık ayrı bir
     rozet. Sayının nereden geldiğini söyler ve depocunun kendi kararıyla karışmaz. Önerisiz
     kalemde hiç doğmaz.
  3. **Çevrimdışı sayım kilidi** — sayaç soluklaştırılmaz, YERİNE konan adet yazılır ("konan 2 ·
     sayım kapalı"). Basılamayan bir sayaç "bozuk" görünür; konan adedi söyleyen satır "kilitli"
     der.
  4. **Kapanan kutular salt-okunur KART** — v2 tek satırlık özetti ("Kutu 1 kapalı · 8 ürün");
     artık içeriği kalem ADIYLA ve QR'ıyla yazıyor. İkisi de sözleşmede vardı ve iki soruya cevap:
     "yanlış kutuyu mu kapattım" ve "bu karton hangi etiketle gidecek". Ad siparişin kalemlerinden
     çözülüyor — kutuda yalnız kimlik taşınıyor, adı iki kaynaktan taşımak biri ötekiyle çelişirdi.

  **Doğrulama.** Depo jest **144/144** (beşi yeni: adım satırı, rafsız hâl, rozetin iki dalı,
  çevrimdışı kilit, kapanan kutu kartı) · mobil paket **945/945**; typecheck · lint · knip ·
  boundaries yeşil; kilitli tam paket 3945/3945; **cihazda gözle doğrulandı** — raf adı canlı
  veriden geldi, önerisiz kalem rozetsiz çizildi, kapanan kutu kartı iki kalemi ve QR'ı gösterdi.

- [x] (21.139) **MAL KABUL BEKLEYEN LİSTESİ v3 — künye listeyi anlatıyor, plansız kabul sona indi** (v3:509-587)
  `touches:` `apps/mobile/src/screens/warehouse/{intake-screen.tsx,messages.json,intake-screen.test.tsx}` ·
  `apps/mobile/src/theme/metrics.ts`

  **Durum (30.08).** Başlık künyesi kategoriyi değil LİSTEYİ anlatıyor ("2 bekleyen sevkiyat ·
  11 kalem"); sayı listeden çıkıyor, ikinci bir özet ucu istemiyor (hub'ın aynı kuralı). Liste
  okunamadıysa sayı **uydurulmuyor**, künye kategoriye düşüyor. Satırlara kutu ikonu geldi.

  **PLANSIZ KABUL LİSTENİN ÜSTÜNDEN SONUNA TAŞINDI.** 23.13'ün gerekçesi *"bekleyen sevkiyat
  sayısı değişken, sabit yer sabit alışkanlık"*tı; v3'ün gerekçesi daha güçlü: plansız kabul bir
  **istisnadır** — beklenen adet yoktur ve sayım onunla doğrulanamaz. Kuyruğun üstünde durması onu
  normal yol gibi gösteriyordu. Kesikli çerçeve de bunu söylüyor. **Boş hâlde ise TEK yol** olduğu
  için orada kalıyor ve boş bloğun içine giriyor.

  **Bir test YANLIŞ SEBEPLE geçiyormuş** (yol boyunca bulundu): `Promise.resolve(fail('server_error'))`
  — `fail` yerel bir yardımcı değil, Jest'in eski globali; çağrı fırlatıyor, istemci onu AĞ hatası
  sayıyor ve iddia yine yeşil kalıyordu. Gerçek bir 500 cevabı döndüren `serverError()` ile
  değiştirildi.

  **İki alan yazılamadı, uyuşmazlık defterine geçti:** şablon satırda "· gönderildi" (sipariş
  durumu) ve "SKT gerekli" yazıyor; ikisi de `PendingIntakeSchema`'da yok. Üstelik durum sabit de
  değil — bekleyen liste hem `sent` hem `partially_received` taşıyor, yani "gönderildi" yazmak
  yarısı için yanlış olurdu.

  **Doğrulama.** Mal kabul jest **16/16** (dördü yeni: künye toplamı, okunamayan liste, plansız
  kabulün sırası, boş hâldeki kapı) · mobil paket **949/949**; typecheck · lint · knip · boundaries
  yeşil; **cihazda gözle doğrulandı** — künye 5+6=11 kalem, ikonlar, kesikli plansız satırı, dipnot.

- [x] (21.140) **MAL KABUL FORMU v3 — künye ilerlemeyi söylüyor, sıfır beklenen iki ayrı şey** (v3:589-746)
  `touches:` `apps/mobile/src/screens/warehouse/{intake-screen.tsx,messages.json,intake-screen.test.tsx}`

  **Durum (30.08).** Form künyesi kategoriyi değil İLERLEMEYİ söylüyor ("tedarik siparişi · 5
  kalem · 0 tamam"). "Tamam" ölçüsü CTA'nınkiyle **aynı iki koşuldur** (adet + SKT) ve kural
  kopyalanmadı, tek yerden okunuyor — ayrışsalardı künye "1 tamam" derken CTA "her satırda adet +
  SKT zorunlu" demeye devam ederdi. Çevrimdışıyken okutma düğmesi **gizlenmiyor**, yerine sebep
  yazılıyor: gizlenen bir düğme sebebi olmayan bir eksiklik gibi görünür.

  **VERİTABANINDAN BİR AYRIM ÇIKTI.** Ekranda beş kalemin dördü künyesiz duruyordu. `expectedQty`
  ısmarlanan mı kalan mı diye ölçtüm (`purchase_order_progress`): **kalan** (`missing_qty`).
  Dördü tamamen alınmış (kalan 0), biri 30 kalmış. Yani sıfır beklenen İKİ ayrı şey demek:
  plansızda "kıyaslanacak beklenti yok", planlıda "beklenti **karşılandı**" — ve ikisi ekranda
  birebir aynı görünüyordu. Planlı siparişte artık "bu kalem tamamlandı — beklenen kalmadı"
  yazılıyor; plansızda sessizlik korundu (23.13'ün gerekçesi orada aynen geçerli).

  **Üç öğe yazılamadı, uyuşmazlık defterine geçti:** tedarikçi kodu ("GAZ-7120"), "SKT ZORUNLU"
  etiketi ve "Kalan ömür %58" uyarısı — üçü de `IntakeFormRowSchema`'da yok; kalan ömür ayrıca
  ürünün raf ömrü gününü gerektiriyor.

  **Doğrulama.** Mal kabul jest **20/20** (yedisi yeni) · mobil paket **955/955**; typecheck ·
  lint · knip · boundaries yeşil; **cihazda gözle doğrulandı** — dört kalem "tamamlandı", biri
  "beklenen 30"; veritabanıyla birebir.

- [x] (21.141) **SİPARİŞSİZ KABUL v3 — kendi başlığı, kendi cümlesi, kendi kilidi** (v3:748-826)
  `touches:` `apps/mobile/src/screens/warehouse/{intake-screen.tsx,messages.json,intake-screen.test.tsx}`

  **Durum (30.08).** Üç değişiklik, üçü de aynı şeyi söylüyor: plansız kabul, mal kabulün bir
  KİPİ değil başka bir iştir.

  1. **Kendi başlığı** ("Siparişsiz Mal"). "Mal Kabul" beklenen adetlerle çalışılan ekranın adıydı;
     aynı başlık ikisini de taşıyınca depocu hangi ekranda olduğunu ancak künyeden anlıyordu.
  2. **Satır SUSMUYOR**: "beklenen yok — ne geldiyse o yazılır". Sayı değil KELİME — "beklenen 0"
     olmayan bir beklentiyi sıfır diye gösterirdi (CLAUDE §1); "yok" beklentinin kendisinin
     bulunmadığını söyler. 21.140'ın "tamamlandı" cümlesiyle birlikte, sıfır beklenenin iki ayrı
     anlamı artık iki ayrı cümle.
  3. **Çevrimdışı kilidinin metni KİPE GÖRE**: planlıda sorun sayımın doğruluğu ("çevrimdışı
     sayılan adet iki deponun stokunu bozabilir"), plansızda henüz sayılacak bir şey yok — sorun
     satırın kendisinin doğamaması (kod eşleşmesi ve parti oluşumu sunucuda). Tek metin ikisini de
     anlatsaydı, ikisinde de yarısı yanlış olurdu.

  **SKU yazılamadı, uyuşmazlık defterine geçti:** şablon "SKU 601202" diyor; SKU **aramadan**
  eklenen satırda var (`VariantSearchRowSchema.sku`) ama **okutmadan** eklenende yok
  (`ResolveCodeResponseSchema` döndürmüyor). Bir kısmında kod olan, bir kısmında olmayan satır,
  depocuya "bu ürünün kodu yok mu" diye sordururdu.

  **Doğrulama.** Mal kabul jest **31/31** (ikisi yeni) · mobil paket **954/954**; typecheck ·
  lint · knip yeşil; **cihazda gözle doğrulandı** — başlık ayrıştı, boş hâl ve iki kapı yerinde.

- [x] (21.142) **YAKIN-SKT TURU v3 — ömür çubuğu, imhalık satırın kendi bağı** (v3:828-896)
  `touches:` `apps/mobile/src/screens/warehouse/{near-expiry-screen.tsx,near-expiry-fixture.ts,messages.json,near-expiry-screen.test.tsx}`

  **Durum (30.08).** Satır iki katman oldu: künye + karar rozeti üstte, **ömür çubuğu** altta.
  Çubuğun rengi **ACİLİYETTEN** türüyor, karardan değil: karar sistemin türettiği eylemdir
  (teklif · imha), aciliyet ise partinin kaç günü kaldığı. Çubuk zamanı çiziyor, o yüzden zamanın
  rengini taşıyor — kararın rengi zaten rozettedir ve ikisi aynı olsaydı satırda aynı şey iki kez
  söylenirdi.

  **İmhalık satırın KENDİ bağı** (`sayım/düzeltmeye götür →`): alttaki genel düğme
  `discardCandidate` ile TEK partiyi taşıyor ve imhalık birden çoksa depocu hangisinin gittiğini
  bilemezdi. İki yol da tek bir çağrıdan geçiyor — ayrı yazılsalardı biri bir gün ötekinden başka
  parametre gönderirdi.

  **BİR DUPLİKASYON KAPANDI.** Fikstür ömrü METİN olarak tutuyordu (`lifeLabel: 'kalan ömür %18'`);
  v3 aynı değeri hem çubukla hem yazıyla gösteriyor ve ikisi tek kaynaktan çıkmalı — dize ile sayıyı
  yan yana tutmak, birinin bir gün ötekiyle çelişmesi demekti (CLAUDE §1). Alan `lifePercent:
  number | null` oldu, cümleyi sözlük kuruyor. **`null` = ölçülemedi** ve o zaman **çubuk hiç
  çizilmiyor**: boş bir çubuk "%0" gibi görünür ve o partiyi imhalık gösterirdi.

  **Doğrulama.** Yakın-SKT jest **6/6** (ikisi yeni: çubuğun iki hâli, satır bağının hedefi) ·
  mobil paket **956/956**; typecheck · lint · knip yeşil; **cihazda gözle doğrulandı** — üç çubuk
  üç renkte (kırmızı/terracotta/zeytin), ölçülemeyen partide çubuk yok.

- [x] (21.143) **SAYIM / DÜZELTME v3 — boş hâlin çıkış yolu, çevrimdışının sebebi** (v3:898-993)
  `touches:` `apps/mobile/src/screens/warehouse/{adjustment-screen.tsx,messages.json,adjustment-screen.test.tsx}`

  **Durum (30.08).** İki eksik kapandı, ikisi de aynı kusurun iki hâli: ekran sorusunu soruyor ama
  cevabı söylemiyordu.

  1. **Boş hâlin ÇIKIŞ YOLU.** "Hangi parti düzeltilecek?" diye sorup cevabın nerede olduğunu
     söylememek depocuyu geri tuşuna mahkûm ediyordu. Bloğun içine "Yakın-SKT turuna git →" girdi.
  2. **Çevrimdışının SEBEBİ.** Düğme kapalıydı ama neden kapalı olduğu yazmıyordu. Artık CTA'nın
     ÜSTÜNDE: "Olay referansı sunucuda doğar — bağlantısız yazılan düzeltme kâğıt tutanakla
     eşleşemez." Düğme **kalıyor** (kabul ekranlarının aksine, orada okutma düğmesinin YERİNE
     geçmişti): CTA zaten kapalı ve "kaydet" fiilinin görünür kalması işin bittiğinde ne olacağını
     söylüyor — eksik olan sebepti.

  **Bir yol yazılamadı, uyuşmazlık defterine geçti:** şablonun ikinci çıkışı "Parti etiketini
  okut". Parti etiketini çözen bir uç YOK — `codes/resolve` barkod/SKU/tedarikçi kodunu VARYANTA
  çeviriyor, partiye değil.

  **Doğrulama.** Düzeltme jest **11/11** (biri yeni) · mobil paket **957/957**; typecheck · lint ·
  knip yeşil; **cihazda gözle doğrulandı**.

- [x] (21.144) **BU CİHAZ · YAZICILAR v3 — künye kapsamı, grup başına sonuç** (v3:995-1041)
  `touches:` `apps/mobile/src/screens/warehouse/{printer-setup-screen.tsx,messages.json,printer-setup-screen.test.tsx}`

  **Durum (30.08).** Künye ayarın KAPSAMINI söylüyor ("ayar bu telefona özeldir"); eskisi ne
  yaptığını söylüyordu ("hangi işi hangi yazıcıdan bastığın") ve asıl soru o değildi — bu ayarın
  nereye kadar geçerli olduğuydu. Grup başlıkları Lora başlıktan ÜSTBAŞLIĞA indi ("KUTU ETİKETİ ·
  4×6"): iki grup aynı işin iki kipi, ayrı bölüm değil; Lora onları iki ayrı ekran gibi
  gösteriyordu.

  **Eksiklik SONUCUYLA yazılıyor:** "Tanımlı değil — etiket alınsa da basılamaz". Eskisi bir durum
  bildirimiydi; bu, bedelini söylüyor — depocu kargo etiketini alıp elinde kalmasın diye.

  **HER GRUP KENDİ SONUCUNU taşıyor** (v3:1017, 1035): kutu etiketi kapanışta sistem diyaloğu
  olmadan kendiliğinden basar; kargo etiketi alınmışsa basım düşse bile gönderi iptal olmaz. İkisi
  ayrı cümle, çünkü ikisinin bedeli ayrı — ortak bir dipnot ikisini de yarım anlatırdı.

  **İki öğe yazılamadı, uyuşmazlık defterine geçti:** seçili yazıcının BAĞLANTI DURUMU ("bağlı ·
  Wi-Fi") ve "test bas" eylemi. Sözleşme durum alanı taşımıyor; test basımı da örnek bir etiket
  yükü ister (hat gerçek etiket PNG'siyle çalışıyor).

  **Doğrulama.** Yazıcı jest **5/5** (biri yeni) · mobil paket **958/958**; typecheck · lint ·
  knip yeşil; **cihazda gözle doğrulandı**.
