import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Monorepo geneli test yapılandırması — **iki proje**, çünkü iki farklı gerçek var:
//
//   • `unit`        — DB'siz saf fonksiyonlar (motor, yardımcılar, şablonlar). PARALEL koşar,
//                     saniyeler sürer. Kurulumu `.env` yüklemez ve DB env'ini siler: yanlış
//                     projeye düşen bir test sessizce değil, anlaşılır bir istisnayla patlar.
//   • `integration` — yerel Supabase'e vuran servisler ve kapılar. SERİ koşar (aynı satırlara
//                     girerler) ve tam paket kilit altında çalışır (`pnpm test`).
//
// **Neden bölündü (29.07):** 104 dosyanın 52'si DB'ye vuruyor ve `fileParallelism: false` hepsini
// birden yavaşlatıyordu — oysa saf yarının asıl test süresi 224 ms, kalanı kurulum ve sıra bekleme.
// Ayrıca üç ajan aynı yerel veritabanını paylaşıyor; ayrım olmadan her koşu ötekini kirletme
// riskini taşıyordu.
//
// **Sınır dizinle çizilir, isimle değil:** 52 dosyayı yeniden adlandırmak diğer ajanların işine
// dokunurdu. `apps/web/lib`, `packages/database` ve `apps/backend` entegrasyon kökleridir; oradaki
// birkaç saf dosyanın seri koşması ihmal edilebilir bir bedeldir.
const alias = {
  // `@/…` — apps/web'in tsconfig takma adı. Test koşucusu bunu bilmezse web tarafındaki saf
  // fonksiyonlar (yönlendirme kararı gibi) yalnız göreli yolla test edilebilirdi.
  // `server-only` bir PAKETLEYİCİ korumasıdır: "bu modül istemci paketine girmesin" der ve
  // içeri girildiğinde fırlatır. Node test koşucusunda istemci paketi diye bir şey yok, dolayısıyla
  // koruma yalnız sunucu okumalarının test edilmesini engelliyordu. Boş modüle bağlanır — koruma
  // gerçek yerinde (Next derlemesi) aynen durur.
  '@': fileURLToPath(new URL('./apps/web', import.meta.url)),
  'server-only': fileURLToPath(new URL('./vitest.server-only.ts', import.meta.url)),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'packages/domain-core/src/**/*.test.ts?(x)',
            'packages/helper/src/**/*.test.ts?(x)',
            'packages/types/src/**/*.test.ts?(x)',
            'packages/storage/src/**/*.test.ts?(x)',
            'packages/notify/src/**/*.test.ts?(x)',
            'packages/email/src/**/*.test.ts?(x)',
            'packages/brand/src/**/*.test.ts?(x)',
            'packages/i18n/src/**/*.test.ts?(x)',
            'apps/web/app/**/*.test.ts?(x)',
            'apps/web/components/**/*.test.ts?(x)',
          ],
          setupFiles: ['./vitest.setup.unit.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['apps/web/lib/**/*.test.ts?(x)', 'packages/database/src/**/*.test.ts?(x)', 'apps/backend/src/**/*.test.ts?(x)'],
          setupFiles: ['./vitest.setup.ts'],
          // Aynı satırlara giren testler paralel koşamaz; suite küçük, seri kalması sorun değil.
          fileParallelism: false,
        },
      },
    ],
  },
});
