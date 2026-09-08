import { useCallback, useEffect, useState } from 'react';

import { fetchB2bQueue } from '@/lib/api/management';
import type { ApiFail } from '@/lib/api/client';
import type { B2bQueueRow } from '@lezzet/types';

/*
  KURUMSAL BAŞVURU KUYRUĞU (21.217) — iki sekme, tek okuma.

  Sekme değişince liste baştan kuruluyor (imleç sıfırlanıyor): iki sekme iki ayrı küme ve birinin
  imleci ötekinde anlamsızdır — devretmek, ikinci sekmeyi listenin ortasından açardı.
*/

export type B2bTab = 'pending' | 'decided';

export type B2bQueueState =
  | { status: 'loading' }
  | { status: 'error'; failure: ApiFail | null }
  | { status: 'ready'; rows: B2bQueueRow[]; nextCursor: string | null };

export interface UseB2bQueueResult {
  state: B2bQueueState;
  tab: B2bTab;
  setTab: (tab: B2bTab) => void;
  /** İki sekmenin sayacı — okunmayan sekmenin sayısı da dolu (tasarım ikisini de yazıyor). */
  counts: { pending: number; decided: number };
  /** Tek bekleyen başvurunun kimliği; ekran listeyi ATLAYIP doğrudan açar (kullanıcı kararı 07.09). */
  single: string | null;
  loadingMore: boolean;
  loadMore: () => void;
  retry: () => void;
}

export function useB2bQueue(): UseB2bQueueResult {
  const [tab, setTabState] = useState<B2bTab>('pending');
  const [state, setState] = useState<B2bQueueState>({ status: 'loading' });
  const [counts, setCounts] = useState({ pending: 0, decided: 0 });
  const [single, setSingle] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (hangi: B2bTab) => {
    setState({ status: 'loading' });
    const result = await fetchB2bQueue({ filter: hangi });
    if (result.error !== null) {
      setState({ status: 'error', failure: result });
      return;
    }
    setCounts(result.data.counts);
    setSingle(result.data.single);
    setState({ status: 'ready', rows: result.data.rows, nextCursor: result.data.nextCursor });
  }, []);

  useEffect(() => {
    void load(tab);
  }, [load, tab]);

  /* Sayfa GELİNCE eklenir, yerine geçmez — depocu okuduğu satırı kaybetmesin (liste deseni). */
  const loadMore = useCallback(() => {
    if (state.status !== 'ready' || state.nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    void (async () => {
      const result = await fetchB2bQueue({ filter: tab, cursor: state.nextCursor ?? undefined });
      setLoadingMore(false);
      if (result.error !== null) return;
      setCounts(result.data.counts);
      setState((onceki) =>
        onceki.status === 'ready'
          ? { status: 'ready', rows: [...onceki.rows, ...result.data.rows], nextCursor: result.data.nextCursor }
          : onceki,
      );
    })();
  }, [loadingMore, state, tab]);

  const setTab = useCallback((next: B2bTab) => setTabState(next), []);

  return { state, tab, setTab, counts, single, loadingMore, loadMore, retry: () => void load(tab) };
}
