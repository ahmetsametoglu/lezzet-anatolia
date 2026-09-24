import { useEffect, useMemo, useState } from 'react';
import { orderServicePoints } from '@lezzet/domain-core';
import { carrierToneOf, pointCarriers, type CarrierTone, type ServicePointEntry } from '@lezzet/helper';
import type { CheckoutServicePoints, CheckoutShippingOption } from '@lezzet/types';
import { loadServicePointsAction } from './actions';

type LoadState =
  | { phase: 'loading' }
  | (Pick<Extract<CheckoutServicePoints, { status: 'ok' }>, 'failedCarriers' | 'origin'> & { phase: 'ready'; entries: ServicePointEntry[] })
  | { phase: 'failed' };

/** Renk token'ının sınıfı; Tailwind sınıfı kaynakta tam adıyla görmeli, token adından kurulan sınıf derlenmezdi. */
const TONE_CLASS: Record<CarrierTone, string> = {
  'brand-google': 'bg-brand-google',
  terracotta: 'bg-terracotta',
  star: 'bg-star',
  'olive-light': 'bg-olive-light',
};

const NO_ENTRIES: ServicePointEntry[] = [];

/** Taşıyıcının renk sınıfı (`carrierToneOf`); seçici ve seçilen noktanın kartı aynı rengi verir. */
export function carrierToneClassOf(pointOptions: readonly CheckoutShippingOption[]): (carrierCode: string) => string {
  const toneOf = carrierToneOf(pointOptions);
  return (carrierCode) => TONE_CLASS[toneOf(carrierCode)];
}

/**
 * Seçicinin noktaları: adrese yakın noktalar yüklenir ve her biri türünü kabul eden servisle eşlenir. Masaüstü ve telefon seçicisi
 * aynı yüklemeyi kullanır; lejant taşıyıcıları en düşük nokta fiyatına göre sıralar.
 */
export function useServicePoints(addressId: string, options: readonly CheckoutShippingOption[]) {
  const pointOptions = useMemo(() => options.filter((o) => o.needsServicePoint), [options]);
  const carriers = useMemo(() => pointCarriers(pointOptions), [pointOptions]);
  const toneOf = useMemo(() => carrierToneClassOf(pointOptions), [pointOptions]);
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await loadServicePointsAction(
        addressId,
        carriers.map((c) => c.carrierCode),
      );
      if (cancelled) return;
      if (!data || data.status !== 'ok') return setLoad({ phase: 'failed' });
      setLoad({
        phase: 'ready',
        entries: orderServicePoints(data.points, pointOptions),
        failedCarriers: data.failedCarriers,
        origin: data.origin,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [addressId, carriers, pointOptions]);

  const entries = load.phase === 'ready' ? load.entries : NO_ENTRIES;
  const pins = useMemo(
    () =>
      entries.flatMap(({ point, option }) => {
        if (point.latitude === null || point.longitude === null) return [];
        const title = `${point.name} · ${option.carrierName}`;
        return [{ id: point.id, lat: point.latitude, lng: point.longitude, tone: toneOf(point.carrierCode), title }];
      }),
    [entries, toneOf],
  );

  return { load, entries, pins, carriers, toneOf };
}
