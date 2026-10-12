import { useCallback, useEffect, useRef, useState } from 'react';
import { meetsReviewMinimum, pendingFeedbackComments, previousFeedbackComments, previousFeedbackVotes } from '@lezzet/domain-core';
import type { FeedbackCompletion, FeedbackInvite, FeedbackVote } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import {
  completeFeedback,
  fetchFeedbackInvite,
  submitFeedbackReview,
  submitFeedbackVote,
} from '@/lib/api/feedback';

/*
  Değerlendirme akışının verisi: okuma ve yazma burada, ekran yalnız çizer. Oylar iyimserdir, ama düşen yazım geri alınır, çünkü
  ekranda duran ama sunucuda olmayan cevap müşteriye yapmadığı bir işi yaptığını söyler.
*/

/** İlk yükün hâlleri: `missing` uç 404 dedi (davet yok ya da eskimiş), `error` telin arızası. */
type FeedbackStatus = 'loading' | 'ready' | 'missing' | 'error';

interface UseFeedbackResult {
  status: FeedbackStatus;
  invite: FeedbackInvite | null;
  /** Ürün → oy; açılışta önceki cevaplarla tohumlanır ki yarıda bırakılan akış sürsün. */
  votes: Record<string, FeedbackVote>;
  /** Ürün → yorum metni. */
  comments: Record<string, string>;
  /** Yorum alanı açık ürünler; önceki yorumu olan ürün açık başlar. */
  openComments: ReadonlySet<string>;
  /** "Tamamla"dan sonra alt sınırın altında kalan yorumlar; müşteri yazdıkça işaret kalkar. */
  shortComments: ReadonlySet<string>;
  errorKey: string | null;
  finishing: boolean;
  completion: FeedbackCompletion | null;
  retry: () => void;
  vote: (productId: string, value: FeedbackVote) => void;
  openComment: (productId: string) => void;
  setComment: (productId: string, text: string) => void;
  finish: () => Promise<void>;
}

export function useFeedback(token: string, locale: Locale): UseFeedbackResult {
  const [status, setStatus] = useState<FeedbackStatus>('loading');
  const [invite, setInvite] = useState<FeedbackInvite | null>(null);
  const [votes, setVotes] = useState<Record<string, FeedbackVote>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [openComments, setOpenComments] = useState<ReadonlySet<string>>(new Set());
  const [shortComments, setShortComments] = useState<ReadonlySet<string>>(new Set());
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [completion, setCompletion] = useState<FeedbackCompletion | null>(null);
  const generation = useRef(0);

  const load = useCallback(() => {
    const run = (generation.current += 1);
    setStatus('loading');
    setErrorKey(null);
    void fetchFeedbackInvite(token, locale).then((result) => {
      // Art arda "tekrar dene"nin eski cevabı yazılmaz.
      if (run !== generation.current) return;
      if (result.error !== null) {
        setStatus(result.status === 404 ? 'missing' : 'error');
        return;
      }
      const previous = previousFeedbackComments(result.data.cards);
      setInvite(result.data);
      setVotes(previousFeedbackVotes(result.data.cards));
      setComments(previous);
      setOpenComments(new Set(Object.keys(previous)));
      setStatus('ready');
    });
  }, [locale, token]);

  useEffect(() => {
    load();
  }, [load]);

  const vote = useCallback(
    (productId: string, value: FeedbackVote) => {
      setVotes((prev) => ({ ...prev, [productId]: value }));
      setErrorKey(null);
      void submitFeedbackVote(token, { productId, vote: value }).then((result) => {
        if (result.error === null) return;
        setVotes((prev) => {
          const next = { ...prev };
          delete next[productId];
          return next;
        });
        setErrorKey(result.error);
      });
    },
    [token],
  );

  const openComment = useCallback((productId: string) => {
    setOpenComments((prev) => new Set(prev).add(productId));
  }, []);

  const setComment = useCallback((productId: string, text: string) => {
    setComments((prev) => ({ ...prev, [productId]: text }));
    setShortComments((prev) => {
      if (!prev.has(productId)) return prev;
      const next = new Set(prev);
      next.delete(productId);
      return next;
    });
  }, []);

  const finish = useCallback(async (): Promise<void> => {
    if (invite === null || finishing) return;
    if (invite.cards.some((card) => votes[card.productId] === undefined)) return;

    const pending = pendingFeedbackComments(invite.cards, comments);
    const short = pending.filter((entry) => !meetsReviewMinimum(entry.text, invite.reviewMinWords)).map((entry) => entry.productId);
    if (short.length > 0) {
      setShortComments(new Set(short));
      return;
    }

    setFinishing(true);
    setErrorKey(null);
    // Yorumlar tamamlamadan önce gider; biri düşerse akış açık kalır ki müşteri yazdığına dönebilsin.
    for (const entry of pending) {
      const review = await submitFeedbackReview(token, { productId: entry.productId, comment: entry.text });
      if (review.error === 'comment_too_short') {
        setShortComments(new Set([entry.productId]));
        setFinishing(false);
        return;
      }
      if (review.error !== null) {
        setErrorKey(review.error);
        setFinishing(false);
        return;
      }
    }

    const result = await completeFeedback(token);
    setFinishing(false);
    if (result.error !== null) {
      setErrorKey(result.error);
      return;
    }
    setCompletion(result.data);
  }, [comments, finishing, invite, token, votes]);

  return {
    status,
    invite,
    votes,
    comments,
    openComments,
    shortComments,
    errorKey,
    finishing,
    completion,
    retry: load,
    vote,
    openComment,
    setComment,
    finish,
  };
}
