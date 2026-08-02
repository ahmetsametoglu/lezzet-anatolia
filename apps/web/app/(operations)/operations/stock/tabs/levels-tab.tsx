'use client';

import { Badge } from '@/components/operation/ui/badge';
import { STOCK_COLUMN_TRACKS } from '../stock-columns';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { Table, withCells, type Column } from '@/components/operation/ui/table';
import { money, shortDate } from '@/components/operation/ui/format';
import { expiryBadge } from '@/lib/stock/batch-labels';
import { totalRiskCents } from '@/lib/stock/batch-labels';
import { DecisionCard } from './attention-tab';
import type { BatchView, StockLevelRow, StockViewProps } from '../stock-types';

/** Sağ panelin önizleme sınırı — kuyruğun tamamı kendi sekmesinde; burası "bugün ne bekliyor" bakışı. */
const URGENT_PREVIEW = 3;

// Stok seviyeleri — SOL tabloda boylar (fiili/ayrılmış/kullanılabilir + en yakın tarih), SAĞ panelde
// KARAR KUYRUĞUNUN ilk üçü.
//
// Panel seçili satıra bağlı DEĞİL: aciliyet listeden bağımsızdır. Operatör hangi ürüne bakarsa baksın
// aynı üç parti bekliyordur; paneli seçime bağlamak, kuyruğu ancak doğru satıra tıklayınca görünür
// kılardı. Tam karar yüzeyi kendi sekmesinde, burası ona giden kapı.

export function LevelsTab({
  data,
  levels,
  selectedId,
  onSelect,
  hasMoreLevels,
  loadingLevels,
  onLoadMoreLevels,
  onOpenOffer,
  onTab,
  navPending,
  openVariantId,
  onToggleSplit,
}: StockViewProps) {
  const { warehouse } = data;
  const columns: Column<StockLevelRow>[] = withCells<StockLevelRow>(STOCK_COLUMN_TRACKS, {
    name: (r) => (
      <div className="flex min-w-0 flex-col gap-px">
        <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{r.title}</span>
        <span className="flex items-center gap-1.5 font-ops-body text-ops-xs text-ops-muted">
          <span className="truncate">
            {r.categoryName} · {r.batches.length === 0 ? 'parti yok' : `${r.batches.length} parti`}
            {/* Satılamaz olmak stoğu yok saymaz — mal duruyor, satışı kapalı. İkisini ayırmak, "neden
                satmıyorum" sorusunu ekranda cevaplar. */}
            {r.status === 'passive' ? ' · ürün pasif' : r.status === 'candidate' ? ' · aday ürün' : ''}
            {r.variantActive ? '' : ' · boy kapalı'}
          </span>
          {/* "N depoda" — sayı DİZİDEN okunur, ayrıca tutulmaz: iki gerçek ayrışamaz. Tek depoda
              doğrudan kod yazılır, çünkü "1 depoda" hiçbir şey söylemez. */}
          {warehouse.showSplit && r.warehouses.length > 0 ? (
            <Badge tone="blue" className="flex-none font-ops-mono">
              {r.warehouses.length > 1 ? `${r.warehouses.length} depoda` : r.warehouses[0]?.code}
              {r.warehouses.length > 1 ? (openVariantId === r.variantId ? ' ▴' : ' ▾') : ''}
            </Badge>
          ) : null}
        </span>
      </div>
    ),
    available: (r) => (
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
    reserved: (r) => (
      <span className="font-ops-mono text-ops-sm text-ops-muted" title="Siparişe ayrılmış — mal depoda duruyor ama satılabilir değil">
        {r.reservedQty}
      </span>
    ),
    physical: (r) => <span className="font-ops-mono text-ops-sm text-ops-muted">{r.physicalQty}</span>,
    nearest: (r) => {
      if (!r.nearest) return <span className="font-ops-body text-ops-xs text-ops-faint">stok yok</span>;
      const badge = expiryBadge(r.nearest);
      return (
        <div className="flex flex-col items-end gap-px">
          <Badge tone={badge.tone}>{badge.text}</Badge>
          <span className="font-ops-mono text-ops-micro text-ops-muted">{shortDate(r.nearest.expiryDate)}</span>
        </div>
      );
    },
  });

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] overflow-hidden">
      <div className="flex min-h-0 flex-col border-r border-ops-line">
        <Table
          busy={navPending}
          columns={columns}
          rows={levels}
          rowKey={(r) => r.variantId}
          onRowClick={(r) => {
            onSelect(r.variantId);
            // Kırılım YALNIZ çok depolu satırda açılır; tek depolu satırda açacak bir şey yok ve
            // tıklama seçimden ibaret kalır.
            if (warehouse.showSplit && r.warehouses.length > 1) onToggleSplit(r.variantId);
          }}
          isRowActive={(r) => r.variantId === selectedId}
          renderSubRow={(r) =>
            warehouse.showSplit && openVariantId === r.variantId && r.warehouses.length > 1 ? (
              <WarehouseSplit row={r} />
            ) : null
          }
          empty={
            <div className="flex flex-1 items-center justify-center p-10">
              <span className="font-ops-body text-ops-base text-ops-muted">Bu süzgeçle eşleşen boy yok — süzgeci gevşetin.</span>
            </div>
          }
          footer={<LoadMoreSentinel hasMore={hasMoreLevels} loading={loadingLevels} onLoadMore={onLoadMoreLevels} />}
        />
      </div>

      <UrgentPanel batches={data.attention} onOpenOffer={onOpenOffer} onSeeAll={() => onTab('attention')} />
    </div>
  );
}

