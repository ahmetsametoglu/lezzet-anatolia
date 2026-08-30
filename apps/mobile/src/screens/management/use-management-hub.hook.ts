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

interface UseManagementHubResult {
  state: HubState;
  retry: () => void;
  /** Aşağı çekme — ekranı karartmadan tazeler. */
  refresh: () => void;
  /** Çekme sürüyor mu. `state` DEĞİL: onu `loading`e çevirmek kartları söküp iskelete geçirirdi. */
  reloading: boolean;
}

export function useManagementHub(): UseManagementHubResult {
  const [state, setState] = useState<HubState>({ status: 'loading' });
  const [reloading, setReloading] = useState(false);
  const generation = useRef(0);

  /*
    `silent` AŞAĞI ÇEKMENİN ŞARTIDIR (depo hub'ıyla aynı desen): çekme "ekran dursun, üstüne taze
    veri gelsin" der. Durumu `loading`e çevirmek kartları söker ve yerine iskelet koyar — yani
    yöneticinin okumakta olduğu kuyruk gözünün önünde kaybolur.
  */
  const load = useCallback(async (options: { silent?: boolean } = {}) => {
    const run = ++generation.current;
    if (options.silent !== true) setState({ status: 'loading' });
    const result = await fetchManagementHub();
    if (run !== generation.current) return;
    setState(result.error !== null ? { status: 'error' } : { status: 'ready', hub: result.data });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    setReloading(true);
    void load({ silent: true }).finally(() => setReloading(false));
  }, [load]);

  return { state, retry: () => void load(), refresh, reloading };
}
