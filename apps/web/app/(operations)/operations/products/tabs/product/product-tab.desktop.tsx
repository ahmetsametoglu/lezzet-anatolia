'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Chip } from '@/components/operation/ui/chip';
import { Table, type Column } from '@/components/operation/ui/table';
import { resolveLocalizedText } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { ProductPreview } from './product-preview';
import {
  filledContentLangs,
  productStatus,
  type ProductStatus,
  type ProductView,
  type ProductsViewProps,
  type StatusFilter,
} from '../../products-types';

// Ürünler sekmesi (masaüstü): liste + seçili önizleme paneli (1.95fr / 1fr). Süzgeçler
// (arama · kategori · durum · beyan eksik) İŞLEVSEL — hepsi listeyi gerçekten daraltır.

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

export function ProductsTab(props: ProductsViewProps) {
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
