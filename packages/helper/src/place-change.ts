import type { Locale } from '@lezzet/i18n';
import messages from '@lezzet/i18n/customer/cart';
import type { CartLineChange } from '@lezzet/types';
import { formatPrice } from './format';

/** Yer değişiminin tek kalemlik cümlesi; web ve native aynı değişikliği aynı cümleyle söyler. */
export function placeChangeText(change: CartLineChange, locale: Locale): string {
  const c = messages[locale].placeChange;
  switch (change.kind) {
    case 'to_shipping':
      return c.toShipping.replace('{name}', change.name);
    case 'to_route':
      return c.toRoute.replace('{name}', change.name);
    case 'unavailable':
      return c.unavailable.replace('{name}', change.name);
    case 'no_delivery':
      return c.noDelivery.replace('{name}', change.name);
    case 'reduced':
      return c.reduced.replace('{name}', change.name).replace('{qty}', String(change.qty)).replace('{max}', String(change.availableHere));
    case 'price':
      return c.price
        .replace('{name}', change.name)
        .replace('{from}', formatPrice(change.fromCents, locale))
        .replace('{to}', formatPrice(change.toCents, locale));
  }
}
