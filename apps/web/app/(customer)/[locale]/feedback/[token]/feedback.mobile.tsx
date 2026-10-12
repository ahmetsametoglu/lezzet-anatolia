'use client';

import { useState } from 'react';
import { meetsReviewMinimum, pendingFeedbackComments, previousFeedbackComments, previousFeedbackVotes } from '@lezzet/domain-core';
import type { FeedbackVote } from '@lezzet/types';
import { PointsAward, PointsSpark } from '@/components/customer/phone-kit/points-award';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { SecondaryButton } from '@/components/customer/phone-kit/secondary-button';
import { AppBar } from '@/components/customer/ui/app-bar';
import { BackButton } from '@/components/customer/ui/back-button';
import { Link } from '@/i18n/navigation';
import { errorText } from '@/lib/customer-error-text';
import type { FeedbackCompletion } from '@/lib/feedback/invite';
import { completeAction, reviewAction, voteAction } from './actions';
import { PhoneFeedbackRow } from './components/phone-feedback-row';
import type { FeedbackViewProps } from './feedback-types';

/** Sunucu eylemine hiç ulaşılamadığında (ağ yok) ekranın anahtarı; cümlesi ortak sözlükte. */
const NETWORK = 'network';

/** Native listenin telefon ikizi: siparişin ürünleri tek ekranda, her birine oy ve isteğe bağlı yorum, sonunda teşekkür ve puan. */
export function FeedbackMobile({ locale, token, invite, copy, t }: FeedbackViewProps) {
  const [votes, setVotes] = useState<Record<string, FeedbackVote>>(() => previousFeedbackVotes(invite.cards));
  const [comments, setComments] = useState<Record<string, string>>(() => previousFeedbackComments(invite.cards));
  const [openComments, setOpenComments] = useState<ReadonlySet<string>>(() => new Set(Object.keys(previousFeedbackComments(invite.cards))));
  const [shortComments, setShortComments] = useState<ReadonlySet<string>>(new Set());
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [completion, setCompletion] = useState<FeedbackCompletion | null>(null);

  const cards = invite.cards;
  // Davet zaten tamamlanmışsa akış kurulmaz, çünkü puan ikinci kez verilmez.
  const alreadyDone = invite.completedAt !== null;
  const allVoted = cards.every((card) => votes[card.productId] !== undefined);
  const errors = { ...copy.errors, ...t.errors };

  const vote = (productId: string, value: FeedbackVote) => {
    setVotes((prev) => ({ ...prev, [productId]: value }));
    setErrorKey(null);
    voteAction(locale, token, productId, value)
      .then((result) => result.errorKey)
      .catch(() => NETWORK)
      .then((failed) => {
        // Düşen oy geri alınır: ekranda duran ama sunucuda olmayan cevap işin kaydedildiğini söylerdi.
        if (!failed) return;
        setVotes((prev) => {
          const next = { ...prev };
          delete next[productId];
          return next;
        });
        setErrorKey(failed);
      });
  };

  const changeComment = (productId: string, text: string) => {
    setComments((prev) => ({ ...prev, [productId]: text }));
    setShortComments((prev) => {
      if (!prev.has(productId)) return prev;
      const next = new Set(prev);
      next.delete(productId);
      return next;
    });
  };

  const finish = async () => {
    if (finishing || !allVoted) return;
    const pending = pendingFeedbackComments(cards, comments);
    const short = pending.filter((entry) => !meetsReviewMinimum(entry.text, invite.reviewMinWords)).map((entry) => entry.productId);
    if (short.length > 0) return setShortComments(new Set(short));

    setFinishing(true);
    setErrorKey(null);
    try {
      // Yorumlar tamamlamadan önce gider; biri düşerse akış açık kalır ki müşteri yazdığına dönebilsin.
      for (const entry of pending) {
        const review = await reviewAction(locale, token, entry.productId, null, entry.text);
        if (review.errorKey === 'comment_too_short') return setShortComments(new Set([entry.productId]));
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

  const products = cards.length === 1 ? copy.list.productsOne : copy.list.productsMany.replace('{count}', String(cards.length));
  const eyebrow = invite.orderReferenceNo === null ? products : `${invite.orderReferenceNo} · ${products}`;

  return (
    <div className="flex flex-1 flex-col">
      <AppBar title={copy.title} left={<BackButton label={copy.back} fallback="/" />} />

      {completion === null && !alreadyDone ? (
        <div className="flex flex-col gap-3 px-4.5 pt-4.5 pb-7.5">
          <span className="font-sans text-eyebrow-xs text-terracotta uppercase">{eyebrow}</span>
          <h1 className="font-serif text-h2-sm text-ink">{copy.list.heading}</h1>
          <p className="flex w-max max-w-full items-center gap-1.5 rounded-soft bg-terracotta-bg px-3 py-2 font-sans text-body-sm font-semibold text-terracotta">
            <PointsSpark size={12} />
            {copy.list.rule.replace('{vote}', String(invite.votePoints)).replace('{review}', String(invite.reviewPoints))}
          </p>

          <div className="mt-1 rounded-card bg-sand-250 px-4">
            {cards.map((card, index) => (
              <div key={card.productId} className={index > 0 ? 'border-t-[1.5px] border-dashed border-sand-400' : undefined}>
                <PhoneFeedbackRow
                  card={card}
                  vote={votes[card.productId]}
                  onVote={(value) => vote(card.productId, value)}
                  comment={comments[card.productId] ?? ''}
                  commentOpen={openComments.has(card.productId)}
                  onOpenComment={() => setOpenComments((prev) => new Set(prev).add(card.productId))}
                  onChangeComment={(text) => changeComment(card.productId, text)}
                  short={shortComments.has(card.productId)}
                  reviewPoints={invite.reviewPoints}
                  minWords={invite.reviewMinWords}
                  copy={copy}
                />
              </div>
            ))}
          </div>

          <p className="font-sans text-helper text-muted">{copy.list.note}</p>
          <PrimaryButton
            label={finishing ? copy.comment.finishing : copy.list.finish.replace('{points}', String(invite.completionPoints))}
            shape="block"
            onClick={finish}
            disabled={finishing || !allVoted}
          />
          {errorKey !== null && (
            <p role="alert" className="text-center font-sans text-body-sm text-error">
              {errorText(errors, errorKey)}
            </p>
          )}
        </div>
      ) : (
        // Kalan boşluk 4:6 paylaşılır ki blok sayfanın optik merkezinde dursun (boş durum bloğunun oranı).
        <div className="flex flex-1 flex-col">
          <div className="flex-[4]" />
          <div className="flex flex-col items-center gap-3.5 px-7.5 py-17.5 text-center">
            <PointsSpark size={120} className="text-terracotta" />
            <h1 className="font-serif text-card-title text-ink">{completion === null ? copy.already.title : copy.done.title}</h1>
            {completion === null && <p className="font-sans text-note leading-[1.6] text-body">{copy.already.body}</p>}
            {completion !== null && <PointsAward locale={locale} points={completion.invitePointsTotal} balance={completion.balance} framed />}

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
