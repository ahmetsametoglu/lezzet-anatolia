'use client';

import type { ReactNode } from 'react';

/**
 * `form` formların alanı; `inline` ve `sheet` yer panelinin ve çekmecesinin satır içi alanı (çekmecede zemin beyaz, çünkü çekmece
 * kremdir); `pill` ve `soft` telefonun alanları, native `TextField`ın iki biçiminin (`shape`) ölçüsüyle.
 */
export type FieldVariant = 'form' | 'inline' | 'sheet' | 'pill' | 'soft';

/** Alanların ortak iskeleti (etiket → kontrol → hata), ki etiket ve hata işaretlemesi tek yerde dursun; `hideLabel` etiketi yalnız görselden gizler. */
interface FieldShellProps {
  fieldId: string;
  label: string;
  hideLabel?: boolean;
  /** İsteğe bağlı alanı işaretler; zorunluluk yıldızla anlatılmadığı için `required` bayrağının görünür bir karşılığı olmazdı. */
  optional?: boolean;
  /** "(isteğe bağlı)" metni — sayfanın kendi dilinden gelir, primitif metin taşımaz. */
  optionalLabel?: string;
  labelAside?: ReactNode;
  error?: string;
  /** Çizim — künyenin biçimi buna bağlı (`FieldVariant`). */
  variant?: FieldVariant;
  children: ReactNode;
}

export function FieldShell({ fieldId, label, hideLabel, optional, optionalLabel, labelAside, error, variant = 'form', children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        // Etiket girdiden bir punto küçük, çünkü etiket künye, girdi içeriktir.
        className={
          hideLabel
            ? 'sr-only'
            : variant === 'inline' || variant === 'sheet'
              ? 'flex items-center justify-between font-sans text-eyebrow-sm font-bold text-muted uppercase'
              : 'flex items-center justify-between font-sans text-field-label text-body'
        }
      >
        <span>
          {label}
          {/* Zorunluluk yıldızla anlatılmaz: alanların çoğu zorunlu olduğu için yıldız gürültüye dönüşür, merak edilen hangisinin boş
              bırakılabileceğidir. */}
          {optional && <span className="font-normal text-muted"> {optionalLabel}</span>}
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

/**
 * Çizime göre değişen gövde; yan dolgu da burada, çünkü Tailwind çakışan iki sınıfı dizgideki sıraya göre değil kaynak sırasına göre
 * çözer ve ortak satırdaki dolgu ezilemezdi.
 */
const CONTROL: Record<FieldVariant, string> = {
  form: 'h-12 rounded-soft bg-card px-4 text-copy',
  inline: 'h-10.5 rounded-xl bg-cream px-4 text-body-sm font-semibold',
  sheet: 'h-10.5 rounded-xl bg-card px-4 text-control font-semibold',
  pill: 'h-12.5 rounded-pill bg-card px-4 text-body-sm',
  soft: 'h-12.5 rounded-control bg-card px-4 text-body-sm',
};

/**
 * Girdinin ortak görünümü. `invalid` metin değil bayrak, çünkü alan alan cümle yazmayan form boş dizgi geçirip içi boş bir
 * `role="alert"` doğururdu; yükseklik ped hesabıyla değil sabitle verilir ki punto değişince alan komşu düğmeyle hizasını kaybetmesin.
 */
export function controlClass(invalid?: boolean, extra?: string, variant: FieldVariant = 'form'): string {
  return [
    'w-full border-[1.5px] font-sans leading-tight text-ink outline-none transition-colors placeholder:text-sand-600',
    CONTROL[variant],
    // Odakta kenar kalınlaşmaz, iç halka eklenir: kalınlaşan kenar kutunun içeriğini kaydırırdı.
    'focus:border-olive focus:ring-[0.5px] focus:ring-inset focus:ring-olive disabled:cursor-not-allowed disabled:opacity-60',
    // Salt-okunur hâl yalnız metin kontrollerine: tarayıcı düğmeyi de `:read-only` sayar ve seçim alanının tetiği soluk çizilirdi.
    '[&:read-only:not(button)]:bg-sand-50 [&:read-only:not(button)]:border-sand-300 [&:read-only:not(button)]:text-muted',
    invalid ? 'border-terracotta-bright ring-[0.5px] ring-inset ring-terracotta-bright' : 'border-sand-400',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}
