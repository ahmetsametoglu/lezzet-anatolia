'use client';

import type { ReactNode } from 'react';

/**
 * Form alanlarının ortak iskeleti (base): etiket (+`*`/aside) → kontrol → hata metni.
 * Tüm `*Field` primitifleri (input/textarea/select) bunu sarar → etiket/hata markup'ı tek kaynak.
 * `hideLabel` etiketi görsel gizler (sr-only) — placeholder-yalnız tasarımlar için (ör. login).
 */
interface FieldShellProps {
  fieldId: string;
  label: string;
  hideLabel?: boolean;
  required?: boolean;
  labelAside?: ReactNode;
  error?: string;
  children: ReactNode;
}

export function FieldShell({ fieldId, label, hideLabel, required, labelAside, error, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className={hideLabel ? 'sr-only' : 'flex items-center justify-between font-sans text-body-sm font-medium text-ink'}
      >
        <span>
          {label}
          {required && <span className="text-terracotta-bright"> *</span>}
        </span>
        {labelAside && <span className="text-note font-normal text-muted">{labelAside}</span>}
      </label>

      {children}

      {error && (
        <p className="font-sans text-note font-semibold text-terracotta-bright" id={`${fieldId}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** `${fieldId}-error` — kontrolün `aria-describedby`'ı ile FieldShell'in hata `<p>`'si aynı id'yi paylaşır. */
export function errorIdFor(fieldId: string, error?: string): string | undefined {
  return error ? `${fieldId}-error` : undefined;
}

/** Input/textarea/select ortak görünümü (Lezzet token'ları). `error` çerçeveyi kırmızıya çeker. */
export function controlClass(error?: string, extra?: string): string {
  return [
    'w-full rounded-2xl border-2 bg-white px-4 py-3 font-sans text-body text-ink outline-none transition-colors placeholder:text-sand-600 focus:border-olive disabled:cursor-not-allowed disabled:opacity-60',
    error ? 'border-terracotta-bright' : 'border-sand-400',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}
