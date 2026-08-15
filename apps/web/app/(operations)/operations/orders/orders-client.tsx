'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchDraft } from '@/lib/use-search-draft.hook';
import { loadMoreOrdersAction } from './actions';
import { OrderDialog } from './order-dialog';
import { OrdersDesktop } from './orders.desktop';
import { ordersUrl, type OrdersUrlState } from './orders-url';
import type { OrderRow, OrdersData } from './orders-types';

// Sipariş ekranı client kökü: tek durum ağacı burada. Operasyon web'i masaüstü-yalnız (06.08);
// mobil deneyim native uygulamada — `docs/uygulama`.

interface OrdersClientProps {
  data: OrdersData;
  urlState: OrdersUrlState;
}

export function OrdersClient({ data, urlState }: OrdersClientProps) {
  const router = useRouter();
  /**
   * Süzgeç/sekme turu SÜRÜYOR MU — `router.replace` bir RSC okumasıdır ve dönene kadar ekranda hiçbir
   * karşılık yoktu: liste eski satırlarla duruyor, tıklanan çip bile aktifleşmiyordu (aktiflik
   * `urlState`'ten, yani sunucudan geliyor). Operatör basıp basmadığını anlamıyordu.
   *
   * `isPending` iki yere bağlanıyor: çip şeridi (iyimser vurgu) ve tablo gövdesi (`busy` — satır
   * varsa soluklaşır, yoksa iskelet). Bağımsız ajan denetimi, 30.07.
   */
  const [pending, startNav] = useTransition();

  const go = (patch: Partial<OrdersUrlState>) => {
    startNav(() => router.replace(ordersUrl({ ...urlState, ...patch }), { scroll: false }));
  };

  // Arama: giriş yerel (anında yazılır), URL'e gecikmeli — mekanizma ortak (`useSearchDraft`).
  const { draft: search, onDraft: onSearch } = useSearchDraft(urlState.q, (q) => go({ q }));

  // Liste: ilk sayfa sunucudan, devamı action ile EKLENİR. Sunucu verisi değişince (süzgeç/
  // revalidate) eklenen sayfalar SIFIRLANIR; yoksa eski süzgecin satırları yeni listede kalır.
  const [extra, setExtra] = useState<OrderRow[]>([]);
  const [cursor, setCursor] = useState(data.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    setExtra([]);
    setCursor(data.nextCursor);
  }, [data.rows, data.nextCursor]);

  const onLoadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    void loadMoreOrdersAction(window.location.search, cursor)
      .then(({ data: page }) => {
        // Hata sessiz: liste olduğu yerde kalır, tetikleyici yeniden denenebilir (sunucu = gerçek).
        if (!page) return;
        setExtra((prev) => [...prev, ...page.rows]);
        setCursor(page.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  };

  const rows = [...data.rows, ...extra];

  // Açık sipariş KİMLİKLE tutulur, kayıt taze listeden türetilir: durum ilerletildikten sonra
  // diyalog kopyaya değil yeni gerçeğe bakar. Satır listeden düşerse (süzgeç dışına çıktı)
  // diyalog kendiliğinden kapanır.
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((r) => r.id === openId) ?? null;
  useEffect(() => {
    if (openId && !open) setOpenId(null);
  }, [openId, open]);

  const view = {
    rows,
    counts: data.counts,
    warehouse: data.warehouse,
    urlState,
    onFilter: go,
    search,
    onSearch,
    navPending: pending,
    hasMore: cursor !== null,
    loadingMore,
    onLoadMore,
    onOpen: setOpenId,
  };

  return (
    <>
      <OrdersDesktop {...view} />
      {open ? <OrderDialog key={open.id} row={open} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}
