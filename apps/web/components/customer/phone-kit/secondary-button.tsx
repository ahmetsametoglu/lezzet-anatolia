import type { ComponentProps } from 'react';
import { Link } from '@/i18n/navigation';

/*
  İKİNCİL DÜĞME — native kitin `SecondaryButton`ının (`packages/mobile-kit/src/components/ui/secondary-button.tsx`) web
  telefon ikizi: çerçeveli (1,5), dolgusuz; blok biçim — 52 yükseklik (`controlLg`), kontrol köşe (16), sert gölge ve
  basılınca gölgeyi yutar (birincil bloğun aynı kuralı, Token Kararlari #8). Bugün iki ton: `sand` nötr ikinci yol
  (kum çerçeve, mürekkep metin) · `olive` olumlu ama ikincil (zeytin çerçeve, koyu zeytin metin). Pasif hâl gölgesiz,
  soluk çerçeve ve metin (native `disabled-line` · `disabled-text`) — bir DURUMDUR, bağ değil düğme olarak çizilir.
  Hap biçimi ve öteki tonlar ilk çağıranlarıyla gelir.

  Eylem iki türlü, biri verilir: `onClick` (sayfadaki iş) ya da `href` (başka sayfaya — `<a>` olarak çizilir).
*/

interface SecondaryButtonProps {
  /** Düğme etiketi — çeviri çağıranda çözülür. */
  label: string;
  onClick?: () => void;
  href?: ComponentProps<typeof Link>['href'];
  tone?: 'sand' | 'olive';
  disabled?: boolean;
}

const TONE: Record<NonNullable<SecondaryButtonProps['tone']>, string> = {
  sand: 'border-sand-400 text-ink',
  olive: 'border-olive-line text-olive-dark',
};

const BASE = 'flex h-13 w-full items-center justify-center rounded-control border-[1.5px] px-5 text-center font-sans text-button';

export function SecondaryButton({ label, onClick, href, tone = 'sand', disabled = false }: SecondaryButtonProps) {
  if (disabled) {
    return (
      <button type="button" disabled className={`${BASE} cursor-not-allowed border-disabled-line text-disabled-text`}>
        {label}
      </button>
    );
  }
  const className = `${BASE} ${TONE[tone]} cursor-pointer shadow-hard transition-[translate,box-shadow,background-color] hover:bg-sand-150 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none`;
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
