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
  primary: 'bg-ops-olive text-ops-card hover:bg-ops-olive-dark',
  dark: 'bg-ops-ink text-ops-card hover:bg-ops-ink-hover',
  secondary: 'border border-ops-line-strong bg-ops-card text-ops-strong hover:border-ops-olive',
  danger: 'border border-ops-red-line bg-ops-card text-ops-red hover:bg-ops-red-bg',
  // DOLU renkli onay düğmeleri: `danger` çerçeveli bir "yıkıcı seçenek"tir, bunlar KARARIN KENDİSİ
  // (iadeyi onayla · kısmi karşılamayı kaydet). Üç diyalog aynı sınıf zincirini elle kuruyordu.
  destructive: 'bg-ops-red text-ops-card hover:bg-ops-red-dark',
  warning: 'bg-ops-amber text-ops-card hover:bg-ops-amber-dark',
  // `destructive`/`warning` ile aynı aile — DOLU, yani kararın kendisi. Ayrı olmasının sebebi
  // anlamı: mor bu yüzeyde "makine" demek (`OpsTone.violet`), ve AI'dan devralmak yıkıcı da değil
  // uyarı da değil — geri alınamayan bir SAHİPLENMEDİR. Kırmızı yazsaydık bir zarar sanılırdı.
  violet: 'bg-ops-violet text-ops-card hover:bg-ops-violet-dot',
};

/**
 * Kapalı hâlin görünüşü. Çerçeveli ikilinin de KAPALI hâli görünür olmalı: dolu varyantlar rengi değiştirerek söylüyor, bunlar hiçbir
 * şey söylemiyordu (ölçüldü 08.08: "Yayına al" `disabled` ama `opacity: 1`). Yükleniyor hâli bunu kullanmaz, rengini korur.
 */
const VARIANT_DISABLED: Record<ButtonVariant, string> = {
  primary: 'disabled:bg-ops-gray-600',
  dark: 'disabled:bg-ops-gray-600',
  secondary: 'disabled:opacity-50',
  danger: 'disabled:opacity-50',
  destructive: 'disabled:opacity-50',
  warning: 'disabled:opacity-50',
  violet: 'disabled:opacity-50',
};

// Yükseklik ORTAK (`CONTROL_H`), burada yalnız yatay dolgu ve yazı kademesi var: bir düğme yan yana
// durduğu arama kutusuyla aynı yüksekliği paylaşmalı ama aynı genişliği paylaşmak zorunda değil.
const SIZE: Record<ControlSize, string> = {
  md: `${CONTROL_H.md} px-4 text-ops-base`,
  sm: `${CONTROL_H.sm} px-3 text-ops-sm`,
};

// İKON DÜĞME (14.09 · Para sözlüğünde Kaydet ✓ / Vazgeç ✕): kare, yazısız — adı çağıranın `aria-label`
// ve `title`ında. Yükseklik aynı aileden: yanındaki kutuyla hizalı durur.
const ICON_SIZE: Record<ControlSize, string> = {
  md: `${CONTROL_H.md} w-9`,
  sm: `${CONTROL_H.sm} w-8`,
};

interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ControlSize;
  /** Kare, yazısız ikon düğmesi — adı çağıranın `aria-label`/`title`ında. */
  icon?: boolean;
  fullWidth?: boolean;
  /** İş sürüyor: düğme kilitli ama kapalı görünmez (`Button`'ın `loading`i). */
  loading?: boolean;
  className?: string;
}

// Buton-olmayan öğelere (Link/span) aynı görünümü vermek için (ör. hata sayfası "Panele dön" linki).
export function buttonClass({ variant = 'primary', size = 'md', icon = false, fullWidth, loading = false, className }: ButtonClassOptions = {}): string {
  return [
    'inline-flex cursor-pointer items-center justify-center gap-2 rounded-ops-btn font-ops-display font-semibold outline-none transition-colors',
    // `cursor-not-allowed` yalnız fareyi getirene görünür; operatör düğmenin kapalı olduğunu BASMADAN önce görmeli.
    loading ? 'opacity-85 disabled:cursor-progress' : `disabled:cursor-not-allowed ${VARIANT_DISABLED[variant]}`,
    VARIANT[variant],
    icon ? ICON_SIZE[size] : SIZE[size],
    fullWidth ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ControlSize;
  /** Kare, yazısız ikon düğmesi — `aria-label` ve `title` ver. */
  icon?: boolean;
  fullWidth?: boolean;
  /**
   * İş sürüyor (tasarım: Komponentler › Butonlar › Yükleniyor): halka döner, düğme basılmaz ama rengini korur, çünkü kapalı hâlin
   * grisi "yapılamaz" der; burada iş başlamıştır. Gerçek `disabled` olduğu için form da ikinci kez gönderilmez.
   */
  loading?: boolean;
}

export function Button({ variant, size, icon, fullWidth, className, type = 'button', loading = false, disabled, children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={loading || disabled}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, icon, fullWidth, loading, className })}
    >
      {loading ? (
        <span aria-hidden className="size-[13px] shrink-0 animate-spin rounded-full border-2 border-current/50 border-t-current [animation-duration:700ms]" />
      ) : null}
      {children}
    </button>
  );
}
