'use client';

import { meetsReviewMinimum } from '@lezzet/domain-core';
import { ICON_STROKE, THUMB_PATH } from '@lezzet/design-tokens/icons';
import type { FeedbackVote } from '@lezzet/types';
import { FormTextareaField } from '@/components/customer/form/form-textarea-field';
import { CirclePhoto } from '@/components/customer/phone-kit/circle-photo';
import { HapticTarget } from '@/components/customer/phone-kit/haptic-target';
import { Tag } from '@/components/customer/phone-kit/tag';
import type { FeedbackCard } from '@/lib/feedback/invite';
import type { FeedbackCopy } from '../feedback-types';

/** Satırın ürün dairesi ve oy dairesi; native listeyle aynı ölçü. */
const ROW_PHOTO = 52;

interface PhoneFeedbackRowProps {
  card: FeedbackCard;
  vote: FeedbackVote | undefined;
  onVote: (value: FeedbackVote) => void;
  comment: string;
  commentOpen: boolean;
  onOpenComment: () => void;
  onChangeComment: (text: string) => void;
  /** "Tamamla"dan sonra yorum alt sınırın altında kaldıysa uyarı çizilir. */
  short: boolean;
  reviewPoints: number;
  minWords: number;
  copy: FeedbackCopy;
}

/** Değerlendirme listesinin bir ürünü: oy daireleri satırda, yorum alanı altında; rozet yorumun puanını söyler. */
export function PhoneFeedbackRow({
  card,
  vote,
  onVote,
  comment,
  commentOpen,
  onOpenComment,
  onChangeComment,
  short,
  reviewPoints,
  minWords,
  copy,
}: PhoneFeedbackRowProps) {
  const points = copy.list.points.replace('{points}', String(reviewPoints));
  // Yeterli yorum rozeti zeytine çevirir; ödülün hak edildiğini yazı eklemeden söyler.
  const earned = meetsReviewMinimum(comment, minWords);

  return (
    <div className="flex flex-col gap-3 py-4">
      <div className="flex items-center gap-4">
        <CirclePhoto image={card.image} initial={card.name.slice(0, 1)} size={ROW_PHOTO} initialClassName="text-card-title text-muted" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-sans text-control font-bold text-ink">{card.name}</span>
          {card.detail.length > 0 && <span className="font-sans text-helper text-body">{card.detail}</span>}
        </div>
        <VoteDot kind="dislike" selected={vote === 'dislike'} label={copy.vote.dislike} onClick={() => onVote('dislike')} />
        <VoteDot kind="like" selected={vote === 'like'} label={copy.vote.like} onClick={() => onVote('like')} />
      </div>

      {commentOpen ? (
        <FormTextareaField
          label={copy.list.commentLabel.replace('{product}', card.name)}
          hideLabel
          value={comment}
          onChange={(event) => onChangeComment(event.target.value)}
          placeholder={copy.list.commentPlaceholder.replace('{product}', card.name)}
          rows={3}
          variant="soft"
          height="short"
          error={short ? copy.list.minWords.replace('{count}', String(minWords)) : undefined}
          footerAside={<Tag label={earned ? `✓ ${points}` : points} tone={earned ? 'olive' : 'terracotta'} rotate={-2} />}
        />
      ) : (
        <button
          type="button"
          onClick={onOpenComment}
          className="ml-17 flex w-max cursor-pointer items-center gap-2 font-sans text-body-sm font-bold text-olive transition-colors hover:text-olive-dark"
        >
          ＋ {copy.list.addComment}
          <Tag label={points} tone="soft" />
        </button>
      )}
    </div>
  );
}

interface VoteDotProps {
  kind: FeedbackVote;
  selected: boolean;
  label: string;
  onClick: () => void;
}

/** Oy dairesi: seçiliyken kendi rengiyle dolar, seçili değilken çerçeveli kalır. */
function VoteDot({ kind, selected, label, onClick }: VoteDotProps) {
  const like = kind === 'like';
  const filled = like ? 'border-olive bg-olive text-card' : 'border-terracotta bg-terracotta text-card';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      className={[
        'relative flex size-10.5 flex-none cursor-pointer items-center justify-center rounded-full border-[1.5px] transition-[scale,background-color] active:scale-[0.94]',
        selected ? filled : 'border-sand-400 bg-card text-muted hover:bg-sand-150',
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
      <HapticTarget />
    </button>
  );
}
