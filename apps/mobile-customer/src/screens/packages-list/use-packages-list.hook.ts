import { useCallback, useEffect, useRef, useState } from 'react';
import type { HomePackage, Country } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { fetchPackages } from '@/lib/api/packages';

/*
  Sayfalama yok, çünkü paket kataloğu operatörün kurduğu doğal tavanlı bir kümedir ve tek turda gelir.
  Aşağı çekerek yenileme ekranı iskelete düşürmez: `status` yalnız ilk yükün, `refreshing` yenilemenin hâlidir.
*/

type PackagesStatus = 'loading' | 'ready' | 'error';

interface UsePackagesListResult {
  status: PackagesStatus;
  /** Yalnız `ready` hâlinde dolu olabilir; boş dizi meşru cevaptır (boş durum çizilir). */
  packages: HomePackage[];
  refreshing: boolean;
  refresh: () => void;
  retry: () => void;
}

/** Yer değişince liste baştan okunur, çünkü kart "bu adrese gelir mi"yi ancak bu yerle söyleyebilir. */
export function usePackagesList(
  locale: Locale,
  postalCode: string | null,
  pickupWarehouseId: string | null = null,
  country: Country | null = null,
): UsePackagesListResult {
  const [status, setStatus] = useState<PackagesStatus>('loading');
  const [packages, setPackages] = useState<HomePackage[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // Art arda "tekrar dene" iki uçuş başlatır; sayacı tutmayan cevap yazılmaz ki yavaş olan hızlıyı ezmesin.
  const generation = useRef(0);

  const load = useCallback(
    (options: { refresh: boolean }) => {
      const run = (generation.current += 1);
      if (options.refresh) setRefreshing(true);
      else setStatus('loading');

      void fetchPackages(locale, postalCode, pickupWarehouseId, country).then((result) => {
        if (run !== generation.current) return;
        setRefreshing(false);

        if (result.error !== null) {
          // Eski satırlar bırakılmaz: hata mesajının altında kalan liste "bu veriler güncel"
          // izlenimi verirdi.
          setPackages([]);
          setStatus('error');
          return;
        }

        setPackages(result.data.packages);
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

  return { status, packages, refreshing, refresh, retry };
}
