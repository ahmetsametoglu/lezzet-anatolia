'use client';

import { useState } from 'react';
import { feedbackReviewTarget, previousFeedbackVotes } from '@lezzet/domain-core';
import { ICON_STROKE, THUMB_PATH } from '@lezzet/design-tokens/icons';
import { RATIO_SQUARE, type FeedbackVote } from '@lezzet/types';
import { HapticTarget } from '@/components/customer/phone-kit/haptic-target';
import { PhotoSurface } from '@/components/customer/phone-kit/photo-surface';
import { PointsAward, PointsSpark } from '@/components/customer/phone-kit/points-award';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { SecondaryButton } from '@/components/customer/phone-kit/secondary-button';
import { Tag } from '@/components/customer/phone-kit/tag';
import { AppBar } from '@/components/customer/ui/app-bar';
import { BackButton } from '@/components/customer/ui/back-button';
import { Link } from '@/i18n/navigation';
import { errorText } from '@/lib/customer-error-text';
import type { FeedbackCompletion } from '@/lib/feedback/invite';
import { completeAction, reviewAction, voteAction } from './actions';
import type { FeedbackViewProps } from './feedback-types';

/** Sunucu eylemine hiç ulaşılamadığında (ağ yok) ekranın anahtarı; cümlesi ortak sözlükte. */
const NETWORK = 'network';

/**
 * Native akışın telefon ikizi: ürün ürün oy, oylar bitince tek yorum, sonunda teşekkür ve puan. Aşama türetilir (ilk oysuz kart), ayrıca
 * saklanmaz ki geri alınan bir oy ekranı kendiliğinden o karta döndürsün.
 */
