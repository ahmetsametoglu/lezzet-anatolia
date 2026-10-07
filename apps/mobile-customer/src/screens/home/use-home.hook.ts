import { useCallback, useEffect, useRef, useState } from 'react';
import type { Home, Country } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { fetchHome } from '@/lib/api/home';

/*
  Hatada bölüm çizilmez, çünkü tasarımda bu bölümlerin hata hâli yok ve vitrinin geri kalanı ayaktadır; durum yine burada tutulur.
  Yenileme `status`u 'loading'e düşürmez ve hatasında eski veri silinmez, çünkü "yeni veriyi alamadım" ile "veri yok" ayrı cümlelerdir.
*/

type HomeStatus = 'loading' | 'ready' | 'error';

interface UseHomeResult {
  status: HomeStatus;
  /** Yalnız `ready` hâlinde dolu. */
  home: Home | null;
  refreshing: boolean;
  refresh: () => void;
  retry: () => void;
}

/** Yer değişince vitrin yeniden okunur, çünkü teklif ve stok yere göre değişir ve eski ekran başka bölgenin fiyatını gösterirdi. */
export function useHome(
  locale: Locale,
  postalCode: string | null,
  pickupWarehouseId: string | null = null,
  country: Country | null = null,
): UseHomeResult {
  const [status, setStatus] = useState<HomeStatus>('loading');
  const [home, setHome] = useState<Home | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);

  const load = useCallback(
    (options: { refresh: boolean }) => {
      const run = (generation.current += 1);
      if (options.refresh) setRefreshing(true);
      else setStatus('loading');

      void fetchHome(locale, postalCode, pickupWarehouseId, country).then((result) => {
        if (run !== generation.current) return;
        setRefreshing(false);
        if (result.error !== null) {
          // Yenilemede ekrandaki bölümler yerinde kalır (künye); yalnız ilk yükün düşmesi hâldir.
          if (!options.refresh) setStatus('error');
          return;
        }
        setHome(result.data);
        setStatus('ready');
      });
    },
    [country, locale, pickupWarehouseId, postalCode],
  );

  useEffect(() => {
    load({ refresh: false });
  }, [load]);

  const refresh = useCallback(() => load({ refresh: true }), [load]);
  const retry = useCallback(() => load({ refresh: false }), [load]);

  return { status, home, refreshing, refresh, retry };
}
