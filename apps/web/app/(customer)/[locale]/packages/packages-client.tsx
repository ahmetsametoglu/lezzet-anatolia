'use client';

import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { PackagesDesktop } from './packages.desktop';
import { PackagesMobile } from './packages.mobile';
import type { PackagesViewProps } from './packages-types';

interface PackagesClientProps extends PackagesViewProps {
  device: Device;
}

export function PackagesClient({ device, ...view }: PackagesClientProps) {
  const resolved = useDevice(device);
  return resolved === 'mobile' ? <PackagesMobile {...view} /> : <PackagesDesktop {...view} />;
}
