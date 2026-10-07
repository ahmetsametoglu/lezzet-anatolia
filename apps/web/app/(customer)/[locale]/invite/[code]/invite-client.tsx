'use client';

import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { InviteDesktop } from './invite.desktop';
import { InviteMobile } from './invite.mobile';
import type { InviteViewProps } from './invite-types';

interface InviteClientProps extends InviteViewProps {
  device: Device;
}

export function InviteClient({ device, ...view }: InviteClientProps) {
  return useDevice(device) === 'mobile' ? <InviteMobile {...view} /> : <InviteDesktop {...view} />;
}
