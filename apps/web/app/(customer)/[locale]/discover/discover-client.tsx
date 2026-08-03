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
import { DiscoverOutcome } from './components/discover-outcome';
import type { Messages } from './discover-types';

/**
 * Keşif akışının durumu — deste, konum, biriken puan ve talep.
 *
 * **Cihaz çatalı YERLEŞİMDE, mantıkta değil.** İki görünüm aynı desteyi farklı diziyor (mobil
 * birincil biçim, web ortalanmış + klavye); kaydırma mantığı, puan sayacı ve talep tek yerde —
 * ikiye bölmek aynı durum makinesini iki kez yazmak olurdu.
 *
 * ── PUAN İYİMSER SAYILIR AMA UYDURULMAZ ─────────────────────────────────────
 * Sayaç her kaydırmada kart başına puan kadar artıyor; gerçek yazma sunucuda oluyor ve günlük
 * tavana takılabiliyor. Sayacın gösterdiği "bu turda kazanabileceğin" — tasarımın çipi de tur
 * tamamlanınca işleyen bir vaat. Kart başına puan AYARDAN geliyor (`points_feedback_candidate`),
 * ekranda sabit değil: kodlansaydı ayar değiştiği gün ekran sistemin vermeyeceği sayıyı söylerdi.
 *
 * ── TALEP GİRİŞ DÖNÜŞÜNDE KENDİLİĞİNDEN KOŞAR ───────────────────────────────
 * Ziyaretçi kaydırıp giriş yaptıysa, geri döndüğünde tarayıcıda bekleyen kaydırma kimlikleri
 * kapıya gönderilir ve puan hesabına yazılır. Bir düğmeye bağlanmadı: müşteri "puanımı al" diye
 * ikinci bir eylem yapmak zorunda kalsaydı, unutan herkes hak ettiğini kaybederdi.
 */
interface DiscoverClientProps {
  t: Messages;
  locale: Locale;
  device: Device;
  cards: DiscoverCard[];
  signedIn: boolean;
  /** Kart başına puan (ayardan) — sayacın adımı. */
  pointsPerCard: number;
  /** Biriken puanın para karşılığını kuran biçim ("0,12 €") — sunucuda hesaplandı. */
  moneyOf: string;
}

export function DiscoverClient({ t, locale, device, cards, signedIn, pointsPerCard, moneyOf }: DiscoverClientProps) {
  const [index, setIndex] = useState(0);
  const [earned, setEarned] = useState(0);
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState<number | null>(null);
  /** Kartın ekrana geldiği an — `dwell_ms` sinyal kalitesinin girdisi (DOMAIN §14). */
  const shownAt = useRef(Date.now());

  const card = cards[index] ?? null;
  const resolved = useDevice(device);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [index]);

  // Giriş dönüşü: bekleyen kaydırmalar hesaba bağlanır. Girişsizde hiç çalışmaz.
  useEffect(() => {
    if (!signedIn) return;
    const pending = readSwipeIds();
    if (pending.length === 0) return;
    void claimSwipesAction(pending).then((res) => {
      // Liste YALNIZ başarılı talepte silinir: kapı ulaşılamazsa puan tarayıcıda beklemeye devam
      // eder ve sonraki ziyarette yeniden denenir.
      if (!res.data) return;
      clearSwipeIds();
      if (res.data.points > 0) setClaimed(res.data.points);
    });
  }, [signedIn]);

  const vote = useCallback(
    (choice: 'like' | 'dislike') => {
      if (!card || busy) return;
      setBusy(true);
      const dwellMs = Date.now() - shownAt.current;
      void swipeAction(card.productId, choice, dwellMs).then((res) => {
        setBusy(false);
        // Yazma DÜŞSE DE kart ilerler: müşteriyi aynı kartta kilitlemek, düzeltemeyeceği bir
        // arıza için turu bitirmesini engellemek olurdu. Kayıp tek bir sinyal.
        setIndex((i) => i + 1);
        if (!res.data) return;
        // Ziyaretçinin kimliği tarayıcıda saklanır; girişlide gerek yok, puanı zaten yazıldı.
        if (!signedIn && res.data.feedbackId) addSwipeId(res.data.feedbackId);
        setEarned((p) => p + pointsPerCard);
      });
    },
    [card, busy, signedIn, pointsPerCard],
  );

  // Web'de klavye: tasarımın etkileşim sözleşmesi ←/→ istiyor. Mobilde dinleyici hiç kurulmaz.
  useEffect(() => {
    if (resolved === 'mobile' || !card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') vote('like');
      else if (e.key === 'ArrowLeft') vote('dislike');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resolved, card, vote]);

  if (!card) {
    return (
      <>
        {claimed !== null && (
          <p className="mx-auto mt-6 w-max rounded-pill bg-olive-bg px-4 py-2 font-sans text-note font-semibold text-olive-dark" role="status">
            {t.claimed.replace('{points}', String(claimed))}
          </p>
        )}
        <DiscoverOutcome
          t={t}
          signedIn={signedIn}
          earned={earned}
          earnedMoney={moneyOf}
          // Hiç kart gelmediyse tur BİTMEDİ, hiç başlamadı — iki hâl ayrı cümle ister.
          emptyDeck={cards.length === 0}
          compact={resolved === 'mobile'}
        />
      </>
    );
  }

  const view = {
    t,
    locale,
    card,
    position: { index: index + 1, total: cards.length },
    earned,
    signedIn,
    onVote: vote,
    busy,
  };
  return resolved === 'mobile' ? <DiscoverMobile {...view} /> : <DiscoverDesktop {...view} />;
}
