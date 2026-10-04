import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '@lezzet/i18n';

import { registerReadRecovery } from '@lezzet/mobile-kit/src/lib/auth/recover-reads';
import { fetchOrderDetail, type OrderDetail } from '@/lib/api/orders';
import { useLiveRefresh } from '@/lib/app-state/use-live-refresh';

/*
  Sipariş detayı tek turda gelir. Dört hâl ayrıdır: `guest` oturumsuzdur ve cevabı giriştir, `missing` bulunamayan ile başkasına ait
  siparişin ortak 404'üdür, `error` telin arızasıdır, `ready` veridir.
*/

type OrderStatus = 'loading' | 'guest' | 'ready' | 'missing' | 'error';

interface UseOrderResult {
  status: OrderStatus;
  /** Yalnız `ready` hâlinde dolu. */
  detail: OrderDetail | null;
  retry: () => void;
}

export function useOrder(reference: string, locale: Locale): UseOrderResult {
  const [status, setStatus] = useState<OrderStatus>('loading');
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const generation = useRef(0);

  const load = useCallback(() => {
    const run = (generation.current += 1);
    setStatus('loading');
    void fetchOrderDetail(reference, locale).then((result) => {
      if (run !== generation.current) return;
      if (result.error !== null) {
        setStatus(result.status === 401 ? 'guest' : result.status === 404 ? 'missing' : 'error');
        return;
      }
      setDetail(result.data);
      setStatus('ready');
    });
  }, [locale, reference]);

  useEffect(() => {
    load();
  }, [load]);

  // Oturumsuz okunan sipariş, oturumla yapılan ilk başarılı istekte yeniden okunur: bildirimden girişe yönlenen müşteri girişten sonra siparişi görür.
  useEffect(() => (status === 'guest' ? registerReadRecovery(load) : undefined), [status, load]);

  /* Uygulama öne gelince tazelenir, çünkü telefon cebe konur ve sipariş durumu müşterinin beklediği şeydir. `load` eskimiş cevabı
     elediği için yarışan iki uçuşta son cevap kazanır. */
  useLiveRefresh(load);

  return { status, detail, retry: load };
}
