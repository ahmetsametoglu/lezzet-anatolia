import 'server-only';
import { serviceDb } from '@lezzet/database';
import { getCartView as getCartViewFor, type CartEntry, type CartView } from '@lezzet/application';
import type { Locale } from '@lezzet/i18n';
import { getPackagesByIds } from '@/lib/storefront/packages';

/**
 * Sepet okumasının web köprüsü: gövde `@lezzet/application/cart/read`tedir, burada yalnız web'e özgü iki bağ kurulur, `serviceDb()` ve
 * paket kapısı (`bundles`). Paket kapısı geçilmeseydi paket satırı sepette engelli görünürdü.
 */
export function getCartView(
  locale: Locale,
  entries: readonly CartEntry[],
  opts: Omit<Parameters<typeof getCartViewFor>[3], 'bundles'>,
): Promise<CartView> {
  return getCartViewFor(serviceDb(), locale, entries, { ...opts, bundles: getPackagesByIds });
}
