'use client';

import type { ReactNode } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { FormSelectField, type FormSelectFieldOption } from './form-select-field';

export type FormSelectOption = FormSelectFieldOption;

/**
 * RHF form select — sunum `FormSelectField`'e devredilir; bu adaptör yalnız Controller köprüsü.
 * `multiple`: form değeri `string[]`, dropdown yerine chip toggle grubu.
 */
interface FormSelectProps<TFieldValues extends FieldValues> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<TFieldValues, any, any>;
  name: FieldPath<TFieldValues>;
  label: string;
  options: FormSelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  hideLabel?: boolean;
  labelAside?: ReactNode;
  multiple?: boolean;
  className?: string;
}

export function FormSelect<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  options,
  placeholder,
  required,
  disabled,
  hideLabel,
  labelAside,
  multiple,
  className,
}: FormSelectProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormSelectField
          label={label}
          options={options}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          hideLabel={hideLabel}
          labelAside={labelAside}
          multiple={multiple}
          className={className}
          error={fieldState.error?.message}
          id={field.name}
          name={field.name}
          selectRef={field.ref}
          onBlur={field.onBlur}
          value={field.value}
          onChange={(v) => field.onChange(v)}
        />
      )}
    />
  );
}
