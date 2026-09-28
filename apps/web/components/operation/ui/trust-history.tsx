import type { ReactNode } from 'react';
import Link from 'next/link';
import type { TrustRowView } from '@/lib/customer/trust';
import { shortDate } from './format';

interface TrustHistoryProps {
  /** `null` = defterde hiç hareket yok. */
  score: number | null;
  rows: readonly TrustRowView[];
  /** Listenin altı — "daha fazla" düğmesi gibi. */
  footer?: ReactNode;
}

/**
 * Güven puanı ve geçmişi; sipariş detayı ve müşteri önizlemesi aynı görünümü kullanır. Puan tavsiyedir: sistem bununla hiçbir şeyi
 * engellemez ve ekran bunu puanın yanında söyler.
 */
export function TrustHistory({ score, rows, footer }: TrustHistoryProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span
          className={`font-ops-mono text-ops-lead font-semibold ${score === null ? 'text-ops-faint' : score < 0 ? 'text-ops-red' : 'text-ops-ink'}`}
        >
          {score === null ? '—' : score}
        </span>
        <span className="font-ops-body text-ops-micro text-ops-muted">
          {score === null ? 'henüz güven hareketi yok' : 'tavsiye puanı — hiçbir şeyi engellemez'}
        </span>
      </div>
      {rows.length > 0 ? (
        <div className="flex flex-col rounded-ops-card border border-ops-line">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-2.5 border-b border-ops-line-soft px-3 py-1.5 last:border-b-0">
              <span
                className={`w-9 shrink-0 text-right font-ops-mono text-ops-xs font-semibold ${row.points < 0 ? 'text-ops-red' : 'text-ops-olive-dark'}`}
              >
                {row.points > 0 ? `+${row.points}` : row.points}
              </span>
              {row.href ? (
                <Link href={row.href} className="min-w-0 flex-1 cursor-pointer font-ops-body text-ops-xs leading-snug text-ops-ink hover:underline">
                  {row.label}
                </Link>
              ) : (
                <span className="min-w-0 flex-1 font-ops-body text-ops-xs leading-snug text-ops-ink">{row.label}</span>
              )}
              <span className="shrink-0 font-ops-mono text-ops-micro text-ops-muted">{shortDate(row.occurredAt)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {footer}
    </div>
  );
}
