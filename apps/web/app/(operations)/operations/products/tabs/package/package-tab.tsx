'use client';

import { useEffect, useState } from 'react';
import { bundleBalance } from '@lezzet/domain-core';
import { fromCents, toCents } from '@lezzet/helper';
import { IMAGE_ROLES, cropOf, resolveLocalizedText } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { Badge } from '@/components/operation/ui/badge';
import { ImageIcon } from '@/components/operation/ui/icons';
import { Table, type Column } from '@/components/operation/ui/table';
import { Toggle } from '@/components/operation/form/toggle';
import type { Device } from '@/lib/device';
import { reorderBundlesAction, setBundleActiveAction } from './actions';
import { BundleFormDialog } from './bundle-form-dialog';
import type { BundleView, VariantOption } from '../../products-types';

// Paketler sekmesi — tasarımın liste satırı: 3:2 görsel + ad + "N kalem · slug" + fiyat + mutabakat
// rozeti. Rozetin dili tasarımdan: "Toplam tutar" / "Toplam tutmuyor". Oluştur/düzenle dialogu bu
// modülün İÇİNDE (kabuk yalnız niyeti taşır).
//
// MUTABAKAT LİSTEDE DE HESAPLANIR, çünkü tutmayan paket kaydedilemese bile sonradan bozulabilir:
// bir kalemin adedi ya da fiyatı başka bir yerden değişirse (ileride toplu işlem) satır bunu söyler.
// Karar motorda (`bundleBalance`) — liste kendi ölçütünü uydurmaz.

const money = (cents: number) => `${fromCents(cents).toFixed(2).replace('.', ',')} €`;

function balanceOf(bundle: BundleView) {
  return bundleBalance(
    bundle.items.map((i) => ({ qty: i.qty, allocatedUnitPriceCents: toCents(i.allocatedUnitPrice) })),
    toCents(bundle.totalPrice),
  );
}

function bundleColumns(onToggle: (id: string, next: boolean) => void): Column<BundleView>[] {
  return [
    {
      key: 'image',
      header: '',
      width: '84px',
      cell: (b) => (
        <div className="w-[76px]">
          <FramedImage
            src={b.imageUrl}
            alt=""
            ratio={IMAGE_ROLES.package.ratio}
            crop={cropOf(b)}
            placeholder={<ImageIcon size={14} />}
            className="!rounded-[7px] border border-ops-line-strong"
          />
        </div>
      ),
    },
    {
      key: 'name',
      header: 'Paket',
      width: 'minmax(180px,1fr)',
      cell: (b) => (
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate font-ops-body text-[13.5px] font-semibold text-ops-ink">{resolveLocalizedText(b.name)}</span>
          <span className="truncate font-ops-body text-[11px] text-ops-muted">
            {b.items.length} kalem{b.serves ? ` · ${b.serves} kişilik` : ''} · slug: {b.slug}
          </span>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'İçerik',
      width: 'minmax(160px,1.2fr)',
      cell: (b) => (
        <span className="truncate font-ops-body text-[11.5px] text-ops-body" title={b.itemLabels.join(' · ')}>
          {b.itemLabels.length > 0 ? b.itemLabels.join(' · ') : '—'}
        </span>
      ),
    },
    {
      key: 'price',
      header: 'Fiyat',
      width: '92px',
      align: 'right',
      cell: (b) => <span className="font-ops-mono text-[13px] text-ops-ink">{money(toCents(b.totalPrice))}</span>,
    },
    {
      key: 'balance',
      header: 'Mutabakat',
      width: '132px',
      cell: (b) => {
        const balance = balanceOf(b);
        if (balance.balanced) return <Badge tone="olive">Toplam tutar</Badge>;
        // Fark rozetin İÇİNDE yazılı: ipucu (title) rozete geçirilemiyor ve farkı görmek için
        // formu açmak gerekmesi, listenin "neyi söylediğini" yarım bırakırdı.
        // Renk AMBER, kırmızı değil — formdaki şeritle aynı olgu aynı renkte görünsün; kırmızı
        // gerçekten satışı engelleyen durumlara saklı (tutmayan paket satılabilir, faturası eksik olur).
        return <Badge tone="amber">Tutmuyor · {money(Math.abs(balance.diffCents))}</Badge>;
      },
    },
    {
      key: 'active',
      header: 'Satışta',
      width: '64px',
      align: 'center',
      cell: (b) => (
        <span className="justify-self-center">
          <Toggle on={b.isActive} size="sm" onChange={(next) => onToggle(b.id, next)} label="Satışta" />
        </span>
      ),
    },
  ];
}

interface PackagesTabProps {
  bundles: BundleView[];
  pool: VariantOption[];
  device: Device;
  /** Oluşturma niyeti kabuktan (sekme çubuğundaki "+ Paket"); diyalog burada. */
  creating: boolean;
  onCreateClose: () => void;
}

export function PackagesTab({ bundles, pool, device, creating, onCreateClose }: PackagesTabProps) {
  // Düzenlenen kayıt KİMLİKLE tutulur, verisi taze listeden türetilir (katalog sekmesinin deseni):
  // kopya tutulursa dialog içindeki görsel yüklemesi `router.refresh()` sonrası görünmez.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId !== null ? (bundles.find((b) => b.id === editingId) ?? null) : null;

  // İyimser sıra yalnız KİMLİK listesi (katalog sekmesiyle aynı gerekçe: satır verisi aynalanmaz).
  const [optimisticIds, setOptimisticIds] = useState<string[] | null>(null);
  useEffect(() => setOptimisticIds(null), [bundles]);

  const byId = new Map(bundles.map((b) => [b.id, b]));
  const displayed = optimisticIds
    ? [
        ...optimisticIds.map((id) => byId.get(id)).filter((b): b is BundleView => Boolean(b)),
        ...bundles.filter((b) => !optimisticIds.includes(b.id)),
      ]
    : bundles;

  const handleReorder = async (ids: string[]) => {
    setOptimisticIds(ids);
    const { error } = await reorderBundlesAction(ids);
    if (error) setOptimisticIds(null); // başarısızsa sunucu sırasına dön
  };

  const onToggle = (id: string, next: boolean) => {
    void setBundleActiveAction(id, next);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center border-b border-ops-line-soft px-6 py-[11px]">
        <span className="font-ops-body text-[12px] text-ops-muted">
          Kalem fiyatları toplamı = paket fiyatı · sistem doğrular · yeni ürün yaratmaz · sürükle-sırala
        </span>
      </div>

      <Table
        columns={bundleColumns(onToggle)}
        rows={displayed}
        rowKey={(b) => b.id}
        onReorder={handleReorder}
        onRowDoubleClick={(b) => setEditingId(b.id)}
        empty={
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
            <span className="font-ops-body text-[13px] text-ops-body">Henüz paket yok.</span>
            <span className="font-ops-body text-[12px] text-ops-faint">
              Paket birkaç ürünü tek fiyata sunar; sepete eklenince kalemlere açılır.
            </span>
          </div>
        }
      />

      {creating ? <BundleFormDialog bundle={null} pool={pool} device={device} onClose={onCreateClose} /> : null}
      {editing ? (
        <BundleFormDialog
          key={editing.id}
          bundle={editing}
          pool={pool}
          device={device}
          onClose={() => setEditingId(null)}
        />
      ) : null}
    </div>
  );
}
