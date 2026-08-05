'use client';

import type { CourierStop } from '@/lib/courier/day';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { PageHeader } from '@/components/operation/ui/page-header';
import { DayProgress, StopCard } from './deliveries-sections';
import { isSettled, NOTES } from './deliveries-labels';

// Kuryenin günü — TELEFON (birincil yüzey).

export function CourierDayMobile({ stops }: { stops: CourierStop[] }) {
  const allDone = stops.length > 0 && stops.every((stop) => isSettled(stop.outcome));

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Günüm" compact />

      {stops.length === 0 ? (
        <EmptyState title="Bugün teslimat yok" description={NOTES.emptyDay} />
      ) : (
        <>
          <DayProgress stops={stops} />
          {allDone ? (
            <p className="border-b border-ops-olive-line bg-ops-olive-bg px-4 py-2.5 font-ops-body text-ops-xs text-ops-olive-dark">
              {NOTES.allDone}
            </p>
          ) : null}
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {/* Sıra KAPIDAN gelir, ekranda yeniden sıralanmaz: liste rota sırasıyla geliyor ve
                sonuçlananları dibe atmak, kuryenin "ne yaptım" haritasını bozardı (tasarım §2). */}
            {stops.map((stop, index) => (
              <StopCard key={stop.orderId} stop={stop} index={index} />
            ))}
          </ul>
          <p className="border-t border-ops-line-soft px-4 py-2 font-ops-body text-ops-micro text-ops-faint">
            {NOTES.retryHint}
          </p>
        </>
      )}
    </div>
  );
}
