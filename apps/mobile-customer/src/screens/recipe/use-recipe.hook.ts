import { useCallback, useEffect, useRef, useState } from 'react';
import type { Country, RecipeDetail } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { fetchRecipeDetail } from '@/lib/api/recipe';

/*
  Eski cevap koruması var, çünkü "Tekrar dene"ye art arda basan parmak iki uçuş başlatır ve yavaş olan hızlıyı ezmemeli.
  404 ağ hatasından ayrı bir hâldir, çünkü uç yayından kalkmış tarifi 404'le kapatır ve "bağlantını kontrol et" demek yalan olurdu.
*/

/** İlk yükün dört hâli — `missing` = uç 404 dedi (tarif yayında değil), `error` = telin arızası. */
type RecipeStatus = 'loading' | 'ready' | 'missing' | 'error';

interface UseRecipeResult {
  status: RecipeStatus;
  /** Yalnız `ready` hâlinde dolu. */
  detail: RecipeDetail | null;
  retry: () => void;
}

export function useRecipe(slug: string, locale: Locale, postalCode: string | null, country: Country | null): UseRecipeResult {
  const [status, setStatus] = useState<RecipeStatus>('loading');
  const [detail, setDetail] = useState<RecipeDetail | null>(null);
  const generation = useRef(0);

  const load = useCallback(() => {
    const run = (generation.current += 1);
    setStatus('loading');
    void fetchRecipeDetail(slug, locale, postalCode, country).then((result) => {
      if (run !== generation.current) return;
      if (result.error !== null) {
        setStatus(result.status === 404 ? 'missing' : 'error');
        return;
      }
      setDetail(result.data);
      setStatus('ready');
    });
  }, [country, locale, postalCode, slug]);

  useEffect(() => {
    load();
  }, [load]);

  return { status, detail, retry: load };
}
