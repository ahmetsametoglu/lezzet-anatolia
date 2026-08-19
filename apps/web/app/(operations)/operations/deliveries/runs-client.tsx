'use client';

import { useState, useTransition } from 'react';
import type { KeysetCursor } from '@lezzet/types';
import { loadMoreRunsAction } from './runs-actions';
import { RunsDesktop } from './runs.desktop';
import type { RunsPageView } from './runs-read';

/**
 * Geçmiş seferlerin istemci kökü (18.08 · Faz 5).
 *
 * **İmleç İSTEMCİDE durur, adreste değil** (CLAUDE §1: imleç URL'e yazılmaz — süzgeç yazılır).
 * "Daha eski" her basışta bir sayfa ekler; sayfalar birikir, sıralama sunucudan geldiği gibi kalır.
 */
export function RunsClient({ initial }: { initial: RunsPageView }) {
  const [rows, setRows] = useState(initial.rows);
  const [cursor, setCursor] = useState<KeysetCursor | null>(initial.nextCursor);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const loadMore = () => {
    if (!cursor) return;
    setError(null);
    startTransition(async () => {
      const { data, error: failed } = await loadMoreRunsAction(cursor);
      if (failed || !data) {
        setError(failed ?? 'Liste okunamadı.');
        return;
      }
      setRows((current) => [...current, ...data.rows]);
      setCursor(data.nextCursor);
    });
  };

  return <RunsDesktop rows={rows} hasMore={cursor !== null} onLoadMore={loadMore} busy={busy} error={error} />;
}
