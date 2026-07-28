'use client';

import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Chip } from '@/components/operation/ui/chip';
import { PageHeader } from '@/components/operation/ui/page-header';
import { SearchInput } from '@/components/operation/ui/search-input';
import { Tabs } from '@/components/operation/ui/tabs';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { amount, money, percent } from '@/components/operation/ui/format';
import { CustomersTab } from './tabs/customers-tab';
import { CouponsTab } from './tabs/coupons-tab';
import { OffersTab } from './tabs/offers-tab';
import { marginText, marginTone, rowStateNote } from './prices-labels';
import { PRICE_SCOPES, SCOPE_LABEL, type PriceTab } from './prices-url';
import type { PriceRow, PricesViewProps } from './prices-types';

// Fiyatlar — MOBİL. Telefondaki iş tasarımın kendi notunda yazılı: **tek fiyat düzeltme** ve
// **marj-altı uyarısına bakıp güncelleme**. Bu yüzden mobil açılışı marj-altı çipiyle aynı yere
// bakar: liste KART'tır (altı sütunlu tablo telefonda okunmaz) ve her kartın kendi "Düzelt"i vardır.
//
// Toplu gözden geçirme masaüstünün işidir — mobilde sütun sıkıştırmak yerine karta indirgiyoruz.

const TABS: Array<{ key: PriceTab; label: string }> = [
  { key: 'channels', label: 'Fiyatlar' },
  { key: 'offers', label: 'Teklif' },
  { key: 'customers', label: 'Özel' },
  { key: 'coupons', label: 'Kupon' },
];

export function PricesMobile(props: PricesViewProps) {
  const { tab, onTab, counts, search, onSearch, scope, onScope } = props;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Fiyatlar" subtitle={`${counts.below} marj-altı · ${counts.missing} fiyatı eksik`} />

      <Tabs items={TABS.map((t) => (t.key === 'channels' && counts.below > 0 ? { ...t, badge: counts.below } : t))} active={tab} onSelect={onTab} />

      {tab === 'channels' ? (
        <>
          <div className="flex flex-col gap-2 border-b border-ops-line px-4 py-2.5">
            <SearchInput value={search} onChange={onSearch} placeholder="Ürün veya boy ara" />
            <div className="flex flex-wrap items-center gap-2">
              {PRICE_SCOPES.map((s) => (
                <Chip key={s} active={scope === s} tone={s === 'below' ? 'red' : s === 'missing' ? 'amber' : 'olive'} onClick={() => onScope(s)}>
                  {SCOPE_LABEL[s]}
                </Chip>
              ))}
            </div>
          </div>
          <MobileRows {...props} />
        </>
      ) : null}

      {tab === 'customers' && <CustomersTab {...props} />}
      {tab === 'offers' && <OffersTab {...props} />}
      {tab === 'coupons' && <CouponsTab {...props} />}
    </div>
  );
}

function MobileRows({ rows, hasMore, loadingMore, onLoadMore, onEdit }: PricesViewProps) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <span className="font-ops-body text-ops-base text-ops-muted">Bu süzgeçle eşleşen boy yok.</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
      {rows.map((row) => (
        <PriceCard key={row.variantId} row={row} onEdit={() => onEdit(row.variantId)} />
      ))}
      <LoadMoreSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />
    </div>
  );
}

interface PriceCardProps {
  row: PriceRow;
  onEdit: () => void;
}

/**
 * Fiyat kartı. Marj-altı satırın SOL KENARI kırmızı (tasarım): telefonda göz sütun taramaz, kenar
 * çizgisi tarar. Hedef marj kartta yazılı — "neye göre düşük" sorusu düzeltmeden önce sorulur.
 */
function PriceCard({ row, onEdit }: PriceCardProps) {
  const alarm = row.belowTarget === true || (row.marginPercent !== null && row.marginPercent < 0);
  return (
    <div
      className={`flex flex-col gap-2 rounded-ops-card border bg-ops-white px-3.5 py-3 ${
        alarm ? 'border-ops-red-line border-l-[3px] border-l-ops-red' : 'border-ops-line'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{row.title}</span>
          <span className="truncate font-ops-body text-ops-xs text-ops-muted">
            Maliyet {amount(row.costCents)}
            {row.targetMarginPercent === null ? ' · hedef yok' : ` · hedef ${percent(row.targetMarginPercent)}`}
            {rowStateNote(row)}
          </span>
        </div>
        <Badge tone={marginTone(row)}>{marginText(row)}</Badge>
      </div>

      <div className="flex items-center gap-3">
        <span className="font-ops-body text-ops-xs text-ops-body">
          B2C <strong className={`font-ops-mono ${row.b2c.amountCents === null ? 'text-ops-amber' : 'text-ops-ink'}`}>{money(row.b2c.amountCents)}</strong>
        </span>
        <span className="font-ops-body text-ops-xs text-ops-body">
          B2B <strong className={`font-ops-mono ${row.b2b.amountCents === null ? 'text-ops-amber' : 'text-ops-ink'}`}>{money(row.b2b.amountCents)}</strong>
        </span>
        <Button variant="primary" size="sm" className="ml-auto" onClick={onEdit}>
          Düzelt
        </Button>
      </div>
    </div>
  );
}
