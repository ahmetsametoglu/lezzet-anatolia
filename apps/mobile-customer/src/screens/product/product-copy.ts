import type { LocalizedCopy } from '@lezzet/i18n';
import type messages from '@lezzet/i18n/customer/product';

export type Messages = LocalizedCopy<typeof messages>;

/** `{price}` gibi tekil yer tutucuları doldurur — sayfanın tüm şablonları tek anahtarlı. */
export function fill(template: string, key: string, value: string): string {
  return template.replace(`{${key}}`, value);
}
