'use client';

import { Badge } from '@/components/operation/ui/badge';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { Table, withCells, type Column } from '@/components/operation/ui/table';
import { amount, shortDate } from '@/components/operation/ui/format';
import { PROCUREMENT_ORDER_TRACKS } from './procurement-columns';
import { receivedText, receivedToneClass, statusLabel, statusTone } from './procurement-labels';
import type { PurchaseOrderRowView } from './procurement-types';

// Siparişler sekmesi — "neyi bekliyorum" listesi. Sütun sırası sorunun sırası: KİMDEN → kaç kalem →
// ne tutar → NE KADARI GELDİ (depo kırılımıyla) → ne zaman → hangi hâlde.
//
// Satır tıklaması GÖNDERİM penceresini açar: tedarik siparişinin hayattaki asıl anı "listeyi
// tedarikçiye ilet"tir (DOMAIN §16). Tam sipariş detayı (kalem kalem kabul) ayrı bir ekran ve
// henüz yok — pencere o gelene kadar listeyi, gönderim yollarını ve iptali taşır.

interface OrdersTabProps {
  rows: PurchaseOrderRowView[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  busy: boolean;
  onOpenOrder: (orderId: string) => void;
}

export function OrdersTab({ rows, hasMore, loadingMore, onLoadMore, busy, onOpenOrder }: OrdersTabProps) {
  const columns: Column<PurchaseOrderRowView>[] = withCells<PurchaseOrderRowView>(PROCUREMENT_ORDER_TRACKS, {
    supplier: (r) => (
      <div className="flex min-w-0 flex-col gap-px">
        <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{r.supplierName}</span>
        {/* Sipariş referansı YOK (arka uç notu): insan-okur bir numara şemada tanımlı değil, uydurulmaz. */}
        <span className="truncate font-ops-body text-ops-xs text-ops-muted">{shortDate(r.createdAt)}</span>
      </div>
    ),
    items: (r) => <span className="font-ops-mono text-ops-sm text-ops-strong">{r.itemCount}</span>,
    total: (r) => <TotalCell row={r} />,
    received: (r) => <ReceivedCell row={r} />,
    date: (r) => <span className="font-ops-mono text-ops-xs text-ops-muted">{shortDate(r.createdAt)}</span>,
    status: (r) => <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>,
  });

  return (
    <Table
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      busy={busy}
      onRowClick={(row) => onOpenOrder(row.id)}
      empty={<OrdersEmpty />}
      footer={<LoadMoreSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />}
    />
  );
}

/**
 * Tutar. Fiyatı girilmemiş kalem varsa "≈" — eksik ölçüm tam gibi gösterilmez (`CLAUDE.md §1`);
 * hiçbir kalemin fiyatı yoksa tutar hiç yazılmaz, çünkü "0,00 €" bedava alım demektir.
 */
function TotalCell({ row }: { row: PurchaseOrderRowView }) {
  if (row.missingPriceCount > 0 && row.missingPriceCount === row.itemCount) {
    return (
      <span className="font-ops-mono text-ops-sm text-ops-faint" title="Hiçbir kalemin alış fiyatı girilmemiş">
        —
      </span>
    );
  }
  return (
    <span
      className="font-ops-mono text-ops-sm text-ops-ink"
      title={row.missingPriceCount > 0 ? `${row.missingPriceCount} kalemin fiyatı girilmemiş — tutar eksik` : undefined}
    >
      {row.missingPriceCount > 0 ? '≈ ' : ''}
      {amount(row.totalCents)}
    </span>
  );
}

/** Kabul: "8 / 12 kalem" + fiilen giren depoların kırılımı ("STR 6 · COL 2"). */
function ReceivedCell({ row }: { row: PurchaseOrderRowView }) {
  const { main, meta } = receivedText(row);
  return (
    <div className="flex min-w-0 flex-col gap-px">
      <span className={`font-ops-mono text-ops-xs ${receivedToneClass(row)}`}>{main}</span>
      <span className="truncate font-ops-mono text-ops-micro text-ops-muted">{meta}</span>
    </div>
  );
}

/** Boş hâl — sipariş yokluğu bir arıza değil; ne zaman satır doğacağını söyler. */
function OrdersEmpty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-10">
      <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">Henüz tedarik siparişi yok</span>
      <span className="max-w-[420px] text-center font-ops-body text-ops-sm leading-relaxed text-ops-muted">
        “Sipariş zamanı” sekmesinden bir tedarikçi grubu seçip taslak oluşturduğunuzda sipariş burada görünür ve
        gelene kadar listede kalır.
      </span>
    </div>
  );
}
