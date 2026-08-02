import type { ReactNode } from 'react';
import { CONTROL_H, type ControlSize } from '../ui/control';

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
      <label htmlFor={fieldId} className="flex items-center justify-between font-ops-body text-ops-xs text-ops-body">
        <span>
          {label}
          {required ? <span className="text-ops-red-dot"> *</span> : null}
        </span>
        {labelAside ? <span className="font-ops-body text-ops-xs text-ops-faint">{labelAside}</span> : null}
      </label>
      {children}
      {error ? (
        <p id={fieldId ? `${fieldId}-error` : undefined} role="alert" className="font-ops-body text-ops-xs font-semibold text-ops-red">
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

// `trailing`: kutunun İÇİNE bir eylem oturduğunda sağ dolgu — boyutla birlikte yaşar, çağıran
// kendi payını uydurmaz. Yazı düğmenin altına girmesin diye dolgu HER ZAMAN ayrılır (düğme gizliyken de).
// Sağ dolgu KARE eylemi taşır: kutunun iç yüksekliği kadar genişlik + kenar boşluğu.
//
// Yükseklik burada YOK, `CONTROL_H`'de: bir metin kutusu yanındaki `Select` ve altındaki düğmeyle aynı
// hizada durmalı ve o ölçü hepsinin ortak kararı (`ui/control.ts`). Burada yalnız köşe, yatay dolgu ve
// yazı kademesi var. Çok satırlı alanlar (`multiline`) o yükseklikten MUAF — bir textarea'nın boyunu
// `rows` belirler; sabit yükseklik onu tek satıra hapsederdi. Muafiyette dikey dolgu geri gelir.
const CONTROL_SIZE: Record<ControlSize, { base: string; multiline: string; trailing: string }> = {
  md: { base: 'rounded-ops-card px-[13px] text-ops-base', multiline: 'py-[7px]', trailing: 'pr-[38px]' },
  sm: { base: 'rounded-md px-2 text-ops-sm', multiline: 'py-1.5', trailing: 'pr-[32px]' },
};

/** Input/textarea/select ortak görünümü (ops token'ları). `error` çerçeveyi kırmızıya çeker. TEK KAYNAK. */
export function controlClass(
  error?: string,
  opts?: { size?: ControlSize; mono?: boolean; extra?: string; trailing?: boolean; multiline?: boolean },
): string {
  const key = opts?.size ?? 'md';
  const size = CONTROL_SIZE[key];
  return [
    'w-full border bg-ops-white text-ops-ink outline-none transition-colors focus:border-ops-olive disabled:cursor-not-allowed disabled:opacity-60',
    size.base,
    opts?.multiline ? size.multiline : CONTROL_H[key],
    // `pr-*` üretilen CSS'te `px-*`'tan sonra gelir → sağ dolguyu o kazanır (Tailwind'in kanonik sırası).
    opts?.trailing ? size.trailing : undefined,
    error ? 'border-ops-red' : 'border-ops-line-strong',
    opts?.mono ? 'font-ops-mono' : 'font-ops-body',
    opts?.extra,
  ]
    .filter(Boolean)
    .join(' ');
}
