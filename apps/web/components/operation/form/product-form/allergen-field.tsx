'use client';

import type { ReactNode } from 'react';
import { Controller, type Control } from 'react-hook-form';
import type { ProductAllergen } from '@lezzet/types';
import { FieldShell } from '@/components/operation/form/field-shell';
import { MultiSelect } from '@/components/operation/form/multi-select';
import { ToggleField } from '@/components/operation/form/toggle';
import type { ProductFormValues } from './schema';

interface AllergenFieldProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<ProductFormValues, any, any>;
  options: Array<{ value: ProductAllergen; label: string }>;
  labelAside?: ReactNode;
}

/**
 * Alerjen beyanı üç hâllidir: `null` girilmedi, boş liste "alerjen içermez", dolu liste ürünün içerdikleri.
 * Seçimi boşaltmak "girilmedi"ye döner; "içermez" yalnız anahtarla verilir ki beyan kazara doğmasın.
 */
export function AllergenField({ control, options, labelAside }: AllergenFieldProps) {
  return (
    <Controller
      control={control}
      name="allergens"
      render={({ field }) => {
        const icermez = field.value?.length === 0;
        return (
          <FieldShell label="Alerjenler" labelAside={labelAside}>
            <MultiSelect
              options={options}
              selected={field.value ?? []}
              onChange={(next) => field.onChange(next.length > 0 ? next : null)}
              addLabel="+ alerjen seç"
              searchPlaceholder="Alerjen ara…"
              disabled={icermez}
            />
            <ToggleField bare label="Alerjen içermez" on={icermez} onChange={(on) => field.onChange(on ? [] : null)} />
          </FieldShell>
        );
      }}
    />
  );
}
