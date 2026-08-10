'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { FeedbackVote } from '@lezzet/types';
import type { FeedbackCard } from '@/lib/feedback/invite';
import { Button } from '@/components/customer/ui/button';
import { errorText } from '@/lib/customer-error-text';
import type { Messages } from '../feedback-types';

/**
 * Değerlendirme kartı — akışın tek birimi (tasarım: "Geri Bildirim Kart").
 *
 * **👍/👎 seçimi kartın ASIL işi, yorum isteğe bağlı bir derinleşme.** Tasarımın sözleşmesi:
 * "seçim karta işler ve otomatik sonrakine geçer" · "yorum akışı bölmez, atlanabilir". O yüzden
 * oy verilince kart hemen ilerliyor; yorum ise kartın ALTINDA açılıyor ve açıkken ilerleme
 * durduruluyor — müşteri yazarken ekranın altından kayması, yazdığını kaybetmesi demekti.
 *
 * **Ödül tamamlamaya bağlı, beğeniye değil** (DOMAIN §14 · tasarım §6): bu yüzden iki düğme de
 * eşit ağırlıkta çiziliyor ve hiçbir metin "beğenirseniz puan" ima etmiyor. 👍'nın zeytin dolgusu
 * bir teşvik değil, seçili hâlin göstergesi — seçilmemişken ikisi de aynı boş daire.
 */
interface VoteCardProps {
  t: Messages;
  card: FeedbackCard;
  /** Seçili oy — kart geri dönüldüğünde önceki cevabı gösterir (akış kaldığı yerden sürer). */
  vote: FeedbackVote | null;
  onVote: (vote: FeedbackVote) => void;
  onReview: (rating: number | null, comment: string | null) => Promise<string | null>;
  compact?: boolean;
}

export function VoteCard({ t, card, vote, onVote, onReview, compact = false }: VoteCardProps) {
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
        {/* Görsel oranı 3/2 (tasarım). Görselsiz üründe alan yine ayrılıyor: kart yüksekliği
            karttan karta değişseydi akış her geçişte zıplardı. */}
        <div className="relative aspect-3/2 w-full bg-sand-50">
          {card.image.url && <Image src={card.image.url} alt="" fill sizes="(max-width: 768px) 100vw, 460px" className="object-cover" />}
        </div>

        <div className={`flex flex-col items-center gap-3 text-center ${compact ? 'px-5 pb-5 pt-4' : 'px-5 pb-5 pt-4'}`}>
          <span className={`font-serif ${compact ? 'text-h2-sm' : 'text-card-title'} text-ink`}>{card.name}</span>

          <div className="flex gap-4">
            <VoteButton emoji="👎" label={t.disliked} active={vote === 'dislike'} onClick={() => onVote('dislike')} compact={compact} />
            <VoteButton emoji="👍" label={t.liked} active={vote === 'like'} onClick={() => onVote('like')} compact={compact} />
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

      {/* Yorum kartın ALTINDA açılıyor, içinde değil (tasarım: "kart altında açılır"): kartın
          kendisi büyüseydi görsel ve oy düğmeleri yukarı kayar, müşteri az önce bastığı yeri
          kaybederdi. */}
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
          {/* Yayın beklentisi SADE söyleniyor (içerik envanteri §2): müşteri yorumunun anında
              görünmediğini bilmeli, yoksa ürün sayfasına bakıp kaybolduğunu sanır. */}
          <span className="font-sans text-micro leading-relaxed text-muted">{t.reviewNote}</span>
          {errorKey && <span className="font-sans text-note font-semibold text-terracotta">{errorText(t.errors, errorKey)}</span>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" compact={compact} disabled={busy} onClick={() => setOpen(false)}>
              {t.reviewSkip}
            </Button>
            <Button size="sm" compact={compact} disabled={busy} onClick={save}>
              {busy ? t.reviewSaving : t.reviewSave}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Oy düğmesi — tasarımda 64px daire (mobil) / 58px (web).
 *
 * İkisi de envanterin 44px dokunma tabanının çok üstünde; bu ekranın tek elle ve hızlı
 * tamamlanması isteniyor (tasarım §7), hedef bilerek büyük.
 */
function VoteButton({ emoji, label, active, onClick, compact }: { emoji: string; label: string; active: boolean; onClick: () => void; compact: boolean }) {
  return (
    <button type="button" onClick={onClick} className="flex cursor-pointer flex-col items-center gap-1">
      <span
        className={[
          'grid place-items-center rounded-full text-[24px] transition-colors',
          compact ? 'size-16' : 'size-[58px]',
          active ? 'bg-olive' : 'border-2 border-sand-400 bg-card hover:border-olive',
        ].join(' ')}
      >
        {emoji}
      </span>
      <span className={`font-sans text-micro font-semibold ${active ? 'text-olive' : 'text-muted'}`}>{label}</span>
    </button>
  );
}

/**
 * Yıldız satırı — beşi de dokunulabilir; seçili olanın soluna kadar dolar.
 *
 * `button` çünkü yıldız bir SEÇİM; `span`la çizip tıklama dinlemek klavye kullanıcısını dışarıda
 * bırakırdı ve bu ekran zaten tek elle kullanılmak üzere tasarlanmış — erişilebilirlik burada
 * ekstra değil, aynı ihtiyacın devamı.
 */
function StarRow({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          aria-label={String(star)}
          onClick={() => onChange(star)}
          className={`cursor-pointer text-[18px] leading-none transition-colors ${value !== null && star <= value ? 'text-honey' : 'text-sand-400'}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
