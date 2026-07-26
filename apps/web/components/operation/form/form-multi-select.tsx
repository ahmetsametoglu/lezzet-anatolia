'use client';

import type { ReactNode } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { FieldShell } from './field-shell';
import { MultiSelect } from './multi-select';

/** RHF çoklu seçim (operasyon) — FieldShell + autocomplete'li MultiSelect. Değer `V[]`. */
interface FormMultiSelectProps<T extends FieldValues, V extends string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<T, any, any>;
  name: FieldPath<T>;
  label: ReactNode;
  options: Array<{ value: V; label: string }>;
  addLabel?: string;
  searchPlaceholder?: string;
  labelAside?: ReactNode;
  required?: boolean;
}

export function FormMultiSelect<T extends FieldValues, V extends string>({ control, name, label, options, addLabel, searchPlaceholder, labelAside, required }: FormMultiSelectProps<T, V>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell label={label} required={required} labelAside={labelAside} error={fieldState.error?.message}>
          <MultiSelect
            options={options}
            selected={(field.value ?? []) as V[]}
            onChange={field.onChange}
            addLabel={addLabel}
            searchPlaceholder={searchPlaceholder}
          />
        </FieldShell>
      )}
    />
  );
}
