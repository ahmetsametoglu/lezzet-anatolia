import { buttonClass } from '@/components/customer/ui/button';
import { Icon } from '@/components/customer/ui/icons';
import { Link } from '@/i18n/navigation';
import type { DiscoverCard } from '@/lib/feedback/discover';
import type { DiscoverVote, Messages } from '../discover-types';

interface DesktopOutcomeProps {
  t: Messages;
  cards: DiscoverCard[];
  decisions: DiscoverVote[];
  earned: number;
  earnedMoney: string;
  signedIn: boolean;
}

/**
 * Turun sonu — tasarımın kutusu: solda özet ve eylemler, sağda beğenilenler. Girişsizde puan birikmişse ana eylem
 * hesap açmaktır ve cümle puanın para karşılığını söyler (kullanıcı kararı 03.08); deste hiç dolmadıysa "aday yok".
 */
export function DesktopOutcome({ t, cards, decisions, earned, earnedMoney, signedIn }: DesktopOutcomeProps) {
  const emptyDeck = cards.length === 0;
  const liked = cards.filter((_, i) => decisions[i] === 'like');
  const guestOffer = !signedIn && !emptyDeck && earned > 0;
  const copy = emptyDeck ? t.empty : signedIn ? t.done : t.guestDone;
  const summary = liked.length > 0 ? t.likedCount.replace('{n}', String(liked.length)) : t.noLikesSummary;
  const body =
    emptyDeck || signedIn ? copy.body : t.guestDone.body.replace('{points}', String(earned)).replace('{money}', earnedMoney);

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-10 rounded-card border border-olive-line bg-card px-12 py-11">
      <div className="flex max-w-[560px] flex-col gap-3">
        <Icon name={emptyDeck ? 'timer' : 'sparkle'} size={36} className="text-olive" />
        <h1 className="font-serif text-h1-sm text-ink">{copy.title}</h1>
        <p className="font-sans text-copy leading-relaxed text-body">{emptyDeck ? body : `${summary} ${body}`}</p>
        <div className="mt-1.5 flex flex-wrap gap-2.5">
          {guestOffer && (
            <Link href="/login" className={buttonClass()}>
              {t.guestDone.cta}
            </Link>
          )}
          <Link href="/catalog" className={buttonClass({ variant: guestOffer ? 'secondary' : 'primary' })}>
            {copy.catalog}
          </Link>
          {signedIn && !emptyDeck && (
            <Link href="/account/points" className={buttonClass({ variant: 'outlineOlive' })}>
              {t.balanceShort}
            </Link>
          )}
        </div>
      </div>

      {!emptyDeck && (
        <div className="flex min-w-[220px] flex-col gap-2.5">
          <span className="font-sans text-eyebrow-sm font-bold text-muted uppercase">{t.likedTitle}</span>
          {liked.length > 0 ? (
            liked.map((c) => (
              <span
                key={c.productId}
                className="flex items-center gap-2.25 rounded-badge bg-olive-bg px-3.25 py-2.25 font-sans text-control font-semibold text-ink"
              >
                <Icon name="check" size={13} className="text-olive-dark" />
                {c.name}
              </span>
            ))
          ) : (
            <span className="max-w-[260px] font-sans text-note leading-relaxed text-muted">{t.noLikes}</span>
          )}
        </div>
      )}
    </div>
  );
}
