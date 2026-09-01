import { useRouter } from 'expo-router';
import { Fragment } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { CourierStopContract } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsProgressBar } from '@/components/operations/progress-bar';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { OperationsSectionHeader } from '@/components/operations/section-header';
import { OperationsStaffMenu } from '@/components/operations/staff-menu';
import { NotificationBell } from '@/components/operations/notification-bell';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStickyBar } from '@/components/operations/sticky-bar';
import { Icon } from '@/components/ui/icon';
import type { IconName } from '@/components/ui/icon-paths';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { TextAction } from '@/components/ui/text-action';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { useOperationsUserName } from '@/screens/operations/sections-context';
import { useOperationsNotifications } from '@/screens/operations/use-notifications.hook';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { courierCopy } from './copy';
import { dayLabel, money, runLabel, turkishUpper } from './courier-format';
import { timeOf } from '@/lib/operations/stamp';
import { useCourierDay } from './use-courier-day.hook';

/*
  K1 · GÜNÜN SEFERİ (v2:33-94) — kurye bölümünün kökü.

  ── BÖLÜM KÖKÜ ARTIK KENDİ GÖVDESİNİ ÇİZİYOR ────────────────────────────────
  Kabuk dilimi (21.9) dört bölümü tek `OperationsSectionScreen`den çiziyordu ve künyesinde
  "ayrıştıkları yer GÖVDEDİR" diyordu. Kurye gövdesi geldiği için bu ekran o ortak iskeletin
  BAŞLIĞINI kullanıyor (`OperationsSectionHeader` + zil, birebir aynı) ama gövdesini kendi
  yazıyor. Depo/Yönetim/Para hâlâ ortak ekranda.

  ── ÜSTBAŞLIĞIN KUYRUĞU ARTIK VERİ ──────────────────────────────────────────
  v2:38 "KURYE · 8 AĞUSTOS · MUSA K." diyor. Gün UÇTAN gelir (`date` cevabın zorunlu alanı —
  istemci kendi hesaplamaz), ad kapıdan (`/me`, oturum bağlamı). Gün henüz okunmadıysa parça
  YAZILMAZ: uydurma bir tarih, kuryenin hangi günü gördüğü sorusunu yanlış cevaplardı.

  ── GÖVDENİN DÖRDÜNCÜ HÂLİ: ROTA SEÇİMİ (18.08 · sefer) ─────────────────────
  Kurye artık rotasını KENDİ alıyor ("kurye giriş yapar, rotayı seçer, aracını doldurur, o rotayı
  sürer" — kullanıcı kararı 17.08); arayüzden kurye ataması kalktı. Sefer yoksa (`run === null`)
  gövde o günün rotalarını kart olarak gösterir ve CTA seçilen rotayla seferi açar. Ayrı bir ekran
  DEĞİL, aynı gövdenin bir hâli: seçim tek dokunuş + tek düğme, araya bir yönlendirme koymak
  kuryeyi sabahın en acele anında bir ekran daha gezdirmek olurdu.
  · **Tek adayda soru sorulmaz:** tek seçilebilir rota kendiliğinden seçilidir, CTA doğrudan onun
    adını taşır (dispatch'in aynı ilkesi).
  · **Başlatılmış rota PASİF:** rota+gün başına tek sefer (K3) — kart kimin sürdüğünü söyler.
  · Sıfır rota → eski "bugün rota yok" boş hâli; seçilecek bir şey olmadığında CTA da çizilmez.
  Kart, durak satırının SADELEŞMİŞ hâlidir (aynı daire + iki satır + kesikli ayraç): yeni bir
  görsel dil kurulmadı.

  ── SEFER KÜNYESİ LİSTENİN BAŞINDA ──────────────────────────────────────────
  "Hangi seferi sürüyorum" sorusu ilerleme satırının üstünde, tek satırda cevaplanıyor: rota adı +
  SF kodu (kapanmışsa "KAPANDI" eki). Üstbaşlığa sıkıştırılmadı — orada gün ve kurye var, üçüncü
  bir kimlik o satırı okunmaz yapardı.

  ── TASARIMDAN BİLİNÇLİ SAPMALAR ────────────────────────────────────────────
  1. **Yükleniyor hâli eklendi.** v2'nin demo sözlüğünde üç veri hâli var (dolu/boş/hata) ve
     "yükleniyor" yok — çünkü şablon veriyi yerel dizeden okuyor, ağ yok. Gerçek ekranda o hâl VAR
     ve boş listeyle göstermek "bugün rota yok" demek olurdu.
  2. **"Eşitlenmeyi bekliyor" rozeti ve "eşitleme reddi" kartı ÇİZİLMEDİ** (v2:69-74, 83). İkisi de
     ÇEVRİMDIŞI KUYRUĞUN göstergeleridir ve kuyruk bu dilimde yok (21.13 hattı). Fixture'la
     doldurmak, olmayan bir makinenin ekranını çizmek olurdu; yerine dürüst davranış kondu —
     bağlantı yokken işaret gönderilemez ve teslimat ekranı bunu hata olarak söyler.
  3. **"±" (kısmi) durak dairesi hiç doğmaz** (v2:852). Sözleşmenin durak sonucu dörtlü:
     `pending · delivered · unreachable · refused` — "kısmi" ayrı bir sonuç DEĞİL, teslim edilmiş
     bir durağın kalan borcudur. O bilgi satırın alt metninde yazılıyor.
  4. **"Seferi başlat"ın sonucu için bir bildirim satırı eklendi** (v2'de yok — şablonun düğmesi
     yalnız yerel bir bayrak çeviriyor, ağa çıkmıyor). Gerçek kapı KISMİ başarı döndürebiliyor ("3
     yola çıktı, 1 hazırlanmayı bekliyor") ve o cümlenin yazılacak bir yeri olmadan cevap yutulurdu.
     Yapışkan alana, CTA'nın ÜSTÜNE kondu: kurye listenin neresinde olursa olsun görür.
*/

const t = courierCopy;
const shell = operationsCopy;

/*
  İLK YÜK İSKELETİ — ölçüler bu ekranın KENDİ bloklarından (kit ölçüyü çağırandan alır,
  `skeleton-list.tsx` künyesi).

  Kutular sırayla: koyu özet kartı (dolgu 14×2 + baş 33 + çubuk 6 + kapı şeridi 34 + iki aralık),
  kapı satırı (dolgu 10×2 + ikon kutusu 46) ve ilk durak kartı (dolgu 10×2 + iki metin satırı).

  İKİ GÖVDE VAR, İSKELET BİR: sefer açıkken ekran özet kartıyla, seçim hâlindeyken satış kapısıyla
  başlıyor. Yer tutucu AÇIK SEFERİ tutuyor çünkü zıplamayı yaratan blok odur — seçim hâli gelirse
  yer tutucu bir tık cömert kalır, tersi olsaydı sayfa iskelet sönünce aşağı kayardı.
*/
const DAY_SKELETON = { summary: 120, gate: 66, stop: 58 } as const;

/**
 * Durak dairesinin BEŞ hâli — v3:14'ün renk üçlüleri, token karşılıklarıyla.
 *
 * `partial` 30.08'de AÇILDI ve bu bir karar dönüşüdür: v2 döneminde "kısmi ayrı bir sonuç değil"
 * diye kapatılmıştı, oysa veri onu zaten üretiyor (`fulfilledQty < qty`) ve v3 ayrı bir kartla
 * çiziyor. Sözleşmedeki `StopOutcome` yine DÖRTLÜ — kısmi bir geçiş değil, teslim edilmiş durağın
 * niteliği; ayrım yalnız BURADA, çizimde yaşıyor.
 */
type CircleTone = 'delivered' | 'partial' | 'issue' | 'next' | 'idle';

