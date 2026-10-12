'use client';

import { useState } from 'react';
import messages from '@lezzet/i18n/customer/delivery-zones';
import type { Country, DeliveryAreaList } from '@lezzet/types';
import { PostalCodeFields } from '@/components/customer/delivery/postal-code-fields';
import { usePostalCodeDraft } from '@/components/customer/delivery/use-postal-code-draft.hook';
import { EmptyState } from '@/components/customer/phone-kit/empty-state';
import { Note } from '@/components/customer/phone-kit/note';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { closingSentence, lastRowStart, placeCount } from './delivery-zones-copy';
import type { DeliveryZonesViewProps } from './delivery-zones-types';

type Area = DeliveryAreaList['areas'][number];

/**
 * Teslimat bölgelerinin telefon görünümü, native ekranın ikizi: önce müşterinin kendi kodu sorulur, çünkü asıl soru "benim kodum var
 * mı"; yerler ülke kartlarında kapalı gelir ki liste büyüdükçe sayfa uzamasın. Kart kodu yalnız sorar, sitenin yerini değiştirmez.
 */
export function DeliveryZonesMobile({ locale, areas, shippingCountries }: DeliveryZonesViewProps) {
  const t = messages[locale];
  const draft = usePostalCodeDraft();
  const [open, setOpen] = useState<Partial<Record<Country, boolean>>>({});

  return (
    <div className="flex flex-col gap-4 px-4.5 pt-4.5 pb-7.5">
      <p className="font-sans text-helper leading-[1.6] text-ink">{t.intro}</p>

      <section className="flex flex-col gap-3 rounded-card bg-sand-250 p-4">
        <h2 className="font-serif text-card-title-sm text-ink">{t.codeTitle}</h2>
        <PostalCodeFields locale={locale} draft={draft} />
      </section>

      {areas.length === 0 ? (
        <EmptyState
          icon={<MobileIcon name="truck" size={80} className="text-sand-600" />}
          title={t.empty.title}
          description={t.empty.body}
        />
      ) : (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-sans text-eyebrow-xs text-terracotta uppercase">{t.listEyebrow}</h2>
            <span className="font-sans text-note font-semibold text-ink">{placeCount(t, areas.reduce((sum, area) => sum + area.places.length, 0))}</span>
          </div>
          {areas.map((area) => (
            <AreaCard
              key={area.country}
              area={area}
              name={t.countries[area.country]}
              count={placeCount(t, area.places.length)}
              open={open[area.country] === true}
              onToggle={() => setOpen((current) => ({ ...current, [area.country]: !current[area.country] }))}
            />
          ))}
        </section>
      )}

      {/* Kapanış cümlesi kargo yolunu açıkça söyler ki liste "burada yoksanız satmıyoruz" diye okunmasın. */}
      <Note tone="warm" description={closingSentence(t, shippingCountries)} />
    </div>
  );
}

interface AreaCardProps {
  area: Area;
  /** Ülke adı ekranın sözlüğünden; sunucu yalnız ülke kodu gönderir. */
  name: string;
  count: string;
  open: boolean;
  onToggle: () => void;
}

/** Ülke kartı: başlıkta yer sayısı, açılınca yerler iki sütunda; satırlar eşit hizalı ki göz satırı izleyebilsin. */
function AreaCard({ area, name, count, open, onToggle }: AreaCardProps) {
  const lastRow = lastRowStart(area.places.length, 2);

  return (
    <div className="rounded-card bg-sand-250">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center gap-3 rounded-card px-4 py-3.5 text-left transition-colors hover:bg-sand-200"
      >
        <span className="flex-1 font-serif text-card-title-sm text-ink">{name}</span>
        <span className="font-sans text-note font-semibold text-ink">{count}</span>
        <span aria-hidden className="w-3.5 text-center font-sans text-body font-semibold text-ink">
          {open ? '–' : '+'}
        </span>
      </button>
      {open && (
        <ul className="grid grid-cols-2 gap-x-4 border-t-[1.5px] border-dashed border-sand-400 px-4">
          {area.places.map((place, index) => (
            <li
              key={`${place.name ?? ''}-${index}`}
              className={['flex flex-col gap-0.5 py-2.5', index < lastRow ? 'border-b-[1.5px] border-dashed border-sand-400' : ''].join(' ')}
            >
              {/* Adı olmayan yer yalnız kodlarıyla çizilir: yer kaydı yok diye kodu gizlemek gittiğimiz bir yeri saklamak olurdu. */}
              {place.name !== null && <span className="font-sans text-note font-semibold text-ink">{place.name}</span>}
              <span className="font-sans text-micro text-ink">{place.codes.join(' · ')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
