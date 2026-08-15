# Yığın — Bu Projeye Uyarlanmış Mimari Reçete

Bu dosya, genel bir blueprint'ten alınıp **bu projeye uyarlanmış** mimari reçetedir. Blueprint omurgayı verir; burada o omurga korunur ve bu projeye özgü kararlar **içine işlenmiştir**. Artık projenin kendi dosyasıdır.

Kod dizilimi burada; çalışma disiplini (migration, deploy, git, doğrulama) `WORKFLOW.md`'de — o dosya teknolojiden bağımsızdır.

Sapmaların gerekçeleri: `ARCHITECTURE_DECISIONS.md`. Domain kuralları: `DOMAIN.md`.

---

## 1. Bu yığın neyi çözer

Tek markalı, tek veritabanlı, orta ölçekli bir web ürünü: müşteriye açık bir yüz + yönetim paneli + arka planda çalışan işler. Ekip küçük (1–2 kişi + AI).

**Bu projeye özgü — genel blueprint'in aksine burada VAR olanlar:**

- **Çok dillilik (TR/FR/DE).** Genel blueprint bunu reddeder; burada kuruluş gereksinimidir. Bkz. `ARCHITECTURE_DECISIONS.md` Sapma 1, `SEO_I18N.md`.
- **İki ülke (FR/DE), GDPR.**
- **Domain motoru zorunlu** (sipariş durum makinesi, stok, fiyat, kanal) — §8.

**Yine de çözmediği:** çok kiracılı SaaS, mikroservis dağıtımı. Tek sunucu, tek süreç grubu.

---

## 2. Yığın (sabit reçete)

| Katman | Seçim | Neden bu |
| --- | --- | --- |
| Paket yöneticisi | **pnpm** workspaces | Monorepo'da symlink; `workspace:*` |
| Görev koşucusu | **Turborepo** | `dependsOn: ["^build"]` paket sırasını çözer |
| Web | **Next.js** App Router (RSC) | Sunucu bileşeni + Server Action; ayrı API gereksiz |
| Dil | **TypeScript strict** | `any` yasak, `noUncheckedIndexedAccess` açık |
| Doğrulama | **Zod** | Tip ve çalışma-anı doğrulama tek kaynaktan |
| Veritabanı | **Supabase** (Postgres + Auth + Storage + Realtime) | ORM yok — `@supabase/supabase-js` doğrudan |
| **Stil** | **Tailwind** | Tasarım Claude Design ile üretiliyor, çıktısı Tailwind. Bkz. Sapma 2. |
| **i18n (arayüz)** | kod içi i18n + **`next-intl`** (yalnız yönlendirme) | Statik metinler; içerik jsonb (§5). Sınır aşağıda. |
| Arka plan işleri | **Hono** + `node-cron` | Webhook ve zamanlı işler için hafif süreç |
| Süreç yönetimi | **PM2** + reverse proxy (Caddy) | Basit sunucu, sıfır-kesinti reload |
| Ödeme | **Stripe** (PaymentElement + webhook + refund) | Karar VERİLDİ, üretimde (07.5). `INTEGRATIONS.md`'deki "aday" ifadesi eskidir. |
| Sürükle-bırak | **`@dnd-kit`** | Tek kullanım: `components/operation/ui/sortable-list.tsx` (operatör sırası) |
| Log / hata / sağlık | **`packages/observability`** | pino + `error_log` + sağlık görüntüsü → `OBSERVABILITY.md` |
| **Form** | **`react-hook-form`** + **`@hookform/resolvers`** (Zod resolver) | Doğrulama şeması zaten Zod (§5); resolver aynı şemayı forma bağlar — ikinci bir kural kaynağı doğmaz |
| **E-posta** | **`resend`** (gönderim) + **`@react-email/components`** (şablon) | Supabase mail yapısı KULLANILMAZ; Auth OTP dahil tüm mail `packages/email`'den (§10, `14-bildirim-email`) |
| **Dosya deposu** | **`@aws-sdk/client-s3`** + **`@aws-sdk/s3-request-presigner`** | Cloudflare R2, S3-uyumlu API. Presigner özel kova için süreli okuma/yükleme adresi üretir (§10 "iki kova") |
| **Harita** | **`leaflet`** | Rota kurulumu haritadan (19.20) — tasarımın kullandığı kütüphane (`Depolar - Bolge Haritasi.html`). Raster karo (`tile.openstreetmap.org`), CSP'de yalnız `img-src`. **MapLibre bir tur denendi ve geri alındı (07.08):** vektör karoyu Web Worker + WebGL zinciriyle çözüyor, zincir kopunca ekranda boş tuval kalıyordu ve tasarımın hiç ihtiyaç duymadığı bir yüzeydi. **Noktalar bizim**: 16.878 posta kodu `postal_code_place`ten; dışarı giden yalnız karo koordinatı. Yalnız `components/operation/ui/zone-map.tsx` |
| **Adres arama (FR)** | **`@lezzet/address-fr`** — kendi paketimiz, dış bağımlılığı YOK (yalnız `zod`) | Fransız devletinin adres servisi **BAN** (Base Adresse Nationale). **Kapı DEĞİŞTİ (ölçüldü 09.08):** yıllardır bilinen `api-adresse.data.gouv.fr` kullanımdan kaldırıldı — resmî kapanış Ocak 2026 sonu, bugün o tarih GEÇTİ ve kapı hâlâ cevap veriyor, yani ödünç zamanda; üstüne kod yazılmaz. Kullanılan: IGN Géoplateforme `https://data.geopf.fr/geocodage` (`/search` · `/reverse`). **API anahtarı yok**, sınır **IP başına 50 istek/sn** (aşımda 429 + `retry-after`, 5 sn kapalı) — sunucudan çağrılırsa tüm müşteriler tek IP'yi paylaşır, cihazdan çağrılırsa herkes kendininkini; kararı çağıran verir. Paket **node-only hiçbir şey içermez** (logger dahil) çünkü React Native içinde de koşuyor: her başarısızlık ADLI döner (`too_short`/`rate_limited`/`unavailable`/`invalid_response`), fırlatmaz. Gecikmeli çağrı ve önbellek bilerek DIŞARIDA — yüzeyin kararı. Veri **Etalab 2.0**; künye gösteren yüzeyin sorumluluğu |
| **Lint** | **ESLint flat config** + **`typescript-eslint`** | Kuralı zorlayan yer: `console` yasağı, ölü kod, `any` (`packages/eslint-config`) |
| **Yapay zekâ** | **`ai`** (Vercel AI SDK) + **`@ai-sdk/anthropic`** · **`@ai-sdk/google`** | Sağlayıcı-agnostik katman ELLE yazılmaz — kütüphane yapar; seçim env'den (`AI_PROVIDER`). Çıktı `generateObject` + Zod ile yapısal. Yalnız `packages/ai` (§4 `ai-scope`) → `docs/build/20-yapay-zeka.md` |
| **MCP sunucusu** | **`@modelcontextprotocol/sdk`** | Yönetici asistanının kapısı (22.1): istek-başına stateless `Server` + streamable HTTP, low-level API (araç şemaları düz JSON Schema — üretim turunda oturum-anahtarı enjeksiyonuna izin verir). Yalnız `apps/backend/src/mcp` → `AI_ADMIN_ASSISTANT.md` |
| **Native uygulama** | **Expo SDK** + **`expo-router`** + **`expo-dev-client`** | Native uygulama `apps/mobile` (21.2). CNG: native klasörler üretilir, git'e girmez; **Expo Go test hattında YASAK** — dev-client (`docs/uygulama/01 §10`). Çekirdek Expo modülleri: `expo-constants` · `expo-linking` · `expo-splash-screen` · `expo-status-bar` · `expo-system-ui` · `expo-secure-store` (oturum token'ları Keychain/Keystore'da — 21.4) · `expo-localization` (cihaz dili → `@lezzet/i18n` `LOCALES` eşlemesi; yedek `DEFAULT_LOCALE` — 21.7) · `expo-blur` (cream-glass zeminler, Token Kararı 17; Android bulanıklığı `BEKLEYEN(21.7)`) · `expo-font` (Lora/Karla statik yükleme, Token Kararı 24) |
| **Mobil stil** | **`react-native-unistyles`** (+ `react-native-nitro-modules`) · **`expo-linear-gradient`** | Komponent kütüphanesi YOK; tema düz TS nesnesi → token tek-kaynağına bağlanır (21.3); resmî Jest mock'ları test hattını cihazsız tutar (`docs/uygulama/01 §11`). Gradyan token'ları (`--gradient-*`) tek çeviriciden `expo-linear-gradient`e akar (21.5). İkonlar `react-native-svg` + v3 yol sözlüğü (`icon-paths.ts`; hazır set yok — 21.7); font dosyaları `@expo-google-fonts/lora` · `@expo-google-fonts/karla` (sürümlü statik ağırlıklar: Lora 400/600, Karla 400/600/700 — Token Kararı 24) |
| **Mobil platform** | `react-native` 0.86 (New Architecture) · `react-native-screens` · `react-native-safe-area-context` · `react-native-edge-to-edge` · `@babel/runtime` | RN 0.85+ yalnız New Arch — her native bağımlılıkta eleme ölçütü. screens/safe-area expo-router zorunluluğu; edge-to-edge SDK 57 Android varsayılanı; `@babel/runtime` babel-preset-expo'nun opsiyonel peer'ı (unistyles Babel eklentisinin etkinleşme şartı) |
| **Mobil hareket & animasyon** | **`react-native-reanimated`** (+ `react-native-worklets`) · **`react-native-gesture-handler`** | Kullanıcı izniyle 09.08'de girdi; gerekçe TEK ve ölçülü: yüzen sayfanın (bottom sheet) tasarımı iki AYRI eğri istiyor — örtü solar (`fadeIn .25s`), panel aşağıdan kayar (`shUp .32s`) — ve RN'in `Modal`ı tek animasyon türü aldığı için ikisi birden temsil edilemiyordu (`bottom-sheet.tsx` künyesi; eski `BEKLEYEN(21.7)`). Sürükleyerek kapatma da aynı ihtiyacın parçası: parmağı takip eden panel, JS iş parçacığında akıcı olmaz. `react-native-worklets` reanimated 4'ün çalışma-anı çekirdeği ve **doğrudan** bağımlılık olmak zorunda: pnpm'in katı `node_modules`'unda `babel-preset-expo` `react-native-worklets/plugin`i ancak öyle çözebiliyor (ölçüldü — çözülemediğinde eklenti sessizce devreye girmiyor). Kök `GestureHandlerRootView` tek kopya, `app/_layout.tsx`te |