export function CourierDayScreen() {
  const router = useRouter();
  const day = useCourierDay();
  const userName = useOperationsUserName();
  const unread = useOperationsNotifications().unread;

  const run = day.run;

  /*
    ── LİSTE BAŞLATILMIŞ SEFERLERİN, SAYIM SÜRÜLENİN (v3:15 · kullanıcı bulgusu 31.08) ──────────
    Tasarımın kendi kaynağı açık: `SEFERLER.filter(s => baslatilan.indexOf(s.key) >= 0)` — durak
    listesi yalnız BAŞLATILMIŞ seferlerden doğuyor. Kurulmuş ama başlamamış seferin durağı burada
    HİÇ YOK ve olmamalı: o durak açılmadı, müşterisine haber gitmedi, kurye ona gidemez.

    Bende liste araçtaki BÜTÜN seferlerden geliyordu ve ekranda 15 durak sayılıyordu — oysa
    kuryenin o an yapabileceği iş yalnız başlatılmış seferlerin durakları. Yükleme ekranı ise
    hepsini görmeye devam ediyor (`day.stops`): rampada okutulacak kutu, seferi başlamamış
    siparişin de kutusudur.

    SAYIM DAHA DA DAR: özet kartı yalnız SÜRÜLEN seferin sayısıdır ve tasarım bunu yazıyor da
    ("Bu sayım yalnız sürülen sefere aittir"). İki başlatılmış sefer varken tek bir ilerleme
    çubuğu ikisini toplasaydı, kurye hangi seferi bitirdiğini okuyamazdı.
  */
  const departedRunIds = new Set(day.runs.filter((run) => run.departedAt !== null).map((run) => run.runId));
  const stops = day.stops.filter((stop) => departedRunIds.has(stop.runId));
  const drivenStops = run === null ? [] : stops.filter((stop) => stop.runId === run.runId);
  const doneCount = drivenStops.filter((stop) => stop.outcome !== 'pending').length;
  /*
    ÇUBUĞUN YEŞİLİ "SORUNSUZ TESLİM" (v3:14 `surulenYesil` = teslim/durak, `surulenKirmizi` =
    (ulasilamadi + kismi)/durak · ölçüldü 31.08). Yeşil pay `doneCount`tan çiziliyordu ve KISMİ
    teslim de tam teslim gibi yeşile giriyordu — oysa kısmi durakta araçta mal kalmıştır ve
    tasarım onu kırmızı payda sayıyor. Sayaç ("3/6 durak") sonuçlanan her durağı saymaya devam
    ediyor: o soru "kaçı bitti", çubuğunki "kaçı temiz bitti".
  */
  const cleanCount = drivenStops.filter((stop) => stop.outcome === 'delivered' && !isPartial(stop)).length;
  const issueCount = stops.filter((stop) => stop.outcome === 'unreachable' || stop.outcome === 'refused').length;
  /* KAPANIŞ ROZETİ SEFER BAZINDA: "Seferi kapat" SÜRÜLEN seferi kapatıyor (`openDayClose({runId})`),
     yani rozetin saydığı da o seferin durakları olmalı. Liste başlığındaki "N takılı" ise LİSTENİN
     kapsamında kalır (başlatılmış seferlerin hepsi) — iki sayı, iki ayrı soru. */
  const drivenIssues = drivenStops.filter((stop) => stop.outcome === 'unreachable' || stop.outcome === 'refused').length;
  const openCount = drivenStops.length - doneCount;
  /** Araçta BEKLEYEN sefer sayısı — özet kartının kapsam cümlesini besliyor (v3:15). */
  const waitingCount = day.runs.filter((candidate) => candidate.departedAt === null).length;
  /* KAPIDA KALAN TAHSİLAT ÖZET KARTININ İÇİNDE ve kart "yalnız sürülen sefere aittir" diyor —
     sayı da oradan gelmeli (v3:15 `surulenKapida`). Bütün başlatılmış seferlerden sayılıyordu ve
     kartın kendi cümlesiyle çelişiyordu (ölçüldü 31.08). */
  const doorStops = drivenStops.filter((stop) => stop.outcome === 'pending' && stop.payment.dueAmountCents !== null);
  const doorTotal = doorStops.reduce((total, stop) => total + (stop.payment.dueAmountCents ?? 0), 0);
  /** Sıradaki durak — v2:848: ilk sonuçlanmamış durak, koyu daireyle işaretlenir. */
  const nextOrderId = stops.find((stop) => stop.outcome === 'pending')?.orderId ?? null;

  /*
    ── DURAK NUMARASI SUNUCUDAN GELİR (11.9 · 31.08) ─────────────────────────────────────────
    Bir tur boyunca ekran kendi sayıyordu — önce liste boyunca (iki seferli günde "3/6 durak"
    derken 15 numaralı durak görünüyordu), sonra sefer içinde. İkisi de bir SAYAÇTI; oysa numara
    bir HESAPTIR: sunucu kapalı tur maliyetiyle diziyor ve `stopSeq` alanında taşıyor
    (`applyStopOrder`, sefer başına). Sayaç yalnız "kaçıncı satır" der, hesap "kaçıncı DURAK".

    Ekran artık saymıyor: `stop.stopSeq` doğrudan çiziliyor ve `null` ise numara UYDURULMUYOR.
    İki yüzeyin (mobil + web operasyon) kendi sayacını tutması, aynı gün için iki farklı rota
    göstermenin en kısa yoluydu.
  */
  /** Sefer başına takılı durak — grup başlığının meta'sı bunu taşıyor (aşağıdaki künye). */
  const issuesPerRun = new Map<string, number>();
  for (const stop of stops) {
    if (stop.outcome !== 'unreachable' && stop.outcome !== 'refused') continue;
    issuesPerRun.set(stop.runId, (issuesPerRun.get(stop.runId) ?? 0) + 1);
  }

  /* Boş hâlin düğmesi SEÇİME GÖTÜRÜR, kurmaz (v3:15 "Sefer ve araç seç"). Kurma eylemi seçim
     ekranının kendi düğmesi — burada verilecek bir seçim yok, verilecek bir YÖN var. */
  const ctaStartLabel = t.day.vanEmpty.cta;

  /* ÜSTBAŞLIK "KURYE · 28 AĞUSTOS" (v3:1298) — kuryenin ADI buradan ÇIKTI ve bağlam satırına
     indi. Gerekçe: üstbaşlık "neredeyim"i söyler (bölüm + gün), bağlam satırı "kim ve hangi
     sefer"i. İkisi tek satıra sıkışınca sefer referansına yer kalmıyordu. */
  const eyebrow = [t.day.eyebrow, day.date === null ? null : dayLabel(day.date)]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(' · ');

  /*
    Bağlam satırı: ad + sefer künyesi. Olmayan bir referans UYDURULMAZ, ama sessiz de kalmaz —
    tasarımın boş hâli "Marc Lemoine · **sürülen sefer yok**" diyor (`01-Aracta-Sefer-Yok`).
    Yalnız ad yazılıydı ve satır "sefer künyesi henüz yüklenmedi" gibi de okunabiliyordu; cümle
    kurulunca boşluk bir HÂL oluyor (01.09).
  */
  const context = day.run === null ? `${userName} · ${t.day.contextNoRun}` : `${userName} · ${runLabel(day.run)}`;

  const header = (
    <OperationsSectionHeader
      section="courier"
      eyebrow={eyebrow}
      title={t.day.title}
      /* BAĞLAM SATIRI (v3:1300) — "Marc Lemoine · SF-26-YRNWV9". Sefer referansı her ekranda
         AYNI yerde durmalı: künye özet kartının içinde olsaydı durak listesine inince kaybolur ve
         kurye "hangi seferdeyim" sorusunu ancak yukarı kaydırarak cevaplardı. */
      context={context}
      right={
        <NotificationBell
          onPress={() => router.navigate('/notifications')}
          accessibilityLabel={unread === 0 ? shell.bell.label : fillCopy(shell.bell.labelWithCount, { n: String(unread) })}
          count={unread}
          testID="operations-bell"
        />
      }
      identity={<OperationsStaffMenu testID="operations-staff-menu" />}
    />
  );

  if (day.status === 'loading') {
    return (
      <View style={styles.screen} testID="operations-section-courier">
        {header}
        {/* İLK YÜK İSKELET, HALKA DEĞİL (ortak karar 30.08) — halka yerleşim tutmaz ve söndüğü
            an sayfa zıplar; iskelet gelecek blokların ölçüsünü tutar. */}
        <View style={styles.skeleton}>
          <OperationsSkeletonList
            heights={[DAY_SKELETON.summary, DAY_SKELETON.gate, DAY_SKELETON.stop]}
            label={t.day.loading}
            testID="courier-day-loading"
          />
        </View>
      </View>
    );
  }

  if (day.status === 'error') {
    return (
      <View style={styles.screen} testID="operations-section-courier">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="error"
            title={t.day.error.title}
            description={t.day.error.body}
            retry={{ label: t.day.error.retry, onPress: day.reload }}
            testID="courier-day-error"
          />
        </View>
      </View>
    );
  }

  /*
    ── EKRANIN ÜÇ HÂLİ (31.08 · v3:14) ──────────────────────────────────────────
    Araç bir ara depo oldu ve ekranın hâli artık iki değil ÜÇ:
      1. ARAÇ BOŞ        → sefer ve araç seçimi (v3:16'ya giden gövde)
      2. ARAÇTA YÜK VAR, SÜRÜLEN SEFER YOK → "birini başlat" (v3:15'e kapı)
      3. SEFER SÜRÜLÜYOR → duraklar, sefere göre gruplu

    Eskiden ikinci hâl YOKTU: sefer ya vardı ya yoktu, ve "kurulmuş ama başlamamış sefer" diye bir
    şey de yoktu. Kutular yüklenmiş ama hiçbir sefer başlatılmamışken ekran boş seçim gövdesini
    gösterirdi — kurye araçtaki malı hiçbir yerde göremezdi.
  */
  const onVan = day.runs;
  const driving = run !== null && !run.closed;
  const selecting = !driving && onVan.length === 0;
  const vanLoaded = !driving && onVan.length > 0;

  /* CTA'nın hâli GÖVDEYİ izler: açık sefer varsa "kapat", seçim gövdesinde "başlat". Seçilecek rota
     kalmamışsa (hepsi başlatılmış) düğme hiç çizilmez — basılamayacak bir düğme, kuryeye olmayan
     bir yol vaat etmektir. Rota VAR ama seçilmemişse düğme çizilir ve PASİF durur: "önce seç"
     görünen bir adımdır, gizlenen bir düğmeden anlaşılmaz. */
  /* Boş hâlde düğme HER ZAMAN çizilir: rota olmasa da seçim ekranı sebebini söylüyor ("deponda
     planlanmış sefer yok"). Gizlenen bir düğme, kuryeye o cümleyi hiç okutmazdı. */
  const ctaMode: 'start' | 'close' | null = driving ? 'close' : selecting ? 'start' : null;

  /* SEÇİM GÖVDESİNİN AÇIKLAMA SATIRI SÖKÜLDÜ (31.08): rota listesi bu ekranda değil artık
     (v3:17 kendi ekranı) ve "rotanı seç / hepsi alınmış" cümlelerinin okuyanı da orada. Boş hâlin
     tek cümlesi rehberin kendisi. */

  return (
    <View style={styles.screen} testID="operations-section-courier">
      {header}

      {selecting ? (
        /*
          ARAÇ BOŞ — REHBER, LİSTE DEĞİL (v3:15 · kullanıcı bulgusu 31.08).

          Burada önce rota kartları ve araç listesi doğrudan çiziliyordu. Kullanıcı tasarımı
          gösterip sordu: *"giriş ekranı bu olması gerekmiyor mu?"* — ve haklıydı. Boş hâl bir
          SEÇİM DEĞİL bir REHBERDİR: kurye günün nasıl kurulduğunu (seç → yükle → başlat) burada
          öğrenir ve seçime düğmeyle geçer. İkisi tek ekrana sığdırıldığında "ne yapacağım"
          sorusunun cevabı hiç görünmüyor, doğrudan bir listeyle karşılaşılıyordu.

          Seçimin kendi ekranı olması işlevsel de: sefer AÇIKKEN de gerekiyor (araca ikinci sefer
          eklemek), yani gün ekranının boş hâline bağlı olamaz.
        */
        <ScrollView contentContainerStyle={styles.list} testID="courier-day-routes">
          <View style={styles.guide} testID="courier-day-guide">
            <Text style={styles.guideTitle}>{t.day.vanEmpty.title}</Text>
            <Text style={styles.guideBody}>{t.day.vanEmpty.body}</Text>
            <View style={styles.guideRule} />
            {[t.day.vanEmpty.step1, t.day.vanEmpty.step2, t.day.vanEmpty.step3].map((step, index) => (
              <View key={step} style={styles.guideStep}>
                <Text style={styles.guideNo}>{index + 1}</Text>
                <Text style={styles.guideLabel}>{step}</Text>
              </View>
            ))}
          </View>

          {/*
            YERİNDE SATIŞ KAPISI BURADA YOK — ve bu bilinçli (kullanıcı bulgusu 01.09).

            Bir tur boyunca üç hâlin üçünde de çiziliyordu; gerekçesi *"şartı sefer değil ARAÇ"*
            diye yazılmıştı ve o cümle bize ait, tasarıma değil: v3:15'te satır TEK yerde, sürülen
            seferin gövdesinde (`sürülenVar`). Kullanıcı sefersiz açılışta görüp sordu — *"henüz
            bir sefer bile seçili değil"*.

            Tasarım haklı, çünkü kapının adı da onu söylüyor: **"YOLDAN gelen müşteri."** Yoldan
            gelen müşteri yolda olunca gelir; kurye henüz hiçbir sefer kurmamışken depodadır ve
            oradaki satış depo kapısının işidir (`Depo → Yerinde satış`, tesis stoğundan —
            `DOMAIN §17`: satan kişi malın yanında duran personeldir). Sefersiz kuryeye araçtan
            satış açmak, çoğu zaman boş bir aracın kataloğunu açmaktı.
          */}
        </ScrollView>
      ) : vanLoaded ? (
        /*
          ARAÇTA YÜK VAR, SÜRÜLEN SEFER YOK (v3:14) — 31.08'de doğan üçüncü hâl.
          Kutular araçta ama hiçbir sefer başlatılmamış: duraklar açılmaz ve müşteriye haber
          gitmez. Ekran bunu SÖYLER ve tek bir yol gösterir — v3:15, "birini başlat".
        */
        <ScrollView contentContainerStyle={styles.list} testID="courier-day-van">
          <OperationsNoticeBlock
            variant="empty"
            title={t.day.vanLoaded.title}
            /* ANAHTARLAR YERİNE OTURDU (01.09 · cihazda ölçüldü): cümle `vanRow.meta`yı dolduruyor
               ("{n} sefer araçta · {driving} sürülüyor") ama `loaded`/`total` geçiliyordu — ekranda
               ham `{driving}` yazıyordu. Bu gövdenin testi yoktu, o yüzden sessizce yaşadı. */
            description={fillCopy(t.day.vanLoaded.body, {
              summary: fillCopy(t.day.vanRow.meta, {
                n: String(onVan.length),
                driving: String(onVan.length - waitingCount),
              }),
            })}
            testID="courier-day-van-empty"
          />
          {/* Sıra tasarımın 1-2-3'ü: seçtin → YÜKLE → başlat. Yükleme kapısı önce geliyor çünkü
              kurulan seferin kutuları okutulmadan başlatmak, durakları "kutu araçta değil" diye
              açılmayan bir sefer üretir. */}
          {/* YÜKLEME KAPISININ CÜMLESİ KUTULARI SAYAR — sefer sayısını değil (01.09). İki metin
              yer değiştirmişti: yükleme satırı "N sefer araçta" diyordu, sefer satırı ise kutuları.
              Sayaç `null` ise kutu bilinmiyor demektir ve sıfır YAZILMAZ (CLAUDE §1). */}
          <GateRow
            icon="packages"
            title={t.day.vanEmpty.step2}
            meta={fillCopy(t.day.vanRuns.summary, {
              stops: String(stops.length),
              loaded: String(day.boxCounter?.loaded ?? 0),
              total: String(day.boxCounter?.total ?? 0),
            })}
            tone="invite"
            onPress={() => router.navigate('/load')}
            testID="courier-day-load"
          />
          <GateRow
            icon="courier"
            title={t.day.vanLoaded.cta}
            /* Sürülen gövdedeki kardeşiyle AYNI cümle (`vanRow.meta`): satırın sorusu "araçta kaç
               sefer var ve kaçını sürüyorum" — iki gövde aynı soruya iki farklı cümle kurmasın. */
            meta={fillCopy(t.day.vanRow.meta, {
              n: String(onVan.length),
              driving: String(onVan.length - waitingCount),
            })}
            tone="plain"
            onPress={() => router.navigate('/van-runs')}
            testID="courier-day-van-runs"
          />
          {/* Satış kapısı BURADA DA yok: kutular araçta ama araç henüz yola çıkmadı — üstteki
              künyenin aynı gerekçesi. Ekranın tek yolu "birini başlat" (v3:15). */}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.list} testID="courier-day-list">
          {/*
            ÜST GÖVDE — durak VARSA özet kartı, YOKSA künye şeridi + boş bloğu.

            Kapılar bu ayrımın DIŞINDA kaldı (01.09, kullanıcı bulgusu): eskiden ikisi de
            `else` dalının içindeydi, yani sürülen seferin durağı yoksa ekran künye + "durak
            yok" + "Seferi kapat"tan ibaret kalıyordu — araçta bekleyen ikinci sefere GİDECEK
            YOL YOKTU. Kullanıcı tam bunu gördü: *"ikinci sefer yok ortalıkta, ikinci sefere
            geçemiyorum."* Duraksız sefer gerçek bir hâl (rotaya bugün sipariş yazılmamış) ve
            araç yine dolu olabilir; tasarım da kapıları `sürülenVar` gövdesine koyuyor,
            durak listesine değil (v3:15).
          */}
          {stops.length === 0 || run === null ? (
            <>
              {/* Künye burada AYRI kalıyor: özet kartı duraklardan doğuyor ve durak yokken kart
                  da yok — sefer yine açık, kapatılabilir. */}
              <Text style={styles.runStrip} testID="courier-day-run">
                {run === null ? '' : runLabel(run)}
              </Text>
              <OperationsNoticeBlock
                variant="empty"
                title={t.day.runEmpty.title}
                description={t.day.runEmpty.body}
                testID="courier-day-empty"
              />
            </>
          ) : (
            <>
              {/*
                GÜNÜN ÖZETİ TEK KART (v3:1310) — üç sayı bir arada: kaç durak bitti, cepte ne var,
                kapıda ne kaldı. v2'de üçü ayrı satırlardı ve kurye "günüm nasıl gidiyor"
                sorusunu ancak üç yere bakarak cevaplayabiliyordu.

                Künye kartın İÇİNDE değil BAŞLIKTA (aşağıdaki `context`): sefer referansı her
                ekranda aynı yerde durmalı, kartın içinde olsaydı durak listesine inince kaybolurdu.
              */}
              <View style={styles.summary} testID="courier-day-summary">
                {/* SÜRÜLEN SEFER ROZETİ + ADI (v3:15) — kartın hangi seferin sayımı olduğunu
                    kartın KENDİSİ söylemeli. Yalnız başlıkta yazılıydı ve iki başlatılmış sefer
                    varken kart "hangisinin ilerlemesi" sorusunu cevaplayamıyordu. */}
                <View style={styles.summaryRun}>
                  <Text style={styles.summaryRunBadge}>{t.day.drivenBadge}</Text>
                  <Text style={styles.summaryRunName} numberOfLines={1}>
                    {run?.zoneName ?? run?.referenceNo ?? ''}
                  </Text>
                </View>
                <View style={styles.summaryHead}>
                  {/* TAMAMLANAN SAYI KAHRAMAN (v3:14): tasarımda "3" büyük, "/5 durak" küçük.
                      Tek puntoda yazıldığında kuryenin gözü hangi sayının kendi ilerlemesi
                      olduğunu ayırt edemiyordu — ikisi de aynı ağırlıktaydı. */}
                  <Text style={styles.summaryCount}>
                    {fillCopy(t.day.progressDone, { done: String(doneCount) })}
                    <Text style={styles.summaryCountRest}>{fillCopy(t.day.progressRest, { total: String(drivenStops.length) })}</Text>
                  </Text>
                  <View style={styles.pocketBox}>
                    <Text style={styles.pocketLabel}>{t.day.pocketLabel}</Text>
                    {/* Ölçülemeyen değer SIFIR DEĞİLDİR: taslak düştüyse "bilinmiyor" (CLAUDE §1). */}
                    <Text style={styles.pocketValue}>{day.collectedCents === null ? t.day.pocketUnknown : money(day.collectedCents)}</Text>
                  </View>
                </View>

                {/* Çubuk PAYLAŞILAN (30.08): aynı geometri depo toplama kuyruğunun her satırında
                    da var; iki kopya birinin bir gün ötekinden ayrılması demekti (CLAUDE §1). */}
                {/* İZ KOYU (30.08): kart koyu ama çubuğun izi açık zeminin iziydi ve çubuk
                    boşken bile DOLU görünüyordu — üç durağın biri bitmişken göz "neredeyse
                    tamam" okuyordu. Kit prop'u, iki koyu çağıran da kuryede. */}
                {/* İKİNCİ PAY TAKILI DURAKLAR (v3:14 · 30.08): tek paylı çubuk günü olduğundan
                    iyi gösteriyordu — ulaşılamayan durak çubukta hiç görünmüyor, kalan boşlukta
                    "sırası gelmemiş" gibi duruyordu. */}
                <OperationsProgressBar
                  value={drivenStops.length === 0 ? 0 : cleanCount / drivenStops.length}
                  secondary={{
                    value: drivenStops.length === 0 ? 0 : (doneCount - cleanCount) / drivenStops.length,
                    tone: operationsTheme.colors.error,
                  }}
                  onInk
                  testID="courier-day-progress"
                />

                {doorStops.length === 0 ? null : (
                  <View style={styles.doorLeftBox} testID="courier-day-door-left">
                    <Text style={styles.doorLeftDot}>●</Text>
                    <Text style={styles.doorLeft}>
                      {fillCopy(t.day.doorLeft, { n: String(doorStops.length), amount: money(doorTotal) })}
                    </Text>
                  </View>
                )}

                {/* KAPSAM CÜMLESİ (v3:15) — kartın neyi saymadığını SÖYLER. Araçta bekleyen sefer
                    varken bu satır olmadan kurye "günüm 3/5" diye okuyor ve araçtaki öteki
                    seferin duraklarını hiç saymadığını fark etmiyordu. */}
                <Text style={styles.summaryScope} testID="courier-day-scope">
                  {fillCopy(t.day.scope, {
                    waiting: waitingCount === 0 ? t.day.scopeNone : fillCopy(t.day.scopeWaiting, { n: String(waitingCount) }),
                  })}
                </Text>
              </View>
            </>
          )}

          {/*
              ARAÇTAKİ SEFERLER (31.08 · v3:14) — sürülen sefer hâlinin kapısı.

              Buradaki satır 30.08'e kadar "Sefer künyesi ve yükleme" diyordu ve `/trip`e
              gidiyordu; o ekran tasarımda artık YOK — 15 numara "Rota ve araç seçimi" oldu ve
              onun gövdesi bu ekranın kendi seçim hâli. Araç bir ara depo olunca kuryenin
              sorduğu soru da değişti: "ne taşıyorum" değil, **"araçta hangi seferler var ve
              hangisini süreceğim"**.

              KUTU SAYACINA BAĞLI DEĞİL (01.09) — bir tur boyunca `boxCounter === null` iken satır
              hiç çizilmiyordu. Gerekçe eskimişti: sayaç bu satırın meta'sında artık YOK (cümle
              "N sefer araçta · M sürülüyor", kutu sayısı değil), ve `boxCounter` KUTUSUZ günde de
              `null` oluyor — yani kapı tam ihtiyaç duyulan hâlde kayboluyordu. Satırın taşıdığı
              bilgi `day.runs`tan geliyor, o da her zaman var.
            */}
          <GateRow
            icon="courier"
            title={t.day.vanRow.title}
            /* ÖZET TASARIMIN CÜMLESİ (v3:15 `aracSatirOzet`): "N sefer araçta · M
                   sürülüyor". Kutu sayacı yazılıydı ve o YÜKLEME ekranının sorusu; bu satırın
                   sorusu "araçta ne var ve kaçını sürüyorum". */
            meta={fillCopy(t.day.vanRow.meta, {
              n: String(day.runs.length),
              driving: String(day.runs.length - waitingCount),
            })}
            tone="plain"
            onPress={() => router.navigate('/van-runs')}
            testID="courier-day-trip"
          />

          {/* YERİNDE SATIŞ (21.119) — araçtan yoldan gelen müşteriye elden satış. Tasarımda
                "Araçtaki seferler" satırının HEMEN ALTINDA ve onun eşi bir kart satırı (v3:15);
                eskiden başlığın altında başlık+düğme olarak duruyordu ve akışın parçası
                görünmüyordu.

                **EKRANIN TEK SATIŞ KAPISI BURASI** ve şartı SÜRÜLEN SEFERDİR: tasarımda satır
                yalnız `sürülenVar` gövdesinde geçiyor. `place=van` adreste (01.09) — satış
                aracın kendi stoğundan yazılır, cihazdaki depo seçimi (kuryenin ROTA deposu) o
                isteğe karışmaz. */}
          <GateRow
            icon="sale"
            title={t.day.sale.label}
            meta={t.day.sale.meta}
            tone="invite"
            onPress={() => router.navigate('/sale?place=van')}
            testID="courier-day-sale"
          />

          {/* DURAK LİSTESİ — yalnız sürülen seferin durağı varken. */}
          {stops.length === 0 || run === null ? null : (
            <>
              {/* BAŞLIK SAYIYI VE TAKILIYI TAŞIR (v3:14) — "DURAKLAR · 5" solda, "1 takılı" sağda.
                  Eskiden yalnız "DURAKLAR" yazıyordu: kaç durak olduğu ancak sayılarak, takılı
                  olup olmadığı ancak listeyi tarayarak bulunuyordu. Takılı YOKSA sağ taraf hiç
                  çizilmez — sıfırı yazmak, olmayan bir sorunu duyurmaktır. */}
              <View style={styles.stopsHeadingRow}>
                {/* BAŞLIK HER ZAMAN "SEFERE GÖRE" (v3:14 — düz metin, koşulsuz). Tek seferde
                    "DURAKLAR · 6" yazılıyordu; grup başlığı artık tek seferde de çizildiği için
                    iki başlık aynı sayıyı iki kez söylüyordu. */}
                <Text style={styles.stopsHeading}>{t.day.stopsBySefer}</Text>
                {issueCount === 0 ? null : (
                  <Text style={styles.stuckCount} testID="courier-day-stuck">
                    {fillCopy(t.day.stuckCount, { n: String(issueCount) })}
                  </Text>
                )}
              </View>

              {/*
                DURAKLAR SEFERE GÖRE (31.08 · v3:14 "DURAKLAR · SEFERE GÖRE"). Araçta birden çok
                sefer olabildiği için düz liste yetmiyor: kurye hangi durağın hangi rotaya ait
                olduğunu görmeli. Grup başlığı YALNIZ birden çok sefer varsa çizilir — tek seferde
                başlık, olmayan bir ayrımı duyurmak olurdu.

                Sıra sunucudan geliyor ve KORUNUYOR (`listCourierDay` sefer başına sıralıyor);
                burada yalnız komşu satırlar gruplanıyor, yeniden dizilmiyor.
              */}
              {stops.map((stop, index) => (
                /*
                  SARMALAYICI `Fragment`, `View` DEĞİL (ölçüldü 31.08 · cihazda çöktü).

                  Grup başlığı eklenirken her durak bir `<View>` içine alınmıştı ve Android'de
                  ekrandan çıkarken çökme geldi: `addViewAt: failed to insert view … The specified
                  child already has a parent` (`ReactClippingViewManager`). Kaydırma alanı görünmeyen
                  çocukları KIRPIYOR (`removeClippedSubviews`) ve araya giren yeni bir görünüm
                  katmanı, kırpma ile yeniden bağlamayı çakıştırıyor.

                  `Fragment` yeni bir yerel görünüm doğurmuyor — başlık ve satır kaydırma alanının
                  DOĞRUDAN çocukları kalıyor, yani kırpma da onları tek tek yönetiyor. Anahtar
                  Fragment'ın kendisinde: liste yeniden sıralandığında React satırı kimliğinden
                  tanıyor.
                */
                <Fragment key={stop.orderId}>
                  {stop.runId !== stops[index - 1]?.runId ? (
                    /* BAŞLIK TEK SATIR + NOKTA (v3:14 `● {grupAd} …… {grupMeta}`) ve TEK SEFERDE
                       DE ÇİZİLİR (`grupGoster: i === 0`, sefer sayısına bakmıyor). İki satıra
                       kırılmış, noktasız bir başlık listeyi bölmüyor; nokta ile künye aynı satırda
                       durunca grup gerçekten bir başlangıç gibi okunuyor. */
                    <View style={styles.runGroupRow} testID={`courier-day-group-${stop.runId}`}>
                      <View style={styles.runGroupDot} />
                      <Text style={styles.runGroupHeading} numberOfLines={1}>
                        {stop.runLabel ?? ''}
                      </Text>
                      {/* GRUBUN META'SI (v3:15 `grupMeta`): künye + hâl + o seferin takılı sayısı.
                          Takılı sayısı 31.08'de eklendi: başlıktaki "N takılı" LİSTENİN toplamı,
                          düğmedeki ise SÜRÜLEN seferin — iki başlatılmış sefer varken ikisi
                          farklı çıkıyor ve hangi seferin takıldığı hiçbir yerde yazmıyordu. */}
                      <Text style={styles.runGroupMeta}>
                        {groupMetaOf(
                          day.runs.find((candidate) => candidate.runId === stop.runId),
                          issuesPerRun.get(stop.runId) ?? 0,
                          t,
                        )}
                      </Text>
                    </View>
                  ) : null}
                  <StopRow
                    stop={stop}
                    order={stop.stopSeq}
                    tone={circleTone(stop, stop.orderId === nextOrderId, day.started)}
                    started={day.started}
                    last={index === stops.length - 1}
                    onPress={() => router.navigate({ pathname: '/delivery/[orderId]', params: { orderId: stop.orderId } })}
                  />
                </Fragment>
              ))}

              {/* Kapanışın kuralı listenin SONUNDA (v3:1352): kurye "şu durak takıldı, günü
                  kapatamam" diye beklemesin — takılı durak kapanışta çözülür, engel değildir. */}
              <Text style={styles.stopsFootnote}>{t.day.stopsFootnote}</Text>
            </>
          )}
        </ScrollView>
      )}

      {/* YAPIŞKAN CTA — liste altından akar, gradyan onu kesmeden bitirir (v2:89).

          BİLDİRİM ARTIK BURADA DEĞİL (01.09): başlatmanın sonucu toast'a taşındı, çubuk yalnız
          EYLEM taşıyor. Görünürlük koşulu da onunla birlikte sadeleşti — eskiden çubuk "düğme
          yoksa bile mesaj için" çiziliyordu; mesaj gidince o gerekçe de gitti. */}
      {ctaMode === null && !day.canRetryStart ? null : (
        /* YAPIŞKAN ÇUBUK KİTTEN (`OperationsStickyBar`, 30.08): gradyan + mutlak konum + üç dolgu
           burada elle yazılıydı ve kitin bloğuyla BİREBİR aynıydı — kit zaten bu ekranın
           ölçüsünden çıkarılmıştı, ekran ona dönmemişti. `glow` VERİLMEDİ: ışıma bir OKUTMA
           işaretidir (kitin künyesi), başlat/kapat düğmesinin değil. */
        <OperationsStickyBar>
          {/* Sefer açıldıktan sonra birincil düğme "Seferi kapat"a döner; hazırlığı geciken
              durak için İKİNCİ bir başlatma yolu olmasaydı o durak uygulamadan yola
              çıkarılamazdı. Uç bu ikinci basışta catch-up claim yapıyor (18.08). Sebebini
              toast söyledi; burada kalan yalnız yolun kendisi. */}
          {day.canRetryStart ? (
            <TextAction label={t.day.start.retry} onPress={day.start} disabled={day.starting} testID="courier-day-start-retry" />
          ) : null}
          {ctaMode === null ? null : (
            <PressableSurface
              onPress={
                ctaMode === 'close'
                  ? /* KAPATILACAK SEFERİN KİMLİĞİ ADRESTE (01.09): ekranın künyesinde yazan sefer
                       ile mutabakatı açılan kaydın aynı olduğunu ancak kimlik garanti eder. İki
                       seferli günde kimliksiz istek yanlış kaydı açıyordu (cihazda ölçüldü). */
                    () => router.navigate({ pathname: '/day-close', params: run === null ? {} : { runId: run.runId } })
                  : () => router.navigate('/route-pick')
              }
              disabled={day.starting}
              /* KÜÇÜLME, KAYMA DEĞİL (v3:14:73 · `style-active="transform:scale(.98)"`). Kayma
                 sert gölgenin geri bildirimidir — gölge gidince altında kaymayı açıklayan bir şey
                 kalmaz ve hareket titreme gibi okunur (kitin `PrimaryButton` künyesindeki aynı
                 kural). */
              feedback="scale"
              style={[styles.cta, ctaMode === 'close' ? styles.ctaClose : styles.ctaStart]}
              accessibilityLabel={ctaMode === 'close' ? t.day.close : ctaStartLabel}
              testID="courier-day-cta"
            >
              <Text style={[styles.ctaLabel, ctaMode === 'close' ? styles.ctaLabelClose : styles.ctaLabelStart]}>
                {ctaMode === 'close' ? t.day.close : ctaStartLabel}
              </Text>
              {/* ROZET TAKILIYI DA SÖYLER (v3:14 — "2 açık · 1 takılı"). Kurye kapatmadan önce
                  neyin çözülmemiş olduğunu düğmenin üstünde görmeli; yalnız "açık" sayısı,
                  sonuçlanmayan durakları kapanışın sürprizine bırakıyordu. */}
              {ctaMode === 'close' && openCount + drivenIssues > 0 ? (
                <Text style={styles.ctaBadge}>
                  {issueCount === 0
                    ? fillCopy(t.day.openBadge, { n: String(openCount) })
                    : fillCopy(t.day.openBadgeStuck, { n: String(openCount), m: String(drivenIssues) })}
                </Text>
              ) : null}
            </PressableSurface>
          )}
        </OperationsStickyBar>
      )}

      <ScanSheet
        open={day.boxScanOpen}
        title={t.day.boxes.scanTitle}
        hint={t.day.boxes.scanHint}
        onClose={() => day.setBoxScanOpen(false)}
        onScan={day.handleLoadScan}
        // Kutu QR'ı üretilmiş kayıttır — çipler günün YÜKLENMEMİŞ kutularından kurulur.
        devCodes={stops.flatMap((stop) =>
          stop.boxes
            .filter((box) => box.loadedAt === null)
            .map((box) => ({ label: `${stop.referenceNo ?? '—'} · K${box.boxNo}`, code: box.code })),
        )}
        testID="courier-day-box-scan-sheet"
      />
    </View>
  );
}

