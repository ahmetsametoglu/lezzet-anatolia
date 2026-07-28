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
  /** K32: zorunluluk yıldızla değil, İSTEĞE BAĞLI olanı işaretleyerek anlatılır. */
  optional?: boolean;
  optionalLabel?: string;
  labelAside?: ReactNode;
  error?: string;
  id?: string;
  textareaRef?: Ref<HTMLTextAreaElement>;
}

export function FormTextareaField({
  label,
  hideLabel,
  optional, optionalLabel,
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
    <FieldShell fieldId={fieldId} label={label} hideLabel={hideLabel} optional={optional} optionalLabel={optionalLabel} labelAside={labelAside} error={error}>
      {/* Tek satırlık alanın sabit 48px'i burada `min-h-24` ile ezilir; dikey ped geri gelir
          (input'ta metni tarayıcı ortalıyor, çok satırlıda ortalayacak bir şey yok). */}
      <textarea
        id={fieldId}
        className={controlClass(error, ['min-h-24 resize-y py-3', className].filter(Boolean).join(' '))}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={errorIdFor(fieldId, error)}
        rows={rows}
        ref={textareaRef}
        {...rest}
      />
    </FieldShell>
  );
}
