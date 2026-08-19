import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ORDER_STATUS_LABELS,
  type CourierDayStopState,
  type CourierRoute,
  type CourierRunBrief,
  type CourierStopContract,
} from '@lezzet/types';

import { fetchCourierDay, fetchCourierRoutes, fetchDayCloseDraft, startCourierDay } from '@/lib/api/courier';
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
  /** Bugünkü sefer; `null` = rota alınmadı → ekran seçim hâlinde. */
  run: CourierRunBrief | null;
  /** Seçilebilir + başkasında olan rotalar (yalnız sefer yokken okunur). */
  routes: CourierRoute[];
  /** Kuryenin seçtiği rota — tek aday varsa kendiliğinden seçilidir. */
  selectedZoneId: string | null;
  selectRoute: (zoneId: string) => void;
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
}

/** Atlanan/bayat durakların O ANDAKİ durumları — tekrarsız ve operasyon dilinde. */
function statusList(stops: readonly CourierDayStopState[]): string {
  return [...new Set(stops.map((stop) => ORDER_STATUS_LABELS[stop.currentStatus]))].join(', ');
}

/** Rota seçilebilir mi — seferi açılmış rota (kimde olursa olsun) bugün ikinci kez açılamaz (K3). */
export function isRouteFree(route: CourierRoute): boolean {
  return route.run === null;
}

export function useCourierDay(): UseCourierDayResult {
  const [status, setStatus] = useState<CourierDayStatus>('loading');
  const [date, setDate] = useState<string | null>(null);
  const [run, setRun] = useState<CourierRunBrief | null>(null);
  const [routes, setRoutes] = useState<CourierRoute[]>([]);
  const [pickedZoneId, setPickedZoneId] = useState<string | null>(null);
  const [stops, setStops] = useState<CourierStopContract[]>([]);
  const [collectedCents, setCollectedCents] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [startNotice, setStartNotice] = useNotice<StartNotice>();

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
    setStops(day.stops);

    // Sefer AÇIK DEĞİLSE (hiç yok ya da kapandı) seçilecek rotalar, AÇIKSA seferin parası. İkinci
    // okuma neyin sorulacağını birincisinden öğrenir; ikisini birden istemek her hâlde birini boşa
    // çekmek olurdu.
    if (day.run === null || day.run.closed) {
      const routeResult = await fetchCourierRoutes(day.date);
      if (round !== generation.current) return;
      if (routeResult.error !== null) {
        // Rota listesi olmadan seçim yapılamaz — boş listeyle "bugün rota yok" demek yalan olurdu.
        setStatus('error');
        return;
      }
      setRoutes(routeResult.data.routes);
      setCollectedCents(null);
      setStatus('ready');
      return;
    }

    setRoutes([]);
    const draftResult = await fetchDayCloseDraft({ runId: day.run.runId });
    if (round !== generation.current) return;
    setCollectedCents(
      draftResult.error !== null
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
   * Seçili rota — kurye elle seçmediyse TEK aday kendiliğinden seçilidir ("tek adayda soru
   * sorulmaz", dispatch'in aynı ilkesi). Elle seçim bayatlarsa (o rota bu arada başlatıldıysa)
   * seçim yok sayılır: ekranda pasif görünen bir rotayla başlatma isteği gönderilmez.
   */
  const free = routes.filter(isRouteFree);
  const picked = free.find((route) => route.zoneId === pickedZoneId) ?? null;
  const selected = picked ?? (free.length === 1 ? free[0]! : null);
  const selectedZoneId = selected?.zoneId ?? null;

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

      const { run: openedRun, started: startedIds, alreadyOut, stale, skipped } = result.data;
      // Kilit sunucunun kaydından gelir: sefer açıldıysa duraklar açılır — hiçbir durak yola
      // çıkmasa da. "Açılmamış say" demek, var olan bir seferi ekranda yok saymak olurdu.
      setRun(openedRun);
      setPickedZoneId(null);

      const onTheRoad = startedIds.length + alreadyOut.length;
      const parts = [
        fillCopy(t.day.start.opened, {
          route: openedRun.zoneName ?? '',
          ref: openedRun.referenceNo,
        }),
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
        tone: onTheRoad === 0 ? 'warn' : pending ? 'warn' : 'ok',
        text: parts.join(' '),
        canRetry: pending,
      });

      // Cevap "durum değişti" diyor; listenin de aynı gerçeği göstermesi gerekir (iskelet YOK —
      // liste yerinde kalır, sessizce tazelenir).
      await load();
    })();
  }, [date, load, run, setStartNotice, startZoneId, starting]);

  return {
    status,
    date,
    run,
    routes,
    selectedZoneId,
    selectRoute: setPickedZoneId,
    stops,
    collectedCents,
    // Sefer açıkken duraklara yazılabilir; kapanmış seferde yazılamaz (mutabakat fotoğrafı çekildi).
    started: run !== null && !run.closed,
    starting,
    startNotice,
    start,
    reload,
  };
}
