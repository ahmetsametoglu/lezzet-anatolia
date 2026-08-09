import { useEffect, useState } from 'react';

import { fetchAddresses, type MeAddress } from '@/lib/api/addresses';

/*
  ADRES LİSTESİ DURUMU (21.15) — hesap ekranının adres bölümünü besler. `useMe` gibi modül-durumlu
  DEĞİL, ekran-yerel: adresleri tek ekran okuyor; checkout günü ikinci tüketen doğarsa terfi o gün
  yapılır (erken genelleme, kullanılmayan makine kurar).

  `publish` yazma uçlarının döndürdüğü GÜNCEL listeyi yerleştirir — uçların "cevap hep listedir"
  kararının ekran karşılığı (`lib/api/addresses.ts`): yazan el ikinci bir GET atmaz.
*/

type AddressesStatus = 'loading' | 'ready' | 'error';

export function useAddresses(enabled: boolean): {
  status: AddressesStatus;
  addresses: MeAddress[];
  publish: (next: MeAddress[]) => void;
} {
  const [state, setState] = useState<{ status: AddressesStatus; addresses: MeAddress[] }>({
    status: 'loading',
    addresses: [],
  });

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void fetchAddresses().then((result) => {
      if (!alive) return;
      // Hata anahtarı ekranda cümleye dönmez (tek genel satır var) — hâl yeter, sebep loglanmaz:
      // istemcide teşhis kanalı yok, sunucu tarafı zaten kendi izini bırakıyor.
      if (result.error !== null) return setState({ status: 'error', addresses: [] });
      setState({ status: 'ready', addresses: result.data });
    });
    return () => {
      alive = false;
    };
  }, [enabled]);

  return { ...state, publish: (next) => setState({ status: 'ready', addresses: next }) };
}
