import type { ReactNode } from 'react';

/**
 * Operasyon form iskeleti — Komponent Envanteri O8. Customer `FieldShell` deseninin operasyon ikizi
 * (Veri Masası token'ları): etiket (+ `*`/`labelAside`) → kontrol → hata `<p role="alert">`. Etiket/
 * hata/aria markup'ı TEK KAYNAK; tüm `*Field` primitive'leri (input/textarea) bunu sarar. Select/
 * Segment/MultiSelect gibi custom kontroller de `label`+`error` için bununla sarılabilir.
 */
interface FieldShellProps {
  fieldId?: string;
  label: ReactNode;
  required?: boolean;
  labelAside?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}

export function FieldShell({ fieldId, label, required, labelAside, error, children, className }: FieldShellProps) {
  return (
    <div className={['flex flex-col gap-1.5', className].filter(Boolean).join(' ')}>
      <label htmlFor={fieldId} className="flex items-center justify-between font-ops-body text-[11.5px] text-ops-body">
        <span>
          {label}
          {required ? <span className="text-[#b0561f]"> *</span> : null}
        </span>
        {labelAside ? <span className="font-ops-body text-[11px] text-ops-faint">{labelAside}</span> : null}
      </label>
      {children}
      {error ? (
        <p id={fieldId ? `${fieldId}-error` : undefined} role="alert" className="font-ops-body text-[11px] font-semibold text-ops-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Kontrolün `aria-describedby`'ı ile FieldShell'in hata `<p>`'si aynı id'yi paylaşır. */
export function errorIdFor(fieldId: string, error?: string): string | undefined {
  return error ? `${fieldId}-error` : undefined;
}

type ControlSize = 'md' | 'sm';
const CONTROL_SIZE: Record<ControlSize, string> = {
  md: 'rounded-[9px] px-[13px] py-[7px] text-[13.5px]',
  sm: 'rounded-md px-2 py-1.5 text-[12.5px]',
};

/** Input/textarea/select ortak görünümü (ops token'ları). `error` çerçeveyi kırmızıya çeker. TEK KAYNAK. */
export function controlClass(error?: string, opts?: { size?: ControlSize; mono?: boolean; extra?: string }): string {
  return [
    'w-full border bg-white text-ops-ink outline-none transition-colors focus:border-ops-olive disabled:cursor-not-allowed disabled:opacity-60',
    CONTROL_SIZE[opts?.size ?? 'md'],
    error ? 'border-ops-red' : 'border-ops-line-strong',
    opts?.mono ? 'font-ops-mono' : 'font-ops-body',
    opts?.extra,
  ]
    .filter(Boolean)
    .join(' ');
}
