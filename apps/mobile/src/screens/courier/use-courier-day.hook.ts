import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ORDER_STATUS_LABELS, type CourierDayStopState, type CourierStopContract } from '@lezzet/types';

import { fetchCourierDay, fetchDayCloseDraft, startCourierDay } from '@/lib/api/courier';
import { useNotice } from '@/lib/haptics/use-notice.hook';
import { fillCopy } from '@/screens/operations/copy';
import { courierCopy } from './copy';

/*
  GÜNÜN ROTASI (K1) — `/courier/day` + `/courier/day-close` + `/courier/day/start`.

  ── NEDEN İKİ OKUMA ─────────────────────────────────────────────────────────
  Tasarımın ilerleme satırı üç şey yazıyor: biten/toplam durak, ilerleme çubuğu ve **cepteki para**
  (v2:63-65). İlk ikisi durak listesinden çıkıyor; üçüncüsü ÇIKMIYOR — `/courier/day` bir durakta
  ne KADAR tahsil edildiğini taşımıyor (yalnız kalan borcu). Tahsil edilmiş toplamın tek dürüst
  kaynağı gün kapanışı taslağının `expected` bloğudur (o da günün tahsilat kayıtlarından türüyor).
  Sayıyı listeden "tahmin etmek" (borcu sıfırlanan durağın tutarını toplamak) önceden ödenmiş
  siparişleri de sayardı ve K7'de sürpriz çıkardı — oysa bu satırın varlık sebebi tam olarak o
  sürprizi önlemek (`design/pages/app-kurye.md` K1).

  ── TASLAK DÜŞERSE LİSTE AYAKTA KALIR, SAYI "BİLİNMİYOR" OLUR ───────────────
  İki okuma birlikte isteniyor ama kaderleri ayrı: rota gelmediyse ekran hata gösterir (gösterecek
  bir şey yok), taslak gelmediyse liste çizilir ve cepteki para `null` döner — okuyan taraf
  "bilinmiyor" yazar. Sıfıra düşürmek dolu bir cebi boş göstermek olurdu (CLAUDE §1).

  ── "YOLA ÇIKTIM" ARTIK GERÇEK BİR YAZIM ────────────────────────────────────
  `POST /courier/day/start` günün HAZIR duraklarını `ready → out_for_delivery` yapıyor; düğme
  yerel bir bayrak değil, kapının kendisi. Cevap tek bir `ok` DEĞİL dört liste (`started` ·
  `alreadyOut` · `stale` · `skipped`) ve kural buradan çıkıyor:

  · **Gün ancak `started + alreadyOut > 0` ise başlamış SAYILIR.** Hepsi atlandıysa (hiçbiri hazır
    değil) kilit AÇILMAZ — açılsaydı kurye durağa girip teslim yazmayı dener ve reddi ancak orada
    görürdü. Kilit kapalı kalınca CTA "Yola çıktım" olarak durur, yani hazırlık bitince ikinci
    basış işini yapar.
  · **`skipped` gizlenmez:** kaç durak ve HANGİ durumda bekliyor, ekranda yazılı. Sebep durumun
    kendisidir; ayrı bir sebep alanı yok.
  · **`stale`** araya birinin girdiğini söyler — liste tazelenir ve kurye uyarılır.
  · Bayrak yerel olduğu için uygulama gün ortasında yeniden başlarsa kilit kapanır; kurye düğmeye
    basar ve cevap `alreadyOut` döner (hata değil, "yapılacak yeni bir şey yok") — kilit kendini
    onarır. Duraklar `out_for_delivery` iken de listede `pending` görünür (durak sonucu sistemin
    durumu değildir), o yüzden kilit listeden TÜRETİLEMEZ.

  Atlanan durak kilit açıldıktan sonra da tıklanabilir kalır ve bu bilinçli: v2 tek bir gün kapısı
  çiziyor (`basladi`), durak başına kilit değil. Yanlış durağa girilirse teslim isteği `stale` /
  `not_allowed` döner ve teslimat ekranı o reddi GÖSTERİR. Satır başına kilit koymak, gün içinde
  hazırlanan bir durağı ikinci bir başlat düğmesi olmadığı için kalıcı olarak kapatırdı.

  ── ODAKTA TAZELENİR ────────────────────────────────────────────────────────
  Teslimat ekranından dönen kurye, az önce yazdığı sonucu listede GÖRMELİ. `useFocusEffect` ilk
  girişte de koşar, yani tek yükleme yolu var; sonraki dönüşlerde iskelet gösterilmez (liste
  yerinde kalır, sessizce tazelenir) — yoksa her geri dönüş ekranı boşaltırdı.
*/

const t = courierCopy;

type CourierDayStatus = 'loading' | 'ready' | 'error';

/** Gün başlatmanın ekrana çıkan tek cümlesi — kısmi başarı da buradan okunur. */
interface StartNotice {
  tone: 'ok' | 'warn' | 'error';
  text: string;
  /**
   * **Yapılacak bir şey KALDI** — atlanan ya da bayat durak var, yani başlatma bitmedi.
   *
   * Bunun ayrı bir bayrak olması şart: gün başladıktan sonra birincil düğme "Günü kapat"a dönüyor
   * ve ikinci bir başlatma yolu olmazsa, gün içinde hazırlanan durak uygulamadan ASLA yola
   * çıkarılamazdı — kurye onu açar, teslim yazmayı dener ve `stale` yer. Ekran bu hâlde ikincil bir
   * "tekrar başlat" sunar.
   */
  canRetry: boolean;
}

