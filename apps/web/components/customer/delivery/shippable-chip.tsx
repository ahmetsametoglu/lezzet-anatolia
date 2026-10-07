'use client';

import { FilterChip } from '@/components/customer/ui/filter-controls';
import { Icon } from '@/components/customer/ui/icons';
import type { CatalogHref } from '@/app/(customer)/[locale]/catalog/catalog-types';
import { shippableChipOf } from '@/lib/delivery/place-filter';
import type { PlaceMode } from '@/lib/delivery/read-place';
import { useDeliveryPlace } from './place-context';

/**
 * Çip adres hakkında soru sorar, cevabı da adrese bağlıdır (kural `lib/delivery/place-filter.ts`te); kod yokken süzgeç değil davettir
 * ve başlıktaki yer sorusunu açar. Bölge içinde çizilmez, çünkü eleyecek bir şey yoktur; bölge dışında gerçekten süzer.
 */
interface ShippableChipProps {
  mode: PlaceMode;
  label: string;
  /** Yer sorulacağı hâlde çipin metni — "adresinizi girin" gibi bir davet (çağıranın sözlüğünden). */
  askLabel: string;
  href: CatalogHref;
  active: boolean;
  compact?: boolean;
}

export function ShippableChip({ mode, label, askLabel, href, active, compact = false }: ShippableChipProps) {
  const { setPanelOpen } = useDeliveryPlace();
  const kind = shippableChipOf(mode);

  if (kind === 'hidden') return null;

  if (kind === 'ask') {
    return (
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className={[
          'inline-flex cursor-pointer items-center gap-1.5 rounded-pill border-[1.5px] border-dashed border-sand-400 bg-card font-sans font-bold text-muted transition-colors hover:border-olive hover:text-olive',
          compact ? 'px-3 py-1.5 text-micro' : 'px-4 py-2 text-note',
        ].join(' ')}
      >
        <Icon name="pin" size={compact ? 12 : 14} />
        {askLabel}
      </button>
    );
  }

  return <FilterChip label={label} href={href} active={active} tone="place" size="control" compact={compact} icon="pin" />;
}