/**
 * Depo kırılımı — satırın altında açılan blok.
 *
 * Sayılar satırın toplamının parçalarıdır, ayrı bir okuma değil (`toLevelRows`). Blok bir KARAR
 * yeri değil bir bakış: transfer kararı burada verilmez, çünkü karar iki deponun ihtiyacını
 * karşılaştırmayı gerektirir ve o karşılaştırma Transfer ekranının işidir.
 */
function WarehouseSplit({ row }: { row: StockLevelRow }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-ops-line-soft bg-ops-subtle px-5 py-2.5">
      {row.warehouses.map((w) => (
        <div key={w.warehouseId} className="flex items-center gap-2.5 pl-4">
          <span className="h-1.5 w-1.5 flex-none rounded-full bg-ops-blue" />
          <span className="min-w-0 flex-1 truncate font-ops-body text-ops-xs text-ops-strong">
            {w.name} <span className="font-ops-mono text-ops-micro text-ops-muted">{w.code}</span>
          </span>
          <span className="flex-none font-ops-mono text-ops-xs text-ops-ink" title="Kullanılabilir">
            {w.availableQty}
          </span>
          <span className="w-14 flex-none text-right font-ops-mono text-ops-micro text-ops-muted" title="Ayrılmış">
            {w.reservedQty > 0 ? `${w.reservedQty} ayrılmış` : ''}
          </span>
          <span className="w-20 flex-none text-right font-ops-mono text-ops-micro text-ops-muted" title="En yakın son tarih">
            {w.nearestExpiry ? shortDate(w.nearestExpiry) : ''}
          </span>
        </div>
      ))}
      <span className="pl-4 font-ops-body text-ops-micro text-ops-faint">
        Transfer kararı burada verilmez — Transfer ekranından. Eşik ve karar kuyruğu depo bazlıdır,
        yaklaşan tarihli sekmesinde deposuyla görünür.
      </span>
    </div>
  );
}

interface UrgentPanelProps {
  batches: BatchView[];
  onOpenOffer: (stockId: string) => void;
  onSeeAll: () => void;
}

/**
 * **En acil partiler** — karar kuyruğunun ilk üçü, seviyelere bakarken görünen önizleme.
 *
 * Tam karar yüzeyi kendi sekmesinde (gruplu, filtreli); burası "bugün bir şey bekliyor mu" sorusunun
 * cevabı. Panel BOYA değil KUYRUĞA bağlıdır: seçili satır değişince içeriği değişmez — aciliyet
 * listeden bağımsızdır, operatör hangi ürüne bakarsa baksın aynı üç parti bekliyordur.
 *
 * Riskteki tutar başlıkta: "3 parti" ile "620 € çöpe gidecek" aynı cümle değildir ve ikincisi
 * operatörü sekmeye götüren şeydir.
 */
function UrgentPanel({ batches, onOpenOffer, onSeeAll }: UrgentPanelProps) {
  if (batches.length === 0) {
    return (
      <div className="flex items-start justify-center bg-ops-subtle p-6">
        <div className="flex flex-col gap-1.5 rounded-ops-card border border-ops-line bg-ops-white px-4 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-ops-olive-bg font-ops-display text-ops-base font-semibold text-ops-olive-dark">
              ✓
            </span>
            <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">Tarih riski yok</span>
          </div>
          <span className="font-ops-body text-ops-sm leading-[1.6] text-ops-body">
            Eşik altına inen parti yok. Bir parti eşiği geçtiğinde burada ve “Yaklaşan tarihli” sekmesinde görünür.
          </span>
        </div>
      </div>
    );
  }

  // En az kalan üstte; ömrü bilinmeyen sona. Satılamazlar her hâlde önce — geri dönüşü yok.
  const sorted = [...batches].sort((a, b) => {
    const blocked = Number(b.decision === 'must_discard') - Number(a.decision === 'must_discard');
    if (blocked !== 0) return blocked;
    return (a.remainingPercent ?? Number.POSITIVE_INFINITY) - (b.remainingPercent ?? Number.POSITIVE_INFINITY);
  });
  const top = sorted.slice(0, URGENT_PREVIEW);
  const risk = totalRiskCents(batches);

  return (
    <div className="flex min-h-0 flex-col bg-ops-subtle">
      <div className="flex flex-none flex-col gap-0.5 border-b border-ops-line px-5 py-3">
        <div className="flex items-baseline gap-2">
          <span className="font-ops-display text-ops-base font-semibold text-ops-ink">En acil partiler</span>
          {risk !== null ? <span className="font-ops-mono text-ops-xs text-ops-red">{money(risk)} riskte</span> : null}
        </div>
        <span className="font-ops-body text-ops-xs text-ops-muted">En az kalan üstte · tam karar yüzeyi “Yaklaşan tarihli” sekmesinde</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[11px] overflow-y-auto px-5 py-3.5">
        {top.map((b) => (
          <DecisionCard key={b.id} batch={b} onOpenOffer={onOpenOffer} />
        ))}
        {/* Kuyruğun tamamı sekmede: önizleme üçle sınırlı ve bunu SÖYLER — sessizce kesilen bir liste,
            "hepsi bu kadarmış" sanılır. */}
        <button
          type="button"
          onClick={onSeeAll}
          className="cursor-pointer rounded-ops-btn border border-ops-olive-line px-3 py-2.5 font-ops-display text-ops-sm font-semibold text-ops-olive-dark hover:bg-ops-olive-bg"
        >
          {batches.length} partinin tümü →
        </button>
      </div>
    </div>
  );
}