> **`next-intl` SINIRI (denetim B1, 02.08):** yalnız **routing/locale yönlendirmesi** için kullanılır
> (`middleware.ts`, `i18n/routing.ts`, `i18n/request.ts`). **Mesaj API'si (`useTranslations`,
> `getTranslations`) KULLANILMAZ** — arayüz metinleri sayfanın yanındaki `messages.json`'dan gelir
> ve tipi `LocalizedCopy`'den türer (`CLAUDE.md §2`). Bugün `useTranslations` kullanımı **sıfır** ve
> öyle kalmalı: bu satır yokken bir ajan onu yazdığı gün ikinci bir i18n mekanizması doğar, iki
> metin kaynağı yan yana yaşar ve hangisinin geçerli olduğunu kimse bilmez.

ORM bilinçli yok: doğrulama Zod'da, sorgu katmanı §6 taban sınıfta. Üçüncü şema kaynağı senkron derdi getirir.

**Genel blueprint'ten fark:** Stil satırı CSS Modules değil **Tailwind**. Yığına i18n satırı eklendi.

---

## 3. İskelet

```
proje/
├── apps/
│   ├── web/          # Next.js — müşteri + admin + Server Action + gerektiğinde /api
│   ├── backend/      # Hono + cron — dış webhook'lar (ödeme, WhatsApp inbound), zamanlı işler
│   └── worker/       # (opsiyonel) uzun/yerel işler
├── packages/
│   ├── types/            # Zod şemaları + domain tipler  ← TEK KAYNAK
│   ├── database/         # BaseDbService + entity servisleri
│   ├── domain-core/      # UI'sız domain motoru: sipariş durum makinesi, stok, fiyat, kanal (§8)
│   ├── helper/           # tarih/para/format — bağımlılıksız saf fonksiyonlar
│   ├── brand/            # marka sabitleri (ad, logo yolu, yasal metinler, renkler)
│   ├── i18n/             # arayüz metinleri (tr/fr/de) + yerelleştirme yardımcıları
│   ├── storage/          # dosya deposu istemcisi
│   ├── email/            # mail istemcisi + default şablonlar (Auth OTP dahil TÜM mail buradan; Supabase mail yapısı kullanılmaz)
│   ├── notify/           # soyut OUTBOUND bildirim katmanı (e-posta / wa.me / ileride WhatsApp API / push)
│   ├── ai/               # sağlayıcı-agnostik AI: çeviri, WhatsApp sohbet, banka import şablonu, fatura→stok formu — çok amaçlı ajan
│   ├── eslint-config/
│   └── typescript-config/
├── supabase/migrations/  # numaralı SQL, additive-only (WORKFLOW.md §2)
├── scripts/              # deploy.sh, seed.ts
└── docs/                 # bu klasör (ürün, domain, veri modeli, kararlar...)
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`turbo.json` kritik satır `dependsOn: ["^build"]` — paketler uygulamalardan önce derlenir.

Paketler kaynak dışa verir (`"exports": { ".": "./src/index.ts" }`), ara derleme yok. Node tarafı derleme gereken paket olursa `tsup` + `noExternal` dikkatiyle.

**Genel blueprint'ten fark:** `domain-core` (opsiyonel değil, zorunlu), `i18n`, `notify` paketleri eklendi. `brand` renkleri de tutar (Tailwind token kaynağıyla hizalı).

---

## 4. Değişmez kural: bağımlılık tek yönlü

```
types  →  database  →  apps
  ↓          ↓
helper    brand / i18n / storage / email / notify / domain-core
```

- `types` yalnız `zod`'a bağlı; hiçbir iç pakete değil.
- `database` yalnız `types` + `helper` bilir.
- `domain-core` `types` + `helper` bilir; uygulamayı bilmez.
- Uygulamalar paketleri bilir; paketler uygulamaları **asla** bilmez.
- `domain-core` ↮ `database`: **birbirini bilmezler.** Motor saf kalsın (birim testi DB'siz koşsun), servis I/O'da kalsın diye; ikisini birleştiren yer uygulama katmanıdır (Server Action / RSC). Bkz. §13.
- Döngü yasak; ortak parça `types` veya `helper`'a iner.

---

## 5. Katman 1 — `types`: şema tek kaynaktır

Her entity için üç şema, tek dosyada. Kurallar genel blueprint ile aynı (camelCase, `z.infer`, alan yorumu tek dokümantasyon, min/max hem Zod hem DB `check`).

**Eksen düzeni (kullanıcı kararı 08.08, görev 01.12):** paket üç klasördür ve modeller birbirine
girmez — `src/primitives/` (tabloya ait olmayan yapı taşları: `db-numeric`, `enums`,
`localized-text`, `pagination`…), `src/entities/` (DB satır aynaları), `src/contracts/` (yüzey
sözleşmeleri: `auth`, `catalog-api`, `me-api`, `notification` — üreten ile tüketenin ortak dili,
tablo değil). Bağımlılık yönü `primitives ← entities ← contracts` (aynı katman içi serbest,
yukarı bakmak yasak) ve `layering.test.ts` bunu import satırlarından makineyle zorlar. Dış
görünüm tek barrel'dır (`@lezzet/types`); tüketici klasör adını bilmez, derin import yazmaz.
Yeni şemanın yeri içeriğinden okunur: satır aynası mı → `entities`, yüzeyler arası zarf mı →
`contracts`, gömülü şekil mi → `primitives`.

**Bu projeye özgü — çok dilli alan tipi:**

```ts
import { z } from 'zod';

