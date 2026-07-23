import type { ButtonHTMLAttributes } from 'react';

/**
 * Lezzet buton — tüm buton varyasyonları tek yerde (Tailwind token'ları). Inline buton stili
 * yazmak yerine `<Button variant size fullWidth>` kullanılır. `<Link>`/`<a>` gibi buton-olmayan
 * öğeler için aynı görünümü `buttonClass(...)` verir. Tasarım büyüdükçe varyant eklenir.
 */
type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'md' | 'sm';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'rounded-pill bg-olive text-white hover:bg-olive-dark disabled:bg-[#c9c3b0]',
  secondary: 'rounded-pill border-[1.5px] border-line-strong bg-white text-ink hover:border-olive',
  ghost: 'text-olive hover:text-olive-dark disabled:text-faint',
};

// Dolgulu varyantlar (primary/secondary) ped alır; ghost yalnız metin boyutu (inline link-buton).
const PADDED_SIZE: Record<ButtonSize, string> = {
  md: 'px-6 py-3.5 text-[15px]',
  sm: 'px-4 py-2 text-sm',
};
const GHOST_SIZE: Record<ButtonSize, string> = {
  md: 'text-[15px]',
  sm: 'text-sm',
};

interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

export function buttonClass({ variant = 'primary', size = 'md', fullWidth, className }: ButtonClassOptions = {}): string {
  return [
    'inline-flex items-center justify-center gap-2 font-sans font-bold outline-none transition-colors disabled:cursor-not-allowed',
    VARIANT[variant],
    variant === 'ghost' ? GHOST_SIZE[size] : PADDED_SIZE[size],
    fullWidth ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function Button({ variant, size, fullWidth, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass({ variant, size, fullWidth, className })} {...rest} />;
}
