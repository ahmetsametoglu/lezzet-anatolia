'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import { loadMoreOrdersAction } from './actions';
import { OrderDialog } from './order-dialog';
import { OrdersDesktop } from './orders.desktop';
import { OrdersMobile } from './orders.mobile';
import { ordersUrl, type OrdersUrlState } from './orders-url';
import type { OrderRow, OrdersData } from './orders-types';

// Sipariş ekranı client kökü (Sapma 3): tek durum ağacı burada, sunum web/mobil olarak çatallanır.
// Hızlı bakış diyaloğu iki yüzeyin de üstünde — telefonda da masaüstünde de aynı karar verilir.

/** Arama kutusunun URL'e yazılma gecikmesi (ms) — yazarken her tuşta sunucuya gidilmesin. */
const SEARCH_DEBOUNCE_MS = 350;

interface OrdersClientProps {
  data: OrdersData;
  device: Device;
  urlState: OrdersUrlState;
  /** Bugünün günü (YYYY-AA-GG) — SUNUCUDAN; gün süzgecinin etiketleri buradan doğar. */
  today: string;
}

export function OrdersClient({ data, device, urlState, today }: OrdersClientProps) {
  const resolvedDevice = useDevice(device);
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

  // Arama: giriş yerel (anında yazılır), URL'e gecikmeli. Sunucu değeri değişince yerel giriş eşitlenir.
  const [search, setSearch] = useState(urlState.q);
  useEffect(() => setSearch(urlState.q), [urlState.q]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearch = (q: string) => {
    setSearch(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => go({ q: q.trim() }), SEARCH_DEBOUNCE_MS);
  };
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

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
    today,
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
      {resolvedDevice === 'mobile' ? <OrdersMobile {...view} /> : <OrdersDesktop {...view} />}
      {open ? <OrderDialog key={open.id} row={open} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}
