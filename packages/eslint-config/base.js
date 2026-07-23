import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Ortak ESLint tabanı (flat config). TS önerileri + birkaç sıkı kural.
 * Prettier biçimlendirmeyi devralır; burada stil kuralı tutmuyoruz.
 */
export const baseConfig = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
];
