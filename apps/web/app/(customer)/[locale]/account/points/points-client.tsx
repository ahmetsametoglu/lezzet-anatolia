'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { CustomerPointsRules } from '@lezzet/application';
import type { PointsEntry } from '@lezzet/types';
import { formatPrice } from '@/lib/storefront/format';
import { LoadMore } from '@/components/customer/ui/load-more';
import { loadMorePointsAction } from './actions';
import type { Messages, PointsHistoryPage } from './points-types';

/**
 * Puan dökümü + kazanma yolları. İki cihazda AYNI düzen (tek sütun liste) — fork açılmadı çünkü
 * ayrışan bir yerleşim kararı yok; `md:` de kullanılmıyor (CLAUDE §2).
 *
 * Sebep etiketi hesap kartıyla aynı kural: bilinmeyen sebep HAM dizeye düşer, satır kaybolmaz;
 * eksi işaretli ödül ters etiket alır ("… — iptal edildi", ★ karar 7d).
 */
interface PointsHistoryClientProps {
  t: Messages;
  locale: Locale;
  first: PointsHistoryPage;
  rules: CustomerPointsRules;
}

export function PointsHistoryClient({ t, locale, first, rules }: PointsHistoryClientProps) {
  const [extra, setExtra] = useState<PointsEntry[]>([]);
  const [cursor, setCursor] = useState(first.nextCursor);
  const [loading, setLoading] = useState(false);

  const entries = [...first.entries, ...extra];
  const dateOf = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });

  const loadMore = () => {
    if (!cursor || loading) return;
    setLoading(true);
    void loadMorePointsAction(cursor).then((res) => {
      const page = res.data;
      if (page) {
        setExtra((prev) => [...prev, ...page.entries]);
        setCursor(page.nextCursor);
      }
      setLoading(false);
    });
  };

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
              <span className={['flex-none font-sans text-body-sm font-bold', entry.points >= 0 ? 'text-olive-dark' : 'text-terracotta'].join(' ')}>
                {entry.points >= 0 ? '+' : '−'}
                {Math.abs(entry.points)}
              </span>
            </div>
          ))}
        </div>
      )}

      <LoadMore hasMore={cursor !== null} loading={loading} onLoadMore={loadMore} label={t.loadMore} loadingLabel={t.loading} />

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-card-title-sm text-ink">{t.earnTitle}</h2>
        <div className="flex flex-col divide-y divide-sand-100 rounded-card border border-sand-200 bg-card px-4">
          {rules.earnWays.map((way) => (
            <div key={way.key} className="flex items-baseline justify-between gap-3 py-3">
              <span className="min-w-0 font-sans text-body-sm text-body">{t.earnWay[way.key]}</span>
              <span className="flex-none font-sans text-body-sm font-bold text-olive-dark">
                {t.earnPoints.replace('{points}', String(way.points))}
              </span>
            </div>
          ))}
        </div>
        <p className="font-sans text-note text-muted">
          {t.earnNote.replace('{points}', String(rules.redeem.minimumPoints)).replace('{amount}', formatPrice(rules.redeem.valueCents, locale))}
        </p>
      </section>
    </div>
  );
}

/** Eksi işaretli ödül ters etiket alır; bilinmeyen sebep ham dizeye düşer (hesap kartının kuralı). */
function reasonLabel(t: Messages, entry: PointsEntry): string {
  if (entry.points < 0 && (entry.reason === 'referral' || entry.reason === 'neighbor')) return t.reasonReversed[entry.reason];
  return (t.reason as Record<string, string>)[entry.reason] ?? entry.reason;
}
