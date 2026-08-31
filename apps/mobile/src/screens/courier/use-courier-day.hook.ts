import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ORDER_STATUS_LABELS,
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
import { useNotice } from '@/lib/haptics/use-notice.hook';
import { fillCopy } from '@/screens/operations/copy';
import { courierCopy } from './copy';

/*
  GÜNÜN SEFERİ (K1) — `/courier/day` + `/courier/routes` + `/courier/day/start` + `/courier/day-close`.

  ── "BAŞLADI" ARTIK SUNUCUDA DURUYOR (18.08 · `docs/feature/sefer.md` K1) ───
  Eski hâlde bir yerel bayrak vardı (`started`) ve künyesi kendi kusurunu yazıyordu: *"uygulama gün
  ortasında yeniden başlarsa kilit kapanır… kilit kendini onarır"*. Onarım diye anlatılan şey bir
  tahmindi — kurye düğmeye ikinci kez basıp `alreadyOut` cevabını görmeden kilidin doğru olduğunu
  kimse bilmiyordu. Artık SEFER (`delivery_run`) gerçek bir kayıt: `/courier/day` cevabının `run`
  alanı "bugün hangi seferi sürüyorum" sorusuna sunucudan cevap verir, uygulama kapanıp açılsa da
  aynı cevabı verir. Yerel bayrak silindi; hâl üç dallı bir TÜRETİM oldu:

  · `run === null`      → sefer alınmadı. Gövde ROTA SEÇİMİ gösterir (`/courier/routes`).
  · `run` açık          → sefer sürülüyor. Duraklar açılabilir, birincil eylem "Seferi kapat".
  · `run.closed`        → mutabakat yapıldı, o sefer BİTTİ. Gövde yeniden ROTA SEÇİMİNE döner
                          (kullanıcı akışı: kapat → yeni sefer; kurye günün ikinci ROTASINA
                          çıkabilir, aynı rotaya ikinci tur zaten veride yasak — K3). Kapanan
                          seferin künyesi seçim gövdesinin üstünde bilgi şeridi olarak durur.

  Sefer yokken durak da yoktur (siparişin kuryesi seferin kuryesinden gelir — start anında yazılır),
  yani "yola çıkmadan liste kilitli" hâli yapısal olarak ölmüş durumda: liste ancak AÇIK sefer varsa
  dolu; kapanmış seferin durakları K7'nin salt-okunur özetinde durur.

  ── ÜÇ OKUMA, İKİ AŞAMA ────────────────────────────────────────────────────
  Ne okunacağı sefere BAĞLI olduğu için okuma tek turda yapılamaz: önce gün (`run` orada), sonra
  sefere göre ikinci okuma.
  · Sefer YOK ya da KAPANMIŞ → `/courier/routes`: seçilecek rotalar. Kapanış taslağı istenmez
    (açılacak sefer için cepteki para diye bir sayı yok; kapanmışın parası zaten sayıldı).
  · Sefer AÇIK → `/courier/day-close?runId=…`: tasarımın ilerleme satırındaki **cepteki para**
    (v2:63-65) yalnız buradan dürüstçe okunabilir — `/courier/day` bir durakta ne KADAR tahsil
    edildiğini taşımıyor (yalnız kalan borcu). Sayıyı listeden tahmin etmek (borcu sıfırlanan
    durağın tutarını toplamak) önceden ödenmiş siparişleri de sayardı ve K7'de sürpriz çıkardı —
    oysa bu satırın varlık sebebi tam olarak o sürprizi önlemek. `runId` AÇIKÇA gönderilir: ekranın
    gösterdiği sefer ile paranın sayıldığı sefer ayrışamaz.

  ── İKİNCİL OKUMA DÜŞERSE LİSTE AYAKTA KALIR ───────────────────────────────
  Gün gelmediyse ekran hata gösterir (gösterecek bir şey yok). Taslak gelmediyse liste çizilir ve
  cepteki para `null` döner — okuyan taraf "bilinmiyor" yazar; sıfıra düşürmek dolu bir cebi boş
  göstermek olurdu (CLAUDE §1). Rota listesi gelmediyse seçim yapılamaz, o yüzden o düşüş hata
  sayılır: seçim ekranı boş bir liste ile "bugün rota yok" derdi ki bu YANLIŞ olurdu.

  ── SEFERİ BAŞLATMAK: DÖRT DALLI CEVAP ─────────────────────────────────────
  `POST /courier/day/start` sefer kaydını doğurur ve rotanın HAZIR duraklarını `ready →
  out_for_delivery` yapar. Cevap dört dallıdır ve dördü de ekranda görünür:
  · `ok` — sefer açıldı. Kilit artık cevabın `run`undan gelir; **hiçbir durak yola çıkmasa da sefer
    AÇIKTIR** (eski yerel bayrak "hepsi atlandıysa açma" diyordu çünkü kaydı olmayan bir kilidi
    korumaya çalışıyordu; şimdi kayıt var ve onu ekranda yok saymak yalan olurdu). Atlanan/bayat
    duraklar gizlenmez, sayısı ve O ANKİ durumu yazılır.
  · `already_started` + `mine` — aynı rota bugün ZATEN kendi seferiyle açılmış ve o sefer artık
    kapalı: aynı rotaya ikinci tur veride yasak (K3). Bilgi verilir, liste tazelenir.
  · `already_started` + `mine` DEĞİL — rota başkasında: seçim ekranında kalınır, uyarı yazılır ve
    liste tazelenir (rota kartı artık "bugün X sürüyor" der).
  · `route_required` / `no_route` — seçim bayatlamış: rotalar yeniden okunur.

  **"Kalanları yola çıkar" GERÇEKTEN çalışıyor** (uç düzeltmesi 18.08): aynı kuryenin AÇIK seferine
  ikinci basış artık `already_started` değil, geç kalan durakları aynı sefere bağlayan (`catch-up
  claim`) bir `ok` döndürüyor — yani hazırlığı geciken durak `started` listesinde gelir ve ekranın
  mevcut `ok` dalı onu olduğu gibi yazar. İkincil eylem bu yüzden duruyor; kaldırılsaydı gün içinde
  hazırlanan durağı yola çıkaracak tek kapı kapanırdı (web sevkiyatın `out_for_delivery`ye giden
  bir kapısı yok — `dispatch-types.ts` künyesinde ölçülü).

  ── ODAKTA TAZELENİR ────────────────────────────────────────────────────────
  Teslimat ekranından dönen kurye, az önce yazdığı sonucu listede GÖRMELİ. `useFocusEffect` ilk
  girişte de koşar, yani tek yükleme yolu var; sonraki dönüşlerde iskelet gösterilmez (liste
  yerinde kalır, sessizce tazelenir) — yoksa her geri dönüş ekranı boşaltırdı.
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
   * **ARAÇTAKİ SEFERLER** (31.08) — kurulmuş ve kapanmamış olanların hepsi, gün sırasıyla.
   * `departedAt: null` olanı araçta bekliyor: kutuları okutulabilir ama durakları açılmamış.
   */
  runs: CourierRunDetail[];
  /** Seçilebilir + başkasında olan rotalar (araca sefer eklerken okunur). */
  routes: CourierRoute[];
  /** Kuryenin deposunun araçları — biri seçilir, kurulan seferlere yazılır. */
  vehicles: CourierVehicle[];
  /**
   * Araca ALINACAK olarak işaretlenen rotalar (31.08 · v3:16 çoklu seçim). Tek aday varsa
   * kendiliğinden işaretlidir — "tek adayda soru sorulmaz".
   */
  selectedZoneIds: string[];
  toggleRoute: (zoneId: string) => void;
  selectedVehicleId: string | null;
  selectVehicle: (vehicleId: string | null) => void;
  /** Seçilen rotalar için seferleri KURAR (yola çıkarmaz) ve yükleme ekranına hazırlar. */
  openRuns: () => void;
  /** Kurulmuş bir seferi YOLA ÇIKARIR: durakları açar, müşteriye haber gider. */
  departRun: (runId: string) => void;
  /**
   * Kurulmuş ama BAŞLAMAMIŞ seferi araçtan çıkarır: siparişler serbest kalır, kutuların araç
   * damgası silinir, sefer kaydı düşer. `routeLabel` yalnız sonuç cümlesi için — kanca ekranın
   * elindeki adı ikinci kez okumaz.
   */
  discardRun: (runId: string, routeLabel: string) => void;
  stops: CourierStopContract[];
  /** Bugün tahsil edilmiş toplam (cent). `null` = ÖLÇÜLEMEDİ, sıfır değil. */
  collectedCents: number | null;
  /** Sefer sürülüyor mu — durak kilidinin kapısı; sunucudaki sefer kaydından TÜRER. */
  started: boolean;
  /** Başlatma isteği havada — düğme ikinci kez basılmaz. */
  starting: boolean;
  /** Başlatmanın sonucu (kısmi başarı dahil); `null` = henüz basılmadı. */
  startNotice: StartNotice | null;
  start: () => void;
  reload: () => void;
  /**
   * YÜKLEME SAYACI (23.8, karar §1.11) — duraklardaki kutu damgalarından TÜRER; `null` = günde
   * kutulu sipariş yok, sayaç hiç çizilmez. Okutma `loadCourierBox` ile: rotaya ait olmayan kutu
   * reddedilir, son kutu siparişi yola çıkarır.
   */
  boxCounter: { loaded: number; total: number } | null;
  boxScanOpen: boolean;
  setBoxScanOpen: (open: boolean) => void;
  handleLoadScan: (code: string) => void;
}

