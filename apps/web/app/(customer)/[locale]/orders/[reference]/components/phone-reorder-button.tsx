'use client';

import type { Locale } from '@lezzet/i18n';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import reorderCopy from '../../components/reorder-messages.json';
import { useReorder } from '../../use-reorder.hook';

interface PhoneReorderButtonProps {
  locale: Locale;
  orderId: string;
}

export function PhoneReorderButton({ locale, orderId }: PhoneReorderButtonProps) {
  const t = reorderCopy[locale];
  const { busy, reorder } = useReorder(locale, orderId);
  return <PrimaryButton shape="block" label={busy ? t.reordering : t.placeAgain} onClick={reorder} disabled={busy} />;
}
