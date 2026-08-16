'use client';

import { PRODUCTS_COLUMN_TRACKS } from '../../products-columns';
import { Badge } from '@/components/operation/ui/badge';
import { Chip } from '@/components/operation/ui/chip';
import { FilterChip } from '@/components/operation/ui/filter-chip';
import { withCells, Table, type Column } from '@/components/operation/ui/table';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
import { PRODUCT_STATUS_LABELS, resolveLocalizedText } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { ProductPreview } from './product-preview';
import { StatusBadge } from './status-badge';
import { filledContentLangs, type ProductStatus, type ProductView, type ProductsViewProps, type StatusFilter } from '../../products-types';

// Ürünler sekmesi (masaüstü): liste + seçili önizleme paneli (1.95fr / 1fr). Süzgeçler
// (arama · kategori · durum · beyan eksik) İŞLEVSEL — hepsi listeyi gerçekten daraltır.

const STATUS_ORDER: ProductStatus[] = ['active', 'passive', 'candidate'];

function LangBadge({ langs }: { langs: Locale[] }) {
  if (langs.length === 0) return <Badge tone="amber">—</Badge>;
  return <Badge tone={langs.length === 3 ? 'olive' : 'amber'}>{langs.map((l) => l.toUpperCase()).join('·')}</Badge>;
}

const COLUMNS: Column<ProductView>[] = withCells<ProductView>(PRODUCTS_COLUMN_TRACKS, {
  // Görsel SATIRDA (16.08, kullanıcı isteği — stok listesinin deseni, aynı 36px): operatör ürünü
  // adından önce fotoğrafından tanır. Görselsiz üründe `Thumbnail` yer tutucu çizer — kayan bir
  // sütun, tarama düzenini görselin varlığına bağlardı.
  name: (r) => (
    <div className="flex min-w-0 items-center gap-2.5">
      <Thumbnail src={r.imageUrl} alt="" size={36} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{resolveLocalizedText(r.name)}</span>
        <span className="font-ops-body text-ops-xs text-ops-muted">{r.categoryName}</span>
      </div>
    </div>
  ),
  variants: (r) => <span className="font-ops-mono text-ops-sm text-ops-strong">{r.variants.length}</span>,
  langs: (r) => <LangBadge langs={filledContentLangs(r.name)} />,
  status: (r) => <StatusBadge status={r.status} />,
});

// "+ durum" — süzgeç çipi. Davranış 05.08'de KİTE taşındı (`ui/filter-chip`): burada elle
// yazılmıştı ve Para ekranı aynı şeridi kurarken form kontrolüne (`Select`) uzanmak zorunda kalmıştı;
// sonuç iki ekranda iki ayrı süzgeç davranışıydı. Doğru olanı çoğaltmak yerine ortaklaştırıldı.
function StatusFilterChip({ value, onChange }: { value: StatusFilter; onChange: (s: StatusFilter) => void }) {
  return (
    <FilterChip
      value={value}
      emptyValue="all"
      placeholder="+ durum"
      menuWidth={140}
      options={STATUS_ORDER.map((s) => ({ value: s, label: PRODUCT_STATUS_LABELS[s] }))}
      onChange={onChange}
    />
  );
}

export function ProductsTab(props: ProductsViewProps) {
  const {
    data,
    products,
    catFilter,
    onCatFilter,
    statusFilter,
    onStatusFilter,
    onlyIncomplete,
    onToggleIncomplete,
    selectedId,
    onSelect,
    openEdit,
  } = props;
  const { hasMore, loadingMore, onLoadMore } = props;
  // Seçili kayıt GÖRÜNEN listeden çözülür (eklenen sayfalar dahil); listede yoksa sunucunun
  // HEDEFLİ okuması (`data.pinned`, `?p=` bağlantısı sayfa 2+'daki ürünü gösterdiğinde).
  const selected =
    products.find((p) => p.id === selectedId) ?? (data.pinned?.id === selectedId ? data.pinned : null) ?? null;
  const missingCount = data.counts.incomplete;

  return (
    <>
      {/* Süzgeç çipleri (İşlevsel) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ops-line-soft px-6 py-2.5">
        <Chip active={catFilter === 'all'} onClick={() => onCatFilter('all')}>
          Tümü
        </Chip>
        {data.categories.map((c) => (
          <Chip key={c.id} active={catFilter === c.id} onClick={() => onCatFilter(c.id)}>
            {resolveLocalizedText(c.name)}
          </Chip>
        ))}
        <span className="mx-1 h-[18px] w-px bg-ops-gray-300" />
        <StatusFilterChip value={statusFilter} onChange={onStatusFilter} />
        {missingCount > 0 ? (
          <Chip
            tone="amber"
            active={onlyIncomplete}
            onClick={onToggleIncomplete}
            className={onlyIncomplete ? 'ml-auto' : 'ml-auto !bg-ops-amber-bg !text-ops-amber'}
          >
            {missingCount} beyan eksik
          </Chip>
        ) : null}
      </div>

      {/* Liste + seçili panel */}
      <div className="grid min-h-0 flex-1 grid-cols-[1.95fr_1fr] overflow-hidden">
        <div className="flex min-h-0 flex-col border-r border-ops-line">
          <Table
            busy={props.navPending}
            columns={COLUMNS}
            rows={products}
            rowKey={(r) => r.id}
            onRowClick={(r) => onSelect(r.id)}
            onRowDoubleClick={(r) => {
              onSelect(r.id);
              openEdit();
            }}
            isRowActive={(r) => r.id === selectedId}
            empty={
              <div className="flex flex-1 items-center justify-center p-10 text-center font-ops-body text-ops-base text-ops-faint">
                Bu süzgeçte ürün yok.
              </div>
            }
            footer={<LoadMoreSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />}
          />
        </div>
        <ProductPreview product={selected} onEdit={openEdit} families={data.families} onSelectProduct={onSelect} />
      </div>
    </>
  );
}
