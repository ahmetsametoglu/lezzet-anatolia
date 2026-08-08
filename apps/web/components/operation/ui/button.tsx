import type { ButtonHTMLAttributes } from 'react';
import { CONTROL_H, type ControlSize } from './control';

/**
 * Operasyon butonu — Komponent Envanteri O8. Tüm buton varyasyonları tek yerde (ops- token'ları).
 * Birincil ekranda tek: `primary` (olive, kaydet) veya `dark` (ink, vurgulu/yeni); `secondary`
 * çerçeveli, `danger` kırmızı ÇERÇEVELİ (yıkıcı seçenek), `destructive`/`warning` DOLU renkli
 * (kararın kendisi: iadeyi onayla, kısmi karşılamayı kaydet). Müşteri evreninin butonundan AYRI set
 * (components/customer/ui/button.tsx = "Aile Sofrası"). Tasarım büyüdükçe varyant eklenir.
 */
type ButtonVariant = 'primary' | 'dark' | 'secondary' | 'danger' | 'destructive' | 'warning' | 'violet';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-ops-olive text-ops-card hover:bg-ops-olive-dark disabled:bg-ops-gray-600',
  dark: 'bg-ops-ink text-ops-card hover:bg-ops-ink-hover disabled:bg-ops-gray-600',
  // Çerçeveli ikilinin de KAPALI hâli görünür olmalı: dolu varyantlar rengi değiştirerek söylüyor,
  // bunlar hiçbir şey söylemiyordu — kapalı düğme açığıyla tıpatıp aynı çiziliyordu (ölçüldü 08.08:
  // tarif önizlemesinde "Yayına al" `disabled` ama `opacity: 1`). `cursor-not-allowed` yalnız fareyi
  // getirene görünür; operatör düğmenin kapalı olduğunu BASMADAN önce görmeli.
  secondary: 'border border-ops-line-strong bg-ops-card text-ops-strong hover:border-ops-olive disabled:opacity-50',
  danger: 'border border-ops-red-line bg-ops-card text-ops-red hover:bg-ops-red-bg disabled:opacity-50',
  // DOLU renkli onay düğmeleri: `danger` çerçeveli bir "yıkıcı seçenek"tir, bunlar KARARIN KENDİSİ
  // (iadeyi onayla · kısmi karşılamayı kaydet). Üç diyalog aynı sınıf zincirini elle kuruyordu.
  destructive: 'bg-ops-red text-ops-card hover:bg-ops-red-dark disabled:opacity-50',
  warning: 'bg-ops-amber text-ops-card hover:bg-ops-amber-dark disabled:opacity-50',
  // `destructive`/`warning` ile aynı aile — DOLU, yani kararın kendisi. Ayrı olmasının sebebi
  // anlamı: mor bu yüzeyde "makine" demek (`OpsTone.violet`), ve AI'dan devralmak yıkıcı da değil
  // uyarı da değil — geri alınamayan bir SAHİPLENMEDİR. Kırmızı yazsaydık bir zarar sanılırdı.
  violet: 'bg-ops-violet text-ops-card hover:bg-ops-violet-dot disabled:opacity-50',
};

// Yükseklik ORTAK (`CONTROL_H`), burada yalnız yatay dolgu ve yazı kademesi var: bir düğme yan yana
// durduğu arama kutusuyla aynı yüksekliği paylaşmalı ama aynı genişliği paylaşmak zorunda değil.
const SIZE: Record<ControlSize, string> = {
  md: `${CONTROL_H.md} px-4 text-ops-base`,
  sm: `${CONTROL_H.sm} px-3 text-ops-sm`,
};

interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ControlSize;
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
  size?: ControlSize;
  fullWidth?: boolean;
}

export function Button({ variant, size, fullWidth, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass({ variant, size, fullWidth, className })} {...rest} />;
}
