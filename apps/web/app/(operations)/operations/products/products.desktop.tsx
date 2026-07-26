'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Chip } from '@/components/operation/ui/chip';
import { PackageIcon, PlusIcon } from '@/components/operation/ui/icons';
import { PageHeader } from '@/components/operation/ui/page-header';
import { SearchInput } from '@/components/operation/ui/search-input';
import { SortableList } from '@/components/operation/ui/sortable-list';
import { Table, type Column } from '@/components/operation/ui/table';
import { Tabs } from '@/components/operation/ui/tabs';
import { resolveLocalizedText } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { reorderCategoriesAction } from './actions/actions';
import { CatalogCreateDialog } from './components/catalog-create-dialog';
import { ProductPreview } from './components/product-preview';
import {
  filledContentLangs,
  productStatus,
  type CategoryView,
  type CollectionView,
  type ProductStatus,
  type ProductTab,
  type ProductView,
  type ProductsViewProps,
  type StatusFilter,
} from './products-types';

// Ürünler — web ("Veri Masası"): PageHeader (ortak üst bar) + O2 sekmeler. Ürünler sekmesi liste +
// seçili panel (1.95fr / 1fr); Kategoriler/Koleksiyonlar/Paketler kendi düzenlerinde. Süzgeçler
// (arama · kategori · durum · beyan eksik) İŞLEVSEL — hepsi listeyi gerçekten daraltır.

const TABS: Array<{ key: ProductTab; label: string }> = [
  { key: 'products', label: 'Ürünler' },
  { key: 'categories', label: 'Kategoriler' },
  { key: 'collections', label: 'Koleksiyonlar' },
  { key: 'packages', label: 'Paketler' },
];

const STATUS_LABEL: Record<ProductStatus, string> = { active: 'Aktif', passive: 'Pasif', candidate: 'Aday' };
const STATUS_ORDER: ProductStatus[] = ['active', 'passive', 'candidate'];

function StatusBadge({ status }: { status: ProductStatus }) {
  if (status === 'candidate') return <Badge tone="blue" dot>Aday</Badge>;
  if (status === 'passive') return <Badge tone="neutral" dot>Pasif</Badge>;
  return <Badge tone="olive" dot>Aktif</Badge>;
}

function LangBadge({ langs }: { langs: Locale[] }) {
  if (langs.length === 0) return <Badge tone="amber">—</Badge>;
  return <Badge tone={langs.length === 3 ? 'olive' : 'amber'}>{langs.map((l) => l.toUpperCase()).join('·')}</Badge>;
}

const COLUMNS: Column<ProductView>[] = [
  {
    key: 'name',
    header: 'Ürün',
    width: 'minmax(120px,1fr)',
    cell: (r) => (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-ops-body text-[13px] font-semibold text-ops-ink">{resolveLocalizedText(r.name)}</span>
        <span className="font-ops-body text-[11px] text-ops-muted">{r.categoryName}</span>
      </div>
    ),
  },
  {
    key: 'variants',
    header: 'Varyant',
    width: '60px',
    align: 'center',
    cell: (r) => <span className="font-ops-mono text-[12.5px] text-ops-strong">{r.variants.length}</span>,
  },
  { key: 'langs', header: 'Diller', width: '82px', align: 'center', cell: (r) => <LangBadge langs={filledContentLangs(r.name)} /> },
  { key: 'status', header: 'Durum', width: '74px', align: 'right', cell: (r) => <StatusBadge status={productStatus(r)} /> },
];

