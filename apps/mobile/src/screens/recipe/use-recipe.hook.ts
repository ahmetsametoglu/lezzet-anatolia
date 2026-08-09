import { useCallback, useEffect, useRef, useState } from 'react';
import type { RecipeDetail } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { fetchRecipeDetail } from '@/lib/api/recipe';

/*
  TARİF DETAY VERİSİ — ürün detay hook'unun (`use-product.hook.ts`) birebir deseni: sayfanın
  TAMAMI tek turda gelir (sözleşmenin sözü), hook tek istekten ibarettir. Eskimiş cevap koruması
  aynı tek sebepten var: "Tekrar dene"ye art arda basan parmak iki uçuş başlatır ve yavaş olanın
  sonucu hızlı olanınkini ezmemelidir.

  404 AYRI BİR HÂLDİR, ağ hatası değil: uç taslak/silinmiş tarifi bilerek 404'le kapatıyor
  (yayın kapısının kararı). "Bağlantını kontrol et" mesajı, yayından kalkmış tarifi bağlantı
  arızası gibi gösterirdi.
*/

/** İlk yükün dört hâli — `missing` = uç 404 dedi (tarif yayında değil), `error` = telin arızası. */
type RecipeStatus = 'loading' | 'ready' | 'missing' | 'error';

interface UseRecipeResult {
  status: RecipeStatus;
  /** Yalnız `ready` hâlinde dolu. */
  detail: RecipeDetail | null;
  retry: () => void;
}

export function useRecipe(slug: string, locale: Locale): UseRecipeResult {
  const [status, setStatus] = useState<RecipeStatus>('loading');
  const [detail, setDetail] = useState<RecipeDetail | null>(null);
  const generation = useRef(0);

  const load = useCallback(() => {
    const run = (generation.current += 1);
    setStatus('loading');
    void fetchRecipeDetail(slug, locale).then((result) => {
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
