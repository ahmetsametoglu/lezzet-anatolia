'use client';

import { Badge } from '@/components/operation/ui/badge';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { PRICES_COLUMN_TRACKS } from '../prices-columns';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { Table, withCells, type Column } from '@/components/operation/ui/table';
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

export function ChannelsTab({ rows, hasMore, loadingMore, onLoadMore, onEdit, scope, search, counts, navPending }: PricesViewProps) {
  const columns: Column<PriceRow>[] = withCells<PriceRow>(PRICES_COLUMN_TRACKS, {
    name: (r) => (
      <div className="flex min-w-0 flex-col gap-px">
        <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{r.title}</span>
        <span className="truncate font-ops-body text-ops-xs text-ops-muted">
          {r.categoryName || 'kategorisiz'}
          {rowStateNote(r)}
        </span>
      </div>
    ),
    b2c: (r) => <ChannelCell channel="b2c" cents={r.b2c.amountCents} />,
    b2b: (r) => <ChannelCell channel="b2b" cents={r.b2b.amountCents} />,
    cost: (r) => (
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
    margin: (r) => (
      <span title={marginHint(r)}>
        <Badge tone={marginTone(r)}>{marginText(r)}</Badge>
      </span>
    ),
    auto: (r) => (
      <span
        className={`inline-block h-2 w-2 rounded-full ${r.autoPrice ? 'bg-ops-olive' : 'border-[1.5px] border-ops-line-strong'}`}
        title={
          r.autoPrice
            ? 'Otomatik fiyat açık — fiyat elle değil, hedef marjdan hesaplanır'
            : 'Otomatik fiyat kapalı — marj-altına düşünce yalnız uyarır'
        }
      />
    ),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Table
        busy={navPending}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.variantId}
        onRowClick={(r) => onEdit(r.variantId)}
        empty={<CleanState filtered={Boolean(search) || scope !== 'all'} scopeLabel={SCOPE_LABEL[scope]} />}
        footer={
          <>
            <LoadMoreSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />
            {/* Alt şerit (tasarım): solda açıklama, SAĞDA marj-altı sayacı. O çip "bugün bir işin
                var" göstergesidir; yalnız başlıkta durunca liste kaydırılırken gözden kayboluyordu. */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-3">
              <span className="mr-auto font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
                Satıra tıkla → fiyat düzenle. Otomatik fiyatı açık üründe fiyat elle değil, hedef marj değişir. Fiyat değişikliği verilmiş
                siparişleri etkilemez.
              </span>
              {counts.below > 0 ? (
                <span className="flex-none rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-[11px] py-[5px] font-ops-body text-ops-xs font-medium text-ops-red">
                  <strong className="font-ops-mono">{counts.below}</strong> marj-altı
                </span>
              ) : null}
            </div>
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
    return <EmptyState title="Henüz fiyatlanacak boy yok" description="Ürün eklendiğinde boyları burada listelenir." />;
  }
  return (
    <EmptyState
      title="Bu süzgeçte satır yok"
      description={`“${scopeLabel}” ölçütüne uyan boy bulunamadı — yüklenmiş sayfalarda. Liste sayfalıdır; aşağı kaydırıp devamını yükleyince ölçüte uyan satır çıkabilir.`}
    />
  );
}
