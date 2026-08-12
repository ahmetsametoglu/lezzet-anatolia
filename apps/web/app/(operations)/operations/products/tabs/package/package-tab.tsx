'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { bundleBalance, markupPercent } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import { IMAGE_ROLES, cropOf, resolveLocalizedText } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { FEATURED_SLOTS } from '@/lib/catalog/featured-slots';
import { Badge } from '@/components/operation/ui/badge';
import { money, percent } from '@/components/operation/ui/format';
import { ImageIcon } from '@/components/operation/ui/icons';
import { Table, type Column } from '@/components/operation/ui/table';
import { Toggle } from '@/components/operation/form/toggle';
import { reorderBundlesAction, setBundleActiveAction, setBundleFeaturedAction } from '@/lib/catalog/bundle-actions';
import { BundleFormDialog } from './bundle-form-dialog';
import type { BundleView } from '../../products-types';

// Paketler sekmesi — tasarımın liste satırı: 3:2 görsel + ad + "N kalem · slug" + fiyat + mutabakat
// rozeti. Rozetin dili tasarımdan: "Toplam tutar" / "Toplam tutmuyor". Oluştur/düzenle dialogu bu
// modülün İÇİNDE (kabuk yalnız niyeti taşır).
//
// MUTABAKAT LİSTEDE DE HESAPLANIR, çünkü tutmayan paket kaydedilemese bile sonradan bozulabilir:
// bir kalemin adedi ya da fiyatı başka bir yerden değişirse (ileride toplu işlem) satır bunu söyler.
// Karar motorda (`bundleBalance`) — liste kendi ölçütünü uydurmaz.


/**
 * Satırın parası — toplamlar SUNUCUDA yapıldı (`bundle_list_rows()`), burada yalnız KARAR veriliyor:
 * mutabakat ve marj motorun (`domain-core`). Liste kendi ölçütünü uydurmaz, hesabı da tekrarlamaz.
 */
function pricingOf(bundle: BundleView) {
  const balance = bundleBalance(
    [{ qty: 1, allocatedUnitPriceCents: toCents(bundle.allocatedTotal) }],
    toCents(bundle.totalPrice),
  );
  // Toplam EKSİKSE gösterilmez: fiyatı/maliyeti girilmemiş kalem varsa yarım toplam tam sanılırdı.
  const listTotalCents = bundle.missingPriceCount > 0 || bundle.listTotal == null ? null : toCents(bundle.listTotal);
  const costCents = bundle.missingCostCount > 0 || bundle.costTotal == null ? null : toCents(bundle.costTotal);
  const revenueHtCents = toCents(bundle.revenueHt);
  return {
    balance,
    listTotalCents,
    discountPercent: listTotalCents == null || listTotalCents <= 0
      ? null
      : ((listTotalCents - toCents(bundle.totalPrice)) / listTotalCents) * 100,
    costCents,
    profitCents: costCents == null ? null : revenueHtCents - costCents,
    marginPercent: costCents == null ? null : markupPercent(revenueHtCents, costCents),
  };
}

type PricingMap = Map<string, ReturnType<typeof pricingOf>>;

/** İki satırlı hücre: üstte karar veren sayı, altında onu açan bağlam. */
function Stacked({ value, hint, alert, title }: { value: string; hint?: string; alert?: boolean; title?: string }) {
  return (
    <span className="flex min-w-0 flex-col items-end gap-px" title={title}>
      <span className={`font-ops-mono text-ops-base ${alert ? 'font-semibold text-ops-amber' : 'text-ops-ink'}`}>{value}</span>
      {hint ? <span className="truncate font-ops-body text-ops-micro text-ops-muted">{hint}</span> : null}
    </span>
  );
}

/** Vitrin ızgarasının paket slotu — sayı ve gerekçe `lib/catalog/featured-slots`'ta, tek yerde. */
const BUNDLE_SLOTS = FEATURED_SLOTS.bundle;

