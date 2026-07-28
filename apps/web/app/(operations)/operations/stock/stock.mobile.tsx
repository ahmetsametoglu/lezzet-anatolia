'use client';

import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { PageHeader } from '@/components/operation/ui/page-header';
import { Tabs } from '@/components/operation/ui/tabs';
import { SearchIcon } from '@/components/operation/ui/icons';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { money, percent } from '@/components/operation/ui/format';
import { AttentionTab } from './tabs/attention-tab';
import { LossesTab } from './tabs/losses-tab';
import { expiryBadge, expiryLine } from './stock-labels';
import type { StockLevelRow, StockViewProps } from './stock-types';
import type { StockTab } from './stock-url';

// Stok — MOBİL. Telefonda iki iş var (tasarım notu): günlük olan "yaklaşan tarihliye bakıp teklif
// açmak", acil olan "lot ile geri çağırma sorgusu". Bu yüzden mobil AÇILIŞI yaklaşan tarihlidir ve
// geri çağırma başlıkta, tek dokunuş uzaklıkta durur.
//
// Seviyeler burada da vardır ama KART olarak: telefonda beş sütunlu tablo okunmaz. İki panelli düzen
// (liste + parti paneli) mobilde yoktur — satır kendi partilerini altında açar.

const TABS: Array<{ key: StockTab; label: string }> = [
  { key: 'attention', label: 'Karar' },
  { key: 'levels', label: 'Seviyeler' },
  { key: 'losses', label: 'İmha' },
];

export function StockMobile(props: StockViewProps) {
  const { data, tab, onTab, onOpenRecall } = props;
  const { attention, blocked } = data.counts;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="Stok"
        subtitle={`${attention} parti karar bekliyor${blocked > 0 ? ` · ${blocked} imhalık` : ''}`}
      >
        <Button variant="secondary" size="sm" onClick={onOpenRecall}>
          <SearchIcon />
          Lot
        </Button>
      </PageHeader>

      <Tabs items={TABS.map((t) => (t.key === 'attention' ? { ...t, badge: attention } : t))} active={tab} onSelect={onTab} />

      {tab === 'attention' && <AttentionTab {...props} />}
      {tab === 'levels' && <MobileLevels {...props} />}
      {tab === 'losses' && <LossesTab {...props} />}
    </div>
  );
}

/** Seviyeler mobilde kart listesi: satır tıklanınca partileri altında açılır (ayrı panel yok). */
function MobileLevels({ levels, selectedId, onSelect, hasMoreLevels, loadingLevels, onLoadMoreLevels, onOpenOffer }: StockViewProps) {
  if (levels.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <span className="font-ops-body text-ops-base text-ops-muted">Bu süzgeçle eşleşen boy yok.</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
      {levels.map((row) => (
        <LevelCard
          key={row.variantId}
          row={row}
          open={row.variantId === selectedId}
          onToggle={() => onSelect(row.variantId)}
          onOpenOffer={onOpenOffer}
        />
      ))}
      <LoadMoreSentinel hasMore={hasMoreLevels} loading={loadingLevels} onLoadMore={onLoadMoreLevels} />
    </div>
  );
}

interface LevelCardProps {
  row: StockLevelRow;
  open: boolean;
  onToggle: () => void;
  onOpenOffer: (stockId: string) => void;
}

function LevelCard({ row, open, onToggle, onOpenOffer }: LevelCardProps) {
  return (
    <div className="flex flex-col rounded-ops-card border border-ops-line bg-ops-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex cursor-pointer items-center gap-3 px-3.5 py-3 text-left active:bg-ops-subtle"
      >
        <div className="mr-auto flex min-w-0 flex-col gap-px">
          <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{row.title}</span>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            {row.batches.length === 0 ? 'parti yok' : `${row.batches.length} parti`}
            {row.reservedQty > 0 ? ` · ${row.reservedQty} ayrılmış` : ''}
            {row.belowMin ? ' · eşik altı' : ''}
          </span>
        </div>
        <div className="flex flex-none flex-col items-end gap-px">
          <span className={`font-ops-mono text-ops-lead ${row.availableQty === 0 ? 'text-ops-red' : 'text-ops-ink'}`}>
            {row.availableQty}
          </span>
          {row.nearest ? <Badge tone={expiryBadge(row.nearest).tone}>{expiryBadge(row.nearest).text}</Badge> : null}
        </div>
      </button>

      {open && row.batches.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-ops-line-soft px-3.5 py-3">
          {row.batches.map((b) => (
            <div key={b.id} className="flex items-center gap-2.5">
              <div className="mr-auto flex min-w-0 flex-col gap-px">
                <span className="font-ops-mono text-ops-sm text-ops-ink">{b.lotNumber ?? 'lot no yok'}</span>
                <span className="font-ops-body text-ops-xs text-ops-muted">
                  {b.physicalQty} ad.
                  {b.remainingPercent !== null ? ` · kalan ${percent(b.remainingPercent)}` : ''}
                </span>
                {/* Tarih satırı TİPİYLE birlikte: DLC ile DDM'in sonucu farklı, yalnız tarih yetmez. */}
                <span className={`font-ops-mono text-ops-xs ${b.decision === 'must_discard' ? 'text-ops-red' : 'text-ops-muted'}`}>
                  {expiryLine(b)}
                </span>
              </div>
              {b.decision === 'must_discard' ? (
                <span className="font-ops-body text-ops-xs font-semibold text-ops-red">imha</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenOffer(b.id)}
                  className="flex-none cursor-pointer rounded-ops-btn border border-ops-line px-2.5 py-1.5 font-ops-display text-ops-xs font-semibold text-ops-body active:border-ops-olive"
                >
                  {b.offerPriceCents !== null ? money(b.offerPriceCents) : 'Teklif'}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
