'use client';

import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { UnsubscribeDesktop } from './unsubscribe.desktop';
import { UnsubscribeMobile } from './unsubscribe.mobile';
import type { UnsubscribeViewProps } from './unsubscribe-types';

interface UnsubscribeClientProps extends UnsubscribeViewProps {
  device: Device;
}

export function UnsubscribeClient({ device, ...view }: UnsubscribeClientProps) {
  return useDevice(device) === 'mobile' ? <UnsubscribeMobile {...view} /> : <UnsubscribeDesktop {...view} />;
}