export const LocalizedText = z.object({
  fr: z.string().optional(),
  de: z.string().optional(),
  tr: z.string().optional(),
}).refine(v => !!(v.fr || v.de || v.tr), { message: 'En az bir dil zorunlu' });

export type LocalizedText = z.infer<typeof LocalizedText>;
```

- Çevrilecek her metin alanı (`name`, `description`, kategori adı...) `LocalizedText`, DB'de `jsonb`.
- En az bir dil dolu; üçü zorunlu değil.
- Gösterim yedek zinciri **TR → FR → DE** (bkz. `SEO_I18N.md`); çözücü `i18n` veya `helper` paketinde saf fonksiyon.
- Statik arayüz metinleri buraya girmez — `packages/i18n`'de.

---

## 6. Katman 2 — `database`: tek taban sınıf

`BaseDbService` genel blueprint ile **birebir aynı**: Zod doğrulama, camelCase↔snake_case, ortak filtre/sıralama/sayfalama, hata normalizasyonu. `allowDelete=false` varsayılan. `GetAllOptions`, `dbToApp`/`appToDb`, RPC yardımcıları (`toRpcParams`, `nullify`) aynen.

Ölçüt aynı: yeni entity = 1 şema + ~20 satır servis + 1 migration.

**Ham `this.supabase` ne zaman serbest (denetim TS2, 03.08):** `CLAUDE.md §1`'in *"servis ham
`this.supabase` yazmaz"* cümlesi mutlak okunabiliyor; kuralın tam hâli şudur — **taban yüzeyi o
okumayı karşılamıyorsa ham serbesttir, ama gerekçesi künyeye YAZILIR.** Meşru sınıflar bugün
ölçüldü ve dördü var: *(a)* görünüm okuması (`account_balance`), *(b)* çapraz-tablo türetimi
(`debt()`, `orderVsReceived()` — taban tek tablo etrafında kuruludur), *(c)* tabanın `eq` temelli
süzgecinin taşımadığı operatör (`lt`, `distinct`, `contains`/`overlaps`), *(d)* entity DEĞİL bir
sözlük/fark satırı döndüren okuma.

İki şey bu serbestliğin dışındadır ve istisnası yoktur: **kendi tablosuna tabanı atlayarak YAZMAK**
(doğrulama ve para eşlemesi atlanır) ve **entity döndüren ham okumanın `parseRows`'u atlaması** —
ikincisinin bedeli yaşandı (`findByProviderRef`, 02.9: satır euro taşırken şema cent istedi, hata
webhook'ta yutuldu ve panelden yapılan iade deftere hiç düşmedi).

Tabanı genişletmek varsayılan değil: bir operatörün **ikinci** tüketicisi çıkınca taşınır. Tek
tüketici için taban yüzeyi büyütmek, herkesin taşıdığı bir soyutlamayı tek çağıran için şişirir.

**Süzme nerede yapılır (karar 27.07):** ölçüt **listenin doğal tavanı** ve arayüzün tamamına ihtiyacı olup olmadığıdır.
- **Sunucuda süz + sayfala:** üretimde ~200 satırı geçebilen her liste — ürün, sipariş, müşteri, parti, fatura, para hareketi. Süzgeçler **URL'de** taşınır (paylaşılabilir + yenilemeye dayanıklı + RSC okuyabilir), servise parametre olarak iner ve okuma **keyset (cursor)** paginasyonludur (CLAUDE.md: tüm listeler infinite scroll). Sayaç/özet de sunucuda hesaplanır — client tam listeye sahip olmadığı için türetemez.
- **Client'ta süz (tamamını çek):** onlarla sınırlı, tavanı belli ve arayüzün **zaten tamamını** istediği kümeler — kategori, koleksiyon, enum listeleri (alerjen/KDV). Bunlar açılır menü ve filtre çipini beslediği için parça parça çekmek anlamsızdır.
- **Ölçüt sızması:** "şimdilik az kayıt var" gerekçesiyle büyüyecek bir listeyi client'ta süzmek, sonradan **ikinci bir iş** doğurur (ekran + servis + URL birlikte değişir). Yeni bir liste ekranı yazılırken bu karar **baştan** verilir.

**Serbest metin ARAMASI nereden okunur (karar 02.08 — ölçüldü):** ölçüt, aranan metnin **kimin
malı** olduğudur.

- **Metin satırın KENDİ malıysa → üretilmiş sütun** (`generated always as (…) stored`) + `pg_trgm`
  GIN indeksi. Türetilmiş olduğu için bayatlaması **imkânsız**, indeksli olduğu için `%kelime%`
  bile hızlı. Karşılığı: müşteri araması (`user_profiles`: ad + e-posta + telefon + firma).
- **Metin BAŞKA tablonun malıysa → görünüm** (`stock_adjustment_detail` gibi), sütuna kopyalanmaz.
  Kopyalamak onu bir **önbelleğe** çevirir ve önbelleğin geçersizleme sorunu vardır: ürün adı
  değiştiğinde o üründen doğmuş bütün satırların metnini tetikleyiciyle yeniden yazmak gerekir —
  tek satırlık bir düzeltme binlerce satır günceller, ve tetikleyicinin atladığı ilk yol sonucu
  **sessizce** eskitir ("adı değiştirdim, arama hâlâ eskisini buluyor"). Şikâyet edilemeyen hata.

**Ölçüm (yerel, 54.808 fire kaydı):** görünümün **arama YOKKEN** maliyeti sıfıra yakın — `0,29 ms`
(tarih indeksinden 30 satır, birleştirmeler PK ile). Yani sık çalışan yol hiç etkilenmiyor. Arama
yazıldığında `~100 ms`; saklanan sütun + GIN ile aynı arama `0,21 ms` ama tablo **39 MB → 55 MB**
(+ 6 MB indeks). Yani hız 500 kat, bedeli %56 depolama **ve** yukarıdaki doğruluk riski.

**Karar: görünüm kalır.** Sık yol zaten bedava, pahalı yol operatörün ara sıra yazdığı bir arama.
Saklanan sütuna geçiş **ölçüye bağlı**: bir arama `~300 ms`'i geçtiğinde (kabaca 150 bin satır)
yeniden bakılır — o gün gelmeden yapılan iyileştirme, bugün var olmayan bir sorunun bedelini
doğruluk riskiyle ödemektir.

**Bu projeye özgü not — jsonb ve eşzamanlılık:**
- **jsonb değeri ÇEVRİLMEZ** — dönüşüm satır düzeyinde kalır: kolon adları çevrilir, değerlerin içine inilmez. Ölçüt tek cümlede: **kolon adı şemanın sözlüğüdür, jsonb anahtarı uygulamanın yazdığı veridir.** Adı çevirmek adlandırma köprüsüdür, veriyi çevirmek başka bir iştir.
  - **Bu satır 15.08'e kadar bir NİYETTİ, koda hiç geçmemişti** (*"sağlanır"* diyordu, sağlanmış gibi anlatıyordu). Fark edilmemesinin sebebi kayıtlı: kural `LocalizedText` için yazılmıştı ve `tr`/`fr`/`de` anahtarlarında ne alt tire ne büyük harf var — dönüştürücü onlara iki yönde de dokunmuyor. Yani koruma, yazıldığı durumda zaten gereksizdi; gerekli olduğu durumlar (serbest anahtarlı ve dış kaynaklı jsonb) sonradan geldi ve o arada repoda **iki biçim yan yana** oluştu (`assistant_proposal.payload` snake_case, `error_log.context` camelCase).
  - **Tek istisna gömülü ilişkidir** (`alias:tablo(...)`): o bir değer değil **başka bir tablonun satırıdır**, alan adları çevrilmeli. Servis onu `BaseDbService.embeds` ile beyan eder. Varsayılan bilinçli olarak TERS: inmemek esas, inmek beyan — çünkü unutulan bir jsonb beyanı veriyi **sessizce** bozar, unutulan bir gömme beyanı ise Zod'da **anında** patlar.
  - Değişikliğin iki sessiz kırılma noktası ölçülerek bulunmuştu ve düzeltildi: sağlık grafiğinin `metrics->system->>...` yolları ve `analytics_postal_code_orders`ın `address_snapshot->>'postal_code'` okuması. İkisi de hata vermez, `null` döndürürdü.
- Stok düşürme/ayırma **atomik** olmalı (bkz. `DOMAIN.md §4`): "oku-sonra-yaz" değil, koşullu update veya kilitli RPC. Bu mantık `domain-core` + bir DB fonksiyonu olarak yazılır, serviste değil.

---

## 7. Katman 3 — `apps/web`

Server Action sözleşmesi, yetki kapısı (`requireAdmin`/`requireAuth`), "ne zaman Action ne zaman /api route" tablosu — hepsi genel blueprint ile **aynı**. Webhook'lar (ödeme) `apps/backend`'e.

**Bu projeye özgü — roller:**
Genel blueprint'te `requireAdmin` var. Burada ek roller aynı desende: `requireWarehouse` (depo), `requireCourier` (kurye). Rol kontrolü tek yerden (`lib/guard.ts`) akar. İzin ilkesi `DOMAIN.md §2`.

**Bu projeye özgü — sayfa deseni + cihaz çatallanması:**

Genel blueprint deseni korunur, üstüne cihaz ayrımı client sınırında eklenir:

```
items/
├── page.tsx                 # Sunucu: veri çeker, yetki (blueprint aynen)
├── items-page-client.tsx    # 'use client': cihazı algılar, dallanır
│     ├── items.desktop.tsx  # masaüstü sunumu
│     └── items.mobile.tsx   # mobil web sunumu (cihaz forku — native uygulama değil, CLAUDE §2)
├── actions/actions.ts       # Server Action'lar
└── components/              # yalnız bu sayfaya ait
```

- Sunucu tek kalır; içerik server-rendered (SEO). Çatallanma SSR'de **değil**, client giriş noktasında. Gerekçe: `ARCHITECTURE_DECISIONS.md` Sapma 3.
- Ortak katman (veri, hook, action çağrıları, token) paylaşılır; yalnız sunum bileşeni dallanır.
- Cihaz ipucu sunucudan header ile client'a prop geçilebilir (ağaç yine tek).

**Operasyon ekranının kökü KENDİ zeminini çizer: `bg-ops-card` (03.08, kullanıcı bildirimi).**
Kabuğun zemini `--color-ops-bg`'dir (`#dedbd3` bej; koyu temada `#1b1e18`) ve `PageHeader` kendi
zeminini ÇİZMEZ — yalnız alt çizgisi vardır. Kök zemin taşımazsa başlık barı ve altındaki paneller
kabuğun bejini gösterir; ekran "kahverengiye çalıyor" diye görünür. Kural on ekranın sekizinde
FİİLEN uygulanıyordu ama yazılı değildi, o yüzden iki ekran (Talepler · Ayarlar) onsuz yazıldı.
Denetleniyor (`docs:check` §3g); ölçüt **`PageHeader` render eden `.desktop`/`.mobile` dosyası** —
cihaz forku komponentlerde de kullanılıyor ve dialog içindeki bir form zeminini `Dialog` panelinden
alır, ona `bg-ops-card` dayatmak yanlış olurdu.

