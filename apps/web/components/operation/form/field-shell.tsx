import type { ReactNode } from 'react';

/**
 * Operasyon form iskeleti — Komponent Envanteri O8. Customer `FieldShell` deseninin operasyon ikizi
 * (Veri Masası token'ları): etiket (+ `*`/`labelAside`) → kontrol → hata `<p role="alert">`. Etiket/
 * hata/aria markup'ı TEK KAYNAK; tüm `*Field` primitive'leri (input/textarea) bunu sarar. Select/
 * MultiToggle/MultiSelect gibi custom kontroller de `label`+`error` için bununla sarılabilir.
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
          {required ? <span className="text-ops-red-dot"> *</span> : null}
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
// `trailing`: kutunun İÇİNE bir eylem oturduğunda sağ dolgu — boyutla birlikte yaşar, çağıran
// kendi payını uydurmaz. Yazı düğmenin altına girmesin diye dolgu HER ZAMAN ayrılır (düğme gizliyken de).
// Sağ dolgu KARE eylemi taşır: kutunun iç yüksekliği kadar genişlik + kenar boşluğu.
const CONTROL_SIZE: Record<ControlSize, { base: string; trailing: string }> = {
  md: { base: 'rounded-ops-card px-[13px] py-[7px] text-[13.5px]', trailing: 'pr-[38px]' },
  sm: { base: 'rounded-md px-2 py-1.5 text-[12.5px]', trailing: 'pr-[32px]' },
};

/** Input/textarea/select ortak görünümü (ops token'ları). `error` çerçeveyi kırmızıya çeker. TEK KAYNAK. */
export function controlClass(
  error?: string,
  opts?: { size?: ControlSize; mono?: boolean; extra?: string; trailing?: boolean },
): string {
  const size = CONTROL_SIZE[opts?.size ?? 'md'];
  return [
    'w-full border bg-ops-white text-ops-ink outline-none transition-colors focus:border-ops-olive disabled:cursor-not-allowed disabled:opacity-60',
    size.base,
    // `pr-*` üretilen CSS'te `px-*`'tan sonra gelir → sağ dolguyu o kazanır (Tailwind'in kanonik sırası).
    opts?.trailing ? size.trailing : undefined,
    error ? 'border-ops-red' : 'border-ops-line-strong',
    opts?.mono ? 'font-ops-mono' : 'font-ops-body',
    opts?.extra,
  ]
    .filter(Boolean)
    .join(' ');
}
