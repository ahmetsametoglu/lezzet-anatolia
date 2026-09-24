import { useEffect, useMemo, useState } from 'react';
import { orderServicePoints } from '@lezzet/domain-core';
import { pointCarriers } from '@lezzet/helper';
import type { CheckoutShippingOption } from '@lezzet/types';
import { loadServicePointsAction } from './actions';
import type { CheckoutServicePoint } from './checkout-types';

/** Listedeki nokta ve onu taşıyacak servis. */
export type PointEntry = { point: CheckoutServicePoint; option: CheckoutShippingOption };

type LoadState = { phase: 'loading' } | { phase: 'ready'; entries: PointEntry[]; failedCarriers: string[] } | { phase: 'failed' };

/**
 * Taşıyıcı renkleri, fiyat sırasıyla; tonca birbirinden uzak seçildi ki yan yana noktalar karışmasın. Zeytin seçili, mürekkep
 * üzerine gelinen nokta ve adres için ayrıldığından burada yok.
 */
const CARRIER_TONES = ['bg-brand-messenger', 'bg-terracotta', 'bg-star', 'bg-brand-instagram', 'bg-olive-light'];

const NO_ENTRIES: PointEntry[] = [];

/** Taşıyıcının renk sınıfı; sıra en düşük nokta fiyatından gelir, böylece seçici ve seçilen noktanın kartı aynı rengi verir. */
export function carrierToneOf(pointOptions: readonly CheckoutShippingOption[]): (carrierCode: string) => string {
  const tones = new Map(pointCarriers(pointOptions).map((c, i) => [c.carrierCode, CARRIER_TONES[i % CARRIER_TONES.length]!]));
  return (carrierCode) => tones.get(carrierCode) ?? CARRIER_TONES[0]!;
}

/**
 * Seçicinin noktaları: adrese yakın noktalar yüklenir ve her biri türünü kabul eden servisle eşlenir. Masaüstü ve telefon seçicisi
 * aynı yüklemeyi kullanır; lejant taşıyıcıları en düşük nokta fiyatına göre sıralar.
 */
export function useServicePoints(addressId: string, options: readonly CheckoutShippingOption[]) {
  const pointOptions = useMemo(() => options.filter((o) => o.needsServicePoint), [options]);
  const carriers = useMemo(() => pointCarriers(pointOptions), [pointOptions]);
  const toneOf = useMemo(() => carrierToneOf(pointOptions), [pointOptions]);
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
      setLoad({ phase: 'ready', entries: orderServicePoints(data.points, pointOptions), failedCarriers: data.failedCarriers });
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
