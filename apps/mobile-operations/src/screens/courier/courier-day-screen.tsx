import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsScreenScroll } from '@/components/operations/screen-scroll';
import { OperationsSectionHeader } from '@/components/operations/section-header';
import { OperationsStaffMenu } from '@/components/operations/staff-menu';
import { NotificationBell } from '@/components/operations/notification-bell';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStickyBar } from '@/components/operations/sticky-bar';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { useOperationsUserName } from '@/screens/operations/sections-context';
import { useOperationsNotificationBadge } from '@/screens/operations/use-notification-badge.hook';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { GateRow } from './components/day-gate-row';
import { DayGuide } from './components/day-guide';
import { DayStopList } from './components/day-stop-list';
import { isPartial } from './components/day-stop-model';
import { StrandedStrip } from './components/day-stranded-strip';
import { DaySummaryCard } from './components/day-summary-card';
import { courierCopy } from './copy';
import { dayLabel, runLabel } from './courier-format';
import { useCourierDay } from './use-courier-day.hook';

/*
  Kurye bölümünün kökü: başlık ortak bölüm başlığıdır, gövdeyi ekran kendisi çizer. Gövdenin üç hâli var: araç boşken rehber, araçta yük
  var ama sürülen sefer yokken "birini başlat", sefer sürülürken sefere göre gruplu duraklar.
*/

const t = courierCopy;
const shell = operationsCopy;

/*
  İlk yük iskeleti bu ekranın kendi bloklarının ölçüsünü tutar: koyu özet kartı, kapı satırı ve ilk durak. Açık seferin ölçüsü tutulur,
  çünkü sayfayı zıplatacak blok odur.
*/
const DAY_SKELETON = { summary: 120, gate: 66, stop: 58 } as const;

