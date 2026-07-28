'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { bundlePricing } from './bundle-pricing';
import type { BundleView, VariantOption } from '../../products-types';

// Paketler sekmesi — tasarımın liste satırı: 3:2 görsel + ad + "N kalem · slug" + fiyat + mutabakat
// rozeti. Rozetin dili tasarımdan: "Toplam tutar" / "Toplam tutmuyor". Oluştur/düzenle dialogu bu
// modülün İÇİNDE (kabuk yalnız niyeti taşır).
//
// MUTABAKAT LİSTEDE DE HESAPLANIR, çünkü tutmayan paket kaydedilemese bile sonradan bozulabilir:
// bir kalemin adedi ya da fiyatı başka bir yerden değişirse (ileride toplu işlem) satır bunu söyler.
// Karar motorda (`bundleBalance`) — liste kendi ölçütünü uydurmaz.

const money = (cents: number) => `${fromCents(cents).toFixed(2).replace('.', ',')} €`;
const percent = (value: number) => `%${value.toFixed(1).replace('.', ',')}`;

/** Satırın parası — formla AYNI hesap (`bundlePricing`); liste kendi ölçütünü uydurmaz. */
function pricingOf(bundle: BundleView, pool: Map<string, VariantOption>) {
  return bundlePricing(
    bundle.items.map((i) => ({ variantId: i.variantId, qty: i.qty, allocatedUnitPrice: i.allocatedUnitPrice })),
    pool,
    bundle.totalPrice,
  );
}

type PricingMap = Map<string, ReturnType<typeof pricingOf>>;

/** İki satırlı hücre: üstte karar veren sayı, altında onu açan bağlam. */
function Stacked({ value, hint, alert, title }: { value: string; hint?: string; alert?: boolean; title?: string }) {
  return (
    <span className="flex min-w-0 flex-col items-end gap-px" title={title}>
      <span className={`font-ops-mono text-[13px] ${alert ? 'font-semibold text-ops-amber' : 'text-ops-ink'}`}>{value}</span>
      {hint ? <span className="truncate font-ops-body text-[10.5px] text-ops-muted">{hint}</span> : null}
    </span>
  );
}

/** Satılamaz kalemi olan paket: içindeki ürün/boy satışta değilse paket de vitrine çıkamaz. */
function blockedItemsOf(bundle: BundleView, pool: Map<string, VariantOption>): number {
  return bundle.items.filter((i) => pool.get(i.variantId)?.addable === false).length;
}

function bundleColumns(pool: Map<string, VariantOption>, pricingById: PricingMap, onToggle: (id: string, next: boolean) => void): Column<BundleView>[] {
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
      cell: (b) => {
        const blocked = blockedItemsOf(b, pool);
        return (
          <div className="flex min-w-0 flex-col gap-px">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-ops-body text-[13.5px] font-semibold text-ops-ink">{resolveLocalizedText(b.name)}</span>
              {/* Paket ancak TÜM kalemleri satılabilirse satılabilir. Ürünü pasife alınan paket
                  "Satışta" görünmeye devam ederdi — anahtar operatörün NİYETİNİ tutuyor, gerçeği
                  değil. Niyeti ezmek yerine gerçeği söylüyoruz: ürün geri açılınca paket kendiliğinden
                  döner ve kimse "bunu neden kapatmıştım" diye düşünmez. */}
              {blocked > 0 ? (
                <span
                  className="shrink-0 rounded bg-ops-amber-bg px-1.5 py-px font-ops-display text-[9.5px] font-semibold uppercase tracking-[0.04em] text-ops-amber"
                  title={`${blocked} kalemin ürünü/boyu satışta değil — paket vitrinde görünmez. Ürünü satışa alınca paket kendiliğinden döner.`}
                >
                  vitrinde yok
                </span>
              ) : null}
            </div>
            <span className="truncate font-ops-body text-[11px] text-ops-muted">
              {b.items.length} kalem{b.serves ? ` · ${b.serves} kişilik` : ''} · slug: {b.slug}
            </span>
          </div>
        );
      },
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
      width: '124px',
      align: 'right',
      cell: (b) => {
        const { listTotalCents, discountPercent } = pricingById.get(b.id)!;
        return (
          <Stacked
            value={money(toCents(b.totalPrice))}
            hint={
              listTotalCents == null
                ? 'birim fiyat eksik'
                : `ayrı ayrı ${money(listTotalCents)}${discountPercent != null && discountPercent > 0 ? ` · ${percent(discountPercent)}` : ''}`
            }
            title="Müşterinin ödediği tek fiyat (KDV dahil) · altında kalemler ayrı ayrı alınsaydı"
          />
        );
      },
    },
    {
      // MARJ liste satırının en çok aranan sayısı: hangi paket kazandırıyor, hangisi taşıyor.
      // Kâr ve maliyet altında bağlam olarak durur — üçü ayrı sütun olsaydı tablo sayı tarlasına
      // dönerdi ve hiçbiri okunmazdı.
      key: 'margin',
      header: 'Marj',
      width: '132px',
      align: 'right',
      cell: (b) => {
        const { economics } = pricingById.get(b.id)!;
        if (economics.marginPercent == null) {
          return (
            <Stacked
              value="—"
              hint={`${economics.unknownCostLines} kalemin maliyeti yok`}
              title="Maliyeti bilinmeyen kalem var — marj hesaplanmaz, uydurulmaz"
            />
          );
        }
        return (
          <Stacked
            value={percent(economics.marginPercent)}
            hint={`kâr ${money(economics.profitCents ?? 0)} · maliyet ${money(economics.costCents ?? 0)}`}
            alert={(economics.profitCents ?? 0) < 0}
            title="Maliyet üzerine markup · kâr KDV hariç satıştan hesaplanır"
          />
        );
      },
    },
    {
      // Mutabakat rozeti YALNIZ bozukken çıkar. Her satırda yeşil "Toplam tutar" yazmak olağan hâli
      // kutlamaktı ve bir sütunu gürültüye harcıyordu; o yer artık paraya gidiyor.
      key: 'balance',
      header: '',
      width: '116px',
      cell: (b) => {
        const { balance } = pricingById.get(b.id)!;
        if (balance.balanced) return null;
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

  // Sözlük ve satır hesapları girdileri değişmedikçe yeniden kurulmaz; hesap satır başına BİR kez
  // yapılır (üç hücre de aynı sonucu okuyor, üç kez hesaplamıyor).
  const poolById = useMemo(() => new Map(pool.map((p) => [p.variantId, p])), [pool]);
  const pricingById = useMemo<PricingMap>(
    () => new Map(bundles.map((b) => [b.id, pricingOf(b, poolById)])),
    [bundles, poolById],
  );
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
          Paylar birim fiyatlara oransal dağıtılır · marj maliyetten türetilir · yeni ürün yaratmaz · sürükle-sırala
        </span>
      </div>

      <Table
        columns={bundleColumns(poolById, pricingById, onToggle)}
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
