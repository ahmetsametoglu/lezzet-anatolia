import { baseConfig } from '@lezzet/eslint-config/base';

/** Kök ESLint (flat config). Paket-özel kurallar ilgili modülde eklenir. */
export default [
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/.turbo/**', '**/*.cjs', '**/next-env.d.ts', 'design/**'],
  },
  ...baseConfig,
  {
    // CLI/seed script'leri kullanıcıya konsoldan konuşur; Node ortamında koşarlar.
    //
    // Zamanlayıcılar da Node küresellerinin parçası: sözlük elle sayıldığı için her yeni küresel
    // `no-undef` ile patlıyor (yaşandı 03.08 — test koşucusunun `setTimeout`'u lint kapısını
    // kırdı). Elle sayım kısa listede ucuz; büyürse `globals.node` sözlüğüne geçilir.
    files: ['scripts/**/*.{ts,mjs}'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly' },
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
