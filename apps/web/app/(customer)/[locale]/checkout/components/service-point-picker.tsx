'use client';

import { useRef, useState } from 'react';
import { distanceLabel, openingLines, pointAddress, pointText } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import checkoutMessages from '@lezzet/i18n/customer/checkout';
import type { CheckoutShippingOption } from '@lezzet/types';
import { Button } from '@/components/customer/ui/button';
import { Dialog } from '@/components/customer/ui/dialog';
import { formatPrice } from '@/lib/storefront/format';
import type { SelectedServicePoint } from '../checkout-types';
import { useServicePoints } from '../use-service-points.hook';
import { ServicePointMap } from './service-point-map';

interface ServicePointPickerProps {
  locale: Locale;
  addressId: string;
  options: readonly CheckoutShippingOption[];
  selected: SelectedServicePoint | null;
  onSelect: (point: SelectedServicePoint) => void;
  onClose: () => void;
}

/**
 * Bütün noktaya teslim servislerinin noktaları tek haritada; müşteri önce servis seçmez, noktayı seçer ve servis noktadan gelir.
 * Her nokta, türünü kabul eden servisin fiyatıyla görünür; fiyat anlık görüntünün teklifidir, sipariş anında yeniden doğrulanır.
 */
export function ServicePointPicker({ locale, addressId, options, selected, onSelect, onClose }: ServicePointPickerProps) {
  const copy = checkoutMessages[locale];
  const { load, entries, pins, carriers, toneOf } = useServicePoints(addressId, options);
  const [pendingId, setPendingId] = useState<string | null>(selected?.id ?? null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Haritadan seçilen nokta listede görünür alana kaydırılır; listeden seçilende kaydırma yok, kart zaten gözün önünde.
  const pendingFromMap = useRef(false);

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
                    <span className="font-sans text-body-sm font-bold text-ink">{pointText(point.name)}</span>
                    <span className="flex-none font-sans text-body-sm font-bold text-ink">{formatPrice(option.priceCents, locale)}</span>
                  </span>
                  <span className="font-sans text-note text-body">{pointAddress(point)}</span>
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
            home={load.phase === 'ready' && load.origin ? { ...load.origin, label: copy.point.yourAddress } : null}
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
