'use client';

import type { ReactNode } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { InputField } from './input';

/**
 * RHF metin/sayı girdileri (operasyon) — customer deseninin ikizi. Sunum `InputField`'e devredilir;
 * bu adaptörler yalnız `Controller` köprüsüdür. `FormNumber` boş girdiyi null'a yazar (NaN tuzağı yok);
 * `FormInput` düz metin. İkisi de `control`+`name` sürücülü.
 */

interface FormInputProps<T extends FieldValues> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<T, any, any>;
  name: FieldPath<T>;
  label: ReactNode;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  mono?: boolean;
  labelAside?: ReactNode;
  fieldClassName?: string;
}

export function FormInput<T extends FieldValues>({ control, name, label, placeholder, required, disabled, mono, labelAside, fieldClassName }: FormInputProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <InputField
          label={label}
          required={required}
          labelAside={labelAside}
          error={fieldState.error?.message}
          mono={mono}
          placeholder={placeholder}
          disabled={disabled}
          fieldClassName={fieldClassName}
          id={field.name}
          name={field.name}
          inputRef={field.ref}
          onBlur={field.onBlur}
          value={field.value ?? ''}
          onChange={(e) => field.onChange(e.target.value)}
        />
      )}
    />
  );
}
interface FormNumberProps<T extends FieldValues> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<T, any, any>;
  name: FieldPath<T>;
  label: ReactNode;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Tam sayı zorlaması (parseInt). Varsayılan ondalık (Number). */
  integer?: boolean;
  labelAside?: ReactNode;
  fieldClassName?: string;
}

export function FormNumber<T extends FieldValues>({ control, name, label, placeholder, required, disabled, integer, labelAside, fieldClassName }: FormNumberProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <InputField
          label={label}
          required={required}
          labelAside={labelAside}
          error={fieldState.error?.message}
          type="number"
          inputMode={integer ? 'numeric' : 'decimal'}
          mono
          placeholder={placeholder}
          disabled={disabled}
          fieldClassName={fieldClassName}
          id={field.name}
          name={field.name}
          inputRef={field.ref}
          onBlur={field.onBlur}
          value={field.value ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') return field.onChange(null);
            const parsed = integer ? parseInt(raw, 10) : Number(raw);
            field.onChange(Number.isNaN(parsed) ? null : parsed);
          }}
        />
      )}
    />
  );
}