// "+ durum" — dashed çip açılır durum menüsü; seçilince aktif çip + ✕ ile temizlenir (İşlevsel süzgeç).
function StatusFilterChip({ value, onChange }: { value: StatusFilter; onChange: (s: StatusFilter) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (value !== 'all') {
    return (
      <Chip active onClick={() => onChange('all')}>
        {STATUS_LABEL[value]} ✕
      </Chip>
    );
  }
  return (
    <div ref={ref} className="relative">
      <Chip dashed onClick={() => setOpen((v) => !v)}>
        + durum
      </Chip>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+4px)] z-20 flex min-w-[120px] flex-col overflow-hidden rounded-[9px] border-[1.5px] border-ops-olive bg-white shadow-[0_8px_24px_rgba(20,22,18,0.12)]">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
              className="cursor-pointer px-[13px] py-2.5 text-left font-ops-body text-[13px] text-ops-strong hover:bg-ops-subtle"
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Ürünler sekmesi ──────────────────────────────────────────────────────────
function ProductsTab(props: ProductsViewProps) {
  const { data, visibleProducts, catFilter, onCatFilter, statusFilter, onStatusFilter, onlyIncomplete, onToggleIncomplete, selectedId, onSelect, openEdit } = props;
  const selected = data.products.find((p) => p.id === selectedId) ?? null;
  const missingCount = data.products.filter((p) => filledContentLangs(p.name).length < 3 || p.allergens.length === 0).length;

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
        <span className="mx-1 h-[18px] w-px bg-[#dfe1d9]" />
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
            columns={COLUMNS}
            rows={visibleProducts}
            rowKey={(r) => r.id}
            onRowClick={(r) => onSelect(r.id)}
            onRowDoubleClick={(r) => {
              onSelect(r.id);
              openEdit();
            }}
            isRowActive={(r) => r.id === selectedId}
            empty={
              <div className="flex flex-1 items-center justify-center p-10 text-center font-ops-body text-[13px] text-ops-faint">
                Bu süzgeçte ürün yok.
              </div>
            }
          />
        </div>
        <ProductPreview product={selected} onEdit={openEdit} />
      </div>
    </>
  );
}

// ── Kategoriler sekmesi ──────────────────────────────────────────────────────
function categoryStatus(c: CategoryView): { label: string; tone: 'olive' | 'neutral' } {
  if (c.count === 0) return { label: 'Boş', tone: 'neutral' };
  return c.isActive ? { label: 'Aktif', tone: 'olive' } : { label: 'Pasif', tone: 'neutral' };
}

