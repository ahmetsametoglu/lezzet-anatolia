'use client';

import { useState } from 'react';
import messages from '@lezzet/i18n/customer/delivery-zones';
import type { Country, DeliveryAreaList } from '@lezzet/types';
import { PostalCodeFields } from '@/components/customer/delivery/postal-code-fields';
import { usePostalCodeDraft } from '@/components/customer/delivery/use-postal-code-draft.hook';
import { Icon } from '@/components/customer/ui/icons';
import { closingSentence, lastRowStart, placeCount } from './delivery-zones-copy';
import type { DeliveryZonesViewProps } from './delivery-zones-types';

type Area = DeliveryAreaList['areas'][number];

/** Masaüstünde yerler dört sütuna dizilir; geniş satırda iki sütun listeyi gereksiz uzatırdı. */
const COLUMNS = 4;

/**
 * Teslimat bölgelerinin masaüstü görünümü, bilgi sayfası kalıbında: kod kartı ve kargo notu solda yapışkan durur ki liste kayarken
 * "benim kodum var mı" sorusu elde kalsın. Ülke kartları açık gelir, çünkü geniş ekranda liste kısa kalıyor.
 */
export function DeliveryZonesDesktop({ locale, areas, shippingCountries }: DeliveryZonesViewProps) {
  const t = messages[locale];
  const draft = usePostalCodeDraft();
  const [closed, setClosed] = useState<Partial<Record<Country, boolean>>>({});

  return (
    <div className="grid grid-cols-[330px_1fr] items-start gap-11 px-12 pt-9 pb-14">
      <div className="sticky top-24 flex flex-col gap-4">
        <section className="flex flex-col gap-3 rounded-card border border-sand-200 bg-card p-5">
          <h2 className="font-serif text-card-title-sm text-ink">{t.codeTitle}</h2>
          <PostalCodeFields locale={locale} draft={draft} />
        </section>
        <p className="rounded-card bg-sand-150 px-4 py-3.5 font-sans text-note leading-[1.55] text-ink">
          {closingSentence(t, shippingCountries)}
        </p>
      </div>

      <div className="flex max-w-220 flex-col gap-4.5">
        <h1 className="font-serif text-page-title text-ink">{t.title}</h1>
        <p className="max-w-170 font-sans text-copy leading-[1.7] text-ink">{t.intro}</p>

        {areas.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 rounded-card border border-sand-200 bg-card px-6.5 py-10 text-center">
            <Icon name="truck" size={34} className="text-olive" />
            <span className="font-serif text-card-title-sm text-ink">{t.empty.title}</span>
            <span className="font-sans text-note leading-relaxed text-ink">{t.empty.body}</span>
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-sans text-eyebrow-xs text-terracotta uppercase">{t.listEyebrow}</h2>
              <span className="font-sans text-note font-semibold text-ink">
                {placeCount(t, areas.reduce((sum, area) => sum + area.places.length, 0))}
              </span>
            </div>
            {areas.map((area) => (
              <AreaCard
                key={area.country}
                area={area}
                name={t.countries[area.country]}
                count={placeCount(t, area.places.length)}
                open={closed[area.country] !== true}
                onToggle={() => setClosed((current) => ({ ...current, [area.country]: !current[area.country] }))}
              />
            ))}
          </>
        )}
      </div>
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

/** Ülke kartı: başlıkta yer sayısı, açıkken yerler dört sütunda; satırlar eşit hizalı ki göz satırı izleyebilsin. */
function AreaCard({ area, name, count, open, onToggle }: AreaCardProps) {
  const lastRow = lastRowStart(area.places.length, COLUMNS);

  return (
    <div className="rounded-card border border-sand-200 bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center gap-3 rounded-card px-5.5 py-4 text-left transition-colors hover:bg-sand-25"
      >
        <span className="flex-1 font-serif text-card-title text-ink">{name}</span>
        <span className="font-sans text-note font-semibold text-ink">{count}</span>
        <span aria-hidden className="w-3.5 text-center font-sans text-copy font-bold text-ink">
          {open ? '–' : '+'}
        </span>
      </button>
      {open && (
        <ul className="grid grid-cols-4 gap-x-5.5 border-t-[1.5px] border-dashed border-sand-400 px-5.5 pb-1.5">
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
