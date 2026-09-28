import type { Locale } from '@lezzet/i18n';
import discoverCopy from '@lezzet/i18n/customer/discover';
import { buttonClass } from '@/components/customer/ui/button';
import { Icon } from '@/components/customer/ui/icons';
import { Link } from '@/i18n/navigation';
import type { DiscoverCard } from '@/lib/feedback/discover';
import type { DiscoverVote, Messages } from '../discover-types';

interface DesktopOutcomeProps {
  t: Messages;
  locale: Locale;
  cards: DiscoverCard[];
  decisions: DiscoverVote[];
  earned: number;
  earnedMoney: string | null;
  signedIn: boolean;
}

/**
 * Turun sonu: solda özet ve eylemler, sağda beğenilenler. Girişsizde puan birikmişse ana eylem hesap açmaktır ve cümle puanın
 * para karşılığını söyler, çünkü değer gösterildikten sonraki davet reklam değil tekliftir.
 */
export function DesktopOutcome({ t, locale, cards, decisions, earned, earnedMoney, signedIn }: DesktopOutcomeProps) {
  const offer = discoverCopy[locale].offer;
  const emptyDeck = cards.length === 0;
  const liked = cards.filter((_, i) => decisions[i] === 'like');
  const guestOffer = !signedIn && !emptyDeck && earned > 0 && earnedMoney !== null;
  const copy = emptyDeck ? t.empty : signedIn ? t.done : t.guestDone;
  const summary = liked.length > 0 ? t.likedCount.replace('{n}', String(liked.length)) : t.noLikesSummary;
  const body = guestOffer
    ? offer.body.replace('{points}', String(earned)).replace('{money}', earnedMoney)
    : emptyDeck
      ? t.empty.body
      : t.done.body;

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-10 rounded-card border border-olive-line bg-card px-12 py-11">
      <div className="flex max-w-[560px] flex-col gap-3">
        <Icon name={emptyDeck ? 'timer' : 'sparkle'} size={36} className="text-olive" />
        <h1 className="font-serif text-h1-sm text-ink">{copy.title}</h1>
        <p className="font-sans text-copy leading-relaxed text-body">{emptyDeck ? body : `${summary} ${body}`}</p>
        <div className="mt-1.5 flex flex-wrap gap-2.5">
          {guestOffer && (
            <Link href="/login" className={buttonClass()}>
              {offer.cta}
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
