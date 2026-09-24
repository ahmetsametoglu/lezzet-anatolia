'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import checkoutMessages from '@lezzet/i18n/customer/checkout';
import type { CheckoutShippingOption } from '@lezzet/types';
import { AppBar } from '@/components/customer/ui/app-bar';
import { Dialog } from '@/components/customer/ui/dialog';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import type { SelectedServicePoint } from '../checkout-types';
import { useServicePoints } from '../use-service-points.hook';
import { PhonePointCard } from './phone-point-card';
import { ServicePointMap } from './service-point-map';

interface PhoneServicePointPickerProps {
  locale: Locale;
  addressId: string;
  options: readonly CheckoutShippingOption[];
  selected: SelectedServicePoint | null;
  onSelect: (point: SelectedServicePoint) => void;
  onClose: () => void;
}

/**
 * Telefonun nokta seçicisi: harita tam ekran, dokunulan noktanın kartı altta; liste mevcut çekmecede, en ucuz başta. Seçim üstteki
 * düğmeyle yapılır; native ödeme ekranı aynı düzeni çizer.
 */
export function PhoneServicePointPicker({ locale, addressId, options, selected, onSelect, onClose }: PhoneServicePointPickerProps) {
  const copy = checkoutMessages[locale];
  const { load, entries, pins, carriers, toneOf } = useServicePoints(addressId, options);
  const [pendingId, setPendingId] = useState<string | null>(selected?.id ?? null);
  const [listOpen, setListOpen] = useState(false);
  const pending = entries.find((e) => e.point.id === pendingId) ?? null;
  const carrierNames = (codes: string[]) => codes.map((c) => carriers.find((o) => o.carrierCode === c)?.carrierName ?? c).join(', ');

  return (
    <div role="dialog" aria-modal="true" aria-label={copy.point.title} className="fixed inset-0 z-50 flex flex-col bg-sand-50">
      {/* Başlık türün adı: "nokta seçin" cümlesi Fransızca ve Almancada seçim düğmesinin yanına sığmıyor, eylemi düğme zaten söylüyor. */}
      <AppBar
        title={copy.carrier.point}
        left={
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.point.close}
            className="relative flex size-10 flex-none cursor-pointer items-center justify-center rounded-full text-ink transition-colors after:absolute after:-inset-0.5 after:content-[''] hover:bg-sand-200 active:bg-sand-200"
          >
            <MobileIcon name="close" size={22} />
          </button>
        }
        right={
          <button
            type="button"
            disabled={!pending}
            onClick={() => {
              if (!pending) return;
              onSelect({ ...pending.point, optionCode: pending.option.code });
              onClose();
            }}
            className={[
              'rounded-badge px-3 py-2 font-sans text-note font-bold whitespace-nowrap transition-colors',
              pending
                ? 'cursor-pointer bg-olive text-on-image hover:bg-olive-dark'
                : 'cursor-not-allowed bg-disabled-fill text-disabled-text',
            ].join(' ')}
          >
            {copy.point.select}
          </button>
        }
      />
      <ul aria-label={copy.carrier.point} className="flex flex-none gap-3 overflow-x-auto border-b border-sand-275 px-4 py-2">
        {carriers.map((c) => (
          <li key={c.carrierCode} className="flex flex-none items-center gap-1.5 font-sans text-helper font-semibold text-ink">
            <span className={`size-2.5 rounded-full ${toneOf(c.carrierCode)}`} />
            {c.carrierName}
          </li>
        ))}
      </ul>
      <div className="relative min-h-0 flex-1">
        {/* Harita kendi yığın bağlamında: Leaflet'in iç katmanları alttaki kartın ve çekmecenin üstüne çıkmasın. */}
        <div className="absolute inset-0 isolate">
          <ServicePointMap
            pins={pins}
            selectedId={pendingId}
            highlightId={null}
            home={load.phase === 'ready' && load.origin ? { ...load.origin, label: copy.point.yourAddress } : null}
            onPick={setPendingId}
          />
        </div>
        {/* Alt boşluk Google logosu ve telif satırı için: şart gereği haritanın alt köşeleri örtülmez. */}
        <div className="pointer-events-none absolute inset-x-3 bottom-10 z-10 flex flex-col items-center gap-2.5">
          {load.phase === 'ready' && load.failedCarriers.length > 0 && (
            <p className="pointer-events-auto rounded-control bg-card px-3 py-2 font-sans text-helper font-semibold text-honey shadow-badge">
              {copy.point.failed.replace('{carriers}', carrierNames(load.failedCarriers))}
            </p>
          )}
          {pending && (
            <div className="pointer-events-auto w-full rounded-control shadow-badge">
              <PhonePointCard entry={pending} locale={locale} tone={toneOf(pending.point.carrierCode)} selected showHours />
            </div>
          )}
          {load.phase === 'loading' && (
            <p className="pointer-events-auto rounded-pill bg-card px-4 py-2 font-sans text-helper text-muted shadow-badge">
              {copy.point.loading}
            </p>
          )}
          {(load.phase === 'failed' || (load.phase === 'ready' && entries.length === 0)) && (
            <p className="pointer-events-auto rounded-control bg-card px-4 py-2 font-sans text-helper text-muted shadow-badge">
              {copy.point.empty}
            </p>
          )}
          {entries.length > 0 && (
            <button
              type="button"
              onClick={() => setListOpen(true)}
              className="pointer-events-auto cursor-pointer rounded-pill bg-ink px-5 py-3 font-sans text-control text-on-image shadow-toast transition-colors hover:bg-ink-hover"
            >
              {copy.point.showList.replace('{count}', String(entries.length))}
            </button>
          )}
        </div>
      </div>
      {listOpen && (
        <Dialog placement="sheet" title={copy.point.listTitle} closeLabel={copy.point.close} onClose={() => setListOpen(false)}>
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => (
              <li key={entry.point.id}>
                <PhonePointCard
                  entry={entry}
                  locale={locale}
                  tone={toneOf(entry.point.carrierCode)}
                  selected={entry.point.id === pendingId}
                  onClick={() => {
                    setPendingId(entry.point.id);
                    setListOpen(false);
                  }}
                />
              </li>
            ))}
          </ul>
        </Dialog>
      )}
    </div>
  );
}