**Yazı boyu HAM piksel yazılmaz — merdiven basamağı kullanılır (`docs:check` §3h).** Ölçek
`globals.css`'te dokuz basamaklı kapalı bir merdivendir (`--text-ops-hero … -micro`) ve kapalı
olması işin özü: kullanıcı iki kez *"okumakta zorlanıyorum"* dedi, iki düzeltme de TEK dosyada
yapıldı — 186 kullanım yeri dolaşılmadı. Ham `text-[15px]` yazan satır o değeri merdivenin dışına
çıkarır ve kayma **sessizce** oluşur: ölçek yükselince o satır yerinde kalır, aradaki mesafe kapanır,
ekran bir gün "ötekilerden küçük" diye geri gelir. Sistem ekranında tam bu oldu — 34 yerde ham px
vardı ve iki ölçek yükseltmesini de kaçırdılar. Kural yalnız **yazı boyu** içindir: `leading-[1.5]`,
`tracking-[0.08em]`, `px-[22px]` serbest ve bu bilinçli — merdivenin künyesi satır yüksekliğinin
token'a gömülmediğini söylüyor, yoğun tabloda `leading` yerel karardır.

Merdivenin **üst iki ucu metin değil GÖSTERGE içindir** (`hero` 36 · `display` 29): sistem panelinin
büyük değerleri, hüküm şeridinin başlığı, sipariş tutarı. Ham değeri en yakın metin basamağına
yamamak yanlış olurdu — 29px bir başlık değil, bir sayıdır.

**`<sayfa>-url.ts` sayfalar arası import EDİLEBİLİR — tek yazılı istisna (03.08, denetim D1).**
Sayfaya-özel dosya sayfada kalır; bu dosya tipi ayrı tutulur çünkü işlevi farklı: `*-url.ts` bir
sunum parçası değil, sayfanın **adres sözleşmesidir** — hangi parametre adı hangi anlama gelir,
varsayılan nedir, hangi hâl adrese yazılır. Ekranlar birbirine köprü kuruyor (Depolar'ın karnesi
→ Stok o depo bağlamıyla; sipariş sayacı → Siparişler süzgeçli) ve bu köprüyü kuran taraf ya
sözleşmeyi çağırır ya `?depo=STR&scope=expiry` dizesini elle yazar. İkincisi parametre adını
ikinci kez yazmak, yani sözleşmeyi delmektir.

