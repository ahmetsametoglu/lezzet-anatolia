'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { PageHeader } from '@/components/operation/ui/page-header';
import { SortableList } from '@/components/operation/ui/sortable-list';
import { COUNTRY_LABELS } from '@/components/operation/ui/labels';
import { addressOneLine, statusLabel, statusTone } from './warehouses-labels';
import { reorderWarehousesAction } from './actions';
import {
  FacilityRail,
  FactCard,
  Scorecard,
  SectionHead,
  SetupGapNote,
  ShippingGapBanner,
  StaffChips,
  WarehouseListRow,
  ZoneCard,
} from './warehouses-sections';
import type { WarehouseCardView, WarehouseRowView, WarehousesData, ZoneCardView } from './warehouses-types';
import type { WarehousesUrlState } from './warehouses-url';

// Depolar — web. İki görünüm, tek ekran:
//  · seçim yokken  → tesis LİSTESİ (sıralanabilir; sıra tüm depo seçicilerinde aynıdır)
//  · seçim varken  → tesis rayı + KART (künye · hizmet alanı · karne · personel)
//
// Tasarım kartı kendi iç başlığıyla çiziyordu (kod + ad + adres + rozetler). O başlık ortak başlık
// barına (09.19) TAŞINDI: iki bar üst üste dikey alanı ikinci kez öderdi ve barın var oluş sebebi
// tam tersiydi. Rozetler ve "Künyeyi düzenle" barın ekran-işleri yuvasında duruyor.

export interface WarehousesViewProps {
  data: WarehousesData;
  urlState: WarehousesUrlState;
  navPending: boolean;
  onSelect: (code: string) => void;
  onNewWarehouse: () => void;
  onEditWarehouse: (row: WarehouseRowView) => void;
  onNewZone: () => void;
  onEditZone: (zone: ZoneCardView) => void;
}

export function WarehousesDesktop(props: WarehousesViewProps) {
  const { data } = props;
  return data.card ? <FacilityView {...props} card={data.card} /> : <ListView {...props} />;
}

// ── Liste görünümü ──────────────────────────────────────────────────────────

function ListView({ data, navPending, onSelect, onNewWarehouse }: WarehousesViewProps) {
  const active = data.rows.filter((r) => r.isActive);
  const parts = [
    `${active.length} aktif`,
    data.rows.length - active.length > 0 ? `${data.rows.length - active.length} kapalı` : null,
    active.some((r) => r.setupGap) ? `${active.filter((r) => r.setupGap).length} kurulumu eksik` : null,
    'sıra tüm depo seçicilerinde aynıdır',
  ].filter(Boolean);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Depolar" subtitle={parts.join(' · ')}>
        <Button variant="primary" onClick={onNewWarehouse}>
          + Depo
        </Button>
      </PageHeader>

      <ShippingGapBanner countries={data.countriesWithoutShipping} />

      <div
        aria-busy={navPending || undefined}
        className={['min-h-0 flex-1 overflow-y-auto px-6 py-4', navPending ? 'pointer-events-none opacity-60' : ''].join(' ')}
      >
        {/* Aralığı KAP verir: `SortableList` DOM kabı çizmiyor (dnd sağlayıcıları eleman üretmez),
            satırlar doğrudan buraya düşüyor. Çerçeveli kartlar bitişik durursa kenarlıklar üst üste
            biner ve liste kırık okunur — ayraçlı listelerde (katalog üyeleri, paket kalemleri)
            bitişiklik doğru, burada değil. */}
        <div className="flex flex-col gap-2.5">
          <WarehouseList rows={data.rows} onSelect={onSelect} />
        </div>
        <p className="px-0.5 pb-1 pt-3 font-ops-body text-ops-sm leading-relaxed text-ops-muted">
          Kapalı depo listeden silinmez — geçmiş sipariş ve parti hangi tesisten çıktığını bilmek zorundadır. Hiçbir
          seçicide, süzgeçte ve transfer hedefinde görünmez.
        </p>
      </div>
    </div>
  );
}

/**
 * Sıralanabilir tesis listesi.
 *
 * Sıra OPERATÖRÜNDÜR ve sistemdeki **bütün** depo seçicilerinde aynıdır (bağlam seçicisi, tablo
 * süzgeci, transfer hedefi). Yerel durum sürükleme anında listeyi yerinde tutar; sunucu cevabı
 * gelince `router.refresh()` gerçeği geri yazar — hata hâlinde liste sunucunun bildiğine döner.
 */
function WarehouseList({ rows, onSelect }: { rows: readonly WarehouseRowView[]; onSelect: (code: string) => void }) {
  const router = useRouter();
  const [order, setOrder] = useState(rows);
  useEffect(() => setOrder(rows), [rows]);

  return (
    <SortableList
      items={[...order]}
      getId={(row) => row.id}
      onReorder={(ids) => {
        const byId = new Map(order.map((r) => [r.id, r]));
        setOrder(ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])));
        void reorderWarehousesAction(ids).then(() => router.refresh());
      }}
      renderItem={(row, handle) => (
        <WarehouseListRow
          row={row}
          index={order.indexOf(row)}
          handle={handle}
          onOpen={() => onSelect(row.code)}
        />
      )}
    />
  );
}

// ── Tesis kartı ─────────────────────────────────────────────────────────────

