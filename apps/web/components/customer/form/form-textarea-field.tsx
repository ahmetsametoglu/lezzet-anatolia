'use client';

import { useId } from 'react';
import type { ReactNode, Ref, TextareaHTMLAttributes } from 'react';
import { FieldShell, controlClass, errorIdFor, type FieldVariant } from './field-shell';

/** Saf (RHF'siz) çok satırlı alan: `FieldShell` iskeleti, en az 96 px yükseklik; textarea'nın kendi prop'ları doğrudan geçer. */
interface FormTextareaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  hideLabel?: boolean;
  /** Zorunluluk yıldızla değil, isteğe bağlı olan işaretlenerek anlatılır. */
  optional?: boolean;
  optionalLabel?: string;
  labelAside?: ReactNode;
  error?: string;
  footerAside?: ReactNode;
  variant?: FieldVariant;
  /** `short`: liste satırındaki kısa alan (85 px, native `controlMultilineShort`); varsayılan 96 px. */
  height?: 'regular' | 'short';
  id?: string;
  textareaRef?: Ref<HTMLTextAreaElement>;
}

export function FormTextareaField({
  label,
  hideLabel,
  optional, optionalLabel,
  labelAside,
  error,
  footerAside,
  variant,
  height = 'regular',
  id,
  textareaRef,
  className,
  rows = 4,
  ...rest
}: FormTextareaFieldProps) {
  const reactId = useId();
  const fieldId = id ?? reactId;

  return (
    <FieldShell
      fieldId={fieldId}
      label={label}
      hideLabel={hideLabel}
      optional={optional}
      optionalLabel={optionalLabel}
      labelAside={labelAside}
      error={error}
      footerAside={footerAside}
      variant={variant}
    >
      {/* Tek satırlık alanın sabit yüksekliği burada asgari yükseklikle ezilir; dikey ped geri gelir, çünkü çok satırlıda metni
          tarayıcı ortalamaz. */}
      <textarea
        id={fieldId}
        className={controlClass(
          Boolean(error),
          [height === 'short' ? 'min-h-21.25' : 'min-h-24', 'resize-y py-3', className].filter(Boolean).join(' '),
          variant,
        )}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={errorIdFor(fieldId, error)}
        rows={rows}
        ref={textareaRef}
        {...rest}
      />
    </FieldShell>
  );
}
