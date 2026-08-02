import { Badge } from '@/components/operation/ui/badge';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { Tabs } from '@/components/operation/ui/tabs';
import { amount, shortDate } from '@/components/operation/ui/format';
import { receivedText, receivedToneClass, statusLabel, statusTone } from './procurement-labels';
import { SuggestionGroupCard, SuggestionsEmpty, SupplierCard } from './procurement-sections';
import { TAB_LABEL } from './procurement-url';
import type { ProcurementViewProps } from './procurement.desktop';
import type { PurchaseOrderRowView } from './procurement-types';

// Tedarik — mobil: aynı içerik tek kolonda. Sipariş listesi TABLO DEĞİL kart: dar ekranda altı
// sütun okunmaz, aynı bilgi iki satırlık kartta durur (siparişler ekranının mobil deseni).
// Tasarımın mobil aksiyon kareleri (taslak → WhatsApp/PDF) diyaloglarıyla birlikte gelir.

export function ProcurementMobile(props: ProcurementViewProps) {
  const { data, tab, onTab, navPending, orders, hasMoreOrders, loadingMoreOrders, onLoadMoreOrders } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <header className="flex flex-col gap-px border-b border-ops-line px-4 py-3">
        <h1 className="font-ops-display text-ops-section font-semibold text-ops-ink">Tedarik</h1>
      </header>
      <Tabs
        items={[
          { key: 'suggestions', label: TAB_LABEL.suggestions, badge: data.suggestions?.length ?? null },
          { key: 'orders', label: TAB_LABEL.orders, badge: data.pendingOrderCount },
          { key: 'suppliers', label: TAB_LABEL.suppliers, count: data.suppliers?.length ?? null },
        ]}
        active={tab}
        onSelect={onTab}
        className="px-2"
      />
      <div
        aria-busy={navPending || undefined}
        className={['min-h-0 flex-1 overflow-y-auto', navPending ? 'pointer-events-none opacity-60' : ''].join(' ')}
      >
        {tab === 'suggestions' ? (
          (data.suggestions?.length ?? 0) === 0 ? (
            <SuggestionsEmpty />
          ) : (
            <div className="flex flex-col gap-3 px-3 py-3">
              {data.suggestions!.map((group) => (
                <SuggestionGroupCard key={group.supplierId ?? 'unmapped'} group={group} />
              ))}
            </div>
          )
        ) : null}

        {tab === 'orders' ? (
          orders.length === 0 ? (
            <p className="px-6 py-10 text-center font-ops-body text-ops-sm text-ops-muted">
              Henüz tedarik siparişi yok — “Sipariş zamanı” sekmesinden taslak oluşturduğunuzda burada görünür.
            </p>
          ) : (
            <div className="flex flex-col">
              {orders.map((row) => (
                <OrderCard key={row.id} row={row} />
              ))}
              <LoadMoreSentinel hasMore={hasMoreOrders} loading={loadingMoreOrders} onLoadMore={onLoadMoreOrders} />
            </div>
          )
        ) : null}

        {tab === 'suppliers' ? (
          <div className="flex flex-col gap-3 px-3 py-3">
            {(data.suppliers ?? []).map((supplier) => (
              <SupplierCard key={supplier.id} supplier={supplier} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Sipariş kartı — tablonun altı sütunu iki satıra iner; kabul kırılımı korunur (asıl bilgi o). */
function OrderCard({ row }: { row: PurchaseOrderRowView }) {
  const received = receivedText(row);
  const totalUnknown = row.missingPriceCount > 0 && row.missingPriceCount === row.itemCount;
  return (
    <article className="flex flex-col gap-1.5 border-b border-ops-line-soft px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="mr-auto truncate font-ops-body text-ops-base font-semibold text-ops-ink">{row.supplierName}</span>
        <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
      </div>
      <div className="flex items-center gap-2 font-ops-mono text-ops-xs text-ops-muted">
        <span>{shortDate(row.createdAt)}</span>
        <span>·</span>
        <span>{row.itemCount} kalem</span>
        <span className="ml-auto text-ops-ink">
          {totalUnknown ? '—' : `${row.missingPriceCount > 0 ? '≈ ' : ''}${amount(row.totalCents)} €`}
        </span>
      </div>
      <div className="flex items-center gap-2 font-ops-mono text-ops-xs">
        <span className={receivedToneClass(row)}>{received.main}</span>
        <span className="truncate text-ops-muted">{received.meta}</span>
      </div>
    </article>
  );
}
