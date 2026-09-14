import type { ReactNode } from 'react';
import { Icon } from '@/components/customer/ui/icons';

/**
 * Teslim şeridi — v1 adres penceresinin "Adres doğrulandı" kutusundaki alt satır (13.09): krem zemin,
 * teslim şeklinin ikonu (kapıya teslim → kamyon, zeytin · kargo → koli, nötr) ve cümle.
 *
 * İki yerde aynı şerit: adres penceresinin doğrulama kutusu ve yer penceresinin sonuç satırı
 * (`PlaceLookupResults`). İki kopya bir gün iki ayrı dil konuşurdu.
 */
interface DeliveryStripProps {
  inRoute: boolean;
  children: ReactNode;
}

export function DeliveryStrip({ inRoute, children }: DeliveryStripProps) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-cream px-3 py-2.25 font-sans text-note leading-normal font-semibold text-body">
      <Icon name={inRoute ? 'truck' : 'box'} size={15} className={['mt-0.5 flex-none', inRoute ? 'text-olive-dark' : 'text-body'].join(' ')} />
      <span className="flex flex-col gap-0.5">{children}</span>
    </div>
  );
}
