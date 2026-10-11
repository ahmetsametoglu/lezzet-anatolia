'use client';

import { useEffect, useRef, useState } from 'react';
import type { Address } from '@lezzet/types';
import { listMyAddressesAction } from '@/lib/address/actions';
import { useDeliveryPlace } from './place-context';

/**
 * Müşterinin kayıtlı adresleri ve seçimi; adres penceresi ile masaüstü yer panelinin ortak kaynağı, çizimleri ayrı. Seçili adres
 * listede yoksa liste bir kez yeniden çekilir, çünkü az önce eklenen adres seçili olur ama açılışta çekilen listede yoktur.
 */
export function useMyAddresses(onLoaded?: (rows: Address[]) => void) {
  const { address: current, selectAddress } = useDeliveryPlace();
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  /** Listeyi hangi seçili adres için yeniden çektik; aynı kimlik için ikinci tur döngüye girerdi. */
  const refetchedFor = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    void listMyAddressesAction().then(({ data }) => {
      if (!mounted.current) return;
      if (!data) return setFailed(true);
      setAddresses(data);
      // Yalnız ilk yüklemede: pencerenin "Düzenle" açılışı seçili adresin tam satırını buradan alır.
      onLoaded?.(data);
    });
    return () => {
      mounted.current = false;
    };
    // Yalnız açılışta: seçim değişince liste yeniden çekilmez, aşağıdaki tek istisna dışında.
  }, []);

  // Seçimin kimliğine bağlı, nesnesine değil: kayıttan sonra yer bağlamı aynı adresi iki kez yazar ve nesneye bağlı efekt ilk isteği
  // iptal edip kalkanla ikinciyi de engellerdi.
  const currentId = current?.id ?? null;
  useEffect(() => {
    if (!addresses || !currentId || addresses.some((a) => a.id === currentId)) return;
    if (refetchedFor.current === currentId) return;
    refetchedFor.current = currentId;
    void listMyAddressesAction().then(({ data }) => {
      if (mounted.current && data) setAddresses(data);
    });
  }, [addresses, currentId]);

  /** Seçer; zaten seçiliyse sunucuya gitmez. Başarıyı döndürür, sonrası (kapat, bildirim) çağıranın. */
  const choose = async (id: string): Promise<boolean> => {
    if (id === current?.id) return true;
    setBusy(true);
    // Çağrı dönmezse "olmadı" sayılır: çağıran cümlesini söyler ve kartlar kilitli kalmaz.
    const ok = await selectAddress(id).catch(() => false);
    setBusy(false);
    return ok;
  };

  /** Düzenleme ya da silmeden sonra listeyi yeniden okur; düşen istek eski listeyi bırakır. */
  const reload = async (): Promise<void> => {
    const { data } = await listMyAddressesAction();
    if (mounted.current && data) setAddresses(data);
  };

  return { addresses, failed, busy, current, choose, reload };
}
