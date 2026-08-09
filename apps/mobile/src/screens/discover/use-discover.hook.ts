import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '@lezzet/i18n';

import {
  claimDiscoverSwipes,
  fetchDiscoverDeck,
  submitDiscoverVote,
  type DiscoverCard,
  type DiscoverVoteInput,
} from '@/lib/api/discover';
import { appendPendingSwipe, clearPendingSwipes, readPendingSwipes } from '@/lib/discover/pending-swipes-store';

/*
  KEŞİF TURU DURUMU (21.19) — ekranın tek veri kapısı: desteyi okur, oyu yazar, girişsiz turu
  hesaba bağlar. Vitrin hook'unun iskeleti (`use-home.hook`): tek durum + eskimiş cevap koruması.

  BOŞ DESTE HATA DEĞİL, AYRI BİR HÂLDİR: `ready` + sıfır kart demek "tur bitmedi, hiç başlamadı"
  demektir ve ekranın bunun için ayrı bir bloğu var. `error`a düşürseydik, aday ürünü olmayan bir
  günü arıza gibi gösterirdik (sözleşme künyesi: `{ cards: [] }` geçerli cevaptır).

  PUAN TOPLAMI MOTORDAN, EKRANDAN DEĞİL: bitiş cümlesinin sayısı her kaydırmanın cevabındaki
  `pointsAwarded` değerlerinin TOPLAMIDIR — kart sayısı × ayar DEĞİL. İkisi ayrışırsa (günlük
  tavan, B2B, aynı ürüne ikinci oy) müşteri gelmeyecek bir ödül için hareket ederdi. Hiç sayı
  dönmediyse toplam `null`dır: girişsiz kaydırmanın ödülü henüz sahipsizdir, SIFIR DEĞİLDİR
  (CLAUDE §1) — ekran o hâlde çip çizmez.

  YAZIM DÜŞERSE KART YİNE İLERLER (web kararı): müşteriyi düzeltemeyeceği bir arızada turun
  ortasında kilitlemeyiz. Düşen yazım yutulmuyor — sonucu burada okunuyor ve tek karşılığı var:
  o kaydırma sayılmaz (puanı eklenmez, kimliği saklanmaz), tur devam eder.
*/

type DiscoverStatus = 'loading' | 'ready' | 'error';

interface UseDiscoverResult {
  status: DiscoverStatus;
  /** Yalnız `ready` hâlinde anlamlı; boş dizi geçerli bir sonuçtur (aday yok). */
  cards: DiscoverCard[];
  /**
   * Bu turda GERÇEKTEN yazılan puanların toplamı. `null` = hiç puan yazılmadı ve yazılamazdı
   * (girişsiz tur) — ekran o hâlde puan çipi çizmez.
   */
  awardedPoints: number | null;
  /** Bir kartın kaydırılması — cevabı beklemeden çağrılır, kart ilerlemesi ekranın işidir. */
  vote: (input: DiscoverVoteInput) => void;
  retry: () => void;
}

export function useDiscover(locale: Locale, signedIn: boolean): UseDiscoverResult {
  const [status, setStatus] = useState<DiscoverStatus>('loading');
  const [cards, setCards] = useState<DiscoverCard[]>([]);
  const [awardedPoints, setAwardedPoints] = useState<number | null>(null);
  const generation = useRef(0);

  const load = useCallback(() => {
    const run = (generation.current += 1);
    setStatus('loading');
    void fetchDiscoverDeck(locale).then((result) => {
      // Eskimiş cevap koruması: art arda iki uçuş varsa yavaş olanın sonucu hızlıyı ezmesin.
      if (run !== generation.current) return;
      if (result.error !== null) {
        setStatus('error');
        return;
      }
      setCards(result.data.cards);
      setStatus('ready');
    });
  }, [locale]);

  useEffect(() => {
    load();
  }, [load]);

  /** Yazılan puan toplama — `null` cevaplar (girişsiz) toplamı BAŞLATMAZ, sıfır saymaz. */
  const addAwarded = useCallback((points: number) => {
    setAwardedPoints((current) => (current ?? 0) + points);
  }, []);

  const vote = useCallback(
    (input: DiscoverVoteInput) => {
      void submitDiscoverVote(input).then((result) => {
        if (result.error !== null) return;
        if (result.data.pointsAwarded !== null) addAwarded(result.data.pointsAwarded);
        // `id` YALNIZ girişsiz kaydırmada dolu: giriş dönüşünde talep kapısına götürülmek üzere
        // cihazda saklanır. Girişli müşteride `null` gelir ve saklanacak bir şey yoktur.
        if (result.data.id !== null) void appendPendingSwipe(result.data.id);
      });
    },
    [addAwarded],
  );

  /*
    TALEP KAPISI — girişsizken biriken kaydırmalar hesaba bağlanır. `signedIn` true olduğu ANDA
    çalışır: hem turu bitirip giriş yapan müşteri (ekran açıkken oturum değişir) hem de başka bir
    yerden giriş yapıp keşfe dönen müşteri aynı kapıdan geçer.

    BİR KEZ: kuyruk temizlenmeden ikinci bir çağrı gitmesin diye kilit ref'te; oturum değişirse
    kilit açılır (çıkış → yeni giriş, yeni kuyruk).
  */
  const claimed = useRef(false);
  useEffect(() => {
    if (!signedIn) {
      claimed.current = false;
      return;
    }
    if (claimed.current) return;
    claimed.current = true;

    let alive = true;
    void readPendingSwipes().then((swipeIds) => {
      if (!alive || swipeIds.length === 0) return;
      return claimDiscoverSwipes(swipeIds).then((result) => {
        if (!alive) return;
        if (result.error !== null) {
          // Kuyruk DURUYOR ve kilit açılıyor: bağlanamamış kaydırma kaybedilmez, bir sonraki
          // açılışta yeniden denenir (yutulan değil, ertelenen bir iş).
          claimed.current = false;
          return;
        }
        // Hiçbiri bağlanamasa bile (`linked: 0`) kuyruk temizlenir: aynı kimlikler her açılışta
        // boşuna taşınırdı — sunucu onları zaten değerlendirdi.
        void clearPendingSwipes();
        if (result.data.points > 0) addAwarded(result.data.points);
      });
    });
    return () => {
      alive = false;
    };
  }, [signedIn, addAwarded]);

  return { status, cards, awardedPoints, vote, retry: load };
}
