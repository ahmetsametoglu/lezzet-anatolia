import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ORDER_STATUS_LABELS,
  type CourierDayResponse,
  type CourierDayStopState,
  type CourierRoute,
  type CourierRunDetail,
  type CourierStopContract,
  type CourierVehicle,
} from '@lezzet/types';

import {
  departCourierRun,
  discardCourierRun,
  fetchCourierDay,
  fetchCourierRoutes,
  fetchCourierVehicles,
  fetchDayCloseDraft,
  loadCourierBox,
  startCourierDay,
} from '@/lib/api/courier';
import { toastError, toastSuccess, toastWarning } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { fillCopy } from '@/screens/operations/copy';
import { courierCopy } from './copy';

/*
  Günün seferi: "başladı" hâli yerel bayrak değil sunucudaki sefer kaydıdır (`/courier/day` → `run`), bu yüzden uygulama kapanıp açılsa da aynı cevap gelir; sefer yoksa ya da kapandıysa gövde rota seçimi gösterir.
  Cepteki para yalnız kapanış taslağından okunur, çünkü liste tahsil edileni değil kalan borcu taşır; ikincil okuma düşerse liste ayakta kalır ve para sıfır değil "bilinmiyor" olur.
*/

const t = courierCopy;

type CourierDayStatus = 'loading' | 'ready' | 'error';

/** Sefer başlatmanın ekrana çıkan tek cümlesi — kısmi başarı da buradan okunur. */
interface StartNotice {
  tone: 'ok' | 'warn' | 'error';
  text: string;
  /**
   * **Yapılacak bir şey KALDI** — atlanan ya da bayat durak var, yani başlatma bitmedi. Sefer
   * açıldıktan sonra birincil düğme "Seferi kapat"a döndüğü için ikinci bir başlatma yolu
   * olmazsa hazırlığı geciken durak uygulamadan hiç yola çıkarılamaz (yukarıdaki BEKLEYEN).
   */
  canRetry: boolean;
}

interface UseCourierDayResult {
  status: CourierDayStatus;
  /** Uçtan gelen gün (`YYYY-MM-DD`) — istemci kendi hesaplamaz. */
  date: string | null;
  /**
   * **SÜRÜLEN sefer** — yola çıkmış ve kapanmamış olan; `null` = araçta yük olsa da sürülen sefer
   * yok. Ekranın üç hâlinden hangisinin çizileceğini `runs` ile birlikte söyler (v3:14).
   */
  run: CourierRunDetail | null;
  /**
   * Araçtaki seferler: kurulmuş ve kapanmamış olanların hepsi, gün sırasıyla; `departedAt: null` olan araçta bekler, kutuları okutulabilir ama durakları açılmamıştır.
   */
  runs: CourierRunDetail[];
  /** Seçilebilir + başkasında olan rotalar (araca sefer eklerken okunur). */
  routes: CourierRoute[];
  /** Kuryenin deposunun araçları — biri seçilir, kurulan seferlere yazılır. */
  vehicles: CourierVehicle[];
  /** Araca alınacak olarak işaretlenen rotalar; tek aday varsa kendiliğinden işaretlidir, çünkü tek adayda soru sorulmaz. */
  selectedZoneIds: string[];
  toggleRoute: (zoneId: string) => void;
  selectedVehicleId: string | null;
  selectVehicle: (vehicleId: string | null) => void;
  /**
   * Seçilen rotalar için seferleri kurar (yola çıkarmaz) ve sonucu döner; yönlendirmeye ekran karar verir, çünkü kanca router'ı bilmez.
   */
  openRuns: () => Promise<'ok' | 'partial' | 'failed'>;
  /**
   * **Seferi YOLA ÇIKAR** (durakları açar, müşteriye haber gider) — sonuç DÖNER ve ekran yalnız
   * TEMİZ başlangıçta yer değiştirir.
   * `awaiting` (kutu okutulmayı bekliyor) ve `blocked` (başka sefer sürülüyor) dallarında
   * yapılacak iş BU ekranda: kurye burada kalmalı.
   */
  departRun: (runId: string) => Promise<'ok' | 'awaiting' | 'blocked' | 'failed'>;
  /**
   * Kurulmuş ama BAŞLAMAMIŞ seferi araçtan çıkarır: siparişler serbest kalır, kutuların araç
   * damgası silinir, sefer kaydı düşer. `routeLabel` yalnız sonuç cümlesi için — kanca ekranın
   * elindeki adı ikinci kez okumaz.
   */
  discardRun: (runId: string, routeLabel: string) => void;
  stops: CourierStopContract[];
  /** Askıda kalan duraklar: teslim günü geçmiş, sonuçlanmamış, kutusu araçta olabilir; kurye yalnız görür, yeni günü sevkiyat seçer. */
  stranded: CourierDayResponse['stranded'];
  /** Bugün tahsil edilmiş toplam (cent). `null` = ÖLÇÜLEMEDİ, sıfır değil. */
  collectedCents: number | null;
  /** Sefer sürülüyor mu — durak kilidinin kapısı; sunucudaki sefer kaydından TÜRER. */
  started: boolean;
  /** Başlatma isteği havada — düğme ikinci kez basılmaz. */
  starting: boolean;
  /**
   * Kısmi başarıdan sonra "kalanları yola çıkar" ikinci basışı açık mı: atlanmış ya da bayatlamış durak kaldığında ve yola çıkarma isteği düştüğünde `true` olur.
   * İkisinde de çare aynı düğmeye yeniden basmaktır; metin toast'tadır.
   */
  canRetryStart: boolean;
  start: () => void;
  reload: () => void;
  /** Yükleme sayacı duraklardaki kutu damgalarından türer; `null` = kutulu sipariş yok, sayaç çizilmez. */
  boxCounter: { loaded: number; total: number } | null;
  boxScanOpen: boolean;
  setBoxScanOpen: (open: boolean) => void;
  handleLoadScan: (code: string) => void;
  /**
   * Yanlış kutu: araçtaki hiçbir sefere ait olmayan kod okutuldu (`null` = yok).
   * Toast değil çekmece, çünkü rampada eli dolu kuryenin kaçırdığı uyarı yanlış kutunun araca binmesi demektir.
   */
  wrongBox: { orderRef: string | null; routeName: string | null; runRef: string | null } | null;
  dismissWrongBox: () => void;
}