interface UseCourierDayResult {
  status: CourierDayStatus;
  /** Uçtan gelen gün (`YYYY-MM-DD`) — istemci kendi hesaplamaz. */
  date: string | null;
  stops: CourierStopContract[];
  /** Bugün tahsil edilmiş toplam (cent). `null` = ÖLÇÜLEMEDİ, sıfır değil. */
  collectedCents: number | null;
  /** Gün yola çıktı mı — durak kilidinin kapısı; uçtan gelen cevapla belirlenir. */
  started: boolean;
  /** Başlatma isteği havada — düğme ikinci kez basılmaz. */
  starting: boolean;
  /** Başlatmanın sonucu (kısmi başarı dahil); `null` = henüz basılmadı. */
  startNotice: StartNotice | null;
  start: () => void;
  reload: () => void;
}

/** Atlanan/bayat durakların O ANDAKİ durumları — tekrarsız ve operasyon dilinde. */
function statusList(stops: readonly CourierDayStopState[]): string {
  return [...new Set(stops.map((stop) => ORDER_STATUS_LABELS[stop.currentStatus]))].join(', ');
}

export function useCourierDay(): UseCourierDayResult {
  const [status, setStatus] = useState<CourierDayStatus>('loading');
  const [date, setDate] = useState<string | null>(null);
  const [stops, setStops] = useState<CourierStopContract[]>([]);
  const [collectedCents, setCollectedCents] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startNotice, setStartNotice] = useNotice<StartNotice>();

  /** Kaçıncı yükün geçerli olduğu — geç gelen eski cevaplar yazılmaz (katalog emsali). */
  const generation = useRef(0);

  const load = useCallback(async () => {
    const run = (generation.current += 1);

    const [dayResult, draftResult] = await Promise.all([fetchCourierDay(), fetchDayCloseDraft()]);
    if (run !== generation.current) return;

    if (dayResult.error !== null) {
      setStatus('error');
      return;
    }

    setDate(dayResult.data.date);
    setStops(dayResult.data.stops);
    setCollectedCents(
      draftResult.error !== null
        ? null
        : draftResult.data.expected.cashCents + draftResult.data.expected.cardCents + draftResult.data.expected.chequeCents,
    );
    setStatus('ready');
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const reload = useCallback(() => {
    setStatus('loading');
    void load();
  }, [load]);

  const start = useCallback(() => {
    if (starting) return;
    setStarting(true);
    setStartNotice(null);

    void (async () => {
      // Ekranın gösterdiği gün gönderilir; gün henüz okunmadıysa alan hiç doğmaz ve kapı bugüne düşer.
      // İkinci basış ZARARSIZDIR: yola çıkmış sipariş `alreadyOut` döner, yeniden yazılmaz.
      const result = await startCourierDay(date === null ? {} : { date });
      setStarting(false);

      if (result.error !== null) {
        setStartNotice({
          tone: 'error',
          text:
            result.error === 'network_error'
              ? t.day.start.network
              : fillCopy(t.day.start.failed, { error: result.error }),
          // Kilit açılmadıysa birincil düğme zaten "Yola çıktım"; başlamış bir günde tel düşerse
          // ikincil yol gerekir (ilk basış geçmiş, ikincisi ağa takılmış olabilir).
          canRetry: started,
        });
        return;
      }

      const { started: startedIds, alreadyOut, stale, skipped } = result.data;
      const onTheRoad = startedIds.length + alreadyOut.length;
      // Kilit YALNIZ gerçekten yola çıkan durak varsa açılır; kapanmaz (geri almak bir yazımı geri
      // almaz, yalnız ekranı yalanlar).
      if (onTheRoad > 0) setStarted(true);

      const parts = [
        startedIds.length > 0 ? fillCopy(t.day.start.started, { n: String(startedIds.length) }) : '',
        alreadyOut.length > 0 ? fillCopy(t.day.start.alreadyOut, { n: String(alreadyOut.length) }) : '',
        skipped.length > 0
          ? fillCopy(t.day.start.skipped, { n: String(skipped.length), statuses: statusList(skipped) })
          : '',
        stale.length > 0 ? fillCopy(t.day.start.stale, { n: String(stale.length) }) : '',
        onTheRoad === 0 ? t.day.start.none : '',
      ].filter((part) => part.length > 0);

      const pending = skipped.length > 0 || stale.length > 0;
      setStartNotice({
        tone: onTheRoad === 0 ? 'error' : pending ? 'warn' : 'ok',
        text: parts.join(' '),
        // Kilit zaten kapalıysa birincil düğme "Yola çıktım" olarak duruyor; ikinci bir yol gerekmez.
        canRetry: pending && onTheRoad > 0,
      });

      // Cevap "durum değişti" diyor; listenin de aynı gerçeği göstermesi gerekir (iskelet YOK —
      // liste yerinde kalır, sessizce tazelenir).
      await load();
    })();
  }, [date, load, started, starting]);

  return {
    status,
    date,
    stops,
    collectedCents,
    started,
    starting,
    startNotice,
    start,
    reload,
  };
}
