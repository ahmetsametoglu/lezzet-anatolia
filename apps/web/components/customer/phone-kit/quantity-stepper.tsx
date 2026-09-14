/*
  ADET SEÇİCİ — native ürün detayının yapışkan barındaki adet seçicinin (`product-detail-screen.tsx` `stepper`)
  web telefon ikizi (14.09): kum (`sand-250`) zeminde −/+ ve ortada rakam; hücreler 44 × 48, rakam kolonu 30
  (native `customerMetrics`). İmler ikon kademesinde (`icon-sm`, zeytin) — başlık değil imdir (native 18.08);
  rakam gövde kademesinde kalın. Sınıra varan düğme pasifleşir: tavan ve taban görünür olsun.
*/

interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max: number;
  /** "{ürün} adedini azalt" — ekran okuyucu adı, çağıranda çözülür. */
  decreaseLabel: string;
  increaseLabel: string;
}

const STEP = 'flex h-12 w-11 cursor-pointer items-center justify-center font-sans text-icon-sm text-olive transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-40';

export function QuantityStepper({ value, onChange, min = 1, max, decreaseLabel, increaseLabel }: QuantityStepperProps) {
  return (
    <div className="flex flex-none items-center rounded-control bg-sand-250">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={decreaseLabel} className={STEP}>
        −
      </button>
      <span aria-live="polite" className="w-7.5 text-center font-sans text-body font-bold text-ink">
        {value}
      </span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={increaseLabel} className={STEP}>
        +
      </button>
    </div>
  );
}
