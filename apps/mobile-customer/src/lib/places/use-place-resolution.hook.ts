import { useCallback, useEffect, useState } from 'react';
import { POSTAL_CODE_LENGTH } from '@lezzet/address';
import type { Country } from '@lezzet/types';

import { resolvePostalCode, type PlaceResolution } from '@/lib/api/places';
import { useLiveRefresh } from '@/lib/app-state/use-live-refresh';

/*
  Kod değişince eski cevap anında düşer, çünkü yarım kodun yanında önceki kodun şehri durursa ekran yanlış yeri söyler.
  Düşen istek cevap yazmaz ve hâl "bilinmiyor" kalır: soru zorunlu değil, mobilde log altyapısı da yok.
*/

export interface PlaceLookup {
  /** Aynı kodu yeniden sorar; aşağı çekme jesti çağıranın kaydırma alanına ait olduğu için kapı açık bırakılır. */
  refresh: () => void;
  /** `null` = kod eksik, cevap henüz yok ya da istek düştü. Dört hâlin anlamı sözleşmede. */
  place: PlaceResolution | null;
  /** İstek uçuşta mı; türetilmez, efekt yazar, çünkü `place === null` düşen isteği de kapsar ve türetilmiş bayrakla iskelet hiç sönmezdi. */
  pending: boolean;
}

/** Cevap ve bekleyiş birlikte; `usePlaceResolution` yalnız cevabı isteyen çağıranlar için ince bir sarmalayıcıdır. */
export function usePlaceLookup(code: string, country: Country | null = null): PlaceLookup {
  const [place, setPlace] = useState<PlaceResolution | null>(null);
  const [pending, setPending] = useState(false);

  /* Kapsam değişebilen bir cevaptır (kapsanmayan kod sonradan rotaya eklenir), bu yüzden öne gelince aynı kod yeniden sorulur.
     Sayaç veri değil tetiktir, efekti ilk okumayla aynı yoldan yeniden koşturur. */
  const [tur, setTur] = useState(0);
  const refresh = useCallback(() => setTur((n) => n + 1), []);
  useLiveRefresh(refresh);

  useEffect(() => {
    setPlace(null);
    if (code.length < POSTAL_CODE_LENGTH) {
      setPending(false);
      return;
    }
    setPending(true);
    let current = true;
    void resolvePostalCode(code, country)
      .then((result) => {
        if (current && result.error === null) setPlace(result.data);
      })
      // `finally` ÇÜNKÜ ret de bir bitiştir: düşen istekte bekleyiş sürseydi iskelet hiç sönmezdi.
      .finally(() => {
        if (current) setPending(false);
      });
    return () => {
      current = false;
    };
  }, [code, country, tur]);

  return { place, pending, refresh };
}

/** `null` = kod eksik ya da cevap henüz yok. Dört hâlin anlamı sözleşmede (`place-api.schema.ts`). */
export function usePlaceResolution(code: string, country: Country | null = null): PlaceResolution | null {
  const { place } = usePlaceLookup(code, country);

  return place;
}
