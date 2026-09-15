'use client';

import { Link } from '@/i18n/navigation';
import { Icon } from '@/components/customer/ui/icons';
import type { Messages } from '../discover-types';

/** Kapat — masaüstünün çıkışı; keşif bir sayfa değil bir tur olduğu için kataloğa döner. */
export function CloseLink({ t }: { t: Messages }) {
  return (
    <Link href="/catalog" className="inline-flex cursor-pointer items-center gap-1.5 font-sans text-body-sm font-bold text-olive transition-colors hover:text-olive-dark">
      <Icon name="close" size={14} />
      {t.close}
    </Link>
  );
}

/**
 * Puan çipi ya da giriş daveti: girişliye kazandığı, girişsize kazanabileceği söylenir.
 * Girişsizde dolu çip değil kesikli davet, çünkü henüz kazanılmış bir şey yok; puan hesap açılınca yüklenir.
 */
export function PointsChip({ t, earned, signedIn }: { t: Messages; earned: number; signedIn: boolean }) {
  if (signedIn) {
    return (
      <span className="rounded-pill bg-card px-3 py-1.5 font-sans text-note font-bold text-olive">
        {t.points.replace('{points}', String(earned))}
      </span>
    );
  }
  return (
    <Link
      href="/login"
      className="cursor-pointer rounded-soft border border-dashed border-olive-light bg-card px-3 py-1.5 font-sans text-micro font-semibold text-olive transition-colors hover:border-olive"
    >
      {t.guestInvite} → <span className="underline">{t.guestInviteCta}</span>
    </Link>
  );
}

/**
 * Masaüstünün oy düğmesi — kaydırmanın fare/klavye karşılığı, kartın iki yanında durur.
 * Beğen bilerek daha büyük: olumlu karar birincil eylem, olumsuzu cezasız bir geçiş.
 */
export function VoteButton({
  t,
  kind,
  onVote,
  busy,
  compact,
}: {
  t: Messages;
  kind: 'like' | 'dislike';
  onVote: (vote: 'like' | 'dislike') => void;
  busy: boolean;
  compact: boolean;
}) {
  const like = kind === 'like';
  return (
    <button
      type="button"
      aria-label={like ? t.like : t.dislike}
      disabled={busy}
      onClick={() => onVote(kind)}
      className={[
        'grid flex-none cursor-pointer place-items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        like
          ? 'bg-olive hover:bg-olive-dark'
          : 'border-2 border-sand-400 bg-card hover:border-olive',
        like ? (compact ? 'size-19 text-white' : 'size-18 text-white') : compact ? 'size-16 text-ink' : 'size-15 text-ink',
      ].join(' ')}
    >
      <Icon name={like ? 'thumbUp' : 'thumbDown'} size={like ? (compact ? 30 : 28) : compact ? 24 : 22} />
    </button>
  );
}
