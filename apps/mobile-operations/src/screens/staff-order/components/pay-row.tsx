import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import type { PaymentRow } from '../staff-order-format';
import { RadioDot } from './radio-dot';

/* Ödeme seçeneği: kapalı yöntem gizlenmez, kesik çerçeveyle yerinde durur ve sebebi kendi ikinci satırında yazar. */

interface PayRowProps {
  row: PaymentRow;
  selected: boolean;
  onSelect: () => void;
}

export function PayRow({ row, selected, onSelect }: PayRowProps) {
  const on = selected && row.enabled;
  return (
    <PressableSurface
      onPress={onSelect}
      disabled={!row.enabled}
      selected={on}
      feedback="scale"
      style={[styles.row, on ? styles.rowOn : null, row.enabled ? null : styles.rowOff]}
      accessibilityLabel={`${row.label} — ${row.sub}`}
      testID={`staff-order-pay-${row.key}`}
    >
      <RadioDot on={on} />
      <View style={styles.texts}>
        <Text style={[styles.label, row.enabled ? null : styles.labelOff]} numberOfLines={1}>
          {row.label}
        </Text>
        <Text style={[styles.sub, styles[row.tone]]} numberOfLines={1}>
          {row.sub}
        </Text>
      </View>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  row: {
    height: operationsTheme.size.controlMd,
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  rowOn: { borderColor: operationsTheme.colors.olive, backgroundColor: operationsTheme.colors['success-bg'] },
  rowOff: { borderStyle: 'dashed', backgroundColor: operationsTheme.colors.cream },
  texts: { flex: 1, minWidth: 0, gap: operationsTheme.space['2xs'] },
  label: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  labelOff: { color: operationsTheme.colors['tab-inactive'] },
  sub: { fontFamily: operationsTheme.font.body[400], fontSize: operationsTheme.text.meta },
  muted: { color: operationsTheme.colors.muted },
  credit: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    color: operationsTheme.colors['olive-dark'],
  },
  warn: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    color: operationsTheme.colors.terracotta,
  },
});
