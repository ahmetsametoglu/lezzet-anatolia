import 'server-only';
import { planReorder as planReorderFor, type ReorderPlan } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import type { Locale } from '@lezzet/i18n';
import { getCartView } from '@/lib/cart/read';
import { readPlaceScope } from '@/lib/delivery/read-place';

/** Web köprüsü: kural `@lezzet/application`da, mobil aynı kapıyı numarayla çağırır; web'de yer çerezden okunur. */
export async function planReorder(locale: Locale, customerId: string, orderId: string): Promise<ReorderPlan | null> {
  const scope = await readPlaceScope();
  return planReorderFor(serviceDb(), { customerId, locale, lookup: { orderId }, viewOf: (entries) => getCartView(locale, entries, scope) });
}
