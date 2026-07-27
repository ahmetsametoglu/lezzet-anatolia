import type { ButtonHTMLAttributes } from 'react';

/**
 * Lezzet buton — tüm buton varyasyonları tek yerde (Tailwind token'ları). Inline buton stili
 * yazmak yerine `<Button variant size fullWidth>` kullanılır. `<Link>`/`<a>` gibi buton-olmayan
 * öğeler için aynı görünümü `buttonClass(...)` verir. Tasarım büyüdükçe varyant eklenir.
 */
type ButtonVariant = 'primary' | 'secondary' | 'secondaryOnDark' | 'ghost';
type ButtonSize = 'lg' | 'md' | 'sm';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'rounded-pill bg-olive text-white hover:bg-olive-dark disabled:bg-disabled-fill disabled:text-disabled-text',
  secondary: 'rounded-pill border-[1.5px] border-sand-400 bg-card text-ink hover:border-olive',
  // K2 koyu zemin varyantı — antrasit blok üstünde açık yeşil çerçeve/metin (envanter §2).
  secondaryOnDark: 'rounded-pill border-[1.5px] border-olive-light bg-transparent text-olive-light hover:bg-olive-light/10',
  ghost: 'text-olive hover:text-olive-dark disabled:text-sand-600',
};

// Dolgulu varyantlar (primary/secondary) ped alır; ghost yalnız metin boyutu (inline link-buton).
const PADDED_SIZE: Record<ButtonSize, string> = {
  // `lg` yalnız ürün detayın ana aksiyonunda: sayfanın tek satın alma butonu, toplam tutarı taşır
  // ve mobilde ekran altına sabitlenir — kart butonlarıyla aynı ağırlıkta olamaz.
  lg: 'px-10 py-4 text-lead',
  md: 'px-6 py-3.5 text-body',
  sm: 'px-4 py-2 text-sm',
};
const GHOST_SIZE: Record<ButtonSize, string> = {
  lg: 'text-lead',
  md: 'text-body',
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
    // Odak halkası envanter §0.4: 2px zeytin outline, 3px offset — ayrı renk taşımaz.
    'inline-flex cursor-pointer items-center justify-center gap-2 font-sans font-bold transition-colors disabled:cursor-not-allowed',
    'outline-none focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-olive',
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
