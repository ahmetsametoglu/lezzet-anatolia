import { useEffect, useState } from 'react';
import type { LocalizedCopy } from '@lezzet/i18n';
import discoverCopy from '@lezzet/i18n/customer/discover';
import { EmptyState } from '@/components/customer/phone-kit/empty-state';
import { PointsAward, PointsSpark } from '@/components/customer/phone-kit/points-award';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { SecondaryButton } from '@/components/customer/phone-kit/secondary-button';
import { AppBar } from '@/components/customer/ui/app-bar';
import { BackButton } from '@/components/customer/ui/back-button';
import { Icon } from '@/components/customer/ui/icons';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { EXIT_MS, SwipeDeck } from './components/swipe-deck';
import type { DiscoverMobileProps } from './discover-types';

type DiscoverCopy = LocalizedCopy<typeof discoverCopy>;

/** Beğeni cümlesi: 0 ve 1 kendi cümlesini alır, "0 lezzet beğendiniz" cümle değildir. */
function likesLabel(copy: DiscoverCopy, likes: number): string {
  if (likes === 0) return copy.likes.zero;
  return likes === 1 ? copy.likes.one : copy.likes.other.replace('{count}', String(likes));
}

/**
 * Keşif, telefon görünümü; native keşif ekranının ikizi: başlıkta "Geri al", ilerleme dilimleri, yön ipuçları, deste ve beğeni
 * sayacı. Bitiş native'in bloğudur, ziyaretçiye giriş daveti yalnız orada çıkar.
 */
export function DiscoverMobile({
  t,
  locale,
  deck,
  current,
  total,
  awarded,
  balance,
  likes,
  settling,
  signedIn,
  onVote,
  canUndo,
  onUndo,
  claimed,
  emptyDeck,
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
  // Bitiş son kartın uçuşunu bekler, puanı beklemez: yolda oy varken blok sayı yerine bekleme cümlesi yazar.
  const showDone = finished && landed;

  return (
    <div className="flex flex-1 flex-col bg-sand-50">
      <AppBar
        title={copy.title}
        left={<BackButton label={copy.back} fallback="/catalog" />}
        right={
          emptyDeck ? undefined : (
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className={[
                'flex items-center gap-1.5 font-sans text-helper font-bold transition-transform',
                canUndo ? 'cursor-pointer text-ink active:scale-95' : 'text-sand-500',
              ].join(' ')}
            >
              <MobileIcon name="undo" size={17} />
              {copy.undo}
            </button>
          )
        }
      />

      {emptyDeck ? (
        <EmptyState
          fill
          title={copy.empty.title}
          description={copy.empty.body}
          action={<PrimaryButton label={copy.empty.catalog} shape="pill" href="/catalog" />}
        />
      ) : showDone ? (
        <div className="flex flex-1 flex-col overflow-y-auto px-7.5 pt-17.5 pb-[calc(4.375rem+env(safe-area-inset-bottom))]">
          {/* Üst ve alt pay 4:6: blok optik merkeze çekilir, native bitişin ve boş hâlin aynı oranı. */}
          <div className="flex-[4]" />
          <div className="flex flex-col items-center gap-3.5 text-center">
            {claimed !== null && (
              <p className="rounded-pill bg-olive-bg px-4 py-2 font-sans text-note font-semibold text-olive-dark" role="status">
                {t.claimed.replace('{points}', String(claimed))}
              </p>
            )}
            <PointsSpark size={88} className="text-terracotta" />
            <h1 className="font-serif text-card-title text-ink">{copy.done.title}</h1>
            <p className="font-sans text-note font-bold text-olive-dark">{likesLabel(copy, likes)}</p>
            <p className="font-sans text-note leading-[1.55] text-body">{copy.done.body}</p>
            <PointsAward locale={locale} points={awarded} balance={balance} settling={signedIn && settling} />
            {/* Davet turun sahibi yokken: sunucu ödül yazdıysa tur birine aittir. */}
            {!signedIn && awarded === null && (
              <>
                <p className="font-sans text-helper leading-[1.55] text-muted">{copy.done.loginHint}</p>
                <SecondaryButton label={copy.done.loginCta} tone="olive" shape="pill" href="/login" />
              </>
            )}
            <div className="mt-1.5">
              <PrimaryButton label={copy.done.catalog} shape="pill" href="/catalog" />
            </div>
          </div>
          <div className="flex-[6]" />
        </div>
      ) : (
        <>
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
                {copy.progress.replace('{current}', String(Math.min(current + 1, total))).replace('{total}', String(total))}
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
