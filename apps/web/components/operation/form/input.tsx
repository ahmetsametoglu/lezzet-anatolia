import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react';
import { FieldShell, controlClass, errorIdFor } from './field-shell';

/**
 * Operasyon metin girdileri — Komponent Envanteri O8. `Input`/`Textarea` ETİKETSİZ bare kontroller
 * (tablo içi / hızlı düzeltme); `InputField`/`TextareaField` bunları `FieldShell`'e sarar (etiket +
 * hata + aria). RHF adaptörleri (`FormInput`/`FormNumber`/`FormTextarea`) `*Field`'i sarar. Görünüm
 * `controlClass` tek kaynağından. Ham <input> yazılmaz (customer form-input-field deseninin ikizi).
 */
type InputSize = 'md' | 'sm';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  inputSize?: InputSize;
  mono?: boolean;
  error?: string;
}

export function Input({ inputSize = 'md', mono = false, error, className, ...rest }: InputProps) {
  return <input className={controlClass(error, { size: inputSize, mono, extra: className })} aria-invalid={error ? 'true' : undefined} {...rest} />;
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean;
  error?: string;
}

export function Textarea({ mono = false, error, className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={controlClass(error, { mono, extra: ['resize-none leading-[1.5]', className].filter(Boolean).join(' ') })}
      aria-invalid={error ? 'true' : undefined}
      {...rest}
    />
  );
}

// ── Etiketli, RHF'siz saf primitive'ler (FieldShell + kontrol) — RHF adaptörleri bunları sarar ──
interface InputFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: ReactNode;
  required?: boolean;
  labelAside?: ReactNode;
  error?: string;
  mono?: boolean;
  id?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** Dış sarmalayıcı (FieldShell) sınıfı — düzen için. */
  fieldClassName?: string;
}

export function InputField({ label, required, labelAside, error, mono, id, inputRef, fieldClassName, className, ...rest }: InputFieldProps) {
  const reactId = useId();
  const fieldId = id ?? reactId;
  return (
    <FieldShell fieldId={fieldId} label={label} required={required} labelAside={labelAside} error={error} className={fieldClassName}>
      <input
        id={fieldId}
        className={controlClass(error, { mono, extra: className })}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={errorIdFor(fieldId, error)}
        ref={inputRef}
        {...rest}
      />
    </FieldShell>
  );
}
