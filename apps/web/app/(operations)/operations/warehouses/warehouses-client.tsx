'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CloseWarehouseDialog } from './close-warehouse-dialog';
import { WarehouseDialog } from './warehouse-dialog';
import { WarehousesDesktop } from './warehouses.desktop';
import { ZoneDialog } from './zone-dialog';
import { warehousesUrl, type WarehousesUrlState } from './warehouses-url';
import type { WarehousesData, WarehouseRowView, ZoneCardView } from './warehouses-types';

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
  /** Bölge penceresi: `null` kapalı · `'new'` yeni · bölge kimliği düzenleme. */
  const [zoneState, setZoneState] = useState<'new' | string | null>(null);
  const zoneEditing: ZoneCardView | null =
    zoneState && zoneState !== 'new' ? (data.card?.zones.find((z) => z.id === zoneState) ?? null) : null;

  const view = {
    data,
    urlState,
    navPending,
    onSelect,
    onNewWarehouse: () => setFormState('new'),
    onEditWarehouse: (row: WarehouseRowView) => setFormState(row.id),
    onNewZone: () => setZoneState('new'),
    onEditZone: (zone: ZoneCardView) => setZoneState(zone.id),
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

      {zoneState && data.card ? (
        <ZoneDialog
          key={zoneState}
          warehouse={data.card.row}
          editing={zoneEditing}
          // Deponun öteki bölgeleri: harita "başka bölgede tanımlı" kodları ancak onlarla çizebilir.
          siblingZones={data.card.zones}
          onClose={() => setZoneState(null)}
          onSaved={() => {
            setZoneState(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
