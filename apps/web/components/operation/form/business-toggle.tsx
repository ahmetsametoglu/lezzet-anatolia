'use client';

import { BUSINESS_LABELS } from '@lezzet/types';
import { BUSINESS_FILTERS, type BusinessFilter } from '@/lib/business-filter';
import { MultiToggle } from './multi-toggle';

interface BusinessToggleProps {
  value: BusinessFilter;
  onChange: (value: BusinessFilter) => void;
}

/** Başlıktaki iş anahtarı; Tümü iki işi birlikte okur. */
export function BusinessToggle({ value, onChange }: BusinessToggleProps) {
  return (
    <MultiToggle
      value={value}
      onChange={onChange}
      options={BUSINESS_FILTERS.map((business) => ({ key: business, label: business === 'all' ? 'Tümü' : BUSINESS_LABELS[business] }))}
    />
  );
}
