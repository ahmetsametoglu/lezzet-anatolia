import { useEffect, useState } from 'react';
import type { LocalizedCopy } from '@lezzet/i18n';
import discoverCopy from '@lezzet/i18n/customer/discover';
import { AppBar } from '@/components/customer/ui/app-bar';
import { BackButton } from '@/components/customer/ui/back-button';
import { Icon } from '@/components/customer/ui/icons';
import { PointsChip } from './components/deck-chrome';
import { DiscoverOutcome } from './components/discover-outcome';
import { DiscoverThanks } from './components/discover-thanks';
import { EXIT_MS, SwipeDeck } from './components/swipe-deck';
import type { DiscoverMobileProps } from './discover-types';

type DiscoverCopy = LocalizedCopy<typeof discoverCopy>;

/** Beğeni cümlesi: 0 ve 1 kendi cümlesini alır, "0 lezzet beğendiniz" cümle değildir. */
function likesLabel(copy: DiscoverCopy, likes: number): string {
  if (likes === 0) return copy.likes.zero;
  return likes === 1 ? copy.likes.one : copy.likes.other.replace('{count}', String(likes));
}

/**
 * Keşif, telefon görünümü (`Musteri Mobil.dc.html` "Keşif"): başlık çubuğu, ilerleme dilimleri, yön ipuçları, deste ve beğeni sayacı.
 * Girişli müşteri puanını başlıkta görür ve tasarımın bitişini alır; ziyaretçi davetini ve kendi bitişini görür.
 */
export function DiscoverMobile({
  t,
  locale,
  deck,
  current,
  total,
  earned,
  likes,
  settling,
  signedIn,
  onVote,
  claimed,
  emptyDeck,
  earnedMoney,
}: DiscoverMobileProps) {
  const copy = discoverCopy[locale];
  const finished = deck.length === 0;
  // Son kart uçarken bitiş bekler; deste baştan boşsa uçacak kart yok.
  const [landed, setLanded] = useState(finished);
  useEffect(() => {
    if (!finished) return;
    const timer = window.setTimeout(() => setLanded(true), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [finished]);
  const showOutcome = finished && landed && !settling;

  return (
    <div className="flex flex-1 flex-col bg-sand-50">
      <AppBar
        title={t.title}
        left={<BackButton label={copy.back} fallback="/catalog" />}
        right={signedIn ? <PointsChip t={t} earned={earned} signedIn /> : undefined}
      />

      {showOutcome ? (
        <>
          {claimed !== null && (
            <p className="mx-auto mt-6 w-max rounded-pill bg-olive-bg px-4 py-2 font-sans text-note font-semibold text-olive-dark" role="status">
              {t.claimed.replace('{points}', String(claimed))}
            </p>
          )}
          {signedIn && !emptyDeck ? (
            <DiscoverThanks
              title={copy.done.title}
              body={copy.done.body}
              likesLabel={likesLabel(copy, likes)}
              award={earned > 0 ? t.done.earned.replace('{points}', String(earned)) : null}
              catalog={t.done.catalog}
            />
          ) : (
            <DiscoverOutcome t={t} signedIn={signedIn} earned={earned} earnedMoney={earnedMoney} emptyDeck={emptyDeck} compact />
          )}
        </>
      ) : (
        <>
          {/* Ziyaretçi daveti başlık satırına sığmaz (FR/DE metin uzun); başlığın altında kendi satırını alır. */}
          {!signedIn && (
            <div className="flex justify-center px-4.5 pt-3">
              <PointsChip t={t} earned={earned} signedIn={false} />
            </div>
          )}
          <div className="flex flex-1 flex-col gap-3 px-4.5 pt-3 pb-[max(1.125rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-2.5">
              <div className="flex min-w-0 flex-1 gap-1" aria-hidden>
                {Array.from({ length: total }, (_, i) => (
                  <span
                    key={i}
                    className={[
                      'h-1 shrink rounded-full transition-[width,background-color] duration-250',
                      i === current ? 'w-5.5 bg-terracotta' : i < current ? 'w-2.5 bg-olive' : 'w-2.5 bg-sand-300',
                    ].join(' ')}
                  />
                ))}
              </div>
              <span className="font-sans text-micro font-bold text-muted">
                {t.counter.replace('{index}', String(Math.min(current + 1, total))).replace('{total}', String(total))}
              </span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <p className="text-center font-sans text-helper text-muted">{copy.framing}</p>
              <div className="flex w-full items-stretch gap-2">
                <div className="flex flex-1 items-center gap-2 rounded-soft bg-terracotta-bg px-3 py-2.25">
                  <Icon name="arrowLeft" size={18} strokeWidth={2.4} className="text-terracotta" />
                  <span className="font-sans text-helper leading-[1.3] font-bold text-terracotta">
                    {copy.hint.passTitle}
                    <br />
                    <span className="font-normal text-muted">{copy.hint.passBody}</span>
                  </span>
                </div>
                <div className="flex flex-1 items-center justify-end gap-2 rounded-soft bg-olive-bg px-3 py-2.25">
                  <span className="text-right font-sans text-helper leading-[1.3] font-bold text-olive-dark">
                    {copy.hint.likeTitle}
                    <br />
                    <span className="font-normal text-olive">{copy.hint.likeBody}</span>
                  </span>
                  <Icon name="arrowRight" size={18} strokeWidth={2.4} className="text-olive-dark" />
                </div>
              </div>
            </div>

            <SwipeDeck
              deck={deck}
              onVote={onVote}
              labels={{
                like: t.like,
                pass: t.dislike,
                stampLike: copy.stamp.like,
                stampPass: copy.stamp.pass,
                wantedOne: copy.wanted.one,
                wantedOther: copy.wanted.other,
              }}
            />

            <p className="text-center font-sans text-micro text-sand-600">{likesLabel(copy, likes)}</p>
          </div>
        </>
      )}
    </div>
  );
}
