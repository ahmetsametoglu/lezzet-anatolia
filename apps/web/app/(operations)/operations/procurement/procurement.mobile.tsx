import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Chip } from '@/components/operation/ui/chip';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { Tabs } from '@/components/operation/ui/tabs';
import { money, shortDate } from '@/components/operation/ui/format';
import { receivedText, receivedToneClass, statusLabel, statusTone, waitingText } from './procurement-labels';
import { SuggestionGroupCard, SuggestionsEmpty, SupplierCard } from './procurement-sections';
import { ORDER_STATUS_FILTERS, TAB_LABEL } from './procurement-url';
import type { ProcurementViewProps } from './procurement.desktop';
import type { PurchaseOrderRowView } from './procurement-types';

// Tedarik — mobil: aynı içerik tek kolonda. Sipariş listesi TABLO DEĞİL kart: dar ekranda altı
// sütun okunmaz, aynı bilgi iki satırlık kartta durur (siparişler ekranının mobil deseni).
//
// Telefon önceliklidir (sayfa sözleşmesi §7): sipariş taslağı çoğu zaman depoda, koliler açılırken
// yapılır ve listeyi WhatsApp'a atmak en olası gönderim yolu — o yüzden sipariş penceresi mobilde de
// tam çalışır, kısaltılmış bir hâli yoktur.

export function ProcurementMobile(props: ProcurementViewProps) {
  const { data, urlState, onFilter, navPending, orders, hasMoreOrders, loadingMoreOrders, onLoadMoreOrders, actionError } =
    props;
  const tab = urlState.tab;
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <header className="flex items-center gap-2 border-b border-ops-line px-4 py-3">
        <h1 className="mr-auto font-ops-display text-ops-section font-semibold text-ops-ink">Tedarik</h1>
        {tab === 'orders' ? (
          <Button variant="primary" size="sm" onClick={props.onNewOrder}>
            + Sipariş
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" onClick={() => props.onEditSupplier(null)}>
          + Tedarikçi
        </Button>
      </header>
      {actionError ? (
        <p role="alert" className="border-b border-ops-red-line bg-ops-red-bg px-4 py-2 font-ops-body text-ops-sm text-ops-red">
          {actionError}
        </p>
      ) : null}
      <Tabs
        items={[
          { key: 'suggestions', label: TAB_LABEL.suggestions, badge: data.suggestions?.length ?? null },
          { key: 'orders', label: TAB_LABEL.orders, badge: data.pendingOrderCount },
          { key: 'suppliers', label: TAB_LABEL.suppliers, count: data.suppliers?.length ?? null },
        ]}
        active={tab}
        onSelect={(next) => onFilter({ tab: next })}
        className="px-2"
      />

      {/* Durum süzgeci mobilde de var ama YATAY kaydırmalı: dar ekranda altı çip alt alta sarılınca
          şerit listenin yarısını yiyordu. Tedarikçi süzgeci burada YOK — telefonda aranan şey
          "hangi sipariş ne durumda", tedarikçi kırılımı masaüstünün sorusu. */}
      {tab === 'orders' ? (
        <div className="flex gap-2 overflow-x-auto border-b border-ops-line-soft px-3 py-2">
          {ORDER_STATUS_FILTERS.map((s) => (
            <Chip key={s} active={urlState.status === s} onClick={() => onFilter({ status: s })} className="shrink-0">
              {s === 'all' ? 'Tümü' : statusLabel(s)}
            </Chip>
          ))}
        </div>
      ) : null}

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
                <SuggestionGroupCard
                  key={group.supplierId ?? 'unmapped'}
                  group={group}
                  onCreateDraft={props.onCreateDraft}
                  creating={props.creatingFor === group.supplierId}
                />
              ))}
            </div>
          )
        ) : null}

        {tab === 'orders' ? (
          orders.length === 0 ? (
            <p className="px-6 py-10 text-center font-ops-body text-ops-sm text-ops-muted">
              {urlState.status === 'all'
                ? 'Henüz tedarik siparişi yok — “Sipariş zamanı” sekmesinden taslak oluşturduğunuzda burada görünür.'
                : 'Bu durumda sipariş yok — süzgeci genişletin.'}
            </p>
          ) : (
            <div className="flex flex-col">
              {orders.map((row) => (
                <OrderCard key={row.id} row={row} today={data.today} onOpen={props.onOpenOrder} />
              ))}
              <LoadMoreSentinel hasMore={hasMoreOrders} loading={loadingMoreOrders} onLoadMore={onLoadMoreOrders} />
            </div>
          )
        ) : null}

        {tab === 'suppliers' ? (
          (data.suppliers?.length ?? 0) === 0 ? (
            <p className="px-6 py-10 text-center font-ops-body text-ops-sm text-ops-muted">
              Henüz tedarikçi yok — sipariş verebilmek için önce kimden aldığınızı tanıtın.
            </p>
          ) : (
            <div className="flex flex-col gap-3 px-3 py-3">
              {data.suppliers!.map((supplier) => (
                <SupplierCard key={supplier.id} supplier={supplier} onEdit={props.onEditSupplier} />
              ))}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

/** Sipariş kartı — tablonun altı sütunu iki satıra iner; kabul kırılımı korunur (asıl bilgi o). */
function OrderCard({ row, today, onOpen }: { row: PurchaseOrderRowView; today: string; onOpen: (id: string) => void }) {
  const received = receivedText(row);
  const totalUnknown = row.missingPriceCount > 0 && row.missingPriceCount === row.itemCount;
  const waiting = waitingText(row, today);
  return (
    <article
      onClick={() => onOpen(row.id)}
      className="flex cursor-pointer flex-col gap-1.5 border-b border-ops-line-soft px-4 py-3 active:bg-ops-subtle"
    >
      <div className="flex items-center gap-2">
        <span className="mr-auto truncate font-ops-body text-ops-base font-semibold text-ops-ink">{row.supplierName}</span>
        <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
      </div>
      <div className="flex items-center gap-2 font-ops-mono text-ops-xs text-ops-muted">
        <span>{shortDate(row.createdAt)}</span>
        <span>·</span>
        <span>{row.itemCount} kalem</span>
        {/* Para biçimi TEK kaynaktan (`money`): "amount + ' €'" aynı kararın ikinci kopyasıydı. */}
        <span className="ml-auto text-ops-ink">
          {totalUnknown ? '—' : `${row.missingPriceCount > 0 ? '≈ ' : ''}${money(row.totalCents)}`}
        </span>
      </div>
      <div className="flex items-center gap-2 font-ops-mono text-ops-xs">
        <span className={receivedToneClass(row)}>{received.main}</span>
        <span className="truncate text-ops-muted">{received.meta}</span>
        {/* "Ne zamandır bekliyorum" — telefonda asıl soru bu; masaüstünde de kabul sütununda duruyor. */}
        {waiting ? <span className="ml-auto shrink-0 text-ops-strong">{waiting}</span> : null}
      </div>
    </article>
  );
}
