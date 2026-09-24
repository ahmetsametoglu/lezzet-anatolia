'use client';

import { useState } from 'react';
import { shippingChoiceView } from '@lezzet/helper';
import checkoutMessages from '@lezzet/i18n/customer/checkout';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { formatPrice } from '@/lib/storefront/format';
import type { CheckoutViewProps } from '../checkout-types';
import { carrierToneOf } from '../use-service-points.hook';
import { PhoneOptionRow } from './phone-option-row';
import { PhonePointCard } from './phone-point-card';
import { PhoneServicePointPicker } from './phone-service-point-picker';

interface PhoneModeCardProps {
  icon: 'business' | 'home';
  title: string;
  from: string;
  selected: boolean;
  onClick: () => void;
}

/** Teslim türü kartı: tür ve en düşük fiyatı; seçili kart telefon kitinin seçili satırıyla aynı çerçeveyi taşır. */
function PhoneModeCard({ icon, title, from, selected, onClick }: PhoneModeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        'flex cursor-pointer flex-col items-center gap-2 rounded-control border-[1.5px] px-3 py-3.5 text-center transition-[scale,border-color] active:scale-[0.98]',
        selected ? 'border-ink bg-sand-150' : 'border-sand-400 bg-sand-250 hover:border-ink',
      ].join(' ')}
    >
      <span
        className={[
          'flex size-12 items-center justify-center rounded-full',
          selected ? 'bg-olive text-on-image' : 'bg-card text-olive',
        ].join(' ')}
      >
        <MobileIcon name={icon} size={24} />
      </span>
      <span className="font-sans text-control text-ink">{title}</span>
      <span className="font-sans text-helper leading-snug text-muted">{from}</span>
    </button>
  );
}

/**
 * Kargo seçiminin telefon görünümü: önce teslim türü, altında eve teslim servisleri ya da seçilen nokta. Native ödeme ekranı aynı
 * düzeni çizer; seçim sunucuya gider ve ücret yeniden çözülür.
 */
export function PhoneShippingChoice(props: CheckoutViewProps) {
  const { locale, snapshot, state, selectedAddress, onSelectShipping, onSelectServicePoint, onSelectShippingMode } = props;
  const copy = checkoutMessages[locale];
  const [pickerOpen, setPickerOpen] = useState(false);
  const shipping = snapshot.shipping;
  if (shipping?.mode === 'auto') return <p className="font-sans text-body-sm leading-[1.6] text-muted">{copy.carrier.freeHome}</p>;

  const view = shippingChoiceView(shipping?.options ?? [], state.shippingMode);
  if (shipping === null || (view.home.length === 0 && view.point.length === 0)) {
    return (
      <p className="font-sans text-body-sm leading-[1.6] text-muted">
        {shipping?.status === 'unmeasured' ? copy.carrier.unmeasured : shipping?.status === 'ok' ? copy.carrier.none : copy.carrier.off}
      </p>
    );
  }
  const point = state.servicePoint;
  const pointOption = view.point.find((o) => o.code === point?.optionCode);
  const openPicker = () => setPickerOpen(true);

  return (
    <div className="flex flex-col gap-2.5">
      <span className="font-sans text-note font-bold text-ink">
        {copy.carrier.title}
        {shipping.parcelCount > 1 && ` · ${copy.carrier.parcels.replace('{count}', String(shipping.parcelCount))}`}
      </span>
      {view.hasModes && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <PhoneModeCard
              icon="business"
              title={copy.carrier.point}
              from={copy.carrier.from.replace('{price}', formatPrice(view.pointFromCents!, locale))}
              selected={view.mode === 'point'}
              onClick={() => onSelectShippingMode('point')}
            />
            <PhoneModeCard
              icon="home"
              title={copy.carrier.home}
              from={copy.carrier.from.replace('{price}', formatPrice(view.homeFromCents!, locale))}
              selected={view.mode === 'home'}
              onClick={() => onSelectShippingMode('home')}
            />
          </div>
          <span aria-hidden className="mt-1.5 mb-0.5 h-px bg-sand-400" />
          <span className="font-sans text-note font-bold text-ink">
            {view.mode === 'home' ? copy.carrier.pickHome : copy.carrier.pickPoint}
          </span>
        </>
      )}
      {view.mode === 'home' &&
        view.home.map((option, index) => {
          const details = [
            option.leadTimeHours ? copy.carrier.days.replace('{hours}', String(option.leadTimeHours)) : null,
            option.tracked ? copy.carrier.tracked : null,
          ].filter((part): part is string => part !== null);
          return (
            <PhoneOptionRow
              key={option.code}
              label={option.carrierName}
              badge={view.home.length === 2 ? (index === 0 ? copy.carrier.cheapest : copy.carrier.fastest) : undefined}
              description={details.length > 0 ? details.join(' · ') : undefined}
              selected={state.shippingOptionCode === option.code}
              onClick={() => onSelectShipping(option.code)}
              trailing={<span className="flex-none font-sans text-control text-ink">{formatPrice(option.priceCents, locale)}</span>}
            />
          );
        })}
      {view.mode === 'point' &&
        (point && pointOption ? (
          <>
            <PhonePointCard
              entry={{ point, option: pointOption }}
              locale={locale}
              tone={carrierToneOf(view.point)(point.carrierCode)}
              selected
              onClick={openPicker}
            />
            <div>
              <TextAction label={copy.point.change} onClick={openPicker} />
            </div>
          </>
        ) : (
          <PhoneOptionRow
            label={copy.point.choose}
            description={copy.point.mapHint}
            selected={false}
            onClick={openPicker}
            trailing={<MobileIcon name="pin" size={20} className="text-ink" />}
          />
        ))}
      <p className="font-sans text-helper text-muted">{copy.carrier.hint}</p>
      {pickerOpen && state.addressId && (
        <PhoneServicePointPicker
          locale={locale}
          addressId={state.addressId}
          home={selectedAddress?.lat != null && selectedAddress.lng != null ? { lat: selectedAddress.lat, lng: selectedAddress.lng } : null}
          options={view.point}
          selected={point}
          onSelect={onSelectServicePoint}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
