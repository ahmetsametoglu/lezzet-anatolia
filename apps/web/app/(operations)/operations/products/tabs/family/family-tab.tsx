'use client';

import { useState } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { num } from '@/components/operation/ui/format';
import { Table, type Column } from '@/components/operation/ui/table';
import { FamilyDialog } from './family-dialog';
import type { FamilyView } from '../../products-types';

// **Aileler sekmesi** (05.15) — çeşit ekseninin yönetildiği yer.
//
// Aile, ürünlerin üstünde ince bir gruplamadır; yeni bir varlık türü DEĞİL. Üye = bugünkü ürün ve
// kendi sayfası, beyanı, fiyatı vardır. Bu sekme yalnız üç soruyu cevaplıyor: hangi ailelerimiz
// var · içinde kim var · hangi sırayla.
//
// **`CatalogTab`'e katılmadı ve sebebi dört fark:** ailenin adı TEK dilli (müşteriye görünmez),
// görseli yok, üyelik çoktan-çoğa değil (bir ürün en çok bir ailede) ve sıra ailenin kendinde değil
// ÜYEDE duruyor (`family_position`). Dördünü tek `kind` bayrağına sıkıştırmak, o bileşenin içinde
// ikinci bir düzen dalı açmak olurdu.

const COLUMNS: Column<FamilyView>[] = [
  {
    key: 'name',
    header: 'Aile',
    width: 'minmax(160px,1fr)',
    cell: (row) => <span className="font-ops-body text-ops-sm text-ops-ink">{row.name}</span>,
  },
  {
    key: 'members',
    header: 'Üyeler',
    width: 'minmax(220px,2fr)',
    // Üye adları satırda ÖZETLENİR: aile üç çeşitten oluşuyorsa hangileri olduğu bir bakışta
    // okunmalı, yoksa her aileyi açmak gerekir. Dördüncüden sonrası sayıya iniyor.
    cell: (row) => (
      <span className="font-ops-body text-ops-xs text-ops-muted">
        {row.members.length === 0
          ? 'henüz üye yok'
          : row.members
              .slice(0, 3)
              .map((member) => member.productName)
              .join(' · ') + (row.members.length > 3 ? ` +${row.members.length - 3}` : '')}
      </span>
    ),
  },
  {
    key: 'count',
    header: 'Sayı',
    width: '70px',
    align: 'right',
    cell: (row) => <span className="font-ops-mono text-ops-xs text-ops-muted">{num(row.memberCount)}</span>,
  },
  {
    key: 'status',
    header: '',
    width: '90px',
    cell: (row) =>
      row.isActive ? null : (
        <Badge tone="slate" outline>
          pasif
        </Badge>
      ),
  },
];

interface FamilyTabProps {
  rows: FamilyView[];
  filter: string;
  creating: boolean;
  onCreateClose: () => void;
}

export function FamilyTab({ rows, filter, creating, onCreateClose }: FamilyTabProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  // Süzme CLIENT'ta ve bu doğru: aileler bütün hâlinde geliyor (doğal tavanlı küme), yani sunucuya
  // gitmek boş bir tur olurdu — katalog sekmelerinin aynı gerekçesi.
  const term = filter.trim().toLocaleLowerCase('tr-TR');
  const visible = term
    ? rows.filter(
        (row) =>
          row.name.toLocaleLowerCase('tr-TR').includes(term) ||
          row.members.some((member) => member.productName.toLocaleLowerCase('tr-TR').includes(term)),
      )
    : rows;

  const open = rows.find((row) => row.id === openId) ?? null;

  return (
    <>
      {rows.length === 0 ? (
        <EmptyState
          title="Henüz aile yok"
          description="Aile, aynı ürünün çeşitlerini bir arada tutar — limonlu / mangolu gibi. Müşteri bir çeşidin sayfasındayken ötekileri kartlarla görür. “+ Aile” ile başlayın."
        />
      ) : visible.length === 0 ? (
        <EmptyState title="Eşleşen aile yok" description="Arama aile adında ve üye adlarında çalışıyor." />
      ) : (
        <Table columns={COLUMNS} rows={visible} rowKey={(row) => row.id} onRowClick={(row) => setOpenId(row.id)} />
      )}

      {creating ? <FamilyDialog family={null} onClose={onCreateClose} /> : null}
      {open ? <FamilyDialog family={open} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}
