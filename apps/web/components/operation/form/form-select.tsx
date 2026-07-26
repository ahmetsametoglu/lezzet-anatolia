'use client';

import type { ReactNode } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { FieldShell } from './field-shell';
import { Select, type SelectOption } from './select';

/** RHF select (operasyon) — FieldShell + Select; adaptör yalnız Controller köprüsü. */
interface FormSelectProps<T extends FieldValues> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<T, any, any>;
  name: FieldPath<T>;
  label: ReactNode;
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
  labelAside?: ReactNode;
}

export function FormSelect<T extends FieldValues>({ control, name, label, options, placeholder, required, labelAside }: FormSelectProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell label={label} required={required} labelAside={labelAside} error={fieldState.error?.message}>
          <Select value={field.value ?? ''} onChange={field.onChange} options={options} placeholder={placeholder} />
        </FieldShell>
      )}
    />
  );
}
