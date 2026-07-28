import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Monorepo geneli tek test yapılandırması. İki tür test:
//   • Birim (saf fonksiyon — slug, domain-core): DB'siz, hızlı.
//   • Entegrasyon (servisler): local Supabase'e vurur (pnpm db:start gerekli).
// Entegrasyon testleri aynı satırlara girmesin diye dosya paralelliği kapalı (suite küçük;
// gerekirse ileride birim/entegrasyon ayrı project'lere bölünür).
export default defineConfig({
  // `@/…` — apps/web'in tsconfig takma adı. Test koşucusu bunu bilmezse web tarafındaki saf
  // fonksiyonlar (yönlendirme kararı gibi) yalnız göreli yolla test edilebilirdi.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./apps/web', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'apps/*/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    fileParallelism: false,
  },
});
