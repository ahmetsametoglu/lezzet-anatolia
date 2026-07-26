# Lezzet Anatolia

Donuk Türk gıdası satış ve operasyon sistemi (Strasbourg; FR/DE; TR/FR/DE; B2B + B2C).

Mimari ve iş kuralları: [`docs/architecture/`](docs/architecture/). İnşa sırası: [`docs/build/`](docs/build/). Tasarım girdileri: [`design/`](design/).

## Yığın

pnpm workspaces + Turborepo · Next.js (App Router, RSC + Server Action) · TypeScript strict · Zod · Supabase (Postgres/Auth/Storage) · Tailwind · Hono + node-cron (arka uç) · PM2 + Caddy.

## Yapı

```
apps/
  web/        Next.js — müşteri + admin
  backend/    Hono + node-cron — webhook ve zamanlı işler
packages/
  types/ database/ domain-core/ helper/ brand/
  i18n/ storage/ email/ notify/ ai/
  eslint-config/ typescript-config/
supabase/migrations/   numaralı SQL (additive-only)
scripts/               deploy, seed
```

Bağımlılık tek yönlü (STACK §4): `types → database → apps`; döngü yasak. Kural `pnpm boundaries` ile makine-zorlamalı.

## Kurulum (3 adım)

```bash
pnpm install          # bağımlılıklar
cp .env.example .env  # değerleri doldur (Supabase vb.)
pnpm dev              # web + backend
```

## Komutlar

| Komut             | Ne yapar                                   |
| ----------------- | ------------------------------------------ |
| `pnpm dev`        | web + backend (turbo, paralel)             |
| `pnpm build`      | üretim derlemesi                           |
| `pnpm typecheck`  | tüm paketler `tsc --noEmit`                |
| `pnpm lint`       | ESLint (kök, tüm repo)                     |
| `pnpm format`     | Prettier                                   |
| `pnpm boundaries` | paket sınırı kontrolü (dependency-cruiser) |
| `pnpm knip`       | ölü kod / kullanılmayan export taraması       |
| `pnpm test`       | vitest (birim + entegrasyon)               |
| `pnpm docs:check` | doküman ↔ kod tutarlılığı (bkz. WORKFLOW §8) |
| `pnpm docs:sync`  | türetilmiş durum özetini yeniden yazar     |
| `pnpm hooks:install` | commit öncesi doküman denetimini kurar  |

### Veritabanı (yerel Supabase)

| Komut               | Ne yapar                                             |
| ------------------- | ---------------------------------------------------- |
| `pnpm db:start/stop`| yerel Supabase yığınını başlatır / durdurur          |
| `pnpm db:migrate`   | bekleyen migration'ları uygular                      |
| `pnpm db:new`       | yeni numaralı migration dosyası açar                 |
| `pnpm db:seed`      | örnek kategori/ürün + ilk admin                      |
| `pnpm db:reset`     | **yıkıcı** — sıfırlar, migration'ları baştan uygular |
| `pnpm db:refresh`   | **yıkıcı** — reset + seed                            |

Servisler: Postgres `54322` (`postgres:postgres`) · API `54321` · Studio `54323` · Mailpit (giden e-posta) `54324`.
Ayrıntı ve ajan kuralları: [`WORKFLOW.md §4b`](docs/architecture/WORKFLOW.md) — okuma serbest, **yıkıcı komutları kullanıcı çalıştırır**.

Node ≥ 22, pnpm 9.
