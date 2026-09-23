import { useEffect, useState } from 'react';

import { fetchPickupPoints, type PickupPoint } from '@/lib/api/pickup-points';

/*
  GEL-AL NOKTALARI — adres seçicinin depo kartları. Adres listesi gibi ekran-yerel okunur (`use-addresses.hook`). Okuma düşerse
  liste BOŞtur ve kart çizilmez: gel-al yalnız izinli müşteriye açık, boş liste yanlış bir vaat değildir.
*/
export function usePickupPoints(enabled: boolean): PickupPoint[] {
  const [points, setPoints] = useState<PickupPoint[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void fetchPickupPoints().then((result) => {
      if (!alive) return;
      setPoints(result.error !== null ? [] : (result.data?.warehouses ?? []));
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return points;
}
