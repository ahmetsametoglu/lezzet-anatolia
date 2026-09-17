'use client';

import { Link } from '@/i18n/navigation';
import type { Messages } from '../discover-types';

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
