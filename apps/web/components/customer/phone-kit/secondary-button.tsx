import type { ComponentProps } from 'react';
import { Link } from '@/i18n/navigation';

/*
  Native kitin ikincil düğmesinin web telefon ikizi. Basış biçime göre: gölgeli blok gölgesini yutarak kayar, gölgesiz hap küçülür.
*/

interface SecondaryButtonProps {
  /** Düğme etiketi — çeviri çağıranda çözülür. */
  label: string;
  onClick?: () => void;
  href?: ComponentProps<typeof Link>['href'];
  /** `terracotta` yıkıcı onay içindir (hesap silme). */
  tone?: 'sand' | 'olive' | 'terracotta';
  shape?: 'block' | 'pill';
  disabled?: boolean;
}

const TONE: Record<NonNullable<SecondaryButtonProps['tone']>, string> = {
  sand: 'border-sand-400 text-ink',
  olive: 'border-olive-line text-olive-dark',
  terracotta: 'border-terracotta-line text-terracotta',
};

const SHAPE: Record<NonNullable<SecondaryButtonProps['shape']>, string> = {
  block: 'flex h-13 w-full rounded-control',
  pill: 'inline-flex h-11.5 flex-none rounded-pill',
};

const PRESS: Record<NonNullable<SecondaryButtonProps['shape']>, string> = {
  block: 'shadow-hard active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
  pill: 'active:scale-[0.97]',
};

const BASE = 'items-center justify-center border-[1.5px] px-5 text-center font-sans text-button';

export function SecondaryButton({ label, onClick, href, tone = 'sand', shape = 'block', disabled = false }: SecondaryButtonProps) {
  // Pasif hâl bir durumdur, bu yüzden bağ olarak değil düğme olarak çizilir.
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
