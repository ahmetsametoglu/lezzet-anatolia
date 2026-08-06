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
- [ ] (21.3) **`design-tokens` paketi (yeni kurulacak):** tek kaynak TS token modülü; web `@theme` CSS'i
  bu modülden türetilir (web şeridiyle koordineli — talep), RN Unistyles teması doğrudan
  import eder. `touches: packages/design-tokens, apps/web/app/globals.css`
- [ ] (21.4) **Auth akışı:** OTP uçları (`/api/v1/auth/*`) — web'le aynı sunucu servisleri
  (`email-verification`, `notify`); cihazda supabase-js oturumu + SecureStore; oturum
  yenileme. `touches: apps/mobile-api, apps/mobile`

Sonraki kalemler (sıra ve kapsam kullanıcıyla): **önce MÜŞTERİ tarafı** (kullanıcı kararı
06.08 — uygulamanın müşteri yüzü mevcut müşteri tasarım deseninin ÇOK BENZERİ kurgulanır:
katalog/sepet/sipariş uçları + ekranları); operasyon ekran seti SONRA ve komple yeniden
kurguyla; push bildirim (notify'a driver — 14 ile koordineli), Maestro E2E hattı,
mağaza/dağıtım süreci.
