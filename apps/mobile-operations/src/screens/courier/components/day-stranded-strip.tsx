import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { CourierDayResponse } from '@lezzet/types';

import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { fillCopy } from '@/screens/operations/copy';
import { courierCopy } from '../copy';
import { dayLabel } from '../courier-format';

const t = courierCopy;

interface StrandedStripProps {
  stops: CourierDayResponse['stranded'];
}

/**
 * Askıda kalan duraklar: teslim günü geçmiş, sonuçlanmamış ve kutusu araçta olabilir. Kurye buradan bir şey yapmaz, yeni günü sevkiyat masası
 * seçer; şerit yalnız "araçtaki kutu neden duraksız" sorusunu cevaplar ve üç gövdede de aynı yerde durur.
 */
export function StrandedStrip({ stops }: StrandedStripProps) {
  if (stops.length === 0) return null;
  return (
    <View style={styles.stranded} testID="courier-day-stranded">
      <Text style={styles.strandedHeading}>{fillCopy(t.day.stranded.heading, { n: String(stops.length) })}</Text>
      <Text style={styles.strandedBody}>{t.day.stranded.body}</Text>
      {stops.map((stop) => (
        <View key={stop.orderId} style={styles.strandedRow} testID={`courier-day-stranded-${stop.orderId}`}>
          <Text style={styles.strandedRef}>
            {fillCopy(t.day.stranded.row, {
              ref: stop.referenceNo ?? '—',
              customer: stop.customerName,
              date: dayLabel(stop.deliveryDate) ?? stop.deliveryDate,
            })}
          </Text>
          <Text style={[styles.strandedMeta, stop.boxOnVan ? styles.strandedMeta_onVan : null]}>
            {stop.boxOnVan ? t.day.stranded.boxOnVan : t.day.stranded.boxOff}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Terracotta zemin: dikkat ister ama alarm değildir. */
  stranded: {
    gap: operationsTheme.space.sm,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['terracotta-bg'],
  },
  strandedHeading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.terracotta,
  },
  strandedBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.ink,
  },
  strandedRow: {
    paddingTop: operationsTheme.space.sm,
    gap: operationsTheme.space.xs,
  },
  strandedRef: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.ink,
  },
  strandedMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  strandedMeta_onVan: {
    color: operationsTheme.colors.terracotta,
  },
});
