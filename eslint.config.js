import { baseConfig } from '@lezzet/eslint-config/base';

/** Kök ESLint (flat config). Paket-özel kurallar ilgili modülde eklenir. */
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/*.cjs',
      '**/next-env.d.ts',
      'design/**',
      // Test çıktıları ve Playwright rapor artefaktları (04.08). Klasör `.gitignore`'daydı ama
      // eslint'te değildi: bir e2e koşusundan sonra rapordaki paketlenmiş JS lint'e giriyor ve
      // `pnpm lint` ÜÇ ŞERİT İÇİN BİRDEN kırmızıya dönüyordu — üstelik kaynak kodda hiçbir hata
      // yokken. Üretilmiş dosya denetlenmez.
      '.test-results/**',
    ],
  },
  ...baseConfig,
  {
    // CLI/seed script'leri kullanıcıya konsoldan konuşur; Node ortamında koşarlar.
    //
    // Sözlük ELLE sayılıyor, yani her yeni küresel `no-undef` ile lint kapısını kırıyor — ve kapı
    // üç şeride birden kapanıyor. **İkinci kez yaşandı (03.08):** önce test koşucusunun
    // `setTimeout`'u, sonra `ui-shot.mjs`'in `fetch`/`AbortSignal`'i. İkisi de kod hatası değildi.
    //
    // Aynı sınıf hata iki kez çıktığına göre elle sayım artık ucuz değil: **üçüncüde `globals.node`
    // sözlüğüne geçilmeli** (`eslint-config` paketine bağımlılık ekler, o yüzden bugün eklenmedi).
    files: ['scripts/**/*.{ts,mjs}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },
  {
    /**
     * `console`'un MEŞRU kaldığı yerler (18.5 · `OBSERVABILITY §2`). İkisi de aynı sebeple:
     * `pino` node-only ve bu dosyalar Node dışında çalışıyor.
     *
     * - **İstemci hata sınırları** (`error.tsx`, `global-error.tsx`) ve Stripe öğesi: tarayıcıda
     *   koşarlar, `pino` derlemeyi kırar.
     * - **`instrumentation.ts`**: edge çalışma zamanı için de derleniyor; oradaki dal `console`'a
     *   düşmek zorunda (dosyanın kendi künyesinde gerekçesi yazılı).
     *
     * Liste **tek tek** yazılır, dizin kalıbıyla değil: yeni bir muafiyet buraya bir satır eklemeyi
     * ve bu yorumu okumayı gerektirsin. Açık uçlu bir muafiyet kuralı bir yıl içinde geri alırdı.
     */
    files: [
      'apps/web/app/global-error.tsx',
      'apps/web/app/**/error.tsx',
      // NOT: yol `[locale]` içeriyor ve köşeli parantez glob'da KARAKTER SINIFIDIR — birebir yol
      // yazmak eşleşmez. Dosya adıyla eşleştiriliyor.
      'apps/web/app/**/payment-element.tsx',
      'apps/web/instrumentation.ts',
    ],
    rules: { 'no-console': 'off' },
  },
];
