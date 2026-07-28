'use client';

import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { FieldShell, controlClass, errorIdFor } from './field-shell';

/**
 * Saf (RHF'siz) input primitive'i — etiket + input + hata (petitcigogne `FormInputField` deseni,
 * Lezzet token'larıyla). Hem register'lı/kontrollü hem RHF adaptörü (`FormInput`) bunu paylaşır.
 * Native input prop'ları (`value`, `onChange`, `type`, `placeholder`, `inputMode`, …) doğrudan geçer.
 * `optional` etiketin yanına "(isteğe bağlı)" yazar — K32 zorunluluğu yıldızla anlatmaz, tersini işaretler.
 */
interface FormInputFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hideLabel?: boolean;
  /** K32: zorunluluk yıldızla değil, İSTEĞE BAĞLI olanı işaretleyerek anlatılır. */
  optional?: boolean;
  optionalLabel?: string;
  labelAside?: ReactNode;
  error?: string;
  id?: string;
  inputRef?: Ref<HTMLInputElement>;
}

export function FormInputField({ label, hideLabel, optional, optionalLabel, labelAside, error, id, inputRef, className, ...rest }: FormInputFieldProps) {
  const reactId = useId();
  const fieldId = id ?? reactId;

  return (
    <FieldShell fieldId={fieldId} label={label} hideLabel={hideLabel} optional={optional} optionalLabel={optionalLabel} labelAside={labelAside} error={error}>
      <input
        id={fieldId}
        className={controlClass(error, className)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={errorIdFor(fieldId, error)}
        ref={inputRef}
        {...rest}
      />
    </FieldShell>
  );
}
