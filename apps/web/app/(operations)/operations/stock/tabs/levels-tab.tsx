'use client';

import { Badge } from '@/components/operation/ui/badge';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { Table, type Column } from '@/components/operation/ui/table';
import { daysLabel, money, shortDate } from '@/components/operation/ui/format';
import { batchAction, expiryBadge } from '../stock-labels';
import type { BatchView, StockLevelRow, StockViewProps } from '../stock-types';

// Stok seviyeleri — SOL tabloda boylar (fiili/ayrılmış/kullanılabilir + en yakın tarih), SAĞ panelde
// seçili boyun partileri. İki panel bilinçli: "satabileceğim ne kadar" ile "hangi partiden" ayrı
// sorulardır; birini tabloya sığdırmaya çalışmak ikisini de okunmaz yapardı.
//
// Satırı açmak yeni bir okuma İSTEMEZ: partiler zaten satırla birlikte geldi (elde ne varsa o kadar).

export function LevelsTab({ levels, selectedId, onSelect, hasMoreLevels, loadingLevels, onLoadMoreLevels, onOpenOffer }: StockViewProps) {
  const selected = levels.find((r) => r.variantId === selectedId) ?? null;

  const columns: Column<StockLevelRow>[] = [
    {
      key: 'name',
      header: 'Boy',
      width: 'minmax(180px,1fr)',
      cell: (r) => (
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{r.title}</span>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            {r.categoryName} · {r.batches.length === 0 ? 'parti yok' : `${r.batches.length} parti`}
            {/* Satılamaz olmak stoğu yok saymaz — mal duruyor, satışı kapalı. İkisini ayırmak, "neden
                satmıyorum" sorusunu ekranda cevaplar. */}
            {r.status === 'passive' ? ' · ürün pasif' : r.status === 'candidate' ? ' · aday ürün' : ''}
            {r.variantActive ? '' : ' · boy kapalı'}
          </span>
        </div>
      ),
    },
    {
      key: 'available',
      header: 'Kullanılabilir',
      width: '104px',
      align: 'right',
      cell: (r) => (
        <div className="flex flex-col items-end gap-px">
          <span
            className={`font-ops-mono text-ops-base ${r.availableQty === 0 ? 'text-ops-red' : 'text-ops-ink'}`}
            title="Fiili − aktif rezervasyon"
          >
            {r.availableQty}
          </span>
          {r.belowMin ? (
            <span className="font-ops-mono text-ops-micro text-ops-amber" title="Sipariş eşiğinin altında">
              eşik {r.minStockQty}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'reserved',
      header: 'Ayrılmış',
      width: '82px',
      align: 'right',
      cell: (r) => (
        <span
          className="font-ops-mono text-ops-sm text-ops-muted"
          title="Siparişe ayrılmış — mal depoda duruyor ama satılabilir değil"
        >
          {r.reservedQty}
        </span>
      ),
    },
    {
      key: 'physical',
      header: 'Fiili',
      width: '72px',
      align: 'right',
      cell: (r) => <span className="font-ops-mono text-ops-sm text-ops-muted">{r.physicalQty}</span>,
    },
    {
      key: 'nearest',
      header: 'En yakın',
      width: '132px',
      align: 'right',
      cell: (r) => {
        if (!r.nearest) return <span className="font-ops-body text-ops-xs text-ops-faint">stok yok</span>;
        const badge = expiryBadge(r.nearest);
        return (
          <div className="flex flex-col items-end gap-px">
            <Badge tone={badge.tone}>{badge.text}</Badge>
            <span className="font-ops-mono text-ops-micro text-ops-muted">{shortDate(r.nearest.expiryDate)}</span>
          </div>
        );
      },
    },
  ];

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] overflow-hidden">
      <div className="flex min-h-0 flex-col border-r border-ops-line">
        <Table
          columns={columns}
          rows={levels}
          rowKey={(r) => r.variantId}
          onRowClick={(r) => onSelect(r.variantId)}
          isRowActive={(r) => r.variantId === selectedId}
          empty={
            <div className="flex flex-1 items-center justify-center p-10">
              <span className="font-ops-body text-ops-base text-ops-muted">
                Bu süzgeçle eşleşen boy yok — süzgeci gevşetin.
              </span>
            </div>
          }
          footer={<LoadMoreSentinel hasMore={hasMoreLevels} loading={loadingLevels} onLoadMore={onLoadMoreLevels} />}
        />
      </div>

      <BatchPanel row={selected} onOpenOffer={onOpenOffer} />
    </div>
  );
}

interface BatchPanelProps {
  row: StockLevelRow | null;
  onOpenOffer: (stockId: string) => void;
}

/**
 * Seçili boyun partileri — FEFO sırasında (önce süresi dolan). Sıra admin tarafından yönetilmez ve
 * bunu ekran söyler: hazırlıkta hangi partinin çıkacağı bir karar değil, kuraldır.
 */
function BatchPanel({ row, onOpenOffer }: BatchPanelProps) {
  if (!row) {
    return (
      <div className="flex items-center justify-center bg-ops-subtle p-8">
        <span className="font-ops-body text-ops-base text-ops-muted">Partilerini görmek için bir boy seçin.</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col bg-ops-subtle">
      <div className="flex flex-col gap-px border-b border-ops-line px-5 py-3">
        <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">{row.title}</span>
        <span className="font-ops-body text-ops-xs text-ops-muted">
          {row.batches.length === 0
            ? 'Bu boyda elde parti yok'
            : `${row.batches.length} parti · hazırlıkta önce süresi dolan çıkar (FEFO)`}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-5 py-4">
        {row.batches.length === 0 ? (
          <span className="font-ops-body text-ops-sm text-ops-muted">
            Stok girişi depo ekranından yapılır — burası görünüm ve karar yeridir.
          </span>
        ) : (
          row.batches.map((b) => <BatchCard key={b.id} batch={b} onOpenOffer={onOpenOffer} />)
        )}
      </div>
    </div>
  );
}

interface BatchCardProps {
  batch: BatchView;
  onOpenOffer: (stockId: string) => void;
}

/** Tek parti kartı — künye (lot, konum, alış fiyatı) + tarih durumu + teklif yolu. */
function BatchCard({ batch, onOpenOffer }: BatchCardProps) {
  const badge = expiryBadge(batch);
  const action = batchAction(batch);

  return (
    <div className="flex flex-col gap-2.5 rounded-ops-card border border-ops-line bg-ops-white p-3">
      <div className="flex items-start gap-2">
        <div className="mr-auto flex min-w-0 flex-col gap-px">
          <span className="font-ops-mono text-ops-sm text-ops-ink">{batch.lotNumber ?? 'lot no yok'}</span>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            {shortDate(batch.expiryDate)} · {daysLabel(batch.daysLeft)}
          </span>
        </div>
        <Badge tone={badge.tone}>{badge.text}</Badge>
      </div>

      {/* Kalan raf ömrü ÇUBUK olarak: yüzde bir karar eşiği ve göz onu sayıdan hızlı okur. Ömür
          girilmemişse çubuk hiç çizilmez — boş bir çubuk "%0" gibi görünürdü. */}
      {batch.remainingPercent !== null ? (
        <div className="flex items-center gap-2">
          {/* Çubuk `rounded-full` — bir YARIÇAP kademesi değil, tam yuvarlak uç (token gerekmez). */}
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ops-line-soft">
            <span
              className={`block h-full ${badge.tone === 'red' ? 'bg-ops-red-dot' : badge.tone === 'amber' ? 'bg-ops-amber-dot' : 'bg-ops-olive'}`}
              style={{ width: `${Math.max(2, Math.round(batch.remainingPercent))}%` }}
            />
          </span>
          <span className="font-ops-mono text-ops-micro text-ops-muted">kalan %{Math.round(batch.remainingPercent)}</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-ops-body text-ops-xs text-ops-muted">
        <span>
          <span className="text-ops-faint">elde</span> <span className="font-ops-mono text-ops-body">{batch.physicalQty}</span>
          {batch.initialQty !== batch.physicalQty ? <span className="text-ops-faint"> / {batch.initialQty}</span> : null}
        </span>
        {batch.location ? <span>{batch.location}</span> : null}
        {/* Alış fiyatı YALNIZ admin ekranında: depo maliyet görmez (design/pages/admin-stok §6). */}
        <span>
          <span className="text-ops-faint">alış</span>{' '}
          <span className="font-ops-mono text-ops-body">{money(batch.purchasePriceCents)}</span>
        </span>
        {batch.belowMlor ? (
          <span className="text-ops-amber" title="Kalan ömrü MLOR eşiğinin (%75) altında — teklif kararına bağlam">
            kısa ömürlü
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-ops-line-soft pt-2.5">
        {batch.offerPriceCents !== null ? (
          <span className="mr-auto font-ops-body text-ops-xs text-ops-olive-dark">
            Teklif <span className="font-ops-mono text-ops-sm">{money(batch.offerPriceCents)}</span>
            <span className="text-ops-muted"> · tavan {batch.physicalQty} ad.</span>
          </span>
        ) : (
          <span className="mr-auto font-ops-body text-ops-xs text-ops-muted">
            {action.kind === 'discard' ? 'Satılamaz — imha kaydı depo ekranından' : 'Teklif yok'}
          </span>
        )}
        {action.kind === 'discard' ? null : (
          <button
            type="button"
            onClick={() => onOpenOffer(batch.id)}
            className="cursor-pointer rounded-ops-btn border border-ops-line bg-ops-white px-2.5 py-1.5 font-ops-display text-ops-xs font-semibold text-ops-body hover:border-ops-olive hover:text-ops-olive-dark"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
