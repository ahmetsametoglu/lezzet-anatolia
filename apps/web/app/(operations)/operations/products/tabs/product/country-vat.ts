import type { MultiToggleOption } from '@/components/operation/form/multi-toggle';
import { vatRateLabel } from '@/components/operation/form/document-form/labels';
import type { ProductVatRate } from '@lezzet/types';

/** Ürün formunda seçilebilen ülke oranları: Almanya'da gıdanın indirimli oranı ve genel oran. */
export const COUNTRY_VAT_CHOICES = { DE: [7, 19] } as const satisfies Record<ProductVatRate['country'], readonly number[]>;

export type VatCountry = keyof typeof COUNTRY_VAT_CHOICES;

export const VAT_COUNTRIES = Object.keys(COUNTRY_VAT_CHOICES) as VatCountry[];

/** Seçim metindir: boş = oran yok. */
export const choiceOf = (rate: number | null): string => (rate === null ? '' : String(rate));

/**
 * Anahtarın seçenekleri; kayıtlı oran listede yoksa o da eklenir, yoksa anahtar onu "yok" diye gösterirdi. Yeni üründe kapalıdır, çünkü
 * oranın kapısı ürünün kimliğini ister.
 */
export function countryVatOptions(country: VatCountry, saved: number | null, locked: boolean): Array<MultiToggleOption<string>> {
  const rates: number[] = [...COUNTRY_VAT_CHOICES[country]];
  if (saved !== null && !rates.includes(saved)) rates.push(saved);
  return [
    { key: '', label: 'yok', title: 'Oran yok: ürün bu ülkenin tüketicisine satılmaz', disabled: locked },
    ...rates.map((rate) => ({
      key: String(rate),
      label: vatRateLabel(rate),
      title: 'Bu ülkenin tüketicisine uygulanan oran',
      disabled: locked,
    })),
  ];
}

/** Seçimden yazım: değişmediyse `null`; boşaltılan oran kaldırılır (`rate: null`). */
export function countryVatWrite(saved: number | null, choice: string): { rate: number | null } | null {
  const next = choice === '' ? null : Number(choice);
  return next === saved ? null : { rate: next };
}