export function FeedbackMobile({ locale, token, invite, copy, t }: FeedbackViewProps) {
  const [votes, setVotes] = useState<Record<string, FeedbackVote>>(() => previousFeedbackVotes(invite.cards));
  const [comment, setComment] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [completion, setCompletion] = useState<FeedbackCompletion | null>(null);

  const cards = invite.cards;
  const index = cards.findIndex((entry) => votes[entry.productId] === undefined);
  const card = index === -1 ? null : (cards[index] ?? null);
  // Davet zaten tamamlanmışsa akış kurulmaz, çünkü puan ikinci kez verilmez.
  const alreadyDone = invite.completedAt !== null;
  const errors = { ...copy.errors, ...t.errors };

  const vote = (productId: string, value: FeedbackVote) => {
    setVotes((prev) => ({ ...prev, [productId]: value }));
    setErrorKey(null);
    voteAction(locale, token, productId, value)
      .then((result) => result.errorKey)
      .catch(() => NETWORK)
      .then((failed) => {
        // Düşen oy geri alınır: ekranda duran ama sunucuda olmayan cevap, işin kaydedildiğini söylerdi.
        if (!failed) return;
        setVotes((prev) => {
          const next = { ...prev };
          delete next[productId];
          return next;
        });
        setErrorKey(failed);
      });
  };

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    setErrorKey(null);
    try {
      // Yorum önce gider; düşerse tamamlama çağrılmaz, çünkü akış kapanınca müşteri yazdığı kutuya dönemez.
      const trimmed = comment.trim();
      const target = trimmed.length > 0 ? feedbackReviewTarget(cards, votes) : null;
      if (target !== null) {
        const review = await reviewAction(locale, token, target, null, trimmed);
        if (review.errorKey) return setErrorKey(review.errorKey);
      }
      const done = await completeAction(token);
      if (!done.data) return setErrorKey(done.errorKey ?? 'unexpected');
      setCompletion(done.data);
    } catch {
      setErrorKey(NETWORK);
    } finally {
      setFinishing(false);
    }
  };

  const errorLine =
    errorKey === null ? null : (
      <p role="alert" className="px-5.5 pb-2 text-center font-sans text-body-sm text-error">
        {errorText(errors, errorKey)}
      </p>
    );

  return (
    <div className="flex flex-1 flex-col">
      <AppBar
        title={copy.title}
        left={<BackButton label={copy.back} fallback="/" />}
        right={
          card !== null && !alreadyDone ? (
            <span className="font-sans text-badge text-muted">
              {copy.progress.replace('{current}', String(index + 1)).replace('{total}', String(cards.length))}
            </span>
          ) : undefined
        }
      />

      {card !== null && !alreadyDone ? (
        <div className="flex flex-col pb-7.5">
          <div className="relative h-95">
            <PhotoSurface image={card.image} initial={card.name.slice(0, 1)} ratio={RATIO_SQUARE} sizes="100vw" scrim className="absolute inset-0" />
            {invite.orderReferenceNo !== null && (
              <span className="absolute top-3.5 right-4">
                <Tag label={invite.orderReferenceNo} tone="cream" rotate={3} shadow />
              </span>
            )}
            <div className="absolute inset-x-5.5 bottom-4.5 flex flex-col gap-1">
              <span className="font-sans text-eyebrow text-olive-light">{copy.vote.eyebrow}</span>
              <h1 className="font-serif text-page-title-sm text-on-image">{card.name}</h1>
            </div>
          </div>
          <div className="flex gap-4 px-5.5 py-5">
            <VoteButton kind="dislike" label={copy.vote.dislike} onClick={() => vote(card.productId, 'dislike')} />
            <VoteButton kind="like" label={copy.vote.like} onClick={() => vote(card.productId, 'like')} />
          </div>
          {/* Ret satırı düğmelerin altında: geri alınan oyun kartı yeniden çizildi, sebep dokunulan yerin yanında durmalı. */}
          {errorLine}
          <p className="px-7.5 text-center font-sans text-helper leading-[1.6] text-muted">{copy.vote.hint}</p>
        </div>
      ) : completion === null && !alreadyDone ? (
        <div className="flex flex-col gap-3.5 px-5.5 py-5">
          <h1 className="font-serif text-h2-sm text-ink">{copy.comment.title}</h1>
          <p className="font-sans text-note leading-[1.6] text-body">{copy.comment.body}</p>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            aria-label={copy.comment.label}
            placeholder={copy.comment.placeholder}
            className="min-h-27.5 w-full resize-none rounded-control border-[1.5px] border-sand-400 bg-card px-4 py-3.5 font-sans text-body-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-olive"
          />
          <PrimaryButton label={finishing ? copy.comment.finishing : copy.comment.finish} shape="block" onClick={finish} disabled={finishing} />
          {/* Tamamlama düştüyse metin kutuda kalır, tek dokunuşla tekrarlanır. */}
          {errorLine}
        </div>
      ) : (
        // Kalan boşluk 4:6 paylaşılır ki blok sayfanın optik merkezinde dursun (boş durum bloğunun oranı).
        <div className="flex flex-1 flex-col">
          <div className="flex-[4]" />
          <div className="flex flex-col items-center gap-3.5 px-7.5 py-17.5 text-center">
            <PointsSpark size={120} className="text-terracotta" />
            <h1 className="font-serif text-card-title text-ink">{completion === null ? copy.already.title : copy.done.title}</h1>
            {completion === null && <p className="font-sans text-note leading-[1.6] text-body">{copy.already.body}</p>}
            {completion !== null && <PointsAward locale={locale} points={completion.invitePointsTotal} balance={completion.balance} />}

            {completion?.outcome === 'review_invite' && completion.reviewUrl !== null && completion.reviewPlatform !== null && (
              <>
                <p className="font-sans text-note leading-[1.6] text-body">{copy.done.reviewBody.replace('{platform}', completion.reviewPlatform)}</p>
                <SecondaryButton
                  label={copy.done.reviewCta.replace('{platform}', completion.reviewPlatform)}
                  shape="pill"
                  externalHref={completion.reviewUrl}
                />
              </>
            )}

            {completion?.outcome === 'report_issue' && (
              <>
                <p className="font-sans text-note leading-[1.6] text-body">{copy.done.issueBody}</p>
                {/* Kitin ikincil hap düğmesinde terracotta metin yok; yüzey ve ölçüler o düğmenin hap durağıyla aynı. */}
                <Link
                  href={{ pathname: '/support/new', query: { order: invite.orderId } }}
                  className="inline-flex h-11.5 cursor-pointer items-center justify-center rounded-pill border-[1.5px] border-sand-400 bg-card px-5.5 font-sans text-button text-terracotta transition-[scale,background-color] hover:bg-sand-150 active:scale-[0.97]"
                >
                  {copy.done.issueCta}
                </Link>
              </>
            )}

            <div className="mt-1">
              <PrimaryButton label={copy.done.home} href="/" />
            </div>
          </div>
          <div className="flex-[6]" />
        </div>
      )}
    </div>
  );
}

interface VoteButtonProps {
  kind: FeedbackVote;
  label: string;
  onClick: () => void;
}

/** Oy düğmesi: gölgeli "beğendim" basılınca gölgesini yutarak kayar, gölgesiz "beğenmedim" küçülür. */
function VoteButton({ kind, label, onClick }: VoteButtonProps) {
  const like = kind === 'like';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={[
        'relative flex h-14 flex-1 cursor-pointer items-center justify-center gap-2 rounded-control font-sans text-button transition-[scale,translate,box-shadow,background-color]',
        like
          ? 'bg-olive text-card shadow-hard hover:bg-olive-dark active:translate-x-[3px] active:translate-y-[3px] active:shadow-none'
          : 'border-[1.5px] border-ink text-ink hover:bg-sand-150 active:scale-[0.97]',
      ].join(' ')}
    >
      <svg
        width={17}
        height={17}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={ICON_STROKE.base}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={like ? undefined : 'rotate-180'}
      >
        <path d={THUMB_PATH} />
      </svg>
      {label}
      <HapticTarget />
    </button>
  );
}