function CategoriesTab({ data, onCreate }: ProductsViewProps & { onCreate: () => void }) {
  // İyimser yerel sıra: sürüklerken anında güncellenir, action arka planda kalıcılaştırır.
  // Sunucu verisi değişince (yeni kategori · revalidate) yerel sırayı eşitle.
  const [ordered, setOrdered] = useState<CategoryView[]>(data.categories);
  useEffect(() => setOrdered(data.categories), [data.categories]);

  const handleReorder = async (ids: string[]) => {
    const byId = new Map(ordered.map((c) => [c.id, c]));
    const prev = ordered;
    setOrdered(ids.map((id) => byId.get(id)).filter((c): c is CategoryView => Boolean(c)));
    const { error } = await reorderCategoriesAction(ids);
    if (error) setOrdered(prev); // başarısızsa eski sıraya geri dön
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center border-b border-ops-line-soft px-6 py-[11px]">
        <span className="mr-auto font-ops-body text-[12px] text-ops-muted">Düz liste · iç içe yok · sürükle-sırala</span>
        <button type="button" onClick={onCreate} className="cursor-pointer rounded-ops-btn bg-ops-ink px-3.5 py-2 font-ops-display text-[12px] font-semibold text-ops-card hover:bg-[#33372e]">
          + Kategori
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SortableList
          items={ordered}
          getId={(c) => c.id}
          onReorder={handleReorder}
          renderItem={(c, handle) => {
            const st = categoryStatus(c);
            return (
              <div className="flex items-center gap-3 border-b border-ops-line-soft px-6 py-3">
                {handle}
                <div className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="font-ops-body text-[13.5px] font-semibold text-ops-ink">{resolveLocalizedText(c.name)}</span>
                  <span className="font-ops-body text-[11px] text-ops-muted">slug: {c.slug}</span>
                </div>
                <span className="font-ops-mono text-[12px] text-ops-body">{c.count} ürün</span>
                <Badge tone={st.tone}>{st.label}</Badge>
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}

// ── Koleksiyonlar sekmesi ────────────────────────────────────────────────────
function CollectionsTab({ data, onCreate }: ProductsViewProps & { onCreate: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center border-b border-ops-line-soft px-6 py-[11px]">
        <span className="mr-auto font-ops-body text-[12px] text-ops-muted">
          Esnek pazarlama grupları · bir ürün birden çok koleksiyonda olabilir
        </span>
        <button type="button" onClick={onCreate} className="cursor-pointer rounded-ops-btn bg-ops-ink px-3.5 py-2 font-ops-display text-[12px] font-semibold text-ops-card hover:bg-[#33372e]">
          + Koleksiyon
        </button>
      </div>
      {data.collections.length === 0 ? (
        <EmptyTab text="Henüz koleksiyon yok." />
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-6">
          {data.collections.map((k: CollectionView) => (
            <div key={k.id} className="flex flex-col gap-1.5 rounded-[10px] border border-ops-line p-4">
              <div className="flex items-center justify-between">
                <span className="font-ops-display text-[14px] font-semibold text-ops-ink">{resolveLocalizedText(k.name)}</span>
                <Badge tone={k.isActive ? 'olive' : 'amber'}>{k.isActive ? 'Aktif' : 'Taslak'}</Badge>
              </div>
              <span className="font-ops-body text-[11.5px] text-ops-muted">slug: {k.slug} · sosyal paylaşım linki</span>
              <span className="font-ops-mono text-[12px] text-ops-olive">{k.count} ürün →</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Paketler sekmesi (bundle modeli sonraki dilim) ───────────────────────────
function PackagesTab() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center border-b border-ops-line-soft px-6 py-[11px]">
        <span className="mr-auto font-ops-body text-[12px] text-ops-muted">
          Kalem fiyatları toplamı = paket fiyatı · sistem doğrular · yeni ürün yaratmaz
        </span>
        <span className="rounded-ops-btn bg-ops-ink px-3.5 py-2 font-ops-display text-[12px] font-semibold text-ops-card">+ Paket</span>
      </div>
      <EmptyTab text="Paket (bundle) modeli sonraki dilimde kurulacak." />
    </div>
  );
}

function EmptyTab({ text }: { text: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center text-ops-faint">
      <PackageIcon />
      <span className="font-ops-body text-[13px] text-ops-body">{text}</span>
    </div>
  );
}

// ── Kabuk ────────────────────────────────────────────────────────────────────
export function ProductsDesktop(props: ProductsViewProps) {
  const { data, tab, onTab, search, onSearch, openCreate } = props;
  const [catalogCreate, setCatalogCreate] = useState<'category' | 'collection' | null>(null);
  const candidateCount = data.products.filter((p) => productStatus(p) === 'candidate').length;
  const missingCount = data.products.filter((p) => filledContentLangs(p.name).length < 3 || p.allergens.length === 0).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="Ürünler"
        subtitle={`${data.products.length} ürün · ${candidateCount} aday · ${missingCount} beyan eksik`}
      >
        <SearchInput value={search} onChange={onSearch} placeholder="Ürün ara…" className="w-56" />
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-ops-btn bg-ops-ink px-3.5 py-2 font-ops-mono text-[12.5px] font-medium text-ops-card hover:bg-[#33372e]"
        >
          <PlusIcon />
          Ürün
        </button>
      </PageHeader>

      <Tabs items={TABS} active={tab} onSelect={onTab} />

      {tab === 'products' && <ProductsTab {...props} />}
      {tab === 'categories' && <CategoriesTab {...props} onCreate={() => setCatalogCreate('category')} />}
      {tab === 'collections' && <CollectionsTab {...props} onCreate={() => setCatalogCreate('collection')} />}
      {tab === 'packages' && <PackagesTab />}

      {catalogCreate ? <CatalogCreateDialog kind={catalogCreate} onClose={() => setCatalogCreate(null)} /> : null}
    </div>
  );
}
