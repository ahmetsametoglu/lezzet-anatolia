'use client';

import { groupPointsHistory } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import pointsMessages from '@lezzet/i18n/customer/points-history';
import type { PointsReason } from '@lezzet/types';
import { EmptyState } from '@/components/customer/phone-kit/empty-state';
import { LoadingState } from '@/components/customer/phone-kit/loading-state';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { formatOrderDate } from '@/lib/storefront/format';
import { useLoadMore } from '@/lib/use-load-more.hook';
import { EarnWays } from './components/earn-ways';
import type { PointsViewProps } from './points-types';

type PointsCopy = LocalizedCopy<typeof pointsMessages>;

/**
 * Puan geçmişinin telefon görünümü, native puan ekranının ikizi: aynı gün ve sebepteki hareketler tek satırda, kutusuz liste,
 * sona yaklaşınca kendiliğinden devam. Kazanma yolları bölümü yalnız web'de, listenin altında.
 */
export function PointsMobile({ t, locale, rules, entries, hasMore, loading, failed, loadMore }: PointsViewProps) {
  const copy: PointsCopy = pointsMessages[locale];
  // Düşen istek kendiliğinden yinelenmez; devam "tekrar dene" ile müşterinin elinde.
  const { ref } = useLoadMore({ hasMore: hasMore && !failed, loading, onLoadMore: loadMore });

  if (entries.length === 0) {
    return (
      <EmptyState
        fill
        icon={<MobileIcon name="star" size={80} className="text-sand-600" />}
        title={copy.empty.title}
        description={copy.empty.body}
        action={<PrimaryButton label={copy.empty.cta} shape="pill" href="/account" />}
      />
    );
  }

  const groups = groupPointsHistory(entries, (entry) => formatOrderDate(entry.createdAt, locale, true));

  return (
    <div className="flex flex-col px-4.5 pb-5">
      <ul className="flex flex-col">
        {groups.map((group) => {
          const earned = group.points >= 0;
          return (
            <li key={group.id} className="flex items-center justify-between gap-3 border-b border-sand-300 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-sans text-note font-semibold text-ink">{reasonLabel(copy, group.reason, group.points)}</span>
                {/* Sayı yalnız birden çoksa yazılır: "1 hareket" satırı bir şey söylemeden kalabalıklaştırırdı. */}
                <span className="font-sans text-micro text-muted">
                  {group.count === 1 ? group.date : `${group.date} · ${copy.count.replace('{n}', String(group.count))}`}
                </span>
              </div>
              {/* İşaret rakamın önünde de durur, çünkü renk tek başına kazanımı harcamadan ayırmaz. */}
              <span className={['font-sans text-note font-bold', earned ? 'text-olive-dark' : 'text-terracotta'].join(' ')}>
                {earned ? '+' : '−'}
                {Math.abs(group.points)}
              </span>
            </li>
          );
        })}
      </ul>

      <div ref={ref} className="flex justify-center py-4 empty:py-0">
        {loading && <LoadingState label={t.loading} />}
        {failed && !loading && <PrimaryButton label={copy.tailRetry} shape="pill" onClick={loadMore} />}
      </div>

      <div className="mt-3">
        <EarnWays t={t} locale={locale} rules={rules} />
      </div>
    </div>
  );
}

/** Geri alma aynı sebeple ters işaretle yazılır; sözlük yalnız geri alınabilen sebeplerin ters adını taşır. */
function reasonLabel(copy: PointsCopy, reason: PointsReason, points: number): string {
  const labels: Record<PointsReason, string> = copy.reason;
  if (points >= 0) return labels[reason];
  const reverted: Partial<Record<PointsReason, string>> = copy.reasonReverted;
  return reverted[reason] ?? labels[reason];
}
