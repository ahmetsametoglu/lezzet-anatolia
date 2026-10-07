import { useCallback, useEffect, useRef, useState } from 'react';
import type { PackageDetail, Country } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { fetchPackageDetail } from '@/lib/api/packages';

/*
  Eski cevap koruması "Tekrar dene"ye art arda basan parmağın iki uçuşu için var.
  404 ağ hatasından ayrı bir hâldir, çünkü uç satıştan kalkmış paketi 404'le kapatır ve bağlantı arızası gibi göstermek yalan olurdu.
*/

/** İlk yükün dört hâli — `missing` = uç 404 dedi (paket satışta değil), `error` = telin arızası. */
type PackageStatus = 'loading' | 'ready' | 'missing' | 'error';

interface UsePackageResult {
  status: PackageStatus;
  /** Yalnız `ready` hâlinde dolu. */
  detail: PackageDetail | null;
  retry: () => void;
}

/** Detay da yeri gönderir, çünkü göndermeseydi kartında "bu adrese gönderemiyoruz" yazan paket detayında normal görünürdü. */
export function usePackage(
  slug: string,
  locale: Locale,
  postalCode: string | null,
  pickupWarehouseId: string | null = null,
  country: Country | null = null,
): UsePackageResult {
  const [status, setStatus] = useState<PackageStatus>('loading');
  const [detail, setDetail] = useState<PackageDetail | null>(null);
  const generation = useRef(0);

  const load = useCallback(() => {
    const run = (generation.current += 1);
    setStatus('loading');
    void fetchPackageDetail(slug, locale, postalCode, pickupWarehouseId, country).then((result) => {
      if (run !== generation.current) return;
      if (result.error !== null) {
        setStatus(result.status === 404 ? 'missing' : 'error');
        return;
      }
      setDetail(result.data);
      setStatus('ready');
    });
  }, [country, locale, pickupWarehouseId, postalCode, slug]);

  useEffect(() => {
    load();
  }, [load]);

  return { status, detail, retry: load };
}
