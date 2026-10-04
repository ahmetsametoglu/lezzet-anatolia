'use client';

import type { Locale } from '@lezzet/i18n';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import ordersShared from '@lezzet/i18n/customer/orders';
import { useReorder } from '../../use-reorder.hook';

interface PhoneReorderButtonProps {
  locale: Locale;
  orderId: string;
}

export function PhoneReorderButton({ locale, orderId }: PhoneReorderButtonProps) {
  const t = ordersShared[locale].reorder;
  const { busy, reorder } = useReorder(locale, orderId);
  return <PrimaryButton shape="block" label={busy ? t.working : t.placeAgain} onClick={reorder} disabled={busy} />;
}
