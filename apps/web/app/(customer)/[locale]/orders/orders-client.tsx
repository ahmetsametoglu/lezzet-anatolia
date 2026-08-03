'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { useCart } from '@/components/customer/cart/cart-context';
import type { CustomerOrderPage, CustomerOrderSummary } from '@/lib/order/customer-orders';
import { loadMoreOrdersAction, reorderAction } from './actions';
import type { Messages, ReorderNotice } from './orders-types';
import { OrdersDesktop } from './orders.desktop';
import { OrdersMobile } from './orders.mobile';

/**
 * Siparişler sayfasının cihaz çatalı (Sapma 3) ve **durum sahibi**: sayfalama imleci + tekrar
 * sipariş sonucu. İki görünüm de aynı durumu okur — mantığı ikiye kopyalamak, bir gün ayrışan iki
 * davranış demekti.
 *
 * **Tekrar sipariş sepete BURADAN yazılır**, action'dan değil: sepet ziyaretçide tarayıcıda,
 * girişli müşteride sunucuda yaşıyor ve ikisini `CartProvider` birleştiriyor. Sunucu doğrudan
 * yazsaydı ekrandaki sepet sayısı eski kalırdı. Boş sepetteki "hepsini sepete al" da aynı kapıyı
 * (`addMany`) kullanıyor.
 */
interface OrdersClientProps {
  t: Messages;
  locale: Locale;
  first: CustomerOrderPage;
  device: Device;
}

export function OrdersClient({ t, locale, first, device }: OrdersClientProps) {
  const cart = useCart();
  const [extra, setExtra] = useState<CustomerOrderSummary[]>([]);
  const [cursor, setCursor] = useState(first.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [notice, setNotice] = useState<ReorderNotice | null>(null);

  const orders = [...first.orders, ...extra];

  const onLoadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    void loadMoreOrdersAction(locale, cursor)
      .then(({ data: page, errorKey }) => {
        // Hata sessiz: liste olduğu yerde kalır, tetikleyici yeniden denenebilir (sunucu = gerçek).
        if (errorKey || !page) return;
        setExtra((prev) => [...prev, ...page.orders]);
        setCursor(page.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  };

  const onReorder = (orderId: string) => {
    if (busyOrderId) return;
    setBusyOrderId(orderId);
    setNotice(null);
    void reorderAction(locale, orderId)
      .then(({ data, errorKey }) => {
        if (errorKey || !data) return;
        // Eklenemeyen sayısı sepete de geçer: müşteri sepete gittiğinde uyarı orada da durur
        // (boş sepetten "hepsini al" akışında kurulan davranışın aynısı).
        if (data.entries.length > 0) cart.addMany(data.entries, data.skipped.length);
        setNotice({ orderId, added: data.entries.length, skipped: data.skipped });
      })
      .finally(() => setBusyOrderId(null));
  };

  const view = {
    t,
    locale,
    orders,
    nextCursor: cursor,
    loadingMore,
    onLoadMore,
    busyOrderId,
    onReorder,
    notice,
    onDismissNotice: () => setNotice(null),
  };

  return useDevice(device) === 'mobile' ? <OrdersMobile {...view} /> : <OrdersDesktop {...view} />;
}
