import { useEffect, useState } from 'react';
import { normalizeSiret } from '@lezzet/domain-core';
import { previewCompanyAction } from './actions';
import type { CompanyPreview } from './new-order-types';

/** `idle` = 14 hane yok, sorulmadı; `failed` = önizleme okunamadı, kayıt açılırken kapı resmî kaydı yeniden sorar. */
export type CompanyPreviewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; preview: CompanyPreview };

/** SIRET 14 haneye ulaşınca okunur; numara değişince geç gelen eski cevap yenisinin yerine geçmez. */
export function useCompanyPreview(rawSiret: string): CompanyPreviewState {
  const siret = normalizeSiret(rawSiret);
  const [result, setResult] = useState<{ siret: string; state: CompanyPreviewState } | null>(null);

  useEffect(() => {
    if (siret.length !== 14) return;
    let current = true;
    void previewCompanyAction(siret)
      .then(({ data }) => {
        if (current) setResult({ siret, state: data ? { kind: 'ready', preview: data } : { kind: 'failed' } });
      })
      // Action sonuç döner, fırlatmaz; buraya düşen bağlantı kopmasıdır ve satır "okunamadı" der.
      .catch(() => {
        if (current) setResult({ siret, state: { kind: 'failed' } });
      });
    return () => {
      current = false;
    };
  }, [siret]);

  if (siret.length !== 14) return { kind: 'idle' };
  return result?.siret === siret ? result.state : { kind: 'loading' };
}
