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
  /**
   * Kutunun İÇİNE, sağ kenara oturan eylem (ör. AI çeviri düğmesi). Verilirse sağ dolgu ona ayrılır →
   * yazı düğmenin altına girmez. Sarmalayıcı `group` sınıfını taşır: eylem kendi görünürlüğünü
   * `group-hover` / `group-focus-within` ile kutunun hâline bağlayabilir.
   */
  trailing?: ReactNode;
}

export function Input({ inputSize = 'md', mono = false, error, trailing, className, ...rest }: InputProps) {
  const input = (
    <input
      className={controlClass(error, { size: inputSize, mono, extra: className, trailing: Boolean(trailing) })}
      aria-invalid={error ? 'true' : undefined}
      {...rest}
    />
  );
  if (!trailing) return input;
  return (
    <div className="group relative flex items-center">
      {input}
      {/* Çerçevenin İÇİNDE, 2px içeri: köşe yarıçapı boyutla değişiyor (sm 6px / md 9px), içeri
          oturan eylem kendi yarıçapıyla bunu takip etmek zorunda kalmaz. */}
      <span className="absolute inset-y-[2px] right-[2px] flex items-center">{trailing}</span>
    </div>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean;
  error?: string;
  /** Ham eleman erişimi — seçim aralığı okumak gerekiyorsa (vurgu düğmesi). `inputRef` ile aynı desen. */
  textareaRef?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ mono = false, error, className, textareaRef, ...rest }: TextareaProps) {
  return (
    <textarea
      ref={textareaRef}
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
