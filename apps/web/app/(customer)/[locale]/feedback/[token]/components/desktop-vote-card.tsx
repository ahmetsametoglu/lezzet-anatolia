'use client';

import { useState } from 'react';
import { RATIO_SOURCE, type FeedbackVote } from '@lezzet/types';
import type { FeedbackCard } from '@/lib/feedback/invite';
import { FramedImage } from '@/components/media/framed-image';
import { Button } from '@/components/customer/ui/button';
import { Icon, type IconName } from '@/components/customer/ui/icons';
import { errorText } from '@/lib/customer-error-text';
import type { FeedbackCopy, Messages } from '../feedback-types';

/**
 * Masaüstü akışının tek birimi: oy kartın asıl işi, yorum isteğe bağlı bir derinleşme; oy verilince kart ilerler, yorum açıkken durur
 * ki müşteri yazarken ekran altından kaymasın. İki düğme eşit ağırlıkta, çünkü ödül beğeniye değil tamamlamaya bağlı (DOMAIN §14).
 */
interface DesktopVoteCardProps {
  copy: FeedbackCopy;
  t: Messages;
  card: FeedbackCard;
  /** Seçili oy — kart geri dönüldüğünde önceki cevabı gösterir (akış kaldığı yerden sürer). */
  vote: FeedbackVote | null;
  onVote: (vote: FeedbackVote) => void;
  onReview: (rating: number | null, comment: string | null) => Promise<string | null>;
}

export function DesktopVoteCard({ copy, t, card, vote, onVote, onReview }: DesktopVoteCardProps) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(card.existing?.rating ?? null);
  const [comment, setComment] = useState(card.existing?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setErrorKey(null);
    const failed = await onReview(rating, comment.trim() || null);
    setBusy(false);
    if (failed) return setErrorKey(failed);
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col overflow-hidden rounded-[24px] bg-card shadow-lg">
        {/* Görselsiz üründe de alan ayrılır: kart yüksekliği karttan karta değişseydi akış her geçişte zıplardı. */}
        <FramedImage
          src={card.image.url}
          alt=""
          ratio={RATIO_SOURCE}
          crop={card.image.crop}
          frames={card.image.frames}
          sizes="460px"
          className="!rounded-none !bg-sand-50"
        />

        <div className="flex flex-col items-center gap-3 px-5 pt-4 pb-5 text-center">
          <span className="font-serif text-card-title text-ink">{card.name}</span>

          <div className="flex gap-4">
            <VoteButton icon="thumbDown" label={copy.vote.dislike} active={vote === 'dislike'} onClick={() => onVote('dislike')} />
            <VoteButton icon="thumbUp" label={copy.vote.like} active={vote === 'like'} onClick={() => onVote('like')} />
          </div>

          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="cursor-pointer font-sans text-note font-semibold text-olive transition-colors hover:text-olive-dark"
            >
              {t.writeInvite} <span className="font-normal text-muted">{t.writeOptional}</span>
            </button>
          )}
        </div>
      </div>

      {/* Yorum kartın altında açılır: kart büyüseydi görsel ve oy düğmeleri yukarı kayar, müşteri az önce bastığı yeri kaybederdi. */}
      {open && (
        <div className="flex flex-col gap-2.5 rounded-card border border-sand-200 bg-card px-4 py-3.5">
          <StarRow value={rating} onChange={setRating} />
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder={t.reviewPlaceholder}
            className="resize-none rounded-soft border border-sand-300 px-3 py-2.5 font-sans text-body-sm leading-relaxed text-ink outline-none transition-colors placeholder:text-sand-600 focus:border-olive"
          />
          {/* Müşteri yorumunun anında görünmediğini bilmeli, yoksa ürün sayfasına bakıp kaybolduğunu sanır. */}
          <span className="font-sans text-micro leading-relaxed text-muted">{t.reviewNote}</span>
          {errorKey && (
            <span className="font-sans text-note font-semibold text-terracotta">{errorText({ ...copy.errors, ...t.errors }, errorKey)}</span>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>
              {t.reviewSkip}
            </Button>
            <Button size="sm" disabled={busy} onClick={save}>
              {busy ? t.reviewSaving : t.reviewSave}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Oy düğmesi 58 px'lik daire: dokunma tabanının çok üstünde, çünkü ekranın hızlı tamamlanması isteniyor. */
function VoteButton({ icon, label, active, onClick }: { icon: IconName; label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex cursor-pointer flex-col items-center gap-1">
      <span
        className={[
          'grid size-[58px] place-items-center rounded-full transition-colors',
          active ? 'bg-olive text-white' : 'border-2 border-sand-400 bg-card text-ink hover:border-olive',
        ].join(' ')}
      >
        <Icon name={icon} size={24} />
      </span>
      <span className={`font-sans text-micro font-semibold ${active ? 'text-olive' : 'text-muted'}`}>{label}</span>
    </button>
  );
}

/** Yıldız satırı: yıldız bir seçim olduğu için düğmedir, böylece klavye kullanıcısı da seçebilir. */
function StarRow({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          aria-label={String(star)}
          onClick={() => onChange(star)}
          className={`cursor-pointer transition-colors ${value !== null && star <= value ? 'text-honey' : 'text-sand-400'}`}
        >
          <Icon name="star" size={18} />
        </button>
      ))}
    </div>
  );
}
