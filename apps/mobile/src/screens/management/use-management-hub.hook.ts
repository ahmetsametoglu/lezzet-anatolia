import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchManagementHub } from '@/lib/api/management';
import type { ManagementHub } from '@lezzet/types';

/*
  YÖNETİM HUB OKUMASI (21.12) — karar kutusu + gün özeti tek zarfta.

  İki ekran (hub · gün özeti) aynı kancayı AYRI AYRI kurar ve bu bilinçli: gün özeti her açılışta
  taze okur — hub'dan devralınmış bayat bir fotoğraf göstermek, "salt okuma · günün fotoğrafı"
  vaadinin tersi olurdu. Ortak durum gerekseydi provider deseni hazır (sale emsali); burada durum
  değil VERİ paylaşılıyor ve verinin tazesi uçta.

  Yarışın bekçisi sıra numarası (`use-sale.hook` künyesi): geç gelen eski cevap sessizce düşer.
*/

type HubState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; hub: ManagementHub };

export function useManagementHub(): { state: HubState; retry: () => void } {
  const [state, setState] = useState<HubState>({ status: 'loading' });
  const generation = useRef(0);

  const load = useCallback(async () => {
    const run = ++generation.current;
    setState({ status: 'loading' });
    const result = await fetchManagementHub();
    if (run !== generation.current) return;
    setState(result.error !== null ? { status: 'error' } : { status: 'ready', hub: result.data });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, retry: () => void load() };
}
