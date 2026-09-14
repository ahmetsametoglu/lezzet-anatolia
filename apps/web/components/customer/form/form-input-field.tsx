'use client';

import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { FieldShell, controlClass, errorIdFor, type FieldVariant } from './field-shell';

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
  /** Çizim — `form` (K34) ya da `inline` (v1 yer paneli); bkz. `FieldVariant`. */
  variant?: FieldVariant;
  /** Kutunun içinde, solda duran ikon (v1 adres araması: büyüteç) — yalnız görsel, adı etiket verir. */
  icon?: ReactNode;
  id?: string;
  inputRef?: Ref<HTMLInputElement>;
}

export function FormInputField({ label, hideLabel, optional, optionalLabel, labelAside, error, invalid, variant, icon, id, inputRef, className, ...rest }: FormInputFieldProps) {
  const reactId = useId();
  const fieldId = id ?? reactId;
  const isInvalid = Boolean(error) || Boolean(invalid);

  const input = (
    <input
      id={fieldId}
      // İkonlu kutuda metin ikonun sağından başlar; `!` çünkü `controlClass`ın `px-4`ü aynı kenarı yazıyor.
      className={controlClass(isInvalid, icon ? ['!pl-11', className].filter(Boolean).join(' ') : className, variant)}
      aria-invalid={isInvalid ? 'true' : undefined}
      aria-describedby={errorIdFor(fieldId, error)}
      ref={inputRef}
      {...rest}
    />
  );

  return (
    <FieldShell
      fieldId={fieldId}
      label={label}
      hideLabel={hideLabel}
      optional={optional}
      optionalLabel={optionalLabel}
      labelAside={labelAside}
      error={error}
      variant={variant}
    >
      {icon ? (
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-4 flex -translate-y-1/2 text-muted">
            {icon}
          </span>
          {input}
        </div>
      ) : (
        input
      )}
    </FieldShell>
  );
}