/* ROTA KARTI VE ARAÇ SATIRI SEÇİM EKRANINA TAŞINDI (31.08 · v3:17): rota listesi bu ekranda
   değil artık, bu yüzden onları çizen iki bileşen de burada durmuyor — `route-pick-screen`. */

/**
 * **KISMİ TESLİM** — teslim edilmiş ama bir adedi eksik durak.
 *
 * Sözleşmede ayrı bir `outcome` YOK ve olmayacak: sipariş `delivered`, kalemin `fulfilledQty`si
 * `qty`den küçük. Kural tek yerde çünkü üç yer soruyor — daire tonu, etiket ve alt satır.
 */
function isPartial(stop: CourierStopContract): boolean {
  return stop.outcome === 'delivered' && stop.items.some((line) => line.fulfilledQty < line.qty);
}

/** Kısmi durağın adet dökümü — sipariş edilen ve fiilen bırakılan toplam. */
function partialCounts(stop: CourierStopContract): { total: number; done: number } {
  return stop.items.reduce((sum, line) => ({ total: sum.total + line.qty, done: sum.done + line.fulfilledQty }), { total: 0, done: 0 });
}

/**
 * Grubun meta satırı — künye + hâl (v3:15 `grupMeta`). Kapanmış sefer de listede kalabiliyor
 * (durakları sonuçlanmış), o yüzden hâl iki değer taşıyor.
 */
