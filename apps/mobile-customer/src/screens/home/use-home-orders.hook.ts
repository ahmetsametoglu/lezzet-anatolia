import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '@lezzet/i18n';

import { fetchOrders, isNumbered, type NumberedOrderSummary, type OrderSummary } from '@/lib/api/orders';
import { useLiveRefresh } from '@/lib/app-state/use-live-refresh';

/*
  Vitrinin iki sipariş bandı ("siparişiniz yolda", "geçen siparişinizi tekrarlayın"), sipariş listesinin kapısından ilk sayfayla okunur.
  "Süren" motorun `active` kararıdır, "geçen" `delivered`; misafirde çağrı yok ve okuma düşerse bant çizilmez.
*/

interface UseHomeOrdersResult {
  /** Süren (teslim edilmemiş) EN YENİ sipariş; yoksa `null` → bant çizilmez. */
  live: NumberedOrderSummary | null;
  /** Teslim edilmiş EN YENİ sipariş; yoksa `null`. */
  last: NumberedOrderSummary | null;
  /** Aşağı çekerek yenileme — vitrinin öteki kaynaklarıyla birlikte tetiklenir. */
  refresh: () => void;
}

export function useHomeOrders(locale: Locale, signedIn: boolean): UseHomeOrdersResult {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  /** Eskimiş cevap koruması: yenileme/oturum değişimi sayacı artırır, uçuştaki eski cevap yazılmaz. */
  const generation = useRef(0);

  const load = useCallback(() => {
    const run = (generation.current += 1);
    if (!signedIn) {
      // Çıkışta ekrandaki bantlar HEMEN düşer: başkasının siparişi gibi duran bir satır kalmasın.
      setOrders([]);
      return;
    }
    void fetchOrders(locale).then((result) => {
      if (run !== generation.current) return;
      setOrders(result.error !== null ? [] : result.data.orders);
    });
  }, [locale, signedIn]);

  useEffect(() => {
    load();
  }, [load]);

  // Takip şeridi sipariş detayıyla aynı cümleyi taşır ve aynı sebeple bayatlar; tazeleme kuralı tek yerde.
  useLiveRefresh(load);

  // Ödeme bekleyen sipariş bantlara girmez: numarası yok ve sürmekte olan bir teslimat değil.
  const numbered = orders.filter(isNumbered);
  return {
    live: numbered.find((order) => order.active) ?? null,
    last: numbered.find((order) => order.status === 'delivered') ?? null,
    refresh: load,
  };
}