Sınırlar: **yalnız `*-url.ts`** (saf, bağımlılıksız, React'siz); dışarıya `<sayfa>Link(patch)`
biçiminde tek giriş verilir (`stockLink`, `ordersLink`) ve iç kurucu (`stockUrl`) ile
`DEFAULTS` sayfada kalır. Bağın sessizce kırılma riski yok — imza `Partial<StockUrlState>`
olduğu için süzgeç adı değişince çağıran **derleme zamanında** düşer. Başka hiçbir sayfa-yerel
dosya (komponent, `-read`, `-types`, action) kardeş sayfadan import EDİLMEZ; paylaşılan olan
yükselir (`lib/` ya da ortak üst klasör).

**Kural DENETLENİYOR** (`docs:check` §3e, 03.08). Yazılı ama denetlenmeyen bir istisna çürür ve
`typecheck` bunu tek başına koruyamaz: imza kaymasını yakalar (`ordersLink` bir alan kaybederse
çağıran derlenmez), **kapsam kaymasını yakalamaz** — kardeş sayfadan `-types` ya da `actions`
import eden bir satır derleyiciye tamamen geçerli görünür. Denetim iki yüzeyin sayfa köklerini
tarar; aile içi (`components/`, `tabs/`, `[id]/`) muaf. Kural yürürlüğe girdiğinde var olan dört ihlal
(müşteri yüzeyi, `login/actions` paylaşımı) **adıyla listelenmiş** bir devralma listesinde durur ve
o liste kendi kendini temizler: satır düzeldiğinde denetim "muafiyet bayat" diye hata verir —
böylece liste bir aklama aracına dönüşemez.

**Bu projeye özgü — canlı güncelleme: `postgres_changes` DEĞİL, broadcast** (`lib/realtime/`)

Ekranın kendini tazelemesi gereken yerler var (ödeme onayı webhook'la geliyor ve müşterinin
tarayıcısından bağımsız). Supabase Realtime'ın iki yolu var ve **birini seçmek bir güvenlik
kararıdır:**

- `postgres_changes` tarayıcıyı **tabloya abone eder.** Bu ancak RLS varsa güvenlidir — abonelik
  satır düzeyinde okuma demektir ve neyin sızacağını RLS belirler. Bizim modelimiz RLS'siz:
  yetki sunucu kapılarında (`lib/guard.ts`), servis anahtarı sunucuda. O hâlde tarayıcıyı tabloya
  bağlamak, kurduğumuz tek savunma hattını atlatmaktır.
- **Broadcast** yalnız bir ZİL çalar: kanala "şu sipariş değişti" diye kimliksiz bir tetik düşer,
  ekran veriyi kendi sunucu kapısından yeniden ister. Yetki yolu hiç değişmez.

Bu yüzden `lib/realtime/` yalnız kanal adı + zil üretir (`broadcast.ts`, `order-channel.ts`);
veriyi asla taşımaz. **Kural: tarayıcı hiçbir zaman tabloya abone edilmez.** RLS bir gün eklenirse
karar yeniden tartışılabilir; o güne kadar yeni bir canlı ekran da aynı deseni kullanır.

---

## 8. Domain motoru: `domain-core` (zorunlu)

Genel blueprint §8 domain motorunu "ölçüt karşılanırsa" öneri yapar. Bu projede ölçüt fazlasıyla karşılanır; paket **kesin** kurulur. İçindekiler:

- **Sipariş durum makinesi** — izin verilen geçişler, hızlı satış yolu (bkz. `ORDER_LIFECYCLE.md`)
- **Stok mantığı** — rezervasyon, kullanılabilir hesabı, eşzamanlılık kuralı
- **Fiyat** — sepette fiyat sabitleme, kanal/müşteri fiyat çözümü
- **Kanal belirleme** — müşteri tipi → b2b/b2c
- **Kâr hesabı** — kanal/ürün bazında

Hepsi UI'sız, saf fonksiyon + gerekiyorsa Zustand deposu + **birim test**. Her yüzey (müşteri web, admin, arka plan, WhatsApp/AI ajanı) aynı motoru çağırır — WhatsApp yeni bir beyin değil, domain-core'un bir yüzeyidir (bkz. `CHANNELS.md §1`, `ADR_WHATSAPP.md` ADR-004). Kanal belirlemenin yanında **sipariş kaynağı** (`order_source`) ve telefonla **kimlik çözümü** de burada saf fonksiyondur.

---

### Para: tamsayı cent + tek yuvarlama kuralı

- **Motor içinde para `number` (kayan nokta) değildir — tamsayı cent'tir.** `0.1 + 0.2` sapması indirim dağıtımında ve KDV'de kuruş kaçırır; DB'de `numeric`, sınırda (servis katmanında) cent'e çevrilir.
- **KDV tabanı kanala bağlıdır** (B2C dahil / B2B hariç, `DOMAIN §5`); motor iki yöne de çevirir ama sakladığı değer kanal tabanıdır.
- **Yuvarlama tek kuralla yapılır:** sepet indirimi kalemlere **oransal** dağıtılırken her kalem aşağı yuvarlanır, artan kuruş **en büyük kaleme** eklenir → `Σ line_discount_amount = discount_amount` her zaman tutar. Kalem KDV'si **indirimli birim fiyattan** hesaplanır.
- Bu üçü motorun sözleşmesidir; çağıran katman kendi yuvarlamasını yapmaz.
- **Dönüşüm `toCents`/`fromCents` iledir** (`packages/helper/money`) — elle `Math.round(x * 100)` YAZILMAZ. Ortak fonksiyon varsa kopyası yazılmaz (CLAUDE.md §1).
- **Adlandırma sözleşmenin parçası: `…Cents` ile bitmeyen bir para alanı yoktur.** Süs değil, tek gerçek savunma: `total: number` gören biri euro mu cent mi olduğunu bilemez ve satıra bakınca hata GÖRÜNMEZ; `totalCents` olunca görünür. Tip sistemi ikisini ayırt edemez — ikisi de `number`.

### Dönüşümün yeri: `BaseDbService.moneyFields` (02.9)

Servis para kolonunu **cent** döndürür; euro↔cent dönüşümü taban sınıfta, TEK yerde yapılır. Alt sınıf
yalnız beyan eder:

```ts
protected override readonly moneyFields = ['amountCents']; // kolon: price.amount (euro numeric)
```

Kolon adı `Cents` eki atılarak türetilir (`unitPriceCents` → `unit_price`). Taban sınıf ÜÇ yerde birden
çevirir: okunan satır, yazılan satır ve **süzgeç değeri**. Üçüncüsü en sinsisidir — `{ amountCents: 1690 }`
çevrilmezse sorgu 1690 € arar, hata patlamaz, yalnız liste boş görünür.

**Projeksiyonlu okumalar da kapsam içindedir** (`getPageAs`/`getAllAs`): eşleme yalnız **üst düzey**
alanlara dokunur ve projeksiyonun üst düzeyi her zaman servisin kendi tablosudur. Gömülü ilişkiler
(`alias:tablo(...)`) başka tablonundur; oradaki para okuma sınırında elle çevrilir — yine `toCents` ile,
elle `* 100` yazarak değil. Aynısı **RPC dönüşleri** için geçerlidir: jsonb bir tablo satırı değildir,
dönüşüm servis metodunda yapılır (`adjustBatch`).

> Ayrım başta "projeksiyonlar tamamen dışarıda" diye çizilmişti ve İKİ REJİM doğuruyordu. Entite
> şemasından türeyen bir projeksiyon (`StockAdjustmentDetailSchema`) `…Cents` alanını miras alıyor ama
> değeri çevrilmiyordu: şema tamsayı beklerken euro geliyordu. İki rejim ertelenecek bir borç değil,
> doğrulamada patlayan bir çelişkiydi — tek rejime indirildi (`02.9` dilim 3).

**Güvence koda gömülüdür, ada güvenilmez:** `pnpm docs:check` bir `…Cents` şema alanının servis beyanında
karşılığı olduğunu ve `dbNumeric` KULLANMADIĞINI doğrular. Beyansız bir `…Cents` alanı — adı doğru,
dönüşümü yok — tam olarak 74,17 €'yu **0,74 €** gösteren hatadır (30.07, kullanıcı ekran görüntüsüyle
yakaladı). Göç bitince kural yumuşamaz, sertleşir: sıra **branded tip**tedir (`Cents`), o gün güvence
denetleyiciden derleyiciye geçer.

