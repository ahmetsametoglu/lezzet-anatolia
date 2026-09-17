import { RATIO_SOURCE } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { Band } from '@/components/customer/ui/section';
import { buttonClass } from '@/components/customer/ui/button';
import { Icon } from '@/components/customer/ui/icons';
import { Link } from '@/i18n/navigation';
import { DesktopCandidateStrip } from './components/desktop-candidate-strip';
import { DesktopOutcome } from './components/desktop-outcome';
import type { DiscoverViewProps } from './discover-types';

/**
 * Keşif — masaüstü (`Musteri Web.dc.html`, "Web · Keşif"): üst satırda ilerleme ve puan, altında iki sütunlu aday
 * (fotoğraf · ad, açıklama, karar) ve bu turun adayları; tur bitince aynı yerde bitiş kutusu. Klavye ←/→ istemcide.
 *
 * Fotoğraf 3:2 çizilir, tasarımın 4:3'ü envanterde yok ve ürünün kırpma önizlemesinde karşılığı olmazdı.
 */
export function DiscoverDesktop({ t, cards, current, decisions, earned, signedIn, onVote, busy, claimed, earnedMoney }: DiscoverViewProps) {
  const total = cards.length;
  const card = cards[current] ?? null;
  const position = Math.min(current + 1, total);
  const counter = (template: string) => template.replace('{index}', String(position)).replace('{total}', String(total));

  return (
    <Band surface="bg-olive-bg" className="flex min-h-[520px] flex-1 flex-col gap-6 px-12 pt-7.5 pb-11">
      <div className="flex items-center gap-5.5">
        <Link
          href="/catalog"
          className="inline-flex flex-none cursor-pointer items-center gap-1.75 font-sans text-control text-olive transition-colors hover:text-olive-dark"
        >
          <Icon name="close" size={12} />
          {t.close}
        </Link>
        {total > 0 && (
          <div className="flex max-w-[520px] flex-1 flex-col gap-1.75">
            <div className="flex items-baseline gap-2.5">
              <span className="font-sans text-note font-semibold tracking-[0.12em] text-olive-dark uppercase">{t.title}</span>
              <span className="font-sans text-field-label font-bold text-muted">{counter(t.progress)}</span>
            </div>
            <div className="flex gap-1">
              {cards.map((c, i) => (
                <span
                  key={c.productId}
                  className={[
                    'h-[5px] flex-1 rounded-full transition-colors duration-200',
                    i < current ? 'bg-olive' : i === current ? 'bg-olive-light' : 'bg-olive-line',
                  ].join(' ')}
                />
              ))}
            </div>
          </div>
        )}
        {signedIn ? (
          <span className="ml-auto inline-flex flex-none items-center gap-1.75 rounded-pill border border-olive-edge bg-card px-3.5 py-1.75 font-sans text-note font-bold text-olive-dark">
            <Icon name="sparkle" size={14} />
            {t.points.replace('{points}', String(earned))}
          </span>
        ) : (
          <Link
            href="/login"
            className="ml-auto inline-flex flex-none cursor-pointer items-center gap-1.75 rounded-pill border border-olive-edge bg-card px-3.5 py-1.75 font-sans text-note font-bold text-olive-dark transition-colors hover:border-olive"
          >
            <Icon name="sparkle" size={14} />
            {t.guestChip}
          </Link>
        )}
      </div>

      {card ? (
        <>
          <div className="grid grid-cols-[1.15fr_1fr] items-stretch gap-10">
            <div className="rounded-card border border-olive-line bg-card p-3 shadow-menu">
              <FramedImage
                src={card.image.url}
                alt={card.name}
                ratio={RATIO_SOURCE}
                crop={card.image.crop}
                frames={card.image.frames}
                // Sol sütun ~650 px (içerik 1360 px'te durur).
                sizes="650px"
                className="w-full !rounded-soft"
              />
            </div>
            <div className="flex flex-col gap-4 py-2">
              <span className="font-sans text-caps-label tracking-[0.14em] text-olive-dark uppercase">{counter(t.candidate)}</span>
              <h1 className="font-serif text-page-title leading-tight text-ink">{card.name}</h1>
              {card.description && <p className="max-w-[520px] font-sans text-body leading-relaxed text-body">{card.description}</p>}
              <p className="max-w-[520px] rounded-soft border border-olive-line bg-card px-4 py-3.25 font-sans text-control leading-normal font-normal text-muted">
                {t.notice}
              </p>

              <div className="mt-auto flex flex-wrap gap-3 pt-3">
                <button type="button" disabled={busy} onClick={() => onVote('like')} className={buttonClass()}>
                  <Icon name="thumbUp" size={18} />
                  {t.likeLong}
                </button>
                <button type="button" disabled={busy} onClick={() => onVote('dislike')} className={buttonClass({ variant: 'secondary' })}>
                  <Icon name="thumbDown" size={18} />
                  {t.dislikeLong}
                </button>
              </div>
              <span className="flex items-center gap-2 font-sans text-field-label font-normal text-muted">
                <kbd className="rounded-md border border-sand-400 bg-card px-1.75 py-0.75 font-sans text-micro font-bold text-body">←</kbd>
                {t.keySkip}
                <kbd className="rounded-md border border-sand-400 bg-card px-1.75 py-0.75 font-sans text-micro font-bold text-body">→</kbd>
                {t.keyLike}
              </span>
            </div>
          </div>
          <DesktopCandidateStrip title={t.round} cards={cards} current={current} decisions={decisions} />
        </>
      ) : (
        // Son oyun yazımı bitmeden puan toplamı eksiktir; bitiş yazım bitince çizilir.
        !busy && (
          <>
            {claimed !== null && (
              <p className="w-max rounded-pill bg-card px-4 py-2 font-sans text-note font-semibold text-olive-dark" role="status">
                {t.claimed.replace('{points}', String(claimed))}
              </p>
            )}
            <DesktopOutcome t={t} cards={cards} decisions={decisions} earned={earned} earnedMoney={earnedMoney} signedIn={signedIn} />
          </>
        )
      )}
    </Band>
  );
}
