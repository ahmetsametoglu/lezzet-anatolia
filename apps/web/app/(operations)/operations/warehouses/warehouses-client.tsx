'use client';

import { useState, useTransition } from 'react';
import type { ShippingBox } from '@lezzet/types';
import { useRouter } from 'next/navigation';
import { setPointActiveAction, adoptShippingBoxAction, deleteShippingBoxAction, setShippingBoxActiveAction } from './actions';
import { CloseWarehouseDialog } from './close-warehouse-dialog';
import { MeasurePointDialog } from './measure-point-dialog';
import { PrinterDialog } from './printer-dialog';
import { ShippingBoxDialog } from './shipping-box-dialog';
import { WarehouseDialog } from './warehouse-dialog';
import { WarehousesDesktop } from './warehouses.desktop';
import { warehousesUrl, type WarehousesUrlState } from './warehouses-url';
import type { MeasurePointView, WarehousesData, WarehouseRowView, ZoneCardView } from './warehouses-types';

// Depolar ekranı client kökü: durum burada. Operasyon web'i masaüstü-yalnız; mobil deneyim native
// uygulamada (`docs/uygulama`).
//
// SEÇİM GERÇEK gezinmedir (`?depo=STR`): kartın karnesi sunucuda okunuyor (eşik altı, açık iş) —
// sığ bir istemci durumu olsaydı seçim değişince sayılar eski tesise ait kalırdı.

interface WarehousesClientProps {
  data: WarehousesData;
  urlState: WarehousesUrlState;
}

/** Künye penceresinin üç hâli: kapalı · yeni · düzenlenen tesis. */
type FormState = 'closed' | 'new' | string;

