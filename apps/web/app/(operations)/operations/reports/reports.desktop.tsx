'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/operation/ui/page-header';
import { Select } from '@/components/operation/form/select';
import { Tabs } from '@/components/operation/ui/tabs';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { ChannelCards, CompanyPnl, ExportPanel, ProductProfit } from './reports-sections';
import { NOTES, TAB_LABEL } from './reports-labels';
import { monthLabel, REPORT_TABS, type ReportTab } from './reports-url';
import type { ReportsViewProps } from './reports-types';

// Raporlar — MASAÜSTÜ. Tasarımın kurgusu: başlık + dönem seçici + karşılaştırma · sekme barı ·
// seçili sekmenin gövdesi.

export function ReportsDesktop({ data, urlState, months, canSeeProfit, onFilter }: ReportsViewProps) {
  const router = useRouter();

  // Kâr sekmeleri yalnız yöneticiye. Muhasebeci sekmeyi HİÇ GÖRMÜYOR: kapalı ama görünür bir sekme
  // burada yanlış olurdu — kapalı seçenek bir kuralı öğretir, bu ise bir yetki sınırıdır ve
  // muhasebeciye "göremediğin bir kâr var" demenin bir faydası yok.
  const tabs: readonly ReportTab[] = canSeeProfit ? REPORT_TABS : ['export'];
  const active: ReportTab = tabs.includes(urlState.tab) ? urlState.tab : 'export';

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="Raporlar"
        subtitle={`${monthLabel(urlState.ym)} · kesinleşen siparişler`}
      >
        {/* Kitin `Select`i — ham `<select>` değil (CLAUDE.md §2). Burada `field` kipi, çünkü ay
            bir SÜZGEÇ değil raporun konusu: her zaman bir değeri var ve "+ …" daveti anlamsız. */}
        <Select
          value={urlState.ym}
          onChange={(value) => onFilter({ ym: value })}
          options={months.map((month) => ({ value: month, label: monthLabel(month) }))}
        />
        {/* Karşılaştırma yalnız şirket kârında bir şey söylüyor; sekmeden bağımsız durması
            kasıtlı — operatör açık bırakıp sekme değiştirdiğinde ayarı kaybetmiyor. */}
        <button
          type="button"
          onClick={() => onFilter({ cmp: !urlState.cmp })}
          className={`cursor-pointer rounded-ops-btn border px-3 py-2 font-ops-mono text-ops-xs transition-colors ${
            urlState.cmp ? 'border-ops-olive bg-ops-olive-bg text-ops-olive-dark' : 'border-ops-line-strong text-ops-muted hover:text-ops-ink'
          }`}
        >
          ↳ geçen aya göre
        </button>
      </PageHeader>

      <Tabs
        items={tabs.map((tab) => ({
          key: tab,
          label: TAB_LABEL[tab],
          // `badge`, `count` DEĞİL: komponentin kendi ayrımına göre rozet "senden bir şey
          // bekleniyor" demek, sayı yalnız büyüklük. Eşleşmemiş fatura tam olarak birincisi —
          // muhasebeci numarayı girene kadar o satış dosyaya bağlanamıyor.
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
        />
      ) : active === 'sirket' ? (
        <CompanyPnl rows={data.pnl} comparing={urlState.cmp} />
      ) : active === 'kanal' ? (
        <ChannelCards cards={data.channels} />
      ) : (
        <ExportPanel view={data.export} queue={data.invoiceQueue} ym={urlState.ym} onChanged={() => router.refresh()} />
      )}
    </div>
  );
}
