import type { ComponentProps } from 'react';
import { Link } from '@/i18n/navigation';

/*
  BİRİNCİL DÜĞME — native kitin `PrimaryButton`ının (`packages/mobile-kit/src/components/ui/primary-button.tsx`)
  web telefon ikizi (14.09). Zeytin dolgu, krem (`on-image`) etiket `button` kademesinde (14,5/700). İki biçim,
  Token Kararlari #8'in kendisi — gölgeli yüzey kayar, gölgesiz yüzey küçülür:
  · `pill`  — içerik genişliği, 46 yükseklik (`controlSm`), hap köşe, 26 yan dolgu; gölgesiz, basılınca küçülür.
  · `block` — tam genişlik, 52 yükseklik (`controlLg`), kontrol köşe (16); sert gölge, basılınca gölgeyi
              yutar (3px kayar — yüzen sepet düğmesinin aynı ölçüsü).

  Eylem iki türlü, biri verilir: `onClick` (sayfadaki bir iş) ya da `href` (başka sayfaya gider — `<a>` olarak
  çizilir ki tarayıcı ve arama motoru onu bağ olarak okusun; native'de ikisi de `onPress`).
  KAPALI hâl native'in çözümü: dolgu `disabled-fill`, metin `disabled-text`, gölge ve basış geri bildirimi YOK (ödeme
  ekranının onayı engel varken). Kapalı düğme bağ olarak çizilmez — tıklanamayan bir `<a>` olmaz.
  Öteki tonlar (mürekkep · hata), ikonlu ve ipuçlu hâl ilk çağıranlarıyla gelir.
*/

interface PrimaryButtonProps {
  /** Düğme etiketi — çeviri çağıranda çözülür. */
  label: string;
  /** Sayfadaki iş. */
  onClick?: () => void;
  /** Başka sayfaya giden eylem. */
  href?: ComponentProps<typeof Link>['href'];
  shape?: 'pill' | 'block';
  disabled?: boolean;
  /** Formun gönder düğmesi — girişin e-posta formu Enter'la da gönderilir. Varsayılan `button`. */
  type?: 'button' | 'submit';
}

const SHAPE: Record<NonNullable<PrimaryButtonProps['shape']>, string> = {
  pill: 'inline-flex h-11.5 flex-none rounded-pill',
  block: 'flex h-13 w-full rounded-control',
};

/** Açık hâlin dolgusu ve basış geri bildirimi — gölgeli yüzey kayar, gölgesiz yüzey küçülür. */
const LIVE: Record<NonNullable<PrimaryButtonProps['shape']>, string> = {
  pill: 'cursor-pointer bg-olive text-on-image hover:bg-olive-dark active:scale-[0.97]',
  block:
    'cursor-pointer bg-olive text-on-image shadow-hard hover:bg-olive-dark active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
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
