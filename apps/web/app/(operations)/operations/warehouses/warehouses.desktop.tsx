'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { PageHeader } from '@/components/operation/ui/page-header';
import { COUNTRY_LABELS } from '@/components/operation/ui/labels';
import { addressOneLine, statusLabel, statusTone } from './warehouses-labels';
import { reorderWarehousesAction } from './actions';
import {
  FacilityStrip,
  FactCard,
  Scorecard,
  SectionHead,
  SetupGapNote,
  ShippingGapBanner,
  StaffChips,
  ZoneCard,
  ZoneDemandTable,
} from './warehouses-sections';
import type { WarehouseCardView, WarehouseRowView, WarehousesData, ZoneCardView } from './warehouses-types';

// Depolar — web. **TEK görünüm** (kullanıcı kararı 16.08): başlık · tesis şeridi · seçili tesisin
// detayı. Alt alta, hepsi aynı ekranda.
//
// ── ÖNCE İKİ GÖRÜNÜMDÜ VE SORUN ORADAYDI ────────────────────────────────────
// 16.08'e kadar sayfa iki hâl arasında gidip geliyordu: seçim yokken tesis listesi, seçim varken
// sol ray + kart. İkinci tesise bakmak için önce "tüm depolar"a dönmek gerekiyordu ve aynı nesnenin
// iki ayrı sayfası varmış gibi duruyordu. Kullanıcının tarifi tek cümleydi: *"başlığın hemen altına
// depo isimlerini koyalım, seçtiği deponun detayı aşağıdaki bölümde görünsün."*
//
// **Liste görünümünün taşıdığı hiçbir şey kaybolmadı:** sıralama şeride geçti (`FacilityStrip`),
// kargo boşluğu uyarısı ve ağ geneli talep tablosu detayın ALTINDA ayrı bir bölüm oldu — ikisi de
// tesise değil AĞA ait ve o ayrım metinle söyleniyor.
//
// ── BAŞLIK SEÇİLİ TESİSİN ────────────────────────────────────────────────────
// Tasarım kartı kendi iç başlığıyla çiziyordu (kod + ad + adres + rozetler). O başlık ortak başlık
// barına (09.19) TAŞINDI: iki bar üst üste dikey alanı ikinci kez öderdi. Rozetler ve "Künyeyi
// düzenle" barın ekran-işleri yuvasında duruyor; "+ Depo" da orada, çünkü artık liste görünümü yok.
//
// ── KABUĞUN DEPO SEÇİCİSİ BU SAYFADA GİZLİ ──────────────────────────────────
// `hideWarehousePicker` — sayfanın kendi şeridi geldiğinde barda iki seçici yan yana düşüyordu:
// biri ekranı değiştiriyor, öteki hiçbir şey yapmıyor (sayfa depo bağlamını daraltıcı olarak
// okumuyor). Gerekçenin tamamı `PageHeader` künyesinde.

interface WarehousesViewProps {
  data: WarehousesData;
  navPending: boolean;
  onSelect: (code: string) => void;
  onNewWarehouse: () => void;
  onEditWarehouse: (row: WarehouseRowView) => void;
  onNewZone: () => void;
  onEditZone: (zone: ZoneCardView) => void;
}

export function WarehousesDesktop(props: WarehousesViewProps) {
  const { data } = props;
  return <FacilityView {...props} card={data.card} />;
}

/**
 * Tesis şeridinin sırası — sürükleme anında listeyi yerinde tutar, sunucu cevabı gelince
 * `router.refresh()` gerçeği geri yazar (hata hâlinde şerit sunucunun bildiğine döner).
 *
 * Sıra OPERATÖRÜNDÜR ve sistemdeki **bütün** depo seçicilerinde aynıdır (bağlam seçicisi, tablo
 * süzgeci, transfer hedefi) — bu yüzden liste görünümü kalkarken sıralama da onunla gitmedi.
 */
