'use client';

import { useId } from 'react';
import type { ReactNode, Ref, TextareaHTMLAttributes } from 'react';
import { FieldShell, controlClass, errorIdFor } from './field-shell';

/**
 * Saf (RHF'siz) textarea primitive'i — `FieldShell` + `min-h-24` (96px) alan. `rows` (default 4)
 * attribute olarak da iletilir. Native textarea prop'ları (`value`, `onChange`, …) doğrudan geçer.
 */
interface FormTextareaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  hideLabel?: boolean;
  labelAside?: ReactNode;
  error?: string;
  id?: string;
  textareaRef?: Ref<HTMLTextAreaElement>;
}

export function FormTextareaField({
  label,
  hideLabel,
  required,
  labelAside,
  error,
  id,
  textareaRef,
  className,
  rows = 4,
  ...rest
}: FormTextareaFieldProps) {
  const reactId = useId();
  const fieldId = id ?? reactId;

  return (
    <FieldShell fieldId={fieldId} label={label} hideLabel={hideLabel} required={required} labelAside={labelAside} error={error}>
      <textarea
        id={fieldId}
        className={controlClass(error, ['min-h-24 resize-y', className].filter(Boolean).join(' '))}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={errorIdFor(fieldId, error)}
        rows={rows}
        ref={textareaRef}
        {...rest}
      />
    </FieldShell>
  );
}
