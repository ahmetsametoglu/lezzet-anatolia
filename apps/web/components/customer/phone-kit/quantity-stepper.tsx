/*
  Adet seçici, native'in iki sayacının web telefon ikizi: `bar` ürün ve paket detayının yapışkan barında, `line` sepet satırında (`sand`
  kum kartta, `ink` koyu paket kartında). Satır sayacının dokunma alanı görünmez `after` katmanıyla yalnız yukarı 44'e tamamlanır, çünkü
  hemen altta "kaldır" duruyor ve etekler çakışırsa "+"ya dokunmak satırı silerdi.
*/

import { HapticTarget } from './haptic-target';

interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  /** Tavan; `null` = tavansız. */
  max: number | null;
  /** "{ürün} adedini azalt" — ekran okuyucu adı, çağıranda çözülür. */
  decreaseLabel: string;
  increaseLabel: string;
  size?: 'bar' | 'line';
  /** Yalnız `line`: satırın zemini. */
  tone?: 'sand' | 'ink';
}

const STEP_BASE = 'relative flex cursor-pointer items-center justify-center font-sans text-icon-sm leading-none transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-40';

const LOOK = {
  bar: { box: 'bg-sand-250', step: 'h-12 w-11 text-olive', value: 'w-7.5 text-copy text-ink' },
  sand: {
    box: 'bg-sand-300',
    step: "relative size-8.5 text-olive after:absolute after:inset-x-0 after:-top-2.5 after:bottom-0 after:content-['']",
    value: 'min-w-5.5 text-body-sm text-ink',
  },
  ink: {
    box: 'border border-neutral-400',
    step: "relative size-8.5 text-sand-50 after:absolute after:inset-x-0 after:-top-2.5 after:bottom-0 after:content-['']",
    value: 'min-w-5.5 text-body-sm text-sand-50',
  },
} as const;

export function QuantityStepper({ value, onChange, min = 1, max, decreaseLabel, increaseLabel, size = 'bar', tone = 'sand' }: QuantityStepperProps) {
  const look = LOOK[size === 'bar' ? 'bar' : tone];
  const atMin = value <= min;
  const atMax = max !== null && value >= max;
  return (
    <div className={['flex flex-none items-center rounded-control', look.box].join(' ')}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={atMin} aria-label={decreaseLabel} className={`${STEP_BASE} ${look.step}`}>
        −{!atMin && <HapticTarget />}
      </button>
      <span aria-live="polite" className={['text-center font-sans font-bold', look.value].join(' ')}>
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(max === null ? value + 1 : Math.min(max, value + 1))}
        disabled={atMax}
        aria-label={increaseLabel}
        className={`${STEP_BASE} ${look.step}`}
      >
        +{!atMax && <HapticTarget />}
      </button>
    </div>
  );
}
