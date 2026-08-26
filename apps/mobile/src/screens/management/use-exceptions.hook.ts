import { useCallback, useEffect, useRef, useState } from 'react';

import { askException, fetchExceptions } from '@/lib/api/management';
import type { ExceptionAskResponse, OrderException } from '@lezzet/types';

/*
  Y2 · SİPARİŞ İSTİSNALARI KANCASI (21.12) — karar bekleyen eksikler + "müşteriye sor".

  Soru sorulan kalem sunucuda kuyruktan KENDİLİĞİNDEN düşer (talep `awaitingAnswer` işaretler);
  bu yüzden her sorudan sonra liste yeniden okunur — ekran kendi kopyasını eksiltmez, gerçeğe
  bakar. `already_asked`/`no_shortfall` hata değil cevaptır ve satırında gösterilir.
*/

type ExceptionsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; exceptions: OrderException[] };

type AskState = { status: 'sending' } | { status: ExceptionAskResponse['status'] };

interface UseExceptionsResult {
  state: ExceptionsState;
  /** orderItemId → soru akıbeti (son turdan). */
  asks: Record<string, AskState>;
  ask: (orderItemId: string) => void;
  retry: () => void;
}

export function useExceptions(): UseExceptionsResult {
  const [state, setState] = useState<ExceptionsState>({ status: 'loading' });
  const [asks, setAsks] = useState<Record<string, AskState>>({});
  const generation = useRef(0);

  const load = useCallback(async () => {
    const run = ++generation.current;
    // Yeniden yüklemede liste karartılmaz (21.119 dersi) — soru sonrası satır, taze cevapla düşer.
    setState((current) => (current.status === 'ready' ? current : { status: 'loading' }));
    const result = await fetchExceptions();
    if (run !== generation.current) return;
    setState(
      result.error !== null || result.data === null
        ? { status: 'error' }
        : { status: 'ready', exceptions: result.data.exceptions },
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ask = (orderItemId: string) => {
    const current = asks[orderItemId];
    if (current?.status === 'sending' || current?.status === 'ok') return;
    setAsks((prev) => ({ ...prev, [orderItemId]: { status: 'sending' } }));
    void (async () => {
      const result = await askException(orderItemId);
      if (result.error !== null || result.data === null) {
        // Yazım düştü: durum sıfırlanır, düğme yeniden denenebilir kalır.
        setAsks((prev) => {
          const next = { ...prev };
          delete next[orderItemId];
          return next;
        });
        return;
      }
      setAsks((prev) => ({ ...prev, [orderItemId]: { status: result.data.status } }));
      // Soru KABUL edildiyse liste tazelenir — kalem kuyruktan sunucuda düştü; bayat hâlde de
      // (`no_shortfall`) tazelemek doğru: ekran gerçeğe döner.
      if (result.data.status === 'ok' || result.data.status === 'no_shortfall') void load();
    })();
  };

  return { state, asks, ask, retry: () => void load() };
}
