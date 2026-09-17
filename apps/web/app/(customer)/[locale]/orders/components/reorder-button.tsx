'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { Icon } from '@/components/customer/ui/icons';
import { useCart } from '@/components/customer/cart/cart-context';
import { useRouter } from '@/i18n/navigation';
import { reorderAction } from '../actions';
import reorderCopy from './reorder-messages.json';

/**
 * Düğme durumunu kendi taşır, çünkü detay sayfasında sunucuda çizilen başlığın içinde duruyor. Kelimeler de burada, çünkü aynı iki
 * kelime birden çok yerde çiziliyor ve tek kaynaktan okunmalı.
 */
interface ReorderButtonProps {
  locale: Locale;
  orderId: string;
  fullWidth?: boolean;
}

export function ReorderButton({ locale, orderId, fullWidth }: ReorderButtonProps) {
  const t = reorderCopy[locale];
  const cart = useCart();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = () => {
    if (busy) return;
    setBusy(true);
    void reorderAction(locale, orderId)
      .then(({ data, errorKey }) => {
        if (errorKey || !data || data.entries.length === 0) return;
        cart.addMany(data.entries, data.skipped.length);
        router.push('/cart');
      })
      .finally(() => setBusy(false));
  };

  return (
    <Button variant="outlineOlive" size="sm" fullWidth={fullWidth} disabled={busy} onClick={onClick} className={fullWidth ? '' : 'flex-none'}>
      {!busy && <Icon name="refresh" size={14} />}
      {busy ? t.reordering : t.reorder}
    </Button>
  );
}
