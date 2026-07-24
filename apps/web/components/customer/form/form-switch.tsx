'use client';

import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

/**
 * RHF `.switch` alanı — tıklanabilir kart (sol: başlık + ipucu, sağ: toggle). Tüm karta tıklama
 * ya da Enter/Space toggle eder (klavye erişilebilir). `variant='accent'` açık durumu turuncu
 * vurgular. Kompakt/para vb. varyantlar ihtiyaç doğunca eklenir.
 */
interface FormSwitchProps<TFieldValues extends FieldValues> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<TFieldValues, any, any>;
  name: FieldPath<TFieldValues>;
  label: string;
  hint?: string;
  disabled?: boolean;
  variant?: 'default' | 'accent';
}

export function FormSwitch<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  hint,
  disabled,
  variant = 'default',
}: FormSwitchProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const checked = !!field.value;
        const toggle = () => {
          if (!disabled) field.onChange(!checked);
        };
        const trackOn = variant === 'accent' ? 'bg-orange' : 'bg-olive';

        return (
          <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-pressed={checked}
            aria-disabled={disabled}
            onClick={toggle}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
              }
            }}
            className={[
              'flex select-none items-center justify-between gap-3 rounded-2xl border-2 border-line-strong bg-white px-4 py-3 outline-none transition-colors focus-visible:border-olive',
              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            ].join(' ')}
          >
            <div className="min-w-0">
              <div className="font-sans text-[15px] font-semibold text-ink">{label}</div>
              {hint && <div className="mt-0.5 font-sans text-[13px] text-muted">{hint}</div>}
            </div>
            <span
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? trackOn : 'bg-line-strong'}`}
              aria-hidden
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
              />
            </span>
          </div>
        );
      }}
    />
  );
}
