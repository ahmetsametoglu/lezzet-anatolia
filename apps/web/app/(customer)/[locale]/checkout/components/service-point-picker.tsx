'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { orderServicePoints } from '@lezzet/domain-core';
import { openingLines } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import checkoutMessages from '@lezzet/i18n/customer/checkout';
import { Button } from '@/components/customer/ui/button';
import { Dialog } from '@/components/customer/ui/dialog';
import { formatPrice } from '@/lib/storefront/format';
import { loadServicePointsAction } from '../actions';
import { type CheckoutServicePoint, type CheckoutViewProps, type SelectedServicePoint } from '../checkout-types';

const ServicePointMap = dynamic(() => import('./service-point-map-leaflet').then((mod) => mod.ServicePointMapLeaflet), {
  ssr: false,
  loading: () => <div className="size-full bg-sand-100" />,
});

type ShippingOption = NonNullable<CheckoutViewProps['snapshot']['shipping']>['options'][number];

/**
 * Taşıyıcı renkleri, fiyat sırasıyla; tonca birbirinden uzak seçildi ki yan yana noktalar karışmasın. Zeytin seçili, mürekkep
 * üzerine gelinen nokta ve adres için ayrıldığından burada yok.
 */
const CARRIER_TONES = ['bg-brand-messenger', 'bg-terracotta', 'bg-star', 'bg-brand-instagram', 'bg-olive-light'];

interface ServicePointPickerProps {
  locale: Locale;
  addressId: string;
  /** Müşterinin adresinin konumu; yoksa harita noktalara göre açılır. */
  home: { lat: number; lng: number } | null;
  options: readonly ShippingOption[];
  selected: SelectedServicePoint | null;
  onSelect: (point: SelectedServicePoint) => void;
  onClose: () => void;
}

/** Listedeki nokta ve onu taşıyacak servis. */
type PointEntry = { point: CheckoutServicePoint; option: ShippingOption };

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ready'; entries: PointEntry[]; failedCarriers: string[] }
  | { phase: 'failed' };

