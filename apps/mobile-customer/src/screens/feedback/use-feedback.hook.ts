import { useCallback, useEffect, useRef, useState } from 'react';
import { feedbackReviewTarget, previousFeedbackVotes } from '@lezzet/domain-core';
import type { FeedbackCompletion, FeedbackInvite, FeedbackVote } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import {
  completeFeedback,
  fetchFeedbackInvite,
  submitFeedbackReview,
  submitFeedbackVote,
} from '@/lib/api/feedback';

/*
  Değerlendirme akışının verisi: okuma ve yazma tek yerde, ekran yalnız çizer. Oylar iyimserdir ki akış her kartta duraklamasın,
  ama düşen yazım geri alınır, çünkü ekranda duran ama sunucuda olmayan cevap müşteriye yapmadığı bir işi yaptığını söyler.
*/

/** İlk yükün dört hâli — `missing` = uç 404 dedi (davet yok/eskimiş), `error` = telin arızası. */
type FeedbackStatus = 'loading' | 'ready' | 'missing' | 'error';

interface UseFeedbackResult {
  status: FeedbackStatus;
  /** Yalnız `ready` hâlinde dolu. */
  invite: FeedbackInvite | null;
  /** Ürün kimliği → oy; açılışta önceki cevaplarla tohumlanır ki yarıda bırakılan akış sürsün. */
  votes: Record<string, FeedbackVote>;
  /** Son yazımın ret anahtarı — cümleyi ekran kurar; yeni bir denemede sıfırlanır. */
  errorKey: string | null;
  /** Tamamlama uçuşta — "Değerlendirmeyi tamamla" düğmesi bunu okur. */
  finishing: boolean;
  /** Dolu ise akış bitti: sonuç, puan ve dış değerlendirme bağlantısı cevaptan gelir. */
  completion: FeedbackCompletion | null;
  retry: () => void;
  vote: (productId: string, value: FeedbackVote) => void;
  /** Yorum boşsa yazım ucu hiç çağrılmaz; tamamlama her hâlde çağrılır. */
  finish: (comment: string) => Promise<void>;
}

export function useFeedback(token: string, locale: Locale): UseFeedbackResult {
  const [status, setStatus] = useState<FeedbackStatus>('loading');
  const [invite, setInvite] = useState<FeedbackInvite | null>(null);
  const [votes, setVotes] = useState<Record<string, FeedbackVote>>({});
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [completion, setCompletion] = useState<FeedbackCompletion | null>(null);
  const generation = useRef(0);

  const load = useCallback(() => {
    const run = (generation.current += 1);
    setStatus('loading');
    setErrorKey(null);
    void fetchFeedbackInvite(token, locale).then((result) => {
      // "Tekrar dene"ye art arda basan parmağın iki uçuşu: eski cevap sayacı tutmadığı için yazılmaz.
      if (run !== generation.current) return;
      if (result.error !== null) {
        setStatus(result.status === 404 ? 'missing' : 'error');
        return;
      }
      setInvite(result.data);
      setVotes(previousFeedbackVotes(result.data.cards));
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

  const finish = useCallback(
    async (comment: string): Promise<void> => {
      if (invite === null || finishing) return;
      setFinishing(true);
      setErrorKey(null);

      /* Yorum önce, tamamlama sonra; yorum düşerse tamamlama çağrılmaz, çünkü akış kapanınca müşteri o kutuya dönemez ve yazdığı
         sessizce kaybolurdu. */
      const trimmed = comment.trim();
      if (trimmed.length > 0) {
        const productId = feedbackReviewTarget(invite.cards, votes);
        if (productId !== null) {
          const review = await submitFeedbackReview(token, { productId, comment: trimmed });
          if (review.error !== null) {
            setFinishing(false);
            setErrorKey(review.error);
            return;
          }
        }
      }

      const result = await completeFeedback(token);
      setFinishing(false);
      if (result.error !== null) {
        setErrorKey(result.error);
        return;
      }
      setCompletion(result.data);
    },
    [finishing, invite, token, votes],
  );

  return { status, invite, votes, errorKey, finishing, completion, retry: load, vote, finish };
}
