import { useCallback, useEffect, useRef, useState } from 'react';
import type { PackageDetail } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { fetchPackageDetail } from '@/lib/api/packages';

/*
  PAKET DETAY VERİSİ — ürün detayı hook'unun deseni birebir (`use-product.hook.ts`): sayfanın
  TAMAMI tek turda gelir (sözleşmenin sözü — içerik satırları dahil, bölüm başına çağrı yok);
  eskimiş cevap koruması "Tekrar dene"ye art arda basan parmağın iki uçuşu için var.

  404 AYRI BİR HÂLDİR, ağ hatası değil: uç pasif/kalemsiz paketi bilerek 404'le kapatıyor
  (DOMAIN §13 sınıfı) — ikisini tek "hata"ya indirmek satıştan kalkmış paketi bağlantı arızası
  gibi gösterirdi.
*/

/** İlk yükün dört hâli — `missing` = uç 404 dedi (paket satışta değil), `error` = telin arızası. */
type PackageStatus = 'loading' | 'ready' | 'missing' | 'error';

interface UsePackageResult {
  status: PackageStatus;
  /** Yalnız `ready` hâlinde dolu. */
  detail: PackageDetail | null;
  retry: () => void;
}

export function usePackage(slug: string, locale: Locale): UsePackageResult {
  const [status, setStatus] = useState<PackageStatus>('loading');
  const [detail, setDetail] = useState<PackageDetail | null>(null);
  const generation = useRef(0);

  const load = useCallback(() => {
    const run = (generation.current += 1);
    setStatus('loading');
    void fetchPackageDetail(slug, locale).then((result) => {
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
