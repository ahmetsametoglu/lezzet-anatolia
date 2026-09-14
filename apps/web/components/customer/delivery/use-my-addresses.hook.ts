'use client';

import { useEffect, useRef, useState } from 'react';
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
 * **Seçili adres listede YOKSA liste bir kez yeniden çekilir** (14.09): az önce eklenen adres seçili
 * olur ama açılışta çekilen listede yoktur. Pencere ve panel her açılışta listeyi baştan çektiği için
 * bunu hiç göstermiyordu; sepetin adres kartı ise sayfada KALICI — kullanıcı ikinci adresi ekledi,
 * adres seçildi, listede görünmedi ve eski adres seçimsiz kaldı (ölçüldü: kayıt DB'de varsayılan).
 *
 * `onLoaded` yalnız İLK yüklemede ve açılış anının değerleriyle çağrılır (pencerenin "Düzenle"
 * açılışı seçili adresin tam satırını buradan alır).
 */
export function useMyAddresses(onLoaded?: (rows: Address[]) => void) {
  const { address: current, selectAddress } = useDeliveryPlace();
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  /** Listeyi hangi seçili adres için yeniden çektik — aynı kimlik için ikinci tur yok (döngü kalkanı). */
  const refetchedFor = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    void listMyAddressesAction().then(({ data }) => {
      if (!mounted.current) return;
      if (!data) return setFailed(true);
      setAddresses(data);
      onLoaded?.(data);
    });
    return () => {
      mounted.current = false;
    };
    // Yalnız AÇILIŞTA: seçim değişince liste yeniden çekilmez — aşağıdaki tek istisna dışında.
  }, []);

  // Seçimin KİMLİĞİNE bağlı, nesnesine değil: kayıttan sonra yer bağlamı aynı adresi iki kez yazar
  // (eylemin karesi + sayfa tazelemesi). Nesneye bağlı olsaydı ikinci yazım ilk isteği iptal eder,
  // kalkan da ikinci isteği engellerdi — liste yine bayat kalırdı.
  const currentId = current?.id ?? null;
  useEffect(() => {
    if (!addresses || !currentId || addresses.some((a) => a.id === currentId)) return;
    if (refetchedFor.current === currentId) return;
    refetchedFor.current = currentId;
    void listMyAddressesAction().then(({ data }) => {
      if (mounted.current && data) setAddresses(data);
    });
  }, [addresses, currentId]);

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
