import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogProductDetail } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { fetchProductDetail } from '@/lib/api/catalog';

/*
  ÜRÜN DETAY VERİSİ — sayfanın TAMAMI tek turda gelir (sözleşmenin sözü: bölüm başına çağrı yok),
  o yüzden hook da tek istekten ibarettir; katalogdaki sayfalama/generation makinesinin burada
  karşılığı yok. Eskimiş cevap koruması yine de VAR ama tek sebepten: "Tekrar dene"ye art arda
  basan parmak iki uçuş başlatır ve yavaş olanın sonucu hızlı olanınkini ezmemelidir.

  404 AYRI BİR HÂLDİR, ağ hatası değil: uç aday/pasif ürünü bilerek 404'le kapatıyor (DOMAIN §13).
  İkisini tek "hata"ya indirmek müşteriye yalan söylerdi — "bağlantını kontrol et" mesajı, satıştan
  kalkmış ürünü bağlantı arızası gibi gösterirdi.
*/

/** İlk yükün dört hâli — `missing` = uç 404 dedi (ürün satışta değil), `error` = telin arızası. */
type ProductStatus = 'loading' | 'ready' | 'missing' | 'error';

interface UseProductResult {
  status: ProductStatus;
  /** Yalnız `ready` hâlinde dolu. */
  detail: CatalogProductDetail | null;
  retry: () => void;
}

export function useProduct(slug: string, locale: Locale): UseProductResult {
  const [status, setStatus] = useState<ProductStatus>('loading');
  const [detail, setDetail] = useState<CatalogProductDetail | null>(null);
  const generation = useRef(0);

  const load = useCallback(() => {
    const run = (generation.current += 1);
    setStatus('loading');
    void fetchProductDetail(slug, locale).then((result) => {
      if (run !== generation.current) return;
      if (result.error !== null) {
        setStatus(result.status === 404 ? 'missing' : 'error');
        return;
      }
      setDetail(result.data);
      setStatus('ready');
    });
  }, [locale, slug]);

  useEffect(() => {
    load();
  }, [load]);

  return { status, detail, retry: load };
}
