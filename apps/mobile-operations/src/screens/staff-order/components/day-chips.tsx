import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { dayChipLabelOf } from '../staff-order-format';

/*
  Teslim günleri: satır yüksekliği sabittir, çünkü bekleyen, kargo ve gün listesi hâlleri aynı yeri kaplamalı. Gün kendiliğinden
  seçilmez (tek gün hariç); kargoda gün yerine aynı boyda tek satır yazar.
*/

type DayChipsProps =
  | { mode: 'dates'; dates: readonly string[]; selected: string | null; onSelect: (date: string) => void }
  /** Seçim yapılamayan hâl: bekleyen bölümde boş kutular, kargoda ya da gün yokken tek cümle. */
  | { mode: 'placeholder'; text: string | null };

/** Rota içi teslimde gösterilen gün sayısı; satır taşmasın diye en yakın günlerle sınırlı. */
const VISIBLE_DAYS = 3;

export function DayChips(props: DayChipsProps) {
  if (props.mode === 'placeholder') {
    return (
      <View style={styles.row}>
        {props.text === null ? (
          [0, 1, 2].map((i) => (
            <View key={i} style={styles.blank}>
              <Text style={styles.blankText}>—</Text>
            </View>
          ))
        ) : (
          <View style={styles.blank}>
            <Text style={styles.blankText} numberOfLines={1}>
              {props.text}
            </Text>
          </View>
        )}
      </View>
    );
  }
  return (
    <View style={styles.row}>
      {props.dates.slice(0, VISIBLE_DAYS).map((date) => (
        <OperationsChoiceChip
          key={date}
          label={dayChipLabelOf(date)}
          selected={props.selected === date}
          onPress={() => props.onSelect(date)}
          fill
          testID={`staff-order-day-${date}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: operationsTheme.size.controlSm,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: operationsTheme.space.md,
  },
  blank: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.cream,
    paddingHorizontal: operationsTheme.space.lg,
  },
  blankText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors['tab-inactive'],
  },
});
