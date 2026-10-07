'use client';

import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { FeedbackDesktop } from './feedback.desktop';
import { FeedbackMobile } from './feedback.mobile';
import type { FeedbackViewProps } from './feedback-types';

interface FeedbackClientProps extends FeedbackViewProps {
  device: Device;
}

export function FeedbackClient({ device, ...view }: FeedbackClientProps) {
  return useDevice(device) === 'mobile' ? <FeedbackMobile {...view} /> : <FeedbackDesktop {...view} />;
}
