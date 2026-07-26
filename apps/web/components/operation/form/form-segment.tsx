'use client';

import type { ReactNode } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { FieldShell } from './field-shell';
import { Segment } from './segment';

/** RHF segment (operasyon) — FieldShell + Segment; kısa kapalı listeler (KDV, tarih tipi). */
interface FormSegmentProps<T extends FieldValues, V extends string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<T, any, any>;
  name: FieldPath<T>;
  label: ReactNode;
  options: Array<{ key: V; label: string }>;
  required?: boolean;
}

export function FormSegment<T extends FieldValues, V extends string>({ control, name, label, options, required }: FormSegmentProps<T, V>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell label={label} required={required} error={fieldState.error?.message}>
          <Segment value={field.value as V} onChange={field.onChange} options={options} />
        </FieldShell>
      )}
    />
  );
}
