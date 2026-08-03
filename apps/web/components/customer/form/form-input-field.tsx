'use client';

import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { FieldShell, controlClass, errorIdFor } from './field-shell';

/**
 * Saf (RHF'siz) input primitive'i — etiket + input + hata (petitcigogne `FormInputField` deseni,
 * Lezzet token'larıyla). Hem kontrollü kullanım hem react-hook-form `register()` yayılımı bunu
 * doğrudan kullanır: **müşteri yüzeyinde ayrı bir RHF adaptör katmanı YOKTUR** (K4 · 02.08 —
 * `FormInput`/`FormSelect`/`FormNumber`/`FormSwitch` hiç tüketilmeden duruyordu, silindi).
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
  /**
   * Cümlesiz geçersizlik: kırmızı çerçeve + `aria-invalid`, ama alanın altında metin YOK.
   * Alan alan cümle yazmayan, kırmızıları işaretleyip tek bir özet satır koyan formlar için
   * (gerekçe `controlClass` künyesinde). `error` verilmişse o zaten geçersizlik demektir.
   */
  invalid?: boolean;
  id?: string;
  inputRef?: Ref<HTMLInputElement>;
}

export function FormInputField({ label, hideLabel, optional, optionalLabel, labelAside, error, invalid, id, inputRef, className, ...rest }: FormInputFieldProps) {
  const reactId = useId();
  const fieldId = id ?? reactId;
  const isInvalid = Boolean(error) || Boolean(invalid);

  return (
    <FieldShell fieldId={fieldId} label={label} hideLabel={hideLabel} optional={optional} optionalLabel={optionalLabel} labelAside={labelAside} error={error}>
      <input
        id={fieldId}
        className={controlClass(isInvalid, className)}
        aria-invalid={isInvalid ? 'true' : undefined}
        aria-describedby={errorIdFor(fieldId, error)}
        ref={inputRef}
        {...rest}
      />
    </FieldShell>
  );
}