**Birimi başka alana bağlı bir para kolonu OLAMAZ.** `discount.value` yüzde de sabit tutar da
taşıyordu (`type`'a göre) ve hiçbir adla dürüst olamıyordu: `valueCents` yüzde satırında yalan söyler,
`value` sabit satırında birimini söylemez. Çözüm ada değil **şemaya** yazılır — kolon ikiye ayrılır
(`percent` + `amount`) ve hangisinin dolu olacağını bir kısıt tutar (`02.9`, `0031`). Aynı ölçüt
görünüm tiplerinde ve form girdilerinde de geçerlidir: tek kutu, iki alan gönderir.

**RPC gövdeleri iki yönde de sınırdır.** Fonksiyonlar gelen anahtarları tablonun kolonlarıyla
**kesiştirir**: `unit_price_cents` diye bir kolon yoksa o anahtar sessizce düşer ve satır fiyatsız
doğar. Bu yüzden RPC'ye giden gövde `rpcMoneyToEuro`, dönen gövde `rpcMoneyToCents` ile çevrilir
(`packages/database/src/utils/rpc-money.ts`). **`undefined` ile `null` aynı şey değildir:** ilki
"gönderme" (kolon varsayılanını alır), ikincisi "boşalt" — ikisini birleştirmek `not null default`
kolonları kırar (`shipping_fee`de kırdı).

**GÖÇ BİTTİ (`02.9`, 03.08).** Altı ailenin altısı da beyanlı: fiyat · indirim · stok · tedarik ·
sipariş · para hareketi (profil zaten cent'teydi). Uygulamada euro yalnız İKİ yerde görünür ve ikisi
de bilinçlidir: **DB kolonları** (`numeric`, sınırda çevrilir) ve **muhasebeciye giden export satırı**
(bir belge, uygulama içi model değil). Sıra **branded tip**tedir (`type Cents = number & {…}`):
bugün güvence `docs:check`'te, o gün derleyiciye geçer.

## 9. UI: Tailwind + primitif/adaptör

**Stil mekanizması Tailwind** (genel blueprint CSS Modules diyor; burada değişti — Sapma 2). Ama §9'un yapısal kuralları **aynen geçerli**:

- İki katman: `components/ui/` (sunum primitifleri) + `components/form/` (RHF adaptörleri).
- Primitif RHF bilmez; adaptör köprüdür. Panel (form kütüphaneli) ile müşteri akışı (sade durum) **aynı görünümü** paylaşır.
- Yeni bileşen yazmadan önce `ui/` ve `form/` tara; benzeri varsa genişlet.
- Ham `<input>`/`<select>` son çare, gerekçesi yorumda.
- Tekrarlayan görsel dil (rozet, durum) için **tek render kaynağı**.

**Tasarım token'ları:** Tailwind v4 → `apps/web/app/globals.css` `@theme` bloğu (config dosyası yok). İki ayrı set: müşteri (`--color-*`) ve operasyon (`--color-ops-*`); kaynak, Claude Design komponent envanterlerinin §0'ıdır.

- **Ham hex yasak.** Bir ton envanterde yoksa kodlanmaz — önce envantere eklenir (envanterin kendi kuralı; kodlayan ajanın "birebir uygula" kuralıyla çarpışmasın diye bağlayıcıdır). İstisna: marka renkleri (Google/WhatsApp butonları) ve `global-error.tsx` — o kök layout yerine geçtiği için globals'a güvenemez.
- **Her semantik aile dört katman taşır:** metin · koyu (zemin üstünde başlık/gövde) · zemin · kenarlık (+ aileye göre grafik/nokta). İki katmanla bırakılan aile, sayfa tasarımlarının envanter dışına çıkmasına yol açar.
- **Karanlık mod yalnız operasyon yüzeyindedir.** `<html data-surface="operations">` altında `prefers-color-scheme: dark` ile devreye girer; token **adları** değişmez, yalnız değerleri yeniden tanımlanır — bileşenlere dokunulmaz. Müşteri vitrini tek temalıdır (envanter kararı: vitrin gündüz krem zemin üstünde kurulu). `data-theme="light"` koyu temayı bir ağaçta kapatır.
- Tailwind'in kendi sabit renkleri (`bg-white`, `text-black`, `*-gray-500`…) tema ile dönmediği için operasyon yüzeyinde kullanılmaz; karşılığı token'dır (`bg-ops-white`, `text-ops-card`).

---

## 10. Sabitler nerede yaşar

Genel blueprint §10 ile aynı. Env'e yalnız sır + ortama göre değişen değer.

| Değer | Yeri |
| --- | --- |
| Marka adı, alan adı, logo yolu, yasal metinler, renkler | `packages/brand` |
| Arayüz metinleri (tr/fr/de) | `packages/i18n` |
| **Müşteri URL yol tablosu** (iç yol → dile göre segment) | `packages/i18n` (`PATHNAMES`) — apps/web next-intl'i, apps/backend giden bağlantıyı bununla kurar; iki kopya olsaydı biri eskir, mail 404'e düşerdi |
| Fiziksel ölçüler, sabit oranlar, para dönüşümü (`toCents`/`fromCents`) | `packages/helper` |
| **Görüntüleme biçimlemesi (para/tarih/sayı metni)** | **yüzey başına TEK dosya** — aşağı bak |
| İşletme ayarı (kullanıcı değiştirebilmeli): min sepet, kargo eşiği, DLC uyarı eşiği, KDV varsayılanı | Veritabanı — ayar tablosu + önbellekli çözücü |

Marka adı/alan adı tek sabitten okunur, elle yazılmaz.

**Biçimleme yüzey başına tek dosyadır (karar 02.08 — denetim B6).** Kural eskiden "biçimleme →
`packages/helper`" diyordu ama kod hiç öyle olmadı ve gerekçesi sağlam: iki yüzeyin ihtiyacı aynı
değil. Müşteri yüzeyi **üç dilde** `Intl` ile biçimlendirir (ondalık ayracı, para simgesinin yeri,
tarih sırası dile göre değişir); operasyon yüzeyi tek dilli (TR) ve sabit biçimlidir. Ortak bir
fonksiyon ikisini de yarım karşılar, ve "locale parametresi geçilir" çözümü operasyonun her çağrısına
taşıması gereksiz bir argüman ekler.

- Müşteri: `apps/web/lib/storefront/format.ts`
- Operasyon: `apps/web/components/operation/ui/format.ts`
- **Giden mesaj (mail/WhatsApp): `packages/notify/src/format.ts`** — üçüncü yüzey (17.2'de eklendi).
  Ekran biçimlemesi `apps/web`'de yaşar; oysa giden mesajı İKİ uygulama kuruyor — istekten doğanı
  `apps/web`, saatten doğanı `apps/backend`. Zamanlı işin ekran katmanından biçimleyici çekmesi
  bağımlılık yönünü tersine çevirirdi (STACK §4); kendi `Intl` çağrısını yazması ise aynı tarihin iki
  mailde iki türlü çıkması demekti. Ekranla ölçüt de aynı değil: mail arşivde kalıp aylar sonra
  açılır, o yüzden tarih **yıl taşır** — ekranda yılsız tarih meşrudur.

**Bu üç dosya DIŞINDA `toLocaleString`/`toFixed`/`Intl.NumberFormat` yazılmaz.** Sızıntının bedeli
görünmez: aynı tutar iki ekranda iki farklı biçimde çıkar ve hangisinin doğru olduğu tartışılır.
Taşıma (`packages/helper`'a almak) bilinçli olarak YAPILMADI — getirisi düşük, ihtiyaç kuralın
netleşmesiydi.

### Dosya deposu: iki kova, iki okuma yolu

`packages/storage` (Cloudflare R2) **iki ayrı kova** yönetir; ölçüt tek soru: *bu dosyanın
görünmesi mi isteniyor, görünmemesi mi?*

| | Public kova (`R2_BUCKET_NAME`) | Private kova (`R2_PRIVATE_BUCKET_NAME`) |
| --- | --- | --- |
| Ne durur | Katalog/koleksiyon/paket görselleri | Müşterinin yüklediği dosyalar: şikâyet fotoğrafı (16.2), ileride teslim onayı, B2B belgesi |
| Okuma | İmzasız, kalıcı adres (`publicImageUrl`) | Süreli imzalı adres (`privateReadUrl`, 15 dk) |
| Yükleme | Sunucudan (`getR2().uploadFile`) | Tarayıcıdan doğrudan, imzalı adresle (`privateUploadUrl`, 10 dk) |
| Google görsün mü | **Evet** — amaç bu | **Hayır** — tam tersi |

**Katalogda imza zararlıdır:** her render'da değişen adres tarayıcı/CDN cache'ini öldürür, paylaşım
(OG) kartı süre dolunca görselsiz kalır, `next/image` ve Google Görseller devreye giremez. Müşteri
yüklemesinde ise aynı özellik istenen şeydir.

**Neden iki kova, tek kovada iki klasör değil:** R2'de "herkese açık" ayarı **kova düzeyindedir** —
aynı kovanın içinde "şu klasör gizli" denemez. Zorunluluk, tercih değil.

**Yetki kararı depoda değil kapıda:** `privateReadUrl` "adres üret" der, "kim görebilir" demez —
onu dosyanın sahibini bilen uygulama kapısı söyler (ör. `lib/ticket/read.ts`). Yetkiyi depoya
gömmek, her yeni dosya türünde aynı kararı yeniden yazmak olurdu.

---

## 11. Yeni projede kurulum sırası

1. `pnpm-workspace.yaml` + `turbo.json` + `packages/typescript-config` (strict) + Tailwind kurulumu + `packages/brand` (token kaynağı)
2. `packages/types` — `LocalizedText` + ilk entity üçlü şeması
3. `packages/database` — `base.service.ts` + `case-transformers.ts` (jsonb'yi çevirmeyen dönüştürücü dikkatiyle)
4. İlk migration + ilk entity servisi
5. `packages/i18n` — arayüz metin iskeleti + yedek zinciri çözücü
6. `apps/web` — `lib/supabase`, `lib/guard.ts` (admin+warehouse+courier), `lib/error.ts`, i18n routing (`/tr` `/fr` `/de`)
7. İlk sayfa: sunucu bileşeni + client (cihaz çatallanmalı) + `actions/`
8. `components/ui` + `components/form` — ilk primitif çifti (Tailwind)
9. `packages/domain-core` — sipariş durum makinesi + stok mantığı + birim testler
10. `scripts/deploy.sh` + PM2 (WORKFLOW.md §3)

3. ve 9. adım en yüksek getirili: taban sınıf + domain motoru hazır olduğunda entity ve akış eklemek hızlanır.

---

## 12. Bu projenin `ARCHITECTURE.md`'si

Bu dosya uyarlanmış **şablondur**; proje ayrıca kendi envanterini tutar (rota haritası, bileşen aileleri, tam veri modeli, kalıcı "neden"ler). Domain kuralları `DOMAIN.md`'de, veri modeli `DATA_MODEL.md`'de, sapmaların gerekçeleri `ARCHITECTURE_DECISIONS.md`'de zaten ayrık — bu dosyalar birlikte `ARCHITECTURE.md` işlevini görür.

Açık iş kalemleri buraya **girmez**; `BACKLOG.md`'ye gider (WORKFLOW.md §8 rol ayrımı).

---

## 13. Operasyon ve güvenlik ilkeleri (taslak)

> **Statü notu:** Bu bölümdeki maddeler sektör en-iyi-uygulamalarına göre konmuş **taslak varsayılanlardır**, nihai karar değildir. Bu kısmın kodlaması yapılmadan önce **tekrar konuşulacak ve netleştirilecektir**: seçenekler masaya konacak, artı/eksileriyle karşılaştırılacak ve net karar öyle verilecektir. Aşağıdakiler o konuşmanın başlangıç zeminidir.

- **Veri erişimi — çift kat savunma:** tüm okuma/yazma sunucu tarafında service-role + `lib/guard.ts` rol kapılarından geçer; RLS (satır seviyesi güvenlik) **ikinci savunma hattı** olarak temel tablolara yazılır (müşteri kendi satırı, kurye kendi teslimatı). Anon key'in tarayıcıya hangi kapsamla çıktığı netleştirilecek.
- **Çok-tablolu yazım = tek Postgres fonksiyonu (RPC):** birden çok tabloya yazan her iş akışı tek transaction'da koşar. Bilinen akışlar: sipariş onayı (Order+Reservation), teslim (Reservation+Stock+OrderItemBatch+snapshot), hızlı satış, kurye gün kapanışı, StockIntake, puan redemption, müşteri birleştirme.
- **Yazmada RPC eşiği (karar 27.07 — 06.1):** RPC bedeli vardır (migration'a bağlı, testi yerel Supabase ister, iş kuralının SQL'e sızma riski taşır), o yüzden **yarım kalırsa veri bozulan** yazımlara ödenir. Ölçüt iki koşuldan biri: (a) **eşzamanlılık yarışı** var — "önce oku sonra yaz" arası başkası araya girebilir, ya da (b) **çok tabloya yazım bölünemez** — yarısı yazılırsa sistem tutarsız kalır ve elle düzeltme gerekir. İkisi de yoksa **TS servis** yazılır: okunur, birim testli, migration'sız değişir. Modül 06'nın RPC listesi: `reserve_stock` (a), `receive_intake` (b — StockIntake + partiler + PO kapanışı + son alış fiyatı), `adjust_stock` (b — düzeltme kaydı + fiili düşüm). Rezervasyon serbest bırakma, TTL süpürme, tedarikçi/PO CRUD ve sıcaklık kaydı TS'te kalır (tek tablo ya da bölünmesi zararsız). Okuma tarafı ayrı eşiktedir (bir alt madde). RPC **iş kuralı taşımaz**: eşiği/sırayı/izni motor hesaplar (§4), fonksiyon yalnız koşullu yazar.
- **Telafi mantığı bir garanti DEĞİLDİR (karar 30.07 — 07.4).** "Önce başlığı yaz, kalemler düşerse geri sil" deseni RPC'nin yerini tutmaz: silme de düşebilir, süreç arada ölebilir, ve telafi yalnız HATA anında çalışır — sessiz bir yarım yazım hiç fark edilmez. Üstelik iki ifade arasında bozuk hâl **okunabilir** durumdadır. `create_order` (b) bu yüzden yazıldı: sipariş başlığı + kalemler + indirim kullanım kaydı tek transaction. Yeni bir yazım yolunda "telafi ile hallederim" görülürse, o yol RPC eşiğini zaten geçmiştir.
- **Değişmez, yazım yolunda değil VERİDE durur (karar 30.07 — 07.4).** Bir kural yalnız tek yazım yolunda denetleniyorsa, ikinci yol açıldığı gün (elle giriş, onarım betiği, doğrudan SQL) sessizce delinir. Tablolar arası değişmezler bu yüzden **ertelenmiş kısıt tetikleyicisiyle** (`deferrable initially deferred`) yazılır: kontrol COMMIT anında yapılır, yani ifade sırası (önce başlık, sonra kalemler) kısıtı geçici olarak bozabilir ama transaction kapanırken bütün doğrulanır. İlk örnek `order_discount_balance`: `order.discount_amount = Σ order_item.line_discount_amount`.
- **Okumada RPC eşiği (karar 27.07):** okuma için Postgres fonksiyonu **istisnadır, kural değil.** Üç koşul BİRLİKTE sağlanmadıkça yazılmaz: (1) veri **birden fazla tablodan** birleşiyor, (2) işi veritabanı sunucusunda yapmak **toplam** performansı iyileştiriyor (tur sayısı + uygulamaya taşınan satır hacmi dâhil), (3) fark **bariz** — "belki daha hızlıdır" yetmez. Her küçük okuma için yazılmaz; tek tablolu ve küçük okumalar servis sorgu kurucusunda kalır. N+1 kırmanın **ilk** aracı RPC değil, PostgREST'in gömülü `select`'idir (ilişkiyi zaten sunucuda join'ler); RPC ancak kurucunun ifade **edemediği** hâllerde gerekir: çok dilli tam-metin arama + sıralama, tek turda çok koşullu toplama, pencere fonksiyonu. Okuma RPC'si **iş kuralı taşımaz** (eşik/sıra/izin motorun işi — §4); yalnız veri toplar ve süzer. Dönen satırlar servis okumalarıyla aynı disiplinle **Zod'dan geçer**; fonksiyon `create or replace` ile migration'a yazılır (WORKFLOW §2).
- **Migration mekanizması:** numaralı SQL dosyaları tek transaction içinde uygulanır; uygulandı bilgisi `schema_migrations`'ta; deploy hattı migration hatasında durur (araç: Supabase CLI veya basit runner — seçim netleşecek).
- **Webhook güvenliği:** imza doğrulanmadan gövde işlenmez; her olay `WebhookEvent`'e yazılır (provider+event_id unique) — aynı olay ikinci kez gelirse no-op (idempotent).
- **Yedekleme/felaket kurtarma:** Supabase planında günlük yedek/PITR doğrulanır + haftalık `pg_dump` off-site + Storage senkronu + yılda bir **geri yükleme provası** ("provası yapılmamış yedek, yedek değildir"); Caddyfile/PM2 konfigürasyonu repo'da.
- **Log, hata izleme ve sistem sağlığı → [`OBSERVABILITY.md`](OBSERVABILITY.md).** Karar verildi (29.07), bu satır artık taslak değil: üç katman birlikte kurulur — `pino` yapılandırılmış log (üretimde JSON, stdout; döndürme süreç yöneticisinin işi) · `error_log` tablosu + `capture_error` RPC (parmak iziyle gruplanan kendi hata izlemesi, Sentry yok) · `system_health_snapshot` (backend cron'u iki dakikada bir sunucu/süreç/servis görüntüsü alır, eşiklerden `ok`/`warn`/`crit` türetir). **E-posta alarmı YOK** (kullanıcı kararı): izleme çekme modeliyle çalışır, tek operasyon ekranı (`/operations/system`) alarmın yerini tutar. Saklama tanımlı: hata 90 gün (çözülmüşler; çözülmemişler süresiz), sağlık 14 gün. `context`'e kimlik yazılır, içerik yazılmaz.
- **Cron disiplini:** `apps/backend` tek instance (fork mode); her zamanlanmış iş **taramalı ve idempotent** yazılır (kaçan tik bir sonraki taramada telafi olur); kritik işler `last_run` bırakır, gecikince alarm. **Uygulama (06.4):** işler ortak bir kabuktan (`apps/backend/src/jobs/runner.ts`) geçer — üst üste binme koruması (önceki tur bitmediyse tik atlanır), hata yakalama (cron geri çağrısındaki hata sessizce kaybolmaz, süreç de düşmez) ve iz yazımı orada tek yerde. İz `job_run` tablosunda iş başına TEK satırdır (tarihçe değil); hatalı turda da `last_run_at` yazılır — "koştu ama düştü" ile "hiç koşmadı" ayrımı alarmın girdisidir.
- **Deploy atomikliği:** yeni sürüm ayrı dizine derlenir → symlink değişimi → `pm2 reload`; derleme düşük trafik saatinde.
- **Test/CI/staging:** her push'ta typecheck+lint+birim test (GitHub Actions); yerel Supabase üzerinde entegrasyon testleri — özellikle **paralel rezervasyon yarışı** ve para-akışı RPC'leri; staging = ikinci (ücretsiz) Supabase projesi + aynı VPS'te ikinci PM2 app; migration provası önce staging'de.
- **`vitest` yalnız KÖK package.json'da ve bu bilinçlidir (denetim B5, 02.08).** Tek bir kök
  `vitest.config.ts` iki projeyi (`unit`/`integration`) birlikte tanımlıyor; koşum noktası daima kök.
  Hiçbir workspace paketinde `test` scripti YOK, yani `pnpm --filter <paket> test` diye bir akış da
  yok — bağımlılığı paketlere dağıtmak, var olmayan bir kullanımı desteklemek olurdu. Ayrım
  dizinle çizilir (aşağıdaki madde), paket sınırıyla değil; ikisi çakışsaydı 52 dosya yer değiştirirdi.
- **Test paketi ikiye ayrıktır (karar 29.07 — ölçümle):** `unit` (DB'siz, **paralel**, 568 test ~1,3 sn) ve `integration` (yerel Supabase, **seri**, ~35 sn). Ayrım öncesi tek paket `fileParallelism: false` altında 45–107 sn geziyordu; oysa saf yarının asıl test süresi 224 ms'ti — kalanı kurulum ve sıra bekleme. **Sınır dizinle çizilir** (`apps/web/lib`, `packages/database`, `apps/backend` = entegrasyon kökleri), isimle değil: 52 dosyayı yeniden adlandırmak paralel ajanların işine dokunurdu. **Sınır kendini denetler:** birim kurulumu `.env` yüklemez ve DB env'ini siler, yani yanlış projeye düşen test sessizce paralel koşup veri kirletmez — ilk satırında "Supabase env eksik" diye patlar. Tam paket **kilit altında** koşar (`scripts/with-test-lock.mjs`; `flock` macOS'ta yok, `mkdir` atomikliği yeter) çünkü üç ajan tek yerel veritabanını paylaşıyor ve eşzamanlı iki koşu **tekrarlanmayan düşüşler** üretiyordu. Kurallar → `CLAUDE.md §4b`.
- **Paket sınırı araçla zorlanır** (karar 27.07 — §4'teki şema bağlayıcıdır): `domain-core` DB bilmez, `database` motoru bilmez; ikisi de yalnız `types`+`helper`'a bağlanır. `apps/*` **her ikisini de** çağırabilir, AMA sipariş/stok/para/fiyat **kararını** kendi içinde hesaplayamaz — kararı domain-core'a sorar, servisi yalnız o kararı yazmak/okumak için kullanır. Kural sızması testi: bir `if` içinde iş kuralı varsa (eşik, sıra, izin) yeri motordur.
- **Admin yüzey izolasyonu:** `(admin)`/`(shop)` route group ayrımı + `/admin` altı middleware'de toptan oturum+rol kontrolü (sayfa içi guard yine tekrarlanır — çift kat) + `noindex`.