/** Atlanan/bayat durakların O ANDAKİ durumları — tekrarsız ve operasyon dilinde. */
function statusList(stops: readonly CourierDayStopState[]): string {
  return [...new Set(stops.map((stop) => ORDER_STATUS_LABELS[stop.currentStatus]))].join(', ');
}

/** Rota BOŞTA mı — seferi açılmış rota (kimde olursa olsun) bugün ikinci kez açılamaz (K3). */
export function isRouteFree(route: CourierRoute): boolean {
  return route.run === null;
}

/**
 * Rotanın bugün işi var mı: durak, kutu ve tahsilatın üçüne de bakılır, çünkü biri sıfırken öteki dolu olabilir; işi olmayan sefer yalnız boş bir kapanış doğurur.
 * Bedeli: yalnız serbest ürünle yola çıkılamaz (araçtan satış sürülen sefere bağlıdır); gerekirse kural buradan tek satırla geri alınır.
 */
export function routeHasWork(route: CourierRoute): boolean {
  return route.stopCount > 0 || route.boxCount > 0 || route.collectionCount > 0;
}

/** Seçilebilir = boşta VE işi var. İki kural tek yerde birleşir ki ekran ile kanca ayrışmasın. */
export function isRoutePickable(route: CourierRoute): boolean {
  return isRouteFree(route) && routeHasWork(route);
}

/**
 * Dört listenin cümlesi: "seferi başlat"ın kısmi başarısı okunur hâle gelir; ortaktır, çünkü `startCourierDay` ve `departCourierRun` aynı şekli döndürür.
 */