function bundleColumns(
  pricingById: PricingMap,
  onToggle: (id: string, next: boolean) => void,
  onFeature: (id: string, next: boolean) => void,
): Column<BundleView>[] {
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
        const blocked = b.blockedItemCount;
        return (
          <div className="flex min-w-0 flex-col gap-px">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{resolveLocalizedText(b.name)}</span>
              {/* Paket ancak TÜM kalemleri satılabilirse satılabilir. Ürünü pasife alınan paket
                  "Satışta" görünmeye devam ederdi — anahtar operatörün NİYETİNİ tutuyor, gerçeği
                  değil. Niyeti ezmek yerine gerçeği söylüyoruz: ürün geri açılınca paket kendiliğinden
                  döner ve kimse "bunu neden kapatmıştım" diye düşünmez. */}
              {blocked > 0 ? (
                <span
                  className="shrink-0 rounded bg-ops-amber-bg px-1.5 py-px font-ops-display text-ops-micro font-semibold uppercase tracking-[0.04em] text-ops-amber"
                  title={`${blocked} kalemin ürünü/boyu satışta değil — paket vitrinde görünmez. Ürünü satışa alınca paket kendiliğinden döner.`}
                >
                  vitrinde yok
                </span>
              ) : null}
            </div>
            <span className="truncate font-ops-body text-ops-xs text-ops-muted">
              {b.itemCount} kalem{b.serves ? ` · ${b.serves} kişilik` : ''} · slug: {b.slug}
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
        <span className="truncate font-ops-body text-ops-xs text-ops-body" title={b.itemLabels.join(' · ')}>
          {b.itemLabels.length > 0 ? b.itemLabels.join(' · ') : '—'}
        </span>
      ),
    },
    {
      key: 'price',
      header: 'Fiyat',
      width: '142px',
      align: 'right',
      cell: (b) => {
        const { listTotalCents, discountPercent } = pricingById.get(b.id)!;
        return (
          <Stacked
            value={money(toCents(b.totalPrice))}
            hint={
              listTotalCents == null
                ? 'birim fiyat eksik'
                : `ayrı ayrı ${money(listTotalCents)}${discountPercent != null && discountPercent > 0 ? ` · ${percent(discountPercent, 1)}` : ''}`
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
        const { marginPercent, profitCents, costCents } = pricingById.get(b.id)!;
        if (marginPercent == null) {
          return (
            <Stacked
              value="—"
              hint={`${b.missingCostCount} kalemin maliyeti yok`}
              title="Maliyeti bilinmeyen kalem var — marj hesaplanmaz, uydurulmaz"
            />
          );
        }
        return (
          <Stacked
            value={percent(marginPercent, 1)}
            hint={`kâr ${money(profitCents ?? 0)} · maliyet ${money(costCents ?? 0)}`}
            alert={(profitCents ?? 0) < 0}
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
      width: '124px',
      cell: (b) => {
        const { balance } = pricingById.get(b.id)!;
        if (balance.balanced) return null;
        return <Badge tone="amber">Tutmuyor · {money(Math.abs(balance.diffCents))}</Badge>;
      },
    },
    {
      key: 'featured',
      header: 'Vitrinde',
      width: '74px',
      align: 'center',
      // Satır çift tıklamayla formu açıyor; anahtar o davranışı YUTMALI (katalog sekmesiyle aynı).
      cell: (b) => (
        <span className="justify-self-center" onDoubleClick={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <Toggle on={b.isFeatured} size="sm" onChange={(next) => onFeature(b.id, next)} label="Vitrinde" />
        </span>
      ),
    },
    {
      key: 'active',
      header: 'Satışta',
      width: '70px',
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
  /** Oluşturma niyeti kabuktan (sekme çubuğundaki "+ Paket"); diyalog burada. */
  creating: boolean;
  onCreateClose: () => void;
}

export function PackagesTab({ bundles, creating, onCreateClose }: PackagesTabProps) {
  const router = useRouter();
  // Düzenlenen kayıt KİMLİKLE tutulur, verisi taze listeden türetilir (katalog sekmesinin deseni):
  // kopya tutulursa dialog içindeki görsel yüklemesi `router.refresh()` sonrası görünmez.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId !== null ? (bundles.find((b) => b.id === editingId) ?? null) : null;

  // İyimser sıra yalnız KİMLİK listesi (katalog sekmesiyle aynı gerekçe: satır verisi aynalanmaz).
  const [optimisticIds, setOptimisticIds] = useState<string[] | null>(null);
  useEffect(() => setOptimisticIds(null), [bundles]);

  // Sözlük ve satır hesapları girdileri değişmedikçe yeniden kurulmaz; hesap satır başına BİR kez
  // yapılır (üç hücre de aynı sonucu okuyor, üç kez hesaplamıyor).
  const pricingById = useMemo<PricingMap>(() => new Map(bundles.map((b) => [b.id, pricingOf(b)])), [bundles]);
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

  // Vitrin işareti (05.18). İyimser güncelleme YOK — gerekçe katalog sekmesindeki ikizinde:
  // başarısız yazımda sessizce geri dönen bir anahtar, operatöre işaretlediğini sandırırdı.
  const onFeature = (id: string, next: boolean) => {
    void setBundleFeaturedAction(id, next).then(({ error }) => {
      if (!error) router.refresh();
    });
  };

  // Sayaç "kaç tanesi VİTRİNDE GÖRÜNECEK" — "kaç tanesi işaretli" değil. İki eksen ayrı
  // (`isActive` = satışta mı · `isFeatured` = ana sayfada mı) ve satışta olmayan paket vitrine
  // çıkmaz; gerekçe katalog sekmesindeki ikizinde uzun uzun yazılı.
  const featured = bundles.filter((b) => b.isFeatured);
  const visibleCount = featured.filter((b) => b.isActive).length;
  const passiveCount = featured.length - visibleCount;
  const overflowing = visibleCount > BUNDLE_SLOTS;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-ops-line-soft px-6 py-[11px]">
        <span className="font-ops-body text-ops-sm text-ops-muted">
          Paylar birim fiyatlara oransal dağıtılır · marj maliyetten türetilir · yeni ürün yaratmaz · sürükle-sırala
        </span>
        <span
          className={`ml-auto flex-none font-ops-body text-ops-xs ${
            overflowing ? 'font-semibold text-ops-amber-dark' : 'text-ops-faint'
          }`}
        >
          {overflowing
            ? `Vitrinde ${visibleCount} işaretli — ana sayfada sıradan ilk ${BUNDLE_SLOTS} görünür`
            : `Vitrinde ${visibleCount}/${BUNDLE_SLOTS}`}
          {passiveCount > 0 ? ` · ${passiveCount} işaretli paket satışta değil, vitrine çıkmaz` : ''}
        </span>
      </div>

      <Table
        columns={bundleColumns(pricingById, onToggle, onFeature)}
        rows={displayed}
        rowKey={(b) => b.id}
        onReorder={handleReorder}
        onRowDoubleClick={(b) => setEditingId(b.id)}
        empty={
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
            <span className="font-ops-body text-ops-base text-ops-body">Henüz paket yok.</span>
            <span className="font-ops-body text-ops-sm text-ops-faint">
              Paket birkaç ürünü tek fiyata sunar; sepete eklenince kalemlere açılır.
            </span>
          </div>
        }
      />

      {creating ? <BundleFormDialog bundle={null} onClose={onCreateClose} /> : null}
      {editing ? (
        <BundleFormDialog key={editing.id} bundle={editing} onClose={() => setEditingId(null)} />
      ) : null}
    </div>
  );
}
