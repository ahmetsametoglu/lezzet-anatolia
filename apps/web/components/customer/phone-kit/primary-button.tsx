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
}

const SHAPE: Record<NonNullable<PrimaryButtonProps['shape']>, string> = {
  pill: 'inline-flex h-11.5 flex-none rounded-pill active:scale-[0.97]',
  block: 'flex h-13 w-full rounded-control shadow-hard active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
};

export function PrimaryButton({ label, onClick, href, shape = 'pill' }: PrimaryButtonProps) {
  const className = [
    'cursor-pointer items-center justify-center bg-olive px-6.5 font-sans text-button text-on-image transition-[scale,translate,box-shadow,background-color] hover:bg-olive-dark',
    SHAPE[shape],
  ].join(' ');

  if (href !== undefined) {
    return (
      <Link href={href} className={className}>
        {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {label}
    </button>
  );
}
