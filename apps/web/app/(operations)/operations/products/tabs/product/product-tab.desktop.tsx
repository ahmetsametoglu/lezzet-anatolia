'use client';

import { PRODUCTS_COLUMN_TRACKS } from '../../products-columns';
import { Badge } from '@/components/operation/ui/badge';
import { Chip } from '@/components/operation/ui/chip';
import { FilterChip } from '@/components/operation/ui/filter-chip';
import { withCells, Table, type Column } from '@/components/operation/ui/table';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
import { money, percent } from '@/components/operation/ui/format';
import { PRODUCT_STATUS_LABELS, resolveLocalizedText, type ProductVariant } from '@lezzet/types';
import { DeclarationMarks } from './declaration-marks';
import { ProductPreview } from './product-preview';
import { StatusBadge } from './status-badge';
import type {
  ProductPriceSummary,
  ProductStatus,
  ProductStockSummary,
  ProductView,
  ProductsViewProps,
  StatusFilter,
} from '../../products-types';

// Ürünler sekmesi (masaüstü): liste + seçili önizleme paneli (1.95fr / 1fr). Süzgeçler
// (arama · kategori · durum · beyan eksik) İŞLEVSEL — hepsi listeyi gerçekten daraltır.

const STATUS_ORDER: ProductStatus[] = ['active', 'passive', 'candidate'];

/** Boyun ekrandaki adı: etiketi varsa o, yoksa net miktarı — tek boylu üründe etiket bilerek boştur. */
function sizeLabel(variant: ProductVariant): string {
  const label = resolveLocalizedText(variant.label);
  if (label) return label;
  return variant.netQuantity != null && variant.netUnit ? `${variant.netQuantity} ${variant.netUnit}` : '—';
}

/** Okunmamış değer "—"dır: sıfır stok ile okunmamış stok aynı şey değildir (CLAUDE §1). */
function Unknown() {
  return <span className="font-ops-body text-ops-xs text-ops-muted">—</span>;
}

function StockCell({ stock }: { stock: ProductStockSummary | null }) {
  if (stock === null) return <Unknown />;
  const empty = stock.availableQty === 0;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={['font-ops-mono text-ops-sm font-semibold', empty ? 'text-ops-red' : 'text-ops-ink'].join(' ')}>{stock.availableQty}</span>
      <span className={['font-ops-body text-ops-xs', empty || stock.belowMin ? 'text-ops-amber' : 'text-ops-muted'].join(' ')}>
        {empty ? 'hiç stok yok' : stock.belowMin ? 'asgari eşik altında' : `${stock.warehouseCount} depo`}
      </span>
    </div>
  );
}

/** Birincil boyun fiyatı; marj bilinmiyorsa yüzde YAZILMAZ (maliyeti olmayan boyun marjı yoktur). */
function PriceCell({ price }: { price: ProductPriceSummary | null }) {
  if (price === null) return <Unknown />;
  if (price.b2cCents === null && price.b2bCents === null) {
    return <span className="font-ops-body text-ops-xs text-ops-amber">fiyat girilmedi</span>;
  }
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="font-ops-mono text-ops-sm font-semibold text-ops-ink">{money(price.b2cCents)}</span>
      <span className="font-ops-body text-ops-xs text-ops-muted">
        {`B2B ${price.b2bCents === null ? '—' : money(price.b2bCents)}`}
        {price.marginPercent !== null ? (
          <>
            {' · '}
            <span className={price.belowTarget ? 'text-ops-amber' : 'text-ops-olive'}>{percent(price.marginPercent)}</span>
          </>
        ) : null}
        {price.autoPrice ? <span className="text-ops-olive">{' · oto'}</span> : null}
      </span>
    </div>
  );
}

/**
 * Sevk hazırlığı: kargo izni açık olsa bile ÖLÇÜSÜ girilmemiş boy varsa o boya canlı kargo teklifi
 * alınamaz (`packed_weight_g` + mm). Bu çelişki bugüne dek hiçbir listede görünmüyordu.
 */
function ShipCell({ product }: { product: ProductView }) {
  if (!product.shippable) return <Badge tone="neutral">kargo kapalı</Badge>;
  const missingDims = product.variants.some(
    (v) => v.isActive && (v.packedWeightG === null || v.packedLengthMm === null || v.packedWidthMm === null || v.packedHeightMm === null),
  );
  return missingDims ? <Badge tone="amber">ölçü eksik</Badge> : <Badge tone="olive">kargoya hazır</Badge>;
}

const COLUMNS: Column<ProductView>[] = withCells<ProductView>(PRODUCTS_COLUMN_TRACKS, {
  // Görsel SATIRDA (16.08, kullanıcı isteği — stok listesinin deseni, aynı 36px): operatör ürünü
  // adından önce fotoğrafından tanır. Görselsiz üründe `Thumbnail` yer tutucu çizer — kayan bir
  // sütun, tarama düzenini görselin varlığına bağlardı.
  name: (r) => (
    <div className="flex min-w-0 items-center gap-2.5">
      <Thumbnail src={r.thumbUrl} alt="" size={36} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{resolveLocalizedText(r.name)}</span>
        {/* Slug adın yanında: aynı adı taşıyan iki kaydı ayıran ve dış bağlantıyı kuran şey odur. */}
        <span className="truncate font-ops-body text-ops-xs text-ops-muted">{`${r.categoryName} · ${r.slug}`}</span>
      </div>
    </div>
  ),
  variants: (r) => (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="font-ops-body text-ops-sm font-medium text-ops-ink">{`${r.variants.length} boy`}</span>
      <span className="truncate font-ops-body text-ops-xs text-ops-muted">{r.variants.map(sizeLabel).join(' · ')}</span>
    </div>
  ),
  stock: (r) => <StockCell stock={r.stock} />,
  price: (r) => <PriceCell price={r.price} />,
  decl: (r) => <DeclarationMarks product={r} />,
  ship: (r) => <ShipCell product={r} />,
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