function noticeOfStart(data: {
  run: CourierRunDetail;
  started: readonly string[];
  alreadyOut: readonly string[];
  stale: readonly CourierDayStopState[];
  skipped: readonly CourierDayStopState[];
  awaitingBoxes: readonly { loadedBoxes: number; boxCount: number }[];
}): StartNotice {
  const { run: openedRun, started: startedIds, alreadyOut, stale, skipped, awaitingBoxes } = data;
  const onTheRoad = startedIds.length + alreadyOut.length;
  const parts = [
    fillCopy(t.day.start.opened, { route: openedRun.zoneName ?? '', ref: openedRun.referenceNo }),
    startedIds.length > 0 ? fillCopy(t.day.start.started, { n: String(startedIds.length) }) : '',
    alreadyOut.length > 0 ? fillCopy(t.day.start.alreadyOut, { n: String(alreadyOut.length) }) : '',
    skipped.length > 0
      ? fillCopy(t.day.start.skipped, { n: String(skipped.length), statuses: statusList(skipped) })
      : '',
    stale.length > 0 ? fillCopy(t.day.start.stale, { n: String(stale.length) }) : '',
    // Kutulu sipariş okutulmayı bekliyor (23.8) — çaresi tekrar basmak değil KUTU OKUTMAK;
    // cümle onu söyler, `canRetry` bu yüzden bu listeden etkilenmez.
    awaitingBoxes.length > 0
      ? fillCopy(t.day.start.awaitingBoxes, {
          n: String(awaitingBoxes.length),
          k: String(awaitingBoxes.reduce((sum, row) => sum + row.loadedBoxes, 0)),
          m: String(awaitingBoxes.reduce((sum, row) => sum + row.boxCount, 0)),
        })
      : '',
    onTheRoad === 0 && awaitingBoxes.length === 0 ? t.day.start.none : '',
  ].filter((part) => part.length > 0);

  const pending = skipped.length > 0 || stale.length > 0;
  return {
    tone: onTheRoad === 0 ? 'warn' : pending || awaitingBoxes.length > 0 ? 'warn' : 'ok',
    text: parts.join(' '),
    canRetry: pending,
  };
}

