'use client';

import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { PageHeader } from '@/components/operation/ui/page-header';
import { Tabs } from '@/components/operation/ui/tabs';
import { Select } from '@/components/operation/form/select';
import { ChannelCards, CompanyPnl, ExportPanel, ProductProfit } from './reports-sections';
import { NOTES, TAB_LABEL } from './reports-labels';
import { monthLabel, REPORT_TABS, type ReportTab } from './reports-url';
import type { ReportsViewProps } from './reports-types';

// Raporlar — TELEFON. Tasarımın kendi mobil bölümü var (`<!-- MOBİL -->`), yani Para'nın aksine
// burada improvise edilen bir şey yok: aynı sekmeler, tek eksende ve daha dar hücrelerle.
//
// Dönem seçici başlığın ALTINDA kendi satırında: başlık barına sıkıştırıldığında 390px'de
// hamburger, başlık ve seçici yan yana sığmıyor ve seçici kırpılıyordu.

export function ReportsMobile({ data, urlState, months, canSeeProfit, onFilter }: ReportsViewProps) {
  const router = useRouter();
  const tabs: readonly ReportTab[] = canSeeProfit ? REPORT_TABS : ['export'];
  const active: ReportTab = tabs.includes(urlState.tab) ? urlState.tab : 'export';

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Raporlar" compact />

      <div className="flex items-center gap-2 border-b border-ops-line-soft px-4 py-2.5">
        <Select
          value={urlState.ym}
          onChange={(value) => onFilter({ ym: value })}
          options={months.map((month) => ({ value: month, label: monthLabel(month) }))}
        />
        <button
          type="button"
          onClick={() => onFilter({ cmp: !urlState.cmp })}
          className={`cursor-pointer rounded-ops-btn border px-3 py-1.5 font-ops-mono text-ops-xs transition-colors ${
            urlState.cmp ? 'border-ops-olive bg-ops-olive-bg text-ops-olive-dark' : 'border-ops-line-strong text-ops-muted'
          }`}
        >
          ↳ geçen ay
        </button>
      </div>

      <Tabs
        items={tabs.map((tab) => ({
          key: tab,
          label: TAB_LABEL[tab],
          badge: tab === 'export' ? data.invoiceQueue.length : null,
        }))}
        active={active}
        onSelect={(tab) => onFilter({ tab })}
      />

      {!data.hasSales && active !== 'export' ? (
        <EmptyState title="Bu dönemde kapanmış satış yok" description={NOTES.emptyPeriod} />
      ) : active === 'urun' ? (
        <ProductProfit
          metrics={data.productMetrics}
          rows={data.variants}
          unpricedCount={data.unpricedCount}
          unpricedRevenueCents={data.unpricedRevenueCents}
          stacked
        />
      ) : active === 'sirket' ? (
        <CompanyPnl rows={data.pnl} comparing={urlState.cmp} stacked />
      ) : active === 'kanal' ? (
        <ChannelCards cards={data.channels} stacked />
      ) : (
        <ExportPanel view={data.export} queue={data.invoiceQueue} ym={urlState.ym} onChanged={() => router.refresh()} stacked />
      )}
    </div>
  );
}