function groupMetaOf(run: { referenceNo: string; closed: boolean } | undefined, issues: number, copy: typeof courierCopy): string {
  if (run === undefined) return '';
  const parts = [run.referenceNo, run.closed ? copy.day.groupClosed : copy.day.groupDriving];
  /* Sıfır YAZILMAZ: olmayan bir sorunu duyurmak, listedeki her grubu bir uyarıya çevirirdi. */
  if (issues > 0) parts.push(fillCopy(copy.day.stuckCount, { n: String(issues) }));
  return parts.join(' · ');
}

/** v3:14 — sonuç dairesinin tonu. "Sıradaki" yalnız YOLA ÇIKILMIŞSA koyulur. */
function circleTone(stop: CourierStopContract, isNext: boolean, started: boolean): CircleTone {
  if (stop.outcome === 'delivered') return isPartial(stop) ? 'partial' : 'delivered';
  if (stop.outcome === 'unreachable' || stop.outcome === 'refused') return 'issue';
  return isNext && started ? 'next' : 'idle';
}

/**
 * **SONUÇLANMIŞ DURAĞIN ETİKETİ** — "TESLİM EDİLDİ · 14:12" (v3:14, 30.08).
 *
 * Sonuç eskiden alt satıra gömülüydü ("Ahmet · teslim edildi") ve SAAT hiç yazılmıyordu: kurye
 * hangi durağın ne zaman kapandığını okuyamıyordu. Rota bir sıradır; saat o sıranın tek işareti.
 *
 * Damga YOKSA etiket saatsiz yazılır — uydurma bir saat, en tehlikeli yalandır (CLAUDE §1).
 * Sonuçlanmamış durakta `null`: etiketi olan şey bitmiş iştir.
 */
