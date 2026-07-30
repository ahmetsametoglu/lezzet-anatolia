'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import { useRouter } from '@/i18n/navigation';
import { useCart } from '@/components/customer/cart/cart-context';
import type { CustomerOrderDetail } from '@/lib/order/customer-orders';
import { reorderAction } from '../actions';
import type { Messages as ListMessages } from '../orders-types';
import type { Messages } from './detail-types';
import { DetailDesktop } from './detail.desktop';
import { DetailMobile } from './detail.mobile';

/**
 * Detay sayfasının cihaz çatalı (Sapma 3) ve tekrar sipariş sahibi.
 *
 * **Listeden farklı davranır ve bilinçli:** burada sonuç kartı GÖSTERİLMEZ, doğrudan sepete
 * gidilir. Listede müşteri birden çok siparişe bakıyordu, hangisini eklediğini görmesi gerekiyordu;
 * burada tek sipariş var ve niyet açık — araya bir onay ekranı koymak fazladan bir tıklama olurdu.
 * Eklenemeyen kalem varsa uyarı SEPETTE karşılıyor (`addMany`'nin sayacı).
 */
interface DetailClientProps {
  t: Messages;
  listT: ListMessages;
  locale: Locale;
  order: CustomerOrderDetail;
  device: Device;
}

export function DetailClient({ t, listT, locale, order, device }: DetailClientProps) {
  const cart = useCart();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onReorder = () => {
    if (busy) return;
    setBusy(true);
    void reorderAction(locale, order.id)
      .then(({ data, error }) => {
        // Hata sessiz: sayfa olduğu yerde kalır, düğme yeniden denenebilir (sunucu = gerçek).
        if (error || !data || data.entries.length === 0) return;
        cart.addMany(data.entries, data.skipped.length);
        router.push('/cart');
      })
      .finally(() => setBusy(false));
  };

  const view = { t, listT, locale, order, busy, onReorder };
  return useDevice(device) === 'mobile' ? <DetailMobile {...view} /> : <DetailDesktop {...view} />;
}
