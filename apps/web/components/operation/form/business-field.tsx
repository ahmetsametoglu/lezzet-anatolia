'use client';

import { BUSINESS_LABELS, BusinessEnum, type Business } from '@lezzet/types';
import { MultiToggle } from './multi-toggle';

/** İş seçicisinin seçenekleri; belge formu ve varsayılan iş seçicileri aynı listeyi okur. */
export const BUSINESS_OPTIONS = BusinessEnum.options.map((business) => ({ value: business, label: BUSINESS_LABELS[business] }));

/** Varsayılan iş seçicisinin seçenekleri; boş değer "ikisi de"dir ve kayıtta `null` olur. */
export const DEFAULT_BUSINESS_OPTIONS = [...BUSINESS_OPTIONS, { value: '', label: 'İkisi de' }];

/** "İkisi de" seçeneğinin anahtarı; kayıtta varsayılan işin boş olmasıdır. */
const BOTH = 'both';

interface DefaultBusinessToggleProps {
  value: Business | null | undefined;
  onChange: (value: Business | null) => void;
  label: string;
}

/** Karşı tarafın varsayılan işi: iki işten biri ya da "ikisi de"; ikisi de seçiliyse belge girişi işi sorar. */
export function DefaultBusinessToggle({ value, onChange, label }: DefaultBusinessToggleProps) {
  return (
    <MultiToggle
      value={value ?? BOTH}
      onChange={(next) => onChange(next === BOTH ? null : next)}
      label={label}
      options={[...BUSINESS_OPTIONS.map(({ value: key, label: text }) => ({ key, label: text })), { key: BOTH, label: 'İkisi de' }]}
    />
  );
}
