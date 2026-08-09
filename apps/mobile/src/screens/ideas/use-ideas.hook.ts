import { useCallback, useEffect, useRef, useState } from 'react';
import type { HomePackage, HomeRecipe } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { fetchPackages } from '@/lib/api/packages';
import { fetchRecipes } from '@/lib/api/recipe';

/*
  FİKİRLER VERİSİ — iki uç (`GET /api/v1/recipes` · `GET /api/v1/packages`), TEK durum.

  İKİSİ BİRDEN İSTENİR, İKİSİ BİRDEN BEKLENİR: uçlar birbirinden bağımsız (`Promise.all`), biri
  ötekini bekletmez. Ama SONUÇ tek durumdur — biri düşerse ekran hata gösterir, yarısını çizip
  ötekini sessizce yutmaz. Sessiz yarım sayfa, arızayı gizlemenin en kolay yoludur (CLAUDE §0):
  müşteri "bugün paket yok" sanır, oysa istek düşmüştür. Bölüm bazlı hata hâli tasarımdan gelmedi;
  geldiği gün ayrım burada açılır ve iki ayrı duruma bölünür.

  MİSAFİR DALI YOK: iki uç da oturumsuz gezilir (katalog kümesindendirler) — 401 diye bir hâlleri
  yok, kimlik hiç okunmuyor.

  SAYFALAMA YOK: iki küme de editoryal seçkidir, tek turda gelir (sözleşme künyeleri). Bu yüzden
  `nextCursor`/`loadMore` de yok — olmayan bir kuyruğu beklemek, listenin sonunu yalan söylemek olur.

  ESKİMİŞ CEVAP KORUMASI (`generation`): "tekrar dene"ye art arda basan parmak iki uçuş başlatır;
  yavaş olanın sonucu hızlıyı ezmesin diye sayacı tutmayan cevap YAZILMAZ (`use-home.hook` deseni).
*/

/** Üç hâl — `guest` yok (uçlar oturumsuz). */
type IdeasStatus = 'loading' | 'ready' | 'error';

interface UseIdeasResult {
  status: IdeasStatus;
  /** Yalnız `ready` hâlinde dolu olabilir; boş dizi meşru cevaptır (bölüm çizilmez). */
  recipes: HomeRecipe[];
  packages: HomePackage[];
  retry: () => void;
}

export function useIdeas(locale: Locale): UseIdeasResult {
  const [status, setStatus] = useState<IdeasStatus>('loading');
  const [recipes, setRecipes] = useState<HomeRecipe[]>([]);
  const [packages, setPackages] = useState<HomePackage[]>([]);
  const generation = useRef(0);

  const load = useCallback(() => {
    const run = (generation.current += 1);
    setStatus('loading');

    void Promise.all([fetchRecipes(locale), fetchPackages(locale)]).then(([recipeResult, packageResult]) => {
      if (run !== generation.current) return;

      if (recipeResult.error !== null || packageResult.error !== null) {
        // Eski satırlar bırakılmaz: yenilemeden sonra ekranda kalan liste, hata mesajının altında
        // "bu veriler güncel" izlenimi verirdi.
        setRecipes([]);
        setPackages([]);
        setStatus('error');
        return;
      }

      setRecipes(recipeResult.data.recipes);
      setPackages(packageResult.data.packages);
      setStatus('ready');
    });
  }, [locale]);

  useEffect(() => {
    load();
  }, [load]);

  return { status, recipes, packages, retry: load };
}