function stopTag(stop: CourierStopContract): string | null {
  const tag =
    stop.outcome === 'delivered'
      ? isPartial(stop)
        ? t.day.stop.tagPartial
        : t.day.stop.tagDelivered
      : stop.outcome === 'unreachable'
        ? t.day.stop.tagUnreachable
        : stop.outcome === 'refused'
          ? t.day.stop.tagRefused
          : null;
  if (tag === null) return null;
  return stop.settledAt === null ? tag : fillCopy(t.day.stop.tagAt, { tag, time: timeOf(stop.settledAt) });
}

/**
 * Durağın alt satırı (v3:14) — sonuç ne söylüyorsa o; iç durum adı ekrana sızmaz.
 *
 * Sonuç ETİKETE çıktığı için burası artık sonucu TEKRAR ETMİYOR: teslim edilmiş durakta cümle
 * "ne oldu"yu değil "ne bıraktım, ne aldım"ı anlatıyor — kuryenin listeye dönüp sorduğu soru bu.
 */
function stopSubtitle(stop: CourierStopContract): { text: string; tone: 'muted' | 'error' | 'terracotta' } {
  const channel = t.channel[stop.channel];
  if (stop.outcome === 'delivered') {
    /* KISMİ: adet dökümü + araçta kalan. Kalan borç burada YAZILMAZ — kısmi durağın borcu zaten
       düzeltmeyle düşmüştür (07.8) ve iki sayı yan yana kuryeye hangisinin geçerli olduğunu
       sordururdu. */
    if (isPartial(stop)) {
      const { total, done } = partialCounts(stop);
      return {
        text: [
          fillCopy(t.day.stop.partialLine, { total: String(total), done: String(done) }),
          fillCopy(t.day.stop.leftInVanQty, { n: String(total - done) }),
        ].join(' · '),
        tone: 'terracotta',
      };
    }
    const parts = [fillCopy(t.day.stop.items, { n: String(stop.itemCount) })];
    /* KAPIDA ALINAN PARA (30.08): yöntem ve tutar birlikte — "nakit 85,00 € alındı". İkisi de
       gerekiyor, çünkü kurye akşam kasayı yöntem yöntem sayacak. Yöntem okunamadıysa satır hiç
       yazılmaz: tutarı yöntemsiz yazmak, o parayı hangi kasaya koyacağını söylemez. */
    const collected = stop.payment.collectedAtDoorCents;
    const method = stop.payment.expectedMethod;
    if (collected !== null && method !== null) {
      parts.push(fillCopy(t.day.stop.collected, { method: t.method[method], amount: money(collected) }));
    }
    if (stop.hasProof) parts.push(t.day.stop.proof);
    const due = stop.payment.dueAmountCents;
    if (due !== null) {
      parts.push(fillCopy(t.day.stop.deliveredDebt, { amount: money(due) }));
      return { text: parts.join(' · '), tone: 'terracotta' };
    }
    return { text: parts.join(' · '), tone: 'muted' };
  }
  if (stop.outcome === 'unreachable' || stop.outcome === 'refused') {
    /* KURYENİN KENDİ NOTU ÖNCE (30.08): "zil bozuk — kimse yok". Not `MarkUndeliveredRequest`le
       gönderiliyordu ama hiçbir okuma geri getirmiyordu — kurye kendi yazdığını okuyamıyordu.
       Not yoksa cümle sonucun kendi metniyle başlar; boş bir satır bırakmak sebebi soru işareti
       yapardı. */
    const note = stop.outcomeNote;
    /* MALIN AKIBETİ İKİ SONUÇTA FARKLI ve cümle de öyle olmalı (cihaz turu 30.08 — ilk hâlde
       ikisine de "araçta kaldı" yazılıyordu, reddedilen durakta bu YANLIŞTI). Sözleşmenin kendi
       kuralı: `unreachable` malı araçta bırakır (`ready`) ve kapanışta karara düşer; `refused`
       depoya döndürür (`returned`) — orada bekleyen bir karar yok, iade akışı başlamıştır. */
    const parts =
      stop.outcome === 'unreachable'
        ? [note ?? t.day.stop.unreachable, fillCopy(t.day.stop.leftInVanItems, { n: String(stop.itemCount) }), t.day.stop.closeDecides]
        : [note ?? t.day.stop.refused, fillCopy(t.day.stop.backToWarehouse, { n: String(stop.itemCount) })];
    return { text: parts.join(' · '), tone: 'error' };
  }

  const parts = [stop.customerName, channel, fillCopy(t.day.stop.items, { n: String(stop.itemCount) })];
  if (stop.attempts > 0) parts.push(fillCopy(t.day.stop.attempt, { n: String(stop.attempts + 1) }));
  if (stop.payment.dueAmountCents === null) parts.push(t.day.stop.noDebt);
  return { text: parts.join(' · '), tone: 'muted' };
}

