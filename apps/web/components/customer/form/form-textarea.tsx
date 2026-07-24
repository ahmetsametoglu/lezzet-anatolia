'use client';

import type { ReactNode } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { FormTextareaField } from './form-textarea-field';

/** RHF form textarea — sunum `FormTextareaField`'e devredilir; bu adaptör yalnız Controller köprüsü. */
interface FormTextareaProps<TFieldValues extends FieldValues> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<TFieldValues, any, any>;
  name: FieldPath<TFieldValues>;
  label: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  rows?: number;
  hideLabel?: boolean;
  labelAside?: ReactNode;
  className?: string;
}

export function FormTextarea<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  required,
  disabled,
  rows = 4,
  hideLabel,
  labelAside,
  className,
}: FormTextareaProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormTextareaField
          label={label}
          hideLabel={hideLabel}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          rows={rows}
          labelAside={labelAside}
          className={className}
          error={fieldState.error?.message}
          id={field.name}
          name={field.name}
          textareaRef={field.ref}
          onBlur={field.onBlur}
          value={field.value ?? ''}
          onChange={(e) => field.onChange(e.target.value)}
        />
      )}
    />
  );
}
