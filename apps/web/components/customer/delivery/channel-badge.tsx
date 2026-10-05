'use client';

import { deliveryChannelOf } from '@lezzet/domain-core';
import type { Locale } from '@lezzet/i18n';
import { Badge } from '@/components/customer/ui/badge';
import { Icon } from '@/components/customer/ui/icons';
import { useDeliveryPlace } from './place-context';
import messages from './place-messages.json';

/**
 * Teslim şekli rozeti, bir posta kodunun görüntüleyenin işine göre cevabı: kendi işinin bölgesindeyse kapıya teslim (kamyon, zeytin),
 * değilse kargo (koli, nötr). Karar sayfa açılırken okunan bölge listesinden çıkar (`deliveryChannelOf`), sunucuya sorulmaz.
 */
interface ChannelBadgeProps {
  postalCode: string;
  locale: Locale;
}

export function ChannelBadge({ postalCode, locale }: ChannelBadgeProps) {
  const t = messages[locale];
  const { zones, business } = useDeliveryPlace();
  const channel = deliveryChannelOf(postalCode, zones, business);
  // Teslim edilemeyeceğini sepet ve ödeme söyler; rozet olmayan bir teslim şeklini vaat etmez.
  if (!channel) return null;
  const door = channel === 'door';
  return (
    <Badge tone={door ? 'positive' : 'closed'} variant="outline">
      <span className="inline-flex items-center gap-1.5">
        <Icon name={door ? 'truck' : 'box'} size={12} />
        {door ? t.channelDoor : t.channelShip}
      </span>
    </Badge>
  );
}
