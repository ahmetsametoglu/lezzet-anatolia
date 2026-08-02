'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import { loadMorePurchaseOrdersAction } from './actions';
import { ProcurementDesktop } from './procurement.desktop';
import { ProcurementMobile } from './procurement.mobile';
import { procurementUrl, type ProcurementTab, type ProcurementUrlState } from './procurement-url';
import type { ProcurementData, PurchaseOrderRowView } from './procurement-types';

// Tedarik ekranı client kökü (Sapma 3): durum burada, sunum web/mobil olarak çatallanır.
// SEKME GERÇEK gezinmedir: okuma sunucuda sekmeye bağlı — sığ yazsaydık öteki sekme boş açılırdı.

interface ProcurementClientProps {
  data: ProcurementData;
  device: Device;
  urlState: ProcurementUrlState;
}

export function ProcurementClient({ data, device, urlState }: ProcurementClientProps) {
  const resolvedDevice = useDevice(device);
  const router = useRouter();
  // Sekme turu sürerken ekran karşılık vermeli (09.2 navPending dersi): içerik soluklaşır.
  const [pending, startNav] = useTransition();

  const onTab = (tab: ProcurementTab) => {
    startNav(() => router.replace(procurementUrl({ tab }), { scroll: false }));
  };

  // ── Sipariş listesi: ilk sayfa sunucudan, devamı action ile EKLENİR ──
  // Sunucu verisi değişince (sekme dönüşü/revalidate) eklenen sayfalar SIFIRLANIR; yoksa eski
  // okumanın satırları yeni listede kalır (fiyat ekranının deseni).
  const [extraOrders, setExtraOrders] = useState<PurchaseOrderRowView[]>([]);
  const [ordersCursor, setOrdersCursor] = useState(data.ordersCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    setExtraOrders([]);
    setOrdersCursor(data.ordersCursor);
  }, [data.orders, data.ordersCursor]);

  const onLoadMoreOrders = () => {
    if (!ordersCursor || loadingMore) return;
    setLoadingMore(true);
    void loadMorePurchaseOrdersAction(ordersCursor)
      .then(({ data: page }) => {
        // Hata sessiz: liste olduğu yerde kalır, tetikleyici yeniden denenebilir (sunucu = gerçek).
        if (!page) return;
        setExtraOrders((prev) => [...prev, ...page.rows]);
        setOrdersCursor(page.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  };

  const view = {
    data,
    tab: urlState.tab,
    onTab,
    navPending: pending,
    orders: [...(data.orders ?? []), ...extraOrders],
    hasMoreOrders: ordersCursor !== null,
    loadingMoreOrders: loadingMore,
    onLoadMoreOrders,
  };
  return resolvedDevice === 'mobile' ? <ProcurementMobile {...view} /> : <ProcurementDesktop {...view} />;
}
