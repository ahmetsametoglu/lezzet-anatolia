'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { useCart } from '@/components/customer/cart/cart-context';
import { useRouter } from '@/i18n/navigation';
import { reorderAction } from './actions';

/**
 * Siparişin kalemlerini sepete ekleyip sepete götürür; sepete istemci yazar, çünkü misafir sepeti tarayıcıda yaşar ve sunucu yazsa
 * ekrandaki sayı eski kalırdı. Hiçbir kalem eklenemezse sepete gidilmez, çünkü boş sepet olmayan bir başarıyı gösterir.
 */
export function useReorder(locale: Locale, orderId: string) {
  const cart = useCart();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const reorder = () => {
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

  return { busy, reorder };
}
