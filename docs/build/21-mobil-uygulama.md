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
  `touches:` `apps/mobile/src/screens/{feedback/feedback-screen.tsx,professionals/professionals-screen.tsx,login/login-screen.tsx,catalog/catalog-screen.tsx,courier/{day-close-screen.tsx,delivery-screen.tsx},management/offer-approval-screen.tsx,warehouse/{courier-return-screen.tsx,transfer-screen.tsx}}`
  (~~`warehouse/adjustment-screen.tsx`~~ — o ekran 21.222'de ikiye ayrıldı: `stock-count-screen.tsx` + `write-off-screen.tsx`)

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
  ~~`apps/mobile/src/screens/warehouse/adjustment-screen.tsx`~~ (21.222'de ikiye ayrıldı: sayım + stok düşümü) ·
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
  `touches:` ~~`apps/mobile/src/screens/warehouse/{adjustment-screen.tsx,adjustment-screen.test.tsx}`~~ ·
  `apps/mobile/src/screens/warehouse/messages.json`
  (ekran 21.222'de BAŞTAN yazıldı ve ikiye ayrıldı — `stock-count-screen.tsx` + `write-off-screen.tsx`;
  buradaki iki kazanım orada da duruyor: boş hâlin çıkış yolu ve çevrimdışının sebebi.)

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

- [x] (21.145) **KAPSAM BELİRSİZ v3 — çıkış yolları ve kararın kendisi** (v3:1043-1065)
  `touches:` `apps/mobile/src/screens/warehouse/{warehouse-hub-screen.tsx,messages.json,warehouse-hub-screen.test.tsx}` ·
  `apps/mobile/src/screens/login/post-login-route.ts`

  **Durum (30.08).** Hub'ın "hangi depo" dalı v3'ün 10. ekranının kendisidir (ayrı rota yok).
  Gerekçe metni keskinleşti, **çıkış yolları** geldi, ve **kararın kendisi** yazıldı: "Depo
  seçtirme bilinçli olarak yoktur — yanlış depoya yazılan sayım iki deponun stokunu birden bozar"
  (DOMAIN §17). Bir liste koymak kolay olurdu; kararın nedeni ekranda durmalı.

  **ÇIKIŞLAR PERSONELİN GERÇEKTEN AÇIK BÖLÜMLERİNDEN doğuyor.** Şablon "Para bölümüne geç"i SABİT
  yazıyor; sabit yazmak, para yetkisi olmayan bir depocuya açamayacağı bir kapı göstermek olurdu —
  o kapı "yetkin yok" diye geri atardı. Liste kapıdan geliyor (`useOperationsSections`); tek
  bölümlü personelde hiç düğme doğmuyor.

  **Bir duplikasyon önlendi:** bölüm adresi deseni (`/${section}`) `operationsHomeRoute` içinde
  gömülüydü; ikinci çağıran doğunca `operationsSectionRoute` olarak çıkarıldı (CLAUDE §1).

  **Uyuşmazlık #2 daraldı:** kalan tek fark yerleşim — şablon kapsam sorusunu hub'ın üstünde ince
  bir şerit yapıp altında dolu bir hub çiziyor; kapsam çözülmeden uçların hiçbiri veri döndürmediği
  için bu hâlâ mümkün değil.

  **Doğrulama.** Hub jest **17/17** (ikisi yeni: açık bölüme çıkış, tek bölümlüde çıkışsızlık) ·
  mobil paket **960/960**; typecheck · lint · knip yeşil; **cihazda gözle doğrulandı** — muhasebe
  rolüyle (depo + para) girildi, yalnız "Para bölümüne geç" çizildi.

- [x] (21.146) **TRANSFER v3 — kart ne geldiğini söylüyor, boşluk ölçtüğünü söylüyor** (v3:1067-1152)
  `touches:` `apps/mobile/src/screens/warehouse/{transfer-screen.tsx,messages.json,transfer-screen.test.tsx,warehouse-hub-screen.test.tsx}`

  **Durum (30.08).** Kuyruk satırı KART oldu ve **ne geldiğini** de söylüyor: ilk üç kalem +
  adetleri, sonra "kabule başla →". Kart bir LİSTE DEĞİL, "içeride ne var" cümlesi — dördüncü satır
  kartı listeye çevirir ve kuyruğun kendisi ekrandan taşardı. **Kırpma SESSİZ DEĞİL**: kalan kalem
  sayısı yazılıyor, çünkü sessiz kırpma eksik bir kabule hazırlanmak olurdu.

  **CİHAZ + VERİTABANI ÖLÇÜMÜ BİR YANLIŞ YAKALADI.** Ekran "Yolda transfer yok" diyordu. Veriye
  baktım: **iki transfer yolda**, ama ikisi de bu depodan ÇIKIYOR (Strasbourg → Kehl) ve uç yalnız
  GELENİ döndürüyor. Cümle "hiçbir şey yolda değil" diye okunuyordu ve yanlıştı — depocu çıkan
  sevkiyatlarını yokmuş sanırdı. Metin artık ölçtüğü şeyi söylüyor: "Kabul bekleyen transfer yok",
  ve hangi listenin gösterildiği açıkça yazılı. Aynı düzeltme hub'ın D5 alt metnine de gitti.

  **İki bölüm yazılamadı, uyuşmazlık defterine geçti:** şablonun **YOLDA** (çıkan) ve **SON
  KAPANANLAR** bölümleri; uç yalnız geleni döndürüyor. Satırlardaki depo ADLARI da yok
  (`fromWarehouseId` uuid) — uyuşmazlık #1'in aynı ailesi.

  **Doğrulama.** Transfer jest **8/8** (ikisi yeni: üç kalemlik önizleme + kırpma satırı, kırpma
  yokken satırın hiç doğmaması) · depo jest **161/161**; typecheck · lint · knip yeşil; **cihazda
  boş hâl gözle doğrulandı** — dolu kart yerel veride yok (gelen transfer bulunmuyor), önizleme
  jest'le sınandı.

- [x] (21.147) **TRANSFER KABULÜ v3 — kural sayımdan önce, sıfır tek dokunuşla** (v3:1154-1214)
  `touches:` `apps/mobile/src/screens/warehouse/{transfer-screen.tsx,messages.json,transfer-screen.test.tsx}`

  **Durum (30.08).** Üç değişiklik, üçü de ZAMANLAMA ya da ZAHMET ile ilgili — akış değişmedi.

  1. **KURAL SAYIMDAN ÖNCE.** "Transferde SKT ve lot yeniden yazılmaz — gönderen depodaki partiler
     taşınır" bilgisi dipnottaydı; depocu onu SAYDIKTAN sonra okuyordu. Kural sayımı değiştirmiyor
     ama BEKLENTİYİ değiştiriyor: SKT alanı aramaya çıkan biri onu bulamayınca ekranı eksik sanar.
  2. **"0 · HİÇ GELMEDİ" TEK DOKUNUŞLA.** Sıfır bu ekranın en anlamlı ve en zor girilen değeri:
     klavye açıp "0" yazmak, boş bırakmakla aynı hızda değil — oysa ikisi taban tabana ZIT
     beyanlar ("koli geldi, mal yok" ↔ "saymadım", ekranın kendi kuralı). Kısayol sıfırı bir
     tercih hâline getiriyor, bir zahmet olmaktan çıkarıyor. Zaten sıfır yazılmışsa düğme
     çizilmiyor: aynı şeyi ikinci kez söyleten kontrol, basıldığında hiçbir şey olmadığı için
     bozuk görünür.
  3. **Çevrimdışı sebebi bu ekranda DAHA AĞIR**: kabul İKİ deponun stokunu aynı anda oynatıyor.
     Kuyruğa alınabilseydi kaynak depo malı düşmüş, hedef henüz almamış olurdu — arada mal hiçbir
     yerde görünmezdi.

  Ayrıca "transfer artık yolda değil" cevabının metni, neden hiçbir şeyin yazılmadığını da söyler
  hâle geldi (rampadaki mal ile sistem çelişmesin diye).

  **Doğrulama.** Transfer jest **10/10** (ikisi yeni: sıfır kısayolu ve kaybolması, kuralın
  yeri) · mobil paket **964/964**; typecheck · lint · knip yeşil.

- [x] (21.148) **KURYE DÖNÜŞÜ v3 — akıbetin bedeli seçimden önce** (v3:1216-1291)
  `touches:` `apps/mobile/src/screens/warehouse/{courier-return-screen.tsx,messages.json,courier-return-screen.test.tsx}`

  **Durum (30.08).** Üç akıbetin (stoğa dön · imha · jest) bedeli düğmelerin ALTINDA, HER ZAMAN
  yazılı. Eskiden ipucu ancak seçildikten SONRA çıkıyordu ve **"İmha: parti düşer" HİÇ
  yazmıyordu** — depocu partinin düşeceğini öğrenmeden imhayı seçebiliyordu. Üç düğme geri
  alınamayan bir kaydı hazırlıyor; bedeli önce okunmalı. 21.147'nin "kural karardan önce"
  ilkesinin aynısı.

  Çevrimdışı kilidinin gerekçesi akıbetin kendisinden geliyor: dönen mal stoğa GİRER ya da İMHA
  olur, ikisi de bir stok hareketidir ve bağlantı ister — genel "kayıt kilitli" bunu söylemiyordu.

  **Bir öğe yazılamadı, uyuşmazlık defterine geçti:** şablon "Stoğa dön" seçilince dört adet HAZIR
  SEBEP ÇİPİ gösteriyor ama çiplerin metinlerini vermiyor (yer tutucu döngü). Dört sebebi
  uydurmak, alan sözlüğünü icat etmek olurdu; serbest metin alanı korundu (yer tutucusu kanonik
  gerekçeyi yazıyor).

  **Doğrulama.** Dönüş jest **9/9** (biri yeni) · mobil paket **965/965**; typecheck · lint · knip
  yeşil; **cihazda gözle doğrulandı**.

- [x] (21.149) **KARGO DEVRİ v3 — kural kalıcı, geçmiş başlıklı** (v3:1673-1750)
  `touches:` `apps/mobile/src/screens/warehouse/{handover-screen.tsx,messages.json,handover-screen.test.tsx}`

  **Durum (30.08).** Ekranın kuralı — "hangi siparişi vereceğini seçmiyorsun; eldeki kutuyu okut,
  hangi gönderi olduğunu sistem çözer" — artık düğmenin ALTINDA HER ZAMAN duruyor. Eskiden yalnız
  geçmiş boşken görünüyordu: ilk okutmadan sonra kaybolan bir kural, ikinci kutuda unutulur. Bu
  cümle ekranın TASARIM KARARIDIR (liste değil OKUTUCU — 21.134'ün "sayı seçim davet etmiyor"
  gerekçesiyle aynı aile), süs değil.

  **"OKUTMA GEÇMİŞİ" başlığı** geldi ve boş hâl bir BLOK oldu: "Bugün kutu verilmedi — ilk kutuyu
  okuttuğunda geçmiş burada birikir. Kaç kutu verildiği bu listeden okunur." Tek satırlık gri bir
  ipucu, listenin başlığıyla karışıyordu.

  **Çevrimdışı sebebi bu ekranda EN KESKİN**: kutu devri ANINDA yazılır ve kuyruğa alınamaz —
  taşıyıcıya fiziksel olarak verilmiş bir kutunun sistemde "sırada" beklemesi, malın kimde
  olduğunu belirsiz bırakır. Genel "yazma kapalı" cümlesi bunu söylemiyordu.

  **Doğrulama.** Devir jest **8/8** (biri yeni) · mobil paket **966/966**; typecheck · lint · knip
  · boundaries yeşil; **cihazda gözle doğrulandı**.

  **DEPO BÖLÜMÜ TAMAM (14/14).** Ekranlar: 01 hub · 02 toplama kuyruğu · 03 toplama detay ·
  04 mal kabul · 05 kabul formu · 06 siparişsiz kabul · 07 yakın-SKT · 08 sayım/düzeltme ·
  09 yazıcılar · 10 kapsam belirsiz · 11 transfer · 12 transfer kabulü · 13 kurye dönüşü ·
  19 kargo devri.

- [x] (21.150) **KURYE GÜNÜ + SEFER KÜNYESİ + ARACA YÜKLEME v3'e geçti** (v3:1293-1464)
  `touches:` `apps/mobile/src/screens/courier/{courier-day-screen.tsx,trip-screen.tsx,load-screen.tsx,messages.json,courier-format.ts}` ·
  `apps/mobile/src/app/(operations)/{trip.tsx,load.tsx}`

  **Durum (30.08).** v3 yüklemeyi günün rotasından ÇIKARIP kendi ekranına aldı ve sebebi ölçülebilir:
  gündeki tek satırlık sayaç ("3/7 kutu araçta") KAÇ kutunun bindiğini söylüyordu ama kuryenin
  rampada sorduğu asıl soruyu — **HANGİ durağın kutusu eksik** — hiç cevaplamıyordu. Veri ZATEN
  VARDI: `stop.boxes[].loadedAt` sözleşmede duruyor ve hiçbir yerde çizilmiyordu (21.138'in
  `areaName`iyle aynı hikâye).

  **14 · Günün rotası.** Üstbaşlık "neredeyim"i söylüyor (bölüm + gün), BAĞLAM SATIRI "kim ve hangi
  sefer"i: ad üstbaşlıktan çıktı, sefer künyesi listenin başındaki şeritten başlığa taşındı — şeritte
  kalsaydı duraklara inince kaybolur, kurye "hangi seferdeyim"i ancak yukarı kaydırarak görürdü. Üç
  sayı tek ÖZET KARTINDA (v2'de ayrı satırlardı). "DURAKLAR" başlığı + kapanış kuralı dipnotu.
  Yükleme satırının yerini `/trip`e açılan kapı aldı ve sayacı hâlâ taşıyor: kapıyı açmadan "işim
  var mı" sorusu cevaplanabilmeli. Kutusuz akışta (`boxCounter === null`) kapı HİÇ çizilmiyor.

  **15 · Sefer künyesi** (yeni ekran, `/trip`): kaç durak · kaç kutu · kaç tahsilat, tek bakışta.
  Üçü de duraklardan türüyor — dördüncü bir "özet" ucu, aynı gerçeği bir kez daha okumak olurdu.

  **16 · Araca yükleme** (yeni ekran, `/load`): sayaç + DURAKLARA GÖRE kırılım; üç hâl üç ayrı cümle
  (araçta · eksik · binmedi) — yarım binen durak ile hiç binmeyen aynı şey değil ve kurye ikisine
  farklı davranır. Okutucunun çipleri yalnız BİNMEMİŞ kutulardır.

  **CİHAZDA BİR KUSUR BULUNDU VE DÜZELTİLDİ.** Kutusuz seferde ekran `0/0 kutu` için "Tüm kutular
  araçta — yola çıkabilirsin" diyordu: hiç kutu yokken "hepsi bindi" demek, BOŞ KÜMEYİ TAMAMLANMIŞ
  SAYMAKTIR ve kurye "yükleme bitti" sanırdı. Artık konusu olmadığını söylüyor.

  **Bir ölü kod söküldü:** `shortName` (ad kısaltma) — tek tüketicisi üstbaşlığın kuyruğuydu; ad tam
  hâliyle bağlam satırına indiği için tüketicisiz kaldı. Testiyle birlikte kaldırıldı (CLAUDE §2).

  **Bir uyuşmazlık:** şablon aracın künyesini ve rota zincirini yazıyor; `CourierRunBrief` yalnız
  `vehicleId` taşıyor, ad yok. Ekran bunu SÖYLÜYOR — boş satır bırakmak "araç yok" dedirtirdi.

  **Doğrulama.** Kurye jest **81/81** (beşi yeni yükleme ekranının) · mobil paket **971/971**;
  typecheck · lint · knip · boundaries yeşil; **üç ekran da cihazda gözle doğrulandı** (gün dolu
  veriyle; 15 ve 16 derin bağlantıyla — veritabanı tazelendi, tohum seferleri bugüne göre üretiyor).

- [x] (21.151) **DURAK v3 — adım numarası kutuya göre kayıyor** (v3:1466-1560)
  `touches:` `apps/mobile/src/screens/courier/{delivery-screen.tsx,use-delivery.hook.ts,messages.json}`

  **Durum (30.08).** Ölçüm önce: kapıdaki kutu adımı ZATEN VARDI ve çalışıyordu (`courier-box-scan`,
  sayaç, `boxesSatisfied` kilidi — 23.8). v3'ün farkı ekranın SÖYLEDİĞİ şeydeydi.

  **Numara artık gerçeği söylüyor.** Numaralar metne gömülüydü (`"1 · KANIT"`) ve kutular
  numarasızdı: kanıtın önünde ZORUNLU ama sayılmayan bir kapı duruyordu. Numara `{n} · {label}`
  kalıbına çıktı, kayma tek yerde (`stepNo`) — kutulu durakta akış DÖRT adım (kutular · kanıt · mal ·
  tahsilat), kutusuzda eski ÜÇ adım aynen.

  **İki hâl, iki cümle** (v3:1490): "Tüm kutular müşteriye verildi" bir izin, eksik hâl bedelini
  söylüyor ("dönüş dökümüne *araçta kaldı* diye düşer"). **Kalan sayısı düğmede** (v3:1487) — kurye
  kaç kutu kaldığını başlıktaki sayaçtan geri hesaplamasın.

  **İLK YAZDIĞIM CÜMLE YALAN SÖYLÜYORDU.** Eksik hâl için "kanıt ve tahsilat adımları açılmaz"
  yazmıştım; kodu ölçünce kilidin yalnız TESLİM DÜĞMESİNDE olduğu çıktı (`gateOpen`) — kanıt da
  tahsilat da açık. Ekranda duran ama kodda karşılığı olmayan kural, en kötü belge türüdür; cümle
  gerçekle değiştirildi.

  **CİHAZDA BİR TUTARSIZLIK YAKALANDI.** Numaralar görünür olunca alt not ile başlıklar ayrıştı:
  ekran "1 · KUTULAR" derken kapı notu sırayı "kanıt → mal → teslim → para" diye sayıyordu. Not artık
  kutulu durakta kutuyu da sayıyor (`cta.gateBoxed`) — iki farklı sıra anlatan tek ekran, kuryeye
  hangisine uyacağını sordurur.

  **15. ekranın testi de bu turda yazıldı** (`trip-screen.test.tsx`): üç sayının da durak listesinden
  türediği ve araç künyesinin YOKLUĞUNUN söylendiği ölçülüyor.

  **Doğrulama.** Kurye jest **89/89** (yeni: 3 numaralandırma · 2 sıra cümlesi · 3 sefer künyesi);
  numaralandırma ve tahsilat sayımı testlerinin YAKALADIĞI ayrıca doğrulandı (`stepNo` düzleştirilip,
  tahsilat süzgeci gevşetilip ikisi de kırmızıya döndü); typecheck · lint · knip yeşil; **cihazda
  gözle doğrulandı** — 1·KUTULAR → 2·KANIT → 3·MAL → 4·TAHSİLAT.

- [x] (21.152) **SEFERİ KAPAT v3 — sayım tek kartta, uyarı dolguyla** (v3:1562-1672)
  `touches:` `apps/mobile/src/screens/courier/day-close-screen.tsx`

  **Durum (30.08).** Metin ZATEN v3'tü — başlık, uyarı, üç sayaç, sayaç notu, para başlığı, fark
  notu, not başlığı ve düğme kelime kelime aynı çıktı (18.08'de yazılmıştı). Değişen iki şey biçim:

  **Üç kasa satırı tek KARTIN içine girdi** (kum çerçeve, kesikli ayraç). Sayım bir bütündür; kart
  onu "bir mutabakat" olarak çerçeveliyor. SON satırın ayracı çizilmiyor — kartın kendi kenarı 4 px
  altında zaten duruyor, ikisi üst üste gelirse kart çift çizgili görünür.

  **Uyarı çerçeveyle değil DOLGUYLA ayrışıyor** (`terracotta-bg`), başında nokta imiyle. Çerçeveli
  kutu, altındaki sayaç karolarıyla AYNI görsel ağırlıktaydı ve uyarı karoların arasında kayboluyordu.

  **BİLİNÇLİ SAPMA — fark sütunu KALDI.** v3'ün kasa satırında fark yok; ama v3'ün kendi notu "Fark
  işaretlidir: eksi = eksik teslim, artı = fazla para" diyor. Sütun sökülseydi ekranda KARŞILIĞI
  OLMAYAN bir cümle kalırdı. Sütun duruyor ve bozuk girdide "—" yazıyor (ölçülemeyen fark sıfır
  değildir, CLAUDE §1).

  **Doğrulama.** Kapanış jest **11/11** (davranış değişmedi, testler dokunulmadan geçti); typecheck ·
  lint · knip yeşil; **cihazda gözle doğrulandı** (`/day-close`, dolu veriyle).

  **Faz 3 kapandı** — kurye bölümünün beş ekranı (14–18) v3'te.

- [x] (21.153) **YERİNDE SATIŞ + FİŞ v3 — sonuç kendi sayfasında, kapıda çevrimdışı satış yok** (v3:1752-1900, 22)
  `touches:` `apps/mobile/src/screens/sale/*` · `apps/mobile/src/app/(operations)/sale/receipt.tsx` ·
  `apps/mobile/src/lib/operations/stamp.ts` · `apps/mobile/src/components/ui/icon-paths.ts`

  **Durum (30.08).** v3 satışı TEK ekran çiziyor (liste + sepet + tahsilat alt alta); bizde ikiye
  ayrı ve ayrılmasının sebebi KULLANICI KARARIDIR (26.08: "ürün listesi ve sepet aynı yerde olması
  kötü"). Tasarımın yerleşimi ALINMADI, içeriği alındı.

  **FİŞ KENDİ EKRANI OLDU** (v3:22, yeni · `/sale/receipt`). Sonuç sepet ekranında tek satırlık bir
  bildirimdi ve satış kapanınca sepet boşalıyordu: cevabı okuyan göz BOŞ bir sayfanın üstündeki
  cümleye bakıyordu, referans ve tutar da o satıra sığmıyordu. Fiş dördünü bir arada söylüyor
  (tutar · tahsilat türü · referans · damga) ve iki çıkışı var. Kasa ayarsızsa (`paymentRecorded ===
  false`) uyarı fişin İÇİNDE — yeşil bir "tamam"ın altında saklanmıyor.

  **Damga CİHAZIN saatinden**: `OnSiteSaleResponse` zaman taşımıyor; uydurma bir alan eklemek yerine
  cevabın geldiği an yazılıyor (`stampFullOf`). Fiş bir belge değil, "az önce ne oldu" sayfası.

  **ÇEVRİMDIŞI KİLİDİ** (v3:20): "Sepete ekleme kapalı" + "Satış yazma kapalı", ikisi de sebebiyle.
  Sinyal DEPONUNKİYLE AYNI (`trackWarehouse`) — yerinde satış zaten depo kapsamlı bir yazmadır;
  ikinci bir ölçüm, bir gün iki ekranın aynı hat için iki farklı şey söylemesi demekti (CLAUDE §1).

  **Dipnot** geldi: anonim satış · ödemede anında stok hareketi · pazarlık meşru ama izli.

  **Cihazda bir kusur bulundu ve düzeltildi:** onay imi daire değil KAVİSLİ KARE çıkıyordu
  (`radius.pill`, 46 dp'lik kutuda); yarıçap artık ölçüden türüyor (`avatarMd / 2`).

  **Üç uyuşmazlık yazıldı** (günlük defteri 13 · 14 · 15): son satışların PAZARLIK rozeti ve kasa
  uyarısı (`SaleRecordSchema`'da yok), barkod okutma (satış kataloğunda barkod yok), "SIK SATILANLAR"
  başlığı (uçta satış sıklığı sıralaması yok).

  **Doğrulama.** Satış jest **12/12** (üçü yeni); mobil paket **980/980**; kilit testinin YAKALADIĞI
  doğrulandı (kilit kaldırılınca kırmızı); typecheck · lint · knip yeşil; **cihazda uçtan uca**
  yapıldı (ürün → çekmece → sepet → nakit → satış → fiş → yeni satış).

- [x] (21.154) **SON SATIŞLAR v3 — satan kişi künyenin yanında, aralıksız** (v3:1902-1960)
  `touches:` `apps/mobile/src/screens/sale/{sale-history-screen.tsx,messages.json}`

  **Durum (30.08).** Üç fark: (1) satan kişi künyenin YANINA geçti ve "satan: " öneki düştü — alt
  alta yazıldığında ayrı bir bölüm gibi duruyordu, oysa ikisi de "bu kayıt neydi" sorusunun parçası;
  (2) **harf aralığı söküldü** — ad `eyebrow` aralığıyla yazılıyordu ve cihazda "D e n i z  A r s l a n"
  diye okunuyordu, oysa aralık BAŞLIK imzasıdır ve bir insan adı başlık değil veridir; (3) dipnot
  geldi ("Kim sattı" sorusunun tek cevabı bu liste).

  PAZARLIK rozeti ve "tahsilat deftere geçmedi" uyarısı YAZILMADI — ikisi de `SaleRecordSchema`'da
  yok (günlük defteri 13). Kasa uyarısı bilgi olarak kaybolmuyor: satışın FİŞİNDE duruyor (21.153).

  **Doğrulama.** Satış jest **12/12**; typecheck · lint · knip yeşil; **cihazda gözle doğrulandı**.

  **Faz 4 kapandı** — yerinde satışın üç ekranı (20 · 21 · 22) v3'te.

- [x] (21.155) **PARA v3 — günün parası en üstte, uyuşmazlık cümleyle** (v3:1962-2120)
  `touches:` `apps/mobile/src/screens/money/*` · `apps/mobile/src/lib/operations/stamp.ts` ·
  `apps/mobile/src/screens/courier/courier-format.ts`

  **Durum (30.08).** **23 · Tahsilat izleme**: v3 blokların SIRASINI değiştiriyor — muhasebenin ilk
  sorusu ("bugün ne girdi") en üste, kendi kartına çıktı; toplam KIRILIMDAN türüyor (ayrı bir toplam
  alanı, bir gün kırılımla ayrışabilecek ikinci bir gerçek olurdu). Bekleyen satırda tutar BÜYÜK,
  "KAPIDA · kart" etiketi altında — v2'de tek cümleydi ve tutar cümlenin içinde kayboluyordu.
  Üstbaşlığa "kim ve hangi gün" geldi. Kapanış cümlesi ekranın ne OLMADIĞINI söylüyor.

  **24 · Gün sonu**: CÜMLE ÖNCE, SAYI SONRA — "−4,50 €" tek başına eksiğin mi fazlanın mı olduğunu
  söylemiyordu; başlık söylüyor ve ÇÖZÜMÜN NEREDE olduğu yazılı (yoksa muhasebeci burada bir düğme
  arar). Gün başlıkta ve SUNUCUNUN söylediği gün — cihazın takviminden tahmin edilmiyor. Eşleşmemiş
  hareketin NEYLE eşleşmediği de yazılı.

  **BİR DUPLİKASYON KAPANDI:** Türkçe ay adları kurye sözlüğündeydi; para ekranı aynı listeyi düz
  yazımıyla isteyince ikinci kopya doğacaktı. Liste `lib/operations/stamp.ts`e taşındı
  (`dateLabelOf` · `todayLabel`); kuryenin `dayLabel`i oradan türüyor, büyük harfe kendi çeviriyor.

  **Üç uyuşmazlık** (günlük defteri 16 · 17 · 18): tahsilat ADEDİ, kurye kurye nakit dökümü,
  uyuşmazlığın sefer künyesi — üçü de sözleşmede yok.

  **Doğrulama.** Para jest **4/4** (v3 iddialarıyla güncellendi), kendi alanımın paketi **216/216**;
  gün adı ve fark yönü testlerinin YAKALADIĞI doğrulandı; typecheck · lint yeşil; cihazda gözle
  doğrulandı. **Dolu hâl doğrulaması BEKLİYOR**: tohumda bugün kapanan sefer, iade ve kurye üstünde
  para yok — tohumu dolduran şerit bitince ekranlar yeniden çekilecek.

- [x] (21.156) **TOHUM: OPERASYON EKRANLARININ DOLU HÂLİ** (kullanıcı isteği 30.08: "boş yerler görmek istemiyorum")
  `touches:` `scripts/seed/{orders.ts,courier.ts,notifications.ts,coverage.ts,people.ts}`

  **Durum (30.08).** Ekranlar boş değil, **YANLIŞ doluydu**: `tahsilatYaz` her tahsilatı sabit
  `gun(-1)` ile düne yazıyordu, yani para ekranı temiz bir tohumdan sonra "bugün hiç para girmedi"
  diyordu. Bugüne ait kapanmış sefer yoktu (uyuşmazlık hiç doğmuyordu), kuryenin üstünde para yoktu,
  bugünün seferinde kutulu durak yoktu, tur hesabının hiç bildirimi yoktu, `exceptions` sıfırdı.

  Tohum göreli tarihlerle düzeltildi: tahsilat günü parametrik + bugün nakit/kart/çek üç teslimat,
  bugüne İKİNCİ rota (Colmar dönmüş+kapanmış → **+8,40 € uyuşmazlık**, Strasbourg açık kalıyor),
  üç kutulu durak (biri `loadBox` ile araçta → `1/3`), hasar imhasıyla YAŞATILMIŞ eksik toplama,
  yarın iki sipariş, personel bildirimleri çoğullaştı. Yeni ZORUNLU kapsam kovaları bu hâlleri
  koruyor — **166 kovanın hepsi dolu**.

  **İKİNCİ TUR GEREKTİ:** "eksik kalem" kartı hâlâ çıkmıyordu. Kalem VARDI; ekran `awaitingAnswer`
  olanı bilerek eliyor ve tohum aynı siparişe bir talep bağlamıştı (talepler müşterinin EN YENİ
  siparişine bağlanıyor, eksik toplama bloğu da en sona konmuştu). Filtreye DOKUNULMADI, çakışma
  kaldırıldı; kova artık ekranın okuduğu motoru çağırıyor (`listOrderExceptions`), SQL'i kopyalamıyor
  — kural ikinci bir yerde yaşasaydı tam da böyle kaybolurdu.

  **Dört bölümü de gören hesap** (`hepsi@lezzetanatolia.fr` · Emre Yıldız) 21.155'te eklenmişti;
  bugünün açık Strasbourg seferi ona verildi — kurye ekranları KİMLİĞE göre okuyor, tur hesabının
  sefer ekranının dolu olmasının tek yolu buydu. **Bedeli yazılı:** Marc ile girildiğinde bugün
  kapanmış Colmar seferi görünüyor.

  **Doğrulama.** `db:refresh` iki kez koştu (kullanıcı yetkisi 30.08); kapsam **166/166**; cihazda
  dolu veriyle gezildi.

- [x] (21.157) **YÖNETİM + BİLDİRİMLER + ORTAK ZEMİN v3'e geçti** (v3:2122-2560, 00-ortak)
  `touches:` `apps/mobile/src/screens/management/*` · `apps/mobile/src/screens/operations/notifications-screen.tsx` ·
  `apps/mobile/src/components/{operations,ui}/*` · `apps/mobile/src/theme/metrics.ts` · `packages/design-tokens/src/operations-app.ts`

  **Durum (30.08).** Dört alt şeritle paralel yürütüldü (kullanıcı isteği); orkestrasyon, tasarım
  karşılaştırması ve cihaz turu ana şeritte.

  **25 Karar kutusu** koyu acil kart + karar kartları + "GÜNÜN NABZI" ızgarası. **26 · 27 · 28**
  v3 yerleşimine geçti; kararın KENDİSİ (seçenekler + "Kararı uygula") sözleşmede olmadığı için
  yazılmadı — o ekranın v3 hâli yeni bir yetenek istiyor. **29 Gün özeti** koyu ciro kartı + iki
  sütun kutucuk + içgörü kutusu. **30 Kampanya**: v3 TEKİL parti çiziyor, uç LİSTE döndürüyor —
  ekran tekile indirilmedi (N parti için N yolculuk olurdu), kart anatomisi her adaya uygulandı.
  **31 Tedarik**: kalemler karta, koyu CTA, ölçüm satırı dört gerçek sayı (`incomingQty` ilk kez
  ekranda). **32 + ortak zemin**: yığın başlığı, geri/zil kutucuğu, boş/hata blokları, sekme çubuğu
  tonu, yeni `OperationsSkeletonList`; `tab-inactive` v3 tonuna çekildi, `error-line` eklendi.

  **Şeritlerin bıraktığı dört kusur ana şeritte düzeltildi:** (1) `error-line` zaten settteydi,
  30'un ikincil düğmesi dolu `error` tonundaydı; (2) kuryenin üstündeki para tek uzun cümleydi ve
  satır sarıyordu — günün kartıyla aynı hücre diline geçti; (3) gün sonundaki "Eksi = eksik" cümlesi
  fark ARTI çıktığında ekrandaki sayıyla ÇELİŞİYORDU; (4) tedarik satırındaki "— transfer
  seçeneğinin ham verisi" bir geliştirici notuydu ve sekiz satırda tekrarlanıyordu.

  **Doğrulama.** Mobil jest **1004/1004** (127 paket) · vitest **3946/3946** · typecheck · lint ·
  knip · boundaries yeşil; **cihazda dolu veriyle gezildi** (dört sekme, kurye günü, para, gün sonu,
  karar kutusu, gün özeti, tedarik).

  **Faz 6 ve 7 kapandı — v3'ün 32 ekranının tamamı geçti.**

  **Cihaz turunun kalanı (30.08, aynı gün):** 27 · 30 · 32 de dolu veriyle gezildi ve bir kusur
  daha çıktı — bildirim künyesi **"Para · Para · 8 dk"** yazıyordu: satırın TÜRÜ ile BÖLÜMÜ aynı
  kelimeye düştüğünde ad iki kez basılıyordu. Aynı sözcüğü iki kez yazmak künyeyi bilgi değil
  gürültü yapar; iki ad çakışınca artık bir kez yazılıyor (`metaOf`), testi de fikstürdeki gerçek
  çakışma satırıyla (`label: 'Para'` · `section: 'money'`) ölçülüyor.

- [x] (21.158) **YEREL ADRESİN HOST'U CİHAZA SORULUYOR — iOS fiziksel cihazda veri gelmiyordu**
  `touches:` `apps/mobile/src/lib/env.ts` · `apps/mobile/src/lib/env.test.ts` ·
  `apps/mobile/.env.example`

  **Durum (30.08).** iOS fiziksel cihazda ürünler gelmiyor, "bağlantı yok" deniyordu — oysa API,
  Supabase ve Metro üçü de ayaktaydı. Sebep: `localhost` TELEFONUN KENDİSİDİR.

  **Gömülü değer TEK ama hedef ÜÇ** ve üçünün "yerel makine" tarifi ayrı: iOS simülatörü makinenin
  ağ yığınını paylaşır · Android fiziksel `adb reverse` köprüsünü kullanır · **iOS fiziksel cihazın
  köprüsü YOKTUR.** Üçüncüsü kapsanmıyordu.

  **İki eski çare de yetmiyordu:** `localhost` iOS fiziksel cihazı dışarıda bırakıyor; LAN IP'yi
  elle yazmak üçünü kapsıyor ama sabit bir sayıdır ve router değiştirdiği gün SESSİZCE kopuyor
  (ölçüldü 27.08: `192.168.1.161` → `.130`). 27.08'de `localhost`a dönülmüştü — arıza takas
  edilmişti, çözülmemişti.

  **Çözüm host'u seçmemek:** cihaz Metro'ya zaten bir adresten bağlandı ve Expo onu `hostUri` ile
  söylüyor (`expo-constants` 57.0.9). Her hedef kendi doğru host'unu kendisi getiriyor; sabit sayı
  olmadığı için IP değişimi de bir şey kırmıyor. **`.env` DEĞİŞMEDİ**, `adb reverse` köprüsü
  bozulmadı.

  **İki savunma:** `__DEV__` kapısı (üretimde cihaz bilgisi hiç okunmaz — yoksa müşterinin telefonu
  bizim geliştirme makinemizi arardı) ve yalnız `localhost`/`127.0.0.1` çevrilmesi (gerçek alan
  adına bakan bir geliştirme derlemesi sessizce makineye yönlendirilmez).

  **`URL` KULLANILMADI, ölçülerek:** React Native'in `URL`i eksik bir polyfill — `hostname` ataması
  sessizce işlemiyor. Testte yakalandı; cihazda da işlemezdi ve düzeltme "yazıldı ama çalışmıyor"
  hâlinde kalırdı.

  **Doğrulama.** 8 birim testi; `__DEV__` kapısı kaldırılınca ilgili test kırmızıya döndü.
  `src/lib` jest paketi **119/119**, lint + typecheck temiz. Cihazda doğrulandı: ürünler geliyor.
- [x] (21.159) **PARA TUŞ TAKIMI + KUTU KAPISININ KİLİDİ** (v3 · `00-ortak`, 17, 18)
  `touches:` `apps/mobile/src/components/operations/{amount-keypad.tsx,keypad-value.ts}` ·
  `apps/mobile/src/screens/courier/{delivery-screen.tsx,day-close-screen.tsx}` · `scripts/design-shot.mjs`

  **Durum (30.08).** Kullanıcı cihazda ekranların tasarımdan farklı olduğunu söyledi. Sebep ölçüldü
  ve YÖNTEMDİ: tasarım HTML'i DÜZ METNE indirgenip cümleler eşleştiriliyordu, o ayıklama da tam
  ihtiyacımız olanı atıyordu — hangi alanın neye dokunduğunu. Gün sonu ekranının kasa alanlarında
  `onClick="{{ kpOpen.nakit }}"` yazıyordu; metin eşleşti, dokunuş görülmedi.

  **TUŞ TAKIMI** (`OperationsAmountKeypad`): tutar cihaz klavyesiyle yazılmaz. Tasarımın kendi
  cümlesi: *"Cihaz klavyesi açılmaz — eldivenle de basılabilecek büyük tuşlar."* Kapıda telefon
  eldivenle tutuluyor ve sistem klavyesi ekranın yarısını kaplayıp "beklenen"i görüş alanından
  çıkarıyordu. "Beklenen" bir etiket değil, dokunulunca alana geçen bir TUŞ. Saf kural ayrı dosyada
  ve testli (`keypad-value.ts`): ilk rakam mevcut tutarı EZER, ikinci virgül yok, kuruş iki hane.

  **KİLİT KODA GERİ KONDU:** tasarım kanıt ve tahsilat adımlarını kutular okutulana kadar kilitliyor.
  Kodu ölçüp kilidin yalnız teslim düğmesinde olduğunu görmüş ve CÜMLEYİ KODA UYDURMUŞTUM — tersi
  doğruydu. Kilitli bölüm gizlenmiyor, SOLUYOR: gizlemek "bu durakta kanıt istenmiyor" dedirtirdi.

  **`scripts/design-shot.mjs`:** tasarım ekranlarını Playwright ile resme çevirir. Karşılaştırma
  artık hafızada değil, iki resim arasında.

  **Doğrulama.** Kurye jest 89/89, tuş takımının saf kuralı 12/12; cihazda gözle doğrulandı.

- [~] (21.160) **DEPO MODÜLÜ v3 DENETİMİ — tek elden, ekran ekran** (kullanıcı kararı 30.08)
  `touches:` `apps/mobile/src/screens/warehouse/*` · `apps/mobile/src/lib/operations/sections.ts` ·
  `apps/mobile/src/components/ui/form-scroll.tsx` · `apps/mobile/src/theme/metrics.ts`

  **Durum (30.08).** Kullanıcı cihazda birçok ekranın tasarımdan farklı olduğunu söyledi; ölçtüm,
  haklıydı. Yöntem değişti: tasarım artık düz metne indirgenmiyor, **resme** çevriliyor
  (`scripts/design-shot.mjs`) ve cihaz görüntüsüyle YAN YANA okunuyor. Ajanlar durduruldu — bir
  bölüm bitene kadar tek elden çalışılıyor.

  **Kapatılanlar:** sekme sırası tasarıma çekildi (Depo başta) · hub kutucukları **eşit boyda**
  (`minHeight` → sabit `height`, alt metin iki satıra kırpılıyor; kullanıcı iki kez söyledi) ·
  yakın-SKT satırları **karta** döndü ve kararın tonunu taşıyor (imhalık kırmızı zeminli, kararsız
  kesikli) · mal kabul listesinde ikon kare zeminine, "SKT gerekli" terracottaya, plansız kabul
  satırı zeytin kesikliye geçti · **aşağı çekince yenile** hub'a ve bekleyen sevkiyat listesine
  bağlandı.

  **Yenileme FORMDA YOK ve olmamalı:** kabul formu bir kez okunuyor; tazeleme depocunun yazdığı
  adetleri sessizce silerdi. Çekme kendi bayrağını kullanıyor (`reloading`), `status` DEĞİL — o
  listeyi söküp yükleme hâline geçirirdi.

  **Ajanların yarım bıraktığı 36 test kapatıldı:** sözleşmeye eklenen alanlar (`mlorPercent`,
  `status`, `sku`, `dateType`, `shelfLifeDays`) fikstürlere işlendi ve testin yerel tip kopyası
  **şemadan türetildi** — kopya bayatlayınca jest geçiyor, `tsc` kırılıyordu.

  **MAL KABUL BİTTİ (30.08).** 04 liste · 05 form · 06 siparişsiz ve alt akışları (koli okutma,
  ürün arama, kod eşleme, fark özeti, kısmi kabul) cihazda uçtan uca geçildi.

  · **Satır kartı ve kapalı hâl:** sayılmamış satırda alan yok, sağda kesikli "say →". Altı kalemlik
    sipariş üç ekrandan bir ekrana indi. Düğme satırı AÇAR, adedi YAZMAZ — otomatik doldurma
    "saydım" ile "dokundum"u aynı kayda düşürürdü.
  · **SKT seçici** (`OperationsDateSheet`): üç sütun + hızlı çipler. "31 Şubat" artık yakalanmıyor,
    DOĞMUYOR. İlk çip ürünün raf ömründen türer; bilinmiyorsa çizilmez.
  · **İki cihaz arızası kapandı:** (1) siparişsiz kabul bir önceki siparişin satırlarıyla açılıyordu
    (ekran aynı rota olduğu için yeniden kurulmuyor; plansız dal artık temizliyor); (2) okutma
    çekmecesinde ad ve künye FOTOĞRAFIN ÜSTÜNE yazılıyordu ve ürün fotoğrafları beyaz stüdyo
    çekimi olduğu için "1 koli = 24 adet" okunmuyordu — metin fotoğrafın altına indi.
  · **Aşağı çekince yenile** bekleyen sevkiyat listesinde; FORMDA bilerek YOK (yazılan adetleri
    silerdi).

  **Sözleşme istediği için yazılamayanlar** (`v3-tasarim-veri-modeli-notlari.md` bölüm 2): satır
  başına **hasarlı paket sayısı** (bugün yalnız siparişin tamamına serbest not), **lot adayları**
  (okutma yanıtı lot taşımıyor), **ürünün kutu tipleri** (elle "kaç koli geldi" sayımı için).


- [~] (21.161) **OPERASYON KONTROL KİTİ — ölçüm tasarımdan, komponent tek yerden** (kullanıcı kararı 30.08)
  `touches:` `apps/mobile/src/components/operations/{surface,icon-button,sticky-bar}.tsx` ·
  `apps/mobile/src/components/ui/{primary-button,secondary-button,text-field}.tsx` ·
  `packages/design-tokens/src/operations-app.ts` · `apps/mobile/src/theme/metrics.ts` ·
  `packages/types/src/contracts/warehouse-api.schema.ts` ·
  `packages/application/src/warehouse/variant-search.ts` · `apps/mobile-api/src/api/v1/warehouse.ts` ·
  `apps/mobile/src/screens/warehouse/{warehouse-hub,intake}-screen.tsx`

  **Niçin.** Kullanıcı sordu: *"merkezi komponentler oluşturup onları kullanmadık mı? Her gördüğünüz
  yerde yeniden input mu tasarladık?"* Ölçtüm — haklıydı. Kit VAR (`components/ui/`) ve müşteri
  yüzeyi tutarlı tüketiyor (`TextField` 18 dosya · `PrimaryButton` 35 · `SecondaryButton` 11), ama
  **operasyon yüzeyinin 28 ekranının 0'ı** düğme kitini kullanmıyordu. Sonuç: 5 ham `<TextInput>`
  **dört ayrı reçeteyle** (kenarlık `ink` / `sand-500`, yazı 400 / **700**), **23** elle yazılmış
  düğme stil bloğu, **41** elle çizilmiş kart yüzeyi, **34** ikon düğmesi yeri.

  **Sebep yöntemdi, tembellik değil:** tasarım dosyasının kendisinde komponent katmanı YOK — 243
  tıklanır öğenin hepsi satır içi stil, **89 farklı imza**. Ekranlar tek tek birebir çevrildi ve
  tasarımdaki tekrar olduğu gibi koda geçti; ortak reçeteyi çıkarma turu hiç yapılmadı.

  **İki yüzey AYNI DİLDE — ölçüldü, bu yüzden ikinci bir kit AÇILMADI.** Müşteri mobil v3 ile
  operasyon mobil v3: aynı yazı çifti (Karla + Lora), aynı zeytin `#5f7a2c`, aynı `1.5px` çerçeve
  dilbilgisi, aynı 52 dp düğme boyu; renk katmanında **51 ortak durağın yalnız 2'sinin** değeri
  farklı (`cream`, `olive-bg`). Fark dil değil **yoğunluk**: girdi 48–50 dp / dolgu 14 / 12,5–13 px
  (müşteri 54 / 22 / 15). O yüzden fark PROP oldu — `tone` · `elevation` · `icon` · `density`.

  **v3 SERT GÖLGEYİ BIRAKMIŞ (ölçüm).** `box-shadow` sayımı: müşteri v3'te `3px 3px 0` **26**,
  operasyon **v2**'de **3**, operasyon **v3**'te **0**. Gölge rengi #b8b09a de v1/v2'de var, v3'te
  yok. v3'ün tek gölge benzeri şeyi `0 4px 14px` zeytin ışıması ve **dördünün dördü de** zeytin
  dolgulu OKUTMA düğmesinde. ~~O yüzden `OperationsStickyBar`ın `glow` bayrağında, düğmede
  değil.~~ **Bu okuma YANLIŞTI ve düzeltildi (kurye şeridinin ölçümü, doğrulandı 30.08):** dört
  düğmenin ebeveyni tarandı, dördü de sayfa AKIŞINDA ve o dosyalarda `position:sticky` hiç
  geçmiyor — yani ışıma çubuğa bağlıyken **ulaşılamaz** bir yerdeydi ve kurye kite geçirdiği
  okutma düğmesine veremedi. Ortak yan konum değil ROL: ışıma zeytin okutma düğmesinin kendi
  imzası. Artık `PrimaryButton elevation="glow"`; çubuğun `glow` prop'u söküldü (hiçbir çağıran
  vermiyordu). `shadow['hard-on-ink']` artık `@deprecated`; BEKLEYEN(21.161) son tüketici gidince
  silinecek. **Depo alanında sert gölge SIFIRLANDI** (kapanış turu 30.08 — altı yer: dört ekranın
  `ctaReady`si + kitin `amount-keypad`/`date-sheet` onay düğmeleri); token'ın kalan dört tüketicisi
  `screens/sale/*` ve `screens/management/supply-suggestion-screen.tsx`, o şeritlerde.

  **`OperationsSurface`in altı tonu tahminle değil SAYIMLA belirlendi** — `panel` (30+) ·
  **`quiet`** (krem zemin 37, sessiz kenarla 21) · `card` · `ink` · `invite` (kesikli zeytin) ·
  `blank` (kesikli kum). `quiet`i kaçırmak pahalıydı: hub'ın yazıcı şeridi dolgulu kumla
  çiziliyordu, yani ızgaranın kutucuklarından yüksek sesle (kullanıcı cihazda gördü).

  **İlk tüketiciler — kullanıcının cihazda bıraktığı dört not:** hub'ın "tüm kuyruğu aç" satırı
  (gri dipnottan zeytin eylem cümlesine) · yazıcı şeridi (`quiet`) · mal kabulün okutma/arama
  düğmeleri (ayırt edilemiyorlardı; artık zeytin çerçeve + ikon ⟷ kum çerçeve) · arama çekmecesi
  (sabit boy + tasarımın satırı).

  **Sözleşme genişledi:** `VariantSearchRowSchema.stockQty` — tasarımın satır künyesi
  *"GAZ-7120 · stok 24"* diyor ve o sayı kayıtta yoktu. **Personelin kendi deposundan** okunuyor
  (`listAvailableAcross`, rezervasyon düşülmüş); depo-üstü toplam yazılsaydı başka deponun malı
  burada varmış gibi görünürdü. Uç artık `warehouseId` geçiriyor; testi de ölçüyor.

  **İkinci tur (30.08 · şeritlerin ölçümleri kite döndü).** Kit yazıldıktan sonra öteki şeritler
  onu kullanmayı deneyince üç eksik ve bir yanlış çıktı; dördü de kapandı:

  · **`SecondaryButton grow`** — kurye kit turunda bu düğmeyi HİÇ kullanamamış ve sebebi tekti:
    onu hak eden iki yer de yan yana esneyen satır, `PressableSurface`ın `grow`u dışarı açılmıyordu.
  · **`PrimaryButton elevation="glow"`** — yukarıdaki ışıma düzeltmesi.
  · **`OperationsDashedFrame`** — kesikli çerçeve cihazda **~1:10** çiziliyordu (tasarım ~1:1);
    840 px'lik kenarda yalnız 9 kesik, yani çerçeve kesikli değil NOKTALI görünüyordu. RN'in
    `borderStyle: 'dashed'`i desen parametresi almıyor. Çare ayraçla aynı (21.170): desen SVG'den
    ve **tek yerden** — `DASH_PATTERN` artık `dashed-rule`dan dışa açık, `Surface`ın `invite`/
    `blank` tonlarının ikisi de onu okuyor. Çerçeve mutlak konumda bir ÖRTÜ; kabın kenarlığı
    saydam olarak duruyor ki yerleşim kaymasın.
  · **`PrimaryButton badge` AÇILMADI** ve gerekçesi yazıldı: tek kullanımı var, düğmenin içine
    üçüncü bir yuva açmak kitin "etiket + ikon" sözleşmesini genişletirdi. İkinci kullanım
    çıktığı gün duplikasyon olur ve karar kendiliğinden verilir.

  **Kalan:** 27 operasyon ekranı kite bağlanacak — **tek turda değil**, her şerit kendi ekranını
  sırası geldikçe taşır (koordinasyon defteri, 30.08: 26 dosyalık tek tur, paylaşılan dosyada
  başkasının satırını commit'leme riskinin 26 katı).

- [x] (21.162) **SEFER KÜNYESİNDE ARACIN ADI VE ROTA ZİNCİRİ** (v3 uyuşmazlık #12 kapandı)
  `touches:` `packages/types/src/contracts/courier-api.schema.ts` ·
  `packages/application/src/courier/{vehicle-label.ts,day.ts,routes.ts,day-close.ts}` ·
  `apps/mobile/src/screens/courier/{trip-screen.tsx,use-courier-day.hook.ts,courier-fixture.ts}`

  **Durum (30.08).** Sefer künyesi ekranı aracın künyesinin **ulaşmadığını yazıyordu** — sözleşme
  yalnız `vehicleId` taşıyordu. Kurye rampada bir uuid'den hangi aracın önüne gideceğini çıkaramaz;
  kimliğin yanında AD durmalı.

  **Yeni kod yazılmadı, kural PAYLAŞTIRILDI.** Aynı soruyu rota SEÇİM listesi zaten cevaplıyordu
  (`vehicleLabelsOf` — ad varsa ad, yoksa plaka). Kopyalamak yerine `courier/vehicle-label.ts`e
  taşındı; iki kapı da oradan okuyor. İki yere ayrı yazılsaydı bir gün birinde `label`, ötekinde
  plaka tercih edilir ve **aynı araç iki ekranda iki isimle** görünürdü (CLAUDE §1).

  **`vehicleLabel` künyenin kendisinde, `warehouseName` yalnız günün seferinde.** Rota seçim
  listesinde depo adı ROTA düzeyinde zaten var ve seferi olmayan rotada da bulunması gerekiyor;
  künyeye konsaydı o yanıtta aynı değer iki kez taşınırdı.

  **Derleyici gerçek bir boşluk yakaladı:** ekran, sefer başlatıldığı anda günün seferini
  BAŞLATMA cevabının künyesiyle yazıyor (`setRun(openedRun)`). İki cevabın şekli ayrışsaydı kurye,
  seferi başlattıktan sonra bir sonraki okumaya kadar deposunu göremezdi — **ve o boşluk hiçbir
  yerde hata vermezdi.** Çözüm tek şema: `CourierRunDetailSchema`, iki cevap da onu döner.

  **Ekranda bir tekrar söküldü:** `runLabel` rota adı + referansı birleştiriyor ("Kuzey rotası ·
  SF-26-…") ve zincir satırı gelince aynı ad kartta iki kez görünüyordu. Bu kartın başlığı
  referansa indi; `runLabel` paylaşılan yardımcı olarak öteki ekranlarda aynen duruyor.

  **Üç hâl üç cümle:** ad varsa ad · araç yoksa "atanmamış" (araç kaydı zorunlu değil, bu bir
  eksik değil) · depo adı okunamazsa sebebi (uydurma bir ad kuryeyi yanlış rampaya gönderirdi).

  **Doğrulama.** 5 entegrasyon (ad/plaka/araçsız/depo adı/başlatma cevabı) + 4 ekran testi.
  Kurye jest **92/92**.

- [x] (21.163) **PARA v3 — İKİNCİ TUR: metin geçmişti, ANATOMİ geçmemişti** (v3:1949-2067)
  `touches:` `apps/mobile/src/screens/money/{money-screen.tsx,day-end-screen.tsx,messages.json,money-screens.test.tsx}` ·
  `apps/mobile/src/app/(operations)/(sections)/money.tsx`

  **Durum (30.08).** 21.155 para ekranlarını v3'e geçirdi ve metni doğru taşıdı; kullanıcı cihazda
  baktı ve *"bayağı bir farklılık var"* dedi. Tasarım token düzeyinde yeniden ölçüldü — **13 yapısal
  fark** çıktı. Kök sebep 21.155'in kendi kaydında zaten yazılıydı: karşılaştırma METİN üzerinden
  yapılmış, kutular üzerinden değil.

  **23 · Tahsilat izleme — 8 fark kapandı.**
  · **Günün parası KOYU kart** (`ink` + `h1-sm` krem rakam) — açık `panel` çizilmişti. Ekranın ilk
    sorusu ("bugün ne girdi") sayfanın öteki kutularıyla aynı sesle konuşamaz.
  · Yöntem hücreleri koyu kartın İÇİNDE, `on-ink-line` ayracın altında; **çek amber**
    (`on-ink-warn`) — çek bir durumdur, elde duran henüz tahsil edilmemiş kâğıt.
  · **Bekleyen tahsilatlar KART** (`OperationsSurface` `panel`), kesikli liste satırı değil.
  · Satır kimliği **referans · müşteri tek satırda**; ayrı satırlardayken kart iki başlıklı duruyordu.
  · Bekleyen etiketi **terracotta** — o para henüz kasada değil.
  · Kuryenin üstündeki para **uyarı tonlu** (`warning-line` kenar + terracotta tutar); nötr kartta
    "gelmiş" gibi okunuyordu. Sözleşme tek toplam taşıdığı için (uyuşmazlık 17) künye satırı
    **yöntem dökümüne** düştü: aynı sayı, uydurulan kurye adı yok.
  · **Hesap bakiyeleri tek kartın içinde**, kesikli ayraçlarla — çıplak satırlar sayfaya dağılıyordu.
  · **Dipnot TEK ve `tab-inactive`**: dört ayrı not vardı, üçü tasarımda hiç yok.
  · Ayrıca **"gün sonu →" başlıktan çıktı**, BEKLEYEN TAHSİLATLAR başlığının yanına geçti — eylem
    götürdüğü listenin yanında durur.

  **24 · Gün sonu — 5 fark kapandı.**
  · Üç özet satırı **tek kartın içinde**.
  · Uyuşmazlık kenarı **`error-line`** (#e0b9b2), `terracotta` (#b05c2e) DEĞİL: dolu terracotta
    kutuyu uyarı bandına çeviriyordu. v3'ün kalıbı açık zemin + açık renkli kenar + koyu aile metni.
  · Fark tutarı **başlığın hizasında sağda** (`body-sm`); altta 22 punto ayrı satırdaydı ve cümleyle
    sayı iki ayrı olay gibi okunuyordu.
  · Çözüm cümlesi hata ailesinin renginde — gri yazıldığında kartın dipnotu gibi duruyordu.
  · Eşleşmemiş hareket **`neutral-bg` dolgulu kutu**, sayısı `card-title` Lora.

  **Sayfa kenarı 22 → 20 (`6xl` → `5xl`)** iki ekranda da; `stack-header`ın v3 ölçümü aynı yöne
  bakıyordu, para ekranları o turda atlanmıştı.

  **Ortak karara uyum:** ilk yük `ActivityIndicator`dan **`OperationsSkeletonList`e** çevrildi
  (koordinasyon defteri, 30.08 — *"halka yerleşim tutmaz, söndüğü an sayfa zıplar"*). Ölçüler
  ekranın kendi bloklarının: 146/60/60 ve 126/96/64.

  **Kitin ilk para kullanımı:** `OperationsSurface` beş yerde çağrıldı; kart deseni üç yerde elle
  çizilmişti (`todayCard` · `floatCard` · `discrepancy`), artık hiçbirinde yazılmıyor.

  **Deftere üç girdi bırakıldı** (ortak alan, tek başıma girmedim): koyu yüzeyin ikinci grisi
  `#8f9aa2` token'sız (12 kullanım, Δ21/5/19 — eşiğin üstünde) · bölüm kökü başlığı v3'te 27px,
  `section-header` 24 yazıyor (altı ekranda birden) · `operations-shell.test.tsx:78` zaman aşımıyla
  düşüyor ve para ekranlarına dokunmuyor.

  **Doğrulama.** Para jest **8/8** (ikisi yeni: kurye float toplamı + dökümü, sıfır çekin dökümde
  hiç geçmemesi) · `typecheck` kendi kapsamımda temiz · `eslint` temiz. **Cihaz turu YAPILAMADI** —
  simülatör açık değil (`ui:shot:mobile` ön şartı ölçtü ve söyledi); açıldığında iki ekran çekilecek.


- [~] (21.164) **YÖNETİM MODÜLÜ v3 DENETİMİ — kartlar sayaç değil İŞ söylüyor** (v3:2069-2386)
  `touches:` `apps/mobile/src/screens/management/*` · `packages/types/src/contracts/management-api.schema.ts` ·
  `packages/application/src/management/{hub,exceptions}.ts` · `packages/application/src/ticket/staff-read.ts`

  **Durum (30.08).** Yönetim şeridi açıldı (koordinasyon defteri, alan tablosu). Yöntem depo
  denetiminin yöntemi: tasarım `design:shot` ile resme çevrilip cihaz görüntüsüyle YAN YANA okunuyor.

  **Kullanıcının cihazda gördüğü (N11):** karar kutusunun kartları tasarımla uyuşmuyordu. Ölçüm
  sözleşmede çıktı — kuyruk yalnız SAYAÇ taşıyor: `shortLineCount` var ürün adı yok, tekliflerde ve
  tedarikte tek sayı. Üçünün de verisi motorda vardı, zarfa taşınmamıştı.

  · **Şikâyet kartı** artık şikâyetin KENDİ cümlesini yazıyor (`preview` — kuyruk ekranıyla aynı iki
    kural: `resolveUserText` + `previewOf`, ikincisi bu iş için dışa açıldı, ikinci bir kırpma kuralı
    yazılmadı). Künye satırı da düzeldi: kuyruk dört türü birden taşıyor ve üstteki kayıt çoğu gün bir
    SORU'yken kart ona "şikâyet" diyordu — artık türü yazıyor ("soru · 5 açık talep").
  · **Eksik kalem kartı** ürünü ve eksik adedi yazıyor (`lineTitle` · `missingQty`); aynı siparişteki
    öteki kalemler başlığın kuyruğunda, öteki siparişler künye satırında ("+1 sipariş").
  · **Yakın-SKT kartı** partinin adını, adedini ve oranı yazıyor; alt satırda kalan ömür. **Negatif
    gün "süresi geçti" DEĞİL** — kuyruğa yalnız `can_offer` giriyor, yani tarihi geçmiş tek küme
    DDM'si geçmiş SATILABİLİR partiler; imhalık parti zaten aday değil (`offerDecisionOf`).
  · **Tedarik kartı** tedarikçinin adını ve kalem sayısını yazıyor (en kalabalık eşlenmiş grup).
  · Kararın sayısı ve künyesi **aynı motordan**: aday sayımı artık `toBatchViews`ten okunuyor
    (teklif ekranının okuduğu görünüm), kutu ile ekran ayrışamaz.

  **Ayrıca bu turda (ölçüm → düzeltme):**
  · **Sert gölge 5 yerde söküldü** (`shadow.hard` ×4 · `hard-on-ink` ×1) — v3'te sert gölge YOK
    (depo şeridinin ölçümü); `BEKLEYEN(21.161)`in yönetim payı kapandı.
  · **İlk yük iskelete geçti** (N9): beş liste ekranı `OperationsSkeletonList`. Kampanya ekranında
    cihazda ölçüldü — 8 saniye BOŞ sayfa + minik halka; ekran "veri yok" ile "veri geliyor"u aynı
    biçimde gösteriyordu. Yazışma ekranlarında (26 · 28) bilerek halka kaldı: iskelet bir LİSTE
    kalıbıdır, baloncuğun ne genişliği ne sayısı önceden bilinir.
  · **Aşağı çekince yenile** karar kutusu · gün özeti · kampanya · tedarikte; çekme kendi bayrağını
    kullanıyor (`reloading`), `status` DEĞİL — o kartları söküp iskelete çevirirdi.
  · **Halkanın rengi** gelen kutusunda `pullRefreshColors`a bağlandı: yalnız `tintColor` verilen
    ekran Android'de sistemin SİYAHINI çiziyordu (helper künyesi, ölçüm 10.08).
  · **Ekrandaki iki geliştirici cümlesi düzeldi:** eksik toplama dipnotu kullanıcıya doküman kimliği
    gösteriyordu ("… netleşir **(07.8)**"), gün özetinin boş içgörü bloğu "motor bağlandığında bu
    blok dolacak" diyordu.

  **Sonraki turlar (30.08, aynı gün — sırayla).**

  · **Kit geçişi tamam** (`f9c404ac`): altı ekranın kart kabuğu `OperationsSurface`e geçti, elle
    kart kalmadı. Görsel olarak tek gerçek değişiklik eksik kalem kartının kenarıydı
    (`sand-500` → kitin `sand-300`'ü) — kart artık kuyruğun ötekileriyle aynı sesle konuşuyor.
  · **N10 tamam** (`b52ef8d1` + `a248728e`): talep ekranı sosyal mesajlaşma dilini aldı. İki ekran
    tek baloncuktan çiziliyor (`chat-bubble.tsx` → `ManagementChatBubble`: künye baloncuğun DIŞINDA,
    bizim söz koyu, kuyruk köşesi sivri) ve **YZ taslağı yazışmanın içinden çıkıp cevap kutusunun
    ÜSTÜNE taşındı** — taslak bir mesaj değil, bir tekliftir. `social-conversation-screen` 601 → 547
    satıra indi (11 ölü stil silindi), "bölünmeli" listesinden düştü.
  · **Talep bölümü brief'i yazıldı** (`22133968` — N12): kullanıcı *"sosyal gelen kutusu gibi bir
    talep bölümü"* istedi; ölçüm v3'ün yalnız TEK talebi gösteren bir ekran çizdiğini, taleplerin
    LİSTESİNİN tasarımda hiç olmadığını gösterdi. `design/pages/app-yonetim-talep.md` (kuyruk +
    talep ekranı · yedi satır işareti · hangi aksiyon motorda hazır hangisi mobil uçta yok).
  · **30 "Kampanya" bizim teklif onayı ekranımızın tasarımıymış** (`a3b85959`): görsel defterinin
    haritasında iki satır birden yanlıştı ("karşılığı belirsiz" + "tasarımda yok") ve ekran bu
    yüzden **hiç denetlenmemişti**. Denetlenince tek alanlık açık çıktı — tasarım "Kalan ömür
    2 gün · **%18**" yazıyor, biz yalnız günü yazıyorduk; yüzde motorda hesaplıydı
    (`BatchView.remainingPercent`), zarfa konmamıştı. Aynı satırdaki "süresi geçti" de "tavsiye
    tarihi geçti" oldu (karar kutusunda düzeltilmişti, ekran geride kalmıştı).

  **Doğrulama.** Yönetim jest **76/76** · `pnpm typecheck` **tüm depoda yeşil** · `pnpm test:unit`
  **1860/1860** · `eslint` dokunduğum yollarda temiz. **Cihazda görüldü** (OPPO, yönetim + hepsi
  hesabı): üç kart künyesiyle çizildi. **Eksik kalem kartı cihazda doğrulanamadı** — tur sırasında
  kuyruktaki tek istisna "Müşteriye sor" ile tüketildi ve alan boşaldı (ekran da "karar bekleyen
  eksik yok" diyor); kart birim testiyle örtülü.

  **Bir commit'im kırıktı, kapatıldı** (`a248728e`): `b52ef8d1` iki ekranı yolla commit'ledi ama
  ikisinin de import ettiği YENİ `chat-bubble.tsx` pathspec'te yoktu. Çalışma ağacında durduğu için
  hiçbir doğrulama görmedi (typecheck de test de diskteki dosyayı okur); o commit'i çeken çözülemeyen
  bir import alırdı. CLAUDE §0'ın yol-adı kuralının öteki yarısı: pathspec dosyayı korur ama listeye
  yazılmayan dosyayı da dışarıda bırakır.

  **Kalan — çoklu ajan turu kapanırken açık bırakılanlar, üçü de bir kayda bağlı:**
  · **26–31 ekran ekran tasarım denetimi** yarım: yalnız **25** ölçülü bir turdan geçti (altı fark:
    ikisi kodda düzeldi, üçü veri/bilinçli, biri ortak zemin) ve ikinci çekimi gelmedi; **26**
    çekildi ve *kapsam farkı* çıktı (iş tasarımda); **30** cihazsız ölçüldü ve düzeltildi;
    **27 · 28 · 29 · 31** hiç yan yana görülmedi. `BEKLEYEN(BACKLOG §5)`.
  · **Talep bölümü** tasarım cevabını bekliyor; geldiğinde mobil sözleşme işi var (kuyruk ucu +
    süzgeçler + durum/mod/iade uçları). `BEKLEYEN(BACKLOG §5)`.
  · **Yazı boyutu ayarı** yönetimin 9 dosyasında da işlemiyor (statik `operationsTheme` içe aktarımı
    `updateTheme`i görmez). Payımı ÇEVİRMEDİM: kurye şeridi kalıbı denedi, tsc 8 hata verdi ve
    daraltmanın çalışma zamanı davranışı doğrulanamadı — kalıp kararı tema sahibinde.
    `BEKLEYEN(BACKLOG §5)`.

  **Yapılmayan iki yetenek — bilinçli, ikisi de sözleşme eksiği:** taslağı REDDETME (uç yok; ekran
  düğmeyi çizmiyor ve bunu bir test koruyor — hiçbir şey yapmayan düğme operatöre "reddettim"
  dedirtip taslağı yerinde bırakırdı) ve şikâyet KARARI ("jest · iade · yeniden gönderim" üç kapı
  ister, üçü de yok). İkincisi talep tasarımıyla birlikte yeniden ele alınacak.

- [x] (21.165) **KURYE ANA EKRANI v3 ANATOMİSİNE OTURDU** (v3:14 · cihazda karşılaştırıldı)
  `touches:` `apps/mobile/src/screens/courier/{courier-day-screen.tsx,messages.json}`

  **Durum (30.08).** Kullanıcı cihazda *"bol miktarda uyuşmazlık"* bildirdi. Android cihazdan
  `adb exec-out screencap` ile görüntü alındı ve tasarımın 14. ekranıyla **yan yana ölçüldü** —
  dokuz fark çıktı, beşi bu turda kapandı.

  **Özet kartı KOYU.** Açık kartla çizilmişti ve o hâlde sayfadaki her kutuyla aynı ağırlıktaydı:
  günün ilerlemesi, sefer kapısı ve satış daveti eşit sesle konuşuyordu. Tasarım kuryenin ilk
  bakışını oraya çekiyor. Çerçeve yok — koyu yüzey kendi kenarıdır. Tahsilat cümlesi kartın içinde
  kendi şeridinde (`ink-inset`), düz metinken alt kenara yapışık bir dipnot gibi okunuyordu.

  **Tamamlanan sayı KAHRAMAN:** "3" büyük, "/5 durak" küçük. Tek puntoda kuryenin gözü hangi
  sayının kendi ilerlemesi olduğunu ayırt edemiyordu.

  **Sefer ve satış satırları İKONLU KART ve AYNI anatomi** (`GateRow`): kare ikon · başlık · alt
  metin · yön oku. Satış satırı **en üstteydi**, başlık + çerçeveli düğme olarak — akışın parçası
  görünmüyordu; şimdi tasarımdaki yerinde, sefer satırının hemen altında. İkisini ayrı yazmak
  birinin bir gün ötekinden ayrılmasıydı (CLAUDE §1). Rota seçimi gövdesinde de çiziliyor —
  satışın şartı sefer değil ARAÇ (21.119 kuralı korundu).

  **Duraklar KENDİ KARTINDA**, numara dairesi kartın dışında, yön oku kartın sağ kenarında.
  Kesikli çizgiyle ayrılmış düz satırlar listeyi bir döküme çeviriyordu. Teslim edilen durakta
  kart çizilmiyor: iş bitti, geriye kayıt kaldı.

  **Ölçüm bir "uyuşmazlığı" ÇÜRÜTTÜ:** bağlam satırındaki "Strasbourg Merkez" fazladan bir depo
  adı değil, tohumun ROTA adı (`runLabel` = rota · referans). Tasarım maketinde rota adı yok, o
  kadar. **Yüzen ⚙ düğmesi de bizim değil** — depo ekranında da görünüyor, cihazın kendi katmanı.

  **Kalan iki fark kullanıcı kararı bekliyor:** tasarımda olmayan zil (bildirim) ikonu, ve alt
  navigasyondaki "Yönetim" ikonu (tasarım ☑, kod 💬) — ikisi de ortak zeminde.

  **Doğrulama.** Kurye jest **93/93**; her adımdan sonra cihazdan görüntü alınıp tasarımla
  karşılaştırıldı (üç tur).

- [x] (21.166) **PARA SÖZLEŞMESİ GENİŞLEDİ — adet · para kimde · uyuşmazlığın künyesi** (v3 uyuşmazlık #16·17·18 kapandı)
  `touches:` `packages/types/src/contracts/money-api.schema.ts` ·
  `packages/application/src/accounting/money.ts` · `apps/mobile-api/src/api/v1/money.test.ts` ·
  `apps/mobile/src/screens/money/*` · `apps/mobile/src/lib/operations/stamp.ts`

  **Durum (30.08).** Kullanıcı 21.163'ün sonucuna cihazda baktı ve üç eksik saydı: siyah kartta
  tahsilat sayısı yok · kuryenin üstündeki para kartı tasarımdaki gibi değil · hesap bakiyeleri
  farklı. Üçü de **uyuşmazlık defterine "sözleşmede alan yok" diye yazılmıştı** — yani kayıt
  doğruydu ama karar yanlıştı: alan yoksa açılır, ekran kırpılmaz.

  **Ölçüm önce: veri zaten defterdeydi, eksik olan ZARFTI.**
  · adet → `paymentMovements.length` (motor onu zaten okuyor, sayısını atıyordu)
  · kurye künyesi → `delivery_run.referenceNo` + `courierId`, profil adı bekleyen satırların
    okuduğu aynı kapıdan
  · uyuşmazlığın künyesi → `delivery_run_close.closedAt` + seferin kendisi
  Yani üç maddenin hiçbiri yeni bir tablo ya da migration istemedi.

  **Sözleşme (3 alan).**
  · `MoneyOverview.todayCount` — adet tutardan TÜREMEZ: aynı 1.286,50 € iki tahsilattan da kırktan
    da gelebilir ve "gün yoğun muydu" sorusunun cevabı adettedir. Sayılan şey deftere düşen
    HAREKETTİR (bir sipariş iki taksitle ödendiyse defterde iki kayıt vardır).
  · `MoneyOverview.courierFloat` → **`CourierFloatRow[]`** (sefer + kurye adı + üç tutar). Tek
    toplam, muhasebecinin asıl sorusunu cevapsız bırakıyordu: **kimde**. "186,00 € kuryelerde" ile
    "186,00 € Marc'ta" aynı cümle değil. Sıfır tutarlı açık sefer listeye GİRMEZ — olmayan bir
    emanet kovalatırdı. Kurye adı okunamazsa `null`, künye kuyruksuz yazılır.
  · `MoneyDayEnd.discrepancy.runs` — yalnız FARKI OLAN kapanışlar; tutan sefer bir künye değil,
    sessiz bir onaydır. Ekran tek sefer varsa künyeyi ("SF-26-… · Marc Lemoine · 17:42"), birden
    çoksa sayıyı yazar (tek satıra üç künye sığmaz).

  **Ekranda.** Koyu kartın sağına `ink-inset` zeminli sayaç rozeti · kuryenin üstündeki para artık
  sefer başına uyarı tonlu kart · gün sonu uyuşmazlığının altında künye satırı (`muted` — alarm bir
  kez verilir, kimlik onun altında sakin durur).

  **Bir yardımcı doğdu:** `timeOf` (`lib/operations/stamp.ts`) — günü BAŞLIKTA yazılı bir olayın
  damgası. `stampOf`tan ayrı çünkü soru farklı; testi ikisinin ayrışmadığını çiviliyor (aynı olay
  iki ekranda iki saatle görünemez). `stamp.ts`in ilk testi bu turda yazıldı.

  **Doğrulama.** Para jest **9/9** (üçü yeni: sefer başına künye · adsız kurye · adet rozeti) ·
  damga jest **5/5** (yeni dosya) · `typecheck` types + application + mobile-api + mobile temiz ·
  `eslint` temiz. Entegrasyon testi (`mobile-api/money.test.ts`) yeni şekle göre güncellendi ama
  KOŞULMADI — DB'ye vuran koşu denetmenin işi (CLAUDE §4b).

  **Açık kalan:** hesap bakiyesi satırının künyesi ("Kasa · **Strasbourg**", "CIC · **işletme**",
  "Stripe · **bekleyen**"). `account` tablosu `name` + `type` taşıyor; künyenin ikinci parçası üç
  ayrı eksende (yer · rol · durum) ve hiçbiri `type`tan türemiyor — kullanıcıya soruldu.

- [x] (21.167) **TONLU KARTIN ZEMİNİ — eşik kuralının ölçmediği eksen** (kullanıcı bulgusu 30.08)
  `touches:` `packages/design-tokens/src/{operations-app.ts,operations-app.test.ts}` ·
  `apps/mobile/src/theme/unistyles.test.ts` · `apps/mobile/src/screens/money/*`

  **Durum (30.08).** Kullanıcı cihazda: *"kartın arka tonunda biraz kırmızılık var, tasarımda…
  kuryenin üstündeki kartın içinde kırmızı dolgu var gibi ama cihazda göremiyorum."*

  **Dosyanın kendi künyesi tersini söylüyordu.** `operations-app.ts` §4 bu iki zemini iki kez
  ölçmüş, iki kez `panel`e bağlamış ve gerekçesini yazmıştı: *"Δ2/4/0 · Δ2/2/1 — **ekranda ayırt
  edilemez**; kutuyu hata yapan kenarı ve metnidir."* Varsayım cihazda çürüdü.

  **Kök sebep eşiğin ölçmediği eksende: Öklid mesafesi değil KANAL DENGESİ.**
  `panel` #fbfaf4 → R−G = **+1** (nötr krem) · hata #fdf6f4 → **+7** (pembe) · uyarı #fdf8f3 →
  **+5** (şeftali) · olumlu #f2f7e8 → **−5** (yeşil). Açık tonlarda göz mutlak parlaklığı değil
  kanalların SIRASINI okuyor; üç kanalı da 8'in altında tutan bir renk pekâlâ başka bir aileye
  ait olabilir. Kural sökülmedi, **istisnası ilan edildi** ve gerekçesi token künyesine yazıldı.

  **İki durak:** `error-bg` **fark** (taban #f4e3e0 → #fdf6f4; rol birebir aynı olduğu için yeni
  ad açılmadı, değer ezildi) · `warning-bg` **yeni** (#fdf8f3; kenarı 30.08'de açılmıştı, zemini
  aynı gerekçeyle atlanmıştı). Kullanım tasarımda ölçüldü: hata 18 · uyarı 10 — tek ekranın derdi
  değil.

  **Olumlu zemini (#f2f7e8, 22 kullanım) AÇILMADI:** benim ekranlarımda yok ve kullanılmayan bir
  durak ölü token olurdu. Deftere ölçümüyle bırakıldı — yeşil tonlu kart çizen şerit açacak.

  **Testler karara getirildi, susturulmadı:** `operations-app.test.ts` fark sayısı 2→3 ve toplam
  durak 19→21 · `unistyles.test.ts`in "alt evren" iddiasından `error-bg` çıkarıldı, yerine
  istisnayı çivileyen iki satır kondu. Dördü de doğru düşmüştü — token setinin ŞEKLİNİ çiviliyorlar
  ve şekil değişti.

  **Doğrulama.** design-tokens vitest **31/31** · mobil jest (tema + para + lib) **66/66** ·
  typecheck beş pakette temiz · eslint temiz. Web'e etki YOK: bu dosya `globals.css` ikizinin
  parçası değil (`render-theme-css.ts` onu basmaz), override yalnız operasyon temasında yaşıyor.

- [x] (21.168) **DURAK EKRANI: KUTU KODU VE MAL İPUCU** (v3:17 · tasarım HTML'i koda karşı konuldu)
  `touches:` `apps/mobile/src/screens/courier/{delivery-screen.tsx,messages.json}`

  **Durum (30.08).** Kullanıcı 17. ekranın tasarım karesini paylaştı; tasarımın türetilmişi koda
  karşı konup iki fark ölçüldü.

  **Kutu satırı kutunun KODUNU yazıyor, sıra numarasını değil.** "Kutu 1" kuryenin elindeki
  kartonla eşleşmiyordu — kartonun üstünde `KT-26-7741` yazıyor. Sıra numarası bizim iç sayacımız;
  kod **fiziksel nesnenin kimliği** ve kurye yığından doğru kutuyu seçerken ona bakıyor. Anatomi
  tasarımdaki üç sütun: kare numara rozeti · kod · sağda durum.

  **Sağdaki durum `loadedAt`ten geliyor** (`araçta` / `araçta değil` / okutulunca `verildi`).
  Veri sözleşmede zaten vardı ve çizilmiyordu: **araca binmemiş bir kutu kapıda hiç bulunamaz** ve
  kurye onu boşuna arar — yükleme ekranındaki bilgiyi kapıda tekrar sormak yerine gösteriyor.

  **Satırlar alt alta.** Rozet gibi yan yana sarmalanıyorlardı ve kutu kodu rozete sığmaz.

  **`MAL` başlığındaki ipucu ayrı satıra indi.** Tasarım başlığı kısa tutuyor ("MAL — 1 KALEM") ve
  talimatı altına yazıyor; tek satıra sıkıştırıldığında başlık okunmaz uzunluğa çıkıyor ve talimat
  başlık gibi büyük harfle sessizleşiyordu.

  **Doğrulama.** Kurye jest **93/93**; cihaz turu görsel ajanından istendi (`v3-gorsel-kurye.md`).

- [x] (21.169) **KURYE İLK YÜKÜ İSKELET — beş ekranın beşi de halkayı bıraktı** (kullanıcı notu N9)

  **Sorun.** Notlar kuyruğundaki N9 kuralı şuydu: *"Projemizdeki loading mantığımız skeleton
  göstermek üzerine."* Ölçüldü 30.08 — kurye ekranlarının **beşi de** `LoadingState` (dönen halka)
  gösteriyordu, hiçbiri iskelet kullanmıyordu. Halka **yerleşim tutmaz**: ekranın ortasında döner,
  söndüğü an gerçek bloklar yukarıdan gelir ve sayfa zıplar. Kurye rampada telefona bakarken
  parmağını bir yere koymuş oluyor ve altındaki içerik kayıyor.

  **Yapıldı.** Beş ekran da `OperationsSkeletonList`e geçti; ölçüler **her ekranın kendi
  bloklarından** türetildi (kit ölçüyü çağırandan alır — komponentin kendi künyesinin kuralı):

  | ekran | yer tutucular (dp) | neyin yerini tutuyor |
  |---|---|---|
  | Günün rotası | 120 · 66 · 58 | koyu özet kartı · kapı satırı · ilk durak kartı |
  | Sefer künyesi | 160 · 18 · 18 | künye kartı · araç satırı · dipnot |
  | Araca yükleme | 100 · 44 · 66 | sayaç kartı · okut düğmesi · ilk durak satırı |
  | Durak | 46 · 44 · 110 | adres künyesi · iletişim şeridi · ilk adım bölümü |
  | Sefer kapanışı | 66 · 18 · 180 | sayaç karoları · not satırı · para sayım kartı |

  Yer tutucu **ortalanmıyor**: gerçek blokların başlayacağı yerde, gövdeyle aynı yatay dolguda
  başlıyor. Ortalanmış bir iskelet, halkanın zıplamasını başka bir zıplamayla değiştirirdi.

  **Koşullu bloklar yer tutmuyor** (kapanışın uyarı kutusu, durağın kanıt/tahsilat bölümleri):
  olmayabilecek bir bloğun yerini tutmak, iskelet sönünce YUKARI zıplamaktır — çözdüğü sorunun
  aynısı, ters yönde.

  **Test — halkanın geri dönüşü yakalanıyor.** Beş ekranın dördüne yeni test, birine (günün
  rotası) mevcut test genişletildi. Ayıran ölçülebilir iz **rol**: halka kendini `progressbar`
  diye tanıtır, iskelet tanıtmaz — yer tutucu bir ilerleme bildirmez. Yalnız `testID`ye bakmak
  yetmezdi: o kimlik iki bileşende de aynı kalıyor ve halka sessizce geri gelebilirdi.
  **Yakaladığı doğrulandı:** rota ekranına halka geri konuldu, test kırmızıya döndü, sonra
  geri alındı.

  **Doğrulama.** Kurye jest **97/97** (4 yeni), `tsc` temiz, `eslint` temiz.
- [x] (21.170) **KESİKLİ AYRAÇ KOMPONENTİ — RN'in `dashed`i tasarımın deseni değil** (kullanıcı bulgusu 30.08)
  `touches:` `apps/mobile/src/components/operations/{dashed-rule.tsx,dashed-rule.test.tsx}` ·
  `apps/mobile/src/screens/money/{money-screen.tsx,day-end-screen.tsx,money-screens.test.tsx}`

  **Durum (30.08).** Kullanıcı kart içi ayraçlar için *"kesikli noktalar falan var, tasarım bariz
  farklı"* dedi. Önce yanlış teşhis kurdum (*"kart eklenince göze battı"*) — **ölçünce başka çıktı.**

  **Ölçüm — iki görüntü de 1080 px genişlikte, piksel piksel tarandı:**

  | | kesik | boşluk | tekrar | doluluk |
  | --- | --- | --- | --- | --- |
  | tasarım (Chrome) | 9,0 px | 5,9 px | 14,9 px | %60 |
  | cihaz (RN Android) | 11,9 px | 12,0 px | **23,9 px** | %51 |

  Aynı `1.5px dashed` bildirimi Android'de **%60 daha seyrek** bir desene dönüşüyor: tasarımda sık
  ve neredeyse sürekli okunan hat, cihazda ayrı noktalara ayrılıyor. RN'de dash desenini ayarlayan
  API YOK (`borderStyle` parametre almaz).

  **Ara çözüm REDDEDİLDİ ve bu kayda değer.** Önce düz çizgiye çevirdim — görsel ağırlık eşitti
  (1,5 px × %60 ≈ 0,9 px mürekkep ⇒ `hairline` solid). Kullanıcı onu da gördü: *"cihazda düz
  çizgiler ama tasarımda nokta nokta var."* Haklıydı: **ağırlık eşitlemek deseni geri getirmiyor**,
  yalnız farkı başka bir yöne taşıyor.

  **`OperationsDashedRule`** (`react-native-svg` — zaten kurulu, kitin çizim kapısı):
  `strokeDasharray` deseni çiziyor ve değerler ÖLÇÜMDEN türüyor — tuval 390 CSS px → görüntü
  1080 px, ölçek 2,769 ⇒ **3,25 dp kesik · 2,13 dp boşluk**. Testi deseni çiviliyor; biri "3,25
  tuhaf, 3 yapayım" derse ayraç sessizce tasarımdan ayrılır ve ayrışma teste değil yalnız göze düşer.

  **Ayraç artık satırın KENARLIĞI değil, aradaki öğe** — "sonuncu mu" sorusu her satıra sorulmuyor.

  **Görsel ajanının ilk turundan bir fark daha kapandı:** ödeme etiketi tasarımda tamamı büyük
  ("KAPIDA · KART"), kodda "KAPIDA · nakit"ti. Büyütme `upperIn(…, 'tr')` ile — stilin
  `textTransform`u Android'de CİHAZIN diliyle uygular ve Fransızca arayüzde "NAKIT" (noktasız I)
  olurdu (`section-header.tsx`in aynı gerekçesi).

  **Deftere bırakıldı:** desen operasyonda 20+ dosyada geçiyor. Girdide **tek kenarlı ayraç** (bu
  komponente geçmeli) ile **tam çerçeve** (`Surface`ın `invite`/`blank` tonları, imza tuvali —
  ölçmedim, DOKUNULMASIN) ayrımı yazılı. Başkasının dosyasını ben çevirmedim.

  **Doğrulama.** Ayraç jest **3/3** (yeni) · para jest **9/9** · typecheck temiz · eslint temiz.
  Cihaz doğrulaması `v3-gorsel-para.md`ye **İSTEK** olarak yazıldı — cihaz görsel ajanında ve
  protokolü geç okuduğum için bir kez sırasız dokunduğumu orada yazdım.

- [x] (21.171) **SEFER KÜNYESİ VE ARACA YÜKLEME v3'E OTURDU** (v3:15 · v3:16 · görsel ajanının turu)

  **Nereden geldi.** Görsel ajanı dört ekranı cihazda tasarımla yan yana koydu ve **20 fark**
  yazdı (`v3-gorsel-kurye.md`). Bu satır ikisini kapatıyor: 15 · Sefer künyesi (6 fark) ve
  16 · Araca yükleme (6 fark, dördün en çok ayrışanı).

  **15 · Sefer künyesi — dördü düzeldi.**
  · **Rota zinciri sayılardan SONRA ve notla tek paragraf.** Zinciri referansın altına koymuştum;
    tasarım onu sayıların altına ve "yönetimde planlanır" cümlesiyle aynı demete koyuyor. Ayrım
    anlamlı: üst satır künyenin KİMLİĞİ, orta blok günün ÖLÇÜSÜ, alt paragraf BAĞLAM. Zincir
    yukarıdayken kimlikle ölçünün arasına giriyordu.
  · **`ATANMIŞ` dolgulu hap oldu** (`olive-bg` + `badge` yarıçapı). Dolgusuz yazıldığında
    yanındaki gri referansla aynı ağırlıktaydı; oysa o bir DURUM etiketi, künye değil.
  · **Araç kendi kesikli kartında.** Düz gri bir cümleydi ve künye kartının dipnotu gibi
    okunuyordu. Kart İKİ hâlde de çizilir — "araç yok" da bir cevaptır.
  · **Birincil düğme ZEYTİN oldu, dipnotu altına ve ortaya indi.** v3'te renk bir ayrım taşıyor:
    zeytin akışı İLERLETİR (başlat, yüklemeye geç), koyu bir mutabakatı KAPATIR (seferi kapat,
    günü kapat). İkisi de koyuyken kurye bunu renkten ayırt edemiyordu.

  **16 · Araca yükleme — beşi düzeldi.**
  · **Sayaç kartı KOYU.** Krem çizilmişti ve okut düğmesiyle, durak kartlarıyla eşit sesle
    konuşuyordu; rampada ilk bakış buraya düşmeli. Sayı serif ve kahraman, "/7 kutu" kuyruğu
    sessiz, "araçta" da rozete döndü (`ink-inset`).
  · **Okut düğmesi: emoji gitti, çizgi ikon geldi** (`scan` — tasarımın geometrisi zaten
    ikonumuzda vardı) ve metin tasarımın metni oldu ("Kutuyu okut").
  · **Durak satırı kendi kartında.** Kesikli ayraçla bölünmüş düz satırlardı; liste bir metin
    bloğu gibi okunuyordu.
  · **Yapışkan dip: "günün rotasına dön" + eksik kutu dipnotu.** Dipnot listenin en sonundaydı,
    yani ancak sonuna kadar inen kurye görüyordu — oysa cümle dipteki düğmeyle verilen KARARIN
    bedelini anlatıyor. Dipnot yalnız eksik varken çizilir.

  **Kite bir prop: `OperationsProgressBar onInk`** — ve bu ölçülmüş bir ARIZAYDI. Çubuğun izi açık
  zemin için seçilmişti (`neutral-bg`) ve KOYU kartların üstünde zeminden açık kalıyordu: çubuk
  boşken bile DOLU görünüyordu. İki koyu çağıran da kuryede (günün özet kartı · yüklemenin sayaç
  kartı) ve ikisi de düzeldi. Prop additive, öteki çağıranlar (depo toplama kuyruğu) etkilenmedi.

  **Bilinçli sapmalar — üçü de gerekçeli:**
  · **Sayfa başlığı ortak kalıyor** (`OperationsStackHeader`). Tasarım 15'i geri düğmesiz, tam boy
    üstbaşlıklı çiziyor; ama o hâl 25 ekranın 2'sinde var ve 23'ü bizim komponentimizle birebir
    aynı (ölçüm komponentin künyesinde). Üstelik `/trip` bizde günün rotasından İTİLEN bir rota —
    geri düğmesini almak kuryeyi ekranda kilitlerdi.
  · **"Yükleme okutması kuyruğa alınır" bilgi kartı yazılmadı**: tasarımın `yazmaKapali` dalı bizde
    yok (çevrimdışı yazma kuyruğu henüz kurulmadı). Olmayan bir hâli anlatan bir kart, kuryeye
    olmayan bir güvence verirdi. `BEKLEYEN(BACKLOG §1)`.
  · **"Başka seferin kutusu" uyarı kartı ve "yanlış okuttum — geri al"** yazılmadı: ikincisi bir
    GERİ ALMA ucu istiyor ve sözleşmede yok. Kayıt: `v3-tasarim-veri-modeli-notlari.md`.

  **Doğrulama.** Kurye jest **101/101** (4 yeni), kit çubuğu **5/5** (yeni dosya), `tsc` temiz,
  `eslint` temiz. Cihaz turu görsel ajanından istenecek.

- [x] (21.172) **KURYE KİTE BAĞLANDI — beş ekran, altı komponent, sıfır sert gölge** (kullanıcı bulgusu 30.08)

  **Nereden çıktı.** Kullanıcı sordu: *"Kuryede en aşağıda seferi kapat diye bir buton var,
  orijinal tasarımda gölge yok ama sende var. Neden? Ortak buton komponentinde gölge var mı?"*
  Ölçtüm ve cevap utandırıcıydı: **gölge ortak komponentte değil, benim ekranımdaydı** — çünkü o
  düğme ortak komponenti hiç kullanmıyordu. Kullanıcı devam etti: *"kullanılmayan başka ortak
  komponentler de var mı bak, hepsini kontrol et"*.

  **Envanter — kuryede kullanılmayan altı komponent bulundu, dördü kullanıldı:**

  | komponent | önce | sonra | kullanılamayanın sebebi |
  |---|---|---|---|
  | `OperationsStickyBar` | 0 | **3** | — |
  | `OperationsSurface` | 0 | **3** | — |
  | `OperationsDashedRule` | 0 | **2** | — |
  | `PrimaryButton` | 0 | **2** | — |
  | `SecondaryButton` | 0 | 0 | onu hak eden iki yer de YAN YANA ESNEYEN satır; `grow` prop'u yok (kite önerildi) |
  | `OperationsIconButton` | 0 | 0 | kuryede karşılığı yok — doğru |

  **Sert gölge: 7 → 0.** `3px 3px 0` müşteri evreninin imzasıydı ve v2'den kalmıştı; v3'te sert
  gölge YOK. Kural kitte zaten yazılıydı (`PrimaryButton elevation="flat"` künyesi) — bu ekranlar
  kite hiç sormamıştı. Basılı geri bildirim de `shadow`dan `scale`e döndü (6 yer): gölgesiz bir
  yüzeyin kayması, altında kaymayı açıklayan bir şey olmadığı için titreme gibi okunur.

  **Kartlar arası aralık — kullanıcının ikinci bulgusu.** *"Kurye ekranındaki kartlar birbirine
  bitişik durumda."* Ölçtüm: günün rotasında `gap` **hiç yoktu**; özet kartı ile kapı satırı sıfır
  boşlukla yan yanaydı. Görsel ajanı bunu "tasarımda karşılığı yok" diye kapatmıştı — durak
  listesinde `gap` gerçekten yazılmamış (tek durak çizilmiş) ama **aynı ekranda kart↔kart ritmi
  yazılı: 10 dp** (`margin:10px 20px 0`, üç kart birden). Değer oradan alındı, tahminden değil.
  `stopRow`un dolaylı dikey dolgusu da kaldırıldı — iki kaynak varken duraklar listenin geri
  kalanından farklı ritimde duruyordu.

  **Yapışkan çubuk kite geçince tasarımın GRADYANI geldi:** künye ve yükleme ekranlarında elle
  kurulmuş hâlde yoktu ve liste düğmenin altından keskin bir kenarla kesiliyordu.

  **Kite bir prop: `OperationsProgressBar onInk`** — ölçülmüş bir arızaydı. Çubuğun izi açık zemin
  içindi ve koyu kartların üstünde zeminden AÇIK kalıyordu: çubuk boşken bile DOLU görünüyordu.
  Görsel ajanı cihazda doğruladı — dolgu tasarımla **birebir** (`95,122,44`), izin ayrışması
  cihazda +22 luma, tasarımda +25.

  **Kite üç öneri yazıldı** (ortak defter, kararı kit sahibinde): `glow` yükseltiye taşınsın
  (ölçtüm — tasarımın 4 ışımalı düğmesinin 4'ü de AKIŞTA, hiçbiri yapışkan çubukta değil, yani
  ışıma bugün ulaşılamaz), `PrimaryButton`a `badge`, `SecondaryButton`a `grow`.

  **Bir cümle kusuru düzeldi** (görsel ajanının cihaz bulgusu): rota zincirini notla birleştirirken
  cümle sonu düşmüştü — "…→ Krutenau **Rota** yönetimde planlanır" okunuyordu ve "Krutenau Rota"
  tek bir ad gibi görünüyordu. Nokta zincirin kendi şablonuna kondu (`routeUnknown` zaten noktayla
  bitiyor, ortak şablona konsa çift nokta olurdu).

  **BEKLEYEN(BACKLOG §1) — kesikli TAM ÇERÇEVE.** Görsel ajanı ölçtü: RN'in `dashed`i cihazda
  **1:10** (2–3 px çizgi · 22–33 px boşluk), tasarım 1:1; 840 px'lik kenarda 9 kesik, çerçeve
  kesikli değil NOKTALI görünüyor. Tek-kenar ayraçlar kitin svg komponentine geçti; kalan iki tam
  çerçeve (devre dışı "Fotoğraf" düğmesi · imza tuvali) `Surface`ın `blank` tonuna geçirilemedi —
  tuval `onLayout` + `panHandlers` taşıyor ve `Surface` bu prop'ları iletmiyor. Çare kitte.

  **BEKLEYEN(BACKLOG §1) — 17 ve 18'in kalan tasarım farkları:** durak ekranının üç eylem düğmesi
  (tasarım: navigasyon etiketli, ötekiler etiketsiz daire), kanıt adımının doğrudan imza yüzeyi
  olması, tahsilatın tuş takımı düğmesi; kapanışta fark sütununun kaldırılması ve sayım kutularının
  BOŞ açılması. Sonuncusu bir DAVRANIŞ sorusu — ekran "SAYDIĞINI GİR" derken kutuları beklenen
  tutarla dolduruyor ve kurye saymadan onaylarsa fark hep 0,00 çıkar; kullanıcıya sorulacak.

  **Doğrulama.** Kurye jest **101/101**, kit çubuğu **5/5**, `tsc` temiz, `eslint` temiz.
  Cihaz turu: 16 tam · 14 birebir · 15 dört düzeltme yerinde (görsel ajanı, 30.08).

- [x] (21.173) **ADET ÇEKMECESİ — soru "kaç paket" değil "KAÇ KOLİ"** (kullanıcı bulgusu 30.08 · v3 `sheetAdet`)
  `touches:` `apps/mobile/src/components/operations/{quantity-sheet,stepper-group,dashed-frame}.tsx` ·
  `apps/mobile/src/components/operations/quantity-value.ts` ·
  `apps/mobile/src/components/ui/bottom-sheet.tsx` ·
  `apps/mobile/src/screens/warehouse/{intake-screen.tsx,use-intake.hook.ts,messages.json}` ·
  `packages/types/src/contracts/warehouse-api.schema.ts` ·
  `packages/application/src/warehouse/{intake,scan,variant-search}.ts` · `scripts/seed/barcode.ts`

  **Nereden çıktı.** Kullanıcı: *"Adet girmek için özel bir çekmece komponenti var ve bunu bire bir
  kopyalamanı istiyorum. Kopyalarken neden problem yaşadığını anlamıyorum. Şu an alakasız bir
  tasarım var."* Haklıydı ve sebep bir KARIŞTIRMAYDI: v3'te **iki ayrı çekmece** var — `keypadAcik`
  PARANIN tuş takımı (€ işareti, 12 tuş, virgül, "beklenen" çipi), `sheetAdet` ise ADEDİN çekmecesi
  ve **içinde hiç tuş yok**. Adet kutusuna para çekmecesi bağlanmıştı.

  **Depocu 27'yi rakam rakam yazmaz, "iki koli, üç tek" der.** Çarpma işini ekran yapar; kolinin
  kaç paket olduğu bir VERİDİR (`variant_barcode`ın koli kodu, çarpan kodun kendi alanı), depocunun
  zihinden çarpması gereken bir sayı değil — ve zihinden çarpım sayımın en sık hata kaynağıdır.

  **Çekmecenin beş bloğu tasarımdan birebir:** koyu (`ink`) toplam kartı + altında hesabın kendisi
  (*"2 × 12 + 3 tek paket = 27 paket"* — depocu sonucu değil YOLU doğrular) · "KAÇ KOLİ GELDİ"
  bölümü (kayıtlı boyların bağlı sayaçları) · "Başka koli boyu" adımı · "KOLİ DIŞI TEK PAKET"
  sayacı + 0–24 cetveli · kapatan "Tamam". Değer CANLI yazılır: tasarımın "Tamam"ı bir onay değil
  kapatmadır, satır her ± anında zaten güncellenmiştir.

  **`BEKLEYEN` diye kaydedilmiş engel YANLIŞMIŞ (ölçüldü).** Not kuyruğu N2 *"ürünün kutu tipleri
  veri modelinde yok"* diyordu. Yok değildi: `variant_barcode`ın `kind='case'` satırları tam olarak
  bu (entity künyesi §1.2 — *"her kod kaç adet olduğunu kendisi taşır"*), yerelde ölçüldü (4 koli
  kodu, çarpanlar 6–24). Eksik olan **sözleşmeydi**: kapılar bu alanı taşımıyordu. `caseSizes` üç
  yere birden eklendi (`IntakeFormRow` · `ResolveCodeResponse` · `VariantSearchRow`) — üçü de
  aynı gerekçeyle, `sku`/`dateType`/`shelfLifeDays` ile aynı: PO'lu, okutmayla açılan ve aramayla
  açılan satır aynı formda aynı şeyi sorabilmeli. Hepsi TEK sorguda okunuyor (`listByVariants`),
  çekmece açılınca ikinci tur atılmıyor.

  **Döküm çekmecenin belleğidir, toplam satırın sayısı.** `IntakeRowState.breakdown` hangi boydan
  kaç koli + kaç tek paket tutuyor; `qty` onun toplamı ve ikisi HER ZAMAN aynı yamada yazılıyor
  (çekmecenin `onChange`i, okutmanın `addScanned`i). Tek sayı tutulsaydı çekmece ikinci açılışta
  27'yi gösterir, depocu düzeltmek istediği koli sayısını göremezdi. Okutma da döküme yazıyor:
  koli kodu koli sayar (tam bölünen kısım), artan kısım tek pakete düşer.

  **Liste boşsa uydurulmaz:** koli boyu kayıtlı olmayan üründe bölüm hiç çizilmez, yalnız tek paket
  sayılır. Varsayılan bir 12'lik koli, ölçülmemiş bir çarpanı ölçülmüş gibi gösterip stoğu sessizce
  bozardı (CLAUDE §1).

  **Yanında çıkan iki arıza — ikisi de kitte, ikisi de öteki şeritleri ilgilendiriyor:**
  · **`BottomSheet` her çizimde yeniden açılıyordu** (kullanıcı cihazda: *"adedi her
    değiştirdiğimde çekmece yeniden açılıp kapanıyor"*). Açılış etkisi `animateClose` →
    `finishClose` → çağıranın `onClose`una bağlıydı ve çağıranlar onu ok fonksiyonu veriyor: her
    çizimde yeni kimlik, her çizimde yeniden açılış. Bugüne kadar görünmemişti çünkü bütün
    çekmeceler taslağını İÇERİDE tutuyordu; kontrollü olan ilk çekmece hatayı gösterdi. Açılış
    artık bir GEÇİŞ (`opened` ref'i).
  · **Tuş takımının ızgarası çökmüştü** — `flexShrink: 1`, Yoga'da sarmadan önce küçültüyor, yani
    12 tuş tek satırda ince dilimlere dönüyordu. `flexBasis: '30%' + flexGrow: 1 + flexShrink: 0`.
    Komponent PARA ekranlarında da kullanılıyor (gün sonu · tahsilat); not bırakıldı.

  **Tohum düzeltildi:** varyant başına en fazla BİR koli boyu yazılıyordu, tasarımın örneğinde ÜÇ
  var (KT-04 · KL-12 · KL-24) — tek satırlık liste bu ekranı sınamıyordu bile. Koli kodu alan her
  varyant artık üç boy alıyor; mevcut kod ve çarpanı **aynen korundu** ki okutma testleri kaymasın.
  Görmek için `db:refresh` gerekiyor (kullanıcının kararı).

  **Doğrulama.** Depo + kit jest **433/433** (18 yeni: döküm hesabı 12, sayaç grubu 3, ekranda koli
  sayarak sayma 3), `tsc` temiz, `eslint` temiz, `docs:check` temiz. Entegrasyon testleri yazıldı
  (`scan.test.ts` koli boyu listesi, `intake.test.ts` alan listesi dokuza çıktı) — koşusu
  denetmende (CLAUDE §4b).

- [x] (21.174) **MAL KABUL: KAPI METNİ, HASAR SAYISI, LOT ÇEKMECESİ VE ÜÇ TERS RENK** (kullanıcı bulguları 30.08 · v3:05)

  Kullanıcı ekranı cihazda gezip tasarım kareleriyle karşılaştırdı; çıkan sekiz farkın hepsi
  kapandı. Üçü **renk eşlemesinin ters olmasıydı** ve üçü de aynı kalıptan: kit doğru kullanılıyor,
  yanlış olan hangi tonun hangi HÂLE ait olduğu.

  **Dolgu bir TAMAMLANDI işaretidir, eksik işareti değil.** Tasarım kuralı tek satırda yazılı
  (`Operasyon Mobil v3.dc.html:3968-3969`): SKT/lot alanı boşken `bg:#fff · bd:#d9a97f`, doluyken
  `bg:#f2f7e8 · bd:#c3d3a4 · fg:#46601f`. Bizde tersiydi — boş alan şeftaliye boyanıyor, dolan alan
  nötr kalıyordu; ekranda renkli olan şey "yapılmamış" oluyordu. Eski künye bunu bilinçli sanmıştı
  (*"dolgulu kutu engel gibi okunur"*); gerekçe tutarlıydı ama tasarımın anlamını çeviriyordu.
  Aynı ters eşleme SKT ÇEKMECESİNDE de vardı: seçili satır yeşil, onay düğmesi koyuydu — tasarım
  tersini söylüyor (seçim koyu, eylem yeşil; ekranın tek "olur"u yazma düğmesidir). Üçüncüsü
  `ChoiceChip`teydi: `idle` hâli TEK tondu, yani `tone="error"` yalnız seçili çipi kırmızı
  yapıyordu; tasarımın hasar çipleri seçilmemişken de kırmızı ailesinde.

  **Düğme asıl eylemi yazar, kapıyı üstteki satır söyler** (Komponent Envanteri M1e). Kapı metni
  düğmenin ETİKETİNE girmişti ("Her satırda adet + SKT zorunlu") ve düğme ne yapacağını hiç
  söylemiyordu; sayaç da yoktu. Artık üstte gri kapı satırı **"— N/M satır dolu"** ile duruyor,
  düğme pasifken de "Kabulü kaydet" yazıyor. Sayı `writable` ölçütünden — `complete` ve
  `hasAnyCounted` ile aynı kaynak; ikinci bir "dolu" tanımı bir gün "5/5 diyor ama düğme açılmıyor"
  hâli üretirdi.

  **Hasar nottan SAYIYA döndü.** Eskiden serbest bir not kutusu vardı ve "kaç paket hasarlı" hiç
  sorulmuyordu. Şimdi kabul edilen adedin İÇİNDEN sayaçla işaretleniyor (üst sınır o adet), sebep
  seçiliyor, üçü isteğin tek notunda birleşiyor. **Kullanıcı kararıyla tasarımdan iki sapma:**
  sayaçlar ("sağlam N · hasarlı M") soru cümlesinin sonunda, sebep ise kartta çip değil sayacın
  sağındaki düğmeden açılan çekmecede ve TEK seçim (şablon dört çipi karta serip `multi:true`
  veriyor). Şablonun *"hasarlı paketler stoğa 'hasarlı' olarak girer"* cümlesi de yazılmadı: bizde
  öyle bir ayrım yok, sözleşmede satır başına hasar alanı bulunmuyor — olmayan bir makineyi vaat
  etmek olurdu (CLAUDE §1). Dipnot bugünkü gerçeği söylüyor.

  **Lot çekmecesi kullanıcının kurduğu yapıya geçti:** alt iki düğme ("Lot yok" / "Yaz") kalktı,
  kutuya yazılan kod satıra CANLI işleniyor, temizleme kutunun sağında ve yalnız dolu kutuda
  çiziliyor, öneriler kutunun altında ve dokunulunca lotu yazıp çekmeceyi kapatıyor. `lotSkipped`
  ("bilinçli boş" beyanı) kavramı kalktı — kutu boşsa lot yoktur ve sözleşme bunu zaten
  `lotNumber: null` diye taşıyor; tek değer için iki kontrol vardı.

  **Yanında kapanan beş ufak iş:** "say →" tek dokunuşta satırı VE adet çekmecesini açıyor (eskiden
  ikinci dokunuş gerekiyordu) · "sıfırla" adet çekmecesinin başlık hizasına taşındı (`BottomSheet`e
  `titleAction` yuvası açıldı) · yapışkan çubuğa `gap` eklendi (hiç yoktu, iki düğme bitişikti) ·
  "KAÇ KOLİ GELDİ" bölümü kayıtlı boyu olmayan üründe artık gizlenmiyor (uydurma çarpan yasağı
  duruyor, kapanan şey gerekçesinden fazlaydı: depocu koli sayamıyordu) · kutu tipi ızgarası
  tasarımın 2×4'üne oturdu.

  **Izgara üç turda çözüldü ve ölçümü künyede:** `flexBasis: '22%'` bu panelde hiç çözülmüyor —
  `alignSelf: 'stretch'` de `flexGrow: 0` da işe yaramadı, sekiz hücre tek satıra diziliyordu.
  Kabın genişliğini `onLayout` ile ölçüp dörde bölmek varsayımsız tek yol oldu.

  **Kutu tipi listesine 4 · 12 · 24 eklendi** (kullanıcı kararı): tasarımın sekiz sayısı
  (2·3·6·8·10·16·20·36) sahadaki gerçek boyların HİÇBİRİNİ içermiyordu — seed'in ürettiği çarpanlar
  `4, 12, 24` (`scripts/seed/barcode.ts:90`). Uydurma çarpan kapısı açılmadı; eklenen üçü de
  kartlarda gerçekten kullanılan boylar.

  **Doğrulama.** Kit + depo jest **294/294**, mobil paket **1140/1140**, `tsc` temiz, `eslint`
  temiz; sekiz farkın hepsi cihazda (CPH1907) tek tek görüldü.

  **BEKLEYEN(21.175):** lot önerilerinin İKİNCİ kaynağı — depodaki partilerin lot kodları.

- [x] (21.175) **LOT ÖNERİLERİ: DEPODAKİ PARTİLERDEN** (kullanıcı kararı 30.08 · tamamlandı 31.08)

  Lot çekmecesinin öneri listesi bugün TEK kaynaktan besleniyor: aynı kabulde başka satırlara
  girilen kodlar (`use-intake.hook.ts` → `lotsUsedBy`). Bu kaynak sözleşme istemiyor ve bir
  sevkiyatın satırları çoğunlukla aynı lottan geldiği için işe yarıyor — ama ilk satırda liste boş.

  **İkinci kaynak:** o varyantın depoda duran partilerinin lot kodları. Veri VAR
  (`stock_batch.lot_number`, `0006_stock.sql:28`), taşıyan yok: `IntakeFormRowSchema` lot alanı
  içermiyor ve `openIntakeForm` motoru satırlara aday koymuyor. İş üç dosyada: sözleşmeye
  `lotCandidates: string[]`, motorda varyant başına son N partinin kodunu okuyan tek sorgu,
  ekranda iki kaynağın birleştirilmesi (aynı kabuldekiler önce).

  **Tasarımın kaynağı BAŞKA ve o bugün kurulamıyor:** şablon *"okunan koliden gelen adaylar"*
  diyor, yani kolinin üstündeki lot etiketinden. Okutma cevabı (`ResolveCodeResponse`) lot
  taşımıyor ve kolinin lot kodunu okuyacak bir alan yok. Kaynağın farklı olduğu ekranda saklanmıyor
  — listeye olmayan bir kesinlik atfetmemek için künyeye yazıldı.

  **DURUM (31.08 · tamamlandı).** Üç dosyada iş yapıldı, tasarlandığı gibi:
  · sözleşme `lotCandidates: string[]` kazandı (`IntakeFormRowSchema`);
  · `StockService.recentLotsByVariants` — TEK sorgu, N varyant, yeniden eskiye, varyant başına
    sınırlı (`LOT_CANDIDATE_LIMIT = 3`), kodsuz partiler elenir ve tekrarlar teke iner;
  · `openIntakeForm` **isteğe bağlı** üçüncü parametre aldı (`warehouseId`) ve okumayı aynı
    `Promise.all` turuna kattı — çekmece açılışında ikinci bir uçuş olmasın diye;
  · ekranda iki kaynak birleşiyor (`lotsUsedBy`): **aynı kabuldekiler ÖNCE**, depodakiler sonra.
    Sıra tesadüf değil — az önce yazılmış bir kod, elindeki koliyle eski bir partiden daha büyük
    ihtimalle aynıdır.

  **NİÇİN İSTEĞE BAĞLI PARAMETRE:** form kendisi depo-üstü (satın alma depo-üstü), lot önerisi
  değil — başka depodaki partinin kodu buradaki koliyle aynı olmak zorunda değil. Depo verilmezse
  liste boş döner: yanlış deponun kodlarını önermektense hiç önermemek doğru.

  **WEB YÜZEYİ BAĞLANMADI** ve gerekçesi alan sınırı: `openIntakeFormAction` depo almıyor, web
  diyaloğunda depo bir FORM DEĞERİ ve form açılışında henüz seçilmemiş olabiliyor. Depoyu açılışa
  taşımak web yüzeyinin tasarım kararı — `docs/talep/not-web-lot-onerileri-kabul-formunda.md`.

  **Doğrulama.** Tip beş pakette temiz · lint temiz · mobil depo+komponent **440/440** (iki yeni
  test: iki kaynağın birleşmesi ve boş listenin sessizliği). **Gerçek uçtan ölçüldü:** bekleyen bir
  sevkiyatın formunda bir satır `['CO2603-1']` döndü — o varyantın depoda duran partisinin kodu;
  kodlu partisi olmayan satırlar boş geldi.

  **Kullanıcının işaret ettiği üçüncü yol (30.08):** lot çoğu zaman FATURADA/irsaliyede yazar ve
  mal kabulde oradan okunur. Fatura kaydı bugün sistemde hiç yok (`purchase_order_item` alanları:
  variant · qty · unit_price · supplier_product · target_warehouse — lot yok) ve siparişe lot alanı
  koymak yanlış olur: sipariş verildiğinde lot diye bir şey yoktur, lot MALLA doğar. Belge kaydı
  açılırsa adaylar oradan gelir; bugünkü çekmece şekli o güne hazır — kaynak değişse de arayüz
  aynı kalır.

- [x] (21.176) **GÜNÜN ROTASI: DURAK KARTI v3'E OTURDU — sözleşme beş alan kazandı** (v3:14 · kullanıcı kararı 30.08)
  `touches:` `packages/types/src/contracts/courier-api.schema.ts` · `packages/application/src/courier/day.ts` ·
  `scripts/seed/{orders.ts,courier.ts}` · `apps/mobile/src/screens/courier/{courier-day-screen.tsx,messages.json,courier-fixture.ts}`

  **Durum (30.08).** 21.165 dokuz farktan beşini kapatmıştı; kalanların hepsi aynı sebepten
  açıktı ve o sebep ekranda değildi: **tasarımın istediği bilgi sözleşmede hiç taşınmıyordu.**
  Ölçüldü — beş alanın beşi de veritabanında VARDI, hiçbiri uca çıkmıyordu.

  **Sözleşme (`CourierStopSchema`) beş alan kazandı, ek sorgu SIFIR:**
  `settledAt` ve `outcomeNote` `order_status_log`tan — o dizi `attempts` için ZATEN okunuyordu;
  `hasProof` `order.delivery_proof`tan; `payment.collectedAtDoorCents` `amount_collected`tan;
  `items[].fulfilledQty` zaten okunan kalem satırlarından.

  **Saat ve sebep TEK kayıttan** (`settlementLog`): ikisini ayrı aramak, aynı diziyi iki kez
  tarayıp bir gün farklı kayıtlara düşmekti. **Kapıda alınan paranın türetimi
  `delivery_run_collection` görünümünün AYNISI** (yöntem `cash|card|cheque`) — iki hesap, gün
  listesiyle kapanış ekranının bir gün ayrışması demekti.

  **KISMİ TESLİM GERİ GELDİ ve `StopOutcome`a DOKUNULMADI.** v2 döneminde *"kısmi ayrı bir sonuç
  değil"* diye kapatılmıştı; oysa veri onu zaten üretiyor (ölçüldü: `LA-26-AKWJEM`, 4 sipariş → 3
  teslim, `restock`). Enum yine dörtlü — kısmi bir GEÇİŞ değil, `delivered` durağın niteliği
  (`fulfilledQty < qty`); ayrım yalnız çizimde yaşıyor. Enum'a beşinci değer koymak onu durum
  makinesinden ve `MarkUndeliveredRequest`ten ayırırdı.

  **Ekran (v3:14):** durak kartının DÖRT zemini (teslim `cream`+`neutral-bg` · kısmi `warning-*` ·
  takılı `error-*` · sıradaki beyaz + `ring` kalınlığında zeytin kenar) · sonuç etiketi ve SAAT
  (`TESLİM EDİLDİ · 14:12`) · "SIRADAKİ DURAK" başlığı · daireleri bağlayan zaman çizgisi ·
  `DURAKLAR · 5` + sağda `1 takılı` · CTA rozeti `2 açık · 1 takılı` · sorunlu daire DOLU kırmızı.
  **Ham hex yok, yeni token da yok** — dördü de envanterdeki ailelerin üyesi; teslim kartının
  zemini `cream`in kendisi çıktı (Δ2/2/2).

  **Seed üç durak hâli kazandı, çünkü ikisi yerelde HİÇ doğmuyordu:** `returned` (kabul etmedi)
  veritabanı genelinde **sıfır kayıttı**, tek `out_for_delivery → ready` dönüşü DÜNKÜ seferdeydi.
  Üçü de gerçek kapıdan geçiyor (`markUndelivered` · `confirmDoorDelivery`) — kutu okutmasının
  ilkesi. **Sonuç damgaları gün içine yayıldı** (`duraklariSaateYay`): bugünün beş durağının bütün
  geçişleri aynı saniyedeydi (`13:04:32`) ve saat alanı gelseydi beşi de aynı dakikayı yazardı.

  **Yol boyunca iki hata düzeldi.** (1) Seed'in yazdığı `delivery_proof` `DeliveryProofRecordSchema`nın
  hiçbir alanını karşılamıyordu (`{by, at, method}` — `kind` yok): 18 siparişte kanıt kaydı vardı ve
  hiçbiri tanınmıyordu, "imza var" satırı yerelde hiç doğamazdı. (2) Teslimat testlerinin fikstür
  yardımcıları `overrides = {}` çıkarımlı tip taşıyordu, yani her şeyi kabul ediyordu — yeni alanın
  eksikliğini derleme yakalamadı, cevabı ŞEMA reddetti ve 25 test "durak bulunamadı"ya düştü.
  Tipler verildi; sıradaki alan artık derlemede durur.

  **CİHAZ TURUNDA ÜÇ FARK DAHA ÇIKTI** (kullanıcı bulguları · tasarım HTML'i sayarak ölçüldü):

  · **Üstü çizili metin SÖKÜLDÜ.** Teslim edilmiş durağın adresi `line-through` taşıyordu; tasarımın
    14. ekranında `line-through` **sıfır kez** geçiyor. Çizgi "iptal edildi" der, oysa teslim
    edilmiş durak TAMAMLANMIŞ bir iştir — ayrımı zaten kartın zemini ve sonuç etiketi taşıyor.

  · **Yön oku yalnız SONUÇLANMAMIŞ durakta ve kartın İÇİNDE.** Ok her kartta, kartın dışında ve
    dikey ortada duruyordu. Ölçüldü: tasarımın beş durak kartından yalnız ikisinde ok var (sıradaki
    + bekleyen). Ok bir DAVETTİR ("burada yapılacak iş var"); sonuçlanmış durakta yapılacak iş
    yoktur. Rozetle aynı alt şeride alındı (`space-between`, tasarımın kendi düzeni).

  · **İlerleme çubuğu İKİ PAYLI oldu** — zeytin teslim, kırmızı takılı (v3:14). Tek paylı çubuk
    günü olduğundan iyi gösteriyordu: ulaşılamayan durak çubukta hiç görünmüyor, kalan boşlukta
    "sırası gelmemiş" gibi duruyordu. `OperationsProgressBar` paylaşılan kit — ikinci pay OPSİYONEL
    `secondary` prop'u olarak eklendi, depo toplama kuyruğunun çağrısı değişmedi. Payların toplamı
    çubuğu taşıramaz (kırpma), dolgunun kendi yarıçapı kaldırıldı (iki pay arasında çentik bırakırdı).

  **Malın akıbeti iki sonuçta AYRIŞTI.** İlk hâlde `unreachable` ve `refused` aynı cümleyi
  yazıyordu ("araçta kaldı") ve reddedilen durakta bu YANLIŞTI: sözleşmenin kuralı `unreachable`
  malı araçta bırakır ve kapanışta karara düşürür, `refused` depoya döndürür — orada bekleyen bir
  karar yok. Seed notları da sadeleşti: not SEBEPTİR, envanter değil (ekran malın akıbetini kendi
  yazdığı için satır aynı cümleyi iki kez taşıyordu).

  **Doğrulama.** `pnpm typecheck` · `lint` temiz · birim **1860/1860** · kurye jest **105/105** ·
  mobil komponent+kurye **356/356**. Uç türetimi `listCourierDay` doğrudan çağrılarak ÖLÇÜLDÜ —
  sekiz durak, beş hâl, saatler 16:53'ten 19:48'e yayılmış. **Cihaz turu yapıldı** (Android,
  `adb exec-out screencap`): tasarımın 14. ekranıyla yan yana konuldu, yukarıdaki üç fark oradan
  çıktı ve düzeltildikten sonra tekrar ölçüldü.

  **AÇIK SEFERİN DURAKLARI GERÇEKTEN YOLA ÇIKIYOR** (kullanıcı testi 30.08 — cihazda "Ulaşılamadı"ya
  basınca yakalandı). Seed seferi ham insert'le kuruyor ve `departed_at` yazıyordu ama SİPARİŞLERİN
  durumuna dokunmuyordu: ölçüldü, bugünün açık seferinde **tek bir `out_for_delivery` durak yoktu**,
  üçü de `ready`ydi. Gerçekte doğamayacak bir gün — kurye yola çıkmış, hiçbir durağı yolda değil.
  Belirtisi kapıda göründü: bekleyen durakta "Ulaşılamadı" `same_status` ile reddediliyordu
  ("Sipariş zaten bu durumda"), çünkü `unreachable`ın hedefi `ready` ve sipariş zaten oradaydı.
  **Ekran doğru davranıyordu, yalan söyleyen veriydi.** Çare gerçek kapı: `startCourierDay` (catch-up
  claim) sefer kurulduktan sonra çağrılıyor; kutulu sipariş yola çıkmıyor ve o hâl korunuyor.

  **Ulaşılamadı işareti de sefer seed'ine taşındı.** Sipariş seed'inde yazılıyordu ve ardından gelen
  sefer başlatma onu GERİ ALIYORDU (ulaşılamayan durak `ready`e döner, claim `ready` durakları yola
  çıkarır) — seed kendi kurduğu hâli bir adım sonra siliyordu. Sıra artık sahanın sırası: yola çık →
  kapıyı çal → ulaşamadıysan işaretle.

  **Kalan tek fark KULLANICI KARARI:** üstbaşlıktaki zil (bildirim) ikonu tasarımda yok — 21.165'te
  de aynı yerde bırakılmıştı ve ortak kabuk zemininde (dört bölümün hepsinde var).

- [x] (21.177) **KABUK DAVRANIŞLARI GERÇEKTEN ÇALIŞIYOR — üç arıza ve bir TEK KAPI** (kullanıcı bulguları 30.08 · M1b · M1c)
  `touches:` `apps/mobile/src/components/operations/{micro-header.tsx,tab-bar-slide.tsx,screen-scroll.tsx}` ·
  `apps/mobile/src/lib/operations/shell-scroll.tsx` ·
  `apps/mobile/src/screens/{warehouse/warehouse-hub-screen.tsx,money/money-screen.tsx}`

  **Durum (30.08).** Kullanıcı iki cihazda (iOS simülatörü + Android) yapışkan başlık ve çubuk
  gizlemesinde arıza bildirdi. Ölçüm üç ayrı kusur buldu; üçü de 21.16x'te yazılmış olan kabuk
  işinin eksik kalan yarısıydı.

  **1 · Şerit güvenli alanı kapatmıyordu.** `top: insets.top` ile durum çubuğunun ALTINA
  konmuştu; üstündeki bant boyanmadan kalıyor, sayfanın koyu özet kartı oradan geçip saatin ve
  pilin arkasında görünüyordu. Tasarımda o bant YOKTUR (`position:sticky; top:0`, tarayıcı
  tuvalinde durum çubuğu diye bir alan yok) — fark web↔native farkıydı. Şerit artık tepeye
  çakılı, yüksekliği `50 + insetTop` ve kayma mesafesi de güvenli alanı kapsıyor.

  **2 · Çubuk kayıyor ama yerini KORUYORDU.** Ekranın altında çubuk boyunda boş krem bir alan
  kalıyor, içerik oraya uzamıyordu. Sebep künyede yazılıydı: envanterin RN notu *"kap yüksekliğini
  değiştirme; yalnız translateY + contentInset"* diyordu, `translateY` yapılmış `contentInset`
  hiç yapılmamıştı. **Not tasarımın kendi betiğiyle çelişiyor** — betik `max-height`i daraltıyor
  (`v3.dc.html:3107`). RN karşılığı `marginBottom`: çubuk kaydırıcının kardeşi, kazanılan alan
  layout'a bırakılıyor.

  **3 · Dipte aç-kapa titremesi** (2'nin düzeltilmesiyle DOĞDU, kullanıcı hemen gördü). Yükseklik
  değişince sistem kaydırma konumunu kırpıyor, kırpma ters yönlü sahte bir fark üretiyor ve çubuk
  çıkıp yeniden gizleniyordu. İlk turda *"bu web'in derdi, RN'de yok"* diye taşınmamış olan
  tasarımın **380 ms'lik kilidi** eklendi (`_kilit`, birebir): karar değiştiği anda pencere
  kurulur, o pencerede gelen olaylar yalnız referansı tazeler.

  **TEK KAPI — `OperationsScreenScroll` (kullanıcı isteği).** Asıl arıza tekil değildi: kabuk
  davranışı üç parça hâlinde elle kuruluyordu (bağlamı çağır · `onScroll`+`throttle` bağla · mikro
  başlığı ayrıca çiz) ve **kendi kaydırıcısını kuran 17 operasyon ekranından yalnız 1'i
  bağlanmıştı.** Kullanıcı "daha önce çalışıyordu" derken haklıydı — depo hub'ında çalışıyordu,
  başka hiçbir yerde yoktu. Artık tek kap: ekranın yazdığı tek şey ekran adı. `FlatList`ler
  sarılamadığı için onlara `useOperationsScrollBinding()` var; ikisi de aynı karardan besleniyor.

  **Para ekranı bağlandı** (kullanıcı isteği): başlığı kaydırıcının DIŞINDAydı ve mikro başlık
  inince altında asılı kalırdı — hub'ın deseniyle içeri alındı, yükleme/hata hâllerinde doğrudan
  çiziliyor.

  **Doğrulama.** `typecheck` · `lint` temiz · depo jest **183/183** · para **9/9** · mobil
  komponent+depo **293/293**. **iOS simülatöründe ölçüldü** (`cliclick` ile gerçek sürükleme,
  `simctl io screenshot`): iki ekranda da şerit güvenli alanı kapatıyor, dipnot ekranın en
  altında (boşluk yok), dibe hızlı fling sonrası **6 ardışık kare birebir aynı** (tek md5) —
  titreme yok.

  **İKİNCİ TUR — İKİ ARIZA DAHA, İKİSİ DE İLK DÜZELTMENİN YAN ÜRÜNÜ (kullanıcı bulguları, aynı gün).**

  **4 · Dip yaylanması çubuğu geri getiriyordu.** Native kaydırıcı dipte tavanı AŞAR: parmak
  sayfayı yukarı çeker, bırakınca geri iner ve o geri inişte fark negatiftir — ham hâliyle
  "yukarı kaydırılıyor" diye okunuyordu. **Tasarımda bu hâl YOK** (tarayıcıda `scrollTop` tavanı
  hiç aşmaz), dolayısıyla betiğinde de karşılığı yok. Tavanın üstündeki bölge artık yalnız
  referansı tazeliyor; karar, kullanıcı gerçekten tavanın ALTINA indiğinde alınıyor.

  **5 · Hızlı kaydırmada titreme — ve tasarımla ASIL farkımız buydu.** Kullanıcı sordu:
  *"orijinal tasarımdaki çözümlerden farklı ne uyguladın?"* Betik satır satır karşılaştırıldı:

  | | Tasarım | Bizde (ilk hâl) |
  |---|---|---|
  | Animasyonlanan | `max-height` + `transform`, tek CSS motorunda | `marginBottom`, JS köprüsünde |
  | Layout kaç kez değişiyor | tarayıcı tek reflow'da yürütür | **240 ms boyunca her karede** |
  | Sonucu | — | her layout değişimi yeni bir `onScroll` üretiyor |

  Yani çubuk kayarken kaydırıcının boyu her karede değişiyor, her değişim bir kaydırma olayı
  doğuruyor ve o olaylar kararın üstüne biniyordu; mikro başlığın kendi animasyonuyla üst üste
  gelince titreme çıkıyordu. **Çözüm: layout ANİ, kayma animasyonlu.** `marginBottom` tek karede
  yeni değerine geçiyor, çubuk eski yerinden yenisine `translateY` ile kayıyor — yerel sürücüde,
  JS köprüsüne hiç uğramadan, layout'a hiç dokunmadan.

  **Doğrulama (ikinci tur).** iOS simülatöründe `cliclick` ile gerçek jest: dipte çekip bırakma
  sonrası **8 ardışık kare aynı** (çubuk geri gelmiyor); dört tur hızlı aşağı-yukarı sonrası
  **5 ardışık kare aynı** (salınım yok). Depo hub'ında ve para ekranında ayrı ayrı ölçüldü.

  **BEKLEYEN(21.178):** kalan 15 operasyon ekranı hâlâ kabuğa bağlı değil; her biri
  `OperationsScreenScroll`e çevrilecek.

- [ ] (21.178) **KALAN 15 EKRAN KABUĞA BAĞLANACAK** (30.08)
  `touches:` `apps/mobile/src/screens/{warehouse,courier,management,money}/*-screen.tsx`

  **Kapsam.** Kendi kaydırıcısını kuran 17 ekrandan ikisi bağlandı (depo hub · para kökü).
  Kalanların her biri `OperationsScreenScroll`e (ya da `FlatList` ise
  `useOperationsScrollBinding()`e) çevrilecek; başlığı kaydırıcının dışında olan ekranlarda
  başlık İÇERİ alınacak — dışarıda kalırsa mikro başlık inince altında asılı kalıyor.

- [x] (21.179) **iOS'TA ADET ÇEKMECESİ AÇILMIYORDU — iki `Modal` aynı pencerede** (kullanıcı bulgusu 30.08)
  `touches:` `apps/mobile/src/components/scan/scan-sheet.tsx` ·
  `apps/mobile/src/screens/warehouse/{intake-screen.tsx,intake-scan.test.tsx}`

  **Belirti (kullanıcının tarifi, simülatörde birebir üretildi).** Mal kabulde koli okutulunca
  satır doğru sayıyor — "24 ADET", künye "barkod okutuldu", içinde "koli barkodu · bir okutma =
  24 adet" kartı — ama adet çekmecesi AÇILMIYOR: ekran griye dönüyor, panel ekranın altında bir
  şerit hâlinde asılı kalıyor. Yalnız iOS'ta.

  **Sebep ÖLÇÜLDÜ, teori kurulmadı.** Okutma penceresi (`ScanSheet`) de adet çekmecesi
  (`BottomSheet`) de birer `Modal` ve ikincisi birincinin kapanış animasyonu SÜRERKEN sunuluyor.
  iOS bunu yapmaz: ikinci modal monte olur, örtüsü çizilir, ama panelin yerleşimi hiç ölçülmez —
  `BottomSheet`in açılışı ölçüme bağlı olduğu için (`onPanelLayout` → `animateOpen`) animasyon
  hiç başlamaz ve panel `offset = yükseklik` konumunda, yani ekranın altında kalır. Aynı arıza
  sınıfı projede zaten kayıtlıydı (`staff-menu.tsx` künyesi: *"Modal'ın kapanış animasyonu
  sürerken kök yığın değişince…"*), yalnız bu yolda görülmemişti.

  **Çözüm bir KAPI, bir gecikme değil.** `ScanSheet` artık `Modal.onDismiss`i çağırana açıyor
  (pencere ekrandan TAMAMEN kalktığında); mal kabul okutma sinyalini satıra ancak o andan sonra
  geçiriyor. Sabit bir `setTimeout` yazılmadı — o bir tahmin olurdu ve yavaş cihazda yine
  tutmazdı. Android'de sınırlama yok ve `onDismiss` de çağrılmaz: kapı orada en baştan açık
  (`Platform.OS !== 'ios'`).

  **Doğrulama.** iOS simülatöründe akış baştan yürütüldü (mal kabul → sevkiyat → koli okut →
  Koli ×24): çekmece tam açıldı — "24 paket · toplam", "1 × 24 = 24 paket", koli satırı seçili.
  **Testi yazıldı** (`intake-scan.test.tsx`): sinyal geldiği hâlde çekmece açılmamalı, pencere
  kalktığını söyleyince açılmalı — jest `Platform.OS`u 'ios' koştuğu için dal gerçekten yürüyor.
  Depo + komponent paketi **435/435**, lint temiz.

- [x] (21.180) **DURAK EKRANI KİTE DÖNDÜ — çekmece, düğmeler, adım kartları** (v3:17 + `00-ortak:477` · kullanıcı bulguları 30.08)
  `touches:` `apps/mobile/src/components/ui/{primary-button.tsx,secondary-button.tsx}` ·
  `apps/mobile/src/theme/metrics.ts` · `apps/mobile/src/screens/courier/{delivery-screen.tsx,messages.json}`

  **Durum (30.08).** Kullanıcı cihazda durak ekranını tasarımla yan yana koydu: *"buradaki
  komponentlerin hiçbiri ortak komponent değil… butonların yüksekliği, inputun tipi, bunların
  hiçbiri benzemiyor."* Ölçüldü ve haklıydı — aynı klasördeki `trip-screen` ve `load-screen`
  `PrimaryButton` çağırırken bu ekran her düğmeyi elden çiziyordu.

  **SONUÇ PANELİ ÇEKMECE OLDU.** Tasarımda "Ulaşılamadı"/"Kabul etmedi" bir ALT ÇEKMECEDİR
  (`00-ortak:477`): karartma katmanı, 26 dp üst yarıçap, tutamak, alttan kayan panel. Kodda sayfaya
  GÖMÜLÜ bir karttı — kurye onu görmek için kaydırmak zorundaydı. Kit (`BottomSheet`) zaten vardı ve
  kardeş ekranlar onu kullanıyordu; bu ekran kite hiç sormamıştı.

  **KİT İKİ DURAK KAZANDI ve ikisi de tasarımın kendi öğesiydi:**
  · `PrimaryButton` → `tone="error"` (çekmecenin kırmızı "Onayla — kaydet"i) ve `grow` sayısal
    (tasarım iki düğmeyi EŞİT paylaştırmıyor: `flex:1` / `flex:1.4` — onaylayan geniş olur).
  · `SecondaryButton` → `tone="error"` (kapıdaki "Kabul etmedi": kırmızı çerçeve + açık kırmızı
    zemin). Terracotta'dan ayrı ve ayrı olmalı — o bir UYARI tonu, bu bir RED. Değerler statik
    sabitten okunuyor (`error-line` yalnız operasyon temasında var, bileşen iki temada birden).

  **ÖLÇÜLER DOLGUDAN DEĞİL KADEMEDEN.** Not girdisi, kanıt düğmeleri, iletişim şeridi ve tutar alanı
  yüksekliğini `paddingVertical`dan alıyordu — punto ya da satır aralığı değişince hizalar kayıyordu.
  Hepsi tasarımın kendi değerine bağlandı (`controlMd` 50 · `controlLg` 52 · yeni `controlAmount` 56).

  **ADIM BAŞLIĞI: NUMARA ROZETE ÇIKTI.** `"1 · KANIT — B2B'DE ZORUNLU"` diye metne gömülüydü;
  tasarım numarayı 22 dp koyu daire içinde ayrı çiziyor. Daire adımı SAYILABİLİR kılıyor — kurye
  "kaçıncı adımdayım"ı satırı okumadan görüyor. Dört bölüm tek bileşeni paylaşıyor (`StepHeading`);
  para adımının rozeti terracotta, kartının çerçevesiyle aynı aileden.

  **ADIM BÖLÜMLERİ KART OLDU.** Tasarımda her adım kendi kartında (krem panel · kum çerçeve · 20 dp
  yarıçap); kodda düz bloklardı ve adımlar birbirine akıyordu. Tahsilat bölümü zaten kartlıydı ve
  yanındaki iki bölüm ondan farklı bir dilde duruyordu.

  **ARTI/EKSİ SÖKÜLDÜ** (kullanıcı kararı). Tahsilat tutarının yanındaki iki stepper tasarımda YOK.
  Künyesi *"yuvarlak tutarlarda tek dokunuş"* diyordu ama kapıda tahsil edilen tutar MOTORUN
  hesabıdır; adım adım artırma onu "pazarlık edilebilir" gibi gösteriyordu. Yerine tasarımın kendi
  öğesi geldi: tutar solda, `tuş takımı` rozeti sağda — alanın dokunulabilir olduğunu söyleyen tek
  işaret. Eksik ödeme yolu değişmedi (tuş takımı + "Kısmi" rozeti).

  **ARA VE WHATSAPP YALNIZ İKON** (tasarım: 56×52 kare, metinsiz). Üçü de etiketliyken satır üç eşit
  parçaya bölünüyordu ve asıl eylem — navigasyon — kayboluyordu. Metin `accessibilityLabel`a taşındı:
  ekran okuyucu kullanan kurye adı duymaya devam ediyor.

  **METNE GÖMÜLÜ EMOJİ GİTTİ.** `"📷 Kutuyu okut — {n} kaldı"` → kitin `icon` prop'u (`load-screen`in
  aynı kararı: *"İkon emoji DEĞİL çizgi ikon"*). Okutma düğmesi de çerçeveliden zeytin dolguya döndü
  (tasarımın `durakOkut`u); ışıma verilmedi — o v3'te yalnız ARACA YÜKLEME ekranının düğmesinde var.

  **CTA ALTI CÜMLE TASARIMINKİ:** `sıra: kanıt → mal → teslim → para` → `Sıra: kanıt → mal → tahsilat`.
  Eski cümle ekranın kendi başlıklarıyla çelişiyordu (başlık "MAL" ve "TAHSİLAT" derken cümle "teslim"
  ve "para" diyordu). Eksik adımı söyleyen ekler korundu — tasarım statik bir maket, o hâli göstermiyor.

  **ÇİPLER NÖTR OLDU.** Sebep çipleri `tone="error"` ile kırmızı çiziliyordu; tasarımda seçilmemiş çip
  beyaz zeminli, koyu metinli bir ÖNERİDİR. Uyarı olan çekmecenin başlığı, çipler yalnız doldurucu.

  **Doğrulama.** `pnpm typecheck` · `lint` · `knip` temiz · birim **1860/1860** · kurye jest
  **105/105** · mobil kit+kurye **236/236**. Testler yeni davranışa göre güncellendi (çekmece testID'si,
  stepper'ın YOKLUĞU, rozetli adım başlığı, tasarım metinleri).
  **BEKLEYEN(21.180):** cihaz turu — `db:refresh` oturumu düşürdüğü için uygulama misafir olarak
  açıldı; giriş yapıldıktan sonra kutulu bir durakta (bugün `3 kutu`lu durak var) görsel karşılaştırma
  tekrarlanmalı.

- [x] (21.181) **ELLE EKLENEN SATIR DA ADET ÇEKMECESİNİ AÇIYOR — sinyal artık iki kaynaklı** (kullanıcı bulgusu 30.08)
  `touches:` `apps/mobile/src/screens/warehouse/{intake-screen.tsx,use-intake.hook.ts,intake-screen.test.tsx}`

  **Bulgu.** Okutmada çekmece kendiliğinden açılıyordu, aramadan seçilen üründe açılmıyordu.
  Kullanıcının sorusu haklıydı ve eksiklik simetriden fazlası: **okutulan satırın adedi kodun
  kendisinden yazılıyor** (koli barkodu kaç adet olduğunu söyler), **elle eklenenin adedi SIFIR**.
  Yani çekmece burada bir düzeltme değil, işin ta kendisi — açılmaması, depocuyu her seferinde
  satırı açıp adet kutusunu aramaya bırakıyordu.

  **Sinyal yeniden adlandırıldı** (`justScanned` → `pendingCount`): artık iki kaynağı var ve adı
  kaynağı değil SONUCU söylüyor — "sayılacak satır". Aynı ürün ikinci kez seçilirse de sinyal
  verilir: satır zaten var ama depocunun istediği şey onu saymaktır, sessiz bir "zaten ekliydi"
  değil.

  **KAPI GENELLEŞTİ.** 21.179'un iOS kapısı yalnız okutma penceresini bekliyordu; arama çekmecesi
  de bir `Modal` ve aynı çakışmayı üretir. Kapı artık iki pencereyi de tanıyor: okutma
  `Modal.onDismiss`, arama `BottomSheet.onClosed`. Ayrı kapılar yazılsaydı biri bir gün ötekinden
  farklı davranırdı.

  **Doğrulama.** `typecheck` · `lint` temiz · depo **185/185**; testi yazıldı (aramadan seçilen
  ürün çekmeceyi açar — kapının Reanimated'a bağlı yarısı jest'te koşmadığı için test Android
  dalında, kapının kendisi `intake-scan.test.tsx`te ölçülü). **Cihaz turu YAPILAMADI:** iOS
  simülatörüne klavye girişi geçmiyor (donanım klavyesi bağlanmadı), arama alanına yazılamadı —
  okutma yolu cihazda doğrulandı, elle ekleme yolu yalnız kod ve testle.

- [x] (21.182) **MAL KABUL UÇTAN UCA CANLI TEST — beş tur, DB doğrulaması, üç bulgu** (kullanıcı isteği 30.08)
  `touches:` — (yalnız ölçüm; kod değişmedi)

  **Ne koşturuldu.** Gerçek uç (`mobile-api:3002`) + gerçek oturum (`dev-session` → Supabase JWT) +
  yerel DB. Cihaz UI turu YAPILAMADI (simülatör penceresine dokunuş/klavye geçmiyor); zincirin
  uç → uygulama katmanı → veritabanı kısmı ölçüldü.

  | # | Tur | Sonuç |
  |---|---|---|
  | 1 | Siparişli **kısmi** kabul (6 kalemden 4'ü; biri eksik 40/48, biri fazla 66/60, biri lotlu) | 4 parti · uyarı 2 · fark 4 · sipariş `partially_received` |
  | 2 | Aynı siparişin **kalan** turu | 3 parti · sipariş `received` · bekleyen listeden çıktı |
  | 3 | **Siparişsiz** (plansız) kabul, biri lotlu | 2 parti · `purchase_order_id` null · tedarikçi bağlı |
  | 4 | Sınır: boş liste · sıfır adet | `empty` · `invalid_body` — ikisi de doğru reddedildi |
  | 5 | Sınır: geçmiş SKT (DDM ve DLC) · kapanmış siparişe tekrar kabul | **kabul edildi** — bulgu 2 ve 3 |

  **İKİNCİ TUR FORMU KALANI VERİYOR — doğrulandı.** Birinci turdan sonra beklenen adetler
  ısmarlanan değil KALAN oldu (fazla gelen satır 0'a indi). Sözleşmenin künyesinde yazan davranış
  ölçümle tuttu.

  **BÜTÜNLÜK TEMİZ.** 16 parti ↔ 16 `intake` hareketi (birebir) · partisiz hareket 0 · hareketsiz
  parti 0 · `initial_qty <> physical_qty` 0 · deposuz parti 0 · SKT'siz DLC partisi 0.
  Toplamlar: `stock_intake` 5→11 · `stock_movement` 80→92 · `stock` 210→222.

  ### Bulgu 1 — kabulü KİM yaptı kayıtlı değil
  `stock_movement.actor_id` mal kabulde **hiç yazılmıyor**: `intake` türünün 29/29'unda boş.
  Oysa alan çalışıyor — `sale` 32/32, `write_off` 5/5, `count_diff` 2/2, `counter_sale` 3/3,
  `return_restock` 2/2 dolu. (Transferlerde de boş: `transfer_in/out/cancel` 0/19.)
  Sonucu: "bu malı depoya kim aldı" sorusunun cevabı yok; sayım düzeltmesinde var, kabulde yok.

  ### Bulgu 2 — kapanmış siparişe sessizce ek kabul
  `received` durumundaki siparişe yeni kabul POST'landı ve **kabul edildi**: yeni `stock_intake`
  ve parti oluştu, sipariş `received` kaldı, dönen `differences` boş. Yani sipariş kapandıktan
  sonra gelen mal ne siparişin durumunu değiştiriyor ne de fark raporunda görünüyor. Gerçek
  hayatta ek sevkiyat olur; sorulması gereken, bunun sessiz mi olması gerektiği.

  ### Bulgu 3 — süresi geçmiş DLC "satılabilir" sayılıyor
  Ayrı dosyaya yazıldı (`docs/talep/not-web-satilabilir-stok-gecmis-dlc.md`) çünkü web/katalog
  alanı: `available_stock.available_qty` süresi geçmiş DLC'yi düşmüyor (ayrı sütunda sayıyor) ve
  `catalog/map.ts` yalnız `availableQty` okuyor. Zincirin üçüncü halkası (parti seçimi) ölçülmedi.

  **ANDROID CİHAZDA UI TURU DA YAPILDI (kullanıcı isteği, aynı gün).** iOS simülatöründe dokunuş
  ve klavye geçmiyordu; Android'de `adb` ikisini de güvenilir taşıyor. İki tam kabul yürütüldü:

  · **Siparişsiz:** ürün arandı → seçildi → **adet çekmecesi kendiliğinden açıldı** (21.181'in
    cihazda ilk doğrulaması) → 5 tek paket → SKT "raf ömrü · 365 gün" kısayolundan → lot elle
    yazıldı → kaydedildi. DB: 1 parti, 5 adet, `2027-08-30`, `LOT-ANDROID-UI`, PO bağı yok.
  · **Siparişli (TS-26-EQF7WK):** "say →" **tek dokunuşta** çekmeceyi açtı → "Başka koli boyu"ndan
    **12'lik** seçildi (sahada eklenen boy "YENİ · ürüne kaydedilecek" diye işaretlendi) → 2 koli
    + 6 tek = **"2 × 12 + 6 tek paket = 30 paket"**, beklenenle birebir → SKT "+6 ay" → **hasar
    3 · ezik/kırık** → kaydedildi. DB: 30 adet, `2027-02-28`, kalem bağlı, ve **hasar kabul
    notuna yazılmış**: *"Fıstıklı Baklava · 2500 g: hasarlı 3 · ezik / kırık"* — ekranın vaadi
    tuttu. Kalan kalem olmadığı için sipariş `received` oldu (doğru).

  Ayrıca cihazda görüldü: MLOR uyarısı ("Kalan ömür %50 — uyarı, engel değil"), hasar sayaçlarının
  soru cümlesinin sonunda duruşu (*"sağlam 27 · hasarlı 3"*), sebep çekmecesinin tek seçimi, ve
  API turunun sonucunun listeye yansıması (kapanan sipariş listeden düşmüştü).

  **BULGU 1 UI YOLUNDA DA DOĞRULANDI:** UI'den yazılan iki kabulün ikisinde de `actor_id` boş.

  **BEKLEYEN(21.183):** bulgu 1 ve 2 kararı kullanıcının — aktör kaydı eklenecek mi, kapanmış
  siparişe ek kabul nasıl karşılanacak.

  **BEKLEYEN(21.185):** UI turunda BİR KEZ Fabric çökmesi görüldü, tekrar üretilemedi.

- [x] (21.183) **KABULÜ KİM YAPTI ARTIK YAZILIYOR — `BEKLEYEN(06.14)` kapandı** (kullanıcı kararı 31.08)
  `touches:` `supabase/migrations/0010_supply.sql` · `packages/types/src/entities/supply.schema.ts` ·
  `packages/database/src/services/stock-intake.service.ts` · `packages/application/src/warehouse/intake.ts` ·
  `apps/mobile-api/src/api/v1/warehouse.ts` · `apps/web/lib/warehouse/intake-actions.ts`

  **Bulgu (21.182).** `stock_movement.actor_id` mal kabulde HİÇ yazılmıyordu — `intake` türünün
  29/29'unda boş. Oysa alan çalışıyordu: satış 32/32, imha 5/5, sayım 2/2, kapı satışı 3/3, iade
  2/2 dolu. Sebep RPC'nin kendi künyesinde zaten yazılıydı ve `BEKLEYEN(06.14)` diye
  işaretlenmişti: *"bu RPC aktör parametresi almıyor, `stock_intake` tablosu da kim kabul etti'yi
  hiç tutmuyor."*

  **KİMLİK İKİ YERDE: belgede ve harekette.** `stock_intake.received_by` eklendi
  (`user_profiles`e FK, `on delete set null`) ve `receive_intake` RPC'si `p_actor_id` alıyor; doğan
  her `stock_movement` satırı da aynı kimliği taşıyor. Yalnız harekete yazmak, bir kabulün
  doğurduğu her parti için aynı gerçeği tekrarlamak ve belgeye "kim" diye sorulduğunda
  hareketlerden türetmek olurdu.

  **AKTÖRSÜZ ÇAĞRI HÂLÂ MEŞRU:** parametre varsayılanı `null` ve seed/bakım yolları öyle yazıyor —
  orada gerçek bir kişi yok. Uydurma bir kimlik, defterin bilmediğini biliyormuş gibi göstermesi
  olurdu (CLAUDE §1); boş kalması "bilinmiyor" der.

  **İKİ YÜZEY DE BESLİYOR:** native kapısı `c.get('staff').id`, web eylemi `user.id`. Kimlik
  GÖVDEDEN gelmiyor — istemcinin söylediği bir kimlik, kimliğin kendisi değil bir iddiadır; kapı
  oturumu zaten doğruladı ve gerçeği o biliyor.

  **Doğrulama.** Tip denetimi beş pakette temiz (`types`, `database`, `application`, `mobile-api`,
  `web`) · `docs:check` temiz. **ŞEMA DEĞİŞTİ:** `db:refresh` gerekiyor ve o kullanıcının kararı —
  tazelenene kadar yeni kabullerde alan hâlâ boş kalır.

  **KAPANMIŞ SİPARİŞE EK KABUL AÇIK BIRAKILDI** (kullanıcı kararı 31.08): 21.182'nin ikinci
  bulgusu — `received` siparişe yeni kabul sessizce yazılabiliyor. Kullanıcı bu konuyu şimdilik
  gündeme almadı; kayıt burada duruyor.

- [x] (21.184) **KUTUSUZ AKIŞ KAPANDI · İMZA SÖKÜLDÜ · MAL ADIMI İSTİSNA OLDU** (kullanıcı kararları 30.08)
  `touches:` `supabase/migrations/0013_settings.sql` · `packages/application/src/{warehouse/preparation.ts,courier/{day.ts,delivery.ts}}` ·
  `packages/types/src/contracts/courier-api.schema.ts` · `scripts/seed/{orders.ts,courier.ts}` ·
  `apps/mobile/src/screens/courier/{delivery-screen.tsx,use-delivery.hook.ts,messages.json}` ·
  `apps/web/app/(operations)/operations/settings/settings-catalog.ts`

  Üç karar, tek zincir — hepsi kullanıcının sorularından çıktı ve hiçbirinin savunulacak cevabı yoktu.

  **1 · KUTUSUZ SİPARİŞ DİYE BİR KAVRAM YOK.** *"Kutusuz sipariş arabaya nasıl bindiriliyor?"*
  Ölçüldü: binmiyordu, "bindi" sayılıyordu — `startCourierDay` kutusuz siparişi hiç okutmadan
  `out_for_delivery` yazıyor, teslim kapısı da okutma istemiyordu. Yani mal → kutu → araç → kapı
  zinciri siparişlerin **%93'ünde** devre dışıydı (44 rota siparişinin 41'i kutusuz). 23.6'nın
  *"bilinçli çift akış"* kararı bir iş kuralı değil, kutulu akış yazılırken kendi kodumuzu kırmamak
  için bırakılmış sekiz günlük bir geçiş kapısıydı — ve greenfield'de korunacak bir geçmiş yok.
  **Üç kapı da sıkılaştı:** hazırlık kutusuz `ready` yazmıyor (`box_required`, kural kargodan rotaya
  genişledi; ayrım teslim türünde değil HAZIRLIĞIN kendisinde — kapı satışında toplama adımı yok),
  yükleme kutusuzu yola çıkarmıyor, teslim kutusuz teslimi reddediyor. Seed'in hazırlık adımı artık
  gerçek kutu açıp mühürlüyor; **yarım kalmış hazırlık = açık kutu** oldu (`preparing` kovası böyle
  doluyor). Ölçüm: rota 36/36 kutulu · kargo 10/10 kutulu · kapı satışı kutusuz (doğru).

  **2 · İMZA KALKTI.** *"Kullanıcının kendi orijinal imzasını atıp atmadığını bile bilmiyoruz — bu
  hukuki olarak bir anlam ifade ediyor mu?"* Ekrana parmakla çizilen şekil nitelikli elektronik imza
  değil ve imzalayanın kimliğini kanıtlamıyor. Yerine zaten daha güçlü bir kayıt vardı: kutu
  okutması (`box_scan`) — kod benzersiz, kutu fiziksel, okutma o kapıda ve o saniyede. Kanıt adımı
  ekrandan söküldü (`signature-pad.tsx` · `signature-capture.ts` silindi, istemcinin yükleme
  sarmalayıcıları da), ayarın fabrika değeri iki kanalda da kapatıldı. **Sunucu ucu ve kayıt şeması
  DURUYOR** — kapsam yine açılabilir ve backlog'daki WhatsApp OTP yolu aynı altyapıyı kullanır.

  **3 · MAL ADIMI KAPI OLMAKTAN ÇIKTI.** *"Bu mal kalem adımı neden var? Böyle bir şeye ihtiyacımız
  var mı?"* Vardı ama yanlış kurulmuştu: teslim kapısı HER kalemin tek tek işaretlenmesini şart
  koşuyordu (`allMarked`), yani hiçbir şey reddedilmeyen normal bir teslimde kurye kalem sayısı
  kadar gereksiz dokunuş yapıyordu — elinde kutuyla, kapının önünde. Kutu okutması zorunlu olunca
  "mal verildi mi" sorusu zaten cevaplanıyor. Model artık tek sayı: **kalem başına reddedilen adet**
  (kayıt yoksa teslim edilmiştir). İstisna kullanıcının tarif ettiği çekmeceden giriliyor —
  kutulardaki ürünler listelenir, hangisinden kaç adet geri verildiği seçilir. Mal kartı bir ÖZET:
  "Hepsi teslim edildi" ya da geri verilenlerin listesi. Sıra cümlesi de kısaldı:
  `Sıra: kutular → mal → tahsilat`.

  **Doğrulama.** `pnpm typecheck` · `lint` · `knip` temiz · birim **1860/1860** · kurye jest
  **96/96** · mobil kurye+kit **347/347** · `db:refresh` kutulu akışla yeniden kuruldu ve 166
  kovanın hepsi doldu. Web ayar sözlüğü de fabrika değeriyle hizalandı (o testi kırmıştı).
  **BEKLEYEN(21.184):** cihaz turu — kutulu durakta reddedilen kalem çekmecesi ve imzasız akış
  görsel olarak doğrulanacak.

- [ ] (21.185) **FABRIC ÇÖKMESİ — İNCELEME DURDURULDU (kullanıcı kararı 31.08)**

  **Kullanıcı kararı:** ağaçta paralel çalışan BAŞKA bir ajan var ve çökme onun değişikliklerinden
  geliyor olabilir; şimdilik incelenmeyecek, yalnız kayıt tutulacak.

  **31.08 gözlemi — arıza mal kabule ÖZGÜ DEĞİL:** aynı çökme D3'ten (yakın-SKT) hub'a dönerken de
  geldi. Yani tetikleyici bir ekranın kendisi değil, EKRAN GEÇİŞİ. Önceki eleme sonuçları geçerli:
  benim commit'siz değişikliklerimden değil (dört dosya HEAD'e döndürüldü, çökme sürdü).

  ### Eski kayıt — plansız ekrandan geri dönüşte, BİR KEZ (gözlem 30.08)
  `touches:` `apps/mobile/src/screens/warehouse/intake-screen.tsx` · `apps/mobile/src/components/ui/bottom-sheet.tsx`

  **Gözlem.** Android UI turunda (21.182) şu yolda uygulama çöktü: plansız kabulde ürün eklendi →
  geri → mal kabul listesi → siparişli sevkiyata girildi. Hata:

      java.lang.IllegalStateException: addViewAt: failed to insert view [156] into parent
      Caused by: The specified child already has a parent
        at ReactClippingViewManager.addView

  **Tekrar üretilemedi:** yeniden yükleyip aynı yol iki kez yürütüldü, çökme gelmedi ve tur
  sonuna kadar tamamlandı. Bu yüzden sebep KANITLANMADI ve müdahale de edilmedi (CLAUDE §0).

  **Şüpheliler (hiçbiri ölçülmedi):** (a) 21.181'de arama çekmecesi tek tanımlanıp iki blokta
  çizilir oldu — aynı element iki JSX ağacında; (b) plansız kabulün liste boş/dolu blokları
  arasındaki geçiş bir `Modal` sökümüyle aynı pencereye düşüyor — projede kayıtlı arıza sınıfı
  (`staff-menu.tsx` künyesi). Tekrar görülürse önce (a) elemesi yapılmalı: çekmeceyi iki blokta
  ayrı ayrı tanımlayıp fark ölçülür.

- [x] (21.186) **KABUL SONUCU TOAST'A TAŞINDI VE EKRAN KAPANIYOR** (kullanıcı bulgusu 30.08)
  `touches:` `apps/mobile/src/screens/warehouse/{use-intake.hook.ts,intake-screen.tsx,intake-screen.test.tsx}`

  **Bulgu.** Kabul kaydedilince ekranda kalıyor, yalnız yeşil bir şerit çıkıyordu ("Kabul yazıldı
  — 3 parti açıldı"). Kullanıcının gördüğü şey *"hiçbir şey olmadı"* idi: iş bitti ama ekran
  bitmedi. Üstelik uygulamanın **zaten bir toast katmanı var** (`app/_layout` `ToastHost`,
  `lib/toast/toast-store`) ve mal kabul onu hiç kullanmıyordu.

  **İkisi birbirine bağlı, o yüzden birlikte düzeltildi:** ekran kapanacaksa bildirim ekranda
  duramaz — kapanan ekrandaki şeridi kimse okuyamaz. Sonuç artık kabuğun toast katmanında; depocu
  sevkiyat listesine döndükten sonra da görüyor ve siparişin listeden düştüğünü aynı anda
  görüyor.

  **ÜÇ DAL, ÜÇ DAVRANIŞ:**
  · **tam kabul** → toast + `router.back()` (ekran kapanır; bu ekranda yapılacak iş kalmadı)
  · **kısmi kayıt** → toast + `reload()` (ekran KAPANMAZ: kalan satırlar depocuyu bekliyor, ama
    sunucu kalanları yeniden hesapladı ve ekrandaki "beklenen"ler bayat kaldı)
  · **hata** → şeritte kalır (ekran kapanmıyor ve mesaj KALICI olmalı; geçip giden bir toast'ı
    depocu tekrar denemeden önce okuyamaz)

  Gezinme kararı EKRANDA, hook'ta değil: `submit` bir `onDone` geri çağrısı alıyor — bir hook
  rota bilmez, bilseydi aynı akış ikinci bir ekrandan çağrıldığında yanlış yere giderdi.

  **Doğrulama.** `typecheck` · `lint` temiz · depo **187/187**; iki yeni test: *"TAM kabul: toast
  basılır ve ekran KAPANIR"* ve *"KISMİ kayıt: ekran kapanMAZ"*. Cihaz turu YAPILMADI — cihazda
  başka bir ekran açıktı.

- [x] (21.187) **KAPIDA AKIŞ: İŞ BİTİNCE LİSTEYE DÖNÜŞ · YOLA ÇIKMAMIŞ DURAK · NAVİGASYON ESNEMESİ** (kullanıcı bulguları 30.08 · cihazda ölçüldü)
  `touches:` `apps/mobile/src/screens/courier/{delivery-screen.tsx,use-delivery.hook.ts,messages.json}` ·
  ~~`scripts/seed/orders.ts`~~ — dosya 01.09'da SİLİNDİ: besleme artık hiç sipariş yazmıyor
  (kullanıcı kararı; künye `scripts/seed.ts` → §SİPARİŞ). O turda seed'e yazılan fikstür de
  onunla birlikte kalktı; ekran tarafındaki iş yerinde duruyor.

  **1 · SONUÇ TOAST'A, EKRAN LİSTEYE DÖNÜYOR.** Teslim/ulaşılamadı/kabul etmedi yazıldıktan sonra
  ekran "sonuç ekranı"na dönüp KALIYORDU (v2:882'nin bilinçli sapması: *"kurye 'yazıldı mı?'
  sorusunun cevabını okur, sonra listeye döner"*). Kullanıcı cihazda denedi: *"durak sayfasından
  geri çıkmıyoruz"* — kurye okuyacak bir şey olduğunu anlamıyor, geri tuşunu arıyor ve bunu günde
  onlarca kez yapıyor. Cevap kaybolmuyor: toast (`toastSuccess`) mesajı listenin üstünde taşıyor ve
  liste odakta zaten tazeleniyor, yani sonuç durağın kendi satırında da okunuyor.

  **2 · YOLA ÇIKMAMIŞ DURAK KAPIDA AÇILMIYOR** — asıl arıza buydu. Kutuları rampada okutulmamış
  sipariş `ready` kalır, yani araçta değildir. Ekran bunu bilmiyordu: durağı açıyor, kutuyu "kapıda
  okutturuyor", teslim düğmesini ETKİN gösteriyordu; kurye basınca uç `stale` diyor ve ekran o reddi
  olduğu gibi yazıyordu — *"bu durak başkası tarafından kapatılmış olabilir"*. Cümle teknik olarak
  doğru ama kapıdaki kuryeye YANLIŞ hikâye anlatıyor: durağı kimse kapatmadı, mal araçta değil.
  Cevap zaten sözleşmede duruyordu (`boxes[].loadedAt`); kapı artık orada kapanıyor ve sebebi
  kuryenin dilinde yazıyor: *"Bu durağın kutuları araca binmemiş — rampada okutulmadan teslim
  edilemez."*

  **3 · NAVİGASYON ESNEMESİ — `grow`, stil değil.** Düğme `styles.contact` içinde `flex: 1`
  taşıyordu ve o stil DIŞ Pressable'a hiç ulaşmıyor (kitin kendi künyesi: *"esneyecek düğme `grow`
  verir, stiline flex yazmaz"*). Ölçüldü (uiautomator, cihaz yoğunluğu 408 dpi): iletişim satırı
  içerik genişliğinin yarısında kalıyordu — Navigasyon **76 dp**, satır 178/380. Düzeltmeden sonra
  Navigasyon **260 dp**, kareler tam **52 dp**, satır tam genişlik.

  **4 · SEED'DE KAPIYA HAZIR DURAK.** Kutu zorunluluğu (21.184) gelince ölçüldü: bugünün seferinde
  teslim edilebilir TEK durak kalmamıştı — hiçbirinin kutuları tam binmemişti, yani seed'in ürettiği
  gün kuryenin hiçbir işi bitiremeyeceği bir gündü. Yarım yüklü durak yerinde KALDI (yükleme
  ekranının "hepsi binmedi" hâli onunla görülüyor); yanına kutusu araca binmiş ve son okutmayla yola
  çıkmış bir durak eklendi. Teslim · kısmi iade · ulaşılamadı · kabul etmedi akışlarının hepsi artık
  denenebiliyor.

  **Doğrulama.** `pnpm typecheck` · `lint` temiz · birim **1869/1869** · kurye jest **98/98** (iki
  yeni test: araca binmemiş durakta kapı kapalı; sonuç toast'a gidip ekran listeye dönüyor —
  `mockBack` ile ölçüldü). `db:refresh` yeniden koşuldu, 166 kova dolu.
  **BEKLEYEN(21.187):** cihaz turu — `db:refresh` oturumu düşürdüğü için akış uçtan uca yeniden
  denenmeli (giriş kullanıcıda).

- [x] (21.188) **D3 YAKIN-SKT GERÇEK VERİYE BAĞLANDI — fikstür söküldü, uç açıldı** (kullanıcı isteği 31.08)
  `touches:` `packages/types/src/contracts/warehouse-api.schema.ts` ·
  `packages/application/src/warehouse/near-expiry.ts` · `apps/mobile-api/src/api/v1/warehouse.ts` ·
  `apps/mobile/src/screens/warehouse/{near-expiry-screen.tsx,use-near-expiry.hook.ts,warehouse-hub-screen.tsx,use-warehouse-hub.hook.ts}`

  **Durum.** Ekran `NEAR_EXPIRY_FIXTURE` ile çiziliyordu ve gerekçesi kendi künyesinde yazılıydı:
  *"kapısı yok — ekranın kendisi TAM yazıldı, o gün yalnız veri kaynağı değişir."* O gün geldi.

  · **Sözleşme:** `NearExpiryBatchSchema` — parti başına satır (ürün değil: aynı ürünün iki partisi
    iki ayrı karar bekler). **Para YOK** ve bu şemanın değil kapının kararı: motor fiyat üretiyor,
    dönen tip taşımıyor (depo yüzeyi tutar görmez).
  · **Motor:** `listNearExpiry` — partileri ve eşikleri okur, `toBatchViews`e verir, `decision`
    süzgecini SUNUCUDA uygular (ekran binlerce parti indirip elemesin) ve aciliyete göre sıralar.
  · **Uç:** `GET /api/v1/warehouse/near-expiry`, depo zorunlu.
  · **Ekran:** fikstür söküldü, yapı değişmedi. **Kapının dili ekranın dili oldu** — ekranın kendi
    eş anlamlıları (`offer_candidate`, `discard`) silindi; ikinci bir adlandırma aynı kavramı iki
    dilde yaşatmaktı.
  · **Hub kartı** da gerçek sayıyı yazıyor; okunamazsa "okunamadı" der, sayı uydurmaz.

  **BİR ÖLÇÜM, BİR DÜZELTME:** D3 okuması önce `trackWarehouse`tan geçiriliyordu; üç hub testi
  birden düştü. Sebep: `trackWarehouse` HER çağrının sonucunu paylaşılan depo durumuna yazıyor ve
  başarılı bir D3 okuması, hazırlık kuyruğunun çevrimdışı sinyalini eziyordu. Sayaç bir ROZETTİR
  (devir sayacıyla aynı gerekçe) — durum sinyaline karışmaz.

  **KART ARALIĞI (kullanıcı bulgusu):** satır v3'te karta dönüşmüştü ama listede `gap` hiç yoktu —
  kartlar bitişik çiziliyordu. Kart bir yüzeydir; yüzeyi yüzeyden ayıran şey aradaki boşluktur.

  **Doğrulama.** Tip beş pakette temiz · lint temiz · mobil **964/964** (D3 ekranı 8, hub kartı 2
  yeni test). **Cihazda ölçüldü:** 10 parti gerçek veriden geldi, aciliyet sırası doğru (en çok
  geçmiş üstte), imhalık satır kırmızı zeminde ve kendi bağıyla, ömür çubukları üç tonda.

  **BEKLEYEN(21.188):** DLC/DDM ayrımı hiçbir ekranda görünmüyor — "geçti" yazan satırın imhalık mı
  satılabilir mi olduğu okunmuyor. Sözleşme `dateType` taşımıyor.

- [x] (21.189) **YÜKLEME "YOLDA" DEMEK DEĞİL — araç bir ara depo oldu** (kullanıcı kararı 31.08)
  `touches: packages/application/src/courier/load.ts · packages/types/src/contracts/courier-api.schema.ts · apps/mobile/src/screens/courier/use-courier-day.hook.ts`

  **Durum: kapının yarısı yazıldı, ekranlar sırada.** Kullanıcı modeli kurdu: *"bir çeşit araba ara
  depo gibi oluyor ve içinde birden fazla sefere ait sipariş taşıyor. Ve kurye istediği bir seferi
  başlatabiliyor."* İki senaryo: (a) rota hesaplayıcı dağ bölümünü ayrı rota veriyor, ikisi birlikte
  yükleniyor; (b) araç iki-üç günlük yola çıkıyor, rotalar tek günlük olduğu için ileri günlerin
  seferleri de bugünden araca giriyor.

  **Sökülen kaynaşma.** `loadBox` son kutuda `ready → out_for_delivery` yazıyordu; yükleme ile sefer
  başlatma tek ele bağlıydı. Bedeli ölçüldü ve İKİ TANEYDİ: (1) yarının seferinin kutusunu bugün
  okutmak o siparişleri bugün yola çıkarır ve müşteriye "yoldayım" der; (2) kutu zorunluluğu
  (21.184) gelince `startCourierDay`ın `started` listesi ULAŞILAMAZ hâle geldi — kutusu yüklenen
  sipariş bu kapıdan çoktan çıkmış oluyordu, sefer başlatmaya iş kalmıyordu. Testler bunu yakaladı.

  Geçişin tek sahibi artık `startCourierDay`. Sözleşmedeki `orderStarted` alanı **`allBoxesLoaded`**
  oldu — adı da artık doğru olanı söylüyor: "siparişin tamamı araçta", "yola çıktı" değil. Ekran
  metni de düzeldi (`loadedStarted` → `loadedComplete`): kuryeye olmayan bir şey haber verilmiyor.

  **Kutu duvarı kararı (a) alındı.** `confirmPreparation` `pickup` dışında her siparişe `box_required`
  diyor ve öyle kalıyor — bu modelde kutu merkezî. Web hazırlık masasının kutu adımı eksiği o şeride
  `docs/talep/not-web-hazirlik-kutu-adimi.md` ile bildirildi.

  **Test kapsamı yer değiştirdi, kaybolmadı.** `confirmPreparation` üzerinden ölçülen altı davranış
  (HAZIR geçişi, yarım iş, kilitli kalem ihlali, eksik tavsiyesinin iki dalı) artık gerçek kapıda:
  `warehouse/boxes.test.ts` + `domain-core/stock/shortfall.test.ts`. Kapıya kapsam kararı, bilinmeyen
  sipariş ve duvarın kendisi kaldı. **Tam paket: 4004/4004 yeşil.**

  **BEKLEYEN(21.190):** ekranlar hâlâ tek sefer varsayıyor — `/day` sefer LİSTESİ dönmüyor, durakta
  `runId` yok, "sefer kur" ile "sefer başlat" ayrımı arayüzde yok. Tasarımı geldi (v3:15 Araçtaki
  Seferler, 16 Sefer ve Araç, 17 Araca Yükleme, 13 Kurye Dönüşü); iş 21.190'da.

- [x] (21.190) **KURYE ANA EKRANI: ÇOKLU SEFER · SEFER KUR ↔ SEFER BAŞLAT** (v3:13-18 · kullanıcı kararı 31.08)
  `touches: packages/application/src/courier/* · packages/types/src/contracts/courier-api.schema.ts · apps/mobile-api/src/api/v1/courier.ts · apps/mobile/src/screens/courier/*`

  Tasarım hazır ve modeli birebir taşıyor. Yapılacaklar sırasıyla: (1) `start_delivery_run` RPC'sini
  ikiye böl — sefer KUR (`departed_at` null, claim yapar ki kutu okutulabilsin) ve sefer BAŞLAT
  (`departed_at` + `out_for_delivery` + müşteri bildirimi); kolon zaten nullable. (2) `/courier/day`
  tek `run` yerine araçtaki seferlerin LİSTESİNİ dönsün. (3) `CourierStopSchema`ya `runId` + rota adı
  (durakta bugün rota kimliği YOK, iki seferin durağı karışık tek listede geliyor). (4) Ekranlar:
  14'ün üç hâli, 15 Araçtaki Seferler, 16 çoklu seçim + araç, 17 sefere göre gruplu yükleme.

  **Durum (31.08) — ADIM 1 BİTTİ: veri ve kapı ayrıldı.** `start_delivery_run` ikiye bölündü ve
  üçlü tamamlandı: **`open_delivery_run`** (sefer KURULUR — satır doğar, siparişler damgalanır,
  `departed_at` NULL kalır, kutular okutulabilir) → **`depart_delivery_run`** (yola çıkar, damga
  vurulur) → `close_delivery_run` (kapanır). Kolon zaten nullable'dı; migration'ın kendi notu bunu
  öngörmüştü: *"V1'de start tek harekettir; yükleme ayrı bir an olursa ayrışır."*

  Uygulama kapısı `startCourierDay` **tek kapı olarak korundu**, `depart` bayrağıyla: rota çözümü,
  claim ve kapsam kararı ikisinde de aynı — iki ayrı kapı yazmak o üç kararı kopyalamak olurdu
  (CLAUDE §1). `depart:false` kurar (dört liste boş döner, geçiş yok), varsayılan `true` yola çıkarır.

  **Yan bulgu, düzeltildi:** başlamamış sefer kapatılınca `delivery_run_times` kısıtı ham bir
  veritabanı hatası fırlatıyordu. `close_delivery_run` artık kendi cevabını veriyor: `not_departed`.

  Ölçüldü: **4006/4007** — kalan tek düşük adres/geo şeridinin `address_city_mismatch` işinden,
  dokunulmayan dosyalarda.

  **Durum (31.08) — ADIM 2+3 BİTTİ: gün cevabı GÜNE değil ARACA bakıyor.** `/courier/day` artık
  `runs` taşıyor (kurulmuş + kapanmamış seferlerin hepsi, gün sırasıyla) ve duraklar o KÜMEDEN
  geliyor. `run` alanı kaldı ama daraldı: *"şu an hangisini sürüyorum"* — yola çıkmış ve kapanmamış
  olan. Durak sözleşmesi `runId` + `runLabel` kazandı; liste sefere göre gruplanabiliyor.

  **Ölçülen üç sonuç.** (a) Yarının seferi bugünden yüklenip görünebiliyor — güne süzülseydi o
  kutular hiçbir ekranda çıkmazdı. (b) Durak sırası artık SEFER BAŞINA uygulanıyor: tek `stopOrder`
  bütün listeye uygulanınca ikinci seferin durakları numarasız kalıyor ve birincinin numaraları
  onların üstüne taşınıyordu. (c) Sefersiz sipariş gün listesinde GÖRÜNMÜYOR — doğru davranış:
  kurye rotasını seçene dek ekran rota seçimi gösterir (v3:14 "Araçta sefer yok").

  Künye kurulumu tek yere indi (`detailOf`): tekil ve çoğul okuma ayrı kurulsaydı biri bir gün
  araç ya da depo adını eksik döndürür, ekran hangisinden geldiğine göre farklı davranırdı.

  **Durum (31.08) — ADIM 4 BİTTİ: ekranlar modeli taşıyor.**

  **Gün ekranının ÜÇ hâli var artık** (v3:14). Eskiden ikiydi — sefer ya vardı ya yoktu — ve
  "kurulmuş ama başlamamış sefer" diye bir şey de yoktu. Kutular yüklenmiş ama hiçbir sefer
  başlatılmamışken ekran boş seçim gövdesini gösteriyordu: **araçtaki mal hiçbir yerde
  görünmüyordu.** Üçüncü hâl bunu kapattı.

  **`/van-runs` yeni ekran** (v3:15 · `van-runs-screen.tsx`): araçtaki seferler, her biri kendi
  hâliyle (bekliyor · sürülüyor) ve kendi "Seferi başlat" düğmesiyle. Düğmenin altında bedeli
  yazılı — durakları açar VE müşteriye bildirim gider. Sürülen seferde o düğme HİÇ çizilmiyor;
  basılamayacak bir düğme kuryeye olmayan bir yol vaat etmektir.

  **Seçim gövdesi çoklu oldu** (v3:16): kurye bugünün, yarının ve sonraki günün seferlerini
  birlikte işaretliyor, araç da buradan seçiliyor (`GET /courier/vehicles` — kendi deposuna
  künyeli, aktif olanlar). Düğme artık **kurar**, başlatmaz: `depart:false`. Sefer başına ayrı
  istek gidiyor ve bu bilinçli — seferler birbirine bağlı değil, biri açılamazsa ötekiler açılmalı.

  **Duraklar sefere göre gruplu** (v3:14 "DURAKLAR · SEFERE GÖRE"). Grup başlığı yalnız birden
  çok sefer varken çiziliyor: tek seferde başlık, olmayan bir ayrımı duyurmak olurdu.

  **MOBİL TESTLER `pnpm test`'İN DIŞINDA — ölçüldü ve önemli.** Jest ayrı koşuyor
  (`apps/mobile` · `npx jest`) ve vitest paketi 4007/4007 yeşilken mobil tarafta **11 gerileme**
  duruyordu. Kurye ekran testleri artık 94/94; fikstürün varsayılanı kutulu olduğu için kutuyu
  KONU ETMEYEN testlere `boxes: []` bilinçle geri kondu.

  **Dört listenin cümlesi ekran değiştirdi.** Kısmi başarı (atlanan · bayat · kutu bekleyen)
  eskiden gün ekranının düğmesinde ölçülüyordu; o düğme artık sefer kuruyor ve kurulan seferde
  hiçbir durak yola çıkmıyor — dört liste tanım gereği boş. Ölçüm `van-runs-screen.test.tsx`e
  taşındı; cümleyi kuran kod da ortak (`noticeOfStart`), yani iki kapı bir gün ayrışamaz.

  **Kapanmış sefer artık `/courier/day`den HİÇ dönmüyor** — ne `run` ne `runs` içinde. İşi
  bitmiştir, kutuları da inmiştir (v3:13'ün kuralı). "Neyi bitirdim" sorusunun yeri gün özeti.

  **BEKLEYEN(21.190):** `loadBox` hâlâ `order.courierId` okuyor, sefere değil — aynı kuryeye damgalı
  BAŞKA rotanın kutusu sessizce biniyor ve o durak gün listesinde hiç görünmüyor (bölge süzgeci).
  Ölçüt `delivery_run_id` olacak; kolon zaten var ve `open_delivery_run` onu da yazıyor.

- [x] (21.191) **D3'E İMHA EYLEMİ · DLC/DDM AYRIMI · SKELETON YAPISI** (tasarım güncellemesi 31.08 · A maddesi)
  `touches:` `packages/types/src/contracts/warehouse-api.schema.ts` ·
  `packages/application/src/warehouse/near-expiry.ts` ·
  `apps/mobile/src/screens/warehouse/{near-expiry-screen.tsx,use-near-expiry.hook.ts,messages.json}`

  **Tasarım güncellendi ve üç ekran geldi** (D3 güncelleme · D4 sayım baştan · D4b stok düşümü) +
  **ayrı bir akış haritası sayfası** (`Akis Haritasi - Depo.dc.html`). Bu satır A maddesini kapatıyor.

  ### 1 · DLC / DDM ayrımı — eksiğin en tehlikelisi
  Ekran doğru kararı gösteriyordu ama SEBEBİNİ söylemiyordu: *"6 gün (geçti)"* yazan bir satırın
  kararı "teklife girebilir" olabiliyor ve depocu bunu görünce **satılabilir malı imha edebilirdi**.
  Sözleşme `dateType` taşımıyordu. Artık taşıyor ve satır üç şeyi birden söylüyor: rejim rozeti
  (`DLC`/`DDM`/`ÖMÜR YOK`), rejimin ne demek olduğu, ve sonucu — *"geçti — satılamaz"* /
  *"geçti — satılabilir"*. Kural listenin başında da yazılı.

  ### 2 · İmha artık D3'ün kendi eylemi (akış kuralı 2)
  Satır depocuyu D4'e gönderiyor, orada sebebi ELLE "süresi geçti" diye seçtiriyordu — sistemin
  zaten bildiğini yeniden sormak. Artık düğme satırda, çekmece **yalnız adet** soruyor
  (*"Sebep sorulmaz: süresi geçti"*), bağlam iki sayı: partide kalan + ürünün depodaki toplamı.
  **Yeni uç açılmadı:** yazılan şey aynı (bir partiden adet düşmek), kapı D4'ünkiyle aynı
  (`POST /warehouse/adjustments`, `reason: 'expired'`). Değişen tek şey sebebin NEREDE belirlendiği.

  Kayıttan sonra **ekran kapanmıyor**: satır "İMHA EDİLDİ"ye dönüp referansı taşıyor, tur devam
  ediyor. D3 → D4 bağı kalktı.

  ### 3 · Rozet ağırlığı
  Yalnız imha DOLU kırmızı zeminle eyleme çağırıyor; teklif hâlleri sessiz — depocuya iş
  vermiyorlar (oran yönetimde onaylanır). DDM'si geçmiş satılabilir parti artık "teklife girebilir"
  değil **"indirimli satılır"** diyor: tarihi geçmiş ama satılabilir mal, bekleyen bir aday değil
  bugün rafta duran bir gerçektir.

  ### 4 · SKELETON YAPISI (kullanıcı isteği)
  Ekran fikstürle çalışırken tek hâli vardı: dolu liste. Gerçek kapıya bağlanınca üç hâl doğdu ve
  hiçbiri çizilmiyordu. Üçü de eklendi ve üçü ayrı şey söylüyor: **skeleton** (halka değil — ölçü
  satırın kendi yüksekliği, veri gelince sayfa zıplamasın), **hata** (tekrar dene ile), **boş liste**
  (*"karar bekleyen parti yok"* — iyi haber, hata bloğuyla karışmamalı).

  **ÖLÜ KOD SÖKÜLDÜ:** `useOperationsScrollBinding` tüketicisiz kalmıştı (`knip`) — kabuğa
  bağlanacak ilk `FlatList` ekranı onu yeniden açar.

  **Doğrulama.** Tip · lint · **knip temiz** · mobil **968/968** (D3 ekranı 12 test: üç hâl, rejim
  ayrımı, imha akışı). **Cihazda uçtan uca ölçüldü:** DDM satırı "indirimli satılır", DLC satırı
  "İMHA EDİLMELİ" + kırmızı düğme; imha yazıldı → `IMH-STR-26-0001`, parti 5 → 0, hareket
  `write_off`/`out`/`expired`, **aktör Deniz Arslan** (21.183 burada da çalışıyor). Satır
  "İMHA EDİLDİ"ye döndü, ekran kapanmadı; liste tazelenince o parti düştü.

  **~~BEKLEYEN(21.192): tasarımın B ve C maddeleri — D4 sayım baştan (hedef değer + bağlam + sonuç
  hâli) ve D4b stok düşümü (yeni ekran, hasar · soğuk zincir · kayıp).~~ → İKİSİ DE YAZILDI (21.222,
  02.09):** sayım mutlak adet soruyor ve farkı sistem buluyor, düşüm kendi ekranında.

- [x] (21.192) **D3 SAF DEPOCU EKRANI OLDU — teklif bilgisi ve ömür yüzdesi söküldü** (kullanıcı kararı 31.08)
  `touches:` `apps/mobile/src/screens/warehouse/{near-expiry-screen.tsx,near-expiry-screen.test.tsx,messages.json}`

  **Kullanıcının sorusu:** *"Bu sayfa kim için? İndirim bilgisi depocu için önemli mi? Yönetici
  depo ekranına girip teklif aç diyebilmeli mi?"*

  **ÖLÇÜM.** Uç `warehouse` ve `admin` rollerine açık, yani bugün ikisi de giriyor. Ama teklif
  kararının kendi yolu ZATEN VAR ve yönetimde: **Y3 · Yakın-SKT Teklifi**
  (`management/offer-approval-screen`, `/management/offers`) — indirim çipleri, toplu onay, günde
  bir kez verilen karar. Web'de de aynısı (`stock-client.tsx` → `onOpenOffer`). D3'e "teklif aç"
  koymak, aynı kararı ikinci bir yerden verdirmek olurdu.

  **KARAR (kullanıcı, 1. seçenek): D3 saf depocu ekranı.** Ekran iki kitleye birden konuşuyordu —
  fiziksel tura çıkan depocu ve fiyat kararı veren yönetici. Bir ekranın kime konuştuğu belirsizse
  ikisine de yarım hizmet eder.

  **SÖKÜLENLER** (depocuya iş vermiyorlardı):
  · teklif rozetleri (*"teklif açık"*, *"teklife girebilir"*, *"indirimli satılır"*) — rozet artık
    yalnız imha hâllerinde çiziliyor: **İMHA EDİLMELİ** ve **İMHA EDİLDİ**;
  · **ömür yüzdesi ve çubuğu** — aciliyeti zaten *"4 gün kaldı"* söylüyor, yüzde bir fiyat/teklif
    ölçütü;
  · başlıktaki **"%30 öneri indirimi"** — fiyat parametresi. Alt metin artık işi anlatıyor:
    *"ömrü azalan partiler · imhalık olanı buradan düş."*

  **KALANLAR** (hepsi depocunun işi): ad · adet · **raf** · tarih rejimi (DLC/DDM) ve ne demek
  olduğu · sonucu (*"geçti — satılamaz/satılabilir"*) · kalan gün · imha düğmesi ve referansı.

  Liste SÜZGECİ değişmedi: ömrü azalan partilerin hepsi görünüyor — depocu onları rafta öne
  almalı, yalnız imhalık olanı düşürüyor.

  **Doğrulama.** Tip · lint · **knip temiz** (ömür çubuğuyla birlikte üç stil, `LIFE_TONE`,
  `verdictOf` ve bağımsız olarak `ScannedCode` ölü kaldı, söküldü) · depo+komponent **448/448**.
  İki yeni test ayrımın KANITI: *"teklif rozeti çizilmez"* ve *"ömür yüzdesi çizilmez — aciliyeti
  kalan gün söylüyor"*; biri geri koyarsa kırılırlar.

- [~] (21.193) **KURYE ROTASI CİHAZDA: BESLEME ÜÇ HÂLİ ÜRETİYOR · TASARIM ÖLÇÜLERİNE OTURDU** (kullanıcı isteği 31.08)
  `touches: scripts/seed/courier.ts · apps/mobile/src/screens/courier/* · apps/mobile/src/components/{operations/status-badge,ui/primary-button}.tsx`

  **BESLEME EKRANI KAPSAMIYORDU — ölçüldü.** Sefer/başlat ayrımı yazıldı ama seed yalnız
  "başlatılmış" hâli üretiyordu: ileri günün seferi TAMAMEN atlanıyordu (`grup.date > bugun →
  continue`) ve bugünün rotalarının hepsi sürülüyordu. Yani "araçta bekleyen sefer" ve onun
  "Seferi başlat" düğmesi hiçbir hesapta denenemiyordu. Şimdi ileri günün seferi KURULUYOR ama
  başlatılmıyor, ve bugünün rotalarından biri de öyle.

  **HOLDBACK KURYE BAŞINA, ve bunu da cihaz söyledi.** İlk yazımda bugünün ikinci rotası küresel
  olarak bekletiliyordu; cihazda bakınca o rota BAŞKA kuryeye çıktı ve giriş yapılan hesabın
  aracındaki iki sefer de sürülüyordu. Kural artık kuryeye bağlı. Sonuç: `hepsi@` hesabı bugünün
  bekleyen seferini, `kurye@` ise ileri günlü çoklu seferi gösteriyor.

  Ayrıca sefere ARAÇ atanıyor — künye araçsızdı ve ekran "araç atanmamış" yazmak zorundaydı.

  **CİHAZDA YAKALANAN İKİ ARIZA.** (1) Sefer başlatınca ekran durak listesine dönüyor ve yeni
  seferin kutuları rampada kalıyordu: yükleme kapısı yalnız "araçta yük var" gövdesindeydi, yani
  BAŞLATMA yüklemenin yolunu kapatıyordu. Kapı araçtaki seferler ekranına taşındı — araç bir ara
  depo olduğu için yükleme sefer boyunca sürebilir. (2) Başlatma bildirimi hâlâ *"son kutuyla yola
  çıkar"* diyordu; yükleme 31.08'de yola çıkarmayı bıraktı, metin eski modeli anlatıyordu.

  **TASARIM ÖLÇÜLERİ (v3:16 · v3:18).** Araçtaki seferler ekranının üst bloğu koyu oldu (kitin
  `ink` tonu), durum düz metinden DOLGULU rozete döndü, "Seferi başlat"ın bedeli düğmenin İÇİNE
  girdi (dışına yazılınca ondan kopuk bir not gibi duruyordu), "Duraklara git" zeytin tonuna
  geçti. Yükleme ekranının grup başlığı sayacını kazandı ve başlığı çoklu seferde tasarımın
  metnini (*"SEFERE GÖRE KUTULAR"*) yazıyor.

  **İKİ ORTAK KOMPONENT.** `OperationsStatusBadge` — düz dolgulu durum rozeti; tasarımda aynı
  geometri iki ekranda geçiyor (sefer hâli · grup sayacı) ve ayrı çizilseydi biri bir gün
  ötekinden ayrılırdı. `PrimaryButton` iki satırlı oldu (`hint`): geri alınamaz bir eylemin bedeli
  basılan şeyin üstünde durmalı.

  `/trip` ekranı SÖKÜLDÜ: tasarımda 15 numara "Rota ve araç seçimi" oldu ve onun gövdesi gün
  ekranının kendi seçim hâli — ekranın karşılığı kalmadı.

  **BEKLEYEN(21.194):** kurye dönüşünde sayım ve kutu inişi (v3:14) yazılmadı — o ekran DEPO
  yüzeyinin (`courier-return`), tasarımı geldi, kodu yok.

- [x] (21.194) **ARACA SERBEST ÜRÜN: DEPODAN ARACA GERÇEK STOK HAREKETİ** (v3:19 · kullanıcı kararı 31.08)
  `touches: packages/application/src/courier/van-stock.ts · apps/mobile-api/src/api/v1/courier.ts · apps/mobile/src/screens/courier/van-stock-screen.tsx`

  **İKİ TÜR MAL, İKİ AYRI MEKANİZMA.** Araca sipariş kutusu da biniyor serbest ürün de, ama
  aynı şey değiller: kutu bir EMANET değişimi (stok oynamaz, `loadBox` yalnız damga yazar),
  serbest ürün GERÇEK stok hareketi — mal depodan çıkıp aracın stoğuna giriyor, çünkü kapıda o
  stoktan satılacak (`quickSale` araç deposundan düşüyor) ve akşam sayılıp geri devredilecek.
  İkisini tek mekanizmaya indirmek, satılan malın hangi depodan düştüğünü belirsiz bırakırdı.

  **YENİ RPC YAZILMADI.** Depo→araç bir transferdir ve mekanizması hazırdı: `dispatch_transfer`
  malı kaynaktan o an düşürüyor (sanal transit depo yok — 0031'in T4 kararı), `receive_transfer`
  hedefe yazıyor. İkinci bir stok taşıma yolu açmak, aynı gerçeği iki yerden oynatmak olurdu.
  İki adım TEK çağrıda kapanıyor ve bu kestirme değil sahanın kendisi: rampada malı eline alıp
  araca koyan kişi hem veren hem alandır. Kabul düşerse mal transferde asılı kalır ve cevap bunu
  SÖYLER (`stuck` + transfer kimliği) — sessiz bir `ok`, kaybolmuş malı "araçta" gösterirdi.

  **ÖLÇÜ FİİLİ DEĞİL KULLANILABİLİR.** Müşteriye söz verilmiş mal araca alınmaz; fiiliye
  bakılsaydı mal gider, sipariş depoda karşılıksız kalır ve aynı mal araçta "serbest" görünüp
  ikinci kez satılırdı. Ölçü `available_stock` görünümünden geliyor, partiden hesaplanmıyor —
  rezerve partide durmuyor, ayrı bir kayıt.

  **DEVİR AYNI KAPININ AYNASI:** araçtan depoya geri koyma ayrı bir yol değil, kaynak ile hedefin
  yer değiştirmesi. Ekranda ayrı bir "geri ver" düğmesi de yok — kurye zaten sayıyı düşünüyor,
  adedi düşürmek malı depoya geri koyuyor.

  **Cihazda ölçüldü:** bir dokunuşla depoda 87→86, araçta 24→25; adet düşürülünce 86→87, 25→24.
  Ekranın kapısı yükleme listesinin sonunda (v3:18'in kendi satırı) ve dip dolgusu yapışkan
  çubuğun boyuna çıkarıldı — `8xl` yetmiyordu, son öğe çubuğun arkasında kalıyor ve hiç
  görülmüyordu.

- [x] (21.195) **KURYE ROTASI UÇTAN UCA CİHAZDA — ÜÇ ARIZA YAKALANDI, BİR TEORİ ÇÜRÜTÜLDÜ** (kullanıcı isteği 31.08)
  `touches: apps/mobile/src/screens/courier/{use-delivery.hook,delivery-screen,van-runs-screen,load-screen}.tsx`

  Tur: giriş → gün ekranı → araçtaki seferler → seferi başlat → araca yükle → kutu okut →
  serbest ürün (al + devret) → durak → kutu okut → teslim → liste → ulaşılamadı. Barkod engeli
  projenin kendi **simülasyon havuzuyla** aşıldı (`dev-scan-pool`, gerçek kutu kodları); oturum
  engeli **dev girişiyle** (`hepsi@`).

  **YAKALANAN ÜÇ ARIZA.**
  1. *Sefer başlatınca yükleme kapısı kayboluyordu.* Kapı yalnız "araçta yük var" gövdesindeydi;
     başlatma, yüklemenin yolunu kapatıyordu. Kapı araçtaki seferler ekranına taşındı.
  2. *Olumsuz sonuç yazılamıyordu ve sebebi GÖRÜNMÜYORDU.* Yola çıkmamış durakta "Ulaşılamadı"
     basılıyor, uç `same_status` diyordu (`unreachable`ın hedefi `ready`, sipariş zaten orada) —
     ama bildirim AÇIK çekmecenin altında çiziliyordu: kurye hiçbir şey olmadığını görüyordu.
     İki düzeltme: hata dalında çekmece kapanıyor, ve iki sonuç düğmesi de durak yola çıkmadıkça
     PASİF (kapıya hiç gitmediğin durağa "ulaşılamadı" yazılmaz).
  3. *Geç yüklenen kutuların yolu yoktu.* Sefer sürülürken rampada kalan kutu okutulunca durak
     `ready` kalıyor ve yola çıkaran düğme sürülen seferde çizilmiyordu. Araçtaki seferler
     ekranına ikincil eylem eklendi; tekrarı zararsız (`alreadyOut` döner, ikinci bildirim yok).

  **ÇÜRÜTÜLEN TEORİ — ve bu kayıt bilerek duruyor.** Durak ekranından geri dönüşte Android'de
  `addViewAt … child already has a parent` çökmesi tekrar üretildi. İlk teori sefer gruplamasıydı
  (durakları `Fragment` içine alan sarmalayıcı). Gruplama TAMAMEN söküldü ve aynı tur aynı çökmeyi
  verdi — teori yanlıştı, gruplama geri alındı. Şüphe durak ekranının üç örtüsüne daraldı ama
  DOĞRULANMADI; ölçmeden düzeltmeye girilmedi (CLAUDE §0). Kayıt:
  `docs/talep/not-mobil-durak-ekrani-geri-donuste-cokuyor.md`.

  **BEKLEYEN(21.195):** o çökme açık — kabuk/gezinme katmanının işi, kurye ekranlarının değil.

- [x] (21.196) **SEÇİM KENDİ EKRANINA AYRILDI · GERİ ALINAMAZ EYLEMİN ONAYI ORTAK KOMPONENT** (kullanıcı bulguları 31.08)
  `touches: apps/mobile/src/screens/courier/{route-pick-screen,courier-day-screen,day-close-screen,delivery-screen}.tsx · apps/mobile/src/components/operations/confirm-sheet.tsx`

  **GİRİŞ EKRANI REHBER OLMALIYDI, LİSTE DEĞİL.** Kullanıcı tasarımı gösterip sordu: *"giriş
  ekranı bu olması gerekmiyor mu?"* — v3:15'in boş hâli bir SEÇİM değil bir REHBERDİR (üç adım:
  seç → yükle → başlat) ve seçime ancak düğmeyle geçilir. Seçim gün ekranının gövdesine gömülüydü;
  kurye "ne yapacağım" sorusunun cevabını hiç görmüyor, doğrudan bir listeyle karşılaşıyordu.

  Seçim `/route-pick` oldu (v3:17): araç bloğu · güne göre gruplu ÇOKLU rota seçimi · "ARACA
  ALINACAKLAR" özeti. Ayrım işlevsel de — bu ekran sefer AÇIKKEN de gerekiyor (araca ikinci sefer
  eklemek), yani gün ekranının boş hâline bağlı olamazdı. Araçtaki seferler ekranına da "araca
  sefer ekle" kapısı kondu; o yol yoktu ve model onu zorunlu kılıyordu.

  **ROTA LİSTESİ ÜÇ GÜNE ÇIKTI.** Seçim ekranı güne göre grupluyor ama `listCourierRoutes` tek gün
  döndürüyordu — o ekran kurulamıyordu. Pencere varsayılan üç gün (tasarımın kendi cümlesi:
  *"bugünün, yarının, sonraki günün"*), sınırsız değil çünkü bu bir katalog değil bir SEÇİM.
  Sözleşmede rota satırı artık `day` taşıyor.

  **ONAY ÇEKMECESİ ORTAK OLDU.** Kullanıcı kapanış ekranındaki onayı gördü: *"bu onay çekme JS
  mesajı gibi… geri alınamaz bir şeyde onaylamasını sağlayacak bir komponente ihtiyacımız var."*
  Haklıydı ve dahası: aynı desen İKİ yerde ayrı ayrı kurulmuştu — kapanışta sayfaya gömülü bir
  uyarı kutusu + elden çizilmiş iki düğme, teslimde `BottomSheet` + elden kurulmuş düğme çifti.

  `OperationsConfirmSheet` v3'ün kendi "kayıt (2/2)" deseni: ekranın geri kalanı kararır, karar tek
  başına kalır. Yerel `Alert` DEĞİL — işletim sisteminin yazı tipini, düğme sırasını ve dokunma
  hedeflerini getirirdi; operasyon yüzeyi kapıda eldivenle kullanılıyor. Düğmeler eşit değil
  (onaylayan `grow={1.4}`) ama onay da varsayılan değil: vazgeç solda ve nötr, parmağın refleksle
  düştüğü yer yıkıcı olan değil. Ton kararın NİTELİĞİNİ söylüyor — kapanış `olive` (geri alınamaz
  ama yıkıcı değil), iade/red `error`.

  Ölçüldü: vitest 4015/4015 · mobil jest 141/141 suite, 1143 test. Cihazda: çekmece alttan geliyor,
  arka plan kararıyor, kapanış sayfası tek düğmeye indi.

- [x] (21.197) **TASARIM SADAKATİ: DURAK LİSTESİNİN KAPSAMI VE DOKUZ FARK** (kullanıcı bulgusu 31.08)
  `touches: apps/mobile/src/screens/courier/{courier-day-screen,load-screen,van-runs-screen}.tsx`

  **KRİTİK FARK — LİSTE BAŞLATILMIŞ SEFERLERİN.** Kullanıcı *"tasarım iki seferi aynı anda
  göstermiyor"* dedi ve ölçünce haklı çıktı. Tasarımın kendi kaynağı:
  `SEFERLER.filter(s => baslatilan.indexOf(s.key) >= 0)` — durak listesi yalnız BAŞLATILMIŞ
  seferlerden doğuyor. Bende araçtaki BÜTÜN seferlerden geliyordu ve ekranda 15 durak sayılıyordu;
  oysa kurulmuş ama başlamamış seferin durağı açılmadı, müşterisine haber gitmedi, kurye ona
  gidemez. Yükleme ekranı hepsini görmeye devam ediyor — rampada okutulacak kutu, seferi
  başlamamış siparişin de kutusudur.

  **SAYIM DAHA DA DAR:** özet kartı yalnız SÜRÜLEN seferin sayısı ve tasarım bunu yazıyor da.
  Sekiz düzeltme daha:
  · Özet kartına `SÜRÜLEN SEFER` rozeti + sefer adı (kart hangi seferin sayımı olduğunu söylemeli)
  · Kapsam cümlesi: *"Bu sayım yalnız sürülen sefere aittir — araçta bekleyen N sefer bu sayıma girmez"*
  · Kapıda kalan tahsilat SÜRÜLEN seferden (kartın kendi cümlesiyle çelişiyordu: 8 → 3)
  · Kapanış rozeti sürülen seferden (kapanış sefer bazlı — `openDayClose({runId})`)
  · Sayaç SONUÇLANMIŞ durağı sayar, teslim edileni değil (`surulenBiten`in kuralı)
  · Araçtaki seferler satırı: *"N sefer araçta · M sürülüyor"* (kutu sayacı yükleme ekranının sorusu)
  · Durak grubu başlığına künye + hâl (`grupMeta`)
  · Araçtaki seferler ekranı: üst blokta üç sayı, kartta okunan/toplam kutu
  · Yükleme ekranı: sefer sayısı rozeti, grup metası (gün · künye), durak numarası GRUP İÇİNDE,
    çıkış düğmesi tasarımın kendi etiketiyle (*"Yola çık — N kutu araçta"* / *"Yüklemeyi bitir — N
    kutu eksik"*) ve dipnotuyla (*"emanet araca geçer · müşteriye haber gitmez"*)

  **BİLİNÇLİ SAPMALAR (tasarımda yok, akış gerektirdi ve ölçüldü):** araçtaki seferler ekranındaki
  "Kutuları araca yükle", "Araca sefer ekle" ve "Geç yüklenen kutuları yola çıkar". Tasarımın akışı
  yüklemeye YALNIZ seçim ekranından geçiyor ve sefer sürülürken geç kutunun yolu yok; üçü de
  cihazda ölçülmüş boşlukları kapatıyor (21.195/21.196'nın künyeleri).

  Ölçüldü: mobil jest 146/146 suite, 1168 test. Vitest 4014/4015 — kalan tek düşük depo şeridinin
  `operations-app` token eklemesinden (testi güncellenmemiş), dokunulmayan dosyada.
- [x] (21.198) **TASARIM SADAKATİ İKİNCİ TUR: ON DÖRT FARK VE İKİ ARIZA** (kullanıcı isteği 31.08)
  `touches: apps/mobile/src/screens/courier/*, apps/mobile/src/components/operations/{status-badge,stack-header}.tsx,
  packages/{types,application}/src/**/courier*, apps/mobile-api/src/api/v1/courier.ts`

  Kullanıcı tasarımın ekran görüntülerini yeniden aldırdı (bu sefer `pageIn` animasyonu bitmiş
  hâlde — önceki paketin 19 kurye görüntüsünün 11'i boştu, ölçüldü) ve *"tespit ettiğin tüm
  eksikleri kapat, en küçük detayı bile kaçmasın"* dedi. Tasarımın kaynağı (`design/derived/
  operasyon-mobil-v3/15..20`) görüntülerle birebir aynı sürüm; ölçüm kaynaktan yapıldı, görüntüden
  değil.

  **İKİ ARIZA (ikisi de cihazda ölçüldü, ikisi de sessizdi):**
  · **Sefer sürülürken rota ve araç listesi HİÇ OKUNMUYORDU.** `use-courier-day.hook` "sürülen
    sefer varsa rota gerekmez" diye dallanıyor ve `routes`/`vehicles`i boş bırakıyordu. Seçim
    ekranına araçtaki seferlerden girilebildiği için (v3:16 "Araca sefer ekle") o ekran sefer
    boyunca HER ZAMAN boş açılıyordu — "deponda planlanmış sefer yok" ve "deponda kayıtlı araç
    yok" yazıyordu, oysa depoda beş rota ve bir araç vardı. Kullanıcının şikâyeti tam buydu:
    *"bir sefer seçtikten sonra sürekli o sefer içerisinde kalmamalıyım."*
  · **Rota kartının onay kutusu HEPSİNDE işaretli görünüyordu**: seçilmemiş hâlde `color:
    'transparent'` bir ✓ çiziliyordu ve cihazda saydam olmadı. Görünmemesi gereken şey
    renklendirilmez, çizilmez.

  **GÜNÜN ROTASI (v3:14):** durak numarası SEFERİN İÇİNDE sayılıyor (`ikon: t.ikon ||
  String(i + 1)` — küresel sayaç "3/6 durak" derken listede 15 numara gösteriyordu) · grup başlığı
  tek satır + zeytin nokta ve TEK SEFERDE DE çiziliyor (`grupGoster: i === 0`) · grup metası kendi
  takılı sayısını taşıyor (başlıktaki "1 takılı" ile düğmedeki "0 takılı" arasındaki fark artık
  izlenebilir) · çubuğun yeşili yalnız SORUNSUZ teslim (kısmi tasarımda kırmızı payda) · teslim
  dairesi dolu zeytin + krem ✓, bekleyen dairesi dolu nötr (saydam daire zemin değişince
  kayboluyordu) · teslim kartındaki `opacity` söküldü (tasarımda hiç yok; solgunluk RENKTEN gelir
  ve opaklık üstüne binince satır cihazda okunmuyordu).

  **ARAÇTAKİ SEFERLER (v3:16):** sürülen kart yeşil zeminli + zeytin kenarlı, rozeti DOLU zeytin
  (`live` tonu kite eklendi — `active` yumuşak kalıyor, ikisi tasarımın kendi ayrımı) · gün
  etiketi tarihi de yazıyor ("BUGÜN · 31 AĞUSTOS") · ikincil düğmelerde sert gölge yok.

  **SEFER VE ARAÇ (v3:17):** araç seçimi düz listeden ÇEKMECEYE taşındı — sayfada tek satırlık bir
  KAPI (üç hâl: seçilmedi/amber · araç/yeşil · araçsız/nötr), çekmecede radyo satırları ve
  "Araçsız devam et" · "araçsız" artık AÇIK bir seçim (`selectedVehicleId === null` iki ayrı şeyi
  birden anlatıyordu) ve düğme eksiği söylüyor ("Önce araç seç") · rota kartı üç sayı taşıyor
  (durak · kutu · tahsilat — sözleşmeye `boxCount`/`collectionCount` eklendi), hâlini yazıyor
  (boşta / araca alınacak / kimin sürdüğü + saati) ve sefer künyesini sağ uçta gösteriyor ·
  "ARACA ALINACAKLAR" üç sütunlu ayraçlı sayı kartı oldu.

  **ARACA YÜKLE (v3:18):** koyu karttaki fazladan "araçta" çipi söküldü (tasarımda yalnız sefer
  çipi var, ve o KOŞULSUZ) · kutu sayacında birim yazılıyor ("0/3 kutu") · durum sözcükleri
  tasarımın kendi sözcükleri (bekliyor · yarım · araçta) · grup sayacı iki tonlu (tam → zeytin,
  eksik → terracotta; nötr griyle "hiç yüklenmedi" ile "bitti" ayırt edilemiyordu) · yardımcı satır
  düğmenin İÇİNDE · serbest ürün kapısı bölüm başlığı + ikonlu kart oldu ve araçtaki kalem sayısını
  yazıyor.

  **SERBEST ÜRÜN (v3:19) — en çok eksik olan ekran:** "Barkod okut" ve "Ürün ara" HİÇ YOKTU, yani
  şeritte olmayan bir ürünü araca almanın yolu da yoktu (şerit 12 satırla tavanlı). İkisi de
  yazıldı: arama AYNI uçtan `?q=` ile, okutma `variant_barcode` çözümüyle (`code` kimliği
  sözleşmeye girdi, tanınmayan kod `unknown_code` dalıyla dönüyor ve çekmecenin ipucu satırında
  görünüyor — sayfadaki bildirim açık katmanın altında kalıyordu). Ayrıca: ad ile boy AYRI alan
  (`variantLabel`), şerit kartı "araçta N" diyor (`onVan`), araçtaki satır "depoda kalan"ı
  (`available`) ve "alındıktan sonra N kalır" cümlesini taşıyor, ✕ ile toptan geri koyma, sayaç
  "N kalem · M adet", dipte "Yüklemeye dön — N adet araçta".

  **DURAK (v3:20):** kanal rozeti başlık satırına taşındı (`OperationsStackHeader.right` yuvası
  açıldı) · "Durak N/M" SEFERİN içinde sayılıyor ("Durak 3/15" derken gün ekranı "3/6 durak"
  diyordu).

  **ARAÇ ADI ARTIK PLAKAYI DA TAŞIYOR** (`vehicleLabelsOf`): kural "ad varsa ad, yoksa plaka" idi
  ve yarımdı — depoda üç frigo kamyonet varsa ad kuryeyi doğru aracın önüne götürmez. Tasarım
  ikisini de yazıyor (v3:17 "FR-482-BX · Frigo kamyonet").

  **TASARIMIN AÇIĞI (kullanıcıya soruldu, kapatılmadı):** kurulmuş bir seferi araçtan ÇIKARMANIN
  ve sürülen bir seferi BIRAKMANIN yolu tasarımda yok — 14/15/16 numaralı ekranlarda "iptal",
  "vazgeç", "araçtan çıkar" diye bir eylem hiç geçmiyor (ölçüldü). Sefer kurulduktan sonra rehber
  hâline dönüş yalnız kapanışla oluyor.

- [x] (21.199) **SERBEST ÜRÜN YENİDEN KURGULANDI · ÜRÜN SATIRI TEK KOMPONENT** (kullanıcı kararları 31.08)
  `touches: apps/mobile/src/screens/courier/van-stock-screen.tsx, apps/mobile/src/screens/sale/sale-screen.tsx,
  packages/{types,application}/src/**/courier*`

  **ŞERİT SAYFADAN ÇEKMECEYE.** Kullanıcı ölçtü: *"sık koyulan dokun-araca-al kısmı çok fazla
  kırışık ve karmaşık."* Tasarımın kendi karesinde (v3:19) o şerit DÖRT kart; gerçek depoda aday
  sayısı 12 (ucun tavanı) ve iki sütunlu ızgara cihazda okunmuyordu. Ayrım şuraya oturdu: sayfanın
  taşıdığı bilgi **"araçta ne var"**, çekmecenin sorduğu soru **"ne alayım"**. Sık koyulanlar ile
  arama TEK çekmecede — boş sorguda şerit, yazdıkça aynı liste aramaya dönüşüyor. Çekmece
  dokunmayla kapanmıyor (rampada arka arkaya alım normal) ve satır hâlini ("araçta N") yerinde
  güncelliyor; sayı SAYFANIN listesinden okunuyor, satırın kendi alanından değil.
  Not: tasarımın SATIŞ ekranı (v3:23) zaten tam bu deseni kullanıyor — "Barkod okut · Ürün ara"
  ve liste çekmecede; yani yeni düzen evin kendi kalıbı.

  **SATIRIN DİZİLİMİ:** solda KAPAK (`imageUrl` sözleşmeye eklendi — rampada kurye ürünü adından
  değil görünüşünden tanıyor; dört "Cevizli Baklava" satırını ayıran şey boy etiketi değil kapak),
  ortada ad + depoda kalan, SAĞDA adet düğmeleri, ALTTA notun kendi satırı. Tasarım adet
  düğmelerini sola koyuyor ve notu yanına; not orada iki satıra kırılıp satırı büyütüyordu.

  **ÜRÜN SATIRI TEK KOMPONENT** (kullanıcı sorusu: *"burada bir code duplication durumu var mı?"*).
  Ölçüldü — VARDI ve üç kopyaydı: hazırlık ekranı kitin `OperationsProductRow`unu kullanıyor,
  serbest ürün kendi satırını yazmıştı, YERİNDE SATIŞ da kendi satırını. Kopyalar ayrışmıştı bile:
  satışta ürün resmi DAİRE, ötekilerde yuvarlatılmış kare — aynı ürün iki ekranda iki kimlikle
  görünüyordu. Üçü de kite bağlandı; kare kitin kararı ("ürün kutudur, kişi değil").

  **ARAMA AKSANI YUTUYOR:** cihazda ölçüldü — `"pogaca"` yazan kurye `"Patatesli Poğaça"`yı
  bulamıyordu. Telefon klavyesinde ğ/ç/ş/ı için basış harcamak rampada yapılmıyor; katlama iki
  yönlü (aksanlı yazan da bulur).

  **ARALIKLAR SIKILDI** (kullanıcı bulgusu): satır arası `md`(8) → `sm`(6), kartın iç dolgusu
  dikeyde `lg`(10) → `md`(8). Satırlar kapaklı ve iki katlı olunca kendi kenarlarıyla zaten
  ayrılıyor; aradaki boşluğun ayırma işi kalmamıştı.

- [x] (21.200) **AYNI ANDA TEK SEFER · SEFERİ ARAÇTAN ÇIKAR** (kullanıcı kararları 31.08)
  `touches: supabase/migrations/0046_delivery_run.sql, packages/{types,database,application}/src/**,
  apps/mobile-api/src/api/v1/courier.ts, apps/mobile/src/{lib/api,screens/courier}/**`

  **AYNI ANDA TEK SEFER SÜRÜLÜR.** Kullanıcı: *"Seferi başlat dediğim zaman bir seferin başlaması
  gerekiyor, diğer seferin orada görünmemesi gerekiyor."* Tasarımı ölçtüm ve cevap ikili:
  16 numaralı ekranın kendi mantığı (`baslatGoster: (!surur && !kapandi)`) ikinci seferi
  başlatmaya İZİN VERİYOR — ekran görüntüsü `02-Biri-Suruluyor` da bunu gösteriyor. **Ama tasarım
  hiçbir karede iki seferi birden SÜRÜLÜR göstermiyor**; 15 numaranın kapsam cümlesi de
  *"araçta bekleyen N sefer bu sayıma girmez"* diyor — bekleyen, sürülen değil. Ben iki sürülen
  seferi destekleyecek şekilde yazmıştım (gruplu durak listesi); yanlış olan bendi.

  Gerekçe kuralın kendisinde: iki sefer aynı anda yoldayken ekranın üç sorusu birden cevapsız
  kalıyor — durak sırası hangi seferin sırası, "3/6 durak" hangisinin ilerlemesi, kapanışta hangi
  kasa sayılacak.

  Kapı VERİDE (`depart_delivery_run` → `another_running`), çünkü ekran iki cihazdan gelen iki
  isteği ayıramaz; ekran ayrıca düğmeyi PASİF çiziyor ve sebebini yazıyor (*"Önce SF-… kapatılmalı ·
  aynı anda tek sefer sürülür"*) — gizlenseydi kurye "bu sefer neden başlamıyor" sorusunu ekranda
  hiç cevaplayamazdı. Kurma geri sarılmıyor: sefer araçta kalıyor, kutuları okutulabiliyor.
  Kural GÜNE de bakmıyor — bugünkü sefer sürülürken yarınınki de yola çıkmaz.

  **SEFERİ ARAÇTAN ÇIKAR** (`discard_delivery_run`) — tasarımda karşılığı YOK ve ölçüldü:
  14/15/16 numaralı ekranlarda "iptal", "vazgeç", "araçtan çıkar" diye bir eylem hiç geçmiyor.
  Boşluk cihazda görüldü: yanlış rotayı araca alan kuryenin tek çıkışı onu BAŞLATIP kapatmaktı,
  yani hatanın bedeli müşteriye bildirim olarak yansıyordu.

  · Kurulmuş sefer bir NİYETTİR: durak açılmadı, haber gitmedi, para ve stok oynamadı.
  · Satır SİLİNİR, "iptal" diye işaretlenmez — saklansaydı rota+gün kilidi (`delivery_run_key`)
    o rotayı sonsuza dek tutar ve kurye kendi hatasını düzelttiği için bir daha alamazdı.
  · Kutuların araç damgası SİLİNİR: `loadBox` yalnız emanet damgası yazıyor, kutu fiziksel olarak
    rampada. Bırakılsaydı kutu "araçta" görünürken hiçbir sefere ait olmayan bir emanet olurdu —
    kaybolan mal tam olarak böyle doğar.
  · Onay ÇEKMECEDE (`OperationsConfirmSheet`) ve bedeli yazıyor: kaç sipariş serbest kalıyor, kaç
    kutu rampada kalıyor. Ton `olive` — eylem yıkıcı değil DÜZELTİCİ.
  · BAŞLAMIŞ sefer çıkarılamaz (`already_departed`): geri alınacak niyet kalmadı, çıkışı kapanış.

  **MİGRATION DOSYASI DEĞİŞTİ (0046).** İki fonksiyon `create or replace` olduğu için yerel
  veritabanına doğrudan uygulandı (veri silinmedi); şema kaynağı yine dosyadır ve sıradaki
  `db:refresh` onu taşır.

  Ölçüldü: kurye jest 8 paket / 108 test; `day.test.ts` 37/37 (üç yeni entegrasyon testi: tek
  sefer kuralı, çıkarmanın üç etkisi, başlamış seferin reddi). Cihazda kurma → engelli başlatma →
  çıkarma turu yapıldı.

- [x] (21.201) **BESLEME: BUGÜN SIFIRDAN BAŞLAR — sahiplenilmiş rota yok** (kullanıcı isteği 31.08)
  `touches: scripts/seed/courier.ts, apps/mobile/src/screens/courier/route-pick-screen.tsx`

  Kullanıcı akışı baştan yürüyebilmek istedi: *"kurye ekranı açıldığı zaman sahiplenilmiş bir rota
  ortaya çıkmasın."* Seed bugünün rotalarını kurup birini de sürüyordu; kurye ekranı açılır açılmaz
  durak listesine düşüyor ve **rehber hâli, sefer/araç seçimi, yükleme ve sefer başlatma hiç
  görülemiyordu** — akışın ilk dört adımı denenemez durumdaydı.

  Artık BUGÜN ve İLERİSİ için sefer HİÇ kurulmuyor: rotalar boşta, araç boş, kurye günü kendisi
  kuruyor (seç → yükle → başlat). Tek istisna **bütün durakları sonuçlanmış** bugünkü grup — o bir
  "yapılacak iş" değil bitmiş bir gündür; kuryenin aracında görünmez (kapanmış sefer okunmuyor) ama
  para ekranının gün sonu mutabakatı ona bağlı (`readMoneyDayEnd` yalnız bugünün kapanışlarına
  bakıyor). Geçmiş günler değişmedi.

  **BEKLEYEN(BACKLOG §1):** hiçbir bugünkü grup tamamen sonuçlanmamışsa bugüne ait kapanış da
  doğmaz ve Para → Gün Sonu ekranının uyuşmazlık satırı boş kalır. Bu bir arıza değil bir veri
  ihtimali; kullanıcı akışı yürüdüğünde satır kendiliğinden doğuyor. (Tazelemede ölçüldü: kapanış
  DOĞUYOR — Güney hattı bugünün dönmüş günü.)

  **İLERİ GÜN KAÇAĞI (tazelemeden sonra ölçüldü):** ilk yazımda "hepsi sonuçlandı" ölçütü ileri
  günlere de uygulanıyordu ve grup yalnız KURYELİ siparişlerden kurulduğu için 2 Eylül'ün Batı
  hattı "bitmiş gün" sayıldı — üstelik damgası "iki saat önce" olduğundan ileri tarihli bir sefer
  BUGÜN yola çıkmış göründü ve kuryenin aracında belirdi. Gelecek bir gün bitmiş olamaz; ölçüt
  artık yalnız BUGÜNE uygulanıyor, ileri gün koşulsuz atlanıyor.

  **KAPSAM KOVASI GEREKÇESİYLE ZORUNLUDAN ÇIKTI** (`scripts/seed/coverage.ts`): "bugüne ait açık
  sefer" artık `zorunlu: false`. Boş kalması bir eksik DEĞİL — açık sefer yoksa kuryenin üstünde
  para da yoktur ve `readMoneyOverview`ın o satırı sıfır gösterir; sıfır burada DOĞRUDUR
  ("ölçülemedi" değil, "kurye henüz yola çıkmadı"). Kova raporlanmaya devam ediyor: dolduğunda
  görünsün, boşken de hangi hâlin sınanmadığı yazılı kalsın. "Bugüne ait kapanış" ZORUNLU kaldı.

  Ölçüldü: `db:refresh` başarılı — 166 kovanın hepsinde örnek var, bugün tek sefer var ve o
  KAPANMIŞ (araç boş). Cihazda kurye ekranı v3:15'in "Araçta sefer yok" rehberiyle açılıyor.

  **KAPANMIŞ ROTA "SÜRÜYOR" DEMEZ:** seçim listesinde alınmış rotanın notu geçmiş zamana geçti
  ("bugün X sürdü · kapandı") — kapanmış bir sefer için "sürüyor" yazmak, kuryeye o rotanın hâlâ
  yolda olduğunu söylüyordu.

  **"DURAKLARA GİT" DÜĞMESİNİN ZEMİNİ** (kullanıcı bulgusu 31.08 · ölçüldü): kullanıcı tasarımın
  16 numaralı karesiyle bizimkini karşılaştırmamı istedi. Piksel ölçümü tek fark verdi —
  düğmenin İÇİ tasarımda `#fbfaf4`, bizde `#f2f7e8` (yani kartın kendi yeşili). Kartın zemini,
  rozetin dolgusu ve bekleyen kartın zemini birebir tutuyordu.

  Sebep kitte: çerçeveli ikincil düğme tasarımda HER YERDE açık bir zemin taşıyor (v3:16
  "Duraklara git", v3:19/23 "Ürün ara") ama `SecondaryButton` onu tonun içine yazamıyor — o değer
  (`panel`) yalnız operasyon temasında var ve paylaşılan kitin gördüğü tema birleşimi onu göremiyor
  (`product-thumb` künyesindeki aynı duvar). Kite `style` **kabuğu** eklendi (yalnız zemin ve
  kenar; `PressableSurface`/`OperationsProductRow`un aynı ayrımı) ve iki çağıran onu kullanıyor.
  Kenar da düzeldi: `olive-line` (#d7e3bd) yeşil kartın üstünde neredeyse görünmüyordu, tasarımın
  `#c3d3a4`si (`success-line`) kondu.

  **BEKLEYEN(BACKLOG §1):** tasarımın "Seferi başlat" düğmesindeki yumuşak zeytin ışıması
  (`box-shadow:0 4px 14px rgba(95,122,44,.22)`) hâlâ çizilmiyor — kitte o ışıma bugün yalnız
  `OperationsStickyBar`ın `glow` prop'unda yaşıyor ve akıştaki düğmeler ona ulaşamıyor (aynı
  boşluk yükleme ekranının okutma düğmesinde de var, künyesi orada).

- [x] (21.202) **KURYE ARACININ İÇİNDEKİNİ SATAR — ana deponun katalogunu değil** (kullanıcı bulgusu 01.09)

  Kullanıcı kurye ekranından "Yoldan gelen müşteri"ye dokundu ve ana deponun katalogunu gördü:
  *"burası kurye ekranı, araç üstünde ne varsa onun görünmesi lazım. Daha da garibi bir araç seçili
  değil."* Ölçüm doğruladı — ekrandaki "Kara Orman Pastası · kalan 23" birebir Strasbourg'un
  stoğuydu; araçta ise dört kalem vardı (Patatesli/Sade Poğaça, Karamelli Kek Bardağı, Simit ·
  6'şar).

  **İKİ SEBEP ÜST ÜSTE BİNMİŞTİ.**

  (a) **Kural sunucuda yazılıydı, istemci onu sessizce iptal ediyordu.** `courierVehicleFirst`
  *"kurye PARAMETRESİZ geldiyse satış yeri aracıdır"* diyordu — sinyali YOKLUKTU. 30.08'de mobil
  istemci cihazdaki depo seçimini her satış isteğine yazmaya başlayınca (`withWarehouseChoice`)
  yokluk doldu ve kural o günden beri hiç çalışmıyordu. Belirtisi yoktu: uç yine bir liste
  döndürüyordu, yanlış deponunkini.

  Yerine **açık beyan** kondu: yüzey `?place=van` diyerek nereden sattığını SÖYLER
  (`SalePlaceEnum`, `packages/types`). Beyan yetki değil, soru: aracı sunucu kapsamdan çözüyor
  (`vehicleWarehouseOf`), istemci hangi aracı istediğini seçemiyor — `van` diyen depocuya `403`,
  aracı olmayan kuryeye `400 no_vehicle`. Beyansız istek eski davranışı korur, yani depo kapısından
  satış ve `?warehouseId=` ile tesisini söyleyen kurye aynen çalışır.

  Yer YIĞINA GİRERKEN okunuyor (`sale/_layout`) ve yığın boyunca değişmiyor: sepet/fiş/son satışlar
  adreslerinde parametre yok ve her birine elle taşınsaydı taşımayı unutan tek ekran satışı yanlış
  depoya yazardı — düzelttiğimiz arızanın ta kendisi.

  (b) **Vitrin kuralı araca da uygulanıyordu.** *"Katalog süzülmez, işaretlenir"* müşteri için
  doğru; araç için değil — **araç bir vitrin değil, bir yüktür.** Kurye elinde ne varsa onu satar;
  olmayanı "tükendi" diye göstermenin karşılığı yok. `CatalogQuery.onlyStockedHere` eklendi
  (`listStockedProductIds`, `listOfferProductIds`in kardeşi ve aynı yuvada) ve yalnız `place=van`
  açıyor. Sipariş için yüklenen kutu listeye KENDİLİĞİNDEN girmiyor: o mal hâlâ tesisin stoğu
  (`DOMAIN §17` — "araçta iki tür mal yan yana durur, evleri ayrıdır").

  Ekranın cümlesi de yere göre: üstbaşlık "araçtan satış · anonim satış", boş araç ise bir arama
  sonucu değil bir DURUM — "Araçta satılacak mal yok" + çıkışı (v3:19 serbest ürün).

  Cihazda ölçüldü: liste tam olarak aracın dört kalemi, "kalan 6" DB ile birebir.

  **Yol üstünde kapanan borç:** `courier-day-screen.test`in "durak numarası SEFERİN İÇİNDE sayılır"
  testi kırmızıydı — `11.9` yerel sayacı söküp `stopSeq`i çizmeye geçmişti ama test eski iddiada
  kalmıştı (mobil Jest `pnpm test`in içinde değil, o yüzden görülmemişti). Test yeni kurala
  yazıldı, üstüne "sıra bilinmiyorsa numara UYDURULMAZ" hâli de çivilendi.

  **BEKLEYEN(BACKLOG §1):** tasarımın satış ekranı girişi "Barkod okut · Ürün ara" + tavanlı bir
  SIK SATILANLAR şeridi (v3:23); bizde arama kutusu + akan liste. Araç tarafında liste zaten
  tavanlı (aracın içeriği kadar), depo kapısında değil.

  **ARAÇ KAPISI TASARIMIN ÖLÇÜSÜNE GELDİ** (v3:17 · kullanıcı bulgusu 01.09: *"yükseklik olarak
  tasarımdan az, padding'ler, fontların büyüklüğü"*). Cihazda ölçüldü: satır **53 dp** çiziliyordu,
  tasarımda **≈65**. Sekiz değer birden küçüktü ve hepsinin sebebi aynıydı — `space.lg`(10) bir
  varsayılan gibi kullanılmış, tasarımın kendi sayıları okunmamıştı.

  | | tasarım | önce | sonra |
  |---|---|---|---|
  | ekranın yan nefesi | 20 | 14 | 20 (`5xl`) |
  | dikey dolgu | 13 | 10 | 12 (`xl`) |
  | yatay dolgu | 15 | 10 | 16 (`3xl`) |
  | satır aralığı | 12 | 10 | 12 (`xl`) |
  | ikon karesi | 36 | 30 | 34 (`size.listAvatar`) |
  | ikon köşesi | 12 | 8 | 12 (`radius.badge`) |
  | araç adı | 13,5 | 12 | 13,5 (`text.button`) |
  | "seç ›" | 11,5 | 10,5 | 11 (`text.tag`) |

  İkon karesi `space` ölçeğinden okunuyordu ve bu yalnız ölçü değil AİLE hatasıydı: bir boşluk
  değil, satırın baş karesi — `size.listAvatar` (34) o rolün resmî durağı. Yan nefes değişikliği
  rota kartlarını da düzeltiyor: tasarımda ikisi de 20.

  **SATIŞ KAPISI ARTIK YALNIZ SÜRÜLEN SEFERDE** (kullanıcı bulgusu 01.09: *"kurye ana sayfasına
  girdiğim zaman yoldan gelen diye bir kart var, henüz bir sefer bile seçili değil"*). Satır üç
  hâlin üçünde de çiziliyordu ve gerekçesi kodda *"şartı sefer değil ARAÇ"* diye yazılıydı — o
  cümle BİZE aitti, tasarıma değil: v3:15'te `Yoldan gelen müşteri` tek yerde geçiyor, `sürülenVar`
  gövdesinde (`sc-if` zinciri okundu). Kapının adı da kuralı söylüyor: **yoldan gelen müşteri yolda
  olunca gelir.** Sefer kurmamış kurye depodadır ve oradaki satış depo kapısının işidir (tesis
  stoğundan — `DOMAIN §17`); sefersiz kuryeye araçtan satış açmak, çoğu zaman BOŞ bir aracın
  kataloğunu açmaktı. İki hâlden söküldü, üçüncüde künyesi düzeltildi.

  Test üç hâli birden çiviliyor ve yakaladığı doğrulandı (eski ekranla koşturulunca düşüyor).

- [x] (21.203) **SONUÇ TOAST'TA · KAPANAN SEFER GERİDE KALIR · KAPANIŞ DOĞRU SEFERİ AÇAR** (kullanıcı kararları 01.09)

  Kullanıcı iki şey istedi: *"mesajlar sadece toast mesajı olarak gösterilecek"* ve *"seferi kapat
  diyorum, kapanan sefer ekranda durmaya devam ediyor… ikinci sefer yok ortalıkta, ikinci sefere
  geçemiyorum."* İkincisini cihazda kovalarken **üç ayrı arıza** çıktı; ikisi ölçülmeden görünmezdi.

  ── **1 · SONUÇ TEK KANALDAN** ──────────────────────────────────────────────

  Altı ekran sonucu kendi köşesinde çiziyordu: biri yapışkan çubuğun içinde, biri listenin altında,
  biri kartın yanında, biri düğmenin üstünde. Aynı cümle dört farklı biçimde ve hiçbiri
  KAYBOLMUYORDU — bir sonraki eyleme kadar asılı kalıyordu. Hepsi `toast-store`a bağlandı.

  - **Kite `toastWarning` eklendi.** Operasyonun ton sözlüğü dört tonlu ve kısmi başarı gerçek bir
    hâl ("sefer açıldı ama iki durak atlandı"); `toastInfo` sessizdir, `toastError` ise kısmen
    başarılı bir işlemi hata gibi titreştirirdi. Görünüş aynı (şablonda tek toast var), ayrışan tek
    şey ELE giden sinyal — operasyonda ekrana bakmadan alınan tek sinyal odur.
  - **`resetToast()`** açıldı: toast modül düzeyinde ve 2400 ms'lik sayacı Jest süreçlerini açık
    tutuyordu (`resetWarehouseChoice` deseninin aynısı).
  - **TEK İSTİSNA açık çekmece:** toast kökte çiziliyor, çekmeceler yerel `Modal`; Android'de
    kökteki katman modalın ALTINDA kalır ve kullanıcı hiçbir şey görmez (31.08'de ölçülmüştü).
    Çekmece açıkken sonucu çekmece söyler. **Kural: mesaj kullanıcının baktığı katmanda görünür.**
  - Ekran DURUMLARI toast olmadı (boş liste, "okunamadı + tekrar dene", kapalı düğmenin sebebi):
    onlar bir olayın duyurusu değil, ekranın kendi içeriği.

  Ekranda kalan tek "mesaj" artık bir EYLEM: kısmi başarıdan sonraki "kalanları yola çıkar" ikinci
  basışı (`canRetryStart`). Toast bir düğme taşıyamaz.

  ── **2 · DURAKSIZ SEFER BİR ÇIKMAZDI** ─────────────────────────────────────

  "Araçtaki seferler" ve "Yoldan gelen müşteri" kapıları durak listesiyle AYNI dalın içindeydi.
  Sürülen seferin o gün durağı yoksa (rotaya sipariş yazılmamış — gerçek bir hâl) ekran künye +
  "Seferde durak yok" + "Seferi kapat"tan ibaret kalıyor, araçta bekleyen ikinci sefere gidecek yol
  HİÇ çizilmiyordu. Üstüne ikinci bir kapı daha vardı: `boxCounter === null` iken sefer satırı
  gizleniyordu ve o sayaç kutusuz günde zaten `null` — kapı tam ihtiyaç duyulan hâlde kayboluyordu.
  Gerekçesi de eskimişti: satırın cümlesi ("N sefer araçta · M sürülüyor") kutu saymıyor.

  Kapılar dalın dışına alındı, sayaç kapısı kaldırıldı. Tasarım da onları `sürülenVar` gövdesine
  koyuyor, listeye değil (v3:15).

  ── **3 · KAPANIŞ YANLIŞ SEFERİ AÇIYORDU** (en ağırı) ───────────────────────

  Cihazda ölçüldü: kurye **Doğu Hattı**'nı sürerken "Seferi kapat" dedi, ekran hiç yola çıkmamış
  **Batı Hattı**'nın mutabakatını açtı. `readCourierRun` "kapanmamış İLK sefer"i seçiyordu; `/day`
  ucu ise `run` alanını "yola çıkmış ve kapanmamış" diye çözüyor. Aynı soruya iki okuma iki farklı
  cevap veriyordu (CLAUDE §1) ve bedeli para: sürülmemiş bir seferi kapatmak onun siparişlerini
  serbest bırakır, gerçekten sürülen sefer açık kalırdı.

  İki taraf da düzeldi: **sunucu** ölçütü `/day` ile birebir aynı yaptı, **istemci** de kapatacağı
  seferin kimliğini adrese yazıyor (`/day-close?runId=…`) — yazma ucunun (`POST /day-close`) zaten
  uyguladığı kural. Sunucunun çözümü yedek kalıyor: derin bağlantı kimliksiz gelebilir.

  Kapanış YAZILINCA ekran kendini kapatıyor (`onClosed`): sonuç toast'ta görünür, kurye kapattığı
  seferi arkasında bırakır. `already_closed`ta kapanmaz — orada yeni bir kapanış yok, kurye zaten
  kapalı bir kaydı açtı ve salt-okunur hâli görmeli.

  ── **YOL ÜSTÜNDE: DOLMAYAN YER TUTUCULAR** ─────────────────────────────────

  "Araçta yük var" gövdesinde ekranda ham `{driving}` ve `{loaded}/{total}` yazıyordu — iki cümlenin
  anahtarları yer değiştirmişti (yükleme satırı sefer sayıyordu, sefer satırı kutu). O gövdenin hiç
  testi yoktu, o yüzden sessizce yaşadı. Anahtarlar yerine oturdu, gövdenin testi yazıldı ve
  `fillCopy` artık geliştirmede BAĞIRIYOR: dolmayan yuva bir sözdür, ilk gören kişi kurye olmamalı.

  Cihazda doğrulandı: duraksız seferde kapılar duruyor · kapanış Doğu Hattı'nı açtı · kapanınca
  ekran geri döndü ve araçta bekleyen Batı Hattı göründü · sefer başlatınca toast çıktı.

  **BEKLEYEN(BACKLOG §1):** depo yüzeyinin altı kancası hâlâ `useNotice` ile satır içi bildirim
  çiziyor (`use-intake` · `use-preparation` · `use-transfer` · `use-adjustment` · `use-batch-scan` ·
  `use-courier-return`). Kullanıcının kuralı yüzey ayırmıyor; dosyalar o şeridin elinde açık olduğu
  için desen `docs/talep/not-depo-…` ile bırakıldı.

- [x] (21.204) **AKSİYON EKRANI DEĞİŞTİRİR — "sefer kuruldu" artık görünüyor** (kullanıcı kararı 01.09)

  *"Bir aksiyonun olduğu yerde ekranın değişmesi gerekiyorsa değişmesi lazım. En bariz örneği:
  rotanın sorumluluğunu alıyor ama hâlâ rota sayfasında kalıyor, ne olduğunu anlayamıyor bile."*

  Kurma başarılıydı ama ekran yerinde kalıyordu: seçim listesi boşalıyor, düğme pasifleşiyordu —
  yani ekran "bir şey oldu" bile demiyordu. Kurye geri gidip bakmadan işin olup olmadığını
  bilemiyordu.

  **Yönlendirmeyi KANCA YAPMAZ** (router'ı bilmez — `useDayClose(onClosed)` ile aynı kural). Eylemler
  artık SONUÇ döndürüyor, nereye gidileceğine ekran karar veriyor:

  | eylem | sonuç | ekran |
  |---|---|---|
  | Seferleri kur | en az biri kuruldu | **Araçtaki Seferler** (`dismissTo`) |
  | Seferleri kur | hiçbiri kurulmadı | kalır — yapılacak iş burada |
  | Seferi başlat | temiz | **Duraklar** (`back`) |
  | Seferi başlat | kutu bekliyor / başka sefer sürülüyor | kalır — iş bu ekranda |
  | Geç kutuları yola çıkar | her hâlde | kalır — kurye aynı düğmeye yeniden basabilir |

  `dismissTo` bilinçli: rota seçimine iki yoldan gelinir (gün ekranı · Araçtaki Seferler) ve
  `navigate` ikinci yolda yığında iki kopya bırakırdı; `dismissTo` varsa geri döner, yoksa yerine
  geçer. Gidilecek yer tasarımın kendi cümlesi: *"Başlatma araçtaki seferler ekranında, sefer sefer
  yapılır"* (v3:17 dipnotu).

  **Zaten doğru olanlara dokunulmadı** — kural "her eylemde git" değil, "gitmesi gerekiyorsa git":
  teslimat yazılınca durak listesine dönüyordu (30.08), satış fişe gidiyordu (v3:22), kapanış
  21.203'te bağlandı. Araçtan çıkarma ve araca ürün alma YERİNDE kalıyor: ikisinde de konu listenin
  kendisi ve liste tazeleniyor.

  `startResult` fikstürü `courier-day-screen.test`ten `courier-fixture`a taşındı — üçüncü çağıranı
  doğdu (rota seçimi ve araçtaki seferler de kurma/başlatma sonrasını ölçüyor).

  Cihazda doğrulandı (kablosuz): kur → **Araçtaki Seferler** açıldı, yeni sefer `SF-26-QF7L3Y`
  "araçta bekliyor" olarak listede; başlat → kart "sürülüyor"a döndü ve ekran KALDI, çünkü 2/6 kutu
  okutulmuştu (nüans doğru çalışıyor).

  **AKIŞIN SIRASI DÜĞMENİN KENDİSİNDE** (aynı turda, kullanıcı kararı): *"Bir kurye seferlerini
  seçebilir, fakat o seferlerin kutularını yüklemeden o seferleri başlatamaz. Dolayısıyla 'Seferi
  başlat' yerine 'Kutuları araca yükle' demeliyiz."*

  Kural zaten UÇTA vardı (`awaitingBoxes`) ama ekran onu ancak kurye düğmeye BASTIKTAN sonra
  söylüyordu: *"sefer açıldı ama bir sipariş okutulmayı bekliyor — kutuları okut, sonra yeniden
  başlat."* Yani akışın sırası kuryeye bir HATA olarak öğretiliyordu; üstelik sefer açılmış oluyordu.

  Kart artık hangi adımda olduğunu söylüyor: kutu eksikken **"Kutuları araca yükle · N kutu bekliyor
  · yüklenmeden sefer başlamaz"**, yükleme bitince **"Seferi başlat"**. Aynı yer, aynı ağırlık, tek
  dokunma alanı. "Aynı anda tek sefer" kilidi YALNIZ başlat düğmesinde: yükleme rampa işidir, başka
  sefer sürülürken de yapılabilir.

  Bunun bir yan etkisi de kapandı: ekran düzeyindeki "Kutuları araca yükle" satırı kartın hemen
  altında AYNI etiketle duruyordu (cihazda görüldü). Artık yalnız hiçbir kartın yükleme kapısı
  olmadığında çiziliyor — kart daha iyisini söylüyor, hangi seferin kaç kutusu bekliyor.

  Cihazda doğrulandı: sefer beklemeye alınınca kart "Kutuları araca yükle · 4 kutu bekliyor"a döndü,
  başlatma düğmesi hiç çizilmedi ve yinelenen satır kalktı.

- [x] (21.205) **KURYE AKIŞI TASARIM KARELERİNDEN OKUNDU — iki sapma kapandı** (kullanıcı isteği 01.09)

  Kullanıcı `design/project/screenshots/Kurye/` altındaki karelerin **hepsinin** tek tek okunmasını
  ve akışın oradan çıkarılmasını istedi. Onbir kare okundu; tasarımın kendi sırası şu:

  ```
  Günün Rotası "Araçta sefer yok"   → [Sefer ve araç seç]
  Sefer ve Araç                     → [Seferleri kur — N sefer YÜKLEMEYE GEÇER]
  Araca Yükle  (yan yol: Serbest Ürün → [Yüklemeye dön — N adet araçta])
                                    → [Yüklemeyi bitir — N kutu araçta]
  Araçtaki Seferler (hepsi yüklü)   → [Seferi başlat]  (kart kart)
  Günün Rotası "sürülen sefer"      → durak → teslim → [Seferi kapat]
  ```

  **SAPMA 1 — kurma sonrası yanlış ekran.** 21.204'te "Seferleri kur" araçtaki seferlere
  gidiyordu; oysa düğmenin kendi etiketi *"N sefer **yüklemeye geçer**"* diyor ve tasarımın
  `02-Aractaki-Seferler` karelerinde bütün seferler ZATEN yüklü (7/7 · 4/4 · 9/9) — yani o ekran
  akışta yüklemeden SONRA geliyor. Kutular rampada dururken kuryeyi başlatma ekranına götürmek,
  düğmenin verdiği sözü tutmamaktı. Artık `dismissTo('/load')`.

  **SAPMA 2 — yükleme düğmesinin tonu sabitti.** Tasarımın iki karesi tonla konuşuyor: eksik kutu
  varken MÜREKKEP ("bitirebilirsin ama eksik"), hepsi bindiğinde ZEYTİN ("tamam"). Bizde sabit
  mürekkepti ve iki hâl aynı görünüyordu.

  **KİT İHLALİ (kullanıcı bulgusu):** araçtaki seferler kartı dolgu · yarıçap · kenar · zemini ELLE
  çiziyordu — `OperationsSurface`ın `panel` tonunun kopyası. Yüzeyin kendi künyesi bu hatayı zaten
  sayıyor: *"kodda 41 yerde elle çizilmişti."* Karta ait kalan tek şey sürülen hâlinin zeytin
  kabuğu. Aynı turda "X/Y kutu araçta" satırı da kalktı: aynı sayı üstteki koyu künyede ve her
  kartın özetinde zaten vardı, ekran dibinde ÜÇÜNCÜ kez yazıyordu (tasarımda orada yalnız dipnot
  var).

  **EKSİK KUTU: ÖNCE YASAK KONDU, SONRA UYARIYA DÖNDÜ — ikisi de kullanıcı kararı (01.09).** Önce
  *"kutuları yüklemeden o seferleri başlatamaz"* dendi ve başlatma düğmesi kapatıldı. Kullanıcı aynı
  gün geri aldı: *"eksik kutuyu net şekilde ifade edelim, gerekirse onay çekmecesi açılsın; kabul
  ediyorsa eksik kutuyla da tabii ki kurye yola çıkabilmeli."* Yürürlükteki kural budur ve tasarımın
  kendi dipnotuyla da aynı hizada (*"o durak 'kutu araçta değil' diye açılmaz"*) — engel değil BEDEL.
  Bedeli iki yerde yazıyoruz: yükleme dipnotu ("kutusu binmemiş duraklar AÇILMAZ") ve başlatmadan
  önce açılan onay çekmecesi (`departShort*` — kaç kutu, hangi duraklar, geri alınamaz). Yasağın
  kaldığı tek iz kartın yardımcı bağlantısı: eksik varken "Kutuları araca yükle" yolu açık kalır.

  **BİLİNÇLİ SAPMALAR (tasarımda YOK, gerekçeleri kendi görev satırlarında):** "Araçtan çıkar"
  (21.200) · "Araca sefer ekle" (31.08) · sık koyulanların çekmeceye taşınması (21.199) · kartın
  yükleme kapısı (21.204).

  **YÜKLEME EKRANI YENİDEN DİZİLDİ** (kullanıcı kararı 01.09, akışı adım adım anlattı):

  - **Okutma YÜZEN düğmeye taşındı** (`OperationsScanFab`). Kitin kendi künyesi bu kararı 31.08'de
    zaten yazmıştı — *"barkod okutma yukarılarda bir yerde kalmamalı, her zaman elinin altında
    olmalı"* — ve yedi ekrandan yalnız toplama onu kullanıyordu. Akıştaki düğme kaydırınca
    kayboluyordu; rampada eli koli dolu kuryenin kaybolan bir düğmeyi araması işin kendisini
    yavaşlatır. Kutular bitince daire kalkar: okutacak şey yoksa elin altındaki eylem de yok.
  - **"Yüklemeyi bitir" yapışkan çubuktan çıkıp KOYU BLOĞUN ALTINA geldi.** Okutma akıştan
    çıkınca boşalan yer sayfanın en okunur noktasıydı. Düğme dipteyken oraya inen göz zaten
    "bitirdim mi" diye bakıyordu; cevabı ise sayacın kendisi veriyor. Soru ve cevap artık yan yana.
    Yapışkan çubuk bu ekrandan tamamen kalktı.

  **FAB'IN DOKUNMA ALANI HİÇ YOKMUŞ** (kullanıcı bulgusu 01.09: *"FAB butonu bazen çalışmıyor"* ·
  cihazda ölçüldü). `uiautomator` dökümünde yükleme ekranının tıklanabilir düğümleri şunlardı: geri
  · "Yüklemeyi bitir" · "Serbest Ürün". **Daire listede yoktu** — çiziliyor ama basılamıyordu.

  Sebep kitte ve künyesi zaten yazılıydı: `PressableSurface` çağıranın `style`ini **İÇ** görünüme
  koyuyor. `OperationsScanFab` konumu (`position:'absolute'` + `right`/`bottom`) o stile veriyordu;
  dolayısıyla dış `Pressable` akışta kalıyor, tek çocuğu mutlak konumlandığı için **0×0** ölçülüyor
  ve dokunacak alan doğmuyordu. Aynı sınıf hata kitte bir kez daha çözülmüştü — satırda esneyen
  düğmenin `flex`i de `style`e yazılamıyor, `grow` prop'undan dış Pressable'a veriliyor.

  Konum şeffaf bir dış kaba alındı (`pointerEvents="box-none"` — altındaki listeyi yutmasın);
  `PressableSurface`a yalnız dairenin kendisi kaldı ve Pressable ona göre ölçülüyor. Ölçüldü:
  daire artık `168×169` cihaz px'lik tıklanabilir bir düğüm (66 dp) ve okuyucu açılıyor.

  **Düzeltme toplamada da geçerli:** aynı FAB'ı kullanan tek öteki ekran orasıydı ve orada da
  dokunma alanı yoktu.

  **BEKLEYEN(BACKLOG §1):** tasarımın yükleme ekranında yanlış okutma KALICI kırmızı bir kart
  ("Araçtaki hiçbir sefere ait değil — koyma") ve altında **"yanlış okuttum — geri al"** eylemi var.
  Mesaj bizde toast (21.203) ama GERİ ALMA hiç yok ve bu bir yetenek boşluğu: tek kutunun araç
  damgasını silen uç yazılmamış (`discard_delivery_run` seferin tamamını indiriyor). Uç açılmadan
  ekrana düğme konulamaz.

- [x] (21.206) **D1 TOPLAMA: TAMAMLANANLAR KAPSAMI · KUTU GERİ AÇMA İÇERİĞİ KORUYOR · ETİKET ÇEKMECESİ EKRANIN PARÇASI** (kullanıcı kararları/bulguları 01.09)
  touches: `apps/mobile/src/screens/warehouse/{preparation-screen,use-preparation.hook,messages.json,picking-box.test}.*` ·
  `apps/mobile/src/lib/api/warehouse.ts` · `apps/mobile-api/src/api/v1/warehouse.ts` ·
  `packages/application/src/warehouse/{preparation,boxes}.ts` · `packages/types/src/contracts/warehouse-api.schema.ts` ·
  `supabase/migrations/0048_order_box.sql`

  **Durum:** tamamlandı; hepsi fiziksel Android cihazda (CPH1907) ölçüldü. Beş iş tek turda:

  1. **Kuyruğun iki yüzü — bekleyenler ve son tamamlananlar** (kullanıcı isteği: *"son tamamlanan on
     kutu … bekleyenler ayrı, tamamlananlar ayrı, geçiş yapılabilsin, bu butonu header'da aksiyon
     butonu olarak koyabiliriz"*). Uç `?scope=done` alıyor; `ready` siparişler **son kutusunun mühür
     anına göre** sıralanıp ilk on tanesi çiziliyor (`order` tablosunda `updated_at` yok — ölçüldü).
     Sınır `ready`de ve keyfî değil: `unseal_order_box` bundan ileri geçmiş siparişi reddediyor, yani
     liste "geçmiş" değil **hâlâ müdahale edilebilir olan** penceredir. Tamamlanmış sipariş
     SALT OKUNUR açılıyor (okutma · kutu açma · eksik beyanı kapalı); yapılabilen tek şey uzun
     basmayla etiket yeniden basımı ve kutuyu geri açmak — ki bu listenin var olma sebebi de o.
  2. **Hazırlık kâğıdı okutması FAB oldu.** Listenin üstündeki düğme on siparişlik kuyrukta
     kayboluyordu; sipariş açıldıktan sonraki okutma zaten FAB'daydı, yani aynı hareket ekranın iki
     hâlinde iki ayrı yerde aranıyordu. Ton `action` (mürekkep): kâğıt okutmak işi BAŞLATIR.
  3. **Son kutu kapanınca ekran siparişi bırakmıyor** (kullanıcı bulgusu: *"sipariş toplamı bittiği
     anda navigasyon gerçekleşiyor ve açılmakta olan çekmece kapanıyor"*). Sipariş `ready`ye geçince
     kuyruktan düşüyor, dal değişiyor ve **yeni açılmış etiket çekmecesi siliniyordu** — basım
     düştüğünde "etiket alınamadı" haberi okunmadan kayboluyordu. İlk denediğim çare (tazelemeyi
     ertelemek) cihazda DAHA KÖTÜ çıktı: çekmecenin arkasında kutu hâlâ "AÇIK · 0 adet" görünüyordu,
     yani kapanmış bir kutu açık gösteriliyordu. Doğrusu kapsamı TAMAMLANANLARA almak.
     **Ve çekmece dallardan çıkarıldı**: beş dalın hepsinde çiziliyor artık — kapsam geçişi çoğu
     hâli kurtarıyor ama liste boş dönerse ya da okuma düşerse dal yine değişirdi. Çekmece bir dalın
     değil EKRANIN parçası. (Bu son adım üç eski testi kırdı ve kırdığı için bulundu.)
  4. **Kutu geri açmak içeriği KAYBETMİYOR** (kullanıcı bulgusu: *"bir kutu açtım, kutunun içi
     tamamen boşalıverdi … neden sadece kutuyu açıp içinden birkaç şey çıkartamıyorum"*).
     Sunucu satırları yine serbest bırakıyor ve bırakmak ZORUNDA — *"açık kutu = taslak"* bu sistemin
     değişmezi: döküm ancak kapanışta yazılıyor (`seal_order_box` `insert` ediyor, `unique (box_id,
     order_item_id)` ikinci yazımı reddediyor) ve `sealBox`ın birleşimi karşılanan adedi MEVCUT izin
     üstüne ekliyor. Ama serbest bırakmak İÇERİĞİ KAYBETMEK değil: döküm silinmeden önce okunup
     cevaba konuyor (`UnsealBoxResponseSchema.items`) ve telefon onu açık kutunun taslağına yazıyor.
     Cihazda ölçüldü: kutu üç adetle geri açıldı, bir kalem ✕ ile çıkarıldı, listeye döndü, geri
     konup yeniden kapatıldı; DB `ready` · mühürlü · adetler tutuyor.
  5. **Bir siparişte AYNI ANDA TEK AÇIK KUTU** (cihazda ölçülen arıza). Kutu 2 açıkken Kutu 1 geri
     açıldı: veritabanında **iki kutu da açık kaldı**, ekran açık kutuyu tekil bildiği için yalnız
     birini çizdi ve öteki hiçbir yerden erişilemez bir kayda dönüştü — taslak da yanlış kutuya
     yazılabilirdi. Kural VERİDE (`unseal_order_box`), cümle ekranda: *"Kutu N zaten açık — bir
     siparişte tek kutu açık kalabilir."* İkisi de cihazda doğrulandı, DB değişmedi.

  **Yol boyunca kapanan sessiz düşüş:** menüden "etiketi yeniden yazdır"da etiket okuması düşerse
  `printState` hataya çekiliyordu — ama o durum yalnız ÇEKMECENİN İÇİNDE çiziliyor ve çekmece `label`
  doluysa açılıyor. Yani depocu düğmeye basıyor, menü kapanıyor ve hiçbir şey olmuyordu. Cümle artık
  toast'tan gidiyor.

  **ÖLÇÜM — "çekmece bazen açılmıyor"un sebebi Fast Refresh.** Kutu menüsü arka arkaya iki kez
  açılmadı; tam yeniden yüklemeden (`force-stop` + dev-client) sonra ilk denemede açıldı. Yani kod
  değiştikten sonra bellekte kalan ölü gorhom örneği; normal kullanımda değil, geliştirme sırasında
  doğuyor. Kullanıcının 01.09'da tarif ettiği belirtinin karşılığı bu.

  **BEKLEYEN(BACKLOG §1):** etiket başlığı sipariş yarımken de "Kutu 1/1" diyor — `boxCount` o anki
  kutu sayısı, nihai değil. Doğrusu ya sayıyı hiç yazmamak ya "Kutu 1" demek; karar verilmedi.

- [x] (21.207) **Klavyeli çekmecelerin son satırı klavyenin arkasında kalıyordu** (kullanıcı bulgusu 01.09:
  *"hâlâ en alttaki yazı görünmüyor"*) — kitin tek çekmecesi, yani 42 çağıranın hepsi.
  - **Durum (01.09) — İKİ AYRI HATA, ikisi de cihazda ÖLÇÜLDÜ.** Panel klavye açılınca yükseliyordu
    ama içeriğin son satırı hep eksik kalıyordu. Geçici bir ölçüm ekrana basıldı
    (`kb320 gor525 ic525 scrY568`, ekran 904 dp) ve iki ayrışma birden çıktı:
    1. **Klavyenin gerçek örtmesi 336, bildirdiği 320.** `keyboardDidShow`un `endCoordinates.height`ı
       klavyenin KENDİ boyudur ve Android'de altındaki hareket çubuğunu saymaz. Pay artık ekran
       DİBİNDEN hesaplanıyor: `Dimensions.get('screen').height − endCoordinates.screenY`. iOS'ta bu
       iki hesap zaten aynı sayıyı verir (klavye orada ekranın dibine oturur), yani düzeltme
       Android'in farkını kapatırken iOS'ta hiçbir şeyi değiştirmiyor.
    2. **Taban nefes eziliyordu.** Pay `contentContainerStyle` dizisine ikinci bir `paddingBottom`
       olarak veriliyordu; dizi TOPLAMIYOR, EZİYOR — klavye açılınca içeriğin `8xl` + güvenli alan
       nefesi (46 dp) siliniyordu. Ölçüm bunu da gösterdi: içerik 251 → 525, oysa toplansaydı 571
       olmalıydı. Pay artık içeriğin sonuna AYRI BİR BOŞLUK olarak ekleniyor.
  - **Ölçüm (01.09):** Android (Xiaomi 2311DRK48G) — posta kodu çekmecesi sayı klavyesiyle, sonra
    öneri listesi açılıp panel TAVANA dayanmışken (asıl kırılma hâli), sonra "Bize yazın" çekmecesi
    METİN klavyesiyle: üçünde de son satır klavyenin üstünde ve nefes payı yerinde. iOS
    (iPhone 16e · iOS 26.2 simülatörü) — aynı çekmece, yazılım klavyesiyle: son satır görünür.
  - **Önce denenip ÇÜRÜTÜLENLER** (hepsi cihazda): kütüphanenin kendi `keyboardBehavior`ı ·
    `BottomSheetTextInput` ile kaydı kurmak · `bottomInset` · `react-native-keyboard-controller` +
    `KeyboardAwareScrollView`. Sonuncusu topluluğun standart çaresidir ve BU arızayı çözmedi:
    kaydırma alanının İÇİNDE kaydırıyor, oysa klavyenin altında kalan PANELİN KENDİSİYDİ. Paket
    kuruldu, dev-client yeniden derlendi, ölçüldü, geri alındı — bağımlılık eklenmedi.
  - **Yan bulgu (iOS simülatörü, ürün değil):** dev-client'ın yüzen "Tools" düğmesi sağ ÜST köşede
    duruyor ve dokunma alanı başlığın sağ eylemini (hesap menüsü, "Vazgeç") yutuyor — dokunuş
    uygulamaya değil geliştirici menüsüne gidiyor. Düğme sürüklenerek yoldan çekilir. Cihaz turu
    yapan ajanın bilmesi gereken bir tuzak; uygulamada karşılığı yok.

- [x] (21.208) **Tek tesisli personele "bugün hangi depodasın?" diye sorulmuyor** (kullanıcı kararı
  01.09: *"bu adamın diğer depolardan hiç haberi yok, yine de depo seçiyorum — saçma değil mi?"*)
  - **Durum (01.09) — ÖLÇÜLDÜ, sebep depo sayısı değil ARAÇ.** Ekran tek satırlık bir liste çizip
    üstüne *"Birden fazla depoda çalışıyorsun"* yazıyordu; cümle yanlıştı. Veri: `hepsi@…`in
    kapsamı iki kayıt — STR (`facility`) + VAN-1 (`vehicle`). Kapı kapsamı SAYIYOR
    (`soleWarehouseIdOf`), araçla birlikte iki görüp `400 warehouse_required` diyordu. Tesis/araç
    ayrımını yalnız istemci biliyor (`kind`), o yüzden çare de orada: kapsamda TEK tesis varsa
    seçim türetiliyor (`loadWarehouseChoice`) ve soru hiç sorulmuyor. Hub'ın kapsam dalı da
    seçenek sayısına bakıyor artık — tek satırlık bir seçici sormak değil, sormuş gibi yapmaktı.
  - **"Varsayılan depo yoktur" (CLAUDE §1) ihlal edilmedi:** kural sistemin kişi adına depo
    TAHMİN etmemesidir; tek elemanlı bir kümede tahmin yok. Kapı da değişmedi — kimlik yine
    `?warehouseId=` ile gidiyor ve kapsama karşı sınanıyor (`403 warehouse_out_of_scope`). Menü bu
    hükmü zaten taşıyordu ("depo değiştir" yalnız birden çok tesiste çiziliyor); eksik olan aynı
    hükmün SORUYA uygulanmasıydı.
  - **Türetilen seçim cihaza YAZILMAZ** — her açılışta kapsamdan yeniden çıkar. Yazsaydık personel
    ikinci tesise atandığı gün cihazda hiç verilmemiş bir "açık seçim" durur, soru hiç sorulmazdı.
  - **Testler:** dört yeni birim (tesis+araç → türetilir · türetilen yazılmaz · iki tesiste türetme
    yok · kapsamdan düşen seçimin yerine tek tesis geçer) + hub'da "TEK tesiste soru sorulmaz".
    Kapsam bloğunun iki eski hükmü tek tesisli fikstürle koşuyordu; gerçekten doğabilecekleri
    kapsama (iki tesis) taşındı — o hâlde kapının `warehouse_required` demesi zaten imkânsız.

- [x] (21.209) **Eksik karşılanan sipariş: müşteri ekranı ÜÇ ayrı sayıyı yanlış söylüyordu**
  (kullanıcı bulgusu 01.09, cihazda: *"hazırlandı aşamasındayken eksik gönderilecekleri ve toplam
  fiyatının artık ne olduğunu görmeli — hem kapıda ödeme için hem ne kadar iade alacağı için"*)
  - **Durum (01.09) — arıza EKSİK BİR ÖZELLİK DEĞİL, AYRIŞMIŞ İKİ HESAPTI.** Uyarının çoğu zaten
    vardı; yanlış olan sayılardı ve hepsi tek kökten geliyordu: satır parası iki ayrı yerde
    hesaplanıyordu. Ödeme motoru satır indirimini karşılanan orana bölüyor
    (`fulfilledLineAmountCents`), müşteri okuması ise indirimin TAMAMINI düşürüyordu — yani
    müşteriye 1 adet için 2 adetlik indirim yazılıyordu. Ölçüldü (`LA-26-93UXKY`, 2 sipariş 1
    gönderildi): ekran satırı **15,72 €**, kuryenin kapıda tahsil ettiği hesap **19,09 €**.
    Üstüne `totalCents` ham okunuyordu (`order.total`, eksikten habersiz **46,39 €**) ve
    `discountCents` de öyle (**8,18 €**) — özet paneli kendi içinde çelişiyordu: 32,10 − 8,18 ≠ 27,29.
  - **Yapılan:** satır parası, sipariş edilenin tutarı, eksik farkı, ara toplam, indirim ve toplam —
    altısı da MOTORDAN türetiliyor. `order.total` ve `order.discount_amount` sipariş ANINDA anlaşılan
    tutarlardır ve eksik gönderimden haberleri yoktur; ekran artık ikisini de ham okumuyor.
    Doğrulandı (cihaz, Oppo CPH1907): satır ~~38,19~~ → 19,09 · ara toplam 32,10 − indirim 4,81 =
    toplam 27,29 · kuryenin tahsil edeceği tutarla birebir aynı.
  - **Görünüş kararı `design/KARARLAR.md`de** (tasarımdan bilinçli sapma): eksik cümlesi gramajın
    yanında, para çözümü üstü çizili tutarda, sipariş toplamı satıra yazılmaz.
  - **BEKLEYEN(21.210):** ekran odağa dönünce TAZELENMİYOR — detay yalnız monte olurken okuyor
    (`use-order.hook.ts`). Kullanıcının ilk gördüğü ekran buydu: sipariş 17:52'de hazırlanmıştı,
    18:23'te ekran hâlâ "Alındı" diyordu. Vitrindeki takip şeridi de aynı.

- [x] (21.210) **Açık bırakılan ekran öne gelince tazeleniyor** — sipariş ekranları VE teslimat
  kapsamı (21.209'un ölçümü + `docs/talep/` gözlemi, web şeridi aktardı)
  - **Durum (02.09) — iki ayrı belirti, TEK kök.** (a) Sipariş 17:52'de hazırlandı, ekran 18:23'te
    hâlâ "Alındı" diyordu; vitrindeki takip şeridi de öyle. (b) Kapsanmayan bir posta kodu aktif
    rotaya eklendi, sistem müşteriye BİLDİRİM gönderdi, açık duran uygulama hâlâ "buraya gelmiyoruz"
    diyordu — iki yüzey aynı anda birbirini yalanlıyor ve bildirimi güvenilmez kılıyordu. İkisinin
    de sebebi aynı: okuma yalnız monte olurken koşuyor, telefonlar da kapatılmıyor.
  - **Kural TEK yerde** (`lib/app-state/use-live-refresh.ts`). Depoda bu desenin dört ayrı kopyası
    vardı (`use-discover` · `use-me` · `use-visit-points` · `lib/auth/supabase`); beşincisi
    yazılmadı. Üç okuma bağlandı: sipariş detayı, vitrin sipariş bandı, yer/kapsam çözümü.
  - **İKİ TETİKLEYİCİ — ilk tur eksikti (kullanıcı bulgusu 02.09).** İlk hâl yalnız öne dönüşü
    dinliyordu; kullanıcı hemen gördü: *"bu arka plana gitmeden ön plandayken de yenilenmesi
    lazım"*. Eklenen ikinci yol SÜRE: ekranda bekleyen kullanıcı için düzenli tazeleme
    (`LIVE_REFRESH_INTERVAL_MS`, **60 sn** — parametrik). Aralık ölçüye göre seçildi: kapsam kararı
    saat başı koşan bir işten (`zone_available`), sipariş durumu depocunun elinden geliyor; ikisi de
    dakikalar mertebesinde. Sayaç arka planda susar — görünmeyen ekran için tel açmak olurdu.
  - **AŞAĞI ÇEKME de bilgiyi tazeliyor** (kullanıcı isteği 02.09: *"parmak ile beraber bilginin de
    güncellenmesi"*). Jest kancanın işi değil, çağıranın kaydırma alanının işi: kapsam kancası
    `refresh` kapısını dışarı verdi, vitrin ve katalog onu kendi `onRefresh`ine bağladı. Katalogda
    bu bir süs değil kararın kendisi — kapsam, soğuk zincir ürünlerinin gösterilip
    gösterilmeyeceğini belirliyor.
  - **ODAK KANCASI DENENDİ VE GERİ ALINDI.** `useFocusEffect` "başka ekrana gidip geri dönünce
    tazele" için eklendi; `expo-router` bağımlılığı getirdiği anda o modülü kendi fabrikasıyla
    taklit eden **18 ekran testi** düştü (`useFocusEffect is not a function`). Bedeli kazancından
    büyüktü: bundan sonra `expo-router`ı taklit eden her yeni ekran testi aynı duvara çarpardı,
    üstelik kancanın eklediği tek şey "60 saniyeyi beklemeden tazele"ydi. Geri dönüş zaten sayaçla
    karşılanıyor: alttaki ekran sökülmüyor, sayacı çalışmaya devam ediyor.
  - **ÖLÇÜT "arka planı görmüş olmak", önceki durum DEĞİL — testin yakaladığı kusur.** İlk kurgu
    *"önceki hâl `active` değilse tazele"* diyordu; iOS'un `active → inactive → active` sıyırması
    (bildirim merkezi, arama çubuğu) her seferinde bir istek gönderirdi. Katı `background → active`
    kuralı ise TERS yönde yanlış: gerçek dönüşte `active`ten hemen önceki hâl `background` değil
    `inactive`tir, yani hiç tazelenmezdi. Bayrak `background` görülünce yanar, dönüşte harcanır.
  - **Cihazda uçtan uca ölçüldü (Oppo CPH1907, 02.09):** çekmece AÇIKKEN uygulama arka plana atıldı,
    67380 kapsanan bölgeye eklendi, uygulama öne getirildi — ekran kendini düzeltti
    (*"Buraya aracımız gitmiyor"* → *"Harika — kapınıza ücretsiz teslim ediyoruz!"*). Satır geri
    alınıp tur tekrarlandı: cümle geri döndü. Uygulama hiçbir aşamada kapatılmadı.

- [x] (21.211) **SEFER ROTANIN GÜNÜNE KURULUYOR · İŞSİZ ROTA SEÇİLEMİYOR · TEK ADAY BIRAKILABİLİYOR** (kullanıcı bulguları 01.09, hepsi cihazda ölçüldü)

  Üç arıza, üçü de kurye seçim ekranında ve üçü de yalnız gerçek veriyle görünüyor.

  ── **1 · SEFER YANLIŞ GÜNE AÇILIYORDU** ─────────────────────────────────────
  Kullanıcı 3 Eylül'ün Kuzey Hattı'nı seçti (kartta *"1 durak · 2 kutu · 1 tahsilat"*), sefer kuruldu
  ve **boş** doğdu: *"içinde kutu ve sipariş var yazıyordu ama bu sefer de kutu ve sipariş yok."*

  Ölçüm: `SF-26-WWYH39` açılmış, `delivery_date` **bugün**; 3 Eylül'ün siparişi (`LA-26-93UXKY`)
  damgasız kalmış, dolayısıyla kutuları da sefere hiç girmemiş. Sebep tek satır: kurma isteği GÜNÜN
  tarihini taşıyordu (`/courier/day` cevabının `date`i), oysa seçim ekranı 31.08'den beri **üç gün**
  listeliyor. Uç siparişleri seferin gününe göre damgalıyor (`claimOrders` `deliveryDate`), o gün de
  hiçbir sipariş yok. Ekran yanlış davranmadı — kendisine boş verilen seferi dürüstçe boş gösterdi.

  Artık her istek KENDİ rotasının gününü taşıyor. Rota listede bulunamazsa gün hiç gönderilmiyor:
  uydurma bir tarih yerine sunucunun kendi varsayılanına düşmek doğru. Test kuralı çiviliyor ve
  **yakaladığı doğrulandı** (kural geri alınınca düşüyor); fikstürün günü gün cevabınınkinden
  bilerek farklı, yoksa test bozulmayı göremezdi.

  Yükleme adımı bundan etkilenmiyor ve kullanıcı bunu kendisi sordu — *"tarihle ne alakası var
  artık, zaten o sefere yazılmadı mı o siparişler?"* Haklı: `readCourierRuns` güne değil
  "kapanmamış"a bakıyor, duraklar da sefer kimlikleriyle okunuyor (`listCourierDay` `runIds`).
  Tarihin tek işi kurma anındadır.

  ── **2 · İŞİ OLMAYAN ROTA SEÇİLEBİLİYORDU** ────────────────────────────────
  *"Seferde herhangi bir durak, kutu veya tahsilat objesi yoksa inaktif olmalı değil mi?"* Tek kural
  "başkası almamış"tı (`isRouteFree`); sayılara hiçbir yerde bakılmıyordu. `routeHasWork` eklendi ve
  **üç sayıya birden** bakıyor — yalnız durağa bakan bir kural, kutusu hazırlanmış ama durağı
  damgalanmamış rotayı yanlışlıkla kapatırdı.

  Kart soluk, dokunulamaz, notu sebebini söylüyor. "Başkasında" ile "iş yok" AYRI cümleler: tek bir
  "seçilemez" hâli kuryeye yarın gelip gelmemesi gerektiğini söylemezdi. Cümle GÜN SÖYLEMİYOR
  (kullanıcı bulgusu: *"yarında da bugün iş yok diyor"*) — liste üç gün taşıyor ve kart zaten bir gün
  başlığının altında.

  **Bedeli kayda geçti:** yalnız serbest ürünle yola çıkmak artık mümkün değil (araçtan satış sürülen
  bir sefere bağlı). Kullanıcı bunu bilerek seçti.

  ── **3 · TEK ADAY BIRAKILAMIYORDU** ────────────────────────────────────────
  *"Üç Eylül'dekini bana zorla seçtirtiyor, bırakamıyorum."* "Tek adayda soru sorulmaz" kuralı boş
  listeyi İKİ ayrı şey sayıyordu: "henüz seçmedim" ve "işaretini KALDIRDIM". Kurye işareti kaldırınca
  liste boşalıyor, kural yeniden devreye girip aynı rotayı geri işaretliyordu.

  Kusur dünden beri vardı ama görünmüyordu: dört boş rota da aday sayıldığı sürece "tek aday" hâli
  hiç doğmuyordu. (2) onları kapatınca kilit ortaya çıktı. Düzeltme iki parça — dokunuldu bayrağı, ve
  terslemenin ETKİN seçimin üstüne yazılması (kendiliğinden işaretlenen rota ham listede yoktur; ham
  listeye bakan bir tersleme onu "ekle" diye okur ve ilk dokunuş yine hiçbir şey yapmamış görünürdü).

  **Yol üstünde kapanan test borcu:** dört test tek rota kurup karta AYRICA basıyordu; bu 01.09'a
  kadar zararsızdı, bırakma düzelince o basış işareti kaldırmaya başladı — testler seçili bir kartı
  bırakıp seçili sanıyordu. Basışlar kalktı, gerekçesi dosyaya yazıldı.

  ── **ÖZET BLOĞU İKİ HÂLDE DE AYNI BOYDA** (kullanıcı kararı) ───────────────
  Kesikli "Ne yükleneceği sefer seçilince görünür" kutusu ile dolu özet kartı farklı yükseklikteydi
  ve her işaretlemede altındaki her şey zıplıyordu. İkisi de **102 dp** tabanına bağlandı (cihazda
  ölçüldü: 305 px @3x; iki hâl aynı turda). Tasarımda ikisi eşit DEĞİL (≈100 ↔ ≈70) — bilinçli sapma,
  sebebi hareket: tasarım duran bir kare, ekran seçimle değişen canlı bir yüzey.

  *(Ölçüm hatası da kayda geçiyor: ilk turda boy tek bir piksel sütunundan okundu, sütun kartın
  yuvarlak köşesine denk geldi ve 85 çıktı. Doğrusu satır satır, tüm genişlik taranarak bulundu.)*

- [x] (21.212) **YÜKLEME EKRANI: OKUTMA ROTAYI SÖYLÜYOR · DÜĞME İŞİNİ DEĞİŞTİRİYOR · YANLIŞ KUTU ÇEKMECE AÇIYOR** (kullanıcı kararları 01.09)

  Kullanıcının çerçevesi: araç bir ara depo ve içinde birden çok seferin kutusu duruyor; okutulan
  kutu bunların arasından birine yazılıyor. *"Barkod okutuldukça o kutu hangi sefere ait yazılmalı."*

  **1 · SONUÇ ROTAYI SÖYLÜYOR.** Toast yalnız `Kutu 2 yüklendi — LA-26-…` diyordu; iki seferli araçta
  kuryenin asıl sorusu cevapsızdı. Artık `Kuzey Hattı — Frankfurt · Kutu 2 yüklendi — …`. **Sefer
  künyesi değil ROTA ADI** (kullanıcının düzeltmesi): `SF-26-…` bir kayıt numarası. Ad sunucudan
  gelmiyor, elimizdeki duraktan çözülüyor (`runLabel`) — ekranın grup başlıkları da onunla kuruluyor,
  yeni bir alan aynı adı iki kaynaktan okumak olurdu.

  *Testin yakaladığı gerçek hata:* okutma geri çağrısı `stops`u bağımlılıklarına almıyordu, yani ilk
  render'ın BOŞ listesini kapatıyordu — rota adı hiçbir zaman bulunamayacaktı.

  **2 · TOAST SÜRESİ METNE GÖRE** (kullanıcı: *"rota adını söyleyeceği için bir miktar uzun tutulması
  gerekebilir"*). Sabit 2400 ms yerine okuma süresi: eşik 40 karakter, üstü karakter başına 45 ms,
  tavan 6 sn. Tavan şart — süresi metne bağlı bir toast, uzun bir hata mesajıyla ekranda kalıcı olur.

  **3 · OKUTMA DÜĞMESİ BİTİNCE "YÜKLEMEYİ BİTİR" OLUYOR.** Daire `remaining === 0` olunca hiç
  çizilmiyordu ve gerekçesi *"okutacak bir şey kalmadığında elin altındaki eylem de yok"*du; ölçülen
  sonuç başkaydı — o an ekranda elinin altında HİÇBİR eylem kalmıyor. Artık metinli hapa dönüşüyor;
  yukarıdaki düğme kalkıyor (ikisi birden dursa iki ayrı "bitir" olurdu). Eksik varken düzen aynı:
  yuvarlak okutma + yukarıda "N kutu eksik" düğmesi — *"kutular eksik de yüklemeyi bitirmek
  gerekebileceği için yukarıdaki butona hâlâ gerek var."*

  **4 · YANLIŞ KUTU ÇEKMECESİ.** *"Seferlerde olmayan bir kutu taratılırsa çekmece açılmalı, kırmızı
  ağırlıklı, hangi sefere ait olduğunu da söylemeli."* Hâl vardı ama toast'tı ve nereye ait olduğunu
  söylemiyordu — çünkü uç söylemiyordu. `wrong_route` cevabı `routeName` + `runReferenceNo` taşımaya
  başladı (sipariş → sefer → bölge, sunucuda); ikisi de `null` olabilir (sipariş hiçbir sefere
  damgalı değilse) ve cümle o zaman "henüz hiçbir sefere yazılmamış" oluyor. Ek okuma yalnız bu
  dalda: reddedilen okutma nadir, yükleme yolu hiçbir şey ödemiyor.

  Öteki sonuçlar toast'ta kaldı: onlar OLAN bir şeyi bildiriyor, bu ise OLMAYACAK bir şeyi durduruyor
  — kaçırılan bir uyarı, yanlış kutunun araca binmesi demek.

  **TASARIMDAN SAPMA:** v3:18 bunu listenin içinde duran kırmızı bir KART olarak çiziyor
  (*"Araçtaki hiçbir sefere ait değil — koyma"*). Kullanıcı çekmece istedi; kutu yüklenmediği için
  listede duracak bir satır yok. Kartın METNİ aynen alındı.

  **Yazılımın yapamayacağı kısım kayda geçiyor:** "aynı siparişin kutuları bir arada" ve "sefer sefer
  yükleme" büyük ölçüde rampanın fiziksel kuralı — kullanıcı bunu kendisi söyledi. Yazılım tarafında
  yapılabilecek üç şeyin üçü de artık var: liste sefere+siparişe göre gruplu, her okutma hangi rota
  olduğunu söylüyor, yabancı kutu görünür şekilde geri çevriliyor.

- [x] (21.213) **HAREKET ÇUBUĞU ŞERİDİ ARTIK KREM — perde kapatıldı** (kullanıcı bulgusu 01.09, cihazda ölçüldü)

  Ekranın en altındaki 16 dp'lik şerit uygulamanın kreminden açık çiziliyordu; üstteki durum çubuğunda
  aynı sorun yoktu. Ölçüm sebebi doğrudan verdi: uygulama zemini `#f2f0e8`, şerit `#fefefd` — ve
  `#fefefd`, kremin ÜSTÜNE %90 opaklıkta beyaz koymanın tam sonucu. Yani krem oraya çiziliyor,
  üstüne bir PERDE seriliyor.

  Perdeyi Android çiziyor (`isNavigationBarContrastEnforced`) ve açan kütüphanenin kendi teması:
  `Theme.EdgeToEdge`, `enforceNavigationBarContrast` özniteliğini varsayılan `true` yapıyor. Amacı
  koyu içerikli uygulamalarda çubuğun okunur kalması; bizde zaten açık bir zeminin üstüne ikinci bir
  açık katman koyuyor. Üstte sorun olmamasının sebebi de aynı modülde: `isStatusBarContrastEnforced`
  her iki dalda da `false`, ayrım yalnız gezinme çubuğunda.

  Çözüm eklentinin kendi seçeneği (`app.config.ts` → `enforceNavigationBarContrast: false`), yani
  native klasöre elle dokunulmadı. **Yeniden derleme ister.**

  **YANLIŞ TEŞHİS KAYDA GEÇİYOR:** ilk teori *"pencere zemini boyanmamış"*tı ve `expo-system-ui` ile
  boyandı — cihazda HİÇBİR ŞEY değişmedi (kayıt `expoRootBackgroundColor = #f2f0e8` yazılmıştı, şerit
  aynı kaldı). O değişiklik geri alındı: ölçüm teoriyi yalanladığında kod da gider.

- [x] (21.214) **BESLEME ARACA MAL KOYMUYOR** (kullanıcı bulgusu 01.09)

  *"Ben araca ürün eklemedim ama araçta ürün görünüyor. Bunlar besleme datası mı?"* Evetti: STR → VAN-1
  arası 4 kalemlik bir transfer açılıp aynı anda kabul ediliyordu ("Sabah yüklemesi — serbest satış
  fazlası"), yani araç dolu doğuyordu (ölçüldü: 4 stok satırı, 6'şar adet, `db:refresh` anında).

  26.08'deki gerekçe artık geçerli değil: araca serbest ürün koymak kuryenin kendi adımı (yükleme
  ekranının SERBEST ÜRÜN bölümü, v3:19). Kutular için 01.09'da verilen kararın aynısı — **besleme
  dünyayı kurar, işi insan yapar.** Kapsam denetimi etkilenmiyor: zorunlu kovalar deponun araç
  TÜRÜNÜ ve araç kaydını sayıyor, araçtaki stoğu değil.

- [ ] (21.215) **Sipariş tamamlamada mevcut adres düzenlenebilsin** — bugün yalnız YENİ adres
  kurulabiliyor; adres kartına dokunmanın düzenleme karşılığı yok (kullanıcı bulgusu, web şeridi
  aktardı). Kullanıcının istediği yol: karta UZUN BASINCA düzenleme açılsın, keşfedilebilirlik için
  kartın bir köşesinde silik bir ipucu dursun (*"düzenlemek için uzun basınız"*).

- [x] (21.216) **Dokunmatik geri bildirim KİTE bağlandı — "eylem titresin, gezinme sessiz"**
  (kullanıcı bulgusu 01.09 + kararı 02.09)
  - **Durum (02.09) — sözlük eksik değildi, BAĞLANMAMIŞTI.** `lib/haptics` beş niyeti iyi tarif
    ediyordu ama yalnız ALTI dosya çağırıyordu; üstelik sözlüğün kendi künyesinde adı geçen yerler
    bile boştu — `hapticSelect` *"adet değiştirme"* için yazılmış, oysa hiçbir adet düğmesi
    titremiyordu (kullanıcının verdiği örnek tam buydu). Ekran ekran eklemenin sonucu bu: eksik
    titreşim hata vermez, yani unutulanı kimse göremez.
  - **İKİ KARAR ÇATIŞIYORDU, ikisi de ayakta bırakıldı.** 16.08: *"her yerde olsun istemiyorum"*
    (sekme/çip geçişleri bilerek dışarıda). 01.09: *"düğmelere basıldığında mümkün mertebe geri
    bildirim"*. Kullanıcı 02.09'da sınırı çizdi: **eylem titrer, gezinme sessiz.** Kural kitin TEK
    dokunma yüzeyine kondu (`PressableSurface` — 93 dosya oradan geçiyor), muafiyet ÜÇ yerde açık
    yazıldı: çip · metin eylemi · sekme çubuğu.
  - **Ayrım rolden TÜRETİLEMEDİ** (ölçüldü): çipler `accessibilityRole` vermiyor, varsayılan
    `button`a düşüyorlar — yani a11y rolü burada bir sınır değil. Muafiyet açık bir prop
    (`haptic={false}`), çünkü örtük bir kural bu üç yerde yanlış tarafa düşerdi.
  - **Uzun basma daha güçlü** (`hapticCommit`): kazara olmaz, kullanıcı bekleyerek yapar ve fiziksel
    bir "oldu" bekler. Aynı tıkla geçiştirmek iki ayrı hareketi aynı sesle anlatmak olurdu.
  - **Testler:** dördü kuralın kendisini çiviliyor (varsayılan tık · uzun basma commit'i · muafiyet
    susturur · olmayan uzun basma kanca kurmaz). Bekçi gerekliydi: fazla konan muafiyet uygulamayı
    sessizleştirir, eksik konan gezinirken titretir — ikisi de hata vermez.

- [ ] (21.217) **B2B onay ekranı yok ama bildirimi var** — `notification-map.ts:42`
  `b2b_application_received → 'management'` diyor, `screens/management/` altında karşılığı olan
  ekran yok. Bildirim cihaza düşüyor, dokunuluyor, boşluğa gidiyor. İki yol: ya ekran yazılır ya
  bildirim mobilde yönlendirilmez. Kural/metin/motor hazır (`b2bSignals` · `b2bFlag` ·
  `b2bSummaryTask` · `setB2bApproval`), iş yalnız ekranın kendisi.

- [ ] (21.218) **"Eksikleri bildirerek siparişi kapat" düğmesi açık kutu varken görünmesin** —
  sunucu kuralı ZATEN var (`declareOrderShort` içi dolu açık kutuda `open_box_not_empty` dönüyor);
  eksik olan ekranın kapıyı önden okuması. **DOLU** açık kutuda gizlenir, boşta gizlenmez: sunucu
  boş kutuyu "niyet artığı" sayıp siliyor ve beyanı yazıyor — her açık kutuda gizlemek, boş kutu
  açmış depocuyu çıkışsız bırakırdı.
  - **BEKLEYEN(21.218):** ölçüm için toplanacak sipariş gerekiyor; `order` tablosu 02.09'da boş
    (besleme artık sipariş üretmiyor). Sipariş doğunca cihazda doğrulanacak.

- [ ] (21.219) **Durak ekranından geri dönüşte Android çökmesi** — `addViewAt: failed to insert
  view … The specified child already has a parent` (31.08, CPH1907; üç turda tekrar üretilmiş).
  Yalnız DURAK ekranının geri dönüşünde; kardeş geçişler aynı turda sağlam. Şüphe ekranın üç
  örtüsünde (iki çekmece + `ScanSheet`) — gezinme sırasında sökülen portal.
  - **BEKLEYEN(21.219):** 01.09'daki `@gorhom/bottom-sheet` göçü RN `Modal`ını tamamen kaldırdı
    ve yığın izi tam oraya işaret ediyordu; arıza göç ile kapanmış OLABİLİR. Ölçüm sefer + durak
    ister, `delivery_run` tablosu 02.09'da boş — sipariş ve sefer doğunca ilk iş bu turu tekrarlamak.

- [x] (21.220) **D1: etiket çekmecesi kapanınca BEKLEYEN kuyruğa dönülüyor** (kullanıcı bulgusu
  02.09: *"toplama bittiği zaman tekrardan bekleyen siparişler listesine dönmem gerekiyor ama sanki
  yönlendirme başka oluyor"*)
  - **Durum (02.09) — kapsam geçişi doğruydu, BIRAKMA yanlıştı.** Son kutu kapanınca ekran
    TAMAMLANANLAR kapsamına geçiyor; sebebi 01.09'da yazıldı ve duruyor: etiket çekmecesi hazırlık
    dalında çizilmiyor, sipariş kuyruktan düşünce ekran o dala atlıyor ve **yeni açılmış çekmece
    kapanıyordu** — basım düştüğünde "yeniden bas" düğmesi okunmadan siliniyordu. Eksik olan
    geçişin kendisi değil DÖNÜŞÜYDÜ: depocu tamamlananlarda bırakılıyor, sıradaki siparişe geçmek
    için kapsamı ELLE çevirmesi gerekiyordu.
  - **Çekmece kapanınca kuyruğa dönülüyor.** Çekmecenin kapanması "etikete bakmayı bitirdim"
    demektir; o an geçişin sebebi de ortadan kalkar. Bayrak iki hâli ayırıyor ve ayrım şart:
    aynı çekmece TAMAMLANANLAR listesinden "şu etiketi yeniden basayım" diye de açılıyor —
    orada depocu bilerek gitti, onu kuyruğa fırlatmak istemediği bir ekrana taşımak olurdu.
  - **Kapsam geçişi de daraldı:** yalnız çekmece GERÇEKTEN açıldıysa. Etiket okuması düşerse
    korunacak bir şey yok; kuyrukta kalmak zaten doğru yer ve `load()` biten siparişi listeden
    düşürüyor. Eskiden `ready` olan her kapanışta geçiliyordu.
  - **Cihazda uçtan uca ölçüldü (Oppo CPH1907, 02.09):** `LA-26-3L3CNR` (3 kalem · 7 adet) kutu
    açılıp elle dolduruldu, kutu kapatıldı → sipariş tamamlandı, etiket çekmecesi açıldı (basım
    400 ile düştü, çekmece açık kaldı — 01.09'un güvencesi çalışıyor). Çekmece kapatıldı → ekran
    **"BEKLEYEN SİPARİŞLER · 6 sipariş bekliyor"** listesine döndü (7'ydi). DB: sipariş `ready`.
  - Test: mevcut "son kutu kapanınca" testi genişletildi — kapanış sonrası kuyruğa dönüş çivilendi.
    İki bekleyen siparişle kuruluyor, çünkü tek sipariş kalırsa ekran onu doğrudan açıyor (kuyruk
    hiç çizilmez) ve testin ölçtüğü şey görünmez olurdu.
  - **ÇIKIŞ YOLU İKİ TANEYDİ, İLK TUR BİRİNİ KAÇIRDI** (kullanıcı bulgusu 02.09, aynı gün):
    *"yukarıdaki geri butonuyla çıktığımızda gittiği sayfa ana sayfa oluyor."* Çekmecenin kapanışı
    düzeltilmişti ama BAŞLIKTAKİ GERİ hâlâ `router.back()`e düşüyordu — kapanışta kapsam
    tamamlananlara geçiyor ve o listede tek kayıt varken "kuyrukta başka iş var mı" dalı tutmuyor,
    depocu DEPO KABUĞUNA çıkıyordu. Kural artık tek kapıda (`leaveFinished`): iki çıkış yolu da
    aynı yerden geçiyor, biri düzeltilip öteki unutulamaz. Geri düğmesi üç ayrı sorunun cevabı
    oldu — iş yeni mi bitti · kuyrukta başka iş var mı · yoksa ekrandan çık.
  - **Cihazda ikinci tur (Oppo CPH1907, 02.09):** `LA-26-VJC3CU` (4 kalem · 10 adet) toplandı,
    kutu kapatıldı → sipariş tamamlandı, etiket çekmecesi açıldı, basım 400 ile düştü. **Üstteki
    geri düğmesine** basıldı → ekran "BEKLEYEN SİPARİŞLER · 5 sipariş bekliyor" listesine döndü
    (6'ydı) ve çekmece de kapandı. DB: sipariş `ready`. Testte `router.back`in çağrılMAdığı ayrıca
    çivilendi.

- [x] (21.221) **"Eksikleri bildirerek siparişi kapat" 500 veriyordu — ve düğme hiç görünmemeliydi**
  (kullanıcı bulgusu 02.09, log paylaşıldı; düğmenin gizlenmesi ikinci kez söylendi)
  - **İKİ AYRI ARIZA, biri ötekini doğurdu.**
    1. **Düğme açık kutuda görünüyordu.** Depocu kutuya ürün koydu, KAPATMADAN kırmızı düğmeye
       bastı. Sunucunun kendi kuralı var (`declareOrderShort` → `open_box_not_empty`) ama pratikte
       **hiç tutmuyor**: taslak İSTEMCİDE yaşıyor, kutunun içeriği ancak mühürlenince yazılıyor —
       yani sunucu açık kutuyu her zaman BOŞ görüyor. Kararı ekran vermek zorunda; artık veriyor.
    2. **Boş kutu dalı ÖLÜYDÜ.** Sunucu "boş açık kutu" hâlinde onu niyet artığı sayıp siliyordu:
       `OrderBoxService.delete`. Ama servis silmeye KAPALI kurulu (`allowDelete = false`), yani bu
       satır hiç koşmamıştı — ilk tetikleyen kullanıcı oldu ve uç 500 döndü
       (`[order_box] delete kapalı. Ters kayıt ya da RPC kullan.`).
  - **Çare servisi silmeye açmak DEĞİL**: o zaman mühürlü kutu da silinebilir hâle gelirdi. Kural
    veriye kondu ve dar: `discard_order_box` (0048) yalnız **mühürsüz VE boş** kutuyu atar; mühürlü,
    araca binmiş ya da dolu kutuyu reddeder. Cihazdan doğan gerçek bir boş kutuyla ölçüldü: RPC
    `{"ok": true}` döndü ve satır silindi; mühürlü kutuda `kutu mühürlü, atılamaz` ile reddetti.
  - **Düğme BOŞ açık kutuda DURUYOR** ve bu bilinçli: tamamen gizlemek, mühürlü kutusu olan
    depocuyu çıkışsız bırakırdı — boş kutu mühürlenemiyor (`empty` reddi), beyan da veremezdi.
    O yol artık sunucuda geçerli.
  - **Beyandan sonra da KUYRUĞA dönülüyor.** Bir tur burada da kapsam tamamlananlara geçiyordu ve
    gerekçesi kapanıştan kopyalanmıştı; oysa o gerekçe ETİKET ÇEKMECESİNİNDİ — beyanda korunacak
    bir çekmece yok. `21.220`nin aynı hükmü.
  - **Cihazda ölçüldü (Oppo CPH1907):** `LA-26-MR6HFL` eksik beyanıyla kapandı — `ready`, kutu
    mühürlü 9 adet, `Havuç Dilimi Baklava` 1 istenen / 0 gönderildi. 500 yok.
  - Testler: iki yeni bekçi (dolu açık kutuda düğme ÇİZİLMEZ · boş açık kutuda DURUR) + eski
    davranışı kodlayan üç test yeni gerçeğe taşındı.

- [x] (21.222) **D4 BAŞTAN: SAYIM ve STOK DÜŞÜMÜ ayrıldı · raf listesi açıldı** (tasarımın B ve C
  maddeleri — `BEKLEYEN(21.192)` kapandı; kullanıcı isteği 02.09: *"d dört ve d beş için çalışma yap"*)
  `touches:` `packages/types/src/contracts/warehouse-api.schema.ts` ·
  `packages/application/src/warehouse/adjustment.ts` · `apps/mobile-api/src/api/v1/warehouse.ts` ·
  `apps/mobile/src/screens/warehouse/{stock-count-screen.tsx,write-off-screen.tsx,batch-picker.tsx,batch-context-card.tsx,adjustment-result-card.tsx,transfer-screen.tsx}` ·
  `apps/mobile/src/screens/warehouse/{use-batch-subject.hook.ts,use-adjustment.hook.ts}`

  ### 1 · Eski ekran YANLIŞ SORUYU soruyordu
  v2'nin "Sayım / Düzeltme"si tek bir **işaretli adet** alanı ve dört sebep çipiydi: depocu farkı
  KENDİ hesaplayıp yazıyordu ("sistemde 12, rafta 9 → −3"). Üç arıza birden: aritmetiği insan
  yapıyor ve yanlışı sessizce stoğa geçiyordu · **karşılaştıracağı sayı ekranda hiç yoktu** (parti
  adedi gösterilmiyordu) · aynı ekran sayımı, imhayı ve kaybı birlikte topluyordu.

  Artık soru tek: **rafta kaç adet var.** Farkı sistem buluyor, sebebi ancak fark VARSA soruyor
  (sebep = kaydın notu; yazım `count_diff`). Stok DÜŞÜMÜ ayrı ekran (D4b): hasar/soğuk zincir ·
  kayıp. Süresi geçen mal hiçbirinde yok — o D3'ün kendi eylemi (21.191).

  ### 2 · RAF LİSTESİ — okunamayan etiketin yedeği
  Ekranın konusu bugüne kadar yalnız dışarıdan geliyordu (D3'ten taşıma ya da okutma) ve okunamayan
  etiket depocuyu çıkışsız bırakıyordu; ekran bunu kendi de yazıyordu (*"depo partilerini listeleyen
  bir okuma kapısı henüz yok"*). Açıldı: `GET /warehouse/batches?q=` — depo süzgeci JETONDAN, yalnız
  stoğu duranlar, SKT'ye göre sıralı. **Sayfa değil pencere** (60) + arama; tavana dayanınca
  `truncated` bunu SÖYLÜYOR — sessiz kırpma, depocunun "listede yok" deyip yanlış partiye gitmesiydi.

  ### 3 · BAĞLAM KARTI: iki sayı yan yana
  Sözleşme iki alan kazandı: `variantWarehouseQty` (ürünün BU depodaki toplamı) ve `dateType`
  (DLC/DDM). İkincisi süsleme değil — D3'te ölçülen arızanın (21.191) aynısı burada da mümkündü:
  rejimi söylenmeyen bir tarih, satılabilir malı imha ettirir.

  ### 4 · SONUÇ KARTI: sayılar ÖLÇÜLÜR, hesaplanmaz
  Kayıttan sonra ekran kapanmıyor, TUTANAĞA dönüyor: olay referansı + *"partide 8 → 6"* +
  *"ürünün toplam stoğu 69 → 67"* + iki çıkış. İkinci sayılar kapıdan geliyor (`after`), ekranın
  çıkarması değil: `eski − düşülen` aynı partiye o sırada dokunan başka bir yazımı (kabul, toplama)
  sessizce yok sayardı. **`after: null` = ölçülemedi** ve sıfır değil (CLAUDE §1) — ekran o hâlde
  "yeni değer okunamadı" der, sayı uydurmaz. Çok partili olayda da `null`: "hangi partinin yeni
  hâli" sorusunun tek cevabı yoktur.

  ### 5 · D5 · TRANSFER — üç bölümün ikisi KART DEĞİLDİ
  Cihazda ölçüldü: "YOLDA" ve "SON KAPANANLAR" düz, alt çizgili satırlar hâlindeydi; şablonun üç
  bölümünde de kutu var. Fark görsel değil yapısal — kutu "bu bir kayıt" der, alt çizgi yalnız
  "burada bir sınır var" der ve üç bölüm tek uzun listeye eriyordu. Kapanmış kayıt `quiet` tonunda
  (günlük iş değil), sonucu şablondaki gibi SAĞDA. Ekranın geri kalanı zaten v3'e uygundu.

  **Doğrulama.** Tip · lint · **knip temiz** · mobil **228/228** (yeni: D4 9 test, D4b 6 test) ·
  uygulama katmanına 7 entegrasyon testi (kapsam süzgeci · iki sayı · tükenmiş parti · arama ·
  kırpma · ölçülen `after` · çoğulda `null`).

  **Cihazda uçtan uca (Oppo CPH1907, 02.09):** raf listesi 8 parti çizdi (`EXP-DDM · Derin
  dondurucu 2 · sistemde 8`) → parti seçildi → bağlam kartı **8 / 69** → "6" yazıldı → *"Sistemde 8
  yazıyor, sen 6 saydın — 2 adet EKSİK"* → sebep *yanlış sayılmıştı* → **SAY-STR-26-0001**, parti
  8→6, ürün toplamı 69→67, `count_diff`/`out`/2, not ve aktör kayıtta. Ardından D4b: aynı partiden
  1 adet *kayıp* → **IMH-STR-26-0001** (`write_off`/`lost`/`out`/1), parti 6→5. D5 kartlı hâliyle
  yeniden çekildi.

- [x] (21.223) **KUTU AÇMAK HAZIRLIĞI BAŞLATMIYORDU — `preparing` yazan yer kalmamıştı**
  (tam paket koşusunda yakalandı 02.09; kırmızı 21.222 öncesinden duruyordu)
  `touches:` `packages/application/src/warehouse/{boxes.ts,boxes.test.ts}` ·
  `apps/mobile-api/src/api/v1/warehouse.ts`

  **Belirti:** `boxes.test.ts` *"BEYANSIZ kapanışta eksik sipariş HAZIR OLMAZ"* testi `preparing`
  bekliyor, `confirmed` alıyordu. Ölçüm testin haklı olduğunu söyledi: **kodda `preparing` yazan
  hiçbir yer kalmamıştı** — `grep "= 'preparing'"` tüm migration'larda tek satır buluyor
  (`unseal_order_box`, yani kutu GERİ AÇILINCA). Eski akışta geçişi `confirmPreparation` yazıyordu;
  v3'ün kutu döngüsüne geçilirken (`c81e7c36`) o yol kutulara devredildi ama geçiş devredilmedi.

  **Neden sessiz kaldı:** D1 kuyruğu `['confirmed','preparing']` birlikte okuyor, yani depocu
  tarafında hiçbir şey bozulmuş görünmüyordu. Bozulan MÜŞTERİ tarafıydı: sipariş kutulanırken
  ekranda hâlâ "Alındı" yazıyor, "Hazırlanıyor" hâli hiç görünmüyordu (`notification-data`nın
  `prepared` damgası da `firstAt('preparing')` okuyor).

  **Çare geçişi KUTU AÇILIŞINA koymak** — hazırlığın gerçekten başladığı an (`ORDER_LIFECYCLE`:
  *`preparing` = depoda hazırlanıyor*). Geçiş kutuyu BAĞLAMAZ: başarısızlığı yutuluyor, çünkü kutu
  açılmıştır ve fiziksel gerçek odur. Aktör kutuyu açan personeldir (21.183'ün iz kuralı).

  **Doğrulama.** Yeni bekçi: `confirmed` → `openBox` → `preparing`. Tam paket **4132/4132**
  (kalan tek kırmızı web şeridinin `checkout-shipping-order` dosyasında — `address_city_mismatch`,
  bu şeridin işi değil; not bırakıldı).

- [x] (21.224) **"ADET SOLDA, SEBEP SAĞDA" KALIBI KİTE TAŞINDI — mal kabulden stok düşümüne**
  (kullanıcı kararı 02.09: *"mal kabulde hasar belirt dediğinde görünen yer… bu tasarımı başka
  yerlerde de kullanmak mümkün görünüyor, bir bak"*)
  `touches:` `apps/mobile/src/components/operations/qty-reason-row.tsx` ·
  `apps/mobile/src/screens/warehouse/{intake-screen.tsx,intake-screen.test.tsx}` ·
  `apps/mobile/src/screens/warehouse/{write-off-screen.tsx,write-off-screen.test.tsx,messages.json}`

  **Kullanıcı haklıydı ve kalıp gerçekten iki yerin ortak sorusu:** *bir tavanın içinden ne kadarı,
  ve niçin.* D2'de "kabul edilen 12 paketin kaçı hasarlı", D4b'de "partideki 6 adetin kaçı düşüyor".
  İkisinde de adet tek başına anlamsız, sebep tek başına eksik.

  Kalıbın kendisi zaten kullanıcının kararıydı (30.08): şablon dört sebep çipini karta seriyordu,
  kullanıcı sayacın sağındaki boş alanı bir düğmeye verdi ve listeyi çekmeceye aldı. Ama kalıp
  `intake-screen.tsx`in 2200 satırı arasında GÖMÜLÜYDÜ — ikinci kullanıcısı onu ancak kopyalayarak
  alabilirdi (`CLAUDE §1`). Artık kitte: `OperationsQtyReasonRow` (sayaç + sebep alanı + çekmece).

  **D4b bu kalıba geçti** ve tasarımdan (v3:09'un büyük `−N` alanı + ayrı sebep bloğu) bilinçle
  sapıldı. Kazanç yalnız tutarlılık değil: cümle artık KALANI da söylüyor — *"Partideki 5 adetin
  kaçı düşüyor? Kalan 3 rafta durmaya devam eder."* Depocunun kafasındaki soru buydu ve hiçbir
  yerde yazmıyordu. Tavan da sayaçta: artı düğmesi partinin tamamında sönüyor.

  **D4 sayım BU KALIBA GEÇMEDİ ve bu bilinçli.** Oradaki adet bir tavanın PAYI değil, ölçülen
  mutlak bir sayı; "içinden işaretlenir" cümlesi orada yanlış olurdu. Sebep de kendi UYARI
  bloğunun konusu ("FARK VAR — SEBEP GEREKLİ") ve liste kısa — çip orada doğru dil. Ayrım kitin
  künyesinde yazılı, yoksa iki dil bir gün rastgele seçilmeye başlar.

  **Kurye teslimatı da geçmedi:** oradaki sebep bir KISIT değil, serbest metnin hızlı doldurucusu
  (21.8'in kararı) — çip listesi kapalı bir küme olmadığı için alan+çekmece yanlış olurdu.

  **Doğrulama.** Tip · lint · knip temiz · mobil **1249/1249** (mal kabulün üç testi yeni
  kimliklere taşındı, D4b'nin beş testi sayaç+çekmece akışına). **Cihazda (Oppo CPH1907):** aynı
  partiden 2 adet *hasar / soğuk zincir* → `IMH-STR-26-0002` (`write_off`/`damaged`/`out`/2),
  parti 5→3; sebep etiketinin koda çevrildiği kayıtta doğrulandı.

- [x] (21.225) **D4'ün BÜYÜK RAKAMI ARTIK DÜĞME — klavye değil ADET ÇEKMECESİ açılıyor**
  (kullanıcı kararı 02.09: *"ortadaki rakama tıklandığı zaman adet çekmecesi açılsın… kastım mal
  sayımda kullandığımız adet çekmecesi"*)
  `touches:` `apps/mobile/src/screens/warehouse/{stock-count-screen.tsx,stock-count-screen.test.tsx,messages.json}`

  **Fark pratik, süs değil:** depocu rafta 27 paketi rakam rakam yazmaz — *"iki koli, üç tek"* der.
  Çarpmayı ekran yapıyor (`OperationsQuantitySheet`, mal kabulün çekmecesi) ve cetvel sayıyı tek
  dokunuşla veriyor. Eski hâlde alan bir `TextInput`ti: sayısal klavye açılıyordu.

  Tasarım bunu zaten söylüyormuş — v3:08'in büyük rakamında `onClick="{{ sayBasla }}"` var; ilk
  turda düz metin olarak yazılmıştı.

  **İkinci bir sayım dili yazılmadı** (CLAUDE §1): aynı çekmece, çağıranın kopya metniyle. Metin
  sayıma göre değişiyor ve BİR ŞEY SÖZ VERMİYOR — mal kabulde eklenen koli boyu ürün kartına
  yazılır, sayımda yazılmaz; kopya bu yüzden *"YENİ · yalnız bu sayımda"* diyor.

  **Döküm YUKARI ÇIKMIYOR, toplam çıkıyor.** Sayımın kaydı bir SAYIDIR; "2 koli + 3 tek" ona
  varmanın yolu ve kayıtta karşılığı yok. Döküm saklansaydı ekranda duran sayı ile kayda giden sayı
  iki ayrı yerde yaşardı. `caseSizes` boş geçiliyor: parti sözleşmesi koli boyu taşımıyor, depocu
  elindeki koliye bakıp çarpanı çekmecenin kendi adımından seçiyor.

  **± DÜĞMELERİ KALDI:** çekmece "kaç var" sorusunun, ± ise "bir tane daha buldum" anının aracı.

  **BEKLEYEN(21.227):** aynı kural SAYAÇLARIN ORTASINDAKİ rakam için de geçerli olacak
  (`OperationsStepperGroup` → D2 hasar · D3 imha · D4b düşüm · kurye ekranları). Prop
  (`onPressValue`) kurye şeridinde YAZILDI ama commit'lenmedi; commit'lenmemiş bir prop'a dayanan
  kod tek başına derlenmeyen bir commit demek. Şartname `docs/talep/`te, prop yayına girince
  depo tarafını bağlayacağım.

  **Doğrulama.** Tip · lint temiz · mobil **1249/1249** (D4 testleri artık gerçek kullanımı izliyor:
  cetvelden seçip onaylıyorlar). **Cihazda (Oppo CPH1907):** büyük rakama basıldı → "Rafta kaç var"
  çekmecesi açıldı (koli bölümü + cetvel), cetvelden 5 seçildi → *"Sistemde 3 yazıyor, sen 5
  saydın — 2 adet FAZLA"*, sebep bloğu açıldı.

- [x] (21.226) **SAYIYA BASINCA ADET ÇEKMECESİ · BAŞLAT DÜĞMESİNİN BOYU · ARAÇTAN ÇIKAR UZUN BASMADA** (kullanıcı kararları 02.09)

  ── **1 · SAYAÇTA ORTADAKİ RAKAM ARTIK DÜĞME** ───────────────────────────────
  Serbest ürün listesinde her satırın `− n +` sayacı var; kullanıcı *"bu rakamı bastığım zaman adet
  çekmecesinin açılmasını istiyorum"* dedi. Gerekçe rampanın kendisi: 12 adet koyacak kurye artı
  düğmesine on iki kez basıyor.

  **KİTTE YAZILI BİR KURAL GERİ ALINDI.** `OperationsStepperGroup`un künyesi *"ortadaki sayı
  DOKUNULABİLİR DEĞİL… yanlışlıkla açılan bir klavye, sayacın var olma sebebini (klavyesiz sayım)
  ortadan kaldırırdı"* diyordu. Kuralın dayandığı VARSAYIM yanlıştı: sayıya basmak klavye açmıyor,
  kitin kendi adet çekmecesini açıyor (`OperationsScanQtySheet` — aynı sayacın büyük hâli).

  Dokunuş isteğe bağlı (`onPressValue`): vermeyen yirmiye yakın çağıranda sayı düz metin kalıyor —
  dokunulunca hiçbir şey yapmayan bir düğme, bozuk bir düğmedir. Testte iki hâl de çivili.

  Araca yazım ONAYDA, her dokunuşta değil: çekmecede 1'den 12'ye çıkan kurye on iki hareket kaydı
  doğurmuyor. Fark tek çağrıda uygulanıyor ve listenin `±` düğmeleriyle AYNI kapıdan geçiyor.

  ── **2 · "SEFERİ BAŞLAT" DÜĞMESİ TASARIMIN ÖLÇÜSÜNE GELDİ** ────────────────
  Kullanıcı *"renk ve gölge farkı var, bu bizim komponentimizi kullanmadığın anlamına geliyor
  galiba"* dedi; sonra *"butonun yüksekliği bile farklı… ortak komponent tarafındaki buton
  yüksekliği sabit değil mi?"*

  Komponent bizimdi; iki ayrı eksik vardı ve ikisi de ölçülmeden görülmüyordu:

  · **Işıma yoktu.** Tasarım `box-shadow:0 4px 14px rgba(95,122,44,.22)` (v3:16 satır 37) ve kitte
    o ışıma HAZIR duruyordu (`shadow.glow`) — hiçbir ekran çağırmadığı için. Kitin kendi künyesi
    bunu bekleyen bir arıza diye yazmıştı. Tek satır: `elevation="glow"`.
  · **Yükseklik sabitti.** Blok düğme `size.controlLg` (52) ile sabit çiziliyor; tasarım ise ipuçlu
    düğme için `min-height:58px` diyor — yani SABİT değil TABAN. Etiket + ipucu 52'ye sıkışıyordu.
    Yeni durak: `size.controlStack: 58`, ve ipucu verilen blok düğme artık tabanlı — metin uzarsa
    kutu büyüyor, kırpmıyor. Ayrım tasarımın kendi yazımında duruyordu: düz düğme `height:54`,
    ipuçlu düğme `min-height:58`.

  **NASIL ATLANDI, kayda geçiyor:** ilk turda söylenen iki şeye (renk, gölge) bakıldı, kutunun
  kendisi ölçülmedi. Ders: bildirilen belirti bir BAŞLANGIÇ noktasıdır, ölçümün sınırı değil.

  ── **3 · ARAÇTAN ÇIKAR: ÜÇÜNCÜ YERİNDE** ──────────────────────────────────
  Eylem 31.08'de eklenmişti (tasarımda yok; boşluk cihazda görüldü). Yeri iki kez reddedildi:
  önce kartın ALTINDA metin eylemiydi — birincil düğmenin yanında duran yıkıcı bir bağlantı; sonra
  sağ üst köşede ikon düğme oldu, kullanıcı *"orada çok olmamış"* dedi. Üçüncü hâl onun kararı:
  **karta uzun basınca** kırmızı onay çekmecesi açılıyor.

  Çekmecenin tonu da düzeldi: `olive`ti ve o ton *"geri alınamaz ama olumlu"* demek (çekmecenin
  kendi künyesi). Eylem yıkıcı — sefer kaydı düşer, siparişler serbest kalır, araçtaki kutuların
  damgası silinir; metin bunu zaten sayıyla söylüyordu, artık rengi de söylüyor.

  Kitte iki küçük değişiklik gerekti: `PressableSurface` ve `OperationsSurface` "yalnız uzun basma"
  hâlini tanıyor — ve tipte zorluyor, yani iki eylemden en az biri olmadan bir yüzey dokunulabilir
  yapılamıyor.

  **BEKLEYEN(BACKLOG §1):** uzun basma GÖRÜNMEZ bir yol. Ekran okuyucuya ipucu veriliyor
  (`accessibilityHint`), gören kullanıcı için kartın üstünde bir işaret yok — kurye eylemin
  varlığını ancak öğrenirse biliyor. İşaret istenirse tasarım kararı gerekiyor.

  ── **YOL ÜSTÜNDE ÇIKAN GERÇEK HATA** ───────────────────────────────────────
  Testler `fillCopy`den uyarı bastı: eksik kutu onay metninde `{n}` İKİ KEZ geçiyor ve fonksiyon
  yalnız ilkini dolduruyordu (`String.replace` metin kalıbıyla tek eşleşme değiştirir) — ikincisi
  ham `{n}` olarak ekrana çıkıyordu. Artık her geçiş doluyor. Yakalayan şey 01.09'da eklenen
  geliştirme uyarısıydı; aynı tuzağa ikinci kez düşülmüştü.

  Doğrulama: mobil Jest **149 paket / 1249 test** · typecheck · lint. Cihazda ölçüm yapılamadı
  (telefon kilitli); ölçüm kilit açılınca yapılacak.

- [ ] (21.227) **ADET ÇEKMECESİ SAYAÇLARIN ORTASINDAKİ RAKAMA DA BAĞLANSIN — DEPO ekranları**
  (21.225'in bıraktığı işaret · depo şeridinin işi)

  Prop 21.226'da yayına girdi (`OperationsStepperGroup.onPressValue` + `valueHint`) ve kurye
  şeridinde bir çağıranı var (serbest ürün listesi). Kalan: D2 hasar · D3 imha · D4b düşüm
  sayaçlarının ortasındaki rakam. Şartname `docs/talep/`te; bağlayacak olan depo şeridi.

- [x] (21.228) **ADET ÇEKMECESİNE "RAKAMLA GİR" ADIMI — cetvel 24'te bitiyordu**
  (kullanıcı sorusu 02.09: *"ortaya tıklandığında doğrudan sayı klavyesi açılsa daha mı hızlı
  olur? Adet çekmecesi bu anlamda kötü bir seçenek mi?"*)
  `touches:` `apps/mobile/src/components/operations/{keypad-panel.tsx,keypad-panel.test.tsx,amount-keypad.tsx,quantity-sheet.tsx}` ·
  `apps/mobile/src/screens/warehouse/{stock-count-screen.test.tsx,messages.json}`

  **Soru haklıydı ve ölçüm ikisini de haklı buldu.** Cetvel 0–24 arasını TEK dokunuşla veriyor ve
  klavyesiz; ama orada bitiyor, ötesi yalnız ±1. Rafta 40 açık paket varsa cetvelden 24, sonra on
  altı kez artı — tuş takımında iki tuş. Mal kabulde bu delik dar (mal koli koli geliyor ve çarpan
  ürün kartında **kayıtlı**), sayımda geniş (parti sözleşmesi çarpan taşımıyor, raf çoğu zaman
  açık duruyor).

  Bu yüzden ikisinden biri değil İKİSİ: koli ve küçük sayı cetvelden, büyük ve tek sayı rakamdan.
  30.08'in bulgusu (*"depocu 27 paketi rakam rakam yazmaz"*) yerinde duruyor — o bulgu tuş
  takımının çekmecenin YERİNE geçmesine karşıydı, yanında durmasına değil.

  **Sistem klavyesi DEĞİL kendi tuş takımımız:** eldivenli el (tasarımın kendi cümlesi) ve —
  burada özellikle — çekmecenin üstüne açılan bir klavye yazılan sayıyı ve toplamı görüş alanından
  çıkarırdı; bu oturumda o arızayı bir kez düzeltmiştik.

  **Gövde çekmeceden ayrıldı** (`OperationsKeypadPanel`): tuş takımı bir `BottomSheet`ti ve adet
  çekmecesinin içine olduğu gibi konsaydı ÇEKMECE İÇİNDE ÇEKMECE açardı — `bottom-sheet`
  künyesindeki Fabric söküm arızasının (21.121) tetikleyicisi. Para tuş takımı artık aynı gövdeyi
  kendi kabında çiziyor; iki kopya yok.

  **Yazılan sayı TOPLAMDIR ve döküm sıfırlanır:** "2 koli + 3 tek" iken 30 yazan depocu 54 değil
  30 demek istiyor.

  **IZGARA ARIZASI, cihazda ölçüldü:** tuşlar `flexBasis: '30%'` ile diziliyordu ve adet
  çekmecesinin içinde on bir tuşun HEPSİ tek satıra ince şeritler hâlinde çöktü. Aynı arıza komşu
  ızgarada zaten ölçülmüştü (koli boyu seçici, 30.08) — yüzde bu kaplarda çözülmüyor. Kap artık
  `onLayout` ile ölçülüyor; testi de var.

  **BEKLEYEN(21.229):** kullanıcı 02.09'da daha büyüğünü söyledi — *"adet arttırma azaltma için
  klasik bir desenimiz olması lazım; bir input var, sonra başında artı eksi var ama yerleri
  değişiyor, bu hoş değil."* Ölçüldü: kitte **beş ayrı adet kontrolü** var (`QtyField` metin alanı
  · `StepperGroup` bağlı sayaç · `StepperButton` tek düğme · `QtyStepperField` · `QtySlider`) ve
  aynı soru ekrandan ekrana başka bir kalıpla soruluyor. Tekilleştirme kendi görevini istiyor.

  **Doğrulama.** Tip · lint temiz · tam paket **4133/4133**; tuş takımı gövdesinin dört testi
  (ölçülen genişlik · ölçümsüz ilk kare · ondalıksızda virgül yok · değer ancak onayda çıkar).
  Cihazda çekmece açıldı ve arıza görüldü/düzeltildi; **düzeltmenin cihaz turu Oppo bağlantısı
  düştüğü için yapılamadı** — ölçüm testte çivili.
