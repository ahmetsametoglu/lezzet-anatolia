'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { useCart } from '@/components/customer/cart/cart-context';
import { useToast } from '@/components/customer/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { reorderAction } from './actions';
import ordersCopy from './messages.json';

/**
 * Siparişin kalemlerini sepete ekleyip sepete götürür; sepete istemci yazar, çünkü misafir sepeti tarayıcıda yaşar ve sunucu yazsa
 * ekrandaki sayı eski kalırdı. Hiçbir kalem eklenemezse sepete gidilmez, çünkü boş sepet olmayan bir başarıyı gösterir.
 */
export function useReorder(locale: Locale, orderId: string) {
  const cart = useCart();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const t = ordersCopy[locale].reorderResult;

  const reorder = () => {
    if (busy) return;
    setBusy(true);
    // Sepete geçerken düğme meşgul kalır, çünkü sayfa değişene kadar ikinci basış kalemleri yeniden eklerdi.
    let leaving = false;
    void reorderAction(locale, orderId)
      .then(({ data, errorKey }) => {
        if (errorKey || !data) return;
        if (data.entries.length === 0) {
          toast(t.none);
          return;
        }
        cart.addMany(data.entries, data.skipped.length);
        // Bildirim sayfa değişmeden verilir; hap yerleşimde yaşadığı için sepette de görünür.
        toast(
          data.skipped.length > 0
            ? t.skipped.replace('{count}', String(data.skipped.length)).replace('{names}', data.skipped.join(', '))
            : t.addedToast,
        );
        leaving = true;
        router.push('/cart');
      })
      .finally(() => {
        if (!leaving) setBusy(false);
      });
  };

  return { busy, reorder };
}
