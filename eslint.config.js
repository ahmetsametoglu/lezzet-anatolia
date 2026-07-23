import { baseConfig } from '@lezzet/eslint-config/base';

/** Kök ESLint (flat config). Paket-özel kurallar ilgili modülde eklenir. */
export default [
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/.turbo/**', '**/*.cjs', '**/next-env.d.ts', 'design/**'],
  },
  ...baseConfig,
  {
    // CLI/seed script'leri kullanıcıya konsoldan konuşur.
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
];
