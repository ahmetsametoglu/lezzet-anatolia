'use client';

import { placeChangeText } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import cartMessages from '@lezzet/i18n/customer/cart';
import type { CartLineChange } from '@lezzet/types';
import { focusRingClass } from '@/components/customer/ui/button';
import { Icon, type IconName } from '@/components/customer/ui/icons';
import { useCart } from '@/components/customer/cart/cart-context';

/**
 * "Yer değişti" kartı: her kalemin yeni hâli tek tek söylenir, hiçbir kalem silinmez ve fark tek satıra özetlenmez, çünkü müşteri
 * hangi kalemin değiştiğini sorar. Tek eylem "Anladım"dır; tasarımdaki ikinci eylem müşteriyi zaten bulunduğu sepete götürürdü.
 */
interface PlaceChangeCardProps {
  locale: Locale;
}

/** Değişimin simgesi: yol değişimi teslim şeklini, adet sınırı dikkati çizer. */
const KIND_ICON: Partial<Record<CartLineChange['kind'], IconName>> = { to_shipping: 'box', to_route: 'truck', reduced: 'warning', no_delivery: 'warning' };

export function PlaceChangeCard({ locale }: PlaceChangeCardProps) {
  const { placeChange, dismissPlaceChange } = useCart();
  if (!placeChange || placeChange.length === 0) return null;
  const copy = cartMessages[locale].placeChange;

  return (
    <div className="flex flex-col gap-2 rounded-soft border border-honey-line bg-honey-bg px-4.5 py-3.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-sans text-body-sm font-semibold text-honey">{copy.title.replace('{n}', String(placeChange.length))}</span>
        <button
          type="button"
          onClick={dismissPlaceChange}
          className={`flex-none cursor-pointer font-sans text-note font-bold text-olive transition-colors hover:text-olive-dark ${focusRingClass}`}
        >
          {copy.dismiss}
        </button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {placeChange.map((change, index) => {
          const icon = KIND_ICON[change.kind];
          return (
            // Anahtar sırayla kurulur: aynı ürün adı iki kez geçebilir (aynı varyantın iki partisi)
            // ve liste zaten tek seferlik bir anlık görüntü — yeniden sıralanmıyor.
            <li key={`${change.kind}:${index}`} className="flex items-start gap-2 font-sans text-note leading-relaxed text-body">
              {icon && <Icon name={icon} size={14} className="mt-0.75 flex-none text-honey" />}
              <span>{placeChangeText(change, locale)}</span>
            </li>
          );
        })}
      </ul>
      <span className="font-sans text-micro leading-relaxed text-muted">{copy.note}</span>
    </div>
  );
}
