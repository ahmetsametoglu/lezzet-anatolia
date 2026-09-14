'use client';

import { useEffect, useState } from 'react';
import type { Address } from '@lezzet/types';
import { listMyAddressesAction } from '@/lib/address/actions';
import { useDeliveryPlace } from './place-context';

/**
 * Müşterinin kayıtlı adresleri ve seçimi — adres penceresi (`AddressPickerDialog`) ile masaüstü yer
 * panelinin (`PlacePanel`) ORTAK kaynağı. İkisi aynı listeyi aynı korumayla çekip aynı "seç =
 * varsayılan yap" adımını atıyordu (13.09 kopya bulgusu); çizimleri ayrı (pencere liste, panel kart
 * ızgarası — v1), veri ve seçim burada.
 *
 * Liste açılışta çekilir, kökte tutulmaz: yalnız seçici açıldığında gerekiyor. Seçili adresin kendisi
 * kökte (`useDeliveryPlace().address`) — hap onu her sayfada gösteriyor.
 *
 * `onLoaded` yalnız İLK yüklemede ve açılış anının değerleriyle çağrılır (pencerenin "Düzenle"
 * açılışı seçili adresin tam satırını buradan alır).
 */
export function useMyAddresses(onLoaded?: (rows: Address[]) => void) {
  const { address: current, selectAddress } = useDeliveryPlace();
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void listMyAddressesAction().then(({ data }) => {
      if (!alive) return;
      if (!data) return setFailed(true);
      setAddresses(data);
      onLoaded?.(data);
    });
    return () => {
      alive = false;
    };
    // Yalnız AÇILIŞTA: seçici açıkken seçim değişince liste yeniden çekilmez.
  }, []);

  /** Seçer; zaten seçiliyse sunucuya gitmez. Başarıyı döndürür — sonrası (kapat, bildirim) çağıranın. */
  const choose = async (id: string): Promise<boolean> => {
    if (id === current?.id) return true;
    setBusy(true);
    // Çağrı dönmezse (sunucuya ulaşılamadı) "olmadı" sayılır: çağıran cümlesini söyler, kartlar
    // kilitli kalmaz (14.09 — kaydetme düğmesinin aynı arızası).
    const ok = await selectAddress(id).catch(() => false);
    setBusy(false);
    return ok;
  };

  return { addresses, failed, busy, current, choose };
}
