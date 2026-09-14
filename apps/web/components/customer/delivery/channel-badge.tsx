'use client';

import type { Locale } from '@lezzet/i18n';
import { Badge } from '@/components/customer/ui/badge';
import { Icon } from '@/components/customer/ui/icons';
import { useDeliveryPlace } from './place-context';
import messages from './place-messages.json';

/**
 * Teslim şekli rozeti — bir posta kodunun bize göre cevabı: kapıya teslim (kamyon, zeytin) ya da
 * kargo (koli, nötr). v1'de iki yerde: yer panelinin adres kartı ve adres penceresinin öneri satırı
 * (13.09). Karar bağlamın bölge listesinden (`zones` — sayfa açılırken okundu), sunucuya sorulmaz.
 */
interface ChannelBadgeProps {
  postalCode: string;
  locale: Locale;
}

export function ChannelBadge({ postalCode, locale }: ChannelBadgeProps) {
  const t = messages[locale];
  const { zones } = useDeliveryPlace();
  const door = zones.some((zone) => zone.postalCodes.includes(postalCode));
  return (
    <Badge tone={door ? 'positive' : 'closed'} variant="outline">
      <span className="inline-flex items-center gap-1.5">
        <Icon name={door ? 'truck' : 'box'} size={12} />
        {door ? t.channelDoor : t.channelShip}
      </span>
    </Badge>
  );
}
