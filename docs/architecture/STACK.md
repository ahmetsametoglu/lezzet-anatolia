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

**Süzme nerede yapılır (karar 27.07):** ölçüt **listenin doğal tavanı** ve arayüzün tamamına ihtiyacı olup olmadığıdır.
- **Sunucuda süz + sayfala:** üretimde ~200 satırı geçebilen her liste — ürün, sipariş, müşteri, parti, fatura, para hareketi. Süzgeçler **URL'de** taşınır (paylaşılabilir + yenilemeye dayanıklı + RSC okuyabilir), servise parametre olarak iner ve okuma **keyset (cursor)** paginasyonludur (CLAUDE.md: tüm listeler infinite scroll). Sayaç/özet de sunucuda hesaplanır — client tam listeye sahip olmadığı için türetemez.
- **Client'ta süz (tamamını çek):** onlarla sınırlı, tavanı belli ve arayüzün **zaten tamamını** istediği kümeler — kategori, koleksiyon, enum listeleri (alerjen/KDV). Bunlar açılır menü ve filtre çipini beslediği için parça parça çekmek anlamsızdır.
- **Ölçüt sızması:** "şimdilik az kayıt var" gerekçesiyle büyüyecek bir listeyi client'ta süzmek, sonradan **ikinci bir iş** doğurur (ekran + servis + URL birlikte değişir). Yeni bir liste ekranı yazılırken bu karar **baştan** verilir.

**Bu projeye özgü not — jsonb ve eşzamanlılık:**
- `LocalizedText` jsonb alanları taban sınıfta özel işlem gerektirmez; sıradan kolon gibi geçer (camelCase dönüşümü nesne içine inmez, değer olduğu gibi saklanır — dönüştürücünün jsonb değerini **çevirmemesi** sağlanır).
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
│     └── items.mobile.tsx   # mobil sunumu
├── actions/actions.ts       # Server Action'lar
└── components/              # yalnız bu sayfaya ait
```

- Sunucu tek kalır; içerik server-rendered (SEO). Çatallanma SSR'de **değil**, client giriş noktasında. Gerekçe: `ARCHITECTURE_DECISIONS.md` Sapma 3.
- Ortak katman (veri, hook, action çağrıları, token) paylaşılır; yalnız sunum bileşeni dallanır.
- Cihaz ipucu sunucudan header ile client'a prop geçilebilir (ağaç yine tek).

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

> **AÇIK — sözleşme ile kod ayrışıyor (30.07, gerçek hatayla bulundu).** Yukarıda "sınırda (servis
> katmanında) cent'e çevrilir" yazıyor, ama servisler `dbNumeric`'i olduğu gibi (euro) döndürüyor;
> dönüşüm **her çağrı yerine** bırakılmış — bugün ~20 yerde elle. Bu bir "stil" sorunu değil, hata
> fabrikası: siparişler detay ekranı bu yüzden 74,17 €'yu **0,74 €** gösterdi (kullanıcı ekran
> görüntüsüyle yakaladı). Kapatılması gereken yer servis katmanı → `02.9`. O iş bitene kadar
> savunma, yukarıdaki iki maddedir (ortak helper + `…Cents` adlandırması).

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
