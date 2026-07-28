'use client';

import { useId } from 'react';
import type { FocusEventHandler, ReactNode, Ref } from 'react';
import { FieldShell, controlClass, errorIdFor } from './field-shell';

export interface FormSelectFieldOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * Saf (RHF'siz) select primitive'i. Tek seçim: native `<select>`. Çoklu seçim (`multiple`):
 * dropdown yerine chip toggle grubu — değer `string[]`. Değer köprüsü value-based
 * (`onChange(value)`), çoklu modda native event olmadığı için.
 */
interface FormSelectFieldProps {
  label: string;
  options: FormSelectFieldOption[];
  optional?: boolean;
  optionalLabel?: string;
  hideLabel?: boolean;
  labelAside?: ReactNode;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  multiple?: boolean;
  className?: string;
  id?: string;
  name?: string;
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  onBlur?: FocusEventHandler<HTMLSelectElement>;
  selectRef?: Ref<HTMLSelectElement>;
}

export function FormSelectField({
  label,
  options,
  optional, optionalLabel,
  hideLabel,
  labelAside,
  error,
  disabled,
  placeholder = 'Seçiniz…',
  multiple,
  className,
  id,
  name,
  value,
  onChange,
  onBlur,
  selectRef,
}: FormSelectFieldProps) {
  const reactId = useId();
  const fieldId = id ?? reactId;

  if (multiple) {
    const selected = Array.isArray(value) ? value : [];
    const toggle = (v: string) => {
      const isOn = selected.includes(v);
      onChange?.(isOn ? selected.filter((x) => x !== v) : [...selected, v]);
    };
    return (
      <FieldShell fieldId={fieldId} label={label} hideLabel={hideLabel} optional={optional} optionalLabel={optionalLabel} labelAside={labelAside} error={error}>
        <div className="flex flex-wrap gap-1.5">
          {options.map((opt) => {
            const on = selected.includes(opt.value);
            const isDisabled = disabled || opt.disabled;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={isDisabled}
                onClick={() => toggle(opt.value)}
                aria-pressed={on}
                className={[
                  'cursor-pointer rounded-pill border px-3 py-1.5 font-sans text-note font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  on ? 'border-olive bg-olive text-white' : 'border-sand-400 bg-white text-body hover:border-olive',
                ].join(' ')}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </FieldShell>
    );
  }

  return (
    <FieldShell fieldId={fieldId} label={label} hideLabel={hideLabel} optional={optional} optionalLabel={optionalLabel} labelAside={labelAside} error={error}>
      <select
        id={fieldId}
        className={controlClass(error, ['cursor-pointer', className].filter(Boolean).join(' '))}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={errorIdFor(fieldId, error)}
        disabled={disabled}
        name={name}
        ref={selectRef}
        onBlur={onBlur}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange?.(e.target.value)}
      >
        <option value="" disabled hidden>
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
