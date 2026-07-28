'use client';

import { Badge } from '@/components/operation/ui/badge';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { Table, type Column } from '@/components/operation/ui/table';
import { money, shortDate, shortDateTime } from '@/components/operation/ui/format';
import { LOSS_REASON } from '../stock-labels';
import type { LossRow, StockViewProps } from '../stock-types';

// İmha / fire geçmişi — "bu üründen ne kadar çöpe gitti" görünür kalır. Ayrıntılı analiz raporlarda
// (DOMAIN §12); burası olayın kendisidir.
//
// Miktar İŞARETLİ: pozitif stoktan düşüm (imha/fire/kayıp), negatif stoğa geri ekleme (sayım fazlası,
// iade restoku). Tek alanda tutulur ki toplam NET kaybı versin; iki ayrı sütun "şişmiş imha" rakamı
// üretirdi. Ekran işareti renkle değil YÖNLE söyler: geri ekleme bir kayıp değildir, kırmızı olmamalı.

export function LossesTab({ losses, search, hasMoreLosses, loadingLosses, onLoadMoreLosses }: StockViewProps) {
  const term = search.trim().toLocaleLowerCase('tr');
  const rows = losses.filter((r) => !term || r.title.toLocaleLowerCase('tr').includes(term));

  const columns: Column<LossRow>[] = [
    {
      key: 'when',
      header: 'Tarih',
      width: '124px',
      cell: (r) => <span className="font-ops-mono text-ops-sm text-ops-muted">{shortDateTime(r.createdAt)}</span>,
    },
    {
      key: 'what',
      header: 'Ürün / parti',
      width: 'minmax(200px,1fr)',
      cell: (r) => (
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate font-ops-body text-ops-base text-ops-ink">{r.title}</span>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            {r.stock.lotNumber ? `Lot ${r.stock.lotNumber} · ` : ''}
            son tarih {shortDate(r.stock.expiryDate)}
          </span>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Sebep',
      width: '164px',
      cell: (r) => (
        <div className="flex min-w-0 flex-col gap-px">
          <Badge tone={r.qty < 0 ? 'olive' : r.reason === 'expired' ? 'red' : 'amber'}>{LOSS_REASON[r.reason]}</Badge>
          {r.note ? (
            <span className="truncate font-ops-body text-ops-xs text-ops-muted" title={r.note}>
              {r.note}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'Adet',
      width: '84px',
      align: 'right',
      cell: (r) => (
        <span className="font-ops-mono text-ops-base text-ops-ink" title={r.qty < 0 ? 'Stoğa geri eklendi' : 'Stoktan düşüldü'}>
          {r.qty < 0 ? `+${-r.qty}` : `−${r.qty}`}
        </span>
      ),
    },
    {
      key: 'cost',
      header: 'Maliyet',
      width: '104px',
      align: 'right',
      cell: (r) => (
        <span
          className="font-ops-mono text-ops-sm text-ops-muted"
          title={r.costCents === null ? 'Partinin alış fiyatı girilmemiş — maliyet bilinmiyor' : 'İşlem anındaki alış fiyatından'}
        >
          {money(r.costCents)}
        </span>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      empty={
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-10">
          <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">
            {term ? 'Eşleşen kayıt yok' : 'Hiç imha/fire kaydı yok'}
          </span>
          <span className="font-ops-body text-ops-sm text-ops-muted">
            {term ? 'Arama terimini değiştirin.' : 'Kayıtlar depo ekranındaki imha ve sayım akışından düşer.'}
          </span>
        </div>
      }
      footer={<LoadMoreSentinel hasMore={hasMoreLosses} loading={loadingLosses} onLoadMore={onLoadMoreLosses} />}
    />
  );
}
