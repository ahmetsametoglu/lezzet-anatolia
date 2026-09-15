import type { ComponentProps } from 'react';
import { Link } from '@/i18n/navigation';

/*
  Native kitin `PrimaryButton`ının web telefon ikizi. `href` verilirse bağ (`<a>`) çizilir ki tarayıcı ve arama motoru onu
  bağ olarak okusun; kapalı düğme bağ olarak çizilmez, tıklanamayan bir `<a>` olmaz.
*/

interface PrimaryButtonProps {
  /** Düğme etiketi — çeviri çağıranda çözülür. */
  label: string;
  /** Sayfadaki iş. */
  onClick?: () => void;
  /** Başka sayfaya giden eylem. */
  href?: ComponentProps<typeof Link>['href'];
  /** `pill` içerik genişliği, hap köşe, gölgesiz · `block` tam genişlik, sert gölgeli · `raised` içerik genişliği, sert gölgeli. */
  shape?: 'pill' | 'block' | 'raised';
  disabled?: boolean;
  /** Formun gönder düğmesi — girişin e-posta formu Enter'la da gönderilir. Varsayılan `button`. */
  type?: 'button' | 'submit';
}

const SHAPE: Record<NonNullable<PrimaryButtonProps['shape']>, string> = {
  pill: 'inline-flex h-11.5 flex-none rounded-pill',
  block: 'flex h-13 w-full rounded-control',
  raised: 'inline-flex h-12 flex-none rounded-control',
};

const HARD_SHADOW_LIVE =
  'cursor-pointer bg-olive text-on-image shadow-hard hover:bg-olive-dark active:translate-x-[3px] active:translate-y-[3px] active:shadow-none';

/** Açık hâlin dolgusu ve basış geri bildirimi — gölgeli yüzey kayar, gölgesiz yüzey küçülür. */
const LIVE: Record<NonNullable<PrimaryButtonProps['shape']>, string> = {
  pill: 'cursor-pointer bg-olive text-on-image hover:bg-olive-dark active:scale-[0.97]',
  block: HARD_SHADOW_LIVE,
  raised: HARD_SHADOW_LIVE,
};

export function PrimaryButton({ label, onClick, href, shape = 'pill', disabled = false, type = 'button' }: PrimaryButtonProps) {
  const className = [
    'items-center justify-center px-6.5 font-sans text-button transition-[scale,translate,box-shadow,background-color]',
    SHAPE[shape],
    disabled ? 'cursor-not-allowed bg-disabled-fill text-disabled-text' : LIVE[shape],
  ].join(' ');

  if (disabled) {
    return (
      <button type="button" disabled className={className}>
        {label}
      </button>
    );
  }
  if (href !== undefined) {
    return (
      <Link href={href} className={className}>
        {label}
      </Link>
    );
  }
  return (
    <button type={type === 'submit' ? 'submit' : 'button'} onClick={onClick} className={className}>
      {label}
    </button>
  );
}
