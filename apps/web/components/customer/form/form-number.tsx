'use client';

import type { ReactNode } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { FormInputField } from './form-input-field';

/**
 * RHF sayı input'u — `FormInputField`'i temel alır ama boş değeri AÇIK yönetir: boş→NaN tuzağı
 * YOK; boş girdi `emptyValue`'ya (default null) yazılır. Para için ayrı bir kol gelecek;
 * genel tam sayı/ondalık bu adaptörle.
 */
interface FormNumberProps<TFieldValues extends FieldValues> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<TFieldValues, any, any>;
  name: FieldPath<TFieldValues>;
  label: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Tam sayı zorlaması (parseInt). */
  integer?: boolean;
  /** Alan boşaltılınca yazılacak değer — asla NaN. Default null. */
  emptyValue?: number | null;
  hideLabel?: boolean;
  labelAside?: ReactNode;
  className?: string;
  autoFocus?: boolean;
}

export function FormNumber<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  required,
  disabled,
  placeholder,
  min,
  max,
  step,
  integer,
  emptyValue = null,
  hideLabel,
  labelAside,
  className,
  autoFocus,
}: FormNumberProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormInputField
          label={label}
          hideLabel={hideLabel}
          required={required}
          labelAside={labelAside}
          type="number"
          inputMode={integer ? 'numeric' : 'decimal'}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          autoFocus={autoFocus}
          className={className}
          error={fieldState.error?.message}
          id={field.name}
          name={field.name}
          inputRef={field.ref}
          onBlur={field.onBlur}
          value={field.value ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              field.onChange(emptyValue);
              return;
            }
            const parsed = integer ? parseInt(raw, 10) : Number(raw);
            field.onChange(Number.isNaN(parsed) ? emptyValue : parsed);
          }}
        />
      )}
    />
  );
}
