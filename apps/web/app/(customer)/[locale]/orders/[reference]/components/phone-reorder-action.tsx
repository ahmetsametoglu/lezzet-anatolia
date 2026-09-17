'use client';

import type { Locale } from '@lezzet/i18n';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import reorderCopy from '../../components/reorder-messages.json';
import { useReorder } from '../../use-reorder.hook';

/** Telefonun sipariş başlığındaki tekrar sipariş; çerçevesiz, çünkü başlığın sağ yuvası metin eylemi taşır. */
interface PhoneReorderActionProps {
  locale: Locale;
  orderId: string;
}

export function PhoneReorderAction({ locale, orderId }: PhoneReorderActionProps) {
  const t = reorderCopy[locale];
  const { busy, reorder } = useReorder(locale, orderId);
  return <TextAction label={busy ? t.reordering : t.reorder} onClick={reorder} disabled={busy} />;
}
