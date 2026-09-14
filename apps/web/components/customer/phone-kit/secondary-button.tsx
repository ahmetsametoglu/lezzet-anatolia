import type { ComponentProps } from 'react';
import { Link } from '@/i18n/navigation';

/*
  İKİNCİL DÜĞME — native kitin `SecondaryButton`ının (`packages/mobile-kit/src/components/ui/secondary-button.tsx`) web
  telefon ikizi: çerçeveli (1,5), dolgusuz. İki biçim, Token Kararlari #8'in kendisi — gölgeli yüzey kayar, gölgesiz
  yüzey küçülür:
  · `block` — tam genişlik, 52 yükseklik (`controlLg`), kontrol köşe (16); sert gölge, basılınca gölgeyi yutar.
  · `pill`  — içerik genişliği, 46 yükseklik (`controlSm`), hap köşe; gölgesiz, basılınca küçülür (sipariş onayının
              komşu davetindeki paylaş düğmesi, 14.09).
  Bugün iki ton: `sand` nötr ikinci yol (kum çerçeve, mürekkep metin) · `olive` olumlu ama ikincil (zeytin çerçeve,
  koyu zeytin metin). Pasif hâl gölgesiz, soluk çerçeve ve metin (native `disabled-line` · `disabled-text`) — bir
  DURUMDUR, bağ değil düğme olarak çizilir. Öteki tonlar ilk çağıranlarıyla gelir.

  Eylem iki türlü, biri verilir: `onClick` (sayfadaki iş) ya da `href` (başka sayfaya — `<a>` olarak çizilir).
*/

interface SecondaryButtonProps {
  /** Düğme etiketi — çeviri çağıranda çözülür. */
  label: string;
  onClick?: () => void;
  href?: ComponentProps<typeof Link>['href'];
  tone?: 'sand' | 'olive';
  shape?: 'block' | 'pill';
  disabled?: boolean;
}

const TONE: Record<NonNullable<SecondaryButtonProps['tone']>, string> = {
  sand: 'border-sand-400 text-ink',
  olive: 'border-olive-line text-olive-dark',
};

const SHAPE: Record<NonNullable<SecondaryButtonProps['shape']>, string> = {
  block: 'flex h-13 w-full rounded-control',
  pill: 'inline-flex h-11.5 flex-none rounded-pill',
};

/** Basış geri bildirimi biçime göre: blok gölgesini yutarak kayar, hap küçülür. */
const PRESS: Record<NonNullable<SecondaryButtonProps['shape']>, string> = {
  block: 'shadow-hard active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
  pill: 'active:scale-[0.97]',
};

const BASE = 'items-center justify-center border-[1.5px] px-5 text-center font-sans text-button';

export function SecondaryButton({ label, onClick, href, tone = 'sand', shape = 'block', disabled = false }: SecondaryButtonProps) {
  if (disabled) {
    return (
      <button type="button" disabled className={`${BASE} ${SHAPE[shape]} cursor-not-allowed border-disabled-line text-disabled-text`}>
        {label}
      </button>
    );
  }
  const className = `${BASE} ${SHAPE[shape]} ${TONE[tone]} ${PRESS[shape]} cursor-pointer transition-[translate,box-shadow,background-color,scale] hover:bg-sand-150`;
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
