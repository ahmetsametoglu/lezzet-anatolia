'use client';

import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { DeliveryZonesDesktop } from './delivery-zones.desktop';
import { DeliveryZonesMobile } from './delivery-zones.mobile';
import type { DeliveryZonesViewProps } from './delivery-zones-types';

interface DeliveryZonesClientProps extends DeliveryZonesViewProps {
  device: Device;
}

export function DeliveryZonesClient({ device, ...view }: DeliveryZonesClientProps) {
  const resolved = useDevice(device);
  return resolved === 'mobile' ? <DeliveryZonesMobile {...view} /> : <DeliveryZonesDesktop {...view} />;
}
