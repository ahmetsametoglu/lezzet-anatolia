'use client';

import { CountryEnum, type Country } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import addressCopy from '@lezzet/i18n/customer/address';
import { Chip } from '@/components/customer/phone-kit/chip';
import { ChoiceChip } from '@/components/customer/ui/choice-chip';
import placeCopy from './place-messages.json';

interface CountryChoiceProps {
  locale: Locale;
  value: Country | null;
  onChange: (country: Country) => void;
  /** Telefon native'in çiplerini üstbaşlıkla çizer; masaüstü pencere başlıksız segment çiplerdir. */
  compact?: boolean;
}

/** Ülke koddan önce seçilir, çünkü aynı kod iki ülkede geçerli olabilir ve öneri, doğrulama ve yer çözümü seçilen ülkede yapılır. */
export function CountryChoice({ locale, value, onChange, compact = false }: CountryChoiceProps) {
  const places = placeCopy[locale];
  const labelOf = (code: Country) => (code === 'DE' ? places.countryDE : places.countryFR);

  if (!compact) {
    return (
      <div className="flex gap-2">
        {CountryEnum.options.map((code) => (
          <ChoiceChip key={code} size="segment" label={labelOf(code)} active={value === code} onSelect={() => onChange(code)} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="font-sans text-eyebrow-xs text-terracotta uppercase">{addressCopy[locale].form.countryLabel}</span>
      <div className="flex gap-2">
        {CountryEnum.options.map((code) => (
          <Chip key={code} grow label={labelOf(code)} selected={value === code} onClick={() => onChange(code)} />
        ))}
      </div>
    </div>
  );
}
