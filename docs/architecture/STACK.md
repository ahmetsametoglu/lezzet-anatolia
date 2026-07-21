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
| **i18n (arayüz)** | kod içi i18n | Statik metinler; içerik jsonb (§5) |
| Arka plan işleri | **Hono** + `node-cron` | Webhook ve zamanlı işler için hafif süreç |
| Süreç yönetimi | **PM2** + reverse proxy (Caddy) | Basit sunucu, sıfır-kesinti reload |

ORM bilinçli yok: doğrulama Zod'da, sorgu katmanı §6 taban sınıfta. Üçüncü şema kaynağı senkron derdi getirir.

**Genel blueprint'ten fark:** Stil satırı CSS Modules değil **Tailwind**. Yığına i18n satırı eklendi.

---

## 3. İskelet

```
proje/
├── apps/
│   ├── web/          # Next.js — müşteri + admin + Server Action + gerektiğinde /api
│   ├── backend/      # Hono + cron — dış webhook'lar (ödeme), zamanlı işler
│   └── worker/       # (opsiyonel) uzun/yerel işler
├── packages/
│   ├── types/            # Zod şemaları + domain tipler  ← TEK KAYNAK
│   ├── database/         # BaseDbService + entity servisleri
│   ├── domain-core/      # UI'sız domain motoru: sipariş durum makinesi, stok, fiyat, kanal (§8)
│   ├── helper/           # tarih/para/format — bağımlılıksız saf fonksiyonlar
│   ├── brand/            # marka sabitleri (ad, logo yolu, yasal metinler, renkler)
│   ├── i18n/             # arayüz metinleri (tr/fr/de) + yerelleştirme yardımcıları
│   ├── storage/          # dosya deposu istemcisi
│   ├── email/            # mail istemcisi + şablonlar
│   ├── notify/           # soyut bildirim katmanı (e-posta / wa.me / ileride push)
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

---

## 8. Domain motoru: `domain-core` (zorunlu)

Genel blueprint §8 domain motorunu "ölçüt karşılanırsa" öneri yapar. Bu projede ölçüt fazlasıyla karşılanır; paket **kesin** kurulur. İçindekiler:

- **Sipariş durum makinesi** — izin verilen geçişler, hızlı satış yolu (bkz. `ORDER_LIFECYCLE.md`)
- **Stok mantığı** — rezervasyon, kullanılabilir hesabı, eşzamanlılık kuralı
- **Fiyat** — sepette fiyat sabitleme, kanal/müşteri fiyat çözümü
- **Kanal belirleme** — müşteri tipi → b2b/b2c
- **Kâr hesabı** — kanal/ürün bazında

Hepsi UI'sız, saf fonksiyon + gerekiyorsa Zustand deposu + **birim test**. Her yüzey (müşteri, admin, arka plan, ileride AI) aynı motoru çağırır.

---

## 9. UI: Tailwind + primitif/adaptör

**Stil mekanizması Tailwind** (genel blueprint CSS Modules diyor; burada değişti — Sapma 2). Ama §9'un yapısal kuralları **aynen geçerli**:

- İki katman: `components/ui/` (sunum primitifleri) + `components/form/` (RHF adaptörleri).
- Primitif RHF bilmez; adaptör köprüdür. Panel (form kütüphaneli) ile müşteri akışı (sade durum) **aynı görünümü** paylaşır.
- Yeni bileşen yazmadan önce `ui/` ve `form/` tara; benzeri varsa genişlet.
- Ham `<input>`/`<select>` son çare, gerekçesi yorumda.
- Tekrarlayan görsel dil (rozet, durum) için **tek render kaynağı**.

**Tasarım token'ları:** renk/spacing/tipografi `tailwind.config` `theme.extend`'de; kaynak değerler `packages/brand`. Mobil/masaüstü ortak katman burasıdır; padding/margin standartları cihaza göre değişse de token tek yerden gelir.

---

## 10. Sabitler nerede yaşar

Genel blueprint §10 ile aynı. Env'e yalnız sır + ortama göre değişen değer.

| Değer | Yeri |
| --- | --- |
| Marka adı, alan adı, logo yolu, yasal metinler, renkler | `packages/brand` |
| Arayüz metinleri (tr/fr/de) | `packages/i18n` |
| Fiziksel ölçüler, sabit oranlar, biçimleme | `packages/helper` |
| İşletme ayarı (kullanıcı değiştirebilmeli): min sepet, kargo eşiği, DLC uyarı eşiği, KDV varsayılanı | Veritabanı — ayar tablosu + önbellekli çözücü |

Marka adı/alan adı tek sabitten okunur, elle yazılmaz.

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
