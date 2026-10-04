'use client';

import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { Icon } from '@/components/customer/ui/icons';
import { useReorder } from '../use-reorder.hook';
import ordersShared from '@lezzet/i18n/customer/orders';
import ordersCopy from '../messages.json';

/**
 * Düğme durumunu kendi taşır, çünkü detay sayfasında sunucuda çizilen başlığın içinde duruyor. Kelimeler de burada, çünkü aynı iki
 * kelime birden çok yerde çiziliyor ve tek kaynaktan okunmalı.
 */
interface ReorderButtonProps {
  locale: Locale;
  orderId: string;
}

export function ReorderButton({ locale, orderId }: ReorderButtonProps) {
  const { busy, reorder } = useReorder(locale, orderId);

  return (
    <Button variant="outlineOlive" size="sm" disabled={busy} onClick={reorder} className="flex-none">
      {!busy && <Icon name="refresh" size={14} />}
      {busy ? ordersShared[locale].reorder.working : ordersCopy[locale].reorder}
    </Button>
  );
}
