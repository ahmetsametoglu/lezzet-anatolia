# 00 — Monorepo İskeleti

## Kapsam

Boş ama çalışır monorepo: paket kabukları, ortak tooling, "her şey derleniyor" hali. **İş mantığı yok** — sadece zemin. Bu modül bitince her sonraki modül kendi paketinin içine kod eklemekle uğraşır, kurulumla değil.

## Okunacaklar

- `STACK.md §2-3` (yığın ve iskelet), `§4` (bağımlılık yönü), `§11` (kurulum sırası)
- `WORKFLOW.md §1-2` (çalışma disiplini, git)

## Bağımlılık

Yok — ilk modül.

## Başlarken verilecek izah (örnek)

> "Monorepo kuruyoruz: tek depo içinde `apps/` (web sitesi + arka uç servisi) ve `packages/` (ortak parçalar) olacak. Böylece tip tanımları ve iş kuralları tek yerde yaşar, iki uygulama da aynısını kullanır — kopya kod olmaz. pnpm paketleri bağlar, Turborepo derlemeyi hızlandırır. Bugün sadece boş kabukları ve araçları kuruyoruz; hiçbir özellik kodlanmıyor."

## Görevler

- [ ] pnpm workspace + Turborepo kök kurulumu (`pnpm-workspace.yaml`, `turbo.json`, kök `package.json`)
  - *Bitti:* kökte `pnpm install` hatasız
- [ ] TypeScript strict taban konfigi (kökte paylaşılan `tsconfig`), ESLint + Prettier
  - *Bitti:* `pnpm typecheck` ve `pnpm lint` kökte çalışıyor
- [ ] Paket kabukları: `packages/types`, `database`, `domain-core`, `helper`, `brand`, `i18n`, `storage`, `email`, `notify`, `ai` — her biri boş bir export ile
  - *Bitti:* hepsi derleniyor; bağımlılık yönü kuralı (`STACK §4`) ihlalsiz
- [ ] `apps/web` — Next.js App Router boş uygulama (tek "merhaba" sayfası, Tailwind bağlı, `packages/brand` token'ları import ediliyor)
  - *Bitti:* `pnpm dev` ile açılıyor
- [ ] `apps/backend` — Hono boş servis (tek `/health` ucu) + node-cron kabuğu
  - *Bitti:* lokal çalışıyor, `/health` 200 dönüyor
- [ ] Paket sınırı aracı (eslint-boundaries veya dependency-cruiser) — `STACK §4` kuralları makine-zorlamalı
  - *Bitti:* bilerek yapılan bir ihlal derlemede/lint'te yakalanıyor
- [ ] Kök script'ler: `dev`, `build`, `typecheck`, `lint`, `test` (turbo pipeline)
  - *Bitti:* hepsi kökte tek komutla koşuyor
- [ ] `.env.example` + README (lokal kurulum üç adımda)
  - *Bitti:* temiz klonda README takip edilerek proje ayağa kalkıyor

## Netleşecekler

- Yok — bu modül tartışmasız zemin. (CI/staging `18-operasyon-guvenlik.md`'de konuşulacak; burada kurulmaz.)
