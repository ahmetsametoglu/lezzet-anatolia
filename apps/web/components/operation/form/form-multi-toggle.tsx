'use client';

import type { ReactNode } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { FieldShell } from './field-shell';
import { MultiToggle, type MultiToggleOption } from './multi-toggle';

/** RHF çok durumlu anahtar (operasyon) — FieldShell + MultiToggle; KDV, tarih tipi, satış durumu. */
interface FormMultiToggleProps<T extends FieldValues, V extends string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<T, any, any>;
  name: FieldPath<T>;
  label: ReactNode;
  options: Array<MultiToggleOption<V>>;
  required?: boolean;
  /** Alt bar gibi dar yerlerde: FieldShell yok, etiket anahtarın SOLUNDA tek satırda (FormSwitch deseni). */
  bare?: boolean;
  className?: string;
}

export function FormMultiToggle<T extends FieldValues, V extends string>({
  control,
  name,
  label,
  options,
  required,
  bare,
  className,
}: FormMultiToggleProps<T, V>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        // `bare`'de görünür etiket var ama FieldShell'in `for` bağı yok → erişilebilirlik adını
        // doğrudan gruba veriyoruz (etiket düz metinse).
        const toggle = (
          <MultiToggle
            value={field.value as V}
            onChange={field.onChange}
            options={options}
            size={bare ? 'sm' : 'md'}
            label={typeof label === 'string' ? label : undefined}
            className={className}
          />
        );
        if (bare) {
          return (
            <div className="flex items-center gap-2.5">
              <span className="font-ops-display text-[11.5px] font-semibold text-ops-muted">{label}</span>
              {toggle}
            </div>
          );
        }
        return (
          <FieldShell label={label} required={required} error={fieldState.error?.message}>
            {toggle}
          </FieldShell>
        );
      }}
    />
  );
}
