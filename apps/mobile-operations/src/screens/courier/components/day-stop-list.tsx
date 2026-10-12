import { Fragment } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { CourierDayResponse, CourierStopContract } from '@lezzet/types';

import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { fillCopy } from '@/screens/operations/copy';
import { courierCopy } from '../copy';
import { circleTone, groupMetaOf } from './day-stop-model';
import { StopRow } from './day-stop-row';

const t = courierCopy;

interface DayStopListProps {
  /** Başlatılmış seferlerin durakları, sunucunun sırasıyla. */
  stops: CourierStopContract[];
  runs: CourierDayResponse['runs'];
  /** Listedeki takılı durak; sıfırsa başlığa yazılmaz, çünkü sıfırı yazmak olmayan bir sorunu duyurur. */
  issueCount: number;
  started: boolean;
  onOpen: (orderId: string) => void;
}

/** Duraklar sefere göre: sıra sunucudan gelir ve korunur, komşu satırlar yalnız gruplanır; grup başlığı tek seferde de çizilir. */
export function DayStopList({ stops, runs, issueCount, started, onOpen }: DayStopListProps) {
  const nextOrderId = stops.find((stop) => !stop.cancelled && stop.outcome === 'pending')?.orderId ?? null;
  const issuesPerRun = new Map<string, number>();
  for (const stop of stops) {
    if (stop.outcome !== 'unreachable' && stop.outcome !== 'refused') continue;
    issuesPerRun.set(stop.runId, (issuesPerRun.get(stop.runId) ?? 0) + 1);
  }

  return (
    <>
      <View style={styles.stopsHeadingRow}>
        <Text style={styles.stopsHeading}>{t.day.stopsBySefer}</Text>
        {issueCount === 0 ? null : (
          <Text style={styles.stuckCount} testID="courier-day-stuck">
            {fillCopy(t.day.stuckCount, { n: String(issueCount) })}
          </Text>
        )}
      </View>

      {stops.map((stop, index) => (
        // Sarmalayıcı `Fragment`, `View` değil: araya giren görünüm kaydırma alanının kırpmasıyla çakışıp Android'de çöküyor.
        <Fragment key={stop.orderId}>
          {stop.runId !== stops[index - 1]?.runId ? (
            <View style={styles.runGroupRow} testID={`courier-day-group-${stop.runId}`}>
              <View style={styles.runGroupDot} />
              <Text style={styles.runGroupHeading} numberOfLines={1}>
                {stop.runLabel ?? ''}
              </Text>
              <Text style={styles.runGroupMeta}>
                {groupMetaOf(
                  runs.find((candidate) => candidate.runId === stop.runId),
                  issuesPerRun.get(stop.runId) ?? 0,
                )}
              </Text>
            </View>
          ) : null}
          <StopRow
            stop={stop}
            order={stop.stopSeq}
            tone={circleTone(stop, stop.orderId === nextOrderId, started)}
            started={started}
            last={index === stops.length - 1}
            onPress={() => onOpen(stop.orderId)}
          />
        </Fragment>
      ))}

      {/* Takılı durak kapanışta çözülür ve günü kapatmaya engel değildir; kural bunu bekleyen kuryeye listenin sonunda söylenir. */}
      <Text style={styles.stopsFootnote}>{t.day.stopsFootnote}</Text>
    </>
  );
}

const styles = StyleSheet.create({
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
  /** "1 takılı" bir sayı değil uyarıdır, bu yüzden hata tonunda. */
  stuckCount: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.error,
  },
  runGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
    paddingTop: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space['2xs'],
  },
  /** Zeytin nokta grubun "burada yeni bir sefer başlıyor" işaretidir. */
  runGroupDot: {
    width: operationsTheme.space.md,
    height: operationsTheme.space.md,
    borderRadius: operationsTheme.radius.pill,
    backgroundColor: operationsTheme.colors.olive,
  },
  /* Grup adı üstbaşlık değil başlık kesitinde yazılır, çünkü burada yazan şey seferin adıdır. */
  runGroupHeading: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.ink,
  },
  runGroupMeta: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  stopsFootnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    paddingTop: operationsTheme.space.md,
  },
});
