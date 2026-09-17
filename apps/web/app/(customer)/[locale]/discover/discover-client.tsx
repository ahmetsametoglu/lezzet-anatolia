'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

export function DiscoverClient({ t, locale, device, cards, signedIn, pointsPerCard, moneyOf }: DiscoverClientProps) {
  const [decisions, setDecisions] = useState<DiscoverVote[]>([]);
  const [earned, setEarned] = useState(0);
  /** Cevabı beklenen yazım sayısı: sıfır olmadan puan toplamı tam değildir. */
  const [pending, setPending] = useState(0);
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

  const vote = useCallback(
    (choice: DiscoverVote) => {
      if (!card) return;
      const dwellMs = Date.now() - shownAt.current;
      // Kart yazımı beklemeden ilerler: kaydırma bir jest, ağ beklemesi akışı keser; düşen yazım yalnız bir sinyal kaybıdır.
      setDecisions((d) => [...d, choice]);
      setPending((n) => n + 1);
      void swipeAction(card.productId, choice, dwellMs)
        .then((res) => {
          if (!res.data) return;
          // Ziyaretçinin kimliği tarayıcıda saklanır; girişlide puan zaten yazıldı.
          if (!signedIn && res.data.feedbackId) addSwipeId(res.data.feedbackId);
          setEarned((p) => p + pointsPerCard);
        })
        .finally(() => setPending((n) => n - 1));
    },
    [card, signedIn, pointsPerCard],
  );

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
        earned={earned}
        likes={likes}
        settling={pending > 0}
        signedIn={signedIn}
        onVote={vote}
        claimed={claimed}
        emptyDeck={cards.length === 0}
        earnedMoney={moneyOf}
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
