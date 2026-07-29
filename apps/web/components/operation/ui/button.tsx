import type { ButtonHTMLAttributes } from 'react';

/**
 * Operasyon butonu — Komponent Envanteri O8. Tüm buton varyasyonları tek yerde (ops- token'ları).
 * Birincil ekranda tek: `primary` (olive, kaydet) veya `dark` (ink, vurgulu/yeni); `secondary`
 * çerçeveli, `danger` kırmızı ÇERÇEVELİ (yıkıcı seçenek), `destructive`/`warning` DOLU renkli
 * (kararın kendisi: iadeyi onayla, kısmi karşılamayı kaydet). Müşteri evreninin butonundan AYRI set
 * (components/customer/ui/button.tsx = "Aile Sofrası"). Tasarım büyüdükçe varyant eklenir.
 */
type ButtonVariant = 'primary' | 'dark' | 'secondary' | 'danger' | 'destructive' | 'warning';
type ButtonSize = 'md' | 'sm';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-ops-olive text-ops-card hover:bg-ops-olive-dark disabled:bg-ops-gray-600',
  dark: 'bg-ops-ink text-ops-card hover:bg-ops-ink-hover disabled:bg-ops-gray-600',
  secondary: 'border border-ops-line-strong bg-ops-card text-ops-strong hover:border-ops-olive',
  danger: 'border border-ops-red-line bg-ops-card text-ops-red hover:bg-ops-red-bg',
  // DOLU renkli onay düğmeleri: `danger` çerçeveli bir "yıkıcı seçenek"tir, bunlar KARARIN KENDİSİ
  // (iadeyi onayla · kısmi karşılamayı kaydet). Üç diyalog aynı sınıf zincirini elle kuruyordu.
  destructive: 'bg-ops-red text-ops-card hover:bg-ops-red-dark disabled:opacity-50',
  warning: 'bg-ops-amber text-ops-card hover:bg-ops-amber-dark disabled:opacity-50',
};

const SIZE: Record<ButtonSize, string> = {
  md: 'px-4 py-2.5 text-ops-base',
  sm: 'px-3 py-2 text-ops-sm',
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
