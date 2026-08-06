'use client';

import Link from 'next/link';
import type { CourierStop } from '@/lib/courier/day';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { PageHeader } from '@/components/operation/ui/page-header';
import { DayProgress, StopCard } from './deliveries-sections';
import { isSettled, NOTES } from './deliveries-labels';

// Kuryenin günü — MASAÜSTÜ.
//
// Aynı bloklar, tek sütun ve **sınırlı genişlikte**. Kurye ekranı sahada telefonda kullanılıyor;
// masaüstü hâli sevkiyatçının omuz üstünden bakması ve geliştirme içindir. Listeyi 1360 px'e
// yaymak, telefonda tasarlanmış bir kartı seyreltip okunmaz kılardı — bu ekranın bilgisi dar
// sütunda dizilmek üzere kuruldu.

export function CourierDayDesktop({ stops }: { stops: CourierStop[] }) {
  const allDone = stops.length > 0 && stops.every((stop) => isSettled(stop.outcome));

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Günüm" subtitle="Kuryenin günü · yalnız size atanan teslimatlar">
        {/* Kapanış her zaman erişilebilir, yalnız gün bitince değil: kurye depoya erken dönebilir ve
            sonuçlanmamış durak kapanışı engellemiyor (11.6, tasarım §4). */}
        <Link
          href="/operations/deliveries/close"
          className="cursor-pointer rounded-ops-btn border border-ops-line-strong px-3 py-1.5 font-ops-display text-ops-sm font-semibold text-ops-strong transition-colors hover:border-ops-olive"
        >
          Gün kapanışı
        </Link>
      </PageHeader>

      {stops.length === 0 ? (
        <EmptyState title="Bugün teslimat yok" description={NOTES.emptyDay} />
      ) : (
        <div className="mx-auto flex min-h-0 w-full max-w-[560px] flex-1 flex-col">
          <DayProgress stops={stops} />
          {allDone ? (
            <p className="border-b border-ops-olive-line bg-ops-olive-bg px-4 py-2.5 font-ops-body text-ops-xs text-ops-olive-dark">
              {NOTES.allDone}{' '}
              <Link href="/operations/deliveries/close" className="cursor-pointer font-semibold underline underline-offset-2">
                Gün kapanışına geç →
              </Link>
            </p>
          ) : null}
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {stops.map((stop, index) => (
              <StopCard key={stop.orderId} stop={stop} index={index} />
            ))}
          </ul>
          <p className="border-t border-ops-line-soft px-4 py-2 font-ops-body text-ops-micro text-ops-faint">
            {NOTES.retryHint}
          </p>
        </div>
      )}
    </div>
  );
}
