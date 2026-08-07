# Mobil mimari ve ajan sınırları (06.08.2026)

> **Statü: KARAR** (kullanıcı + mobil şeridi, 06.08). `/api/v1`'in yeri ve iki alt ajanın
> sınırları. Duplikasyon tüzüğü (§3) bu şeridin BAĞLAYICI kuralıdır.

## 1. Karar: `/api/v1` ayrı serviste — `apps/mobile-api` (Hono)

Mobil uygulamanın tüm endpoint'leri yeni, bağımsız bir Hono servisinde yaşar. Aynı VPS'te ayrı
süreç (deploy hattı WORKFLOW §3'e "süreç reload" adımıyla katılır), Caddy arkasında kendi rotası.

**Neden ayrı servis (alternatiflere karşı):**
- `apps/backend` backend şeridinin alanı — kullanıcı sınırı: mobil-backend ajanı oraya girmez.
  Tek küçük Hono uygulamasını iki ajan arasında bölmek (ortak index/env/deploy) sürekli çakışma
  üretir; ağır bir cron işi aynı süreçteki API gecikmesine de yansırdı.
- `apps/web` route handler'ları bugün en az duplikasyonlu görünür (lib/ doğrudan import) ama üç
  ajanı aynı uygulamada toplar; operasyon uçları müşteri web uygulamasının içinde yaşar; mobil
  API'nin yaşam döngüsü Next deploy'una bağlanır.
- Ayrı servis + paylaşılan paketler + §3 terfi tüzüğü, duplikasyonu *mekanizmayla* engeller —
  umutla değil.

## 2. Ajan sınırları (üç kişilik mobil şeridi)

| Ajan | Alanı | Dokunamayacağı |
| --- | --- | --- |
| **Mobil şerit yöneticisi** (bu oturumlar) | denetim, sözleşme sahipliği, docs/uygulama + docs/build/21, şeritler-arası talep | öteki şeritlerin alanına doğrudan yazım (talep açar) |
| **Expo ajanı** | `apps/mobile` (RN uygulaması) | apps/web, apps/backend, apps/mobile-api, packages/* (okur, yazamaz) |
| **Mobil-backend ajanı** | `apps/mobile-api` | apps/web, apps/backend, apps/mobile, packages/* (okur, yazamaz) |

- Alt ajanların packages/* değişiklik ihtiyacı → yöneticiye raporlanır; yönetici ya kendisi
  yapar (mobil şeridin sahiplendiği yeni paketlerde: `design-tokens` gibi) ya ilgili şeride
  `docs/talep/` dosyası açar (`touches` disipliniyle).
- İki alt ajan paralel çalışabilir: alanları ayrık; kesişen tek dosya türü kök konfig
  (vitest.config vb.) — o değişiklikler görev satırında `touches:` ile beyan edilir.
- Doküman güncellemelerini (görev satırı, Durum notu) YALNIZ yönetici yazar — iki ajanın aynı
  build dosyasını eş anlı düzenlemesi engellenir.

## 3. Duplikasyon tüzüğü (bağlayıcı)

CLAUDE.md "hiçbir türde duplication yok" değişmezinin mobildeki uygulaması. Beş kural:

1. **Terfi, kopya değil.** `apps/web`'de var olan bir orkestrasyon/akış mobil için de
   gerekiyorsa KOPYALANMAZ: paylaşılan katmana terfi eder (hedef: `packages/application` —
   ilk ihtiyaçta kurulur; saf karar kısmı zaten `domain-core`'a, I/O kısmı `database`'e aittir)
   ve web de aynı yerden çağırır hâle gelir. Terfi web şeridinin alanına dokunduğu için talep
   dosyası + `touches` ile koordine edilir. Mobil-backend ajanı bir web akışını yeniden yazdığı
   an bu tüzük ihlal edilmiştir.
2. **Sözleşme tek kaynak.** `/api/v1` istek/yanıt şemaları `packages/types`'tan türetilir
   (`z.infer` + `.pick/.omit/.extend`); mobile-api'de elle DTO yazılmaz; Expo tarafı cevapları
   AYNI şemayla parse eder (runtime doğrulama bedava gelir).
3. **Karar motoru tek.** İş kuralı yalnız `domain-core`'da yazılır; mobile-api route'u kural
   hesaplamaz, motora sorar (CLAUDE §1 zaten böyle der — burada tekrarı: route "küçük bir
   istisna" hesaplamaya en yatkın yerdir).
4. **Biçimleme ve sabit tek.** Para/tarih/slug `@lezzet/helper`; dil/rota `@lezzet/i18n`;
   iletişim künyesi `@lezzet/brand`; renk token'ı `design-tokens` paketi (21.3'te kurulunca).
   RN tarafında bunların hiçbiri yeniden yazılmaz.
5. **Denetim her PR'da.** Yönetici her iş biriminde duplikasyon taraması yapar: `knip` +
   `boundaries` + elle "bu mantık depoda var mı, türetebilir miyim?" sorusu. Şüphede: yazma,
   sor.

**Duplikasyon SAYILMAYANLAR** (bilinçli ayrım): taşıma katmanı adaptörleri (web'in çerez
guard'ı vs API'nin Bearer guard'ı — kural aynı `identity` motorundan gelir, sarmalayıcı farklı),
platform başına UI implementasyonu (aynı tasarım dili, farklı render), ekran başına kolokasyon
metinleri (içerik, kod değil — ama sipariş durumu gibi alan-sözlüğü etiketleri paylaşılan
kaynağa terfi adayıdır).

## 3b. Çalışma kuralları (kullanıcı kararı 06.08 — bağlayıcı)

1. **Onaysız hiçbir kod repoya gitmez.** Commit/push YALNIZ kullanıcı onayıyla (CLAUDE §0'ın
   tekrarı değil, süreci: onay her commit için ayrı ayrı alınır).
2. **Commit'i YÖNETİCİ hazırlar:** alt ajanlar asla commit yapmaz. Yönetici her iş biriminde
   (a) diff'i dosya dosya inceler, (b) kural-uygunluk + duplikasyon denetimini koşar
   (typecheck · lint · testler · knip · boundaries · docs:check), (c) commit kapsamını ve
   mesajını hazırlayıp kullanıcıya sunar — onay gelince gönderir. Çalışma ağacında başka
   şeritlerin dosyaları varsa commit kapsamına ALINMAZ.
3. **Çapraz iş YOK:** Expo ajanı yalnız `apps/mobile`, mobil-backend ajanı yalnız
   `apps/mobile-api`. İki alanı birden ilgilendiren iş (API sözleşmesi değişikliği gibi)
   ajanlara bölünmeden önce yönetici tarafından iki ayrı, alanına-sınırlı göreve çevrilir;
   sözleşmenin kendisi yöneticinin sahipliğindedir.
4. **Alt ajanlar Opus 5 modeliyle koşturulur** (kullanıcı kararı 07.08) — Expo ve
   mobil-backend görev atamaları `opus` model seçimiyle başlatılır; süren ajanın modeli
   değiştirilemediğinden kural yeni görev atamalarında uygulanır.
4b. **YALNIZ İKİ AJAN ve ajanlar ajan açamaz (kullanıcı kararı 07.08):** mobil şeridin alt
   ajanları yalnız `expo-ajani` ve `mobil-backend-ajani`dir (`.claude/agents/*.md` — araç
   setlerinde Agent/Workflow YOK, yani alt ajan açmaları teknik olarak imkânsız; model
   tanımda `opus`). Yönetici başka ajan OLUŞTURMAZ; iki ajana sığmayan iş (analiz, doküman,
   denetim) yöneticinin kendisinindir.
5. **Desen uygunluğu denetlenir:** iki ajan da projenin mevcut KOD desenine (STACK — servis
   deseni, zarf sözleşmesi, logger, adlandırma) ve TASARIM desenine (müşteri tarafında mevcut
   müşteri tasarım dili; token zorunluluğu, ham hex yasağı) uymak zorundadır; yönetici her
   teslimatta bunu doğrular, sapma düzelttirilir ya da gerekçesiyle kullanıcıya taşınır.

## 4. Auth yönü (özet — detay 21.4'te)

Cihazda supabase-js oturumu (anon key + SecureStore); `/api/v1` Bearer token'ı Supabase'te
doğrular. OTP akışı web'le AYNI sunucu servislerini kullanır (`email-verification` +
`notify`/Resend — ikisi de paylaşılan pakette; sıfır duplikasyon). `SUPABASE_SECRET_KEY`
yalnız sunucuda (mobile-api dahil), asla mobil bundle'da. Müşteri okumaları API üzerinden
(iş kuralı sunucuda kalır); RLS ikinci savunma hattı.

**Tek kapı + rol-bazlı yüzey (kullanıcı kararı 07.08):** uygulamada giriş TEK yerden — web'in
tek-`/connexion` modelinin aynısı. Girişte kullanıcının operasyon hakkı varsa (`/me` `roles`
alanı — sözleşmede zaten var) OPERASYON arayüzü açılır; yoksa müşteri arayüzü. **Oturumsuz
kullanım = müşteri gezinmesi** (katalog vb. girişsiz gezilir; giriş gereken akışta kapı
çıkar). Kabuk seçimi kökte tek karardır; iki yüzey iki ayrı navigasyon ağacıdır.

## 5. İlk iş birimleri

- **21.1** `apps/mobile-api` iskeleti — apps/backend desenleri ayna (env, logger, `{data,error}`
  zarfı), `/health` + Bearer auth middleware + `GET /api/v1/me`; vitest entegrasyon kökü olur.
- **21.2** `apps/mobile` Expo iskeleti — SDK 57 + dev-client + expo-router + Unistyles 3 +
  jest-expo/RNTL hattı çalışır durumda; ekran YOK (tasarım hattı ayrı iş).
- **21.3** `design-tokens` paketi — tek kaynak token modülü + web `@theme` türetimi (web
  şeridiyle koordineli).

Görev takibi: `docs/build/21-mobil-uygulama.md`.
