'use client';

import type { ReactNode } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { FormInputField } from './form-input-field';

/**
 * RHF form input — sunum/markup `FormInputField` primitivine devredilir; bu adaptör yalnız
 * RHF köprüsü (Controller) sağlar. Sayılar için `FormNumber` kullanılır (boş→NaN tuzağı yok).
 */
interface FormInputProps<TFieldValues extends FieldValues> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<TFieldValues, any, any>;
  name: FieldPath<TFieldValues>;
  label: string;
  type?: 'text' | 'email' | 'password' | 'tel' | 'url';
  placeholder?: string;
  optional?: boolean;
  optionalLabel?: string;
  autoComplete?: string;
  disabled?: boolean;
  hideLabel?: boolean;
  labelAside?: ReactNode;
  className?: string;
  autoFocus?: boolean;
}

export function FormInput<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  type = 'text',
  placeholder,
  optional, optionalLabel,
  autoComplete,
  disabled,
  hideLabel,
  labelAside,
  className,
  autoFocus,
}: FormInputProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormInputField
          label={label}
          hideLabel={hideLabel}
          optional={optional} optionalLabel={optionalLabel}
          labelAside={labelAside}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          autoFocus={autoFocus}
          className={className}
          error={fieldState.error?.message}
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