interface StopRowProps {
  stop: CourierStopContract;
  /** Rota sırası (1'den) — daire boş hâlde bu sayıyı taşır. */
  /**
   * Rota sırası — **sunucunun hesabı** (11.9), listenin indeksi DEĞİL. `null` = sıra bilinmiyor:
   * koordinat çözülemedi, duraklar ayırt edilemedi ya da hesap düştü. Numara UYDURULMAZ.
   */
  order: number | null;
  tone: CircleTone;
  started: boolean;
  /** Listenin SON durağı mı — zaman çizgisi burada bitirilir, bağlanacak bir sonraki yok. */
  last: boolean;
  onPress: () => void;
}

/**
 * **İKONLU KAPI SATIRI** (v3:14) — sefer künyesi ve yerinde satış aynı anatomiyi paylaşıyor:
 * kare ikon kutusu · başlık · alt metin · yön oku. Tasarımda ikisi arka arkaya duruyor ve
 * birbirinin eşi; ayrı yazsaydık biri bir gün ötekinden ayrılırdı (CLAUDE §1).
 *
 * `tone` yalnız ZEMİN ve İKON rengini değiştiriyor: satış satırı tasarımda zeytin zeminli
 * (bir davet), sefer satırı krem (günün akışının bir adımı).
 */

interface GateRowProps {
  icon: IconName;
  title: string;
  meta: string;
  tone: 'plain' | 'invite';
  onPress: () => void;
  testID: string;
}

function GateRow({ icon, title, meta, tone, onPress, testID }: GateRowProps) {
  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      style={[styles.gateRow, tone === 'invite' ? styles.gateRow_invite : styles.gateRow_plain]}
      accessibilityLabel={title}
      testID={testID}
    >
      <View style={[styles.gateIcon, tone === 'invite' ? styles.gateIcon_invite : styles.gateIcon_plain]}>
        <Icon
          name={icon}
          size={operationsTheme.size.stripIcon}
          color={tone === 'invite' ? operationsTheme.colors.olive : operationsTheme.colors.ink}
        />
      </View>
      <View style={styles.gateBody}>
        <Text style={[styles.gateTitle, tone === 'invite' ? styles.gateTitle_invite : null]}>{title}</Text>
        <Text style={styles.gateMeta}>{meta}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </PressableSurface>
  );
}

