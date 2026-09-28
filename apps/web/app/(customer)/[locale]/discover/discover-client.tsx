'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DISCOVER_UNDO_WINDOW_MS } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import type { DiscoverCard } from '@/lib/feedback/discover';
import { addSwipeId, clearSwipeIds, readSwipeIds } from '@/lib/feedback/discover-store';
import { claimSwipesAction, swipeAction } from './actions';
import { DiscoverDesktop } from './discover.desktop';
import { DiscoverMobile } from './discover.mobile';
import type { DiscoverVote, Messages } from './discover-types';

/**
 * Keşif turunun durumu — deste, konum, puan, beğeni sayısı ve giriş dönüşündeki talep; cihaz çatalı yalnız yerleşimde.
 * Puan sayacı kart başına ayardaki puanı yazım başarılı olunca ekler; ekranda sabit bir sayı yok.
 */
interface DiscoverClientProps {
  t: Messages;
  locale: Locale;
  device: Device;
  cards: DiscoverCard[];
  signedIn: boolean;
  /** Kart başına puan (ayardan) — sayacın adımı. */
  pointsPerCard: number;
  /** Biriken puanın para karşılığı ("0,12 €") — sunucuda hesaplandı. */
  moneyOf: string;
}

/** Sunucuya yazılmayı bekleyen kaydırma; penceresi dolunca gider, geri alınırsa hiç gitmez. */
interface QueuedSwipe {
  productId: string;
  choice: DiscoverVote;
  dwellMs: number;
  timer: number | null;
}

export function DiscoverClient({ t, locale, device, cards, signedIn, pointsPerCard, moneyOf }: DiscoverClientProps) {
  const [decisions, setDecisions] = useState<DiscoverVote[]>([]);
  const [earned, setEarned] = useState(0);
  /** Sunucunun yazdığı puanların toplamı; girişsiz turda hiç sayı dönmez ve `null` kalır. */
  const [awarded, setAwarded] = useState<number | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  /** Cevabı beklenen yazım sayısı: sıfır olmadan puan toplamı tam değildir. */
  const [pending, setPending] = useState(0);
  const queue = useRef<QueuedSwipe[]>([]);
  const [queued, setQueued] = useState(0);
  const [claimed, setClaimed] = useState<number | null>(null);
  /** Kartın ekrana geldiği an — `dwell_ms` sinyal kalitesinin girdisi. */
  const shownAt = useRef(Date.now());

  const index = decisions.length;
  const likes = decisions.filter((d) => d === 'like').length;
  const card = cards[index] ?? null;
  const resolved = useDevice(device);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [index]);

  // Giriş dönüşü: bekleyen kaydırmalar hesaba bağlanır; liste yalnız başarılı talepte silinir ki puan sonraki ziyarette yeniden denensin.
  useEffect(() => {
    if (!signedIn) return;
    const queued = readSwipeIds();
    if (queued.length === 0) return;
    void claimSwipesAction(queued).then((res) => {
      if (!res.data) return;
      clearSwipeIds();
      if (res.data.points > 0) setClaimed(res.data.points);
    });
  }, [signedIn]);

  const send = useCallback(
    (swipe: QueuedSwipe) => {
      setPending((n) => n + 1);
      void swipeAction(swipe.productId, swipe.choice, swipe.dwellMs)
        .then((res) => {
          if (!res.data) return;
          // Ziyaretçinin kimliği tarayıcıda saklanır; girişlide puan zaten yazıldı.
          if (!signedIn && res.data.feedbackId) addSwipeId(res.data.feedbackId);
          // Girişliye sunucunun yazdığı puan eklenir (günlük tavan, ikinci oy); ziyaretçinin sayısı hesap açınca alacağı teklif.
          const points = res.data.pointsAwarded;
          setEarned((p) => p + (points ?? pointsPerCard));
          if (points !== null) setAwarded((p) => (p ?? 0) + points);
          if (res.data.balance !== null) setBalance(res.data.balance);
        })
        .finally(() => setPending((n) => n - 1));
    },
    [signedIn, pointsPerCard],
  );

  // Geri alma yalnız telefonda: masaüstünde "Geri al" yok, bekletmek yalnız sinyali geciktirirdi.
  const undoWindow = resolved === 'mobile' ? DISCOVER_UNDO_WINDOW_MS : 0;

  const vote = useCallback(
    (choice: DiscoverVote) => {
      if (!card) return;
      // Kart yazımı beklemeden ilerler: kaydırma bir jest, ağ beklemesi akışı keser; düşen yazım yalnız bir sinyal kaybıdır.
      setDecisions((d) => [...d, choice]);
      const swipe: QueuedSwipe = { productId: card.productId, choice, dwellMs: Date.now() - shownAt.current, timer: null };
      if (undoWindow === 0) {
        send(swipe);
        return;
      }
      swipe.timer = window.setTimeout(() => {
        const at = queue.current.indexOf(swipe);
        if (at === -1) return;
        queue.current.splice(at, 1);
        setQueued(queue.current.length);
        send(swipe);
      }, undoWindow);
      queue.current.push(swipe);
      setQueued(queue.current.length);
    },
    [card, send, undoWindow],
  );

  /** Son bekleyen kaydırmayı iptal eder: sunucuya hiç gitmemiş oydur, geri alma gerçektir. */
  const undo = useCallback(() => {
    const swipe = queue.current.pop();
    if (!swipe) return;
    if (swipe.timer !== null) window.clearTimeout(swipe.timer);
    setQueued(queue.current.length);
    setDecisions((d) => d.slice(0, -1));
  }, []);

  // Sayfa kapanırken ya da arka plana düşerken bekleyenler hemen yazılır: müşteri artık geri alamaz, beklemek yalnız sinyal kaybettirir.
  useEffect(() => {
    const flush = () => {
      for (const swipe of queue.current.splice(0)) {
        if (swipe.timer !== null) window.clearTimeout(swipe.timer);
        send(swipe);
      }
      setQueued(0);
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [send]);

  // Masaüstünde klavye ←/→; önceki yazım sürerken dinlenmez ki basılı tutulan ok desteyi boşaltmasın.
  useEffect(() => {
    if (resolved === 'mobile' || !card || pending > 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') vote('like');
      else if (e.key === 'ArrowLeft') vote('dislike');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resolved, card, vote, pending]);

  if (resolved === 'mobile') {
    return (
      <DiscoverMobile
        t={t}
        locale={locale}
        deck={cards.slice(index)}
        current={index}
        total={cards.length}
        awarded={awarded}
        balance={balance}
        likes={likes}
        settling={pending + queued > 0}
        signedIn={signedIn}
        onVote={vote}
        canUndo={queued > 0}
        onUndo={undo}
        claimed={claimed}
        emptyDeck={cards.length === 0}
      />
    );
  }

  return (
    <DiscoverDesktop
      t={t}
      cards={cards}
      current={index}
      decisions={decisions}
      earned={earned}
      signedIn={signedIn}
      onVote={vote}
      busy={pending > 0}
      claimed={claimed}
      earnedMoney={moneyOf}
    />
  );
}
