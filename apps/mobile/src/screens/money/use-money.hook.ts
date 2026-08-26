import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchMoneyDayEnd, fetchMoneyOverview } from '@/lib/api/money';
import type { MoneyDayEnd, MoneyOverview } from '@lezzet/types';

/*
  PARA OKUMALARI (21.12 · M1/M2) — iki ekran, iki küçük kanca, tek desen.

  Salt okuma olduğu için kancada da bir "hâl" yok: yüklenir, gösterilir, istenirse yeniden denenir.
  Yarışın bekçisi sıra numarası (`use-sale.hook` künyesi): geç gelen eski cevap sessizce düşer.
*/

type ReadState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

function useRead<T>(fetcher: () => Promise<{ data: T | null; error: string | null }>): {
  state: ReadState<T>;
  retry: () => void;
} {
  const [state, setState] = useState<ReadState<T>>({ status: 'loading' });
  const generation = useRef(0);

  const load = useCallback(async () => {
    const run = ++generation.current;
    setState({ status: 'loading' });
    const result = await fetcher();
    if (run !== generation.current) return;
    setState(result.error !== null || result.data === null ? { status: 'error' } : { status: 'ready', data: result.data });
  }, [fetcher]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, retry: () => void load() };
}

export function useMoneyOverview(): { state: ReadState<MoneyOverview>; retry: () => void } {
  return useRead(fetchMoneyOverview);
}

export function useMoneyDayEnd(): { state: ReadState<MoneyDayEnd>; retry: () => void } {
  return useRead(fetchMoneyDayEnd);
}
