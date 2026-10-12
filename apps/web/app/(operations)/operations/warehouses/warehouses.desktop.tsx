'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { CopyInline } from '@/components/operation/ui/copy-text';
import { PageHeader } from '@/components/operation/ui/page-header';
import { SectionHead, SetupGapNote } from '@/components/operation/ui/section-head';
import { addressForClipboard, addressOneLine, statusLabel, statusTone } from './warehouses-labels';
import { reorderWarehousesAction } from './actions';
import { MeasurePoints } from './measure-points';
import type { ShippingBox } from '@lezzet/types';
import { shipCountriesLabel } from './ship-countries';
import {
  FacilityStrip,
  PrinterCard,
  Scorecard,
  ShipCountriesCard,
  ShippingBoxCard,
  StaffChips,
  VanLoadRow,
  ZoneCard,
} from './warehouses-sections';
import type { MeasurePointView, WarehouseCardView, WarehouseRowView, WarehousesData, ZoneCardView } from './warehouses-types';

// Depolar tek görünümdür: başlık, tesis şeridi ve seçili tesisin detayı alt alta, ki ikinci tesise bakmak için listeye dönülmesin.
// Seçili tesisin başlığı ortak başlık barındadır ve kabuğun depo seçicisi gizlidir, çünkü sayfanın kendi tesis şeridi var.

interface WarehousesViewProps {
  data: WarehousesData;
  navPending: boolean;
  onSelect: (code: string) => void;
  onNewWarehouse: () => void;
  onEditWarehouse: (row: WarehouseRowView) => void;
  onNewZone: () => void;
  onEditZone: (zone: ZoneCardView) => void;
  /** Ölçüm noktası ekleme; tür düğmeden bellidir, pencerede yeniden sorulmaz. */
  onAddPoint: (kind: 'area' | 'vehicle') => void;
  onEditPoint: (point: MeasurePointView) => void;
  onTogglePoint: (point: MeasurePointView) => void;
  /** Etiket yazıcısı penceresi. */
  onEditPrinter: () => void;
  onAddShippingBox: () => void;
  onEditShippingBox: (box: ShippingBox) => void;
  onAdoptShippingBox: (templateId: string) => void;
  onToggleShippingBox: (box: ShippingBox) => void;
  onDeleteShippingBox: (box: ShippingBox) => void;
}

export function WarehousesDesktop(props: WarehousesViewProps) {
  const { data } = props;
  return <FacilityView {...props} card={data.card} />;
}

