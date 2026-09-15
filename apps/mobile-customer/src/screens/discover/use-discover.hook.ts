import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
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

  …AMA TOPLAM ANCAK YOLDA OY KALMAYINCA TAMDIR (MB-16, ölçüm aşağıdaki `writingCount` künyesinde):
  turun son oyu bitiş ekranı çizildiğinde hâlâ geri alma penceresinde bekliyor. `pointsSettling`
  bunu söyler; sayının kendisi değil, "sayı oturdu mu" bilgisi eksikti.

  YAZIM DÜŞERSE KART YİNE İLERLER (web kararı): müşteriyi düzeltemeyeceği bir arızada turun
  ortasında kilitlemeyiz. Düşen yazım yutulmuyor — sonucu burada okunuyor ve tek karşılığı var:
  o kaydırma sayılmaz (puanı eklenmez, kimliği saklanmaz), tur devam eder.

  ── "GERİ AL" NEDEN GECİKMELİ YAZIMLA KURULDU ───────────────────────────────
  Tasarımın yeni sürümü başlık çubuğuna bir "Geri al" eylemi koyuyor. Sunucuda oyu GERİ ALAN bir
  uç YOK ve olmayan bir ucu varmış gibi çağırmak yasak; desteyi sessizce geri sarıp müşteriye
  "geri aldık" demek ise düpedüz YANILTICI olurdu — oy yazılmış olurdu ve talep sinyalinde
  kalırdı. O yüzden geri alınabilirlik yazımın KENDİSİNDEN doğar: bir kaydırma önce burada
  bekler, `UNDO_WINDOW_MS` dolunca yazılır. Pencere içinde geri alınan oy hiç GÖNDERİLMEZ, yani
  geri alma gerçektir.

  Bekleyen oy KAYBOLMAZ: ekran kapanırken (unmount) ve uygulama arka plana düşerken kuyruk
  ANINDA boşaltılır. Kalan tek açık, pencere doluyken uygulamanın öldürülmesidir — o hâlde o tek
  oy yazılmaz ve bu bilinçli bedeldir: alternatifi, geri alınamayan bir "geri al" düğmesiydi.
*/

/**
 * GERİ ALMA PENCERESİ (ms) — bir kaydırmanın sunucuya yazılmadan önce beklediği süre.
 *
 * Tasarımda karşılığı YOK (şablon oyu hiç göndermiyor, yerel bir diziyi ilerletiyor); değer
 * PARAMETRİK bir varsayılan (CLAUDE §4). 6 sn, yanlış yöne kaydırdığını fark edip başlık
 * çubuğuna uzanacak kadar uzun; turun sinyalini anlamlı biçimde geciktirmeyecek kadar kısa.
 * Pencere kart başına ayrı işler — hızlı kaydıran müşteride birkaç oy aynı anda bekleyebilir ve
 * "Geri al" onları sondan başa doğru tek tek çözer (şablonun `kHist` davranışı).
 */
const UNDO_WINDOW_MS = 6000;

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
  /**
   * Bu turda GERÇEKTEN yazılan puanların toplamı. `null` = hiç puan yazılmadı ve yazılamazdı
   * (girişsiz tur) — ekran o hâlde puan çipi çizmez.
   *
   * TAM OLDUĞU AN `pointsSettling === false` ANIDIR: yolda bir oy varken bu sayı turun toplamı
   * değil, o ana kadar CEVABI GELMİŞ oyların toplamıdır.
   */
  awardedPoints: number | null;
  /**
   * Müşterinin GÜNCEL bakiyesi — bitiş ekranının *"Toplam ✦ N puan"* satırı (kullanıcı isteği 15.08).
   *
   * Cevabı gelmiş SON oydan alınır, toplanarak kurulmaz: her yazım kendisinden sonraki bakiyeyi
   * taşıyor (`DiscoverSwipeSchema.balance`) ve sonuncusu en günceli. "Açılıştaki bakiye + bu turda
   * kazanılan" diye kursaydık defterle ayrışırdı — bakiye turun dışında da değişiyor (günlük giriş
   * puanı, davet ödülü, kupona çevirme).
   *
   * `null` = girişsiz tur (hiçbir cevap bakiye taşımadı) ya da hiç yazım oturmadı; ekran o hâlde
   * toplam satırını çizmez, sıfır yazmaz (CLAUDE §1).
   */
  balance: number | null;
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

  /*
    CEVABI BEKLENEN YAZIM SAYISI — puan toplamının "tam mı" sorusunun ikinci yarısı.

    ÖLÇÜLDÜ (MB-16, cihaz 11.08): 4 oy verildi, deftere 8 puan yazıldı, bitiş ekranı "+6" dedi.
    Sebep toplamada bir cevabın kaçması DEĞİL — dördüncü oy o an hâlâ geri alma penceresindeydi,
    yani sunucuya hiç gitmemişti; pencere dolunca toplam kendiliğinden 8 oluyor. Yani sayı yanlış
    hesaplanmıyor, HENÜZ TAMAMLANMAMIŞ bir sayı tam gibi gösteriliyordu.

    Çare toplamı değiştirmek olamaz (sayı motorundur) ve kuyruğu turun sonunda zorla boşaltmak da
    olamaz: bitiş ekranında "Geri al" hâlâ duruyor ve boşaltma onu yalana çevirirdi. Kalan doğru
    davranış hâli SÖYLEMEK: yolda oy varken ekran sayı yazmaz.
  */
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
          if (result.data.id !== null) void appendPendingSwipe(result.data.id);
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
      }, UNDO_WINDOW_MS);
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

  /*
    KUYRUĞUN ACİL ÇIKIŞI — ekran kapanırken ve uygulama arka plana düşerken bekleyen oylar
    pencerelerini beklemeden yazılır. İkisi de aynı gerekçenin iki hâli: müşteri artık ekranda
    değilse geri alamaz, dolayısıyla beklemenin bir karşılığı kalmamıştır ve beklemeye devam
    etmek yalnızca sinyali kaybetme riski üretir.
  */
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
          if (result.data.points > 0) addAwarded(result.data.points);
        });
      })
      .finally(() => setWritingCount((count) => count - 1));
    return () => {
      alive = false;
    };
  }, [signedIn, addAwarded]);

  return {
    status,
    cards,
    awardedPoints,
    balance,
    // Bekleyen kuyruk + cevabı gelmemiş yazım: ikisinden biri doluysa toplam henüz turun toplamı değil.
    pointsSettling: pendingCount > 0 || writingCount > 0,
    vote,
    canUndo: pendingCount > 0,
    undoLastVote,
    retry: load,
  };
}
