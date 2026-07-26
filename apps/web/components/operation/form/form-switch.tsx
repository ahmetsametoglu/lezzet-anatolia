'use client';

import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { ToggleField } from './toggle';

/** RHF anahtar (operasyon) — tıklanabilir etiketli ToggleField; adaptör yalnız Controller köprüsü. */
interface FormSwitchProps<T extends FieldValues> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<T, any, any>;
  name: FieldPath<T>;
  label: string;
}

export function FormSwitch<T extends FieldValues>({ control, name, label }: FormSwitchProps<T>) {
  return (
    <Controller control={control} name={name} render={({ field }) => <ToggleField label={label} on={Boolean(field.value)} onChange={field.onChange} />} />
  );
}