export function useCourierDay(): UseCourierDayResult {
  const [status, setStatus] = useState<CourierDayStatus>('loading');
  const [date, setDate] = useState<string | null>(null);
  /* Günün seferi künyeden geniştir (çıkış deposunun adını da taşır) ve başlatma cevabı aynı şekli döndürür; ayrışsalardı sefer başlar başlamaz depo adı boş kalırdı. */
  const [run, setRun] = useState<CourierRunDetail | null>(null);
  const [runs, setRuns] = useState<CourierRunDetail[]>([]);
  const [routes, setRoutes] = useState<CourierRoute[]>([]);
  const [vehicles, setVehicles] = useState<CourierVehicle[]>([]);
  const [pickedZoneIds, setPickedZoneIds] = useState<string[]>([]);
  /*
    Seçime dokunuldu mu: boş liste "henüz seçmedim" ile "işaretini kaldırdım"ı ayırmalı, yoksa tek adayın işareti kaldırılınca kural onu geri işaretler.
    Dokunulduktan sonra seçim ne ise odur, boş da olabilir.
  */
  const [pickTouched, setPickTouched] = useState(false);
  const [wrongBox, setWrongBox] = useState<UseCourierDayResult['wrongBox']>(null);
  const [pickedVehicleId, setPickedVehicleId] = useState<string | null>(null);
  const [stops, setStops] = useState<CourierStopContract[]>([]);
  const [stranded, setStranded] = useState<CourierDayResponse['stranded']>([]);
  const [collectedCents, setCollectedCents] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  /*
    Sonuç ekranda değil toast'ta: aynı cümle üç ekranda üç biçimde asılı kalıyordu; titreşimi toast fiilleri taşır.
    Geriye kalan tek durum bir mesaj değil eylemdir ("kalanları yola çıkar" ikinci basışı), bu yüzden ayrı bayrak olarak yaşar.
  */
  const [canRetryStart, setCanRetryStart] = useState(false);
  const setStartNotice = useCallback((notice: StartNotice | null) => {
    setCanRetryStart(notice?.canRetry ?? false);
    if (notice === null) return;
    if (notice.tone === 'ok') toastSuccess(notice.text);
    else if (notice.tone === 'warn') toastWarning(notice.text);
    else toastError(notice.text);
  }, []);
  const [boxScanOpen, setBoxScanOpen] = useState(false);

  /** Kaçıncı yükün geçerli olduğu — geç gelen eski cevaplar yazılmaz (katalog emsali). */
  const generation = useRef(0);

  const load = useCallback(async () => {
    const round = (generation.current += 1);

    const dayResult = await fetchCourierDay();
    if (round !== generation.current) return;

    if (dayResult.error !== null) {
      setStatus('error');
      return;
    }

    const day = dayResult.data;
    setDate(day.date);
    setRun(day.run);
    setRuns(day.runs);
    setStops(day.stops);
    setStranded(day.stranded);

    /* Rotalar ve araçlar her hâlde okunur, çünkü kurye sefer sürerken de araca sefer ekleyebilir; yalnız kapanış taslağı sürülen seferde çekilir. */
    const [routeResult, vehicleResult, draftResult] = await Promise.all([
      fetchCourierRoutes(day.date),
      fetchCourierVehicles(),
      day.run === null ? Promise.resolve(null) : fetchDayCloseDraft({ runId: day.run.runId }),
    ]);
    if (round !== generation.current) return;
    if (routeResult.error !== null) {
      // Rota listesi olmadan seçim yapılamaz — boş listeyle "bugün rota yok" demek yalan olurdu.
      setStatus('error');
      return;
    }
    setRoutes(routeResult.data.routes);
    /* Araç listesi düşerse ekran kilitlenmez: araç kaydı zaten ZORUNLU değil ve araçsız sefer
       açılabiliyor (kapının kendi kuralı). Boş liste "araç yok" der, "hata var" demez. */
    setVehicles(vehicleResult.error === null ? vehicleResult.data.vehicles : []);
    setCollectedCents(
      draftResult === null || draftResult.error !== null
        ? null
        : draftResult.data.expected.cashCents +
            draftResult.data.expected.cardCents +
            draftResult.data.expected.chequeCents,
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

  /**
   * Çoklu seçim: kurye araca bugünün ve sonraki günlerin seferlerini alabilir; bayatlayan seçim sessizce düşer ki pasif rotayla istek gitmesin.
   * Aday boşta ve işi olan rotadır; elle seçim yoksa ve tek aday varsa o kendiliğinden işaretlidir.
   */
  const free = routes.filter(isRoutePickable);
  const freeIds = new Set(free.map((route) => route.zoneId));
  const explicit = pickedZoneIds.filter((id) => freeIds.has(id));
  const selectedZoneIds = pickTouched ? explicit : free.length === 1 ? [free[0]!.zoneId] : [];

  /* Dokunuş ETKİN seçimin üstüne yazılır, ham listenin değil: kendiliğinden işaretlenmiş rota
     `pickedZoneIds`te YOKTUR ve ham listeye göre çalışan bir tersleme onu "ekle" diye okurdu —
     yani ilk dokunuş hiçbir şey yapmamış gibi görünürdü. */
  const toggleRoute = useCallback(
    (zoneId: string) => {
      setPickTouched(true);
      setPickedZoneIds(
        selectedZoneIds.includes(zoneId)
          ? selectedZoneIds.filter((id) => id !== zoneId)
          : [...selectedZoneIds, zoneId],
      );
    },
    [selectedZoneIds],
  );

  /**
   * Seferleri kur: her rota için ayrı sefer ve ayrı istek, çünkü seferler birbirine bağlı değildir ve yarım başarı meşru ve görünür olmalı.
   * Her istek kendi rotasının gününü taşır (rota bulunamazsa gün gitmez, sunucu bugüne düşer); günün tarihi gitseydi sonraki günün rotası boş sefer doğururdu.
   */
  const openRuns = useCallback(async (): Promise<'ok' | 'partial' | 'failed'> => {
    if (starting || selectedZoneIds.length === 0) return 'failed';
    setStarting(true);
    setStartNotice(null);

    {
      const results = await Promise.all(
        selectedZoneIds.map((zoneId) => {
          const gun = routes.find((route) => route.zoneId === zoneId)?.day ?? date;
          return startCourierDay({
            zoneId,
            depart: false,
            ...(gun === null ? {} : { date: gun }),
            ...(pickedVehicleId === null ? {} : { vehicleId: pickedVehicleId }),
          });
        }),
      );
      setStarting(false);

      const opened = results.filter((row) => row.error === null && row.data.status === 'ok').length;
      const failed = results.length - opened;
      setStartNotice({
        tone: failed === 0 ? 'ok' : opened === 0 ? 'error' : 'warn',
        text:
          failed === 0
            ? fillCopy(t.day.openRuns.done, { n: String(opened) })
            : fillCopy(t.day.openRuns.partial, { n: String(opened), k: String(failed) }),
        canRetry: false,
      });
      setPickedZoneIds([]);
      await load();
      return opened === 0 ? 'failed' : failed === 0 ? 'ok' : 'partial';
    }
  }, [date, load, pickedVehicleId, routes, selectedZoneIds, setStartNotice, starting]);

  /**
   * **SEFERİ YOLA ÇIKAR** — araçtaki seferlerden biri. Bu, müşteriye haberin gittiği andır ve
   * geri alınamaz; ekran düğmenin altında bunu yazıyor (v3:15).
   */
  const departRun = useCallback(
    async (runId: string): Promise<'ok' | 'awaiting' | 'blocked' | 'failed'> => {
      if (starting) return 'failed';
      setStarting(true);
      setStartNotice(null);

      const result = await departCourierRun(runId);
      setStarting(false);

      /* "Başka sefer sürülüyor" arıza değil kuralın kendisidir; cümle hangisini kapatacağını söyler ve `canRetry` kapalıdır, çünkü tekrar basmak bir şey değiştirmez. */
      if (result.error === null && result.data.status === 'another_running') {
        setStartNotice({
          tone: 'error',
          text: fillCopy(t.day.vanRuns.departBlocked, { ref: result.data.referenceNo }),
          canRetry: false,
        });
        await load();
        return 'blocked';
      }
      if (result.error !== null || result.data.status !== 'ok') {
        setStartNotice({
          tone: 'error',
          text: result.error === 'network_error' ? t.day.start.network : t.day.start.departFailed,
          canRetry: true,
        });
        await load();
        return 'failed';
      }
      setStartNotice(noticeOfStart(result.data));
      await load();
      /* KUTUSU OKUTULMAMIŞ SİPARİŞ VARSA EKRAN DEĞİŞMEZ: sefer açıldı ama yapılacak iş hâlâ
         burada (kutuları okut, sonra yeniden başlat). Kuryeyi duraklara göndermek, okutulmamış
         kutuyu görmeden yola çıkarmak olurdu. */
      return result.data.awaitingBoxes.length > 0 ? 'awaiting' : 'ok';
    },
    [load, setStartNotice, starting],
  );

  /**
   * Seferi araçtan çıkar: `departRun`ın tersi; sefer hiç başlamadığı ve müşteriye haber gitmediği için geri alınabilir.
   * Onay ekranın işidir.
   */
  const discardRun = useCallback(
    (runId: string, routeLabel: string) => {
      if (starting) return;
      setStarting(true);
      setStartNotice(null);

      void (async () => {
        const result = await discardCourierRun(runId);
        setStarting(false);
        if (result.error !== null) {
          setStartNotice({ tone: 'error', text: t.day.vanRuns.discardFailed, canRetry: false });
          return;
        }
        if (result.data.status === 'already_departed') {
          setStartNotice({ tone: 'error', text: t.day.vanRuns.discardDeparted, canRetry: false });
          await load();
          return;
        }
        if (result.data.status !== 'ok') {
          setStartNotice({ tone: 'error', text: t.day.vanRuns.discardFailed, canRetry: false });
          await load();
          return;
        }
        /* Cevap SAYILARLA geliyor ve cümle onları yazıyor: "oldu" demek, malın nereye gittiğini
           söylemeden bırakmaktır (kutular rampada, siparişler serbest). */
        setStartNotice({
          tone: 'ok',
          text: fillCopy(t.day.vanRuns.discarded, {
            route: routeLabel,
            orders: String(result.data.releasedOrders),
            boxes: String(result.data.unloadedBoxes),
          }),
          canRetry: false,
        });
        await load();
      })();
    },
    [load, setStartNotice, starting],
  );

  /** Eski tek-rota seçiminin halefi — başlatma isteği hâlâ tek rota gönderiyor. */
  const selectedZoneId = selectedZoneIds[0] ?? null;

  /**
   * Başlatma isteğinin rotası: sefer açıkken seferin kendi rotası (tek sebep "kalanları yola çıkar"), yoksa seçilen rota; kapanan seferin rotası yeniden açılamaz.
   */
  const startZoneId = run !== null && !run.closed ? run.zoneId : selectedZoneId;

  const start = useCallback(() => {
    if (starting || startZoneId === null) return;
    setStarting(true);
    setStartNotice(null);

    void (async () => {
      /* Gün seferin kendi günüdür: ekranın bugünü gitseydi başka günde sürülen sefer için aynı rotaya ikinci bir sefer satırı açılırdı; sefer yoksa ekranın günü kullanılır. */
      const gun = run !== null && !run.closed ? run.deliveryDate : date;
      const result = await startCourierDay({ zoneId: startZoneId, ...(gun === null ? {} : { date: gun }) });
      setStarting(false);

      if (result.error !== null) {
        setStartNotice({
          tone: 'error',
          text:
            result.error === 'network_error'
              ? t.day.start.network
              : fillCopy(t.day.start.failed, { error: result.error }),
          // Sefer AÇIKKEN tel düşerse ikincil yol gerekir (ilk basış geçmiş, ikincisi ağa takılmış
          // olabilir); seçim gövdesindeyken birincil düğme zaten "Seferi başlat".
          canRetry: run !== null && !run.closed,
        });
        return;
      }

      if (result.data.status === 'already_started') {
        /* Bu dal artık YALNIZ "o rota bugün kapandı/başkasında" demek: aynı kuryenin AÇIK seferine
           ikinci basış uçta catch-up claim'e dönüştü ve `ok` döner. İki hâlin de sonucu aynı —
           yeni sefer açılmadı, o yüzden ikisi de uyarı tonunda. */
        const { referenceNo, mine } = result.data;
        setStartNotice({
          tone: 'warn',
          text: fillCopy(mine ? t.day.start.alreadyStartedMine : t.day.start.alreadyStartedOther, {
            ref: referenceNo,
          }),
          canRetry: false,
        });
        // Gerçeği ekrana getir: rota kartı artık o rotanın sürüldüğünü söyler. Uydurma bir hâl
        // kurulmaz, sunucu ne diyorsa o çizilir.
        await load();
        return;
      }

      /*
        Araç retleri kendi cümlesiyle söylenir: engel rotada değil araçtadır ve kurye rota listesinde değiştirebileceği bir şey bulamaz.
        Künyesiz hâl ayrı cümledir, çünkü sefer numarası yarış dalında okunamayabilir.
      */
      if (result.data.status === 'vehicle_taken' || result.data.status === 'vehicle_mismatch') {
        const ref = result.data.referenceNo;
        const taken = result.data.status === 'vehicle_taken';
        setStartNotice({
          tone: 'error',
          text:
            ref === null
              ? taken
                ? t.day.start.vehicleTakenNoRef
                : t.day.start.vehicleMismatchNoRef
              : fillCopy(taken ? t.day.start.vehicleTaken : t.day.start.vehicleMismatch, { ref }),
          canRetry: false,
        });
        // Araçtaki seferler listesi gerçeği söylesin: engel ORADA çözülüyor (araçtan çıkar).
        await load();
        return;
      }

      if (result.data.status !== 'ok') {
        setStartNotice({
          tone: 'error',
          text: result.data.status === 'route_required' ? t.day.start.routeRequired : t.day.start.noRoute,
          canRetry: false,
        });
        // Seçim bayat: rotalar yeniden okunur (rota kaldırılmış ya da araya biri girmiş olabilir).
        await load();
        return;
      }

      // Kilit sunucunun kaydından gelir: sefer açıldıysa duraklar açılır — hiçbir durak yola
      // çıkmasa da. "Açılmamış say" demek, var olan bir seferi ekranda yok saymak olurdu.
      setRun(result.data.run);
      setPickedZoneIds([]);
      setStartNotice(noticeOfStart(result.data));

      // Cevap "durum değişti" diyor; listenin de aynı gerçeği göstermesi gerekir (iskelet YOK —
      // liste yerinde kalır, sessizce tazelenir).
      await load();
    })();
  }, [date, load, run, setStartNotice, startZoneId, starting]);

  /* Yükleme okutması: sayaç duraklardaki damgalardan türer; sonuç aynı bildirim alanına yazılır ve liste tazelenir ki sayaç sunucunun gerçeğini göstersin. */
  const allBoxes = stops.flatMap((stop) => stop.boxes);
  const boxCounter =
    allBoxes.length === 0
      ? null
      : { loaded: allBoxes.filter((box) => box.loadedAt !== null).length, total: allBoxes.length };

  const dismissWrongBox = useCallback(() => setWrongBox(null), []);

  const handleLoadScan = useCallback(
    (code: string) => {
      setBoxScanOpen(false);
      void (async () => {
        const result = await loadCourierBox({ code });
        if (result.error !== null) {
          setStartNotice({ tone: 'error', text: t.day.boxes.error, canRetry: false });
          return;
        }

        const data = result.data;
        /*
          Sonuç rotayı söyler, çünkü araçta birden çok sefer durur ve rampadaki kurye kutunun hangisine yazıldığını bilmeli; sefer numarası değil rota adı, çünkü kurye onu bilir.
          Ad durağın `runLabel`ından çözülür; durak bulunamazsa ad yazılmaz, uydurulmaz.
        */
        const routeOf = (orderId: string): string | null =>
          stops.find((stop) => stop.orderId === orderId)?.runLabel ?? null;
        /* Rota bilinmiyorsa cümlenin başındaki ayraç da gider — " · Kutu 1 yüklendi" diye başlayan
           bir mesaj, adı olmayan bir şeye yer ayırmış gibi durur. */
        const withRoute = (route: string | null, text: string): string => (route === null ? text.replace(/^ · /, '') : text);
        if (data.status === 'ok') {
          const ref = data.referenceNo ?? '—';
          const route = routeOf(data.orderId);
          setStartNotice({
            tone: 'ok',
            /* "Tamamı araçta", "yola çıktı" değil: yükleme siparişi yola çıkarmaz, o iş sefer başlatmanındır. */
            text: withRoute(
              route,
              /* Durak açıldıysa cümle onu söyler: sefer yoldayken okutulan son kutu durağı açar ve müşteriye haber gider. */
              data.stopOpened
                ? fillCopy(t.day.boxes.loadedOpened, { route: route ?? '', n: String(data.boxNo), ref, m: String(data.boxCount) })
                : data.allBoxesLoaded
                ? fillCopy(t.day.boxes.loadedComplete, { route: route ?? '', n: String(data.boxNo), ref, m: String(data.boxCount) })
                : fillCopy(t.day.boxes.loaded, {
                    route: route ?? '',
                    n: String(data.boxNo),
                    ref,
                    k: String(data.loadedBoxes),
                    m: String(data.boxCount),
                  }),
            ),
            canRetry: false,
          });
          await load();
          return;
        }
        if (data.status === 'already_loaded') {
          const route = routeOf(data.orderId);
          setStartNotice({
            tone: 'warn',
            text: withRoute(route, fillCopy(t.day.boxes.alreadyLoaded, { route: route ?? '', n: String(data.boxNo) })),
            canRetry: false,
          });
          await load();
          return;
        }
        if (data.status === 'wrong_route') {
          /* Ekrana ÇEKMECE olarak çıkıyor (künyesi `wrongBox` alanında): kaçırılabilir bir uyarı,
             yanlış kutunun araca binmesi demek. Kanca yalnız veriyi kurar; çizmek ekranın işi. */
          setWrongBox({ orderRef: data.referenceNo, routeName: data.routeName, runRef: data.runReferenceNo });
          return;
        }
        if (data.status === 'not_sealed') {
          setStartNotice({ tone: 'error', text: fillCopy(t.day.boxes.notSealed, { n: String(data.boxNo) }), canRetry: false });
          return;
        }
        if (data.status === 'not_loadable') {
          setStartNotice({
            tone: 'error',
            text: fillCopy(t.day.boxes.notLoadable, { status: ORDER_STATUS_LABELS[data.currentStatus] }),
            canRetry: false,
          });
          return;
        }
        setStartNotice({ tone: 'error', text: t.day.boxes.unknownCode, canRetry: false });
      })();
    },
    /* `stops` BAĞIMLILIK: rota adı o listeden çözülüyor ve liste her tazelemede yenileniyor —
       eksik bırakılsaydı geri çağrı ilk render'ın BOŞ listesini kapatır, ad hiçbir zaman
       bulunamazdı (testte birebir bu görüldü). */
    [load, setStartNotice, stops],
  );

  return {
    status,
    date,
    run,
    runs,
    routes,
    vehicles,
    selectedZoneIds,
    toggleRoute,
    selectedVehicleId: pickedVehicleId,
    selectVehicle: setPickedVehicleId,
    openRuns,
    departRun,
    discardRun,
    stops,
    stranded,
    collectedCents,
    /* Duraklara yazılabilir mi: sürülen sefer varsa evet; kurulmuş ama başlamamış seferin durakları açılmamıştır. */
    started: run !== null && !run.closed,
    starting,
    canRetryStart,
    start,
    reload,
    boxCounter,
    boxScanOpen,
    setBoxScanOpen,
    handleLoadScan,
    wrongBox,
    dismissWrongBox,
  };
}
