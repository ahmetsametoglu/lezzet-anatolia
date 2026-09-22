'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { Dialog } from '@/components/customer/ui/dialog';
import { formatPrice } from '@/lib/storefront/format';
import { loadServicePointsAction } from '../actions';
import { openingLines, orderServicePoints, pointOptionsByCarrier, type CheckoutViewProps, type Messages, type SelectedServicePoint } from '../checkout-types';

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
  t: Messages;
  locale: Locale;
  addressId: string;
  /** Müşterinin adresinin konumu; yoksa harita noktalara göre açılır. */
  home: { lat: number; lng: number } | null;
  options: readonly ShippingOption[];
  selected: SelectedServicePoint | null;
  onSelect: (point: SelectedServicePoint) => void;
  onClose: () => void;
}

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ready'; points: SelectedServicePoint[]; failedCarriers: string[] }
  | { phase: 'failed' };

/** "820 m" · "1,4 km" — dile göre ondalık. */
function distanceLabel(meters: number, locale: Locale): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(meters / 1000)} km`;
}

/**
 * Bütün noktaya teslim servislerinin noktaları tek haritada, her biri kendi taşıyıcısının fiyatıyla; müşteri önce servis
 * seçmez, noktayı seçer ve servis noktadan gelir. Fiyat anlık görüntünün teklifidir, sipariş anında yeniden doğrulanır.
 */
export function ServicePointPicker({ t, locale, addressId, home, options, selected, onSelect, onClose }: ServicePointPickerProps) {
  const byCarrier = useMemo(() => pointOptionsByCarrier(options), [options]);
  const carriers = useMemo(() => [...byCarrier.values()].sort((a, b) => a.priceCents - b.priceCents), [byCarrier]);
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
      const { data } = await loadServicePointsAction(addressId, [...byCarrier.keys()]);
      if (cancelled) return;
      if (!data || data.status !== 'ok') return setLoad({ phase: 'failed' });
      const points = orderServicePoints(data.points, byCarrier);
      setLoad({ phase: 'ready', points, failedCarriers: data.failedCarriers });
    })();
    return () => {
      cancelled = true;
    };
  }, [addressId, byCarrier]);

  const points = load.phase === 'ready' ? load.points : [];
  const optionOf = (point: SelectedServicePoint) => byCarrier.get(point.carrierCode);
  const pins = useMemo(
    () =>
      points.flatMap((p) => {
        const option = byCarrier.get(p.carrierCode);
        if (p.latitude === null || p.longitude === null || !option) return [];
        const tone = toneByCarrier.get(p.carrierCode) ?? CARRIER_TONES[0]!;
        return [{ id: p.id, lat: p.latitude, lng: p.longitude, tone, title: `${p.name} · ${option.carrierName}` }];
      }),
    [points, byCarrier, toneByCarrier],
  );
  const pending = points.find((p) => p.id === pendingId) ?? null;
  const hours = pending ? openingLines(pending.openingTimes, locale, t.delivery.pointClosed) : null;
  const carrierNames = (codes: string[]) => codes.map((c) => byCarrier.get(c)?.carrierName ?? c).join(', ');

  return (
    <Dialog title={t.delivery.pointDialogTitle} description={t.delivery.pointDialogBody} closeLabel={t.delivery.pointClose} onClose={onClose} maxWidth={1080}>
      {load.phase === 'ready' && load.failedCarriers.length > 0 && (
        <p className="font-sans text-note font-semibold text-honey">{t.delivery.pointFailed.replace('{carriers}', carrierNames(load.failedCarriers))}</p>
      )}
      {/* Seçim düğmesi lejantla aynı satırda: alt bölme yalnız bir düğme için haritadan yer yiyordu. */}
      <div className="flex items-center justify-between gap-4">
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5" aria-label={t.delivery.carrierPoint}>
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
            onSelect(pending);
            onClose();
          }}
        >
          {t.delivery.pointSelect}
        </Button>
      </div>
      <div className="grid h-[560px] grid-cols-[340px_1fr] gap-4">
        <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1" aria-label={t.delivery.pointDialogTitle}>
          {load.phase === 'loading' && <li className="font-sans text-body-sm text-muted">{t.delivery.pointLoading}</li>}
          {(load.phase === 'failed' || (load.phase === 'ready' && points.length === 0)) && (
            <li className="font-sans text-body-sm text-muted">{t.delivery.pointEmpty}</li>
          )}
          {points.map((point) => {
            const option = optionOf(point);
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
                    {option && <span className="flex-none font-sans text-body-sm font-bold text-ink">{formatPrice(option.priceCents, locale)}</span>}
                  </span>
                  <span className="font-sans text-note text-body capitalize">
                    {[point.street, point.houseNumber].filter(Boolean).join(' ').toLowerCase()}, {point.postalCode} {point.city.toLowerCase()}
                  </span>
                  <span className="flex items-center gap-1.5 font-sans text-note text-muted">
                    <span className={`size-2.5 flex-none rounded-full ${toneOf(point.carrierCode)}`} />
                    {[option?.carrierName, point.distanceM !== null ? t.delivery.pointDistance.replace('{distance}', distanceLabel(point.distanceM, locale)) : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {isPending && (
                    <span className="mt-1 font-sans text-helper leading-relaxed text-muted">{hours ? hours.join(' · ') : t.delivery.pointHoursUnknown}</span>
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
            home={home ? { ...home, label: t.delivery.pointYourAddress } : null}
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