function FacilityView({
  data,
  urlState,
  navPending,
  onSelect,
  onEditWarehouse,
  onNewZone,
  onEditZone,
  card,
}: WarehousesViewProps & { card: WarehouseCardView }) {
  const { row } = card;
  const address = addressOneLine(row.address, row.countryCode);
  const codeCount = card.zones.filter((z) => z.isActive).reduce((sum, z) => sum + z.postalCodes.length, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title={row.name}
        // Hâl BAŞLIĞIN yanında, aksiyonların arasında değil: rozet bir durumdur, kontrol değil.
        status={
          <>
            <Badge tone={statusTone(row)}>{statusLabel(row)}</Badge>
            {row.shipsOnline ? (
              <Badge tone="blue" outline>
                Kargo çıkışı · {COUNTRY_LABELS[row.countryCode]}
              </Badge>
            ) : null}
          </>
        }
        subtitle={
          <span className="flex items-center gap-1.5">
            <span className="font-ops-mono font-semibold text-ops-body">{row.code}</span>
            <span>· {address ?? 'adres girilmedi'}</span>
          </span>
        }
      >
        <Button variant="secondary" onClick={() => onEditWarehouse(row)}>
          Künyeyi düzenle
        </Button>
      </PageHeader>

      <div className="flex min-h-0 flex-1">
        <FacilityRail rows={data.rows} activeCode={urlState.code} onSelect={onSelect} />

        <div
          aria-busy={navPending || undefined}
          className={['flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 py-[18px]', navPending ? 'pointer-events-none opacity-60' : ''].join(' ')}
        >
          {row.setupGap ? <SetupGapNote text={row.setupGap} /> : null}
          {!row.isActive ? (
            <SetupGapNote text="Bu tesis kapalı: stoğu kayıtta durur ama satış okumalarında görünmez, hiçbir seçicide ve transfer hedefinde çıkmaz. Künyeden yeniden açabilirsiniz." />
          ) : null}

          {/* ── Künye ── kim olduğu; belgelere basılan gerçek. */}
          <section className="flex flex-col gap-2.5">
            <SectionHead title="Künye" hint="kim olduğu — belgelere basılan gerçek" />
            <div className="grid grid-cols-4 gap-2.5">
              <FactCard label="Kod" value={row.code} note={`IMH-${row.code}-… · TRF-${row.code}-…`} />
              <FactCard label="Ülke" value={COUNTRY_LABELS[row.countryCode]} note="KDV modeline bağlı" tone="amber" />
              <FactCard
                label="Kargo çıkışı"
                value={row.shipsOnline ? `Evet · ${COUNTRY_LABELS[row.countryCode]}` : 'Hayır'}
                note="ülke başına tek"
              />
              <FactCard
                label="Bağlı personel"
                value={String(row.staffCount)}
                note={row.staffCount === 0 ? 'kapsamlı personel yok' : 'kapsamında bu depo olan kişi'}
                tone={row.staffCount === 0 ? 'amber' : undefined}
              />
            </div>
          </section>

          {/* ── Hizmet alanı ── Teslimat'tan buraya taşındı (01.08): kurulum kurulumla durur. */}
          <section className="flex flex-col gap-2.5 border-t border-ops-line-soft pt-4">
            <SectionHead
              title="Hizmet alanı"
              hint="nereye hizmet ettiği · Teslimat'tan buraya taşındı (kurulum kurulumla durur)"
              aside={
                <span className="rounded-ops-btn border border-ops-olive-line bg-ops-olive-bg px-2.5 py-1 font-ops-mono text-ops-sm text-ops-olive-dark">
                  {row.code}'ye {codeCount} posta kodu bağlı
                </span>
              }
            />
            <div className="grid grid-cols-3 gap-2.5">
              {card.zones.map((zone) => (
                <ZoneCard key={zone.id} zone={zone} homeCountry={row.countryCode} onEdit={() => onEditZone(zone)} />
              ))}
              <button
                type="button"
                onClick={onNewZone}
                className="flex cursor-pointer flex-col justify-center gap-2 rounded-ops-card border border-dashed border-ops-line-strong bg-ops-subtle px-3.5 py-3 text-left transition-colors hover:border-ops-olive"
              >
                <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">Bölge ekle</span>
                <span className="font-ops-body text-ops-sm leading-snug text-ops-body">
                  Kodlar referans tablosundan seçilir; serbest metin girişi yok — haritada olmayan kod sisteme giremez.
                </span>
              </button>
            </div>
            <span className="font-ops-body text-ops-xs leading-relaxed text-ops-muted">
              Yapı gün taşıdığı için üç katmanlıdır: <strong>depo → bölge → kodlar</strong>. Bir kod yalnız tek bölgede
              olabilir; çakışma reddedilir ve tutan bölge/depo söylenir. Kodu çıkarmak o adresleri rota dışına düşürür,
              kargo yoluna geçirir.
            </span>
          </section>

          {/* ── Karne ── sayar, listelemez. */}
          <section className="flex flex-col gap-2.5 border-t border-ops-line-soft pt-4">
            <SectionHead
              title="Karne"
              hint="bugün nasıl durduğu — sayar, listelemez; her sayı Stok'a bu depo bağlamıyla gider"
            />
            <Scorecard card={card.scorecard} code={row.code} />
          </section>

          {/* ── Bağlı personel ── okunur. */}
          <section className="flex flex-col gap-2.5 border-t border-ops-line-soft pt-4">
            <SectionHead
              title="Bağlı personel"
              hint="okunur — kapsam ataması Ayarlar'daki kişi kartındadır, kişi tek yerden yönetilir"
            />
            <StaffChips staff={card.staff} />
          </section>
        </div>
      </div>
    </div>
  );
}
