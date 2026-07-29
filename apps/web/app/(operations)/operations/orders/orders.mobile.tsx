'use client';

import { Badge } from '@/components/operation/ui/badge';
import { Chip } from '@/components/operation/ui/chip';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { PageHeader } from '@/components/operation/ui/page-header';
import { SearchInput } from '@/components/operation/ui/search-input';
import { Tabs } from '@/components/operation/ui/tabs';
import { money, shortDate } from '@/components/operation/ui/format';
import { contentText, deliveryText, paymentText, paymentToneClass, statusLabel, statusTone, summaryText } from './orders-labels';
import { CHANNEL_FILTERS, CHANNEL_LABEL, CHANNEL_TONE, ORDER_TABS, tabLabel } from './orders-url';
import type { OrderRow, OrdersViewProps } from './orders-types';

// Siparişler — MOBİL. Tasarımın kendi notu (§7): telefonda asıl iş **durumu değiştirmek** ve
// **günün siparişlerini süzmek**. Yedi sütunlu tablo telefonda okunmaz; satır KART'a iner ve karta
// dokunmak aynı hızlı bakış diyaloğunu açar (durum ilerletme oradan).
//
// Teslim türü/tahsilat çipleri mobilde YOK: küçük ekranda üç süzgeç şeridi listeyi ekrandan siler.
// Sekme (durum) + kanal, telefondaki iki gerçek soruyu karşılıyor.

export function OrdersMobile(props: OrdersViewProps) {
  const { rows, counts, urlState, onFilter, search, onSearch, hasMore, loadingMore, onLoadMore, onOpen } = props;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="Siparişler"
        subtitle={summaryText(counts)}
      />

      <Tabs
        items={ORDER_TABS.map((key) => ({
          key,
          label: tabLabel(key),
          count: key === 'all' ? counts.total : (counts.byStatus[key] ?? 0),
        }))}
        active={urlState.tab}
        onSelect={(tab) => onFilter({ tab })}
        className="overflow-x-auto"
      />

      <div className="flex flex-col gap-2 border-b border-ops-line px-4 py-2.5">
        <SearchInput value={search} onChange={onSearch} placeholder="Referans no, müşteri ara" />
        <div className="flex flex-wrap items-center gap-2">
          {CHANNEL_FILTERS.map((c) => (
            <Chip key={c} tone={CHANNEL_TONE[c]} active={urlState.chan === c} onClick={() => onFilter({ chan: c })}>
              {CHANNEL_LABEL[c]}
            </Chip>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <span className="font-ops-body text-ops-base text-ops-muted">Bu süzgeçle eşleşen sipariş yok.</span>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
          {rows.map((row) => (
            <OrderCard key={row.id} row={row} onOpen={() => onOpen(row.id)} />
          ))}
          <LoadMoreSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />
        </div>
      )}
    </div>
  );
}

interface OrderCardProps {
  row: OrderRow;
  onOpen: () => void;
}

/** Sipariş kartı — vadesi geçmiş satırın SOL KENARI kırmızı: telefonda göz sütun taramaz, kenar tarar. */
function OrderCard({ row, onOpen }: OrderCardProps) {
  const { main, meta } = deliveryText(row, shortDate);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex cursor-pointer flex-col gap-2 rounded-ops-card border bg-ops-white px-3.5 py-3 text-left transition-colors hover:bg-ops-subtle ${
        row.payment.overdue ? 'border-ops-red-line border-l-[3px] border-l-ops-red' : 'border-ops-line'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{row.customerName}</span>
          <span className="truncate font-ops-body text-ops-xs text-ops-muted">
            {row.referenceNo ?? '—'} · {contentText(row)}
          </span>
        </div>
        <Badge tone={statusTone(row.status)} dot>
          {statusLabel(row.status)}
        </Badge>
      </div>

      <div className="flex items-center gap-3">
        <span className="font-ops-mono text-ops-sm font-medium text-ops-ink">{money(row.totalCents)}</span>
        <span className="truncate font-ops-body text-ops-xs text-ops-muted">
          {main}
          {meta ? ` · ${meta}` : ''}
        </span>
        <span className={`ml-auto flex-none font-ops-mono text-ops-micro ${paymentToneClass(row)}`}>
          {paymentText(row, money)}
        </span>
      </div>
    </button>
  );
}
