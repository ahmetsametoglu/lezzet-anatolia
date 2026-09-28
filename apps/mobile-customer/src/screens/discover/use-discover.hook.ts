import { useCallback, useEffect, useRef, useState } from 'react';
import { DISCOVER_UNDO_WINDOW_MS } from '@lezzet/helper';
import { AppState } from 'react-native';
import type { Locale } from '@lezzet/i18n';
import type { DiscoverReward } from '@lezzet/types';

import {
  claimDiscoverSwipes,
  fetchDiscoverDeck,
  submitDiscoverVote,
  type DiscoverCard,
  type DiscoverVoteInput,
} from '@/lib/api/discover';
import { appendPendingSwipe, clearPendingSwipes, readPendingSwipes } from '@/lib/discover/pending-swipes-store';

/*
  Keşif turunun tek veri kapısı: desteyi okur, oyu yazar, girişsiz turu hesaba bağlar. Puan toplamı kart sayısından değil
  sunucunun yazdığından kurulur; kaydırma geri alma penceresi dolana kadar bekler ki "Geri al" gerçek olsun.
*/

type DiscoverStatus = 'loading' | 'ready' | 'error';

/** Yazılmayı bekleyen tek kaydırma — penceresi dolunca `send`e gider, geri alınırsa hiç gitmez. */
interface PendingVote {
  input: DiscoverVoteInput;
  timer: ReturnType<typeof setTimeout> | null;
}

interface UseDiscoverResult {
  status: DiscoverStatus;
  /** Yalnız `ready` hâlinde anlamlı; boş dizi geçerli bir sonuçtur (aday yok). */
  cards: DiscoverCard[];
  /** Bu turda gerçekten yazılan puan; `null` = girişsiz tur. `pointsSettling` doluyken eksiktir, sayı olarak gösterilmez. */
  awardedPoints: number | null;
  /** Güncel bakiye; cevabı gelen son oydan alınır, çünkü bakiye turun dışında da değişir. `null` = bilinmiyor. */
  balance: number | null;
  /** Kart başına puan ve puanın cent karşılığı; ziyaretçi teklifinin girdisi, ayar okunamadıysa `null`. */
  reward: DiscoverReward | null;
  /** Bu turda kimliksiz yazılan kaydırma sayısı; hesap açılırsa puana dönecek olanlar. */
  guestSwipes: number;
  /** Giriş dönüşünde hesaba yüklenen puan; talep yoksa ya da puan doğmadıysa `null`. */
  claimedPoints: number | null;
  /**
   * Toplam henüz oturmadı mı — yazılmayı bekleyen (geri alma penceresindeki) ya da cevabı
   * gelmemiş bir oy var demektir. `true` iken `awardedPoints` EKSİKTİR ve sayı olarak
   * gösterilmemelidir (MB-16 ölçümü: 4 oy → deftere 8, ekranda 6).
   */
  pointsSettling: boolean;
  /** Bir kartın kaydırılması — cevabı beklemeden çağrılır, kart ilerlemesi ekranın işidir. */
  vote: (input: DiscoverVoteInput) => void;
  /** Geri alınabilir (henüz SUNUCUYA YAZILMAMIŞ) bir kaydırma var mı — "Geri al"ın tek koşulu. */
  canUndo: boolean;
  /**
   * Son bekleyen kaydırmayı iptal eder ve iptal edilen oyu döner; bekleyen yoksa `null`.
   * Dönen değer ekranın işine yarar: beğeni sayacı hangi yönün geri alındığını bilmeden düzeltilemez.
   */
  undoLastVote: () => DiscoverVoteInput | null;
  retry: () => void;
}