/** Atlanan/bayat durakların O ANDAKİ durumları — tekrarsız ve operasyon dilinde. */
function statusList(stops: readonly CourierDayStopState[]): string {
  return [...new Set(stops.map((stop) => ORDER_STATUS_LABELS[stop.currentStatus]))].join(', ');
}

/** Rota seçilebilir mi — seferi açılmış rota (kimde olursa olsun) bugün ikinci kez açılamaz (K3). */
export function isRouteFree(route: CourierRoute): boolean {
  return route.run === null;
}

/**
 * **Dört listenin cümlesi** — "seferi başlat"ın kısmi başarısı okunur hâle gelir (18.08).
 *
 * ORTAK, çünkü iki kapı da aynı şekli döndürüyor: `startCourierDay` ve `departCourierRun`. İkisi
 * ayrı kurulsaydı biri bir gün `awaitingBoxes`ı yazmayı unuturdu ve kurye kutuların beklediğini
 * ancak teslim yazmayı deneyip başarısız olunca öğrenirdi.
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
  /*
    Günün seferi künyeden GENİŞ: çıkış deposunun adını da taşıyor (30.08 · uyuşmazlık #12).
    Başlatma cevabı da aynı şekli döndürüyor, yani `setRun(openedRun)` tip olarak da geçerli —
    ikisi ayrışsaydı sefer başlar başlamaz depo adı boş kalırdı.
  */
  const [run, setRun] = useState<CourierRunDetail | null>(null);
  const [runs, setRuns] = useState<CourierRunDetail[]>([]);
  const [routes, setRoutes] = useState<CourierRoute[]>([]);
  const [vehicles, setVehicles] = useState<CourierVehicle[]>([]);
  const [pickedZoneIds, setPickedZoneIds] = useState<string[]>([]);
  const [pickedVehicleId, setPickedVehicleId] = useState<string | null>(null);
  const [stops, setStops] = useState<CourierStopContract[]>([]);
  const [collectedCents, setCollectedCents] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [startNotice, setStartNotice] = useNotice<StartNotice>();
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

    /*
      ── ROTALAR VE ARAÇLAR HER HÂLDE OKUNUR (arıza · cihazda ölçüldü 31.08) ────────────────────
      Buradaki dallanma "sürülen sefer varsa rota listesi gerekmez" varsayımına dayanıyordu ve o
      varsayım 31.08'de ÇÜRÜDÜ: araç bir ara depo oldu, kurye sefer sürerken araca ikinci bir
      sefer ekleyebiliyor ve seçim ekranına "Araca sefer ekle" ile giriliyor. Dallanma kaldığı
      için o ekran sürülen seferde HER ZAMAN boş açılıyordu — cihazda görüldü: "Deponda
      planlanmış sefer yok" ve "Deponda kayıtlı araç yok" yazıyordu, oysa depoda beş rota ve bir
      araç kayıtlıydı. Yani ekran veriyi bulamadığı için değil, HİÇ SORMADIĞI için boştu.

      Kullanıcının şikâyeti tam olarak buydu: *"bir sefer seçtikten sonra sürekli o sefer
      içerisinde kalmamalıyım."* Sefere girmek, seçimin kapısını kapatıyordu.

      Kapanış taslağı yine yalnız sürülen seferde çekiliyor — onun konusu gerçekten sefer.
    */
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
   * **ÇOKLU SEÇİM** (31.08 · v3:16) — kurye araca birden çok sefer alabiliyor: bugünün, yarının,
   * sonraki günün. Seçim bayatlarsa (o rota bu arada başkasınca açıldıysa) o kimlik sessizce
   * düşer: ekranda pasif görünen bir rotayla kurma isteği gönderilmez.
   *
   * Elle hiç seçilmediyse ve TEK aday varsa o kendiliğinden işaretlidir — "tek adayda soru
   * sorulmaz" (dispatch'in aynı ilkesi).
   */
  const free = routes.filter(isRouteFree);
  const freeIds = new Set(free.map((route) => route.zoneId));
  const explicit = pickedZoneIds.filter((id) => freeIds.has(id));
  const selectedZoneIds = explicit.length > 0 ? explicit : free.length === 1 ? [free[0]!.zoneId] : [];

  const toggleRoute = useCallback(
    (zoneId: string) => {
      setPickedZoneIds((current) =>
        current.includes(zoneId) ? current.filter((id) => id !== zoneId) : [...current, zoneId],
      );
    },
    [],
  );

  /**
   * **SEFERLERİ KUR** — seçilen her rota için ayrı bir sefer doğar (`depart:false`). Sefer başına
   * ayrı istek gitmesi bilinçli: seferler birbirine BAĞLI DEĞİL (kullanıcı kararı 31.08) ve biri
   * açılamazsa ötekiler açılmalı. Toplu bir istek "hepsi ya da hiçbiri" vaat ederdi; oysa burada
   * yarım başarı meşru ve görünür olmalı.
   */
  const openRuns = useCallback(() => {
    if (starting || selectedZoneIds.length === 0) return;
    setStarting(true);
    setStartNotice(null);

    void (async () => {
      const results = await Promise.all(
        selectedZoneIds.map((zoneId) =>
          startCourierDay({
            zoneId,
            depart: false,
            ...(date === null ? {} : { date }),
            ...(pickedVehicleId === null ? {} : { vehicleId: pickedVehicleId }),
          }),
        ),
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
    })();
  }, [date, load, pickedVehicleId, selectedZoneIds, setStartNotice, starting]);

  /**
   * **SEFERİ YOLA ÇIKAR** — araçtaki seferlerden biri. Bu, müşteriye haberin gittiği andır ve
   * geri alınamaz; ekran düğmenin altında bunu yazıyor (v3:15).
   */
  const departRun = useCallback(
    (runId: string) => {
      if (starting) return;
      setStarting(true);
      setStartNotice(null);

      void (async () => {
        const result = await departCourierRun(runId);
        setStarting(false);

        /* "Başka sefer sürülüyor" bir ARIZA DEĞİL, kuralın kendisi (31.08): araç birden çok
           seferi taşır ama kurye birini sürer. Cümle hangisini kapatacağını söylüyor ve `canRetry`
           KAPALI — tekrar basmak hiçbir şeyi değiştirmez, yapılacak iş başka bir ekranda. */
        if (result.error === null && result.data.status === 'another_running') {
          setStartNotice({
            tone: 'error',
            text: fillCopy(t.day.vanRuns.departBlocked, { ref: result.data.referenceNo }),
            canRetry: false,
          });
          await load();
          return;
        }
        if (result.error !== null || result.data.status !== 'ok') {
          setStartNotice({
            tone: 'error',
            text: result.error === 'network_error' ? t.day.start.network : t.day.start.departFailed,
            canRetry: true,
          });
          await load();
          return;
        }
        setStartNotice(noticeOfStart(result.data));
        await load();
      })();
    },
    [load, setStartNotice, starting],
  );

  /**
   * **SEFERİ ARAÇTAN ÇIKAR** (31.08) — `departRun`ın tersi ve onun aksine GERİ ALINABİLİR bir
   * anın kapanışı: sefer hiç başlamadı, müşteriye haber gitmedi. Onayı ekranın işi (çekmece);
   * kanca yalnız isteği ve cevabın üç dalını taşıyor.
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
   * Başlatma isteğinin rotası. SEFER AÇIKKEN seferin kendi rotası — çünkü o hâlde tek başlatma
   * sebebi "kalanları yola çıkar"dır ve o iş aynı rotada yapılır (seçim listesi de okunmuyor).
   * Sefer yoksa ya da KAPANDIYSA seçim gövdesinde seçilen rota: kapanan seferin rotası bir daha
   * açılamaz (K3), yeni sefer başka bir rotaya çıkar. İkisi de yoksa gönderilecek bir istek yok.
   */
  const startZoneId = run !== null && !run.closed ? run.zoneId : selectedZoneId;

  const start = useCallback(() => {
    if (starting || startZoneId === null) return;
    setStarting(true);
    setStartNotice(null);

    void (async () => {
      // Ekranın gösterdiği gün VE seçilen rota gönderilir; gün henüz okunmadıysa alan hiç doğmaz ve
      // kapı bugüne düşer. İkinci basış ZARARSIZDIR: sefer varsa `already_started` döner, ezmez.
      const result = await startCourierDay({ zoneId: startZoneId, ...(date === null ? {} : { date }) });
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

  /*
    YÜKLEME OKUTMASI (23.8). Sayaç duraklardaki damgalardan türer — ayrı tablo yok (karar §1.11).
    Okutmanın sonucu bir StartNotice olarak yazılır (aynı bildirim alanı: iki iş de "araç yükleme"
    aşamasının işi); ok/already dallarından sonra liste tazelenir ki sayaç ve durak durumu sunucu
    gerçeğini göstersin.
  */
  const allBoxes = stops.flatMap((stop) => stop.boxes);
  const boxCounter =
    allBoxes.length === 0
      ? null
      : { loaded: allBoxes.filter((box) => box.loadedAt !== null).length, total: allBoxes.length };

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
        if (data.status === 'ok') {
          const ref = data.referenceNo ?? '—';
          setStartNotice({
            tone: 'ok',
            /* "YOLA ÇIKTI" DEĞİL "TAMAMI ARAÇTA" (31.08): yükleme siparişi yola çıkarmıyor artık;
               o iş sefer başlatmanın. Eski metin kuryeye olmayan bir şeyi haber veriyordu. */
            text: data.allBoxesLoaded
              ? fillCopy(t.day.boxes.loadedComplete, { n: String(data.boxNo), ref, m: String(data.boxCount) })
              : fillCopy(t.day.boxes.loaded, {
                  n: String(data.boxNo),
                  ref,
                  k: String(data.loadedBoxes),
                  m: String(data.boxCount),
                }),
            canRetry: false,
          });
          await load();
          return;
        }
        if (data.status === 'already_loaded') {
          setStartNotice({ tone: 'warn', text: fillCopy(t.day.boxes.alreadyLoaded, { n: String(data.boxNo) }), canRetry: false });
          await load();
          return;
        }
        if (data.status === 'wrong_route') {
          setStartNotice({
            tone: 'error',
            text: fillCopy(t.day.boxes.wrongRoute, { ref: data.referenceNo ? ` (${data.referenceNo})` : '' }),
            canRetry: false,
          });
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
    [load, setStartNotice],
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
    collectedCents,
    /* Duraklara yazılabilir mi — SÜRÜLEN sefer varsa evet. Kurulmuş ama başlamamış sefer araçta
       bekliyordur ve durakları açılmamıştır (31.08). */
    started: run !== null && !run.closed,
    starting,
    startNotice,
    start,
    reload,
    boxCounter,
    boxScanOpen,
    setBoxScanOpen,
    handleLoadScan,
  };
}
