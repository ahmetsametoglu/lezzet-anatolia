'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Table, type Column } from '@/components/operation/ui/table';
import { FramedImage } from '@/components/media/framed-image';
import { ImageIcon } from '@/components/operation/ui/icons';
import { cropOf, IMAGE_ROLES, pickCropFields, resolveLocalizedText, type ImageRole } from '@lezzet/types';
import { reorderCatalogAction } from './actions';
import { CatalogFormDialog } from './catalog-form-dialog';
import type { CatalogKind, CatalogRow, CollectionView, ProductView } from '../../products-types';

// Katalog sekmesi — Kategoriler VE Koleksiyonlar. İkisi de aynı düz/sıralı desen (çok dilli ad · slug ·
// sortOrder · isActive + ürün sayısı): tek tablo, tek sıralama akışı, tek dialog; yalnız `kind` ve
// metinler ayrışır (no-duplication). Oluştur/düzenle dialogu bu modülün İÇİNDE — kabuk bilmez.

/** Koleksiyon satırı mı? Açıklama ve üyelik YALNIZ koleksiyonda vardır (kategoride bu alanlar yok). */
function isCollectionRow(r: CatalogRow): r is CollectionView {
  return 'productIds' in r;
}

function catalogStatus(r: CatalogRow): { label: string; tone: 'olive' | 'neutral' } {
  if (r.count === 0) return { label: 'Boş', tone: 'neutral' };
  return r.isActive ? { label: 'Aktif', tone: 'olive' } : { label: 'Pasif', tone: 'neutral' };
}

function catalogColumns(kind: CatalogKind, header: string): Column<CatalogRow>[] {
  // Satır görseli kaynağın ORANINDA gösterilir (kategori 3:2 · koleksiyon 16:9 bant) ve kaydın odak/
  // zoom künyesiyle kırpılır → operatör listede gerçekte ne göründüğünü görür.
  const role: ImageRole = kind === 'collection' ? 'collection' : 'category';
  return [
    {
      key: 'image',
      header: '',
      width: '76px',
      cell: (r) => (
        <div className="w-16">
          <FramedImage
            src={r.imageUrl}
            alt=""
            ratio={IMAGE_ROLES[role].ratio}
            crop={cropOf(r)}
            placeholder={<ImageIcon size={14} />}
            className="!rounded-[7px] border border-ops-line-strong"
          />
        </div>
      ),
    },
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
  category: catalogColumns('category', 'Kategori'),
  collection: catalogColumns('collection', 'Koleksiyon'),
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
  // Düzenlenen kayıt KİMLİKLE tutulur, verisi her render'da TAZE listeden türetilir (products-client'ın
  // `selectedId` deseni). Satır nesnesinin kopyası tutulursa dialog içindeki görsel yüklemesi
  // `router.refresh()` sonrası görünmez: sunucu verisi tazelenir ama elde eski nesne (imageUrl: null)
  // kalır ve yeni görsel yalnız sayfa yenilenince belirir.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId !== null ? (rows.find((r) => r.id === editingId) ?? null) : null;

  // İyimser sıra YALNIZ kimlik listesi olarak tutulur — satır VERİSİ asla aynalanmaz. Kopya tutulursa
  // yeni kayıt/güncelleme (revalidate + router.refresh) ekrana yansımaz: elde eski liste kalır.
  // Sunucudan taze veri gelince (rows referansı değişir) iyimser sıra bırakılır — gerçek sıra sunucuda.
  const [optimisticIds, setOptimisticIds] = useState<string[] | null>(null);
  useEffect(() => setOptimisticIds(null), [rows]);

  const byId = new Map(rows.map((r) => [r.id, r]));
  // Bilinmeyen id atılır, iyimser listede OLMAYAN taze satırlar sona eklenir (yeni kayıt kaybolmasın).
  const displayed = optimisticIds
    ? [
        ...optimisticIds.map((id) => byId.get(id)).filter((r): r is CatalogRow => Boolean(r)),
        ...rows.filter((r) => !optimisticIds.includes(r.id)),
      ]
    : rows;

  const handleReorder = async (ids: string[]) => {
    setOptimisticIds(ids);
    const { error } = await reorderCatalogAction(kind, ids);
    if (error) setOptimisticIds(null); // başarısızsa sunucu sırasına dön
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
        rows={displayed}
        rowKey={(r) => r.id}
        onReorder={handleReorder}
        onRowDoubleClick={(r) => setEditingId(r.id)}
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
            // Görsel künyesi İKİ türde de var (kategori görseli + koleksiyon OG kapağı).
            imageUrl: editing.imageUrl,
            ...pickCropFields(editing),
            // Açıklama/üyelik yalnız koleksiyon satırında vardır (kategoride bu alanlar yok).
            description: isCollectionRow(editing) ? editing.description : null,
            productIds: isCollectionRow(editing) ? editing.productIds : [],
          }}
          onClose={() => setEditingId(null)}
        />
      ) : null}
    </div>
  );
}
