import type { ReactNode } from 'react';
import { Icon } from '@/components/customer/ui/icons';

/**
 * Teslim şeridi — v1 adres penceresinin "Adres doğrulandı" kutusundaki alt satır (13.09): krem zemin,
 * teslim şeklinin ikonu (kapıya teslim → kamyon, zeytin · kargo → koli, nötr) ve cümle.
 *
 * İki yerde aynı şerit: adres penceresinin doğrulama kutusu ve sepetin adres kartı (14.09; yer
 * penceresinin sonuç satırı pencereyle birlikte kalktı). İki kopya bir gün iki ayrı dil konuşurdu.
 */
interface DeliveryStripProps {
  inRoute: boolean;
  /** Bu adrese hiçbir yoldan gönderilemiyor (14.09) — uyarı ikonu, bal tonu; `inRoute` o zaman okunmaz. */
  unreachable?: boolean;
  /**
   * Zemin — `cream` pencerelerin kutusunda; `deep` sepetin adres kartında, çünkü orada şeridin
   * altı beyaz kart ve seçili olmayan adres kartları zaten krem (v1 bu şeridi `#f0e9d6` çiziyor).
   */
  tone?: 'cream' | 'deep';
  children: ReactNode;
}

export function DeliveryStrip({ inRoute, unreachable = false, tone = 'cream', children }: DeliveryStripProps) {
  return (
    <div
      className={[
        'flex items-start gap-2 rounded-xl px-3 py-2.25 font-sans text-note leading-normal font-semibold',
        tone === 'deep' ? 'bg-cream-deep' : 'bg-cream',
        unreachable ? 'text-honey' : 'text-body',
      ].join(' ')}
    >
      <Icon
        name={unreachable ? 'warning' : inRoute ? 'truck' : 'box'}
        size={15}
        className={['mt-0.5 flex-none', unreachable ? 'text-honey' : inRoute ? 'text-olive-dark' : 'text-body'].join(' ')}
      />
      <span className="flex flex-col gap-0.5">{children}</span>
    </div>
  );
}