function StopRow({ stop, order, tone, started, last, onPress }: StopRowProps) {
  const subtitle = stopSubtitle(stop);
  const tag = stopTag(stop);
  /** Durak hâlâ AÇIK mı — yön oku ve "yapılacak iş" görüntüsü yalnız buna bağlı. */
  const open = stop.outcome === 'pending';
  const address = stop.address ?? t.day.stop.noAddress;
  const due = stop.payment.dueAmountCents;
  const method = stop.payment.expectedMethod;
  const badge =
    stop.outcome === 'pending' && due !== null
      ? method === null
        ? fillCopy(t.day.stop.door, { amount: money(due) })
        : fillCopy(t.day.stop.doorWithMethod, { amount: money(due), method: turkishUpper(t.method[method]) })
      : null;

  return (
    <PressableSurface
      onPress={onPress}
      /* KAPI SIRASI: yola çıkılmadan durak açılmaz (v2:867 `if (!S.basladi) return`). Engel
         `disabled` ile veriliyor, sessiz bir `return` ile değil — ekran okuyucu da kapalı olduğunu
         duysun ve dokunuş görünürde işe yaramamış gibi durmasın. */
      disabled={!started}
      feedback="scale"
      style={[styles.stopRow, styles.stopRowRail, started ? undefined : styles.stopLocked]}
      accessibilityLabel={fillCopy(t.day.stop.openLabel, { address, sub: subtitle.text })}
      accessibilityHint={started ? undefined : t.day.stop.lockedHint}
      testID={`courier-stop-${stop.orderId}`}
    >
      {/* ZAMAN ÇİZGİSİ (v3:14 · 30.08) — daireler dikey bir çizgiyle bağlanıyor.
          Daireler bağsız dururken liste bir "kartlar yığını" gibi okunuyordu; rota ise bir
          SIRADIR ve çizgi o sırayı görünür kılan tek öğe. Son durakta çizilmez: bağlanacak bir
          sonraki durak yok, oraya çizgi koymak yolun devam ettiğini söylerdi. */}
      <View style={styles.rail}>
        <View style={[styles.circle, styles[`circle_${tone}`]]}>
          <Text style={[styles.circleText, styles[`circleText_${tone}`]]}>
            {/* Sıra bilinmiyorsa nötr bir işaret — uydurma numara, kuryeye olmayan bir yetenek
                iddia eder (`kurye-gun.md` "sırasız gün hâli"). */}
            {tone === 'delivered' ? '✓' : tone === 'partial' ? '½' : tone === 'issue' ? '!' : (order ?? '·')}
          </Text>
        </View>
        {/* SIRA YOKSA RAY DA YOK (11.9): çizgi "bu bir sıradır" der ve sıra hesaplanamamışsa o
            cümle yalan olur — ekran olmayan bir yeteneği iddia eder. */}
        {last || order === null ? null : <View style={styles.railLine} />}
      </View>
      {/* DURAK KENDİ KARTINDA (v3:14 · 30.08) — numara dairesi kartın DIŞINDA kalıyor.
          Kesikli çizgiyle ayrılmış düz satırlar listeyi bir döküme çeviriyordu; kart her durağı
          "dokunulacak bir iş" olarak çerçeveliyor.

          ── SONUÇ KARTIN ZEMİNİNDE (30.08) ────────────────────────────────────────────────
          Kart eskiden TEK zeminliydi (`panel` + `sand-300`) ve sonuç yalnız daire renginden
          okunuyordu; teslim edilen durakta ise kart hiç çizilmiyordu. v3 dört zemin veriyor ve
          gerekçesi listenin kendisinde: kurye ekrana bakıp "hangileri kaldı"yı kartların RENGİNDEN
          tarıyor, 32 piksellik bir daireden değil. Teslim edilmiş kart da çizilir — soluk, ama
          çizilir: iş bitti, kayıt duruyor. */}
      <View style={[styles.stopBody, styles.stopCard, styles[`stopCard_${tone}`]]}>
        {/* SIRADAKİ DURAĞIN BAŞLIĞI (v3:14) — kart zaten ayrışıyor ama "sıradaki" bir SÖZ, renk
            değil: kurye listeye döndüğünde nereden devam edeceğini okumalı. */}
        {tone === 'next' ? <Text style={styles.stopNextLabel}>{t.day.stop.nextLabel}</Text> : null}
        {tag === null ? null : (
          <Text style={[styles.stopTag, styles[`stopTag_${tone}`]]} testID={`courier-stop-tag-${stop.orderId}`}>
            {tag}
          </Text>
        )}
        <Text style={[styles.stopAddress, stop.outcome === 'delivered' ? styles.stopAddressDone : undefined]}>{address}</Text>
        <Text style={[styles.stopSub, styles[`stopSub_${subtitle.tone}`]]}>{subtitle.text}</Text>
        {/*
          ALT ŞERİT: rozet solda, yön oku sağda (v3:14 — `justify-content:space-between`).

          ── OK YALNIZ SONUÇLANMAMIŞ DURAKTA (kullanıcı bulgusu 30.08) ──────────────────────
          Ölçüldü: tasarımın beş durak kartından yalnız İKİSİNDE ok var — sıradaki ve bekleyen.
          Teslim, kısmi ve ulaşılamadı kartlarında YOK, çünkü ok bir DAVETTİR ("burada yapılacak
          iş var") ve sonuçlanmış durakta yapılacak iş kalmamıştır. Kart hâlâ dokunulabilir
          (kayda bakılabilir) ama kendini iş gibi sunmaz.

          Ok kartın İÇİNDE ve alt şeritte: eskiden kartın dışında, dikey ortada duruyordu ve
          hangi karta ait olduğu — özellikle iki satırlık adreslerde — belirsizdi.
        */}
        {badge === null && !open ? null : (
          <View style={styles.stopFoot}>
            {badge === null ? null : (
              <Text style={styles.stopBadge} testID={`courier-stop-door-${stop.orderId}`}>
                {badge}
              </Text>
            )}
            {open ? <Text style={styles.chevron}>›</Text> : null}
          </View>
        )}
      </View>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  /* İskelet listenin İÇİNDE değil, listenin YERİNDE duruyor: yatay dolgu gövdeyle aynı (`list`),
     üst nefes başlıktan sonra bir satır. Ortalanmıyor — yer tutucu sayfanın ortasında değil,
     gerçek blokların başlayacağı yerde başlar. */
  skeleton: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space.lg,
  },
  block: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space['7xl'],
  },
  /** Kaydırma alanının İÇİNDEKİ boş blok — yatay dolgu kaptan gelir, yalnız üst nefes eklenir. */
  emptyInline: {
    paddingTop: operationsTheme.space['7xl'],
  },
  list: {
    paddingHorizontal: operationsTheme.space['6xl'],
    /*
      KARTLAR ARASI ARALIK (kullanıcı bulgusu 30.08 — "kartlar birbirine bitişik").

      Burada `gap` HİÇ YOKTU: özet kartı ile kapı satırı, kapı satırı ile satış daveti sıfır
      boşlukla yan yanaydı; yalnız durak satırlarının kendi `paddingVertical`ı dolaylı bir aralık
      üretiyordu ve o da listenin geri kalanıyla tutmuyordu.

      Değer TASARIMDAN ve tahmin değil: bu ekranda ardışık her kart `margin:10px 20px 0` ile
      geliyor (v3:14 — özet → kapı satırı → satış daveti). Durak listesinin sarmalayıcısında
      `gap` gerçekten yazılmamış ama o bir kural yokluğu değil, TEK DURAK çizilmiş olmasının
      sonucu; aynı ekranın kendi ritmi 10 diyor.
    */
    gap: operationsTheme.space.lg,
    // Yapışkan CTA listenin ÜSTÜNDE duruyor; son satır onun altında kalmasın (52 + nefes).
    paddingBottom: operationsTheme.size.controlLg + operationsTheme.space['8xl'],
  },
  /* GÜNÜN ÖZETİ TEK KART (v3:1310) — üç sayı bir arada; v2'de ayrı satırlardı ve kurye "günüm
     nasıl gidiyor" sorusunu ancak üç yere bakarak cevaplayabiliyordu. */
  /*
    ÖZET KARTI KOYU (v3:14 · 30.08) — ekranın tek koyu bloğu ve bu bir hiyerarşi kararı.

    Açık kartla çizilmişti ve o hâlde sayfadaki her kutuyla aynı ağırlıktaydı: günün ilerlemesi,
    sefer kapısı ve satış daveti eşit sesle konuşuyordu. Tasarım kuryenin ilk bakışını buraya
    çekiyor — "kaç durak bitti, cebimde ne var" günün tek özeti.

    Çerçeve YOK: koyu yüzey kendi kenarıdır (kitin `ink` tonunun da kuralı).
  */
  summary: {
    backgroundColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.card,
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['2xl'],
    gap: operationsTheme.space.lg,
  },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.xl,
  },
  summaryCount: {
    // v2: `800 20px` — Karla'nın 800'ü YÜKLENMİYOR (fonts.ts üç ağırlık taşır) ve sahte kalın
    // Android'de çirkin durur; en yakın gerçek kesit 700.
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors.cream,
  },
  /** Sayının kuyruğu — "/5 durak": aynı satırda ama bir kademe küçük ve daha sessiz. */
  summaryCountRest: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors['on-ink-label'],
  },
  /** "CEPTE" + tutar — kartın sağ ucunda, iki satır; para bir sayı değil bir DURUM. */
  pocketBox: {
    alignItems: 'flex-end',
    gap: operationsTheme.space['2xs'],
  },
  pocketLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors['on-ink-label'],
  },
  pocketValue: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.cream,
  },
  /** Başlık satırı — sayaç solda, "takılı" sağda (v3:14). */
  stopsHeadingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: operationsTheme.space.lg,
  },
  stopsHeading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  /** "1 takılı" — başlığın sağ ucu; sayı değil UYARI olduğu için hata tonunda. */
  stuckCount: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.error,
  },
  stopsFootnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    paddingTop: operationsTheme.space.md,
  },
  /*
    "Kapıda tahsilat kaldı" KOYU KARTIN İÇİNDE KENDİ ŞERİDİNDE (v3:14). Düz metin olarak
    yazıldığında kartın alt kenarına yapışık bir dipnot gibi okunuyordu; oysa cümle bir BORÇ
    bildiriyor. `ink-inset` (beyazın %14'ü) onu zeminden ayırıyor, nokta imi de listeye ait
    olduğunu söylüyor.
  */
  doorLeftBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.sm,
    backgroundColor: operationsTheme.colors['ink-inset'],
    borderRadius: operationsTheme.radius.control,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.lg,
  },
  doorLeftDot: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors['on-ink-warn'],
  },
  doorLeft: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors['on-ink-warn'],
  },
  /** Sefer künyesi ve yüklemeye açılan kapı — sayacı da taşır (v3:1330). */
  /*
    KAPI SATIRI (v3:14) — sefer künyesi ve yerinde satış aynı anatomi: kare ikon · gövde · yön oku.
    Tasarım ikisini arka arkaya, aynı ölçülerde çiziyor; ayıran tek şey ZEMİN ve o bir anlam
    taşıyor — krem "günün akışının bir adımı", zeytin "burada bir davet var".
  */
  gateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.lg,
  },
  gateRow_plain: {
    backgroundColor: operationsTheme.colors.panel,
    borderColor: operationsTheme.colors['sand-300'],
  },
  gateRow_invite: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    borderColor: operationsTheme.colors['olive-line'],
  },
  /** Kare ikon kutusu — tasarımda ikon serbest durmuyor, kendi zeminine oturuyor. */
  gateIcon: {
    width: operationsTheme.size.controlSm,
    height: operationsTheme.size.controlSm,
    borderRadius: operationsTheme.radius.badge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateIcon_plain: { backgroundColor: operationsTheme.colors['neutral-bg'] },
  gateIcon_invite: { backgroundColor: operationsTheme.colors.cream },
  gateBody: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  gateTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  gateTitle_invite: { color: operationsTheme.colors['olive-dark'] },
  gateMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  boxLoadCounter: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors['olive-dark'],
  },
  boxLoadButton: {
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.lg,
    borderWidth: operationsTheme.border.base,
    borderRadius: operationsTheme.radius.badge,
    borderColor: operationsTheme.colors['olive-line'],
  },
  boxLoadButtonLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['olive-dark'],
  },
  /** Gövdenin açıklama kutusu — rota seçiminde "nasıl seçilir", kapanmış seferde "neden kilitli". */
  hintBox: {
    marginTop: operationsTheme.space.xl,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  hintText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.body,
  },
  /** Rota listesinin üstbaşlığı — kapanış ekranının bölüm başlıklarıyla aynı kesit. */
  /* ARAÇ SATIRI (31.08 · v3:16) — rota kartının kardeşi ama daha sessiz: araç bir SEÇİM, rota bir
     yük. Seçili hâl kenarlıkla işaretleniyor (kartın kendi deseni), tik sağda. */
  vehicleRow: {
    marginTop: operationsTheme.space.sm,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  vehicleRowOn: {
    borderColor: operationsTheme.colors['olive-line'],
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  vehicleRowOff: {
    borderColor: operationsTheme.colors['neutral-bg'],
    backgroundColor: 'transparent',
  },
  vehicleText: { flex: 1, gap: 2 },
  vehicleName: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['screen-title--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.ink,
  },
  vehicleMeta: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  vehicleTick: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.olive,
  },
  /* SEFER GRUP BAŞLIĞI (31.08 · v3:15) — durak listesinin içinde, sessiz bir ayraç. Kartların
     kendi ağırlığını bastırmasın diye üstbaşlık kesitinde. */
  runGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
    paddingTop: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space['2xs'],
  },
  /** v3:14 — 7px zeytin nokta; grubun "burada yeni bir sefer başlıyor" işareti. */
  runGroupDot: {
    width: operationsTheme.space.md,
    height: operationsTheme.space.md,
    borderRadius: operationsTheme.radius.pill,
    backgroundColor: operationsTheme.colors.olive,
  },
  /* Grup ADI üstbaşlık değil BAŞLIK (v3:14 `font:700 13px 'Karla'`, harf aralığı yok): küçük
     puntolu, harfleri açılmış bir üstbaşlıkla yazılıydı ve satır bir bölüm etiketi gibi
     okunuyordu — oysa burada yazan şey seferin ADI. */
  runGroupHeading: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.ink,
  },
  /* ARAÇ BOŞ REHBERİ (v3:15) — kart + ayraç + üç numaralı adım. Numaralar YUVARLAK: adımlar bir
     liste değil bir SIRA, ve sıra numarası kendi kabında durur. */
  guide: {
    marginTop: operationsTheme.space['2xl'],
    padding: operationsTheme.space['3xl'],
    borderRadius: operationsTheme.radius.card,
    borderWidth: 1,
    borderColor: operationsTheme.colors['neutral-bg'],
    backgroundColor: operationsTheme.colors.panel,
    gap: operationsTheme.space.lg,
  },
  guideTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['screen-title--font-weight']],
    fontSize: operationsTheme.text['screen-title'],
    color: operationsTheme.colors.ink,
  },
  guideBody: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  guideRule: { height: 1, backgroundColor: operationsTheme.colors['neutral-bg'] },
  guideStep: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.lg },
  guideNo: {
    width: operationsTheme.space['7xl'],
    height: operationsTheme.space['7xl'],
    borderRadius: operationsTheme.space['7xl'] / 2,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: operationsTheme.space['7xl'],
    backgroundColor: operationsTheme.colors['neutral-bg'],
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.body,
  },
  guideLabel: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['screen-title--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.body,
  },
  runGroupMeta: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  /** Özet kartının başındaki sefer künyesi — rozet + ad, koyu zemin üstünde. */
  summaryRun: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.md },
  summaryRunBadge: {
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.sm,
    borderRadius: operationsTheme.radius.tight,
    overflow: 'hidden',
    backgroundColor: operationsTheme.colors['ink-inset'],
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors['on-ink-label'],
  },
  summaryRunName: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors['on-ink-label'],
  },
  /** Kapsam cümlesi — kartın neyi SAYMADIĞINI söyler; koyu zeminin sessiz tonunda. */
  summaryScope: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    lineHeight: operationsTheme.text.meta * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors['on-ink-label'],
  },
  routesHeading: {
    paddingTop: operationsTheme.space.md,
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  /** Seferin künyesi — "Kuzey rotası · SF-26-…"; ilerleme satırının üstünde, sessiz. */
  runStrip: {
    paddingTop: operationsTheme.space.md,
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  /* Dikey dolgu KALDIRILDI: aralık artık listenin `gap`i — iki kaynak olduğunda durak satırları
     listenin geri kalanından farklı bir ritimde duruyordu (kullanıcı bulgusu 30.08). */
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  /* DURAK SATIRI GERİLİR (`stretch`), rota kartı ORTALANIR. Ayrı stil çünkü ikisi aynı iskeleti
     paylaşıyor ama farklı şey çiziyor: durakta zaman çizgisi kartın boyunca uzamalı, rota
     seçiminde çizgi YOK (bir sıra değil, bir liste) ve daire dikey ortada durmalı. */
  stopRowRail: { alignItems: 'stretch' },
  /** Daire + zaman çizgisi sütunu — genişliği daireden, uzunluğu karttan gelir. */
  rail: {
    alignItems: 'center',
    gap: operationsTheme.space['2xs'],
  },
  /** Durakları bağlayan dikey çizgi — kartın alt kenarına kadar iner. */
  railLine: {
    flex: 1,
    width: operationsTheme.border.ring,
    borderRadius: operationsTheme.radius.pill,
    backgroundColor: operationsTheme.colors['sand-300'],
  },
  /** Kartın alt şeridi — rozet solda, yön oku sağda; ikisi de yoksa şerit hiç çizilmez. */
  stopFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: operationsTheme.space['2xs'],
  },
  /** Durağın gövdesi — kendi kartı; numara dairesi dışarıda, yön oku kartın sağ kenarında. */
  stopCard: {
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.lg,
  },
  /*
    KARTIN DÖRT ZEMİNİ (v3:14 · 30.08) — sonuç kartın rengidir, dairenin değil.

    Değerler tasarımdan token karşılıklarıyla: teslim `#f4f2ea/#e7e2d2` → sayfa kremi + nötr kenar
    (kart sayfayla aynı zemindedir, onu yalnız kenarı ayırır — "bitmiş iş" tam olarak budur);
    kısmi `#fbf3e8/#e6cfae` → uyarı ailesi; ulaşılamadı `#f4e3e0/#e0b9b2` → hata ailesi (`error-line`
    tasarımın değeriyle BİREBİR); sıradaki `#fff/#5f7a2c` → girdi beyazı + zeytin.

    HAM HEX YOK, hiçbiri yeni token istemedi (CLAUDE §3): dördü de envanterde duran ailelerin
    üyeleri. Bulunmayan tek şey teslim kartının zemini gibi görünüyordu — o da `cream`in kendisi
    çıktı (Δ2/2/2, gözle aynı).
  */
  stopCard_delivered: {
    backgroundColor: operationsTheme.colors.cream,
    borderColor: operationsTheme.colors['neutral-bg'],
  },
  stopCard_partial: {
    backgroundColor: operationsTheme.colors['warning-bg'],
    borderColor: operationsTheme.colors['warning-line'],
  },
  stopCard_issue: {
    backgroundColor: operationsTheme.colors['error-bg'],
    borderColor: operationsTheme.colors['error-line'],
  },
  /* SIRADAKİ KART BEYAZ VE KALIN ZEYTİN KENARLI — listenin tek "şimdi" öğesi. Gölge YOK: sert
     gölge v3'te bırakıldı (21.161) ve ayrımı zaten kenarın kalınlığı taşıyor. */
  stopCard_next: {
    backgroundColor: operationsTheme.colors.card,
    borderColor: operationsTheme.colors.olive,
    /* Tasarım 2px diyor; operasyon setinin o basamağı `ring` (2,5). `base`in (1,5) üstünde bir
       kademe gerekiyor çünkü ayrımı taşıyan tek şey bu kenar — gölge v3'te bırakıldı (21.161). */
    borderWidth: operationsTheme.border.ring,
  },
  stopCard_idle: {
    backgroundColor: operationsTheme.colors.panel,
    borderColor: operationsTheme.colors['sand-300'],
  },
  /*
    TESLİM EDİLEN DURAKTA OPAKLIK YOK (v3:14 · ölçüldü 31.08).

    Kart 0,55'ten 0,8'e çekilmişti ama tasarımda `opacity` HİÇ YOK: teslim kartının solgunluğu
    RENKTEN gelir — zemin `#f4f2ea`, başlık `#6d7261`, alt satır `#8a8270`. Opaklık üstüne
    binince zaten sessiz olan renkler bir kez daha soluyor ve kart cihazda okunmuyordu (turda
    görüldü: "1 kalem · nakit 36,40 € alındı" satırı zemine karışmıştı). Ayrımı renk taşır.
  */
  stopLocked: { opacity: 0.75 },
  /** "SIRADAKİ DURAK" — kartın içindeki küçük zeytin başlık (v3:14). */
  stopNextLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    /* `emToDp` ŞART: token em cinsinden, RN `letterSpacing`i dp bekler — ham değer yazılsaydı
       harfler arası boşluk 9,5 kat açılırdı (ekranın kendi kuralı, `stopsHeading` emsali). */
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.olive,
  },
  /** Sonuç etiketi — "TESLİM EDİLDİ · 14:12"; tonu kartın ailesinden gelir. */
  stopTag: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
  },
  stopTag_delivered: { color: operationsTheme.colors['olive-dark'] },
  stopTag_partial: { color: operationsTheme.colors.warehouse },
  stopTag_issue: { color: operationsTheme.colors.error },
  stopTag_next: { color: operationsTheme.colors.olive },
  stopTag_idle: { color: operationsTheme.colors.muted },
  circle: {
    width: operationsTheme.size.dotButton,
    height: operationsTheme.size.dotButton,
    borderRadius: operationsTheme.radius.pill,
    borderWidth: operationsTheme.border.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* TESLİM DAİRESİ DOLU ZEYTİN (v3:14 `teslim.ikonBg:#5f7a2c` · ölçüldü 31.08) — içinde krem "✓".
     Açık `olive-bg` zeminiyle çizilmişti ve kartın kendi kremi üstünde neredeyse görünmüyordu:
     tasarımın beş dairesinden dördü DOLU, yalnız "bekleyen" nötr. Bitmiş durağın işareti listeyi
     tararken ilk okunan şeydir; soluk bir daire onu okunmaz yapıyordu. */
  circle_delivered: {
    backgroundColor: operationsTheme.colors.olive,
    borderColor: operationsTheme.colors.olive,
  },
  /* SORUNLU DAİRE DOLU KIRMIZI (v3:14) — içinde beyaz "!". Açık `error-bg` zeminiyle çizilince
     daire kartın kendi zeminine karışıyordu; listeyi tararken takılı durak görünmüyordu. */
  circle_issue: {
    backgroundColor: operationsTheme.colors.error,
    borderColor: operationsTheme.colors.error,
  },
  /** Kısmi teslim — "½" işaretli amber daire (v3:14). */
  circle_partial: {
    backgroundColor: operationsTheme.colors['warning-line'],
    borderColor: operationsTheme.colors['warning-line'],
  },
  circle_next: {
    backgroundColor: operationsTheme.colors.ink,
    borderColor: operationsTheme.colors.ink,
  },
  /* BEKLEYEN DAİRE DE DOLU, ama NÖTR (v3:14 `bekleyen.ikonBg:#e7e2d2`) — çerçeveli boş daire
     tasarımda hiç yok. Saydam daire zemin değiştiğinde (kart kremi ↔ sayfa kremi) kayboluyordu;
     dolu nötr her zemin üstünde aynı ağırlıkta durur. */
  circle_idle: {
    backgroundColor: operationsTheme.colors['neutral-bg'],
    borderColor: operationsTheme.colors['neutral-bg'],
  },
  circleText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
  },
  circleText_delivered: { color: operationsTheme.colors['on-image'] },
  circleText_issue: { color: operationsTheme.colors['on-image'] },
  circleText_partial: { color: operationsTheme.colors.warehouse },
  circleText_next: { color: operationsTheme.colors['on-image'] },
  circleText_idle: { color: operationsTheme.colors.muted },
  stopBody: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  stopAddress: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.ink,
  },
  /* ÜSTÜ ÇİZİLİ METİN YOK (kullanıcı bulgusu 30.08 · tasarımda `line-through` HİÇ geçmiyor —
     ölçüldü, 14. ekranda sıfır kullanım). Çizgi "iptal edildi" der; teslim edilmiş durak iptal
     değil TAMAMLANMIŞ bir iştir. Ayrımı zaten kartın zemini ve sonuç etiketi taşıyor; adresin
     rengi sessizleşir, üstü çizilmez. */
  stopAddressDone: {
    /* v3:14 `teslim.baslikFg:#6d7261` = `body`. `muted` (#8a8270) yazılıydı ve o TASARIMIN ALT
       SATIR rengidir — başlık ile alt satır aynı tona düşünce kartın kendi hiyerarşisi siliniyordu. */
    color: operationsTheme.colors.body,
  },
  stopSub: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
  },
  stopSub_muted: { color: operationsTheme.colors.muted },
  stopSub_error: { color: operationsTheme.colors.error },
  stopSub_terracotta: { color: operationsTheme.colors.terracotta },
  /* Rozet artık alt şeridin İÇİNDE: kendi `alignSelf`i ve üst boşluğu şeride devredildi, yoksa
     ok ile aynı satırda dururken iki kez boşluk alıyordu. */
  stopBadge: {
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.terracotta,
    color: operationsTheme.colors.card,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
  },
  chevron: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors['sand-600'],
  },
  cta: {
    height: operationsTheme.size.controlLg,
    borderRadius: operationsTheme.radius.control,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: operationsTheme.space.lg,
  },
  /*
    SERT GÖLGE SÖKÜLDÜ (kullanıcı bulgusu 30.08). `3px 3px 0` müşteri evreninin imzası ve v2'den
    kalmıştı; v3'te sert gölge YOK — tasarımın 6 gölgesinin altısı da yumuşak ve dördü yapışkan
    çubuktaki OKUTMA düğmesinin zeytin ışıması (kitin `sticky-bar` künyesi). Kural kitte zaten
    yazılıydı (`PrimaryButton elevation="flat"`); bu ekran kite hiç sormamıştı.
  */
  ctaStart: {
    backgroundColor: operationsTheme.colors.olive,
  },
  ctaClose: {
    backgroundColor: operationsTheme.colors.ink,
  },
  ctaLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
  },
  /** Rota seçilmemişken düğme PASİF durur (kapanış ekranının "zaten kapalı" çiftiyle aynı token). */
  ctaIdle: { backgroundColor: operationsTheme.colors['disabled-fill'] },
  ctaLabelStart: { color: operationsTheme.colors.card },
  ctaLabelClose: { color: operationsTheme.colors['on-image'] },
  ctaLabelIdle: { color: operationsTheme.colors['disabled-text'] },
  ctaBadge: {
    paddingVertical: operationsTheme.space['2xs'],
    paddingHorizontal: operationsTheme.space.md,
    borderRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors['ink-inset'],
    color: operationsTheme.colors['sand-150'],
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
  },
});
