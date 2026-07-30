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
      // **`console` YASAK, `logger` var** (18.5 · `OBSERVABILITY §2`). Eskiden `warn`/`error`
      // serbestti ve 17 çıplak çağrı tam bu boşluktan birikti: her biri farklı biçimde yazılmış,
      // hiçbiri aranabilir değil, hiçbiri `error_log`'a düşmüyor. Kural artık lint'te — akılda
      // tutulması gereken bir şey olmaktan çıktı.
      //
      // Meşru istisnalar kök `eslint.config.js`'te TEK TEK yazılır (istemci komponentleri, CLI
      // script'leri): açık uçlu bir muafiyet, kuralı bir yıl içinde geri alırdı.
      'no-console': 'error',
    },
  },
];
