/*
  ADET SEÇİCİ — native'in iki sayacının web telefon ikizi (14.09), ikisi de "−" · rakam · "+":
  · `bar` (varsayılan) — ürün ve paket detayının yapışkan barındaki seçici (`product-detail-screen.tsx` `stepper`): kum
    (`sand-250`) zemin, hücreler 44 × 48, rakam kolonu 30 (native `customerMetrics`), rakam gövde kademesinde kalın.
  · `line` — sepet satırının sayacı (`apps/mobile/src/screens/customer-kit/quantity-stepper.tsx`): hücreler 34 × 34
    (`stepButton`), rakam kolonu en az 22, rakam `body-sm` kalın. İki zemin: `sand` kum kartın üstünde (`sand-300`
    dolgu, zeytin im) · `ink` koyu paket kartının üstünde (dolgu yerine ince nötr çerçeve, krem im — native'in
    gerekçesi: o alfada bir krem token'ı yok). Dokunma alanı görünmez `after` katmanıyla yalnız YUKARI 44'e
    tamamlanır: hemen altta "kaldır" duruyor ve iki etek çakışınca "+"ya dokunmak satırı siliyordu (native 20.08).
  İmler ikon kademesinde (`icon-sm`) ve normal ağırlıkta — başlık değil imdir. Sınıra varan düğme pasifleşir: tavan ve
  taban görünür olsun.
*/

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

const STEP_BASE = 'flex cursor-pointer items-center justify-center font-sans text-icon-sm leading-none transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-40';

const LOOK = {
  bar: { box: 'bg-sand-250', step: 'h-12 w-11 text-olive', value: 'w-7.5 text-body text-ink' },
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
  return (
    <div className={['flex flex-none items-center rounded-control', look.box].join(' ')}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={decreaseLabel} className={`${STEP_BASE} ${look.step}`}>
        −
      </button>
      <span aria-live="polite" className={['text-center font-sans font-bold', look.value].join(' ')}>
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(max === null ? value + 1 : Math.min(max, value + 1))}
        disabled={max !== null && value >= max}
        aria-label={increaseLabel}
        className={`${STEP_BASE} ${look.step}`}
      >
        +
      </button>
    </div>
  );
}