export function useDiscover(locale: Locale, signedIn: boolean): UseDiscoverResult {
  const [status, setStatus] = useState<DiscoverStatus>('loading');
  const [cards, setCards] = useState<DiscoverCard[]>([]);
  const [awardedPoints, setAwardedPoints] = useState<number | null>(null);
  /** Son cevabın taşıdığı bakiye — biriktirilmez, ÜZERİNE YAZILIR (arayüz künyesi). */
  const [balance, setBalance] = useState<number | null>(null);
  const [reward, setReward] = useState<DiscoverReward | null>(null);
  const [guestSwipes, setGuestSwipes] = useState(0);
  const [claimedPoints, setClaimedPoints] = useState<number | null>(null);
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
      setReward(result.data.reward);
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

  /* Cevabı beklenen yazım sayısı: son oy hâlâ geri alma penceresindeyken toplam eksiktir, ekran o hâlde sayı değil bekleme
     söyler. */
  const [writingCount, setWritingCount] = useState(0);

  /** Oyun SUNUCUYA gidişi — kuyruğun tek çıkışı; hem pencere dolunca hem toplu boşaltmada burası. */
  const send = useCallback(
    (input: DiscoverVoteInput) => {
      setWritingCount((count) => count + 1);
      void submitDiscoverVote(input)
        .then((result) => {
          if (result.error !== null) return;
          if (result.data.pointsAwarded !== null) addAwarded(result.data.pointsAwarded);
          // Bakiye ödül YAZILMASA DA gelir (tavan · ikinci oy): "şu an ne kadarın var" sorusunun
          // cevabı bu turda ne kazanıldığından bağımsız doğrudur.
          if (result.data.balance !== null) setBalance(result.data.balance);
          // `id` YALNIZ girişsiz kaydırmada dolu: giriş dönüşünde talep kapısına götürülmek üzere
          // cihazda saklanır. Girişli müşteride `null` gelir ve saklanacak bir şey yoktur.
          if (result.data.id !== null) {
            void appendPendingSwipe(result.data.id);
            setGuestSwipes((count) => count + 1);
          }
        })
        // DÜŞEN YAZIM DA BEKLEMEYİ BİTİRİR: o kaydırma sayılmaz (yukarıdaki künye) ve sayının
        // sonsuza kadar "hesaplanıyor" kalması, gelmeyecek bir puanı bekletmek olurdu.
        .finally(() => setWritingCount((count) => count - 1));
    },
    [addAwarded],
  );

  /* Kuyruk REF'te, sayısı DURUMDA: kuyruğun kendisi her kaydırmada değişiyor ve ekranın ondan
     ihtiyacı olan tek şey "geri alınacak bir şey var mı" — diziyi duruma koymak her oyda gereksiz
     bir yeniden çizim demekti. */
  const pending = useRef<PendingVote[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  const vote = useCallback(
    (input: DiscoverVoteInput) => {
      const entry: PendingVote = { input, timer: null };
      entry.timer = setTimeout(() => {
        const at = pending.current.indexOf(entry);
        // Geri alınmış olabilir: kuyrukta yoksa yazılacak bir şey de yok.
        if (at === -1) return;
        pending.current.splice(at, 1);
        setPendingCount(pending.current.length);
        send(entry.input);
      }, DISCOVER_UNDO_WINDOW_MS);
      pending.current.push(entry);
      setPendingCount(pending.current.length);
    },
    [send],
  );

  const undoLastVote = useCallback((): DiscoverVoteInput | null => {
    const entry = pending.current.pop();
    if (entry === undefined) return null;
    if (entry.timer !== null) clearTimeout(entry.timer);
    setPendingCount(pending.current.length);
    return entry.input;
  }, []);

  /* Ekran kapanırken ve uygulama arka plana düşerken bekleyen oylar hemen yazılır, çünkü müşteri geri alamaz. */
  useEffect(() => {
    const flushAll = () => {
      const queued = pending.current.splice(0);
      if (queued.length === 0) return;
      setPendingCount(0);
      for (const entry of queued) {
        if (entry.timer !== null) clearTimeout(entry.timer);
        send(entry.input);
      }
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flushAll();
    });
    return () => {
      subscription.remove();
      flushAll();
    };
  }, [send]);

  /* Girişsiz biriken kaydırmalar oturum açıldığı an hesaba bağlanır; kilit ref'te ki kuyruk temizlenmeden ikinci çağrı gitmesin,
     oturum değişince açılır. */
  const claimed = useRef(false);
  useEffect(() => {
    if (!signedIn) {
      claimed.current = false;
      return;
    }
    if (claimed.current) return;
    claimed.current = true;

    /* Talep de puan doğuran bir yazımdır: cevabı gelmeden turun toplamı oturmuş sayılmaz
       (giriş dönüşünde bitiş ekranı açıkken kapı çalışıyor olabilir). */
    setWritingCount((count) => count + 1);
    let alive = true;
    void readPendingSwipes()
      .then((swipeIds) => {
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
          // Yüklenen puan turun kazancına katılmaz, ayrı söylenir: müşteri önceki turunun karşılığını görmeli.
          if (result.data.points > 0) setClaimedPoints(result.data.points);
        });
      })
      .finally(() => setWritingCount((count) => count - 1));
    return () => {
      alive = false;
    };
  }, [signedIn]);

  return {
    status,
    cards,
    awardedPoints,
    balance,
    reward,
    guestSwipes,
    claimedPoints,
    // Bekleyen kuyruk + cevabı gelmemiş yazım: ikisinden biri doluysa toplam henüz turun toplamı değil.
    pointsSettling: pendingCount > 0 || writingCount > 0,
    vote,
    canUndo: pendingCount > 0,
    undoLastVote,
    retry: load,
  };
}
