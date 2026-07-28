'use client';

import { Badge } from '@/components/operation/ui/badge';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { Table, type Column } from '@/components/operation/ui/table';
import { amount, money } from '@/components/operation/ui/format';
import { channelHint, marginHint, marginText, marginTone, rowStateNote } from '../prices-labels';
import { SCOPE_LABEL } from '../prices-url';
import type { PriceRow, PricesViewProps } from '../prices-types';

// Kanal fiyatları — ekranın ana listesi. Satır BOYDUR: fiyat varyanta yazılır, ama kararın yarısı
// (KDV oranı, hedef marj, otomatik fiyat) üründen gelir.
//
// Sütun sırası kararın sırasıdır: NE (boy) → KAÇA satıyorum (iki kanal) → KAÇA mal oluyor (maliyet)
// → NE kazanıyorum (marj) → otomatik mi. Maliyet fiyatların sağında duruyor ki göz "fiyat–maliyet"
// karşılaştırmasını yan yana yapabilsin.

export function ChannelsTab({ rows, hasMore, loadingMore, onLoadMore, onEdit, scope, search }: PricesViewProps) {
  const columns: Column<PriceRow>[] = [
    {
      key: 'name',
      header: 'Varyant',
      width: 'minmax(180px,1.3fr)',
      cell: (r) => (
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{r.title}</span>
          <span className="truncate font-ops-body text-ops-xs text-ops-muted">
            {r.categoryName || 'kategorisiz'}
            {rowStateNote(r)}
          </span>
        </div>
      ),
    },
    {
      key: 'b2c',
      header: 'B2C',
      width: '86px',
      align: 'right',
      cell: (r) => <ChannelCell channel="b2c" cents={r.b2c.amountCents} />,
    },
    {
      key: 'b2b',
      header: 'B2B',
      width: '86px',
      align: 'right',
      cell: (r) => <ChannelCell channel="b2b" cents={r.b2b.amountCents} />,
    },
    {
      key: 'cost',
      header: 'Maliyet',
      width: '84px',
      align: 'right',
      cell: (r) => (
        <span
          className="font-ops-mono text-ops-sm font-medium text-ops-muted"
          title={
            r.costCents === null
              ? 'Fiyatlı parti yok — maliyet bilinmiyor (sıfır değil)'
              : 'Son alış fiyatı — yeniden almanın bedeli (KDV hariç)'
          }
        >
          {amount(r.costCents)}
        </span>
      ),
    },
    {
      key: 'margin',
      header: 'Marj',
      width: '72px',
      align: 'right',
      cell: (r) => (
        <span title={marginHint(r)}>
          <Badge tone={marginTone(r)}>{marginText(r)}</Badge>
        </span>
      ),
    },
    {
      key: 'auto',
      header: 'auto',
      width: '48px',
      align: 'center',
      cell: (r) => (
        <span
          className={`inline-block h-2 w-2 rounded-full ${r.autoPrice ? 'bg-ops-olive' : 'border-[1.5px] border-ops-line-strong'}`}
          title={
            r.autoPrice
              ? 'Otomatik fiyat açık — fiyat elle değil, hedef marjdan hesaplanır'
              : 'Otomatik fiyat kapalı — marj-altına düşünce yalnız uyarır'
          }
        />
      ),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Table
        columns={columns}
        rows={rows}
        rowKey={(r) => r.variantId}
        onRowClick={(r) => onEdit(r.variantId)}
        empty={<CleanState filtered={Boolean(search) || scope !== 'all'} scopeLabel={SCOPE_LABEL[scope]} />}
        footer={
          <>
            <LoadMoreSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />
            <span className="block px-6 py-3 font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
              Satıra tıkla → fiyat düzenle. Otomatik fiyatı açık üründe fiyat elle değil, hedef marj değişir.
              Fiyat değişikliği verilmiş siparişleri etkilemez.
            </span>
          </>
        }
      />
    </div>
  );
}

interface ChannelCellProps {
  channel: 'b2c' | 'b2b';
  cents: number | null;
}

/**
 * Fiyat hücresi. Fiyatı OLMAYAN kanal tire ile ve amber yazılır: bu bir sıfır değil, bir eksikliktir
 * ve sonucu "o kanalda satışa kapalı"dır — sessiz geçilirse ürünün neden satılmadığı görünmez.
 */
function ChannelCell({ channel, cents }: ChannelCellProps) {
  const has = cents !== null;
  return (
    <span
      className={`font-ops-mono text-ops-base font-medium ${has ? 'text-ops-ink' : 'text-ops-amber'}`}
      title={channelHint(channel, has)}
    >
      {has ? money(cents) : '—'}
    </span>
  );
}

interface CleanStateProps {
  filtered: boolean;
  scopeLabel: string;
}

/** Boş hâl. Süzgeç sonucu boşsa bu bir EKSİKLİK değil, iyi haber olabilir — metin ikisini ayırır. */
function CleanState({ filtered, scopeLabel }: CleanStateProps) {
  if (!filtered) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-10">
        <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">Henüz fiyatlanacak boy yok</span>
        <span className="font-ops-body text-ops-sm text-ops-muted">Ürün eklendiğinde boyları burada listelenir.</span>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-10">
      <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">Bu süzgeçte satır yok</span>
      <span className="max-w-[420px] text-center font-ops-body text-ops-sm leading-relaxed text-ops-muted">
        “{scopeLabel}” ölçütüne uyan boy bulunamadı — yüklenmiş sayfalarda. Liste sayfalıdır; aşağı kaydırıp
        devamını yükleyince ölçüte uyan satır çıkabilir.
      </span>
    </div>
  );
}