export function CourierDayScreen() {
  const router = useRouter();
  const day = useCourierDay();
  const userName = useOperationsUserName();
  const unread = useOperationsNotificationBadge();

  const run = day.run;

  /*
    Liste yalnız başlatılmış seferlerin durağıdır: kurulmuş ama başlamamış seferin durağı açılmadı ve kurye ona gidemez. Özet kartının sayımı
    daha da dar, yalnız sürülen seferindir; yükleme ekranı ise bütün durakları görmeye devam eder.
  */
  const departedRunIds = new Set(day.runs.filter((candidate) => candidate.departedAt !== null).map((candidate) => candidate.runId));
  const stops = day.stops.filter((stop) => departedRunIds.has(stop.runId));
  const drivenStops = run === null ? [] : stops.filter((stop) => stop.runId === run.runId);
  // İptal edilen durak listede durur ama sayaçların dışındadır: iş teslimat değil, malı depoya geri getirmektir.
  const deliveryStops = drivenStops.filter((stop) => !stop.cancelled);
  const doneCount = deliveryStops.filter((stop) => stop.outcome !== 'pending').length;
  const cleanCount = deliveryStops.filter((stop) => stop.outcome === 'delivered' && !isPartial(stop)).length;
  const issueCount = stops.filter((stop) => !stop.cancelled && (stop.outcome === 'unreachable' || stop.outcome === 'refused')).length;
  // Kapanış rozeti sürülen seferi sayar, çünkü "Seferi kapat" o seferi kapatır; liste başlığındaki takılı sayısı bütün listenindir.
  const drivenIssues = deliveryStops.filter((stop) => stop.outcome === 'unreachable' || stop.outcome === 'refused').length;
  const openCount = deliveryStops.length - doneCount;
  const waitingCount = day.runs.filter((candidate) => candidate.departedAt === null).length;
  const doorStops = deliveryStops.filter((stop) => stop.outcome === 'pending' && stop.payment.dueAmountCents !== null);
  const doorTotal = doorStops.reduce((total, stop) => total + (stop.payment.dueAmountCents ?? 0), 0);

  // Üstbaşlık "neredeyim"i (bölüm ve gün), bağlam satırı "kim ve hangi sefer"i söyler; gün henüz okunmadıysa uydurulmaz.
  const eyebrow = [t.day.eyebrow, day.date === null ? null : dayLabel(day.date)]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(' · ');
  const context = run === null ? `${userName} · ${t.day.contextNoRun}` : `${userName} · ${runLabel(run)}`;

  const header = (
    <OperationsSectionHeader
      section="courier"
      eyebrow={eyebrow}
      title={t.day.title}
      context={context}
      right={
        <NotificationBell
          onPress={() => router.navigate('/notifications')}
          accessibilityLabel={unread === null || unread === 0 ? shell.bell.label : fillCopy(shell.bell.labelWithCount, { n: String(unread) })}
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

  const onVan = day.runs;
  const driving = run !== null && !run.closed;
  const selecting = !driving && onVan.length === 0;
  const vanLoaded = !driving && onVan.length > 0;
  // Düğme gövdeyi izler: sürülen sefer varken "kapat", araç boşken seçime götüren "başlat"; araçta yük varken yol kapı satırlarındadır.
  const ctaMode: 'start' | 'close' | null = driving ? 'close' : selecting ? 'start' : null;
  // "Araçta kaç sefer var ve kaçını sürüyorum" — iki gövde aynı soruya aynı cümleyle cevap verir.
  const vanMeta = fillCopy(t.day.vanRow.meta, { n: String(onVan.length), driving: String(onVan.length - waitingCount) });

  return (
    <View style={styles.screen} testID="operations-section-courier">
      {/* Başlık her dalda kaydırıcının içindedir, çünkü dışarıda kalan başlık mikro başlık inince altında asılı kalır. */}
      {selecting ? (
        <OperationsScreenScroll
          title={t.day.title}
          caption={operationsCopy.sections.courier.tab}
          contentContainerStyle={styles.list}
          testID="courier-day-routes"
        >
          {header}
          <StrandedStrip stops={day.stranded} />
          <DayGuide />
          {/* Yerinde satış kapısı yalnız sürülen seferde çizilir: sefersiz kurye depodadır ve oradaki satış depo kapısının işidir. */}
        </OperationsScreenScroll>
      ) : vanLoaded ? (
        <OperationsScreenScroll
          title={t.day.title}
          caption={operationsCopy.sections.courier.tab}
          contentContainerStyle={styles.list}
          testID="courier-day-van"
        >
          {header}
          <StrandedStrip stops={day.stranded} />
          <OperationsNoticeBlock
            variant="empty"
            title={t.day.vanLoaded.title}
            description={fillCopy(t.day.vanLoaded.body, { summary: vanMeta })}
            testID="courier-day-van-empty"
          />
          {/* Sıra seç, yükle, başlat: kutuları okutulmadan başlatılan sefer duraklarını açamaz. Sayaç bilinmiyorsa sıfır yazılmaz. */}
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
            meta={vanMeta}
            tone="plain"
            onPress={() => router.navigate('/van-runs')}
            testID="courier-day-van-runs"
          />
        </OperationsScreenScroll>
      ) : (
        <OperationsScreenScroll
          title={t.day.title}
          caption={operationsCopy.sections.courier.tab}
          contentContainerStyle={styles.list}
          testID="courier-day-list"
        >
          {header}
          <StrandedStrip stops={day.stranded} />
          {stops.length === 0 || run === null ? (
            <>
              {/* Özet kartı duraklardan doğar; durak yokken künye ayrı yazılır, sefer yine açıktır ve kapatılabilir. */}
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
            <DaySummaryCard
              runName={run.zoneName ?? run.referenceNo}
              doneCount={doneCount}
              stopCount={deliveryStops.length}
              cleanCount={cleanCount}
              collectedCents={day.collectedCents}
              doorLeft={{ count: doorStops.length, totalCents: doorTotal }}
              waitingCount={waitingCount}
            />
          )}

          {/* Kapılar durak listesinin dışındadır: duraksız sefer de gerçek bir hâldir ve araçta bekleyen ikinci sefere giden yol açık kalmalı. */}
          <GateRow
            icon="courier"
            title={t.day.vanRow.title}
            meta={vanMeta}
            tone="plain"
            onPress={() => router.navigate('/van-runs')}
            testID="courier-day-trip"
          />
          {/* Yerinde satışın tek kapısı burasıdır ve şartı sürülen seferdir; satış aracın kendi stoğundan yazılır (`place=van`). */}
          <GateRow
            icon="sale"
            title={t.day.sale.label}
            meta={t.day.sale.meta}
            tone="invite"
            onPress={() => router.navigate('/sale?place=van')}
            testID="courier-day-sale"
          />

          {stops.length === 0 || run === null ? null : (
            <DayStopList
              stops={stops}
              runs={day.runs}
              issueCount={issueCount}
              started={day.started}
              onOpen={(orderId) => router.navigate({ pathname: '/delivery/[orderId]', params: { orderId } })}
            />
          )}
        </OperationsScreenScroll>
      )}

      {ctaMode === null && !day.canRetryStart ? null : (
        <OperationsStickyBar>
          {/* Sefer açıldıktan sonra hazırlığı geciken durak için ikinci başlatma yolu; olmasaydı o durak uygulamadan yola çıkarılamazdı. */}
          {day.canRetryStart ? (
            <TextAction label={t.day.start.retry} onPress={day.start} disabled={day.starting} testID="courier-day-start-retry" />
          ) : null}
          {ctaMode === null ? null : (
            <PressableSurface
              onPress={
                ctaMode === 'close'
                  ? // Kapatılacak seferin kimliği adreste gider ki ekranda yazan sefer ile açılan mutabakat aynı kayıt olsun.
                    () => router.navigate({ pathname: '/day-close', params: run === null ? {} : { runId: run.runId } })
                  : () => router.navigate('/route-pick')
              }
              disabled={day.starting}
              feedback="scale"
              style={[styles.cta, ctaMode === 'close' ? styles.ctaClose : styles.ctaStart]}
              accessibilityLabel={ctaMode === 'close' ? t.day.close : t.day.vanEmpty.cta}
              testID="courier-day-cta"
            >
              <Text style={[styles.ctaLabel, ctaMode === 'close' ? styles.ctaLabelClose : styles.ctaLabelStart]}>
                {ctaMode === 'close' ? t.day.close : t.day.vanEmpty.cta}
              </Text>
              {/* Rozet açık ve takılı durakları birlikte söyler ki kurye kapatmadan önce neyin çözülmediğini görsün. */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  /* İskelet listenin yerinde durur ve ortalanmaz: yer tutucu gerçek blokların başlayacağı yerde başlar. */
  skeleton: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space.lg,
  },
  block: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space['7xl'],
  },
  list: {
    paddingHorizontal: operationsTheme.space['6xl'],
    // Ardışık kartlar arası aralık tasarımın 10'udur; durak satırları da aynı ritimde durur.
    gap: operationsTheme.space.lg,
    // Yapışkan düğme listenin üstünde durur; son satır onun altında kalmasın.
    paddingBottom: operationsTheme.size.controlLg + operationsTheme.space['8xl'],
  },
  /** Seferin künyesi — durak yokken özet kartının yerinde, sessiz. */
  runStrip: {
    paddingTop: operationsTheme.space.md,
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  cta: {
    height: operationsTheme.size.controlLg,
    borderRadius: operationsTheme.radius.control,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: operationsTheme.space.lg,
  },
  /* Düğmeler düz zeminlidir; sert gölge operasyon setinde yok, ışıma yalnız okutma düğmesine aittir. */
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
  ctaLabelStart: { color: operationsTheme.colors.card },
  ctaLabelClose: { color: operationsTheme.colors['on-image'] },
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
