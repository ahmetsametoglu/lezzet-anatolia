import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogProductDetail, Country } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { fetchProductDetail } from '@/lib/api/catalog';

/*
  Eski cevap koruması var, çünkü "Tekrar dene"ye art arda basan parmak iki uçuş başlatır ve yavaş olan hızlıyı ezmemeli.
  404 ağ hatasından ayrı bir hâldir, çünkü uç satıştan kalkmış ürünü 404'le kapatır ve "bağlantını kontrol et" demek yalan olurdu.
*/

/** İlk yükün dört hâli — `missing` = uç 404 dedi (ürün satışta değil), `error` = telin arızası. */
type ProductStatus = 'loading' | 'ready' | 'missing' | 'error';

interface UseProductResult {
  status: ProductStatus;
  /** Yalnız `ready` hâlinde dolu. */
  detail: CatalogProductDetail | null;
  retry: () => void;
}

export function useProduct(
  slug: string,
  locale: Locale,
  postalCode: string | null,
  pickupWarehouseId: string | null = null,
  country: Country | null = null,
): UseProductResult {
  const [status, setStatus] = useState<ProductStatus>('loading');
  const [detail, setDetail] = useState<CatalogProductDetail | null>(null);
  const generation = useRef(0);

  const load = useCallback(() => {
    const run = (generation.current += 1);
    setStatus('loading');
    void fetchProductDetail(slug, locale, postalCode, pickupWarehouseId, country).then((result) => {
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