export function WarehousesClient({ data, urlState }: WarehousesClientProps) {
  const router = useRouter();
  const [navPending, startNav] = useTransition();

  const onSelect = (code: string) => {
    startNav(() => router.replace(warehousesUrl({ code }), { scroll: false }));
  };

  const [formState, setFormState] = useState<FormState>('closed');
  const editing = formState === 'closed' || formState === 'new' ? null : (data.rows.find((r) => r.id === formState) ?? null);

  // Kapatma AYRI pencere: künye formunun içinde bir anahtar olsaydı, dört sonucu olan bir karar
  // "kaydet"e basmanın yan etkisi hâline gelirdi.
  const [closing, setClosing] = useState<WarehouseRowView | null>(null);
  /**
   * Ölçüm noktası penceresi (19.28). Tür pencerede DEĞİL burada sabitleniyor: operatörün bastığı
   * düğme ("+ Alan" / "+ Araç") zaten cevabı verdi, pencerede tekrar sormak aynı soruyu iki kez
   * sormaktı. Kayıtlı bir noktanın türü de değişmiyor — dolap araca dönüşmez.
   */
  const [point, setPoint] = useState<{ kind: 'area' | 'vehicle'; editing: MeasurePointView | null } | null>(null);
  /** Etiket yazıcısı penceresi (23.7) — seçili tesisin kurulum künyesi, değerler karttan. */
  const [printerOpen, setPrinterOpen] = useState(false);
  /**
   * Kargo kutusu penceresi (07.12). `'new'` yeni kutu, satır düzenleme. Kutu tipi bir KÜNYEDİR
   * (yazıcı gibi), karne değil — kapalı tesiste de tanımlanabilir.
   */
  const [boxState, setBoxState] = useState<'closed' | 'new' | ShippingBox>('closed');
  /**
   * **Rota KURULUMU burada değil (07.08, kullanıcı kararı).** Rota tanımlamak ile günü planlamak
   * aynı işin iki anıdır; tasarım ikisini tek sayfada topluyor ve kurulum Teslimat & Rota'ya taşındı.
   * Bu ekran rotaları OKUR — "bu depo şu güzergâhlara bakıyor" künyesi burada anlamlı — ama
   * düzenlemeyi kendi penceresinde yapmaz: aynı kurulumun iki evi olmaz.
   */
  const openRoute = (zoneId?: string) =>
    router.push(`/operations/deliveries?tab=routes${zoneId ? `&route=${zoneId}` : ''}`);

  const view = {
    data,
    navPending,
    onSelect,
    onNewWarehouse: () => setFormState('new'),
    onEditWarehouse: (row: WarehouseRowView) => setFormState(row.id),
    onNewZone: () => openRoute(),
    onEditZone: (zone: ZoneCardView) => openRoute(zone.id),
    onAddPoint: (kind: 'area' | 'vehicle') => setPoint({ kind, editing: null }),
    onEditPoint: (point: MeasurePointView) => setPoint({ kind: point.kind, editing: point }),
    onEditPrinter: () => setPrinterOpen(true),
    onAddShippingBox: () => setBoxState('new'),
    onEditShippingBox: (box: ShippingBox) => setBoxState(box),
    // Benimseme tek tık: şablonun ölçüsü zaten belli, pencere açmak operatöre aynı sayıları
    // ikinci kez onaylatmak olurdu. Düzeltmek isterse satırdaki "Düzenle" orada.
    onAdoptShippingBox: (templateId: string) => {
      if (!data.card) return;
      void adoptShippingBoxAction({ warehouseId: data.card.row.id, templateId }).then(() => router.refresh());
    },
    // Onay YOK, yazıcı/ölçüm noktası çizgisiyle aynı: kapatmak yıkıcı değil, geri açılabilir.
    onToggleShippingBox: (box: ShippingBox) => {
      void setShippingBoxActiveAction({ id: box.id, isActive: !box.isActive }).then(() => router.refresh());
    },
    /**
     * Silme onaysız ve bu bilinçli: kullanılmış kutu ZATEN silinemez (veritabanı `restrict` ile
     * reddediyor ve servis okunabilir cümleye çeviriyor). Yani buradan silinebilen tek şey hiç
     * kullanılmamış bir kayıt — kaybedilen şey birkaç sayı, yeniden yazılır.
     */
    onDeleteShippingBox: (box: ShippingBox) => {
      void deleteShippingBoxAction(box.id).then(({ error }) => {
        if (error) window.alert(error);
        router.refresh();
      });
    },
    onTogglePoint: (point: MeasurePointView) => {
      // Onay penceresi YOK ve bu bilinçli: susturmak yıkıcı değil, geri açılabilir ve hiçbir kayıt
      // kaybolmuyor. Depo kapatmanın (dört sonuçlu, kod yazdıran) yanına konsaydı ikisi aynı
      // ağırlıkta okunur, asıl ağır olan hafiflerdi.
      void setPointActiveAction({ kind: point.kind, id: point.id, isActive: !point.isActive }).then(() => router.refresh());
    },
  };

  return (
    <>
      <WarehousesDesktop {...view} />

      {formState !== 'closed' ? (
        <WarehouseDialog
          key={formState}
          editing={editing}
          countriesWithWarehouse={data.countriesWithWarehouse}
          shippingTakenBy={data.rows.filter((r) => r.isActive && r.shipsOnline)}
          onClose={() => setFormState('closed')}
          // Yeni tesis doğar doğmaz kartı açılır: kurulumu eksik doğuyor (bölgesiz, personelsiz) ve
          // sıradaki adımlar o kartta duruyor. Listeye dönmek onu "kaydedildi, bitti" gibi okuturdu.
          onSaved={(code) => {
            setFormState('closed');
            router.refresh();
            if (code !== urlState.code) onSelect(code);
          }}
          onRequestClose={(row) => {
            setFormState('closed');
            setClosing(row);
          }}
        />
      ) : null}

      {closing ? (
        <CloseWarehouseDialog
          key={closing.id}
          row={closing}
          card={data.card?.row.id === closing.id ? data.card : null}
          onClose={() => setClosing(null)}
          onDone={() => {
            setClosing(null);
            router.refresh();
          }}
        />
      ) : null}

      {printerOpen && data.card ? (
        <PrinterDialog
          key={data.card.row.id}
          warehouseId={data.card.row.id}
          printer={data.card.printer}
          onClose={() => setPrinterOpen(false)}
          onSaved={() => {
            setPrinterOpen(false);
            router.refresh();
          }}
        />
      ) : null}

      {boxState !== 'closed' && data.card ? (
        <ShippingBoxDialog
          key={boxState === 'new' ? 'new' : boxState.id}
          warehouseId={data.card.row.id}
          box={boxState === 'new' ? null : boxState}
          onClose={() => setBoxState('closed')}
          onSaved={() => {
            setBoxState('closed');
            router.refresh();
          }}
        />
      ) : null}

      {point && data.card ? (
        <MeasurePointDialog
          key={`${point.kind}:${point.editing?.id ?? 'new'}`}
          warehouseId={data.card.row.id}
          editing={point.editing}
          kind={point.kind}
          onClose={() => setPoint(null)}
          onSaved={() => {
            setPoint(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
