'use client';

import type { PointsEntry } from '@lezzet/types';
import { LoadMore } from '@/components/customer/ui/load-more';
import { EarnWays } from './components/earn-ways';
import type { Messages, PointsViewProps } from './points-types';

/**
 * Puan dökümü ve kazanma yolları, tek sütun liste. Bilinmeyen sebep ham dizeye düşer ki satır kaybolmasın; eksi işaretli
 * ödül ters etiket alır.
 */
export function PointsDesktop({ t, locale, rules, entries, hasMore, loading, loadMore }: PointsViewProps) {
  const dateOf = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6">
      {entries.length === 0 ? (
        <p className="rounded-card border border-sand-200 bg-card px-4 py-5 font-sans text-body-sm text-muted">{t.empty}</p>
      ) : (
        <div className="flex flex-col divide-y divide-sand-100 rounded-card border border-sand-200 bg-card px-4">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-baseline justify-between gap-3 py-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-sans text-body-sm font-semibold text-ink">{reasonLabel(t, entry)}</span>
                <span className="font-sans text-micro text-muted">{dateOf.format(new Date(entry.createdAt))}</span>
              </div>
              <span
                className={['flex-none font-sans text-body-sm font-bold', entry.points >= 0 ? 'text-olive-dark' : 'text-terracotta'].join(
                  ' ',
                )}
              >
                {entry.points >= 0 ? '+' : '−'}
                {Math.abs(entry.points)}
              </span>
            </div>
          ))}
        </div>
      )}

      <LoadMore hasMore={hasMore} loading={loading} onLoadMore={loadMore} label={t.loadMore} loadingLabel={t.loading} />

      <EarnWays t={t} locale={locale} rules={rules} />
    </div>
  );
}

/** Eksi işaretli ödül ters etiket alır; bilinmeyen sebep ham dizeye düşer (hesap kartının kuralı). */
function reasonLabel(t: Messages, entry: PointsEntry): string {
  if (entry.points < 0 && (entry.reason === 'referral' || entry.reason === 'neighbor')) return t.reasonReversed[entry.reason];
  return (t.reason as Record<string, string>)[entry.reason] ?? entry.reason;
}
