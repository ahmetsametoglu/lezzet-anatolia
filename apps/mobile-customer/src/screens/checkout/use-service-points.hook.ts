import { orderServicePoints } from '@lezzet/domain-core';
import { carrierToneOf, pointCarriers, type ServicePointEntry } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import type { CheckoutServicePoints, CheckoutShippingOption } from '@lezzet/types';
import { useEffect, useMemo, useState } from 'react';

import { fetchServicePoints } from '@/lib/api/checkout';

type LoadState =
  | { phase: 'loading' }
  | (Pick<Extract<CheckoutServicePoints, { status: 'ok' }>, 'failedCarriers' | 'origin'> & { phase: 'ready'; entries: ServicePointEntry[] })
  | { phase: 'failed' };

const NO_ENTRIES: ServicePointEntry[] = [];

/**
 * Seçicinin noktaları: adrese yakın noktalar yüklenir ve her biri türünü kabul eden servisle eşlenir (`orderServicePoints`); web
 * telefon görünümünün yüklemesiyle aynı kural, lejant taşıyıcıları en düşük nokta fiyatına göre sıralar.
 */
export function useServicePoints(locale: Locale, addressId: string, pointOptions: readonly CheckoutShippingOption[]) {
  const carriers = useMemo(() => pointCarriers(pointOptions), [pointOptions]);
  const toneOf = useMemo(() => carrierToneOf(pointOptions), [pointOptions]);
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void fetchServicePoints(
      locale,
      addressId,
      carriers.map((c) => c.carrierCode),
    ).then((result) => {
      if (cancelled) return;
      if (result.error !== null || result.data.status !== 'ok') {
        setLoad({ phase: 'failed' });
        return;
      }
      const { points, failedCarriers, origin } = result.data;
      setLoad({ phase: 'ready', entries: orderServicePoints(points, pointOptions), failedCarriers, origin });
    });
    return () => {
      cancelled = true;
    };
  }, [locale, addressId, carriers, pointOptions]);

  return { load, entries: load.phase === 'ready' ? load.entries : NO_ENTRIES, carriers, toneOf };
}
