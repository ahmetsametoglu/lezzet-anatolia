'use client';

import { Link } from '@/i18n/navigation';
import { buttonClass } from '@/components/customer/ui/button';
import { Icon } from '@/components/customer/ui/icons';
import type { FeedbackCompletion } from '@/lib/feedback/invite';
import type { FeedbackCopy, Messages } from '../feedback-types';

/**
 * Masaüstü akışının sonu, memnuniyete göre dallanır ve dalı motor seçer: memnun olmayana dış değerlendirme daveti gösterilmez, onun
 * yolu talep girişidir. Puan rozeti iki dalda da var, çünkü ödül tamamlamaya bağlıdır, beğeniye değil (DOMAIN §14).
 */
interface DesktopFeedbackOutcomeProps {
  copy: FeedbackCopy;
  t: Messages;
  completion: FeedbackCompletion;
  customerName: string | null;
}

export function DesktopFeedbackOutcome({ copy, t, completion, customerName }: DesktopFeedbackOutcomeProps) {
  const happy = completion.outcome === 'review_invite';
  const unhappy = completion.outcome === 'report_issue';

  return (
    <div className="flex flex-col items-center gap-3.5 text-center">
      <Icon name="sparkle" size={36} className="text-olive" />

      <span className="font-serif text-card-title text-ink">
        {unhappy ? t.doneTitleUnhappy : customerName ? t.doneTitle.replace('{name}', customerName) : t.doneTitleNoName}
      </span>

      {/* Rozetin sayısı turun toplamıdır, prim değil; toplam 0 ise "+0 puan" anlamsız bir rozet olurdu. */}
      {completion.invitePointsTotal > 0 && (
        <span className="rounded-pill bg-olive px-4.5 py-2 font-sans text-body-sm font-bold text-white">
          {t.pointsBadge.replace('{n}', String(completion.invitePointsTotal))}
        </span>
      )}
      <span className="font-sans text-note leading-relaxed text-body">{t.pointsNote}</span>

      {happy && completion.reviewUrl && (
        <div className="flex w-full flex-col gap-2 rounded-card border border-sand-200 bg-card px-4 py-4">
          <span className="font-serif text-copy font-semibold leading-snug text-ink">
            {t.reviewInviteTitle.replace('{platform}', completion.reviewPlatform ?? '')}
          </span>
          <span className="font-sans text-micro leading-relaxed text-body">{t.reviewInviteBody}</span>
          {/* Dış adres ayardan gelir; `Link` iç rotaları dile göre çevirdiği için burada düz bağ. */}
          <a
            href={completion.reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass({ variant: 'outlineOlive', size: 'sm', fullWidth: true })}
          >
            {t.reviewInviteCta.replace('{platform}', completion.reviewPlatform ?? '')}
            <Icon name="share" size={14} />
          </a>
        </div>
      )}

      {unhappy && (
        <>
          <span className="font-sans text-note leading-relaxed text-body">{t.unhappyBody}</span>
          <Link href="/support/new" className={buttonClass({ size: 'md', fullWidth: true })}>
            {copy.done.issueCta}
          </Link>
        </>
      )}

      <Link href="/catalog" className="cursor-pointer font-sans text-note font-bold text-olive transition-colors hover:text-olive-dark">
        {t.toCatalog}
      </Link>
    </div>
  );
}
