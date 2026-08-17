'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { CopyInline } from '@/components/operation/ui/copy-text';
import { PageHeader } from '@/components/operation/ui/page-header';
import { COUNTRY_LABELS } from '@/components/operation/ui/labels';
import { addressForClipboard, addressOneLine, statusLabel, statusTone } from './warehouses-labels';
import { reorderWarehousesAction } from './actions';
import { MeasurePoints } from './measure-points';
import { FacilityStrip, Scorecard, SectionHead, SetupGapNote, StaffChips, ZoneCard } from './warehouses-sections';
import type { MeasurePointView, WarehouseCardView, WarehouseRowView, WarehousesData, ZoneCardView } from './warehouses-types';

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
  /** Ölçüm noktaları (19.28) — ekleme türü düğmeden belli, pencerede tekrar sorulmuyor. */
  onAddPoint: (kind: 'area' | 'vehicle') => void;
  onEditPoint: (point: MeasurePointView) => void;
  onTogglePoint: (point: MeasurePointView) => void;
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
  onAddPoint,
  onEditPoint,
  onTogglePoint,
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
            /**
             * **Kod ve adres KOPYALANABİLİR** (`design/pages/admin-depolar.md §2/§7`) — ikisi de
             * sistem dışına elle taşınıyor: kod belge önekidir (`IMH-STR-26-0012`) ve denetmen onu
             * kâğıda yazar, adres irsaliyeye ve tedarikçi yazışmasına girer. Elle yeniden yazmak
             * bu iki alanda bir yazım hatası sınıfı açar.
             *
             * İkon SESSİZ (`CopyInline`): asıl olan metin, düğme kendini onun önüne koymamalı.
             */
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

          {/* ── KÜNYE BÖLÜMÜ KALKTI (17.08, kullanıcının ekran turu) ──────────────────────────
              Dört karttan üçü başlığın kelimesi kelimesine tekrarıydı: `Kod` alt satırda yazılı,
              `Ülke` adresin sonunda, `Kargo çıkışı` başlığın rozetinde. Dördüncüsü (`Bağlı
              personel`) bir SAYIYDI ve hemen altındaki bölüm zaten aynı kişileri ADLARIYLA
              listeliyor — sayı, listenin özeti olmaktan çok listenin tekrarıydı.
              Geriye yalnız belge önekleri (`IMH-…` · `TRF-…`) kalıyordu; onlar da belgenin
              üstünde zaten yazılı, burada bir karara girdi değiller. Bir bölümün tamamı, dört
              kutu yer kaplayıp tek yeni cümle söylemiyordu. */}

          {/* ── Karne ── sayar, listelemez. **EN ÜSTTE** (kullanıcı kararı 17.08): sayfaya girenin
              ilk sorusu "bu depo bugün nasıl?" — kurulum (hizmet alanı, noktalar, personel) ise
              bir kez yapılıp aylarca dönülmeyen iştir. Kurulumu üste koymak, her gün sorulan
              soruyu her gün kaydırtıyordu. */}
          <section className="flex flex-col gap-2.5">
            <SectionHead title="Karne" hint="bugün nasıl durduğu — her sayı Stok'a bu depo bağlamıyla gider" />
            <Scorecard card={card.scorecard} code={row.code} />
          </section>

          {/* ── Hizmet alanı ── Teslimat'tan buraya taşındı (01.08): kurulum kurulumla durur. */}
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
            {/* ÜÇ KATMANLI YAPIYI ANLATAN PARAGRAF KALKTI (17.08): kurulum ekranı değil, ders
                metniydi — çakışma reddini ekran zaten kısıt cümlesiyle söylüyor, kod çıkarmanın
                sonucunu da değişiklik anında yazıyor. Kural `DOMAIN §17` ve migration'da yaşıyor. */}
          </section>

          {/* ── Ölçüm noktaları ── hijyen defterinin zemini (19.28). */}
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

          {/* ── Bağlı personel ── okunur; kapsam ataması Ayarlar'da. */}
          <section className="flex flex-col gap-2.5 border-t border-ops-line-soft pt-4">
            <SectionHead title="Bağlı personel" hint="okunur — kapsam ataması Ayarlar'da" />
            <StaffChips staff={card.staff} />
          </section>

          {/* ── AĞ GENELİ BÖLÜMÜ KALKTI (17.08, kullanıcı kararı) ─────────────────────────────
              Kendi başlığı zaten "seçili tesise ait değil" diyordu — bir sayfada, o sayfanın
              sorusuna cevap vermediğini söyleyerek duran bir bölüm.

              İki şey taşıyordu:
              · **Posta kodu talebi tablosu.** 04.08'de buraya "karar burada veriliyor" diye
                konmuştu (`19.21`). O gerekçe 07.08'de sona erdi: bölge kurulumu Teslimat & Rota'ya
                taşındı ve harita geldi. Bugün "nereye açılmalıyız" sorusu haritada, kodun NEREDE
                olduğu görülerek cevaplanıyor — aynı `postal_code_demand` verisi mor noktalarda,
                künyesiyle birlikte. Tablo, dayandığı gerekçe kalkınca yerinde kalmıştı.
              · **"Şu ülkede kargo çıkış deposu yok" uyarısı.** Tek ülkeli bir kurulumda hiç
                tetiklenmez; ikinci ülke açılırsa bu bir KURULUM kararıdır ve künye penceresinde
                verilir.

              Kayıt: `19.27` bu kararla kapandı — verinin evi harita, oranlı okuma (`sip./talep`)
              gerekirse Analitik'in işidir, kurulum sayfasının değil. */}
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
