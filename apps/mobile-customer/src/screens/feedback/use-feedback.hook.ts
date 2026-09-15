import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedbackCard, FeedbackCompletion, FeedbackInvite, FeedbackVote } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import {
  completeFeedback,
  fetchFeedbackInvite,
  submitFeedbackReview,
  submitFeedbackVote,
} from '@/lib/api/feedback';

/*
  GERİ BİLDİRİM AKIŞININ VERİSİ — talep detay hook'unun (`use-ticket.hook.ts`) deseni: okuma
  yarısı + yazma yarısı tek yerde, ekran yalnız çizer.

  DÖRT OKUMA HÂLİ: `missing` (404 `invalid_link` — bağlantı eskimiş ya da bozuk; "bağlantını
  kontrol et" demek bunu bir ağ arızası gibi gösterirdi), `error` (telin arızası), `ready`,
  `loading`. `guest` YOK ve olmamalı: token oturumun yerine geçiyor (ucun künyesi).

  ── OYLAR İYİMSER, AMA RET GERİ ALIR (web akışının ölçülmüş kararı) ──────────
  Dokunuşla kart hemen ilerler; sunucu cevabı beklenirse akış her kartta duraklar ve "bir dokunuş"
  vaadi düşer. Yazma DÜŞERSE seçim geri alınır ve sebep söylenir — ekranda duran ama sunucuda
  olmayan bir cevap, müşteriye yapmadığı bir işi yaptığını söyler (`feedback-client.tsx` künyesi:
  sepette öğrenilen ders).

  ── AŞAMA BURADA DEĞİL, EKRANDA TÜRETİLİR ───────────────────────────────────
  Hook `votes` haritasını tutar; hangi kartın çizileceği ondan ÇIKAR (ilk oysuz kart). Ayrı bir
  `index` durumu tutulsaydı ret geri alındığında iki durum ayrışırdı — geri alınan oyun kartına
  dönmek ayrıca ele alınmak zorunda kalırdı.
*/

/** İlk yükün dört hâli — `missing` = uç 404 dedi (davet yok/eskimiş), `error` = telin arızası. */
type FeedbackStatus = 'loading' | 'ready' | 'missing' | 'error';

interface UseFeedbackResult {
  status: FeedbackStatus;
  /** Yalnız `ready` hâlinde dolu. */
  invite: FeedbackInvite | null;
  /** Ürün kimliği → oy; açılışta önceki cevaplarla TOHUMLANIR (yarıda bırakılan akış sürsün). */
  votes: Record<string, FeedbackVote>;
  /** Son yazımın ret anahtarı — cümleyi ekran kurar; yeni bir denemede sıfırlanır. */
  errorKey: string | null;
  /** Tamamlama uçuşta — "Değerlendirmeyi tamamla" düğmesi bunu okur. */
  finishing: boolean;
  /** Dolu ise akış bitti: sonuç, puan ve dış değerlendirme bağlantısı CEVAPTAN gelir. */
  completion: FeedbackCompletion | null;
  retry: () => void;
  vote: (productId: string, value: FeedbackVote) => void;
  /** Yorum boşsa yazım ucu HİÇ çağrılmaz; tamamlama her hâlde çağrılır. */
  finish: (comment: string) => Promise<void>;
}

/**
 * Önceki cevaplar — akış ilk OYSUZ karttan sürer.
 *
 * Ölçüt `existing` değil `existing.vote`: bir kart yalnız YORUM taşıyor olabilir (müşteri yazdı
 * ama oy vermedi) ve o kart hâlâ cevapsızdır (sözleşmenin kendi hükmü).
 */
function seedVotes(cards: FeedbackCard[]): Record<string, FeedbackVote> {
  const entries: [string, FeedbackVote][] = [];
  for (const card of cards) {
    if (card.existing?.vote != null) entries.push([card.productId, card.existing.vote]);
  }
  return Object.fromEntries(entries);
}

/**
 * Yorumun hedef ürünü — sözleşme yorumu ÜRÜNE bağlıyor (`productId` zorunlu) ama tasarımın akış
 * sonundaki kutusu tek: "çok ürünlüde hedefi ekran belirler" (sözleşme künyesi).
 *
 * Hedef İLK BEĞENİLEN karttır; hiçbiri beğenilmediyse ilk kart. Gerekçe: yorum ürün sayfasında
 * yayınlanıyor ve beğenilmemiş bir ürünün altına iliştirmek, müşterinin yazdığını başka bir şey
 * gibi okuturdu. Hiç beğeni yoksa da yorum kaybolmamalı — ilk karta yazılır.
 */
function reviewTargetOf(cards: FeedbackCard[], votes: Record<string, FeedbackVote>): string | null {
  const liked = cards.find((card) => votes[card.productId] === 'like');
  return (liked ?? cards[0])?.productId ?? null;
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
      setVotes(seedVotes(result.data.cards));
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

      /* YORUM ÖNCE, TAMAMLAMA SONRA — ve yorum düşerse tamamlama HİÇ çağrılmaz: akış kapanınca
         müşteri o kutuya bir daha dönemez, yani yazdığı metin sessizce kaybolurdu. Metin kutuda
         kalır (talep ekranının kuralı: düşen gönderim taslağı silmez), tek dokunuşla tekrarlanır. */
      const trimmed = comment.trim();
      if (trimmed.length > 0) {
        const productId = reviewTargetOf(invite.cards, votes);
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
