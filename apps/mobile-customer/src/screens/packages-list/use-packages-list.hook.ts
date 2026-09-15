import { useCallback, useEffect, useRef, useState } from 'react';
import type { HomePackage } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { fetchPackages } from '@/lib/api/packages';

/*
  PAKET LİSTESİ VERİSİ — tek uç (`GET /api/v1/packages`), üç hâl.

  MİSAFİR DALI YOK: uç oturumsuz gezilir (katalog kümesindendir) — 401 diye bir hâli yok, kimlik
  hiç okunmuyor.

  SAYFALAMA YOK ve olmaması sözleşmenin kararıdır (`PackageListSchema` künyesi): paket kataloğu
  doğal tavanlı, operatörün elle kurduğu bir kümedir → tek turda gelir (CLAUDE §1'in "sayfalama
  ölçütü liste olmak değil, SINIRSIZ büyümek" kuralı). Bu yüzden `nextCursor`/`loadMore` de yok —
  olmayan bir kuyruğu beklemek listenin sonunu yalan söylemek olurdu.

  İLK YÜK İLE KUYRUK/YENİLEME AYRI ŞEYLERDİR (kullanıcı bulgusu 09.08): aşağı çekerek yenileme
  ekranı iskelete DÜŞÜRMEZ — satırlar yerinde kalır, hareketin kendi göstergesi yeter. `status`
  yalnız ilk yükün hâlidir; `refreshing` yenilemenin.

  ESKİMİŞ CEVAP KORUMASI (`generation`): "tekrar dene"ye art arda basan parmak iki uçuş başlatır;
  yavaş olanın sonucu hızlıyı ezmesin diye sayacı tutmayan cevap YAZILMAZ (`use-orders.hook` deseni).
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

/**
 * @param postalCode Cihazdaki saklı posta kodu (`lib/onboarding`); `null` = kod hiç girilmemiş.
 *   YERİN SORUSUDUR, cevabı sunucu verir — kart "bu adrese gelir mi"yi ancak bu kodla söyleyebilir
 *   (10.08). Kod değişince liste baştan okunur: `load` ona bağlı.
 */
export function usePackagesList(locale: Locale, postalCode: string | null): UsePackagesListResult {
  const [status, setStatus] = useState<PackagesStatus>('loading');
  const [packages, setPackages] = useState<HomePackage[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);

  const load = useCallback(
    (options: { refresh: boolean }) => {
      const run = (generation.current += 1);
      if (options.refresh) setRefreshing(true);
      else setStatus('loading');

      void fetchPackages(locale, postalCode).then((result) => {
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
    [locale, postalCode],
  );

  useEffect(() => {
    load({ refresh: false });
  }, [load]);

  const refresh = useCallback(() => load({ refresh: true }), [load]);
  const retry = useCallback(() => load({ refresh: false }), [load]);

  return { status, packages, refreshing, refresh, retry };
}
