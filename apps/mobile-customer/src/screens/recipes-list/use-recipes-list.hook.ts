import { useCallback, useEffect, useRef, useState } from 'react';
import type { HomeRecipe } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { fetchRecipes } from '@/lib/api/recipe';

/*
  TARİF LİSTESİ VERİSİ — tek uç (`GET /api/v1/recipes`), üç hâl. İskeleti paket listesi hook'unun
  aynısıdır ve iki hook'un TEK olması denendi/elenmedi değil, KASITLI: birleştirilmiş bir "fikirler"
  hook'u iki ucu birbirine bağlar ve biri düşünce ötekini de sessizce boşaltırdı (bir önceki
  kurgunun `use-ideas` hook'u tam olarak bunu yapıyordu). İki ekran, iki uç, iki durum.

  MİSAFİR DALI YOK: uç oturumsuz gezilir (katalog kümesindendir) — 401 diye bir hâli yok.

  SAYFALAMA YOK ve olmaması sözleşmenin kararıdır (`RecipeListSchema` künyesi): tarif kümesi
  editoryal bir seçkidir, veriyle büyümez → tek turda gelir.

  İLK YÜK İLE YENİLEME AYRI ŞEYLERDİR (kullanıcı bulgusu 09.08): aşağı çekerek yenileme ekranı
  iskelete düşürmez; `status` ilk yükün, `refreshing` yenilemenin hâlidir.
*/

type RecipesStatus = 'loading' | 'ready' | 'error';

interface UseRecipesListResult {
  status: RecipesStatus;
  /** Yalnız `ready` hâlinde dolu olabilir; boş dizi meşru cevaptır (boş durum çizilir). */
  recipes: HomeRecipe[];
  refreshing: boolean;
  refresh: () => void;
  retry: () => void;
}

export function useRecipesList(locale: Locale): UseRecipesListResult {
  const [status, setStatus] = useState<RecipesStatus>('loading');
  const [recipes, setRecipes] = useState<HomeRecipe[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);

  const load = useCallback(
    (options: { refresh: boolean }) => {
      const run = (generation.current += 1);
      if (options.refresh) setRefreshing(true);
      else setStatus('loading');

      void fetchRecipes(locale).then((result) => {
        if (run !== generation.current) return;
        setRefreshing(false);

        if (result.error !== null) {
          // Eski satırlar bırakılmaz: hata mesajının altında kalan liste "bu veriler güncel"
          // izlenimi verirdi.
          setRecipes([]);
          setStatus('error');
          return;
        }

        setRecipes(result.data.recipes);
        setStatus('ready');
      });
    },
    [locale],
  );

  useEffect(() => {
    load({ refresh: false });
  }, [load]);

  const refresh = useCallback(() => load({ refresh: true }), [load]);
  const retry = useCallback(() => load({ refresh: false }), [load]);

  return { status, recipes, refreshing, refresh, retry };
}