/**
 * Tesis şeridinin sırası: sürükleme anında liste yerinde güncellenir, sunucu cevabıyla `router.refresh()` gerçeği geri yazar. Sıra
 * operatöründür ve bütün depo seçicilerinde aynıdır (bağlam seçicisi, tablo süzgeci, transfer hedefi).
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
  onAddPoint,
  onEditPoint,
  onTogglePoint,
  onEditPrinter,
  onAddShippingBox,
  onEditShippingBox,
  onAdoptShippingBox,
  onToggleShippingBox,
  onDeleteShippingBox,
  card,
}: WarehousesViewProps & { card: WarehouseCardView | null }) {
  const { order, reorder } = useFacilityOrder(data.rows);
  const row = card?.row ?? null;
  const address = row ? addressOneLine(row.address, row.countryCode) : null;
  const clipboardAddress = row ? addressForClipboard(row.address, row.countryCode) : null;
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
              {row.shipCountries.length > 0 ? (
                <Badge tone="blue" outline>
                  Kargo · {shipCountriesLabel(row)}
                </Badge>
              ) : null}
            </>
          ) : undefined
        }
        subtitle={
          row ? (
            // Kod ve adres kopyalanabilir, çünkü ikisi de sistem dışına elle taşınır: kod belge önekidir, adres irsaliyeye girer. İkon
            // sessizdir, asıl olan metindir.
            <span className="flex items-center gap-1.5">
              <span className="font-ops-mono font-semibold text-ops-body">{row.code}</span>
              <CopyInline text={row.code} what="Kodu" />
              <span>· {address ?? 'adres girilmedi'}</span>
              {/* Panoya giden metin EKRANDAKİ DEĞİL: irsaliyeye yapıştırılacak adres satır sonuyla
                  yazılır, `·` ayracıyla değil (`addressForClipboard` künyesi). */}
              {clipboardAddress ? <CopyInline text={clipboardAddress} what="Adresi" /> : null}
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

          {/* Karne en üstte, çünkü sayfaya girenin ilk sorusu "bu depo bugün nasıl"; kurulum bir kez yapılıp aylarca dönülmeyen iştir. */}
          <section className="flex flex-col gap-2.5">
            <SectionHead title="Karne" hint="bugün nasıl durduğu — her sayı Stok'a bu depo bağlamıyla gider" />
            <Scorecard card={card.scorecard} code={row.code} />
            {/* Karnenin ALTINDA, içinde değil: dört kutu deponun içini sayıyor, bu satır dışını.
                Beşinci kutu olsaydı aynı ağırlıkta okunur ve "ek olarak" anlamını yitirirdi. */}
            {card.vanLoad && <VanLoadRow load={card.vanLoad} />}
          </section>

          {/* Kargo yalnız Lezzet tesisinden çıkar (kural veritabanında); araçta ve QUALITE deposunda bölüm söyleyecek bir şey taşımaz. */}
          {row.kind === 'facility' && row.business === 'lezzet' ? (
            <section className="flex flex-col gap-2.5 border-t border-ops-line-soft pt-4">
              <SectionHead
                title="Kargo ülkeleri"
                hint="bu depodan taşıyıcıyla gönderilen ülkeler"
                aside={
                  <Button variant="secondary" size="sm" onClick={() => onEditWarehouse(row)}>
                    Düzenle
                  </Button>
                }
              />
              <ShipCountriesCard row={row} />
            </section>
          ) : null}

          {/* Hizmet alanı: kurulum kurulumla durur. */}
          <section className="flex flex-col gap-2.5 border-t border-ops-line-soft pt-4">
            <SectionHead
              title="Hizmet alanı"
              hint="nereye hizmet ettiği"
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
                className="flex cursor-pointer flex-col justify-center gap-1 rounded-ops-card border border-dashed border-ops-line-strong bg-ops-subtle px-3.5 py-3 text-left transition-colors hover:border-ops-olive"
              >
                <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">Bölge ekle</span>
                {/* Düğme nereye GÖTÜRDÜĞÜNÜ söyler; kuralları anlatmaz — kod seçiminin nasıl
                    çalıştığını gidilen ekran zaten gösteriyor (harita + referans tablosu). */}
                <span className="font-ops-body text-ops-sm leading-snug text-ops-body">Teslimat &amp; Rota'da açılır</span>
              </button>
            </div>
          </section>

          {/* Ölçüm noktaları: hijyen defterinin zemini. */}
          <section className="flex flex-col gap-2.5 border-t border-ops-line-soft pt-4">
            <SectionHead
              title="Ölçüm noktaları"
              hint="soğuk zincirin iki yeri — depodaki dolap, yoldaki araç; noktaya tıklayın, hijyen takvimi açılsın"
            />
            <MeasurePoints
              points={card.points}
              warehouseId={row.id}
              truncated={card.measureTruncated}
              onAdd={onAddPoint}
              onEdit={onEditPoint}
              onToggle={onTogglePoint}
            />
          </section>

          {/* İki etiket türü iki kâğıda basılır (4×6 kutu etiketi, taşıyıcının A6'sı); envanter burada, hangisinin kullanılacağını
              telefon seçer. */}
          <section className="flex flex-col gap-2.5 border-t border-ops-line-soft pt-4">
            <SectionHead
              title="Etiket yazıcıları"
              hint="kutu etiketi ve kargo etiketi ayrı kâğıtlara basılır — boy, takılı kâğıdın beyanıdır"
            />
            <PrinterCard printers={card.printers} onEdit={onEditPrinter} />
          </section>

          {/* Kargo kutuları: taşıyıcıya verilen dış kutunun ölçüsü, etiketin ön şartıdır. */}
          <section className="flex flex-col gap-2.5 border-t border-ops-line-soft pt-4">
            <SectionHead
              title="Kargo kutuları"
              hint="taşıyıcıya verilen dış kutu — gönderi ağırlığı ürünlerin ambalajlı ağırlığı + kutunun darasıdır"
            />
            <ShippingBoxCard
              view={card.shippingBoxes}
              onAdd={onAddShippingBox}
              onEdit={onEditShippingBox}
              onAdopt={onAdoptShippingBox}
              onToggle={onToggleShippingBox}
              onDelete={onDeleteShippingBox}
            />
          </section>

          {/* Bağlı personel okunur; kapsam ataması Ayarlar'dadır. */}
          <section className="flex flex-col gap-2.5 border-t border-ops-line-soft pt-4">
            <SectionHead title="Bağlı personel" hint="okunur — kapsam ataması Ayarlar'da" />
            <StaffChips staff={card.staff} />
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
