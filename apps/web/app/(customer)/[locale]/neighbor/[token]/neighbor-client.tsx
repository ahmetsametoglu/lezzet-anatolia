'use client';

import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { NeighborDesktop } from './neighbor.desktop';
import { NeighborMobile } from './neighbor.mobile';
import type { NeighborViewProps } from './neighbor-types';

interface NeighborClientProps extends NeighborViewProps {
  device: Device;
}

export function NeighborClient({ device, ...view }: NeighborClientProps) {
  return useDevice(device) === 'mobile' ? <NeighborMobile {...view} /> : <NeighborDesktop {...view} />;
}
