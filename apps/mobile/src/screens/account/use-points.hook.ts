import { useEffect, useState } from 'react';

import { fetchPoints, type MePointsView } from '@/lib/api/points';

/*
  PUAN CÜZDANI DURUMU (21.17) — hesap ekranının puan bölümünü besler; `use-addresses.hook`un
  aynı deseni (ekran-yerel; ikinci tüketen doğduğu gün terfi eder).

  `view === null` İKİ AYRI HÂLİ birden taşımaz: yükleme sürüyor mu, yoksa okuma mı düştü —
  `status` söyler. Bölüm yalnız `ready` VE `view.points !== null` iken çizilir; B2B'de
  (`points: null`) bölüm hiç görünmez, düşen okumada da görünmez (yanlış bakiye göstermektense
  bölümü hiç çizmemek doğrudur — CLAUDE §1).
*/

type PointsStatus = 'loading' | 'ready' | 'error';

export function usePoints(enabled: boolean): {
  status: PointsStatus;
  view: MePointsView | null;
  publish: (next: MePointsView) => void;
} {
  const [state, setState] = useState<{ status: PointsStatus; view: MePointsView | null }>({
    status: 'loading',
    view: null,
  });

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void fetchPoints().then((result) => {
      if (!alive) return;
      if (result.error !== null) return setState({ status: 'error', view: null });
      setState({ status: 'ready', view: result.data });
    });
    return () => {
      alive = false;
    };
  }, [enabled]);

  /** Çevirme cevabı da tam görünüm taşır — yazan el ikinci bir GET atmaz (adres kapısının kuralı). */
  return { ...state, publish: (next) => setState({ status: 'ready', view: next }) };
}
