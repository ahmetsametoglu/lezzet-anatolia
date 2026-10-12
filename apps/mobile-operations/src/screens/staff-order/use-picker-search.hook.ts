import { useCallback, useEffect, useState } from 'react';

import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';

/*
  Seçicilerin araması: iki harften başlar, sunucu sayfa sayfa verir. Ararken önceki sonuçlar yerinde kalır (`busy`) ve yalnız satırların
  içi değişir; her cevap kendi sorgusunu taşır, geciken cevap güncel sorgunun listesini ezmez.
*/

export const MIN_SEARCH_TERM = 2;

export interface PickerPage<T> {
  rows: T[];
  nextCursor: string | null;
}

/** Bir sayfa; `null` = okunamadı. `query` `null` ise tüm liste istenir (yalnız `listAll` açıkken). */
export type PickerFetch<T> = (query: string | null, cursor: string | null) => Promise<PickerPage<T> | null>;

interface Loaded<T> extends PickerPage<T> {
  query: string | null;
  fetchPage: PickerFetch<T>;
  failed: boolean;
}

/** `listAll`: arama boşken liste tamamdır (ürün seçici); kapalıysa iki harfe kadar liste boştur (müşteri seçici). */
export function usePickerSearch<T>(fetchPage: PickerFetch<T>, listAll: boolean) {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tailFailed, setTailFailed] = useState(false);

  const trimmed = term.trim();
  const wanted = trimmed.length >= MIN_SEARCH_TERM ? trimmed : null;

  /* Yazma bitene kadar beklenir; arama silinince liste beklemeden boşalır ya da tamama döner. */
  useEffect(() => {
    if (wanted === query) return;
    const timer = setTimeout(() => setQuery(wanted), wanted === null ? 0 : operationsTheme.searchDebounceMs);
    return () => clearTimeout(timer);
  }, [wanted, query]);

  const active = query !== null || listAll;
  useEffect(() => {
    if (!active) return;
    let alive = true;
    void fetchPage(query, null).then((page) => {
      if (!alive) return;
      setTailFailed(false);
      setLoaded({ query, fetchPage, rows: page?.rows ?? [], nextCursor: page?.nextCursor ?? null, failed: page === null });
    });
    return () => {
      alive = false;
    };
  }, [active, fetchPage, query, nonce]);

  const current = active && loaded !== null && loaded.query === query && loaded.fetchPage === fetchPage ? loaded : null;
  const busy = wanted !== query || (active && current === null);

  const loadMore = useCallback(async () => {
    if (current === null || current.nextCursor === null || loadingMore) return;
    const base = current;
    setLoadingMore(true);
    const page = await fetchPage(base.query, base.nextCursor);
    setLoadingMore(false);
    /* Kuyruk okunamazsa liste olduğu gibi kalır ve dipteki satır yeniden denetir. */
    if (page === null) {
      setTailFailed(true);
      return;
    }
    setTailFailed(false);
    setLoaded((prev) => (prev === base ? { ...prev, rows: [...prev.rows, ...page.rows], nextCursor: page.nextCursor } : prev));
  }, [current, fetchPage, loadingMore]);

  return {
    term,
    setTerm,
    /** Etkin sorgu; `null` = arama yok (tüm liste ya da boş liste). */
    query,
    rows: active ? (loaded?.rows ?? []) : [],
    nextCursor: current?.nextCursor ?? null,
    status: current === null ? ('idle' as const) : current.failed ? ('error' as const) : ('ready' as const),
    busy,
    loadingMore,
    tailFailed,
    loadMore,
    retry: () => setNonce((n) => n + 1),
  };
}
