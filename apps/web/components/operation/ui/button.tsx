import type { ButtonHTMLAttributes } from 'react';

/**
 * Operasyon butonu — Komponent Envanteri O8. Tüm buton varyasyonları tek yerde (ops- token'ları).
 * Birincil ekranda tek: `primary` (olive, kaydet) veya `dark` (ink, vurgulu/yeni); `secondary`
 * çerçeveli, `danger` kırmızı çerçeveli (yıkıcı). Müşteri evreninin butonundan AYRI set
 * (components/customer/ui/button.tsx = "Aile Sofrası"). Tasarım büyüdükçe varyant eklenir.
 */
type ButtonVariant = 'primary' | 'dark' | 'secondary' | 'danger';
type ButtonSize = 'md' | 'sm';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-ops-olive text-ops-card hover:bg-ops-olive-dark disabled:bg-[#c1c6b8]',
  dark: 'bg-ops-ink text-ops-card hover:bg-[#33372e] disabled:bg-[#c1c6b8]',
  secondary: 'border border-ops-line-strong bg-ops-card text-ops-strong hover:border-ops-olive',
  danger: 'border border-[#e2c4c0] bg-ops-card text-ops-red hover:bg-ops-red-bg',
};

const SIZE: Record<ButtonSize, string> = {
  md: 'px-4 py-2.5 text-[13px]',
  sm: 'px-3 py-2 text-xs',
};

interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

// Buton-olmayan öğelere (Link/span) aynı görünümü vermek için (ör. hata sayfası "Panele dön" linki).
export function buttonClass({ variant = 'primary', size = 'md', fullWidth, className }: ButtonClassOptions = {}): string {
  return [
    'inline-flex cursor-pointer items-center justify-center gap-2 rounded-ops-btn font-ops-display font-semibold outline-none transition-colors disabled:cursor-not-allowed',
    VARIANT[variant],
    SIZE[size],
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
