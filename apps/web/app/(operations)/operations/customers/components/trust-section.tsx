'use client';

import { useState } from 'react';
import type { KeysetCursor } from '@lezzet/types';
import { Button } from '@/components/operation/ui/button';
import { TrustHistory } from '@/components/operation/ui/trust-history';
import type { TrustRowView, TrustView } from '@/lib/customer/trust';
import { loadTrustPageAction } from '../actions';

/** Güven geçmişi keyset sayfalı büyür; müşteri değişince çağıran `key` ile sıfırlar. */
interface TrustSectionProps {
  customerId: string;
  initial: TrustView;
}

export function TrustSection({ customerId, initial }: TrustSectionProps) {
  const [rows, setRows] = useState<TrustRowView[]>(initial.rows);
  const [cursor, setCursor] = useState<KeysetCursor | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMore = () => {
    if (!cursor || loading) return;
    setLoading(true);
    setError(null);
    void loadTrustPageAction(customerId, cursor)
      .then(({ data, error: failed }) => {
        if (!data) {
          setError(failed ?? 'Geçmiş okunamadı.');
          return;
        }
        setRows((prev) => [...prev, ...data.rows]);
        setCursor(data.nextCursor);
      })
      .finally(() => setLoading(false));
  };

  return (
    <TrustHistory
      score={initial.score}
      rows={rows}
      footer={
        cursor || error ? (
          <div className="flex items-center gap-2">
            {error ? <span className="font-ops-body text-ops-xs text-ops-red">{error}</span> : null}
            {cursor ? (
              <Button variant="secondary" size="sm" onClick={loadMore} disabled={loading} className="ml-auto">
                {loading ? 'Okunuyor…' : 'Daha fazla'}
              </Button>
            ) : null}
          </div>
        ) : null
      }
    />
  );
}
