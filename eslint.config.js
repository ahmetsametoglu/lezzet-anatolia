import { baseConfig } from '@lezzet/eslint-config/base';

/** Kök ESLint (flat config). Paket-özel kurallar ilgili modülde eklenir. */
export default [
  {
    // Üretilmiş ya da depoya girmeyen dosyalar denetlenmez; içlerindeki paketlenmiş JS kaynakta hata yokken lint'i kırmızıya çevirir.
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.next-prod/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/*.cjs',
      '**/next-env.d.ts',
      'design/**',
      '.test-results/**',
      '**/android/**',
      '**/ios/**',
      'temp/**',
    ],
  },
  ...baseConfig,
  {
    // Betikler kullanıcıya konsoldan konuşur ve Node'da koşar. Küreseller elle sayılır; yenisi `no-undef` ile lint'i kırar.
    files: ['**/scripts/**/*.{ts,mjs}'],
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
     * `console`'un kaldığı yerler: hata sınırları tarayıcıda, `instrumentation.ts` edge'de de derlenir ve `pino` yalnız Node'da çalışır.
     * Liste tek tek yazılır ki yeni muafiyet bilinçli bir satır olsun.
     */
    files: ['apps/web/app/global-error.tsx', 'apps/web/app/**/error.tsx', 'apps/web/instrumentation.ts'],
    rules: { 'no-console': 'off' },
  },
];
