'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Table, type Column } from '@/components/operation/ui/table';
import { resolveLocalizedText } from '@lezzet/types';
import { reorderCatalogAction } from './actions';
import { CatalogFormDialog } from './catalog-form-dialog';
import type { CatalogKind, CatalogRow, ProductView } from '../../products-types';

// Katalog sekmesi — Kategoriler VE Koleksiyonlar. İkisi de aynı düz/sıralı desen (çok dilli ad · slug ·
// sortOrder · isActive + ürün sayısı): tek tablo, tek sıralama akışı, tek dialog; yalnız `kind` ve
// metinler ayrışır (no-duplication). Oluştur/düzenle dialogu bu modülün İÇİNDE — kabuk bilmez.

function catalogStatus(r: CatalogRow): { label: string; tone: 'olive' | 'neutral' } {
  if (r.count === 0) return { label: 'Boş', tone: 'neutral' };
  return r.isActive ? { label: 'Aktif', tone: 'olive' } : { label: 'Pasif', tone: 'neutral' };
}

function catalogColumns(header: string): Column<CatalogRow>[] {
  return [
    {
      key: 'name',
      header,
      width: 'minmax(160px,1fr)',
      cell: (r) => (
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate font-ops-body text-[13.5px] font-semibold text-ops-ink">{resolveLocalizedText(r.name)}</span>
          <span className="truncate font-ops-body text-[11px] text-ops-muted">slug: {r.slug}</span>
        </div>
      ),
    },
    { key: 'count', header: 'Ürün', width: '72px', align: 'right', cell: (r) => <span className="font-ops-mono text-[12px] text-ops-body">{r.count}</span> },
    {
      key: 'status',
      header: 'Durum',
      width: '84px',
      align: 'right',
      cell: (r) => {
        const st = catalogStatus(r);
        return <Badge tone={st.tone}>{st.label}</Badge>;
      },
    },
  ];
}

const CATALOG_COLUMNS: Record<CatalogKind, Column<CatalogRow>[]> = {
  category: catalogColumns('Kategori'),
  collection: catalogColumns('Koleksiyon'),
};

const CATALOG_COPY: Record<CatalogKind, { hint: string; createLabel: string; empty: string }> = {
  category: {
    hint: 'Düz liste · iç içe yok · sürükle-sırala · düzenlemek için çift tıkla',
    createLabel: '+ Kategori',
    empty: 'Henüz kategori yok.',
  },
  collection: {
    hint: 'Esnek pazarlama grubu · bir ürün birçok koleksiyonda · slug = paylaşım linki',
    createLabel: '+ Koleksiyon',
    empty: 'Henüz koleksiyon yok.',
  },
};

interface CatalogTabProps {
  kind: CatalogKind;
  rows: CatalogRow[];
  /** Üyelik düzenlemesi için ürün havuzu — yalnız koleksiyonda verilir. */
  products?: ProductView[];
}

export function CatalogTab({ kind, rows, products }: CatalogTabProps) {
  const copy = CATALOG_COPY[kind];
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CatalogRow | null>(null);
  // İyimser yerel sıra: sürüklerken anında güncellenir, action arka planda kalıcılaştırır.
  // Sunucu verisi değişince (yeni kayıt · revalidate) yerel sırayı eşitle.
  const [ordered, setOrdered] = useState<CatalogRow[]>(rows);
  useEffect(() => setOrdered(rows), [rows]);

  const handleReorder = async (ids: string[]) => {
    const byId = new Map(ordered.map((r) => [r.id, r]));
    const prev = ordered;
    setOrdered(ids.map((id) => byId.get(id)).filter((r): r is CatalogRow => Boolean(r)));
    const { error } = await reorderCatalogAction(kind, ids);
    if (error) setOrdered(prev); // başarısızsa eski sıraya geri dön
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center border-b border-ops-line-soft px-6 py-[11px]">
        <span className="mr-auto font-ops-body text-[12px] text-ops-muted">{copy.hint}</span>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="cursor-pointer rounded-ops-btn bg-ops-ink px-3.5 py-2 font-ops-display text-[12px] font-semibold text-ops-card hover:bg-ops-ink-hover"
        >
          {copy.createLabel}
        </button>
      </div>
      <Table
        columns={CATALOG_COLUMNS[kind]}
        rows={ordered}
        rowKey={(r) => r.id}
        onReorder={handleReorder}
        onRowDoubleClick={setEditing}
        empty={
          <div className="flex flex-1 items-center justify-center p-10 text-center font-ops-body text-[13px] text-ops-faint">
            {copy.empty}
          </div>
        }
      />

      {creating ? <CatalogFormDialog kind={kind} products={products} onClose={() => setCreating(false)} /> : null}
      {editing ? (
        <CatalogFormDialog
          kind={kind}
          products={products}
          edit={{
            id: editing.id,
            name: editing.name,
            slug: editing.slug,
            isActive: editing.isActive,
            // Açıklama/kapak/üyelik yalnız koleksiyon satırında vardır (kategoride bu alanlar yok).
            description: 'description' in editing ? editing.description : null,
            imageUrl: 'imageUrl' in editing ? editing.imageUrl : null,
            imageFocalX: 'imageFocalX' in editing ? editing.imageFocalX : 50,
            imageFocalY: 'imageFocalY' in editing ? editing.imageFocalY : 50,
            imageZoom: 'imageZoom' in editing ? editing.imageZoom : 100,
            productIds: 'productIds' in editing ? editing.productIds : [],
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
