import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { StaffCustomerOption } from '@lezzet/types';

import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { customerCreditLineOf } from '@/screens/staff-order/staff-order-format';
import { saleCopy } from '../copy';

/*
  Satışın müşteri satırı: seçilmezse satış anonim yazılır. Boş ve dolu hâl aynı üç satırı taşır ki müşteri seçilince katalog yerinden
  oynamasın; vade satırı sipariş girişindekinin aynısıdır.
*/

const c = saleCopy.customer;

interface SaleCustomerCardProps {
  customer: StaffCustomerOption | null;
  /** Sonucu bilinmeyen satış varken müşteri değişmez. */
  locked: boolean;
  onPick: () => void;
  onRemove: () => void;
}

export function SaleCustomerCard({ customer, locked, onPick, onRemove }: SaleCustomerCardProps) {
  const line = customer === null ? null : customerCreditLineOf(customer, 'page');
  return (
    <PressableSurface
      onPress={onPick}
      disabled={locked}
      feedback="scale"
      style={styles.card}
      accessibilityLabel={customer?.name ?? c.anonymous}
      testID="sale-customer"
    >
      <View style={styles.texts}>
        <Text style={styles.eyebrow}>{c.eyebrow}</Text>
        <Text style={[styles.name, customer === null ? styles.nameMuted : null]} numberOfLines={1}>
          {customer?.name ?? c.anonymous}
        </Text>
        <Text style={[styles.sub, styles[line?.tone ?? 'muted']]} numberOfLines={1}>
          {line?.text ?? c.anonymousHint}
        </Text>
      </View>
      {customer === null ? (
        <Text style={[styles.action, locked ? styles.actionLocked : null]}>{c.pick}</Text>
      ) : (
        <TextAction
          label={c.remove}
          onPress={onRemove}
          disabled={locked}
          compactEdges="all"
          accessibilityHint={c.removeLabel}
          testID="sale-customer-remove"
        />
      )}
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  texts: { flex: 1, minWidth: 0, gap: operationsTheme.space['2xs'] },
  eyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  name: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.ink,
  },
  nameMuted: { color: operationsTheme.colors['tab-inactive'] },
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
  action: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.olive,
  },
  actionLocked: { color: operationsTheme.colors['tab-inactive'] },
});
