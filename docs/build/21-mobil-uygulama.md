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
`ui:shot:mobile` aracı ilk ekran dilimiyle birlikte kurulur (simülatör + dev build ister).
