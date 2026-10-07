'use client';

import { useState } from 'react';
import { previousFeedbackVotes } from '@lezzet/domain-core';
import type { Locale } from '@lezzet/i18n';
import type { FeedbackVote } from '@lezzet/types';
import { BrandLogo } from '@/components/customer/ui/brand-logo';
import { Link } from '@/i18n/navigation';
import { Button, buttonClass } from '@/components/customer/ui/button';
import { Icon } from '@/components/customer/ui/icons';
import { errorText } from '@/lib/customer-error-text';
import { formatOrderDate } from '@/lib/storefront/format';
import type { FeedbackCompletion, FeedbackInviteView } from '@/lib/feedback/invite';
import { completeAction, reviewAction, voteAction } from './actions';
import { DesktopVoteCard } from './components/desktop-vote-card';
import { DesktopFeedbackOutcome } from './components/desktop-feedback-outcome';
import type { FeedbackCopy, FeedbackStep, FeedbackViewProps, Messages } from './feedback-types';

/**
 * Masaüstünde akış oturumsuz ve sayfa kabuğu olmadan ortalanmış bir sütunda: davet bağlantısından gelen müşteri siteyi gezmeye değil
 * bir işi bitirmeye geldi. Oy dokunulduğu anda yazılır, bu yüzden "Sonra bitir" bir kayıt değil yalnız çıkış.
 */
export function FeedbackDesktop({ locale, token, invite, copy, t }: FeedbackViewProps) {
  // Zaten tamamlanmış davette akış kurulmaz: kartları göstermek puanı ikinci kez kazanılabilirmiş gibi okuturdu.
  const [step, setStep] = useState<FeedbackStep>(invite.completedAt ? 'done' : 'welcome');
  const [completion, setCompletion] = useState<FeedbackCompletion | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  // Oylar iyimser: dokunuşla kart hemen ilerler, sunucu cevabı beklenseydi akış her kartta duraklardı.
  const [votes, setVotes] = useState<Record<string, FeedbackVote>>(() => previousFeedbackVotes(invite.cards));
  // Akış ilk oysuz karttan sürer; yalnız yorum taşıyan kart hâlâ cevapsızdır.
  const [index, setIndex] = useState(() => {
    const first = invite.cards.findIndex((c) => !c.existing?.vote);
    return first === -1 ? 0 : first;
  });

  const card = invite.cards[index];
  const total = invite.cards.length;
  const errors = { ...copy.errors, ...t.errors };

  const vote = (productId: string, value: FeedbackVote) => {
    setVotes((prev) => ({ ...prev, [productId]: value }));
    setErrorKey(null);
    void voteAction(locale, token, productId, value).then(({ errorKey: failed }) => {
      // Yazma düşerse iyimser seçim geri alınır: ekranda duran ama sunucuda olmayan cevap, işin kaydedildiğini söylerdi.
      if (!failed) return;
      setVotes((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
      setErrorKey(failed);
    });
    if (index < total - 1) setIndex(index + 1);
  };

  const finish = async () => {
    setBusy(true);
    setErrorKey(null);
    const { data, errorKey: failed } = await completeAction(token);
    setBusy(false);
    if (!data) return setErrorKey(failed ?? 'unexpected');
    setCompletion(data);
    setStep('done');
  };

  return (
    <div className="flex min-h-screen justify-center bg-cream px-4 py-8">
      <div className="flex w-full max-w-[460px] flex-col">
        {step === 'welcome' && <Welcome copy={copy} t={t} locale={locale} invite={invite} onStart={() => setStep('cards')} />}

        {step === 'cards' && card && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              {/* İlk kartta geri çizilmez: gidilecek yer yok, pasif bir düğme boş bir söz olurdu. */}
              {index > 0 ? (
                <button
                  type="button"
                  onClick={() => setIndex(index - 1)}
                  className="cursor-pointer font-sans text-note font-bold text-muted transition-colors hover:text-ink"
                >
                  ← {copy.back}
                </button>
              ) : (
                <span className="w-9" aria-hidden="true" />
              )}
              <span className="font-sans text-micro text-muted">
                {copy.progress.replace('{current}', String(index + 1)).replace('{total}', String(total))}
              </span>
              <Link href="/catalog" className="cursor-pointer font-sans text-note font-bold text-muted transition-colors hover:text-ink">
                {t.finishLater}
              </Link>
            </div>

            <DesktopVoteCard
              copy={copy}
              t={t}
              card={card}
              vote={votes[card.productId] ?? null}
              onVote={(value) => vote(card.productId, value)}
              onReview={async (rating, comment) => {
                const { errorKey: failed } = await reviewAction(locale, token, card.productId, rating, comment);
                return failed;
              }}
            />

            <ProgressBar done={Object.keys(votes).length} total={total} />

            {errorKey && <span className="text-center font-sans text-note font-semibold text-terracotta">{errorText(errors, errorKey)}</span>}

            {/* Bitirme düğmesi her kart oylanınca görünür: erken göstermek yarıda bırakmaya çağırırdı. */}
            {Object.keys(votes).length === total && (
              <Button size="md" fullWidth disabled={busy} onClick={finish}>
                {busy ? copy.comment.finishing : t.finish}
              </Button>
            )}
          </div>
        )}

        {step === 'done' &&
          (completion ? (
            <DesktopFeedbackOutcome copy={copy} t={t} completion={completion} customerName={invite.customerName} />
          ) : (
            <AlreadyDone copy={copy} t={t} />
          ))}
      </div>
    </div>
  );
}

interface WelcomeProps {
  copy: FeedbackCopy;
  t: Messages;
  locale: Locale;
  invite: FeedbackInviteView;
  onStart: () => void;
}

function Welcome({ copy, t, locale, invite, onStart }: WelcomeProps) {
  const order = [invite.orderReferenceNo, invite.orderedOn && formatOrderDate(invite.orderedOn, locale, true)]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col items-center gap-3.5 py-6 text-center">
      <BrandLogo size="compact" alt="" />
      <h1 className="font-serif text-card-title leading-tight text-ink">{copy.title}</h1>
      <p className="font-sans text-body-sm leading-relaxed text-body">
        {t.welcomeBody.replace('{order}', order).replace('{points}', t.welcomePoints.replace('{n}', String(invite.completionPoints)))}
      </p>
      <button type="button" onClick={onStart} className={buttonClass({ size: 'lg', className: 'mt-1' })}>
        {t.start}
      </button>
    </div>
  );
}

function AlreadyDone({ copy, t }: { copy: FeedbackCopy; t: Messages }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <Icon name="check" size={28} className="text-olive" />
      <span className="font-serif text-card-title text-ink">{copy.already.title}</span>
      <span className="font-sans text-note leading-relaxed text-body">{copy.already.body}</span>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 font-sans text-note font-bold text-olive">
        <Link href="/account" className="cursor-pointer transition-colors hover:text-olive-dark">
          {t.myPoints}
        </Link>
        <Link href="/catalog" className="cursor-pointer transition-colors hover:text-olive-dark">
          {t.toCatalog}
        </Link>
      </div>
    </div>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-pill bg-sand-200">
      <div className="h-full rounded-pill bg-olive transition-[width]" style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }} />
    </div>
  );
}
