import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsProgressBar } from '@/components/operations/progress-bar';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { fillCopy } from '@/screens/operations/copy';
import { courierCopy } from '../copy';
import { money } from '../courier-format';

const t = courierCopy;

interface DaySummaryCardProps {
  /** Sürülen seferin adı; adı yoksa künyesi. */
  runName: string;
  /** Sonuçlanan teslimat durağı; iptal edilmiş durak teslimat işi olmadığı için sayılmaz. */
  doneCount: number;
  stopCount: number;
  /** Sorunsuz biten durak — çubuğun yeşil payı. */
  cleanCount: number;
  collectedCents: number | null;
  doorLeft: { count: number; totalCents: number };
  /** Araçta bekleyen sefer — kapsam cümlesi kartın neyi saymadığını söyler. */
  waitingCount: number;
}

/** Günün özeti tek koyu kart: kaç durak bitti, cepte ne var, kapıda ne kaldı; sayım yalnız sürülen seferindir ve kart bunu kendisi söyler. */
export function DaySummaryCard({ runName, doneCount, stopCount, cleanCount, collectedCents, doorLeft, waitingCount }: DaySummaryCardProps) {
  return (
    <View style={styles.summary} testID="courier-day-summary">
      <View style={styles.summaryRun}>
        <Text style={styles.summaryRunBadge}>{t.day.drivenBadge}</Text>
        <Text style={styles.summaryRunName} numberOfLines={1}>
          {runName}
        </Text>
      </View>
      <View style={styles.summaryHead}>
        <Text style={styles.summaryCount}>
          {fillCopy(t.day.progressDone, { done: String(doneCount) })}
          <Text style={styles.summaryCountRest}>{fillCopy(t.day.progressRest, { total: String(stopCount) })}</Text>
        </Text>
        <View style={styles.pocketBox}>
          <Text style={styles.pocketLabel}>{t.day.pocketLabel}</Text>
          {/* Ölçülemeyen değer sıfır değildir: taslak düştüyse "bilinmiyor" yazılır. */}
          <Text style={styles.pocketValue}>{collectedCents === null ? t.day.pocketUnknown : money(collectedCents)}</Text>
        </View>
      </View>

      {/* Yeşil pay sorunsuz teslimdir, kırmızı pay takılı ve kısmi durak; kısmi durakta araçta mal kalmıştır. */}
      <OperationsProgressBar
        value={stopCount === 0 ? 0 : cleanCount / stopCount}
        secondary={{
          value: stopCount === 0 ? 0 : (doneCount - cleanCount) / stopCount,
          tone: operationsTheme.colors.error,
        }}
        onInk
        testID="courier-day-progress"
      />

      {doorLeft.count === 0 ? null : (
        <View style={styles.doorLeftBox} testID="courier-day-door-left">
          <Text style={styles.doorLeftDot}>●</Text>
          <Text style={styles.doorLeft}>{fillCopy(t.day.doorLeft, { n: String(doorLeft.count), amount: money(doorLeft.totalCents) })}</Text>
        </View>
      )}

      <Text style={styles.summaryScope} testID="courier-day-scope">
        {fillCopy(t.day.scope, {
          waiting: waitingCount === 0 ? t.day.scopeNone : fillCopy(t.day.scopeWaiting, { n: String(waitingCount) }),
        })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Ekranın tek koyu bloğu kuryenin ilk bakışını buraya çeker; koyu yüzey kendi kenarı olduğu için çerçeve yok. */
  summary: {
    backgroundColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.card,
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['2xl'],
    gap: operationsTheme.space.lg,
  },
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
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.xl,
  },
  summaryCount: {
    // Karla'nın 800'ü yüklenmiyor ve sahte kalın Android'de bozuk çizilir; en yakın gerçek kesit 700.
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors.cream,
  },
  /** Sayının kuyruğu — "/5 durak": aynı satırda, bir kademe küçük ve sessiz ki göz kendi ilerlemesini ayırsın. */
  summaryCountRest: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors['on-ink-label'],
  },
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
  /* Kapıda kalan tahsilat kendi şeridinde durur, çünkü cümle bir dipnot değil bir borç bildirimidir. */
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
  summaryScope: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    lineHeight: operationsTheme.text.meta * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors['on-ink-label'],
  },
});