function useFacilityOrder(rows: readonly WarehouseRowView[]) {
  const router = useRouter();
  const [order, setOrder] = useState(rows);
  useEffect(() => setOrder(rows), [rows]);

  const reorder = (ids: string[]) => {
    const byId = new Map(order.map((r) => [r.id, r]));
    setOrder(ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])));
    void reorderWarehousesAction(ids).then(() => router.refresh());
  };

  return { order, reorder };
}

// ── Tesis görünümü ──────────────────────────────────────────────────────────

function FacilityView({
  data,
  navPending,
  onSelect,
  onNewWarehouse,
  onEditWarehouse,
  onNewZone,
  onEditZone,
  card,
}: WarehousesViewProps & { card: WarehouseCardView | null }) {
  const { order, reorder } = useFacilityOrder(data.rows);
  const row = card?.row ?? null;
  const address = row ? addressOneLine(row.address, row.countryCode) : null;
  const codeCount = card ? card.zones.filter((z) => z.isActive).reduce((sum, z) => sum + z.postalCodes.length, 0) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title={row?.name ?? 'Depolar'}
        hideWarehousePicker
        // Hâl BAŞLIĞIN yanında, aksiyonların arasında değil: rozet bir durumdur, kontrol değil.
        status={
          row ? (
            <>
              <Badge tone={statusTone(row)}>{statusLabel(row)}</Badge>
              {row.shipsOnline ? (
                <Badge tone="blue" outline>
                  Kargo çıkışı · {COUNTRY_LABELS[row.countryCode]}
                </Badge>
              ) : null}
            </>
          ) : undefined
        }
        subtitle={
          row ? (
            <span className="flex items-center gap-1.5">
              <span className="font-ops-mono font-semibold text-ops-body">{row.code}</span>
              <span>· {address ?? 'adres girilmedi'}</span>
            </span>
          ) : (
            'henüz tesis yok — ilkini ekleyin'
          )
        }
      >
        {row ? (
          <Button variant="secondary" onClick={() => onEditWarehouse(row)}>
            Künyeyi düzenle
          </Button>
        ) : null}
        <Button variant="primary" onClick={onNewWarehouse}>
          + Depo
        </Button>
      </PageHeader>

      {order.length > 0 ? (
        <FacilityStrip rows={order} activeCode={row?.code ?? ''} onSelect={onSelect} onReorder={reorder} />
      ) : null}

      {card && row ? (
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

          {/* ── AĞ GENELİ ── seçili tesise ait DEĞİL, ve bunu başlığı söylüyor.
              Tek görünüme geçerken bu iki blok evsiz kalmıştı: ikisi de "ağ olarak nereye
              açılmalıyız / nerede boşluk var" sorusunun cevabı, yani bir tesisin künyesine
              konamaz. Ayrık bir bölüm olarak duruyorlar ve ayraç metni de bunu tekrarlıyor —
              aksi hâlde okuyan onları seçili deponun verisi sanardı. */}
          <section className="flex flex-col gap-2.5 border-t border-ops-line pt-4">
            <SectionHead
              title="Ağ geneli"
              hint="seçili tesise ait değil — hepsini birlikte ilgilendiren iki soru: nerede kargo çıkışı eksik, nereye açılmalıyız"
            />
            <ShippingGapBanner countries={data.countriesWithoutShipping} />
            <ZoneDemandTable rows={data.zoneDemand} />
            <p className="px-0.5 font-ops-body text-ops-sm leading-relaxed text-ops-muted">
              Kapalı depo listeden silinmez — geçmiş sipariş ve parti hangi tesisten çıktığını bilmek zorundadır. Hiçbir
              seçicide, süzgeçte ve transfer hedefinde görünmez.
            </p>
          </section>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 py-[18px]">
          <p className="font-ops-body text-ops-sm leading-relaxed text-ops-muted">
            Henüz tesis yok. İlk depoyu eklediğinizde künyesi, hizmet alanı ve karnesi burada açılır.
          </p>
        </div>
      )}
    </div>
  );
}