/** "820 m" · "1,4 km" — dile göre ondalık. */
function distanceLabel(meters: number, locale: Locale): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(meters / 1000)} km`;
}

/**
 * Bütün noktaya teslim servislerinin noktaları tek haritada; müşteri önce servis seçmez, noktayı seçer ve servis noktadan gelir.
 * Her nokta, türünü kabul eden servisin fiyatıyla görünür; fiyat anlık görüntünün teklifidir, sipariş anında yeniden doğrulanır.
 */
export function ServicePointPicker({ locale, addressId, home, options, selected, onSelect, onClose }: ServicePointPickerProps) {
  const copy = checkoutMessages[locale];
  const pointOptions = useMemo(() => options.filter((o) => o.needsServicePoint), [options]);
  // Lejant ve renk sırası: taşıyıcının en düşük nokta fiyatı.
  const carriers = useMemo(() => {
    const byPrice = [...pointOptions].sort((a, b) => a.priceCents - b.priceCents);
    return byPrice.filter((o, i) => byPrice.findIndex((x) => x.carrierCode === o.carrierCode) === i);
  }, [pointOptions]);
  const toneByCarrier = useMemo(
    () => new Map(carriers.map((c, i) => [c.carrierCode, CARRIER_TONES[i % CARRIER_TONES.length]!])),
    [carriers],
  );
  const toneOf = (carrierCode: string) => toneByCarrier.get(carrierCode) ?? CARRIER_TONES[0]!;
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' });
  const [pendingId, setPendingId] = useState<string | null>(selected?.id ?? null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Haritadan seçilen nokta listede görünür alana kaydırılır; listeden seçilende kaydırma yok, kart zaten gözün önünde.
  const pendingFromMap = useRef(false);

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

  const entries = load.phase === 'ready' ? load.entries : [];
  const pins = useMemo(
    () =>
      entries.flatMap(({ point, option }) => {
        if (point.latitude === null || point.longitude === null) return [];
        const tone = toneByCarrier.get(point.carrierCode) ?? CARRIER_TONES[0]!;
        return [{ id: point.id, lat: point.latitude, lng: point.longitude, tone, title: `${point.name} · ${option.carrierName}` }];
      }),
    [entries, toneByCarrier],
  );
  const pending = entries.find((e) => e.point.id === pendingId) ?? null;
  const hours = pending ? openingLines(pending.point.openingTimes, locale, copy.point.closed) : null;
  const carrierNames = (codes: string[]) => codes.map((c) => carriers.find((o) => o.carrierCode === c)?.carrierName ?? c).join(', ');

  return (
    <Dialog title={copy.point.title} description={copy.point.body} closeLabel={copy.point.close} onClose={onClose} maxWidth={1080}>
      {load.phase === 'ready' && load.failedCarriers.length > 0 && (
        <p className="font-sans text-note font-semibold text-honey">{copy.point.failed.replace('{carriers}', carrierNames(load.failedCarriers))}</p>
      )}
      {/* Seçim düğmesi lejantla aynı satırda: alt bölme yalnız bir düğme için haritadan yer yiyordu. */}
      <div className="flex items-center justify-between gap-4">
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5" aria-label={copy.carrier.point}>
          {carriers.map((c) => (
            <li key={c.carrierCode} className="flex items-center gap-2 font-sans text-note font-semibold text-ink">
              <span className={`size-3 rounded-full ${toneOf(c.carrierCode)}`} />
              {c.carrierName}
            </li>
          ))}
        </ul>
        <Button
          size="sm"
          className="flex-none whitespace-nowrap"
          disabled={!pending}
          onClick={() => {
            if (!pending) return;
            onSelect({ ...pending.point, optionCode: pending.option.code });
            onClose();
          }}
        >
          {copy.point.select}
        </Button>
      </div>
      <div className="grid h-[560px] grid-cols-[340px_1fr] gap-4">
        <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1" aria-label={copy.point.title}>
          {load.phase === 'loading' && <li className="font-sans text-body-sm text-muted">{copy.point.loading}</li>}
          {(load.phase === 'failed' || (load.phase === 'ready' && entries.length === 0)) && (
            <li className="font-sans text-body-sm text-muted">{copy.point.empty}</li>
          )}
          {entries.map(({ point, option }) => {
            const isPending = point.id === pendingId;
            return (
              <li key={point.id} ref={(node) => void (node && isPending && pendingFromMap.current && node.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))}>
                <button
                  type="button"
                  onClick={() => {
                    pendingFromMap.current = false;
                    setPendingId(point.id);
                  }}
                  onMouseEnter={() => setHoverId(point.id)}
                  onMouseLeave={() => setHoverId(null)}
                  onFocus={() => setHoverId(point.id)}
                  onBlur={() => setHoverId(null)}
                  aria-pressed={isPending}
                  className={[
                    'flex w-full cursor-pointer flex-col gap-0.5 rounded-soft px-3.5 py-3 text-left transition-colors',
                    isPending ? 'border-2 border-olive bg-olive-bg' : 'border-[1.5px] border-sand-300 bg-card hover:border-olive',
                  ].join(' ')}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-sans text-body-sm font-bold text-ink capitalize">{point.name.toLowerCase()}</span>
                    <span className="flex-none font-sans text-body-sm font-bold text-ink">{formatPrice(option.priceCents, locale)}</span>
                  </span>
                  <span className="font-sans text-note text-body capitalize">
                    {[point.street, point.houseNumber].filter(Boolean).join(' ').toLowerCase()}, {point.postalCode} {point.city.toLowerCase()}
                  </span>
                  <span className="flex items-center gap-1.5 font-sans text-note text-muted">
                    <span className={`size-2.5 flex-none rounded-full ${toneOf(point.carrierCode)}`} />
                    {[
                      option.carrierName,
                      point.kind ? copy.point.kind[point.kind] : null,
                      point.distanceM !== null ? copy.point.distance.replace('{distance}', distanceLabel(point.distanceM, locale)) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {isPending && (
                    <span className="mt-1 font-sans text-helper leading-relaxed text-muted">{hours ? hours.join(' · ') : copy.point.hoursUnknown}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="min-h-0 overflow-hidden rounded-soft border border-sand-300">
          <ServicePointMap
            pins={pins}
            selectedId={pendingId}
            highlightId={hoverId}
            home={home ? { ...home, label: copy.point.yourAddress } : null}
            onPick={(id) => {
              pendingFromMap.current = true;
              setPendingId(id);
            }}
          />
        </div>
      </div>
    </Dialog>
  );
}
