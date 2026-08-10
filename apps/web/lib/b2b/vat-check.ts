import 'server-only';

/**
 * **KÖPRÜ (21.31)** — gövde `@lezzet/application/b2b/vat-check`e taşındı; gerekçe ve üç değerli
 * sonucun (`true` · `false` · `null` = sorulamadı) künyesi orada.
 *
 * `company-registry.ts` köprüsüyle aynı kural: `server-only` webin kendi kapısı olarak kalır,
 * paket iki taşımayı da besler.
 */
export { checkEuVatNumber } from '@lezzet/application';
