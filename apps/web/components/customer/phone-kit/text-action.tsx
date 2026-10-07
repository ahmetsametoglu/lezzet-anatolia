import type { ComponentProps } from 'react';
import { Link } from '@/i18n/navigation';

/*
  Native `TextAction`ın web telefon ikizi: zeminsiz eylem ("Değiştir", "kaldır"), basılı geri bildirimi opaklık ve dokunma alanı görünmez
  `after` katmanıyla 44'e tamamlanır. Gezinme yüzeyi olduğu için titremez.
*/

interface TextActionProps {
  /** Görünen metin — çeviri çağıranda çözülür. */
  label: string;
  onClick?: () => void;
  href?: ComponentProps<typeof Link>['href'];
  /** Sitenin dışındaki adres (taşıyıcının takip sayfası); yeni sekmede `noopener` ile açılır ki açılan sekme bu sayfaya erişemesin. */
  externalHref?: string;
  tone?: 'olive' | 'terracotta';
  /** Görünen metinden AYRI ekran okuyucu adı — "kaldır" tek başına hangi satırı söylemez. */
  ariaLabel?: string;
  /** `down`: pay yalnız aşağı verilir ki üstteki sayacın eteğiyle çakışıp yanlış satıra dokunulmasın. */
  edges?: 'all' | 'down';
  /** Basılamaz ve soluk; yalnız düğme kapanır, kapalı bir bağ çizilmez ve verilmişse `href` yok sayılır. */
  disabled?: boolean;
}

const EDGES: Record<NonNullable<TextActionProps['edges']>, string> = {
  all: 'after:-inset-x-1 after:-inset-y-3',
  down: 'after:-inset-x-1 after:top-0 after:-bottom-6',
};

export function TextAction({ label, onClick, href, externalHref, tone = 'olive', ariaLabel, edges = 'all', disabled = false }: TextActionProps) {
  const className = [
    "relative font-sans text-control transition-opacity after:absolute after:content-['']",
    disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:opacity-70 active:opacity-50',
    EDGES[edges],
    tone === 'olive' ? 'text-olive-dark' : 'text-terracotta-dark',
  ].join(' ');
  if (disabled) {
    return (
      <button type="button" disabled data-haptic="off" aria-label={ariaLabel} className={className}>
        {label}
      </button>
    );
  }
  if (externalHref !== undefined) {
    return (
      <a href={externalHref} target="_blank" rel="noopener noreferrer" data-haptic="off" aria-label={ariaLabel} className={className}>
        {label}
      </a>
    );
  }
  if (href !== undefined) {
    return (
      <Link href={href} data-haptic="off" aria-label={ariaLabel} className={className}>
        {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} data-haptic="off" aria-label={ariaLabel} className={className}>
      {label}
    </button>
  );
}
