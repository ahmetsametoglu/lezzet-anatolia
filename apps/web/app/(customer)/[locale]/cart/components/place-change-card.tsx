'use client';

import type { Locale } from '@lezzet/i18n';
import { Button, focusRingClass } from '@/components/customer/ui/button';
import { Icon, type IconName } from '@/components/customer/ui/icons';
import { useCart } from '@/components/customer/cart/cart-context';
import { formatPrice } from '@/lib/storefront/format';
import type { CartLineChange } from '@/lib/cart/place-change';
import type { Messages } from '../cart-types';

/**
 * "Yer değişti" kartı: her kalemin yeni hâli tek tek söylenir, hiçbir kalem silinmez ve fark tek satıra özetlenmez, çünkü müşteri
 * hangi kalemin değiştiğini sorar. Tek eylem "Anladım"dır; tasarımdaki ikinci eylem müşteriyi zaten bulunduğu sepete götürürdü.
 */
interface PlaceChangeCardProps {
  t: Messages;
  locale: Locale;
  compact?: boolean;
}

/** Değişimin cümlesi — masaüstü kartı ve telefonun yer değişimi kutusu (`cart.mobile`) aynı cümleyi kurar. */
export function placeChangeText(change: CartLineChange, t: Messages, locale: Locale): string {
  const c = t.placeChange;
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
      return c.reduced
        .replace('{name}', change.name)
        .replace('{qty}', String(change.qty))
        .replace('{max}', String(change.availableHere));
    case 'price':
      return c.price
        .replace('{name}', change.name)
        .replace('{from}', formatPrice(change.fromCents, locale))
        .replace('{to}', formatPrice(change.toCents, locale));
  }
}

/** Değişimin simgesi: yol değişimi teslim şeklini, adet sınırı dikkati çizer. */
const KIND_ICON: Partial<Record<CartLineChange['kind'], IconName>> = { to_shipping: 'box', to_route: 'truck', reduced: 'warning', no_delivery: 'warning' };

export function PlaceChangeCard({ t, locale, compact = false }: PlaceChangeCardProps) {
  const { placeChange, dismissPlaceChange } = useCart();
  if (!placeChange || placeChange.length === 0) return null;

  const title = t.placeChange.title.replace('{n}', String(placeChange.length));
  const items = (
    <ul className="flex flex-col gap-1.5">
      {placeChange.map((change, index) => {
        const icon = KIND_ICON[change.kind];
        return (
          // Anahtar sırayla kurulur: aynı ürün adı iki kez geçebilir (aynı varyantın iki partisi)
          // ve liste zaten tek seferlik bir anlık görüntü — yeniden sıralanmıyor.
          <li key={`${change.kind}:${index}`} className="flex items-start gap-2 font-sans text-note leading-relaxed text-body">
            {icon && <Icon name={icon} size={14} className={['mt-0.75 flex-none', compact ? 'text-muted' : 'text-honey'].join(' ')} />}
            <span>{placeChangeText(change, t, locale)}</span>
          </li>
        );
      })}
    </ul>
  );

  // Mobil web: özetin üstündeki kart.
  if (compact) {
    return (
      <div className="flex flex-col gap-2 rounded-card border border-sand-300 bg-card px-3.5 py-3">
        <span className="font-serif text-card-title-sm text-ink">{title}</span>
        {items}
        <span className="font-sans text-micro leading-relaxed text-muted">{t.placeChange.note}</span>
        <Button size="sm" compact fullWidth onClick={dismissPlaceChange}>
          {t.placeChange.dismiss}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-soft border border-honey-line bg-honey-bg px-4.5 py-3.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-sans text-body-sm font-semibold text-honey">{title}</span>
        <button
          type="button"
          onClick={dismissPlaceChange}
          className={`flex-none cursor-pointer font-sans text-note font-bold text-olive transition-colors hover:text-olive-dark ${focusRingClass}`}
        >
          {t.placeChange.dismiss}
        </button>
      </div>
      {items}
      <span className="font-sans text-micro leading-relaxed text-muted">{t.placeChange.note}</span>
    </div>
  );
}
