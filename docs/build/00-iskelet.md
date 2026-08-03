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

- [x] (00.1) pnpm workspace + Turborepo kök kurulumu (`pnpm-workspace.yaml`, `turbo.json`, kök `package.json`)
  - *Bitti:* kökte `pnpm install` hatasız
- [x] (00.2) TypeScript strict taban konfigi (kökte paylaşılan `tsconfig`), ESLint + Prettier
  - *Bitti:* `pnpm typecheck` ve `pnpm lint` kökte çalışıyor
- [x] (00.3) Paket kabukları: `packages/types`, `database`, `domain-core`, `helper`, `brand`, `i18n`, `storage`, `email`, `notify`, `ai` — her biri boş bir export ile
  - *Bitti:* hepsi derleniyor; bağımlılık yönü kuralı (`STACK §4`) ihlalsiz
- [x] (00.4) `apps/web` — Next.js App Router boş uygulama (tek "merhaba" sayfası, Tailwind bağlı, `packages/brand` token'ları import ediliyor)
  - *Bitti:* `pnpm dev` ile açılıyor
- [x] (00.5) `apps/backend` — Hono boş servis (tek `/health` ucu) + node-cron kabuğu
  - *Bitti:* lokal çalışıyor, `/health` 200 dönüyor
- [x] (00.6) Paket sınırı aracı (eslint-boundaries veya dependency-cruiser) — `STACK §4` kuralları makine-zorlamalı
  - *Bitti:* bilerek yapılan bir ihlal derlemede/lint'te yakalanıyor
- [x] (00.7) Kök script'ler: `dev`, `build`, `typecheck`, `lint`, `test` (turbo pipeline)
  - *Bitti:* hepsi kökte tek komutla koşuyor
- [x] (00.8) `.env.example` + README (lokal kurulum üç adımda)
  - *Bitti:* temiz klonda README takip edilerek proje ayağa kalkıyor
- [~] (00.9) **Playwright — önce GÖZ, sonra duman** (kullanıcı kararı 03.08; denetim etüdü) · `touches: playwright.config.ts, scripts/ui-shot.mjs, e2e/**, package.json`
  - **Durum (03.08) — ÇEKİRDEK KURULDU (denetim ajanı, kullanıcı talimatıyla):** `pnpm ui:shot <yol>` (desktop+mobile+ops-karanlık görüntü + konsol dökümü → `.ui-shots/`, dev kapalıysa net mesaj) · `playwright.config.ts` (iki proje = fork'un iki yüzü; `webServer` bilerek yok — dev'i kullanıcı yönetir; artefakt yalnız düşüşte) · `pnpm test:e2e` (test kilidine bağlı) · iki DENEME dumanı (`e2e/customer/storefront` · `e2e/operations/panel` — kaba yapısal iddialar, örnek olsun diye) · **şerit disiplini `e2e/README.md`'de beş kural** (senaryo kaynağı tasarım+DOMAIN; çapraz yazım; §4b veri disiplini; görüntü=artefakt; iki proje).
  - **DUYURU — Kademe 2 senaryolarını DENETİM AJANI yazar (kullanıcı kararı 03.08, çapraz-yazım kararının yerine geçti):** denetmen hiçbir ekranın kodunu yazmadı ("bilen ama yazmayan"), kaynak yine tasarım+DOMAIN. **HENÜZ BAŞLAMADI** — kullanıcı işaret edince başlar. Şeritler `e2e/`ye senaryo AÇMAZ; senaryolara itiraz/katkı `e2e/README`'deki döngüyle. **Bakım ekran sahibinde** (ekranı değiştirip testi kızartan düzeltir). Sınırların tamamı `e2e/README.md`'de.
  - **Canlı doğrulama yapıldı (03.08):** `ui:shot` 5 görüntü + konsol dökümü; duman 8/8 yeşil (iki kurulum pürüzü giderildi: dev-yoklama 15 sn, mobil profil chromium'a sabit — gerçek WebKit Kademe 3).
  - Kalan: Kademe 2 senaryo yazımı (denetim, kullanıcı işaretiyle) + müşteri OTP kod-yakalama kapısı.
  - **Kademe 1 — `pnpm ui:shot <yol>`:** ÇALIŞAN dev server'daki sayfayı açar (`reuseExistingServer` — build YOK), **desktop + mobile** (cihaz forku gereği ikisi de) ve operasyon yollarında **karanlık mod** görüntüsünü `.ui-shots/`a yazar; sayfanın konsol hatalarını da yanına döker. Amaç test değil, ajanlara GÖZ: ekran yapan şerit anlık çağırır, tasarım/fork denetimi görüntüden okunur. DB şartı yok.
  - **Kademe 2 — ~10 duman yolculuğu** (aynı kurulum, dev server'a karşı): müşteri (vitrin→ürün→sepet→checkout taslağı Stripe sınırına dek · misafir OTP · fr/de/tr rotaları · sipariş onayı) + operasyon (rol yönlendirmesi · kuyruk→hazırlık · mal kabul · para ekranı). **Veri disiplini entegrasyon testleriyle AYNI** (§4b): okuyan test seed'in deterministik satırları, yazan test damgalı veri + `purgeTestData`; **`db:refresh` hiçbir koşuda ön şart DEĞİL.** Koşu test kilidine girer (DB'ye vuruyor). Görüntüler assertion değil ARTEFAKT (piksel-diff yok — UI oynakken kırmızı gürültü üretir).
  - **Kademe 3 — ERTELENDİ (canlı öncesi):** production-build koşusu + geniş regresyon + piksel-diff kararı. Bugün kurulmaz.
  - Müşteri OTP'si için test ortamında kod-yakalama kapısı gerekir (Resend'e gitmeden) — Kademe 2'nin tek yeni parçası; tasarımı iskeleti alan şeridin.

**Modül durumu:** tamam (00.9 sonradan açıldı — araç katmanı, iskelet değil). Kabuk paketlerin bir kısmı hâlâ kabuk (`domain-core` yalnız paket sabiti taşıyor — içeriği `03`'te); iskelet görevi bu, dolduran modüller ayrı.

## Netleşecekler

- Yok — bu modül tartışmasız zemin. (CI/staging `18-operasyon-guvenlik.md`'de konuşulacak; burada kurulmaz.)
