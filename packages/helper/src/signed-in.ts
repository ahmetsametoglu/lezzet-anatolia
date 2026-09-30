import type { Locale } from '@lezzet/i18n';
import messages from '@lezzet/i18n/customer/cart';

/**
 * Sepetin kimlik bandının cümlesi; web ve native aynı cümleyi kurar. Giriş e-postayla yapıldığı için "bu siz misiniz" sorusunu
 * e-posta cevaplar, e-posta yoksa kimliksiz cümle yazılır ki yer tutucu ekrana çıkmasın.
 */
export function signedInText(email: string | null | undefined, locale: Locale): string {
  const copy = messages[locale].account;
  const mail = email?.trim();
  return mail ? copy.as.replace('{email}', mail) : copy.anon;
}
